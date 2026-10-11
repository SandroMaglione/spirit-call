/**
 * A build step listing the open-source packages the built game contains, with
 * their licenses, as `licenses.json` beside the game (shown under Settings,
 * "About", as `License`s). Their licenses ask for their notices to travel with the game, as
 * they do in the phone apps. Only what the build actually bundles is listed,
 * so a package used only by the tools or the server is left out.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs"
import { dirname, join, resolve } from "node:path"
import type { Plugin } from "vitest/config"

import type { License } from "../src/ui/store.ts"

type Package = License

/**
 * The package a bundled file comes from, if it is not the game's own: the folder
 * right under the last `node_modules` in its path (a package's own folders may
 * hold a `package.json` of their own, as `preact/hooks` does), or else (a package
 * linked from beside the game) the nearest `package.json` with a name above it.
 */
const packageOf = (file: string, root: string, seen: Map<string, Package | null>): Package | null => {
  const modules = file.lastIndexOf("/node_modules/")
  const name = modules === -1 ? null : file.slice(modules + "/node_modules/".length).split("/")
  let dir = name === null ? dirname(file) : file.slice(0, modules + "/node_modules/".length) + name.slice(0, name[0]?.startsWith("@") ? 2 : 1).join("/")
  while (dir !== dirname(dir)) {
    if (dir === root) return null
    const cached = seen.get(dir)
    if (cached !== undefined) return cached
    const manifest = join(dir, "package.json")
    if (existsSync(manifest)) {
      const json = JSON.parse(readFileSync(manifest, "utf8")) as { name?: string; version?: string; license?: string | { type?: string } }
      if (json.name !== undefined) {
        const notice = readdirSync(dir).find((name) => /^(licen[cs]e|copying|notice)(\.|$)/i.test(name))
        const found: Package = {
          name: json.name,
          version: json.version ?? "",
          license: typeof json.license === "string" ? json.license : json.license?.type ?? "See the package",
          text: notice === undefined ? "" : readFileSync(join(dir, notice), "utf8").trim()
        }
        seen.set(dir, found)
        return found
      }
    }
    dir = dirname(dir)
  }
  return null
}

export const licenses = (): Plugin => {
  let root = ""
  return {
    name: "licenses",
    apply: "build",
    configResolved(config) {
      root = resolve(config.root)
    },
    generateBundle(_options, bundle) {
      const files = Object.values(bundle).flatMap((output) => output.type === "chunk" ? output.moduleIds : output.originalFileNames)
      const seen = new Map<string, Package | null>()
      const packages = new Map<string, Package>()
      for (const id of files) {
        // Ids of generated modules start with a NUL byte or name no file.
        const file = id.split("?")[0] ?? ""
        if (file === "" || file.startsWith("\0") || !existsSync(resolve(root, file))) continue
        const found = packageOf(resolve(root, file), root, seen)
        if (found !== null) packages.set(found.name, found)
      }
      const listed = [...packages.values()].sort((a, b) => a.name.localeCompare(b.name))
      this.emitFile({
        type: "asset",
        fileName: "licenses.json",
        source: JSON.stringify(listed)
      })
    }
  }
}
