import {buyQuote,isBuyId,isGrenade,nextRoundMinimum,type BuyId,type Buyer} from '../game/buying';
import {GRENADES,grenadeCount} from '../game/grenades';
import {WEAPONS} from '../game/weapons';
import type {MatchState,Side,WeaponId,GrenadeId} from '../game/types';
import './buy-menu.css';

export interface BuyMenuState{
  player:Buyer;match:MatchState;weapon:WeaponId;
  refunds:Partial<Record<BuyId,number>>;canRebuy:boolean;
  team:{name:string;items:string[]}[];
  drops:{key:string;item:WeaponId|GrenadeId|'c4'}[];
}
export interface BuyMenuActions{
  buy:(id:BuyId,donate:boolean)=>void;refund:(id:BuyId)=>void;refundAll:()=>void;
  autoBuy:()=>void;rebuy:()=>void;pickup:(key:string)=>void;close:()=>void;
  portrait:(side:Side,weapon:WeaponId,kit:boolean,item:BuyId)=>HTMLCanvasElement|Promise<HTMLCanvasElement>;
}
const descriptions:Partial<Record<BuyId,string>>={
  ak47:'强大又可靠。近距离内控制良好的短点射极为致命。',m4a1:'配备消音器的突击步枪，后坐力较小，适合精准射击。',awp:'高风险，高回报。标志性的枪声，一枪制敌。',
  usp:'配备消音器的半自动手枪，适合沉着、精准的点射。',glock:'适合近距离作战的先发手枪，可切换三连发模式。',deagle:'威力强大的经典手枪，远距离也能保持精准。',
  armor:'保护身体，减少子弹和爆炸带来的伤害。',helmet:'保护身体和头部。已有完整防弹衣时，仅需补购头盔。',kit:'加快拆除炸弹的进度，将拆除时间缩短至 5 秒。',
  he:'高爆炸伤害武器，用于打击掩体后的敌人。',flash:'制造强烈噪音与致盲闪光，为突破创造机会。',smoke:'形成烟幕，为转移和战术行动提供临时掩护。',molotov:'碎裂后释放火焰，暂时封锁敌人的行进路线。',incendiary:'展开一片持续燃烧的区域，阻止敌人推进。',decoy:'模仿枪械开火声，干扰敌人对位置的判断。',
};
const equipment:Record<string,string>={armor:'防弹衣',helmet:'防弹衣 + 头盔',kit:'拆弹器'};
const amounts=new Intl.NumberFormat('en-US');
const money=(value:number)=>'$'+amounts.format(value);
const escape=(text:string)=>text.replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]!));
function buyLabel(id:BuyId|WeaponId|'c4'){return id==='c4'?'C4 炸弹':equipment[id]??(isGrenade(id)?GRENADES[id].name:WEAPONS[id as WeaponId].name);}
function buyIcon(id:BuyId|WeaponId|'c4'){const folder=Object.hasOwn(WEAPONS,id)?'weapons/icons':isGrenade(id)?'grenades/icons':'buy-menu';return `${import.meta.env.BASE_URL}assets/source2/${folder}/${id}.svg`;}
function buyColumns(side:Side):(BuyId|null)[][]{return[
  ['armor','helmet',side==='CT'?'kit':null,null,null],
  [side==='CT'?'usp':'glock','deagle',null,null,null],
  [null,null,null,null,null],
  [side==='CT'?'m4a1':'ak47','awp',null,null,null],
  ['flash','smoke','he',side==='CT'?'incendiary':'molotov','decoy'],
];}

