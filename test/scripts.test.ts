import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

/**
 * The headless scripts run under plain Node, not Vite, so the other tests
 * cannot see them break (an asset import in presentation once did). The
 * debug run is the one that loads presentation; it must still finish.
 */
describe("headless scripts", () => {
  it("pnpm debug runs a scripted fight to the end", () => {
    const output = execFileSync("pnpm", ["--silent", "debug"], { encoding: "utf8" })
    expect(output).toMatch(/run setup: 1 frames .*, completed/)
    expect(output).toMatch(/run fixedUpdate: 180 frames .*, completed/)
  })
})
