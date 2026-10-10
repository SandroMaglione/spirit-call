/**
 * The account's tables (see `migrations/`), row by row: a Schema for each
 * table's rows (every row read is decoded with it), and the account as rows
 * and back. Rows hold content ids as strings; which still name content is
 * checked when the account is read (`fromRecord`).
 */
import * as Schema from "effect/Schema"

import type { AccountRecord } from "../account/convert.ts"

const Text = Schema.String
const Int = Schema.Number
const OptionalInt = Schema.NullOr(Schema.Number)

/**
 * The account's own row. Some columns are left from the Spirit Call and the
 * account level (`experience`, `call_seed`, `calls_since_*`,
 * `first_character_called`): migrations only add, so they stay, written as
 * zero.
 */
export const AccountRow = Schema.Struct({
  user_id: Text,
  created_at: Int,
  experience: Int,
  runs: Int,
  clears: Int,
  kills: Int,
  seconds_played: Int,
  call_seed: Int,
  calls_since_character: Int,
  calls_since_rare: Int,
  first_character_called: Int,
  play_kind: Schema.Literals(["quest", "tier"]),
  play_quest: Schema.NullOr(Text),
  play_rank: OptionalInt,
  play_track: Schema.NullOr(Text),
  play_tier: OptionalInt
})

/** Every table of an account: its rows' Schema and the columns that key a row (after `user_id`). */
export const tables = {
  accounts: { row: AccountRow, key: [] },
  balances: { row: Schema.Struct({ user_id: Text, resource: Text, amount: Int }), key: ["resource"] },
  characters: { row: Schema.Struct({ user_id: Text, character: Text, unlocked_at: Int, experience: Int, ascension: Int }), key: ["character"] },
  aspects: { row: Schema.Struct({ user_id: Text, aspect: Text, unlocked_at: Int, copies: Int }), key: ["aspect"] },
  relics: { row: Schema.Struct({ user_id: Text, relic: Text, unlocked_at: Int, tier: Int }), key: ["relic"] },
  cosmetics: { row: Schema.Struct({ user_id: Text, cosmetic: Text, unlocked_at: Int }), key: ["cosmetic"] },
  team_members: { row: Schema.Struct({ user_id: Text, slot: Int, character: Text, aspect: Schema.NullOr(Text) }), key: ["slot"] },
  team_relics: { row: Schema.Struct({ user_id: Text, character: Text, slot: Text, relic: Text }), key: ["character", "slot"] },
  worn_cosmetics: { row: Schema.Struct({ user_id: Text, character: Text, kind: Text, cosmetic: Text }), key: ["character", "kind"] },
  quests: { row: Schema.Struct({ user_id: Text, quest: Text, rank: Int, attempts: Int, clears: Int, first_cleared_at: OptionalInt, perfect_at: OptionalInt }), key: ["quest", "rank"] },
  quest_stars: { row: Schema.Struct({ user_id: Text, quest: Text, rank: Int, star: Int }), key: ["quest", "rank", "star"] },
  tiers: {
    row: Schema.Struct({ user_id: Text, track: Text, tier: Int, attempts: Int, clears: Int, first_cleared_at: OptionalInt, rewarded_period: OptionalInt, best_wave: OptionalInt }),
    key: ["track", "tier"]
  },
  discoveries: { row: Schema.Struct({ user_id: Text, discovery: Text, made_at: Int }), key: ["discovery"] },
  chests: { row: Schema.Struct({ user_id: Text, star_group: Text, rank: Int, opened: Int }), key: ["star_group", "rank"] },
  saved_team_members: { row: Schema.Struct({ user_id: Text, team: Int, slot: Int, character: Text, aspect: Schema.NullOr(Text) }), key: ["team", "slot"] },
  saved_team_relics: { row: Schema.Struct({ user_id: Text, team: Int, character: Text, slot: Text, relic: Text }), key: ["team", "character", "slot"] },
  auditions: { row: Schema.Struct({ user_id: Text, character: Text, slot: Int, opened_at: Int }), key: ["character"] }
} as const

export type TableName = keyof typeof tables
export type RowOf<T extends TableName> = (typeof tables)[T]["row"]["Type"]
/** An account as rows, table by table. */
export type AccountRows = { readonly [T in TableName]: ReadonlyArray<RowOf<T>> }

/** No rows at all (a player without an account yet). */
export const noRows: AccountRows = Object.fromEntries(Object.keys(tables).map((table) => [table, []])) as unknown as AccountRows

