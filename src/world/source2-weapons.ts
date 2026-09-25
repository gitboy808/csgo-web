import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {WEAPONS} from '../game/weapons';
import type {WeaponId} from '../game/types';
import {registerNativeWeaponFactory,type WeaponAction,type WeaponAnimation} from './models';

interface ClipData {file:string;duration:number;additive:boolean;sounds:{name:string;at:number}[]}
export interface ClipAsset {clip:THREE.AnimationClip;data:ClipData}
interface GunAsset {scene:THREE.Group;clips:Partial<Record<WeaponAction,ClipAsset>>;world?:Partial<Record<WeaponAction,ClipAsset>>;muzzle:{bone:string;point:THREE.Vector3;direction:THREE.Vector3}}

export class NativeAnimation implements WeaponAnimation {
  private mixer:THREE.AnimationMixer;
  private clips=new Map<WeaponAction,{action:THREE.AnimationAction;data:ClipData}>();
  private idle:THREE.AnimationAction;private empty=false;
  private active:{action:THREE.AnimationAction;data:ClipData;event:number}|null=null;
  constructor(readonly root:THREE.Group,assets:GunAsset['clips'],readonly sound:(name:string)=>void){
    this.mixer=new THREE.AnimationMixer(root);
    const names=new Set<string>();root.traverse(o=>names.add(o.name));
    for(const [role,asset]of Object.entries(assets)){
      const tracks=asset.clip.tracks.filter(t=>names.has(t.name.slice(0,t.name.lastIndexOf('.')))).map(t=>t.clone());
      if(asset.data.additive)for(const track of tracks)if(track.name.endsWith('.scale'))for(let i=0;i<track.values.length;i++)track.values[i]-=1;
      const clip=new THREE.AnimationClip(role,asset.clip.duration,tracks,asset.data.additive?THREE.AdditiveAnimationBlendMode:THREE.NormalAnimationBlendMode);
      const action=this.mixer.clipAction(clip);action.clampWhenFinished=true;
      action.setLoop(role==='idle'&&clip.duration>0?THREE.LoopRepeat:THREE.LoopOnce,role==='idle'?Infinity:1);this.clips.set(role as WeaponAction,{action,data:asset.data});
    }
    this.idle=this.clips.get('idle')!.action;
    this.mixer.addEventListener('finished',event=>{if(event.action===this.active?.action){this.active.action.stop();this.active=null;this.restoreIdle();}});
    this.restoreIdle();this.mixer.update(0);
  }
  private restoreIdle(){this.idle.stop();this.idle=this.clips.get(this.empty&&this.clips.has('empty')?'empty':'idle')!.action;this.idle.reset().setEffectiveWeight(1).play();}
  setEmpty(empty:boolean){if(this.empty===empty)return;this.empty=empty;if(!this.active)this.restoreIdle();}
  play(role:WeaponAction,duration?:number){
    if(role==='idle'){this.active?.action.stop();this.active=null;this.restoreIdle();return;}
    const entry=this.clips.get(role)||this.clips.get(role==='reloadEmpty'?'reload':role==='fireEmpty'?'fire':role);if(!entry)return;
    this.active?.action.stop();if(!entry.data.additive)this.idle.stop();else this.restoreIdle();
    entry.action.reset().setEffectiveWeight(1).setEffectiveTimeScale(duration&&entry.action.getClip().duration?entry.action.getClip().duration/duration:1).play();
    this.active={...entry,event:0};this.emit(this.active,0);this.mixer.update(0);
  }
  private emit(active:NonNullable<NativeAnimation['active']>,time:number){while(active.event<active.data.sounds.length&&active.data.sounds[active.event].at<=time+.0001){const event=active.data.sounds[active.event++];if(!event.name.includes('Swish.Light'))this.sound(event.name);}}
  update(dt:number){const active=this.active;this.mixer.update(dt);if(active)this.emit(active,active.action.time);}
  pose(role:WeaponAction,time:number){this.play(role);if(this.active){this.active.action.time=time;this.mixer.update(0);}}
  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.root);}
}

