/** Depth-tested light in the arena: launch flashes and wind wrapping the spirit.
 * One bounded batch keeps repeated shots and ribbon segments cheap on phones. */
import { AdditiveBlending, Color, CylinderGeometry, InstancedMesh, Matrix4, MeshBasicMaterial, Quaternion, Vector3 } from "three"
import type { Object3D } from "three"
import type { Vec2 } from "../math/vec.ts"
import { showInstances } from "./uploads.ts"

export type ShotLook = "round" | "spark" | "orb" | "enemy"
type Point = { readonly x: number; readonly y: number; readonly z: number }
type Pulse = { readonly at: Point; readonly direction: Vec2; readonly color: number; readonly look: ShotLook | "disc"; age: number }
const capacity = 1024

export class CombatLight {
  private readonly mesh: InstancedMesh
  private readonly pulses: Array<Pulse> = []
  private readonly gusts: Array<{ readonly at: Vec2; readonly radius: number; age: number }> = []
  private readonly lobs = new Set<number>()
  private readonly drawnLobs = new Set<number>()
  private readonly matrix = new Matrix4()
  private readonly position = new Vector3()
  private readonly direction = new Vector3()
  private readonly scale = new Vector3()
  private readonly rotation = new Quaternion()
  private readonly up = new Vector3(0, 1, 0)
  private readonly color = new Color()
  private shown = 0

  constructor(parent: Object3D) {
    this.mesh = new InstancedMesh(new CylinderGeometry(1, 1, 1, 5), new MeshBasicMaterial({ transparent: true, blending: AdditiveBlending, depthWrite: false }), capacity)
    this.mesh.frustumCulled = false
    this.mesh.count = 0
    this.mesh.setColorAt(0, new Color())
    parent.add(this.mesh)
  }

  begin(seconds: number): void {
    this.shown = 0
    this.drawnLobs.clear()
    for (let index = this.pulses.length - 1; index >= 0; index--) {
      const pulse = this.pulses[index]!
      pulse.age += seconds
      if (pulse.age > 0.18) this.pulses.splice(index, 1)
    }
    for (let index = this.gusts.length - 1; index >= 0; index--) {
      const gust = this.gusts[index]!
      gust.age += seconds
      if (gust.age > 0.4) this.gusts.splice(index, 1)
    }
  }

  launch(at: Vec2, height: number, direction: Vec2, color: number, look: Pulse["look"]): void {
    if (this.pulses.length < 64) this.pulses.push({ at: { x: at.x, y: height, z: at.y }, direction, color, look, age: 0 })
  }

  gust(at: Vec2, radius: number): void {
    if (this.gusts.length < 8) this.gusts.push({ at, radius, age: 0 })
  }

  lob(id: number, at: Point, muzzle: Point, direction: Vec2, flight: number, color: number): void {
    this.drawnLobs.add(id)
    if (!this.lobs.has(id)) {
      this.lobs.add(id)
      this.launch({ x: muzzle.x, y: muzzle.z }, muzzle.y, direction, color, "round")
    }
    // A chunky shell with a hot fuse, distinct from a straight flying round.
    this.line({ x: at.x, y: at.y - 4, z: at.z }, { x: at.x, y: at.y + 4, z: at.z }, 5, color)
    this.line({ x: at.x, y: at.y + 4, z: at.z }, { x: at.x, y: at.y + 7, z: at.z }, 1.5, 0xfff4cf)
    if (flight > 0 && flight < 1) this.line({ x: at.x - direction.x * 18, y: at.y - 6, z: at.z - direction.y * 18 }, at, 1.8, color, 0.5)
  }

  line(from: Point, to: Point, width: number, color: number, alpha = 1): void {
    if (this.shown >= capacity || alpha <= 0 || width <= 0) return
    this.direction.set(to.x - from.x, to.y - from.y, to.z - from.z)
    const length = this.direction.length()
    if (length < 1e-5) return
    this.rotation.setFromUnitVectors(this.up, this.direction.divideScalar(length))
    this.position.set((from.x + to.x) / 2, (from.y + to.y) / 2, (from.z + to.z) / 2)
    this.scale.set(width, length, width)
    this.matrix.compose(this.position, this.rotation, this.scale)
    this.mesh.setMatrixAt(this.shown, this.matrix)
    this.mesh.setColorAt(this.shown++, this.color.setHex(color).multiplyScalar(alpha))
  }

  ribbon(points: ReadonlyArray<Point>, width: number, color: number, alpha = 1): void {
    for (let index = 1; index < points.length; index++) {
      const taper = Math.sin((index / points.length) * Math.PI) ** 0.7
      this.line(points[index - 1]!, points[index]!, width * taper, color, alpha * taper)
    }
  }

  finish(): void {
    for (const id of this.lobs) if (!this.drawnLobs.has(id)) this.lobs.delete(id)
    for (const gust of this.gusts) {
      const t = gust.age / 0.4
      for (let arm = 0; arm < 3; arm++) {
        const points = Array.from({ length: 19 }, (_, index) => {
          const a = arm * Math.PI * 2 / 3 + index / 18 * 1.5 + t * 2
          const radius = gust.radius * (0.2 + 0.8 * Math.sqrt(t))
          return { x: gust.at.x + Math.cos(a) * radius, y: 4 + t * 24 + Math.sin(a * 2) * 3, z: gust.at.y + Math.sin(a) * radius }
        })
        this.ribbon(points, 2.5 * (1 - t), 0xbaffdc, 0.8 * (1 - t))
      }
    }
    for (const pulse of this.pulses) {
      const t = pulse.age / 0.18
      const fade = (1 - t) ** 2
      const { at, direction: d } = pulse
      const point = (along: number, side: number, up: number): Point => ({ x: at.x + d.x * along - d.y * side, y: at.y + up, z: at.z + d.y * along + d.x * side })
      if (pulse.look === "round" || pulse.look === "enemy") {
        // A short hot jet and sparks, with a hard initial pop.
        this.line(point(-2, 0, 0), point(12 + 16 * t, 0, 0), 3 * fade, 0xfff4cd, fade)
        for (let ray = 0; ray < 5; ray++) {
          const a = ray * Math.PI * 2 / 5
          this.line(point(2 + t * 12, Math.cos(a) * 3, Math.sin(a) * 3), point(10 + t * 24, Math.cos(a) * (7 + t * 8), Math.sin(a) * (7 + t * 8)), 1.2 * fade, pulse.color, fade)
        }
      } else {
        // A conjuring ring opens across the flight direction, then collapses.
        const points = Array.from({ length: 25 }, (_, index) => {
          const a = index * Math.PI * 2 / 24
          const radius = (pulse.look === "disc" ? 16 : 10) * (0.7 + t)
          return point(t * 8, Math.cos(a) * radius, Math.sin(a) * radius)
        })
        this.ribbon(points, 1.6 * fade, pulse.color, fade)
        this.line(point(-3, 0, 0), point(10, 0, 0), 3 * fade, 0xffffff, fade)
      }
    }
    showInstances(this.mesh, this.shown)
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshBasicMaterial).dispose()
    this.mesh.dispose()
  }
}
