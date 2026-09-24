import type { Vec3, Side } from '../game/types';

export type Surface = 'plaster' | 'stone' | 'road' | 'sand' | 'wood' | 'metal' | 'dark' | 'paving';
export interface Area { name: string; callout: string; x1: number; z1: number; x2: number; z2: number; surface: Surface }
export interface Solid { x: number; y: number; z: number; w: number; h: number; d: number; rotation?: number; material: Surface; kind?: 'wall' | 'cover' | 'door' | 'roof' | 'prop' }
export interface MapDefinition {
  name: string; areas: Area[]; spawns: Record<Side, Vec3[]>;
  sites: { name: 'A' | 'B'; x: number; z: number; radius: number }[];
  bounds: { minX: number; maxX: number; minZ: number; maxZ: number };
}
const area = (name: string, callout: string, x1: number, z1: number, x2: number, z2: number, surface: Surface = 'sand'): Area => ({ name, callout, x1, z1, x2, z2, surface });
export const MAP: MapDefinition = {
  name: 'DUST II', bounds: { minX: -62, maxX: 68, minZ: -64, maxZ: 64 },
  areas: [
    area('T 出生点', 'T SPAWN', -16, 46, 18, 64),
    area('T 斜坡', 'T RAMP', -42, 42, -12, 54),
    area('隧道入口', 'OUTSIDE TUNNELS', -52, 24, -34, 54),
    area('上层隧道', 'UPPER TUNNELS', -52, 2, -34, 28, 'stone'),
    area('B 洞', 'B TUNNELS', -48, -26, -38, 4, 'stone'),
    area('下层隧道', 'LOWER TUNNELS', -36, 0, -12, 12, 'stone'),
    area('B 包点', 'B SITE', -60, -54, -26, -22),
    area('B 门外', 'B DOORS', -30, -50, 6, -34),
    area('B 窗口', 'B WINDOW', -30, -56, -18, -48, 'stone'),
    area('CT 出生点', 'CT SPAWN', -8, -64, 24, -34, 'road'),
    area('中路', 'MID', -14, -36, 6, 28, 'road'),
    area('中路上方', 'TOP MID', -12, 22, 12, 48),
    area('匪家外侧', 'OUTSIDE LONG', 12, 38, 38, 54, 'road'),
    area('A 门', 'LONG DOORS', 28, 26, 40, 42, 'stone'),
    area('A 门外', 'LONG CORNER', 36, 16, 62, 30, 'road'),
    area('A 大', 'LONG A', 44, -26, 62, 22, 'road'),
    area('大坑', 'PIT', 60, 10, 68, 26, 'stone'),
    area('A 小入口', 'CATWALK', 4, 10, 22, 22, 'paving'),
    area('A 小', 'SHORT A', 14, -26, 24, 20, 'paving'),
    area('A 小平台', 'SHORT PLATFORM', 18, -38, 42, -20, 'paving'),
    area('A 包点', 'A SITE', 30, -54, 60, -22, 'paving'),
    area('A 斜坡', 'A RAMP', 18, -60, 38, -42, 'paving'),
    area('警家通道', 'CT CROSS', 4, -38, 22, -26, 'road'),
  ],
  spawns: {
    T: [{x:0,y:0,z:57},{x:-5,y:0,z:58},{x:5,y:0,z:58},{x:-9,y:0,z:54},{x:9,y:0,z:54}],
    CT: [{x:8,y:0,z:-56},{x:3,y:0,z:-57},{x:14,y:0,z:-57},{x:0,y:0,z:-52},{x:18,y:0,z:-53}],
  },
  sites: [{ name:'A', x:43,z:-39,radius:7 },{ name:'B',x:-45,z:-39,radius:8 }],
};
export function zoneAt(x: number, z: number): Area | undefined {
  return [...MAP.areas].reverse().find(a => x >= a.x1 && x <= a.x2 && z >= a.z1 && z <= a.z2);
}
export function walkable(x: number, z: number) { return MAP.areas.some(a => x > a.x1 && x < a.x2 && z > a.z1 && z < a.z2); }
const clamp = (a: number, low: number, high: number) => Math.max(low, Math.min(high, a));
export function heightAt(x: number, z: number): number {
  // Every renderer, collider, spawn, navmesh and radar uses the same metre-scale surface.
  if(x>=60&&z>=10&&z<=26)return -clamp((x-60)*.35,0,1.4);
  if(x<-34&&z>=-26&&z<=34)return Math.min(clamp((z+26)*.45,0,1.8),clamp((34-z)*.3,0,1.8));
  if(x>=-36&&x<=-22&&z>=0&&z<=12)return clamp((-22-x)*.15,0,1.8);
  if (x >= 30 && z <= -22) return 4;
  if (x >= 18 && x < 38 && z <= -42) return clamp((x-22)/2,0,4);
  if (x >= 18 && z <= -20 && z >= -38) return 4;
  if (x >= 14 && x <= 24 && z >= -26 && z <= 20) {
    if (z >= 4) return clamp((20-z)/8,0,2);
    if (z <= -8) return clamp(2 + (-8-z)/6,2,4);
    return 2;
  }
  if (x >= 44 && z < -4) return clamp((-4-z)/4.5,0,4);
  return 0;
}
export function siteAt(x: number,z: number) { return MAP.sites.find(s=>Math.hypot(x-s.x,z-s.z)<s.radius); }
export function inSpawn(side: Side,x: number,z: number) { const p=MAP.spawns[side][0]; return Math.hypot(x-p.x,z-p.z)<15; }

