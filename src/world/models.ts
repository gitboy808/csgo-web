import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/addons/geometries/RoundedBoxGeometry.js';
import type { Materials } from './materials';
import type { Side, WeaponId } from '../game/types';

const material=(color:number,metalness=0,roughness=.75)=>new THREE.MeshStandardMaterial({color,metalness,roughness});
const steel=material(0x323b3d,.75,.35),black=material(0x171e1f,.25,.65),edge=material(0x687170,.7,.3),wood=material(0x855331,.05,.63),olive=material(0x616346,.1,.68),silver=material(0xa7acab,.85,.25);
export function detailModelMaterials(mats:Materials){
  for(const mat of [steel,black,edge,silver,olive]){mat.normalMap=mats.metal.normalMap;mat.normalScale=new THREE.Vector2(.08,.08);mat.roughnessMap=mats.metal.roughnessMap;}
  wood.map=mats.wood.map;wood.normalMap=mats.wood.normalMap;wood.normalScale=new THREE.Vector2(.25,.25);
}
function box(g:THREE.Group,m:THREE.Material,w:number,h:number,d:number,x:number,y:number,z:number,rx=0,rz=0) {
  const mesh=new THREE.Mesh(new RoundedBoxGeometry(w,h,d,2,Math.min(.004,w/5,h/5,d/5)),m);mesh.position.set(x,y,z);mesh.rotation.set(rx,0,rz);g.add(mesh);return mesh;
}
function cylinder(g:THREE.Group,m:THREE.Material,r:number,length:number,x:number,y:number,z:number,axis:'x'|'y'|'z'='z',r2=r) {
  const mesh=new THREE.Mesh(new THREE.CylinderGeometry(r,r2,length,12),m);if(axis==='z')mesh.rotation.x=Math.PI/2;else if(axis==='x')mesh.rotation.z=Math.PI/2;
  mesh.position.set(x,y,z);g.add(mesh);return mesh;
}
function capsule(g:THREE.Group,m:THREE.Material,r:number,length:number,x:number,y:number,z:number) {
  const mesh=new THREE.Mesh(new THREE.CapsuleGeometry(r,length,4,8),m);mesh.position.set(x,y,z);g.add(mesh);return mesh;
}
function combineStatic(group:THREE.Group) {
  const batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  for(const child of [...group.children]) {
    if(!(child instanceof THREE.Mesh) || Array.isArray(child.material))continue;
    child.updateMatrix();let geo=child.geometry.clone();if(geo.index)geo=geo.toNonIndexed();geo.applyMatrix4(child.matrix);
    const arr=batches.get(child.material)||[];arr.push(geo);batches.set(child.material,arr);group.remove(child);child.geometry.dispose();
  }
  for(const [mat,gs]of batches){const mesh=new THREE.Mesh(mergeGeometries(gs,false)!,mat);mesh.castShadow=true;mesh.receiveShadow=true;group.add(mesh);gs.forEach(g=>g.dispose());}
}

