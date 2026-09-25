/** Read-only resource closure check. Missing references fail; extras are reported, never deleted. */
import{readFileSync,existsSync,readdirSync,statSync,openSync,readSync,closeSync}from'node:fs';
import{resolve,relative,dirname,extname,sep,isAbsolute}from'node:path';
import{MUSIC_KITS}from'../src/game/music-kits.ts';
export interface AssetAuditOptions{reportExtras?:boolean}
export function auditAssets(publicDirectory:string,options:AssetAuditOptions={}){
const root=resolve(publicDirectory),runtime=new Set<string>(),missing=new Set<string>(),models:string[]=[];
function add(file:string){
  const path=resolve(root,file),local=relative(root,path);if(local==='..'||local.startsWith('..'+sep)||isAbsolute(local))throw new Error('Resource escapes public: '+file);
  if(!existsSync(path)||!statSync(path).isFile()){missing.add(file);return;}if(runtime.has(path))return;
  runtime.add(path);if(['.gltf','.glb'].includes(extname(path)))models.push(path);
}
function json(file:string):any{add(file);if(missing.has(file))throw new Error('Missing manifest: '+file);return JSON.parse(readFileSync(resolve(root,file),'utf8'));}
add('favicon.svg');
const base='assets/source2/',available=existsSync(resolve(root,base+'map.json'));
if(!available)throw new Error('Source 2 assets are required; public/assets/source2/map.json is absent. See docs/LOCAL_CS2.md.');
  const map=json(base+'map.json');for(const key of ['model','skyTexture','lightmap'])if(map[key])add(base+map[key]);
  if(map.skybox)add(base+map.skybox.model);add(base+map.collision.file);if(map.radar)add(base+map.radar.file);
  for(const file of Object.values(map.effects??{}))add(base+file);
  const weapons=json(base+'weapons/manifest.json');json(base+'weapons/data.json');json(base+'weapons/world.json');add(base+'weapons/'+weapons.arms);
  for(const entry of Object.values(weapons.weapons)as any[]){add(base+'weapons/'+entry.model);for(const clip of Object.values(entry.clips)as any[])add(base+'weapons/'+clip.file);}
  for(const [library,modelField]of [['characters','file'],['grenades','model']]){
    for(const entry of Object.values(json(base+library+'/manifest.json').models)as any[]){add(base+library+'/'+entry[modelField]);for(const clip of Object.values(entry.clips??{})as any[])add(base+library+'/'+clip.file);}
  }
  for(const library of ['weapons','grenades','hits','movement','c4']){
    const events=json(base+library+'/audio.json');for(const event of Object.values(events)as any[]){for(const file of event.files)add(base+library+'/'+file);for(const child of event.children??[])if(!events[child])missing.add(library+' event: '+child);}
  }
  const c4=json(base+'c4/manifest.json');add(base+'c4/'+c4.model);add(base+'c4/'+c4.kit);for(const clip of Object.values(c4.clips)as any[])add(base+'c4/'+clip.file);
  json(base+'movement/surfaces.json');const hud=json(base+'hud/manifest.json');for(const icon of Object.values(hud.icons))add(base+'hud/'+icon);
  json(base+'hits/hitboxes.json');json(base+'buy-menu/poses.json');
  const media=json(base+'media/manifest.json');
  for(const group of Object.values(media.radio)as any[])for(const variant of group.variants)for(const file of variant.files)add(base+'media/'+file);
  for(const kit of MUSIC_KITS){
    add(base+'media/covers/'+kit.id+'.png');const entry=media.music[kit.id];if(!entry)throw new Error('Missing music kit: '+kit.id);
    if(entry.sourceName!==kit.source)throw new Error('Wrong music source: '+kit.id);
    for(const event of Object.values(entry.events)as any[])for(const file of event.files)add(base+'media/'+file);
  }
  for(const id of Object.keys(weapons.weapons))add(base+'weapons/icons/'+id+'.svg');
  for(const id of ['he','flash','smoke','molotov','incendiary','decoy'])add(base+'grenades/icons/'+id+'.svg');
  for(const id of ['CT','T','armor','helmet','kit','c4','refund'])add(base+'buy-menu/'+id+'.svg');
  for(const file of ['fire.webp','blast-flame.webp','blast-smoke.webp'])add(base+'grenades/vfx/'+file);
for(const path of models){
  const gltf=readModelJson(path);
  for(const entry of [...gltf.buffers??[],...gltf.images??[]])if(entry.uri&&!entry.uri.startsWith('data:'))add(relative(root,resolve(dirname(path),decodeURIComponent(entry.uri))));
}
function walk(path:string):string[]{return readdirSync(path,{withFileTypes:true}).flatMap(e=>e.isDirectory()?walk(resolve(path,e.name)):e.isFile()?[resolve(path,e.name)]:[]);}
const extras=options.reportExtras===false?[]:walk(root).filter(p=>!runtime.has(p)),metadata=extras.filter(p=>extname(p)==='.vsnd');
return{files:runtime.size,bytes:[...runtime].reduce((n,p)=>n+statSync(p).size,0),models:models.length,missing:[...missing],nonRuntime:{audioMetadata:metadata.length,other:extras.filter(p=>!metadata.includes(p)).map(p=>relative(root,p))}};
}

/** Read only the GLB JSON chunk; texture/binary payloads are not needed for a path audit. */
function readModelJson(path:string){
  if(extname(path)==='.gltf')return JSON.parse(readFileSync(path,'utf8'));
  const fd=openSync(path,'r');
  try{
    const header=Buffer.alloc(20);
    if(readSync(fd,header,0,20,0)!==20||header.readUInt32LE(0)!==0x46546c67||header.readUInt32LE(4)!==2||header.readUInt32LE(16)!==0x4e4f534a)throw new Error('Invalid GLB header: '+path);
    const length=header.readUInt32LE(12);if(length>statSync(path).size-20)throw new Error('Truncated GLB: '+path);
    const json=Buffer.alloc(length);let offset=0;
    while(offset<length){const read=readSync(fd,json,offset,length-offset,20+offset);if(!read)throw new Error('Truncated GLB JSON: '+path);offset+=read;}
    return JSON.parse(json.toString());
  }finally{closeSync(fd);}
}
