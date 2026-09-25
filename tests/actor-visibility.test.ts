import {expect,it} from 'vitest';
import * as THREE from 'three';
import {ActorVisibility} from '../src/world/actor-visibility';

it('keeps an offscreen actor whose shadow can reach the visible ground',()=>{
  const camera=new THREE.PerspectiveCamera(55,1,.1,60);camera.position.set(0,3,6);camera.lookAt(0,1,-6);camera.updateMatrixWorld(true);
  const sun=new THREE.DirectionalLight();sun.position.set(20,10,0);sun.target.position.set(0,0,0);
  const visibility=new ActorVisibility();visibility.begin(camera,sun);
  expect(visibility.test(new THREE.Vector3(0,0,-6),0).visible).toBe(true);
  const outside=visibility.test(new THREE.Vector3(15,0,-6),0);expect(outside.visible).toBe(false);expect(outside.shadow).toBe(true);
  expect(visibility.test(new THREE.Vector3(70,0,-6),0)).toEqual({visible:false,shadow:false});
});

it('keeps shadows conservatively when sunlight is almost horizontal',()=>{
  const camera=new THREE.PerspectiveCamera(55,1,.1,60),sun=new THREE.DirectionalLight();sun.position.set(20,.1,0);
  const visibility=new ActorVisibility();visibility.begin(camera,sun);
  expect(visibility.test(new THREE.Vector3(100,0,0),-5).shadow).toBe(true);
});