/** Persistent DOM: buying updates only prices, states and pips; previews are cached stills. */
export class BuyMenu{
  readonly root=document.createElement('section');
  private state:BuyMenuState;private side:Side;private selected:BuyId;private category=-1;private donating=false;
  private cells=new Map<BuyId,HTMLElement>();private timeout=0;private portraitKey='';private generation=0;private dead=false;
  private donationEvent:{id:BuyId;time:number;type:string}|null=null;
  private name!:HTMLElement;private description!:HTMLElement;private status!:HTMLElement;private portrait!:HTMLCanvasElement;
  constructor(host:HTMLElement,state:BuyMenuState,private actions:BuyMenuActions){
    this.state=state;this.side=state.match.sides[state.player.team];this.selected=isBuyId(state.weapon)?state.weapon:'armor';
    this.root.className='buy-menu';this.root.dataset.side=this.side;this.root.style.setProperty('--refund-icon',`url('${import.meta.env.BASE_URL}assets/source2/buy-menu/refund.svg')`);this.root.setAttribute('role','dialog');this.root.setAttribute('aria-modal','true');this.root.setAttribute('aria-label','购买菜单');
    this.root.innerHTML=`<div class="buy-scene-shade"></div><div class="buy-team-title"><span class="buy-team-logo" style="--icon:url('${import.meta.env.BASE_URL}assets/source2/buy-menu/${this.side}.svg')"></span><span>${this.side==='CT'?'反恐精英':'恐怖分子'}</span></div><div class="buy-layout"><div class="buy-left"><header class="buy-info"><strong data-money></strong><div>剩余购买时间 <b data-time></b></div><span>下回合最低金额：<b data-minimum></b></span></header><div class="buy-grid">${buyColumns(this.side).map((items,col)=>`<section class="buy-column" data-column="${col}"><h2><kbd>${col+1}</kbd>${['装备','手枪','中型武器','步枪','投掷物'][col]}</h2><div class="buy-column-items">${Array.from({length:5},(_,row)=>{const id=items[row];return id?`<div class="buy-cell" data-item="${id}"><button class="buy-card" data-buy="${id}"><span class="buy-key">${row+1}</span><span class="buy-item-name">${buyLabel(id)}</span><span class="buy-item-icon" style="--icon:url('${buyIcon(id)}')"></span><span class="buy-count"></span><span class="buy-item-price"></span><span class="buy-team-pips" aria-hidden="true"></span></button><button class="buy-refund" data-refund="${id}" aria-label="退还${buyLabel(id)}" hidden>↶</button></div>`:`<div class="buy-cell empty-cell" aria-label="未装备的栏位"><span class="buy-key">${row+1}</span><span>—</span><small>未装备</small></div>`;}).join('')}</div></section>`).join('')}</div><section class="buy-ground"><div class="buy-ground-label">地面武器</div><div class="buy-ground-items" data-ground></div></section><div class="buy-team-loadout" data-team></div></div><aside class="buy-right"><div class="buy-portrait-stage"><div class="buy-portrait-halo"></div><canvas class="buy-portrait" width="640" height="864" role="img" aria-label="${this.side==='CT'?'SAS':'Phoenix'} 装备预览"></canvas><div class="buy-portrait-shadow"></div></div><div class="buy-item-info"><h3 data-name></h3><p data-description></p><div data-status></div></div><div class="buy-carried" data-carried></div></aside></div><footer class="buy-navbar"><span class="buy-donate-hint">按住 <kbd>Ctrl</kbd> 购买并投掷</span><div class="buy-footer-actions"><button data-action="rebuy"><kbd>F4</kbd> 再次购买先前物品</button><button data-action="auto"><kbd>F3</kbd> 自动购买</button><button data-action="refund-all">↶ 全部退款</button><button data-action="close"><kbd>Esc</kbd> 返回</button></div></footer><div class="buy-feedback" role="status" aria-live="polite"></div>`;
    host.replaceChildren(this.root);
    for(const cell of this.root.querySelectorAll<HTMLElement>('[data-item]'))this.cells.set(cell.dataset.item as BuyId,cell);
    this.name=this.node('[data-name]');this.description=this.node('[data-description]');this.status=this.node('[data-status]');this.portrait=this.node<HTMLCanvasElement>('.buy-portrait');
    this.root.addEventListener('click',this.click);this.root.addEventListener('contextmenu',this.context);this.root.addEventListener('pointerover',this.hover);this.root.addEventListener('focusin',this.hover);window.addEventListener('keydown',this.key);window.addEventListener('keyup',this.keyup);window.addEventListener('blur',this.clearModifiers);window.addEventListener('resize',this.resize);
    this.update(state);this.cells.get(this.selected)?.querySelector<HTMLButtonElement>('.buy-card')?.focus({preventScroll:true});
  }
  private node<T extends HTMLElement=HTMLElement>(selector:string){return this.root.querySelector<T>(selector)!;}
  private setText(selector:string,value:string){const node=this.node(selector);if(node.textContent!==value)node.textContent=value;}
  update(state:BuyMenuState){
    this.state=state;this.setText('[data-money]',money(state.player.money));
    const seconds=Math.max(0,Math.ceil(state.match.remaining));this.setText('[data-time]',`${Math.floor(seconds/60)}:${String(seconds%60).padStart(2,'0')}`);this.setText('[data-minimum]',money(nextRoundMinimum(state.match,state.player)));
    for(const [id,cell]of this.cells){const quote=buyQuote(state.player,this.side,id,this.donating),button=cell.querySelector<HTMLButtonElement>('[data-buy]')!;
      cell.classList.toggle('cannot-buy',!quote.enabled);cell.classList.toggle('owned',quote.owned>0);cell.classList.toggle('refundable',!!state.refunds[id]);
      button.setAttribute('aria-disabled',String(!quote.enabled));button.setAttribute('aria-label',`购买 ${buyLabel(id)}，${money(quote.price)}${quote.reason?'，'+quote.reason:''}`);
      cell.querySelector('.buy-item-price')!.textContent=money(quote.price);cell.querySelector('.buy-count')!.textContent=quote.owned?isGrenade(id)?`${quote.owned} / ${GRENADES[id].limit}`:'✓':'';
      const refund=cell.querySelector<HTMLButtonElement>('[data-refund]')!;refund.hidden=!state.refunds[id];refund.title=state.refunds[id]?`退款 ${money(state.refunds[id]!)}`:'';
      const pips=state.team.map(member=>`<i class="${member.items.includes(id)?'has-item':''}" title="${escape(member.name)}"></i>`).join(''),pipRoot=cell.querySelector('.buy-team-pips')!;if(pipRoot.innerHTML!==pips)pipRoot.innerHTML=pips;
    }
    this.node<HTMLButtonElement>('[data-action="rebuy"]').disabled=!state.canRebuy;this.node<HTMLButtonElement>('[data-action="refund-all"]').disabled=!Object.keys(state.refunds).length;
    const floor=state.drops.map(drop=>`<button data-pickup="${escape(drop.key)}" aria-label="拾取 ${buyLabel(drop.item)}"><span style="--icon:url('${buyIcon(drop.item)}')"></span>${buyLabel(drop.item)}</button>`).join('');if(this.node('[data-ground]').innerHTML!==floor)this.node('[data-ground]').innerHTML=floor;
    const members=state.team.map(member=>`<span><i></i>${escape(member.name)}</span>`).join('');if(this.node('[data-team]').innerHTML!==members)this.node('[data-team]').innerHTML=members;
    this.setText('[data-carried]',`${state.player.armor} 护甲${state.player.helmet?' · 头盔':''}${state.player.kit?' · 拆弹器':''}　${grenadeCount(state.player.grenades)} / 4 投掷物`);
    this.select(this.selected);this.root.dataset.updates=String(Number(this.root.dataset.updates??0)+1);
  }
  feedback(message:string){this.setText('.buy-feedback',message);}
  private select(id:BuyId){
    this.selected=id;for(const [item,cell]of this.cells)cell.classList.toggle('selected',item===id);
    this.name.textContent=buyLabel(id);this.description.textContent=descriptions[id]??'';const quote=buyQuote(this.state.player,this.side,id,this.donating);
    this.status.textContent=quote.reason||(isGrenade(id)?'点击购买 · 最多携带 4 枚投掷物':'点击购买');this.status.classList.toggle('unavailable',!quote.enabled&&!quote.owned);
    if(innerWidth<=760){clearTimeout(this.timeout);this.generation++;this.portraitKey='';this.root.dataset.previewState='hidden';return;}
    const weapon=Object.hasOwn(WEAPONS,id)?id as WeaponId:this.state.weapon,key=`${this.side}:${isGrenade(id)?id:weapon}:${this.state.player.kit}`;
    if(key===this.portraitKey)return;this.portraitKey=key;clearTimeout(this.timeout);const generation=++this.generation;this.root.dataset.previewState='loading';
    this.timeout=window.setTimeout(()=>{if(this.dead)return;Promise.resolve(this.actions.portrait(this.side,weapon,this.state.player.kit,id)).then(frame=>{if(this.dead||generation!==this.generation)return;const context=this.portrait.getContext('2d')!;context.clearRect(0,0,this.portrait.width,this.portrait.height);context.drawImage(frame,0,0);this.portrait.classList.add('ready');this.root.dataset.previewState='ready';this.root.dataset.previewKey=key;}).catch(()=>{if(this.dead||generation!==this.generation)return;this.portrait.classList.remove('ready');this.root.dataset.previewState='error';});},90);
  }
  private hover=(event:Event)=>{const cell=(event.target as Element).closest<HTMLElement>('[data-item]');if(cell?.dataset.item&&isBuyId(cell.dataset.item)&&this.selected!==cell.dataset.item)this.select(cell.dataset.item);};
  private click=(event:MouseEvent)=>{
    const target=(event.target as Element).closest<HTMLElement>('button');if(!target)return;
    if(target.dataset.refund&&isBuyId(target.dataset.refund)){this.actions.refund(target.dataset.refund);return;}
    if(target.dataset.buy&&isBuyId(target.dataset.buy)){
      const id=target.dataset.buy,quote=buyQuote(this.state.player,this.side,id,event.ctrlKey);
      if(event.ctrlKey){event.preventDefault();const last=this.donationEvent;if(last?.id===id&&last.type!==event.type&&Math.abs(last.time-event.timeStamp)<100)return;this.donationEvent={id,time:event.timeStamp,type:event.type};}
      if(quote.enabled)this.actions.buy(id,event.ctrlKey);else this.feedback(quote.reason);return;
    }
    if(target.dataset.pickup!==undefined){this.actions.pickup(target.dataset.pickup);return;}
    const action=target.dataset.action;if(action==='close')this.actions.close();else if(action==='auto')this.actions.autoBuy();else if(action==='rebuy')this.actions.rebuy();else if(action==='refund-all')this.actions.refundAll();
  };
  // macOS maps Control-click to contextmenu instead of click.
  private context=(event:MouseEvent)=>{event.preventDefault();if(event.ctrlKey)this.click(event);};
  private key=(event:KeyboardEvent)=>{
    if(this.dead||event.repeat)return;
    if(event.code==='Tab'){const buttons=[...this.root.querySelectorAll<HTMLButtonElement>('button:not([disabled]):not([hidden])')],first=buttons[0],last=buttons.at(-1);if(event.shiftKey&&document.activeElement===first){event.preventDefault();last?.focus();}else if(!event.shiftKey&&document.activeElement===last){event.preventDefault();first?.focus();}return;}
    if(event.code==='ControlLeft'||event.code==='ControlRight'){this.donating=true;this.root.classList.add('donating');this.update(this.state);return;}
    if(event.code==='F3'||event.code==='F4'){event.preventDefault();event.code==='F3'?this.actions.autoBuy():this.actions.rebuy();return;}
    if(!/^Digit[1-5]$/.test(event.code))return;event.preventDefault();const index=Number(event.code.at(-1))-1;
    if(this.category<0){this.category=index;for(const col of this.root.querySelectorAll<HTMLElement>('[data-column]'))col.classList.toggle('key-selected',Number(col.dataset.column)===index);}
    else{const id=buyColumns(this.side)[this.category][index];this.category=-1;for(const col of this.root.querySelectorAll('.key-selected'))col.classList.remove('key-selected');if(id){this.select(id);if(buyQuote(this.state.player,this.side,id,event.ctrlKey).enabled)this.actions.buy(id,event.ctrlKey);else this.feedback(buyQuote(this.state.player,this.side,id,event.ctrlKey).reason);}}
  };
  private clearModifiers=()=>{if(this.dead||!this.donating)return;this.donating=false;this.root.classList.remove('donating');this.update(this.state);};
  private keyup=(event:KeyboardEvent)=>{if(!event.ctrlKey)this.clearModifiers();};
  private resize=()=>{if(!this.dead)this.select(this.selected);};
  dispose(){this.dead=true;this.generation++;clearTimeout(this.timeout);window.removeEventListener('keydown',this.key);window.removeEventListener('keyup',this.keyup);window.removeEventListener('blur',this.clearModifiers);window.removeEventListener('resize',this.resize);this.root.removeEventListener('click',this.click);this.root.removeEventListener('contextmenu',this.context);this.root.removeEventListener('pointerover',this.hover);this.root.removeEventListener('focusin',this.hover);}
}
