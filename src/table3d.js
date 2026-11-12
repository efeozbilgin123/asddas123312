import * as THREE from 'three';

/**
 * Actual interactive WebGL table. The 2D rack remains only as an optional
 * accessibility / WebGL-failure fallback. All tiles are physical 3D meshes.
 * Mouse interactions are single LEFT clicks; drag / context-menu is disabled.
 */
export function createTable3D(node,{getState,getOrder,getSelected,onSelect,onDraw,onTake,onMeld}){
 const scene=new THREE.Scene();
 const renderer=new THREE.WebGLRenderer({alpha:true,antialias:true,powerPreference:'default'});
 const w=()=>node.clientWidth||900,h=()=>node.clientHeight||560;
 renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,1.5));
 renderer.setSize(w(),h(),false);
 renderer.outputColorSpace=THREE.SRGBColorSpace;
 renderer.toneMapping=THREE.ACESFilmicToneMapping;
 renderer.toneMappingExposure=1.18;
 renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;
 renderer.domElement.className='three-canvas';
 renderer.domElement.setAttribute('aria-label','Etkileşimli üç boyutlu 101 Okey masası');
 renderer.domElement.style.touchAction='manipulation';
 renderer.domElement.draggable=false;
 node.appendChild(renderer.domElement);
 const camera=new THREE.PerspectiveCamera(43,w()/h(),0.1,100);
 const views=[
  {x:2.8,y:12.7,z:18.3,targetY:0.1,angle:43},
  {x:0.1,y:21.5,z:7.4,targetY:0,angle:43},
  {x:4.0,y:9.1,z:19.0,targetY:0,angle:42}
 ];
 let view=0,destroyed=false,frame=0,raf=0,activeMeld=null;
 function focusView(){
  const v=views[view];
  const mobile=w()<740;
  camera.position.set(mobile?v.x*.35:v.x,mobile?v.y+3:v.y,mobile?v.z+3:v.z);
  camera.lookAt(0,v.targetY,0);
  camera.fov=mobile?52:v.angle;
  camera.aspect=w()/h();camera.updateProjectionMatrix();
  renderer.setSize(w(),h(),false);
  requestDraw();
 }
 function setView(){view=(view+1)%views.length;focusView();return ['MASA AÇISI','ÜSTTEN','YAKINDAN'][view];}
 // Rich lighting and physically thick tabletop: not a flat CSS graphic.
 scene.add(new THREE.HemisphereLight(0xe7f7e7,0x2e1710,2.5));
 const key=new THREE.DirectionalLight(0xffdfaf,3.7);key.position.set(-5,13,8);
 key.castShadow=true;key.shadow.mapSize.set(1024,1024);
 key.shadow.camera.left=-15;key.shadow.camera.right=15;key.shadow.camera.top=13;key.shadow.camera.bottom=-13;key.shadow.normalBias=.025;scene.add(key);
 const rim=new THREE.DirectionalLight(0x6ac3b1,1.75);rim.position.set(7,6,-8);scene.add(rim);
 const wood=new THREE.MeshStandardMaterial({color:0x422417,roughness:.46,metalness:.05});
 const woodLight=new THREE.MeshStandardMaterial({color:0x7a4b2b,roughness:.38,metalness:.10});
 const woodDeep=new THREE.MeshStandardMaterial({color:0x1d120d,roughness:.48});
 const gold=new THREE.MeshStandardMaterial({color:0xb9985e,metalness:.52,roughness:.32});
 const felt=new THREE.MeshStandardMaterial({color:0x115b48,roughness:1});
 const feltShadow=new THREE.MeshStandardMaterial({color:0x0a3a30,roughness:.97});
 const ivory=new THREE.MeshStandardMaterial({color:0xf4e9cf,roughness:.5});
 const darkTile=new THREE.MeshStandardMaterial({color:0x22574c,roughness:.48});
 const floor=new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.ShadowMaterial({opacity:.28}));
 floor.rotation.x=-Math.PI/2;floor.position.y=-2.15;floor.receiveShadow=true;scene.add(floor);
 function obj(geometry,material,x,y,z,receive=true){
  const mesh=new THREE.Mesh(geometry,material);mesh.position.set(x,y,z);
  mesh.castShadow=true;mesh.receiveShadow=receive;scene.add(mesh);return mesh;
 }
 const base=obj(new THREE.CylinderGeometry(7.35,7.15,.78,96),wood,0,-.55,0);
 base.scale.set(1.38,1,.82);
 const trim=obj(new THREE.CylinderGeometry(7.5,7.5,.12,96),gold,0,-.14,0);trim.scale.set(1.38,1,.82);
 const rimMesh=obj(new THREE.CylinderGeometry(7.44,7.44,.19,96),woodLight,0,-.065,0);rimMesh.scale.set(1.38,1,.82);
 const inset=obj(new THREE.CylinderGeometry(7.07,7.07,.05,96),felt,0,.052,0);
 inset.scale.set(1.38,1,.82);inset.receiveShadow=true;
 // Table apron and real legs.
 obj(new THREE.CylinderGeometry(1.3,1.5,.52,10),woodDeep,0,-1.20,0);
 for(const x of [-5.75,5.75]){
  const leg=obj(new THREE.CylinderGeometry(.42,.5,1.75,12),wood,x,-1.53,0);
  leg.rotation.z=x<0?-.15:.15;
  obj(new THREE.CylinderGeometry(.53,.53,.13,12),gold,x,-2.06,0);
 }
 // Felt inlay: subtle gold boundary.
 const line=new THREE.Mesh(new THREE.TorusGeometry(4.88,.022,6,128),
  new THREE.MeshStandardMaterial({color:0xc8ab70,transparent:true,opacity:.42,roughness:.65}));
 line.rotation.x=-Math.PI/2;line.scale.set(1.62,1.08,1);line.position.y=.091;scene.add(line);
 // Decorated raised side rail and player rests.
 const restGeom=new THREE.BoxGeometry(3.2,.25,.37);
 for(const z of [-5.15,5.15]){
  const rest=obj(restGeom,woodLight,0,.16,z);rest.castShadow=true;
 }
 const rackBase=obj(new THREE.BoxGeometry(10.08,.25,1.75),woodDeep,0,.34,5.2);
 const rackTrim=obj(new THREE.BoxGeometry(10.16,.10,1.83),woodLight,0,.49,5.2);
 const rackFelt=obj(new THREE.BoxGeometry(9.7,.06,1.5),feltShadow,0,.55,5.2);
 const lip=obj(new THREE.BoxGeometry(10.1,.27,.13),gold,0,.72,6.06);
 const backstop=obj(new THREE.BoxGeometry(10.1,.2,.12),woodLight,0,.66,4.36);
 const backing=new THREE.Group();scene.add(backing);
 const dynamic=new THREE.Group();scene.add(dynamic);
 const geometry=new THREE.BoxGeometry(.60,.115,.85);
 const backingGeometry=new THREE.BoxGeometry(.60,.115,.85);
 const textMats=new Map();
 function tileMaterial(tile,back){
  const okey=getState()?.okey;
  const joker=!tile.fake&&okey&&tile.color===okey.color&&tile.value===okey.value;
  const key=back?'back':tile.fake?'fake':tile.color+'-'+tile.value+(joker?'-joker':'');
  if(textMats.has(key))return textMats.get(key);
  const cv=document.createElement('canvas');cv.width=192;cv.height=256;
  const c=cv.getContext('2d');
  if(!c)throw new Error('Canvas 2D unavailable');
  c.fillStyle=back?'#205548':'#fff1d3';c.fillRect(0,0,192,256);
  c.strokeStyle=back?'#c9b177':'#b89b68';c.lineWidth=8;
  c.strokeRect(11,11,170,234);
  c.strokeStyle=back?'#91c4ad':'#e4d5b3';c.lineWidth=2;
  c.strokeRect(20,20,152,216);
  if(back){
   c.fillStyle='#b5d7c8';c.font='bold 104px Georgia';c.textAlign='center';c.fillText('✣',96,159);
  }else{
   const col={red:'#cf4945',yellow:'#d29d25',blue:'#3476bb',black:'#262b31'}[tile.color]||'#835fb4';
   c.fillStyle=col;c.textAlign='center';c.font='900 148px Arial';c.fillText(tile.fake?'★':String(tile.value),96,170);
   c.font='bold 29px Arial';c.fillText(joker?'✦':tile.fake?'✦':'●',96,216);
  }
  const tex=new THREE.CanvasTexture(cv);tex.colorSpace=THREE.SRGBColorSpace;
  tex.anisotropy=Math.min(renderer.capabilities.getMaxAnisotropy(),8);
  const material=new THREE.MeshStandardMaterial({map:tex,roughness:.60,metalness:0});
  textMats.set(key,material);return material;
 }
 function tileMesh(tile,x,y,z,options={}){
  const back=!!options.back;
  // Box face 2 is the horizontal tile face (real 3D geometry).
  const front=tileMaterial(tile,back);
  const mesh=new THREE.Mesh(back?backingGeometry:geometry,[ivory,ivory,front,ivory,darkTile,darkTile]);
  mesh.position.set(x,y,z);mesh.rotation.x=options.tilt||0;
  mesh.rotation.y=options.rot||0;
  mesh.scale.setScalar(options.scale||1);
  mesh.castShadow=true;mesh.receiveShadow=true;
  if(options.action)mesh.userData={action:options.action,id:options.id};
  dynamic.add(mesh);
  return mesh;
 }
 function clearDynamic(){
  // Geometries/materials are shared so only children are detached per state.
  while(dynamic.children.length)dynamic.remove(dynamic.children[0]);
 }
 function rackTiles(s){
  if(s.phase==='lobby'){
   // 3D rack is visible even before starting the match.
   for(let i=0;i<11;i++){
    const m=tileMesh({},-.38*10+i*.76,.78,5.62,{back:true,scale:1.04,tilt:.56});
    m.userData={};
   }
   return;
  }
  const byId=new Map(s.hand.map(tile=>[tile.id,tile]));
  const list=getOrder().map(id=>byId.get(id)).filter(Boolean);
  const selected=getSelected();
  for(let i=0;i<list.length;i++){
   const t=list[i],col=i%11,row=Math.floor(i/11);
   const mesh=tileMesh(t,(col-5)*.83,selected.has(t.id)?1.06:.77,4.73+row*.82,
    {scale:1.03,tilt:.55,action:'tile',id:t.id});
   mesh.userData.baseY=.77;
  }
 }
 function opponentTiles(s){
  const players=s.phase==='lobby'?Array.from({length:4},(_,seat)=>({seat,count:12})):s.players;
  for(const p of players){
   if(p.seat===s.you)continue;
   const rel=(p.seat-s.you+4)%4,count=Math.min(p.count||0,22);
   const horizontal=rel===2;
   const centerX=rel===1?-8.2:rel===3?8.2:0;
   const centerZ=rel===2?-4.66:0;
   const perRow=horizontal?11:11;
   for(let i=0;i<count;i++){
    const row=Math.floor(i/perRow),idx=i%perRow;
    const off=(idx-(Math.min(count-row*perRow,perRow)-1)/2)*.64;
    const x=horizontal?off:centerX+(rel===1?row*.46:-row*.46);
    const z=horizontal?centerZ-row*.47:off;
    tileMesh({},x,.25,z,{back:true,scale:.75,tilt:0,rot:rel===1?-Math.PI/2:rel===3?Math.PI/2:0});
   }
  }
 }
 function deck(s){
  const number=Math.min(s.stockCount||0,9);
  if(!number)return;
  for(let k=0;k<number;k++)tileMesh({},6.5,.19+k*.11,.45,{back:true,action:'draw',scale:.93});
 }
 function update(s){
  clearDynamic();
  if(!s)return requestDraw();
  opponentTiles(s);
  if(s.phase==='playing'||s.phase==='roundEnd'||s.phase==='finished'){
   deck(s);
   const discard=s.discards?.at(-1);
   if(discard)tileMesh(discard,5.9,.21,2.15,{scale:1.1,rot:-.2,action:'discard'});
   if(s.indicator)tileMesh(s.indicator,-6.25,.21,-2.3,{scale:.92});
   const melds=s.melds||[];
   let x=-5.8,z=-1.75,row=0;
   for(const m of melds){
    const span=m.tiles.length*.61+.31;
    if(x+span>4.55){x=-5.8;row++;z=-1.75+row*.95;}
    if(row>4)break;
    m.tiles.forEach((t,j)=>{
     const tile=tileMesh(t,x+j*.61,.21+(m.id===activeMeld ? .18 : 0),z,
      {action:'meld',id:m.id,scale:.98});
     tile.userData.meldId=m.id;
    });
    x+=span+.25;
   }
  }
  rackTiles(s);
  requestDraw();
 }
 function setSelected(selected){
  const selectedSet=selected instanceof Set?selected:new Set(selected);
  for(const mesh of dynamic.children)if(mesh.userData?.action==='tile'){
   mesh.position.y=selectedSet.has(mesh.userData.id)?1.06:.77;
  }
  requestDraw();
 }
 function highlightMeld(id){
  activeMeld=id;
  for(const mesh of dynamic.children)if(mesh.userData?.meldId)
   mesh.position.y=mesh.userData.meldId===id ? .37 : .21;
  requestDraw();
 }
 const raycaster=new THREE.Raycaster(),mouse=new THREE.Vector2();
 function onClick(e){
  if(e.button!==0)return;
  const r=renderer.domElement.getBoundingClientRect();
  mouse.set(((e.clientX-r.left)/r.width)*2-1,-((e.clientY-r.top)/r.height)*2+1);
  raycaster.setFromCamera(mouse,camera);
  const hit=raycaster.intersectObjects(dynamic.children,false).find(h=>h.object.userData?.action);
  if(!hit)return;
  const {action,id}=hit.object.userData;
  if(action==='tile')onSelect(id);
  else if(action==='draw')onDraw();
  else if(action==='discard')onTake();
  else if(action==='meld')onMeld(id);
 }
 const prevent=e=>e.preventDefault();
 const onRightMouse=e=>{if(e.button===2)e.preventDefault();};
 renderer.domElement.addEventListener('click',onClick);
 renderer.domElement.addEventListener('contextmenu',prevent);
 renderer.domElement.addEventListener('dragstart',prevent);
 renderer.domElement.addEventListener('pointerdown',onRightMouse);
 function requestDraw(){
  if(destroyed||frame)return;
  frame=requestAnimationFrame(()=>{
   frame=0;if(!destroyed)renderer.render(scene,camera);
  });
 }
 const observer=new ResizeObserver(focusView);
 observer.observe(node);
 focusView();
 function destroy(){
  destroyed=true;observer.disconnect();
  if(frame)cancelAnimationFrame(frame);
  renderer.domElement.removeEventListener('click',onClick);
  renderer.domElement.removeEventListener('contextmenu',prevent);
  renderer.domElement.removeEventListener('dragstart',prevent);
  renderer.domElement.removeEventListener('pointerdown',onRightMouse);
  renderer.domElement.remove();
  for(const m of textMats.values()){m.map?.dispose();m.dispose();}
  geometry.dispose();backingGeometry.dispose();
  scene.traverse(o=>{if(o.isMesh&&o.geometry!==geometry&&o.geometry!==backingGeometry)o.geometry.dispose();});
  [wood,woodLight,woodDeep,gold,felt,feltShadow,ivory,darkTile].forEach(m=>m.dispose());
  renderer.dispose();
 }
 return {update,highlightMeld,setSelected,setView,destroy};
}
