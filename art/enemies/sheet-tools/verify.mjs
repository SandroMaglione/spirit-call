/** Read each static GLB through the same Three.js loader used by the game. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Box3 } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

for (const kind of process.argv.slice(2)) {
  const here = resolve('art/enemies', kind, 'production');
  const bytes = readFileSync(resolve(here, `${kind}-model.glb`));
  const gltf = await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength), '');
  gltf.scene.updateMatrixWorld(true);
  const meshes = [], materials = new Set();
  let triangles = 0;
  gltf.scene.traverse(node => {
    if (node.isCamera || node.isLight || node.isBone || node.isSkinnedMesh) throw Error(`Unexpected review node: ${node.name}`);
    if (!node.isMesh) return;
    meshes.push(node.name); materials.add(node.material);
    if (!node.geometry.attributes.color) throw Error(`Missing facet colors: ${node.name}`);
    triangles += (node.geometry.index?.count ?? node.geometry.attributes.position.count) / 3;
  });
  const box = new Box3().setFromObject(gltf.scene);
  const audit = JSON.parse(readFileSync(resolve(here, 'audit.json')));
  if (gltf.animations.length || materials.size !== 1 || triangles >= 2000) throw Error('Static review contract failed');
  if (Math.abs(box.min.y) > .00001 || Math.abs(box.max.y - audit.height_m) > .00001) throw Error('Ground or height mismatch');
  if (triangles !== audit.triangles) throw Error(`Triangle mismatch ${triangles} != ${audit.triangles}`);
  const result = { kind, loader: 'Three.js GLTFLoader', meshes, materials: materials.size, triangles,
    animations: gltf.animations.length, bounds_gltf_m: { min: box.min.toArray(), max: box.max.toArray() },
    sha256: createHash('sha256').update(bytes).digest('hex'), status: 'passed: static review asset, before rigging' };
  writeFileSync(resolve(here, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(kind, result.status, triangles, 'triangles');
}
