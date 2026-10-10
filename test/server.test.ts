import { mkdtempSync, readFileSync } from "node:fs"
import { tmpdir } from "node:os"
import path from "node:path"
import { DatabaseSync } from "node:sqlite"
import * as Schema from "effect/Schema"
import { afterEach, describe, expect, it, vi } from "vitest"

import { createAccount, recordRun, withEarnedChests } from "../src/account/account.ts"
import type { Account as AccountValue, Play } from "../src/account/account.ts"
import { fromRecord, toRecord } from "../src/account/convert.ts"
import { Account, Earned } from "../src/api/schemas.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
import type { QuestId } from "../src/content/quests.ts"
import { noTally } from "../src/content/stars.ts"
import { localHandler } from "../src/server/local.ts"
import { fromRows, toRows } from "../src/server/rows.ts"

type Handler = ReturnType<typeof localHandler>
const opened: Array<Handler> = []
afterEach(() => Promise.all(opened.splice(0).map((handler) => handler.dispose())))

/** A server over a fresh in-memory database. */
const server = (config = { devTools: false, secureCookies: true }) => {
  const handler = localHandler(":memory:", config)
  opened.push(handler)
  return handler
}

/** A player's browser on `handler`: it keeps the session cookie the server sets, as a browser would. */
const browser = (handler: Handler) => {
  let cookie: string | undefined
  const send = async (method: string, path: string, body?: unknown) => {
    const response = await handler.handler(
      new Request(`https://game.test${path}`, {
        method,
        headers: { ...(body === undefined ? {} : { "content-type": "application/json" }), ...(cookie === undefined ? {} : { cookie }) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) })
      })
    )
    const set = response.headers.get("set-cookie")
    if (set !== null) cookie = set.split(";")[0]!.endsWith("=") ? undefined : set.split(";")[0]
    const text = await response.text()
    return { status: response.status, body: text === "" ? undefined : JSON.parse(text), setCookie: set }
  }
  return { send, cookie: () => cookie }
}

const signUp = async (handler: Handler, username = "stella", password = "correct horse") => {
  const player = browser(handler)
  const response = await player.send("POST", "/api/users", { username, password })
  expect(response.status).toBe(201)
  return player
}

const run = { cleared: true, challenge: "swarm", progress: 1, wave: 6, kills: 40, time: 200, team: ["swordsman"], reactions: [], tally: noTally }
const log = {
  waves: [{ wave: 1, startedAt: 3, hitsTaken: 2, damageTaken: 14 }, { wave: 2, startedAt: 40, hitsTaken: 1, damageTaken: 9 }],
  hurts: [{ enemy: "chaser", attack: "swipe", hits: 2, damage: 14 }, { enemy: null, attack: null, hits: 0, damage: 9 }],
  members: [{ character: "swordsman", damageDealt: 900, damageTaken: 23, kills: 40 }],
  skills: [{ character: "swordsman", skill: "bladeWave", uses: 4, hits: 11, damage: 300 }],
  knockouts: [],
  dashes: 12,
  switches: 0
}
const played = (play: unknown = { kind: "quest", quest: "firstBlood" }, result: unknown = run) => ({ play, result, log })

