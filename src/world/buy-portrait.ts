import * as THREE from 'three';
import {makeWeapon,type CharacterModel,type WeaponModel} from './models';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import type {Side,WeaponId} from '../game/types';
import {isGrenade,type BuyId} from '../game/buying';
import {applyBuyPose,type BuyPoseLibrary} from './buy-poses';
import type {GrenadeLibrary} from './source2-grenades';

interface PortraitModel {root:THREE.Group;socket:THREE.Object3D;kit?:THREE.Object3D;weapon:WeaponModel|null;weaponId:WeaponId|null}
/** Shared meshes/textures, independent pose bones, bounded still cache, no animation loop. */
export class BuyPortrait{
  private scene=new THREE.Scene();private camera=new THREE.PerspectiveCamera(37,640/864,.05,20);
  private models=new Map<Side,PortraitModel>();private cache=new Map<string,HTMLCanvasElement>();private pending=new Map<string,Promise<HTMLCanvasElement>>();
  private target:THREE.WebGLRenderTarget|null=null;private queue:Promise<unknown>=Promise.resolve();
  private poses:Promise<BuyPoseLibrary|null>|null=null;private held:THREE.Group|null=null;
  readonly stats={renders:0,hits:0,lastMs:0,syncMs:0};
  constructor(private renderer:THREE.WebGLRenderer,environment:THREE.Texture|null,private template:(side:Side)=>CharacterModel,private grenades?:GrenadeLibrary){
    this.scene.environment=environment;this.scene.environmentIntensity=.5;
    const sun=new THREE.DirectionalLight(0xffefd9,2.3);sun.position.set(-2,4,-4);
    this.scene.add(sun,new THREE.HemisphereLight(0xe8f3ff,0x605548,1.3));
    this.camera.position.set(-.55,1,-3.05);this.camera.lookAt(0,.94,0);
  }
  private create(side:Side):PortraitModel{
    const template=this.template(side),root=cloneSkeleton(template.root)as THREE.Group;
    const path:number[]=[];let node:THREE.Object3D=template.weapon.root;
    while(node!==template.root){if(!node.parent)throw new Error('Detached character weapon');path.unshift(node.parent.children.indexOf(node));node=node.parent;}
    let oldWeapon:THREE.Object3D=root;for(const index of path)oldWeapon=oldWeapon.children[index];
    const socket=oldWeapon.parent!;oldWeapon.removeFromParent();
    // The body clone shares immutable geometry and textures, without copying the
    // gameplay animation library or starting an AnimationMixer for a still.
    root.position.set(0,0,0);root.rotation.set(0,-.55,0);root.scale.setScalar(1);
    let kit:THREE.Object3D|undefined;root.traverse(o=>{if(o.name.endsWith('defusekit'))kit=o;if(o instanceof THREE.Mesh){o.castShadow=o.receiveShadow=false;o.frustumCulled=false;}});
    this.scene.add(root);const result={root,socket,kit,weapon:null,weaponId:null};this.models.set(side,result);return result;
  }
  private equip(model:PortraitModel,id:WeaponId){
    if(model.weaponId===id)return;
    if(model.weapon){model.weapon.animation?.dispose();model.weapon.root.removeFromParent();model.weapon.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();if(o instanceof THREE.Mesh&&!o.geometry.userData.source2Shared)o.geometry.dispose();});}
    const weapon=makeWeapon(id);model.weapon=weapon;model.weaponId=id;
    weapon.root.position.set(0,0,0);weapon.root.scale.setScalar(1);weapon.root.rotation.set(0,Math.PI,0);
    model.socket.add(weapon.root);
  }
  async render(side:Side,weapon:WeaponId,kit:boolean,item:BuyId|WeaponId=weapon){
    const poseId=isGrenade(item)?item:weapon,key=`${side}:${poseId}:${kit}`,cached=this.cache.get(key);
    if(cached){this.cache.delete(key);this.cache.set(key,cached);this.stats.hits++;return cached;}
    const existing=this.pending.get(key);if(existing)return existing;
    const job=this.queue.then(()=>this.draw(side,weapon,kit,item,key)).finally(()=>this.pending.delete(key));this.queue=job.catch(()=>{});this.pending.set(key,job);return job;
  }
  private inTarget<T>(work:()=>T):T{
    const renderer=this.renderer,previous=renderer.getRenderTarget(),color=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha(),shadows=renderer.shadowMap.enabled;
    const viewport=renderer.getViewport(new THREE.Vector4()),scissor=renderer.getScissor(new THREE.Vector4()),scissorTest=renderer.getScissorTest();
    try{renderer.shadowMap.enabled=false;renderer.setRenderTarget(this.target);renderer.setScissorTest(false);return work();}
    finally{renderer.setRenderTarget(previous);renderer.setClearColor(color,alpha);renderer.shadowMap.enabled=shadows;renderer.setViewport(viewport);renderer.setScissor(scissor);renderer.setScissorTest(scissorTest);}
  }
  private async draw(side:Side,weapon:WeaponId,kit:boolean,item:BuyId|WeaponId,key:string){
    const poseId=isGrenade(item)?item:weapon;
    const start=performance.now();let model=this.models.get(side);
    if(!model)model=this.create(side);
    let syncMs=performance.now()-start;
    const poses=await(this.poses??=fetch(`${import.meta.env.BASE_URL}assets/source2/buy-menu/poses.json`).then(async response=>response.ok?(await response.json()).poses as BuyPoseLibrary:null).catch(()=>null));
    const setupStart=performance.now();
    for(const entry of this.models.values())entry.root.visible=entry===model;
    this.equip(model,weapon);if(model.kit)model.kit.visible=kit;
    if(this.held){this.grenades?.release(this.held);this.held=null;}
    if(poses?.[side]?.[poseId])applyBuyPose(model.root,poses[side][poseId]);
    model.weapon!.root.visible=!isGrenade(item)||!this.grenades;
    if(isGrenade(item)&&this.grenades){this.held=this.grenades.held(item);model.socket.add(this.held);}
    model.weapon!.muzzle.visible=false;
    // The world render counter is stopped while shopping. Update this rig
    // explicitly instead of relying on Three's once-per-frame skeleton cache.
    model.root.updateMatrixWorld(true);model.root.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.update();});
    const renderer=this.renderer,width=640,height=864;
    this.target??=new THREE.WebGLRenderTarget(width,height,{samples:Math.min(2,renderer.capabilities.maxSamples),depthBuffer:true});
    this.target.texture.colorSpace=THREE.SRGBColorSpace;
    // Compile asynchronously while the menu remains interactive. Restore main
    // renderer state before awaiting; queued captures keep the shared rig stable.
    syncMs+=performance.now()-setupStart;const compileStart=performance.now();
    const compiled=this.inTarget(()=>renderer.compileAsync(this.scene,this.camera));syncMs+=performance.now()-compileStart;await compiled;
    const drawStart=performance.now(),pixels=new Uint8Array(width*height*4);
    this.inTarget(()=>{
      // The target applies its own pixel viewport, without the main canvas DPR.
      renderer.setClearColor(0,0);renderer.clear();renderer.render(this.scene,this.camera);renderer.readRenderTargetPixels(this.target!,0,0,width,height,pixels);
    });
    const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
    const context=canvas.getContext('2d')!,frame=context.createImageData(width,height),stride=width*4;
    for(let row=0;row<height;row++)frame.data.set(pixels.subarray((height-row-1)*stride,(height-row)*stride),row*stride);
    // Cache the pixels directly: no synchronous PNG/WebP encoding and decoding
    // on every new selection. Eight canvases cap the cached RGBA data at 17 MiB.
    context.putImageData(frame,0,0);
    if(this.cache.size>=8)this.cache.delete(this.cache.keys().next().value!);
    this.cache.set(key,canvas);this.stats.renders++;this.stats.lastMs=performance.now()-start;this.stats.syncMs=syncMs+performance.now()-drawStart;return canvas;
  }
}
