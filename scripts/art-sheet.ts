/**
 * Writes a contact sheet of every pixel sprite, scaled up, to review the art
 * frame by frame: one row per sprite and facing, idle then run frames, each
 * on the floor color with its anchor marked.
 *
 *   pnpm art:sheet [out.png] [--scale 8]
 */
import { writeFileSync } from "node:fs"
import { deflateSync } from "node:zlib"

import { chaser } from "../src/art/chaser.ts"
import { canvas, draw, get, set, TRANSPARENT } from "../src/art/pixel.ts"
import type { Canvas } from "../src/art/pixel.ts"
import type { Sprite } from "../src/art/sprite.ts"
import { swordsman } from "../src/art/swordsman.ts"

const args = process.argv.slice(2)
const scaleAt = args.indexOf("--scale")
const scale = scaleAt === -1 ? 8 : Number(args[scaleAt + 1])
const out = args.find((arg, index) => !arg.startsWith("--") && args[index - 1] !== "--scale") ?? "art-sheet.png"

const sprites: Record<string, Sprite> = { swordsman, chaser }
const floor = 0x232a36
const gap = 4

const rows = Object.values(sprites).flatMap((sprite) => (["front", "back"] as const).map((facing) => [...sprite.frames.idle[facing], ...sprite.frames.run[facing]]))
const cell = Math.max(...Object.values(sprites).map((sprite) => Math.max(sprite.width, sprite.height))) + gap
const columns = Math.max(...rows.map((row) => row.length))
const sheet = canvas(columns * cell + gap, rows.length * cell + gap)
sheet.pixels.fill(floor)
rows.forEach((row, y) => row.forEach((frame, x) => draw(sheet, frame, gap + x * cell, gap + y * cell)))

/** `source` scaled up by `factor`, nearest neighbor. */
const upscale = (source: Canvas, factor: number): Canvas => {
  const result = canvas(source.width * factor, source.height * factor)
  for (let y = 0; y < result.height; y++) {
    for (let x = 0; x < result.width; x++) set(result, x, y, get(source, Math.floor(x / factor), Math.floor(y / factor)))
  }
  return result
}

const crcTable = Array.from({ length: 256 }, (_, n) => {
  let c = n
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
  return c >>> 0
})
const crc32 = (bytes: Uint8Array): number => {
  let c = 0xffffffff
  for (const byte of bytes) c = crcTable[(c ^ byte) & 0xff]! ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}
const chunk = (type: string, data: Uint8Array): Buffer => {
  const body = Buffer.concat([Buffer.from(type, "ascii"), data])
  const length = Buffer.alloc(4)
  length.writeUInt32BE(data.length)
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([length, body, crc])
}

/** A minimal RGBA PNG encoder. */
const png = (image: Canvas): Buffer => {
  const header = Buffer.alloc(13)
  header.writeUInt32BE(image.width, 0)
  header.writeUInt32BE(image.height, 4)
  header[8] = 8
  header[9] = 6
  const raw = Buffer.alloc(image.height * (image.width * 4 + 1))
  for (let y = 0; y < image.height; y++) {
    const row = y * (image.width * 4 + 1)
    for (let x = 0; x < image.width; x++) {
      const color = get(image, x, y)
      if (color === TRANSPARENT) continue
      raw.writeUInt32BE(((color << 8) | 0xff) >>> 0, row + 1 + x * 4)
    }
  }
  return Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), chunk("IHDR", header), chunk("IDAT", deflateSync(raw)), chunk("IEND", new Uint8Array())])
}

writeFileSync(out, png(upscale(sheet, scale)))
console.log(`${out}: ${rows.length} rows, ${columns} frames wide, ${scale}x`)
