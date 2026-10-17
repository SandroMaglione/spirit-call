/**
 * The team (see docs/vision.md, "Teams"): up to three characters, one on
 * the field at a time.
 *
 * Every member is her own entity for the whole run, holding what is hers
 * (`makeMember`): health, stats, state, energy, skill cooldowns, her basic
 * attack, and her aspect's passives. The one on the field also has a body
 * (`fieldParts`: position, movement, hurtbox, aim, dash, and the `Player`
 * tag), which every system about the player reads. Switching moves the body
 * to another member. A member on the bench has none, so nothing hits her
 * (only a fire she carries off keeps burning, see `TickStates`), her
 * aspect's effects stop (they look up a body), and a disc flying back to her
 * is dropped. Her cooldowns run on (`TickBench`), and she gains a share of
 * the energy the one on the field earns (`ApplyDamage`).
 */
import type { Vec2 } from "@typeonce/ritmo-math/Vec2"
import { teamSize } from "../content/characters.ts"
import type { CharacterId } from "../content/characters.ts"
import { bySlot } from "../content/skills.ts"
import type { Tuning as TuningValue } from "../config/tuning.ts"
import {
  Action,
  Aim,
  Airborne,
  Arrival,
  Facing,
  Controls,
  Dash,
  Energy,
  Game,
  Health,
  HitStop,
  SlowMotion,
  Invulnerable,
  Member,
  Passives,
  Player,
  Position,
  PrevPosition,
  Renderable,
  RunScope,
  Skills,
  Team,
  TeamSwitch,
  Time,
  Tuning,
  Velocity,
  BasicAttack
} from "../schema.ts"
import type { DashValue } from "../schema.ts"
import { BodyParts, bodyParts, FighterParts, fighterParts } from "./bodies.ts"
import type { BodyMotion } from "./bodies.ts"
import { dashOf, resolveBuild } from "./build.ts"
import { traitsOf } from "../content/passives.ts"
import type { Passive } from "../content/passives.ts"
import type { ResolvedBuild } from "./build.ts"
import { initialSkills } from "./skills.ts"
import { initialBasicAttack } from "./basic-attack.ts"

/** The components of `makeMember`. */
export const MemberParts = [...FighterParts, Member, Passives, BasicAttack, Skills, Energy] as const

/** A team member in `slot`, at full health, with her build's kit (taking every element as it is). */
export const makeMember = (build: ResolvedBuild, slot: number) =>
  Game.Command.spawn(
    ...fighterParts({ stats: build.stats, affinities: {} }),
    [Member, { slot, character: build.character, aspect: build.attack.aspect, level: build.level }],
    [Passives, build.passives],
    [BasicAttack, initialBasicAttack(build)],
    [Skills, initialSkills(build)],
    [Energy, { current: 0 }]
  )

/** What the body on the field carries from one character to the next: how it moves, where it aims, and the dash. */
export interface Carried {
  readonly motion: BodyMotion
  readonly aim: Vec2
  readonly facing: Vec2
  readonly dash: DashValue
}

/** `character`'s body that has not moved yet, aiming right, her dashes ready. */
const fresh = (tuning: TuningValue, character: CharacterId, passives: ReadonlyArray<Passive>, at: Vec2): Carried => ({
  motion: { previous: at, velocity: { x: 0, y: 0 }, invulnerable: 0 },
  aim: { x: 1, y: 0 },
  facing: { x: 1, y: 0 },
  dash: { remaining: 0, charges: dashOf(tuning, character, traitsOf(passives)).charges, cooldown: 0, buffered: 0, direction: { x: 1, y: 0 }, since: Infinity, perfect: false, from: { x: 0, y: 0 } }
})

/** The components of `fieldParts`. */
export const FieldParts = [...BodyParts, Player, Aim, Facing, Dash, Renderable] as const

