import type{Combatant,GrenadeId,MatchState,WeaponId}from'../game/types';
import{WEAPONS}from'../game/weapons';
import{GRENADES,GRENADE_IDS}from'../game/grenades';
import'./hud.css';
const root=`${import.meta.env.BASE_URL}assets/source2/`;
const colors=['#b9d85b','#61b8e2','#bb83d3','#dfa34d','#e8d15b'];
export function hudIcon(kind:string,label='',className=''){
 const folder=kind==='T'?'buy-menu/':'hud/';return `<img class="${className}" src="${root+folder+kind}.svg" alt="${label}" draggable="false">`;
}
function itemIcon(id:string){const folder=id in WEAPONS?'weapons/icons/':GRENADE_IDS.includes(id as GrenadeId)?'grenades/icons/':'buy-menu/';return `<img src="${root+folder+id}.svg" alt="" draggable="false">`;}
export function combatHudMarkup(){return `
 <div class="cs-bottom-shade"></div>
 <div class="cs-radar"><span id="location"></span><div class="cs-radar-disc"><canvas id="radar" width="320" height="320" aria-label="以玩家朝向为上的战术雷达"></canvas></div><span id="round-label" class="hidden"></span></div>
 <div class="cs-team-counter"><div id="team-left" class="cs-team"><div id="alive-left" class="cs-roster"></div></div><div class="cs-clock"><strong id="clock">0:03</strong><div class="cs-score"><b id="score-left">0</b><b id="score-right">0</b></div><small id="phase-label"></small><span id="bomb-state"></span></div><div id="team-right" class="cs-team"><div id="alive-right" class="cs-roster"></div></div></div>
 <div class="cs-telemetry"><span id="fps"></span></div><div id="killfeed" class="killfeed cs-killfeed"></div>
 <div class="cs-money"><span id="buy-zone-hint"><kbd>B</kbd></span><span id="money">$800</span><span id="money-change"></span></div>
 <div class="cs-healthammo"><div class="cs-health-side"><div class="cs-armor"><span id="armor-symbol">${hudIcon('armor','护甲')}</span><span id="armor">0</span></div><div class="cs-health-value"><b id="health">100</b><div class="cs-health-track"><i id="health-fill"></i></div></div></div><div class="cs-center"><div id="kill-cards" class="cs-kill-cards"></div><div id="team-medallion" class="cs-medallion">${hudIcon('CT','CT')}</div></div><div class="cs-ammo"><b id="ammo">12</b><span id="ammo-divider">/</span><span id="reserve">24</span><span id="ammo-symbol">${hudIcon('bullet_single','')}</span></div></div>
 <div class="cs-loadout"><div id="loadout-items"></div><span id="weapon-name"></span><span id="grenades-label" class="hidden"></span></div>
 <div id="controlled-bot" class="cs-controlled hidden"></div>
`;}
interface HudWidgetsState{player:Combatant;actors:Combatant[];match:MatchState;weapon:WeaponId;selectedGrenade:GrenadeId|null;grenades:Record<GrenadeId,number>;bombSelected?:boolean;roundKills?:number;controlledName?:string;spectatorId?:number;training?:boolean;spectating?:string;}
/** Stable DOM: avatars/loadout change only when their displayed state changes, not every HUD tick. */
export class CombatHUD{
 private keys=new Map<string,string>();private previousMoney:number|undefined;
 constructor(private node:(id:string)=>HTMLElement){}
 private html(id:string,key:string,html:()=>string){if(this.keys.get(id)===key)return;this.keys.set(id,key);this.node(id).innerHTML=html();}
 update(d:HudWidgetsState){
  const m=d.match,p=d.player,side=m.sides[p.team];
  for(const[key,team]of[['left',0],['right',1]]as const){
   this.node('team-'+key).dataset.side=m.sides[team];this.node('score-'+key).dataset.side=m.sides[team];
   const actors=d.actors.filter(a=>a.team===team),signature=[m.sides[team],p.id,d.spectatorId,d.spectating,...actors.map(a=>`${a.id}:${a.alive}:${team===p.team?Math.ceil(a.health):0}`)].join('/');
   this.html('alive-'+key,signature,()=>actors.map(a=>`<div class="cs-avatar ${a.alive?'':'dead'} ${a.id===p.id&&!d.spectating?'self':''} ${a.id===d.spectatorId&&!!d.spectating?'observing':''}" style="--player-color:${team===p.team?colors[a.id%5]:'var(--team-color)'}" title="${a.name}"><span class="cs-avatar-color"></span>${d.spectating&&team===p.team?`<kbd>${a.id%5+1}</kbd>`:''}${hudIcon(a.alive?'bot':'skull',a.name)}<span class="cs-avatar-name">${a.name}</span>${team===p.team?`<i style="width:${a.health}%"></i>`:''}</div>`).join(''));
  }
  this.html('team-medallion',side,()=>hudIcon(side,side));
  this.html('armor-symbol',String(p.helmet),()=>hudIcon(p.helmet?'armor_helmet':'armor','护甲'));this.node('armor-symbol').parentElement!.classList.toggle('empty',p.armor<=0);
  this.node('health').classList.toggle('low',p.health<=25);this.node('health-fill').classList.toggle('low',p.health<=25);
  const fireMode=WEAPONS[d.weapon].automatic?'bullet_auto':'bullet_single';this.html('ammo-symbol',fireMode,()=>hudIcon(fireMode,''));
  this.node('ammo-symbol').classList.toggle('hidden',!!d.bombSelected||!!d.selectedGrenade||d.weapon==='knife');this.node('ammo-divider').classList.toggle('hidden',!!d.bombSelected||!!d.selectedGrenade||d.weapon==='knife');
  this.node('buy-zone-hint').classList.toggle('hidden',m.phase!=='freeze'||!p.alive);
  if(this.previousMoney!==undefined&&p.money!==this.previousMoney){const diff=p.money-this.previousMoney,el=this.node('money-change');el.textContent=`${diff>0?'+':'−'}$${Math.abs(diff)}`;el.className=diff>0?'gain':'loss';el.animate([{opacity:1,transform:'translateY(0)'},{opacity:0,transform:'translateY(-20px)'}],{duration:2200,fill:'forwards'});}this.previousMoney=p.money;
  const items=[...p.inventory].sort((a,b)=>WEAPONS[a.id].slot-WEAPONS[b.id].slot),bomb=m.bomb.carrier===p.id;
  const key=[...items.map(w=>w.id),...GRENADE_IDS.map(id=>d.grenades[id]),d.weapon,d.selectedGrenade,bomb,d.bombSelected].join('/');
  this.html('loadout-items',key,()=>items.map(w=>`<div class="cs-loadout-row ${!d.selectedGrenade&&!d.bombSelected&&d.weapon===w.id?'selected':''}">${itemIcon(w.id)}<kbd>${WEAPONS[w.id].slot}</kbd></div>`).join('')+`<div class="cs-utility-row">${GRENADE_IDS.filter(id=>d.grenades[id]>0).map(id=>`<span class="${id===d.selectedGrenade?'selected':''}" title="${GRENADES[id].name}">${itemIcon(id)}${d.grenades[id]>1?`<small>${d.grenades[id]}</small>`:''}</span>`).join('')}<kbd>4</kbd></div>`+(bomb?`<div class="cs-loadout-row bomb ${d.bombSelected?'selected':''}">${itemIcon('c4')}<kbd>5</kbd></div>`:''));
  const kills=Math.min(5,d.roundKills??0);this.html('kill-cards',`${m.round}/${kills}`,()=>Array.from({length:kills},(_,i)=>`<span>${hudIcon('kill_'+(i+1),'')}${hudIcon('kill_pip_default','','pip')}</span>`).join(''));
  const controlled=this.node('controlled-bot');controlled.classList.toggle('hidden',!d.controlledName);controlled.textContent=d.controlledName?`正在控制 ${d.controlledName}`:'';
 }
}
