/** Read each static GLB through the same Three.js loader used by the game. */
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { createHash } from 'node:crypto';
import { Box3, Vector3 } from 'three';
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
  const shell = kind === 'gale-caster' ? 'PointedHood' : 'Helmet';
  const prefixes = kind === 'gale-caster' ? ['FaceVoid', 'HoodLip', 'ShadowCheek', 'Eye', 'EyeSocket', 'EyeCore']
    : ['FaceRecess', 'HelmetBinding', 'Brow', 'Eye', 'EyeSocket', 'EyeCore', 'ForeheadCrest', 'NoseGuard'];
  const samples = node => {
    const pos = node.geometry.attributes.position, color = node.geometry.attributes.color;
    return Array.from({ length: pos.count }, (_, i) => ({
      p: new Vector3().fromBufferAttribute(pos, i).applyMatrix4(node.matrixWorld),
      c: [color.getX(i), color.getY(i), color.getZ(i)],
    }));
  };
  const symmetry = { centerline: 'world X = 0', tolerance_m: .000001, max_position_error_m: 0, max_color_error: 0, checked: [] };
  for (const name of [shell, ...prefixes.map(p => p + 'L')]) {
    const left = gltf.scene.getObjectByName(name);
    const right = gltf.scene.getObjectByName(name === shell ? name : name.slice(0, -1) + 'R');
    if (!left || !right) throw Error(`Missing symmetric face part: ${name}`);
    const a = samples(left), b = samples(right);
    if (a.length !== b.length) throw Error(`Unequal mirrored vertex counts: ${name}`);
    for (const v of a) {
      const reflected = v.p.clone(); reflected.x *= -1;
      const nearest = Math.min(...b.map(w => reflected.distanceTo(w.p)));
      const candidates = b.filter(w => reflected.distanceTo(w.p) < symmetry.tolerance_m);
      if (!candidates.length) throw Error(`Asymmetric face geometry: ${name}, ${nearest}m`);
      const colorError = Math.min(...candidates.map(w => Math.max(...v.c.map((c, i) => Math.abs(c - w.c[i])))));
      if (colorError > .000001) throw Error(`Asymmetric facet colors: ${name}, ${colorError}`);
      symmetry.max_position_error_m = Math.max(symmetry.max_position_error_m, nearest);
      symmetry.max_color_error = Math.max(symmetry.max_color_error, colorError);
    }
    symmetry.checked.push(name === shell ? name : name.slice(0, -1) + '.L/.R');
  }
  const result = { kind, loader: 'Three.js GLTFLoader', meshes, materials: materials.size, triangles,
    face_symmetry: symmetry,
    animations: gltf.animations.length, bounds_gltf_m: { min: box.min.toArray(), max: box.max.toArray() },
    sha256: createHash('sha256').update(bytes).digest('hex'), status: 'passed: static review asset, before rigging' };
  writeFileSync(resolve(here, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(kind, result.status, triangles, 'triangles');
}
