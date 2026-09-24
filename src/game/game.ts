import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { SSAOPass } from 'three/addons/postprocessing/SSAOPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import type RAPIER from '@dimforge/rapier3d-compat';
import { Physics } from './physics';
import { Navigation } from './navigation';
import { GameAudio } from './audio';
import { Input } from './input';
import { WEAPONS, createWeapon, finishReload, resolveDamage } from './weapons';
import { RULES, newMatch, checkWin, endRound, nextRound, purchase, canBuy, teamForSide } from './rules';
import type { Combatant, Difficulty, GrenadeId, MatchState, Settings, Side, Team, Vec3, WeaponId } from './types';
import { MAP, heightAt, inSpawn, siteAt, zoneAt } from '../world/map';
import { loadMaterials } from '../world/materials';
import { Level } from '../world/level';
import { makeCharacter, animateCharacter, makeWeapon, detailModelMaterials, type CharacterModel, type WeaponModel } from '../world/models';
import { Effects, type Grenade } from '../world/effects';
import { UI, readSettings } from '../ui/ui';

interface Pawn extends Combatant {
  position:THREE.Vector3;velocity:THREE.Vector3;body:RAPIER.RigidBody;collider:RAPIER.Collider;model:CharacterModel;
  yaw:number;pitch:number;crouch:boolean;grounded:boolean;slot:WeaponId;nextShot:number;reloadUntil:number;shotCount:number;
  target:number|null;lastSeen:THREE.Vector3|null;memoryUntil:number;senseAt:number;path:Vec3[];pathIndex:number;repathAt:number;
  route:Vec3[];routeIndex:number;reactionUntil:number;stuckTime:number;lastPosition:THREE.Vector3;deathTime:number;
  grenades:Record<GrenadeId,number>;stepAt:number;flashUntil:number;botAction:string;
}
interface Drop {position:THREE.Vector3;weapon:ReturnType<typeof createWeapon>;mesh:THREE.Group}
const botNames=['YOU','MASON','NOMAD','GHOST','ATLAS','KASIM','FARID','OMAR','RAFIQ','AZIZ'];
const diff:Record<Difficulty,{reaction:number;spread:number;speed:number}>={easy:{reaction:.75,spread:.058,speed:3.8},normal:{reaction:.4,spread:.026,speed:4.6},hard:{reaction:.23,spread:.011,speed:5.2}};
const up=new THREE.Vector3(0,1,0);
const v=(x:number,z:number):Vec3=>({x,y:heightAt(x,z),z});
function direction(yaw:number,pitch=0){return new THREE.Vector3(-Math.sin(yaw)*Math.cos(pitch),Math.sin(pitch),-Math.cos(yaw)*Math.cos(pitch));}

