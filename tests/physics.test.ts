import { beforeAll,describe,it,expect } from 'vitest';
import { Physics } from '../src/game/physics';
import { heightAt } from '../src/world/map';
let physics:Physics;
beforeAll(async()=>{physics=new Physics();await physics.init();physics.world.step();});
describe('world collision and sight lines',()=>{
  it('blocks bullets at architecture and identifies penetrable wood cover',()=>{
    const stone=physics.ray({x:48,y:6,z:-39},{x:0,y:0,z:-1},60);expect(stone).not.toBeNull();expect(physics.materials.get(stone!.collider.handle)).not.toBe('wood');
    const wood=physics.ray({x:-8,y:1,z:0},{x:0,y:0,z:-1},10);expect(wood).not.toBeNull();expect(physics.materials.get(wood!.collider.handle)).toBe('wood');
  });
  it('keeps a walking character inside the CT boundary',()=>{
    const {body,collider}=physics.character({x:8,y:0,z:-59});for(let i=0;i<120;i++){physics.move(body,collider,{x:0,y:-.01,z:-.1});physics.world.step();}expect(body.translation().z).toBeGreaterThan(-64);expect(body.translation().y).toBeGreaterThan(.8);physics.world.removeRigidBody(body);
  });
  it('lets a character climb the upper tunnel entrance without penetrating its roof',()=>{
    const {body,collider}=physics.character({x:-40,y:heightAt(-40,38),z:38});for(let i=0;i<160;i++){physics.move(body,collider,{x:0,y:-.04,z:-.1});physics.world.step();}expect(body.translation().z).toBeLessThan(24);expect(body.translation().y).toBeGreaterThan(2.5);expect(body.translation().y).toBeLessThan(3);physics.world.removeRigidBody(body);
  });
  it('keeps the central double-door gap walkable',()=>{
    const {body,collider}=physics.character({x:-5,y:0,z:-14});for(let i=0;i<80;i++){physics.move(body,collider,{x:0,y:-.015,z:-.1});physics.world.step();}expect(body.translation().z).toBeLessThan(-20);physics.world.removeRigidBody(body);
  });
});
