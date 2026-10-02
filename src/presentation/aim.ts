/**
 * Aim cues: the attack area, the touch assist pick, skill aiming previews,
 * the power attack charge, and the mouse reticle.
 */
import { isMelee } from "../content/attacks.ts"
import { skillSlots } from "../content/skills.ts"
import type { SkillEffect } from "../content/skills.ts"
import { projection, view } from "../config/view.ts"
import { lerp, normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { Aim, Controls, Enemy, Game, Hurtbox, Player, Position, PrevPosition, RenderClock, RenderHost, Skills, Tuning, Weapon } from "../schema.ts"
import { barrageTargets, lobTarget } from "../features/skills.ts"
import { chargeOf, moveArea } from "../features/weapons.ts"
import { drawArea } from "./draw.ts"
import type { Shapes } from "./shapes.ts"

/**
 * Attack cues, drawn on the floor. With a melee attack, the opening move's
 * area in front of the player, only while it matters: an enemy within the
 * attack assist's range, or a move still recharging; otherwise it lingers
 * briefly and fades (`view.slashCue`), so a facing that nothing depends on is
 * not on screen. On touch, also the assist's pick (a ring), a line along the
 * aim while holding a projectile attack, and, while a skill button is
 * dragged, what the skill will cover (see `drawSkillAim`).
 */
export const DrawTouchAim = Game.System("Shooter/DrawTouchAim", {
  queries: {
    player: Game.Query({
      selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), aim: Game.Query.read(Aim), weapon: Game.Query.read(Weapon), skills: Game.Query.read(Skills) },
      with: [Player]
    }),
    enemies: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), hurtbox: Game.Query.read(Hurtbox) }, with: [Enemy] })
  },
  resources: { controls: Game.System.readResource(Controls), tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const controls = resources.controls.get()
  const [player] = queries.player.each()
  if (player === undefined) return
  const g = services.host.telegraphs
  const at = lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha)
  const tuning = resources.tuning.get()
  const first = tuning.attacks[player.data.weapon.get().attack].combo[0]
  if (first !== undefined && isMelee(first)) {
    const cue = services.host.feedback.slashCue
    const range = first.reach + tuning.touch.assist.range
    const nearby = queries.enemies.each().some(({ data }) => {
      const enemy = data.position.get()
      return Math.hypot(enemy.x - at.x, enemy.y - at.y) - data.hurtbox.get().radius <= range
    })
    const recharging = player.data.weapon.get().cooldown > 0
    const seconds = services.clock.frameSeconds
    if (nearby || recharging) {
      cue.idle = 0
      cue.alpha = Math.min(1, cue.alpha + seconds / view.slashCue.fadeInSeconds)
    } else {
      cue.idle += seconds
      if (cue.idle > view.slashCue.lingerSeconds) cue.alpha = Math.max(0, cue.alpha - seconds / view.slashCue.fadeOutSeconds)
    }
    if (cue.alpha > 0) {
      // The opening move's reach and arc (the combo's other moves differ).
      const halfAngle = first.shape === "arc" ? (first.arcDegrees * Math.PI) / 360 : Math.PI
      drawArea(g, { kind: "cone", origin: at, direction: player.data.aim.get(), radius: first.reach, halfAngle }, 0, {
        color: view.playerArea,
        fill: (recharging ? 0.1 : 0.05) * cue.alpha,
        outline: (recharging ? 0.5 : 0.3) * cue.alpha
      })
    }
  }
  // Charging: the power move's area fills up with the charge, bright once full.
  const weapon = player.data.weapon.get()
  const power = tuning.attacks[weapon.attack].power
  const charge = power === null ? 0 : chargeOf(power, weapon.held)
  if (power !== null && charge > 0) {
    const aim = player.data.aim.get()
    const move = power.move
    const area = isMelee(move)
      ? moveArea(move, at, aim).area
      : move.shape === "disc" && move.hover > 0
        // A hovering disc: the circle it will spin in, where it stops.
        ? { kind: "circle" as const, center: { x: at.x + aim.x * move.range, y: at.y + aim.y * move.range }, radius: move.radius * 2.5 }
        : { kind: "lane" as const, origin: at, direction: aim, length: Math.min(move.range, view.charge.shotPreview), halfWidth: move.radius * 2 }
    const full = charge >= 1
    drawArea(g, area, full ? 1 : charge, full
      ? { color: view.charge.full, fill: 0.14, outline: 0.9 }
      : { color: view.playerArea, fill: 0.06, outline: 0.35 })
  }
  if (controls.device !== "touch") return
  // The enemy an attack now would turn toward (attack assist), ringed on the floor.
  if (controls.assistTarget !== null) {
    for (const { entity, data } of queries.enemies.each()) {
      if (entity.id.value !== controls.assistTarget) continue
      const target = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
      const radius = data.hurtbox.get().radius + 8
      g.fillCircle(target.x, target.y, radius, view.reticle, controls.attackHeld ? 0.18 : 0.08)
      g.strokeCircle(target.x, target.y, radius, 3, view.reticle, controls.attackHeld ? 0.95 : 0.6)
    }
  }
  if (controls.attackHeld && first !== undefined && !isMelee(first)) {
    const dx = controls.aimPoint.x - at.x
    const dy = controls.aimPoint.y - at.y
    const reach = Math.min(first.range, 320) / (Math.hypot(dx, dy) || 1)
    g.line(at.x, at.y, at.x + dx * reach, at.y + dy * reach, 3, view.reticle, 0.45)
  }
  const skills = player.data.skills.get()
  for (const slot of skillSlots) {
    const aiming = controls.skills[slot].aiming
    if (aiming !== null) drawSkillAim(g, tuning.skills[skills[slot].skill].effect, at, aiming)
  }
})

