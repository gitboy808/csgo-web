import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {prune,textureCompress} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {dirname} from 'node:path';

const target='public/assets/source2/weapons',config=JSON.parse(await readFile('local-assets/weapons/config.json','utf8'));
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
sharp.concurrency(2);sharp.cache({memory:128});
const manifest:any={format:1,arms:'arms/model.glb',weapons:{}};
async function pack(input:string,output:string,model:boolean){
  const doc=await io.read(input);
  if(model){
    const hasHD=doc.getRoot().listMeshes().some(m=>m.getName().endsWith('.body_hd'));
    if(hasHD)for(const node of doc.getRoot().listNodes())if(node.getMesh()?.getName().endsWith('.body_legacy'))node.setMesh(null);
    for(const mesh of doc.getRoot().listMeshes())for(const primitive of [...mesh.listPrimitives()])if(primitive.getMaterial()?.getName()==='sticker_gaps'){mesh.removePrimitive(primitive);primitive.dispose();}
    await doc.transform(prune({keepAttributes:true,keepExtras:false,keepSolidTextures:true}));
    const corrected=new Set<object>();
    for(const mat of doc.getRoot().listMaterials()){
      const ao=mat.getOcclusionTexture(),source=(mat.getExtras()as any).vmat?.TextureParams?.g_tAmbientOcclusion;
      if(!ao||!source||corrected.has(ao))continue;corrected.add(ao);
      const reference=`local-assets/weapons/raw/${source.replace(/\.vtex$/,'.png')}`;
      const packed=await sharp(ao.getImage()!).ensureAlpha().raw().toBuffer({resolveWithObject:true});
      const original=await sharp(reference).extractChannel(0).resize(packed.info.width,packed.info.height).raw().toBuffer();
      let red=0,blue=0;
      for(let i=0;i<original.length;i+=4){red+=Math.abs(packed.data[i*4]-original[i]);blue+=Math.abs(packed.data[i*4+2]-original[i]);}
      // Some VRF ORM composites have R/B swapped. Compare against the decoded source
      // AO rather than guessing from its average brightness or changing the material.
      if(blue<red*.2){
        for(let i=0;i<packed.data.length;i+=4){const r=packed.data[i];packed.data[i]=packed.data[i+2];packed.data[i+2]=r;}
        ao.setImage(await sharp(packed.data,{raw:{width:packed.info.width,height:packed.info.height,channels:4}}).png().toBuffer()).setMimeType('image/png');
        mat.setExtras({...mat.getExtras(),source2OrmCorrected:true});console.log('Corrected ORM channels:',mat.getName());
      }
    }
  }
  await doc.transform(prune({keepAttributes:true,keepExtras:false,keepSolidTextures:true}));
  if(model)await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',lossless:true,effort:6}));
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
  await mkdir(dirname(output),{recursive:true});await io.write(output,doc);
  return {meshes:doc.getRoot().listMeshes().length,materials:doc.getRoot().listMaterials().length,animations:doc.getRoot().listAnimations().length};
}
for(const id of ['arms',...Object.keys(config)]){
  const model=`${id}/model.glb`,stats=await pack(`local-assets/weapons/export/${id}/model.gltf`,`${target}/${model}`,true);
  if(config[id]){
    const clips:Record<string,any>={};
    for(const role of Object.keys(config[id].clips)){
      const file=`${id}/${role}.glb`;await pack(`local-assets/weapons/export/${id}/${role}.gltf`,`${target}/${file}`,false);
      clips[role]={file,...JSON.parse(await readFile(`local-assets/weapons/export/${id}/${role}.gltf.events.json`,'utf8'))};
    }
    manifest.weapons[id]={model,clips,source:config[id].model};
  }
  console.log(id,stats);
}
await writeFile(`${target}/manifest.json`,JSON.stringify(manifest));
console.log('Native weapon library prepared.');
