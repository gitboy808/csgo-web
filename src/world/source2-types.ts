import type { Vec3, Side } from '../game/types';

export interface Source2NavArea {
  id:number; flags:string; flagNames:string; vertices:[number,number,number][];
  connections:{area:number;fromEdge:number;targetEdge:number}[];
}
export interface Source2Volume {name:string;callout:string;min:Vec3;max:Vec3}
export interface Source2CollisionGroup {
  name:string;surface:string;tags:string[];vertexOffset:number;vertexCount:number;indexOffset:number;indexCount:number;
}
export interface Source2Camera { name:string;position:Vec3;target:Vec3 }
export interface Source2MapData {
  format:1;source:{app:number;depot:number;manifest:string;map:string;units:string;navVersion:number};
  model:string;skybox?:{model:string;scale:number;origin:Vec3};skyTexture?:string;lightmap?:string;radar?:{file:string;posX:number;posY:number;scale:number};navigation:Source2NavArea[];
  collision:{file:string;groups:Source2CollisionGroup[];triangles:number};
  spawns:Record<Side,(Vec3&{yaw:number})[]>;
  sites:{name:'A'|'B';position:Vec3;volumes:Source2Volume[]}[];
  buyzones:Record<Side,Source2Volume[]>;places:Source2Volume[];
  bounds:{minX:number;maxX:number;minZ:number;maxZ:number};
  sun:{pitch:number;yaw:number;color:number[];intensity:number;skyColor:number[];skyIntensity:number};
  cameras:Source2Camera[];
  effects?:Record<string,string>;
}
