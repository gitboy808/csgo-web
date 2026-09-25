import {NodeIO} from '@gltf-transform/core';
import {ALL_EXTENSIONS,EXTMeshoptCompression} from '@gltf-transform/extensions';
import {prune,textureCompress} from '@gltf-transform/functions';
import {MeshoptEncoder,MeshoptDecoder} from 'meshoptimizer';
import sharp from 'sharp';
import {Matrix4,Quaternion,Vector3} from 'three';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
const target='public/assets/source2/characters',config=JSON.parse(await readFile('scripts/source2-characters.json','utf8'));
await MeshoptEncoder.ready;await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({'meshopt.encoder':MeshoptEncoder,'meshopt.decoder':MeshoptDecoder});
sharp.concurrency(2);sharp.cache({memory:128});await mkdir(target,{recursive:true});
const manifest:any={format:1,source:{app:730,depot:2347770,manifest:'5009084625236407721'},models:{}};
const reference=await io.read('local-assets/characters/world-skeleton.gltf');
const referenceWorld=new Map(reference.getRoot().listNodes().map(n=>[n.getName(),new Matrix4().fromArray(n.getWorldMatrix())]));
for(const side of ['CT','T']){
 const doc=await io.read(`local-assets/characters/export/${side}/model.gltf`);
 // Agent files include separate first-person arms and secondary weapon skeleton
 // previews. The world uses only third-person body/gloves and the CT defuse kit.
 for(const node of [...doc.getRoot().listNodes()])if(node.getName().startsWith('animation/skeletons/weapons/')){
   const descendants:typeof node[]=[];node.traverse(n=>descendants.push(n));for(const child of descendants.reverse())child.dispose();
 }
 for(const node of doc.getRoot().listNodes())if(node.getName().includes('.firstperson_'))node.setMesh(null);
 const retargetWorld=new Map<object,Matrix4>(),neutral=new Map<object,{position:Vector3;rotation:Quaternion}>();
 for(const scene of doc.getRoot().listScenes())scene.traverse(node=>{
   const parent=node.getParentNode(),parentWorld=parent?retargetWorld.get(parent)!:new Matrix4();
   const world=referenceWorld.get(node.getName())?.clone()??parentWorld.clone().multiply(new Matrix4().fromArray(node.getMatrix()));retargetWorld.set(node,world);
   const local=parentWorld.clone().invert().multiply(world),position=new Vector3(),rotation=new Quaternion();local.decompose(position,rotation,new Vector3());neutral.set(node,{position,rotation});
 });
 for(const animation of doc.getRoot().listAnimations()){
   const path=animation.getName()+'.vnmclip_c';const role=Object.keys(config.clips).find(k=>config.clips[k]===path);if(!role)throw new Error(path);
   animation.setName(role);
   if(animation.getExtras().additive===true)for(const channel of animation.listChannels()){
     const node=channel.getTargetNode()!,base=neutral.get(node);if(!base)continue;const output=channel.getSampler()!.getOutput()!,array=output.getArray()!;
     // VRF subtracts the agent bind pose, but locomotion is authored on the world
     // skeleton, whose root/weapon pivots use a different basis. Rebase deltas on
     // that skeleton's retargeted neutral pose before layering them over motion.
     if(channel.getTargetPath()==='translation'){const offset=new Vector3().fromArray(node.getTranslation()).sub(base.position);for(let i=0;i<array.length;i+=3){array[i]+=offset.x;array[i+1]+=offset.y;array[i+2]+=offset.z;}}
     if(channel.getTargetPath()==='rotation'){const offset=base.rotation.clone().invert().multiply(new Quaternion().fromArray(node.getRotation()));for(let i=0;i<array.length;i+=4){const q=offset.clone().multiply(new Quaternion().fromArray(array,i)).normalize();q.toArray(array,i);}}
   }
   // Navigation owns planar motion. Keep vertical pose/foot motion but strip
   // root travel to prevent actors walking away from their collision capsule.
   if(/_(run_|walk_|crouch_|inair_)/.test(role))for(const channel of animation.listChannels()){
     if(channel.getTargetNode()?.getName()==='root_motion'&&channel.getTargetPath()==='translation'){
       const output=channel.getSampler()!.getOutput()!,array=output.getArray()!;for(let i=0;i<array.length;i+=3){array[i]=0;array[i+2]=0;}
     }
   }
 }
 await doc.transform(prune({keepAttributes:true,keepExtras:true,keepSolidTextures:true}));
 const corrected=new Set<object>();
 for(const mat of doc.getRoot().listMaterials()){
   const ao=mat.getOcclusionTexture(),source=(mat.getExtras()as any).vmat?.TextureParams?.g_tAmbientOcclusion;
   if(!ao||!source||corrected.has(ao))continue;corrected.add(ao);
   const packed=await sharp(ao.getImage()!).ensureAlpha().raw().toBuffer({resolveWithObject:true});
   const original=await sharp(`local-assets/characters/raw/${source.replace(/\.vtex$/,'.png')}`).extractChannel(0).resize(packed.info.width,packed.info.height).raw().toBuffer();
   let red=0,blue=0;for(let i=0;i<original.length;i+=4){red+=Math.abs(packed.data[i*4]-original[i]);blue+=Math.abs(packed.data[i*4+2]-original[i]);}
   if(blue<red*.2){for(let i=0;i<packed.data.length;i+=4){const r=packed.data[i];packed.data[i]=packed.data[i+2];packed.data[i+2]=r;}ao.setImage(await sharp(packed.data,{raw:{width:packed.info.width,height:packed.info.height,channels:4}}).png().toBuffer()).setMimeType('image/png');mat.setExtras({...mat.getExtras(),source2OrmCorrected:true});console.log(side,'Corrected ORM:',mat.getName());}
 }
 await doc.transform(textureCompress({encoder:sharp,targetFormat:'webp',lossless:true,effort:6}));
 doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({method:EXTMeshoptCompression.EncoderMethod.QUANTIZE});
 await io.write(`${target}/${side}.glb`,doc);
 manifest.models[side]={file:side+'.glb',name:side==='CT'?'SAS':'Phoenix',source:config.models[side],animations:Object.fromEntries(doc.getRoot().listAnimations().map(a=>[a.getName(),{additive:a.getExtras().additive===true}]))};
 console.log(side,doc.getRoot().listMeshes().length,'world meshes;',doc.getRoot().listAnimations().length,'animations');
}
await writeFile(target+'/manifest.json',JSON.stringify(manifest));