/** What a skill used from `at` toward `aiming` will cover: a cut's lane, where a lob lands and its blast, a whirl's reach, or a volley's shells. */
const drawSkillAim = (g: Shapes, effect: SkillEffect, at: Vec2, aiming: Vec2): void => {
  switch (effect.kind) {
    case "cut": {
      const direction = normalizeOr({ x: aiming.x - at.x, y: aiming.y - at.y }, { x: 1, y: 0 })
      drawArea(g, { kind: "lane", origin: at, direction, length: effect.length, halfWidth: effect.width / 2 }, 0, { color: view.reticle, fill: 0.08, outline: 0.6 })
      return
    }
    case "lob": {
      const target = lobTarget(effect, at, aiming)
      g.line(at.x, at.y, target.x, target.y, 2, view.reticle, 0.35)
      g.fillCircle(target.x, target.y, effect.radius, view.reticle, 0.08).strokeCircle(target.x, target.y, effect.radius, 2, view.reticle, 0.6)
      return
    }
    case "nova":
      g.fillCircle(at.x, at.y, effect.radius, view.reticle, 0.08).strokeCircle(at.x, at.y, effect.radius, 2, view.reticle, 0.6)
      return
    case "vortex": {
      const target = lobTarget(effect, at, aiming)
      g.line(at.x, at.y, target.x, target.y, 2, view.reticle, 0.35)
      g.fillCircle(target.x, target.y, effect.radius, view.reticle, 0.08).strokeCircle(target.x, target.y, effect.radius, 2, view.reticle, 0.6)
      return
    }
    case "totem":
    case "thunderclap":
      g.fillCircle(at.x, at.y, effect.radius, view.reticle, 0.08).strokeCircle(at.x, at.y, effect.radius, 2, view.reticle, 0.6)
      return
    case "barrage": {
      const target = lobTarget(effect, at, aiming)
      const direction = normalizeOr({ x: aiming.x - at.x, y: aiming.y - at.y }, { x: 1, y: 0 })
      g.line(at.x, at.y, target.x, target.y, 2, view.reticle, 0.35)
      for (const shell of barrageTargets(effect, target, direction)) {
        g.fillCircle(shell.x, shell.y, effect.radius, view.reticle, 0.05).strokeCircle(shell.x, shell.y, effect.radius, 2, view.reticle, 0.45)
      }
      return
    }
  }
}

export const DrawReticle = Game.System("Shooter/DrawReticle", {
  resources: { controls: Game.System.readResource(Controls) },
  services: { host: Game.System.service(RenderHost) }
}, ({ resources, services }) => {
  const { reticle, cursor } = services.host
  reticle.clear()
  if (!cursor.over || resources.controls.get().device !== "desktop") return
  const r = 12 * projection.zoom
  reticle.strokeEllipse(cursor.x, cursor.y, r, r * projection.squash, 2, view.reticle, 1)
  reticle.fillCircle(cursor.x, cursor.y, 2, view.reticle, 1)
})
