import { afterEach, describe, expect, it } from "vitest"

import { fromRecord, toRecord } from "../src/account/convert.ts"
import { defaultTuning } from "../src/config/tuning.ts"
import { newAccount } from "../src/content/account.ts"
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

  it("answers the account only to a session", async () => {
    const handler = server()
    expect((await browser(handler).send("GET", "/api/account")).status).toBe(401)
    const forged = await handler.handler(new Request("https://game.test/api/account", { headers: { cookie: "session=forged" } }))
    expect(forged.status).toBe(401)
  })
})

describe("accounts", () => {
  it("gives a new player the starter set, the same account on every device", async () => {
    const handler = server()
    const phone = await signUp(handler)
    const account = (await phone.send("GET", "/api/account")).body
    expect(Object.keys(account.owned.characters)).toEqual(newAccount.characters)
    expect(account.selection).toEqual({ team: ["swordsman"], aspects: {}, play: { kind: "quest", quest: "theSwarm" } })
    const laptop = browser(handler)
    await laptop.send("POST", "/api/sessions", { username: "stella", password: "correct horse" })
    expect((await laptop.send("GET", "/api/account")).body).toEqual(account)
  })

  it("keeps each player's account apart", async () => {
    const handler = server()
    const stella = await signUp(handler, "stella")
    const nova = await signUp(handler, "nova")
    await stella.send("POST", "/api/runs", { play: { kind: "quest", quest: "theSwarm" }, result: run })
    expect((await stella.send("GET", "/api/account")).body.quests.theSwarm).toBeDefined()
    expect((await nova.send("GET", "/api/account")).body.quests.theSwarm).toBeUndefined()
  })

  it("records a run: pays it, gives a first clear's rewards, and keeps them", async () => {
    const handler = server()
    const player = await signUp(handler)
    const recorded = await player.send("POST", "/api/runs", { play: { kind: "quest", quest: "theSwarm" }, result: run })
    expect(recorded.status).toBe(200)
    expect(recorded.body.earned.rewards).toEqual(defaultTuning.quests.theSwarm.rewards)
    const account = (await player.send("GET", "/api/account")).body
    expect(account).toEqual(recorded.body.account)
    expect(account.quests.theSwarm).toMatchObject({ attempts: 1, clears: 1 })
    expect(account.totals).toMatchObject({ runs: 1, clears: 1, kills: 40 })
    expect(account.wallet.gold).toBeGreaterThan(0)
  })

  it("selects a team of owned characters, and refuses one it does not own, changing nothing", async () => {
    const handler = server({ devTools: true, secureCookies: true })
    const player = await signUp(handler)
    const refused = await player.send("PUT", "/api/account/selection", { team: ["swordsman", "gunner"], play: { kind: "quest", quest: "theSwarm" } })
    expect(refused).toMatchObject({ status: 409, body: { _tag: "Refused", kind: "notOwned" } })
    await player.send("POST", "/api/runs", { play: { kind: "quest", quest: "theSwarm" }, result: run })
    await player.send("POST", "/api/dev/unlock-everything")
    const selected = await player.send("PUT", "/api/account/selection", { team: ["gunner", "swordsman"], play: { kind: "quest", quest: "crossfire" } })
    expect(selected.status).toBe(200)
    expect((await player.send("GET", "/api/account")).body.selection).toEqual({ team: ["gunner", "swordsman"], aspects: {}, play: { kind: "quest", quest: "crossfire" } })
  })

  it("trains with gold, and refuses without enough", async () => {
    const handler = server()
    const player = await signUp(handler)
    expect((await player.send("POST", "/api/characters/swordsman/training")).body).toMatchObject({ _tag: "Refused", kind: "notEnough" })
    await player.send("POST", "/api/runs", { play: { kind: "quest", quest: "theSwarm" }, result: run })
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
    expect((await player.send("POST", "/api/runs", { play: null, result: { ...run, team: ["wizard"] } })).status).toBe(400)
  })

  it("makes calls and keeps them made", async () => {
    const handler = server({ devTools: true, secureCookies: true })
    const player = await signUp(handler)
    await player.send("POST", "/api/dev/open-calls")
    const banner = Object.keys(defaultTuning.banners)[0]!
    const called = await player.send("POST", `/api/banners/${banner}/calls`, { count: 10 })
    expect(called.status).toBe(200)
    expect(called.body.results).toHaveLength(10)
    const account = (await player.send("GET", "/api/account")).body
    expect(account.calls).toEqual(called.body.account.calls)
    expect(account.calls.history).toHaveLength(10)
  })

  it("answers the dev tools only where they are on", async () => {
    const off = await signUp(server())
    expect((await off.send("POST", "/api/dev/unlock-everything")).status).toBe(404)
    const on = await signUp(server({ devTools: true, secureCookies: true }))
    const unlocked = await on.send("POST", "/api/dev/unlock-everything")
    expect(Object.keys(unlocked.body.owned.characters)).toEqual(expect.arrayContaining(Object.keys(defaultTuning.characters)))
  })
})

describe("account rows", () => {
  const account = fromRecord(defaultTuning, newAccount, toRecord(fromRecord(defaultTuning, newAccount, {
    id: "player",
    createdAt: 5,
    experience: 120,
    totals: { runs: 3, clears: 2, kills: 90, secondsPlayed: 410.5 },
    wallet: { gold: 300, crystals: 20, fireShard: 2 },
    owned: { characters: { swordsman: { unlockedAt: 5, experience: 40, ascension: 0 }, gunner: { unlockedAt: 6, experience: 0, ascension: 0 } }, aspects: { marksman: { unlockedAt: 7, copies: 2 } } },
    quests: { theSwarm: { attempts: 2, clears: 1, firstClearedAt: 9, stars: [0, 2] } },
    hardcore: { gauntlet: { "1": { attempts: 2, clears: 1, firstClearedAt: 5, rewardedPeriod: 3, bestWave: 7 } } },
    discoveries: { flare: { madeAt: 5 } },
    chests: { one: 1 },
    calls: { seed: 42, sinceCharacter: 3, sinceAspect: 1, firstCharacter: false, focus: {}, history: [{ at: 8, banner: Object.keys(defaultTuning.banners)[0]!, result: { kind: "supply", amounts: { gold: 50 } } }] },
    selection: { team: ["gunner", "swordsman"], aspects: { gunner: "marksman" }, play: { kind: "tier", track: "gauntlet", tier: 1 } }
  }, 10).account), 10).account

  it("turns an account into rows and back, unchanged", () => {
    expect(fromRecord(defaultTuning, newAccount, fromRows(toRows("player", toRecord(account)))!, 10).account).toEqual(account)
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
    expect(Object.keys(repaired.owned.characters).sort()).toEqual(["gunner", "swordsman"])
    expect(repaired.selection.team).toEqual(["gunner", "swordsman"])
    expect(repaired.discoveries).toEqual(account.discoveries)
    expect(dropped).toEqual(expect.arrayContaining(["character wizard", "discovery oldThing"]))
  })
})
