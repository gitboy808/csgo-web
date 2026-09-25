import {readFile} from 'node:fs/promises';
import {dirname,resolve} from 'node:path';
import {NodeIO} from '@gltf-transform/core';
import {EXTMeshoptCompression} from '@gltf-transform/extensions';
import {MeshoptDecoder} from 'meshoptimizer';
import * as T from 'three';
import {Physics} from '../src/game/physics';
import {source2WorldMatrix,source2SkyboxMatrix} from '../src/world/source2-transform';
import {Source2Layers} from '../src/world/source2-layers';
import {restoreSurfaceGeometry} from '../src/world/source2-surfaces';
import type {Source2MapData} from '../src/world/source2-types';

const root='public/assets/source2',data=JSON.parse(await readFile(`${root}/map.json`,'utf8'))as Source2MapData;
await MeshoptDecoder.ready;
const io=new NodeIO().registerExtensions([EXTMeshoptCompression]).registerDependencies({'meshopt.decoder':MeshoptDecoder});
const scene=new T.Scene(),layers=new Source2Layers(scene);
for(const [file,transform,kind]of [[data.model,source2WorldMatrix(),'world'],[data.skybox!.model,source2SkyboxMatrix(data.skybox!),'skybox']]as const){
  const path=resolve(root,file),json=JSON.parse(await readFile(path,'utf8')),resources:Record<string,Uint8Array<ArrayBuffer>>={};
  for(const buffer of json.buffers)if(buffer.uri)resources[buffer.uri]=new Uint8Array(await readFile(resolve(dirname(path),buffer.uri)));
  json.images=[];json.textures=[];json.materials=json.materials.map((m:any)=>({name:m.name,extras:m.extras}));json.extensionsUsed=['EXT_meshopt_compression'];json.extensionsRequired=['EXT_meshopt_compression'];
  const doc=await io.readJSON({json,resources});
  const content=new T.Group();
  for(const node of doc.getRoot().listNodes())for(const primitive of node.getMesh()?.listPrimitives()||[]){
    const source=primitive.getMaterial()?.getExtras().vmat as any;
    if(/tools\/|effects|overlay|foliage|clouds/.test(`${source?.Name}/${source?.ShaderName}`))continue;
    const attribute=primitive.getAttribute('POSITION')!,geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.BufferAttribute(attribute.getArray() as Float32Array,3));
    const normal=primitive.getAttribute('NORMAL');if(normal)geometry.setAttribute('normal',new T.BufferAttribute(normal.getArray()as Float32Array,3));
    const indices=primitive.getIndices();if(indices)geometry.setIndex(new T.BufferAttribute(indices.getArray()as Uint32Array,1));
    const mesh=new T.Mesh(geometry,new T.MeshBasicMaterial({side:T.DoubleSide}));mesh.material.userData.vmat=source;restoreSurfaceGeometry(mesh);mesh.name=primitive.getMaterial()?.getName()||'';mesh.userData.kind=kind;mesh.matrix.copy(new T.Matrix4().fromArray(node.getWorldMatrix()).premultiply(kind==='world'?transform:new T.Matrix4()));mesh.matrixAutoUpdate=false;content.add(mesh);
  }
  if(kind==='skybox')layers.addSkybox(content,data.skybox!);else scene.add(content);
}
scene.updateMatrixWorld(true);
const physics=new Physics(),bytes=await readFile(`${root}/collision.bin`);await physics.init(data,bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength));
let failures=0;
for(const [i,source] of data.spawns.CT.entries()){
  const spawn=physics.spawnPoint(source),ray=new T.Raycaster(new T.Vector3(spawn.x,spawn.y+3,spawn.z),new T.Vector3(0,-1,0),0,3.5);
  const hits=ray.intersectObjects(layers.foreground.children,true).filter(h=>Math.abs(h.face!.normal.y)>.2),first=hits[0],height=first?.point.y??-999,delta=height-spawn.y;
  const pass=Math.abs(delta)<.25;if(!pass)failures++;
  console.log(`${pass?'PASS':'FAIL'} CT ${i}: collider=${spawn.y.toFixed(3)}, visible=${height.toFixed(3)}, delta=${delta.toFixed(3)}m; ${first?.object.userData.kind}/${first?.object.name}`);
}
if(failures)throw new Error(`${failures} spawn positions are buried by visible ground`);
