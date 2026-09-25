import {NodeIO} from '@gltf-transform/core';
import {readFile,writeFile} from 'node:fs/promises';
const base='local-assets/buy-menu/poses/',sources=JSON.parse(await readFile(base+'sources.json','utf8'));
const poses:Record<string,unknown>={};const io=new NodeIO();
for(const side of ['CT','T']){
  const doc=await io.read(base+side+'.gltf'),roles:Record<string,unknown>={};
  for(const animation of doc.getRoot().listAnimations()){
    if(animation.getExtras().additive)throw new Error('Buy-menu poses must be absolute: '+animation.getName());
    const role=Object.keys(sources[side]).find(key=>sources[side][key]===animation.getName()+'.vnmclip_c');if(!role)throw new Error(animation.getName());
    const nodes:Record<string,Record<string,number[]>>={};
    for(const channel of animation.listChannels()){
      const node=channel.getTargetNode()!,sampler=channel.getSampler()!,output=sampler.getOutput()!,array=output.getArray()!,size=output.getElementSize();
      const value=Array.from(array.slice(0,size),Number),path=channel.getTargetPath();if(!path)throw new Error('Missing pose channel path');(nodes[node.getName()]??={})[path]=value;
    }
    roles[role]=nodes;
  }
  if(Object.keys(roles).length!==Object.keys(sources[side]).length)throw new Error('Missing buy poses: '+side);
  poses[side]=roles;
}
const target='public/assets/source2/buy-menu/poses.json';
await writeFile(target,JSON.stringify({source:{app:730,depot:2347770,manifest:'5009084625236407721'},clips:sources,poses}));
console.log('Packed static menu bone poses only; existing agent meshes/textures are reused.');
