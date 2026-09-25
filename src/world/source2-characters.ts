import * as THREE from 'three';
import {GLTFLoader,type GLTF} from 'three/addons/loaders/GLTFLoader.js';
import {MeshoptDecoder} from 'three/addons/libs/meshopt_decoder.module.js';
import {clone as cloneSkeleton} from 'three/addons/utils/SkeletonUtils.js';
import type {Side,WeaponId} from '../game/types';
import {WEAPONS} from '../game/weapons';
import {setAgentBounds} from './actor-visibility';
import {registerNativeCharacterFactory,makeWeapon,type CharacterModel,type CharacterPose,type CharacterAnimation,type WeaponModel} from './models';

interface AgentAsset {gltf:GLTF;additive:Set<string>;name:string}
const boneName=(track:THREE.KeyframeTrack)=>track.name.slice(0,track.name.lastIndexOf('.'));
export function characterLocomotion(p:CharacterPose){
  if(!p.alive)return 'death';
  if(p.objective)return p.objective;if(p.utility)return p.utility.action;
  const family=p.weapon==='knife'?'knife':WEAPONS[p.weapon].slot===1?'rifle':'pistol';
  if(!p.grounded)return family+'_inair_stand';
  const speed=Math.hypot(p.velocity.x,p.velocity.z);
  if(speed<.15)return family+(p.crouch?'_idle_crouch':'_idle');
  if(p.crouch)return family+'_crouch_n';
  const forward=p.velocity.x*-Math.sin(p.yaw)+p.velocity.z*-Math.cos(p.yaw);
  const right=p.velocity.x*Math.cos(p.yaw)-p.velocity.z*Math.sin(p.yaw);
  const heading=Math.abs(forward)>=Math.abs(right)?forward>=0?'n':'s':right>=0?'e':'w';
  return `${family}_${speed<2.4&&heading==='n'?'walk':'run'}_${heading}`;
}

