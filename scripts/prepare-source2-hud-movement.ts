/** Rebuild only the HUD SVGs and movement sounds used by this map, from the pinned local depot. */
import{execFile}from'node:child_process';
import{promisify}from'node:util';
import{mkdir,readFile,writeFile,readdir,stat}from'node:fs/promises';
import{dirname,basename,extname}from'node:path';
import{parseKV3}from'./source2-kv3';
const run=promisify(execFile),cli='.local-tools/source2/Source2Viewer-CLI',vpk='local-assets/cs2/game/csgo/pak01_dir.vpk';
const reference='local-assets/hud-movement',root='public/assets/source2/movement',hud='public/assets/source2/hud';
await Promise.all([mkdir(root,{recursive:true}),mkdir(hud,{recursive:true}),mkdir(reference,{recursive:true})]);
async function exportFile(source:string,dest:string){await mkdir(dirname(dest),{recursive:true});await run(cli,['-i',vpk,'-f',source,'-o',dest,'-d'],{maxBuffer:2*1024*1024});}
const refs=['soundevents/game_sounds_footsteps.vsndevts_c','scripts/surfaceproperties_footsteps.txt'];
for(const name of ['hud','hudhealthammocenter','hudmoney','hudradar','hudteamcounter','hudweaponselection','huddeathnotice'])for(const[dir,ext]of[['styles','vcss_c'],['layout','vxml_c']])refs.push(`panorama/${dir}/hud/${name}.${ext}`);
for(const file of refs)await exportFile(file,reference+'/');
const icons:Record<string,string>={};
for(const name of ['armor','armor_helmet','bullet_single','bullet_auto','ammo_reserve_generic_bullet','kill_1','kill_2','kill_3','kill_4','kill_5','kill_pip_default','kill_pip_headshot'])icons[name]=`panorama/images/hud/${name}.vsvg_c`;
icons.bot='panorama/images/hud/teamcounter/teamcounter_botavatar.vsvg_c';icons.skull='panorama/images/hud/teamcounter/killtype_default.vsvg_c';icons.headshot='panorama/images/hud/teamcounter/killtype_headshot.vsvg_c';icons.CT='panorama/images/icons/ui/ct_logo_1c.vsvg_c';
for(const[name,path]of Object.entries(icons)){const dest=`${hud}/${name}.svg`;await exportFile(path,dest);if(!(await readFile(dest,'utf8')).includes('<svg'))throw new Error('Missing HUD SVG '+path);}
await writeFile(hud+'/manifest.json',JSON.stringify({source:{app:730,depot:2347770,manifest:'5009084625236407721'},icons:Object.fromEntries(Object.keys(icons).map(k=>[k,k+'.svg'])),sources:icons,reference:refs},null,2));

const definitions=parseKV3(await readFile(reference+'/soundevents/game_sounds_footsteps.vsndevts','utf8'));
const properties=parseKV3(await readFile(reference+'/scripts/surfaceproperties_footsteps.txt','utf8'));
const map=JSON.parse(await readFile('public/assets/source2/map.json','utf8'));
const needed=new Set<string>(['default','concrete','wood','sand',...map.collision.groups.map((g:any)=>g.surface.toLowerCase())]);
const events:Record<string,any>={},surfaces:Record<string,Record<string,{step:string;land:string}>>={CT:{},T:{}};
function resolve(name:string):any{const e=definitions[name];if(!e)throw new Error('Missing movement event '+name);return{...(e.base?resolve(e.base):{}),...e};}
function add(name:string){
 const key=name.toLowerCase();if(events[key])return key;const e=resolve(name);
 const children:string[]=e.enable_child_events?Object.entries(e).filter(([k,v])=>/^soundevent_\d+$/.test(k)&&typeof v==='string'&&v).map(([,v])=>String(v)):[];
 const files=e.vsnd_files_track_01;events[key]={files:typeof files==='string'?[files]:files??[],volume:e.volume??1,volumeRandom:[e.volume_random_min??0,e.volume_random_max??0],pitch:e.pitch??1,pitchRandom:[e.pitch_random_min??0,e.pitch_random_max??0],delay:e.delay??0,cooldown:e.block_duration??.15,limit:2,curve:e.use_distance_volume_mapping_curve?e.distance_volume_mapping_curve:undefined,children:children.map(v=>v.toLowerCase())};
 children.forEach(add);return key;
}
// Missing overrides use a material-family fallback, recorded here rather than guessed at runtime.
function family(surface:string){return /^wood/.test(surface)?'wood':/metal|computer|chainlink/.test(surface)?'solidmetal':/rock|pottery/.test(surface)?'concrete':/rubber/.test(surface)?'rubber':'default';}
for(const side of ['CT','T']){
 const props=new Map<string,any>(properties[side.toLowerCase()+'_player'].SurfacePropertiesList.map((p:any)=>[p.surfacePropertyName.toLowerCase(),p]));
 for(const surface of needed){const entry=props.get(surface),name=entry?.walkleft||props.get(family(surface))?.walkleft||props.get('default').walkleft;const land=name.replace(/^(CT|T)_/,'Land_');surfaces[side][surface]={step:add(name),land:add(definitions[land]?land:'Land_Default.StepLeft')};}
 add('Gear.JumpLand.'+side);
}
const files=[...new Set<string>(Object.values(events).flatMap(e=>e.files))],urls:Record<string,string>={};let cursor=0;
await Promise.all(Array.from({length:4},async()=>{while(cursor<files.length){
 const source=files[cursor++],stem=source.replace(/\.vsnd$/,''),dir=root+'/'+dirname(stem),name=basename(stem);await mkdir(dir,{recursive:true});
 let candidates=(await readdir(dir)).filter(f=>f.startsWith(name+'.')&&['.wav','.mp3','.ogg'].includes(extname(f)));
 if(!candidates.length){await exportFile(source+'_c',root+'/');candidates=(await readdir(dir)).filter(f=>f.startsWith(name+'.')&&['.wav','.mp3','.ogg'].includes(extname(f)));}
 if(candidates.length!==1)throw new Error('Missing or ambiguous footstep '+source);urls[source]=dirname(stem)+'/'+candidates[0];
}}));
for(const e of Object.values(events))e.files=e.files.map((f:string)=>urls[f]);
await writeFile(root+'/audio.json',JSON.stringify(events));await writeFile(root+'/surfaces.json',JSON.stringify(surfaces));
await writeFile(root+'/sources.json',JSON.stringify({app:730,depot:2347770,manifest:'5009084625236407721',definitions:refs.slice(0,2),files:urls},null,2));
const bytes=(await Promise.all(Object.values(urls).map(async p=>(await stat(root+'/'+p)).size))).reduce((a,b)=>a+b,0);
console.log(JSON.stringify({icons:Object.keys(icons).length,surfaces:needed.size,events:Object.keys(events).length,samples:files.length,bytes}));
