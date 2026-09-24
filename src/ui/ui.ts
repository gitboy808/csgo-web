import type { Combatant, GrenadeId, MatchState, Settings, Side, Vec3, WeaponId } from '../game/types';
import { WEAPONS } from '../game/weapons';
import { MAP } from '../world/map';

export const DEFAULT_SETTINGS:Settings={sensitivity:1,volume:.65,quality:'high',crosshair:'classic',difficulty:'normal',side:'CT'};
export function readSettings():Settings { try{return {...DEFAULT_SETTINGS,...JSON.parse(localStorage.getItem('dust-ii-settings')||'{}')};}catch{return {...DEFAULT_SETTINGS};} }
const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const mark='<span class="brand-mark"><i></i><i></i></span>';
export interface RadarActor { position:Vec3;team:number;alive:boolean;visible:boolean;human:boolean;yaw:number }
export interface HUDData {
  match:MatchState;player:Combatant;side:Side;actors:Combatant[];radar:RadarActor[];
  position:Vec3;yaw:number;weapon:WeaponId;ammo:number;reserve:number;location:string;
  reloading:number;interaction:number;interactionLabel:string;prompt:string;fps:number;
  spectating:string;scope:boolean;grenades:Record<GrenadeId,number>;selectedGrenade:GrenadeId|null;
}
export interface UICallbacks {
  start:()=>void;resume:()=>void;menu:()=>void;restart:()=>void;buy:(id:string)=>void;
  settings:(settings:Settings)=>void;openSettings:()=>void;closeOverlay:()=>void;
}
export class UI {
  private app=document.querySelector<HTMLDivElement>('#app')!;
  private nodes=new Map<string,HTMLElement>();
  private toastTimer=0;
  private hitTimer=0;
  private radar:CanvasRenderingContext2D;
  private atlas:HTMLCanvasElement;
  settings:Settings;
  callbacks!:UICallbacks;
  ready=false;
  constructor(settings:Settings) {
    this.settings=settings;
    this.app.innerHTML=`
      <div id="loading" class="loading-screen"><div class="loading-word">${mark}<span>DUST II</span></div><div class="loading-bottom"><span id="load-label">正在建立战场</span><span id="load-percent">00%</span><div class="load-track"><i id="load-fill"></i></div></div></div>
      <main id="menu" class="menu hidden">
        <header class="menu-header"><a class="brand" href="#" aria-label="Dust II 首页">${mark}<span>DUST II<span class="brand-small">TACTICAL OPERATIONS</span></span></a><nav><button class="nav-link active" id="nav-play">行动</button><button class="nav-link" id="nav-intel">战场档案</button><button class="nav-link" id="nav-settings">设置 <span>↗</span></button></nav><div class="status"><i></i>本地战术演练<span>BUILD 01.00</span></div></header>
        <div class="menu-body"><div class="eyebrow"><span class="tiny-rule"></span>经典战场 · 全新行动<span class="edition">VOL. 01</span></div><h1>DUST<span class="title-two">II</span><span class="title-dot">.</span></h1><div class="title-sub"><span>回到尘土之中。</span><span class="coordinate">34°02′ N &nbsp; 06°50′ W</span></div><p class="intro">熟悉的街巷。未知的下一秒。<br>集结小队，在沙尘与枪声中夺下每一个关键点位。</p><div class="operation"><div><span class="operation-label">当前行动</span><h2>经典爆破 <span>5 <b>VS</b> 5</span></h2></div><span class="operation-tag">单人 · AI 小队</span></div><button id="start" class="primary-button"><span><small>DEPLOY TO DUST II</small>进入战场</span>${arrow}</button><div class="launch-note"><span class="keycap">↵</span>准备好后，即刻出发<span class="launch-sep">/</span>键鼠操作</div></div>
        <aside class="field-label"><span class="field-cross">+</span><div>AL SAHRA, NORTH AFRICA<small>干燥气候 / 晴 / 34°C</small></div><span class="field-cross">+</span></aside>
        <aside class="map-card"><div class="card-top"><span>战术概览</span><span>D–02 <i>↗</i></span></div><canvas id="menu-map" width="300" height="230" aria-label="Dust II 战术地图"></canvas><div class="card-bottom"><span><i class="legend-dot gold"></i>进攻方</span><span><i class="legend-dot blue"></i>防守方</span><span>2 个目标点</span></div></aside>
        <footer class="menu-footer"><div class="footer-cell"><span class="footer-index">01</span><div><small>THE OBJECTIVE</small><strong>突破。控制。引爆。</strong></div></div><div class="footer-cell"><span class="footer-index">02</span><div><small>MATCH FORMAT</small><strong>先胜 13 回合 · 半场换边</strong></div></div><div class="footer-cell footer-last"><span class="footer-index">03</span><div><small>BUILT FOR THE BROWSER</small><strong>真实 3D 场景 · 即开即玩</strong></div><span class="footer-cross">✳</span></div></footer>
        <div class="attribution">独立致敬作品 · 非 Valve 官方游戏 <span>POWERED BY WEBGL</span></div>
      </main>
      <section id="hud" class="hud hidden" aria-label="游戏状态">
        <div class="radar-wrap"><span id="location">CT 出生点</span><canvas id="radar" width="280" height="280"></canvas><div class="radar-legend"><span id="round-label">ROUND 01</span><span>DUST II</span></div></div>
        <div class="match-top"><div id="team-left" class="team-block blue"><span>CT</span><b id="score-left">0</b><div id="alive-left"></div></div><div class="round-clock"><small id="phase-label">准备阶段</small><strong id="clock">0:15</strong><span id="bomb-state"></span></div><div id="team-right" class="team-block gold"><span>T</span><b id="score-right">0</b><div id="alive-right"></div></div></div>
        <div class="hud-top-right"><span id="fps">60 FPS</span><span>本地对局</span></div><div id="killfeed" class="killfeed"></div>
        <div id="crosshair" class="crosshair"><i></i><i></i><i></i><i></i></div><div id="hit-marker" class="hit-marker hidden">×</div><div id="scope" class="scope hidden"><div></div></div>
        <div id="damage-vignette" class="damage-vignette"></div><div id="flash" class="flash-overlay"></div>
        <div id="round-result" class="round-result hidden"><small id="result-side"></small><h2 id="result-title"></h2><p id="result-reason"></p></div>
        <div class="hud-bottom"><div class="vitals"><span class="health-icon">+</span><b id="health">100</b><div class="health-track"><i id="health-fill"></i></div><span class="armor-icon">◇</span><b id="armor">0</b></div><div class="hud-location"><span class="compass">N &nbsp; · &nbsp; E &nbsp; · &nbsp; S &nbsp; · &nbsp; W</span><span id="money">$800</span></div><div class="ammo-wrap"><span id="weapon-name">USP-S</span><div><b id="ammo">12</b><span>/</span><span id="reserve">24</span></div></div></div>
        <div id="weapons-hint" class="weapons-hint"><span>1 主武器</span><span>2 手枪</span><span>3 匕首</span><span id="grenades-label">4 手雷</span><span>5 炸弹</span></div>
        <div id="interaction" class="interaction hidden"><span id="interaction-label"></span><div><i id="interaction-fill"></i></div></div><div id="context-prompt" class="context-prompt"></div>
        <div id="spectating" class="spectating hidden"></div><div id="tutorial" class="tutorial"><span><kbd>W A S D</kbd> 移动</span><span><kbd>鼠标</kbd> 瞄准 / 射击</span><span><kbd>B</kbd> 买枪</span><span><kbd>E</kbd> 安装 / 拆弹 / 拾取</span><span><kbd>ESC</kbd> 暂停</span></div>
      </section>
      <div id="overlay" class="overlay hidden"></div><div id="scoreboard" class="scoreboard hidden"></div><div id="toast" class="toast hidden"></div>
    `;
    this.radar=(this.$('radar')as HTMLCanvasElement).getContext('2d')!;
    this.atlas=this.drawAtlas();this.drawMenuMap();
    this.$('start').onclick=()=>this.callbacks.start();
    this.$('nav-settings').onclick=()=>this.callbacks.openSettings();
    this.$('nav-intel').onclick=()=>this.intel();
    this.$('nav-play').onclick=()=>this.$('start').focus();
    document.querySelector('.brand')!.addEventListener('click',e=>e.preventDefault());
  }
  $(id:string){let n=this.nodes.get(id);if(!n){n=document.getElementById(id)!;this.nodes.set(id,n);}return n;}
  private text(id:string,value:string){const node=this.$(id);if(node.textContent!==value)node.textContent=value;}
  loading(fraction:number,label:string){this.text('load-label',label);this.text('load-percent',String(Math.round(fraction*100)).padStart(2,'0')+'%');this.$('load-fill').style.width=`${fraction*100}%`;}
  loaded(){this.ready=true;this.$('loading').classList.add('fade-out');setTimeout(()=>this.$('loading').classList.add('hidden'),500);this.$('menu').classList.remove('hidden');}
  error(error:unknown){this.$('loading').classList.remove('hidden');this.$('loading').classList.remove('fade-out');this.text('load-label',`加载未完成：${error instanceof Error?error.message:String(error)}`);this.$('load-percent').innerHTML='<button class="text-button" onclick="location.reload()">重新加载 ↻</button>';}
  enter(){this.$('menu').classList.add('hidden');this.$('hud').classList.remove('hidden');this.close();this.$('tutorial').classList.remove('hidden');}
  menu(){this.$('menu').classList.remove('hidden');this.$('hud').classList.add('hidden');this.close();this.$('scoreboard').classList.add('hidden');}
  close(){this.$('overlay').classList.add('hidden');this.$('overlay').innerHTML='';}
  private overlay(content:string,wide=false){const n=this.$('overlay');n.innerHTML=`<div class="panel ${wide?'wide':''}">${content}</div>`;n.classList.remove('hidden');n.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b=>b.onclick=()=>this.callbacks.closeOverlay());}
  pause(){this.overlay(`<span class="eyebrow">TACTICAL TIMEOUT</span><h2>暂时停火。</h2><p>战场已暂停。准备好后，继续你的行动。</p><button class="primary-button" id="resume"><span>继续游戏</span>${arrow}</button><div class="panel-links"><button id="pause-settings">游戏设置</button><button id="restart">重新比赛</button><button id="back-menu">返回主菜单</button></div>`);document.getElementById('resume')!.onclick=()=>this.callbacks.resume();document.getElementById('pause-settings')!.onclick=()=>this.callbacks.openSettings();document.getElementById('restart')!.onclick=()=>this.callbacks.restart();document.getElementById('back-menu')!.onclick=()=>this.callbacks.menu();}
  settingsPanel(){
    this.overlay(`<div class="panel-heading"><div><span class="eyebrow">FIELD PREFERENCES</span><h2>游戏设置</h2></div><button data-close class="close-button">×</button></div><div class="settings-grid"><label>鼠标灵敏度 <output id="sens-value">${this.settings.sensitivity.toFixed(1)}</output><input id="sens" type="range" min="0.2" max="3" step="0.1" value="${this.settings.sensitivity}"></label><label>主音量 <output id="vol-value">${Math.round(this.settings.volume*100)}%</output><input id="vol" type="range" min="0" max="1" step="0.05" value="${this.settings.volume}"></label><label>画面质量<select id="quality"><option value="high">高 · 完整阴影与细节</option><option value="medium">中 · 平衡画质与性能</option><option value="low">低 · 优先帧率</option></select></label><label>机器人难度<select id="difficulty"><option value="easy">新兵 · 较慢反应</option><option value="normal">老兵 · 标准挑战</option><option value="hard">精英 · 高强度交战</option></select></label><label>起始阵营 <small>下一场比赛生效</small><select id="side"><option value="CT">CT · 反恐精英</option><option value="T">T · 进攻方</option></select></label><label>准星样式<select id="crosshair-type"><option value="classic">经典十字</option><option value="dot">中心圆点</option></select></label></div><div class="settings-note">设置自动保存在此浏览器。按 Esc 返回。</div>`);
    for(const id of ['quality','difficulty','side']) (document.getElementById(id)as HTMLSelectElement).value=this.settings[id as 'quality'];
    (document.getElementById('crosshair-type')as HTMLSelectElement).value=this.settings.crosshair;
    const save=()=>{
      this.settings={sensitivity:+(document.getElementById('sens')as HTMLInputElement).value,volume:+(document.getElementById('vol')as HTMLInputElement).value,quality:(document.getElementById('quality')as HTMLSelectElement).value as Settings['quality'],difficulty:(document.getElementById('difficulty')as HTMLSelectElement).value as Settings['difficulty'],side:(document.getElementById('side')as HTMLSelectElement).value as Side,crosshair:(document.getElementById('crosshair-type')as HTMLSelectElement).value as Settings['crosshair']};
      document.getElementById('sens-value')!.textContent=this.settings.sensitivity.toFixed(1);document.getElementById('vol-value')!.textContent=Math.round(this.settings.volume*100)+'%';
      try{localStorage.setItem('dust-ii-settings',JSON.stringify(this.settings));}catch{}
      this.callbacks.settings(this.settings);
    };
    this.$('overlay').querySelectorAll('input,select').forEach(n=>n.addEventListener('input',save));
  }
  intel(){this.overlay(`<div class="panel-heading"><div><span class="eyebrow">THE DUST II DOSSIER</span><h2>每条路，都通向交锋。</h2></div><button data-close class="close-button">×</button></div><p>通过 A 大与 A 小争夺 A 平台，穿过上下隧道突破 B 点，或抢占中路，切断双方支援。控制地图，才能控制回合。</p><div class="intel-columns"><div><h3>行动规则</h3><p>15 秒准备 · 115 秒攻防<br>炸弹 40 秒引爆<br>按住 E 安装 3.2 秒 / 拆除 10 秒<br>拆弹工具将拆除缩短至 5 秒</p></div><div><h3>战术操作</h3><p>Shift 静步 · Ctrl 蹲伏<br>R 换弹 · 右键狙击镜<br>4 切换投掷物 · 左键投掷<br>G 丢弃武器 · E 拾取<br>Tab 计分板 · Esc 暂停</p></div></div><div class="credits"><strong>关于这个战场</strong><p>独立制作的 Dust II 致敬作品，与 Valve 无关联。地图、武器和角色由代码重建；环境材质来自 Poly Haven（CC0）。枪声与音效使用 Web Audio 合成。此版本为本地单人游戏。</p><a href="https://polyhaven.com/license" target="_blank" rel="noreferrer">素材与授权 ↗</a></div>`,true);}
  buy(player:Combatant,side:Side){
    const items=Object.values(WEAPONS).filter(w=>w.id!=='knife'&&(!w.side||w.side===side));
    this.overlay(`<div class="panel-heading"><div><span class="eyebrow">LOADOUT / ${side}</span><h2>选择你的装备</h2></div><div class="shop-money">$${player.money.toLocaleString()}</div><button data-close class="close-button">×</button></div><div class="shop-grid">${items.map(w=>`<button class="shop-item ${player.inventory.some(i=>i.id===w.id)?'owned':''}" data-buy="${w.id}" ${player.money<w.price?'disabled':''}><span class="shop-category">${w.label}</span><span class="gun-silhouette ${w.slot===1?'rifle':'pistol'}"><i></i></span><strong>${w.name}</strong><span class="shop-price">${player.inventory.some(i=>i.id===w.id)?'已装备':'$'+w.price}</span></button>`).join('')}</div><div class="equipment-row">${[['armor','防弹衣',650],['helmet','防弹衣 + 头盔',1000],...(side==='CT'?[['kit','拆弹工具',400]]:[]),['he','高爆手雷',300],['flash','闪光弹',200],['smoke','烟雾弹',300]].map(([id,label,cost])=>`<button data-buy="${id}" ${player.money<Number(cost)?'disabled':''}><span>${label}</span><b>$${cost}</b></button>`).join('')}</div><div class="settings-note">仅可在准备阶段与出生区域购买。按 B 或 Esc 返回战场。</div>`,true);
    this.$('overlay').querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(b=>b.onclick=()=>this.callbacks.buy(b.dataset.buy!));
  }
  finish(match:MatchState){const win=match.score[0]>match.score[1],draw=match.score[0]===match.score[1];this.overlay(`<span class="eyebrow">OPERATION COMPLETE</span><h2>${draw?'势均力敌。':win?'胜利属于你。':'整装，再战。'}</h2><div class="final-score">${match.score[0]}<span>:</span>${match.score[1]}</div><p>${draw?'双方以平局结束比赛。':win?'你的团队赢得了这场行动。':'对方赢得了这场行动。熟悉每个转角，下一局见。'}</p><button id="again" class="primary-button"><span>再来一场</span>${arrow}</button><button id="finish-menu" class="text-button">返回主菜单</button>`);document.getElementById('again')!.onclick=()=>this.callbacks.restart();document.getElementById('finish-menu')!.onclick=()=>this.callbacks.menu();}
  update(d:HUDData){
    const {match:m,player:p}=d,secs=Math.max(0,Math.ceil(m.phase==='planted'?m.bomb.remaining:m.remaining));
    this.text('clock',`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`);
    this.$('clock').classList.toggle('urgent',secs<15&&m.phase!=='freeze');
    this.text('phase-label',m.phase==='freeze'?'准备阶段':m.phase==='planted'?'炸弹已安放':m.phase==='end'?'回合结束':'爆破模式');
    this.text('bomb-state',m.phase==='planted'?`${m.bomb.site} SITE`:m.bomb.carrier===p.id?'携带 C4':'');
    this.text('score-left',String(m.score[0]));this.text('score-right',String(m.score[1]));
    for(const [key,index]of [['left',0],['right',1]]as const){const el=this.$('team-'+key);el.className='team-block '+(m.sides[index]==='CT'?'blue':'gold');el.querySelector('span')!.textContent=m.sides[index];this.$('alive-'+key).innerHTML=d.actors.filter(a=>a.team===index).map(a=>`<i class="${a.alive?'':'dead'}"></i>`).join('');}
    this.text('health',String(Math.max(0,Math.round(p.health))));this.text('armor',String(p.armor));this.text('money','$'+p.money.toLocaleString());this.$('health-fill').style.width=p.health+'%';
    this.text('weapon-name',d.selectedGrenade?{he:'高爆手雷',flash:'闪光弹',smoke:'烟雾弹'}[d.selectedGrenade]:WEAPONS[d.weapon].name);
    this.text('ammo',d.weapon==='knife'?'—':String(d.ammo));this.text('reserve',d.weapon==='knife'?'':String(d.reserve));
    this.text('location',d.location);this.text('round-label','ROUND '+String(m.round).padStart(2,'0'));this.text('fps',`${d.fps} FPS`);
    this.text('context-prompt',d.prompt);this.text('grenades-label',`4 投掷物 ${d.grenades.he+d.grenades.flash+d.grenades.smoke}`);
    const progress=d.interaction||(d.reloading>0?d.reloading:0);this.$('interaction').classList.toggle('hidden',!progress);this.text('interaction-label',d.interaction?d.interactionLabel:'更换弹匣');this.$('interaction-fill').style.width=`${progress*100}%`;
    this.$('spectating').classList.toggle('hidden',!d.spectating);this.text('spectating',`正在观战 ${d.spectating} · 点击鼠标切换队友`);
    this.$('scope').classList.toggle('hidden',!d.scope);this.$('crosshair').className=`crosshair ${this.settings.crosshair==='dot'?'dot':''} ${d.scope||!p.alive?'hidden':''}`;
    this.$('round-result').classList.toggle('hidden',m.phase!=='end');
    if(m.phase==='end'){this.text('result-side',m.winner!==null?m.sides[m.winner]+' / ROUND WON':'');this.text('result-title',m.winner===0?'回合胜利':'回合失利');this.text('result-reason',m.reason);}
    this.drawRadar(d);
  }
  scoreboard(actors:Combatant[],match:MatchState,show:boolean){const el=this.$('scoreboard');el.classList.toggle('hidden',!show);if(!show)return;el.innerHTML=`<div class="scoreboard-title"><span>DUST II / 经典爆破</span><span>ROUND ${match.round} / 24</span></div>${[0,1].map(team=>`<div class="scoreboard-team"><strong>${match.sides[team]}<b>${match.score[team]}</b></strong><table><thead><tr><th>玩家</th><th>资金</th><th>击杀</th><th>死亡</th><th>状态</th></tr></thead><tbody>${actors.filter(a=>a.team===team).sort((a,b)=>b.kills-a.kills).map(a=>`<tr class="${a.id===0?'self':''}"><td>${a.id===0?'◆':'◇'} ${a.name}</td><td>$${a.money}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.alive?'行动中':'已阵亡'}</td></tr>`).join('')}</tbody></table></div>`).join('')}`;}
  kill(killer:string,victim:string,weapon:string,friendly:boolean,head=false){const row=document.createElement('div');row.className='kill-row';row.innerHTML=`<span class="${friendly?'blue-text':'gold-text'}">${killer}</span><b>${weapon}${head?' ⊕':''}</b><span>${victim}</span>`;this.$('killfeed').prepend(row);while(this.$('killfeed').children.length>5)this.$('killfeed').lastChild!.remove();setTimeout(()=>row.remove(),6500);}
  hit(head=false){clearTimeout(this.hitTimer);this.$('hit-marker').classList.remove('hidden');this.$('hit-marker').style.color=head?'#efad63':'#eee';this.hitTimer=window.setTimeout(()=>this.$('hit-marker').classList.add('hidden'),120);}
  hurt(){this.$('damage-vignette').style.opacity='.9';setTimeout(()=>this.$('damage-vignette').style.opacity='0',170);}
  flash(amount:number){this.$('flash').style.opacity=String(amount);}
  toast(text:string){clearTimeout(this.toastTimer);this.text('toast',text);this.$('toast').classList.remove('hidden');this.toastTimer=window.setTimeout(()=>this.$('toast').classList.add('hidden'),2700);}
  private drawAtlas(){const c=document.createElement('canvas');c.width=c.height=560;const ctx=c.getContext('2d')!;ctx.fillStyle='#15221f';ctx.fillRect(0,0,560,560);const s=3.7;for(const a of MAP.areas){ctx.fillStyle=a.callout.includes('TUNNEL')?'#52605a':'#81867a';ctx.fillRect((a.x1+73)*s,(a.z1+73)*s,(a.x2-a.x1)*s,(a.z2-a.z1)*s);ctx.strokeStyle='#bec1aa';ctx.lineWidth=.6;ctx.strokeRect((a.x1+73)*s,(a.z1+73)*s,(a.x2-a.x1)*s,(a.z2-a.z1)*s);}for(const site of MAP.sites){ctx.fillStyle='#e4b974';ctx.font='bold 34px Arial';ctx.textAlign='center';ctx.fillText(site.name,(site.x+73)*s,(site.z+73)*s+10);}return c;}
  private drawMenuMap(){const c=this.$('menu-map')as HTMLCanvasElement,ctx=c.getContext('2d')!;ctx.drawImage(this.atlas,38,20,478,510,34,0,230,230);ctx.fillStyle='#dfa954';ctx.beginPath();ctx.arc(155,210,4,0,Math.PI*2);ctx.fill();ctx.fillStyle='#82bed8';ctx.beginPath();ctx.arc(168,29,4,0,Math.PI*2);ctx.fill();}
  private drawRadar(d:HUDData){const c=this.radar;c.clearRect(0,0,280,280);c.drawImage(this.atlas,0,0,280,280);const s=1.85;for(const a of d.radar){if(!a.alive||(!a.visible&&a.team!==0))continue;const x=(a.position.x+73)*s,z=(a.position.z+73)*s;c.fillStyle=a.human?'#f6ecd2':a.team===0?'#90c5de':'#e57358';c.beginPath();c.arc(x,z,a.human?4:3,0,Math.PI*2);c.fill();if(a.human){c.strokeStyle='#f6ecd2';c.beginPath();c.moveTo(x,z);c.lineTo(x-Math.sin(a.yaw)*10,z-Math.cos(a.yaw)*10);c.stroke();}}if(d.match.bomb.position){const p=d.match.bomb.position;c.fillStyle='#f5b955';c.fillRect((p.x+73)*s-3,(p.z+73)*s-3,6,6);}}
}
