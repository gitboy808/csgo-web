import { NodeIO, type Node as GltfNode, type Primitive } from '@gltf-transform/core';
import { Matrix4, Vector3, Box3 } from 'three';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { Source2Navigation } from '../src/game/source2-navigation';
import type { Source2MapData, Source2NavArea, Source2Volume, Source2CollisionGroup } from '../src/world/source2-types';
import type { Vec3,Side } from '../src/game/types';

const output='public/assets/source2';
await mkdir(output,{recursive:true});
const io=new NodeIO();
const nativeNav=JSON.parse(await readFile('local-assets/extracted/navigation.json','utf8')) as {version:number;areas:Source2NavArea[]};
const nav=new Source2Navigation(nativeNav.areas);
const entities=JSON.parse(await readFile('local-assets/references/entities.json','utf8')) as Record<string,any>[];
const canonical=new Matrix4().makeRotationY(Math.PI/2);
const point=(x:number,y:number,z:number):Vec3=>({x:x*.0254,y:z*.0254,z:-y*.0254});
const asPlain=(v:Vec3):Vec3=>({x:v.x,y:v.y,z:v.z});

function geometry(node:GltfNode,primitive:Primitive){
  const matrix=new Matrix4().fromArray(node.getWorldMatrix()).premultiply(canonical);
  const accessor=primitive.getAttribute('POSITION')!,source=accessor.getArray()!,positions=new Float32Array(accessor.getCount()*3);
  const tmp=new Vector3();
  for(let i=0;i<accessor.getCount();i++){tmp.set(source[i*3],source[i*3+1],source[i*3+2]).applyMatrix4(matrix);positions.set([tmp.x,tmp.y,tmp.z],i*3);}
  const indices=primitive.getIndices()?.getArray()??Uint32Array.from({length:accessor.getCount()},(_,i)=>i);
  return {positions,indices};
}
function bounds(node:GltfNode):Box3 {
  const box=new Box3(),v=new Vector3();
  for(const primitive of node.getMesh()!.listPrimitives()){const g=geometry(node,primitive);for(let i=0;i<g.positions.length;i+=3)box.expandByPoint(v.fromArray(g.positions,i));}
  return box;
}
const labels:Record<string,string>={TSpawn:'T 出生点',CTSpawn:'CT 出生点',TRamp:'T 斜坡',OutsideTunnel:'隧道入口',UpperTunnel:'上层隧道',LowerTunnel:'下层隧道',TunnelStairs:'隧道楼梯',Middle:'中路',TopofMid:'中路上方',OutsideLong:'A 门外',LongDoors:'A 门',LongA:'A 大',ARamp:'A 斜坡',BombsiteA:'A 包点',UnderA:'A 点下方',ExtendedA:'A 小平台',ShortStairs:'A 小楼梯',Catwalk:'A 小道',MidDoors:'中门',BDoors:'B 门',Hole:'B 窗',BombsiteB:'B 包点',Pit:'大坑',Side:'大坑侧道'};
const entityPhysics=await io.read('local-assets/geometry-only/de_dust2_physics.gltf');
const placeEntities=entities.filter(e=>e.classname==='env_cs_place');
let placeIndex=0,bombIndex=0,buyIndex=0;
const places:Source2Volume[]=[],siteVolumes:Source2Volume[][]=[[],[]],buyzones:Record<Side,Source2Volume[]>={T:[],CT:[]};
for(const node of entityPhysics.getRoot().listNodes()){
  if(!node.getMesh())continue;
  const name=node.getName(),box=bounds(node);
  const volume=(label:string,callout:string):Source2Volume=>({name:label,callout,min:asPlain(box.min),max:asPlain(box.max)});
  if(name==='env_cs_place'){const e=placeEntities[placeIndex++];places.push(volume(labels[e.place_name]||e.place_name,e.place_name));}
  if(name==='func_bomb_target'){const e=entities.filter(e=>e.classname==='func_bomb_target')[bombIndex++];const index=Number(e.bomb_site_designation);siteVolumes[index].push(volume(index?'B 包点':'A 包点',index?'B':'A'));}
  if(name==='func_buyzone'){const e=entities.filter(e=>e.classname==='func_buyzone')[buyIndex++];const side=e.teamnum===2?'T':'CT';buyzones[side].push(volume(`${side} 购买区域`,side));}
}
if(placeIndex!==placeEntities.length)throw new Error('Original place volumes do not match their entity definitions.');