/** `account` as rows of the player `userId`. */
export const toRows = (userId: string, account: AccountRecord): AccountRows => {
  const user_id = userId
  const { play } = account.selection
  return {
    accounts: [
      {
        user_id,
        created_at: account.createdAt,
        experience: 0,
        runs: account.totals.runs,
        clears: account.totals.clears,
        kills: account.totals.kills,
        seconds_played: account.totals.secondsPlayed,
        call_seed: 0,
        calls_since_character: 0,
        calls_since_rare: 0,
        first_character_called: 0,
        play_kind: play.kind,
        play_quest: play.kind === "quest" ? play.quest : null,
        play_rank: play.kind === "quest" ? (play.rank ?? null) : null,
        play_track: play.kind === "tier" ? play.track : null,
        play_tier: play.kind === "tier" ? play.tier : null
      }
    ],
    balances: Object.entries(account.wallet).map(([resource, amount]) => ({ user_id, resource, amount })),
    characters: Object.entries(account.owned.characters).map(([character, owned]) => ({ user_id, character, unlocked_at: owned.unlockedAt, experience: owned.experience, ascension: owned.ascension })),
    aspects: Object.entries(account.owned.aspects).map(([aspect, owned]) => ({ user_id, aspect, unlocked_at: owned.unlockedAt, copies: 1 })),
    relics: Object.entries(account.owned.relics).map(([relic, owned]) => ({ user_id, relic, unlocked_at: owned.unlockedAt, tier: owned.tier })),
    cosmetics: Object.entries(account.owned.cosmetics).map(([cosmetic, owned]) => ({ user_id, cosmetic, unlocked_at: owned.unlockedAt })),
    team_members: account.selection.team.map((character, slot) => ({ user_id, slot, character, aspect: account.selection.aspects[character] ?? null })),
    team_relics: Object.entries(account.selection.relics).flatMap(([character, slots]) => Object.entries(slots).map(([slot, relic]) => ({ user_id, character, slot, relic }))),
    worn_cosmetics: Object.entries(account.worn).flatMap(([character, kinds]) => Object.entries(kinds).map(([kind, cosmetic]) => ({ user_id, character, kind, cosmetic }))),
    quests: Object.entries(account.quests).flatMap(([quest, ranks]) => Object.entries(ranks).map(([rank, progress]) => ({ user_id, quest, rank: Number(rank), attempts: progress.attempts, clears: progress.clears, first_cleared_at: progress.firstClearedAt, perfect_at: progress.perfectAt ?? null }))),
    quest_stars: Object.entries(account.quests).flatMap(([quest, ranks]) => Object.entries(ranks).flatMap(([rank, progress]) => progress.stars.map((star) => ({ user_id, quest, rank: Number(rank), star })))),
    tiers: Object.entries(account.hardcore).flatMap(([track, tiers]) =>
      Object.entries(tiers).map(([tier, progress]) => ({
        user_id,
        track,
        tier: Number(tier),
        attempts: progress.attempts,
        clears: progress.clears,
        first_cleared_at: progress.firstClearedAt,
        rewarded_period: null,
        best_wave: progress.bestWave ?? null
      }))
    ),
    discoveries: Object.entries(account.discoveries).map(([discovery, made]) => ({ user_id, discovery, made_at: made.madeAt })),
    chests: Object.entries(account.chests).flatMap(([star_group, ranks]) => Object.entries(ranks).map(([rank, opened]) => ({ user_id, star_group, rank: Number(rank), opened }))),
    saved_team_members: Object.entries(account.saved).flatMap(([team, saved]) => saved.team.map((character, slot) => ({ user_id, team: Number(team), slot, character, aspect: saved.aspects[character] ?? null }))),
    auditions: Object.entries(account.auditions).map(([character, opened]) => ({ user_id, character, slot: opened.slot, opened_at: opened.openedAt })),
    saved_team_relics: Object.entries(account.saved).flatMap(([team, saved]) => Object.entries(saved.relics).flatMap(([character, slots]) => Object.entries(slots).map(([slot, relic]) => ({ user_id, team: Number(team), character, slot, relic }))))
  }
}

