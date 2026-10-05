/** Batched protective stones, rising pillars and debris, all cosmetic. */
import { Color, IcosahedronGeometry, InstancedMesh, Matrix4, MeshStandardMaterial, Quaternion, Vector3 } from "three"
import type { Object3D } from "three"
import { Cast, Game, GuardBlocked, Health, HitStop, Member, Player, Position, PrevPosition, RenderClock, RenderHost, Run, StoneGuard } from "../schema.ts"
import type { Vec2 } from "../math/vec.ts"
import { lerp } from "../math/vec.ts"
import { projection, view } from "../config/view.ts"
import { toScreen } from "../math/iso.ts"
import { stoneRiseTargets } from "../features/rock.ts"

interface Pillar { at: Vec2; age: number; turn: number }
interface Chip { at: Vector3; velocity: Vector3; age: number; size: number }

export class RockEffects {
  private readonly mesh: InstancedMesh
  private readonly matrix = new Matrix4()
  private readonly position = new Vector3()
  private readonly scale = new Vector3()
  private readonly rotation = new Quaternion()
  private readonly axis = new Vector3(0, 1, 0)
  private readonly color = new Color()
  private readonly pillars: Array<Pillar> = []
  private readonly chips: Array<Chip> = []
  private clock = 0
  private stepDistance = 0
  private last: Vec2 | null = null
  private runTime = 0

  syncRun(time: number): void {
    if (time < this.runTime) {
      this.pillars.length = 0
      this.chips.length = 0
      this.last = null
      this.stepDistance = 0
      this.clock = 0
      this.mesh.count = 0
    }
    this.runTime = time
  }

  constructor(parent: Object3D) {
    const geometry = new IcosahedronGeometry(1, 0)
    const positions = geometry.getAttribute("position")
    let low = Infinity, high = -Infinity
    for (let i = 0; i < positions.count; i++) { low = Math.min(low, positions.getY(i)); high = Math.max(high, positions.getY(i)) }
    for (let i = 0; i < positions.count; i++) positions.setY(i, (positions.getY(i) - low) * 2 / (high - low))
    geometry.computeVertexNormals()
    this.mesh = new InstancedMesh(geometry, new MeshStandardMaterial({ color: 0xc2a181, roughness: .96, flatShading: true }), 192)
    this.mesh.name = "RockEffects"
    this.mesh.count = 0
    this.mesh.frustumCulled = false
    parent.add(this.mesh)
  }

  rise(at: Vec2): void {
    if (this.pillars.length < 24) this.pillars.push({ at, age: 0, turn: Math.random() * Math.PI })
    this.debris(at, 16)
  }

  debris(at: Vec2, count: number): void {
    for (let i = 0; i < count && this.chips.length < 150; i++) {
      const angle = Math.random() * Math.PI * 2, speed = 25 + Math.random() * 60
      this.chips.push({ at: new Vector3(at.x, 2, at.y),
        velocity: new Vector3(Math.cos(angle) * speed, 60 + Math.random() * 80, Math.sin(angle) * speed),
        age: 0, size: 1.2 + Math.random() * 2 })
    }
  }

  walk(at: Vec2 | null): boolean {
    if (at === null) { this.last = null; this.stepDistance = 0; return false }
    const distance = this.last === null ? 0 : Math.hypot(at.x - this.last.x, at.y - this.last.y)
    this.last = at
    // A switch or dash is not a walking step.
    if (distance > 20) { this.stepDistance = 0; return false }
    this.stepDistance += distance
    if (this.stepDistance < 57.5) return false
    this.stepDistance %= 57.5
    return true
  }

