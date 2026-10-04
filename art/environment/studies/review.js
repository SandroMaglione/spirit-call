import * as T from 'three'
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js'
import { Puppet } from '/src/presentation/puppet.ts'
import { models } from '/src/presentation/models.ts'

const [manifest,kit]=await Promise.all(['manifest.json','kit.json'].map(p=>fetch(p).then(r=>r.json())))
document.title=kit.title
document.querySelector('h1').textContent=kit.title
const loader=new GLTFLoader()
const sources=new Map(await Promise.all(manifest.assets.map(async a=>[a.id,(await loader.loadAsync(a.file)).scene])))
const originals=new Map(await Promise.all(kit.comparisons.map(async p=>[p.original,(await loader.loadAsync(`../${kit.base_kit}/models/${p.original}.glb`)).scene])))
const gltf=await loader.loadAsync(models.waterSpirit.url)
const spirit={id:'waterSpirit',spec:models.waterSpirit,scene:gltf.scene,clips:new Map(gltf.animations.map(a=>[a.name,a]))}
const canvas=document.querySelector('canvas'),stage=document.querySelector('#stage'),labels=document.querySelector('#labels')
const renderer=new T.WebGLRenderer({canvas,antialias:true,preserveDrawingBuffer:true})
renderer.setPixelRatio(Math.min(devicePixelRatio,1.5));renderer.autoClear=false
renderer.setClearColor('#263943')
let view=new URLSearchParams(location.search).get('view')||'all',turn=0,cards=[],owned=[]
if(!['all','small','working','large','compare','outside'].includes(view))view='all'