const chunks:Buffer[]=[];const groups:Source2CollisionGroup[]=[];let byteOffset=0,triangles=0;
function append(node:GltfNode){
  const meta=node.getExtras() as {SurfaceProperty?:string;InteractAs?:string[]};
  for(const primitive of node.getMesh()!.listPrimitives()){
    const raw=geometry(node,primitive);
    const weld=new Map<string,number>(),vertices:number[]=[],mapping=new Uint32Array(raw.positions.length/3);
    for(let i=0;i<mapping.length;i++){
      const x=raw.positions[i*3],y=raw.positions[i*3+1],z=raw.positions[i*3+2],key=`${x.toFixed(5)},${y.toFixed(5)},${z.toFixed(5)}`;
      let index=weld.get(key);if(index===undefined){index=vertices.length/3;weld.set(key,index);vertices.push(x,y,z);}mapping[i]=index;
    }
    const ids=Uint32Array.from(raw.indices as ArrayLike<number>,i=>mapping[i]);
    // Wood pieces stay separate so one penetrated crate cannot disable all wood on the map.
    const components:number[][]=[];
    if((meta.SurfaceProperty||'').startsWith('wood')){
      const parents=Uint32Array.from({length:vertices.length/3},(_,i)=>i);
      const find=(i:number):number=>{while(parents[i]!==i){parents[i]=parents[parents[i]];i=parents[i];}return i;};
      for(let i=0;i<ids.length;i+=3){const a=find(ids[i]);parents[find(ids[i+1])]=a;parents[find(ids[i+2])]=a;}
      const byComponent=new Map<number,number[]>();
      for(let i=0;i<ids.length;i+=3){const key=find(ids[i]),list=byComponent.get(key)||[];list.push(ids[i],ids[i+1],ids[i+2]);byComponent.set(key,list);}
      components.push(...byComponent.values());
    }else components.push(Array.from(ids));
    for(const component of components){
      const used=new Map<number,number>(),p:number[]=[],ix:number[]=[];
      for(const original of component){let index=used.get(original);if(index===undefined){index=p.length/3;used.set(original,index);p.push(vertices[original*3],vertices[original*3+1],vertices[original*3+2]);}ix.push(index);}
      const positions=new Float32Array(p),indices=new Uint32Array(ix),vertexOffset=byteOffset;
      chunks.push(Buffer.from(positions.buffer));byteOffset+=positions.byteLength;const indexOffset=byteOffset;chunks.push(Buffer.from(indices.buffer));byteOffset+=indices.byteLength;
      triangles+=indices.length/3;
      groups.push({name:node.getName(),surface:meta.SurfaceProperty||'default',tags:meta.InteractAs||[],vertexOffset,vertexCount:positions.length/3,indexOffset,indexCount:indices.length});
    }
  }
}
const worldPhysics=await io.read('local-assets/geometry-only/world_collision_physics.gltf');
for(const node of worldPhysics.getRoot().listNodes())if(node.getMesh())append(node);
for(const node of entityPhysics.getRoot().listNodes())if(node.getMesh()&&node.getName()==='func_brush')append(node);
await writeFile(`${output}/collision.bin`,Buffer.concat(chunks));

const spawns={} as Source2MapData['spawns'];
for(const side of ['T','CT']as const){
  const classname=side==='T'?'info_player_terrorist':'info_player_counterterrorist';
  spawns[side]=entities.filter(e=>e.classname===classname&&e.enabled).sort((a,b)=>Number(b.priority)-Number(a.priority)).map(e=>{
    const origin=point(e.origin[0],e.origin[1],e.origin[2]);
    return {...origin,yaw:e.angles[1]*Math.PI/180-Math.PI/2};
  }).slice(0,5);
}
const sites=siteVolumes.map((volumes,index)=>{
  const box=new Box3();for(const volume of volumes){box.expandByPoint(new Vector3().copy(volume.min));box.expandByPoint(new Vector3().copy(volume.max));}
  const center=box.getCenter(new Vector3());center.y=nav.heightAt(center.x,center.z,center.y);
  return {name:(index?'B':'A')as'A'|'B',position:asPlain(nav.nearest(center)?.point||center),volumes};
});
const navBox=new Box3();for(const a of nativeNav.areas)for(const vertex of a.vertices)navBox.expandByPoint(new Vector3(...vertex));
const sun=entities.find(e=>e.classname==='light_environment')!;
function camera(name:string,position:number[],target:number[],onGround=true){const p=point(position[0],position[1],position[2]);if(onGround){const n=nav.nearest(p);if(n){Object.assign(p,n.point);p.y+=1.6256;}}return {name,position:p,target:point(target[0],target[1],target[2])};}
const data:Source2MapData={
  format:1,source:{app:730,depot:2347770,manifest:'5009084625236407721',map:'maps/de_dust2.vmap_c',units:'metres; X=SourceX, Y=SourceZ, Z=-SourceY',navVersion:nativeNav.version},
  model:'de_dust2.gltf',skyTexture:'sky.exr',lightmap:'irradiance.exr',radar:{file:'radar.png',posX:-2476,posY:3239,scale:4.4},
  skybox:{model:'sky/de_dust2_skybox.gltf',scale:16,origin:{x:-.2032,y:5.1308,z:7.8232}},
  navigation:nativeNav.areas,collision:{file:'collision.bin',groups,triangles},spawns,sites,buyzones,places,
  bounds:{minX:navBox.min.x-3,maxX:navBox.max.x+3,minZ:navBox.min.z-3,maxZ:navBox.max.z+3},
  sun:{pitch:sun.angles[0],yaw:sun.angles[1],color:sun.color,intensity:sun.brightness,skyColor:sun.skycolor,skyIntensity:sun.skyintensity},
  cameras:[
    camera('A 点全景',[1700,1860,340],[1140,2590,150],false),
    camera('A 包点',[1350,2400,140],[1110,2650,150]),
    camera('B 包点',[-1540,2220,70],[-1840,2630,65]),
    camera('中门',[-480,1100,25],[-440,2100,10]),
    camera('A 大',[1420,1120,80],[1450,2480,120]),
    camera('A 小',[400,1870,130],[870,2520,130]),
    camera('B 洞',[-1910,1540,145],[-1880,2150,70]),
    camera('T 出生点',[-822,-795,150],[-1100,-250,150]),
    camera('CT 出生点',[382,2102,-109],[-620,2200,-40]),
  ],
};
data.effects=JSON.parse(await readFile(`${output}/effects.json`,'utf8'));
await writeFile(`${output}/map.json`,JSON.stringify(data));
console.log(JSON.stringify({collisionGroups:groups.length,collisionTriangles:triangles,collisionMB:byteOffset/1048576,navAreas:data.navigation.length,spawns,sites,bounds:data.bounds},null,2));
