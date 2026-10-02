/** Blender animation frames, selected by movement and world-space aim. */
import { Assets, ColorMatrixFilter, Container, Graphics, Rectangle, Sprite, Texture } from "pixi.js"

import { projection, view } from "../config/view.ts"
import type { Vec2 } from "../math/vec.ts"
import { crowAnimation as crowAtlas } from "./assets/crow-animation.ts"
import idleUrl from "./assets/crow-idle.png"
import walkUrl from "./assets/crow-walk.png"
import type { CrowTextures, PlayerNode } from "./host-types.ts"

const loadClip = async (url: string, frames: number): Promise<ReadonlyArray<Texture>> => {
  const atlas = await Assets.load<Texture>(url)
  atlas.source.scaleMode = "linear"
  const size = crowAtlas.frameSize
  return Array.from({ length: crowAtlas.directions * frames }, (_, index) => new Texture({
    source: atlas.source,
    frame: new Rectangle((index % crowAtlas.columns) * size, Math.floor(index / crowAtlas.columns) * size, size, size)
  }))
}

export const loadCrowTextures = async (): Promise<CrowTextures> => {
  const [idle, walk] = await Promise.all([
    loadClip(idleUrl, crowAtlas.clips.idle.frames),
    loadClip(walkUrl, crowAtlas.clips.walk.frames)
  ])
  return { idle, walk }
}

/** Rows hold animation frames; columns retain the same sixteen facings. */
export const crowTextureIndex = (aim: Vec2, frame: number): number => frame * crowAtlas.directions + crowDirection(aim)

/** Same direction order as the bake: +X, then toward +Y, without mirroring. */
export const crowDirection = (aim: Vec2): number => {
  const index = Math.round(Math.atan2(aim.y, aim.x) * crowAtlas.directions / (2 * Math.PI))
  return (index + crowAtlas.directions) % crowAtlas.directions
}

export const createCrow = (radius: number, textures: CrowTextures): PlayerNode => {
  const root = new Container()
  const r = radius * projection.zoom
  const shadow = new Graphics().ellipse(0, 0, r, r * projection.squash).fill({ color: view.shadow, alpha: 0.35 })
  const body = new Sprite(textures.idle[0]!)
  body.anchor.set(crowAtlas.anchor.x, crowAtlas.anchor.y)
  body.scale.set(radius * view.bodyHeightFactor * projection.zoom / crowAtlas.projectedHeight)
  // Multiplying a dark texture by white cannot make a hit flash. This filter
  // blends its RGB toward the feedback color while retaining the silhouette.
  const light = new ColorMatrixFilter()
  light.enabled = false
  body.filters = [light]
  root.addChild(shadow, body)
  return { kind: "player", root, body, light, motion: { clip: "idle", phase: 0, position: null } }
}

export const lightCrow = (light: ColorMatrixFilter, color: number, amount: number): void => {
  light.enabled = amount > 0
  if (!light.enabled) return
  const matrix = light.matrix
  matrix[0] = matrix[6] = matrix[12] = 1 - amount
  matrix[4] = ((color >> 16) & 255) / 255 * amount
  matrix[9] = ((color >> 8) & 255) / 255 * amount
  matrix[14] = (color & 255) / 255 * amount
  light.matrix = matrix
}
