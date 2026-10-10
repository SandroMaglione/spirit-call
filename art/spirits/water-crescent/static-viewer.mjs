import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

const $ = s => document.querySelector(s);
try {
  const view=$('#view');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x101c2b);
  renderer.toneMapping=THREE.NoToneMapping;view.prepend(renderer.domElement);
  const scene=new THREE.Scene(),camera=new THREE.OrthographicCamera(-.6,.6,.5,-.5,.01,20);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minZoom=.25;controls.maxZoom=8;
  scene.add(new THREE.HemisphereLight(0xe1f3ff,0x537194,1.35));
  const key=new THREE.DirectionalLight(0xffffff,2.15);key.position.set(-3,4,4);scene.add(key);
  const fill=new THREE.DirectionalLight(0xaccfff,.8);fill.position.set(3,2,-3);scene.add(fill);
  const grid=new THREE.GridHelper(2,20,0x436280,0x24394e);grid.position.y=-.005;scene.add(grid);
  const info=await fetch('./export.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Export metadata unavailable');return r.json();});
  const gltf=await new GLTFLoader().loadAsync(`./water-crescent.glb?v=${info.sha256}`);scene.add(gltf.scene);
  const meshes=[];gltf.scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const center=new THREE.Vector3(0,.3,0);
  const dir=(t,e)=>{t*=Math.PI/180;e*=Math.PI/180;return [Math.sin(t)*Math.cos(e),Math.sin(e),Math.cos(t)*Math.cos(e)];};
  const directions={front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0],
    top:[0,1,.00001],bottom:[0,-1,.00001],reference:dir(-16,0),hero:dir(-16,10),game:dir(-20,30)};
  let current='hero';
  function resize(){
    const {width,height}=view.getBoundingClientRect();renderer.setSize(width,height);
    const span=$('#small').checked?.6*height/32:Math.max(.85,.95*height/width);
    camera.top=span/2;camera.bottom=-span/2;camera.left=-span*width/height/2;camera.right=-camera.left;
    camera.updateProjectionMatrix();renderer.render(scene,camera);
  }
  function choose(name){
    const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
    current=name;camera.zoom=1;controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(...directions[name]).multiplyScalar(4));
    camera.up.set(0,1,0);if(name==='top'||name==='bottom')camera.up.set(0,0,-1);
    controls.update();controls.enableDamping=damping;grid.visible=$('#floor').checked&&name!=='bottom';
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));resize();
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>choose(b.dataset.view));
  $('#wireframe').onchange=()=>meshes.forEach(o=>(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.wireframe=$('#wireframe').checked));
  $('#floor').onchange=()=>grid.visible=$('#floor').checked&&current!=='bottom';
  $('#small').onchange=()=>{camera.zoom=1;resize();};
  new ResizeObserver(resize).observe(view);choose('hero');
  renderer.setAnimationLoop(()=>{controls.update();renderer.render(scene,camera);});
  $('#status').textContent=`${info.triangles.toLocaleString()} triangles · ${info.materials.length} materials · ${info.objects.length} objects`;
  window.waterPreview={scene,camera,renderer,controls,gltf,info,meshes,choose};
}catch(error){$('#error').textContent=String(error);$('#status').textContent='Model could not load';throw error;}