export interface WeaponModel { root:THREE.Group; magazine:THREE.Group; bolt:THREE.Group; muzzle:THREE.Group }
export function makeWeapon(id:WeaponId,firstPerson=false):WeaponModel {
  const root=new THREE.Group(),magazine=new THREE.Group(),bolt=new THREE.Group(),muzzle=new THREE.Group();
  const rifle=['ak47','m4a1','awp'].includes(id),ak=id==='ak47',awp=id==='awp',usp=id==='usp',deagle=id==='deagle';
  if(id==='knife') {
    const shape=new THREE.Shape();shape.moveTo(-.03,0);shape.lineTo(.03,0);shape.lineTo(.032,.25);shape.lineTo(0,.36);shape.lineTo(-.03,.25);shape.closePath();
    const blade=new THREE.Mesh(new THREE.ExtrudeGeometry(shape,{depth:.005,bevelEnabled:false}),silver);blade.rotation.x=-Math.PI/2;blade.position.z=-.17;root.add(blade);
    cylinder(root,black,.024,.16,0,0,-.09);box(root,steel,.14,.015,.025,0,0,-.175);
    for(let z=-.14;z<-.02;z+=.022)cylinder(root,edge,.025,.009,0,0,z);
    box(root,black,.025,.018,.04,-.015,0,.005);
  } else if(rifle) {
    const body=awp?olive:steel;
    box(root,body,.077,.104,.37,0,.015,-.3);
    box(root,black,.08,.03,.39,0,.071,-.29);
    box(root,ak?wood:body,.067,.095,.26,0,.015,-.61);
    cylinder(root,steel,ak?.012:.014,awp?.62:.35,0,.05,awp?-.82:-.85);
    cylinder(root,steel,.017,.18,0,.085,-.69);
    if(!ak&&!awp)cylinder(root,black,.024,.23,0,.05,-1.08);
    if(ak){box(root,wood,.085,.11,.22,0,-.012,-.06);box(root,wood,.09,.135,.12,0,-.008,.08);}
    else {cylinder(root,black,.03,.19,0,.014,-.025);box(root,body,.075,.13,.2,0,-.015,.1);box(root,black,.09,.15,.025,0,-.015,.2);}
    box(root,ak?wood:black,.061,.18,.067,0,-.123,-.18,-.22);
    const trigger=new THREE.Mesh(new THREE.TorusGeometry(.044,.006,4,10,Math.PI),steel);trigger.rotation.y=Math.PI/2;trigger.rotation.z=Math.PI;trigger.position.set(0,-.08,-.27);root.add(trigger);
    box(root,steel,.018,.04,.02,0,-.075,-.28,.35);
    magazine.position.set(0,-.07,-.39);
    box(magazine,black,.059,awp?.085:.18,.087,0,-.06,0,ak?.15:0);
    if(ak){box(magazine,steel,.061,.12,.08,0,-.19,.024,.27);for(let i=0;i<3;i++)box(magazine,edge,.063,.18,.007,0,-.085,-.026+i*.025,.15);}
    else for(let y=-.11;y<0;y+=.027)box(magazine,steel,.062,.005,.085,0,y,0);
    box(bolt,edge,.035,.025,.08,.045,.036,-.28);box(bolt,black,.022,.019,.03,.072,.031,-.27);
    for(let z=-.48;z<-.12;z+=.025)box(root,steel,.058,.009,.009,0,.091,z);
    if(awp) {
      for(const z of [-.26,-.46]){box(root,black,.045,.065,.04,0,.13,z);cylinder(root,steel,.037,.023,0,.17,z);}
      cylinder(root,black,.032,.32,0,.175,-.37);cylinder(root,steel,.048,.1,0,.175,-.57);cylinder(root,black,.043,.08,0,.175,-.18);
      cylinder(root,material(0x3a6372,.6,.1),.043,.003,0,.175,-.623);
      cylinder(root,steel,.025,.045,0,.205,-.36,'y');cylinder(root,steel,.024,.045,.031,.175,-.37,'x');
    }else{
      box(root,steel,.025,.06,.024,0,.108,-.64);box(root,steel,.055,.035,.035,0,.11,-.14);
      box(root,black,.014,.025,.04,0,.107,-.14);
    }
    if(!ak)for(let z=-.69;z<-.51;z+=.035)box(root,black,.071,.008,.012,0,.055,z);
  }else {
    const metal=deagle?silver:steel;
    box(root,black,.068,.07,.2,0,-.028,-.2);
    box(bolt,metal,deagle?.075:.067,.066,deagle?.26:.22,0,.037,-.24);
    box(root,black,.062,.15,.065,0,-.105,-.12,-.25);
    box(root,steel,.068,.014,.084,0,-.181,-.106);
    cylinder(root,steel,.014,.22,0,.033,-.3);
    if(usp)cylinder(root,black,.024,.22,0,.03,-.47);
    for(let z=-.19;z<-.125;z+=.01)box(bolt,edge,.07,.035,.003,0,.038,z);
    box(root,black,.042,.012,.017,0,.077,-.13);box(root,edge,.009,.012,.016,0,.077,-.32);
    const guard=new THREE.Mesh(new THREE.TorusGeometry(.03,.005,4,10),steel);guard.rotation.y=Math.PI/2;guard.scale.z=1.3;guard.position.set(0,-.065,-.23);root.add(guard);
    box(magazine,black,.045,.14,.043,0,-.105,-.115,-.22);
  }
  root.add(magazine,bolt);
  const flashMat=new THREE.MeshBasicMaterial({color:0xffd395,transparent:true,opacity:.92,depthWrite:false});
  const flash=new THREE.Mesh(new THREE.ConeGeometry(.1,.28,5),flashMat);flash.rotation.x=-Math.PI/2;muzzle.add(flash);
  muzzle.position.set(0,rifle?.05:.034,rifle?(id==='m4a1'?-1.23:-1.04):(usp?-.6:-.39));muzzle.visible=false;root.add(muzzle);
  combineStatic(root);combineStatic(magazine);combineStatic(bolt);
  if(firstPerson)addHands(root,id);
  return {root,magazine,bolt,muzzle};
}
function limbBetween(g:THREE.Group,a:THREE.Vector3,b:THREE.Vector3,r:number,mat:THREE.Material) {
  const delta=b.clone().sub(a),mesh=new THREE.Mesh(new THREE.CapsuleGeometry(r,Math.max(.01,delta.length()-2*r),4,10),mat);
  mesh.position.copy(a).lerp(b,.5);mesh.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),delta.normalize());g.add(mesh);return mesh;
}
function addHands(root:THREE.Group,id:WeaponId) {
  const group=new THREE.Group(),glove=material(0x3d4335,.05,.92),sleeve=material(0x898374,0,.98),skin=material(0xba9272,0,.85);
  const rifle=['ak47','m4a1','awp'].includes(id);
  limbBetween(group,new THREE.Vector3(.19,-.33,.18),new THREE.Vector3(.032,-.1,-.11),.065,sleeve);
  capsule(group,glove,.047,.038,.021,-.1,-.11);
  for(let i=0;i<4;i++)box(group,glove,.038,.014,.06,.029,-.058-i*.023,-.155);
  if(rifle){
    limbBetween(group,new THREE.Vector3(-.25,-.3,.12),new THREE.Vector3(-.02,-.057,-.57),.062,sleeve);
    box(group,glove,.1,.065,.1,-.017,-.067,-.57);
    for(let i=0;i<4;i++)box(group,glove,.017,.055,.04,-.046+i*.024,-.025,-.587);
  }else{
    limbBetween(group,new THREE.Vector3(-.2,-.32,.19),new THREE.Vector3(-.023,-.092,-.16),.06,sleeve);
    box(group,glove,.08,.07,.067,-.032,-.096,-.156);
  }
  box(group,skin,.065,.034,.035,.028,-.13,-.05);
  combineStatic(group);root.add(group);
}

