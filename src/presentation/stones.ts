/**
 * Rock's stone, in the 3D scene (low-poly, flat-shaded, in the rock
 * spirit's colors): the plates of a guard circling whoever wears them, the
 * spikes of an Earthrise shooting out of the floor and sinking back, and
 * chunks thrown when stone breaks, and Quarry's splinters in flight and
 * stuck in the floor. Four instanced meshes, reused; positions
 * in world units (the floor's x, height, the floor's y). No model: the
 * shapes are made here.
 */
import { Color, ConeGeometry, Euler, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, OctahedronGeometry, Quaternion, Vector3 } from "three"
import type { BufferAttribute, BufferGeometry, Object3D } from "three"
import type { Vec2 } from "@typeonce/bevy-ts-math/Vec2"

import { view } from "../config/view.ts"
import { showInstances } from "./uploads.ts"

/** A spike of an Earthrise: where it stands, how tall and wide, its tilt and turn, and its life (rising, standing, sinking). */
interface Spike {
  x: number
  z: number
  height: number
  width: number
  tilt: Quaternion
  color: Color
  /** Seconds since it began to rise (before 0: waiting its turn). */
  age: number
}

/** A chunk of stone thrown from where stone broke. */
interface Chunk {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  size: number
  spin: Vector3
  turn: Euler
  color: Color
  life: number
}

const MAX_PLATES = 6
const MAX_SPIKES = 96
const MAX_CHUNKS = 192
const MAX_SPLINTERS = 64
const GRAVITY = 900
/** A spike's life: rising (with an overshoot), standing, then sinking into the floor. */
const RISE = 0.13
const STAND = 0.75
const SINK = 0.4

/** `geometry` with its vertices nudged (the same each run), so stone breaks into irregular facets. */
const rough = <G extends BufferGeometry>(geometry: G, amount: number): G => {
  const position = geometry.getAttribute("position") as BufferAttribute
  // Shared corners stay shared: the nudge comes from where a vertex is.
  for (let index = 0; index < position.count; index++) {
    const x = position.getX(index)
    const y = position.getY(index)
    const z = position.getZ(index)
    const seed = Math.sin(x * 12.9898 + y * 78.233 + z * 37.719) * 43758.5453
    const nudge = (seed - Math.floor(seed) - 0.5) * amount
    position.setXYZ(index, x * (1 + nudge), y * (1 + nudge * 0.5), z * (1 - nudge))
  }
  geometry.computeVertexNormals()
  return geometry
}

/** A stone tone: the sheet's light, middle, or dark, at random. */
const tone = (): Color => {
  const pick = Math.random()
  return new Color(pick < 0.4 ? view.stone.light : pick < 0.8 ? view.stone.middle : view.stone.dark)
}

export class Stones {
  private readonly plateMesh: InstancedMesh
  private readonly spikeMesh: InstancedMesh
  private readonly chunkMesh: InstancedMesh
  private readonly splinterMesh: InstancedMesh
  private readonly spikes: Array<Spike> = []
  private readonly chunks: Array<Chunk> = []
  private readonly matrix = new Matrix4()
  private readonly position = new Vector3()
  private readonly scale = new Vector3()
  private readonly turn = new Quaternion()
  private readonly light = new Color(view.stone.light)
  private readonly middle = new Color(view.stone.middle)
  private readonly euler = new Euler()

  constructor(parent: Object3D) {
    const material = () => new MeshStandardMaterial({ flatShading: true, roughness: 0.95, metalness: 0 })
    // Plates glow a little amber from within, so they read apart from the stone of a rock spirit wearing them.
    this.plateMesh = new InstancedMesh(rough(new IcosahedronGeometry(1, 0), 0.25), new MeshStandardMaterial({ flatShading: true, roughness: 0.8, metalness: 0, emissive: view.stone.glow, emissiveIntensity: 0.28 }), MAX_PLATES)
    // A spike: a five-sided cone, its base on the floor.
    this.spikeMesh = new InstancedMesh(rough(new ConeGeometry(1, 1, 5, 2).translate(0, 0.5, 0), 0.3), material(), MAX_SPIKES)
    this.chunkMesh = new InstancedMesh(rough(new IcosahedronGeometry(1, 0), 0.4), material(), MAX_CHUNKS)
    // A splinter: a long, rough shard, pointed at both ends (along its y).
    this.splinterMesh = new InstancedMesh(rough(new OctahedronGeometry(1, 0).scale(0.45, 1.4, 0.35), 0.3), new MeshStandardMaterial({ flatShading: true, roughness: 0.9, metalness: 0, emissive: view.stone.glow, emissiveIntensity: 0.12 }), MAX_SPLINTERS)
    for (const mesh of [this.plateMesh, this.spikeMesh, this.chunkMesh, this.splinterMesh]) {
      mesh.count = 0
      mesh.frustumCulled = false
      mesh.setColorAt(0, new Color(0xffffff))
      parent.add(mesh)
    }
  }