/** `member`'s body on the field at `at`: her size and look, and what it carries. */
export const fieldParts = (tuning: TuningValue, member: { readonly character: CharacterId }, at: Vec2, carried: Carried) => {
  const { character } = member
  const { radius, hurtboxRadius } = tuning.characters[character]
  return [
    ...bodyParts({ at, faction: "player", radius, hurtboxRadius }, carried.motion),
    [Player, {}],
    [Aim, carried.aim],
    [Facing, { direction: carried.facing, hold: 0 }],
    [Dash, carried.dash],
    [Renderable, { kind: "player", character, radius }]
  ] as const
}

/** Spawns the team (`Team`, at most `teamSize`), the first one on the field at the arena's center. */
export const SpawnTeam = Game.System("Shooter/SpawnTeam", {
  resources: { tuning: Game.System.readResource(Tuning), team: Game.System.readResource(Team) },
  commands: Game.System.commands(Game.System.spawns(...MemberParts, ...FieldParts))
}, ({ resources, commands }) => {
  const tuning = resources.tuning.get()
  const at = { x: tuning.arena.width / 2, y: tuning.arena.height / 2 }
  resources.team.get().slice(0, teamSize).forEach((build, slot) => {
    const resolved = resolveBuild(tuning, build)
    const member = makeMember(resolved, slot)
    if (slot === 0) commands.spawnIn(RunScope, Game.Command.extend(member, ...fieldParts(tuning, resolved, at, fresh(tuning, resolved.character, resolved.passives, at))))
    else commands.spawnIn(RunScope, member)
  })
})

/** The bench: its skill cooldowns run down, and so do the wait before the next switch and the hold on one coming in after a fall (see `Arrival`). */
export const TickBench = Game.System("Shooter/TickBench", {
  queries: { bench: Game.Query({ selection: { skills: Game.Query.write(Skills) }, with: [Member], without: [Player] }) },
  resources: { time: Game.System.readResource(Time), teamSwitch: Game.System.writeResource(TeamSwitch), arrival: Game.System.writeResource(Arrival) }
}, ({ queries, resources }) => {
  const dt = resources.time.get().dt
  const wait = resources.teamSwitch.get().cooldown
  if (wait > 0) resources.teamSwitch.set({ cooldown: Math.max(0, wait - dt) })
  const held = resources.arrival.get().remaining
  if (held > 0) resources.arrival.set({ remaining: Math.max(0, held - dt) })
  for (const { data } of queries.bench.each()) {
    const slots = data.skills.get()
    if (Object.values(slots).every((slot) => slot.cooldown <= 0)) continue
    data.skills.set(bySlot((slot) => ({ ...slots[slot], cooldown: Math.max(0, slots[slot].cooldown - dt) })))
  }
})

/** The next member alive after `slot` in team order (wrapping around), if any. */
export const nextAlive = <M extends { readonly slot: number; readonly alive: boolean }>(members: ReadonlyArray<M>, slot: number): M | undefined => {
  const order = [...members].sort((left, right) => left.slot - right.slot)
  const after = order.filter((member) => member.slot > slot)
  const before = order.filter((member) => member.slot < slot)
  return [...after, ...before].find((member) => member.alive)
}

/**
 * Moves the body to another member. When the one on the field has fallen,
 * the next one alive in order comes in, protected for a moment (see
 * `Tuning.team.fallProtection`); when nobody is left, the body is gone and
 * the run is lost (`DetectGameOver`). Otherwise a switch key brings in that
 * slot's member, if she is alive, the last switch was long enough ago, and
 * the one on the field is not dashing or frozen in a hit-stop.
 *
 * The incoming member carries on from where the body is (its place, aim,
 * movement, dash, and any invulnerability), with none of the last one's
 * push. The outgoing one's attack is interrupted (her combo starts over).
 * Runs whenever the run is live, so a fall is never missed to a hit-stop.
 */
