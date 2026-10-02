/**
 * Many copies of one shape drawn in a single draw call (instancing): enemy
 * bodies of a size, projectiles, blob shadows. A swarm of separate meshes
 * costs a draw call each, which phones cannot afford.
 *
 * A node holds an `Instance`: a plain `Object3D` placed in the node's tree
 * like a mesh would be (so recoil and interpolation move it as usual), with
 * its own color. While the node is in the scene its instances belong to
 * their batches; every frame the batch copies their transforms and colors.
 */
import { Color, DynamicDrawUsage, InstancedMesh, Object3D } from "three"
import type { BufferGeometry, Group, Material } from "three"

export class Instance {
  /** Where it is: parented in the node's tree like a mesh. */
  readonly object = new Object3D()
  readonly color = new Color(0xffffff)
  /** Its batch; may change while it is out of the scene (a pooled projectile changing shape). */
  batch: Batch
  /** Its slot in the batch, or -1 while out of it. */
  index = -1

  constructor(batch: Batch) {
    this.batch = batch
  }
}

export class Batch {
  private mesh: InstancedMesh
  private readonly members: Array<Instance> = []
  private readonly parent: Group
  private readonly geometry: BufferGeometry
  private readonly material: Material

  constructor(parent: Group, geometry: BufferGeometry, material: Material, options: { readonly order?: number } = {}) {
    this.parent = parent
    this.geometry = geometry
    this.material = material
    this.mesh = this.makeMesh(64, options.order ?? 0)
  }

  get size(): number {
    return this.members.length
  }

  add(instance: Instance): void {
    if (instance.index !== -1) return
    instance.index = this.members.length
    this.members.push(instance)
    if (this.members.length > this.mesh.instanceMatrix.count) {
      const old = this.mesh
      this.mesh = this.makeMesh(old.instanceMatrix.count * 2, old.renderOrder)
      old.removeFromParent()
      old.dispose()
    }
  }

  remove(instance: Instance): void {
    const index = instance.index
    if (index === -1 || this.members[index] !== instance) return
    const last = this.members.pop()!
    if (last !== instance) {
      this.members[index] = last
      last.index = index
    }
    instance.index = -1
  }

  /** Copies this frame's transforms (world matrices must be current) and colors. */
  flush(): void {
    const mesh = this.mesh
    const members = this.members
    for (let index = 0; index < members.length; index++) {
      const member = members[index]!
      mesh.setMatrixAt(index, member.object.matrixWorld)
      mesh.setColorAt(index, member.color)
    }
    mesh.count = members.length
    mesh.instanceMatrix.clearUpdateRanges()
    mesh.instanceMatrix.addUpdateRange(0, members.length * 16)
    mesh.instanceMatrix.needsUpdate = true
    if (mesh.instanceColor !== null) {
      mesh.instanceColor.clearUpdateRanges()
      mesh.instanceColor.addUpdateRange(0, members.length * 3)
      mesh.instanceColor.needsUpdate = true
    }
  }

  dispose(): void {
    this.mesh.removeFromParent()
    this.mesh.dispose()
  }

  private makeMesh(capacity: number, order: number): InstancedMesh {
    const mesh = new InstancedMesh(this.geometry, this.material, capacity)
    mesh.instanceMatrix.setUsage(DynamicDrawUsage)
    // Allocates the per-instance colors.
    mesh.setColorAt(0, new Color(0xffffff))
    mesh.instanceColor!.setUsage(DynamicDrawUsage)
    mesh.count = 0
    // Its instances move every frame: bounds computed once would cull them wrongly.
    mesh.frustumCulled = false
    mesh.renderOrder = order
    this.parent.add(mesh)
    return mesh
  }
}