describe("players", () => {
  it("signs up with a free username, logged in at once with an HTTP-only session cookie", async () => {
    const handler = server()
    const player = await signUp(handler)
    expect(player.cookie()).toMatch(/^session=/)
    const current = await player.send("GET", "/api/sessions/current")
    expect(current).toMatchObject({ status: 200, body: { username: "stella" } })
  })

  it("sets the cookie HTTP-only and Secure on HTTPS, and only HTTP-only over a laptop's plain HTTP", async () => {
    const secure = await browser(server()).send("POST", "/api/users", { username: "stella", password: "correct horse" })
    expect(secure.setCookie).toMatch(/HttpOnly/)
    expect(secure.setCookie).toMatch(/Secure/)
    const local = await browser(server({ devTools: true, secureCookies: false })).send("POST", "/api/users", { username: "stella", password: "correct horse" })
    expect(local.setCookie).toMatch(/HttpOnly/)
    expect(local.setCookie).not.toMatch(/Secure/)
  })

  it("refuses a username taken (whatever its case), and a bad username or short password", async () => {
    const handler = server()
    await signUp(handler)
    expect((await browser(handler).send("POST", "/api/users", { username: "STELLA", password: "another one" })).body).toMatchObject({ _tag: "UsernameTaken" })
    expect((await browser(handler).send("POST", "/api/users", { username: "a b", password: "correct horse" })).status).toBe(400)
    expect((await browser(handler).send("POST", "/api/users", { username: "nova", password: "short" })).status).toBe(400)
  })

  it("logs in with the right password only, and logs out", async () => {
    const handler = server()
    await signUp(handler)
    const wrong = await browser(handler).send("POST", "/api/sessions", { username: "stella", password: "wrong password" })
    expect(wrong).toMatchObject({ status: 401, body: { _tag: "WrongCredentials" } })
    const player = browser(handler)
    expect((await player.send("POST", "/api/sessions", { username: "Stella", password: "correct horse" })).status).toBe(200)
    expect((await player.send("GET", "/api/account")).status).toBe(200)
    expect((await player.send("DELETE", "/api/sessions/current")).status).toBe(204)
    expect(player.cookie()).toBeUndefined()
    expect((await player.send("GET", "/api/account")).status).toBe(401)
  })

  it("gives a recovery code once at sign-up, which sets a new password, closes every session, and is replaced", async () => {
    const handler = server()
    const stella = browser(handler)
    const made = await stella.send("POST", "/api/users", { username: "stella", password: "correct horse" })
    const code: string = made.body.recoveryCode
    expect(code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/)
    // A wrong code changes nothing.
    expect(await browser(handler).send("POST", "/api/recovery", { username: "stella", code: "AAAA-BBBB-CCCC-DDDD", password: "new password" })).toMatchObject({ status: 401, body: { _tag: "WrongCredentials" } })
    // The code as typed: lower case and spaced is the same code.
    const recovered = await browser(handler).send("POST", "/api/recovery", { username: "stella", code: code.toLowerCase().replaceAll("-", " "), password: "new password" })
    expect(recovered.status).toBe(200)
    expect(recovered.body.recoveryCode).not.toBe(code)
    // The old session is closed, the old password and code no longer work, the new password does.
    expect((await stella.send("GET", "/api/account")).status).toBe(401)
    expect((await browser(handler).send("POST", "/api/sessions", { username: "stella", password: "correct horse" })).status).toBe(401)
    expect((await browser(handler).send("POST", "/api/recovery", { username: "stella", code, password: "another one" })).status).toBe(401)
    expect((await browser(handler).send("POST", "/api/sessions", { username: "stella", password: "new password" })).status).toBe(200)
  })

  it("refuses too many attempts from one address in a while", async () => {
    const handler = server()
    await signUp(handler)
    const tries = Array.from({ length: 21 }, () => () => browser(handler).send("POST", "/api/sessions", { username: "stella", password: "wrong password" }))
    const statuses = await tries.reduce<Promise<Array<number>>>((before, next) => before.then(async (all) => [...all, (await next()).status]), Promise.resolve([]))
    expect(statuses.slice(0, 20).every((status) => status === 401)).toBe(true)
    expect(statuses[20]).toBe(429)
  })

  it("answers the account only to a session", async () => {
    const handler = server()
    expect((await browser(handler).send("GET", "/api/account")).status).toBe(401)
    const forged = await handler.handler(new Request("https://game.test/api/account", { headers: { cookie: "session=forged" } }))
    expect(forged.status).toBe(401)
  })
})

