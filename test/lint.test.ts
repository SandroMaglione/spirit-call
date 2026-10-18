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
    const match = /fixtures\/src\/([^:]+):\d+:\d+: .*\[Error\/(shooter|ritmo)\(([a-z-]+)\)\]/.exec(line)
    return match === null ? [] : [`${match[1]}: ${match[2] === "ritmo" ? "ritmo/" : ""}${match[3]}`]
  })
}

describe("project lint rules", () => {
  it("catch boundary, Effect barrel, determinism, and cast violations, and let allowed code through", () => {
    const found = lintFixtures()
    const count = (entry: string) => found.filter((line) => line === entry).length
    expect(count("features/violations.ts: layer-boundaries")).toBe(3)
    expect(count("features/violations.ts: no-effect-barrel")).toBe(1)
    // Determinism comes from @typeonce/oxlint-plugin-ritmo, on for the simulation and content parts.
    expect(count("features/violations.ts: ritmo/use-random-for-randomness")).toBe(1)
    expect(count("features/violations.ts: ritmo/use-clock-for-time")).toBe(3)
    expect(count("features/violations.ts: ritmo/keep-simulation-headless")).toBe(1)
    expect(count("features/violations.ts: ritmo/use-ops-for-math")).toBe(2)
    expect(count("features/violations.ts: ritmo/no-infinity-in-simulation-data")).toBe(1)
    expect(count("ui/violations.ts: layer-boundaries")).toBe(2)
    expect(count("content/violations.ts: layer-boundaries")).toBe(1)
    expect(count("features/casts.ts: no-cast-escape")).toBe(2)
    expect(found.filter((line) => line.startsWith("account/"))).toEqual([])
  })
})