  /**
   * The plates around a body at `at` (a floor point, `null`: none on the
   * field), `radius` world units out: `count` held, plus one rising by
   * `raising` (0 to 1) while a guard gathers. They circle slowly, edge on,
   * bobbing out of step.
   */
  plates(at: Vec2 | null, radius: number, height: number, count: number, raising: number, time: number): void {
    const rising = raising > 0 ? Math.max(count, 3) : count
    const shown = at === null ? 0 : Math.min(MAX_PLATES, rising)
    for (let index = 0; index < shown; index++) {
      const angle = time * 0.9 + (index / Math.max(1, shown)) * Math.PI * 2
      // While a guard gathers, the plates not yet held rise out of the floor around her.
      const lift = index < count ? 1 : raising
      const y = height * lift + 3 * Math.sin(time * 2.4 + index * 2.1)
      this.position.set(at!.x + Math.cos(angle) * radius, y, at!.y + Math.sin(angle) * radius)
      this.euler.set(0.15 * Math.sin(time + index), -angle, 0.1)
      this.turn.setFromEuler(this.euler)
      const size = 0.4 + 0.6 * lift
      this.scale.set(5 * size, 15 * size, 11 * size)
      this.matrix.compose(this.position, this.turn, this.scale)
      this.plateMesh.setMatrixAt(index, this.matrix)
      this.plateMesh.setColorAt(index, index % 2 === 0 ? this.light : this.middle)
    }
    showInstances(this.plateMesh, shown)
  }

  /** Stone erupting at `at` (a floor point) over `size` world units: a tall spike and a ring of smaller ones, leaning out, with chunks thrown up. */
  erupt(at: Vec2, size: number, tall: number): void {
    const add = (x: number, z: number, height: number, width: number, lean: number, delay: number) => {
      if (this.spikes.length >= MAX_SPIKES) return
      const away = Math.atan2(z - at.y, x - at.x)
      const tilt = new Quaternion().setFromEuler(new Euler(Math.sin(away) * lean, Math.random() * Math.PI * 2, -Math.cos(away) * lean))
      this.spikes.push({ x, z, height, width, tilt, color: tone(), age: -delay })
    }
    add(at.x, at.y, tall, size * 0.28, 0.05, 0)
    const ring = 6
    for (let index = 0; index < ring; index++) {
      const angle = (index / ring) * Math.PI * 2 + Math.random() * 0.6
      const out = size * (0.45 + Math.random() * 0.35)
      add(at.x + Math.cos(angle) * out, at.y + Math.sin(angle) * out, tall * (0.35 + Math.random() * 0.3), size * (0.14 + Math.random() * 0.08), 0.35 + Math.random() * 0.25, 0.03 + Math.random() * 0.06)
    }
    this.shatter(at, 14, size * 0.5, 4 + size * 0.04, 420)
  }

  /** A ring of spikes `radius` around `at` (a floor point), leaning out, about `tall` high, with chunks thrown out. */
  ring(at: Vec2, radius: number, tall: number): void {
    const count = 12
    for (let index = 0; index < count && this.spikes.length < MAX_SPIKES; index++) {
      const angle = (index / count) * Math.PI * 2 + Math.random() * 0.25
      const out = radius * (0.85 + Math.random() * 0.3)
      const x = at.x + Math.cos(angle) * out
      const z = at.y + Math.sin(angle) * out
      const lean = 0.45 + Math.random() * 0.2
      const tilt = new Quaternion().setFromEuler(new Euler(Math.sin(angle) * lean, Math.random() * Math.PI * 2, -Math.cos(angle) * lean))
      this.spikes.push({ x, z, height: tall * (0.6 + Math.random() * 0.5), width: radius * (0.1 + Math.random() * 0.05), tilt, color: tone(), age: -index * 0.012 })
    }
    this.shatter(at, 18, 10, 4, 460)
  }

  /**
   * Rock splinters this frame (see `SplintersEffect`): each a shard `size`
   * long at `x`, `y` (height), `z`, its long axis along `along` (world: the
   * floor's x, height, the floor's y), turned `roll` about it.
   */
  splinters(list: ReadonlyArray<{ readonly x: number; readonly y: number; readonly z: number; readonly along: Vector3; readonly roll: number; readonly size: number }>): void {
    const shown = Math.min(MAX_SPLINTERS, list.length)
    const up = new Vector3(0, 1, 0)
    const spin = new Quaternion()
    for (let index = 0; index < shown; index++) {
      const splinter = list[index]!
      this.turn.setFromUnitVectors(up, splinter.along)
      spin.setFromAxisAngle(up, splinter.roll)
      this.turn.multiply(spin)
      this.position.set(splinter.x, splinter.y, splinter.z)
      this.scale.set(splinter.size, splinter.size, splinter.size)
      this.matrix.compose(this.position, this.turn, this.scale)
      this.splinterMesh.setMatrixAt(index, this.matrix)
      this.splinterMesh.setColorAt(index, index % 3 === 0 ? this.light : this.middle)
    }
    showInstances(this.splinterMesh, shown)
  }