describe("accounts", () => {
  it("starts a player over with a new account once accounts are reset, keeping the login", async () => {
    const file = path.join(mkdtempSync(path.join(tmpdir(), "accounts-")), "reset.sqlite")
    const handler = localHandler(file, { devTools: false, secureCookies: true })
    opened.push(handler)
    const player = await signUp(handler)
    expect((await player.send("POST", "/api/runs", played())).status).toBe(200)
    expect((await player.send("GET", "/api/account")).body.quests.firstBlood).toBeDefined()
    // The one-time reset (migrations/0003), run on the database as a deploy would.
    const database = new DatabaseSync(file)
    database.exec(readFileSync(new URL("../src/server/migrations/0003_reset_accounts.sql", import.meta.url), "utf8"))
    database.close()
    const after = await player.send("GET", "/api/account")
    expect(after.status).toBe(200)
    expect(after.body.quests).toEqual({})
    expect(after.body.selection).toEqual({ team: ["swordsman"], aspects: {}, relics: {}, play: { kind: "quest", quest: "firstBlood" } })
  })

  it("keeps an account's side quest chests across their changes of pace (every 6, every 3, every 6 again), so none is paid twice", () => {
    const migration = (name: string) => readFileSync(new URL(`../src/server/migrations/${name}`, import.meta.url), "utf8")
    const database = new DatabaseSync(":memory:")
    for (const name of ["0001_accounts.sql", "0002_logs.sql", "0003_reset_accounts.sql", "0004_quest_ranks.sql", "0005_relics.sql"]) database.exec(migration(name))
    database.exec(`INSERT INTO users VALUES ('u', 'stella', 'hash', 'salt', 0)`)
    database.exec(`INSERT INTO chests VALUES ('u', 'secondary', 1, 1), ('u', 'secondary', 2, 3), ('u', 'one', 1, 2)`)
    // Every 3 stars: two for each opened every 6.
    database.exec(migration("0006_star_goals.sql"))
    const opened = () => database.prepare(`SELECT star_group, rank, opened FROM chests ORDER BY star_group, rank`).all()
    expect(opened()).toEqual([{ star_group: "one", rank: 1, opened: 2 }, { star_group: "secondary", rank: 1, opened: 2 }, { star_group: "secondary", rank: 2, opened: 6 }])
    // Every 6 again: one for every two, and all seven opened count all four.
    database.exec(`INSERT INTO chests VALUES ('u', 'secondary', 3, 7)`)
    database.exec(migration("0007_side_chests.sql"))
    expect(opened()).toEqual([{ star_group: "one", rank: 1, opened: 2 }, { star_group: "secondary", rank: 1, opened: 1 }, { star_group: "secondary", rank: 2, opened: 3 }, { star_group: "secondary", rank: 3, opened: 4 }])
    database.close()
    expect(defaultTuning.chests.secondary.map((chest) => chest.stars)).toEqual([6, 12, 18, 24])
    // With 9 of its stars, an account that had opened the one at 6 opens nothing again, and the one at 12 waits for its 12th.
    const side = (Object.keys(defaultTuning.quests) as Array<QuestId>).filter((id) => defaultTuning.quests[id].line === "secondary")
    const all = { 1: { attempts: 1, clears: 1, firstClearedAt: 1, stars: [0, 1, 2] } }
    const starred: AccountValue = { ...createAccount(defaultTuning, newAccount, "stella", 0), chests: { secondary: { 1: 1 } }, quests: { [side[0]!]: all, [side[1]!]: all, [side[2]!]: all } }
    expect(withEarnedChests(defaultTuning, starred).opened).toEqual([])
  })

  it("gives a new player the starter set, the same account on every device", async () => {
    const handler = server()
    const phone = await signUp(handler)
    const account = (await phone.send("GET", "/api/account")).body
    expect(Object.keys(account.owned.characters)).toEqual(newAccount.characters)
    expect(account.selection).toEqual({ team: ["swordsman"], aspects: {}, relics: {}, play: { kind: "quest", quest: "firstBlood" } })
    const laptop = browser(handler)
    await laptop.send("POST", "/api/sessions", { username: "stella", password: "correct horse" })
    expect((await laptop.send("GET", "/api/account")).body).toEqual(account)
  })

  it("keeps each player's account apart", async () => {
    const handler = server()
    const stella = await signUp(handler, "stella")
    const nova = await signUp(handler, "nova")
    await stella.send("POST", "/api/runs", played())
    expect((await stella.send("GET", "/api/account")).body.quests.firstBlood).toBeDefined()
    expect((await nova.send("GET", "/api/account")).body.quests.firstBlood).toBeUndefined()
  })

  it("records a run: pays it, gives a first clear's rewards, and keeps them", async () => {
    const handler = server()
    const player = await signUp(handler)
    const recorded = await player.send("POST", "/api/runs", played())
    expect(recorded.status).toBe(200)
    expect(recorded.body.earned.rewards).toEqual(defaultTuning.quests.firstBlood.rewards)
    const account = (await player.send("GET", "/api/account")).body
    expect(account).toEqual(recorded.body.account)
    expect(account.quests.firstBlood?.["1"]).toMatchObject({ attempts: 1, clears: 1 })
    expect(account.totals).toMatchObject({ runs: 1, clears: 1, kills: 40 })
    expect(account.wallet.gold).toBeGreaterThan(0)
  })

  it("answers a run with exactly what the game works out by the same rules before it answers", async () => {
    // The game shows a run's rewards at once (see app/saves.ts): they must be the server's, to the last coin.
    const start = Date.now()
    vi.useFakeTimers({ toFake: ["Date"] })
    try {
      const player = await signUp(server())
      const first = Schema.decodeUnknownSync(Account)((await player.send("GET", "/api/account")).body)
      const lost = { ...run, cleared: false, progress: 0.4, wave: 3, kills: 12, tally: { ...noTally, hitsTaken: 9 } }
      const runs: ReadonlyArray<readonly [Play, typeof run]> = [
        [{ kind: "quest", quest: "firstBlood" }, run],
        [{ kind: "quest", quest: "firstBlood" }, { ...run, tally: { ...noTally, perfectDodges: 4 } }],
        [{ kind: "quest", quest: "theSwarm" }, lost],
        [{ kind: "quest", quest: "theSwarm" }, { ...run, challenge: "swarm" }]
      ]
      // One after another, each on the account the one before left.
      await runs.reduce(async (previous, [play, result], index) => {
        const account = await previous
        const now = start + (index + 1) * 60_000
        vi.setSystemTime(now)
        const local = recordRun(defaultTuning, account, play, result as never, now)
        const answer = (await player.send("POST", "/api/runs", played(play, result))).body
        expect(Schema.encodeSync(Earned)(local.earned)).toEqual(answer.earned)
        expect(Schema.encodeSync(Account)(local.account)).toEqual(answer.account)
        return Schema.decodeUnknownSync(Account)(answer.account)
      }, Promise.resolve(first))
    } finally {
      vi.useRealTimers()
    }
  })

  it("selects a team of owned characters, and refuses one it does not own, changing nothing", async () => {
    const handler = server({ devTools: true, secureCookies: true })
    const player = await signUp(handler)
    const refused = await player.send("PUT", "/api/account/selection", { team: ["swordsman", "gunner"], play: { kind: "quest", quest: "firstBlood" } })
    expect(refused).toMatchObject({ status: 409, body: { _tag: "Refused", kind: "notOwned" } })
    await player.send("POST", "/api/runs", played())
    await player.send("POST", "/api/dev/unlock-everything")
    const selected = await player.send("PUT", "/api/account/selection", { team: ["gunner", "swordsman"], play: { kind: "quest", quest: "crossfire" } })
    expect(selected.status).toBe(200)
    expect((await player.send("GET", "/api/account")).body.selection).toEqual({ team: ["gunner", "swordsman"], aspects: {}, relics: {}, play: { kind: "quest", quest: "crossfire" } })
  })

  it("trains with gold, and refuses without enough", async () => {
    const handler = server()
    const player = await signUp(handler)
    expect((await player.send("POST", "/api/characters/swordsman/training")).body).toMatchObject({ _tag: "Refused", kind: "notEnough" })
    await player.send("POST", "/api/runs", played())
    const before = (await player.send("GET", "/api/account")).body
    const trained = await player.send("POST", "/api/characters/swordsman/training")
    expect(trained.status).toBe(200)
    expect(trained.body.owned.characters.swordsman.experience).toBeGreaterThan(before.owned.characters.swordsman.experience)
    expect(trained.body.wallet.gold).toBeLessThan(before.wallet.gold)
  })

  it("refuses ids that name no content", async () => {
    const handler = server()
    const player = await signUp(handler)
    expect((await player.send("POST", "/api/characters/wizard/training")).status).toBe(400)
    expect((await player.send("POST", "/api/runs", played(null, { ...run, team: ["wizard"] }))).status).toBe(400)
  })

  it("keeps the calls that remain when relics and supplies leave the Call, and one count since the last rare thing", () => {
    const migration = (name: string) => readFileSync(new URL(`../src/server/migrations/${name}`, import.meta.url), "utf8")
    const database = new DatabaseSync(":memory:")
    for (const name of ["0001_accounts.sql", "0002_logs.sql", "0003_reset_accounts.sql", "0004_quest_ranks.sql", "0005_relics.sql", "0006_star_goals.sql", "0007_side_chests.sql"]) database.exec(migration(name))
    database.exec(`INSERT INTO users VALUES ('u', 'stella', 'hash', 'salt', 0)`)
    database.exec(`INSERT INTO accounts (user_id, created_at, experience, runs, clears, kills, seconds_played, call_seed, calls_since_character, calls_since_aspect, calls_since_relic, first_character_called, play_kind, play_quest) VALUES ('u', 0, 0, 0, 0, 0, 0, 7, 3, 5, 2, 0, 'quest', 'firstBlood')`)
    database.exec(`INSERT INTO calls VALUES ('u', 0, 1, 'stormAndStone', 'supply', NULL, NULL), ('u', 1, 1, 'stormAndStone', 'relic', 'echo', 2), ('u', 2, 1, 'stormAndStone', 'aspect', 'arc', NULL), ('u', 3, 1, 'stormAndStone', 'character', 'stormcaller', NULL)`)
    database.exec(`INSERT INTO call_amounts VALUES ('u', 0, 'gold', 400), ('u', 0, 'fireEssence', 6)`)
    database.exec(migration("0008_call_tiers.sql"))
    database.exec(migration("0009_perfect_clears.sql"))
    expect(database.prepare(`SELECT calls_since_character, calls_since_rare FROM accounts`).all()).toEqual([{ calls_since_character: 3, calls_since_rare: 5 }])
    expect(database.prepare(`SELECT place, kind, item FROM calls ORDER BY place`).all()).toEqual([{ place: 2, kind: "aspect", item: "arc" }, { place: 3, kind: "character", item: "stormcaller" }])
    expect(database.prepare(`SELECT count(*) AS n FROM call_amounts`).all()).toEqual([{ n: 0 }])
    expect(() => database.exec(`INSERT INTO calls VALUES ('u', 4, 1, 'stormAndStone', 'relic', 'echo')`)).toThrow()
    database.exec(`INSERT INTO calls VALUES ('u', 4, 1, 'stormAndStone', 'sigils', NULL)`)
    database.close()
  })

  it("saves a team to load in a tap, refusing a slot there is not or a team it does not own", async () => {
    const player = await signUp(server())
    const team = { team: ["swordsman"], aspects: {}, relics: {} }
    const saved = await player.send("PUT", "/api/account/teams/2", { team })
    expect(saved.status).toBe(200)
    expect((await player.send("GET", "/api/account")).body.saved).toEqual({ 2: team })
    expect(await player.send("PUT", "/api/account/teams/4", { team })).toMatchObject({ status: 409, body: { kind: "badSlot" } })
    expect(await player.send("PUT", "/api/account/teams/1", { team: { ...team, team: ["gunner"] } })).toMatchObject({ status: 409, body: { kind: "notOwned" } })
    expect((await player.send("PUT", "/api/account/teams/2", { team: null })).body.saved).toEqual({})
  })

  it("plays an audition: the character invited, lent alone, and the account's once its last part is cleared", async () => {
    const player = await signUp(server())
    const audition = defaultTuning.tracks.gunnerAudition
    // Auditions open after the end of chapter two: clear the main line up to it, invite someone, then play the three parts, in order.
    const main = (Object.keys(defaultTuning.quests) as Array<QuestId>).filter((quest) => defaultTuning.quests[quest].line === "main")
    const upTo = main.slice(0, main.indexOf(audition.tiers[0]!.opens) + 1)
    const send = (runs: ReadonlyArray<unknown>) => runs.reduce<Promise<Array<number>>>((before, body) => before.then(async (statuses) => [...statuses, (await player.send("POST", "/api/runs", body)).status]), Promise.resolve([]))
    expect((await send(upTo.map((quest) => played({ kind: "quest", quest })))).every((status) => status === 200)).toBe(true)
    // The end of chapter two gives an invitation: spent on the Gunner, her audition opens at the first slot.
    expect(await player.send("POST", "/api/characters/sparkfist/audition")).toMatchObject({ status: 200, body: { auditions: { sparkfist: { slot: 1 } } } })
    expect(await player.send("POST", "/api/characters/gunner/audition")).toMatchObject({ status: 409, body: { kind: "notEnough" } })
    expect(await player.send("POST", "/api/characters/swordsman/audition")).toMatchObject({ status: 409, body: { kind: "badAudition" } })
    const parts = [1, 2, 3].map((tier) => played({ kind: "tier", track: "sparkfistAudition", tier }, { ...run, team: ["sparkfist"], challenge: defaultTuning.tracks.sparkfistAudition.tiers[tier - 1]!.challenge }))
    expect((await send(parts)).every((status) => status === 200)).toBe(true)
    const account = (await player.send("GET", "/api/account")).body
    expect(account.owned.characters.sparkfist).toBeDefined()
    expect(account.owned.aspects.flurry).toBeDefined()
  })

  it("answers the dev tools only where they are on", async () => {
    const off = await signUp(server())
    expect((await off.send("POST", "/api/dev/unlock-everything")).status).toBe(404)
    const on = await signUp(server({ devTools: true, secureCookies: true }))
    const unlocked = await on.send("POST", "/api/dev/unlock-everything")
    expect(Object.keys(unlocked.body.owned.characters)).toEqual(expect.arrayContaining(Object.keys(defaultTuning.characters)))
  })
})

