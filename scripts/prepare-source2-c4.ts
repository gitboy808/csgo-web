import{execFile}from'node:child_process';import{promisify}from'node:util';
import{mkdir,readFile,writeFile,readdir,stat}from'node:fs/promises';import{dirname,basename,extname}from'node:path';
import{NodeIO}from'@gltf-transform/core';import{ALL_EXTENSIONS,EXTMeshoptCompression}from'@gltf-transform/extensions';import{prune,textureCompress}from'@gltf-transform/functions';import{MeshoptEncoder,MeshoptDecoder}from'meshoptimizer';import sharp from'sharp';
const run=promisify(execFile),base='local-assets/c4',target='public/assets/source2/c4',vpk='local-assets/cs2/game/csgo/pak01_dir.vpk',cli='.local-tools/source2/Source2Viewer-CLI';
await mkdir(base+'/export',{recursive:true});await mkdir(target,{recursive:true});
const sources={model:'weapons/models/c4/weapon_c4.vmdl_c',kit:'weapons/models/defuser/defuser.vmdl_c',idle:'animation/anims/viewmodel/equipment/c4/idle_c4.vnmclip_c',draw:'animation/anims/viewmodel/equipment/c4/draw_c4.vnmclip_c',plant:'animation/anims/viewmodel/equipment/c4/plant_c4.vnmclip_c',inspect:'animation/anims/viewmodel/equipment/c4/lookat01_c4.vnmclip_c'};
for(const[name,path]of Object.entries(sources)){
 const{stdout}=await run('.local-tools/dotnet/dotnet',['scripts/source2-helper/bin/Debug/net10.0/source2-helper.dll',name==='kit'?'export':'export-animated',vpk,path,`${base}/export/${name}.gltf`],{maxBuffer:8*1024*1024});await writeFile(`${base}/export/${name}.log`,stdout);
}
await MeshoptEncoder.ready;await MeshoptDecoder.ready;sharp.concurrency(2);sharp.cache({memory:64});
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder}),manifest:any={source:{app:730,depot:2347770,manifest:'5009084625236407721'},model:'model.glb',kit:'kit.glb',clips:{},sources};
for(const name of Object.keys(sources)){
 const model=name==='model'||name==='kit',doc=await io.read(`${base}/export/${name}.gltf`);
 if(model){
  for(const animation of doc.getRoot().listAnimations())animation.dispose();
  for(const mesh of doc.getRoot().listMeshes())for(const primitive of [...mesh.listPrimitives()])if(primitive.getMaterial()?.getName()==='sticker_gaps'){mesh.removePrimitive(primitive);primitive.dispose();}
  const fixed=new Set<object>();for(const m of doc.getRoot().listMaterials()){
   const ao=m.getOcclusionTexture(),path=(m.getExtras()as any).vmat?.TextureParams?.g_tAmbientOcclusion;if(!ao||!path||fixed.has(ao))continue;fixed.add(ao);
   const file=base+'/raw/'+path.replace(/\.vtex$/,'.png');await mkdir(dirname(file),{recursive:true});await run(cli,['-i',vpk,'-f',path+'_c','-o',file,'-d']);
   const packed=await sharp(ao.getImage()!).ensureAlpha().raw().toBuffer({resolveWithObject:true}),original=await sharp(file).extractChannel(0).resize(packed.info.width,packed.info.height).raw().toBuffer();let red=0,blue=0;
   for(let i=0;i<original.length;i+=4){red+=Math.abs(packed.data[i*4]-original[i]);blue+=Math.abs(packed.data[i*4+2]-original[i]);}
   if(blue<red*.2){for(let i=0;i<packed.data.length;i+=4){const r=packed.data[i];packed.data[i]=packed.data[i+2];packed.data[i+2]=r;}ao.setImage(await sharp(packed.data,{raw:{width:packed.info.width,height:packed.info.height,channels:4}}).png().toBuffer());m.setExtras({...m.getExtras(),source2OrmCorrected:true});}
  }
  await doc.transform(prune({keepAttributes:true,keepExtras:true}),textureCompress({encoder:sharp,targetFormat:'webp',resize:[2048,2048],lossless:true,effort:5}));
 }else{
  for(const n of doc.getRoot().listNodes())if(n.getMesh())n.setMesh(null);await doc.transform(prune({keepAttributes:true,keepLeaves:true}));
  manifest.clips[name]={file:name+'.glb',...JSON.parse(await readFile(`${base}/export/${name}.gltf.events.json`,'utf8'))};
 }
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});await io.write(`${target}/${name}.glb`,doc);
 console.log(name,doc.getRoot().listMeshes().length,doc.getRoot().listMaterials().map(m=>m.getName()));
}
const definitions=JSON.parse(await readFile('local-assets/weapons/sound-events.json','utf8')),events:Record<string,any>={};
const names=new Set<string>(Object.values(manifest.clips).flatMap((c:any)=>c.sounds.map((s:any)=>s.name)));for(const name of Object.keys(definitions))if(/^c4\./i.test(name))names.add(name);
// Shared Draw.Gear is already decoded by the grenade bank before play begins.
// Do not export a second copy that prepareAdditional would load and then overwrite.
for(const name of names){if(!name.toLowerCase().startsWith('c4.'))continue;const e=definitions[name];if(!e)continue;const files=Object.entries(e).filter(([k])=>k.startsWith('vsnd_files')).flatMap(([,v])=>typeof v==='string'?[v]:v as string[]);if(files.length)events[name.toLowerCase()]={files,volume:e.volume??1,pitch:e.pitch??1};}
const urls:Record<string,string>={};
for(const path of new Set<string>(Object.values(events).flatMap(e=>e.files))){await run(cli,['-i',vpk,'-f',path+'_c','-o',target+'/audio/','-d'],{maxBuffer:2*1024*1024});const stem=path.replace(/\.vsnd$/,''),dir=target+'/audio/'+dirname(stem),files=(await readdir(dir)).filter(f=>f.startsWith(basename(stem)+'.')&&['.wav','.mp3','.ogg'].includes(extname(f)));if(files.length!==1)throw new Error('Missing C4 audio '+path);urls[path]='audio/'+dirname(stem)+'/'+files[0];}
for(const e of Object.values(events))e.files=e.files.map((f:string)=>urls[f]);
await writeFile(target+'/audio.json',JSON.stringify(events));await writeFile(target+'/manifest.json',JSON.stringify(manifest));
console.log(JSON.stringify({files:Object.keys(sources).length,sounds:Object.keys(urls).length,modelBytes:(await stat(target+'/model.glb')).size}));
