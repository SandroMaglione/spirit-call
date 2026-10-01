/**
 * Points the bevy-ts packages at their published npm release instead of the
 * sibling repository, for builds that run without it (CI):
 *
 *   node scripts/use-published-bevy-ts.ts && pnpm install --no-frozen-lockfile
 *
 * Day to day the game links `../../bevy-ts/packages/*` so library fixes can
 * be made as the game needs them. Releases build against the version in
 * `bevyTsRelease` (package.json): bump it once a bevy-ts release with
 * everything the game uses is on npm.
 *
 * It rewrites package.json in place (and the install then rewrites the
 * lockfile). To try a release locally, run it, then restore both files with
 * `git checkout package.json pnpm-lock.yaml && pnpm install`.
 */
import { readFileSync, writeFileSync } from "node:fs"

const file = new URL("../package.json", import.meta.url)
const pkg = JSON.parse(readFileSync(file, "utf8")) as {
  bevyTsRelease?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const version = pkg.bevyTsRelease
if (version === undefined) throw new Error("package.json has no bevyTsRelease")

const linked: Array<string> = []
for (const deps of [pkg.dependencies, pkg.devDependencies]) {
  if (deps === undefined) continue
  for (const [name, spec] of Object.entries(deps)) {
    if (name.startsWith("@typeonce/bevy-ts") && spec.startsWith("link:")) {
      deps[name] = version
      linked.push(name)
    }
  }
}

writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(linked.length === 0 ? "No linked bevy-ts packages" : `bevy-ts ${version} from npm: ${linked.join(", ")}`)