describe("logs", () => {
  it("keeps each run with its log, and the team as it was, for its player only", async () => {
    const handler = server({ devTools: true, secureCookies: true })
    const player = await signUp(handler)
    await player.send("POST", "/api/characters/swordsman/training")
    expect((await player.send("POST", "/api/runs", played())).status).toBe(200)
    const runs = (await player.send("GET", "/api/runs")).body
    expect(runs).toHaveLength(1)
    expect(runs[0]).toMatchObject({
      play: { kind: "quest", quest: "firstBlood" },
      challenge: "swarm",
      enemyLevel: defaultTuning.quests.firstBlood.enemyLevel,
      team: [{ character: "swordsman", level: 1, aspect: null }],
      cleared: true,
      wave: 6,
      seconds: 200,
      log
    })
    expect((await player.send("GET", `/api/runs?since=${runs[0].at}`)).body).toEqual([])
    const other = await signUp(handler, "nova")
    expect((await other.send("GET", "/api/runs")).body).toEqual([])
  })

  it("keeps every change to the account with what it gained and spent, but nothing refused", async () => {
    const handler = server({ devTools: true, secureCookies: true })
    const player = await signUp(handler)
    await player.send("POST", "/api/characters/swordsman/training")
    await player.send("POST", "/api/runs", played())
    await player.send("POST", "/api/characters/swordsman/training")
    const events = (await player.send("GET", "/api/account/events")).body
    expect(events.map((event: { action: string }) => event.action)).toEqual(["run", "train"])
    const [ran, trained] = events
    expect(ran.subject).toBe((await player.send("GET", "/api/runs")).body[0].id)
    expect(ran.amounts.gold).toBeGreaterThan(0)
    expect(trained).toMatchObject({ subject: "swordsman" })
    expect(trained.amounts.gold).toBeLessThan(0)
  })
})