  /** Chunks of stone thrown up and out from `at` (a floor point), `height` up. */
  shatter(at: Vec2, count: number, height: number, size: number, speed: number): void {
    for (let index = 0; index < count && this.chunks.length < MAX_CHUNKS; index++) {
      const angle = Math.random() * Math.PI * 2
      const out = speed * (0.35 + Math.random() * 0.65)
      this.chunks.push({
        x: at.x,
        y: height,
        z: at.y,
        vx: Math.cos(angle) * out,
        vy: speed * (0.5 + Math.random() * 0.8),
        vz: Math.sin(angle) * out,
        size: size * (0.5 + Math.random() * 0.7),
        spin: new Vector3(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(14),
        turn: new Euler(Math.random() * 6, Math.random() * 6, 0),
        color: tone(),
        life: 1.2
      })
    }
  }

  update(seconds: number): void {
    for (let index = this.spikes.length - 1; index >= 0; index--) {
      const spike = this.spikes[index]!
      spike.age += seconds
      if (spike.age < RISE + STAND + SINK) continue
      this.spikes[index] = this.spikes[this.spikes.length - 1]!
      this.spikes.pop()
    }
    for (let index = this.chunks.length - 1; index >= 0; index--) {
      const chunk = this.chunks[index]!
      chunk.life -= seconds
      chunk.vy -= GRAVITY * seconds
      chunk.x += chunk.vx * seconds
      chunk.y += chunk.vy * seconds
      chunk.z += chunk.vz * seconds
      chunk.turn.x += chunk.spin.x * seconds
      chunk.turn.y += chunk.spin.y * seconds
      chunk.turn.z += chunk.spin.z * seconds
      // Landed, it rests a moment and is gone.
      if (chunk.y <= chunk.size * 0.5) {
        chunk.y = chunk.size * 0.5
        chunk.vx *= 0.6
        chunk.vz *= 0.6
        chunk.vy = Math.abs(chunk.vy) > 120 ? Math.abs(chunk.vy) * 0.25 : 0
        chunk.spin.multiplyScalar(0.5)
      }
      if (chunk.life > 0) continue
      this.chunks[index] = this.chunks[this.chunks.length - 1]!
      this.chunks.pop()
    }
    this.draw()
  }

  dispose(): void {
    for (const mesh of [this.plateMesh, this.spikeMesh, this.chunkMesh, this.splinterMesh]) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      ;(mesh.material as MeshStandardMaterial).dispose()
      mesh.dispose()
    }
  }

  private draw(): void {
    let shown = 0
    for (const spike of this.spikes) {
      if (spike.age < 0) continue
      // Out of the floor with an overshoot, standing, then sinking back into it.
      const t = spike.age
      const grown = t < RISE ? 1.18 * Math.sin((t / RISE) * (Math.PI / 2)) : t < RISE + 0.08 ? 1.18 - 0.18 * ((t - RISE) / 0.08) : 1
      const sunk = t < RISE + STAND ? 0 : (t - RISE - STAND) / SINK
      const height = spike.height * grown
      this.position.set(spike.x, -spike.height * sunk * sunk, spike.z)
      this.scale.set(spike.width * (1 - 0.3 * sunk), height, spike.width * (1 - 0.3 * sunk))
      this.matrix.compose(this.position, spike.tilt, this.scale)
      this.spikeMesh.setMatrixAt(shown, this.matrix)
      this.spikeMesh.setColorAt(shown, spike.color)
      shown += 1
    }
    showInstances(this.spikeMesh, shown)
    this.chunks.forEach((chunk, index) => {
      const size = chunk.size * Math.min(1, chunk.life / 0.3)
      this.position.set(chunk.x, chunk.y, chunk.z)
      this.turn.setFromEuler(chunk.turn)
      this.scale.set(size, size, size)
      this.matrix.compose(this.position, this.turn, this.scale)
      this.chunkMesh.setMatrixAt(index, this.matrix)
      this.chunkMesh.setColorAt(index, chunk.color)
    })
    showInstances(this.chunkMesh, this.chunks.length)
  }

  get active(): number {
    return this.spikes.length + this.chunks.length
  }
}
