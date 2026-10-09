/**
 * Actors: the player (facing, dash, charge, and nova rings; how her body is lit) and
 * enemies (hit flash, windup tint, health bars, stars over stunned ones).
 * Bodies in a state (burning, soaked) are tinted toward its color.
 */
import { Vector3 } from "three"

import { isMelee } from "../content/attacks.ts"
import { currentAttack } from "../features/moveset.ts"
import { skillSlots } from "../content/skills.ts"
import { projection, view } from "../config/view.ts"
import { screenHeight, toScreen, worldHeight } from "../math/iso.ts"
import { lerp, normalizeOr } from "../math/vec.ts"
import { attackOf, dashOf, traitsIn } from "../features/build.ts"
import { Action, Aim, Airborne, AttackPhase, Attacker, Body, Dash, Elite, ElementState, Enemy, Energy, Game, Health, HitFlash, HitStop, Invulnerable, Member, Passives, PerfectDodged, Player, Poise, Position, PrevPosition, RenderClock, RenderHost, RenderNodes, Skills, Stunned, Tuning, Velocity, BasicAttack } from "../schema.ts"
import type { ActiveState } from "../schema.ts"
import { poiseOf } from "../features/poise.ts"
import { skillRecharge } from "../features/skills.ts"
import { chargeOf } from "../features/basic-attack.ts"
import { mixColor } from "./draw.ts"
import { characterLooks } from "./looks.ts"

const leanAxis = new Vector3()

/**
 * How high a body in the air is (world units): a plunge goes straight up,
 * easing out, then dives, falling faster and faster (it moves ahead as it
 * does, see `Airborne.dive`); a leap arcs (see `view.airborne`).
 */
export const airborneLift = (airborne: { readonly remaining: number; readonly seconds: number; readonly kind: "plunge" | "leap"; readonly dive: { readonly seconds: number } | null }): number => {
  const t = airborne.seconds > 0 ? Math.min(1, Math.max(0, 1 - airborne.remaining / airborne.seconds)) : 1
  if (airborne.kind === "leap") return worldHeight(projection, view.airborne.leap.height) * Math.sin(Math.PI * t)
  const top = worldHeight(projection, view.airborne.plunge.height)
  const dive = airborne.dive?.seconds ?? 0
  if (airborne.remaining > dive) {
    const rising = Math.min(1, 1 - (airborne.remaining - dive) / Math.max(1e-6, airborne.seconds - dive))
    return top * (1 - (1 - rising) ** 2)
  }
  const left = dive > 0 ? Math.max(0, airborne.remaining / dive) : 0
  return top * (1 - (1 - left) ** 2)
}

