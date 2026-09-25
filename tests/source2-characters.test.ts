import {afterEach,describe,it,expect,vi} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {NodeIO}from'@gltf-transform/core';import{ALL_EXTENSIONS}from'@gltf-transform/extensions';import{MeshoptDecoder}from'meshoptimizer';
import * as THREE from 'three';import {GLTFLoader}from'three/addons/loaders/GLTFLoader.js';
import {NativeCharacterAnimation,characterLocomotion} from '../src/world/source2-characters';
import type {CharacterPose} from '../src/world/models';
import {AGENT_BOUND_RADIUS} from '../src/world/actor-visibility';
import {applyBuyPose,type BuyPoseLibrary} from '../src/world/buy-poses';
import{CharacterHitboxes,type HitboxDefinition}from'../src/world/hitboxes';
const initial:CharacterPose={time:0,weapon:'m4a1',velocity:new THREE.Vector3(),yaw:0,crouch:false,grounded:true,alive:true,lastFire:-100,lastDamage:-100,reloadUntil:0,kit:false,objective:null};
afterEach(()=>vi.restoreAllMocks());
it('selects movement from velocity relative to aim instead of playing forward running while strafing',()=>{
  expect(characterLocomotion({...initial,velocity:new THREE.Vector3(4,0,0)})).toBe('rifle_run_e');
  expect(characterLocomotion({...initial,velocity:new THREE.Vector3(0,0,4)})).toBe('rifle_run_s');
  expect(characterLocomotion({...initial,crouch:true})).toBe('rifle_idle_crouch');
  expect(characterLocomotion({...initial,alive:false})).toBe('death');
  expect(characterLocomotion({...initial,objective:'defuse'})).toBe('defuse');
});
async function readRig(path:string){
  await MeshoptDecoder.ready;const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.decoder':MeshoptDecoder});const doc=await io.read(path);
  // No WebGL/image decoder is needed to test the real skinned vertices and bones.
  for(const mesh of doc.getRoot().listMeshes())for(const primitive of mesh.listPrimitives())primitive.setMaterial(null);
  for(const material of doc.getRoot().listMaterials())material.dispose();for(const texture of doc.getRoot().listTextures())texture.dispose();for(const extension of doc.getRoot().listExtensionsUsed())extension.dispose();
  const bytes=await io.writeBinary(doc);return new GLTFLoader().parseAsync(bytes.buffer as ArrayBuffer,'');
}
function bounds(root:THREE.Object3D){root.updateWorldMatrix(true,true);const box=new THREE.Box3();root.traverse(o=>{if(o instanceof THREE.SkinnedMesh){o.skeleton.update();o.computeBoundingBox();box.union(o.boundingBox!.clone().applyMatrix4(o.matrixWorld));}});return box;}
const available=existsSync('public/assets/source2/characters/manifest.json');
describe.skipIf(!available)('actual CS2 agent rigs',()=>{
  for(const side of ['CT','T'])it(side+' keeps human proportions through layered idle, fire, walk, reload, crouch and death',async()=>{
    const manifest=JSON.parse(readFileSync('public/assets/source2/characters/manifest.json','utf8')),entry=manifest.models[side],gltf=await readRig('public/assets/source2/characters/'+entry.file);
    const controller=new NativeCharacterAnimation(gltf.scene,{gltf,name:entry.name,additive:new Set(Object.entries(entry.animations).filter(([,v]:any)=>v.additive).map(([k])=>k))});
    const pose={...initial,weapon:side==='CT'?'m4a1':'ak47'}as CharacterPose;
    controller.update(0,pose);const idle=bounds(gltf.scene);expect(idle.min.y).toBeGreaterThan(-.06);expect(idle.max.y).toBeGreaterThan(1.65);expect(idle.max.y).toBeLessThan(2);
    for(const override of [{lastFire:0},{velocity:new THREE.Vector3(0,0,-4)},{crouch:true},{reloadUntil:2},{objective:'plant'},{objective:'defuse'},{utility:{action:'grenade_pullpin',at:0}},{utility:{action:'grenade_throwHigh',at:0}},{utility:{action:'grenade_throwLow',at:0}},{alive:false}]as Partial<CharacterPose>[]){
      controller.reset();for(let frame=0;frame<90;frame++)controller.update(1/60,{...pose,...override,time:frame/60});
      const box=bounds(gltf.scene),size=box.getSize(new THREE.Vector3());expect(size.length(),JSON.stringify(override)).toBeLessThan(3.5);expect(box.min.y,JSON.stringify(override)).toBeGreaterThan(-.2);
      const conservative=new THREE.Sphere(new THREE.Vector3(0,1,0),AGENT_BOUND_RADIUS);expect(conservative.containsPoint(box.min)).toBe(true);expect(conservative.containsPoint(box.max)).toBe(true);
      if(override.crouch)expect(box.max.y).toBeLessThan(1.55);
    }
    controller.reset();controller.update(0,{...pose,alive:false,time:30,deathTime:0});const settled=bounds(gltf.scene);
    const mixerUpdate=vi.spyOn(THREE.AnimationMixer.prototype,'update');
    for(let frame=0;frame<120;frame++)controller.update(1/60,{...pose,alive:false,time:30+frame/60,deathTime:0});
    expect(mixerUpdate.mock.calls.length).toBe(0);expect(bounds(gltf.scene).equals(settled)).toBe(true);
    controller.update(0,pose);expect(mixerUpdate).toHaveBeenCalled();expect(bounds(gltf.scene).max.y).toBeGreaterThan(1.65);mixerUpdate.mockRestore();
    controller.dispose();
  },20000);
  for(const side of ['CT','T']as const)it.skipIf(!existsSync('public/assets/source2/hits/hitboxes.json'))(side+' native capsules follow the actual standing and crouched skeleton',async()=>{
    const manifest=JSON.parse(readFileSync('public/assets/source2/characters/manifest.json','utf8')),entry=manifest.models[side],gltf=await readRig('public/assets/source2/characters/'+entry.file);
    const controller=new NativeCharacterAnimation(gltf.scene,{gltf,name:entry.name,additive:new Set(Object.entries(entry.animations).filter(([,v]:any)=>v.additive).map(([k])=>k))});
    const defs=JSON.parse(readFileSync('public/assets/source2/hits/hitboxes.json','utf8')),boxes=new CharacterHitboxes();
    vi.stubGlobal('fetch',async()=>({ok:true,json:async()=>defs}));await boxes.prepare();vi.unstubAllGlobals();
    const bones=new Map<string,THREE.Object3D>();gltf.scene.traverse(o=>bones.set(o.name.toLowerCase(),o));
    for(const crouch of [false,true]){
      controller.reset();for(let i=0;i<30;i++)controller.update(1/60,{...initial,crouch,time:i/60});gltf.scene.updateMatrixWorld(true);
      for(const group of ['head','stomach','leftLeg','rightArm']){
        const d=defs[side].find((d:HitboxDefinition)=>d.group===group)as HitboxDefinition,bone=bones.get(d.bone)!;
        const center=new THREE.Vector3().fromArray(d.a).lerp(new THREE.Vector3().fromArray(d.b),.5).applyMatrix4(bone.matrixWorld);
        expect(center.y,group).toBeGreaterThan(.1);expect(center.y,group).toBeLessThan(crouch?1.5:1.9);
        if(group==='head'){
          expect(center.y).toBeGreaterThan(crouch?1:1.5);
          const ray=new THREE.Ray(center.clone().add(new THREE.Vector3(0,0,5)),new THREE.Vector3(0,0,-1));
          const hit=boxes.raycast(ray,gltf.scene,side,new THREE.Vector3(),10);expect(hit?.group).toBe('head');expect(hit!.distance).toBeGreaterThan(4.7);expect(hit!.distance).toBeLessThan(5);
          expect(boxes.raycast(ray,gltf.scene,side,new THREE.Vector3(),4)).toBeNull();
        }
      }
    }
    controller.dispose();
  },20000);
  for(const side of ['CT','T']as const)it.skipIf(!existsSync('public/assets/source2/buy-menu/poses.json'))(side+' retains human proportions in every original buy-menu pose',async()=>{
    const gltf=await readRig('public/assets/source2/characters/'+side+'.glb');
    const library=JSON.parse(readFileSync('public/assets/source2/buy-menu/poses.json','utf8')).poses as BuyPoseLibrary;
    for(const [name,pose]of Object.entries(library[side])){
      expect(applyBuyPose(gltf.scene,pose),name).toBeGreaterThan(60);
      const box=bounds(gltf.scene);expect(box.min.y,name).toBeGreaterThan(-.3);expect(box.max.y,name).toBeGreaterThan(1.5);expect(box.max.y,name).toBeLessThan(2.4);expect(box.getSize(new THREE.Vector3()).length(),name).toBeLessThan(3.3);
    }
  },20000);
});
