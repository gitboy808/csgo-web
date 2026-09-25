import { NodeIO,PropertyType } from '@gltf-transform/core';
import { ALL_EXTENSIONS,EXTMeshoptCompression } from '@gltf-transform/extensions';
import { dedup,prune,reorder,textureCompress } from '@gltf-transform/functions';
import { MeshoptEncoder,MeshoptDecoder } from 'meshoptimizer';
import sharp from 'sharp';
import { mkdir,readFile,writeFile } from 'node:fs/promises';
import { dirname,resolve } from 'node:path';

const input=process.argv[2]||'local-assets/export-current/de_dust2.gltf';
const output=process.argv[3]||'public/assets/source2/de_dust2.gltf';
const json=JSON.parse(await readFile(input,'utf8'));
const missing:string[]=[];
for(const image of json.images||[]){if(!image.uri)continue;try{await readFile(resolve(dirname(input),image.uri));}catch{missing.push(image.uri);}}
if(missing.length)throw new Error(`Incomplete source textures (${missing.length}): ${missing.slice(0,5).join(', ')}`);
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
const doc=await io.read(input);
const aoStats=new Map<string,number>();
for(const material of doc.getRoot().listMaterials()){
  const source=(material.getExtras() as any).vmat||{};
  material.setMetallicFactor(Math.max(0,Math.min(1,source.FloatParams?.g_flMetalness??source.VectorParams?.TextureMetalness?.[0]??0)));
  const texture=material.getOcclusionTexture();if(!texture)continue;
  const key=texture.getURI()||texture.getName();
  if(!aoStats.has(key))aoStats.set(key,(await sharp(texture.getImage()!).stats()).channels[0].max);
  // Source defaults use zero to mean no authored occlusion. glTF interprets zero
  // as fully occluded, which otherwise removes all bounced/ambient light.
  if(aoStats.get(key)===0){material.setOcclusionTexture(null);material.setExtras({...material.getExtras(),source2NoOcclusion:true});}
}
let hiddenPrimitives=0,triangles=0;
for(const mesh of doc.getRoot().listMeshes()){
  for(const primitive of [...mesh.listPrimitives()]){
    const material=primitive.getMaterial(),source=(material?.getExtras() as any)?.vmat?.Name||'';
    if(source.startsWith('materials/tools/')){mesh.removePrimitive(primitive);primitive.dispose();hiddenPrimitives++;}
    else triangles+=(primitive.getIndices()?.getCount()||primitive.getAttribute('POSITION')!.getCount())/3;
  }
  if(!mesh.listPrimitives().length){for(const node of doc.getRoot().listNodes())if(node.getMesh()===mesh)node.setMesh(null);}
}
console.log(`Preparing ${triangles.toLocaleString()} visible triangles; excluded ${hiddenPrimitives} tool-only primitives.`);
// Meshopt's QUANTIZE encoder method is lossless here: no quantize() or simplify()
// transform is run. Original float positions, UVs, normals and all triangle faces remain.
await doc.transform(dedup({propertyTypes:[PropertyType.ACCESSOR,PropertyType.TEXTURE]}),prune({keepExtras:true,keepAttributes:true,keepSolidTextures:true}),reorder({encoder:MeshoptEncoder,target:'performance'}));
doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
sharp.concurrency(2);sharp.cache({memory:128});
await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',lossless:true,effort:10}));
await mkdir(dirname(output),{recursive:true});
await io.write(output,doc);
const metadata={source:input,model:output,triangles,meshes:doc.getRoot().listMeshes().length,materials:doc.getRoot().listMaterials().length,textures:doc.getRoot().listTextures().length,positions:'original float32, no quantization',texturesMode:'lossless WebP, original dimensions'};
await writeFile(output+'.report.json',JSON.stringify(metadata,null,2));
console.log(JSON.stringify(metadata));
