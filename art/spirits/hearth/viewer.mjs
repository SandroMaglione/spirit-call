import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const $ = selector => document.querySelector(selector);
try {
  const view = $('#view');
  const renderer = new THREE.WebGLRenderer({ antialias:true, alpha:true, preserveDrawingBuffer:true });
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));
  renderer.setClearColor(0x101a27,0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  view.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.6,.6,.54,-.54,.01,20);
  const controls = new OrbitControls(camera,renderer.domElement);
  controls.enableDamping = true;
  controls.enablePan = false;
  controls.minZoom = .5;
  controls.maxZoom = 6;
  scene.add(new THREE.HemisphereLight(0xd9d9e8,0x614038,1.15));
  const key = new THREE.DirectionalLight(0xffe0c6,2.5);
  key.position.set(-2,4,3);
  key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{left:-1,right:1,top:1,bottom:-1,near:.1,far:10});
  key.shadow.normalBias = .002;
  scene.add(key);
  const rim = new THREE.DirectionalLight(0xf5a579,1.25);
  rim.position.set(0,3,-3);
  scene.add(rim);
  const fill = new THREE.DirectionalLight(0xbdcdeb,.7);
  fill.position.set(3,2,1);
  scene.add(fill);
  const warm = new THREE.PointLight(0xff571a,.28,1.3,2);
  warm.position.set(0,.50,.24);
  scene.add(warm);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0x142031,roughness:1}));
  floor.rotation.x = -Math.PI/2;
  floor.position.y = -.001;
  floor.receiveShadow = true;
  scene.add(floor);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene,camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1,1),.26,.45,.65);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());
  const [gltf,info] = await Promise.all([
    new GLTFLoader().loadAsync('./hearth-spirit.glb'),
    fetch('./export.json').then(r=>{ if(!r.ok) throw Error('Export metadata unavailable'); return r.json(); })
  ]);
  scene.add(gltf.scene);
  const meshes = [];
  gltf.scene.traverse(o=>{
    if(o.isMesh) {
      o.castShadow = !o.name.startsWith('Eye');
      o.receiveShadow = !o.name.startsWith('Eye');
      meshes.push(o);
    }
  });
  const directions = {front:[0,10],back:[180,10],left:[72,10],right:[-72,10],
    top:[0,90],bottom:[0,-90],hero:[-20,16],game:[-20,30],'true-front':[0,0],'true-left':[-90,0],'true-right':[90,0],face:[0,7]};
  let currentView = 'hero';
  let frame = 1.08;
  function render() { composer.render(); }
  function resize() {
    const {width,height} = view.getBoundingClientRect();
    renderer.setSize(width,height);
    composer.setSize(width,height);
    const span = $('#small').checked ? info.silhouette_height_m*height/32 : Math.max(frame,frame*height/width);
    camera.top = span/2; camera.bottom = -span/2;
    camera.left = -span*width/height/2; camera.right = -camera.left;
    camera.updateProjectionMatrix();
    render();
  }
  function choose(name) {
    // Finish any orbit damping before applying an exact review camera.
    controls.enableDamping = false;
    controls.update();
    currentView = name;
    const [turn,elevation] = directions[name];
    const t = THREE.MathUtils.degToRad(turn),e = THREE.MathUtils.degToRad(elevation);
    const target = name==='face' ? new THREE.Vector3(0,.326,.16) : new THREE.Vector3(0,.475,0);
    camera.position.copy(target).add(new THREE.Vector3(Math.sin(t)*Math.cos(e),Math.sin(e),Math.cos(t)*Math.cos(e)).multiplyScalar(4));
    camera.up.set(0,1,0);
    if(name==='top') camera.up.set(0,0,-1);
    if(name==='bottom') camera.up.set(0,0,1);
    camera.zoom = 1;
    frame = name==='face' ? .48 : 1.08;
    controls.target.copy(target);
    controls.update();
    controls.enableDamping = true;
    floor.visible = name!=='bottom' && name!=='face';
    const reference = ['true-front','face'].includes(name) ? 'front' : name.startsWith('true-') ? name.slice(5) : name==='game' ? 'hero' : name;
    $('#reference').src = `reference/${reference}.png`;
    $('#reference-caption').textContent = name==='game' ? 'Isometric reference · model uses the 30° game camera' : name==='true-front' ? 'The supplied front is elevated · model camera is level' : ['left','right'].includes(name) ? `${name} sheet reference · camera turned slightly toward the face` : `${reference==='hero' ? 'Isometric' : reference} reference`;
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
    resize();
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>choose(b.dataset.view));
  $('#wireframe').onchange = ()=>meshes.forEach(o=>(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.wireframe=$('#wireframe').checked));
  $('#glow').onchange = ()=>{ bloom.enabled=$('#glow').checked; };
  $('#small').onchange = ()=>{ camera.zoom=1; resize(); };
  new ResizeObserver(resize).observe(view);
  choose('hero');
  renderer.setAnimationLoop(()=>{ controls.update();render(); });
  $('#status').textContent = `${info.triangles.toLocaleString()} triangles · ${info.materials.length} materials · ${info.meshes.length} meshes · 0 clips`;
  window.hearthPreview = {scene,camera,renderer,composer,controls,gltf,info,meshes,choose,render,get currentView(){return currentView;}};
} catch(error) {
  $('#error').textContent = String(error);
  $('#status').textContent = 'Model could not load';
  throw error;
}
