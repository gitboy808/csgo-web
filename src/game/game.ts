import{LootPhysics,type LootBody}from'./loot-physics';
import{autoWeaponPickup,pickupReach,deathWeapon}from'./pickups';
import{DroppedModels}from'../world/dropped-models';
import{loadSource2C4,type C4Library}from'../world/source2-c4';
import{prewarmGame}from'../world/prewarm';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import{teamDamageScale,canTakeOver}from'./teamplay';
import{MOVEMENT,moveSourceStyle,audibleFootstep,footstepInterval}from'./movement';
import { Physics } from './physics';
import { Source2Navigation } from './source2-navigation';
import { GameAudio } from './audio';
import {GameMedia} from './media';
import {RenderBudget} from './render-budget';
import {ActorVisibility} from '../world/actor-visibility';
import {AdaptiveResolution} from './adaptive-resolution';
import {WorldResolution} from '../world/world-resolution';
import {MatchPresentation,type RadioCommand,type MusicCue} from './presentation';
import { Input } from './input';
import { WEAPONS, createWeapon, finishReload, resolveDamage } from './weapons';
import {newHandling,advanceHandling,applyShotRecoil,weaponInaccuracy,spreadOffset,sourceVerticalFov,nextAttackTime,type WeaponHandling} from './weapon-handling';
import { RULES, newMatch, checkWin, endRound, nextRound, purchase, canBuy, teamForSide } from './rules';
import type { Combatant, Difficulty, GrenadeId, MatchState, Settings, Side, Team, Vec3, WeaponId } from './types';
import { MAP, inSpawn, siteAt, zoneAt, useSource2Map } from '../world/map';
import { Source2Level, loadSource2Map } from '../world/source2-level';
import {loadSource2Weapons} from '../world/source2-weapons';
import {loadSource2Characters} from '../world/source2-characters';
import type { Source2MapData } from '../world/source2-types';
import { makeCharacter, equipCharacterWeapon, makeWeapon, type CharacterModel, type WeaponModel } from '../world/models';
import { Effects, type Grenade } from '../world/effects';
import {loadSource2Grenades,type GrenadeLibrary,type GrenadeView} from '../world/source2-grenades';
import {GRENADES,GRENADE_IDS,emptyGrenades,canPurchaseGrenade,canCarryGrenade,createProjectile,stepProjectile,heBlastDamage,flashExposure,GrenadeThrowState,MAX_PROJECTILES,type GrenadeCollision} from './grenades';
import {GrenadeHazards} from './grenade-hazards';
import {VolumetricSmoke} from '../world/volumetric-smoke';
import {GrenadeFire} from '../world/grenade-fire';
import {GrenadeTrajectory} from '../world/grenade-trajectory';
import {FlashAfterimage} from '../world/flash-afterimage';
import {GrenadeExplosion} from '../world/grenade-explosion';
import {BuyPortrait} from '../world/buy-portrait';
import {BuySession,isBuyId,type BuyId} from './buying';
import{CharacterHitboxes}from'../world/hitboxes';
import{armorProtects,type HitGroup}from'./hit-feedback';
import { UI, readSettings } from '../ui/ui';

interface Pawn extends Combatant {
  position:THREE.Vector3;velocity:THREE.Vector3;body:RAPIER.RigidBody;collider:RAPIER.Collider;model:CharacterModel;
  yaw:number;pitch:number;crouch:boolean;grounded:boolean;slot:WeaponId;nextShot:number;reloadUntil:number;reloadCommitAt:number;shotCount:number;handling:WeaponHandling;
  burstMode:boolean;burstLeft:number;burstNext:number;burstEnd:number;lastFire:number;lastDamage:number;
  target:number|null;lastSeen:THREE.Vector3|null;memoryUntil:number;senseAt:number;path:Vec3[];pathIndex:number;repathAt:number;
  route:Vec3[];routeIndex:number;reactionUntil:number;stuckTime:number;lastPosition:THREE.Vector3;deathTime:number;
  grenades:Record<GrenadeId,number>;grenadePurchases:Record<GrenadeId,number>;stepAt:number;footSpeed:number;landSpeed:number;jumped:boolean;flashUntil:number;flashHoldUntil:number;flashAlpha:number;flashFade:number;utilityAt:number;utility:{kind:GrenadeId;strength:number;at:number;phase:'pin'|'throw';released:boolean}|null;botAction:string;
}
interface Drop {position:THREE.Vector3;weapon:ReturnType<typeof createWeapon>;mesh:THREE.Group;team:Team;loot?:LootBody;owner?:number;pickupAfter?:number}
const botNames=['YOU','MASON','NOMAD','GHOST','ATLAS','KASIM','FARID','OMAR','RAFIQ','AZIZ'];
const diff:Record<Difficulty,{reaction:number;spread:number;speed:number}>={easy:{reaction:.75,spread:.058,speed:3.8},normal:{reaction:.4,spread:.026,speed:4.6},hard:{reaction:.23,spread:.011,speed:5.2}};
const up=new THREE.Vector3(0,1,0);
function direction(yaw:number,pitch=0){return new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));}

