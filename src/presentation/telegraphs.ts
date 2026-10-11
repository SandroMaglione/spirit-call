/**
 * Telegraphs on the floor: pools of elements, enemy attack windups,
 * shields, wards, armor, bursts about to go off, active hitboxes, lobbed skills,
 * whirls, totems, thrown discs, and spawn warnings.
 */
import { engine } from "../config/tuning.ts"
import { projection, view } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import { lerp } from "../math/vec.ts"
import { AttackPhase, Attacker, Barrier, Body, Burst, Projectile, Velocity, Disc, Elite, Enemy, Game, Ground, Hitbox, Lobbed, Marked, PendingSpawn, Poise, Position, PrevPosition, RenderClock, RenderHost, Rock, Shield, Totem, Tuning, Turned, Vortex, Ward } from "../schema.ts"
import { aimLocked } from "../features/attacks.ts"
import { currentAttack } from "../features/moveset.ts"
import { drawArea } from "./draw.ts"
import { unmarkedHits } from "./signatures.ts"

/**
 * Everything dangerous, drawn on the floor: pools of elements (under
 * everything else, flickering for fire and rippling for water, fading as
 * they run out), attack windups (the exact area that will be hit, dim while
 * it tracks, bright once its aim locks), active hitboxes, and spawn
 * warnings. An enemy's warnings show where, never when: nothing fills up
 * counting down to the hit, so its timing is read from its body (and the
 * aim locking, at least the fairness floor before it lands). Practice
 * partners also mark their perfect-dodge window in gold. Shots show no
 * line: the shot itself is the warning, flying.
 */
