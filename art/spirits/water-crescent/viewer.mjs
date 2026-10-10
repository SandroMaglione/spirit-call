import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { closeLoop, models } from '/src/presentation/models.ts';
import { Puppet } from '/src/presentation/puppet.ts';

const $ = s => document.querySelector(s);
try {
  const view=$('#view');
  const renderer=new THREE.WebGLRenderer({antialias:true,preserveDrawingBuffer:true});
  renderer.setPixelRatio(Math.min(devicePixelRatio,2));renderer.setClearColor(0x101c2b);view.prepend(renderer.domElement);
  const scene=new THREE.Scene(), camera=new THREE.OrthographicCamera(-.6,.6,.5,-.5,.01,20);
  const controls=new OrbitControls(camera,renderer.domElement);controls.enableDamping=true;controls.minZoom=.25;controls.maxZoom=8;
  scene.add(new THREE.HemisphereLight(0xe1f3ff,0x537194,1.35));
  const key=new THREE.DirectionalLight(0xffffff,2.15);key.position.set(-3,4,4);scene.add(key);
  const fill=new THREE.DirectionalLight(0xaccfff,.8);fill.position.set(3,2,-3);scene.add(fill);
  const grid=new THREE.GridHelper(2,20,0x436280,0x24394e);grid.position.y=-.005;scene.add(grid);
  const info=await fetch('./animation.json',{cache:'no-store'}).then(r=>{if(!r.ok)throw Error('Animation metadata unavailable');return r.json();});
  const gltf=await new GLTFLoader().loadAsync(`./water-crescent-animated.glb?v=${info.sha256}`);
  const clips=new Map(gltf.animations.map(c=>[c.name,closeLoop(c,info.clips[c.name])]));scene.add(gltf.scene);
  const mixer=new THREE.AnimationMixer(gltf.scene);
  const puppet=new Puppet({id:'waterCrescent',scene:gltf.scene,clips,spec:models.waterCrescent},.6,
    {idle:'Idle',run:{clip:'Run',distance:120}},['Eye.L','Eye.R']);
  scene.add(puppet.object);puppet.object.visible=false;
  const meshes=[];scene.traverse(o=>{if(o.isMesh)meshes.push(o);});
  const center=new THREE.Vector3(.05,.35,0);
  const dir=(t,e)=>{t*=Math.PI/180;e*=Math.PI/180;return [Math.sin(t)*Math.cos(e),Math.sin(e),Math.cos(t)*Math.cos(e)];};
  const directions={front:[0,0,1],back:[0,0,-1],left:[-1,0,0],right:[1,0,0],top:[0,1,.00001],bottom:[0,-1,.00001],hero:dir(-16,10),game:dir(-20,30)};
  let currentView='hero',selected='Idle',elapsed=0,action=null,travel=0,tour=null,tourTime=0,tourIndex=0;
  function resize(){
    const {width,height}=view.getBoundingClientRect();renderer.setSize(width,height);
    const span=$('#small').checked ? .6*height/32 : Math.max(1.10,1.12*height/width);
    camera.top=span/2;camera.bottom=-span/2;camera.left=-span*width/height/2;camera.right=-camera.left;
    camera.updateProjectionMatrix();renderer.render(scene,camera);
  }
  function choose(name){
    const damping=controls.enableDamping;controls.enableDamping=false;controls.update();
    currentView=name;camera.zoom=1;controls.target.copy(center);
    camera.position.copy(center).add(new THREE.Vector3(...directions[name]).multiplyScalar(4));
    camera.up.set(0,1,0);if(name==='top'||name==='bottom')camera.up.set(0,0,-1);
    controls.update();controls.enableDamping=damping;grid.visible=$('#floor').checked&&name!=='bottom';
    document.querySelectorAll('[data-view]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===name)));resize();
  }
  function playShot(){
    if(selected==='Idle'||selected==='Run'||selected===null)return;
    const contact=info.contacts[selected];
    puppet.play(contact===undefined?selected:{clip:selected,contact},clips.get(selected).duration,contact??null);
  }
  function select(name,keepTour=false){
    if(!keepTour){tour=null;$('#showcase').setAttribute('aria-pressed','false');}
    selected=name;elapsed=0;mixer.stopAllAction();action=null;
    if(name!==null){
      action=mixer.clipAction(clips.get(name)).reset().play();
      action.setLoop(info.clips[name].loopSeconds===null?THREE.LoopOnce:THREE.LoopRepeat,Infinity);
      action.clampWhenFinished=true;playShot();
    }
    $('#clip-name').textContent=name??'Rest pose';
    document.querySelectorAll('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.clip===name)));
    $('#scrub').value='0';$('#frame').textContent='0.00 s';mixer.update(0);
  }
  function setMode(){const game=$('#game-blend').checked;gltf.scene.visible=!game;puppet.object.visible=game;playShot();}
  function updateFrame(){
    if(selected===null)return;
    const duration=clips.get(selected).duration,t=info.clips[selected].loopSeconds===null?Math.min(elapsed,duration):elapsed%duration;
    $('#scrub').value=String(t/duration);$('#frame').textContent=`${t.toFixed(2)} s`;
  }
  function seek(seconds){
    if(selected===null)return;
    $('#playing').checked=false;$('#game-blend').checked=false;setMode();tour=null;
    elapsed=Math.max(0,Math.min(clips.get(selected).duration,seconds));action.reset().play();mixer.setTime(elapsed);updateFrame();
  }
  function showcase(){
    tour=[...clips.keys()].map(name=>({name,seconds:name==='Idle'?2.4:name==='Run'?1.6:1.4}));
    tourIndex=0;tourTime=0;$('#playing').checked=true;$('#repeat').checked=true;
    $('#showcase').setAttribute('aria-pressed','true');select(tour[0].name,true);
  }
  for(const name of clips.keys()){
    const b=document.createElement('button');b.dataset.clip=name;b.textContent=name;
    b.onclick=()=>{$('#playing').checked=true;select(name);};$('#clips').append(b);
  }
  document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>choose(b.dataset.view));
  $('#wireframe').onchange=()=>meshes.forEach(o=>(Array.isArray(o.material)?o.material:[o.material]).forEach(m=>m.wireframe=$('#wireframe').checked));
  $('#floor').onchange=()=>grid.visible=$('#floor').checked&&currentView!=='bottom';
  $('#small').onchange=()=>{camera.zoom=1;resize();};
  $('#scrub').oninput=()=>{if(selected!==null)seek(Number($('#scrub').value)*clips.get(selected).duration);};
  $('#showcase').onclick=showcase;$('#rest').onclick=()=>{$('#game-blend').checked=false;setMode();select(null);};$('#game-blend').onchange=setMode;
  new ResizeObserver(resize).observe(view);choose('hero');select('Idle');setMode();
  if(new URLSearchParams(location.search).has('all'))showcase();
  let last=performance.now();
  renderer.setAnimationLoop(now=>{
    const dt=Math.min(.05,(now-last)/1000)*Number($('#speed').value);last=now;
    if($('#playing').checked&&selected!==null){
      elapsed+=dt;
      if(tour){
        tourTime+=dt;
        if(tourTime>=tour[tourIndex].seconds){
          tourTime=0;tourIndex++;
          if(tourIndex>=tour.length){tour=null;$('#showcase').setAttribute('aria-pressed','false');select('Idle');}
          else select(tour[tourIndex].name,true);
        }
      }
      const duration=clips.get(selected).duration;
      if(info.clips[selected].loopSeconds===null&&elapsed>=duration+.55&&$('#repeat').checked){elapsed=0;action.reset().play();playShot();}
      if($('#game-blend').checked){
        if(selected==='Run')travel+=dt*120/clips.get('Run').duration;
        puppet.animate({x:0,y:travel},{x:0,y:1},dt,selected==='Dash');
      }else mixer.setTime(info.clips[selected].loopSeconds===null?Math.min(elapsed,duration):elapsed%duration);
      updateFrame();
    }
    controls.update();renderer.render(scene,camera);
  });
  $('#status').textContent=`${info.triangles.toLocaleString()} triangles · ${clips.size} clips · 0.60 m`;
  window.waterAnimationPreview={scene,camera,renderer,controls,gltf,info,meshes,clips,mixer,puppet,choose,select,seek,showcase,
    get selected(){return selected;},get touring(){return tour!==null;}};
}catch(error){$('#error').textContent=String(error);$('#status').textContent='Model could not load';throw error;}
