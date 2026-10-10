import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = selector => document.querySelector(selector);
try {
  const view = $('#view');
  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x101c2b);
  view.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.6, .6, .5, -.5, .01, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minZoom = .25;
  controls.maxZoom = 8;
  scene.add(new THREE.HemisphereLight(0xe1f3ff, 0x537194, 1.35));
  const key = new THREE.DirectionalLight(0xffffff, 2.15);
  key.position.set(-3, 4, 4); scene.add(key);
  const fill = new THREE.DirectionalLight(0xaccfff, .8);
  fill.position.set(3, 2, -3); scene.add(fill);
  const grid = new THREE.GridHelper(2, 20, 0x436280, 0x24394e);
  grid.position.y = -.005; scene.add(grid);
  const info = await fetch('./export.json', { cache: 'no-store' }).then(r => r.json());
  const loader = new GLTFLoader();
  const sparkfist = await loader.loadAsync(`./sparkfist-spirit.glb?v=${info.sha256}`);
  const ice = await loader.loadAsync('../ice/ice-spirit.glb');
  scene.add(sparkfist.scene, ice.scene);
  ice.scene.visible = false;
  const center = new THREE.Vector3(0, .4, 0);
  const direction = (t, e) => {
    t *= Math.PI/180; e *= Math.PI/180;
    return [Math.sin(t)*Math.cos(e), Math.sin(e), Math.cos(t)*Math.cos(e)];
  };
  const views = { hero: direction(24,12), game: direction(20,30), front: [0,0,1],
    back: [0,0,-1], left: [-1,0,0], right: [1,0,0], top: [0,1,.00001], bottom: [0,-1,.00001] };
  let currentView = 'hero';
  function resize() {
    const { width, height } = view.getBoundingClientRect();
    renderer.setSize(width, height);
    const span = $('#small').checked ? .8*height/32 : Math.max(1.05, .82*height/width);
    camera.top = span/2; camera.bottom = -span/2;
    camera.left = -span*width/height/2; camera.right = -camera.left;
    camera.updateProjectionMatrix();
  }
  function choose(name) {
    currentView = name; camera.zoom = 1;
    controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(...views[name]).multiplyScalar(4));
    camera.up.set(0,1,0);
    if (name === 'top' || name === 'bottom') camera.up.set(0,0,-1);
    controls.update(); resize();
    grid.visible = $('#floor').checked && name !== 'bottom';
    document.querySelectorAll('[data-view]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.view === name)));
  }
  document.querySelectorAll('[data-view]').forEach(b => b.onclick = () => choose(b.dataset.view));
  document.querySelectorAll('[data-model]').forEach(b => b.onclick = () => {
    sparkfist.scene.visible = b.dataset.model === 'sparkfist'; ice.scene.visible = !sparkfist.scene.visible;
    document.querySelectorAll('[data-model]').forEach(a => a.setAttribute('aria-pressed', String(a === b)));
  });
  $('#small').onchange = () => { camera.zoom = 1; resize(); };
  $('#floor').onchange = () => { grid.visible = $('#floor').checked && currentView !== 'bottom'; };
  $('#wireframe').onchange = () => scene.traverse(o => {
    if (o.isMesh) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => m.wireframe = $('#wireframe').checked);
  });
  new ResizeObserver(resize).observe(view);
  choose('hero');
  renderer.setAnimationLoop(() => { controls.update(); renderer.render(scene,camera); });
  $('#status').textContent = `${info.triangles.toLocaleString()} triangles · 3 materials · 0.80 m · static`;
  window.sparkfistPreview = { renderer, scene, camera, controls, sparkfist, ice, info, choose };
} catch (error) {
  $('#error').textContent = String(error);
  $('#status').textContent = 'Model could not load';
  throw error;
}
