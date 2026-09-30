import { execFileSync } from "node:child_process"
import { describe, expect, it } from "vitest"

/** Runs oxlint on the fixtures and returns each `file: rule` it reports. */
const lintFixtures = (): Array<string> => {
  let output = ""
  try {
    output = execFileSync("npx", ["oxlint", "--format", "unix", "tools/lint/fixtures"], { encoding: "utf8" })
  } catch (error) {
    output = (error as { stdout: string }).stdout
  }
  return output.split("\n").flatMap((line) => {
    const match = /fixtures\/src\/([^:]+):\d+:\d+: .*\[Error\/shooter\(([a-z-]+)\)\]/.exec(line)
    return match === null ? [] : [`${match[1]}: ${match[2]}`]
  })
}

describe("project lint rules", () => {
  it("catch boundary, Effect barrel, and determinism violations, and let allowed imports through", () => {
    const found = lintFixtures()
    const count = (entry: string) => found.filter((line) => line === entry).length
    expect(count("features/violations.ts: layer-boundaries")).toBe(3)
    expect(count("features/violations.ts: no-effect-barrel")).toBe(1)
    expect(count("features/violations.ts: deterministic-simulation")).toBe(4)
    expect(count("ui/violations.ts: layer-boundaries")).toBe(2)
    expect(count("content/violations.ts: layer-boundaries")).toBe(1)
    expect(found.filter((line) => line.startsWith("account/"))).toEqual([])
  })
})
