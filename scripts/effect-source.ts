/**
 * Puts the source of the Effect release the game uses in `.repos/effect`
 * (gitignored), to read how Effect works and how it is meant to be used:
 *
 *   pnpm effect-source
 *
 * It is a single-commit copy (no history) of github.com/Effect-TS/effect at
 * the tag of the `effect` version in package.json; run it again after
 * upgrading Effect and it moves the copy to the new tag.
 */
import { execFileSync } from "node:child_process"
import { existsSync, readFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const pkg = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8")) as {
  dependencies?: Record<string, string>
}
const version = pkg.dependencies?.effect
if (version === undefined || !/^\d/.test(version)) throw new Error(`package.json has no pinned effect version (found ${version})`)

const tag = `effect@${version}`
const target = fileURLToPath(new URL("../.repos/effect", import.meta.url))
const git = (...args: Array<string>) => execFileSync("git", ["-c", "advice.detachedHead=false", ...args], { stdio: "inherit" })

if (existsSync(target)) {
  git("-C", target, "fetch", "--depth", "1", "origin", "tag", tag)
  git("-C", target, "checkout", "--quiet", tag)
} else {
  git("clone", "--quiet", "--depth", "1", "--branch", tag, "https://github.com/Effect-TS/effect.git", target)
}
console.log(`Effect ${version} source in .repos/effect`)
