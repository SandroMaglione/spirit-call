/**
 * The account's tables (see `migrations/`), row by row: a Schema for each
 * table's rows (every row read is decoded with it), and the account as rows
 * and back. Rows hold content ids as strings; which still name content is
 * checked when the account is read (`fromRecord`).
 */
import * as Schema from "effect/Schema"

import type { AccountRecord, StoredCallResult } from "../account/convert.ts"

const Text = Schema.String
const Int = Schema.Number
const OptionalInt = Schema.NullOr(Schema.Number)

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
  calls_since_aspect: Int,
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
  team_members: { row: Schema.Struct({ user_id: Text, slot: Int, character: Text, aspect: Schema.NullOr(Text) }), key: ["slot"] },
  quests: { row: Schema.Struct({ user_id: Text, quest: Text, rank: Int, attempts: Int, clears: Int, first_cleared_at: OptionalInt }), key: ["quest", "rank"] },
  quest_stars: { row: Schema.Struct({ user_id: Text, quest: Text, rank: Int, star: Int }), key: ["quest", "rank", "star"] },
  tiers: {
    row: Schema.Struct({ user_id: Text, track: Text, tier: Int, attempts: Int, clears: Int, first_cleared_at: OptionalInt, rewarded_period: OptionalInt, best_wave: OptionalInt }),
    key: ["track", "tier"]
  },
  discoveries: { row: Schema.Struct({ user_id: Text, discovery: Text, made_at: Int }), key: ["discovery"] },
  chests: { row: Schema.Struct({ user_id: Text, star_group: Text, rank: Int, opened: Int }), key: ["star_group", "rank"] },
  call_focus: { row: Schema.Struct({ user_id: Text, banner: Text, character: Text }), key: ["banner"] },
  calls: { row: Schema.Struct({ user_id: Text, place: Int, at: Int, banner: Text, kind: Schema.Literals(["character", "aspect", "supply"]), item: Schema.NullOr(Text) }), key: ["place"] },
  call_amounts: { row: Schema.Struct({ user_id: Text, place: Int, resource: Text, amount: Int }), key: ["place", "resource"] }
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
        experience: account.experience,
        runs: account.totals.runs,
        clears: account.totals.clears,
        kills: account.totals.kills,
        seconds_played: account.totals.secondsPlayed,
        call_seed: account.calls.seed,
        calls_since_character: account.calls.sinceCharacter,
        calls_since_aspect: account.calls.sinceAspect,
        first_character_called: account.calls.firstCharacter ? 1 : 0,
        play_kind: play.kind,
        play_quest: play.kind === "quest" ? play.quest : null,
        play_rank: play.kind === "quest" ? (play.rank ?? null) : null,
        play_track: play.kind === "tier" ? play.track : null,
        play_tier: play.kind === "tier" ? play.tier : null
      }
    ],
    balances: Object.entries(account.wallet).map(([resource, amount]) => ({ user_id, resource, amount })),
    characters: Object.entries(account.owned.characters).map(([character, owned]) => ({ user_id, character, unlocked_at: owned.unlockedAt, experience: owned.experience, ascension: owned.ascension })),
    aspects: Object.entries(account.owned.aspects).map(([aspect, owned]) => ({ user_id, aspect, unlocked_at: owned.unlockedAt, copies: owned.copies })),
    team_members: account.selection.team.map((character, slot) => ({ user_id, slot, character, aspect: account.selection.aspects[character] ?? null })),
    quests: Object.entries(account.quests).flatMap(([quest, ranks]) => Object.entries(ranks).map(([rank, progress]) => ({ user_id, quest, rank: Number(rank), attempts: progress.attempts, clears: progress.clears, first_cleared_at: progress.firstClearedAt }))),
    quest_stars: Object.entries(account.quests).flatMap(([quest, ranks]) => Object.entries(ranks).flatMap(([rank, progress]) => progress.stars.map((star) => ({ user_id, quest, rank: Number(rank), star })))),
    tiers: Object.entries(account.hardcore).flatMap(([track, tiers]) =>
      Object.entries(tiers).map(([tier, progress]) => ({
        user_id,
        track,
        tier: Number(tier),
        attempts: progress.attempts,
        clears: progress.clears,
        first_cleared_at: progress.firstClearedAt,
        rewarded_period: progress.rewardedPeriod,
        best_wave: progress.bestWave ?? null
      }))
    ),
    discoveries: Object.entries(account.discoveries).map(([discovery, made]) => ({ user_id, discovery, made_at: made.madeAt })),
    chests: Object.entries(account.chests).flatMap(([star_group, ranks]) => Object.entries(ranks).map(([rank, opened]) => ({ user_id, star_group, rank: Number(rank), opened }))),
    call_focus: Object.entries(account.calls.focus).map(([banner, character]) => ({ user_id, banner, character })),
    calls: account.calls.history.map((call, place) => ({ user_id, place, at: call.at, banner: call.banner, kind: call.result.kind, item: call.result.kind === "supply" ? null : call.result.id })),
    call_amounts: account.calls.history.flatMap((call, place) =>
      call.result.kind === "supply" ? Object.entries(call.result.amounts).map(([resource, amount]) => ({ user_id, place, resource, amount })) : []
    )
  }
}

