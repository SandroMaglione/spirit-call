/**
 * The run's log (`RunLog`), for measuring play: each step's blows, skills,
 * dashes, switches, and falls, added up by wave, by what dealt them, and by
 * team member. It only watches (events and resources), so it changes
 * nothing of the run; the run's result carries it to the shell, which a
 * playtest build sends on (see docs/playtest.md).
 */
import type { CharacterId } from "../content/characters.ts"
import type { SkillId } from "../content/skills.ts"
import { Action, Cast, Game, Hit, Member, Run, RunLog, Waves } from "../schema.ts"
import type { RunLogSource, RunLogValue } from "../schema.ts"

const Members = Game.Query({ selection: { member: Game.Query.read(Member) } })

/** `list` with the entry `matches` finds changed by `change` (or `fresh` changed, added at the end). */
const tallied = <T>(list: ReadonlyArray<T>, matches: (entry: T) => boolean, fresh: T, change: (entry: T) => T): ReadonlyArray<T> => {
  const at = list.findIndex(matches)
  return at === -1 ? [...list, change(fresh)] : list.map((entry, index) => (index === at ? change(entry) : entry))
}

const sameSource = (a: RunLogSource) => (b: RunLogSource) => a.enemy === b.enemy && a.attack === b.attack

const member = (log: RunLogValue, character: CharacterId, change: (entry: RunLogValue["members"][number]) => RunLogValue["members"][number]): RunLogValue => ({
  ...log,
  members: tallied(log.members, (entry) => entry.character === character, { character, damageDealt: 0, damageTaken: 0, kills: 0 }, change)
})

const skill = (log: RunLogValue, character: CharacterId, id: SkillId, change: (entry: RunLogValue["skills"][number]) => RunLogValue["skills"][number]): RunLogValue => ({
  ...log,
  skills: tallied(log.skills, (entry) => entry.character === character && entry.skill === id, { character, skill: id, uses: 0, hits: 0, damage: 0 }, change)
})

export const RecordRunLog = Game.System("Shooter/RecordRunLog", {
  queries: { members: Members },
  events: { hit: Game.System.readEvent(Hit), cast: Game.System.readEvent(Cast), action: Game.System.readEvent(Action) },
  resources: { log: Game.System.writeResource(RunLog), waves: Game.System.readResource(Waves), run: Game.System.readResource(Run) }
}, ({ queries, events, resources }) => {
  const hits = events.hit.all()
  const casts = events.cast.all()
  const actions = events.action.all()
  const wave = resources.waves.get().number
  const before = resources.log.get()
  if (hits.length === 0 && casts.length === 0 && actions.length === 0 && (wave === 0 || before.waves.at(-1)?.wave === wave)) return
  const now = resources.run.get().time
  const characters = new Map<number, CharacterId>(queries.members.each().map(({ entity, data }) => [entity.id, data.member.get().character]))
  let log = before

  // A wave begun: its own line.
  if (wave > 0 && log.waves.at(-1)?.wave !== wave) log = { ...log, waves: [...log.waves, { wave, startedAt: now, hitsTaken: 0, damageTaken: 0 }] }

  for (const hit of hits) {
    const label = hit.source?.label
    const by = hit.source === null ? undefined : characters.get(hit.source.attacker)
    if (hit.faction === "player") {
      // A blow on the team: what dealt it, in which wave, on whom.
      const source: RunLogSource = label?.kind === "enemy" ? { enemy: label.enemy, attack: label.attack } : { enemy: null, attack: null }
      const blow = hit.periodic ? 0 : 1
      log = { ...log, hurts: tallied(log.hurts, sameSource(source), { ...source, hits: 0, damage: 0 }, (entry) => ({ ...entry, hits: entry.hits + blow, damage: entry.damage + hit.amount })) }
      const last = log.waves.at(-1)
      if (last !== undefined) log = { ...log, waves: [...log.waves.slice(0, -1), { ...last, hitsTaken: last.hitsTaken + blow, damageTaken: last.damageTaken + hit.amount }] }
      const struck = characters.get(hit.entity)
      if (struck !== undefined) {
        log = member(log, struck, (entry) => ({ ...entry, damageTaken: entry.damageTaken + hit.amount }))
        if (hit.killed) log = { ...log, knockouts: [...log.knockouts, { ...source, character: struck, at: now, wave }] }
      }
    } else if (by !== undefined) {
      // A blow the team landed: whose, and which skill's.
      log = member(log, by, (entry) => ({ ...entry, damageDealt: entry.damageDealt + hit.amount, kills: entry.kills + (hit.killed ? 1 : 0) }))
      if (label?.kind === "skill") log = skill(log, by, label.skill, (entry) => ({ ...entry, hits: entry.hits + 1, damage: entry.damage + hit.amount }))
    }
  }

  for (const cast of casts) {
    const character = characters.get(cast.caster)
    if (cast.faction === "player" && cast.skill !== null && cast.landing !== true && character !== undefined) log = skill(log, character, cast.skill, (entry) => ({ ...entry, uses: entry.uses + 1 }))
  }

  for (const action of actions) {
    if (action.kind === "dash") log = { ...log, dashes: log.dashes + 1 }
    else if (action.kind === "switch" && !action.fell) log = { ...log, switches: log.switches + 1 }
  }

  resources.log.set(log)
})