describe("relics and looks on the server", () => {
  it("wears a look, and equips relics in the team", async () => {
    const handler = server({ devTools: true, secureCookies: true })
    const player = await signUp(handler)
    await player.send("POST", "/api/dev/unlock-everything")
    const account = (await player.send("GET", "/api/account")).body
    expect(account.owned.relics.echo).toMatchObject({ tier: 3 })
    // There is no shop: nothing is sold.
    expect((await player.send("POST", "/api/shop/looks/starfall")).status).toBe(404)
    // Relics open after chapter one.
    await (["firstBlood", "crossfire", "packLeader"] as const).reduce<Promise<unknown>>((before, quest) => before.then(() => player.send("POST", "/api/runs", played({ kind: "quest", quest }))), Promise.resolve())
    const worn = await player.send("PUT", "/api/characters/gunner/looks/tint", { cosmetic: "blueFlame" })
    expect(worn.status).toBe(200)
    expect(worn.body.worn).toEqual({ gunner: { tint: "blueFlame" } })
    expect(await player.send("PUT", "/api/characters/swordsman/looks/tint", { cosmetic: "blueFlame" })).toMatchObject({ status: 409, body: { kind: "badLook" } })
    const selected = await player.send("PUT", "/api/account/selection", { team: ["gunner", "swordsman"], play: { kind: "quest", quest: "firstBlood" }, relics: { gunner: { strike: "echo", element: "emberHeart" }, swordsman: { dash: "repel" } } })
    expect(selected.status).toBe(200)
    expect((await player.send("GET", "/api/account")).body.selection.relics).toEqual({ gunner: { strike: "echo", element: "emberHeart" }, swordsman: { dash: "repel" } })
    const twice = await player.send("PUT", "/api/account/selection", { team: ["gunner", "swordsman"], play: { kind: "quest", quest: "firstBlood" }, relics: { gunner: { strike: "echo" }, swordsman: { strike: "echo" } } })
    expect(twice).toMatchObject({ status: 409, body: { kind: "badRelics" } })
    // A run keeps who played it with what relics, at their tier.
    await player.send("POST", "/api/runs", played({ kind: "quest", quest: "firstBlood" }, { ...run, team: ["gunner", "swordsman"] }))
    const kept = (await player.send("GET", "/api/runs")).body.at(-1)
    expect(kept.team[0].relics).toEqual([{ slot: "strike", id: "echo", tier: 3 }, { slot: "element", id: "emberHeart", tier: 3 }])
    expect(kept.team[1].relics).toEqual([{ slot: "dash", id: "repel", tier: 3 }])
  })
})

