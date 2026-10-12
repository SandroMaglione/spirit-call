/**
 * Everything a fight can show, made ready before it starts: a shader
 * compiled or an animation baked in the middle of a fight is a hitch of a
 * hundred milliseconds or more, the kind players feel most. When a run
 * opens with a challenge and a team not warmed yet, every enemy kind the
 * challenge can field is baked, each member is drawn once as she is and
 * once see-through (protected), and so is every piece of the arena that
 * fades when she stands behind it, out of the camera's sight, and every
 * shader the scenes hold compiles (see `RenderHostValue.warm`).
 */
import { BoxGeometry, Mesh, MeshLambertMaterial } from "three"
import type { Object3D } from "three"

import type { Tuning as TuningValue } from "../config/tuning.ts"
import { entryKind } from "../content/challenges.ts"
import type { ChallengeId } from "../content/challenges.ts"
import type { EnemyKind } from "../content/enemies.ts"
import { arenaOf } from "../features/arena.ts"
import { Challenge, Flow, Game, Practice, RenderHost, Team, Tuning } from "../schema.ts"
import type { PracticeValue } from "../schema.ts"
import { makeBody } from "./bodies.ts"
import type { RenderHostValue } from "./host-types.ts"
import { arenaLooks, characterLook, enemyLooks } from "./looks.ts"
import type { ModelId } from "./models.ts"
import { copyModel, disposeCopy, paintMaterials } from "./puppet.ts"

/** Every enemy kind a fight of `challenge` can field: its waves', its endless waves', Enemy Practice's picks, and whoever they call for help. */
export const fightKinds = (tuning: TuningValue, challenge: ChallengeId, practice: PracticeValue): ReadonlyArray<EnemyKind> => {
  const waves = tuning.challenges[challenge].waves
  const kinds = new Set<EnemyKind>([...waves.scripted.flat().map(entryKind), ...(waves.endless?.kinds ?? []), ...practice.kinds])
  // A set visits what is added while going through it: those called, and whoever they call.
  for (const kind of kinds) {
    for (const attack of [...tuning.enemies[kind].attacks, ...(tuning.champions.movesets[kind]?.attacks ?? [])]) {
      if (attack.kind === "call") for (const called of attack.calls) kinds.add(called)
    }
  }
  return [...kinds]
}

/** How far below the floor what is warmed stands: compiled, never in the camera's sight. */
const outOfSight = -10_000

/** Something drawn for a warm-up, and how to free it. */
interface Warmed {
  readonly object: Object3D
  readonly dispose: () => void
}

/** The arena's pieces that fade when she stands behind them, see-through: its props' models and its walls' boxes. */
const fadedArena = (host: RenderHostValue, tuning: TuningValue, challenge: ChallengeId): ReadonlyArray<Warmed> => {
  const arena = arenaLooks[arenaOf(tuning, challenge)]
  const models = new Set<ModelId>((arena.props ?? []).map((prop) => prop.model))
  let boxes = false
  for (const look of Object.values(arena.walls)) {
    if (look.kind === "prop") models.add(look.model)
    if (look.kind === "pillar") for (const model of look.models) models.add(model)
    if (look.kind === "box") boxes = true
  }
  const pieces: Array<Warmed> = [...models].map((model) => {
    const copy = copyModel(host.assets.model(model), true)
    paintMaterials(copy.materials, 0xffffff, 0x000000, 0, 0.5)
    return { object: copy.object, dispose: () => disposeCopy(copy.object, copy.materials) }
  })
  if (boxes) {
    const box = new Mesh(new BoxGeometry(), new MeshLambertMaterial({ transparent: true, opacity: 0.5 }))
    pieces.push({ object: box, dispose: () => {
      box.geometry.dispose()
      box.material.dispose()
    } })
  }
  return pieces
}

/** The challenge and team last warmed (once a page). */
let warmed: string | null = null
/**
 * The bodies it drew: kept (out of the scene) until the next warm-up, as
 * three.js lets go of a compiled shader once no material uses it, and a
 * see-through member would compile hers again.
 */
let kept: ReadonlyArray<Warmed> = []

export const WarmUpFights = Game.System("Shooter/WarmUpFights", {
  resources: { tuning: Game.System.readResource(Tuning), challenge: Game.System.readResource(Challenge), team: Game.System.readResource(Team), practice: Game.System.readResource(Practice) },
  machines: { flow: Game.System.machine(Flow) },
  services: { host: Game.System.service(RenderHost) }
}, ({ resources, machines, services }) => {
  if (machines.flow.get() !== "Playing") return
  const tuning = resources.tuning.get()
  const challenge = resources.challenge.get()
  const team = resources.team.get()
  const practice = resources.practice.get()
  const key = `${challenge}|${team.map((build) => build.character).join(",")}|${practice.kinds.join(",")}`
  if (key === warmed) return
  warmed = key
  const host = services.host
  for (const kind of fightKinds(tuning, challenge, practice)) {
    const look = enemyLooks[kind]
    if (look.kind === "model" && look.batched) host.assets.animated(look.model)
  }
  const bodies: ReadonlyArray<Warmed> = team.flatMap(({ character }) => [1, 0.55].map((opacity) => {
    const body = makeBody(host.assets, characterLook(character), tuning.characters[character].radius, false)
    body.paint(0xffffff, 0xffffff, 0, opacity)
    return body
  }))
  const drawn = [...bodies, ...fadedArena(host, tuning, challenge)]
  for (const { object } of drawn) object.position.y = outOfSight
  const before = kept
  kept = drawn
  void host.warm(drawn.map((piece) => piece.object)).catch(() => undefined).finally(() => {
    for (const body of before) body.dispose()
  })
})