export class NativeCharacterAnimation implements CharacterAnimation {
  private mixer:THREE.AnimationMixer;
  private clips=new Map<string,THREE.AnimationClip>();
  private actions=new Map<string,THREE.AnimationAction>();
  private upper=new Set<string>();
  private lowerAction:THREE.AnimationAction|null=null;private upperAction:THREE.AnimationAction|null=null;
  private hold:THREE.AnimationAction|null=null;private firing:THREE.AnimationAction|null=null;private reload:THREE.AnimationAction|null=null;private death:THREE.AnimationAction|null=null;
  private lastFire=-100;private lastDamage=-100;private wasAlive=true;private reloading=false;private weapon:WeaponId|null=null;
  private state='';private socket:THREE.Group;private kit:THREE.Object3D|undefined;private heldWeapon:WeaponModel|null=null;
  constructor(readonly rig:THREE.Group,asset:AgentAsset){
    this.mixer=new THREE.AnimationMixer(rig);
    for(const name of ['spine_0','wpnPivot'])rig.getObjectByName(name)?.traverse(o=>this.upper.add(o.name));
    this.socket=new THREE.Group();this.socket.name='world_weapon_socket';
    const wpn=rig.getObjectByName('wpn');if(!wpn)throw new Error('原始角色缺少 wpn 持枪骨骼');
    // Agent bones are already in glTF coordinates after world-pose retargeting.
    // Standalone gun rigs retain Source's bone basis on their top-level bone.
    this.socket.quaternion.set(-.5,-.5,-.5,.5).invert();wpn.add(this.socket);
    rig.traverse(n=>{if(n.name.endsWith('defusekit'))this.kit=n;});
    for(const clip of asset.gltf.animations){
      const copy=clip.clone();copy.blendMode=asset.additive.has(clip.name)?THREE.AdditiveAnimationBlendMode:THREE.NormalAnimationBlendMode;
      // Source additive scale is a multiplicative identity (1); Three's numeric
      // additive mixer expects an offset (0), otherwise every joint doubles.
      if(asset.additive.has(clip.name))for(const track of copy.tracks)if(track.name.endsWith('.scale'))for(let i=0;i<track.values.length;i++)track.values[i]-=1;
      this.clips.set(clip.name,copy);
    }
  }
  attach(weapon:WeaponModel){
    this.heldWeapon=weapon;
    weapon.root.position.set(0,0,0);weapon.root.scale.setScalar(1);
    // makeWeapon faces the game camera (-Z); inside the native +Z rig undo that.
    weapon.root.rotation.set(0,Math.PI,0);this.socket.add(weapon.root);
  }
  attachProp(prop:THREE.Object3D){this.socket.add(prop);}
  private action(name:string,part:'upper'|'lower'|'full'='full'){
    const key=name+':'+part,cached=this.actions.get(key);if(cached)return cached;
    const source=this.clips.get(name);if(!source)return null;
    const tracks=source.tracks.filter(t=>part==='full'||this.upper.has(boneName(t))===(part==='upper'));
    const clip=new THREE.AnimationClip(key,source.duration,tracks,source.blendMode),action=this.mixer.clipAction(clip);this.actions.set(key,action);return action;
  }
  private transition(previous:THREE.AnimationAction|null,next:THREE.AnimationAction|null,loop=true){
    if(next===previous)return next;
    previous?.fadeOut(.13);if(next){next.reset().setEffectiveWeight(1).setEffectiveTimeScale(1).setLoop(loop?THREE.LoopRepeat:THREE.LoopOnce,loop?Infinity:1);next.clampWhenFinished=!loop;next.fadeIn(.13).play();}
    return next;
  }
  reset(){this.mixer.stopAllAction();this.state='';this.lowerAction=this.upperAction=this.hold=this.firing=this.reload=this.death=null;this.wasAlive=true;this.reloading=false;this.lastFire=this.lastDamage=-100;this.weapon=null;}
  update(dt:number,p:CharacterPose){
    if(p.alive&&!this.wasAlive)this.reset();
    this.wasAlive=p.alive;if(this.kit)this.kit.visible=p.kit;
    const state=characterLocomotion(p);
    if(!p.alive){
      // The final native death pose is immutable until respawn. Do not evaluate
      // the full bone mixer again every frame for a corpse lying on the floor.
      if(this.death&&this.death.time>=this.death.getClip().duration)return;
      if(!this.death){this.mixer.stopAllAction();this.death=this.action('death');this.death?.reset().setLoop(THREE.LoopOnce,1).play();if(this.death)this.death.clampWhenFinished=true;this.state='death';}
      if(this.death&&p.deathTime!==undefined)this.death.time=Math.min(this.death.getClip().duration,Math.max(0,p.time-p.deathTime));
      this.mixer.update(p.deathTime===undefined?dt:0);return;
    }
    const reload=p.reloadUntil>p.time&&this.clips.has(p.weapon+'_reload')&&!p.objective;
    if(state!==this.state){
      this.lowerAction=this.transition(this.lowerAction,this.action(state,'lower'),p.objective!=='plant'&&!p.utility);
      this.upperAction=this.transition(this.upperAction,reload?null:this.action(state,'upper'),p.objective!=='plant'&&!p.utility);
      this.state=state;
    }
    if(p.weapon!==this.weapon){this.hold?.stop();this.hold=this.action(p.weapon+'_idle','upper');this.hold?.reset().setEffectiveWeight(1).setLoop(THREE.LoopRepeat,Infinity).play();this.weapon=p.weapon;}
    if(reload!==this.reloading){
      if(reload){this.upperAction?.stop();this.upperAction=null;this.reload=this.action(p.weapon+'_reload','upper');this.reload?.reset().setLoop(THREE.LoopOnce,1).setDuration(Math.max(.05,p.reloadUntil-p.time)).play();if(this.reload)this.reload.clampWhenFinished=true;this.heldWeapon?.animation?.play('reload',p.reloadUntil-p.time);}
      else{this.reload?.stop();this.reload=null;this.upperAction=this.transition(null,this.action(state,'upper'),p.objective!=='plant'&&!p.utility);this.heldWeapon?.animation?.play('idle');}
      this.reloading=reload;
    }
    if(this.hold)this.hold.setEffectiveWeight(reload||p.objective||p.utility?0:1);
    const speed=Math.hypot(p.velocity.x,p.velocity.z),moving=/_run_|_walk_|_crouch_n/.test(state);
    if(moving){const authored=state.includes('_walk_')?2.15:state.includes('_crouch_n')?1.65:5.5;const rate=THREE.MathUtils.clamp(speed/authored,.35,1.7);this.lowerAction?.setEffectiveTimeScale(rate);this.upperAction?.setEffectiveTimeScale(rate);}
    if(p.lastFire!==this.lastFire&&p.time-p.lastFire<.2){this.firing?.stop();this.firing=this.action(p.weapon+'_shoot','upper')||this.action('rifle_shoot','upper');this.firing?.reset().setLoop(THREE.LoopOnce,1).play();this.heldWeapon?.animation?.play('fire');}
    if(p.lastDamage!==this.lastDamage&&p.time-p.lastDamage<.2)this.action('flinch','upper')?.reset().setLoop(THREE.LoopOnce,1).play();
    this.lastDamage=p.lastDamage;this.lastFire=p.lastFire;
    if(p.utility){const elapsed=Math.max(0,p.time-p.utility.at);for(const action of [this.lowerAction,this.upperAction])if(action){action.time=Math.min(action.getClip().duration,elapsed);action.paused=true;}}
    this.mixer.update(dt);
    this.heldWeapon?.animation?.update(dt);
    // Initialise the authored pose even for paused screenshots / round reset.
    if(dt===0){for(const action of [this.lowerAction,this.upperAction])action?.stopFading().setEffectiveWeight(1);this.mixer.update(0);}
  }
  get status(){return {state:this.state,weapon:this.weapon,reloading:this.reloading,bones:[...this.upper].length,native:true};}
  dispose(){this.mixer.stopAllAction();this.mixer.uncacheRoot(this.rig);this.rig.traverse(o=>{if(o instanceof THREE.SkinnedMesh)o.skeleton.dispose();});}
}

