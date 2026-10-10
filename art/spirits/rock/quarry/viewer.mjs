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
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x111f2c);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  view.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.7, .7, .55, -.55, .01, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;
  controls.minZoom = .3;
  controls.maxZoom = 7;
  scene.add(new THREE.HemisphereLight(0xd9e5ef, 0x63503d, 1.4));
  const key = new THREE.DirectionalLight(0xffefd9, 3.2);
  key.position.set(-2, 4, 3);
  key.castShadow = true;
  key.shadow.mapSize.set(2048, 2048);
  Object.assign(key.shadow.camera, { left: -1.3, right: 1.3, top: 1.3, bottom: -1.3, near: .1, far: 10 });
  key.shadow.normalBias = .001;
  key.shadow.bias = -.00002;
  scene.add(key);
  const fill = new THREE.DirectionalLight(0xc1d9ef, .8);
  fill.position.set(3, 2, -3);
  scene.add(fill);
  const ground = new THREE.Mesh(new THREE.PlaneGeometry(200, 200), new THREE.MeshStandardMaterial({ color: 0x152633, roughness: 1 }));
  ground.rotation.x = -Math.PI / 2;
  ground.position.y = -.001;
  ground.receiveShadow = true;
  scene.add(ground);
  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  composer.addPass(new UnrealBloomPass(new THREE.Vector2(800, 600), .35, .4, 1.1));
  composer.addPass(new OutputPass());
  const [gltf, info] = await Promise.all([
    new GLTFLoader().loadAsync('./quarry-animated.glb'),
    fetch('./animation.json').then(r => { if (!r.ok) throw Error('Model metadata unavailable'); return r.json(); })
  ]);
  scene.add(gltf.scene);
  const meshes = [];
  gltf.scene.traverse(obj => {
    if (!obj.isMesh) return;
    obj.castShadow = !obj.name.startsWith('Eye');
    obj.receiveShadow = !obj.name.startsWith('Eye');
    meshes.push(obj);
  });
  // Match the game's models.ts closeLoop: exports omit the repeated end pose.
  const clips = gltf.animations.map(source => {
    const clip = source.clone(), timing = info.clips[clip.name];
    if (timing.loopSeconds !== null) {
      for (const track of clip.tracks) {
        const stride = track.getValueSize();
        track.times = new Float32Array([...track.times, timing.loopSeconds]);
        track.values = new Float32Array([...track.values, ...track.values.slice(0,stride)]);
      }
      clip.duration = timing.loopSeconds;
    }
    return clip;
  });
  const mixer = new THREE.AnimationMixer(gltf.scene);
  let action, clipName = 'Run', playing = true, speed = 1, hold = 0;
  const names = { Idle:'Idle · quiet watch', Run:'Run · heavy diagonal gait', AttackA:'Attack A · left stepping strike', AttackB:'Attack B · right stepping strike', AttackC:'Attack C · head-first jump', Power:'Power · heavy head-first jump', Dash:'Dash · braced rush', Hurt:'Hurt · recoil', Cast:'Cast · rear-up and stomp', Ultimate:'Ultimate · leap and quake slam' };
  for (const clip of clips) $('#clip').add(new Option(names[clip.name],clip.name));
  function selectClip(name) {
    mixer.stopAllAction(); hold = 0; clipName = name;
    action = mixer.clipAction(clips.find(c => c.name === name));
    action.reset().setLoop(info.clips[name].loopSeconds === null ? THREE.LoopOnce : THREE.LoopRepeat, Infinity);
    action.clampWhenFinished = true;
    action.play(); mixer.update(0);
    $('#clip').value = name;
    playing = true; $('#play').textContent = 'Pause';
  }
  function seek(time) {
    action.play(); action.paused = false; action.enabled = true; action.time = time; mixer.update(0);
    $('#scrub').value = String(time/action.getClip().duration);
  }
  $('#clip').onchange = () => selectClip($('#clip').value);
  $('#play').onclick = () => { playing = !playing; if (playing) action.play(); $('#play').textContent = playing ? 'Pause' : 'Play'; };
  $('#restart').onclick = () => selectClip(clipName);
  $('#slow').onclick = () => { speed = speed === 1 ? .5 : 1; $('#slow').setAttribute('aria-pressed',String(speed === .5)); };
  $('#scrub').oninput = () => { playing = false; $('#play').textContent = 'Play'; seek(Number($('#scrub').value)*action.getClip().duration); };
  $('#rest').onclick = () => { mixer.stopAllAction(); playing = false; $('#play').textContent = 'Play'; };
  const markers = new THREE.Group();
  const markerMaterial = new THREE.MeshBasicMaterial({color:0x3f5360});
  for (let i=0;i<24;i++) {
    const marker = new THREE.Mesh(new THREE.PlaneGeometry(.065,.08), markerMaterial);
    marker.rotation.x = -Math.PI/2;
    marker.position.set(i%2 ? -.66 : .66,.0002,(Math.floor(i/2)-6)*.28);
    markers.add(marker);
  }
  scene.add(markers);
  const center = new THREE.Vector3(0, info.height_m/2+.06, 0);
  let currentView = 'hero', span = 1.55;
  function direction(turn, elevation) {
    const t = THREE.MathUtils.degToRad(turn), e = THREE.MathUtils.degToRad(elevation);
    return new THREE.Vector3(Math.sin(t)*Math.cos(e), Math.sin(e), Math.cos(t)*Math.cos(e));
  }
  const directions = {
    front: direction(0, 0), back: direction(180, 0), left: direction(-90, 0), right: direction(90, 0),
    hero: direction(-35, 20), game: direction(-35, 30), top: new THREE.Vector3(0,1,.0001), bottom: new THREE.Vector3(0,-1,.0001)
  };
  function resize() {
    const { width, height } = view.getBoundingClientRect();
    renderer.setSize(width, height);
    composer.setSize(width, height);
    // Preserve the whole footprint in narrow phone viewports.
    const frame = $('#small').checked ? info.height_m * height/48 : Math.max(span, span*height/width);
    camera.top = frame/2;
    camera.bottom = -frame/2;
    camera.left = -frame*width/height/2;
    camera.right = -camera.left;
    camera.updateProjectionMatrix();
  }
  function choose(name) {
    currentView = name;
    camera.zoom = 1;
    controls.target.copy(center);
    camera.position.copy(center).addScaledVector(directions[name], 4);
    camera.up.set(0,1,0);
    if (name === 'top' || name === 'bottom') camera.up.set(0,0,1);
    controls.update();
    document.querySelectorAll('[data-view]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === name)));
    ground.visible = $('#floor').checked && name !== 'bottom';
    resize();
  }
  function detail(name) {
    $('#small').checked = false;
    const settings = {
      face: { target: [0,.29,.37], span: .56, view: 'front' },
      moss: { target: [0,.46,0], span: .96, view: 'game' },
      all: { target: [0,info.height_m/2+.06,0], span: 1.55, view: 'hero' }
    };
    const setting = settings[name];
    center.set(...setting.target);
    span = setting.span;
    document.querySelectorAll('[data-detail]').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.detail === name)));
    choose(setting.view);
  }
  document.querySelectorAll('[data-view]').forEach(button => button.onclick = () => choose(button.dataset.view));
  document.querySelectorAll('[data-detail]').forEach(button => button.onclick = () => detail(button.dataset.detail));
  $('#wireframe').onchange = () => meshes.forEach(obj => {
    for (const mat of Array.isArray(obj.material) ? obj.material : [obj.material]) mat.wireframe = $('#wireframe').checked;
  });
  $('#floor').onchange = () => { ground.visible = $('#floor').checked && currentView !== 'bottom'; };
  $('#small').onchange = () => { camera.zoom = 1; resize(); };
  new ResizeObserver(resize).observe(view);
  choose('hero');
  selectClip('Run');
  let previousTime = performance.now();
  let groundDistance = 0;
  renderer.setAnimationLoop(() => {
    const now = performance.now();
    const dt = Math.min((now-previousTime)/1000,.05)*speed;
    previousTime = now;
    if (playing) {
      if (action.paused) { hold += dt; if (hold > .7) { action.reset().play(); hold = 0; } }
      else mixer.update(dt);
      if (clipName === 'Run') groundDistance += dt*info.gait.travelMetersPerSecond;
    }
    markers.visible = $('#travel').checked && $('#floor').checked && clipName === 'Run' && currentView !== 'bottom';
    markers.position.z = -(groundDistance % .28);
    $('#scrub').value = String(action.time/action.getClip().duration);
    $('#time').textContent = `${clipName} · ${action.time.toFixed(2)} / ${action.getClip().duration.toFixed(2)} s`;
    controls.update(); composer.render();
  });
  $('#status').textContent = `${info.triangles.toLocaleString()} triangles · ${clips.length} clips · ${info.height_m.toFixed(3)} m`;
  window.quarryPreview = { scene, camera, renderer, composer, controls, gltf, info, choose, detail, meshes, mixer, clips, selectClip, seek,
    pause() { playing = false; $('#play').textContent = 'Play'; },
    resume() { playing = true; $('#play').textContent = 'Pause'; },
    state() { return {clip:clipName,time:action.time,duration:action.getClip().duration,playing,speed}; } };
} catch (error) {
  $('#error').textContent = String(error);
  $('#status').textContent = 'Model could not load';
  throw error;
}