function sceneFor(object){
  const scene=new T.Scene();scene.background=new T.Color('#263943')
  const hemi=new T.HemisphereLight(0xffffff,0x8c8c8c,.62*Math.PI)
  const key=new T.DirectionalLight(0xffffff,.41*Math.PI);key.position.set(.6,1.6,-.3)
  const floor=new T.Mesh(new T.PlaneGeometry(80,80),new T.MeshLambertMaterial({color:'#526168',polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1}))
  floor.rotation.x=-Math.PI/2
  scene.add(object,hemi,key,floor);owned.push(floor)
  return scene
}
function player(scene,x,z){
  const puppet=new Puppet(spirit,kit.player_height_m,null)
  puppet.face({x:.7,y:.7});puppet.animate({x:0,y:0},{x:.7,y:.7},0,false)
  puppet.object.position.set(x,0,z);scene.add(puppet.object);owned.push(puppet)
}
function card(id,old=false){
  const obj=(old?originals:sources).get(id).clone(true),box=new T.Box3().setFromObject(obj)
  const size=box.getSize(new T.Vector3()),center=box.getCenter(new T.Vector3())
  const scene=sceneFor(obj);player(scene,-size.x/2-.32,size.z/2+.12)
  const entry=kit.assets.find(a=>a.id===id)
  return {scene,target:new T.Vector3(center.x-.16,Math.min(size.y*.35,.65),center.z),
    title:(old?'Original: ':'')+(entry?.title||id.replaceAll('-',' ')),
    detail:`${size.y.toFixed(2)} m · ${(size.y/kit.player_height_m).toFixed(1)}× player height`,large:entry?.group==='large'}
}
function exterior(){
  const scene=sceneFor(new T.Group())
  const floor=new T.Mesh(new T.BoxGeometry(8,.16,7),new T.MeshLambertMaterial({color:'#6d7c78'}))
  floor.position.set(0,-.08,.65);scene.add(floor);owned.push(floor)
  const lines=[]
  for(let x=-4;x<=4;x++)lines.push(x,.004,-2.85,x,.004,4.15)
  for(let z=-2.85;z<=4.15;z++)lines.push(-4,.004,z,4,.004,z)
  const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute(lines,3))
  const grid=new T.LineSegments(geometry,new T.LineBasicMaterial({color:'#92a09a',transparent:true,opacity:.35}));scene.add(grid);owned.push(grid)
  const edge=new T.Mesh(new T.BoxGeometry(8.4,.065,.16),new T.MeshLambertMaterial({color:'#c4b28d'}));edge.position.set(0,.023,-2.94);scene.add(edge);owned.push(edge)
  const large=kit.assets.filter(a=>a.group==='large'),rest=kit.assets.filter(a=>a.group!=='large'),footprints=[]
  const placements=[...large.map((a,i)=>({id:a.id,x:(i-(large.length-1)/2)*2.6,z:null})),
    ...rest.map((a,i)=>({id:a.id,x:null,z:-2.0+Math.floor(i/2)*1.32,side:i%2?1:-1}))]
  for(const p of placements){
    const obj=sources.get(p.id).clone(true),bounds=new T.Box3().setFromObject(obj)
    const x=p.x===null?(p.side>0?4.32-bounds.min.x:-4.32-bounds.max.x):p.x-(bounds.min.x+bounds.max.x)/2
    const z=p.z??(-3.16-bounds.max.z)
    obj.position.set(x,0,z);scene.add(obj)
    const box=new T.Box3().setFromObject(obj)
    footprints.push({id:p.id,min:box.min.toArray(),max:box.max.toArray(),overlapsCombatFloor:box.min.x<4&&box.max.x>-4&&box.min.z<4.15&&box.max.z>-2.85})
  }
  player(scene,-.30,.50);player(scene,-1,-2.38)
  return {scene,footprints,target:new T.Vector3(0,.30,-.65),title:'Perimeter arrangement',detail:'Gold edge marks the clear combat floor · blue spirits show the current player scale'}
}
function rebuild(){
  for(const item of owned){if(item instanceof Puppet)item.dispose();else{item.geometry?.dispose();item.material?.dispose()}}owned=[]
  document.querySelectorAll('nav button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.view===view)))
  document.querySelector('#description').textContent=view==='compare'?'Original left, study right · identical camera scale within each pair':view==='outside'?'Small details and supported assemblies outside a clear combat floor':'Blue spirit at the current game scale · grounded details and connected construction'
  cards=view==='outside'?[exterior()]:view==='compare'?kit.comparisons.flatMap(p=>[card(p.original,true),card(p.study)]):kit.assets.filter(a=>view==='all'||a.group===view).map(a=>card(a.id))
  const url=new URL(location.href);url.searchParams.set('view',view);history.replaceState(null,'',url)
  window.__arenaStudy={view,kit:kit.base_kit,assets:manifest.assets.length,playerHeight:kit.player_height_m,footprints:cards[0]?.footprints??null}
  render()
}
function render(){
  const width=stage.clientWidth,phone=width<650
  const cols=view==='outside'?1:view==='compare'||view==='large'||phone?2:view==='all'?4:3
  const cw=width/cols,ch=view==='outside'?Math.max(210,innerHeight-document.querySelector('header').offsetHeight-42):view==='large'?330:phone?230:view==='all'?240:290
  const height=ch*Math.ceil(cards.length/cols);renderer.setSize(width,height);labels.replaceChildren()
  renderer.setScissorTest(false);renderer.clear();renderer.setScissorTest(true)
  cards.forEach((card,i)=>{
    const x=(i%cols)*cw,y=Math.floor(i/cols)*ch
    const ppm=view==='outside'?Math.min(width/15.6,ch/9.8):Math.min(view==='compare'?105:card.large?(view==='all'?80:95):140,cw/(view==='compare'?3.5:card.large?3.65:2.55))
    const camera=new T.OrthographicCamera(-cw/ppm/2,cw/ppm/2,ch/ppm/2,-ch/ppm/2,.01,100)
    const ang=Math.PI/4+turn;camera.position.copy(card.target).add(new T.Vector3(Math.sin(ang)*17.32,10,Math.cos(ang)*17.32));camera.lookAt(card.target)
    renderer.setViewport(x,height-y-ch,cw,ch);renderer.setScissor(x,height-y-ch,cw,ch);renderer.render(card.scene,camera)
    const label=document.createElement('div');label.className='label';label.style.cssText=`left:${x}px;top:${y+ch-52}px;width:${cw}px`
    const title=document.createElement('b'),detail=document.createElement('span');title.textContent=card.title;detail.textContent=card.detail;label.append(title,detail);labels.append(label)
  });renderer.setScissorTest(false)
}
document.querySelectorAll('nav button').forEach(b=>b.addEventListener('click',()=>{view=b.dataset.view;turn=0;rebuild()}))
let dragging=null
canvas.addEventListener('pointerdown',e=>{dragging=e.clientX;canvas.setPointerCapture(e.pointerId)})
canvas.addEventListener('pointermove',e=>{if(dragging!==null){turn+=(e.clientX-dragging)*.008;dragging=e.clientX;render()}})
for(const event of ['pointerup','pointercancel'])canvas.addEventListener(event,()=>{dragging=null})
window.addEventListener('resize',render);rebuild()