export class Game {
  private hitboxes=new CharacterHitboxes();
  readonly canvas=document.querySelector<HTMLCanvasElement>('#world')!;
  readonly ui=new UI(readSettings());
  settings=this.ui.settings;
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(80,innerWidth/innerHeight,.07,450);
  readonly viewScene=new THREE.Scene();
  readonly viewCamera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.01,5);
  readonly physics=new Physics();navigation!:Source2Navigation;readonly audio=new GameAudio();readonly input:Input;
  private media=new GameMedia(this.audio,message=>this.ui.radio(message));private presentation=new MatchPresentation();
  private purchases=new BuySession();private buyPortrait:BuyPortrait|null=null;
  private radioPage:string|null=null;private musicAudition=false;private roundKills=new Map<number,number>();private planter:number|null=null;private objectiveMvp:number|null=null;private mvpAt=Infinity;
  effects!:Effects;level!:Source2Level;actors:Pawn[]=[];match:MatchState=newMatch();
  source2!:Source2MapData;
  private training=false;private trainingSpawns=new Map<number,THREE.Vector3>();
  private inspecting=false;private inspectingChanged=false;private orbit:OrbitControls|null=null;private inspectPanel:HTMLElement|null=null;
  active=false;paused=false;overlay:'none'|'pause'|'settings'|'buy'='none';
  time=0;private accumulator=0;private last=0;private frames=0;private fpsTime=0;fps=60;private hudAt=0;
  private renderBudget?:RenderBudget;private loopRunning=false;private renderCount=0;
  private resolution=new AdaptiveResolution();private worldResolution=new WorldResolution();
  private frameWork:number[]=[];private visibility=new ActorVisibility();private actorPoseTimes=new Map<number,number>();private actorVisibilityStats={visible:0,shadowOnly:0,culled:0,updated:0};
  private viewModels=new Map<WeaponId,WeaponModel>();private currentView!:WeaponModel;
  private sway=new THREE.Vector2();private muzzleUntil=0;private flashLight=new THREE.PointLight(0xffc37e,0,3);
  private scopeLevel=0;private selectedGrenade:GrenadeId|null=null;private bombSelected=false;private grenadeCooldown=0;
  private get scoped(){return this.scopeLevel>0;}
  private set scoped(value:boolean){this.scopeLevel=value?Math.max(1,this.scopeLevel):0;}
  private c4?:C4Library;private lootPhysics!:LootPhysics;private groundModels!:DroppedModels;private bombBody?:LootBody;private bombPlacedFor:Vec3|null=null;private bombYaw=0;private bombDropOwner=-1;private bombPickupAfter=0;private pickupAt=0;private kitDrops:{mesh:THREE.Group;position:THREE.Vector3;loot:LootBody;owner:number;pickupAfter:number}[]=[];private prewarmStats:unknown;
  private bombMesh=new THREE.Group();private drops:Drop[]=[];private interactionActor:number|null=null;private interactionTime=0;private interactionLabel='';
  private grenadeLibrary?:GrenadeLibrary;private grenadeViews=new Map<GrenadeId,GrenadeView>();private throwState=new GrenadeThrowState();private grenadeId=0;private grenadeProps=new Map<number,THREE.Group>();private spentGrenades=new Map<number,THREE.Group>();private grenadeDrops:{kind:GrenadeId;position:THREE.Vector3;mesh:THREE.Group;team:Team;loot?:LootBody;owner?:number;pickupAfter?:number}[]=[];private grenadeCollision!:GrenadeCollision;
  private hazards!:GrenadeHazards;private smokeVolumes=new VolumetricSmoke();private grenadeFire!:GrenadeFire;private grenadeExplosion!:GrenadeExplosion;private trajectory!:GrenadeTrajectory;private utilityTraining=false;private fireDamageAt=0;private trajectoryInfo="";
  private flashAfterimage=new FlashAfterimage();private flashCapturePending=false;private hazardAudio=new Map<number,NonNullable<ReturnType<GameAudio["nativeLoop"]>>>();
  private heldBomb=new THREE.Group();
  private lastBeep=0;private spectator=1;private bombPlan:'A'|'B'='A';private menuTime=0;
  private targetSightings=new Map<number,number>();private performanceSamples:number[]=[];
  constructor(){
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setSize(innerWidth,innerHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.autoClear=false;this.renderer.info.autoReset=false;
    this.input=new Input(this.canvas);this.input.onAction=code=>this.onKey(code);
    this.ui.callbacks={start:()=>void this.start(),resume:()=>void this.resume(),menu:()=>this.toMenu(),restart:()=>void this.start(this.training,this.utilityTraining),buy:id=>this.buy(id),settings:s=>this.applySettings(s),openSettings:()=>this.openSettings(),closeOverlay:()=>this.closeOverlay(),inspect:()=>this.inspectMap(),practice:()=>void this.start(true),utility:()=>void this.start(true,true),armory:()=>this.openBuy(),music:()=>this.openMusic(),previewMusic:cue=>void this.previewMusic(cue)};
    this.viewScene.add(new THREE.HemisphereLight(0xf8f5e7,0x827c63,2.5));const light=new THREE.DirectionalLight(0xfff2d7,3);light.position.set(-3,4,2);this.viewScene.add(light,this.flashLight);this.flashLight.position.set(0,0,-.6);
    window.addEventListener('resize',()=>this.resize());
    document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==this.canvas&&this.active&&this.overlay==='none'&&this.match.phase!=='finished')this.pause();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.audio.hits.clear();this.audio.footsteps.clear();this.media.setPaused(true);if(this.active)this.pause();this.stopRendering();}else this.wakeRendering();});
  }
  async init(){
    this.ui.loading(.04,'正在准备渲染引擎');
    this.source2=await loadSource2Map();useSource2Map(this.source2);this.ui.refreshMap();
    this.camera.far=2500;this.camera.updateProjectionMatrix();
    this.navigation=new Source2Navigation(this.source2.navigation);
    await this.physics.init(this.source2);
    const library=await loadSource2Weapons(f=>this.ui.loading(.13+f*.09,'载入原始枪械与第一人称动作'),name=>this.audio.nativeEvent(name));
    await Promise.all([this.audio.prepareNative(library.root,library.parameters),this.media.prepare(),this.audio.hits.prepare(),this.audio.footsteps.prepare(),this.hitboxes.prepare()]);
    [this.grenadeLibrary,this.c4]=await Promise.all([loadSource2Grenades(library.arms,f=>this.ui.loading(.22+f*.08,'载入原始投掷物与动作')),loadSource2C4(library.arms,name=>this.audio.nativeEvent(name))]);
    await this.audio.prepareAdditional(this.c4.root);await this.audio.prepareAdditional(this.grenadeLibrary.root);
    await loadSource2Characters(f=>this.ui.loading(.30+f*.04,'载入原始角色与第三人称动作'));
    this.viewCamera.fov=sourceVerticalFov(68);this.viewCamera.updateProjectionMatrix();
    this.ui.loading(.34,'正在构建街巷、建筑与光照');
    this.level=new Source2Level(this.scene,this.renderer,this.source2);
    await this.level.load((f,label)=>this.ui.loading(.34+f*.54,label));
    this.lootPhysics=new LootPhysics(this.physics.world);this.groundModels=new DroppedModels();
    this.effects=new Effects(this.scene,this.grenadeLibrary);this.grenadeCollision=this.physics.grenadeCollision(()=>this.actors);
    this.hazards=new GrenadeHazards(this.grenadeCollision,(field,side)=>this.smokeVolumes.add(field,side),p=>this.audio.nativeEvent('Molotov.Extinguish',p));
    this.grenadeFire=new GrenadeFire(this.scene);this.grenadeExplosion=new GrenadeExplosion(this.scene);
    await Promise.all([this.grenadeFire.load(),this.grenadeExplosion.load()]);this.trajectory=new GrenadeTrajectory(this.scene);
    this.viewScene.environment=this.scene.environment;this.viewScene.environmentIntensity=.6;
    for(const id of Object.keys(WEAPONS)as WeaponId[]){const model=makeWeapon(id,true);model.root.visible=false;this.viewScene.add(model.root);this.viewModels.set(id,model);}
    if(this.grenadeLibrary)for(const id of GRENADE_IDS){const view=this.grenadeLibrary.view(id,name=>this.audio.nativeEvent(name));view.root.visible=false;this.viewScene.add(view.root);this.grenadeViews.set(id,view);}
    this.selectView('usp');this.createBomb();
    this.ui.loading(.91,'正在集结战术小队');
    for(let i=0;i<10;i++)this.actors.push(this.createPawn(i));
    this.prepareRound(true);this.applySettings(this.settings);
    this.camera.position.copy(this.source2.cameras[0].position);this.camera.lookAt(new THREE.Vector3().copy(this.source2.cameras[0].target));
    this.ui.loading(.93,'预热装备、特效和静态阴影');this.grenadeExplosion.prewarm(this.renderer);
    await this.smokeVolumes.prewarm(this.renderer,this.camera);
    this.prewarmStats=await prewarmGame(this.renderer,this.scene,this.viewScene,this.camera,this.viewCamera,[...this.groundModels.prewarmModels(),...this.c4?.prewarmModels()??[]],this.level,f=>this.ui.loading(.93+f*.065,'预热装备与出生区域 · 烘焙静态阴影'));
    // Run the real actor/weapon pose path once behind the loading overlay as well: it can create material variants
    // that a compile-only traversal cannot discover until the first animation pose is installed.
    this.ui.loading(.995,'准备首次角色姿态');const initialViewport=this.renderer.getViewport(new THREE.Vector4());this.renderer.setRenderTarget(null);this.renderer.setViewport(0,0,64,64);this.last=performance.now();
    try{this.frame(this.last+1000/60);}finally{this.renderer.setViewport(initialViewport);}
    await this.worldResolution.prewarm(this.renderer);
    this.prewarmStats={...(this.prewarmStats as object),readyPrograms:this.renderer.info.programs?.length};this.frames=0;this.fpsTime=0;
    this.ui.loading(1,'准备就绪');this.ui.loaded();
    document.addEventListener('pointerdown',()=>{if(!this.active)void this.audio.start().then(()=>this.media.unlock());},{once:true});
    this.last=performance.now();this.wakeRendering();
    // Audio scheduling must remain responsive even when the 3D image is frozen.
    window.setInterval(()=>{this.media.setPaused(document.hidden||this.active&&this.paused&&!this.musicAudition&&this.match.phase!=='finished');this.media.update();if(this.paused||!this.active)this.stopHazardAudio();},50);
    if(import.meta.env.DEV)this.installDebug();
    if(new URLSearchParams(location.search).has('inspect'))this.inspectMap();
  }
  private createPawn(id:number):Pawn {
    const team:Team=id<5?0:1,side=this.match.sides[team],p=this.physics.spawnPoint(MAP.spawns[side][id%5]);
    const {body,collider}=this.physics.character(p),model=makeCharacter(side);this.scene.add(model.root);this.lightCharacter(model);
    return {id,team,name:botNames[id],alive:true,health:100,armor:0,helmet:false,kit:false,money:800,kills:0,deaths:0,inventory:[createWeapon(side==='CT'?'usp':'glock'),createWeapon('knife')],position:new THREE.Vector3(p.x,p.y,p.z),velocity:new THREE.Vector3(),body,collider,model,yaw:side==='CT'?Math.PI:0,pitch:0,crouch:false,grounded:true,slot:side==='CT'?'usp':'glock',nextShot:0,reloadUntil:0,reloadCommitAt:0,handling:newHandling(),burstMode:false,burstLeft:0,burstNext:0,burstEnd:0,lastFire:-100,lastDamage:-100,shotCount:0,target:null,lastSeen:null,memoryUntil:0,senseAt:0,path:[],pathIndex:0,repathAt:0,route:[],routeIndex:0,reactionUntil:0,stuckTime:0,lastPosition:new THREE.Vector3(),deathTime:0,grenades:emptyGrenades(),grenadePurchases:emptyGrenades(),stepAt:0,footSpeed:0,landSpeed:0,jumped:false,flashUntil:0,flashHoldUntil:0,flashAlpha:0,flashFade:1,utilityAt:0,utility:null,botAction:'守备'};
  }
  private lightCharacter(model:CharacterModel){model.root.traverse(o=>{if(o instanceof THREE.Mesh&&o.userData.source2Agent)for(const material of Array.isArray(o.material)?o.material:[o.material]){const m=material as THREE.MeshStandardMaterial;m.envMap=this.scene.environment;m.envMapIntensity=1.35;m.needsUpdate=true;}});}
  private controlledId=0;
  private get player(){return this.actors[this.controlledId??0];}
  private eye(a:Pawn){return a.position.clone().add(new THREE.Vector3(0,a.crouch?1.07:1.6256,0));}
  private weapon(a:Pawn){return a.inventory.find(w=>w.id===a.slot)||a.inventory[0];}
  private setSlot(a:Pawn,id:WeaponId){if(!a.inventory.some(w=>w.id===id))return;a.slot=id;equipCharacterWeapon(a.model,id);a.burstLeft=0;a.reloadUntil=a.reloadCommitAt=0;a.shotCount=0;a.handling=newHandling();if(WEAPONS[id].native)a.nextShot=Math.max(a.nextShot,this.time+WEAPONS[id].native!.deploy);if(a.id===this.player.id){this.throwState.reset();this.trajectory?.hide();this.scoped=false;this.bombSelected=false;this.selectedGrenade=null;this.selectView(id);}}
  private selectView(id:WeaponId){for(const m of this.viewModels.values())m.root.visible=false;this.currentView=this.viewModels.get(id)!;if(this.currentView){this.currentView.root.visible=true;this.currentView.animation?.play('draw');}}
  private createBomb(){
    this.bombMesh=this.c4!.world();this.heldBomb=this.c4!.view;
    this.scene.add(this.bombMesh);this.viewScene.add(this.heldBomb);
    this.bombMesh.visible=this.heldBomb.visible=false;
  }
  async start(practice=false,utility=false){
    this.audio.hits.clear();this.audio.footsteps.clear();
    if(!this.ui.ready)return;
    this.leaveInspector();
    this.media.clear();this.presentation.reset();this.radioPage=null;this.ui.radioMenu(null);this.musicAudition=false;this.training=practice;this.utilityTraining=this.training&&utility;this.match=newMatch(this.training?'CT':this.settings.side);this.active=true;this.paused=false;this.overlay='none';
    for(const a of this.actors){a.kills=a.deaths=0;a.money=800;a.alive=false;}
    this.prepareRound(true);if(this.training)this.configurePractice();this.ui.enter();this.ui.toast(this.utilityTraining?'投掷物训练 · 4 切换 · 左键长抛 / 右键短抛 / 双键中抛 · 松手投出':this.training?'枪械训练 · B 选择武器 · [ / ] 切换 · F 检视':'行动开始 · 按 B 购买装备，按住 E 进行目标交互');
    this.wakeRendering();const audioStarted=this.audio.start();await this.lock();await audioStarted;this.media.setPaused(this.paused);this.media.unlock();if(!this.training){this.syncPresentation();this.media.music('start');this.say(this.actors.find(a=>a.team===0&&a.id!==this.player.id)!,'locknload');}
  }
  private configurePractice(){
    const view=this.source2!.cameras.find(v=>v.name==='A 大')!,point=this.physics.spawnPoint({...view.position,y:view.position.y-1.6256});
    this.match.phase='live';this.match.remaining=115;this.match.bomb.carrier=null;this.trainingSpawns.clear();
    this.player.position.copy(point);this.player.body.setTranslation({...point,y:point.y+.9},true);this.player.body.setNextKinematicTranslation({...point,y:point.y+.9});
    this.player.yaw=Math.atan2(point.x-view.target.x,point.z-view.target.z);this.player.pitch=0;this.player.inventory=(Object.keys(WEAPONS)as WeaponId[]).map(createWeapon);this.player.money=16000;this.setSlot(this.player,'ak47');if(this.utilityTraining){for(const id of GRENADE_IDS)this.player.grenades[id]=id==='flash'?2:1;this.selectGrenade('smoke');}
    const forward=direction(this.player.yaw);
    for(const actor of this.actors.slice(1)){
      actor.alive=actor.id>=5&&actor.id<=7;actor.collider.setEnabled(actor.alive);
      if(actor.alive){const desired=new THREE.Vector3().copy(point).addScaledVector(forward,12+(actor.id-5)*10);desired.x+=(actor.id-6)*1.2;const nav=this.navigation.nearest(desired)?.point||desired,p=this.physics.spawnPoint(nav);actor.position.copy(p);actor.body.setTranslation({...p,y:p.y+.9},true);actor.body.setNextKinematicTranslation({...p,y:p.y+.9});actor.yaw=this.player.yaw+Math.PI;actor.velocity.set(0,0,0);this.trainingSpawns.set(actor.id,actor.position.clone());}
    }
    this.physics.world.step();
  }
  private async lock(){this.canvas.focus();try{try{await this.canvas.requestPointerLock({unadjustedMovement:true});}catch(error){if(error instanceof DOMException&&error.name==='NotSupportedError')await this.canvas.requestPointerLock();else throw error;}}catch(error){console.warn('Mouse capture requires a focused game window:',error);this.pause();this.ui.toast('请激活游戏窗口，点击「继续游戏」以启用鼠标控制');}}
  async resume(){this.musicAudition=false;this.ui.close();this.overlay='none';this.paused=false;this.input.reset();this.wakeRendering();const audioStarted=this.audio.start();await this.lock();await audioStarted;this.media.setPaused(this.paused);this.media.unlock();}
  pause(){if(!this.active||this.match.phase==='finished')return;this.audio.hits.clear();this.audio.footsteps.clear();this.paused=true;this.musicAudition=false;this.cancelThrow();this.stopHazardAudio();this.media.setPaused(true);this.overlay='pause';this.input.reset();if(document.pointerLockElement)document.exitPointerLock();this.ui.pause(this.training);}
  private toMenu(){this.audio.hits.clear();this.audio.footsteps.clear();this.musicAudition=false;this.media.clear();this.media.setPaused(false);this.media.music('menu',true);this.radioPage=null;this.ui.radioMenu(null);this.training=false;this.leaveInspector();this.active=false;this.paused=false;this.overlay='none';this.input.reset();document.exitPointerLock();this.ui.menu();this.effects.clear();this.clearLoot();this.clearUtility();this.wakeRendering();}
  private leaveInspector(){this.inspecting=false;if(this.orbit)this.orbit.enabled=false;this.inspectPanel?.classList.add('hidden');}
  private inspectMap(index=0){
    if(!this.ui.ready)return;
    this.active=false;this.paused=false;this.overlay='none';this.inspecting=true;this.input.reset();document.exitPointerLock();this.ui.close();this.ui.$('menu').classList.add('hidden');this.ui.$('hud').classList.add('hidden');
    if(!this.orbit){this.orbit=new OrbitControls(this.camera,this.canvas);this.orbit.enableDamping=true;this.orbit.dampingFactor=.12;this.orbit.minDistance=.25;this.orbit.maxDistance=300;this.orbit.addEventListener('change',()=>{if(!this.loopRunning)this.wakeRendering();});}
    this.orbit.enabled=true;
    const view=this.source2.cameras[index];this.camera.position.copy(view.position);this.camera.fov=73.7398;this.camera.updateProjectionMatrix();this.orbit.target.copy(view.target);this.orbit.update();
    if(!this.inspectPanel){
      this.inspectPanel=document.createElement('section');this.inspectPanel.className='map-inspector';this.inspectPanel.innerHTML=`<div class="inspect-heading"><span>DUST II <b>原图浏览</b></span><span>拖动旋转 · 右键平移 · 滚轮缩放</span></div><nav>${this.source2.cameras.map((v,i)=>`<button data-view="${i}">${v.name}</button>`).join('')}</nav><div class="inspect-actions"><button id="inspect-play">进入对局 ↗</button><button id="inspect-back">返回菜单</button></div>`;
      this.inspectPanel.querySelectorAll<HTMLButtonElement>('[data-view]').forEach(button=>button.onclick=()=>this.inspectMap(Number(button.dataset.view)));
      this.inspectPanel.querySelector<HTMLButtonElement>('#inspect-play')!.onclick=()=>void this.start();this.inspectPanel.querySelector<HTMLButtonElement>('#inspect-back')!.onclick=()=>this.toMenu();document.body.appendChild(this.inspectPanel);
    }
    this.wakeRendering();this.inspectPanel.classList.remove('hidden');this.inspectPanel.querySelectorAll<HTMLElement>('[data-view]').forEach(button=>button.classList.toggle('selected',Number(button.dataset.view)===index));
  }
  private openMusic(){this.audio.hits.clear();this.audio.footsteps.clear();this.cancelThrow();this.musicAudition=true;this.paused=this.active;this.overlay='settings';this.input.reset();if(document.pointerLockElement)document.exitPointerLock();this.media.setPaused(false);this.ui.musicPanel();void this.previewMusic('menu');}
  private async previewMusic(cue:MusicCue){await this.audio.start();this.media.setPaused(false);this.media.unlock(false);this.media.music(cue,true);}
  private openSettings(){this.cancelThrow();this.musicAudition=false;this.paused=this.active;this.overlay='settings';this.input.reset();if(document.pointerLockElement)document.exitPointerLock();this.ui.settingsPanel();}
  private closeOverlay(){this.musicAudition=false;if(this.active)void this.resume();else{this.overlay='none';this.ui.close();this.media.music('menu',true);this.wakeRendering();}}
  private openBuy(){if(this.training){this.cancelThrow();this.paused=true;this.overlay='buy';this.input.reset();document.exitPointerLock();this.ui.armory();return;}if(!canBuy(this.match,this.player,inSpawn(this.match.sides[0],this.player.position.x,this.player.position.z))){this.ui.toast('只能在准备阶段的出生区域购买装备');return;}this.cancelThrow();this.paused=true;this.overlay='buy';this.input.reset();document.exitPointerLock();this.showBuy();}
  private applySettings(settings:Settings){const previous=this.settings;if(previous.quality!==settings.quality||previous.frameLimit!==settings.frameLimit||previous.dynamicResolution!==settings.dynamicResolution)this.wakeRendering();this.settings=settings;if(previous.quality!==settings.quality||previous.dynamicResolution!==settings.dynamicResolution){this.resolution.reset();this.worldResolution.scale=1;}this.audio.setVolume(settings.volume);this.media.settings(settings);const ratio={high:1.7,medium:1.3,low:1}[settings.quality];if(this.renderer.getPixelRatio()!==Math.min(devicePixelRatio,ratio))this.renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));this.renderer.shadowMap.enabled=settings.quality!=='low';if(this.level){const size=settings.quality==='high'?4096:2048;if(this.level.sun.shadow.mapSize.x!==size){this.level.sun.shadow.mapSize.set(size,size);this.level.sun.shadow.map?.depthTexture?.dispose();this.level.sun.shadow.map?.dispose();this.level.sun.shadow.map=null;this.level.shadows?.invalidate();}}}
  private showBuy(){
    const p=this.player,side=this.match.sides[p.team],inZone=inSpawn(side,p.position.x,p.position.z);
    this.ui.buy({player:p,match:this.match,weapon:p.slot,refunds:this.purchases.refunds(this.match,p,inZone),canRebuy:this.purchases.canRebuy,
      team:this.actors.filter(a=>a.team===p.team).map(a=>({name:a.name,items:[...a.inventory.map(w=>w.id),...GRENADE_IDS.filter(k=>a.grenades[k]>0),...(a.armor?['armor']:[]),...(a.helmet?['helmet']:[]),...(a.kit?['kit']:[])]})),
      drops:[...this.drops.flatMap((d,i)=>this.buyDropAvailable(d)?[{key:'gun:'+i,item:d.weapon.id}]:[]),...this.grenadeDrops.flatMap((d,i)=>this.buyDropAvailable(d)?[{key:'grenade:'+i,item:d.kind}]:[]),...(this.buyBombAvailable()?[{key:'c4',item:'c4' as const}]:[])],
    },{buy:(id,donate)=>this.buy(id,donate),refund:id=>this.buyAction('refund',id),refundAll:()=>this.buyAction('refund-all'),autoBuy:()=>this.buyAction('auto'),rebuy:()=>this.buyAction('rebuy'),pickup:key=>this.pickupBuyDrop(key),close:()=>this.closeOverlay(),
      portrait:(faction,weapon,kit,item)=>(this.buyPortrait??=new BuyPortrait(this.renderer,this.scene.environment,faction=>this.actors.find(a=>a.model.side===faction)!.model,this.grenadeLibrary)).render(faction,weapon,kit,item)});
  }
  private syncBuyWeapon(preferPrimary=false){const p=this.player,current=p.inventory.find(w=>w.id===p.slot)?.id,primary=p.inventory.find(w=>WEAPONS[w.id].slot===1)?.id;this.setSlot(p,(preferPrimary?primary:current)??primary??current??p.inventory[0].id);}
  private buyAction(action:'refund'|'refund-all'|'auto'|'rebuy',id?:BuyId){
    const p=this.player,inZone=inSpawn(this.match.sides[p.team],p.position.x,p.position.z);
    const count=action==='refund'?Number(!!id&&this.purchases.refund(this.match,p,id,inZone)):action==='refund-all'?this.purchases.refundAll(this.match,p,inZone):action==='auto'?this.purchases.autoBuy(this.match,p,inZone):this.purchases.rebuy(this.match,p,inZone);
    if(count){this.syncBuyWeapon(action==='auto'||action==='rebuy');this.audio.beep(580,.035,.022);}this.showBuy();
    this.ui.buyFeedback(count?(action.startsWith('refund')?'已退还未使用的装备':'装备购买完成'):'没有符合条件的装备');
  }
  private buyDropAvailable(drop:Pick<Drop,'position'|'team'>){const p=this.player,side=this.match.sides[p.team];return drop.team===p.team&&inSpawn(side,drop.position.x,drop.position.z)&&this.physics.canSee(this.eye(p),drop.position);}
  private buyBombAvailable(){const b=this.match.bomb,side=this.match.sides[this.player.team];return side==='T'&&b.carrier===null&&!!b.position&&inSpawn(side,b.position.x,b.position.z)&&this.physics.canSee(this.eye(this.player),b.position);}
  private pickupBuyDrop(key:string){
    const p=this.player,side=this.match.sides[p.team];if(!canBuy(this.match,p,inSpawn(side,p.position.x,p.position.z)))return;
    if(key==='c4'){
      if(!this.buyBombAvailable())return;this.match.bomb.carrier=p.id;this.match.bomb.position=null;this.lootPhysics.remove(this.bombBody);this.bombBody=undefined;this.bombMesh.visible=false;this.showBuy();this.ui.buyFeedback('已拾取 C4');this.wakeRendering();return;
    }
    const match=/^(gun|grenade):(\d+)$/.exec(key);if(!match)return;const index=Number(match[2]);
    if(match[1]==='grenade'){
      const drop=this.grenadeDrops[index];if(!drop||!this.buyDropAvailable(drop))return;
      if(!canCarryGrenade(drop.kind,p.grenades)){this.ui.buyFeedback('投掷物携带数量已满');return;}
      p.grenades[drop.kind]++;this.lootPhysics.remove(drop.loot);this.grenadeLibrary?.release(drop.mesh);this.grenadeDrops.splice(index,1);this.showBuy();this.ui.buyFeedback(`已拾取 ${GRENADES[drop.kind].name}`);this.wakeRendering();return;
    }
    const drop=this.drops[index];if(!drop||!this.buyDropAvailable(drop))return;
    this.takeGun(p,drop,true);this.showBuy();this.ui.buyFeedback(`已拾取 ${WEAPONS[drop.weapon.id].name}`);this.wakeRendering();
  }
  private buy(id:string,donate=false){
    if(this.training&&GRENADE_IDS.includes(id as GrenadeId)){this.player.grenades[id as GrenadeId]=1;this.selectGrenade(id as GrenadeId);void this.resume();return;}
    if(this.training&&id in WEAPONS){this.setSlot(this.player,id as WeaponId);void this.resume();return;}
    if(!isBuyId(id))return;
    const p=this.player,inZone=inSpawn(this.match.sides[0],p.position.x,p.position.z);let result=false;
    if(donate&&Object.hasOwn(WEAPONS,id)){
      const weapon=this.purchases.donate(this.match,p,id as Exclude<WeaponId,'knife'>,inZone);if(weapon){this.spawnDrop(p,weapon);result=true;}
    }else{
      result=this.purchases.buy(this.match,p,id,inZone);
      if(result&&Object.hasOwn(WEAPONS,id))this.setSlot(p,id as WeaponId);
      if(result&&donate&&GRENADE_IDS.includes(id as GrenadeId))this.dropGrenade(p,id as GrenadeId);
    }
    if(result)this.audio.beep(600,.045,.025);
    if(this.overlay==='buy'){this.showBuy();this.ui.buyFeedback(result?(donate?'已购买并投掷，可供队友拾取':'购买成功'):'无法购买：检查资金、装备与本回合配额');}
    else if(!result)this.ui.toast('无法购买：检查资金、阵营与投掷物上限');
    if(donate&&result)this.wakeRendering();
  }
  private prepareRound(reset=false){
    this.controlledId=0;
    this.purchases.beginRound(this.match,this.player,reset);this.clearLoot();this.c4?.setDisplay('');
    this.clearUtility();
    this.actorPoseTimes.clear();this.roundKills=new Map(this.actors.map(a=>[a.id,a.kills]));this.planter=this.objectiveMvp=null;this.mvpAt=Infinity;delete this.match.mvp;this.radioPage=null;this.ui.radioMenu(null);
    this.effects?.clear();
    this.interactionActor=null;this.interactionTime=0;this.selectedGrenade=null;this.scoped=false;this.bombSelected=false;this.bombMesh.visible=false;
    this.bombPlan=this.match.round%2?'A':'B';
    for(const a of this.actors){
      const side=this.match.sides[a.team],p=this.physics.spawnPoint(MAP.spawns[side][a.id%5]),survived=a.alive&&!reset;
      if(reset||!survived){a.inventory=[createWeapon(side==='CT'?'usp':'glock'),createWeapon('knife')];a.armor=0;a.helmet=false;a.kit=false;a.grenades=emptyGrenades();}
      if(reset)a.money=800;
      if(a.model.side!==side){this.scene.remove(a.model.root);a.model.animation?.dispose();a.model.root.traverse(o=>{if(o instanceof THREE.Mesh&&!o.geometry.userData.source2Shared)o.geometry.dispose();});a.model=makeCharacter(side);this.scene.add(a.model.root);this.lightCharacter(a.model);}
      a.position.set(p.x,p.y,p.z);a.body.setTranslation({x:p.x,y:p.y+.9,z:p.z},true);a.body.setNextKinematicTranslation({x:p.x,y:p.y+.9,z:p.z});a.collider.setEnabled(true);this.physics.resize(a.collider,false);
      a.alive=true;a.health=100;a.velocity.set(0,0,0);a.stepAt=this.time;a.footSpeed=a.landSpeed=0;a.jumped=false;a.crouch=false;a.grounded=true;a.yaw=this.source2.spawns[side][a.id%5].yaw;a.pitch=0;
      a.target=null;a.lastSeen=null;a.memoryUntil=0;a.path=[];a.pathIndex=0;a.routeIndex=0;a.repathAt=0;a.senseAt=this.time+a.id*.015;a.stuckTime=0;a.reloadUntil=a.reloadCommitAt=0;a.handling=newHandling();a.burstMode=false;a.burstLeft=0;a.burstNext=a.burstEnd=0;a.nextShot=0;a.lastFire=a.lastDamage=-100;a.flashUntil=a.flashHoldUntil=0;a.flashAlpha=0;a.flashFade=1;a.utilityAt=this.time+3;a.utility=null;a.shotCount=0;
      a.model.root.visible=true;a.model.root.position.copy(a.position);a.model.root.rotation.set(0,a.yaw,0);
      for(const gun of a.inventory){gun.ammo=WEAPONS[gun.id].magazine;gun.reserve=WEAPONS[gun.id].reserve;}
      a.grenadePurchases={...a.grenades};if(a.id!==this.player.id)this.equipBot(a);
      a.slot=a.inventory.find(w=>WEAPONS[w.id].slot===1)?.id||a.inventory.find(w=>WEAPONS[w.id].slot===2)!.id;
      equipCharacterWeapon(a.model,a.slot);a.model.animation?.reset();
      a.route=this.botRoute(a,side);a.lastPosition.copy(a.position);
    }
    const attackers=this.actors.filter(a=>this.match.sides[a.team]==='T');
    this.match.bomb.carrier=attackers.find(a=>a.id===this.player.id)?.id??attackers[0].id;
    this.selectView(this.player.slot);this.physics.world.step();
  }
  private equipBot(a:Pawn){
    const side=this.match.sides[a.team];
    if(this.match.round>1&&a.money>3500){const id=a.id%5===4&&a.money>5750?'awp':side==='CT'?'m4a1':'ak47';purchase(this.match,a,id,true);}
    if(a.money>=1000)purchase(this.match,a,'helmet',true);else if(a.money>=650)purchase(this.match,a,'armor',true);
    if(side==='CT'&&a.money>=400)purchase(this.match,a,'kit',true);
    if(this.match.round>1){const first=(["he","flash","smoke",side==='CT'?'incendiary':'molotov','decoy']as GrenadeId[])[a.id%5];for(const kind of [first,'he']as GrenadeId[])if(canPurchaseGrenade(kind,side,a.grenades,a.money,a.grenadePurchases)){a.money-=GRENADES[kind].price;a.grenades[kind]++;a.grenadePurchases[kind]++;}}
  }
  private botRoute(a:Pawn,side:Side):Vec3[]{
      const nav=this.navigation;
      const place=(name:string,index=0):Vec3=>{const zones=this.source2!.places.filter(p=>p.callout===name),zone=zones[index%zones.length];if(!zone)return this.source2!.sites[0].position;const x=(zone.min.x+zone.max.x)/2,z=(zone.min.z+zone.max.z)/2;return nav.nearest({x,y:nav.heightAt(x,z),z})?.point||{x,y:0,z};};
      const site=(name:'A'|'B')=>this.source2!.sites.find(s=>s.name===name)!.position;
      if(side==='T')return this.bombPlan==='B'?[place('TRamp'),place('OutsideTunnel'),place('UpperTunnel',0),place('UpperTunnel',5),site('B')]:a.id%3===0?[place('TopofMid'),place('Catwalk',1),place('Catwalk'),place('ShortStairs'),place('ExtendedA',1),site('A')]:[place('OutsideLong'),place('LongDoors',1),place('LongDoors'),place('LongA'),place('ARamp'),site('A')];
      return a.id%3===0?[place('MidDoors'),place('Middle')]:a.id%2===0?[place('BDoors'),site('B')]:[site('A'),place('ARamp')];
  }
  private onKey(code:string){
    if(this.active&&!this.paused&&this.player.alive&&this.handleRadioKey(code))return;
    if(this.inspecting&&code==='Escape'){this.toMenu();return;}
    if(this.inspecting&&/^Digit[1-9]$/.test(code)){this.inspectMap(Number(code.at(-1))-1);return;}
    if(code==='Enter'&&!this.active&&this.overlay==='none'){void this.start();return;}
    if(code==='Escape'&&this.overlay!=='none'){this.closeOverlay();return;}
    if(code==='KeyB'&&this.active){if(this.overlay==='buy')this.closeOverlay();else if(!this.paused)this.openBuy();return;}
    if(this.active&&!this.paused&&!this.player.alive){
      if(code==='KeyE'){this.takeOver(this.spectator);return;}
      if(/^Digit[1-5]$/.test(code)){const teammate=this.actors.filter(a=>a.team===this.player.team)[Number(code.at(-1))-1];if(teammate?.alive)this.spectator=teammate.id;return;}
    }
    if(!this.active||this.paused||!this.player?.alive)return;
    const p=this.player;
    if(code==='KeyR'&&!this.bombSelected&&!this.selectedGrenade)this.reload(p);
    if(['Digit1','Digit2','Digit3'].includes(code)){const slot=Number(code.at(-1));const weapon=p.inventory.find(w=>WEAPONS[w.id].slot===slot);if(weapon)this.setSlot(p,weapon.id);}
    if(code==='Digit4'){
      const owned=GRENADE_IDS.filter(k=>p.grenades[k]>0);if(owned.length)this.selectGrenade(owned[(owned.indexOf(this.selectedGrenade!)+1)%owned.length]);else this.ui.toast('没有投掷物 · 准备阶段按 B 购买');
    }
    const utilityKey:Record<string,GrenadeId>={Digit6:'he',Digit7:'flash',Digit8:'smoke',Digit9:'decoy',Digit0:p.grenades.molotov?'molotov':'incendiary'};
    if(utilityKey[code]&&p.grenades[utilityKey[code]])this.selectGrenade(utilityKey[code]);
    if(code==='Digit5'){if(this.match.bomb.carrier===this.player.id){this.cancelThrow();p.reloadUntil=p.reloadCommitAt=0;this.bombSelected=true;this.selectedGrenade=null;this.scoped=false;this.c4?.animation.play('draw');this.ui.toast('携带 C4 · 在包点长按左键或 E 安装');}else this.ui.toast('当前未携带 C4');}
    if(this.training&&(code==='BracketLeft'||code==='BracketRight')){const guns=Object.keys(WEAPONS)as WeaponId[],i=guns.indexOf(p.slot);this.setSlot(p,guns[(i+(code==='BracketRight'?1:guns.length-1))%guns.length]);}
    if(code==='KeyF'&&!p.reloadUntil){if(this.bombSelected)this.c4?.animation.play('inspect');else if(this.selectedGrenade&&this.throwState.phase==='idle')this.grenadeViews.get(this.selectedGrenade)?.play('inspect');else if(!this.selectedGrenade)this.currentView.animation?.play('inspect');}
    if(code==='KeyG'){if(this.throwState.phase==='throwing')return;if(this.selectedGrenade){this.dropGrenade(p,this.selectedGrenade);return;}if(this.bombSelected&&this.match.bomb.carrier===this.player.id){this.dropBomb(p);this.setSlot(p,p.slot);}else this.drop(p);}
  }
  private reload(a:Pawn){const w=this.weapon(a);if(w.id==='knife'||a.reloadUntil||w.ammo===WEAPONS[w.id].magazine||w.reserve<=0)return;a.burstLeft=0;a.reloadUntil=this.time+WEAPONS[w.id].reload;a.reloadCommitAt=this.time+(WEAPONS[w.id].reloadInsert??WEAPONS[w.id].reload);a.shotCount=0;if(a.id===this.player.id){this.scoped=false;this.currentView?.animation?.play(w.ammo?'reload':'reloadEmpty',WEAPONS[w.id].reload);}}
  private dropPose(a:Pawn,death=false){const forward=direction(a.yaw,a.pitch),origin=this.eye(a).add(new THREE.Vector3(0,-.4,0)),wall=this.physics.ray(origin,forward,.6),position=origin.addScaledVector(forward,wall?Math.max(0,wall.timeOfImpact-.35):.45),velocity=a.velocity.clone().multiplyScalar(.75).addScaledVector(forward,death?1.2:4.5);velocity.y+=death?.5:1.6;return{position,velocity,rotation:new THREE.Quaternion().setFromEuler(new THREE.Euler(.1,a.yaw,.35))};}
  private spawnDrop(a:Pawn,w:ReturnType<typeof createWeapon>,death=false){
    if(w.id==='knife')return;
    const mesh=this.groundModels.take(w.id),pose=this.dropPose(a,death),loot=this.lootPhysics.add(mesh,pose.position,pose.rotation,pose.velocity);this.scene.add(mesh);this.drops.push({position:loot.position,weapon:{...w},mesh,team:a.team,loot,owner:a.id,pickupAfter:this.time+.8});
    if(this.drops.length>32)this.removeGunDrop(this.drops[0]);
  }
  private removeGunDrop(drop:Drop){this.lootPhysics?.remove(drop.loot);if(this.groundModels)this.groundModels.release(drop.mesh);else this.scene.remove(drop.mesh);this.drops=this.drops.filter(d=>d!==drop);}
  private takeGun(a:Pawn,drop:Drop,manual=false){
    if(!manual&&!autoWeaponPickup(a,drop.weapon))return false;
    const old=a.inventory.find(w=>WEAPONS[w.id].slot===WEAPONS[drop.weapon.id].slot);
    if(old){this.spawnDrop(a,old);a.inventory=a.inventory.filter(w=>w!==old);}
    a.inventory.push({...drop.weapon});this.removeGunDrop(drop);if(manual||a.id!==this.player.id&&WEAPONS[drop.weapon.id].slot<WEAPONS[a.slot].slot)this.setSlot(a,drop.weapon.id);
    if(a.id===this.player.id)this.ui.toast(`已拾取 ${WEAPONS[drop.weapon.id].name}`);return true;
  }
  private drop(a:Pawn,death=false){const w=death?deathWeapon(a):this.weapon(a);if(!w||w.id==='knife')return;this.spawnDrop(a,w,death);if(!death){a.inventory=a.inventory.filter(i=>i!==w);this.setSlot(a,a.inventory[0].id);}}
  private dropBomb(a:Pawn,death=false){
    this.lootPhysics?.remove(this.bombBody);const pose=this.dropPose(a,death);this.bombMesh.visible=true;this.bombBody=this.lootPhysics.add(this.bombMesh,pose.position,pose.rotation,pose.velocity);this.match.bomb.carrier=null;this.match.bomb.position=this.bombBody.position;this.bombPlacedFor=null;this.bombDropOwner=a.id;this.bombPickupAfter=this.time+.8;this.c4?.setDisplay('');
  }
  private dropKit(a:Pawn){if(!a.kit||!this.c4)return;const mesh=this.c4.kit(),pose=this.dropPose(a,true);pose.velocity.x+=.7;const loot=this.lootPhysics.add(mesh,pose.position,pose.rotation,pose.velocity);this.scene.add(mesh);this.kitDrops.push({mesh,position:loot.position,loot,owner:a.id,pickupAfter:this.time+.8});a.kit=false;if(this.kitDrops.length>5){const old=this.kitDrops.shift()!;old.mesh.removeFromParent();this.lootPhysics.remove(old.loot);}}
  private clearLoot(){for(const d of [...this.drops])this.removeGunDrop(d);for(const d of this.kitDrops??[])d.mesh.removeFromParent();this.kitDrops=[];this.lootPhysics?.clear();this.bombBody=undefined;this.bombPlacedFor=null;this.pickupAt=0;}
  private pickupAutomatic(){
    if(this.time<(this.pickupAt??0))return;this.pickupAt=this.time+.1;
    for(const a of this.actors){if(!a.alive)continue;
      const eligible=(d:{position:THREE.Vector3;owner?:number;pickupAfter?:number})=>(d.owner!==a.id||this.time>=(d.pickupAfter??0))&&pickupReach(a.position,d.position)&&this.physics.canSee(this.eye(a),d.position);
      const gun=this.drops.find(d=>autoWeaponPickup(a,d.weapon)&&eligible(d));if(gun)this.takeGun(a,gun);
      const utility=this.grenadeDrops.find(d=>canCarryGrenade(d.kind,a.grenades)&&eligible(d));if(utility){a.grenades[utility.kind]++;this.lootPhysics?.remove(utility.loot);this.grenadeLibrary?.release(utility.mesh);this.grenadeDrops=this.grenadeDrops.filter(d=>d!==utility);if(a.id===this.player.id)this.ui.toast(`已拾取 ${GRENADES[utility.kind].name}`);}
      if(this.match.sides[a.team]==='CT'&&!a.kit){const kit=this.kitDrops?.find(eligible);if(kit){a.kit=true;this.lootPhysics.remove(kit.loot);kit.mesh.removeFromParent();this.kitDrops=this.kitDrops.filter(d=>d!==kit);if(a.id===this.player.id)this.ui.toast('已拾取拆弹工具');}}
      const bomb=this.match.bomb;if((this.match.phase==='live'||this.match.phase==='freeze')&&this.match.sides[a.team]==='T'&&bomb.carrier===null&&bomb.position&&(a.id!==this.bombDropOwner||this.time>=this.bombPickupAfter)&&pickupReach(a.position,bomb.position)&&this.physics.canSee(this.eye(a),bomb.position)){bomb.carrier=a.id;bomb.position=null;this.lootPhysics?.remove(this.bombBody);this.bombBody=undefined;this.bombMesh.visible=false;if(a.id===this.player.id)this.ui.toast('已拾取 C4');}
    }
  }
  private updateBombVisual(){
    const bomb=this.match.bomb,p=bomb.position;this.bombMesh.visible=!!p;if(!p){this.bombPlacedFor=null;return;}if(this.bombBody&&this.match.phase!=='planted')return;
    if(this.bombPlacedFor!==p){this.lootPhysics?.remove(this.bombBody);this.bombBody=undefined;const hit=this.physics.ray({x:p.x,y:p.y+1,z:p.z},{x:0,y:-1,z:0},3),point=new THREE.Vector3(p.x,hit?p.y+1-hit.timeOfImpact:p.y,p.z);if(this.c4)this.c4.place(this.bombMesh,point,hit?new THREE.Vector3().copy(hit.normal):up,this.bombYaw);else this.bombMesh.position.copy(point).add(new THREE.Vector3(0,.07,0));this.bombPlacedFor=p;if(this.match.phase==='planted')this.c4?.setDisplay('7355608');}
  }
  private wakeRendering(){if(!this.ui.ready||document.hidden)return;(this.renderBudget??=new RenderBudget()).invalidate();if(!this.loopRunning){this.last=performance.now();this.accumulator=0;this.loopRunning=true;this.renderer.setAnimationLoop(t=>this.frame(t));}}
  private stopRendering(){this.loopRunning=false;this.renderer.setAnimationLoop?.(null);}
  private frame(timestamp:number){
    if(document.hidden){this.last=timestamp;this.accumulator=0;this.stopRendering();return;}
    const workStart=performance.now();
    const rawDt=Math.max(.0001,(timestamp-this.last)/1000),dt=Math.min(.1,rawDt);this.last=timestamp;this.fpsTime+=rawDt;
    if(this.fpsTime>=.75){this.fps=Math.round(this.frames/this.fpsTime);this.frames=0;this.fpsTime=0;}
    if(this.active&&!this.paused&&this.match.phase!=='finished'){
      this.accumulator+=dt;
      while(this.accumulator>=1/60){this.tick(1/60);this.accumulator-=1/60;}
      this.effects.update(dt);this.grenadeExplosion?.update(dt);
    }else{this.accumulator=0;if(!this.active)this.menuTime+=dt;}
    this.media.setPaused(document.hidden||this.active&&this.paused&&!this.musicAudition&&this.match.phase!=='finished');this.media.update();if(this.paused||!this.active)this.stopHazardAudio();
    const mode=this.overlay==='settings'?'paused':this.inspecting?'inspect':!this.active?'menu':this.paused||this.match.phase==='finished'?'paused':'play';
    const visualDt=(this.renderBudget??=new RenderBudget()).take(timestamp,mode,this.settings.frameLimit??60);
    if(visualDt===null)return;this.frames++;this.renderCount=(this.renderCount??0)+1;
    this.updateCamera(visualDt);this.grenadeFire?.update(this.hazards?.fires??[],this.camera);this.smokeVolumes?.update();
    this.level.update(this.time+this.menuTime);
    const actorClock=this.time+this.menuTime;
    this.visibility.begin(this.camera,this.level.sun);
    this.actorVisibilityStats={visible:0,shadowOnly:0,culled:0,updated:0};
    for(const a of this.actors){
      const eligible=!this.inspecting&&(a.id!==this.player.id||!this.active)&&(!this.training||(a.id>=5&&a.id<=7));
      const view=eligible?this.visibility.test(a.position,this.level.minimumReceiverY):{visible:eligible,shadow:eligible};
      a.model.root.visible=eligible&&(view.visible||view.shadow);a.model.root.position.copy(a.position);a.model.root.rotation.y=a.yaw;
      if(!a.model.root.visible){this.actorVisibilityStats.culled++;continue;}
      if(view.visible)this.actorVisibilityStats.visible++;else this.actorVisibilityStats.shadowOnly++;
      const previous=this.actorPoseTimes?.get(a.id),distance=a.position.distanceTo(this.camera.position);
      const interval=distance>45?1/30:0;
      const elapsed=previous===undefined?visualDt:Math.max(0,actorClock-previous);
      if(!this.paused&&previous!==undefined&&elapsed+.001<interval)continue;
      (this.actorPoseTimes??=new Map()).set(a.id,actorClock);this.actorVisibilityStats.updated++;
      this.poseCharacter(a,this.paused?0:Math.min(.1,elapsed));
      a.model.weapon.muzzle.visible=a.alive&&this.time-a.lastFire<.045;
    }
    this.renderer.info.reset();this.renderer.shadowMap.needsUpdate=true;this.renderer.clear();
    const volume=this.smokeVolumes?.active&&this.smokeVolumes.visible(this.camera)?(renderer:THREE.WebGLRenderer,depth:THREE.DepthTexture,w:number,h:number)=>this.smokeVolumes.render(renderer,this.camera,depth,w,h,this.settings.quality):undefined;
    this.worldResolution.render(this.renderer,()=>this.level.render(this.renderer,this.camera),volume);
    if(this.active&&this.player.alive&&!this.scoped){this.renderer.clearDepth();this.renderer.render(this.viewScene,this.viewCamera);}
    if(this.flashCapturePending&&this.active){this.flashAfterimage.capture(this.renderer);this.flashCapturePending=false;}if(this.active&&this.player?.flashUntil>this.time)this.flashAfterimage.render(this.renderer,Math.min(1,(this.player.flashUntil-this.time)/this.player.flashFade)*this.player.flashAlpha);
    if(this.active&&timestamp>this.hudAt){this.hudAt=timestamp+50;this.updateHUD();}
    if(import.meta.env.DEV&&this.active&&!this.paused){this.performanceSamples.push(visualDt*1000);if(this.performanceSamples.length>1800)this.performanceSamples.shift();(this.frameWork??=[]).push(performance.now()-workStart);if(this.frameWork.length>1800)this.frameWork.shift();}
    if(this.settings.dynamicResolution&&mode==='play'&&this.resolution.sample(timestamp,visualDt*1000,performance.now()-workStart,this.settings.frameLimit)){this.worldResolution.scale=this.resolution.scale;}
    if(mode==='paused'||mode==='inspect'&&!this.inspectingChanged)this.stopRendering();
  }
  private tick(dt:number){
    this.time+=dt;this.match.remaining=Math.max(0,this.match.remaining-dt);
    if(this.training){if(this.utilityTraining)for(const kind of GRENADE_IDS)this.player.grenades[kind]=kind==='flash'?2:1;if(!this.player.alive&&this.utilityTraining&&this.time-this.player.deathTime>1.4){this.player.alive=true;this.player.health=100;this.player.collider.setEnabled(true);this.configurePractice();this.clearUtility();}this.match.phase='live';this.match.remaining=115;for(const gun of this.player.inventory)gun.reserve=9999;for(const [id,spawn]of this.trainingSpawns){const actor=this.actors[id];if(!actor.alive&&this.time-actor.deathTime>1){actor.alive=true;actor.health=100;actor.collider.setEnabled(true);actor.position.copy(spawn);actor.body.setTranslation({x:spawn.x,y:spawn.y+.9,z:spawn.z},true);actor.body.setNextKinematicTranslation({x:spawn.x,y:spawn.y+.9,z:spawn.z});actor.velocity.set(0,0,0);}}}
    if(this.match.phase==='freeze'&&this.match.remaining<=0){this.match.phase='live';this.match.remaining=RULES.live;this.say(this.actors.find(a=>a.team===0&&a.alive&&a.id!==this.player.id)||this.player,'letsgo');}
    if(this.match.phase==='end'&&this.match.remaining<=0){const result=nextRound(this.match);if(result==='finished'){this.paused=true;this.overlay='pause';document.exitPointerLock();this.ui.finish(this.match);this.syncPresentation();this.media.setPaused(false);return;}this.prepareRound(result==='halftime');if(result==='halftime')this.ui.toast('半场换边 · 经济与装备已重置');}
    if(this.match.phase==='planted'){
      this.match.bomb.remaining=Math.max(0,this.match.bomb.remaining-dt);
      if(this.time-this.lastBeep>Math.max(.13,this.match.bomb.remaining/35)){if(this.match.bomb.position)this.audio.nativeEvent('c4.plantsound',new THREE.Vector3().copy(this.match.bomb.position));this.lastBeep=this.time;}
    }
    for(const actor of this.actors){const tuning=WEAPONS[actor.slot].native;if(tuning)advanceHandling(actor.handling,tuning,dt,this.time,actor.crouch);}
    this.updatePlayer(dt);
    for(const a of this.actors){
      if(!a.alive)continue;
      if(a.reloadUntil&&a.reloadCommitAt&&this.time>=a.reloadCommitAt){finishReload(this.weapon(a));a.reloadCommitAt=0;}
      if(a.reloadUntil&&this.time>=a.reloadUntil){finishReload(this.weapon(a));a.reloadUntil=a.reloadCommitAt=0;}
      if(a.id!==this.player.id){if(this.training)this.move(a,dt);else this.updateBot(a,dt);}
    }
    this.physics.world.step();
    for(const a of this.actors){if(!a.alive)continue;const p=a.body.translation();a.position.set(p.x,p.y-(a.crouch?.625:.9),p.z);if(a.position.y<-8){const spawn=MAP.spawns[this.match.sides[a.team]][a.id%5];a.body.setTranslation({x:spawn.x,y:spawn.y+.9,z:spawn.z},true);a.velocity.set(0,0,0);}}
    for(const a of this.actors)if(a.alive)this.updateFootsteps(a);
    this.lootPhysics?.update();this.interact(dt);this.updateGrenades(dt);
    const win=this.training?null:checkWin(this.match,this.actors);if(win){if(this.match.phase==='planted'&&this.match.bomb.remaining<=0){const p=new THREE.Vector3().copy(this.match.bomb.position!);this.effects.explode(p);this.grenadeExplosion.burst(p,2);this.hazards.blast(p);this.audio.nativeEvent('c4.explode',p);for(const a of this.actors)if(a.alive&&a.position.distanceTo(p)<25)this.damage(a,120*(1-a.position.distanceTo(p)/30),null,false,'C4');}this.finishRound(win.winner,win.reason);}
    this.updateBombVisual();
    // Preserve events across render-only frames (e.g. 120 Hz rendering, 60 Hz simulation).
    // Consume once after a simulation tick so quick clicks, look deltas and jumps are not lost.
    if(!this.training){this.syncPresentation();if(this.match.phase==='end'&&this.time>=this.mvpAt){this.media.music('mvp');this.mvpAt=Infinity;}}
    this.input.consume();
  }
  private updatePlayer(dt:number){
    const a=this.player;
    if(!a.alive){if(this.input.firePressed)this.spectateNext();else if(this.input.rightPressed)this.spectateNext(-1);return;}
    const tune=WEAPONS[a.slot].native,zoomRatio=tune&&this.scoped?Math.tan(tune.zoomFov[this.scopeLevel-1]*Math.PI/360)*.818933:1;
    const mouseScale=.022*Math.PI/180;
    a.yaw-=this.input.dx*mouseScale*this.settings.sensitivity*zoomRatio;a.pitch=THREE.MathUtils.clamp(a.pitch-this.input.dy*mouseScale*this.settings.sensitivity*zoomRatio,-1.48,1.48);
    this.sway.x=THREE.MathUtils.lerp(this.sway.x,this.input.dx*.00013,.2);this.sway.y=THREE.MathUtils.lerp(this.sway.y,this.input.dy*.0001,.2);
    this.input.dx=this.input.dy=0;
    if(this.input.wheel){const guns=a.inventory.sort((a,b)=>WEAPONS[a.id].slot-WEAPONS[b.id].slot);const i=guns.findIndex(w=>w.id===a.slot);this.setSlot(a,guns[(i+Math.sign(this.input.wheel)+guns.length)%guns.length].id);this.input.wheel=0;}
    if(this.input.rightPressed&&!this.selectedGrenade&&a.slot==='awp'&&!a.reloadUntil){if(tune)this.scopeLevel=(this.scopeLevel+1)%(tune.zoomLevels+1);else this.scoped=!this.scoped;this.audio.beep(700,.025,.025);this.input.rightPressed=false;}
    if(this.input.rightPressed&&!this.selectedGrenade&&tune?.burst&&!a.reloadUntil&&a.burstLeft===0&&this.time>=a.nextShot){a.burstMode=!a.burstMode;this.ui.toast(a.burstMode?'GLOCK-18 · 三连发':'GLOCK-18 · 半自动');this.input.rightPressed=false;}
    const crouch=this.input.down('ControlLeft','ControlRight');
    if(crouch!==a.crouch){const headBlocked=this.physics.ray(this.eye(a),up,.6);if(crouch||!headBlocked){const old=a.crouch;a.crouch=crouch;this.physics.resize(a.collider,crouch);const p=a.body.translation();a.body.setTranslation({x:p.x,y:p.y+(!a.grounded?(old?-.275:.275):(old?.275:-.275)),z:p.z},true);}}
    const movement=new THREE.Vector3(Number(this.input.down('KeyD'))-Number(this.input.down('KeyA')),0,Number(this.input.down('KeyS'))-Number(this.input.down('KeyW'))).normalize().applyAxisAngle(up,a.yaw);
    const speed=this.selectedGrenade?GRENADES[this.selectedGrenade].maxSpeed*(a.crouch?.34:this.input.down('ShiftLeft','ShiftRight')?.52:1):tune?(this.scoped&&tune.scoped?tune.scoped.maxSpeed:tune.maxSpeed)*(a.crouch?.34:this.input.down('ShiftLeft','ShiftRight')?.52:1):a.crouch?2.1:this.input.down('ShiftLeft','ShiftRight')?2.5:a.slot==='knife'?6.2:a.slot==='awp'?4.5:5.6;
    if(this.match.phase==='freeze'||this.match.phase==='end')movement.set(0,0,0);
    const horizontal=moveSourceStyle(a.velocity,movement,speed,dt,a.grounded);a.velocity.x=horizontal.x;a.velocity.z=horizontal.z;
    if(this.input.pressed.has('Space')&&a.grounded&&(this.match.phase==='live'||this.match.phase==='planted')){a.velocity.y=MOVEMENT.jump;a.jumped=true;this.input.pressed.delete('Space');}
    const wasGrounded=a.grounded,falling=a.velocity.y;this.move(a,dt);if(tune&&!wasGrounded&&a.grounded)a.handling.penalty+=tune.land*Math.max(0,-falling)/.0254;
    const allowed=this.match.phase==='live'||this.match.phase==='planted';
    if(allowed&&a.burstLeft>0&&this.time+1e-6>=a.burstNext){this.shoot(a,true);a.burstLeft=Math.max(0,a.burstLeft-1);a.burstNext+=tune?.burst?.interval??.05;}
    if(this.selectedGrenade&&allowed&&this.time>=this.grenadeCooldown){const view=this.grenadeViews.get(this.selectedGrenade),result=this.throwState.update(dt,this.input.firing||this.input.firePressed,this.input.rightFiring||this.input.rightPressed,view?.pinDuration??.967);if(result.action)view?.play(result.action);if(result.release!==undefined)this.throwGrenade(a,this.selectedGrenade,result.release);if(result.finished){this.selectedGrenade=null;this.trajectory.hide();this.selectView(a.slot);a.nextShot=Math.max(a.nextShot,this.time+.5);}}
    else if(!this.bombSelected&&!this.selectedGrenade&&allowed&&(WEAPONS[a.slot].automatic?this.input.firing:this.input.firePressed)){
      this.shoot(a);this.input.firePressed=false;
    }
  }
  private move(a:Pawn,dt:number){
    const wasGrounded=a.grounded,gravity=MOVEMENT.gravity;
    a.velocity.y-=gravity*dt*.5;const falling=-a.velocity.y;if(a.grounded&&a.velocity.y<0)a.velocity.y=-.5;
    a.grounded=this.physics.move(a.body,a.collider,{x:a.velocity.x*dt,y:a.velocity.y*dt,z:a.velocity.z*dt});
    this.physics.clipVelocity(a.velocity);const moved=this.physics.movement;a.footSpeed=Math.hypot(moved.x,moved.z)/dt;
    if(!wasGrounded&&a.grounded&&falling>2)a.landSpeed=falling;
    if(a.grounded&&a.velocity.y<0)a.velocity.y=0;else a.velocity.y-=gravity*dt*.5;
  }
  private updateFootsteps(a:Pawn){
    if(this.match.phase==='freeze'||this.match.phase==='end'){a.jumped=false;a.landSpeed=0;return;}
    const maxSpeed=WEAPONS[a.slot].native?.maxSpeed??6.35,kind=a.jumped?'jump':a.landSpeed>0?'land':'step',landing=a.landSpeed;
    a.jumped=false;a.landSpeed=0;
    if(kind==='step'&&(!audibleFootstep(a.footSpeed,maxSpeed,a.grounded)||this.time<a.stepAt))return;
    a.stepAt=this.time+footstepInterval(a.footSpeed);
    if(a.id!==this.player.id&&a.position.distanceToSquared(this.audio.position)>30*30)return;
    const surface=this.physics.groundSurface(a.position),occluded=a.id!==this.player.id&&!this.physics.canSee(this.audio.position,this.eye(a));
    this.audio.step(a.id===this.player.id?undefined:a.position,false,surface,this.match.sides[a.team],a.id,kind,occluded,kind==='land'?Math.min(1,landing/MOVEMENT.jump):1);
  }
  private updateBot(a:Pawn,dt:number){
    if(this.match.phase==='freeze'||this.match.phase==='end'){a.velocity.x=a.velocity.z=0;this.move(a,dt);return;}
    const difficulty=diff[this.settings.difficulty],eye=this.eye(a),side=this.match.sides[a.team];
    if(this.time>=a.senseAt){
      a.senseAt=this.time+.17;
      const enemies=this.actors.filter(e=>e.team!==a.team&&e.alive&&e.position.distanceTo(a.position)<66).sort((x,y)=>x.position.distanceTo(a.position)-y.position.distanceTo(a.position));
      const seen=this.time<a.flashUntil?undefined:enemies.find(e=>{const towards=this.eye(e).sub(eye),dist=towards.length();return (dist<9||towards.normalize().dot(direction(a.yaw))>-.2)&&this.physics.canSee(eye,this.eye(e))&&!this.hazards.smokeBlocked(eye,this.eye(e));});
      if(seen){if(a.target!==seen.id&&this.time>a.memoryUntil)this.say(a,'enemy');if(a.target!==seen.id)a.reactionUntil=this.time+difficulty.reaction+Math.random()*.15;a.target=seen.id;a.lastSeen=seen.position.clone();a.memoryUntil=this.time+5;this.targetSightings.set(seen.id,this.time);}
      else a.target=null;
    }
    const enemy=a.target!==null?this.actors[a.target]:null;
    let desired:Vec3|undefined;
    const bomb=this.match.bomb;
    if(this.match.phase==='planted'&&bomb.position){
      if(side==='CT'){desired=bomb.position;a.botAction='回防拆弹';}
      else {desired={x:bomb.position.x+(a.id%2?5:-5),y:bomb.position.y,z:bomb.position.z+(a.id%3-1)*5};a.botAction='守包';}
    }else if(bomb.carrier===null&&bomb.position&&side==='T'){desired=bomb.position;a.botAction='回收炸弹';}
    else if(a.lastSeen&&this.time<a.memoryUntil){desired=a.lastSeen;a.botAction='接敌';}
    else{
      desired=a.route[Math.min(a.routeIndex,a.route.length-1)];a.botAction=side==='T'?'推进':'防守';
      if(desired&&Math.hypot(desired.x-a.position.x,desired.z-a.position.z)<3&&a.routeIndex<a.route.length-1){a.routeIndex++;desired=a.route[a.routeIndex];a.repathAt=0;}
    }
    let dx=0,dz=0;
    if(desired){
      if(this.time>a.repathAt||a.path.length===0){a.path=this.navigation.path(a.position,desired);a.pathIndex=0;a.repathAt=this.time+1.5+Math.random()*.4;}
      let point=a.path[a.pathIndex];
      while(point&&Math.hypot(point.x-a.position.x,point.z-a.position.z)<(.25)&&a.pathIndex<a.path.length-1){point=a.path[++a.pathIndex];}
      if(point&&Math.hypot(desired.x-a.position.x,desired.z-a.position.z)>(this.match.phase==='planted'&&side==='CT'?1.4:1.1)){dx=point.x-a.position.x;dz=point.z-a.position.z;const d=Math.hypot(dx,dz);if(d>.01){dx=dx/d*difficulty.speed;dz=dz/d*difficulty.speed;}}
    }
    if(enemy&&enemy.alive){
      const aim=this.eye(enemy).sub(eye);const yaw=Math.atan2(-aim.x,-aim.z),pitch=Math.atan2(aim.y-.16,Math.hypot(aim.x,aim.z));a.yaw=this.turn(a.yaw,yaw,Math.min(1,dt*12));a.pitch=pitch;
      if(enemy.position.distanceTo(a.position)<40){dx*=.18;dz*=.18;}
      if(this.time>=a.reactionUntil&&this.time>=a.flashUntil){
        const distance=enemy.position.distanceTo(a.position),kind=GRENADE_IDS.find(id=>a.grenades[id]>0);if(kind&&this.time>=a.utilityAt&&distance>10&&distance<30&&Math.random()<dt*.35)this.throwGrenade(a,kind);
        else{const line=new THREE.Ray(eye,direction(a.yaw,a.pitch)),blockedByAlly=this.actors.some(friend=>friend.id!==a.id&&friend.team===a.team&&friend.alive&&friend.position.distanceTo(eye)<distance&&line.distanceSqToPoint(this.eye(friend).add(new THREE.Vector3(0,-.35,0)))<.38*.38);if(!blockedByAlly)this.shoot(a);}
      }
    }else if(Math.hypot(dx,dz)>.5){a.yaw=this.turn(a.yaw,Math.atan2(-dx,-dz),Math.min(1,dt*6));a.pitch=0;}
    const atBomb=!!bomb.position&&Math.hypot(a.position.x-bomb.position.x,a.position.z-bomb.position.z)<2.1;
    const atPlant=bomb.carrier===a.id&&!!siteAt(a.position.x,a.position.z,a.position.y);
    if((this.match.phase==='planted'&&side==='CT'&&atBomb&&!enemy)||atPlant){dx=dz=0;a.botAction=side==='CT'?'拆弹':'安装炸弹';}
    // Local steering keeps squadmates apart without using their bodies as moving walls.
    for(const friend of this.actors){if(friend.id===a.id||!friend.alive)continue;const d=a.position.distanceTo(friend.position);if(d>.01&&d<1.15){dx+=(a.position.x-friend.position.x)/d*1.7;dz+=(a.position.z-friend.position.z)/d*1.7;}}
    const ahead=a.position.clone().add(new THREE.Vector3(dx,0,dz).multiplyScalar(.3));if(this.hazards.burningAt(ahead)){const fire=this.hazards.burningAt(a.position);if(fire){const away=a.position.clone().sub(fire.cells[0].position);away.y=0;if(away.length()<.1)away.copy(direction(a.yaw));away.normalize().multiplyScalar(difficulty.speed);dx=away.x;dz=away.z;}else{dx=dz=0;a.repathAt=0;}}
    const desiredSpeed=Math.hypot(dx,dz),limit=Math.min(desiredSpeed,WEAPONS[a.slot].native?.maxSpeed??6.35),wish=desiredSpeed>0?{x:dx/desiredSpeed,z:dz/desiredSpeed}:{x:0,z:0},horizontal=moveSourceStyle(a.velocity,wish,limit,dt,a.grounded);a.velocity.x=horizontal.x;a.velocity.z=horizontal.z;this.move(a,dt);
    if(Math.hypot(dx,dz)>1&&a.position.distanceTo(a.lastPosition)<.007)a.stuckTime+=dt;else a.stuckTime=0;
    if(a.stuckTime>.8){a.repathAt=0;a.path=[];if(a.grounded)a.velocity.y=MOVEMENT.jump;a.stuckTime=0;}
    a.lastPosition.copy(a.position);
    const w=this.weapon(a);if(w.ammo===0||(w.ammo<WEAPONS[w.id].magazine*.3&&!enemy))this.reload(a);
  }
  private turn(a:number,b:number,t:number){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}
  private poseCharacter(a:Pawn,dt:number){
    const objective=this.interactionActor===a.id?(this.match.phase==='planted'?'defuse':'plant'):null;
    a.model.animation?.update(dt,{time:this.time,weapon:a.slot,velocity:a.velocity,yaw:a.yaw,crouch:a.crouch,grounded:a.grounded,alive:a.alive,lastFire:a.lastFire,lastDamage:a.lastDamage,deathTime:a.deathTime,reloadUntil:a.reloadUntil,kit:a.kit,objective,utility:a.utility?{action:a.utility.phase==='pin'?'grenade_pullpin':a.utility.strength<.4?'grenade_throwLow':'grenade_throwHigh',at:a.utility.at}:null});
    a.model.weapon.root.visible=a.alive&&!objective&&!a.utility;
  }
  private shoot(a:Pawn,burstFollowup=false){
    const w=this.weapon(a),def=WEAPONS[w.id];if((!burstFollowup&&this.time+1e-6<a.nextShot)||a.reloadUntil||!a.alive)return;
    if(w.ammo<=0&&w.id!=='knife'){this.reload(a);return;}
    if(w.id!=='knife')w.ammo--;a.lastFire=this.time;a.nextShot=nextAttackTime(a.nextShot,this.time,def.interval);
    if(a.id===this.player.id&&a.burstMode&&def.native?.burst){if(!burstFollowup){a.burstLeft=Math.min(2,w.ammo);a.burstNext=this.time+def.native.burst.interval;a.burstEnd=this.time+def.native.burst.cycle;}a.nextShot=a.burstEnd;}
    if(a.id===this.player.id)this.currentView?.animation?.play(w.ammo?'fire':'fireEmpty');
    const moving=Math.hypot(a.velocity.x,a.velocity.z),bot=a.id!==this.player.id,tune=def.native;
    const yaw=a.yaw+(tune&&!bot?a.handling.yaw*2:0),pitch=a.pitch+(tune&&!bot?a.handling.pitch*2:0),origin=this.eye(a),dir=direction(yaw,pitch);
    if(tune&&!bot&&w.id!=='knife'){
      const alternate=this.scoped||!!(tune.burst&&a.burstMode),spread=alternate&&tune.scoped?tune.scoped.spread:tune.spread,offset=spreadOffset(weaponInaccuracy(tune,a.handling,moving,a.crouch,a.grounded,alternate),spread),right=new THREE.Vector3(Math.cos(yaw),0,-Math.sin(yaw)),vertical=right.clone().cross(dir).normalize();
      dir.addScaledVector(right,offset.x).addScaledVector(vertical,offset.y).normalize();
    }else{
      let spread=bot?diff[this.settings.difficulty].spread:(this.scoped&&w.id==='awp'?.0007:def.spread)+(moving>1?.012:0)+(a.grounded?0:.04)+Math.min(a.shotCount,12)*.001;
      if(a.crouch)spread*=.7;dir.x+=(Math.random()-.5)*spread*2;dir.y+=(Math.random()-.5)*spread*2;dir.z+=(Math.random()-.5)*spread*2;dir.normalize();
    }
    const range=w.id==='knife'?2:tune?.range??140;
    let blocking=this.physics.ray(origin,dir,range),power=1;
    if(blocking&&this.physics.materials.get(blocking.collider.handle)==='wood'&&def.slot===1){
      const entry=origin.clone().addScaledVector(dir,blocking.timeOfImpact);this.effects.impact(entry,new THREE.Vector3().copy(blocking.normal));power=.55;
      blocking=this.physics.ray(origin,dir,range,blocking.collider.handle);
    }
    let nearest=blocking?.timeOfImpact??range,hit:Pawn|null=null,group:HitGroup='chest';
    const point=origin.clone().addScaledVector(dir,nearest),ray=new THREE.Ray(origin,dir);
    for(const enemy of this.actors){
      if(!enemy.alive||enemy.id===a.id||!this.hitboxes.candidate(ray,enemy.position))continue;
      enemy.model.root.position.copy(enemy.position);enemy.model.root.rotation.y=enemy.yaw;
      // Invisible actors (including the local player) still need a current hit pose.
      if(enemy.model.animation&&!enemy.model.root.visible)this.poseCharacter(enemy,1/60);
      const contact=this.hitboxes.raycast(ray,enemy.model.root,this.match.sides[enemy.team],enemy.position,nearest);
      if(contact){nearest=contact.distance;hit=enemy;group=contact.group;ray.at(nearest,point);}
    }
    const head=group==='head';
    if(hit){
      const armored=armorProtects(group,hit.armor,hit.helmet),amount=resolveDamage(def.damage*teamDamageScale(a,hit,w.id==='knife'?'other':'bullet')*power*(w.id==='knife'?1:tune?Math.pow(tune.rangeModifier,nearest/12.7):Math.pow(.985,nearest/8)),group,hit.armor,hit.helmet,def.armorPenetration,def.headshotMultiplier);
      hit.armor=Math.max(0,hit.armor-amount.armorUsed);
      this.damage(hit,amount.damage,a,head,def.name,{group,armored,position:point,knife:w.id==='knife'});
      this.effects.impact(point,dir.clone().negate(),true);if(a.id===this.player.id)this.ui.hit(head);
    }
    else if(blocking){this.effects.impact(point,new THREE.Vector3().copy(blocking.normal));if(w.id==='knife')this.audio.hits.event('Weapon_Knife.HitWall',point,a.id);}
    if(w.id!=='knife'){
      this.hazards.bullet(origin,point);
      this.audio.shot(w.id,bot?a.position:undefined);
      if(bot||Math.random()>.6)this.effects.tracer(origin.clone().addScaledVector(dir,.6),point);
      for(const listener of this.actors){if(listener.id===this.player.id||listener.team===a.team||!listener.alive||listener.position.distanceTo(a.position)>40)continue;listener.lastSeen=a.position.clone();listener.memoryUntil=this.time+4;}
    }
    a.shotCount++;
    if(!bot){if(tune)applyShotRecoil(a.handling,tune,this.time);this.muzzleUntil=this.time+.045;this.flashLight.intensity=w.id==='usp'||w.id==='m4a1'?1:5;
      const right=new THREE.Vector3(Math.cos(a.yaw),0,-Math.sin(a.yaw));this.effects.shell(origin.clone().addScaledVector(right,.22).add(new THREE.Vector3(0,-.2,0)),right);
      if(w.id==='awp')this.scoped=false;
    }
  }
  private damage(a:Pawn,amount:number,attacker:Pawn|null,head:boolean,label:string,hit?:{group:HitGroup;armored:boolean;position:THREE.Vector3;knife:boolean}){
    if(!a.alive||amount<=0)return;
    const listener=this.player.alive?this.player:this.actors[this.spectator];
    a.lastDamage=this.time;a.health=Math.max(0,a.health-amount);if(a.id===this.player.id)this.ui.hurt();
    if(hit){
      const perspective=a.id===listener?.id?'Victim':attacker?.id===listener?.id?'AttackerFeedback':'Onlooker';
      if(hit.knife){this.audio.hits.event('Weapon_Knife.Hit.Light.Flesh',perspective==='Victim'?undefined:hit.position,a.id);}
      else this.audio.hit({group:hit.group,armored:hit.armored,lethal:a.health<=0,perspective},hit.position,a.id,perspective==='Onlooker'&&!this.physics.canSee(this.audio.position,hit.position));
    }else if(a.id===this.player.id)this.audio.hurt(label==='MOLOTOV'||label==='INCENDIARY');
    if(attacker&&attacker.team!==a.team){a.lastSeen=attacker.position.clone();a.memoryUntil=this.time+5;}
    if(a.health>0){if(a.health<40)this.say(a,'takingfire');return;}
    if(!this.training){this.drop(a,true);this.dropKit(a);if(this.match.bomb.carrier===a.id)this.dropBomb(a,true);const grenade=a.id===this.player.id&&this.selectedGrenade&&a.grenades[this.selectedGrenade]?this.selectedGrenade:GRENADE_IDS.find(id=>a.grenades[id]>0);if(grenade)this.dropGrenade(a,grenade,true);}a.alive=false;a.deaths++;a.deathTime=this.time;a.velocity.set(0,0,0);a.collider.setEnabled(false);
    if(attacker&&attacker.team!==a.team){attacker.kills++;this.say(attacker,'enemydown');if(this.actors.filter(other=>other.alive&&other.team!==attacker.team).length===1)this.say(attacker,'oneleft');attacker.money=Math.min(RULES.maxMoney,attacker.money+(attacker.slot==='awp'?100:attacker.slot==='knife'?1500:300));}
    if(attacker&&attacker.id!==a.id&&attacker.team===a.team){attacker.kills--;attacker.money=Math.max(0,attacker.money-300);if(attacker.id===this.player.id)this.ui.toast('击杀队友 · −$300');}
    this.ui.kill(attacker?.name??'环境',a.name,label,attacker?.team===0,head);
    if(a.id!==this.player.id&&a.id===this.spectator&&!this.player.alive)this.spectateNext();
    if(a.id===this.player.id){if(!this.training&&this.match.phase!=='planted')this.media.music('death');this.scoped=false;this.spectateNext();this.selectedGrenade=null;this.bombSelected=false;this.ui.toast('已阵亡 · 鼠标切换队友 · E 接管存活机器人');}
  }
  private interact(dt:number){
    this.pickupAutomatic();
    const bomb=this.match.bomb;let actor:Pawn|null=null,label='',required=0;
    if(this.match.phase!=='live'&&this.match.phase!=='planted'){this.resetInteraction();return;}
    for(const a of this.actors){
      if(!a.alive)continue;const pressed=a.id===this.player.id?(this.input.down('KeyE')||this.bombSelected&&this.input.firing):a.target===null;
      if(!pressed)continue;
      const side=this.match.sides[a.team];
      if(bomb.carrier===a.id&&this.match.phase==='live'&&siteAt(a.position.x,a.position.z,a.position.y)&&Math.hypot(a.velocity.x,a.velocity.z)<.6){actor=a;label='正在安装炸弹';required=RULES.plant;break;}
      if(this.match.phase==='planted'&&side==='CT'&&bomb.position&&Math.hypot(a.velocity.x,a.velocity.z)<.6&&a.position.distanceTo(new THREE.Vector3().copy(bomb.position))<2.25&&this.physics.canSee(this.eye(a),new THREE.Vector3().copy(bomb.position).add(new THREE.Vector3(0,.25,0)))){actor=a;label=a.kit?'正在拆除 · 拆弹工具':'正在拆除炸弹';required=a.kit?RULES.kitDefuse:RULES.defuse;break;}
      if(a.id===this.player.id&&this.input.pressed.has('KeyE')){const drop=this.drops.filter(d=>pickupReach(a.position,d.position,true)&&this.physics.canSee(this.eye(a),d.position)).sort((x,y)=>x.position.distanceToSquared(a.position)-y.position.distanceToSquared(a.position))[0];if(drop){this.takeGun(a,drop,true);this.input.pressed.delete('KeyE');}}
    }
    if(!actor){this.resetInteraction();return;}
    if(this.interactionActor!==actor.id){this.interactionActor=actor.id;this.interactionTime=0;this.say(actor,this.match.phase==='planted'?'defusing':'planting');if(actor.id===this.player.id&&this.match.phase==='live'){this.cancelThrow();this.selectedGrenade=null;this.scoped=false;actor.reloadUntil=actor.reloadCommitAt=0;this.bombSelected=true;this.c4?.animation.play('plant',required);}}
    this.interactionTime+=dt;this.interactionLabel=label;bomb.interaction=Math.min(1,this.interactionTime/required);bomb.interactingActor=actor.id;if(actor.id===this.player.id&&this.match.phase==='live')this.c4?.setDisplay('7355608'.slice(0,Math.ceil(bomb.interaction*7)).padEnd(7,'*'));
    if(this.interactionTime>=required){
      if(this.match.phase==='live'){
        this.planter=actor.id;this.bombYaw=actor.yaw;bomb.position=actor.position.clone();bomb.site=siteAt(actor.position.x,actor.position.z,actor.position.y)!.name;bomb.carrier=null;bomb.remaining=RULES.bomb;this.match.phase='planted';actor.money=Math.min(RULES.maxMoney,actor.money+300);this.bombSelected=false;if(actor.id===this.player.id)this.setSlot(actor,actor.slot);
        for(const a of this.actors){a.repathAt=0;a.lastSeen=null;}
        this.ui.toast(`炸弹已安装在 ${bomb.site} 点`);this.audio.nativeEvent('c4.plant');
      }else{this.objectiveMvp=actor.id;this.finishRound(teamForSide(this.match,'CT'),'炸弹已成功拆除');actor.money=Math.min(RULES.maxMoney,actor.money+300);this.audio.nativeEvent('c4.disarmfinish');}
      this.resetInteraction();
    }
  }
  private syncPresentation(){for(const cue of this.presentation.update(this.match)){if(cue.type==='announce')this.media.announce(cue.key);else this.media.music(cue.key as MusicCue);}}
  private say(actor:Pawn,command:RadioCommand,manual=false){if(!actor||actor.team!==this.player.team||!actor.alive||this.training&&!manual)return false;return this.media.radio(this.match.sides[actor.team],command,actor.name,zoneAt(actor.position.x,actor.position.z)?.name??'Dust II',manual);}
  private finishRound(winner:Team,reason:string){
    if(this.match.phase==='end'||this.match.phase==='finished')return;
    endRound(this.match,winner,reason,this.actors);
    const objective=this.objectiveMvp??(reason.includes('爆炸')||reason.includes('引爆')?this.planter:null),candidates=this.actors.filter(a=>a.team===winner).sort((a,b)=>(b.kills-(this.roundKills.get(b.id)??0))-(a.kills-(this.roundKills.get(a.id)??0))||b.health-a.health);
    const best=objective!==null?this.actors[objective]:candidates[0];if(best){const kills=best.kills-(this.roundKills.get(best.id)??0);this.match.mvp={id:best.id,name:best.name,reason:objective!==null?this.objectiveMvp!==null?'成功拆除炸弹':'成功引爆炸弹':kills?`本回合 ${kills} 次击杀`:'协助队伍获胜'};this.mvpAt=this.time+1.8;}
  }
  private radioCommands(page:string):[RadioCommand,string][]{return page==='KeyZ'?[['cover','掩护我'],['follow','跟我来'],['hold','守住位置'],['regroup','重新集结'],['letsgo','行动'],['backup','需要支援']]:page==='KeyX'?[['enemy','发现敌人'],['takingfire','遭到攻击'],['backup','需要支援'],['enemydown','敌人已被击毙'],['hold','守住这里'],['regroup','重新集结']]:[['roger','收到'],['negative','不行'],['cover','掩护我'],['follow','跟我来'],['letsgo','行动'],['backup','需要支援']];}
  private handleRadioKey(code:string){
    if(['KeyZ','KeyX','KeyC'].includes(code)){this.radioPage=this.radioPage===code?null:code;this.ui.radioMenu(this.radioPage?this.radioCommands(this.radioPage).map(([,label])=>label):null);return true;}
    if(!this.radioPage)return false;
    if(code==='Escape'||code==='Digit0'){this.radioPage=null;this.ui.radioMenu(null);return true;}
    const n=Number(code.replace('Digit',''))-1,command=this.radioCommands(this.radioPage)[n]?.[0];if(!command)return false;
    const sent=this.say(this.player,command,true);this.radioPage=null;this.ui.radioMenu(null);if(!sent)this.ui.toast('无线电正在使用中，请稍候');
    if(sent&&['follow','regroup','hold','backup'].includes(command))for(const ally of this.actors.filter(a=>a.team===this.player.team&&a.id!==this.player.id&&a.alive)){ally.lastSeen=this.player.position.clone();ally.memoryUntil=this.time+8;ally.repathAt=0;}
    return true;
  }
  private resetInteraction(){if(this.interactionActor===this.player.id&&this.match.bomb.carrier===this.player.id){this.c4?.animation.play('idle');this.c4?.setDisplay('');}this.interactionActor=null;this.interactionTime=0;this.match.bomb.interaction=0;this.match.bomb.interactingActor=null;}
  private dropGrenade(actor:Pawn,kind:GrenadeId,death=false){
    if(!actor.grenades[kind]||!this.grenadeLibrary)return;actor.grenades[kind]--;const mesh=this.grenadeLibrary.world(kind),pose=this.dropPose(actor,death);mesh.userData.halfExtents??={x:.06,y:.08,z:.06};const loot=this.lootPhysics.add(mesh,pose.position,pose.rotation,pose.velocity);this.scene.add(mesh);this.grenadeDrops.push({kind,position:loot.position,mesh,team:actor.team,loot,owner:actor.id,pickupAfter:this.time+.8});if(this.grenadeDrops.length>24){const old=this.grenadeDrops.shift()!;this.lootPhysics.remove(old.loot);this.grenadeLibrary.release(old.mesh);}
    if(actor.id===this.player.id&&!death){this.cancelThrow();this.selectedGrenade=null;this.selectView(actor.slot);this.ui.toast(`已丢下 ${GRENADES[kind].name}`);}
  }
  private selectGrenade(kind:GrenadeId){
    if(this.throwState.phase==='throwing'||!this.player.grenades[kind])return;this.cancelThrow();this.selectedGrenade=kind;this.scoped=false;this.bombSelected=false;this.player.reloadUntil=this.player.reloadCommitAt=0;this.grenadeCooldown=this.time+1;this.grenadeViews.get(kind)?.play('draw');this.ui.toast(`${GRENADES[kind].name} · 按住左键 / 右键 / 双键，松手投出`);this.wakeRendering();
  }
  private cancelThrow(){this.throwState.reset();if(this.selectedGrenade)this.grenadeViews.get(this.selectedGrenade)?.play('idle');this.trajectory?.hide();}
  private clearUtility(){for(const actor of this.actors??[]){actor.utility=null;actor.flashUntil=actor.flashHoldUntil=0;actor.flashAlpha=0;}this.audio.flashDeafening(0);this.fireDamageAt=0;for(const drop of this.grenadeDrops??[]){this.lootPhysics?.remove(drop.loot);this.grenadeLibrary?.release(drop.mesh);}this.grenadeDrops=[];for(const prop of this.grenadeProps?.values()??[])this.grenadeLibrary?.release(prop);this.grenadeProps?.clear();for(const mesh of this.spentGrenades?.values()??[])this.effects?.releaseModel(mesh);this.spentGrenades?.clear();this.cancelThrow();this.hazards?.clear();this.smokeVolumes?.clear();this.grenadeExplosion?.clear();this.flashAfterimage?.clear();this.flashCapturePending=false;this.stopHazardAudio(true);this.grenadeCooldown=0;}
  private stopHazardAudio(dispose=false){for(const handle of this.hazardAudio?.values()??[]){if(dispose)handle.stop();else handle.pause();}if(dispose)this.hazardAudio?.clear();}
  private throwGrenade(a:Pawn,kind:GrenadeId,strength=1){
    if(!a.alive||!a.grenades[kind]||a.utility||this.effects.grenades.length>=MAX_PROJECTILES)return;this.say(a,kind);a.grenades[kind]--;a.utilityAt=this.time+4;a.reloadUntil=a.reloadCommitAt=0;
    if(a.id!==this.player.id){a.utility={kind,strength,at:this.time,phase:'pin',released:false};a.nextShot=Math.max(a.nextShot,this.time+1.9);if(this.grenadeLibrary){const prop=this.grenadeLibrary.held(kind);a.model.animation?.attachProp?.(prop);this.grenadeProps.set(a.id,prop);}return;}
    this.launchGrenade(a,kind,strength);
  }
  private launchGrenade(a:Pawn,kind:GrenadeId,strength:number){
    if(!a.grounded&&a.velocity.y>0)this.audio.nativeEvent('BaseGrenade.JumpThrow',a.id===this.player.id?undefined:a.position);
    const projectile=createProjectile(++this.grenadeId,{eye:this.eye(a),yaw:a.yaw,pitch:a.pitch,velocity:a.velocity,strength,kind,owner:a.id},this.grenadeCollision);this.effects.grenade(projectile);
  }
  private updateGrenades(dt:number){
    for(const a of this.actors){const utility=a.utility;if(!utility)continue;
      if(!a.alive){a.utility=null;}else if(utility.phase==='pin'&&this.time-utility.at>=.967){utility.phase='throw';utility.at=this.time;}
      else if(utility.phase==='throw'){if(!utility.released&&this.time-utility.at>=.12){this.launchGrenade(a,utility.kind,utility.strength);utility.released=true;}if(this.time-utility.at>=.767)a.utility=null;}
      if(!a.utility||utility.released){const prop=this.grenadeProps.get(a.id);if(prop){this.grenadeLibrary?.release(prop);this.grenadeProps.delete(a.id);}}
    }
    for(let i=this.effects.grenades.length-1;i>=0;i--){const g=this.effects.grenades[i];
      if(g.kind==='smoke'&&this.hazards.burningAt(g.position)){g.alive=false;g.detonated=true;this.detonate(g,false);}
      else stepProjectile(g,dt,this.grenadeCollision,event=>{if(event.type==='bounce'){const name={he:'HEGrenade.Bounce',flash:'Flashbang.Bounce',smoke:'SmokeGrenade.Bounce',decoy:'Flashbang.Bounce',molotov:'Molotov.Bounce',incendiary:'IncGrenade.Bounce'}[g.kind];this.audio.nativeEvent(name,g.position);if(event.actor!==undefined&&event.speed>3){const target=this.actors.find(a=>a.id===event.actor);if(target&&target.id!==g.owner)this.damage(target,1,this.actors[g.owner],false,GRENADES[g.kind].name);}}else this.detonate(g,event.airburst);});
      if(!g.alive){this.effects.removeGrenade(g);this.effects.grenades.splice(i,1);}
    }
    this.hazards.update(dt,(decoy,explode)=>{if(explode){this.grenadeExplosion.burst(decoy.position,.2);this.audio.nativeEvent('BaseGrenade.Explode',decoy.position,.18);for(const actor of this.actors)if(actor.alive&&actor.position.distanceTo(decoy.position)<1.5&&this.grenadeCollision.visible(decoy.position,this.eye(actor)))this.damage(actor,5,this.actors[decoy.owner],false,'诱饵弹');}else{this.audio.shot(decoy.weapon,decoy.position);this.effects.decoyPulse(decoy.position);for(const smoke of this.hazards.smokes)smoke.disturb(decoy.position);for(const actor of this.actors)if(actor.id!==this.player.id&&actor.alive&&actor.team!==this.actors[decoy.owner]?.team&&actor.target===null&&actor.position.distanceTo(decoy.position)<32){actor.lastSeen=decoy.position.clone();actor.memoryUntil=this.time+2;actor.repathAt=0;}}});
    if(this.time>=this.fireDamageAt){this.fireDamageAt=this.time+.2;for(const a of this.actors){if(!a.alive)continue;const fire=this.hazards.burningAt(a.position);if(fire){const owner=this.actors[fire.owner],factor=teamDamageScale(owner,a,'other');this.damage(a,this.hazards.fireDamage(fire,.2)*factor,owner??null,false,fire.kind==='molotov'?'MOLOTOV':'INCENDIARY');}}}
    const canisters=new Set([...this.hazards.smokes.map(s=>s.id),...this.hazards.decoys.map(d=>d.id)]);for(const [id,mesh]of this.spentGrenades)if(!canisters.has(id)){this.effects.releaseModel(mesh);this.spentGrenades.delete(id);}
    const active=new Set<number>();for(const smoke of this.hazards.smokes){active.add(smoke.id);if(!this.hazardAudio.has(smoke.id)&&this.hazardAudio.size<6){const handle=this.audio.nativeLoop('SmokeGrenade.Emit',smoke.origin,false);if(handle)this.hazardAudio.set(smoke.id,handle);}}for(const patch of this.hazards.fires){active.add(patch.id);if(!this.hazardAudio.has(patch.id)&&this.hazardAudio.size<4){const handle=this.audio.nativeLoop('Molotov.Loop',patch.cells[0].position);if(handle)this.hazardAudio.set(patch.id,handle);}}
    for(const [id,handle]of this.hazardAudio){if(!active.has(id)){handle.stop();this.hazardAudio.delete(id);}else{handle.resume();handle.update();}}
  }
  private detonate(g:Grenade,airburst=false){
    const owner=this.actors[g.owner];
    if(g.kind==='smoke'){const smoke=this.hazards.addSmoke(g.position,owner?this.match.sides[owner.team]:'CT');g.persistent=true;g.mesh.position.copy(g.position);this.spentGrenades.set(smoke.id,g.mesh);return;}
    if(g.kind==='molotov'||g.kind==='incendiary'){this.audio.nativeEvent(airburst?(g.kind==='molotov'?'Molotov.StartFailed':'IncGrenade.StartFailed'):(g.kind==='molotov'?'Molotov.Start':'IncGrenade.Start'),g.position);if(!airburst){this.grenadeExplosion.burst(g.position,.4);this.audio.nativeEvent(g.kind==='molotov'?'Molotov.Smash':'IncGrenade.Pop',g.position);this.hazards.addFire(g.position,g.kind,g.owner);}return;}
    if(g.kind==='decoy'){const decoy=this.hazards.addDecoy(g.position,g.owner,owner?.inventory.find(w=>WEAPONS[w.id].slot===1)?.id??owner?.slot??'glock');g.persistent=true;g.mesh.position.copy(g.position);this.spentGrenades.set(decoy.id,g.mesh);return;}
    if(g.kind==='he'){
      this.effects.explode(g.position);this.grenadeExplosion.burst(g.position);this.audio.nativeEvent('BaseGrenade.Explode',g.position);this.hazards.blast(g.position);
      for(const a of this.actors){if(!a.alive)continue;const distance=a.position.clone().add(new THREE.Vector3(0,.9,0)).distanceTo(g.position);let exposure=0;for(const height of [.35,.9,a.crouch?1.05:1.6])if(this.grenadeCollision.visible(g.position,a.position.clone().add(new THREE.Vector3(0,height,0))))exposure+=1/3;const damage=heBlastDamage(distance,a.armor,exposure);a.armor=Math.max(0,a.armor-damage.armor);const factor=teamDamageScale(owner,a,'grenade');if(damage.health>0)this.damage(a,damage.health*factor,owner??null,false,'HE GRENADE');}
    }else{
      this.audio.nativeEvent('Flashbang.Explode',g.position);
      for(const a of this.actors){if(!a.alive)continue;const eye=this.eye(a),to=g.position.clone().sub(eye),distance=to.length(),exposure=flashExposure(distance,direction(a.yaw,a.pitch).dot(to.normalize()),this.grenadeCollision.visible(eye,g.position));if(!exposure.alpha)continue;
        if(this.time+exposure.hold+exposure.fade>a.flashUntil){a.flashHoldUntil=this.time+exposure.hold;a.flashFade=exposure.fade;a.flashUntil=a.flashHoldUntil+exposure.fade;a.flashAlpha=exposure.alpha;}
        if(a.id===this.player.id){this.flashCapturePending=true;this.audio.nativeEvent(exposure.ring>3?'Flashbang.Ring.Long':exposure.ring>1.8?'Flashbang.Ring.Medium':'Flashbang.Ring.Short');}
      }
    }
  }
  private spectateNext(step=1){const alive=this.actors.filter(a=>a.team===this.player.team&&a.alive&&a.id!==this.player.id);const i=alive.findIndex(a=>a.id===this.spectator);if(alive.length)this.spectator=alive[(i+step+alive.length)%alive.length].id;}
  private takeOver(id:number){
    const target=this.actors.find(a=>a.id===id);if(this.training||!canTakeOver(this.match,this.player,target))return false;
    this.cancelThrow();if(this.interactionActor===this.player.id||this.interactionActor===target!.id)this.resetInteraction();this.controlledId=target!.id;this.spectator=target!.id;this.input.reset();this.radioPage=null;this.ui.radioMenu(null);this.scoped=false;this.selectedGrenade=null;this.bombSelected=false;
    target!.utility=null;const prop=this.grenadeProps.get(id);if(prop){this.grenadeLibrary?.release(prop);this.grenadeProps.delete(id);}
    // Do not setSlot: it would cancel the bot's in-progress reload and overwrite its attack timing.
    this.selectView(target!.slot);if(target!.reloadUntil>this.time)this.currentView?.animation?.play('reload',target!.reloadUntil-this.time);
    this.audio.hits.clear();this.audio.footsteps.clear();this.media.music(this.match.phase==='planted'?(this.match.bomb.remaining<=10?'bomb10':'planted'):(this.match.remaining<=10?'round10':'action'));this.ui.toast(`已接管 ${target!.name} · ${Math.ceil(target!.health)} HP`);this.updateHUD();this.wakeRendering();return true;
  }
  private updateCamera(dt:number){
    if(this.inspecting){this.inspectingChanged=this.orbit?.update()??false;return;}
    if(!this.active){const t=this.menuTime*.035,view=this.source2.cameras[0];this.camera.position.copy(view.position).add(new THREE.Vector3(Math.sin(t),Math.sin(t*.6)*.2,Math.cos(t)*.6));this.camera.lookAt(new THREE.Vector3().copy(view.target));this.camera.fov=69;this.camera.updateProjectionMatrix();return;}
    const p=this.player.alive?this.player:(this.actors[this.spectator]?.alive?this.actors[this.spectator]:this.player);
    const eye=this.eye(p);if(!this.player.alive&&!p.alive)eye.y+=2;
    this.camera.position.copy(eye);this.camera.rotation.order='YXZ';this.camera.rotation.set(p.pitch+(p.handling.pitch*.9+p.handling.viewKick),p.yaw+p.handling.yaw*.9,0,'YXZ');
    if(!this.player.alive){const back=direction(p.yaw).negate().add(new THREE.Vector3(0,.22,0)).normalize();const obstruction=this.physics.ray(eye,back,2.7);this.camera.position.addScaledVector(back,obstruction?Math.max(.2,obstruction.timeOfImpact-.15):2.7);this.camera.lookAt(eye.clone().addScaledVector(direction(p.yaw,p.pitch),7));}
    const zoom=WEAPONS[this.player.slot].native?.zoomFov[this.scopeLevel-1];
    this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,this.scoped?(zoom?sourceVerticalFov(zoom):25):73.7398,Math.min(1,dt*18));this.camera.updateProjectionMatrix();
    this.audio.position.copy(eye);this.audio.yaw=p.yaw;
    const a=this.player,model=this.currentView,moving=Math.min(1,Math.hypot(a.velocity.x,a.velocity.z)/5),bob=Math.sin(this.time*10)*moving;
    this.heldBomb.visible=this.bombSelected&&a.alive;if(this.bombSelected&&this.c4){this.c4.animation.update(this.paused?0:dt);this.heldBomb.position.set(.0635,-.0381,-.0508);}
    for(const [kind,view]of this.grenadeViews){view.root.visible=this.selectedGrenade===kind&&a.alive;if(view.root.visible){view.update(this.paused?0:dt);view.root.position.set(.0635+bob*.002,-.0381+Math.abs(bob)*.002,-.0508);view.root.rotation.set(this.sway.y,-.01,0);}}
    if(this.training&&this.selectedGrenade&&this.throwState.phase!=='throwing'){const info=this.trajectory.update(this.time,{eye:this.eye(a),yaw:a.yaw,pitch:a.pitch,velocity:a.velocity,strength:this.throwState.strength,kind:this.selectedGrenade,owner:a.id},this.grenadeCollision);if(info)this.trajectoryInfo=`落点 ${info.distance.toFixed(1)}m · ${info.bounces} 次弹跳 · ${info.seconds.toFixed(2)}s`;}else this.trajectory.hide();
    if(model){
      model.root.visible=!this.bombSelected&&!this.selectedGrenade;
        model.animation?.setEmpty(this.weapon(a).ammo===0);model.animation?.update(this.paused?0:dt);
        model.root.position.set(.0635+bob*.002-this.sway.x,-.0381+Math.abs(bob)*.002,-.0508);
        model.root.rotation.set(this.sway.y,-.01,0);model.muzzle.visible=this.time<this.muzzleUntil&&!a.reloadUntil;

    }
    this.flashLight.intensity=this.time<this.muzzleUntil?4:0;
    const flash=this.time<a.flashHoldUntil?1:THREE.MathUtils.clamp((a.flashUntil-this.time)/Math.max(.1,a.flashFade),0,1);this.ui.flash(Math.pow(flash,1.35)*a.flashAlpha);this.audio.flashDeafening(flash*.93);
  }
  private updateHUD(){
    const controlled=this.player,a=controlled.alive?controlled:(this.actors[this.spectator]?.alive?this.actors[this.spectator]:controlled),w=this.weapon(a),bomb=this.match.bomb;
    let prompt='';
    if(controlled.alive){
      if(this.match.phase==='freeze')prompt='准备阶段 · 按 B 打开装备商店';
      else if(bomb.carrier===this.player.id&&siteAt(a.position.x,a.position.z,a.position.y))prompt='长按左键或 E 安装 C4';
      else if(this.match.phase==='planted'&&this.match.sides[0]==='CT'&&bomb.position&&a.position.distanceTo(new THREE.Vector3().copy(bomb.position))<2.25)prompt='按住 E 拆除炸弹';
      else if(this.grenadeDrops.some(d=>d.position.distanceTo(a.position)<2))prompt='按 E 拾取投掷物';else if(this.drops.some(d=>d.position.distanceTo(a.position)<2))prompt='靠近自动拾取空槽装备 · E 替换武器';
      else if(bomb.carrier===null&&bomb.position&&this.match.phase==='live'&&this.match.sides[0]==='T'&&a.position.distanceTo(new THREE.Vector3().copy(bomb.position))<2)prompt='按 E 拾取 C4';
      else if(this.bombSelected)prompt='携带 C4 · 前往 A / B 包点';
      else if(this.selectedGrenade)prompt='左键长抛 · 右键短抛 · 双键中抛 · 松手投出';
    }
    if(this.training)prompt=this.selectedGrenade?`${this.throwState.phase==='pin'?'正在拔销':this.throwState.phase==='holding'?'已拔销 · 松手投出':'投掷物训练'} · ${this.trajectoryInfo}`:this.utilityTraining?'投掷物训练 · 4 切换 · B 选择装备':'枪械训练 · B 选择武器 · [ / ] 切换 · R 换弹 · F 检视';
    this.ui.update({bombSelected:this.bombSelected,roundKills:Math.max(0,a.kills-(this.roundKills.get(a.id)??a.kills)),controlledName:controlled.alive&&controlled.id!==0?controlled.name:undefined,spectatorId:this.spectator,training:this.training,utilityTraining:this.utilityTraining,match:this.match,player:a,actors:this.actors,radar:this.actors.map(p=>({id:p.id,position:p.position,team:p.team,alive:p.alive,visible:p.team===0||(this.targetSightings.get(p.id)??-999)>this.time-1,human:p.id===a.id,yaw:p.yaw})),weapon:w.id,ammo:w.ammo,reserve:w.reserve,location:zoneAt(a.position.x,a.position.z,a.position.y+.8)?.name||'Dust II',reloading:a.reloadUntil?1-(a.reloadUntil-this.time)/WEAPONS[w.id].reload:0,interaction:bomb.interactingActor===this.player.id?bomb.interaction:0,interactionLabel:this.interactionLabel,prompt,fps:this.fps,spectating:controlled.alive?'':this.actors[this.spectator]?.name||'等待下一回合',scope:controlled.alive&&this.scoped,grenades:a.grenades,selectedGrenade:this.selectedGrenade});
    this.ui.scoreboard(this.actors,this.match,this.input.down('Tab')&&!this.paused);
    if(this.match.round>1||this.match.phase==='planted')this.ui.$('tutorial').classList.add('hidden');
  }
  private resize(){this.wakeRendering();this.renderer.setSize(innerWidth,innerHeight);this.camera.aspect=this.viewCamera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.viewCamera.updateProjectionMatrix();}
  private installDebug(){
    if(!import.meta.env.DEV)return;
    (window as unknown as {__dust:unknown}).__dust={
      snapshot:()=>({prewarm:this.prewarmStats,loot:{...this.lootPhysics.stats,guns:this.drops.length,kits:this.kitDrops.length,models:this.groundModels.stats,c4Native:!!this.c4},movement:{controlled:this.player.id,speed:Math.hypot(this.player.velocity.x,this.player.velocity.z)/MOVEMENT.unit,footSpeed:this.player.footSpeed,surface:this.physics.groundSurface(this.player.position),footsteps:this.audio.footsteps.status},hitAudio:this.audio.hits.status,shop:{open:this.overlay==='buy',preview:this.buyPortrait?.stats??null,refunds:this.purchases.refunds(this.match,this.player,true)},phase:this.match.phase,round:this.match.round,score:this.match.score,remaining:this.match.remaining,bomb:this.match.bomb,paused:this.paused,active:this.active,actors:this.actors.map(a=>({id:a.id,side:this.match.sides[a.team],health:a.health,alive:a.alive,pos:a.position.toArray(),action:a.botAction,model:a.model.animation?.status,path:a.path.length,route:a.routeIndex})),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,fps:this.fps,mapStats:this.level instanceof Source2Level?{...this.level.stats,surfaceRepairs:this.level.surfaceRepairs}:null,weapon:this.player.slot,handling:this.player.handling,ammo:this.weapon(this.player),scope:this.scopeLevel,training:this.training,utilityTraining:this.utilityTraining,utility:{selected:this.selectedGrenade,phase:this.throwState.phase,strength:this.throwState.strength,inventory:this.player.grenades,drops:this.grenadeDrops.map(d=>({kind:d.kind,position:d.position.toArray()})),projectiles:this.effects.grenades.map(g=>({kind:g.kind,age:g.age,position:g.position.toArray(),bounces:g.bounces,resting:g.resting})),hazards:this.hazards.stats,volume:this.smokeVolumes.stats,canisters:this.spentGrenades.size,fireInstances:this.grenadeFire.instances,particles:this.effects.stats},audio:this.audio.nativeStatus,media:this.media.status,rendering:{frames:this.renderCount,running:this.loopRunning,limit:this.settings.frameLimit,width:this.canvas.width,height:this.canvas.height,shadows:this.level instanceof Source2Level?this.level.shadows?.stats:null,actors:this.actorVisibilityStats,worldScale:this.worldResolution.scale,worldSize:this.worldResolution.dimensions}}),
      performance:()=>{const a=[...this.performanceSamples].sort((a,b)=>a-b),work=[...this.frameWork].sort((a,b)=>a-b);return{workMedian:work[Math.floor(work.length*.5)],workP95:work[Math.floor(work.length*.95)],totalRendered:this.renderCount,frames:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};},
    };
  }
}
