import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = selector => document.querySelector(selector);
try {
  const view = $('#view');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
  renderer.setClearColor(0x0a202c);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFShadowMap;
  view.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-.6, .6, .5, -.5, .01, 20);
  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true; controls.minZoom = .35; controls.maxZoom = 8;
  scene.add(new THREE.HemisphereLight(0xeaf7e9, 0x163d3d, .8));
  const key = new THREE.DirectionalLight(0xfff8e7, 2.1);
  key.position.set(-3, 6, 4); key.castShadow = true;
  key.shadow.mapSize.set(1024,1024);
  Object.assign(key.shadow.camera,{ left:-1,right:1,top:1,bottom:-1,near:.1,far:12 });
  key.shadow.normalBias=.002; key.shadow.bias=-.00005; scene.add(key);
  const fill = new THREE.DirectionalLight(0xe1fff3,.7); fill.position.set(4,3,2);scene.add(fill);
  const rim = new THREE.DirectionalLight(0xafffe3,1); rim.position.set(1,2,-4);scene.add(rim);
  const lowFill = new THREE.DirectionalLight(0xf6f8e7,.8);lowFill.position.set(0,.7,4);scene.add(lowFill);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.18}));
  floor.rotation.x=-Math.PI/2; floor.position.y=-.001;floor.receiveShadow=true;scene.add(floor);
  const [gltf,info] = await Promise.all([
    new GLTFLoader().loadAsync('./windwall.glb'),
    fetch('./export.json').then(r=>{if(!r.ok)throw Error('Metadata unavailable');return r.json();})
  ]);
  scene.add(gltf.scene);
  const meshes=[];
  gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=!o.name.startsWith('Eye');o.receiveShadow=!o.name.startsWith('Eye');meshes.push(o);}});
  const center=new THREE.Vector3(0,.35,0);
  let span=.94,currentView='hero';
  function direction(turn,elevation){
    const t=THREE.MathUtils.degToRad(turn),e=THREE.MathUtils.degToRad(elevation);
    return new THREE.Vector3(Math.sin(t)*Math.cos(e),Math.sin(e),Math.cos(t)*Math.cos(e));
  }
  const directions={front:direction(0,0),back:direction(180,0),left:direction(-90,0),right:direction(90,0),
    top:direction(0,90),bottom:direction(0,-90),hero:direction(5,0),game:direction(5,30)};
  function resize(){
    const {width,height}=view.getBoundingClientRect();
    renderer.setSize(width,height);
    const frame=$('#small').checked?info.silhouette_height_m*height/40:Math.max(span,span*height/width);
    camera.top=frame/2;camera.bottom=-frame/2;camera.left=-frame*width/height/2;camera.right=-camera.left;
    camera.updateProjectionMatrix();renderer.render(scene,camera);
  }
  function choose(name){
    currentView=name;controls.target.copy(center);camera.zoom=1;
    camera.position.copy(center).addScaledVector(directions[name],3);
    camera.up.set(0,1,0);if(name==='top'||name==='bottom')camera.up.set(0,0,-1);
    controls.update();
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));
    floor.visible=$('#floor').checked&&name!=='bottom';resize();
  }
  function detail(name){
    $('#small').checked=false;
    const spec={face:{target:[0,.36,.125],span:.38,view:'front'},crest:{target:[-.055,.58,-.03],span:.26,view:'hero'},
      cape:{target:[0,.28,0],span:.94,view:'hero'},gem:{target:[0,.2,.13],span:.23,view:'front'},
      all:{target:[0,.35,0],span:.94,view:'hero'}}[name];
    center.set(...spec.target);span=spec.span;
    document.querySelectorAll('[data-detail]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.detail===name)));
    choose(spec.view);
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>choose(b.dataset.view));
  document.querySelectorAll('[data-detail]').forEach(b=>b.onclick=()=>detail(b.dataset.detail));
  $('#wireframe').onchange=()=>meshes.forEach(o=>(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>{m.wireframe=$('#wireframe').checked;}));
  $('#floor').onchange=()=>{floor.visible=$('#floor').checked&&currentView!=='bottom';};
  $('#small').onchange=()=>{camera.zoom=1;resize();};
  new ResizeObserver(resize).observe(view);choose('hero');
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  $('#status').textContent=`${info.triangles} triangles · ${info.materials.length} materials · static GLB`;
  window.windwallPreview={scene,camera,renderer,controls,gltf,info,meshes,choose,detail};
} catch(error){$('#error').textContent=String(error);$('#status').textContent='Model could not load';throw error;}
