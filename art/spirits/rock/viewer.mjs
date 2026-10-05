import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { closeLoop } from '/src/presentation/models.ts';

const $ = selector => document.querySelector(selector);
try {
  const view = $('#view');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x111d27);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  view.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.6, .6, .5, -.5, .01, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minZoom = .35; controls.maxZoom = 7;
  scene.add(new THREE.HemisphereLight(0xd9e4ee, 0x53493a, 1.05));
  const key = new THREE.DirectionalLight(0xffe6c8, 2.5);
  key.position.set(-2, 4, 3); key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1, right: 1, top: 1, bottom: -1, near: .1, far: 10 });
  key.shadow.normalBias = .002; key.shadow.bias = -.00005;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xc7dbef, 1.2); rim.position.set(3, 2, -3); scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x273641, roughness: 1 }));
  floor.rotation.x = -Math.PI / 2; floor.position.y = -.002; floor.receiveShadow = true; scene.add(floor);
  const grid = new THREE.GridHelper(2, 20, 0x46515a, 0x34424c); grid.position.y = -.001; scene.add(grid);
  const [gltf, info, sheet] = await Promise.all([
    new GLTFLoader().loadAsync('./rock-spirit.glb'),
    fetch('./export.json').then(r => { if (!r.ok) throw Error('Export metadata unavailable'); return r.json(); }),
    fetch('./sheet.json').then(r => r.json())
  ]);
  gltf.animations = gltf.animations.map(c => closeLoop(c, info.clips[c.name]));
  scene.add(gltf.scene);
  const mixer = new THREE.AnimationMixer(gltf.scene);
  let action = null;
  for (const clip of gltf.animations) {
    const option = document.createElement('option'); option.value = clip.name; option.textContent = clip.name; $('#clip').append(option);
  }
  $('#clip').onchange = () => {
    mixer.stopAllAction(); action = null;
    const clip = gltf.animations.find(c => c.name === $('#clip').value);
    if (clip) {
      action = mixer.clipAction(clip).reset();
      action.setLoop(info.clips[clip.name].loopSeconds === null ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
      action.clampWhenFinished = true; action.play();
    }
  };
  const meshes = [];
  gltf.scene.traverse(o => {
    if (o.isMesh) {
      o.castShadow = !o.name.startsWith('Eye'); o.receiveShadow = !o.name.startsWith('Eye');
      meshes.push(o);
    }
  });
  let currentView = 'hero', span = .86;
  const center = new THREE.Vector3(0, info.height_m / 2, 0);
  const directions = {
    front: [0, 0, 1], back: [0, 0, -1], left: [-1, 0, 0], right: [1, 0, 0],
    top: [0, 1, .0001], bottom: [0, -1, .0001],
    hero: fromTurn(sheet.hero.turn, sheet.hero.elevation), game: fromTurn(sheet.hero.turn, 30)
  };
  function fromTurn(turn, elevation) {
    const t = THREE.MathUtils.degToRad(turn), e = THREE.MathUtils.degToRad(elevation);
    return [Math.sin(t) * Math.cos(e), Math.sin(e), Math.cos(t) * Math.cos(e)];
  }
  function resize() {
    const { width, height } = view.getBoundingClientRect();
    renderer.setSize(width, height);
    const frame = $('#small').checked ? info.height_m * height / 32 : Math.max(span, span * height / width);
    camera.top = frame / 2; camera.bottom = -frame / 2;
    camera.left = -frame * width / height / 2; camera.right = -camera.left;
    camera.updateProjectionMatrix();
    renderer.render(scene, camera);
  }
  function choose(name) {
    currentView = name;
    controls.target.copy(center); camera.zoom = 1;
    camera.position.copy(center).add(new THREE.Vector3(...directions[name]).multiplyScalar(3));
    camera.up.set(0, 1, 0);
    if (name === 'top' || name === 'bottom') camera.up.set(0, 0, -1);
    controls.update();
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
    floor.visible = $('#floor').checked && name !== 'bottom'; grid.visible = floor.visible;
    resize();
  }
  function detail(name) {
    $('#small').checked = false;
    const settings = { face: { target: [0, .27, .16], span: .36, view: 'front' }, feet: { target: [0, .13, 0], span: .76, view: 'hero' }, rocks: { target: [0, .48, 0], span: .78, view: 'hero' }, rear: { target: [0, .19, -.15], span: .58, view: 'back' }, all: { target: [0, info.height_m / 2, 0], span: .86, view: 'hero' } };
    const spec = settings[name]; center.set(...spec.target); span = spec.span;
    document.querySelectorAll('[data-detail]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.detail === name)));
    choose(spec.view);
  }
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => choose(b.dataset.view));
  document.querySelectorAll('[data-detail]').forEach(b => b.onclick = () => detail(b.dataset.detail));
  $('#wireframe').onchange = () => meshes.forEach(o => (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { m.wireframe = $('#wireframe').checked; }));
  $('#floor').onchange = () => { floor.visible = $('#floor').checked && currentView !== 'bottom'; grid.visible = floor.visible; };
  $('#small').onchange = () => { camera.zoom = 1; camera.updateProjectionMatrix(); resize(); };
  new ResizeObserver(resize).observe(view);
  choose('hero');
  let last = performance.now();
  renderer.setAnimationLoop(now => { const dt = Math.min(.05, (now-last)/1000); last=now; if ($('#animate').checked) mixer.update(dt); controls.update(); renderer.render(scene, camera); });
  $('#status').textContent = `${info.triangles.toLocaleString()} triangles · ${info.materials.length} materials · ${info.height_m.toFixed(3)} m · ${gltf.animations.length} clips`;
  window.rockPreview = { scene, camera, renderer, controls, gltf, info, choose, detail, meshes, mixer };
} catch (error) {
  $('#error').textContent = String(error);
  $('#status').textContent = 'Model could not load';
  throw error;
}
