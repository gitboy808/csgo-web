import type {Combatant,GrenadeId,MatchState,Side,WeaponId,WeaponState} from './types';
import {WEAPONS,createWeapon} from './weapons';
import {GRENADES,GRENADE_IDS,canPurchaseGrenade,grenadeCount} from './grenades';
import {canBuy,equipmentPrice,purchase,RULES,type EquipmentId} from './rules';

export type BuyId=Exclude<WeaponId,'knife'>|GrenadeId|EquipmentId;
export type Buyer=Combatant&{grenades:Record<GrenadeId,number>;grenadePurchases:Record<GrenadeId,number>};
export interface BuyQuote {price:number;owned:number;enabled:boolean;reason:string}
export const isGrenade=(id:string):id is GrenadeId=>GRENADE_IDS.includes(id as GrenadeId);
export const isBuyId=(id:string):id is BuyId=>isGrenade(id)||['armor','helmet','kit'].includes(id)||(Object.hasOwn(WEAPONS,id)&&id!=='knife');
export function buyQuote(p:Buyer,side:Side,id:BuyId,donate=false):BuyQuote{
  let price:number,owned:number,reason='';
  if(isGrenade(id)){
    const d=GRENADES[id];price=d.price;owned=p.grenades[id];
    if(d.side&&d.side!==side)reason='当前阵营不可购买';
    else if(!canPurchaseGrenade(id,side,p.grenades,Infinity,p.grenadePurchases))reason=owned>=d.limit?'已达到携带上限':grenadeCount(p.grenadePurchases)>=4?'本回合购买数量已满':'投掷物配额已满';
  }else if(id==='armor'||id==='helmet'||id==='kit'){
    price=equipmentPrice(p,id);owned=id==='armor'?Number(p.armor===100):id==='helmet'?Number(p.armor===100&&p.helmet):Number(p.kit);
    if(id==='kit'&&side!=='CT')reason='仅反恐精英可购买';else if(owned)reason='已装备';
  }else{
    const w=WEAPONS[id];price=w.price;owned=Number(p.inventory.some(item=>item.id===id));
    if(w.side&&w.side!==side)reason='当前阵营不可购买';else if(owned&&!donate)reason='已装备';
  }
  if(!reason&&p.money<price)reason='资金不足';
  return {price,owned,enabled:!reason,reason};
}
export function nextRoundMinimum(m:MatchState,p:Combatant){return Math.min(RULES.maxMoney,p.money+Math.min(3400,1400+m.lossStreak[p.team]*500));}
type Gear={armor:number;helmet:boolean;kit:boolean};
const gear=(p:Combatant):Gear=>({armor:p.armor,helmet:p.helmet,kit:p.kit});
type Receipt={id:BuyId;paid:number}&(
  {kind:'weapon';weapon:WeaponState;ammo:number;reserve:number;replaced:WeaponState[]}
  |{kind:'grenade';grenade:GrenadeId;after:number}
  |{kind:'gear';before:Gear;after:Gear}
);

