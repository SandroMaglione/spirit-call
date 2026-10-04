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
  const positions = node => Array.from({ length: node.geometry.attributes.position.count }, (_, i) =>
    new Vector3().fromBufferAttribute(node.geometry.attributes.position, i).applyMatrix4(node.matrixWorld));
  const mirrorError = (a, b) => Math.max(...a.map(p =>
    Math.min(...b.map(q => new Vector3(-p.x, p.y, p.z).distanceTo(q)))));
  const symmetry = {};
  for (const prefix of ['Eye', 'EyeSocket', 'EyeRim', 'AngryBrow']) {
    const left = gltf.scene.getObjectByName(`${prefix}L`);
    const right = gltf.scene.getObjectByName(`${prefix}R`);
    if (!left && !right) continue;
    if (!left || !right) throw Error(`Incomplete face pair: ${prefix}`);
    const a = positions(left), b = positions(right);
    if (a.length !== b.length) throw Error(`Unequal face topology: ${prefix}`);
    const error = mirrorError(a, b);
    if (error > .000001) throw Error(`Asymmetric ${prefix}: ${error} meters`);
    symmetry[prefix] = error;
  }
  if (!('Eye' in symmetry)) throw Error('Missing mirrored eye cores');
  let bombDiameters;
  if (kind === 'charger') {
    const bomb = gltf.scene.getObjectByName('HandBomb');
    bombDiameters = new Box3().setFromObject(bomb).getSize(new Vector3()).toArray();
    if (Math.max(...bombDiameters) / Math.min(...bombDiameters) > 1.01) throw Error('Hand bomb is flattened');
  }
  let guardianDetails;
  if (kind === 'guardian') {
    const details = {};
    for (const name of ['Breastplate', 'Helmet', 'GoldenCrest', 'Pauldron', 'GoldShoulderTrim', 'ElbowBand']) {
      const center = gltf.scene.getObjectByName(name);
      const left = center ?? gltf.scene.getObjectByName(`${name}L`);
      const right = center ?? gltf.scene.getObjectByName(`${name}R`);
      if (!left || !right) throw Error(`Missing Guardian detail: ${name}`);
      const error = mirrorError(positions(left), positions(right));
      if (error > .000001) throw Error(`Asymmetric Guardian ${name}: ${error}`);
      details[name] = error;
    }
    const ball = new Box3().setFromObject(gltf.scene.getObjectByName('MaceHead'));
    const diameters = ball.getSize(new Vector3()).toArray(), center = ball.getCenter(new Vector3());
    if (Math.max(...diameters) / Math.min(...diameters) > 1.01) throw Error('Guardian mace is flattened');
    const spikes = meshes.filter(name => name.startsWith('MaceSpike')).map(name => {
      const points = positions(gltf.scene.getObjectByName(name)).map(p => p.sub(center));
      return points.reduce((a, b) => a.lengthSq() > b.lengthSq() ? a : b);
    });
    if (spikes.length !== 12) throw Error('Expected twelve mace spikes');
    const radii = spikes.map(p => p.length());
    if (Math.max(...radii) - Math.min(...radii) > .000001) throw Error('Unequal mace spike lengths');
    const nearest = spikes.map((p, i) => Math.min(...spikes.filter((_, j) => j !== i).map(q =>
      p.angleTo(q) * 180 / Math.PI)));
    if (Math.max(...nearest) - Math.min(...nearest) > .001) throw Error('Uneven mace spike spacing');
    guardianDetails = { mirror_error_m: details, mace_diameters_m: diameters, spike_count: spikes.length,
      spike_tip_radius_m: [Math.min(...radii), Math.max(...radii)],
      nearest_spike_angle_degrees: [Math.min(...nearest), Math.max(...nearest)] };
  }
  const result = { kind, loader: 'Three.js GLTFLoader', meshes, materials: materials.size, triangles,
    face_mirror_error_m: symmetry, ...(bombDiameters ? { hand_bomb_diameters_m: bombDiameters } : {}),
    ...(guardianDetails ? { guardian_details: guardianDetails } : {}),
    animations: gltf.animations.length, bounds_gltf_m: { min: box.min.toArray(), max: box.max.toArray() },
    sha256: createHash('sha256').update(bytes).digest('hex'), status: 'passed: static review asset, before rigging' };
  writeFileSync(resolve(here, 'verification.json'), JSON.stringify(result, null, 2) + '\n');
  console.log(kind, result.status, triangles, 'triangles');
}