/** The account the rows of one player describe, or `undefined` when they hold none. */
export const fromRows = (rows: AccountRows): AccountRecord | undefined => {
  const row = rows.accounts[0]
  if (row === undefined) return undefined
  const team = [...rows.team_members].sort((a, b) => a.slot - b.slot)
  // Quests and chests by rank.
  const quests: Record<string, Record<string, AccountRecord["quests"][string][string]>> = {}
  for (const quest of rows.quests) {
    const stars = rows.quest_stars.filter((star) => star.quest === quest.quest && star.rank === quest.rank).map((star) => star.star).sort((a, b) => a - b)
    quests[quest.quest] = { ...quests[quest.quest], [quest.rank]: { attempts: quest.attempts, clears: quest.clears, firstClearedAt: quest.first_cleared_at, stars, ...(quest.perfect_at === null ? {} : { perfectAt: quest.perfect_at }) } }
  }
  const chests: Record<string, Record<string, number>> = {}
  for (const chest of rows.chests) chests[chest.star_group] = { ...chests[chest.star_group], [chest.rank]: chest.opened }
  const hardcore: Record<string, Record<string, AccountRecord["hardcore"][string][string]>> = {}
  for (const tier of rows.tiers) {
    hardcore[tier.track] = {
      ...hardcore[tier.track],
      [tier.tier]: {
        attempts: tier.attempts,
        clears: tier.clears,
        firstClearedAt: tier.first_cleared_at,
        ...(tier.best_wave === null ? {} : { bestWave: tier.best_wave })
      }
    }
  }
  return {
    id: row.user_id,
    createdAt: row.created_at,
    totals: { runs: row.runs, clears: row.clears, kills: row.kills, secondsPlayed: row.seconds_played },
    wallet: Object.fromEntries(rows.balances.map((balance) => [balance.resource, balance.amount])),
    owned: {
      characters: Object.fromEntries(rows.characters.map((owned) => [owned.character, { unlockedAt: owned.unlocked_at, experience: owned.experience, ascension: owned.ascension }])),
      aspects: Object.fromEntries(rows.aspects.map((owned) => [owned.aspect, { unlockedAt: owned.unlocked_at }])),
      relics: Object.fromEntries(rows.relics.map((owned) => [owned.relic, { unlockedAt: owned.unlocked_at, tier: owned.tier }])),
      cosmetics: Object.fromEntries(rows.cosmetics.map((owned) => [owned.cosmetic, { unlockedAt: owned.unlocked_at }]))
    },
    quests,
    hardcore,
    discoveries: Object.fromEntries(rows.discoveries.map((discovery) => [discovery.discovery, { madeAt: discovery.made_at }])),
    chests,
    selection: {
      team: team.map((member) => member.character),
      aspects: Object.fromEntries(team.flatMap((member) => (member.aspect === null ? [] : [[member.character, member.aspect]]))),
      relics: grouped(rows.team_relics.map((row) => [row.character, row.slot, row.relic])),
      play:
        row.play_kind === "quest"
          ? { kind: "quest", quest: row.play_quest ?? "", ...(row.play_rank === null ? {} : { rank: row.play_rank }) }
          : { kind: "tier", track: row.play_track ?? "", tier: row.play_tier ?? 1 }
    },
    worn: grouped(rows.worn_cosmetics.map((row) => [row.character, row.kind, row.cosmetic])),
    saved: savedFrom(rows),
    auditions: Object.fromEntries(rows.auditions.map((row) => [row.character, { slot: row.slot, openedAt: row.opened_at }]))
  }
}

/** The saved teams in `rows`, by slot: members in order, with their aspects and relics. */
const savedFrom = (rows: AccountRows): AccountRecord["saved"] => {
  const saved: Record<string, { team: Array<string>; aspects: Record<string, string>; relics: Record<string, Record<string, string>> }> = {}
  for (const member of [...rows.saved_team_members].sort((a, b) => a.slot - b.slot)) {
    const team = (saved[member.team] ??= { team: [], aspects: {}, relics: {} })
    team.team.push(member.character)
    if (member.aspect !== null) team.aspects[member.character] = member.aspect
  }
  for (const relic of rows.saved_team_relics) {
    const team = saved[relic.team]
    if (team !== undefined) team.relics[relic.character] = { ...team.relics[relic.character], [relic.slot]: relic.relic }
  }
  return saved
}

/** `[outer, inner, value]` triples as a record of records. */
const grouped = (triples: ReadonlyArray<readonly [string, string, string]>): Record<string, Record<string, string>> => {
  const out: Record<string, Record<string, string>> = {}
  for (const [outer, inner, value] of triples) out[outer] = { ...out[outer], [inner]: value }
  return out
}