export const SwitchCharacter = Game.System("Shooter/SwitchCharacter", {
  queries: {
    field: Game.Query({
      selection: {
        member: Game.Query.read(Member),
        health: Game.Query.read(Health),
        position: Game.Query.read(Position),
        previous: Game.Query.read(PrevPosition),
        velocity: Game.Query.read(Velocity),
        aim: Game.Query.read(Aim),
        facing: Game.Query.read(Facing),
        dash: Game.Query.read(Dash),
        invulnerable: Game.Query.read(Invulnerable),
        basicAttack: Game.Query.read(BasicAttack),
        airborne: Game.Query.optional(Airborne)
      },
      with: [Player]
    }),
    members: Game.Query({ selection: { member: Game.Query.read(Member), health: Game.Query.read(Health) } })
  },
  resources: {
    controls: Game.System.readResource(Controls),
    tuning: Game.System.readResource(Tuning),
    teamSwitch: Game.System.writeResource(TeamSwitch),
    hitStop: Game.System.readResource(HitStop),
    slowMotion: Game.System.writeResource(SlowMotion),
    arrival: Game.System.writeResource(Arrival)
  },
  events: { action: Game.System.writeEvent(Action) },
  commands: Game.System.commands(Game.System.inserts(...FieldParts, BasicAttack), Game.System.removes(...FieldParts))
}, ({ queries, resources, events, commands }) => {
  const [field] = queries.field.each()
  if (field === undefined) return
  const tuning = resources.tuning.get()
  const slot = field.data.member.get().slot
  const dash = field.data.dash.get()
  const members = queries.members.each().map(({ entity, data }) => ({
    entity: entity.id,
    slot: data.member.get().slot,
    character: data.member.get().character,
    alive: data.health.get().current > 0
  }))
  const fell = field.data.health.get().current <= 0
  let incoming: (typeof members)[number] | undefined
  if (fell) incoming = nextAlive(members, slot)
  else {
    const wanted = resources.controls.get().switchTo
    const frozen = resources.hitStop.get().remaining > 1e-9
    if (wanted === null || wanted === slot || frozen || dash.remaining > 0 || field.data.airborne.present || resources.teamSwitch.get().cooldown > 0) return
    incoming = members.find((member) => member.slot === wanted && member.alive)
    if (incoming === undefined) return
  }

  const at = field.data.position.get()
  // After a fall she is held while the one who fell goes down (see `Arrival`); her protection counts from when she steps in.
  const beat = fell ? tuning.team.fallBeat.seconds : 0
  const invulnerable = Math.max(field.data.invulnerable.get().remaining, fell ? beat + tuning.team.fallProtection : 0)
  const carried: Carried = {
    motion: { previous: field.data.previous.get(), velocity: field.data.velocity.get(), invulnerable },
    aim: field.data.aim.get(),
    facing: field.data.facing.get().direction,
    dash: { ...dash, remaining: 0, buffered: 0 }
  }
  // The body leaves the one on the field (the same components any body has), and her attack is interrupted.
  const outgoing = field.data.member.get()
  commands.remove(field.entity, ...FieldParts)
  if (fell) events.action.emit({ kind: "fall", at, character: outgoing.character, facing: carried.facing })
  if (incoming === undefined) return
  commands.insert(field.entity, [BasicAttack, initialBasicAttack({ attack: field.data.basicAttack.get().attack })])
  commands.insert(incoming.entity, ...fieldParts(tuning, incoming, at, carried))
  resources.teamSwitch.set({ cooldown: tuning.team.switchCooldown })
  // After a fall, a beat: the enemies slow to a crawl while the one who fell goes down, and the one coming in stands held.
  if (fell && beat > 0) {
    resources.slowMotion.update((slow) => (slow.remaining > beat ? slow : { remaining: beat, scale: tuning.team.fallBeat.scale, dodge: false }))
    resources.arrival.set({ remaining: beat })
  }
  events.action.emit({ kind: "switch", at, character: incoming.character, fell })
})