/** Whether a body in the air is diving (see `airborneLift`). */
export const diving = (airborne: { readonly remaining: number; readonly dive: { readonly seconds: number } | null }): boolean =>
  airborne.dive !== null && airborne.remaining <= airborne.dive.seconds

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
        health: Game.Query.read(Health),
        basicAttack: Game.Query.read(BasicAttack),
        body: Game.Query.read(Body),
        state: Game.Query.read(ElementState),
        member: Game.Query.read(Member),
        velocity: Game.Query.read(Velocity),
        airborne: Game.Query.optional(Airborne),
        passives: Game.Query.optional(Passives)
      },
      with: [Player]
    })
  },
  events: { action: Game.System.readEvent(Action), perfect: Game.System.readEvent(PerfectDodged) },
  resources: { tuning: Game.System.readResource(Tuning), hitStop: Game.System.readResource(HitStop) },
  services: { nodes: Game.System.service(RenderNodes), host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ events, queries, resources, services }) => {
  const marks = services.host.groundMarks
  marks.clear()
  const tuning = resources.tuning.get()
  // A character comes in: she pops up, once the one who fell is down, wide-eyed (she did not choose the moment); a perfect dodge widens her eyes too.
  for (const action of events.action.all()) {
    if (action.kind !== "switch") continue
    services.host.feedback.entrance = action.fell ? -tuning.team.fallBeat.seconds : 0
    if (action.fell) services.host.feedback.wideEyes = view.spirit.wideSeconds + tuning.team.fallBeat.seconds
  }
  if (events.perfect.all().length > 0) services.host.feedback.wideEyes = view.spirit.wideSeconds
  for (const { entity, data } of queries.player.each()) {
    const position = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const dash = data.dash.get()
    const radius = data.body.get().radius

    // Stella Sora-style facing: a subtle ring at a melee attack's reach (close around a gun), with a small arrow on it.
    const aim = data.aim.get()
    const current = data.basicAttack.get()
    const attack = attackOf(tuning, current.attack)
    const first = attack.combo[0]
    const around = first !== undefined && isMelee(first) ? first.reach : radius + view.facingRing.gap
    marks.strokeCircle(position.x, position.y, around, 2, view.aim, view.facingRing.alpha)
    const tip = { x: position.x + aim.x * (around + view.facingRing.arrow), y: position.y + aim.y * (around + view.facingRing.arrow) }
    const base = { x: position.x + aim.x * around, y: position.y + aim.y * around }
    const side = { x: -aim.y * view.facingRing.arrow * 0.7, y: aim.x * view.facingRing.arrow * 0.7 }
    marks.fillPoly([base.x + side.x, base.y + side.y, tip.x, tip.y, base.x - side.x, base.y - side.y], view.aim, view.facingRing.arrowAlpha)

    // Protected after coming in from a fall: a ring of her color, pulsing, fading as it runs out.
    const protection = services.host.feedback.protection
    if (protection > 0 && data.invulnerable.get().remaining > 0) {
      const pulse = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * view.fallEntry.pulseHz * Math.PI * 2)
      const left = Math.min(1, protection / 0.6)
      marks.strokeCircle(position.x, position.y, radius + 18 + pulse * 4, 4, view.characters[data.member.get().character], (0.45 + 0.35 * pulse) * left)
    }
    // Dash charges around the feet: one arc each, lit while ready, the next one filling back up.
    const ring = radius + 6
    const startAngle = -Math.PI / 2
    const own = dashOf(tuning, data.member.get().character, traitsIn(data.passives))
    const each = (Math.PI * 2) / own.charges
    const gap = own.charges > 1 ? 0.18 : 0
    for (let charge = 0; charge < own.charges; charge++) {
      const from = startAngle + charge * each + gap / 2
      const span = each - gap
      if (charge < dash.charges) marks.strokeArc(position.x, position.y, ring, from, from + span, 3, view.aim, 0.6)
      else if (charge === dash.charges) marks.strokeArc(position.x, position.y, ring, from, from + span * (1 - dash.cooldown / own.cooldown), 3, 0x5b6b7d, 0.8)
    }

    // Charging the power attack: a ring filling up around the feet, brighter and thicker once full.
    const charge = attack.power === null ? 0 : chargeOf(attack.power, current.held)
    if (charge > 0) {
      const full = charge >= 1
      const chargeRing = radius + view.charge.gap
      marks.strokeArc(position.x, position.y, chargeRing, startAngle, startAngle + charge * Math.PI * 2, full ? view.charge.fullWidth : view.charge.width, full ? view.charge.full : view.charge.filling, full ? 0.95 : 0.7)
    }

    // A magazine: its rounds left, one lit segment each on an arc in front of her feet; reloading, the arc fills back up.
    if (attack.magazine !== null) {
      const spec = view.ammo
      const ammoRing = radius + spec.gap
      const from = Math.PI / 2 - spec.spread / 2
      if (current.reloading > 0) {
        const done = 1 - current.reloading / attack.magazine.reload
        marks.strokeArc(position.x, position.y, ammoRing, from, from + spec.spread, spec.width, spec.empty, 0.6)
        marks.strokeArc(position.x, position.y, ammoRing, from, from + spec.spread * done, spec.width, spec.reloading, 0.9)
      } else {
        const each = spec.spread / attack.magazine.rounds
        for (let round = 0; round < attack.magazine.rounds; round++) {
          const left = round < attack.magazine.rounds - current.spent
          marks.strokeArc(position.x, position.y, ammoRing, from + round * each + spec.space / 2, from + (round + 1) * each - spec.space / 2, spec.width, left ? spec.round : spec.empty, left ? 0.95 : 0.6)
        }
      }
    }

    // A skill around her ready to use (a nova, a thunderclap): a faint ring showing what it would catch.
    const skills = data.skills.get()
    const energy = data.energy.get().current
    for (const slot of skillSlots) {
      const spec = tuning.skills[skills[slot].skill]
      if ((spec.effect.kind !== "nova" && spec.effect.kind !== "thunderclap") || skillRecharge(spec, skills[slot].cooldown, energy) > 0) continue
      marks.strokeCircle(position.x, position.y, spec.effect.radius, 3, view.ultimate, view.ultimateReadyAlpha)
    }

    const node = services.nodes.get(entity.id)
    if (node?.kind === "player") {
      // Charging glows toward the full-charge color; once full it pulses.
      const pulse = charge >= 1 ? 0.5 + 0.5 * Math.sin((performance.now() / 1000) * view.charge.pulseHz * Math.PI * 2) : 0
      const glow = charge >= 1 ? view.charge.glow + (1 - view.charge.glow) * pulse : charge * view.charge.glow
      // A hit flashes her white, a dash lights her up; otherwise a charge glows. Protected: see-through.
      const flashing = data.flash.get().remaining > 0
      node.body.paint(
        stateTint(0xffffff, data.state.get().current),
        flashing ? view.hitFlash : dash.remaining > 0 ? view.playerDashing : view.charge.full,
        flashing ? 1 : dash.remaining > 0 ? 0.65 : glow,
        data.invulnerable.get().remaining > 0 ? 0.55 : 1)
      // Her body says how she is: its halo bright and pulsing while her ultimate is ready, dimming as her health runs low.
      const spirit = view.spirit
      const feedback = services.host.feedback
      const ultimate = skills.ultimate
      const ready = skillRecharge(tuning.skills[ultimate.skill], ultimate.cooldown, energy) <= 0
      const health = data.health.get()
      const left = health.max > 0 ? health.current / health.max : 1
      const dim = spirit.low + (1 - spirit.low) * Math.min(1, left / spirit.lowHealth)
      const beat = 0.5 + 0.5 * Math.sin((performance.now() / 1000) * spirit.pulseHz * Math.PI * 2)
      node.body.aura?.(dim * (ready ? spirit.ready * (1 - spirit.pulse * beat) : 1))
      // Her eyes: shut once she has fallen, wide for a moment after a perfect dodge or coming in after a fall.
      const wide = 1 + (spirit.wide - 1) * Math.min(1, feedback.wideEyes / (spirit.wideSeconds * 0.5))
      if (health.current <= 0) node.body.express?.(1, spirit.shut)
      else node.body.express?.(wide, wide)
      // Her body leans with her changes of pace, sprung: digging in as she stops, into a turn, forward as she sets off.
      const sway = feedback.sway
      const springs = spirit.sway
      const velocity = data.velocity.get()
      const seconds = resources.hitStop.get().remaining > 0 ? 0 : Math.min(services.clock.frameSeconds, 0.05)
      if (sway.last !== null && seconds > 0) {
        const pace = tuning.characters[data.member.get().character].stats.speed
        // A dash's burst counts as no more than a run's.
        const change = { x: velocity.x - sway.last.x, y: velocity.y - sway.last.y }
        const size = Math.hypot(change.x, change.y)
        const most = size > pace ? pace / size : 1
        sway.vx += change.x * most * springs.kick
        sway.vy += change.y * most * springs.kick
        // A stop or a turn back at full pace kicks up dust behind her.
        if (size * most > pace * springs.dust && dash.remaining <= 0) {
          const from = toScreen(projection, position)
          for (let puff = 0; puff < 3; puff++) services.host.fx.dust(from, normalizeOr(toScreen(projection, { x: -change.x, y: -change.y }), { x: 0, y: -1 }), view.impact.dust)
        }
      }
      if (seconds > 0) {
        sway.vx += (-springs.stiffness * sway.x - springs.damping * sway.vx) * seconds
        sway.vy += (-springs.stiffness * sway.y - springs.damping * sway.vy) * seconds
        sway.x += sway.vx * seconds
        sway.y += sway.vy * seconds
        sway.last = { x: velocity.x, y: velocity.y }
      }
      // Standing, she leans toward where she aims (seen from behind, her body still says where that is); a run leans on its own.
      const pace = tuning.characters[data.member.get().character].stats.speed
      // Less the more she faces the camera: there her eyes say it, and leaning would tip them out of sight.
      const onScreen = normalizeOr(toScreen(projection, aim), { x: 0, y: -1 })
      const still = Math.max(0, 1 - Math.hypot(velocity.x, velocity.y) / (pace * 0.5)) * (0.5 - 0.5 * onScreen.y)
      // Diving, she tips head first toward where she lands.
      const dive = data.airborne.present && diving(data.airborne.get()) ? data.airborne.get().dive!.velocity : null
      const ahead = dive === null ? null : normalizeOr(dive, aim)
      const tilt = ahead !== null ? { x: ahead.x * view.airborne.plunge.lean, y: ahead.y * view.airborne.plunge.lean } : { x: sway.x + aim.x * springs.aim * still, y: sway.y + aim.y * springs.aim * still }
      const look = characterLooks[data.member.get().character]
      const grounded = look.kind === "model" && look.grounded === true
      const lean = grounded ? 0 : ahead !== null ? view.airborne.plunge.lean : Math.min(springs.most, Math.hypot(tilt.x, tilt.y))
      if (lean > 1e-4) {
        // Tipped over her feet, her top toward the lean: about the floor axis across it.
        leanAxis.set(tilt.y, 0, -tilt.x).normalize()
        node.pivot.quaternion.setFromAxisAngle(leanAxis, lean)
      } else node.pivot.quaternion.identity()
      // Only a change of pace squashes her, not her aim.
      const squash = grounded ? 0 : Math.min(springs.most, Math.hypot(sway.x, sway.y)) * springs.squash
      // Coming onto the field she pops up to her size, a little past it (not before the one who fell is down).
      const pop = Math.min(1, feedback.entrance / spirit.popSeconds)
      const size = pop < 0 ? 0 : pop >= 1 ? 1 : spirit.pop + (1 - spirit.pop) * (pop + 0.35 * Math.sin(pop * Math.PI))
      const stretch = pop < 0 || pop >= 1 ? 1 : 1 + 0.25 * Math.sin(pop * Math.PI)
      node.pivot.scale.set(size * (1 + squash * 0.5), size * stretch * (1 - squash), size * (1 + squash * 0.5))
      // In the air: lifted off her shadow, which shrinks under her.
      const lift = data.airborne.present ? airborneLift(data.airborne.get()) : 0
      node.pivot.position.y = lift
      const shadow = radius * (1 - (1 - view.airborne.shadow) * Math.min(1, lift / worldHeight(projection, view.airborne.plunge.height)))
      node.shadow.object.scale.set(shadow, 1, shadow)
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
        state: Game.Query.read(ElementState),
        stunned: Game.Query.read(Stunned),
        poise: Game.Query.read(Poise),
        elite: Game.Query.optional(Elite)
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
    const spec = currentAttack(tuning, data.enemy.get(), attacker)
    // Anticipation: the body brightens through the windup.
    const windup = spec !== undefined && data.phase.get() === "windup" ? Math.min(1, attacker.elapsed / spec.windup) : 0
    const stunned = data.stunned.get().remaining > 0
    // A hit flashes it white; stunned it is dimly lit; otherwise a windup lights it up.
    const tint = stateTint(0xffffff, data.state.get().current)
    const poise = data.poise.get()
    if (data.flash.get().remaining > 0) node.body.paint(tint, view.hitFlash, 1, 1)
    // Broken: it glows in the break color, pulsing, until it recovers.
    else if (poise.broken > 0) node.body.paint(tint, view.breaking.glow, 0.35 + 0.25 * Math.sin(performance.now() / 1000 * view.breaking.pulseHz * Math.PI * 2), 1)
    else if (stunned) node.body.paint(tint, view.stun, 0.35, 1)
    // An elite glows in its element's color (brighter through a windup); a champion brighter still, pulsing.
    else if (data.elite.present && windup === 0) {
      const champion = data.enemy.get().champion
      const glow = champion ? view.champion.glow + view.champion.glowPulse * Math.sin(performance.now() / 1000 * view.champion.pulseHz * Math.PI * 2) : 0.32
      node.body.paint(tint, view.elements[data.elite.get().element], glow, 1)
    }
    else node.body.paint(tint, view.windupTint, windup * 0.75, 1)
    // Over its head, in projected coordinates (the overlay's).
    const feet = toScreen(projection, { x: node.root.position.x, y: node.root.position.z })
    const head = feet.y - screenHeight(projection, node.body.height)
    if (stunned) {
      // Stars circling over its head.
      const turn = performance.now() / 1000 * view.stunStars.turnsPerSecond * Math.PI * 2
      for (let star = 0; star < 3; star++) {
        const angle = turn + (star * Math.PI * 2) / 3
        overlay.fillCircle(feet.x + Math.cos(angle) * view.stunStars.radius, head - 22 + Math.sin(angle) * view.stunStars.radius * 0.4, 3, view.stun, 1)
      }
    }
    const health = data.health.get()
    const champion = data.enemy.get().champion
    const bar = poiseOf(tuning, kind, health.max, champion)
    const breaking = bar > 0 && (poise.current > 0 || poise.broken > 0)
    // A champion's bar is always shown, wider, edged in its element's color.
    if (health.current >= health.max && !breaking && !champion) continue
    const width = champion ? view.champion.bar : 34
    const x = feet.x - width / 2
    const y = head - 12
    if (champion && data.elite.present) overlay.fillRect(x - 2, y - 2, width + 4, breaking ? 12 : 8, view.elements[data.elite.get().element], 0.9)
    overlay.fillRect(x - 1, y - 1, width + 2, breaking ? 10 : 6, view.healthBack, 0.85)
    overlay.fillRect(x, y, width * (health.current / health.max), 4, view.healthFill, 1)
    // A champion fighting in phases: a mark where each begins, bright ahead of it, dim once past.
    if (champion) {
      const mark = view.champion.phaseMark
      for (const phase of tuning.champions.movesets[kind]?.phases ?? []) {
        overlay.fillRect(x + width * phase.below - 1, y - 2, 2, 8, mark.color, health.current / health.max > phase.below ? mark.ahead : mark.past)
      }
    }
    // Its break bar under it: filling up, then full and flashing while it is broken.
    if (breaking) {
      const full = poise.broken > 0
      overlay.fillRect(x, y + 5, width * Math.min(1, poise.current / bar), 3, full ? view.breaking.full : view.breaking.bar, full ? 0.6 + 0.4 * Math.sin(performance.now() / 1000 * view.breaking.pulseHz * Math.PI * 2) : 1)
    }
  }
})
