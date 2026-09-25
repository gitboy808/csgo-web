import{NodeIO}from'@gltf-transform/core';import{ALL_EXTENSIONS,EXTMeshoptCompression}from'@gltf-transform/extensions';import{prune,textureCompress}from'@gltf-transform/functions';import{MeshoptEncoder,MeshoptDecoder}from'meshoptimizer';import sharp from'sharp';import{readFile,writeFile,mkdir}from'node:fs/promises';
const config=JSON.parse(await readFile('scripts/source2-grenades.json','utf8')),target='public/assets/source2/grenades';await mkdir(target,{recursive:true});await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});sharp.concurrency(2);sharp.cache({memory:128});
const manifest:any={source:{app:730,depot:2347770,manifest:'5009084625236407721'},models:{}};
const data=JSON.parse(await readFile('local-assets/grenades/weapons.json','utf8')),names:any={he:'weapon_hegrenade',flash:'weapon_flashbang',smoke:'weapon_smokegrenade',molotov:'weapon_molotov',incendiary:'weapon_incgrenade',decoy:'weapon_decoy'};
for(const id of Object.keys(config.models)){
 const doc=await io.read(`local-assets/grenades/export/${id}/model.gltf`),corrected=new Set<object>();
 for(const mat of doc.getRoot().listMaterials()){
  const ao=mat.getOcclusionTexture(),source=(mat.getExtras()as any).vmat?.TextureParams?.g_tAmbientOcclusion;if(!ao||!source||corrected.has(ao))continue;corrected.add(ao);
  const packed=await sharp(ao.getImage()!).ensureAlpha().raw().toBuffer({resolveWithObject:true});const original=await sharp(`local-assets/grenades/raw/${source.replace(/\.vtex$/,'.png')}`).extractChannel(0).resize(packed.info.width,packed.info.height).raw().toBuffer();
  let red=0,blue=0;for(let i=0;i<original.length;i+=4){red+=Math.abs(packed.data[i*4]-original[i]);blue+=Math.abs(packed.data[i*4+2]-original[i]);}
  if(blue<red*.2){for(let i=0;i<packed.data.length;i+=4){const r=packed.data[i];packed.data[i]=packed.data[i+2];packed.data[i+2]=r;}ao.setImage(await sharp(packed.data,{raw:{width:packed.info.width,height:packed.info.height,channels:4}}).png().toBuffer());mat.setExtras({...mat.getExtras(),source2OrmCorrected:true});}
 }
 // A grenade occupies only a small screen region, even in the viewmodel. 2K
 // preserves markings while bounding GPU texture residency for six new assets.
 await doc.transform(prune({keepAttributes:true,keepExtras:true}),textureCompress({encoder:sharp,targetFormat:'webp',lossless:true,resize:[2048,2048],effort:5}));
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});await mkdir(`${target}/${id}`,{recursive:true});await io.write(`${target}/${id}/model.glb`,doc);
 const clips:any={};for(const role of Object.keys(config.clips[id])){
  const clip=await io.read(`local-assets/grenades/export/${id}/${role}.gltf`);for(const n of clip.getRoot().listNodes())if(n.getMesh())n.setMesh(null);
  await clip.transform(prune({keepAttributes:true,keepLeaves:true}));clip.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});await io.write(`${target}/${id}/${role}.glb`,clip);
  clips[role]={file:`${id}/${role}.glb`,...JSON.parse(await readFile(`local-assets/grenades/export/${id}/${role}.gltf.events.json`,'utf8'))};
 }
 const original=data[names[id]];manifest.models[id]={model:`${id}/model.glb`,clips,source:config.models[id],parameters:{price:original.m_nPrice,throwVelocity:original.m_flThrowVelocity*.0254,maxSpeed:original.m_flMaxSpeed[0]*.0254,damage:original.m_nDamage,armorRatio:original.m_flArmorRatio,range:original.m_flRange*.0254,deploy:original.m_flDeployDuration},original};console.log(id,'packed');
}
await writeFile(target+'/manifest.json',JSON.stringify(manifest));
