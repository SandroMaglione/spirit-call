/**
 * Pixel sprites (see `src/art/`) as Pixi textures, scaled up with
 * nearest-neighbor filtering so their pixels stay crisp.
 */
import { CanvasSource, Container, Sprite as PixiSprite, Texture } from "pixi.js"

import type { Canvas } from "../../art/pixel.ts"
import { toRgba } from "../../art/pixel.ts"
import type { Animation, Facing, Sprite } from "../../art/sprite.ts"

export interface Actor {
  readonly root: Container
  /** Poses the actor at `time` seconds, facing the camera or away, standing or running. */
  pose(time: number, facing: Facing, running: boolean): void
}

/** A canvas as a texture with crisp pixels. */
export const pixelTexture = (source: Canvas): Texture => {
  const element = document.createElement("canvas")
  element.width = source.width
  element.height = source.height
  element.getContext("2d")!.putImageData(new ImageData(toRgba(source), source.width, source.height), 0, 0)
  return new Texture({ source: new CanvasSource({ resource: element, scaleMode: "nearest" }) })
}

/** A pixel sprite, showing the frame for the animation, facing, and time; drawn at its pixel size. */
export const pixelActor = (sprite: Sprite): Actor => {
  const textures = Object.fromEntries((["idle", "run"] as const).map((animation) => [
    animation,
    Object.fromEntries((["front", "back"] as const).map((facing) => [facing, sprite.frames[animation][facing].map(pixelTexture)]))
  ])) as { [A in Animation]: { [F in Facing]: Array<Texture> } }
  const root = new Container()
  const body = new PixiSprite(textures.idle.front[0]!)
  body.anchor.set(sprite.anchor.x / sprite.width, sprite.anchor.y / sprite.height)
  body.scale.set(sprite.pixelSize)
  body.roundPixels = true
  root.addChild(body)
  return {
    root,
    pose(time, facing, running) {
      const animation = running ? "run" : "idle"
      const frames = textures[animation][facing]
      body.texture = frames[Math.floor(time * sprite.fps[animation]) % frames.length]!
    }
  }
}
