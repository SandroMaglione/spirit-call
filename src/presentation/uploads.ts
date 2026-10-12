/**
 * Uploading only what is drawn: a buffer marked for upload with no range
 * goes up whole every frame (a thousand instances' matrices for the few
 * shown). These mark just the part in use, and nothing when none is.
 */
import type { BufferAttribute, InstancedBufferAttribute, InstancedMesh } from "three"

/** Marks the first `count` items of `attribute` to upload this frame. */
export const uploadFirst = (attribute: BufferAttribute | InstancedBufferAttribute, count: number): void => {
  attribute.clearUpdateRanges()
  if (count <= 0) return
  attribute.addUpdateRange(0, count * attribute.itemSize)
  attribute.needsUpdate = true
}

/** Shows the first `count` instances of `mesh`, uploading only their matrices and colors. */
export const showInstances = (mesh: InstancedMesh, count: number): void => {
  mesh.count = count
  uploadFirst(mesh.instanceMatrix, count)
  if (mesh.instanceColor !== null) uploadFirst(mesh.instanceColor, count)
}
