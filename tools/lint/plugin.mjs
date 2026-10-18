/**
 * Project lint rules (an oxlint JS plugin, see `.oxlintrc.json`).
 *
 * - `shooter/layer-boundaries`: each part of `src` may only import the parts
 *   and packages listed for it in `layers` below (type-only imports of other
 *   parts are free: they do not ship). This keeps the simulation free of
 *   rendering, UI, and Effect, and the UI free of Effect and of storing the
 *   account (it may use the account's pure rules).
 * - `shooter/no-effect-barrel`: import Effect by module (`effect/Schema`),
 *   never from a package root (`effect`), which pulls in far more code.
 *
 * Determinism (no wall clocks, timers, `Math.random`, or engine-dependent
 * math in the simulation) is checked by `@typeonce/oxlint-plugin-ritmo`'s
 * `ritmo/*` rules, turned on for the simulation and content parts in
 * `.oxlintrc.json`.
 * - `shooter/no-cast-escape`: no `as never` and no `as unknown as`, anywhere.
 *   Both switch the type checker off for a value. Build the value with its
 *   real type instead; if a library API cannot express it, fix the library.
 */
import path from "node:path"

/**
 * The parts of `src`, by path prefix, with what each may import: other parts
 * (by name) and packages (by name or prefix). Order matters: the first match
 * names the part.
 */
const layers = [
  // Content is data; its curves use Ops, so they compute the same on every device.
  { name: "content", paths: ["src/content/"], parts: ["content"], packages: ["@typeonce/ritmo-math/Ops"] },
  {
    name: "simulation",
    paths: ["src/features/", "src/physics/", "src/math/", "src/config/", "src/schema.ts", "src/schedules.ts", "src/simulation.ts", "src/runtime.ts"],
    parts: ["content", "simulation"],
    packages: ["@typeonce/ritmo", "@typeonce/ritmo-browser", "@typeonce/ritmo-math"]
  },
  // The account's rules are pure (no Effect), so the UI can use them; storing the account (and a playtest build's sending) is the Effect side.
  { name: "account rules", paths: ["src/account/account.ts", "src/account/calls.ts", "src/account/progression.ts", "src/account/convert.ts"], parts: ["content", "simulation", "account rules"], packages: [] },
  { name: "persistence", paths: ["src/account/", "src/app/"], parts: ["content", "simulation", "account rules", "persistence", "api"], packages: ["effect", "@effect/", "@capacitor/"] },
  // What a playtest build sends the server: shared by both, so it holds no code of either.
  { name: "api", paths: ["src/api/"], parts: ["content", "api"], packages: ["effect"] },
  // The server only keeps the runs playtest builds send: it knows the API and its database, and nothing of the game.
  { name: "server", paths: ["src/server/"], parts: ["api", "server"], packages: ["effect", "@effect/", "node:fs", "node:http"] },
  { name: "ui", paths: ["src/ui/"], parts: ["content", "simulation", "account rules", "ui"], packages: ["preact", "@preact/", "@typeonce/ritmo"] },
  {
    name: "presentation",
    paths: ["src/presentation/"],
    parts: ["content", "simulation", "presentation", "ui", "dev"],
    packages: ["three", "@typeonce/ritmo", "@typeonce/ritmo-render", "@typeonce/ritmo-browser", "@typeonce/ritmo-math"]
  },
  { name: "dev", paths: ["src/dev/"], parts: ["content", "simulation", "dev"], packages: ["@typeonce/ritmo", "@typeonce/ritmo-devtools", "@typeonce/ritmo-render", "@typeonce/ritmo-math"] },
  { name: "entry", paths: ["src/main.ts"], parts: "*", packages: "*" }
]


const toPosix = (file) => file.split(path.sep).join("/")

/** The part of `src` a file (absolute path) belongs to, if any; paths are taken from the last `src/` in it (lint fixtures have their own). */
const layerOf = (file) => {
  const posix = toPosix(file)
  const at = posix.lastIndexOf("/src/")
  if (at === -1) return undefined
  const relative = posix.slice(at + 1)
  return layers.find((layer) => layer.paths.some((prefix) => relative === prefix || relative.startsWith(prefix)))
}

const packageAllowed = (layer, specifier) =>
  layer.packages === "*" || layer.packages.some((allowed) => specifier === allowed || specifier.startsWith(allowed.endsWith("/") ? allowed : `${allowed}/`))

/** Whether an import declaration only brings in types (it does not ship). */
const typeOnly = (node) =>
  node.importKind === "type" || (node.specifiers !== undefined && node.specifiers.length > 0 && node.specifiers.every((specifier) => specifier.importKind === "type"))

/** Calls `check(node, specifier)` for every import or re-export with a source. */
const sources = (check) => ({
  ImportDeclaration: (node) => check(node, node.source.value, typeOnly(node)),
  ExportNamedDeclaration: (node) => node.source && check(node, node.source.value, node.exportKind === "type"),
  ExportAllDeclaration: (node) => check(node, node.source.value, node.exportKind === "type"),
  ImportExpression: (node) => node.source.type === "Literal" && check(node, node.source.value, false)
})

const layerBoundaries = {
  meta: { type: "problem", docs: { description: "Each part of src imports only the parts and packages it may use." } },
  create(context) {
    const layer = layerOf(context.filename)
    if (layer === undefined) return {}
    return sources((node, specifier, onlyTypes) => {
      if (specifier.startsWith(".")) {
        if (onlyTypes || layer.parts === "*") return
        const target = layerOf(path.resolve(path.dirname(context.filename), specifier))
        if (target !== undefined && !layer.parts.includes(target.name)) {
          context.report({ node, message: `The ${layer.name} part may not import the ${target.name} part (${specifier}).` })
        }
        return
      }
      if (packageAllowed(layer, specifier)) return
      // Types from rendering or UI packages are fine (schema.ts names its services); Effect types are not.
      if (onlyTypes && !specifier.startsWith("effect") && !specifier.startsWith("@effect/")) return
      context.report({ node, message: `The ${layer.name} part may not use the package ${specifier}.` })
    })
  }
}

const noEffectBarrel = {
  meta: { type: "problem", docs: { description: "Import Effect by module, not from a package root." } },
  create(context) {
    return sources((node, specifier) => {
      if (specifier === "effect" || /^@effect\/[^/]+$/.test(specifier)) {
        context.report({ node, message: `Import from a module (e.g. "effect/Schema"), not "${specifier}": the package root pulls in far more code.` })
      }
    })
  }
}

const noCastEscape = {
  meta: { type: "problem", docs: { description: "No `as never` and no `as unknown as`." } },
  create(context) {
    return {
      TSAsExpression(node) {
        if (node.typeAnnotation.type === "TSNeverKeyword") {
          context.report({ node, message: "`as never` switches type checking off for this value: give it its real type (if a library API cannot take it, fix the library)." })
        } else if (node.expression.type === "TSAsExpression" && node.expression.typeAnnotation.type === "TSUnknownKeyword") {
          context.report({ node, message: "`as unknown as` switches type checking off for this value: build it with its real type (if a library API cannot express it, fix the library)." })
        }
      }
    }
  }
}

export default {
  meta: { name: "shooter" },
  rules: {
    "layer-boundaries": layerBoundaries,
    "no-effect-barrel": noEffectBarrel,
    "no-cast-escape": noCastEscape
  }
}
