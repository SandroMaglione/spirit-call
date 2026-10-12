/**
 * What a moving spirit sheds, in the 3D scene (not the flat overlay), so
 * the body hides what is behind it: drops (water) leave from its back, arc
 * up a little, fall to the floor, and may leave a ripple that spreads and
 * fades there; embers (fire) drift up and back, shrinking as they burn out;
 * wisps (wind) curl away as they drift back, lifting a little and fading.
 * Two instanced meshes (particles, ripples), reused; positions in world
 * units (the floor's x, height, the floor's y).
 */
import { AdditiveBlending, Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, RingGeometry, Vector3 } from "three"
import type { Object3D } from "three"
import type { Vec2 } from "@typeonce/bevy-ts-math/Vec2"

import { showInstances } from "./uploads.ts"

/** How a shed particle moves: a drop falls (and may ripple), an ember rises, a wisp curls. */
export type TrailKind = "drop" | "ember" | "wisp"

interface Drop {
  x: number
  y: number
  z: number
  vx: number
  vy: number
  vz: number
  size: number
  color: Color
  life: number
  maxLife: number
  kind: TrailKind
  /** A wisp's turn (radians per second, either way). */
  spin: number
}

interface Ripple {
  x: number
  z: number
  radius: number
  color: Color
  life: number
  maxLife: number
}

const MAX_DROPS = 256
const MAX_RIPPLES = 96
/** Pull toward the floor, world units per second squared (embers rise, gently). */
const GRAVITY = 420
const EMBER_LIFT = 90
const WISP_LIFT = 35

export class DropTrail {
  private readonly drops: Array<Drop> = []
  private readonly ripples: Array<Ripple> = []
  private readonly dropMesh: InstancedMesh
  private readonly rippleMesh: InstancedMesh
  private readonly matrix = new Matrix4()
  private readonly position = new Vector3()
  private readonly scale = new Vector3()
  private readonly turn = new Quaternion()
  private readonly flat = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -Math.PI / 2)
  private readonly faded = new Color()

  constructor(parent: Object3D) {
    this.dropMesh = new InstancedMesh(new IcosahedronGeometry(1, 1), new MeshBasicMaterial(), MAX_DROPS)
    this.rippleMesh = new InstancedMesh(new RingGeometry(0.72, 1, 24), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false }), MAX_RIPPLES)
    for (const mesh of [this.dropMesh, this.rippleMesh]) {
      mesh.count = 0
      mesh.frustumCulled = false
      // Instance colors (white until set).
      mesh.setColorAt(0, new Color(0xffffff))
      parent.add(mesh)
    }
  }

  /**
   * A drop leaving `from` (a floor point), `height` up, thrown along `back`
   * (a floor direction) at `speed`, `size` world units across.
   */
  emit(from: Vec2, height: number, back: Vec2, speed: number, size: number, color: number, kind: TrailKind = "drop"): void {
    if (this.drops.length >= MAX_DROPS) return
    const side = (Math.random() - 0.5) * speed * 0.6
    const life = kind === "ember" ? 0.7 + Math.random() * 0.6 : kind === "wisp" ? 0.8 + Math.random() * 0.5 : 2
    this.drops.push({
      x: from.x,
      y: height,
      z: from.y,
      vx: back.x * speed - back.y * side,
      vy: kind === "drop" ? 60 + Math.random() * 80 : kind === "ember" ? 20 + Math.random() * 40 : 5 + Math.random() * 20,
      vz: back.y * speed + back.x * side,
      size,
      color: new Color(color),
      life,
      maxLife: life,
      kind,
      spin: (Math.random() < 0.5 ? -1 : 1) * (4 + Math.random() * 4)
    })
  }

  update(seconds: number): void {
    for (let index = this.drops.length - 1; index >= 0; index--) {
      const drop = this.drops[index]!
      drop.life -= seconds
      if (drop.kind === "ember") {
        // Rising, slowing sideways.
        const drag = Math.exp(-2.5 * seconds)
        drop.vx *= drag
        drop.vz *= drag
        drop.vy += EMBER_LIFT * seconds
      } else if (drop.kind === "wisp") {
        // Curling: its way along the floor turns as it slows; lifting a little.
        const drag = Math.exp(-1.5 * seconds)
        const turn = drop.spin * seconds
        const cos = Math.cos(turn)
        const sin = Math.sin(turn)
        const vx = drop.vx
        drop.vx = (vx * cos - drop.vz * sin) * drag
        drop.vz = (vx * sin + drop.vz * cos) * drag
        drop.vy += WISP_LIFT * seconds
      } else {
        drop.vy -= GRAVITY * seconds
      }
      drop.x += drop.vx * seconds
      drop.y += drop.vy * seconds
      drop.z += drop.vz * seconds
      if (drop.y <= 0 || drop.life <= 0) {
        // Landed: about half leave a ripple.
        if (drop.kind === "drop" && drop.y <= 0 && Math.random() < 0.55 && this.ripples.length < MAX_RIPPLES) {
          const life = 1.1 + Math.random() * 0.5
          this.ripples.push({ x: drop.x, z: drop.z, radius: drop.size * (2.5 + Math.random() * 1.5), color: drop.color, life, maxLife: life })
        }
        this.drops[index] = this.drops[this.drops.length - 1]!
        this.drops.pop()
      }
    }
    for (let index = this.ripples.length - 1; index >= 0; index--) {
      const ripple = this.ripples[index]!
      ripple.life -= seconds
      if (ripple.life <= 0) {
        this.ripples[index] = this.ripples[this.ripples.length - 1]!
        this.ripples.pop()
      }
    }
    this.draw()
  }

  dispose(): void {
    for (const mesh of [this.dropMesh, this.rippleMesh]) {
      mesh.removeFromParent()
      mesh.geometry.dispose()
      ;(mesh.material as MeshBasicMaterial).dispose()
      mesh.dispose()
    }
  }

  private draw(): void {
    this.drops.forEach((drop, index) => {
      // Stretched along its fall a little; embers and wisps shrink as they fade.
      const stretch = 1 + Math.min(0.8, Math.abs(drop.vy) / 600)
      const size = drop.kind === "drop" ? drop.size : drop.size * Math.max(0, drop.life / drop.maxLife)
      this.position.set(drop.x, drop.y, drop.z)
      this.scale.set(size / stretch ** 0.5, size * stretch, size / stretch ** 0.5)
      this.matrix.compose(this.position, this.turn.identity(), this.scale)
      this.dropMesh.setMatrixAt(index, this.matrix)
      this.dropMesh.setColorAt(index, drop.color)
    })
    showInstances(this.dropMesh, this.drops.length)
    this.ripples.forEach((ripple, index) => {
      const t = 1 - ripple.life / ripple.maxLife
      const radius = ripple.radius * (0.35 + 0.65 * Math.sqrt(t))
      this.position.set(ripple.x, 0.6, ripple.z)
      this.scale.set(radius, radius, radius)
      this.matrix.compose(this.position, this.flat, this.scale)
      this.rippleMesh.setMatrixAt(index, this.matrix)
      // Additive: fading is darkening.
      this.rippleMesh.setColorAt(index, this.faded.copy(ripple.color).multiplyScalar(0.7 * (1 - t)))
    })
    showInstances(this.rippleMesh, this.ripples.length)
  }

  get active(): number {
    return this.drops.length + this.ripples.length
  }
}

