/**
 * Animation: actors' bodies turn and play their clips from what the
 * simulation says, for any look (see `looks.ts` for which clip plays at
 * which moment). The simulation's timings decide; clips are stretched to
 * fit them, and everything stops with the world during hit-stop.
 */
import type { Area } from "../physics/areas.ts"
import { normalizeOr } from "../math/vec.ts"
import type { Vec2 } from "../math/vec.ts"
import { isMelee } from "../content/attacks.ts"
import { currentAttack } from "../features/moveset.ts"
import { Action, Aim, AttackPhase, Attacker, Cast, Dash, Enemy, Game, Hit, HitStop, Player, Position, RenderClock, RenderNodes, Shield, Stunned, Tuning, Velocity, Weapon } from "../schema.ts"
import { enemyPose } from "./enemy-pose.ts"
import type { ActorNode } from "./host-types.ts"

/** Where an attack area points from `from`, if anywhere. */
const areaDirection = (area: Area, from: Vec2): Vec2 | null => {
  switch (area.kind) {
    case "circle":
      return area.center.x === from.x && area.center.y === from.y ? null : normalizeOr({ x: area.center.x - from.x, y: area.center.y - from.y }, { x: 0, y: 1 })
    case "cone":
    case "line":
    case "lane":
      return area.direction
  }
}

/** Below this speed (world units per second) a body is standing: it keeps facing where it last faced. */
const turnSpeed = 20

/**
 * Turns and animates every actor's body: the player faces her aim and her
 * loops hold through a dash; an enemy faces where it moves, or where its
 * attack will land while winding up.
 */
export const AnimateActors = Game.System("Shooter/AnimateActors", {
  queries: {
    player: Game.Query({ selection: { aim: Game.Query.read(Aim), dash: Game.Query.read(Dash) }, with: [Player] }),
    enemies: Game.Query({
      selection: { position: Game.Query.read(Position), velocity: Game.Query.read(Velocity), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase), enemy: Game.Query.read(Enemy), stunned: Game.Query.read(Stunned), shield: Game.Query.optional(Shield) },
      with: [Enemy]
    })
  },
  resources: { hitStop: Game.System.readResource(HitStop), tuning: Game.System.readResource(Tuning) },
  services: { nodes: Game.System.service(RenderNodes), clock: Game.System.service(RenderClock) }
}, ({ queries, resources, services }) => {
  const seconds = resources.hitStop.get().remaining > 0 ? 0 : services.clock.frameSeconds
  const animate = (node: ActorNode, facing: Vec2, holding: boolean, dt = seconds) => {
    node.facing = facing
    node.body.face(facing)
    node.body.animate({ x: node.root.position.x, y: node.root.position.z }, facing, dt, holding)
  }
  for (const { entity, data } of queries.player.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind === "player") animate(node, data.aim.get(), data.dash.get().remaining > 0)
  }
  for (const { entity, data } of queries.enemies.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "enemy") continue
    const velocity = data.velocity.get()
    const area = data.attacker.get().area
    const aimed = data.phase.get() !== "ready" && area !== null ? areaDirection(area, data.position.get()) : null
    const moving = Math.hypot(velocity.x, velocity.y) > turnSpeed ? normalizeOr(velocity, node.facing) : null
    const shield = data.shield.present ? data.shield.get().facing : null
    const facing = aimed ?? shield ?? moving ?? node.facing
    const held = data.stunned.get().remaining > 0
    animate(node, facing, held, held ? 0 : seconds)
    if (shield !== null) node.body.shield?.(Math.atan2(shield.x, shield.y) - Math.atan2(facing.x, facing.y))
    const pose = enemyPose(currentAttack(resources.tuning.get(), data.enemy.get().kind, data.attacker.get()), data.phase.get(), data.attacker.get().elapsed)
    if (pose !== null) node.body.sample?.(pose.clip, pose.progress)
  }
})

/**
 * One-shot moments from the simulation's events, for bodies with a clip
 * for them: an attack or power move over its recovery (its blow's pose
 * meeting the simulation's blow), a dash over the dash, a skill and a hurt
 * at their clip's length, and an enemy's windup over the windup.
 */
export const PlayMoments = Game.System("Shooter/PlayMoments", {
  events: { action: Game.System.readEvent(Action), cast: Game.System.readEvent(Cast), hit: Game.System.readEvent(Hit) },
  queries: {
    player: Game.Query({ selection: { weapon: Game.Query.read(Weapon) }, with: [Player] }),
    enemies: Game.Query({ selection: { enemy: Game.Query.read(Enemy), attacker: Game.Query.read(Attacker), phase: Game.Query.read(AttackPhase) } })
  },
  resources: { tuning: Game.System.readResource(Tuning) },
  services: { nodes: Game.System.service(RenderNodes) }
}, ({ events, queries, resources, services }) => {
  const tuning = resources.tuning.get()
  const [player] = queries.player.each()
  const hers = player === undefined ? undefined : services.nodes.get(player.entity.id)
  for (const action of events.action.all()) {
    if (player === undefined || hers?.kind !== "player") break
    const moments = hers.body.moments
    if (moments === null) break
    if (action.kind === "attack") {
      const shot = action.power ? moments.power : moments.attack?.[Math.min(action.step, moments.attack.length - 1)]
      // A melee blow lands while its hitbox is out (in its middle); a shot leaves at once.
      const hitAt = isMelee(action.move) ? tuning.attacks[player.data.weapon.get().attack].active / 2 : 0
      if (shot !== undefined) hers.body.play(shot, action.move.recovery, hitAt)
    } else if (action.kind === "dash" && moments.dash !== undefined) {
      hers.body.play(moments.dash, tuning.dash.duration, null)
    }
  }
  for (const cast of events.cast.all()) {
    if (cast.skill === null) continue
    const node = services.nodes.get(cast.caster)
    if (node?.kind !== "player" && node?.kind !== "enemy") continue
    const clip = node.body.moments?.skills?.[cast.skill]
    if (clip !== undefined) node.body.play(clip, null, null)
  }
  for (const hit of events.hit.all()) {
    if (hit.periodic || hit.killed) continue
    const node = services.nodes.get({ value: hit.entity })
    if (node?.kind !== "player" && node?.kind !== "enemy") continue
    const clip = node.body.moments?.hurt
    if (clip !== undefined) node.body.play(clip, null, null)
  }
  // An enemy's windup starts: its clip over the windup.
  for (const { entity, data } of queries.enemies.each()) {
    const node = services.nodes.get(entity.id)
    if (node?.kind !== "enemy") continue
    const phase = data.phase.get()
    const started = phase === "windup" && node.attackPhase !== "windup"
    node.attackPhase = phase
    const spec = currentAttack(tuning, data.enemy.get().kind, data.attacker.get())
    const clip = node.body.moments?.windup
    if (started && spec !== undefined && clip !== undefined) node.body.play(clip, spec.windup, null)
  }
})
