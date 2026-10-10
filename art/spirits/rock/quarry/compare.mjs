import * as THREE from 'three';
import { loadModels } from '/src/presentation/models.ts';
import { makeBody } from '/src/presentation/bodies.ts';
import { characterLooks } from '/src/presentation/looks.ts';
const renderer = new THREE.WebGLRenderer({canvas:document.querySelector('canvas'),antialias:true});
renderer.setSize(innerWidth,innerHeight*.75);renderer.setClearColor(0x111d27);
const scene=new THREE.Scene();scene.add(new THREE.HemisphereLight(0xd9e4ee,0x53493a,1.05));
const key=new THREE.DirectionalLight(0xffe6c8,2.5);key.position.set(-100,200,150);scene.add(key);
const halfWidth=65*innerWidth/(innerHeight*.75);
const camera=new THREE.OrthographicCamera(-halfWidth,halfWidth,65,-65,.1,1000);camera.position.set(0,18+260*Math.tan(Math.PI/6),260);camera.lookAt(0,18,0);
const floor=new THREE.Mesh(new THREE.PlaneGeometry(500,500),new THREE.MeshStandardMaterial({color:0x273641,roughness:1}));floor.rotation.x=-Math.PI/2;floor.position.y=-.1;scene.add(floor);
scene.add(new THREE.GridHelper(250,25,0x46515a,0x34424c));
const models=await loadModels(['waterSpirit','quarrySpirit','fireSpirit']);
const measurements=[];
for(const [i,character] of ['tidecaller','quarry','gunner'].entries()){
  const look=characterLooks[character];
  const body=makeBody({model:id=>models.get(id)},look,16,false);
  body.animate({x:0,y:0},{x:0,y:1},0,false);
  body.object.position.x=(i-1)*65;
  scene.add(body.object);body.object.updateMatrixWorld(true);
  const meshes=[];body.object.traverse(o=>{if(o.isMesh)meshes.push(o)});
  const all=new THREE.Box3();for(const m of meshes){m.geometry.computeBoundingBox();all.union(m.geometry.boundingBox.clone().applyMatrix4(m.matrixWorld))}
  const central=body.object.getObjectByName(character==='quarry'?'BodyCore':character==='tidecaller'?'WaterSpirit':'FireSpirit');
  const core=new THREE.Box3();if(central?.isMesh){central.geometry.computeBoundingBox();core.copy(central.geometry.boundingBox).applyMatrix4(central.matrixWorld)};
  measurements.push({character,fullHeight:all.max.y,fullWidth:all.getSize(new THREE.Vector3()).x,centralWidth:core.getSize(new THREE.Vector3()).x});
}
document.querySelector('#measure').textContent=JSON.stringify(measurements,null,2);
renderer.render(scene,camera);window.spiritComparison={measurements,scene,camera,renderer};