export const DrawTelegraphs = Game.System("Shooter/DrawTelegraphs", {
  queries: {
    pending: Game.Query({ selection: { pending: Game.Query.read(PendingSpawn) } }),
    elites: Game.Query({ selection: { elite: Game.Query.read(Elite), enemy: Game.Query.read(Enemy), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body) } }),
    pools: Game.Query({ selection: { ground: Game.Query.read(Ground) } }),
    discs: Game.Query({ selection: { disc: Game.Query.read(Disc), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) } }),
    waves: Game.Query({ selection: { projectile: Game.Query.read(Projectile), velocity: Game.Query.read(Velocity), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) } }),
    attackers: Game.Query({
      selection: { enemy: Game.Query.read(Enemy), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase), position: Game.Query.read(Position), body: Game.Query.read(Body), turned: Game.Query.optional(Turned) }
    }),
    enemyBodies: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body) }, with: [Enemy] }),
    wards: Game.Query({ selection: { ward: Game.Query.read(Ward), enemy: Game.Query.read(Enemy), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition) } }),
    bursts: Game.Query({ selection: { burst: Game.Query.read(Burst) } }),
    armored: Game.Query({ selection: { enemy: Game.Query.read(Enemy), poise: Game.Query.read(Poise), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body) } }),
    hitboxes: Game.Query({ selection: { hitbox: Game.Query.read(Hitbox) } }),
    lobbed: Game.Query({ selection: { lobbed: Game.Query.read(Lobbed) } }),
    vortices: Game.Query({ selection: { vortex: Game.Query.read(Vortex) } }),
    totems: Game.Query({ selection: { totem: Game.Query.read(Totem), position: Game.Query.read(Position) } }),
    rocks: Game.Query({ selection: { rock: Game.Query.read(Rock) } }),
    shields: Game.Query({
      selection: { shield: Game.Query.read(Shield), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body) }
    })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const g = services.host.telegraphs
  g.clear()
  const tuning = resources.tuning.get()
  const now = performance.now() / 1000
  for (const { data } of queries.pools.each()) {
    const pool = data.ground.get()
    // An arena hazard is a place of its own, laid into the floor (see `presentation/hazards.ts`).
    if (pool.permanent) continue
    const color = view.elements[pool.element]
    const fade = Math.min(1, pool.remaining / view.pools.fadeSeconds)
    const pulse = pool.element === "fire" ? 0.75 + 0.25 * Math.sin(now * 13 + pool.center.x) * Math.sin(now * 7.3 + pool.center.y) : 1
    g.fillCircle(pool.center.x, pool.center.y, pool.radius, color, view.pools.fill * pulse * fade)
    g.strokeCircle(pool.center.x, pool.center.y, pool.radius, 3, color, view.pools.outline * fade)
    if (pool.element === "water") {
      const ripple = (now * 0.8 + pool.center.x * 0.01) % 1
      g.strokeCircle(pool.center.x, pool.center.y, pool.radius * ripple, 2, color, 0.45 * (1 - ripple) * fade)
    } else {
      g.fillCircle(pool.center.x, pool.center.y, pool.radius * 0.6, view.pools.fireCore, 0.18 * pulse * fade)
    }
  }
  for (const { data } of queries.attackers.each()) {
    const attacker = data.attacker.get()
    const spec = currentAttack(tuning, data.enemy.get(), attacker)
    if (spec === undefined || attacker.area === null || data.phase.get() !== "windup") continue
    const area = attacker.area
    // A shot shows no line: the shot itself is the warning.
    if (area.kind === "line") continue
    // Attacks track until their aim locks: dim while tracking, bright once locked (the cue to move).
    // An element's attack is drawn in its element's color, so what it would put on you shows before it lands.
    const tracking = !aimLocked(spec, "windup", attacker.elapsed)
    // A gust shows as wind: what it does is push. A call for help, as the spawn warnings of what it calls.
    // A turned one's (see `Turned`) in her side's color: it is not coming for her.
    const practiceWindow = tuning.enemies[data.enemy.get().kind].perfectDodgeWindow
    // The practice partner teaches timing explicitly: gold during its forgiving dodge window.
    const practiceCue = practiceWindow !== null && (spec.windup - attacker.elapsed) * (data.enemy.get().windup ?? 1) <= practiceWindow
    const color = practiceCue ? view.telegraphLocked : data.turned.present ? view.turned.glow : spec.kind === "call" ? view.spawnWarning : spec.kind === "gust" ? view.elements.wind : spec.element !== null ? view.elements[spec.element] : tracking || spec.kind !== "beam" ? view.telegraph : view.telegraphLocked
    // Where, never when: no fill counting down to the hit (its timing is read from its body).
    drawArea(g, area, 0, practiceCue ? { color, fill: 0.3, outline: 1 } : tracking ? { color, fill: 0.05, outline: 0.35 } : { color, fill: 0.12, outline: 0.75 })
    // A blink: a ring around where it stands, as its mark shows where it will land.
    if (spec.kind === "blink") {
      const at = data.position.get()
      g.strokeCircle(at.x, at.y, data.body.get().radius + 14, 3, color, 0.8)
    }
  }

  // Wards: the tether from the warder to its ally, growing while it forms, then steady and pulsing; a ring under
  // the ally it holds. Crossing it cuts it.
  const bodies = new Map(queries.enemyBodies.each().map(({ entity, data }) => [entity.id.value, { at: lerp(data.previous.get(), data.position.get(), services.clock.alpha), radius: data.body.get().radius }]))
  for (const { data } of queries.wards.each()) {
    const ward = data.ward.get()
    const spec = tuning.enemies[data.enemy.get().kind].ward
    const ally = ward.ally === null ? undefined : bodies.get(ward.ally.id)
    if (spec === null || ally === undefined) continue
    const from = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const formed = spec.link <= 0 ? 1 : Math.min(1, ward.formed / spec.link)
    const end = { x: from.x + (ally.at.x - from.x) * formed, y: from.y + (ally.at.y - from.y) * formed }
    if (formed < 1) {
      g.line(from.x, from.y, end.x, end.y, 2, view.ward, 0.45)
      continue
    }
    const pulse = 0.7 + 0.3 * Math.sin(now * 6)
    g.line(from.x, from.y, end.x, end.y, 4, view.ward, 0.75 * pulse)
    g.fillCircle(ally.at.x, ally.at.y, ally.radius + 12, view.ward, 0.14 * pulse)
    g.strokeCircle(ally.at.x, ally.at.y, ally.radius + 12, 3, view.ward, 0.85)
  }

  // Armor: plates in a ring under an armored enemy until it breaks (its armor down while it is).
  for (const { data } of queries.armored.each()) {
    if (tuning.enemies[data.enemy.get().kind].armor === null || data.poise.get().broken > 0) continue
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const radius = data.body.get().radius + 8
    for (let plate = 0; plate < 6; plate++) {
      const start = (plate / 6) * Math.PI * 2 + 0.12
      g.strokeArc(at.x, at.y, radius, start, start + (Math.PI * 2) / 6 - 0.24, 5, view.armor, 0.85)
    }
  }

  // Bursts about to go off where a body fell: their ring, filling as the fuse burns.
  for (const { data } of queries.bursts.each()) {
    const burst = data.burst.get()
    const color = burst.element === null ? view.telegraphLocked : view.elements[burst.element.id]
    drawArea(g, { kind: "circle", center: burst.at, radius: burst.radius }, 0, { color, fill: 0.14, outline: 0.9 })
  }

  // Elites: a ring of their element under their feet, turning; a thunder elite's discharge fills its ring where it will strike.
  // A champion's mark: a crest instead, a filled ring with points around it turning the other way, and a wider ring out.
  for (const { data } of queries.elites.each()) {
    const elite = data.elite.get()
    const color = view.elements[elite.element]
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const radius = data.body.get().radius + 10
    const turn = now * 2.2
    if (data.enemy.get().champion) {
      const mark = view.champion
      g.fillCircle(at.x, at.y, radius + 4, color, mark.fill + mark.pulse * Math.sin(now * mark.pulseHz * Math.PI * 2))
      g.strokeCircle(at.x, at.y, radius + 4, 3, color, 0.95)
      g.strokeCircle(at.x, at.y, radius + mark.outer, 2, color, 0.5)
      for (let point = 0; point < mark.points; point++) {
        const angle = -turn * 0.6 + (point / mark.points) * Math.PI * 2
        const inner = radius + 6, outer = radius + mark.outer - 2
        g.line(at.x + Math.cos(angle) * inner, at.y + Math.sin(angle) * inner, at.x + Math.cos(angle) * outer, at.y + Math.sin(angle) * outer, 3, color, 0.9)
      }
    } else {
      g.strokeArc(at.x, at.y, radius, turn, turn + Math.PI * 0.8, 3, color, 0.85)
      g.strokeArc(at.x, at.y, radius, turn + Math.PI, turn + Math.PI * 1.8, 3, color, 0.85)
    }
    if (elite.charging !== null) {
      const discharge = tuning.elites.discharge
      drawArea(g, { kind: "circle", center: elite.charging.at, radius: discharge.radius }, 0, { color, fill: 0.12, outline: 0.8 })
    }
  }

  // Guardian shields: a bright arc on the side they face.
  for (const { data } of queries.shields.each()) {
    const shield = data.shield.get()
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const radius = data.body.get().radius + 9
    const facing = Math.atan2(shield.facing.y, shield.facing.x)
    g.strokeArc(at.x, at.y, radius, facing - shield.halfAngle, facing + shield.halfAngle, 6, view.shield, 0.9)
  }
  for (const { data } of queries.hitboxes.each()) {
    const hitbox = data.hitbox.get()
    const label = hitbox.blow.source?.label
    if (label?.kind === "skill" && unmarkedHits.has(label.skill)) continue
    const color = hitbox.faction === "enemy" ? view.telegraphLocked : hitbox.blow.element === null ? view.playerArea : view.elements[hitbox.blow.element.id]
    // A hammer's blow (one with a windup) softer: faint while it falls, its own look marking where it lands.
    const style = hitbox.delay === undefined ? { fill: 0.55, outline: 1 } : hitbox.delay > 0 ? { fill: 0.1, outline: 0.3 } : { fill: 0.3, outline: 0.6 }
    drawArea(g, hitbox.area, 0, { color, ...style })
  }

  // Lobbed skills: an arc through the air (shadow on the floor, orb above it), then the fuse ring.
  const overlay = services.host.overlay
  for (const { data } of queries.lobbed.each()) {
    const lobbed = data.lobbed.get()
    const spec = lobbed.effect
    const elapsed = lobbed.elapsed + services.clock.alpha * engine.stepSeconds
    const color = spec.element === null ? view.playerArea : view.elements[spec.element]
    // A volley's shell waiting its turn: where it will land, marked from the start.
    if (elapsed < 0) {
      g.strokeCircle(lobbed.to.x, lobbed.to.y, spec.radius, 2, color, 0.45)
      continue
    }
    const flight = Math.min(1, elapsed / spec.flightTime)
    const fuse = spec.fuse > 0 ? Math.max(0, Math.min(1, (elapsed - spec.flightTime) / spec.fuse)) : flight >= 1 ? 1 : 0
    // A rock splinter, once down: the circle its burst will strike, filling as its fuse burns.
    if (lobbed.splinter === true) {
      if (flight >= 1) {
        g.fillCircle(lobbed.to.x, lobbed.to.y, spec.radius * fuse, color, 0.12 + 0.12 * fuse)
        g.strokeCircle(lobbed.to.x, lobbed.to.y, spec.radius, 1.5, color, 0.3 + 0.5 * fuse)
        continue
      }
      // In flight, its shadow (the shard itself is in the 3D scene, see `ShowSplinters`).
      const ground = { x: lobbed.from.x + (lobbed.to.x - lobbed.from.x) * flight, y: lobbed.from.y + (lobbed.to.y - lobbed.from.y) * flight }
      g.fillCircle(ground.x, ground.y, 4, view.shadow, 0.3)
      continue
    }
    g.strokeCircle(lobbed.to.x, lobbed.to.y, spec.radius, 2, color, flight < 1 ? 0.35 : 0.9)
    // A bomb's fuse shows burning only for the team's own (an enemy's is read from it landing, never counted down).
    if (fuse > 0 && lobbed.faction === "player") g.fillCircle(lobbed.to.x, lobbed.to.y, spec.radius * fuse, color, 0.25)
    const ground = { x: lobbed.from.x + (lobbed.to.x - lobbed.from.x) * flight, y: lobbed.from.y + (lobbed.to.y - lobbed.from.y) * flight }
    g.fillCircle(ground.x, ground.y, 7, view.shadow, 0.35)
    const screen = toScreen(projection, ground)
    const height = 4 * view.grenadeArc * flight * (1 - flight) * projection.zoom
    // Player shells are faceted 3D bodies; enemy bombs keep their danger color.
    if (lobbed.faction !== "player") {
      overlay.fillCircle(screen.x, screen.y - height - 6, 6, spec.element === null ? view.grenade : view.elements[spec.element], 1)
      if (flight >= 1) overlay.strokeCircle(screen.x, screen.y - 6, 6, 2, color, 0.5 + 0.5 * Math.sin(elapsed * 40))
    }
  }
  // Whirls: their reach, with arms spiraling in toward the center (fading as they run out).
  for (const { data } of queries.vortices.each()) {
    const vortex = data.vortex.get()
    if (vortex.blow.source?.label?.kind === "skill" && vortex.blow.source.label.skill === "cyclone") continue
    const { center, effect } = vortex
    const color = effect.element === null ? view.playerArea : view.elements[effect.element]
    const fade = Math.min(1, vortex.remaining / 0.3)
    g.fillCircle(center.x, center.y, effect.radius, color, 0.1 * fade)
    g.strokeCircle(center.x, center.y, effect.radius, 3, color, 0.6 * fade)
    const turn = -now * view.vortex.turnsPerSecond * Math.PI * 2
    for (let arm = 0; arm < view.vortex.arms; arm++) {
      for (let ring = 1; ring <= 3; ring++) {
        const radius = (effect.radius * ring) / 3.4
        const start = turn + (arm / view.vortex.arms) * Math.PI * 2 + ring * 0.7
        g.strokeArc(center.x, center.y, radius, start, start + 0.9, 3, color, (0.25 + 0.15 * ring) * fade)
      }
    }
  }
  // Totems: their one reach (where they zap enemies, and where standing heals), fading as they run out.
  for (const { data } of queries.totems.each()) {
    const totem = data.totem.get()
    const at = data.position.get()
    const { effect } = totem
    const color = effect.element === null ? view.playerArea : view.elements[effect.element]
    const fade = Math.min(1, totem.remaining / 0.6)
    g.fillCircle(at.x, at.y, effect.radius, view.totem.heal, (0.07 + 0.03 * Math.sin(now * 5)) * fade)
    g.strokeCircle(at.x, at.y, effect.radius, 3, color, 0.6 * fade)
    // A sweep around it counting down to the next zap.
    const next = 1 - Math.max(0, totem.nextTick) / effect.tick
    g.strokeArc(at.x, at.y, effect.radius + 6, -Math.PI / 2, -Math.PI / 2 + next * Math.PI * 2, 2, color, 0.7 * fade)
  }
  // An Earthrise's rocks about to erupt: the floor cracking out from where each will rise, amber light welling up through the cracks.
  for (const { entity, data } of queries.rocks.each()) {
    const rock = data.rock.get()
    const { effect, at } = rock
    const grown = Math.max(0, Math.min(1, 1 - rock.remaining / effect.warning))
    if (grown <= 0) continue
    const spec = view.earthrise
    const glow = 0.5 + 0.5 * Math.sin(now * 30 + entity.id.value)
    g.fillCircle(at.x, at.y, effect.size * grown, view.stone.glow, (0.1 + 0.08 * glow) * grown)
    g.strokeCircle(at.x, at.y, effect.size, 2, view.stone.glow, 0.35 * grown)
    for (let crack = 0; crack < spec.cracks; crack++) {
      // Each crack zigzags out, the same way every frame (its turns come from the rock and the crack).
      let angle = (crack / spec.cracks) * Math.PI * 2 + entity.id.value
      let from = at
      const steps = 3
      for (let step = 1; step <= steps; step++) {
        angle += Math.sin(entity.id.value * 7.1 + crack * 3.3 + step * 5.7) * 0.5
        const out = effect.size * grown * (step / steps) * (0.8 + 0.25 * Math.sin(crack * 2.9 + entity.id.value))
        const to = { x: at.x + Math.cos(angle) * out, y: at.y + Math.sin(angle) * out }
        g.line(from.x, from.y, to.x, to.y, spec.width * (1.4 - step / steps), view.stone.glow, 0.85 * grown)
        from = to
      }
    }
  }
  // Shockwaves: a crescent of the floor heaving up, bowed the way it runs.
  for (const { data } of queries.waves.each()) {
    const projectile = data.projectile.get()
    if (projectile.style !== "wave") continue
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const velocity = data.velocity.get()
    const heading = Math.atan2(velocity.y, velocity.x)
    const radius = projectile.radius * view.shockwave.crescent
    const color = projectile.blow.element === null ? view.shockwave.color : view.elements[projectile.blow.element.id]
    g.strokeArc(at.x - Math.cos(heading) * radius, at.y - Math.sin(heading) * radius, radius * 2, heading - 0.7, heading + 0.7, view.shockwave.width, color, view.shockwave.alpha)
  }
  // Discs: a ring spinning under each, wide while it hovers (where it hits).
  for (const { data } of queries.discs.each()) {
    const disc = data.disc.get()
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const turn = now * view.disc.turnsPerSecond * Math.PI * 2
    // While hovering, out to where it hits a body of average size.
    const radius = disc.phase === "hover" ? disc.radius + 16 : disc.radius * 1.5
    g.strokeArc(at.x, at.y, radius, turn, turn + Math.PI * 1.4, disc.phase === "hover" ? 4 : 3, view.disc.ring, disc.phase === "hover" ? 0.9 : 0.6)
    if (disc.phase === "hover") g.fillCircle(at.x, at.y, radius, view.disc.ring, 0.12)
  }
  for (const { data } of queries.pending.each()) {
    const pending = data.pending.get()
    const radius = tuning.enemies[pending.kind].radius + 10
    const progress = 1 - pending.remaining / pending.duration
    g.strokeCircle(pending.at.x, pending.at.y, radius, 3, view.spawnWarning, 0.8)
    g.fillCircle(pending.at.x, pending.at.y, radius * progress, view.spawnWarning, 0.25)
  }
})

