import * as THREE from 'three';
import {GLTFLoader} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import {attachWeaponToViewmodel} from './source2-weapons';
import {GRENADES,GRENADE_IDS} from '../game/grenades';
import type {GrenadeId} from '../game/types';
export type GrenadeAction='idle'|'draw'|'pullpin'|'holdHigh'|'holdMid'|'holdLow'|'throwHigh'|'throwLow'|'inspect';
interface ClipAsset {clip:THREE.AnimationClip;duration:number;sounds:{name:string;at:number}[]}
interface GrenadeAsset {scene:THREE.Group;world:THREE.Group;clips:Record<GrenadeAction,ClipAsset>}
export class GrenadeView {
 readonly root=new THREE.Group();readonly mixer:THREE.AnimationMixer;private actions=new Map<GrenadeAction,THREE.AnimationAction>();private active:GrenadeAction='idle';private eventIndex=0;private playing!:THREE.AnimationAction;
 constructor(asset:GrenadeAsset,arms:THREE.Group,private sound:(name:string)=>void){
  const content=new THREE.Group();content.rotation.y=Math.PI;this.root.add(content);const hands=cloneSkeleton(arms),model=cloneSkeleton(asset.scene)as THREE.Group;content.add(hands);attachWeaponToViewmodel(hands,model);this.mixer=new THREE.AnimationMixer(content);
  const names=new Set<string>();content.traverse(o=>names.add(o.name));
  for(const [role,a]of Object.entries(asset.clips)as[GrenadeAction,ClipAsset][]){const clip=new THREE.AnimationClip(role,a.duration,a.clip.tracks.filter(t=>names.has(t.name.slice(0,t.name.lastIndexOf('.')))));const action=this.mixer.clipAction(clip);action.setLoop(['idle','holdHigh','holdMid','holdLow'].includes(role)?THREE.LoopRepeat:THREE.LoopOnce,Infinity);action.clampWhenFinished=true;this.actions.set(role,action);}
  this.clips=asset.clips;this.play('idle');this.mixer.addEventListener('finished',e=>{if(e.action===this.playing&&['draw','inspect'].includes(this.active))this.play('idle');});
 }
 private clips:Record<GrenadeAction,ClipAsset>;
 get pinDuration(){return this.clips.pullpin.duration;}
 play(role:GrenadeAction){if(this.active===role&&this.playing?.isRunning())return;this.playing?.stop();this.active=role;this.eventIndex=0;this.playing=this.actions.get(role)!;this.playing.reset().play();this.mixer.update(0);this.emit(0);}
 private emit(time:number){const sounds=this.clips[this.active].sounds;while(this.eventIndex<sounds.length&&sounds[this.eventIndex].at<=time+.001){const event=sounds[this.eventIndex++];if(!event.name.includes('Loop'))this.sound(event.name);}}
 update(dt:number){this.mixer.update(dt);this.emit(this.playing.time);}
 pose(role:GrenadeAction,time:number){this.play(role);this.playing.time=time;this.mixer.update(0);}
}
/** Static, shared world meshes; first-person rigs are instantiated only once per type. */
export class GrenadeLibrary {
 private pool=new Map<string,THREE.Group[]>();
 constructor(private assets:Map<GrenadeId,GrenadeAsset>,private arms:THREE.Group,readonly root:string){}
 view(kind:GrenadeId,sound:(name:string)=>void){return new GrenadeView(this.assets.get(kind)!,this.arms,sound);}
 world(kind:GrenadeId){const available=this.pool.get(kind);const model=available?.pop()??this.assets.get(kind)!.world.clone(true);model.visible=true;model.position.set(0,0,0);model.rotation.set(0,0,0);model.userData.grenadeKind=kind;return model;}
 held(kind:GrenadeId){const key=kind+'-held',model=this.pool.get(key)?.pop()??cloneSkeleton(this.assets.get(kind)!.scene)as THREE.Group;model.getObjectByName('weapon')?.position.set(0,0,0);model.visible=true;model.userData.grenadeKind=key;return model;}
 release(model:THREE.Group){model.removeFromParent();model.visible=false;const kind=model.userData.grenadeKind as GrenadeId;const list=this.pool.get(kind)??[];if(list.length<8)list.push(model);this.pool.set(kind,list);}
}
function worldMesh(scene:THREE.Group){
 const result=new THREE.Group(),bounds=new THREE.Box3();scene.updateMatrixWorld(true);
 scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;const geometry=o.geometry.clone(),position=geometry.attributes.position.clone();if(o instanceof THREE.SkinnedMesh)o.skeleton.update();
  const excluded=new Set<number>();if(o instanceof THREE.SkinnedMesh)o.skeleton.bones.forEach((bone,i)=>{if(bone.name.startsWith('lighter')||bone.name==='weapon_hand_l')excluded.add(i);});
  const skinIndex=geometry.attributes.skinIndex,skinWeight=geometry.attributes.skinWeight,keep:number[]=[];
  const hidden=(i:number)=>{if(!skinIndex||!skinWeight)return false;for(let c=0;c<4;c++)if(skinWeight.getComponent(i,c)>.5&&excluded.has(skinIndex.getComponent(i,c)))return true;return false;};
  const indices=geometry.index?.array??Array.from({length:position.count},(_,i)=>i);for(let i=0;i<indices.length;i+=3)if(!hidden(indices[i])&&!hidden(indices[i+1])&&!hidden(indices[i+2]))keep.push(indices[i],indices[i+1],indices[i+2]);if(!keep.length)return;geometry.setIndex(keep);
  for(let i=0;i<position.count;i++){const v=o.getVertexPosition(i,new THREE.Vector3()).applyMatrix4(o.matrixWorld);position.setXYZ(i,v.x,v.y,v.z);}for(const i of keep)bounds.expandByPoint(new THREE.Vector3().fromBufferAttribute(position,i));geometry.setAttribute('position',position);geometry.deleteAttribute('skinIndex');geometry.deleteAttribute('skinWeight');geometry.morphAttributes={};geometry.computeBoundingSphere();geometry.userData.source2Shared=true;const mesh=new THREE.Mesh(geometry,o.material);mesh.castShadow=mesh.receiveShadow=true;result.add(mesh);});
 const size=bounds.getSize(new THREE.Vector3());result.userData.halfExtents={x:size.x/2,y:size.y/2,z:size.z/2};const center=bounds.getCenter(new THREE.Vector3());for(const mesh of result.children as THREE.Mesh[]){mesh.geometry.translate(-center.x,-center.y,-center.z);mesh.geometry.computeBoundingSphere();}return result;
}
export function adaptGrenadeMaterial(material:THREE.Material){
 const m=material as THREE.MeshStandardMaterial,source=m.userData.vmat;if(!source)return m;
 const textures=source.TextureParams??{},floats=source.FloatParams??{};
 // The generic exporter assigns an ORM texture even when a specialized shader
 // has no authored AO/metalness. That turns the molotov liquid into a black shell.
 if(!textures.g_tAmbientOcclusion){m.aoMap=null;m.aoMapIntensity=0;}
 if(!textures.g_tMetalness){m.metalness=0;m.metalnessMap=null;}
 if(source.ShaderName==='csgo_simple_liquid.vfx'){
  m.metalness=0;m.aoMap=null;m.roughnessMap=null;m.roughness=floats.g_flLiquidRoughness??.2;m.transparent=true;m.opacity=.9;m.depthWrite=false;m.envMapIntensity=1.25;
 }
 if(source.ShaderName==='csgo_vertexlitgeneric.vfx'&&source.IntParams?.F_SELF_ILLUM){
  const flame=new THREE.MeshBasicMaterial({map:m.map,color:0xffe7b1,transparent:true,opacity:.85,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending});flame.name=m.name;flame.userData=m.userData;return flame;
 }
 return m;
}
export async function loadSource2Grenades(arms:THREE.Group,progress:(f:number)=>void){
 const root=`${import.meta.env.BASE_URL}assets/source2/grenades/`,r=await fetch(root+'manifest.json');if(!r.ok)throw new Error('缺少原始投掷物资源');const manifest=await r.json(),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),assets=new Map<GrenadeId,GrenadeAsset>();let done=0;
 for(const id of GRENADE_IDS){const entry=manifest.models[id],model=await loader.loadAsync(root+entry.model),clips={}as Record<GrenadeAction,ClipAsset>;model.scene.traverse(o=>{if(o instanceof THREE.Mesh){o.frustumCulled=false;o.geometry.userData.source2Shared=true;o.material=Array.isArray(o.material)?o.material.map(adaptGrenadeMaterial):adaptGrenadeMaterial(o.material);for(const material of Array.isArray(o.material)?o.material:[o.material]){const m=material as THREE.MeshStandardMaterial;for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap']as const)if(m[key])m[key]!.anisotropy=8;}}});
  for(const [role,data]of Object.entries(entry.clips)as[GrenadeAction,any][]){const gltf=await loader.loadAsync(root+data.file);clips[role]={clip:gltf.animations[0],duration:data.duration||gltf.animations[0].duration||.1,sounds:data.sounds};progress(++done/60);}
  Object.assign(GRENADES[id],{price:entry.parameters.price,throwVelocity:entry.parameters.throwVelocity,maxSpeed:entry.parameters.maxSpeed});assets.set(id,{scene:model.scene,clips,world:worldMesh(model.scene)});progress(++done/60);
 }
 return new GrenadeLibrary(assets,arms,root);
}
