/**
 * Actors: the player (facing, dash, charge, and nova rings; body tint) and
 * enemies (hit flash, windup tint, health bars, stars over stunned ones).
 * Bodies in a state (burning, soaked) are tinted toward its color.
 */
import { isMelee } from "../content/attacks.ts"
import { skillSlots } from "../content/skills.ts"
import { projection, view } from "../config/view.ts"
import { lerp } from "../math/vec.ts"
import { Aim, AttackPhase, Attacker, Body, Dash, ElementState, Enemy, Energy, Game, Health, HitFlash, Invulnerable, Player, Position, PrevPosition, RenderClock, RenderHost, RenderNodes, Renderable, Skills, Stunned, Tuning, Weapon } from "../schema.ts"
import type { ActiveState } from "../schema.ts"
import { skillRecharge } from "../features/skills.ts"
import { chargeOf } from "../features/weapons.ts"
import { enemyColor } from "./nodes.ts"
import { mixColor } from "./draw.ts"
import { crowTextureIndex, lightCrow } from "./crow.ts"
import { advanceCrow } from "./crow-animation.ts"

/** `color` tinted toward the color of `state`, if any. */
export const stateTint = (color: number, state: ActiveState | null): number =>
  state === null ? color : mixColor(color, view.states[state.id], view.states.tint)

