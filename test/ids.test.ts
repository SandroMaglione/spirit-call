import { describe, expect, it } from "vitest"

import { randomId } from "../src/app/ids.ts"

const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/

describe("random ids", () => {
  it("are version-4 UUIDs even without crypto.randomUUID (plain HTTP on the local network)", () => {
    const insecure = { getRandomValues: <T extends Uint8Array<ArrayBuffer>>(array: T) => crypto.getRandomValues(array) }
    const first = randomId(insecure)
    expect(first).toMatch(uuid)
    expect(randomId(insecure)).not.toBe(first)
  })

  it("use crypto.randomUUID where it exists", () => {
    expect(randomId({ randomUUID: () => "from-random-uuid", getRandomValues: (array) => array })).toBe("from-random-uuid")
  })
})