export interface MapGeometry { positions: number[]; indices: number[]; surfaces: Surface[]; solids: Solid[]; walls: Solid[] }
let cached: MapGeometry | undefined;
export function makeMapGeometry(): MapGeometry {
  if (cached) return cached;
  const positions:number[]=[],indices:number[]=[],surfaces:Surface[]=[];
  const cell=2;
  const occupied = new Set<string>();
  for(let x=-62;x<68;x+=cell) for(let z=-64;z<64;z+=cell) if(walkable(x+1,z+1)) {
    occupied.add(`${x},${z}`);
    const start=positions.length/3;
    positions.push(x,heightAt(x,z),z,x,heightAt(x,z+cell),z+cell,x+cell,heightAt(x+cell,z+cell),z+cell,x+cell,heightAt(x+cell,z),z);
    indices.push(start,start+1,start+2,start,start+2,start+3);
    surfaces.push(zoneAt(x+1,z+1)?.surface || 'sand');
  }
  const edges:{axis:'x'|'z';fixed:number;start:number;end:number;side:number}[]=[];
  for(const key of occupied) {
    const [x,z]=key.split(',').map(Number);
    if(!occupied.has(`${x-cell},${z}`))edges.push({axis:'z',fixed:x,start:z,end:z+cell,side:-1});
    if(!occupied.has(`${x+cell},${z}`))edges.push({axis:'z',fixed:x+cell,start:z,end:z+cell,side:1});
    if(!occupied.has(`${x},${z-cell}`))edges.push({axis:'x',fixed:z,start:x,end:x+cell,side:-1});
    if(!occupied.has(`${x},${z+cell}`))edges.push({axis:'x',fixed:z+cell,start:x,end:x+cell,side:1});
  }
  edges.sort((a,b)=>a.axis.localeCompare(b.axis)||a.fixed-b.fixed||a.side-b.side||a.start-b.start);
  const merged:typeof edges=[];
  for(const e of edges) {
    const prev=merged.at(-1);
    if(prev && prev.axis===e.axis && prev.fixed===e.fixed && prev.side===e.side && prev.end===e.start && prev.end-prev.start<18) prev.end=e.end;
    else merged.push({...e});
  }
  const walls:Solid[]=merged.map((e,i)=> {
    const x=e.axis==='x'?(e.start+e.end)/2:e.fixed+e.side*.5;
    const z=e.axis==='z'?(e.start+e.end)/2:e.fixed+e.side*.5;
    const ground=Math.min(heightAt(x,z),heightAt(x+.1,z+.1));
    const tunnel=x<-33 && z>-24 && z<26;
    const h=tunnel?5.5:7+(Math.sin(i*7.13)*.5+.5)*5;
    const kasbah=x<-25&&z<-22;
    return {x,y:ground+h/2-.12,z,w:e.axis==='x'?e.end-e.start+1:1.2,h:h+.24,d:e.axis==='z'?e.end-e.start+1:1.2,material:tunnel||kasbah?'stone':'plaster',kind:'wall'};
  });
  const solids:Solid[]=[...walls];
  const cover=(x:number,z:number,w:number,h:number,d:number,material:Surface='wood',rotation=0)=>solids.push({x,z,y:heightAt(x,z)+h/2,w,h,d,material,rotation,kind:'cover'});
  // Recognisable bombsite cover, Xbox, barrels and the long corner.
  cover(40,-43,5,2.5,3.2,'wood'); cover(45,-44,3,1.3,2.8,'wood');
  cover(53,-34,3.2,2.7,3.2,'metal');cover(54,-46,4,1.3,2,'stone');
  cover(32,-29,3.4,1.3,2.6,'stone');
  cover(-51,-45,5,2.3,3.6,'wood');cover(-47,-43,3,1.2,3,'wood');
  cover(-33,-30,4,2.5,3,'metal');cover(-54,-28,2.8,1.6,2.8,'wood');
  cover(-37,-48,2.5,1.9,2.5,'wood');cover(-8,-8,3.6,2.2,3.2,'wood');
  cover(-18,5,3,1.6,3,'wood');cover(-45,16,3,2.2,3,'wood');
  cover(57,19,3.2,2.6,5,'metal');cover(6,31,3,2.1,2.8,'wood');
  // Double doors are fixed open leaves with a clear centre passage.
  solids.push({x:-9.5,y:2.1,z:-18,w:3.5,h:4.2,d:.24,rotation:-.26,material:'wood',kind:'door'},
    {x:-.5,y:2.1,z:-18,w:3.5,h:4.2,d:.24,rotation:.26,material:'wood',kind:'door'},
    {x:-12.5,y:3.5,z:-18,w:3.1,h:7,d:1.5,material:'stone',kind:'cover'},
    {x:3.5,y:3.5,z:-18,w:5.1,h:7,d:1.5,material:'stone',kind:'cover'},
    {x:-28,y:2.1,z:-46.2,w:.24,h:4.2,d:5.6,rotation:.15,material:'wood',kind:'door'},
    {x:-28,y:2.1,z:-36.8,w:.24,h:4.2,d:3.6,rotation:-.15,material:'wood',kind:'door'},
    {x:29.5,y:2.1,z:34,w:2.6,h:4.2,d:.26,rotation:-.35,material:'wood',kind:'door'},
    {x:38.6,y:2.1,z:34,w:2.6,h:4.2,d:.26,rotation:.35,material:'wood',kind:'door'});
  // Tunnel ceilings do not enter the walkable navmesh; they remain physical overhead cover.
  solids.push({x:-43,y:5.25,z:-10,w:11,h:.7,d:26,material:'stone',kind:'roof'},
    {x:-43,y:5.8,z:8,w:18,h:.65,d:10,material:'stone',kind:'roof'},
    {x:-43,y:5.8,z:25,w:18,h:.65,d:6,material:'stone',kind:'roof'},
    {x:-23,y:4.5,z:6,w:22,h:.6,d:12,material:'stone',kind:'roof'});
  for(const [x,z] of [[59,-14],[-57,-49]])solids.push({x,z,y:heightAt(x,z)+.92,w:2.15,h:1.85,d:4.45,material:'metal',kind:'prop'});
  for(const [x,z] of [[-55,-25],[-53,-25],[57,-49],[57,-47],[35,25],[-36,24],[-34,-51]])solids.push({x,z,y:heightAt(x,z)+.64,w:.93,h:1.28,d:.93,material:'metal',kind:'prop'});
  solids.push({x:-26,y:.45,z:-53.1,w:.5,h:.9,d:6.4,material:'stone',kind:'prop'},
    {x:-26,y:4.15,z:-53.1,w:.5,h:1,d:6.4,material:'stone',kind:'prop'},
    {x:-26,y:2.2,z:-55.6,w:.5,h:4.4,d:.8,material:'stone',kind:'prop'},
    {x:-26,y:2.2,z:-50.6,w:.5,h:4.4,d:.8,material:'stone',kind:'prop'},
    {x:-26,y:1,z:-53.1,w:1.4,h:.15,d:5.8,material:'stone',kind:'prop'});
  cached={positions,indices,surfaces,solids,walls};
  return cached;
}
export function solidTriangles(solid:Solid) {
  const p:number[]=[],ind:number[]=[];
  const c=Math.cos(solid.rotation||0),s=Math.sin(solid.rotation||0);
  for(const [x,y,z] of [[-1,-1,-1],[1,-1,-1],[1,1,-1],[-1,1,-1],[-1,-1,1],[1,-1,1],[1,1,1],[-1,1,1]]) {
    const xx=x*solid.w/2,zz=z*solid.d/2;
    p.push(solid.x+xx*c+zz*s,solid.y+y*solid.h/2,solid.z-xx*s+zz*c);
  }
  ind.push(0,2,1,0,3,2,4,5,6,4,6,7,0,1,5,0,5,4,3,7,6,3,6,2,1,2,6,1,6,5,0,4,7,0,7,3);
  return {positions:p,indices:ind};
}