export class Game {
  readonly canvas=document.querySelector<HTMLCanvasElement>('#world')!;
  readonly ui=new UI(readSettings());
  settings=this.ui.settings;
  readonly renderer:THREE.WebGLRenderer;
  readonly scene=new THREE.Scene();
  readonly camera=new THREE.PerspectiveCamera(80,innerWidth/innerHeight,.07,450);
  readonly viewScene=new THREE.Scene();
  readonly viewCamera=new THREE.PerspectiveCamera(58,innerWidth/innerHeight,.01,5);
  readonly physics=new Physics();readonly navigation=new Navigation();readonly audio=new GameAudio();readonly input:Input;
  effects!:Effects;level!:Level;actors:Pawn[]=[];match:MatchState=newMatch();
  active=false;paused=false;overlay:'none'|'pause'|'settings'|'buy'='none';
  time=0;private accumulator=0;private last=0;private frames=0;private fpsTime=0;fps=60;private hudAt=0;
  private viewModels=new Map<WeaponId,WeaponModel>();private currentView!:WeaponModel;
  private recoil=0;private sway=new THREE.Vector2();private muzzleUntil=0;private flashLight=new THREE.PointLight(0xffc37e,0,3);
  private scoped=false;private selectedGrenade:GrenadeId|null=null;private bombSelected=false;private grenadeCooldown=0;
  private bombMesh=new THREE.Group();private drops:Drop[]=[];private interactionActor:number|null=null;private interactionTime=0;private interactionLabel='';
  private lastBeep=0;private spectator=1;private bombPlan:'A'|'B'='A';private menuTime=0;
  private targetSightings=new Map<number,number>();private performanceSamples:number[]=[];
  private composer:EffectComposer|null=null;private ao:SSAOPass|null=null;
  constructor(){
    this.renderer=new THREE.WebGLRenderer({canvas:this.canvas,antialias:true,powerPreference:'high-performance'});
    this.renderer.setSize(innerWidth,innerHeight);this.renderer.setPixelRatio(Math.min(devicePixelRatio,1.7));
    this.renderer.outputColorSpace=THREE.SRGBColorSpace;this.renderer.toneMapping=THREE.ACESFilmicToneMapping;this.renderer.toneMappingExposure=1.02;
    this.renderer.shadowMap.enabled=true;this.renderer.shadowMap.type=THREE.PCFShadowMap;this.renderer.shadowMap.autoUpdate=false;this.renderer.autoClear=false;this.renderer.info.autoReset=false;
    this.input=new Input(this.canvas);this.input.onAction=code=>this.onKey(code);
    this.ui.callbacks={start:()=>void this.start(),resume:()=>void this.resume(),menu:()=>this.toMenu(),restart:()=>void this.start(),buy:id=>this.buy(id),settings:s=>this.applySettings(s),openSettings:()=>this.openSettings(),closeOverlay:()=>this.closeOverlay()};
    this.viewScene.add(new THREE.HemisphereLight(0xf8f5e7,0x827c63,2.5));const light=new THREE.DirectionalLight(0xfff2d7,3);light.position.set(-3,4,2);this.viewScene.add(light,this.flashLight);this.flashLight.position.set(0,0,-.6);
    window.addEventListener('resize',()=>this.resize());
    document.addEventListener('pointerlockchange',()=>{if(document.pointerLockElement!==this.canvas&&this.active&&this.overlay==='none'&&this.match.phase!=='finished')this.pause();});
    document.addEventListener('visibilitychange',()=>{if(document.hidden&&this.active)this.pause();});
  }
  async init(){
    this.ui.loading(.04,'正在准备渲染引擎');
    const [materials]=await Promise.all([loadMaterials(f=>this.ui.loading(.08+f*.62,'正在载入真实环境材质')),this.physics.init(),this.navigation.init()]);
    this.ui.loading(.76,'正在构建街巷、建筑与光照');
    await new Promise(r=>setTimeout(r,20));
    this.level=new Level(this.scene,this.renderer,materials);this.effects=new Effects(this.scene);
    detailModelMaterials(materials);
    this.composer=new EffectComposer(this.renderer);
    this.composer.addPass(new RenderPass(this.scene,this.camera));
    this.ao=new SSAOPass(this.scene,this.camera,innerWidth,innerHeight,12);this.ao.kernelRadius=5;this.ao.minDistance=.002;this.ao.maxDistance=.055;
    this.composer.addPass(this.ao);this.composer.addPass(new OutputPass());
    this.viewScene.environment=this.scene.environment;this.viewScene.environmentIntensity=.6;
    for(const id of Object.keys(WEAPONS)as WeaponId[]){const model=makeWeapon(id,true);model.root.scale.setScalar(.8);model.root.visible=false;this.viewScene.add(model.root);this.viewModels.set(id,model);}
    this.selectView('usp');this.createBomb();
    this.ui.loading(.91,'正在集结战术小队');
    for(let i=0;i<10;i++)this.actors.push(this.createPawn(i));
    this.prepareRound(true);this.applySettings(this.settings);
    this.camera.position.set(27,10,-8);this.camera.lookAt(45,5,-38);
    this.ui.loading(.97,'正在编译光影');
    await this.renderer.compileAsync(this.scene,this.camera);
    this.ui.loading(1,'准备就绪');this.ui.loaded();
    this.last=performance.now();this.renderer.setAnimationLoop(t=>this.frame(t));
    if(import.meta.env.DEV)this.installDebug();
  }
  private createPawn(id:number):Pawn {
    const team:Team=id<5?0:1,side=this.match.sides[team],p=MAP.spawns[side][id%5];
    const {body,collider}=this.physics.character(p),model=makeCharacter(side);this.scene.add(model.root);
    return {id,team,name:botNames[id],alive:true,health:100,armor:0,helmet:false,kit:false,money:800,kills:0,deaths:0,inventory:[createWeapon(side==='CT'?'usp':'glock'),createWeapon('knife')],position:new THREE.Vector3(p.x,p.y,p.z),velocity:new THREE.Vector3(),body,collider,model,yaw:side==='CT'?Math.PI:0,pitch:0,crouch:false,grounded:true,slot:side==='CT'?'usp':'glock',nextShot:0,reloadUntil:0,shotCount:0,target:null,lastSeen:null,memoryUntil:0,senseAt:0,path:[],pathIndex:0,repathAt:0,route:[],routeIndex:0,reactionUntil:0,stuckTime:0,lastPosition:new THREE.Vector3(),deathTime:0,grenades:{he:0,flash:0,smoke:0},stepAt:0,flashUntil:0,botAction:'守备'};
  }
  private get player(){return this.actors[0];}
  private eye(a:Pawn){return a.position.clone().add(new THREE.Vector3(0,a.crouch?1.07:1.61,0));}
  private weapon(a:Pawn){return a.inventory.find(w=>w.id===a.slot)||a.inventory[0];}
  private setSlot(a:Pawn,id:WeaponId){if(!a.inventory.some(w=>w.id===id))return;a.slot=id;a.reloadUntil=0;a.shotCount=0;if(a.id===0){this.scoped=false;this.bombSelected=false;this.selectedGrenade=null;this.selectView(id);}}
  private selectView(id:WeaponId){for(const m of this.viewModels.values())m.root.visible=false;this.currentView=this.viewModels.get(id)!;if(this.currentView)this.currentView.root.visible=true;}
  private createBomb(){
    const body=new THREE.Mesh(new THREE.BoxGeometry(.32,.11,.22),new THREE.MeshStandardMaterial({color:0x62583b,roughness:.85}));this.bombMesh.add(body);
    const screen=new THREE.Mesh(new THREE.BoxGeometry(.1,.014,.06),new THREE.MeshStandardMaterial({color:0x83af7a,emissive:0x4b8b31,emissiveIntensity:1}));screen.position.set(0,.06,-.02);this.bombMesh.add(screen);
    for(let i=0;i<3;i++){const wire=new THREE.Mesh(new THREE.TorusGeometry(.07,.005,4,12,Math.PI),new THREE.MeshBasicMaterial({color:[0xc24122,0xc7ba6c,0x333c32][i]}));wire.rotation.x=Math.PI/2;wire.position.set(.02*i,.07,.02);this.bombMesh.add(wire);}
    this.bombMesh.visible=false;this.scene.add(this.bombMesh);
  }
  async start(){
    if(!this.ui.ready)return;
    this.match=newMatch(this.settings.side);this.active=true;this.paused=false;this.overlay='none';
    for(const a of this.actors){a.kills=a.deaths=0;a.money=800;a.alive=false;}
    this.prepareRound(true);this.ui.enter();this.ui.toast('行动开始 · 按 B 购买装备，按住 E 进行目标交互');
    await this.audio.start();await this.lock();
  }
  private async lock(){try{await this.canvas.requestPointerLock();}catch{this.pause();this.ui.toast('请点击「继续游戏」以启用鼠标控制');}}
  async resume(){this.ui.close();this.overlay='none';this.paused=false;this.input.reset();await this.audio.start();await this.lock();}
  pause(){if(!this.active||this.match.phase==='finished')return;this.paused=true;this.overlay='pause';this.input.reset();if(document.pointerLockElement)document.exitPointerLock();this.ui.pause();}
  private toMenu(){this.active=false;this.paused=false;this.overlay='none';this.input.reset();document.exitPointerLock();this.ui.menu();this.effects.clear();}
  private openSettings(){this.paused=this.active;this.overlay='settings';this.input.reset();if(document.pointerLockElement)document.exitPointerLock();this.ui.settingsPanel();}
  private closeOverlay(){if(this.active)void this.resume();else{this.overlay='none';this.ui.close();}}
  private openBuy(){if(!canBuy(this.match,this.player,inSpawn(this.match.sides[0],this.player.position.x,this.player.position.z))){this.ui.toast('只能在准备阶段的出生区域购买装备');return;}this.paused=true;this.overlay='buy';this.input.reset();document.exitPointerLock();this.ui.buy(this.player,this.match.sides[0]);}
  private applySettings(settings:Settings){this.settings=settings;this.audio.setVolume(settings.volume);const ratio={high:1.7,medium:1.3,low:1}[settings.quality];this.renderer.setPixelRatio(Math.min(devicePixelRatio,ratio));this.renderer.shadowMap.enabled=settings.quality!=='low';if(this.level){const size=settings.quality==='high'?4096:2048;this.level.sun.shadow.mapSize.set(size,size);this.level.sun.shadow.map?.dispose();this.level.sun.shadow.map=null;}}
  private buy(id:string){
    const p=this.player,inZone=inSpawn(this.match.sides[0],p.position.x,p.position.z);
    let result=false;
    if(['he','flash','smoke'].includes(id)){
      const kind=id as GrenadeId,cost=kind==='flash'?200:300;
      if(canBuy(this.match,p,inZone)&&p.money>=cost&&p.grenades[kind]<(kind==='flash'?2:1)){p.money-=cost;p.grenades[kind]++;result=true;}
    }else result=purchase(this.match,p,id as WeaponId|'armor'|'helmet'|'kit',inZone);
    if(result){this.audio.beep(600,.045,.025);if(id in WEAPONS)this.setSlot(p,id as WeaponId);}else this.ui.toast('已拥有该装备，或资金不足');
    this.ui.buy(p,this.match.sides[0]);
  }
  private prepareRound(reset=false){
    this.effects?.clear();for(const d of this.drops)this.scene.remove(d.mesh);this.drops=[];
    this.interactionActor=null;this.interactionTime=0;this.selectedGrenade=null;this.scoped=false;this.bombSelected=false;this.recoil=0;this.bombMesh.visible=false;
    this.bombPlan=this.match.round%2?'A':'B';
    for(const a of this.actors){
      const side=this.match.sides[a.team],p=MAP.spawns[side][a.id%5],survived=a.alive&&!reset;
      if(reset||!survived){a.inventory=[createWeapon(side==='CT'?'usp':'glock'),createWeapon('knife')];a.armor=0;a.helmet=false;a.kit=false;a.grenades={he:0,flash:0,smoke:0};}
      if(reset)a.money=800;
      if(a.model.side!==side){this.scene.remove(a.model.root);a.model=makeCharacter(side);this.scene.add(a.model.root);}
      a.position.set(p.x,p.y,p.z);a.body.setTranslation({x:p.x,y:p.y+.9,z:p.z},true);a.body.setNextKinematicTranslation({x:p.x,y:p.y+.9,z:p.z});a.collider.setEnabled(true);this.physics.resize(a.collider,false);
      a.alive=true;a.health=100;a.velocity.set(0,0,0);a.crouch=false;a.grounded=true;a.yaw=side==='CT'?Math.PI:0;a.pitch=0;
      a.target=null;a.lastSeen=null;a.memoryUntil=0;a.path=[];a.pathIndex=0;a.routeIndex=0;a.repathAt=0;a.senseAt=this.time+a.id*.015;a.stuckTime=0;a.reloadUntil=0;a.nextShot=0;a.flashUntil=0;a.shotCount=0;
      a.model.root.visible=true;a.model.root.position.copy(a.position);a.model.root.rotation.set(0,a.yaw,0);
      for(const gun of a.inventory){gun.ammo=WEAPONS[gun.id].magazine;gun.reserve=WEAPONS[gun.id].reserve;}
      if(a.id!==0)this.equipBot(a);
      a.slot=a.inventory.find(w=>WEAPONS[w.id].slot===1)?.id||a.inventory.find(w=>WEAPONS[w.id].slot===2)!.id;
      a.model.torso.remove(a.model.weapon.root);
      a.model.weapon=makeWeapon(a.slot);
      a.model.weapon.root.position.set(.15,-.2,-.31);a.model.weapon.root.scale.setScalar(.83);a.model.torso.add(a.model.weapon.root);
      a.route=this.botRoute(a,side);a.lastPosition.copy(a.position);
    }
    const attackers=this.actors.filter(a=>this.match.sides[a.team]==='T');
    this.match.bomb.carrier=attackers.find(a=>a.id===0)?.id??attackers[0].id;
    this.selectView(this.player.slot);this.physics.world.step();
  }
  private equipBot(a:Pawn){
    const side=this.match.sides[a.team];
    if(this.match.round>1&&a.money>3500){const id=a.id%5===4&&a.money>5750?'awp':side==='CT'?'m4a1':'ak47';purchase(this.match,a,id,true);}
    if(a.money>=1000)purchase(this.match,a,'helmet',true);else if(a.money>=650)purchase(this.match,a,'armor',true);
    if(side==='CT'&&a.money>=400)purchase(this.match,a,'kit',true);
    if(a.money>=300&&this.match.round>1){a.money-=300;a.grenades.he=1;}
  }
  private botRoute(a:Pawn,side:Side):Vec3[]{
    if(side==='T'){
      if(this.bombPlan==='B')return [v(-29,48),v(-43,34),v(-43,18),v(-43,-15),v(-45,-35)];
      return a.id%3===0?[v(0,28),v(8,16),v(19,10),v(19,-14),v(30,-27),v(43,-37)]:[v(25,46),v(34,39),v(46,23),v(53,3),v(52,-23),v(44,-37)];
    }
    return a.id%3===0?[v(-7,-35),v(-10,-22),v(-7,-12)]:a.id%2===0?[v(-18,-42),v(-40,-42),v(-48,-32)]:[v(28,-51),v(42,-45),v(48,-31)];
  }
  private onKey(code:string){
    if(code==='Enter'&&!this.active&&this.overlay==='none'){void this.start();return;}
    if(code==='Escape'&&this.overlay!=='none'){this.closeOverlay();return;}
    if(code==='KeyB'&&this.active){if(this.overlay==='buy')this.closeOverlay();else if(!this.paused)this.openBuy();return;}
    if(!this.active||this.paused||!this.player?.alive)return;
    const p=this.player;
    if(code==='KeyR')this.reload(p);
    if(['Digit1','Digit2','Digit3'].includes(code)){const slot=Number(code.at(-1));const weapon=p.inventory.find(w=>WEAPONS[w.id].slot===slot);if(weapon)this.setSlot(p,weapon.id);}
    if(code==='Digit4'){
      const owned=(['he','flash','smoke']as GrenadeId[]).filter(k=>p.grenades[k]>0);
      if(owned.length){this.selectedGrenade=owned[(owned.indexOf(this.selectedGrenade!)+1)%owned.length];this.scoped=false;this.bombSelected=false;this.ui.toast({he:'已选择高爆手雷 · 左键投掷',flash:'已选择闪光弹 · 左键投掷',smoke:'已选择烟雾弹 · 左键投掷'}[this.selectedGrenade]);}else this.ui.toast('没有投掷物 · 准备阶段按 B 购买');
    }
    if(code==='Digit5'){if(this.match.bomb.carrier===0){this.bombSelected=true;this.selectedGrenade=null;this.scoped=false;this.ui.toast('携带 C4 · 在 A 或 B 包点按住 E 安装');}else this.ui.toast('当前未携带 C4');}
    if(code==='KeyG'){if(this.bombSelected&&this.match.bomb.carrier===0){this.match.bomb.carrier=null;this.match.bomb.position=p.position.clone();this.bombSelected=false;}else this.drop(p);}
  }
  private reload(a:Pawn){const w=this.weapon(a);if(w.id==='knife'||a.reloadUntil||w.ammo===WEAPONS[w.id].magazine||w.reserve<=0)return;a.reloadUntil=this.time+WEAPONS[w.id].reload;a.shotCount=0;if(a.id===0){this.scoped=false;this.audio.reload();}}
  private drop(a:Pawn){const w=this.weapon(a);if(w.id==='knife')return;const model=makeWeapon(w.id);model.root.scale.setScalar(.8);model.root.rotation.set(Math.PI/2,.3,0);const position=a.position.clone().addScaledVector(direction(a.yaw),.7);position.y=heightAt(position.x,position.z)+.12;model.root.position.copy(position);this.scene.add(model.root);this.drops.push({position,weapon:{...w},mesh:model.root});if(a.alive){a.inventory=a.inventory.filter(i=>i!==w);this.setSlot(a,a.inventory[0].id);}}
  private frame(timestamp:number){
    const dt=Math.min(.1,(timestamp-this.last)/1000);this.last=timestamp;this.frames++;this.fpsTime+=dt;
    if(this.fpsTime>=.75){this.fps=Math.round(this.frames/this.fpsTime);this.frames=0;this.fpsTime=0;}
    if(this.active&&!this.paused&&this.match.phase!=='finished'){
      this.accumulator+=dt;
      while(this.accumulator>=1/60){this.tick(1/60);this.accumulator-=1/60;}
      this.effects.update(dt);
    }else{this.accumulator=0;if(!this.active)this.menuTime+=dt;}
    this.updateCamera(dt);
    for(const a of this.actors){a.model.root.visible=a.id!==0||!this.active;if(this.active&&a.id===this.spectator&&!this.player.alive)a.model.root.visible=false;a.model.root.position.copy(a.position);a.model.root.rotation.y=a.yaw;animateCharacter(a.model,this.time,new THREE.Vector2(a.velocity.x,a.velocity.z).length()/5,a.crouch,a.alive,this.time-a.deathTime);a.model.weapon.muzzle.visible=a.alive&&this.time<a.nextShot-.06;}
    this.renderer.info.reset();this.renderer.shadowMap.needsUpdate=true;this.renderer.clear();
    if(this.composer&&this.settings.quality==='high')this.composer.render(dt);else this.renderer.render(this.scene,this.camera);
    if(this.active&&this.player.alive&&!this.scoped&&!this.selectedGrenade&&!this.bombSelected){this.renderer.clearDepth();this.renderer.render(this.viewScene,this.viewCamera);}
    if(this.active&&timestamp>this.hudAt){this.hudAt=timestamp+50;this.updateHUD();}
    this.input.consume();
    if(import.meta.env.DEV&&this.active&&!this.paused){this.performanceSamples.push(dt*1000);if(this.performanceSamples.length>1800)this.performanceSamples.shift();}
  }
  private tick(dt:number){
    this.time+=dt;this.match.remaining=Math.max(0,this.match.remaining-dt);
    if(this.match.phase==='freeze'&&this.match.remaining<=0){this.match.phase='live';this.match.remaining=RULES.live;this.audio.beep(520,.16,.06);}
    if(this.match.phase==='end'&&this.match.remaining<=0){const result=nextRound(this.match);if(result==='finished'){this.paused=true;this.overlay='pause';document.exitPointerLock();this.ui.finish(this.match);return;}this.prepareRound(result==='halftime');if(result==='halftime')this.ui.toast('半场换边 · 经济与装备已重置');}
    if(this.match.phase==='planted'){
      this.match.bomb.remaining=Math.max(0,this.match.bomb.remaining-dt);
      if(this.time-this.lastBeep>Math.max(.13,this.match.bomb.remaining/35)){this.audio.beep(1050,.06,.055);this.lastBeep=this.time;}
    }
    this.updatePlayer(dt);
    for(const a of this.actors){
      if(!a.alive)continue;
      if(a.reloadUntil&&this.time>=a.reloadUntil){finishReload(this.weapon(a));a.reloadUntil=0;}
      if(a.id!==0)this.updateBot(a,dt);
    }
    this.physics.world.step();
    for(const a of this.actors){if(!a.alive)continue;const p=a.body.translation();a.position.set(p.x,p.y-(a.crouch?.625:.9),p.z);if(a.position.y<-8){const spawn=MAP.spawns[this.match.sides[a.team]][a.id%5];a.body.setTranslation({x:spawn.x,y:spawn.y+.9,z:spawn.z},true);a.velocity.set(0,0,0);}}
    this.interact(dt);this.updateGrenades(dt);
    const win=checkWin(this.match,this.actors);if(win){if(this.match.phase==='planted'&&this.match.bomb.remaining<=0){const p=new THREE.Vector3().copy(this.match.bomb.position!);this.effects.explode(p);this.audio.explosion(p);for(const a of this.actors)if(a.alive&&a.position.distanceTo(p)<25)this.damage(a,120*(1-a.position.distanceTo(p)/30),null,false,'C4');}endRound(this.match,win.winner,win.reason,this.actors);}
    if(this.match.bomb.position){this.bombMesh.visible=true;this.bombMesh.position.copy(this.match.bomb.position);this.bombMesh.position.y+=.1;}else this.bombMesh.visible=false;
  }
  private updatePlayer(dt:number){
    const a=this.player;
    if(!a.alive){if(this.input.firePressed)this.spectateNext();return;}
    a.yaw-=this.input.dx*.002*this.settings.sensitivity;a.pitch=THREE.MathUtils.clamp(a.pitch-this.input.dy*.002*this.settings.sensitivity,-1.48,1.48);
    this.sway.x=THREE.MathUtils.lerp(this.sway.x,this.input.dx*.00013,.2);this.sway.y=THREE.MathUtils.lerp(this.sway.y,this.input.dy*.0001,.2);
    this.input.dx=this.input.dy=0;
    if(this.input.wheel){const guns=a.inventory.sort((a,b)=>WEAPONS[a.id].slot-WEAPONS[b.id].slot);const i=guns.findIndex(w=>w.id===a.slot);this.setSlot(a,guns[(i+Math.sign(this.input.wheel)+guns.length)%guns.length].id);this.input.wheel=0;}
    if(this.input.rightPressed&&a.slot==='awp'&&!a.reloadUntil){this.scoped=!this.scoped;this.audio.beep(700,.025,.025);this.input.rightPressed=false;}
    const crouch=this.input.down('ControlLeft','ControlRight','KeyC');
    if(crouch!==a.crouch){const headBlocked=this.physics.ray(this.eye(a),up,.6);if(crouch||!headBlocked){const old=a.crouch;a.crouch=crouch;this.physics.resize(a.collider,crouch);const p=a.body.translation();a.body.setTranslation({x:p.x,y:p.y+(old?.275:-.275),z:p.z},true);}}
    const movement=new THREE.Vector3(Number(this.input.down('KeyD'))-Number(this.input.down('KeyA')),0,Number(this.input.down('KeyS'))-Number(this.input.down('KeyW'))).normalize().applyAxisAngle(up,a.yaw);
    const speed=a.crouch?2.1:this.input.down('ShiftLeft','ShiftRight')?2.5:a.slot==='knife'?6.2:a.slot==='awp'?4.5:5.6;
    if(this.match.phase==='freeze'||this.match.phase==='end')movement.set(0,0,0);
    a.velocity.x=THREE.MathUtils.lerp(a.velocity.x,movement.x*speed,Math.min(1,dt*22));a.velocity.z=THREE.MathUtils.lerp(a.velocity.z,movement.z*speed,Math.min(1,dt*22));
    if(this.input.pressed.has('Space')&&a.grounded&&this.match.phase!=='freeze'){a.velocity.y=7;this.input.pressed.delete('Space');}
    this.move(a,dt);
    const allowed=this.match.phase==='live'||this.match.phase==='planted';
    if(this.selectedGrenade&&this.input.firePressed&&allowed){this.throwGrenade(a,this.selectedGrenade);this.input.firePressed=false;}
    else if(!this.bombSelected&&!this.selectedGrenade&&allowed&&(WEAPONS[a.slot].automatic?this.input.firing:this.input.firePressed)){
      this.shoot(a);this.input.firePressed=false;
    }
    if(a.velocity.length()>1&&a.grounded&&this.time>a.stepAt){this.audio.step(undefined,this.input.down('ShiftLeft')||a.crouch);a.stepAt=this.time+(this.input.down('ShiftLeft')?.58:.36);}
  }
  private move(a:Pawn,dt:number){
    a.velocity.y-=20*dt;if(a.grounded&&a.velocity.y<0)a.velocity.y=-.5;
    a.grounded=this.physics.move(a.body,a.collider,{x:a.velocity.x*dt,y:a.velocity.y*dt,z:a.velocity.z*dt});
    if(a.grounded&&a.velocity.y<0)a.velocity.y=0;
  }
  private updateBot(a:Pawn,dt:number){
    if(this.match.phase==='freeze'||this.match.phase==='end'){a.velocity.x=a.velocity.z=0;this.move(a,dt);return;}
    const difficulty=diff[this.settings.difficulty],eye=this.eye(a),side=this.match.sides[a.team];
    if(this.time>=a.senseAt){
      a.senseAt=this.time+.17;
      const enemies=this.actors.filter(e=>e.team!==a.team&&e.alive&&e.position.distanceTo(a.position)<66).sort((x,y)=>x.position.distanceTo(a.position)-y.position.distanceTo(a.position));
      const seen=this.time<a.flashUntil?undefined:enemies.find(e=>{const towards=this.eye(e).sub(eye),dist=towards.length();return (dist<9||towards.normalize().dot(direction(a.yaw))>-.2)&&this.physics.canSee(eye,this.eye(e))&&!this.effects.smokeBlocked(eye,this.eye(e));});
      if(seen){if(a.target!==seen.id)a.reactionUntil=this.time+difficulty.reaction+Math.random()*.15;a.target=seen.id;a.lastSeen=seen.position.clone();a.memoryUntil=this.time+5;this.targetSightings.set(seen.id,this.time);}
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
      while(point&&Math.hypot(point.x-a.position.x,point.z-a.position.z)<.8&&a.pathIndex<a.path.length-1){point=a.path[++a.pathIndex];}
      if(point&&Math.hypot(desired.x-a.position.x,desired.z-a.position.z)>(this.match.phase==='planted'&&side==='CT'?1.4:1.1)){dx=point.x-a.position.x;dz=point.z-a.position.z;const d=Math.hypot(dx,dz);if(d>.01){dx=dx/d*difficulty.speed;dz=dz/d*difficulty.speed;}}
    }
    if(enemy&&enemy.alive){
      const aim=this.eye(enemy).sub(eye);const yaw=Math.atan2(-aim.x,-aim.z),pitch=Math.atan2(aim.y-.16,Math.hypot(aim.x,aim.z));a.yaw=this.turn(a.yaw,yaw,Math.min(1,dt*12));a.pitch=pitch;
      if(enemy.position.distanceTo(a.position)<40){dx*=.18;dz*=.18;}
      if(this.time>=a.reactionUntil&&this.time>=a.flashUntil){
        if(a.grenades.he&&enemy.position.distanceTo(a.position)>13&&enemy.position.distanceTo(a.position)<26&&Math.random()<dt*.18)this.throwGrenade(a,'he');
        else this.shoot(a);
      }
    }else if(Math.hypot(dx,dz)>.5){a.yaw=this.turn(a.yaw,Math.atan2(-dx,-dz),Math.min(1,dt*6));a.pitch=0;}
    const atBomb=!!bomb.position&&Math.hypot(a.position.x-bomb.position.x,a.position.z-bomb.position.z)<2.1;
    const atPlant=bomb.carrier===a.id&&!!siteAt(a.position.x,a.position.z);
    if((this.match.phase==='planted'&&side==='CT'&&atBomb&&!enemy)||atPlant){dx=dz=0;a.botAction=side==='CT'?'拆弹':'安装炸弹';}
    // Local steering keeps squadmates apart without using their bodies as moving walls.
    for(const friend of this.actors){if(friend.id===a.id||!friend.alive)continue;const d=a.position.distanceTo(friend.position);if(d>.01&&d<.8){dx+=(a.position.x-friend.position.x)/d*1.7;dz+=(a.position.z-friend.position.z)/d*1.7;}}
    a.velocity.x=dx;a.velocity.z=dz;this.move(a,dt);
    if(Math.hypot(dx,dz)>1&&a.position.distanceTo(a.lastPosition)<.007)a.stuckTime+=dt;else a.stuckTime=0;
    if(a.stuckTime>.8){a.repathAt=0;a.path=[];if(a.grounded)a.velocity.y=5.5;a.stuckTime=0;}
    a.lastPosition.copy(a.position);
    const w=this.weapon(a);if(w.ammo===0||(w.ammo<WEAPONS[w.id].magazine*.3&&!enemy))this.reload(a);
    if(Math.hypot(dx,dz)>1&&a.grounded&&this.time>a.stepAt){this.audio.step(a.position);a.stepAt=this.time+.38;}
  }
  private turn(a:number,b:number,t:number){return a+Math.atan2(Math.sin(b-a),Math.cos(b-a))*t;}
  private shoot(a:Pawn){
    const w=this.weapon(a),def=WEAPONS[w.id];if(this.time<a.nextShot||a.reloadUntil||!a.alive)return;
    if(w.ammo<=0&&w.id!=='knife'){this.reload(a);return;}
    if(w.id!=='knife')w.ammo--;a.nextShot=this.time+def.interval;
    const origin=this.eye(a),dir=direction(a.yaw,a.pitch);
    const moving=Math.hypot(a.velocity.x,a.velocity.z),bot=a.id!==0;
    let spread=bot?diff[this.settings.difficulty].spread:(this.scoped&&w.id==='awp'?.0007:def.spread)+(moving>1?.012:0)+(a.grounded?0:.04)+Math.min(a.shotCount,12)*.001;
    if(a.crouch)spread*=.7;
    dir.x+=(Math.random()-.5)*spread*2;dir.y+=(Math.random()-.5)*spread*2;dir.z+=(Math.random()-.5)*spread*2;dir.normalize();
    const range=w.id==='knife'?2:140;
    let blocking=this.physics.ray(origin,dir,range),power=1;
    if(blocking&&this.physics.materials.get(blocking.collider.handle)==='wood'&&def.slot===1){
      const entry=origin.clone().addScaledVector(dir,blocking.timeOfImpact);this.effects.impact(entry,new THREE.Vector3().copy(blocking.normal));power=.55;
      blocking=this.physics.ray(origin,dir,range,blocking.collider.handle);
    }
    let nearest=blocking?.timeOfImpact??range,hit:Pawn|null=null,head=false,point=origin.clone().addScaledVector(dir,nearest);
    const ray=new THREE.Ray(origin,dir),contact=new THREE.Vector3();
    for(const enemy of this.actors){
      if(!enemy.alive||enemy.id===a.id||enemy.team===a.team)continue;
      for(const [height,radius,isHead]of [[enemy.crouch?1.11:1.6,.2,true],[enemy.crouch?.78:1.12,.32,false],[.52,.28,false]]as const){
        const center=enemy.position.clone().add(new THREE.Vector3(0,height,0));
        if(ray.intersectSphere(new THREE.Sphere(center,radius),contact)){const distance=origin.distanceTo(contact);if(distance<nearest){nearest=distance;hit=enemy;head=isHead;point.copy(contact);}}
      }
    }
    if(hit){const amount=resolveDamage(def.damage*power*(w.id==='knife'?1:Math.pow(.985,nearest/8)),head,hit.armor,hit.helmet,def.armorPenetration);hit.armor=Math.max(0,hit.armor-amount.armorUsed);this.damage(hit,amount.damage,a,head,def.name);this.effects.impact(point,dir.clone().negate(),true);if(a.id===0){this.ui.hit(head);this.audio.impact();}}
    else if(blocking)this.effects.impact(point,new THREE.Vector3().copy(blocking.normal));
    if(w.id!=='knife'){
      this.audio.shot(w.id,bot?a.position:undefined);
      if(bot||Math.random()>.6)this.effects.tracer(origin.clone().addScaledVector(dir,.6),point);
      for(const listener of this.actors){if(listener.id===0||listener.team===a.team||!listener.alive||listener.position.distanceTo(a.position)>40)continue;listener.lastSeen=a.position.clone();listener.memoryUntil=this.time+4;}
    }
    a.shotCount++;
    if(!bot){a.pitch=Math.min(1.48,a.pitch+def.recoil*(.65+Math.min(a.shotCount,8)*.05));a.yaw+=Math.sin(a.shotCount*1.72)*def.recoil*.3;this.recoil=Math.min(.12,this.recoil+def.recoil*.9);this.muzzleUntil=this.time+.045;this.flashLight.intensity=w.id==='usp'||w.id==='m4a1'?1:5;
      const right=new THREE.Vector3(Math.cos(a.yaw),0,-Math.sin(a.yaw));this.effects.shell(origin.clone().addScaledVector(right,.22).add(new THREE.Vector3(0,-.2,0)),right);
      if(w.id==='awp')this.scoped=false;
    }
  }
  private damage(a:Pawn,amount:number,attacker:Pawn|null,head:boolean,label:string){
    if(!a.alive)return;a.health=Math.max(0,a.health-amount);if(a.id===0){this.ui.hurt();this.audio.hurt();}
    if(attacker&&attacker.team!==a.team){a.lastSeen=attacker.position.clone();a.memoryUntil=this.time+5;}
    if(a.health>0)return;
    this.drop(a);a.alive=false;a.deaths++;a.deathTime=this.time;a.velocity.set(0,0,0);a.collider.setEnabled(false);
    if(attacker&&attacker.team!==a.team){attacker.kills++;attacker.money=Math.min(RULES.maxMoney,attacker.money+(attacker.slot==='awp'?100:attacker.slot==='knife'?1500:300));}
    if(this.match.bomb.carrier===a.id){this.match.bomb.carrier=null;this.match.bomb.position=a.position.clone();}
    this.ui.kill(attacker?.name??'环境',a.name,label,attacker?.team===0,head);
    if(a.id===0){this.scoped=false;this.spectateNext();this.ui.toast('你已阵亡 · 观战队友，下一回合重新出发');}
  }
  private interact(dt:number){
    const bomb=this.match.bomb;let actor:Pawn|null=null,label='',required=0;
    if(this.match.phase!=='live'&&this.match.phase!=='planted'){this.resetInteraction();return;}
    for(const a of this.actors){
      if(!a.alive)continue;const pressed=a.id===0?this.input.down('KeyE'):a.target===null;
      if(!pressed)continue;
      const side=this.match.sides[a.team];
      if(bomb.carrier===a.id&&this.match.phase==='live'&&siteAt(a.position.x,a.position.z)&&Math.hypot(a.velocity.x,a.velocity.z)<.6){actor=a;label='正在安装炸弹';required=RULES.plant;break;}
      if(this.match.phase==='planted'&&side==='CT'&&bomb.position&&Math.hypot(a.velocity.x,a.velocity.z)<.6&&a.position.distanceTo(new THREE.Vector3().copy(bomb.position))<2.25&&this.physics.canSee(this.eye(a),new THREE.Vector3().copy(bomb.position).add(new THREE.Vector3(0,.25,0)))){actor=a;label=a.kit?'正在拆除 · 拆弹工具':'正在拆除炸弹';required=a.kit?RULES.kitDefuse:RULES.defuse;break;}
      if(this.match.phase==='live'&&side==='T'&&bomb.carrier===null&&bomb.position&&a.position.distanceTo(new THREE.Vector3().copy(bomb.position))<2){bomb.carrier=a.id;bomb.position=null;if(a.id===0)this.ui.toast('已拾取 C4');}
      if(a.id===0&&this.input.pressed.has('KeyE')){
        const drop=this.drops.find(d=>d.position.distanceTo(a.position)<2);
        if(drop){const old=a.inventory.find(w=>WEAPONS[w.id].slot===WEAPONS[drop.weapon.id].slot);if(old){const saved=a.slot;a.slot=old.id;this.drop(a);a.slot=saved;}a.inventory.push({...drop.weapon});this.setSlot(a,drop.weapon.id);this.scene.remove(drop.mesh);this.drops=this.drops.filter(d=>d!==drop);this.ui.toast(`已拾取 ${WEAPONS[drop.weapon.id].name}`);this.input.pressed.delete('KeyE');}
      }
    }
    if(!actor){this.resetInteraction();return;}
    if(this.interactionActor!==actor.id){this.interactionActor=actor.id;this.interactionTime=0;}
    this.interactionTime+=dt;this.interactionLabel=label;bomb.interaction=Math.min(1,this.interactionTime/required);bomb.interactingActor=actor.id;
    if(this.interactionTime>=required){
      if(this.match.phase==='live'){
        bomb.position=actor.position.clone();bomb.site=siteAt(actor.position.x,actor.position.z)!.name;bomb.carrier=null;bomb.plantedAt=this.time;bomb.remaining=RULES.bomb;this.match.phase='planted';actor.money=Math.min(RULES.maxMoney,actor.money+300);this.bombSelected=false;
        for(const a of this.actors){a.repathAt=0;a.lastSeen=null;}
        this.ui.toast(`炸弹已安装在 ${bomb.site} 点`);this.audio.beep(650,.4,.1);
      }else{endRound(this.match,teamForSide(this.match,'CT'),'炸弹已成功拆除',this.actors);actor.money=Math.min(RULES.maxMoney,actor.money+300);this.audio.beep(500,.5,.08);}
      this.resetInteraction();
    }
  }
  private resetInteraction(){this.interactionActor=null;this.interactionTime=0;this.match.bomb.interaction=0;this.match.bomb.interactingActor=null;}
  private throwGrenade(a:Pawn,kind:GrenadeId){if(!a.grenades[kind]||(a.id===0&&this.time<this.grenadeCooldown))return;a.grenades[kind]--;const dir=direction(a.yaw,a.pitch+.14),origin=this.eye(a).addScaledVector(dir,.5);this.effects.grenade(kind,a.id,origin,dir.multiplyScalar(13).add(a.velocity));if(a.id===0){this.selectedGrenade=null;this.grenadeCooldown=this.time+.5;}}
  private updateGrenades(dt:number){
    this.effects.grenades=this.effects.grenades.filter(g=>{
      g.life-=dt;g.velocity.y-=12*dt;const travel=g.velocity.clone().multiplyScalar(dt),length=travel.length();
      const hit=length>0?this.physics.ray(g.position,travel.clone().normalize(),length+.075):null;
      if(hit){const n=new THREE.Vector3().copy(hit.normal);g.position.addScaledVector(travel.clone().normalize(),Math.max(0,hit.timeOfImpact-.085));g.velocity.reflect(n).multiplyScalar(.46);if(g.velocity.length()<.45)g.velocity.set(0,0,0);}
      else g.position.add(travel);g.mesh.position.copy(g.position);g.mesh.rotation.x+=dt*g.velocity.length();
      if(g.life>0)return true;
      this.detonate(g);this.effects.removeGrenade(g);return false;
    });
  }
  private detonate(g:Grenade){
    if(g.kind==='smoke'){this.effects.smoke(g.position);return;}
    if(g.kind==='he'){this.effects.explode(g.position);this.audio.explosion(g.position);for(const a of this.actors){const d=this.eye(a).distanceTo(g.position);if(a.alive&&d<9&&this.physics.canSee(g.position.clone().add(new THREE.Vector3(0,.1,0)),this.eye(a)))this.damage(a,Math.max(0,100*(1-d/9)),this.actors[g.owner],false,'HE GRENADE');}}
    else {this.audio.beep(1750,.16,.15);for(const a of this.actors){if(!a.alive)continue;const eye=this.eye(a),delta=g.position.clone().sub(eye),d=delta.length();if(d<28&&this.physics.canSee(eye,g.position)){const facing=direction(a.yaw,a.pitch).dot(delta.normalize());a.flashUntil=this.time+Math.max(.2,(1-d/30)*(facing>0?4:.7));}}}
  }
  private spectateNext(){const alive=this.actors.filter(a=>a.team===0&&a.alive&&a.id!==0);const i=alive.findIndex(a=>a.id===this.spectator);if(alive.length)this.spectator=alive[(i+1)%alive.length].id;}
  private updateCamera(dt:number){
    if(!this.active){const t=this.menuTime*.035;this.camera.position.set(53+Math.sin(t)*2,14+Math.sin(t*.6)*.4,-16+Math.cos(t));this.camera.lookAt(37,5.2,-42);this.camera.fov=69;this.camera.updateProjectionMatrix();return;}
    const p=this.player.alive?this.player:(this.actors[this.spectator]?.alive?this.actors[this.spectator]:this.player);
    const eye=this.eye(p);if(!this.player.alive&&!p.alive)eye.y+=2;
    this.camera.position.copy(eye);this.camera.rotation.order='YXZ';this.camera.rotation.set(p.pitch,p.yaw,0,'YXZ');
    this.camera.fov=THREE.MathUtils.lerp(this.camera.fov,this.scoped?25:80,Math.min(1,dt*18));this.camera.updateProjectionMatrix();
    this.audio.position.copy(eye);this.audio.yaw=p.yaw;
    this.recoil=THREE.MathUtils.lerp(this.recoil,0,Math.min(1,dt*13));
    const a=this.player,model=this.currentView,moving=Math.min(1,Math.hypot(a.velocity.x,a.velocity.z)/5),bob=Math.sin(this.time*10)*moving;
    if(model){
      const ratio=a.reloadUntil?1-(a.reloadUntil-this.time)/WEAPONS[a.slot].reload:0;
      const reload=Math.sin(ratio*Math.PI),wall=this.physics.ray(this.eye(a),direction(a.yaw,a.pitch),1.3);
      model.root.position.set(.21+bob*.008-this.sway.x,-.21+Math.abs(bob)*.007-this.recoil*.6-reload*.15,-.34+this.recoil+(wall?(1.3-wall.timeOfImpact)*.15:0));
      model.root.rotation.set(this.recoil*2+reload*.3+this.sway.y,-.035+reload*.22,-.045-reload*.7);
      model.magazine.position.y=(['ak47','m4a1','awp'].includes(a.slot)?-.07:0)-Math.sin(Math.min(1,ratio*1.7)*Math.PI)*.18;
      model.bolt.position.z=-this.recoil*.3;model.muzzle.visible=this.time<this.muzzleUntil&&!a.reloadUntil;
      if(model.muzzle.visible)model.muzzle.rotation.z=Math.random()*6;
    }
    this.flashLight.intensity=this.time<this.muzzleUntil?4:0;
    const flash=Math.max(0,a.flashUntil-this.time);this.ui.flash(Math.min(1,flash/1.6));
  }
  private updateHUD(){
    const a=this.player,w=this.weapon(a),bomb=this.match.bomb;
    let prompt='';
    if(a.alive){
      if(this.match.phase==='freeze')prompt='准备阶段 · 按 B 打开装备商店';
      else if(bomb.carrier===0&&siteAt(a.position.x,a.position.z))prompt='按住 E 安装 C4';
      else if(this.match.phase==='planted'&&this.match.sides[0]==='CT'&&bomb.position&&a.position.distanceTo(new THREE.Vector3().copy(bomb.position))<2.25)prompt='按住 E 拆除炸弹';
      else if(this.drops.some(d=>d.position.distanceTo(a.position)<2))prompt='按 E 拾取武器';
      else if(bomb.carrier===null&&bomb.position&&this.match.phase==='live'&&this.match.sides[0]==='T'&&a.position.distanceTo(new THREE.Vector3().copy(bomb.position))<2)prompt='按 E 拾取 C4';
      else if(this.bombSelected)prompt='携带 C4 · 前往 A / B 包点';
      else if(this.selectedGrenade)prompt='左键投掷 · 按 1 / 2 切回武器';
    }
    this.ui.update({match:this.match,player:a,side:this.match.sides[0],actors:this.actors,radar:this.actors.map(p=>({position:p.position,team:p.team,alive:p.alive,visible:p.team===0||(this.targetSightings.get(p.id)??-999)>this.time-1,human:p.id===0,yaw:p.yaw})),position:a.position,yaw:a.yaw,weapon:w.id,ammo:w.ammo,reserve:w.reserve,location:zoneAt(a.position.x,a.position.z)?.name||'Dust II',reloading:a.reloadUntil?1-(a.reloadUntil-this.time)/WEAPONS[w.id].reload:0,interaction:bomb.interactingActor===0?bomb.interaction:0,interactionLabel:this.interactionLabel,prompt,fps:this.fps,spectating:a.alive?'':this.actors[this.spectator]?.name||'等待下一回合',scope:this.scoped,grenades:a.grenades,selectedGrenade:this.selectedGrenade});
    this.ui.scoreboard(this.actors,this.match,this.input.down('Tab')&&!this.paused);
    if(this.match.round>1||this.match.phase==='planted')this.ui.$('tutorial').classList.add('hidden');
  }
  private resize(){this.renderer.setSize(innerWidth,innerHeight);this.composer?.setSize(innerWidth,innerHeight);this.camera.aspect=this.viewCamera.aspect=innerWidth/innerHeight;this.camera.updateProjectionMatrix();this.viewCamera.updateProjectionMatrix();}
  private installDebug(){
    // Development-only harness; Vite removes this branch from production builds.
    (window as unknown as {__dust:unknown}).__dust={
      snapshot:()=>({phase:this.match.phase,round:this.match.round,score:this.match.score,remaining:this.match.remaining,bomb:this.match.bomb,paused:this.paused,active:this.active,actors:this.actors.map(a=>({id:a.id,side:this.match.sides[a.team],health:a.health,alive:a.alive,pos:a.position.toArray(),action:a.botAction,path:a.path.length,route:a.routeIndex})),drawCalls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles,fps:this.fps}),
      performance:()=>{const a=[...this.performanceSamples].sort((a,b)=>a-b);return{frames:a.length,median:a[Math.floor(a.length*.5)],p95:a[Math.floor(a.length*.95)],calls:this.renderer.info.render.calls,triangles:this.renderer.info.render.triangles};},
      teleport:(x:number,z:number)=>{const p=this.player;p.position.set(x,heightAt(x,z)+.03,z);p.body.setTranslation({x,y:p.position.y+.9,z},true);p.velocity.set(0,0,0);},
      view:(x:number,y:number,z:number,tx:number,ty:number,tz:number)=>{this.active=false;this.overlay='none';this.ui.$('menu').classList.add('hidden');this.ui.$('hud').classList.add('hidden');this.renderer.setAnimationLoop(null);this.camera.position.set(x,y,z);this.camera.lookAt(tx,ty,tz);this.camera.fov=75;this.camera.updateProjectionMatrix();this.renderer.clear();this.renderer.render(this.scene,this.camera);},
      simulate:(seconds:number)=>{const previous=this.paused;this.paused=false;for(let i=0;i<seconds*60;i++){if(this.match.phase==='finished')break;this.tick(1/60);this.effects.update(1/60);}this.paused=previous;this.updateHUD();},
      setSide:(side:Side)=>{this.settings.side=side;this.match=newMatch(side);this.prepareRound(true);},
      setPhase:(phase:'live'|'freeze')=>{this.match.phase=phase;this.match.remaining=phase==='live'?115:15;},
      damage:(id:number,amount:number)=>this.damage(this.actors[id],amount,null,false,'TEST'),
      key:(code:string,on:boolean)=>{if(on)this.input.keys.add(code);else this.input.keys.delete(code);},
      buy:(id:string)=>this.buy(id),
    };
    if(new URLSearchParams(location.search).has('qa')){
      const panel=document.createElement('div');panel.id='qa-panel';panel.style.cssText='position:fixed;left:8px;bottom:8px;z-index:120;background:#132019ee;padding:8px;border:1px solid #9b9169;max-width:450px;font:10px monospace';
      const report=document.createElement('pre');report.id='qa-report';report.style.cssText='max-height:170px;overflow:auto;color:#e6dfc8;margin:5px 0;white-space:pre-wrap';
      const debug=(window as unknown as {__dust:Record<string,(...args:any[])=>any>}).__dust;
      const update=()=>report.textContent=JSON.stringify(debug.snapshot(),null,1);
      const button=(name:string,action:()=>void)=>{const b=document.createElement('button');b.textContent=name;b.style.cssText='color:#ddd;background:#33402d;border:1px solid #657452;padding:5px;margin:2px;font:10px monospace';b.onclick=()=>{action();update();};panel.appendChild(b);};
      button('QA START',()=>{this.active=true;this.paused=true;this.overlay='none';this.match=newMatch('CT');this.prepareRound(true);this.ui.enter();});
      button('SIM 60',()=>debug.simulate(60));button('SIM 300',()=>debug.simulate(300));button('SNAPSHOT',()=>{});
      button('TEST BOMB',()=>{
        debug.setSide('T');debug.setPhase('live');for(const a of this.actors.slice(1))a.alive=false;
        this.actors[5].alive=true;this.actors[5].body.setTranslation({x:8,y:.9,z:-58},true);
        debug.teleport(43,-37);this.physics.world.step();debug.key('KeyE',true);debug.simulate(1.5);debug.key('KeyE',false);debug.simulate(.1);
        if(this.match.bomb.interaction!==0)throw new Error('Plant cancellation failed');
        debug.key('KeyE',true);debug.simulate(3.3);debug.key('KeyE',false);
        const plant=this.match.phase==='planted';
        debug.setSide('CT');debug.setPhase('live');this.match.phase='planted';this.match.bomb.position={x:43,y:4,z:-37};this.match.bomb.remaining=40;
        this.player.kit=true;debug.teleport(43,-37);this.physics.world.step();debug.key('KeyE',true);debug.simulate(5.2);debug.key('KeyE',false);
        report.dataset.bombTest=plant&&this.match.phase==='end'&&this.match.winner===0?'PASS':'FAIL';
        this.ui.toast('BOMB TEST '+report.dataset.bombTest);
      });
      button('PLAY BENCH',()=>{this.active=true;this.paused=false;this.overlay='none';this.match=newMatch('CT');this.prepareRound(true);this.ui.enter();this.match.phase='live';this.match.remaining=115;this.performanceSamples=[];});
      button('PERF',()=>{report.dataset.performance=JSON.stringify(debug.performance());this.ui.toast(report.dataset.performance);this.paused=true;});
      button('MENU',()=>this.toMenu());
      panel.appendChild(report);document.body.appendChild(panel);update();
    }
  }
}
