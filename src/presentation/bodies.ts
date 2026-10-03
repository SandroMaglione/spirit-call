/**
 * The visible body of a character or an enemy, whatever its look (see
 * `looks.ts`): the systems that draw, tint, turn, and animate actors talk to
 * an `ActorBody` and never ask what it is made of.
 */
import { Mesh, MeshLambertMaterial } from "three"
import type { Object3D } from "three"

import { projection } from "../config/view.ts"
import { elevation } from "../math/iso.ts"
import type { Vec2 } from "../math/vec.ts"
import { Instance } from "./batch.ts"
import { mixColor } from "./draw.ts"
import type { RenderAssets } from "./host-types.ts"
import type { WeaponId } from "../content/weapons.ts"
import type { BodyLook, Moments, Shot } from "./looks.ts"
import { Puppet } from "./puppet.ts"
import { instancedBody } from "./instanced-body.ts"

export interface ActorBody {
  /** What stands on the body's pivot (the feet). */
  readonly object: Object3D
  /** Its height in world units (what floats over its head goes above it). */
  readonly height: number
  /** Half its width, in world units. */
  readonly radius: number
  /** Batched parts: they join their batches while the body is in the scene. */
  readonly instances: ReadonlyArray<Instance>
  /** Its clips by game moment; `null` when it has none (it does not animate). */
  readonly moments: Moments | null
  /**
   * Its look this frame: colors multiplied by `tint` (white for none), lit by
   * `glow` (0..1) of `glowColor` (a hit flash, a windup, a charge), and
   * see-through below `opacity` 1 (not for batched bodies).
   */
  paint(tint: number, glowColor: number, glow: number, opacity: number): void
  /** Turns to face a direction on the floor. */
  face(direction: Vec2): void
  /** Moves its animation on by a frame (see `Puppet.animate`). */
  animate(position: Vec2, facing: Vec2, seconds: number, holding: boolean): void
  /** Plays a one-shot over `seconds` (its own length when `null`), its blow landing `hitAt` seconds in (see `Puppet.play`). */
  play(shot: Shot, seconds: number | null, hitAt: number | null): void
  /** A simulation-owned enemy phase, sampled directly rather than advanced by render time. */
  sample?(clip: string, progress: number): void
  shield?(relativeAngle: number): void
  dispose(): void
}

/**
 * The 3D height that shows as `pixels` tall on screen for an upright body
 * `radius` wide: its rounded ends show at full size, its straight middle
 * shortened by the camera's angle.
 */
export const bodyHeight = (radius: number, pixels: number): number => {
  const ends = radius * 2
  return ends + Math.max(0, pixels / projection.zoom - ends) / Math.cos(elevation(projection))
}

const still = { face: () => {}, animate: () => {}, play: () => {} }

/** A capsule tinted by mixing its color: batched (enemies, cheap in numbers, never see-through) or its own mesh. */
const capsuleBody = (assets: RenderAssets, color: number, radius: number, height: number, batched: boolean): ActorBody => {
  const tinted = (tint: number, glowColor: number, glow: number): number => mixColor(multiply(color, tint), glowColor, glow)
  if (batched) {
    const instance = new Instance(assets.bodies(radius, height))
    instance.color.setHex(color)
    return {
      object: instance.object,
      height,
      radius,
      instances: [instance],
      moments: null,
      paint: (tint, glowColor, glow) => {
        instance.color.setHex(tinted(tint, glowColor, glow))
      },
      dispose: () => {},
      ...still
    }
  }
  const material = new MeshLambertMaterial({ color, flatShading: true })
  const mesh = new Mesh(assets.bodyGeometry(radius, height), material)
  return {
    object: mesh,
    height,
    radius,
    instances: [],
    moments: null,
    paint: (tint, glowColor, glow, opacity) => {
      material.color.setHex(tinted(tint, glowColor, glow))
      material.opacity = opacity
      if (material.transparent !== opacity < 1) {
        material.transparent = opacity < 1
        material.needsUpdate = true
      }
    },
    dispose: () => material.dispose(),
    ...still
  }
}

/** Multiplies two 0xRRGGBB colors channel by channel. */
const multiply = (a: number, b: number): number => {
  const channel = (shift: number) => Math.round((((a >> shift) & 0xff) * ((b >> shift) & 0xff)) / 255) << shift
  return channel(16) | channel(8) | channel(0)
}

const puppetBody = (puppet: Puppet, radius: number, height: number): ActorBody => ({
  object: puppet.object,
  height,
  radius,
  instances: [],
  moments: puppet.moments,
  paint: (tint, glowColor, glow, opacity) => puppet.paint(tint, glowColor, glow, opacity),
  face: (direction) => puppet.face(direction),
  animate: (position, facing, seconds, holding) => puppet.animate(position, facing, seconds, holding),
  play: (shot, seconds, hitAt) => puppet.play(shot, seconds, hitAt),
  dispose: () => puppet.dispose()
})

/**
 * The body `look` gives an actor of collision radius `radius`, holding
 * `weapon` when its look has a model for it. `batched` capsules are for
 * enemies (players need to turn see-through).
 */
export const makeBody = (assets: RenderAssets, look: BodyLook, radius: number, batched: boolean, weapon: WeaponId | null): ActorBody => {
  const bodyRadius = (radius * look.widthFactor) / 2
  const height = bodyHeight(bodyRadius, radius * look.heightFactor * projection.zoom)
  switch (look.kind) {
    case "capsule":
      return capsuleBody(assets, look.color, bodyRadius, height, batched)
    case "model": {
      if (look.batched) return instancedBody(assets, look, bodyRadius, height)
      const puppet = new Puppet(assets.model(look.model), height, look.moments ?? null)
      const held = weapon === null ? undefined : look.held?.weapons[weapon]
      if (held !== undefined && look.held !== undefined) puppet.hold(assets.model(held), look.held.grip)
      return puppetBody(puppet, bodyRadius, height)
    }
  }
}
