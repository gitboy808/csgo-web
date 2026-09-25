import{CombatHUD,combatHudMarkup,hudIcon}from'./combat-hud';
import type { Combatant, GrenadeId, MatchState, Settings, Side, Vec3, WeaponId } from '../game/types';
import type {MusicCue} from '../game/presentation';
import{MUSIC_KITS,isMusicKit}from'../game/music-kits';
import './music.css';
import type {RadioSubtitle} from '../game/media';
import {GRENADES,GRENADE_IDS,grenadeCount} from '../game/grenades';
import { WEAPONS } from '../game/weapons';
import { MAP, getSource2Map } from '../world/map';
import {BuyMenu,type BuyMenuState,type BuyMenuActions} from './buy-menu';

const DEFAULT_SETTINGS:Settings={sensitivity:1,volume:.65,quality:'high',crosshair:'classic',difficulty:'normal',side:'CT',frameLimit:60,dynamicResolution:false,radioVolume:.85,musicVolume:.35,musicKit:'cs2'};
export function readSettings():Settings { try{const settings={...DEFAULT_SETTINGS,...JSON.parse(localStorage.getItem('dust-ii-settings')||'{}')};if(!isMusicKit(settings.musicKit))settings.musicKit='cs2';return settings;}catch{return {...DEFAULT_SETTINGS};} }
const arrow='<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M4 12h15m-6-6 6 6-6 6"/></svg>';
const mark='<span class="brand-mark"><i></i><i></i></span>';
export interface RadarActor { position:Vec3;team:number;alive:boolean;visible:boolean;human:boolean;yaw:number;id?:number }
export interface HUDData {
  match:MatchState;player:Combatant;actors:Combatant[];radar:RadarActor[];
  weapon:WeaponId;ammo:number;reserve:number;location:string;
  reloading:number;interaction:number;interactionLabel:string;prompt:string;fps:number;
  spectating:string;scope:boolean;grenades:Record<GrenadeId,number>;selectedGrenade:GrenadeId|null;
  training?:boolean;utilityTraining?:boolean;bombSelected?:boolean;roundKills?:number;controlledName?:string;spectatorId?:number;
}
export interface UICallbacks {
  start:()=>void;resume:()=>void;menu:()=>void;restart:()=>void;buy:(id:string)=>void;
  settings:(settings:Settings)=>void;openSettings:()=>void;closeOverlay:()=>void;
  inspect?:()=>void;practice?:()=>void;utility?:()=>void;armory?:()=>void;music?:()=>void;previewMusic?:(cue:MusicCue)=>void;
}
export class UI {
  private shop:BuyMenu|null=null;
  private combatHUD!:CombatHUD;
  private app=document.querySelector<HTMLDivElement>('#app')!;
  private nodes=new Map<string,HTMLElement>();
  private toastTimer=0;
  private hitTimer=0;
  private radar:CanvasRenderingContext2D;
  private atlas:HTMLCanvasElement;
  private mapProjection={scale:3.7,x:73*3.7,z:73*3.7};
  settings:Settings;
  callbacks!:UICallbacks;
  ready=false;
  refreshMap(){
    this.atlas=this.drawAtlas();this.drawMenuMap();
    const source=getSource2Map();if(!source)return;this.$('nav-music').classList.remove('hidden');
    const launch=this.$('start');if(!document.getElementById('practice')){const button=document.createElement('button');button.id='practice';button.className='practice-button';button.textContent='枪械训练 · 7 种原始武器 ↗';button.onclick=()=>this.callbacks.practice?.();launch.after(button);}
    if(!document.getElementById('utility-practice')){const button=document.createElement('button');button.id='utility-practice';button.className='practice-button utility-button';button.textContent='投掷物训练 · 六类装备与落点预览 ↗';button.onclick=()=>this.callbacks.utility?.();document.getElementById('practice')!.after(button);}
    const label=document.querySelector('.eyebrow');if(label)label.innerHTML='<span class="tiny-rule"></span>CS2 原始地图 · 本地演练<span class="edition">DUST II</span>';
    const notice=document.querySelector('.attribution');if(notice)notice.innerHTML='本地地图研究与演练 · Valve 原始地图资源<span>COUNTER-STRIKE 2</span>';
    const card=document.querySelector('.card-top');if(card){card.innerHTML='<span>CS2 原图概览</span><button id="inspect-map" class="map-inspect-link">浏览地图 ↗</button>';document.getElementById('inspect-map')!.onclick=()=>this.callbacks.inspect?.();}
    if(source.radar){const image=new Image();image.onload=()=>{const ctx=this.atlas.getContext('2d')!,r=source.radar!,origin=this.projectMap(r.posX*.0254,-r.posY*.0254),size=1024*r.scale*.0254*this.mapProjection.scale;ctx.drawImage(image,origin.x,origin.y,size,size);this.drawMenuMap();};image.src=`${import.meta.env.BASE_URL}assets/source2/${source.radar.file}`;}
  }
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
        ${combatHudMarkup()}
        <div id="crosshair" class="crosshair"><i></i><i></i><i></i><i></i></div><div id="hit-marker" class="hit-marker hidden">×</div><div id="scope" class="scope hidden"><div></div></div>
        <div id="damage-vignette" class="damage-vignette"></div><div id="flash" class="flash-overlay"></div>
        <div id="round-result" class="round-result hidden"><small id="result-side"></small><h2 id="result-title"></h2><p id="result-reason"></p></div>
        <div id="interaction" class="interaction hidden"><span id="interaction-label"></span><div><i id="interaction-fill"></i></div></div><div id="context-prompt" class="context-prompt"></div>
        <div id="spectating" class="spectating hidden"></div><div id="tutorial" class="tutorial"><span><kbd>W A S D</kbd> 移动</span><span><kbd>鼠标</kbd> 瞄准 / 射击</span><span><kbd>B</kbd> 买枪</span><span><kbd>E</kbd> 安装 / 拆弹 / 拾取</span><span><kbd>ESC</kbd> 暂停</span></div>
      </section>
      <div id="radio-subtitles" class="radio-subtitles" aria-live="polite"></div><div id="radio-menu" class="radio-menu hidden"></div><div id="overlay" class="overlay hidden"></div><div id="scoreboard" class="scoreboard hidden"></div><div id="toast" class="toast hidden"></div>
    `;
    const musicButton=document.createElement('button');musicButton.id='nav-music';musicButton.className='text-button hidden';musicButton.textContent='♫ 音乐盒';this.$('nav-settings').before(musicButton);musicButton.onclick=()=>this.callbacks.music?.();
    this.combatHUD=new CombatHUD(id=>this.$(id));
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
  close(){this.shop?.dispose();this.shop=null;this.$('overlay').classList.remove('buy-overlay');this.$('overlay').classList.add('hidden');this.$('overlay').innerHTML='';}
  private overlay(content:string,wide=false){this.close();const n=this.$('overlay');n.innerHTML=`<div class="panel ${wide?'wide':''}">${content}</div>`;n.classList.remove('hidden');n.querySelectorAll<HTMLButtonElement>('[data-close]').forEach(b=>b.onclick=()=>this.callbacks.closeOverlay());}
  pause(training=false){this.overlay(`<span class="eyebrow">TACTICAL TIMEOUT</span><h2>暂时停火。</h2><p>战场已暂停。准备好后，继续你的行动。</p><button class="primary-button" id="resume"><span>${training?'继续训练':'继续游戏'}</span>${arrow}</button>${training?'<button class="practice-button" id="pause-armory">选择练习武器 ↗</button>':''}<div class="panel-links"><button id="pause-settings">游戏设置</button><button id="restart">${training?'重新训练':'重新比赛'}</button><button id="back-menu">返回主菜单</button></div>`);document.getElementById('resume')!.onclick=()=>this.callbacks.resume();if(training)document.getElementById('pause-armory')!.onclick=()=>this.callbacks.armory?.();document.getElementById('pause-settings')!.onclick=()=>this.callbacks.openSettings();document.getElementById('restart')!.onclick=()=>this.callbacks.restart();document.getElementById('back-menu')!.onclick=()=>this.callbacks.menu();}
  settingsPanel(){
    this.overlay(`<div class="panel-heading"><div><span class="eyebrow">FIELD PREFERENCES</span><h2>游戏设置</h2></div><button data-close class="close-button">×</button></div><div class="settings-grid"><label>鼠标灵敏度 <output id="sens-value">${this.settings.sensitivity.toFixed(1)}</output><input id="sens" type="range" min="0.2" max="3" step="0.1" value="${this.settings.sensitivity}"></label><label>主音量 <output id="vol-value">${Math.round(this.settings.volume*100)}%</output><input id="vol" type="range" min="0" max="1" step="0.05" value="${this.settings.volume}"></label><label>无线电音量 <output id="radio-vol-value">${Math.round(this.settings.radioVolume*100)}%</output><input id="radio-vol" type="range" min="0" max="1" step="0.05" value="${this.settings.radioVolume}"></label><label>音乐音量 <output id="music-vol-value">${Math.round(this.settings.musicVolume*100)}%</output><input id="music-vol" type="range" min="0" max="1" step="0.05" value="${this.settings.musicVolume}"></label><label>音乐盒<select id="music-kit">${MUSIC_KITS.map(kit=>`<option value="${kit.id}">${kit.name} · ${kit.artist}</option>`).join('')}<option value="off">关闭音乐</option></select></label><label>帧率上限<select id="frame-limit"><option value="60">60 FPS · 减少发热</option><option value="90">90 FPS · 平衡响应</option><option value="120">120 FPS · 优先流畅</option></select></label><label>动态分辨率<select id="dynamic-resolution"><option value="off">关闭 · 保持原始清晰度</option><option value="on">自动 · 85–100%，优先稳定帧率</option></select></label><label>画面质量<select id="quality"><option value="high">高 · 完整阴影与细节</option><option value="medium">中 · 平衡画质与性能</option><option value="low">低 · 优先帧率</option></select></label><label>机器人难度<select id="difficulty"><option value="easy">新兵 · 较慢反应</option><option value="normal">老兵 · 标准挑战</option><option value="hard">精英 · 高强度交战</option></select></label><label>起始阵营 <small>下一场比赛生效</small><select id="side"><option value="CT">CT · 反恐精英</option><option value="T">T · 进攻方</option></select></label><label>准星样式<select id="crosshair-type"><option value="classic">经典十字</option><option value="dot">中心圆点</option></select></label></div><div class="settings-note">设置自动保存在此浏览器。按 Esc 返回。</div>`);
    for(const id of ['quality','difficulty','side']) (document.getElementById(id)as HTMLSelectElement).value=this.settings[id as 'quality'];
    (document.getElementById('dynamic-resolution')as HTMLSelectElement).value=this.settings.dynamicResolution?'on':'off';
    (document.getElementById('frame-limit')as HTMLSelectElement).value=String(this.settings.frameLimit);
    (document.getElementById('music-kit')as HTMLSelectElement).value=this.settings.musicKit;
    (document.getElementById('crosshair-type')as HTMLSelectElement).value=this.settings.crosshair;
    const save=()=>{
      this.settings={dynamicResolution:(document.getElementById('dynamic-resolution')as HTMLSelectElement).value==='on',frameLimit:Number((document.getElementById('frame-limit')as HTMLSelectElement).value) as Settings['frameLimit'],radioVolume:+(document.getElementById('radio-vol')as HTMLInputElement).value,musicVolume:+(document.getElementById('music-vol')as HTMLInputElement).value,musicKit:(document.getElementById('music-kit')as HTMLSelectElement).value as Settings['musicKit'],sensitivity:+(document.getElementById('sens')as HTMLInputElement).value,volume:+(document.getElementById('vol')as HTMLInputElement).value,quality:(document.getElementById('quality')as HTMLSelectElement).value as Settings['quality'],difficulty:(document.getElementById('difficulty')as HTMLSelectElement).value as Settings['difficulty'],side:(document.getElementById('side')as HTMLSelectElement).value as Side,crosshair:(document.getElementById('crosshair-type')as HTMLSelectElement).value as Settings['crosshair']};
      document.getElementById('radio-vol-value')!.textContent=Math.round(this.settings.radioVolume*100)+'%';document.getElementById('music-vol-value')!.textContent=Math.round(this.settings.musicVolume*100)+'%';
      document.getElementById('sens-value')!.textContent=this.settings.sensitivity.toFixed(1);document.getElementById('vol-value')!.textContent=Math.round(this.settings.volume*100)+'%';
      try{localStorage.setItem('dust-ii-settings',JSON.stringify(this.settings));}catch{}
      this.callbacks.settings(this.settings);
    };
    this.$('overlay').querySelectorAll('input,select').forEach(n=>n.addEventListener('input',save));
  }
  musicPanel(){
    const selected=MUSIC_KITS.find(kit=>kit.id===this.settings.musicKit);
    this.overlay(`<div class="music-collection"><div class="panel-heading"><div><span class="eyebrow">MUSIC KIT / COLLECTION · ${MUSIC_KITS.length}</span><h2>音乐盒</h2></div><button data-close class="close-button" aria-label="关闭音乐盒">×</button></div><div class="music-selection"><span>已装备</span><strong id="music-selected">${selected?selected.name+' · '+selected.artist:'关闭音乐'}</strong></div><div class="music-kits">${MUSIC_KITS.map(kit=>`<button class="music-kit-card ${this.settings.musicKit===kit.id?'selected':''}" data-kit="${kit.id}" aria-pressed="${this.settings.musicKit===kit.id}"><span class="record-art"><img src="${import.meta.env.BASE_URL}assets/source2/media/covers/${kit.id}.png" alt="${kit.name} 原始封面" width="160" height="160" loading="lazy" decoding="async"></span><strong>${kit.name}</strong><small>${kit.artist}</small><span class="kit-equipped">${this.settings.musicKit===kit.id?'✓ 已装备':'点击装备'}</span></button>`).join('')}</div><div class="music-controls"><div class="music-preview" aria-label="试听曲目">${[['menu','主菜单'],['freeze','准备阶段'],['action','行动开始'],['planted','炸弹安装'],['bomb10','炸弹十秒'],['round10','回合十秒'],['won','回合胜利'],['lost','回合失利'],['death','阵亡'],['mvp','MVP'],['start','比赛开始'],['end','比赛结束']].map(([cue,label])=>`<button data-music-preview="${cue}">▷ ${label}</button>`).join('')}</div><label class="music-volume">音乐音量 <output id="kit-volume-value">${Math.round(this.settings.musicVolume*100)}%</output><input id="kit-volume" type="range" min="0" max="1" step=".05" value="${this.settings.musicVolume}"></label><div class="settings-note">无线电播报时音乐自动降低音量 · 每套音乐盒随比赛阶段自动切换</div></div></div>`,true);
    const save=()=>{try{localStorage.setItem('dust-ii-settings',JSON.stringify(this.settings));}catch{}this.callbacks.settings(this.settings);};
    this.$('overlay').querySelectorAll<HTMLButtonElement>('[data-kit]').forEach(button=>button.onclick=()=>{
      const id=button.dataset.kit;if(!isMusicKit(id)||id===this.settings.musicKit)return;
      this.settings.musicKit=id;save();
      const kit=MUSIC_KITS.find(k=>k.id===id)!;this.$('music-selected').textContent=kit.name+' · '+kit.artist;
      this.$('overlay').querySelectorAll<HTMLButtonElement>('[data-kit]').forEach(card=>{const active=card.dataset.kit===id;card.classList.toggle('selected',active);card.setAttribute('aria-pressed',String(active));card.querySelector('.kit-equipped')!.textContent=active?'✓ 已装备':'点击装备';});
    });
    this.$('overlay').querySelectorAll<HTMLButtonElement>('[data-music-preview]').forEach(button=>button.onclick=()=>{this.callbacks.previewMusic?.(button.dataset.musicPreview as MusicCue);this.$('overlay').querySelectorAll('[data-music-preview]').forEach(b=>b.classList.toggle('playing',b===button));});
    const volume=document.getElementById('kit-volume')as HTMLInputElement;volume.oninput=()=>{this.settings.musicVolume=+volume.value;document.getElementById('kit-volume-value')!.textContent=Math.round(+volume.value*100)+'%';save();};
  }
  radio(message:RadioSubtitle){
    const row=document.createElement('div');row.className='radio-line '+(message.side==='T'?'t-radio':message.side==='CT'?'ct-radio':'announcer-radio');
    const label=document.createElement('small');label.textContent=`${message.side?'◖ 无线电':'◈'} ${message.speaker}${message.location?' @ '+message.location:''}`;const text=document.createElement('span');text.textContent=message.text;row.append(label,text);this.$('radio-subtitles').appendChild(row);while(this.$('radio-subtitles').children.length>3)this.$('radio-subtitles').firstChild!.remove();setTimeout(()=>row.remove(),4800);
  }
  radioMenu(items:string[]|null){const menu=this.$('radio-menu');menu.classList.toggle('hidden',!items);menu.innerHTML=items?`<small>无线电 · 数字键选择 · Z / X / C 切换</small>${items.map((label,i)=>`<div><kbd>${i+1}</kbd>${label}</div>`).join('')}<span>0 / Esc 关闭</span>`:'';}
  intel(){this.overlay(`<div class="panel-heading"><div><span class="eyebrow">THE DUST II DOSSIER</span><h2>每条路，都通向交锋。</h2></div><button data-close class="close-button">×</button></div><p>通过 A 大与 A 小争夺 A 平台，穿过上下隧道突破 B 点，或抢占中路，切断双方支援。控制地图，才能控制回合。</p><div class="intel-columns"><div><h3>行动规则</h3><p>15 秒准备 · 115 秒攻防<br>炸弹 40 秒引爆<br>按住 E 安装 3.2 秒 / 拆除 10 秒<br>拆弹工具将拆除缩短至 5 秒</p></div><div><h3>战术操作</h3><p>Shift 静步 · Ctrl 蹲伏<br>R 换弹 · 右键狙击镜<br>4 切换投掷物 · 松手投出<br>左键长抛 / 右键短抛 / 双键中抛<br>6 高爆 · 7 闪光 · 8 烟雾 · 9 诱饵 · 0 燃烧<br>G 丢弃武器 · E 拾取<br>F 检视武器 · Z / X / C 无线电<br>Tab 计分板 · Esc 暂停</p></div></div><div class="credits"><strong>关于这个战场</strong><p>独立制作的本地演练项目，与 Valve 无关联。本地版使用 CS2 原始地图、枪械、动作和音效资源；比赛与机器人由本项目实现。</p><a href="https://polyhaven.com/license" target="_blank" rel="noreferrer">素材与授权 ↗</a></div>`,true);}
  buy(state:BuyMenuState,actions:BuyMenuActions){
    const side=state.match.sides[state.player.team],host=this.$('overlay');
    this.$('toast').classList.add('hidden');
    if(this.shop?.root.dataset.side!==side){this.shop?.dispose();this.shop=null;}
    host.classList.add('buy-overlay');host.classList.remove('hidden');
    if(this.shop)this.shop.update(state);else this.shop=new BuyMenu(host,state,actions);
  }
  buyFeedback(message:string){this.shop?.feedback(message);}
  armory(){
    this.overlay(`<div class="panel-heading"><div><span class="eyebrow">WEAPON TRAINING</span><h2>选择练习装备</h2></div><button data-close class="close-button">×</button></div><div class="shop-grid">${Object.values(WEAPONS).map(w=>`<button class="shop-item" data-buy="${w.id}"><span class="shop-category">${w.label}</span><img class="weapon-icon" src="${import.meta.env.BASE_URL}assets/source2/weapons/icons/${w.id}.svg" alt=""><strong>${w.name}</strong><span class="shop-price">选择武器 ↗</span></button>`).join('')}</div><div class="utility-armory">${GRENADE_IDS.map(id=>`<button data-buy="${id}"><img src="${import.meta.env.BASE_URL}assets/source2/grenades/icons/${id}.svg" alt=""><strong>${GRENADES[id].name}</strong><small>选择练习 ↗</small></button>`).join('')}</div><div class="settings-note">投掷物：左键长抛 / 右键短抛 / 双键中抛，松手投出。弹药不限 · 目标自动恢复 · R 换弹 · F 检视 · [ / ] 切换武器</div>`,true);
    this.$('overlay').querySelectorAll<HTMLButtonElement>('[data-buy]').forEach(b=>b.onclick=()=>this.callbacks.buy(b.dataset.buy!));
  }
  finish(match:MatchState){const win=match.score[0]>match.score[1],draw=match.score[0]===match.score[1];this.overlay(`<span class="eyebrow">OPERATION COMPLETE</span><h2>${draw?'势均力敌。':win?'胜利属于你。':'整装，再战。'}</h2><div class="final-score">${match.score[0]}<span>:</span>${match.score[1]}</div><p>${draw?'双方以平局结束比赛。':win?'你的团队赢得了这场行动。':'对方赢得了这场行动。熟悉每个转角，下一局见。'}</p><button id="again" class="primary-button"><span>再来一场</span>${arrow}</button><button id="finish-menu" class="text-button">返回主菜单</button>`);document.getElementById('again')!.onclick=()=>this.callbacks.restart();document.getElementById('finish-menu')!.onclick=()=>this.callbacks.menu();}
  update(d:HUDData){
    const {match:m,player:p}=d,secs=Math.max(0,Math.ceil(m.phase==='planted'?m.bomb.remaining:m.remaining));
    this.text('clock',d.training?'∞':`${Math.floor(secs/60)}:${String(secs%60).padStart(2,'0')}`);
    this.$('clock').classList.toggle('urgent',secs<15&&m.phase!=='freeze');
    this.text('phase-label',d.training?(d.utilityTraining?'投掷物训练':'枪械训练'):m.phase==='freeze'?'准备阶段':m.phase==='planted'?'炸弹已安放':m.phase==='end'?'回合结束':'爆破模式');
    this.text('bomb-state',m.phase==='planted'?`${m.bomb.site} SITE`:m.bomb.carrier===p.id?'携带 C4':'');
    this.text('score-left',String(m.score[0]));this.text('score-right',String(m.score[1]));
    this.combatHUD.update(d);
    this.text('health',String(Math.max(0,Math.round(p.health))));this.text('armor',String(p.armor));this.text('money','$'+p.money.toLocaleString());this.$('health-fill').style.width=p.health+'%';
    this.text('weapon-name',d.bombSelected?'C4':d.selectedGrenade?GRENADES[d.selectedGrenade].name:WEAPONS[d.weapon].name);
    this.text('ammo',d.bombSelected?'':d.selectedGrenade?d.training?'∞':String(d.grenades[d.selectedGrenade]):d.weapon==='knife'?'—':String(d.ammo));this.text('reserve',d.bombSelected?'':d.selectedGrenade?'':d.weapon==='knife'?'':d.training?'∞':String(d.reserve));
    this.text('location',d.location);this.text('round-label','ROUND '+String(m.round).padStart(2,'0'));this.text('fps',`${d.fps} FPS`);
    this.text('context-prompt',d.prompt);this.text('grenades-label',`4 投掷物 ${grenadeCount(d.grenades)}`);
    const progress=d.interaction||(d.reloading>0?d.reloading:0);this.$('interaction').classList.toggle('hidden',!progress);this.text('interaction-label',d.interaction?d.interactionLabel:'更换弹匣');this.$('interaction-fill').style.width=`${progress*100}%`;
    this.$('spectating').classList.toggle('hidden',!d.spectating);this.text('spectating',`正在观战 ${d.spectating}　·　鼠标左键／右键切换　·　1–5 选择队友　·　E 接管当前队友`);
    this.$('scope').classList.toggle('hidden',!d.scope);this.$('crosshair').className=`crosshair ${this.settings.crosshair==='dot'?'dot':''} ${d.scope||!p.alive||!!d.spectating?'hidden':''}`;
    this.$('round-result').classList.toggle('hidden',m.phase!=='end');
    if(m.phase==='end'){this.text('result-side',m.winner!==null?m.sides[m.winner]+' / ROUND WON':'');this.text('result-title',m.winner===0?'回合胜利':'回合失利');this.text('result-reason',m.reason+(m.mvp?` · ★ MVP ${m.mvp.name} · ${m.mvp.reason}`:''));}
    this.drawRadar(d);
  }
  scoreboard(actors:Combatant[],match:MatchState,show:boolean){const el=this.$('scoreboard');el.classList.toggle('hidden',!show);if(!show)return;el.innerHTML=`<div class="scoreboard-title"><span>DUST II / 经典爆破</span><span>ROUND ${match.round} / 24</span></div>${[0,1].map(team=>`<div class="scoreboard-team"><strong>${match.sides[team]}<b>${match.score[team]}</b></strong><table><thead><tr><th>玩家</th><th>资金</th><th>击杀</th><th>死亡</th><th>状态</th></tr></thead><tbody>${actors.filter(a=>a.team===team).sort((a,b)=>b.kills-a.kills).map(a=>`<tr class="${a.id===0?'self':''}"><td>${a.id===0?'◆':'◇'} ${a.name}</td><td>$${a.money}</td><td>${a.kills}</td><td>${a.deaths}</td><td>${a.alive?'行动中':'已阵亡'}</td></tr>`).join('')}</tbody></table></div>`).join('')}`;}
  kill(killer:string,victim:string,weapon:string,friendly:boolean,head=false){const row=document.createElement('div');row.className='kill-row';const id=Object.values(WEAPONS).find(w=>w.name===weapon)?.id;row.innerHTML=`<span class="${friendly?'blue-text':'gold-text'}">${killer}</span>${id?`<img src="${import.meta.env.BASE_URL}assets/source2/weapons/icons/${id}.svg" alt="${weapon}">`:`<b>${weapon}</b>`}${head?hudIcon('headshot','爆头','headshot-icon'):''}<span>${victim}</span>`;this.$('killfeed').prepend(row);while(this.$('killfeed').children.length>5)this.$('killfeed').lastChild!.remove();setTimeout(()=>row.remove(),6500);}
  hit(head=false){clearTimeout(this.hitTimer);this.$('hit-marker').classList.remove('hidden');this.$('hit-marker').style.color=head?'#efad63':'#eee';this.hitTimer=window.setTimeout(()=>this.$('hit-marker').classList.add('hidden'),120);}
  hurt(){this.$('damage-vignette').style.opacity='.9';setTimeout(()=>this.$('damage-vignette').style.opacity='0',170);}
  flash(amount:number){this.$('flash').style.opacity=String(amount);}
  toast(text:string){clearTimeout(this.toastTimer);this.text('toast',text);this.$('toast').classList.remove('hidden');this.toastTimer=window.setTimeout(()=>this.$('toast').classList.add('hidden'),2700);}
  private projectMap(x:number,z:number,factor=1){const p=this.mapProjection;return {x:(x*p.scale+p.x)*factor,y:(z*p.scale+p.z)*factor};}
  private drawAtlas(){
    const c=document.createElement('canvas');c.width=c.height=560;const ctx=c.getContext('2d')!;ctx.fillStyle='#15221f';ctx.fillRect(0,0,560,560);
    const source=getSource2Map();
    if(source){
      const b=source.bounds,width=b.maxX-b.minX,depth=b.maxZ-b.minZ,s=512/Math.max(width,depth);this.mapProjection={scale:s,x:(560-width*s)/2-b.minX*s,z:(560-depth*s)/2-b.minZ*s};
      for(const area of source.navigation){ctx.beginPath();area.vertices.forEach((v,i)=>{const p=this.projectMap(v[0],v[2]);if(i)ctx.lineTo(p.x,p.y);else ctx.moveTo(p.x,p.y);});ctx.closePath();const height=area.vertices.reduce((sum,v)=>sum+v[1],0)/area.vertices.length;ctx.fillStyle=height>1?'#989c8b':'#737f76';ctx.fill();}
    }
    for(const site of MAP.sites){const p=this.projectMap(site.x,site.z);ctx.fillStyle='#e4b974';ctx.font='bold 28px Arial';ctx.textAlign='center';ctx.fillText(site.name,p.x,p.y+9);}return c;
  }
  private drawMenuMap(){if(!getSource2Map())return;const c=this.$('menu-map')as HTMLCanvasElement,ctx=c.getContext('2d')!;ctx.clearRect(0,0,300,230);ctx.drawImage(this.atlas,0,0,560,560,35,0,230,230);for(const side of ['T','CT']as const){const spawn=MAP.spawns[side][0],p=this.projectMap(spawn.x,spawn.z,230/560);ctx.fillStyle=side==='T'?'#dfa954':'#82bed8';ctx.beginPath();ctx.arc(35+p.x,p.y,4,0,Math.PI*2);ctx.fill();}}
  private drawRadar(d:HUDData){
    const c=this.radar,size=320,center=size/2,viewer=d.radar.find(a=>a.human);c.clearRect(0,0,size,size);c.save();c.beginPath();c.arc(center,center,center-2,0,Math.PI*2);c.clip();c.fillStyle='#17191bc9';c.fillRect(0,0,size,size);
    const focus=viewer?this.projectMap(viewer.position.x,viewer.position.z):{x:280,y:280},zoom=.82;
    c.translate(center,center);c.rotate(viewer?.yaw??0);c.scale(zoom,zoom);c.translate(-focus.x,-focus.y);c.globalAlpha=.9;c.drawImage(this.atlas,0,0,560,560);c.globalAlpha=1;
    for(const a of d.radar){if(!a.alive||(!a.visible&&a.team!==d.player.team))continue;const p=this.projectMap(a.position.x,a.position.z),ally=a.team===d.player.team;c.fillStyle=a.human?'#fff':ally?['#b9d85b','#61b8e2','#bb83d3','#dfa34d','#e8d15b'][(a.id??0)%5]:'#f44d4d';c.strokeStyle='#111';c.lineWidth=1.6;
      c.beginPath();c.arc(p.x,p.y,a.human?5.5:5,0,Math.PI*2);c.fill();c.stroke();
      if(a.human){c.save();c.translate(p.x,p.y);c.rotate(-a.yaw);c.beginPath();c.moveTo(0,-17);c.lineTo(-5,-7);c.lineTo(5,-7);c.closePath();c.fill();c.restore();}
    }
    if(d.match.bomb.position){const p=this.projectMap(d.match.bomb.position.x,d.match.bomb.position.z);c.fillStyle='#ffbd49';c.fillRect(p.x-4,p.y-4,8,8);}c.restore();
  }
}
