/**
 * Lets Node scripts load modules that import assets the way Vite does
 * (`import url from "./model.glb?url"`): the import gives the file's path
 * instead of failing on an unknown extension. Scripts run headless, so the
 * path is never fetched; it only has to load.
 *
 *   node --import tsx --import ./scripts/assets.ts scripts/debug.ts
 */
import { registerHooks } from "node:module"
import { fileURLToPath } from "node:url"

const asUrl = /\?url$/

registerHooks({
  resolve: (specifier, context, nextResolve) => {
    if (!asUrl.test(specifier)) return nextResolve(specifier, context)
    const file = new URL(specifier.replace(asUrl, ""), context.parentURL)
    return { url: `${file.href}?url`, shortCircuit: true }
  },
  load: (url, context, nextLoad) => {
    if (!asUrl.test(url)) return nextLoad(url, context)
    const path = fileURLToPath(url.replace(asUrl, ""))
    return { format: "module", source: `export default ${JSON.stringify(path)}`, shortCircuit: true }
  }
})