export const DrawPlayer = Game.System("Shooter/DrawPlayer", {
  queries: {
    player: Game.Query({
      selection: {
        position: Game.Query.read(Position),
        previous: Game.Query.read(PrevPosition),
        aim: Game.Query.read(Aim),
        dash: Game.Query.read(Dash),
        invulnerable: Game.Query.read(Invulnerable),
        flash: Game.Query.read(HitFlash),
        skills: Game.Query.read(Skills),
        energy: Game.Query.read(Energy),
        weapon: Game.Query.read(Weapon),
        body: Game.Query.read(Body),
        state: Game.Query.read(ElementState)
      },
      with: [Player]
    })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const marks = services.host.groundMarks
  marks.clear()
  const tuning = resources.tuning.get()
  for (const { entity, data } of queries.player.each()) {
    const position = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const dash = data.dash.get()
    const radius = data.body.get().radius

    // Stella Sora-style facing: a subtle ring at a melee attack's reach (close around a gun), with a small arrow on it.
    const aim = data.aim.get()
    const weapon = data.weapon.get()
    const attack = tuning.attacks[weapon.attack]
    const first = attack.combo[0]
    const around = first !== undefined && isMelee(first) ? first.reach : radius + view.facingRing.gap
    marks.circle(position.x, position.y, around).stroke({ width: 2, color: view.aim, alpha: view.facingRing.alpha })
    const tip = { x: position.x + aim.x * (around + view.facingRing.arrow), y: position.y + aim.y * (around + view.facingRing.arrow) }
    const base = { x: position.x + aim.x * around, y: position.y + aim.y * around }
    const side = { x: -aim.y * view.facingRing.arrow * 0.7, y: aim.x * view.facingRing.arrow * 0.7 }
    marks.poly([base.x + side.x, base.y + side.y, tip.x, tip.y, base.x - side.x, base.y - side.y]).fill({ color: view.aim, alpha: view.facingRing.arrowAlpha })

    // Dash readiness ring around the feet.
    const ready = dash.cooldown <= 0
    const progress = ready ? 1 : 1 - dash.cooldown / tuning.dash.cooldown
    const ring = radius + 6
    const startAngle = -Math.PI / 2
    marks.moveTo(position.x + Math.cos(startAngle) * ring, position.y + Math.sin(startAngle) * ring)
      .arc(position.x, position.y, ring, startAngle, startAngle + progress * Math.PI * 2)
      .stroke({ width: 3, color: ready ? view.aim : 0x5b6b7d, alpha: ready ? 0.5 : 0.8 })

    // Charging the power attack: a ring filling up around the feet, brighter and thicker once full.
    const charge = attack.power === null ? 0 : chargeOf(attack.power, weapon.held)
    if (charge > 0) {
      const full = charge >= 1
      const chargeRing = radius + view.charge.gap
      marks.moveTo(position.x + Math.cos(startAngle) * chargeRing, position.y + Math.sin(startAngle) * chargeRing)
        .arc(position.x, position.y, chargeRing, startAngle, startAngle + charge * Math.PI * 2)
        .stroke({ width: full ? view.charge.fullWidth : view.charge.width, color: full ? view.charge.full : view.charge.filling, alpha: full ? 0.95 : 0.7 })
    }

    // A nova ready to use: a faint ring showing what it would catch.
    const skills = data.skills.get()
    const energy = data.energy.get().current
    for (const slot of skillSlots) {
      const spec = tuning.skills[skills[slot].skill]
      if (spec.effect.kind !== "nova" || skillRecharge(spec, skills[slot].cooldown, energy) > 0) continue
      marks.circle(position.x, position.y, spec.effect.radius).stroke({ width: 3, color: view.ultimate, alpha: view.ultimateReadyAlpha })
    }

    const node = services.nodes.get(entity.id)
    if (node?.kind === "player") {
      // Charging glows toward the full-charge color; once full it pulses.
      const pulse = charge >= 1 ? 0.5 + 0.5 * Math.sin((performance.now() / 1000) * view.charge.pulseHz * Math.PI * 2) : 0
      const glow = charge >= 1 ? view.charge.glow + (1 - view.charge.glow) * pulse : charge * view.charge.glow
      const frame = advanceCrow(node.motion, position, aim, services.clock.frameSeconds, dash.remaining > 0)
      node.body.texture = services.host.assets.crow[node.motion.clip][crowTextureIndex(aim, frame)]!
      node.body.tint = stateTint(0xffffff, data.state.get().current)
      const flashing = data.flash.get().remaining > 0
      lightCrow(node.light,
        flashing ? view.hitFlash : dash.remaining > 0 ? view.playerDashing : view.charge.full,
        flashing ? 1 : dash.remaining > 0 ? 0.65 : glow)
      node.root.alpha = data.invulnerable.get().remaining > 0 ? 0.55 : 1
    }
  }
})

/** Hit flash on enemy bodies and health bars over damaged enemies. */
export const DrawEnemies = Game.System("Shooter/DrawEnemies", {
  queries: {
    enemies: Game.Query({
      selection: {
        enemy: Game.Query.read(Enemy),
        health: Game.Query.read(Health),
        flash: Game.Query.read(HitFlash),
        attacker: Game.Query.read(Attacker),
        phase: Game.Query.read(AttackPhase),
        renderable: Game.Query.read(Renderable),
        state: Game.Query.read(ElementState),
        stunned: Game.Query.read(Stunned)
      }
    })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost) }
}, ({ queries, resources, services }) => {
  const tuning = resources.tuning.get()
  const overlay = services.host.overlay
  overlay.clear()
  for (const { entity, data } of queries.enemies.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "enemy") continue
    const kind = data.enemy.get().kind
    const attacker = data.attacker.get()
    const spec = tuning.enemies[kind].attack
    // Anticipation: the body brightens through the windup.
    const windup = spec !== null && data.phase.get() === "windup" ? Math.min(1, attacker.elapsed / spec.windup) : 0
    const stunned = data.stunned.get().remaining > 0
    const tinted = mixColor(stateTint(enemyColor(kind), data.state.get().current), view.windupTint, windup * 0.75)
    node.body.tint = data.flash.get().remaining > 0 ? view.hitFlash : stunned ? mixColor(tinted, view.stun, 0.35) : tinted
    const renderable = data.renderable.get()
    const radius = renderable.kind === "enemy" ? renderable.radius : 16
    const head = node.root.position.y - radius * view.enemies[kind].heightFactor * projection.zoom
    if (stunned) {
      // Stars circling over its head.
      const turn = performance.now() / 1000 * view.stunStars.turnsPerSecond * Math.PI * 2
      for (let star = 0; star < 3; star++) {
        const angle = turn + (star * Math.PI * 2) / 3
        overlay.circle(node.root.position.x + Math.cos(angle) * view.stunStars.radius, head - 22 + Math.sin(angle) * view.stunStars.radius * 0.4, 3).fill({ color: view.stun })
      }
    }
    const health = data.health.get()
    if (health.current >= health.max) continue
    const width = 34
    const x = node.root.position.x - width / 2
    const y = head - 12
    overlay.rect(x - 1, y - 1, width + 2, 6).fill({ color: view.healthBack, alpha: 0.85 })
    overlay.rect(x, y, width * (health.current / health.max), 4).fill({ color: view.healthFill })
  }
})