describe("account rows", () => {
  const account = fromRecord(defaultTuning, newAccount, toRecord(fromRecord(defaultTuning, newAccount, {
    id: "player",
    createdAt: 5,
    totals: { runs: 3, clears: 2, kills: 90, secondsPlayed: 410.5 },
    wallet: { gold: 300, fireEssence: 2, refinedEssence: 4 },
    owned: {
      characters: { swordsman: { unlockedAt: 5, experience: 40, ascension: 0 }, gunner: { unlockedAt: 6, experience: 0, ascension: 0 } },
      aspects: { marksman: { unlockedAt: 7 } },
      relics: { echo: { unlockedAt: 7, tier: 2 }, emberHeart: { unlockedAt: 8, tier: 1 } },
      cosmetics: { starfall: { unlockedAt: 8 }, blueFlame: { unlockedAt: 9 } }
    },
    quests: {
      firstBlood: { "1": { attempts: 2, clears: 1, firstClearedAt: 9, stars: [0, 2] }, "2": { attempts: 1, clears: 1, firstClearedAt: 12, stars: [0, 1, 2], perfectAt: 12 } },
      packLeader: { "1": { attempts: 1, clears: 1, firstClearedAt: 10, stars: [0] } }
    },
    hardcore: { gauntlet: { "1": { attempts: 2, clears: 1, firstClearedAt: 5, bestWave: 7 } } },
    discoveries: { flare: { madeAt: 5 } },
    chests: { one: { "1": 1, "2": 0 } },
    selection: { team: ["gunner", "swordsman"], aspects: { gunner: "marksman" }, relics: { gunner: { strike: "echo", element: "emberHeart" } }, play: { kind: "tier", track: "gauntlet", tier: 1 } },
    worn: { gunner: { trail: "starfall", tint: "blueFlame" } },
    saved: { "1": { team: ["swordsman", "gunner"], aspects: { gunner: "marksman" }, relics: { swordsman: { strike: "echo" } } } },
    auditions: { gunner: { slot: 1, openedAt: 6 }, sparkfist: { slot: 2, openedAt: 9 } }
  }, 10).account), 10).account

  it("turns an account into rows and back, unchanged", () => {
    expect(fromRecord(defaultTuning, newAccount, fromRows(toRows("player", toRecord(account)))!, 10).account).toEqual(account)
  })

  it("keeps relics at their tier, the team's relics, the looks worn, and the saved teams", () => {
    expect(account.owned.relics).toEqual({ echo: { unlockedAt: 7, tier: 2 }, emberHeart: { unlockedAt: 8, tier: 1 } })
    expect(account.selection.relics).toEqual({ gunner: { strike: "echo", element: "emberHeart" } })
    expect(account.worn).toEqual({ gunner: { trail: "starfall", tint: "blueFlame" } })
    expect(account.saved).toEqual({ 1: { team: ["swordsman", "gunner"], aspects: { gunner: "marksman" }, relics: { swordsman: { strike: "echo" } } } })
    expect(account.auditions).toEqual({ gunner: { slot: 1, openedAt: 6 }, sparkfist: { slot: 2, openedAt: 9 } })
  })

  it("drops rows naming content that no longer exists, and repairs what depended on it", () => {
    const rows = toRows("player", toRecord(account))
    const stale = {
      ...rows,
      characters: [...rows.characters, { user_id: "player", character: "wizard", unlocked_at: 1, experience: 0, ascension: 0 }],
      team_members: [{ user_id: "player", slot: 0, character: "wizard", aspect: null }, ...rows.team_members.map((member) => ({ ...member, slot: member.slot + 1 }))],
      discoveries: [...rows.discoveries, { user_id: "player", discovery: "oldThing", made_at: 1 }]
    }
    const { account: repaired, dropped } = fromRecord(defaultTuning, newAccount, fromRows(stale)!, 10)
    // The Pack Leader, cleared, now gives the Tidecaller: she comes with the repair.
    expect(Object.keys(repaired.owned.characters).sort()).toEqual(["gunner", "swordsman", "tidecaller"])
    expect(repaired.selection.team).toEqual(["gunner", "swordsman"])
    expect(repaired.discoveries).toEqual(account.discoveries)
    expect(dropped).toEqual(expect.arrayContaining(["character wizard", "discovery oldThing"]))
  })
})
