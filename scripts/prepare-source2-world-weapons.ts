import {NodeIO} from '@gltf-transform/core';
import {writeFile} from 'node:fs/promises';
const doc=await new NodeIO().read('local-assets/characters/export/CT/model.gltf'),result:Record<string,unknown>={};
for(const [id,stem,skeleton]of [['ak47','ak','ak47'],['m4a1','m4a1s','m4a1_silencer'],['awp','awp','awp'],['usp','usp','usp_silencer'],['glock','glock','glock18'],['deagle','deagle','deagle']]){
 const root=doc.getRoot().listNodes().find(n=>n.getName()===`animation/skeletons/weapons/${skeleton}.vnmskel`)!;
 const nodes=new Set<object>();root.traverse(n=>nodes.add(n));const clips:Record<string,unknown>={};
 for(const [role,name]of [['reload','reload_'+stem],['fire','shoot_'+stem]]){
  const animation=doc.getRoot().listAnimations().find(a=>a.getName().endsWith('/'+name))!,tracks:any[]=[];
  for(const ch of animation.listChannels()){
   const node=ch.getTargetNode()!;if(!nodes.has(node))continue;
   const sampler=ch.getSampler()!,path=ch.getTargetPath();if(!path)continue;tracks.push({name:node.getName()+'.'+({translation:'position',rotation:'quaternion',scale:'scale'}as Record<string,string>)[path],type:path==='rotation'?'quaternion':'vector',times:Array.from(sampler.getInput()!.getArray()!),values:Array.from(sampler.getOutput()!.getArray()!)});
  }
  if(tracks.length)clips[role]={duration:Math.max(...tracks.flatMap(t=>t.times)),additive:role==='fire',tracks};
 }
 result[id]=clips;
}
await writeFile('public/assets/source2/weapons/world.json',JSON.stringify(result));console.log('Prepared original world weapon reload/fire skeleton tracks.');
