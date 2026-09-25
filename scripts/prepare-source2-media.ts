import {readFile,writeFile} from 'node:fs/promises';
import {parseKV3} from './source2-kv3';
import {MUSIC_KITS} from '../src/game/music-kits';
const base='local-assets/characters/';
const radio:Record<string,any>={};
const groups:Record<string,{pattern:RegExp;text:string}>={
  letsgo:{pattern:/radio[._]letsgo\d+$/,text:'行动！'},locknload:{pattern:/radio[._]locknload\d+$/,text:'准备行动。'},
  enemy:{pattern:/radio[._]enemyspotted\d+$/,text:'发现敌人！'},backup:{pattern:/radio[._]needbackup\d+$/,text:'需要支援！'},
  takingfire:{pattern:/radio[._]takingfire\d+$/,text:'遭到攻击！'},follow:{pattern:/radio[._]followme\d+$/,text:'跟我来。'},
  hold:{pattern:/radiobothold\d+$/,text:'守住这里。'},regroup:{pattern:/radiobotregroup\d+$/,text:'重新集结。'},
  cover:{pattern:/\.coverme\d+$/,text:'掩护我。'},roger:{pattern:/\.affirmative\d+$/,text:'收到。'},negative:{pattern:/\.negative\d+$/,text:'不行。'},
  he:{pattern:/[ct]_grenade\d+$/,text:'投掷手雷！'},flash:{pattern:/[ct]_flashbang\d+$/,text:'投掷闪光弹！'},smoke:{pattern:/[ct]_smoke\d+$/,text:'投掷烟雾弹！'},
  molotov:{pattern:/[ct]_molotov\d+$/,text:'投掷燃烧瓶！'},incendiary:{pattern:/[ct]_molotov\d+$/,text:'投掷燃烧弹！'},decoy:{pattern:/[ct]_decoy\d+$/,text:'投掷诱饵弹！'},
  planting:{pattern:/\.plantingbomb\d+$/,text:'正在安装炸弹。'},defusing:{pattern:/\.defusingbomb\d+$/,text:'正在拆除炸弹。'},
  enemydown:{pattern:/\.enemydown\d+$/,text:'敌人已被击毙。'},oneleft:{pattern:/\.oneenemyleft\d+$/,text:'还剩一名敌人。'},
};
function files(event:any){return Object.entries(event).filter(([key])=>/^vsnd_files/.test(key)).flatMap(([,value])=>typeof value==='string'?[value]:Array.isArray(value)?value:[]).map(p=>p+'_c');}
for(const [side,agent]of [['CT','sas'],['T','phoenix']]){
  const events=parseKV3(await readFile(base+agent+'.vsndevts','utf8'));
  for(const [role,group]of Object.entries(groups)){
    const variants=Object.entries(events).filter(([name])=>group.pattern.test(name)).map(([name,event]:[string,any])=>({event:name,files:files(event),volume:event.volume??1,duration:event.vsnd_duration??2}));
    if(variants.length)radio[side+'.'+role]={text:group.text,variants};
  }
}
const announcements=parseKV3(await readFile(base+'announcer.vsndevts','utf8'));
for(const [role,name,text]of [['planted','Event.BombPlanted','炸弹已安装'],['defused','Event.BombDefused','炸弹已拆除'],['ctwin','Event.CTWin','反恐精英胜利'],['twin','Event.TERWin','恐怖分子胜利'],['draw','Event.RoundDraw','回合平局']]){
  const e=announcements[name];if(!e)throw new Error(name);radio['announcer.'+role]={text,variants:[{event:name,files:files(e),volume:e.volume??1,duration:e.vsnd_duration}]};
}
const music:Record<string,any>={};
const roles={menu:'Background',freeze:'StartRound',action:'StartAction',planted:'BombPlanted',bomb10:'BombTenSecCount',round10:'TenSecCount',won:'WonRound',lost:'LostRound',death:'DeathCam',mvp:'MVPAnthem',start:'MatchStart',end:'MatchEnd'};
for(const kit of MUSIC_KITS){
  const {id,source:name}=kit;
  const events=parseKV3(await readFile(base+'music-'+(id==='cs2'||id==='classic'?id:name)+'.vsndevts','utf8'));
  music[id]={name:kit.name+' · '+kit.artist,sourceName:name,events:{}};
  for(const [role,event]of Object.entries(roles)){
    const e=events[`Music.${event}.${name}`];if(!e)throw new Error(role);
    const tracks=files(e);
    music[id].events[role]={files:tracks,volume:e.volume??.8,duration:e.vsnd_duration,loop:role==='menu'||role==='freeze'||role==='planted',segments:tracks.map((_:string,i:number)=>({start:e['startpoint_'+String(i+1).padStart(2,'0')]??0,end:e['endpoint_'+String(i+1).padStart(2,'0')]??0})),stopAt:e.stop_at_time??0,fade:e.volume_fade_out_input_max??.4};
  }
}
const soundFiles=new Set<string>();Object.values(radio).forEach(e=>e.variants.forEach((v:any)=>v.files.forEach((f:string)=>soundFiles.add(f))));Object.values(music).forEach(k=>Object.values(k.events).forEach((e:any)=>e.files.forEach((f:string)=>soundFiles.add(f))));
await writeFile(base+'media.json',JSON.stringify({radio,music}));await writeFile(base+'media-files.json',JSON.stringify([...soundFiles]));
console.log(Object.keys(radio).length,'radio groups;', [...soundFiles].length,'sound files;',MUSIC_KITS.length,'music kits.');
