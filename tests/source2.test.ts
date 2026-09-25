import {beforeAll,describe,it,expect} from 'vitest';
import {existsSync,readFileSync} from 'node:fs';
import {Source2Navigation} from '../src/game/source2-navigation';
import {Physics} from '../src/game/physics';
import RAPIER from '@dimforge/rapier3d-compat';
import type {Source2MapData} from '../src/world/source2-types';

const enabled=existsSync('public/assets/source2/map.json');
describe.skipIf(!enabled)('original CS2 Dust II data and physical alignment',()=>{
  let data:Source2MapData,nav:Source2Navigation,physics:Physics;
  beforeAll(async()=>{
    data=JSON.parse(readFileSync('public/assets/source2/map.json','utf8'));nav=new Source2Navigation(data.navigation);physics=new Physics();
    const raw=readFileSync('public/assets/source2/collision.bin');await physics.init(data,raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength));
  });
  it('keeps all nine inspection cameras clear of the original solid map surfaces',()=>{
    for(const camera of data.cameras){
      let intersections=0;
      physics.world.intersectionsWithShape(camera.position,{x:0,y:0,z:0,w:1},new RAPIER.Ball(.07),()=>{intersections++;return true;},RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC|RAPIER.QueryFilterFlags.EXCLUDE_KINEMATIC,0x00010001);
      expect(intersections,camera.name).toBe(0);
    }
  });
  for(const side of ['T','CT']as const)for(const name of ['A','B']as const){
    it(`routes all ${side} spawns to original bombsite ${name}`,()=>{
      const destination=data.sites.find(s=>s.name===name)!.position;
      for(const spawn of data.spawns[side]){
        const path=nav.path(spawn,destination);expect(path.length).toBeGreaterThan(1);
        const last=path.at(-1)!;expect(Math.hypot(last.x-destination.x,last.z-destination.z)).toBeLessThan(.15);
      }
    });
  }
  it('aligns navigation, original collision and spawn heights',()=>{
    for(const sourceSpawn of [...data.spawns.T,...data.spawns.CT]){
      const spawn=physics.spawnPoint(sourceSpawn);
      const hit=physics.ray({x:spawn.x,y:spawn.y+1,z:spawn.z},{x:0,y:-1,z:0},2);
      expect(hit).not.toBeNull();expect(Math.abs(1-hit!.timeOfImpact)).toBeLessThan(.2);
      const {body,collider}=physics.character(spawn);
      for(let tick=0;tick<90;tick++){physics.move(body,collider,{x:0,y:-.04,z:0});physics.world.step();}
      expect(Math.abs(body.translation().y-.9-spawn.y)).toBeLessThan(.25);physics.world.removeRigidBody(body);
    }
  });
  for(const [side,site]of [['CT','A'],['T','B']]as const){
    it(`walks a capsule along the native ${side} → ${site} route`,()=>{
      const spawn=physics.spawnPoint(data.spawns[side][0]),goal=data.sites.find(s=>s.name===site)!.position,path=nav.path(spawn,goal);
      const {body,collider}=physics.character(spawn);let index=0,vy=0;
      for(let tick=0;tick<3600;tick++){
        const tr=body.translation(),p={x:tr.x,y:tr.y-.9,z:tr.z};
        while(index<path.length-1&&Math.hypot(path[index].x-p.x,path[index].z-p.z)<.25)index++;
        if(Math.hypot(goal.x-p.x,goal.z-p.z)<1)break;
        const point=path[index],dx=point.x-p.x,dz=point.z-p.z,length=Math.hypot(dx,dz)||1;
        vy-=20/60;const grounded=physics.move(body,collider,{x:dx/length*4/60,y:vy/60,z:dz/length*4/60});if(grounded)vy=-.5;physics.world.step();
      }
      const p=body.translation();physics.world.removeRigidBody(body);
      expect(Math.hypot(p.x-goal.x,p.z-goal.z),`stopped at ${p.x.toFixed(2)},${(p.y-.9).toFixed(2)},${p.z.toFixed(2)}; waypoint ${index}/${path.length}`).toBeLessThan(1.5);
    });
  }
});