export async function loadSource2Characters(progress:(f:number)=>void){
  const root=`${import.meta.env.BASE_URL}assets/source2/characters/`,response=await fetch(root+'manifest.json');if(!response.ok)throw new Error('缺少原始角色资源');
  const manifest=await response.json(),loader=new GLTFLoader().setMeshoptDecoder(MeshoptDecoder),assets=new Map<Side,AgentAsset>();
  let count=0;
  for(const side of ['CT','T']as Side[]){
    const entry=manifest.models[side],gltf=await loader.loadAsync(root+entry.file);
    gltf.scene.traverse(o=>{if(!(o instanceof THREE.Mesh))return;o.frustumCulled=false;o.userData.source2Agent=true;o.castShadow=true;o.receiveShadow=true;o.geometry.userData.source2Shared=true;
      for(const material of Array.isArray(o.material)?o.material:[o.material]){
        const m=material as THREE.MeshStandardMaterial,source=m.userData.vmat;
        if(source?.FloatParams?.g_flMetalness!==undefined)m.metalness=source.FloatParams.g_flMetalness;
        // Native map surfaces use baked irradiance. Dynamic agents get a stronger
        // environment contribution, keeping shaded uniforms/material detail legible.
        m.envMapIntensity=1.8;for(const key of ['map','normalMap','roughnessMap','metalnessMap','aoMap']as const)if(m[key])m[key]!.anisotropy=8;
      }
    });
    setAgentBounds(gltf.scene);assets.set(side,{gltf,name:entry.name,additive:new Set(Object.entries(entry.animations).filter(([,v]:[string,any])=>v.additive).map(([k])=>k))});progress(++count/2);
  }
  registerNativeCharacterFactory(side=>{
    const asset=assets.get(side)!,rig=cloneSkeleton(asset.gltf.scene)as THREE.Group,root=new THREE.Group();root.name=side+' '+asset.name;rig.rotation.y=Math.PI;root.add(rig);
    const animation=new NativeCharacterAnimation(rig,asset),weapon=makeWeapon(side==='CT'?'usp':'glock');animation.attach(weapon);
    const model:CharacterModel={root,side,weapon,animation,torso:rig,head:rig,leftLeg:rig,rightLeg:rig};return model;
  });
  return manifest;
}
