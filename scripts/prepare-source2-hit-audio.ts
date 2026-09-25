import{readFile,writeFile,mkdir}from'node:fs/promises';
import{parseKV3}from'./source2-kv3';
const base='local-assets/hit-audio/';
const source={...parseKV3(await readFile(base+'player.vsndevts','utf8')),...JSON.parse(await readFile('local-assets/weapons/sound-events.json','utf8'))};
const selected:Record<string,any>={};
function collect(name:string){
  if(selected[name])return;
  const e=source[name];if(!e)throw new Error('Missing original hit event: '+name);selected[name]=e;
  if(e.enable_child_events)for(const [key,value]of Object.entries(e))if(key.startsWith('soundevent_'))for(const child of value as string[])if(child)collect(child);
}
for(const action of ['Damage','Death'])for(const region of ['Body','BodyArmor','HeadShot','HeadShotArmor'])for(const role of ['AttackerFeedback','Victim','Onlooker'])collect(`Player.${action}${region}.${role}`);
collect('Player.BurnDamage');collect('Player.BurnDamageKevlar');
collect('Weapon_Knife.Hit.Light.Flesh');collect('Weapon_Knife.HitWall');
const files=new Set<string>();
const events:Record<string,any>={};
for(const [name,e]of Object.entries(selected)){
  const paths=Object.entries(e).filter(([k])=>k.startsWith('vsnd_files')).flatMap(([,v])=>typeof v==='string'?[v]:v as string[]).map(p=>p+'_c');
  // A zero-volume parent may exist solely to layer flesh and helmet sounds.
  const audible=(e.volume??1)>0?paths:[];audible.forEach(p=>files.add(p));
  events[name.toLowerCase()]={files:audible,volume:e.volume??1,pitch:e.pitch??1,pitchRandom:[e.pitch_random_min??0,e.pitch_random_max??0],delay:e.delay??0,cooldown:e.block_duration??0,limit:e.instance_limit??4,
    curve:e.use_distance_volume_mapping_curve?e.distance_volume_mapping_curve:undefined,
    children:e.enable_child_events?Object.entries(e).filter(([k])=>k.startsWith('soundevent_')).flatMap(([,v])=>v as string[]).filter(Boolean).map(n=>n.toLowerCase()):[]};
}
await writeFile(base+'audio-events-source.json',JSON.stringify(selected));
await writeFile(base+'audio-events.json',JSON.stringify(events));
await writeFile(base+'audio-files.json',JSON.stringify([...files]));
console.log(`${Object.keys(events).length} hit events, ${files.size} unique sounds.`);
const hitboxes:Record<string,unknown>={};
const groups:Record<number,string>={1:'head',2:'chest',3:'stomach',4:'leftArm',5:'rightArm',6:'leftLeg',7:'rightLeg',8:'neck'};
for(const side of ['CT','T']){
  const text=await readFile(base+'model-'+side+'.txt','utf8');
  const section=text.slice(text.indexOf('m_hitboxsets ='),text.indexOf('m_morphSet =',text.indexOf('m_hitboxsets =')));
  const boxes=parseKV3('{'+section+'}').m_hitboxsets.find((s:any)=>s.key==='cstrike').value.m_HitBoxes;
  hitboxes[side]=boxes.map((b:any)=>{
    if(b.m_nShapeType!==2||b.m_bTranslationOnly||!groups[b.m_nGroupId])throw new Error('Unsupported native hit shape: '+b.m_name);
    return{bone:b.m_sBoneName.toLowerCase(),group:groups[b.m_nGroupId],a:b.m_vMinBounds.map((v:number)=>v*.0254),b:b.m_vMaxBounds.map((v:number)=>v*.0254),radius:b.m_flShapeRadius*.0254};
  });
}
await mkdir('public/assets/source2/hits',{recursive:true});
await writeFile('public/assets/source2/hits/hitboxes.json',JSON.stringify(hitboxes));