/** Receipts belong to one player/round; carried, used or dropped weapons are never credited. */
export class BuySession{
  private receipts:Receipt[]=[];private match:MatchState|null=null;private round=0;private actor=-1;
  private previous:BuyId[]=[];private roundPlan:BuyId[]=[];
  private loadout(p:Buyer):BuyId[]{return[
    ...p.inventory.filter(w=>w.id!=='knife').map(w=>w.id as BuyId),
    ...(p.armor?[p.helmet?'helmet' as const:'armor' as const]:[]),...(p.kit?['kit' as const]:[]),
    ...GRENADE_IDS.flatMap(id=>Array.from({length:p.grenades[id]},()=>id)),
  ];}
  beginRound(m:MatchState,p:Buyer,reset=false){
    if(!reset&&this.match===m&&this.round===m.round&&this.actor===p.id)return;
    this.previous=reset||this.match!==m?[]:this.roundPlan.length?[...this.roundPlan]:this.loadout(p);
    this.roundPlan=[...this.previous];
    this.match=m;this.round=m.round;this.actor=p.id;this.receipts=[];
  }
  get canRebuy(){return this.previous.length>0;}
  donate(m:MatchState,p:Buyer,id:Exclude<WeaponId,'knife'>,inZone:boolean){
    this.beginRound(m,p);if(!canBuy(m,p,inZone)||!buyQuote(p,m.sides[p.team],id,true).enabled)return null;
    p.money-=WEAPONS[id].price;return createWeapon(id);
  }
  buy(m:MatchState,p:Buyer,id:BuyId,inZone:boolean){
    this.beginRound(m,p);
    if(!canBuy(m,p,inZone))return false;
    const quote=buyQuote(p,m.sides[p.team],id);if(!quote.enabled)return false;
    if(isGrenade(id)){
      p.money-=quote.price;p.grenades[id]++;p.grenadePurchases[id]++;
      this.receipts.push({id,paid:quote.price,kind:'grenade',grenade:id,after:p.grenades[id]});
    }else if(id==='armor'||id==='helmet'||id==='kit'){
      const before=gear(p);if(!purchase(m,p,id,inZone))return false;
      this.receipts.push({id,paid:quote.price,kind:'gear',before,after:gear(p)});
    }else{
      const replaced=p.inventory.filter(w=>WEAPONS[w.id].slot===WEAPONS[id].slot);
      if(!purchase(m,p,id,inZone))return false;
      const weapon=p.inventory.find(w=>w.id===id)!;
      this.receipts.push({id,paid:quote.price,kind:'weapon',weapon,ammo:weapon.ammo,reserve:weapon.reserve,replaced});
    }
    this.roundPlan=this.loadout(p);return true;
  }
  private eligible(r:Receipt,p:Buyer){
    if(r.kind==='weapon')return p.inventory.includes(r.weapon)&&r.weapon.ammo===r.ammo&&r.weapon.reserve===r.reserve;
    if(r.kind==='grenade')return p.grenades[r.grenade]>=r.after&&p.grenadePurchases[r.grenade]>0;
    return r.id==='kit'?p.kit===r.after.kit:p.armor===r.after.armor&&p.helmet===r.after.helmet;
  }
  refunds(m:MatchState,p:Buyer,inZone:boolean){
    const result:Partial<Record<BuyId,number>>={};
    if(this.match!==m||this.round!==m.round||this.actor!==p.id||!canBuy(m,p,inZone))return result;
    for(const r of this.receipts)if(this.eligible(r,p))result[r.id]=r.paid;
    return result;
  }
  refund(m:MatchState,p:Buyer,id:BuyId,inZone:boolean){
    if(!this.refunds(m,p,inZone)[id])return false;
    let index=this.receipts.length-1;while(index>=0&&(this.receipts[index].id!==id||!this.eligible(this.receipts[index],p)))index--;
    const r=this.receipts[index];if(!r)return false;
    if(r.kind==='weapon'){p.inventory=p.inventory.filter(w=>w!==r.weapon);p.inventory.push(...r.replaced);}
    else if(r.kind==='grenade'){p.grenades[r.grenade]--;p.grenadePurchases[r.grenade]--;}
    else if(r.id==='kit')p.kit=r.before.kit;
    else {p.armor=r.before.armor;p.helmet=r.before.helmet;}
    p.money=Math.min(RULES.maxMoney,p.money+r.paid);this.receipts.splice(index,1);this.roundPlan=this.loadout(p);return true;
  }
  refundAll(m:MatchState,p:Buyer,inZone:boolean){let count=0;for(const r of [...this.receipts].reverse())if(this.refund(m,p,r.id,inZone))count++;return count;}
  autoBuy(m:MatchState,p:Buyer,inZone:boolean){
    const side=m.sides[p.team],plan:BuyId[]=[side==='CT'?'m4a1':'ak47','helmet','armor',...(side==='CT'?['kit' as const]:[]),'smoke','flash','he'];
    return plan.reduce((count,id)=>count+Number(this.buy(m,p,id,inZone)),0);
  }
  rebuy(m:MatchState,p:Buyer,inZone:boolean){
    const desired=new Map<BuyId,number>();for(const id of this.previous)desired.set(id,(desired.get(id)??0)+1);
    let count=0;for(const [id,total]of desired){const held=isGrenade(id)?p.grenades[id]:0;for(let i=held;i<total;i++)count+=Number(this.buy(m,p,id,inZone));}return count;
  }
}
