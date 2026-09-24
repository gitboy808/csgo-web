import { beforeAll,describe,it,expect } from 'vitest';
import { init,importNavMesh,NavMeshQuery } from '@recast-navigation/core';
import { readFile } from 'node:fs/promises';
import { MAP,heightAt } from '../src/world/map';

let query:NavMeshQuery;
beforeAll(async()=>{await init();const {navMesh}=importNavMesh(new Uint8Array(await readFile('public/assets/dust2.navmesh.bin')));query=new NavMeshQuery(navMesh,{maxNodes:8192});query.defaultQueryHalfExtents={x:3,y:5,z:3};});
describe('Dust II navigation and map connectivity',()=>{
  for(const side of ['T','CT']as const)for(const site of MAP.sites){
    it(`${side} can reach ${site.name} with a continuous ground route`,()=>{
      const s=query.findClosestPoint(MAP.spawns[side][0]),e=query.findClosestPoint({x:site.x,y:heightAt(site.x,site.z),z:site.z});expect(s.success).toBe(true);expect(e.success).toBe(true);const result=query.computePath(s.point,e.point);expect(result.success).toBe(true);expect(result.path.length).toBeGreaterThan(1);const last=result.path.at(-1)!;expect(Math.hypot(last.x-site.x,last.z-site.z)).toBeLessThan(3);
    });
  }
  for(const [name,x,z]of [['A long',53,0],['short',19,-14],['lower tunnels',-25,6],['upper tunnels',-43,20],['mid doors',-5,-18]]as const){
    it(`connects ${name} to both spawn areas`,()=>{const target=query.findClosestPoint({x,y:heightAt(x,z),z});expect(target.success).toBe(true);for(const side of ['T','CT']as const){const start=query.findClosestPoint(MAP.spawns[side][0]);const result=query.computePath(start.point,target.point);expect(result.success).toBe(true);const last=result.path.at(-1)!;expect(Math.hypot(last.x-target.point.x,last.z-target.point.z)).toBeLessThan(.5);}});
  }
});