  update(seconds: number, guard: { at: Vec2; stones: number; remaining: number } | null, playing: boolean): void {
    if (!playing) { this.pillars.length = 0; this.chips.length = 0; this.last = null; this.mesh.count = 0; return }
    this.clock += seconds
    let index = 0
    const draw = (at: Vector3, scale: Vector3, turn: number, color: number) => {
      if (index >= 192) return
      this.matrix.compose(at, this.rotation.setFromAxisAngle(this.axis, turn), scale)
      this.mesh.setMatrixAt(index, this.matrix)
      this.mesh.setColorAt(index, this.color.set(color))
      index++
    }
    if (guard !== null) {
      for (let stone = 0; stone < guard.stones; stone++) {
        // Fixed thirds keep the lost stones visible as gaps in the defense.
        const angle = this.clock * .55 + stone * Math.PI * 2 / 3
        const size = Math.min(1, guard.remaining / .3)
        this.position.set(guard.at.x + Math.cos(angle) * 37, 16 + Math.sin(this.clock * 2.4 + stone) * 2, guard.at.y + Math.sin(angle) * 37)
        draw(this.position, this.scale.set(8 * size, 10 * size, 7 * size), angle, 0xffdf9d)
      }
    }
    for (let i = this.pillars.length - 1; i >= 0; i--) {
      const pillar = this.pillars[i]!
      pillar.age += seconds
      if (pillar.age >= 1.1) { this.pillars.splice(i, 1); continue }
      const rise = Math.min(1, pillar.age / .08)
      const sink = Math.max(0, (pillar.age - .65) / .45)
      const height = 62 * (1 - sink)
      this.position.set(pillar.at.x, -62 * (1 - rise), pillar.at.y)
      draw(this.position, this.scale.set(25 * (1 - sink * .4), height / 2, 22 * (1 - sink * .4)), pillar.turn, 0xdac2a2)
    }
    for (let i = this.chips.length - 1; i >= 0; i--) {
      const chip = this.chips[i]!
      chip.age += seconds
      chip.velocity.y -= seconds * 320
      chip.at.addScaledVector(chip.velocity, seconds)
      if (chip.age >= .8 || chip.at.y < 0) { this.chips.splice(i, 1); continue }
      const size = chip.size * Math.min(1, (.8 - chip.age) / .2)
      draw(chip.at, this.scale.set(size, size / 2, size), chip.age * 3, 0xbda180)
    }
    this.mesh.count = index
    this.mesh.instanceMatrix.needsUpdate = true
    if (this.mesh.instanceColor !== null) this.mesh.instanceColor.needsUpdate = true
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.geometry.dispose()
    ;(this.mesh.material as MeshStandardMaterial).dispose()
    this.mesh.dispose()
  }
}

export const DrawRockEffects = Game.System("Shooter/DrawRockEffects", {
  queries: { player: Game.Query({ selection: { position: Game.Query.read(Position), previous: Game.Query.read(PrevPosition),
    member: Game.Query.read(Member), guard: Game.Query.read(StoneGuard), health: Game.Query.read(Health) }, with: [Player] }) },
  events: { cast: Game.System.readEvent(Cast), block: Game.System.readEvent(GuardBlocked) },
  resources: { hitStop: Game.System.readResource(HitStop), run: Game.System.readResource(Run) },
  services: { host: Game.System.service(RenderHost), clock: Game.System.service(RenderClock) }
}, ({ queries, events, resources, services }) => {
  const host = services.host
  host.rocks.syncRun(resources.run.get().time)
  for (const cast of events.cast.all()) {
    if (cast.effect.kind === "stoneRise") {
      for (const at of stoneRiseTargets(cast.from, cast.direction, cast.effect.spacing)) {
        host.rocks.rise(at)
        host.fx.burst(toScreen(projection, at), { color: 0xbfa181, count: 18, speed: 140, size: 4, life: .55, gravity: -35, drag: 3 })
      }
      host.feedback.shake = Math.max(host.feedback.shake, 5)
      host.feedback.punch = Math.max(host.feedback.punch, .4)
    }
    if (cast.effect.kind === "stoneGuard") host.fx.ring(toScreen(projection, cast.from), 44 * projection.zoom, view.elements.rock, .4)
  }
  for (const block of events.block.all()) {
    host.rocks.debris(block.at, 12)
    host.fx.ring(toScreen(projection, block.at), 36 * projection.zoom, view.elements.rock, .25)
    host.fx.flash(toScreen(projection, block.at), 22, 0xffdf9d, .1)
  }
  const player = queries.player.each()[0]
  const at = player === undefined ? null : lerp(player.data.previous.get(), player.data.position.get(), services.clock.alpha)
  const rock = player?.data.member.get().character === "stonekeeper" && player.data.health.get().current > 0
  if (host.rocks.walk(rock ? at : null) && at !== null) {
    host.fx.burst(toScreen(projection, at), { color: 0xbfa181, count: 4, speed: 35, size: 2, life: .25, gravity: -20, drag: 4 })
  }
  const guard = player?.data.guard.get()
  const protectedBy = at !== null && guard !== undefined && guard.remaining > 0 && guard.stones > 0 && player!.data.health.get().current > 0
    ? { at, ...guard } : null
  host.rocks.update(resources.hitStop.get().remaining > 0 ? 0 : services.clock.frameSeconds, protectedBy, player !== undefined)
})