export async function loadSource2Weapons(progress:(fraction:number)=>void,sound:(name:string)=>void){
  const root=`${import.meta.env.BASE_URL}assets/source2/weapons/`,loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
  const [manifest,parameters,world]=await Promise.all(['manifest.json','data.json','world.json'].map(async file=>{const response=await fetch(root+file);if(!response.ok)throw new Error(`缺少原始枪械资源：${file}`);return response.json();}));
  const total=1+Object.values(manifest.weapons).reduce((n:number,w:any)=>n+1+Object.keys(w.clips).length,0);let loaded=0;
  const load=async(file:string)=>{const gltf=await loader.loadAsync(root+file);progress(++loaded/total);return gltf;};
  const arms=await load(manifest.arms);
  const guns=new Map<WeaponId,GunAsset>();
  for(const id of Object.keys(manifest.weapons)as WeaponId[]){
    const entry=manifest.weapons[id],model=await load(entry.model),clips:GunAsset['clips']={};
    for(const [role,data]of Object.entries(entry.clips)as [WeaponAction,ClipData][]){const gltf=await load(data.file);clips[role]={clip:gltf.animations[0],data};}
    const parameter=parameters.weapons[id];
    if(id!=='knife')Object.assign(WEAPONS[id],{damage:parameter.damage,armorPenetration:parameter.armorPenetration,headshotMultiplier:parameter.headshotMultiplier,price:parameter.price,magazine:parameter.magazine,reserve:parameter.reserve,interval:parameter.interval,reload:parameter.reload,reloadInsert:parameter.reloadInsert,automatic:parameter.automatic,spread:parameter.tuning.spread});
    WEAPONS[id].native=parameter.tuning;
    const worldClips:GunAsset['clips']={idle:{clip:new THREE.AnimationClip('idle',1,[new THREE.VectorKeyframeTrack('weapon.position',[0],[0,0,0]),new THREE.QuaternionKeyframeTrack('weapon.quaternion',[0],[-.5,-.5,-.5,.5])]),data:{file:'',duration:1,additive:false,sounds:[]}}};
    for(const [role,value]of Object.entries(world[id]??{})as [WeaponAction,any][])worldClips[role]={clip:THREE.AnimationClip.parse({name:role,uuid:THREE.MathUtils.generateUUID(),blendMode:THREE.NormalAnimationBlendMode,duration:value.duration,tracks:value.tracks}),data:{file:'',duration:value.duration,additive:value.additive,sounds:[]}};
    prepareMaterial(model);guns.set(id,{scene:model.scene,clips,world:worldClips,muzzle:findMuzzle(model.scene)});
  }
  prepareMaterial(arms);
  registerNativeWeaponFactory((id,firstPerson)=>{
    const source=guns.get(id)!,root=new THREE.Group(),content=new THREE.Group(),gun=cloneSkeleton(source.scene)as THREE.Group;
    content.rotation.y=Math.PI;root.add(content);
    let animation:WeaponAnimation|undefined;
    if(firstPerson){
      const hands=cloneSkeleton(arms.scene);content.add(hands);
      // Secondary weapon clips are authored relative to the hand rig's wpn anchor.
      // Undo the standalone skeleton's Source→glTF basis before parenting it there.
      attachWeaponToViewmodel(hands,gun);
      animation=new NativeAnimation(content,source.clips,sound);
    }else{content.add(gun);gun.traverse(o=>{if(o instanceof THREE.Mesh){o.frustumCulled=true;if(o instanceof THREE.SkinnedMesh)o.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,0,.2),2.5);}});if(id!=='knife')animation=new NativeAnimation(gun,source.world!,()=>{});}
    const muzzle=new THREE.Group();
    const flash=new THREE.Mesh(new THREE.ConeGeometry(.016,.12,6),new THREE.MeshBasicMaterial({color:0xffd18b,transparent:true,opacity:.85,depthWrite:false,blending:THREE.AdditiveBlending}));flash.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),source.muzzle.direction);flash.position.copy(source.muzzle.direction).multiplyScalar(.04);muzzle.add(flash);
    muzzle.position.copy(source.muzzle.point);
    muzzle.visible=false;if(id==='usp'||id==='m4a1')muzzle.scale.setScalar(.25);if(id==='knife')muzzle.scale.setScalar(0);(gun.getObjectByName(source.muzzle.bone)||gun).add(muzzle);
    return {root,magazine:new THREE.Group(),bolt:new THREE.Group(),muzzle,animation};
  });
  return {root,parameters:parameters.weapons,arms:arms.scene};
}

export function attachWeaponToViewmodel(hands:THREE.Object3D,gun:THREE.Group){
  const socket=hands.getObjectByName('wpn');if(!socket)throw new Error('原始持枪骨架缺少 wpn 挂点');
  const anchor=new THREE.Group();anchor.name='source2_weapon_anchor';anchor.quaternion.set(-.5,-.5,-.5,.5).invert();socket.add(anchor);anchor.add(gun);return anchor;
}

function findMuzzle(scene:THREE.Group){
  scene.updateMatrixWorld(true);scene.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.update();});
  const vertices:THREE.Vector3[]=[];let far=-Infinity;
  scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;for(let i=0;i<o.geometry.attributes.position.count;i++){const v=o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld);vertices.push(v);far=Math.max(far,v.z);}});
  const tip=vertices.filter(v=>v.z>far-.004),center=new THREE.Vector3();tip.forEach(v=>center.add(v));center.multiplyScalar(1/Math.max(1,tip.length));
  const bone=scene.getObjectByName('weapon_offset')||scene.getObjectByName('weapon')||scene,transform=bone.matrixWorld.clone().invert();
  return {bone:bone.name,point:center.applyMatrix4(transform),direction:new THREE.Vector3(0,0,1).transformDirection(transform)};
}

function prepareMaterial(gltf:GLTF){
  gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.frustumCulled=false;o.castShadow=true;o.receiveShadow=true;o.geometry.userData.source2Shared=true;
    for(const material of Array.isArray(o.material)?o.material:[o.material]){
      const m=material as THREE.MeshStandardMaterial,source=m.userData.vmat;
      if(source?.FloatParams?.g_flMetalness!==undefined)m.metalness=source.FloatParams.g_flMetalness;
      for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap']as const)if(m[key])m[key]!.anisotropy=8;
    }
  });
}
