import { prepareCrowClips } from '../export/prepare-clips.mjs';
import { attacks } from '../../../../src/content/attacks.ts';
import { oneShotPose } from '../../../../src/presentation/animation.ts';

const $ = (selector) => document.querySelector(selector);
try {
  const THREE = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/three@0.186.1/build/three.module.js');
  const { GLTFLoader } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/loaders/GLTFLoader.js');
  const { OrbitControls } = await import(/* @vite-ignore */ 'https://cdn.jsdelivr.net/npm/three@0.186.1/examples/jsm/controls/OrbitControls.js');
  const renderer = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(devicePixelRatio, 2)); renderer.setClearColor(0xd3ccbb);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.shadowMap.enabled = true; renderer.shadowMap.type = THREE.PCFShadowMap;
  const view = $('#view'); view.prepend(renderer.domElement);
  const scene = new THREE.Scene();
  const camera = new THREE.OrthographicCamera(-3,3,2,-2,.1,60);
  camera.position.set(4,2.8,6);
  const controls = new OrbitControls(camera, renderer.domElement); controls.target.set(0,1.05,0); controls.update();
  scene.add(new THREE.HemisphereLight(0xe0ebef,0x877357,2.3));
  const key = new THREE.DirectionalLight(0xffefcf,3.3); key.position.set(-3,6,4); key.castShadow=true;
  key.shadow.mapSize.set(1024,1024); key.shadow.camera.left=-3;key.shadow.camera.right=3;key.shadow.camera.top=3;key.shadow.camera.bottom=-3;key.shadow.normalBias=.035;scene.add(key);
  const rim = new THREE.DirectionalLight(0xcedaff,2);rim.position.set(4,4,-3);scene.add(rim);
  const floor = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({color:0xbab4a3,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.025;floor.receiveShadow=true;scene.add(floor);
  const grid = new THREE.GridHelper(40,80,0x9e998a,0xb1aa99);grid.position.y=-.022;scene.add(grid);
  const loader=new GLTFLoader();
  const info=await fetch('./model-info.json').then(r=>r.json());
  const gltf=await loader.loadAsync('./crow-combat.glb');scene.add(gltf.scene);
  gltf.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
  const socket=gltf.scene.getObjectByName(info.grip);
  if(!socket)throw new Error('Missing weapon_grip');
  const weapons={};let weaponId='trainingBlade';
  for(const [id,spec] of Object.entries(info.weapons)) {
    const asset=await loader.loadAsync('./'+spec.file);weapons[id]=asset.scene;
    asset.scene.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;}});
    socket.add(asset.scene);asset.scene.visible=id===weaponId;
  }
  const clips=prepareCrowClips(gltf.animations,info),mixer=new THREE.AnimationMixer(gltf.scene);
  let active,clipName='AttackCombo',segment=null,playing=true,hold=0,previous,travel=0,playhead=0;
  const trailPoints=[];const trailGeometry=new THREE.BufferGeometry();
  const trailLine=new THREE.Line(trailGeometry,new THREE.LineBasicMaterial({color:0x994b30,transparent:true,opacity:.75}));scene.add(trailLine);
  function clearTrail(){trailPoints.length=0;trailGeometry.setFromPoints([]);}
  function gameTiming(){return $('#gameTiming').checked && (clipName==='AttackCombo'||clipName==='Power');}
  function range(){
    if(gameTiming())return [0,clipName==='Power'?attacks.sword.power.move.recovery:segment===null?attacks.sword.combo.reduce((sum,m)=>sum+m.recovery,0):attacks.sword.combo[segment].recovery];
    return segment===null?[0,active.getClip().duration]:[info.combo[segment].start,info.combo[segment].end];
  }
  function setTime(seconds){active.paused=false;active.time=seconds;mixer.update(0);gltf.scene.updateMatrixWorld(true);}
  function setPlaybackTime(seconds){
    playhead=seconds;
    if(!gameTiming()){setTime(seconds);return;}
    let index=segment??0,elapsed=seconds;
    if(clipName==='AttackCombo'&&segment===null){
      while(index<info.combo.length-1&&elapsed>=attacks.sword.combo[index].recovery){elapsed-=attacks.sword.combo[index].recovery;index++;}
    }
    const move=clipName==='Power'?{start:0,end:info.clips.Power.last_key_seconds,contact:info.combo[0].contact}:info.combo[index];
    const duration=clipName==='Power'?attacks.sword.power.move.recovery:attacks.sword.combo[index].recovery;
    const pose=oneShotPose({clip:clipName,from:move.start,to:move.end,contact:move.contact,hitAt:attacks.sword.active/2,seconds:duration,next:null,blendIn:false,elapsed});
    setTime(pose?.time??move.end);
  }
  function choose(name,hit=null){
    mixer.stopAllAction();clipName=name;segment=hit;hold=0;clearTrail();
    active=mixer.clipAction(clips.find(c=>c.name===name)).reset();active.setLoop(THREE.LoopOnce,1);active.clampWhenFinished=true;active.play();setPlaybackTime(range()[0]);
    const [start,end]=range();$('#time').min=start;$('#time').max=end;
    document.querySelectorAll('[data-clip]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.clip===name&&hit===null)));
    document.querySelectorAll('[data-hit]').forEach(b=>b.setAttribute('aria-pressed',String(Number(b.dataset.hit)===hit)));
    $('#pose').textContent=hit!==null?info.combo[hit].name:name==='AttackCombo'?'Four-hit combo':name;
    render();
  }
  function equip(id){weaponId=id;for(const [name,object] of Object.entries(weapons))object.visible=name===id;clearTrail();document.querySelectorAll('[data-weapon]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.weapon===id)));render();}
  function phase(){if(clipName!=='AttackCombo')return info.clips[clipName].loop_seconds?'Continuous loop':'Transition';const t=active.time;const hit=info.combo.findLast(h=>t>=h.start)||info.combo[0];return `${hit.name} · ${t<hit.active[0]?'Wind-up':t<=hit.active[1]?'Strike':'Follow-through'}`;}
  function render(){
    gltf.scene.updateMatrixWorld(true);
    trailLine.visible=$('#trail').checked;
    if(trailLine.visible){const tip=weapons[weaponId].getObjectByName(weaponId+'_blade_tip');if(tip){const p=tip.getWorldPosition(new THREE.Vector3());if(!trailPoints.length||p.distanceTo(trailPoints.at(-1))>.015){trailPoints.push(p);if(trailPoints.length>100)trailPoints.shift();trailGeometry.setFromPoints(trailPoints);}}}
    $('#phase').textContent=phase();$('#time').value=playhead;$('#clock').textContent=`${playhead.toFixed(2)} / ${range()[1].toFixed(2)}`;
    renderer.render(scene,camera);
  }
  function resize(){const {width,height}=view.getBoundingClientRect();renderer.setSize(width,height);const span=$('#small').checked?22:Math.max(3.7,4.8*height/width);camera.top=span/2;camera.bottom=-span/2;camera.left=-span*width/height/2;camera.right=span*width/height/2;camera.updateProjectionMatrix();if(active)render();}
  new ResizeObserver(resize).observe(view);
  document.querySelectorAll('[data-clip]').forEach(b=>b.onclick=()=>choose(b.dataset.clip));
  document.querySelectorAll('[data-hit]').forEach(b=>b.onclick=()=>choose('AttackCombo',Number(b.dataset.hit)));
  document.querySelectorAll('[data-weapon]').forEach(b=>b.onclick=()=>equip(b.dataset.weapon));
  $('#extra').onchange=e=>{if(e.target.value)choose(e.target.value);};
  $('#play').onclick=()=>{playing=!playing;$('#play').textContent=playing?'Pause':'Play';};
  $('#restart').onclick=()=>choose(clipName,segment);
  $('#time').oninput=e=>{playing=false;$('#play').textContent='Play';clearTrail();setPlaybackTime(Number(e.target.value));render();};
  $('#gameTiming').onchange=()=>choose(clipName,segment);
  $('#game').onchange=()=>{camera.position.set(...($('#game').checked?[5,5.13,5]:[4,2.8,6]));controls.target.set(0,1.05,0);controls.update();render();};
  $('#small').onchange=resize;
  $('#trail').onchange=()=>{clearTrail();render();};
  choose('AttackCombo');resize();
  renderer.setAnimationLoop(now=>{
    const dt=previous===undefined?0:Math.min((now-previous)/1000,.05);previous=now;
    if(playing){
      const speed=Number($('#speed').value),[start,end]=range();
      if(info.clips[clipName].loop_seconds&&$('#repeat').checked){const next=playhead+dt*speed;if(next>=end)clearTrail();setPlaybackTime(start+(next-start)%(end-start));}
      else if(playhead>=end-1e-6){hold+=dt;if($('#repeat').checked&&hold>.45){setPlaybackTime(start);hold=0;clearTrail();}}
      else setPlaybackTime(Math.min(end,playhead+dt*speed));
      if(clipName==='Run'&&$('#travel').checked){travel+=dt*speed*info.run_stride_meters/info.clips.Run.loop_seconds;grid.position.z=(travel%.5);}
    }
    render();
  });
  $('#status').textContent=`20 bones · 10 clips · shared grip · used by the game`;
  window.combatPreview={THREE,gltf,clips,mixer,scene,camera,renderer,info,weapons,socket,choose,equip,setTime,setPlaybackTime,render,get clipName(){return clipName;}};
}catch(error){$('#error').textContent=String(error);throw error;}