/**
 * Marked enemies (see `Marked`): two pale rings on the floor around each,
 * pulsing, and fading as its mark runs out, so what heals when hit reads at
 * a glance (apart from the puddles the marking wave leaves). Drawn over the
 * telegraphs (after `DrawTelegraphs` clears them).
 */
export const DrawMarks = Game.System("Shooter/DrawMarks", {
  queries: {
    marked: Game.Query({ selection: { marked: Game.Query.read(Marked), position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition), body: Game.Query.read(Body) }, with: [Enemy] })
  },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, services }) => {
  const g = services.host.telegraphs
  for (const { data } of queries.marked.each()) {
    const { remaining } = data.marked.get()
    if (remaining <= 0) continue
    const at = lerp(data.previous.get(), data.position.get(), services.clock.alpha)
    const fade = Math.min(1, remaining / view.marks.fadeSeconds)
    const pulse = 0.75 + 0.25 * Math.sin((performance.now() / 1000 / view.marks.pulse) * Math.PI * 2)
    const radius = data.body.get().radius + view.marks.gap
    g.strokeCircle(at.x, at.y, radius, view.marks.width, view.marks.color, view.marks.outline * fade * pulse)
    g.strokeCircle(at.x, at.y, radius - view.marks.inner, view.marks.width - 1, view.marks.color, view.marks.outline * fade * pulse * 0.6)
  }
})