/** The account the rows of one player describe, or `undefined` when they hold none. */
export const fromRows = (rows: AccountRows): AccountRecord | undefined => {
  const row = rows.accounts[0]
  if (row === undefined) return undefined
  const byPlace = new Map<number, Record<string, number>>()
  for (const amount of rows.call_amounts) byPlace.set(amount.place, { ...byPlace.get(amount.place), [amount.resource]: amount.amount })
  const resultOf = (call: RowOf<"calls">): StoredCallResult | undefined => {
    if (call.kind === "supply") return { kind: "supply", amounts: byPlace.get(call.place) ?? {} }
    return call.item === null ? undefined : { kind: call.kind, id: call.item }
  }
  const history = [...rows.calls]
    .sort((a, b) => a.place - b.place)
    .flatMap((call) => {
      const result = resultOf(call)
      return result === undefined ? [] : [{ at: call.at, banner: call.banner, result }]
    })
  const team = [...rows.team_members].sort((a, b) => a.slot - b.slot)
  // Quests and chests by rank.
  const quests: Record<string, Record<string, AccountRecord["quests"][string][string]>> = {}
  for (const quest of rows.quests) {
    const stars = rows.quest_stars.filter((star) => star.quest === quest.quest && star.rank === quest.rank).map((star) => star.star).sort((a, b) => a - b)
    quests[quest.quest] = { ...quests[quest.quest], [quest.rank]: { attempts: quest.attempts, clears: quest.clears, firstClearedAt: quest.first_cleared_at, stars } }
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
        rewardedPeriod: tier.rewarded_period,
        ...(tier.best_wave === null ? {} : { bestWave: tier.best_wave })
      }
    }
  }
  return {
    id: row.user_id,
    createdAt: row.created_at,
    experience: row.experience,
    totals: { runs: row.runs, clears: row.clears, kills: row.kills, secondsPlayed: row.seconds_played },
    wallet: Object.fromEntries(rows.balances.map((balance) => [balance.resource, balance.amount])),
    owned: {
      characters: Object.fromEntries(rows.characters.map((owned) => [owned.character, { unlockedAt: owned.unlocked_at, experience: owned.experience, ascension: owned.ascension }])),
      aspects: Object.fromEntries(rows.aspects.map((owned) => [owned.aspect, { unlockedAt: owned.unlocked_at, copies: owned.copies }]))
    },
    quests,
    hardcore,
    discoveries: Object.fromEntries(rows.discoveries.map((discovery) => [discovery.discovery, { madeAt: discovery.made_at }])),
    chests,
    calls: {
      seed: row.call_seed,
      sinceCharacter: row.calls_since_character,
      sinceAspect: row.calls_since_aspect,
      firstCharacter: row.first_character_called === 1,
      focus: Object.fromEntries(rows.call_focus.map((focus) => [focus.banner, focus.character])),
      history
    },
    selection: {
      team: team.map((member) => member.character),
      aspects: Object.fromEntries(team.flatMap((member) => (member.aspect === null ? [] : [[member.character, member.aspect]]))),
      play:
        row.play_kind === "quest"
          ? { kind: "quest", quest: row.play_quest ?? "", ...(row.play_rank === null ? {} : { rank: row.play_rank }) }
          : { kind: "tier", track: row.play_track ?? "", tier: row.play_tier ?? 1 }
    }
  }
}
