import{afterEach,describe,it,expect,vi}from'vitest';import*as THREE from'three';import{prewarmGame}from'../src/world/prewarm';
afterEach(()=>vi.unstubAllGlobals());
describe('loading-screen GPU preparation',()=>{
 it('uploads and renders hidden view equipment before play, then restores visibility and render state',async()=>{
  vi.stubGlobal('requestAnimationFrame',(fn:()=>void)=>{fn();return 1;});const scene=new THREE.Scene(),view=new THREE.Scene(),camera=new THREE.PerspectiveCamera(),texture=new THREE.Texture(),gun=new THREE.Mesh(new THREE.BoxGeometry(),new THREE.MeshBasicMaterial({map:texture}));gun.visible=false;view.add(gun);
  let target:unknown=null;const render=vi.fn((_s:THREE.Scene)=>{if(_s===view)expect(gun.visible).toBe(true);}),renderer:any={getRenderTarget:()=>target,setRenderTarget:(t:unknown)=>target=t,getViewport:(v:THREE.Vector4)=>v.set(1,2,640,480),setViewport:vi.fn(),initTexture:vi.fn(),compileAsync:vi.fn(async()=>{}),clear:vi.fn(),render,info:{programs:[{}]}};
  const stats=await prewarmGame(renderer,scene,view,camera,camera,[]);expect(stats.textures).toBe(1);expect(renderer.initTexture).toHaveBeenCalledWith(texture);expect(render).toHaveBeenCalledWith(view,camera);expect(gun.visible).toBe(false);expect(target).toBe(null);expect(scene.children).toHaveLength(0);expect(renderer.setViewport).toHaveBeenCalled();
 });
 it('does not leave all weapon rigs visible if compilation fails',async()=>{const scene=new THREE.Scene(),view=new THREE.Scene(),object=new THREE.Group(),camera=new THREE.PerspectiveCamera();object.visible=false;view.add(object);let target:unknown=null;const renderer:any={getRenderTarget:()=>target,setRenderTarget:(t:unknown)=>target=t,getViewport:(v:THREE.Vector4)=>v,setViewport:vi.fn(),compileAsync:async()=>{throw new Error('compile failed');},info:{}};await expect(prewarmGame(renderer,scene,view,camera,camera,[])).rejects.toThrow('compile failed');expect(object.visible).toBe(false);expect(target).toBe(null);});
});