export interface CharacterModel { root:THREE.Group; torso:THREE.Group; head:THREE.Group; leftLeg:THREE.Group; rightLeg:THREE.Group; leftArm:THREE.Group; rightArm:THREE.Group; weapon:WeaponModel; side:Side }
export function makeCharacter(side:Side):CharacterModel {
  const root=new THREE.Group(),torso=new THREE.Group(),head=new THREE.Group(),leftLeg=new THREE.Group(),rightLeg=new THREE.Group(),leftArm=new THREE.Group(),rightArm=new THREE.Group();
  const uniform=material(side==='CT'?0x344b57:0x8a7760),pants=material(side==='CT'?0x3c5159:0x6a6556),vest=material(side==='CT'?0x202e35:0x494b36),skin=material(0xad876a),boots=black;
  torso.position.y=1.1;root.add(torso);
  box(torso,uniform,.46,.48,.26,0,0,0);
  box(torso,vest,.43,.38,.31,0,-.005,-.01);
  for(let i=0;i<3;i++)box(torso,olive,.105,.16,.09,-.13+i*.13,-.04,-.19);
  box(torso,black,.45,.065,.29,0,-.23,0);
  box(torso,vest,.36,.31,.1,0,.03,.18);
  head.position.y=1.55;root.add(head);
  capsule(head,side==='CT'?black:skin,.13,.13,0,0,0);
  if(side==='CT') {
    const helmet=new THREE.Mesh(new THREE.SphereGeometry(.157,12,8,0,Math.PI*2,0,Math.PI*.63),uniform);helmet.position.y=.11;head.add(helmet);
    box(head,steel,.23,.064,.08,0,.041,-.115);box(head,material(0x47646b,.6,.12),.18,.035,.087,0,.045,-.121);
  }else{
    box(head,black,.24,.05,.035,0,.055,-.121);box(head,vest,.25,.055,.23,0,.14,0);
    box(head,material(0x655d50),.23,.12,.16,0,-.075,-.06);
  }
  for(const [leg,x]of [[leftLeg,-.14],[rightLeg,.14]]as const) {
    leg.position.set(x,.84,0);root.add(leg);capsule(leg,pants,.09,.55,0,-.35,0);box(leg,vest,.15,.14,.06,0,-.46,-.09);box(leg,boots,.18,.14,.31,0,-.74,-.052);combineStatic(leg);
  }
  for(const [arm,x]of [[leftArm,-.28],[rightArm,.28]]as const) {
    arm.position.set(x,.14,0);torso.add(arm);capsule(arm,uniform,.077,.21,0,-.14,0);capsule(arm,uniform,.065,.2,0,-.29,-.13);box(arm,black,.1,.11,.11,0,-.31,-.29);combineStatic(arm);
  }
  const weapon=makeWeapon(side==='CT'?'m4a1':'ak47');weapon.root.position.set(.15,-.2,-.31);weapon.root.scale.setScalar(.83);torso.add(weapon.root);
  combineStatic(torso);combineStatic(head);root.traverse(o=>{if(o instanceof THREE.Mesh){o.castShadow=true;o.receiveShadow=true;}});
  return {root,torso,head,leftLeg,rightLeg,leftArm,rightArm,weapon,side};
}
export function animateCharacter(model:CharacterModel,time:number,moving:number,crouch:boolean,alive:boolean,deathTime:number) {
  if(!alive){model.root.rotation.z=THREE.MathUtils.lerp(model.root.rotation.z,-Math.PI/2,.15);model.root.position.y-=Math.min(deathTime,.7)*.006;return;}
  model.root.rotation.z=0;const walk=Math.sin(time*10)*.55*moving;
  model.leftLeg.rotation.x=walk;model.rightLeg.rotation.x=-walk;
  model.torso.position.y=(crouch?.83:1.1)+Math.abs(Math.sin(time*10))*.02*moving;
  model.head.position.y=crouch?1.28:1.55;
  model.leftLeg.scale.y=model.rightLeg.scale.y=crouch?.7:1;
}