/**
 * Barriers standing (see `Barrier`): a band of wind on the floor (a wall's
 * strip, a ring's circle) with streaks running along it, fading out as its
 * time runs out.
 */
export const DrawBarriers = Game.System("Shooter/DrawBarriers", {
  queries: { barriers: Game.Query({ selection: { barrier: Game.Query.read(Barrier) } }) },
  services: { host: Game.System.service(RenderHost) }
}, ({ queries, services }) => {
  const g = services.host.telegraphs
  const now = performance.now() / 1000
  const spec = view.barriers
  for (const { data } of queries.barriers.each()) {
    const { shape, effect, remaining } = data.barrier.get()
    const color = effect.element === null ? view.playerArea : view.elements[effect.element]
    const fade = Math.min(1, remaining / spec.fadeSeconds)
    const half = effect.thickness / 2
    if (shape.kind === "wall") {
      const along = { x: shape.to.x - shape.from.x, y: shape.to.y - shape.from.y }
      const length = Math.hypot(along.x, along.y)
      const unit = { x: along.x / length, y: along.y / length }
      const across = { x: -unit.y * half, y: unit.x * half }
      g.fillPoly([shape.from.x + across.x, shape.from.y + across.y, shape.to.x + across.x, shape.to.y + across.y, shape.to.x - across.x, shape.to.y - across.y, shape.from.x - across.x, shape.from.y - across.y], color, spec.fill * fade)
      g.line(shape.from.x + across.x, shape.from.y + across.y, shape.to.x + across.x, shape.to.y + across.y, spec.width, color, spec.edge * fade)
      g.line(shape.from.x - across.x, shape.from.y - across.y, shape.to.x - across.x, shape.to.y - across.y, spec.width, color, spec.edge * fade)
      // Streaks of wind running along it.
      for (let streak = 0; streak < spec.streaks; streak++) {
        const t = (now * 0.9 + streak / spec.streaks) % 1
        const start = { x: shape.from.x + along.x * t, y: shape.from.y + along.y * t }
        const end = Math.min(length, length * t + spec.streakLength)
        g.line(start.x, start.y, shape.from.x + unit.x * end, shape.from.y + unit.y * end, spec.width - 1, view.hitFlash, spec.edge * fade * 0.6)
      }
      continue
    }
    g.strokeCircle(shape.center.x, shape.center.y, shape.radius, effect.thickness, color, spec.fill * 1.5 * fade)
    g.strokeCircle(shape.center.x, shape.center.y, shape.radius + half, spec.width, color, spec.edge * fade)
    g.strokeCircle(shape.center.x, shape.center.y, shape.radius - half, spec.width, color, spec.edge * fade)
    for (let streak = 0; streak < spec.streaks; streak++) {
      const turn = now * 1.6 + (streak / spec.streaks) * Math.PI * 2
      g.strokeArc(shape.center.x, shape.center.y, shape.radius, turn, turn + spec.streakLength / shape.radius, spec.width - 1, view.hitFlash, spec.edge * fade * 0.6)
    }
  }
})
