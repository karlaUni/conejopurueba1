import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';

// CONFIGURACIÓN EDITABLE. Coordenadas obtenidas del escenario original de Blender.
const CFG = {
  start: [-12, 0.4], rocks: [-5.8, 0.3], bridge: [7.8, -2.2], finalRocks: [13.7, -1.0], key: [15.1, -1.1],
  bunnyHeight: 0.78, foxyHeight: 0.76, speed: 3.1, jumpSpeed: 5.0, gravity: 12,
  terrainX: [-13.2, 16.2], terrainZ: [-7.35, 5.3], groundY: -0.70,
  cameraDistance: 5.6, cameraHeight: 3.3,
  paths: {world:'assets/escenario1.glb', bunny:'assets/bunny.glb', foxy:'assets/foxy.glb'}
};
const $ = id => document.getElementById(id);
const scene = new THREE.Scene();
scene.background = new THREE.Color('#b8e8ff');
scene.fog = new THREE.Fog('#b8e8ff', 45, 100);
const renderer = new THREE.WebGLRenderer({antialias:true, alpha:false});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.25;
$('game').appendChild(renderer.domElement);
const camera = new THREE.PerspectiveCamera(54, innerWidth/innerHeight, 0.08, 150);
scene.add(new THREE.HemisphereLight(0xffffff, 0x9bb680, 2.8));
const sun = new THREE.DirectionalLight(0xffffff, 2.2);
sun.position.set(-8, 16, 10); scene.add(sun);
const loader = new GLTFLoader(), clock = new THREE.Clock(), keys = new Set(), ray = new THREE.Raycaster();
const solids = [];
let world, bunny, foxy, keyMesh, state='menu', ready=false, vy=0, grounded=false, invincible=0, stage=0, foxTime=0, keyCollected=false;
let checkpoint = new THREE.Vector3(CFG.start[0], CFG.groundY, CFG.start[1]);
const shown = new Set(); let dialogTimeout;
function message(text, ms=5600){$('dialogText').textContent=text;$('dialog').classList.remove('hidden');clearTimeout(dialogTimeout);dialogTimeout=setTimeout(()=> $('dialog').classList.add('hidden'),ms)}
function once(id,text){if(!shown.has(id)){shown.add(id);message(text)}}
$('continue').onclick=()=>{$('dialog').classList.add('hidden');clearTimeout(dialogTimeout)};
function load(path){return new Promise((resolve,reject)=>loader.load(path,g=>resolve(g.scene),undefined,reject))}
function fitCharacter(root,height){
  root.updateMatrixWorld(true);
  const bounds=new THREE.Box3().setFromObject(root), size=bounds.getSize(new THREE.Vector3());
  const scale=height/Math.max(size.y,0.001);
  root.scale.multiplyScalar(scale); root.updateMatrixWorld(true);
  const b=new THREE.Box3().setFromObject(root);
  // Mover la geometría, no la posición del controlador, para apoyar los pies en el terreno.
  const pivot=new THREE.Group(); root.position.set(-(b.min.x+b.max.x)/2,-b.min.y,-(b.min.z+b.max.z)/2);
  pivot.add(root);return pivot;
}
function substitute(color){const root=new THREE.Group(), mat=new THREE.MeshStandardMaterial({color});const m=new THREE.Mesh(new THREE.SphereGeometry(.3,18,12),mat);m.position.y=.38;root.add(m);return root}
function floorAt(x,z){
  ray.set(new THREE.Vector3(x,5,z),new THREE.Vector3(0,-1,0));
  const hits=ray.intersectObjects(solids,false);
  for(const h of hits){const normal=h.face?.normal?.clone().transformDirection(h.object.matrixWorld);if(normal&&normal.y>.55&&h.point.y>-1.3&&h.point.y<2.0)return h.point.y}
  return CFG.groundY;
}
function makeKey(){
  const gold=new THREE.MeshStandardMaterial({color:0xffcc27,metalness:.7,roughness:.22,emissive:0x8b5900,emissiveIntensity:.3});
  keyMesh=new THREE.Group();const ring=new THREE.Mesh(new THREE.TorusGeometry(.18,.055,10,24),gold);ring.position.y=.18;keyMesh.add(ring);
  const shaft=new THREE.Mesh(new THREE.BoxGeometry(.085,.35,.09),gold);shaft.position.y=-.08;keyMesh.add(shaft);
  for(const y of [-.19,-.29]){const tooth=new THREE.Mesh(new THREE.BoxGeometry(.15,.06,.09),gold);tooth.position.set(.08,y,0);keyMesh.add(tooth)}
  keyMesh.position.set(CFG.key[0],CFG.groundY+.65,CFG.key[1]);scene.add(keyMesh);keyMesh.visible=false;
}
async function init(){
  $('start').disabled=true;$('start').textContent='CARGANDO MODELOS 3D...';
  try{
    world=await load(CFG.paths.world);scene.add(world);world.updateMatrixWorld(true);
    world.traverse(obj=>{
      if(!obj.isMesh)return;
      // Mantener los materiales, texturas y colores originales del archivo GLB.
      const materials=Array.isArray(obj.material)?obj.material:[obj.material];
      for(const mat of materials){if(!mat)continue;mat.side=THREE.DoubleSide;mat.needsUpdate=true;if(mat.map)mat.map.colorSpace=THREE.SRGBColorSpace}
      obj.frustumCulled=false;
      // Ignorar las semillas diminutas que están muy lejos del terreno.
      if(!obj.name.startsWith('semilla'))solids.push(obj);
    });
    try{bunny=fitCharacter(await load(CFG.paths.bunny),CFG.bunnyHeight)}catch(e){console.warn(e);bunny=substitute('#f5a5c0')}
    scene.add(bunny);
    try{foxy=fitCharacter(await load(CFG.paths.foxy),CFG.foxyHeight)}catch(e){console.warn(e);foxy=substitute('#ee9239')}
    scene.add(foxy);makeKey();reset();ready=true;
    $('start').disabled=false;$('start').textContent='COMENZAR AVENTURA';
    renderer.setAnimationLoop(animate);
  }catch(err){console.error(err);$('error').textContent='No se pudo cargar el GLB. Comprueba que iniciaste el servidor local y que los archivos están en assets/. Detalle: '+err.message;$('error').classList.remove('hidden')}
}
function reset(){stage=0;foxTime=0;keyCollected=false;vy=0;invincible=0;grounded=true;shown.clear();keys.clear();
  bunny.position.set(CFG.start[0],floorAt(...CFG.start),CFG.start[1]);
  foxy.position.set(CFG.rocks[0],floorAt(CFG.rocks[0],-1.5),-1.5);
  checkpoint.copy(bunny.position);keyMesh.visible=false;
  $('keyCount').textContent='0';$('hint').classList.add('hidden');$('win').classList.add('hidden');
  $('nextMessage').textContent='';
  camera.position.set(bunny.position.x-4, bunny.position.y+CFG.cameraHeight, bunny.position.z+CFG.cameraDistance);
  camera.lookAt(bunny.position.x+1,bunny.position.y+.4,bunny.position.z);
}
function respawn(){bunny.position.copy(checkpoint);bunny.position.y=floorAt(checkpoint.x,checkpoint.z);vy=0;invincible=2.5}
function move(dt){
  const dx=Number(keys.has('KeyD')||keys.has('ArrowRight'))-Number(keys.has('KeyA')||keys.has('ArrowLeft'));
  const dz=Number(keys.has('KeyS')||keys.has('ArrowDown'))-Number(keys.has('KeyW')||keys.has('ArrowUp'));
  if(dx||dz){const dir=new THREE.Vector3(dx,0,dz).normalize(), distance=CFG.speed*dt;
    const target=bunny.position.clone().addScaledVector(dir,distance);
    target.x=THREE.MathUtils.clamp(target.x,...CFG.terrainX);target.z=THREE.MathUtils.clamp(target.z,...CFG.terrainZ);
    // Obstáculos sólidos: no caminar a través de caras verticales de rocas y árboles.
    const origin=bunny.position.clone().add(new THREE.Vector3(0,.30,0));ray.set(origin,dir);
    const hit=ray.intersectObjects(solids,false).some(h=>h.distance<distance+.23 && Math.abs(h.face?.normal.clone().transformDirection(h.object.matrixWorld).y??1)<.55);
    if(!hit){bunny.position.x=target.x;bunny.position.z=target.z}
    bunny.rotation.y=Math.atan2(dir.x,dir.z);
  }
  const floor=floorAt(bunny.position.x,bunny.position.z);
  if(keys.has('Space')&&grounded){vy=CFG.jumpSpeed;grounded=false}
  vy-=CFG.gravity*dt;bunny.position.y+=vy*dt;
  if(vy<=0&&bunny.position.y<=floor){bunny.position.y=floor;vy=0;grounded=true}else grounded=false;
  if(bunny.position.y<-3)respawn();
}
function events(){const x=bunny.position.x;
  if(x>-10)once('path','¡Hola, Bunny! Sigue el camino de piedras. ¡Vamos por la primera llave!');
  if(x>-6.4){once('rocks','¡Cuidado! Foxy está cerca de las rocas. Usa ESPACIO para saltar.');stage=Math.max(stage,1)}
  if(x>0&&checkpoint.x<0)checkpoint.set(0,floorAt(0,0),0);
  if(x>5){once('bridge','¡Muy bien! Cruza el puente de madera con cuidado.');stage=Math.max(stage,2)}
  if(x>10){once('last','¡Ánimo, Bunny! La llave está detrás de las últimas piedras.');stage=Math.max(stage,3);if(checkpoint.x<9)checkpoint.set(10,floorAt(10,-2),-2)}
  if(x>11.6&&!keyCollected)keyMesh.visible=true;
  const near=keyMesh.visible&&Math.hypot(bunny.position.x-CFG.key[0],bunny.position.z-CFG.key[1])<1.3;
  $('hint').classList.toggle('hidden',!near);if(near)$('hint').textContent='🗝️ Presiona E para recoger la llave dorada';
}
function fox(dt){if(!stage)return;foxTime+=dt;
  const dest=new THREE.Vector3(stage===1?4:stage===2?6.1:12.3,0,stage===1?-1.4:stage===2?-1.9:-1.8);
  if(stage===3&&foxTime%12<3)dest.copy(bunny.position);
  const delta=new THREE.Vector3(dest.x-foxy.position.x,0,dest.z-foxy.position.z);
  if(delta.length()>.3){delta.normalize();foxy.position.addScaledVector(delta,Math.min(1.05*dt,.065));foxy.rotation.y=Math.atan2(delta.x,delta.z)}
  foxy.position.y=floorAt(foxy.position.x,foxy.position.z);
  if(invincible<=0&&Math.hypot(foxy.position.x-bunny.position.x,foxy.position.z-bunny.position.z)<.65){message('¡Foxy te encontró! Inténtalo de nuevo.',2600);respawn()}
}
function collect(){if(state!=='playing'||!keyMesh.visible||Math.hypot(bunny.position.x-CFG.key[0],bunny.position.z-CFG.key[1])>1.3)return;
  keyCollected=true;keyMesh.visible=false;$('keyCount').textContent='1';$('hint').classList.add('hidden');message('¡Lo logramos! ¡Tenemos nuestra primera llave dorada!',2200);state='victory';setTimeout(()=>$('win').classList.remove('hidden'),1500)
}
function animate(){const dt=Math.min(clock.getDelta(),.045);
  if(state==='playing'){invincible=Math.max(0,invincible-dt);move(dt);events();fox(dt);
    if(keyMesh.visible){keyMesh.rotation.y+=dt*1.5;keyMesh.position.y=CFG.groundY+.65+Math.sin(performance.now()*.003)*.1}}
  if(bunny){
    // Cámara cercana al protagonista y enfocada hacia adelante, sin usar bounds contaminados por objetos lejanos.
    const desired=new THREE.Vector3(bunny.position.x-3.8,bunny.position.y+CFG.cameraHeight,bunny.position.z+CFG.cameraDistance);
    camera.position.lerp(desired,Math.min(1,dt*5));camera.lookAt(bunny.position.x+1.7,bunny.position.y+.45,bunny.position.z);
  }
  renderer.render(scene,camera);
}
$('start').onclick=()=>{if(!ready)return;$('menu').classList.add('hidden');$('story').classList.remove('hidden')};
$('play').onclick=()=>{if(!ready)return;$('story').classList.add('hidden');$('hud').classList.remove('hidden');state='playing';message('¡Hola, Bunny! Encuentra la primera llave dorada. ¡Ten cuidado con Foxy!')};
$('again').onclick=()=>{reset();state='playing';message('¡Vamos por la primera llave!')};
$('next').onclick=()=>{$('nextMessage').textContent='¡El nivel 2 estará disponible próximamente!'};
window.addEventListener('keydown',e=>{if(['Space','ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(e.code))e.preventDefault();keys.add(e.code);if(e.code==='KeyE')collect()});
window.addEventListener('keyup',e=>keys.delete(e.code));window.addEventListener('blur',()=>keys.clear());
window.addEventListener('resize',()=>{camera.aspect=innerWidth/innerHeight;camera.updateProjectionMatrix();renderer.setSize(innerWidth,innerHeight)});
init();
