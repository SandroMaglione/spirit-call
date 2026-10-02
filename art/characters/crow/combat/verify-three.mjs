/** Run in the inspector console:
 * await (await import('./verify-three.mjs')).verifyCombat(combatPreview)
 * Samples the loaded GLBs with Three.js, including the actual deformed vertices.
 * Stops playback; reload the page after verification.
 */
export function verifyCombat(p) {
  const { THREE, gltf, clips, mixer, info, weapons, socket } = p;
  p.renderer.setAnimationLoop(null);
  const assert = (ok, message) => { if (!ok) throw new Error(message); };
  const meshes = gltf.scene.getObjectsByProperty('isSkinnedMesh', true);
  const root = gltf.scene.getObjectByName('root');
  const delta = (a, b) => a.reduce((d, value, i) => Math.max(d, Math.abs(value - b[i])), 0);
  const vertices = () => {
    gltf.scene.updateMatrixWorld(true);
    const result = [];
    for (const mesh of meshes) {
      mesh.skeleton.update();
      for (let i = 0; i < mesh.geometry.attributes.position.count; i++) {
        const v = mesh.getVertexPosition(i, new THREE.Vector3()).applyMatrix4(mesh.matrixWorld);
        assert(v.toArray().every(Number.isFinite), 'Non-finite skinned vertex');
        result.push(...v.toArray());
      }
    }
    return result;
  };
  assert(root && socket && meshes.length, 'Missing skeleton, socket or mesh');
  const report = { meshes: meshes.length, bones: meshes[0].skeleton.bones.length, maxWeights: 0, clips: {}, weapons: {} };
  assert(report.bones === 20, 'Unexpected skeleton');
  for (const mesh of meshes) {
    const weights = mesh.geometry.attributes.skinWeight;
    for (let i = 0; i < weights.count; i++) {
      const w = [weights.getX(i), weights.getY(i), weights.getZ(i), weights.getW(i)];
      assert(Math.abs(w.reduce((a,b) => a+b, 0)-1)<1e-5, 'Unnormalized weight');
      report.maxWeights = Math.max(report.maxWeights, w.filter(x => x>1e-7).length);
    }
  }
  assert(report.maxWeights <= 4, 'Too many bone weights');
  for (const [id, weapon] of Object.entries(weapons)) {
    assert(weapon.parent === socket, 'Weapon detached');
    assert(weapon.getObjectByName(id+'_blade_base') && weapon.getObjectByName(id+'_blade_tip'), 'Missing trail markers');
    assert(!weapon.getObjectsByProperty('isSkinnedMesh', true).length, 'Weapon must be rigid');
    report.weapons[id] = { lowestVertexMeters: Infinity, gripErrorMeters: 0 };
  }
  const samples = {};
  for (const clip of clips) {
    mixer.stopAllAction();
    const action = mixer.clipAction(clip).reset().play();
    action.setLoop(info.clips[clip.name].loop_seconds ? THREE.LoopRepeat : THREE.LoopOnce, Infinity);
    action.clampWhenFinished = true;
    const sample = time => { action.paused=false; action.time=time; mixer.update(0); return vertices(); };
    const first=sample(0), rootFirst=root.matrixWorld.elements.slice();
    let motion=0, ground=Infinity;
    for (let i=0;i<=info.clips[clip.name].samples*2;i++) {
      const points=sample(clip.duration*i/(info.clips[clip.name].samples*2));
      motion=Math.max(motion,delta(first,points));
      for (let j=1;j<points.length;j+=3) ground=Math.min(ground,points[j]);
      assert(delta(rootFirst,root.matrixWorld.elements)<1e-6, `${clip.name}: root motion`);
      for (const [id,weapon] of Object.entries(weapons)) {
        const w=report.weapons[id];
        w.gripErrorMeters=Math.max(w.gripErrorMeters, weapon.getWorldPosition(new THREE.Vector3()).distanceTo(socket.getWorldPosition(new THREE.Vector3())));
        weapon.traverse(o=>{if(o.isMesh){
          const positions=o.geometry.attributes.position;
          for(let k=0;k<positions.count;k++) w.lowestVertexMeters=Math.min(w.lowestVertexMeters,new THREE.Vector3().fromBufferAttribute(positions,k).applyMatrix4(o.matrixWorld).y);
        }});
      }
    }
    assert(motion>.02, `${clip.name}: no motion`);
    assert(ground>-.006, `${clip.name}: ground penetration ${ground}`);
    let seam=null;
    if(info.clips[clip.name].loop_seconds) {
      const before=sample(clip.duration-1e-6);
      mixer.update(2e-6);seam=delta(before,vertices());
      assert(seam<.001, `${clip.name}: loop discontinuity`);
      assert(delta(sample(clip.duration-1/60),sample(clip.duration-1/120))>.0001, `${clip.name}: held closing key`);
    }
    samples[clip.name]={first,last:sample(clip.duration),sample};
    report.clips[clip.name]={durationSeconds:clip.duration,maxMotionMeters:motion,groundMinMeters:ground,loopSeamMeters:seam};
  }
  // Explicit endpoints avoid requiring all later characters to share a moveset.
  for(const name of ['AttackCombo','RunStop','Recover1','Recover2','Recover3'])
    assert(delta(samples[name].last,samples.Idle.first)<1e-5, `${name}: does not return to guard`);
  assert(delta(samples.RunStart.last,samples.Run.first)<1e-5, 'RunStart does not enter Run');
  assert(delta(samples.RunStop.first,samples.Run.first)<1e-5, 'RunStop does not start at the run contact');
  for(const [id,w] of Object.entries(report.weapons)) {
    assert(w.gripErrorMeters<1e-6, `${id}: moving grip offset`);
    assert(w.lowestVertexMeters>-.006, `${id}: sword enters ground`);
  }
  p.choose('AttackCombo');p.render();
  return report;
}
