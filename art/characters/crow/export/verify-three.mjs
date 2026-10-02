/** Exercise GLTFLoader's actual skinned vertices and AnimationMixer loop boundary.
 * Run from the inspector console: await (await import('./verify-three.mjs')).verifyCrow(crowPreview)
 * Stops preview playback; reload the page afterwards.
 */
export function verifyCrow({ THREE, gltf, clips, mixer, renderer }) {
  renderer.setAnimationLoop(null);
  const assert = (condition, message) => { if (!condition) throw new Error(message); };
  const meshes = gltf.scene.getObjectsByProperty('isSkinnedMesh', true);
  const root = gltf.scene.getObjectByName('root');
  assert(root && meshes.length > 0, 'Missing skeleton or mesh');
  let maxWeights = 0;
  for (const mesh of meshes) {
    const w = mesh.geometry.getAttribute('skinWeight');
    for (let i = 0; i < w.count; i++) {
      const values = [w.getX(i), w.getY(i), w.getZ(i), w.getW(i)];
      assert(Math.abs(values.reduce((a, b) => a + b, 0) - 1) < 1e-5, 'Unnormalized weight');
      maxWeights = Math.max(maxWeights, values.filter(v => v > 1e-7).length);
    }
  }
  const points = () => {
    gltf.scene.updateMatrixWorld(true);
    const result = [];
    for (const mesh of meshes) {
      mesh.skeleton.update();
      for (let i = 0; i < mesh.geometry.getAttribute('position').count; i++) {
        const v = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        assert(v.toArray().every(Number.isFinite), 'Non-finite deformed vertex');
        result.push(...v.toArray());
      }
    }
    return result;
  };
  const delta = (a, b) => Math.max(...a.map((v, i) => Math.abs(v - b[i])));
  const report = { meshes: meshes.length, maxWeights, clips: {} };
  for (const clip of clips) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset().play();
    const once = clip.name === 'Attack';
    action.setLoop(once ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    const sample = t => { action.paused = false; action.time = t; mixer.update(0); return points(); };
    const first = sample(0);
    const rootFirst = root.matrixWorld.elements.slice();
    let motion = 0;
    for (let i = 1; i <= 16; i++) {
      motion = Math.max(motion, delta(first, sample(clip.duration * i / 16)));
      assert(delta(rootFirst, root.matrixWorld.elements) < 1e-6, 'Root motion');
    }
    assert(motion > 0.1, `${clip.name}: missing motion`);
    let seam;
    if (!once) {
      sample(clip.duration - 1e-6);
      const before = points();
      mixer.update(2e-6);
      seam = delta(before, points());
      assert(seam < 0.001, `${clip.name}: loop discontinuity ${seam}`);
      const tailMotion = delta(sample(clip.duration - 1 / 48), sample(clip.duration - 1 / 96));
      assert(tailMotion > 0.0001, `${clip.name}: final frame held instead of interpolated`);
    } else {
      seam = delta(first, sample(clip.duration));
      assert(seam < 1e-5, 'Attack does not recover to its starting pose');
    }
    report.clips[clip.name] = { duration: clip.duration, maxVertexMotionMeters: motion, seamErrorMeters: seam };
  }
  return report;
}
