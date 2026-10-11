/**
 * Points bevy-ts packages at an exact source commit or their published npm
 * release, for builds without the sibling repository (CI and previews):
 *
 *   node scripts/use-published-bevy-ts.ts && pnpm install --no-frozen-lockfile
 *
 * Day to day the game links `../../bevy-ts/packages/*` so library fixes can
 * be made as the game needs them. Releases build against the version in
 * `bevyTsRelease` (package.json). A companion PR can set `bevyTsSource` to
 * a full commit SHA until everything the game uses is on npm.
 *
 * It rewrites package.json in place (and the install then rewrites the
 * lockfile). To try a release locally, run it, then restore both files with
 * `git checkout package.json pnpm-lock.yaml && pnpm install`.
 */
import { execFileSync } from "node:child_process"
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { fileURLToPath } from "node:url"

const file = new URL("../package.json", import.meta.url)
const pkg = JSON.parse(readFileSync(file, "utf8")) as {
  bevyTsRelease?: string
  /** Unpublished engine changes, pinned for CI and preview acceptance builds. */
  bevyTsSource?: string
  dependencies?: Record<string, string>
  devDependencies?: Record<string, string>
}

const version = pkg.bevyTsRelease
if (version === undefined) throw new Error("package.json has no bevyTsRelease")

// A companion PR can test an unpublished engine commit without changing the
// sibling checkout. Remove this pin once that commit's release is published.
const source = pkg.bevyTsSource
let sourcePath: string | undefined
if (source !== undefined) {
  if (!/^[a-f0-9]{40}$/.test(source)) throw new Error("bevyTsSource must be a full commit SHA")
  sourcePath = `.repos/bevy-ts-preview/${source}`
  const checkout = fileURLToPath(new URL(`../${sourcePath}/`, import.meta.url))
  const run = (command: string, args: Array<string>) => execFileSync(command, args, { cwd: checkout, stdio: "inherit" })
  if (!existsSync(`${checkout}.git`)) {
    mkdirSync(checkout, { recursive: true })
    run("git", ["init"])
    run("git", ["remote", "add", "origin", "https://github.com/SandroMaglione/bevy-ts.git"])
  }
  run("git", ["fetch", "--depth=1", "origin", source])
  run("git", ["checkout", "--detach", source])
  const actual = execFileSync("git", ["rev-parse", "HEAD"], { cwd: checkout, encoding: "utf8" }).trim()
  if (actual !== source) throw new Error(`bevy-ts checkout mismatch: ${actual}`)
  run("pnpm", ["install", "--frozen-lockfile"])
  run("pnpm", ["build"])
}

const linked: Array<string> = []
for (const deps of [pkg.dependencies, pkg.devDependencies]) {
  if (deps === undefined) continue
  for (const [name, spec] of Object.entries(deps)) {
    if (name.startsWith("@typeonce/bevy-ts") && spec.startsWith("link:")) {
      if (sourcePath === undefined) deps[name] = version
      else {
        const packageDir = /\/packages\/([^/]+)$/.exec(spec)?.[1]
        if (packageDir === undefined) throw new Error(`Unrecognized bevy-ts link: ${spec}`)
        deps[name] = `link:${sourcePath}/packages/${packageDir}`
      }
      linked.push(name)
    }
  }
}

writeFileSync(file, `${JSON.stringify(pkg, null, 2)}\n`)
console.log(linked.length === 0 ? "No linked bevy-ts packages" : `bevy-ts ${source ?? version} from ${source === undefined ? "npm" : "pinned source"}: ${linked.join(", ")}`)
