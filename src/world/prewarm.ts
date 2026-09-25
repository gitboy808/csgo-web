import*as THREE from'three';import type{Source2Level}from'./source2-level';
/** Prepare shader variants, view textures and the first map views behind the loading screen. */
export async function prewarmGame(renderer:THREE.WebGLRenderer,scene:THREE.Scene,view:THREE.Scene,camera:THREE.PerspectiveCamera,viewCamera:THREE.Camera,props:THREE.Object3D[],level?:Source2Level,progress=(n:number)=>{void n;}){
 const started=performance.now(),target=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),saved=new Map<THREE.Object3D,boolean>(),warm=new THREE.Group(),linearTarget=new THREE.WebGLRenderTarget(32,32);
 const views=level?[...level.data.cameras.filter(c=>['CT 出生点','T 出生点','A 包点','B 包点'].includes(c.name))]:[],worldCamera=camera.clone();
 const stats={milliseconds:0,viewMeshes:0,textures:0,worldViews:0,shadowBakes:0,programs:0};
 try{
  // Use the actual screen output behind the opaque loading overlay. Offscreen targets
  // select linear/no-tone-map shaders, which do not warm the on-screen ACES/sRGB variants.
  renderer.setRenderTarget(null);renderer.setViewport(0,0,64,64);
  // Hidden view rigs are all required in a match, but compileAsync alone does not upload their textures.
  for(const object of view.children){saved.set(object,object.visible);object.visible=true;}
  const textures=new Set<THREE.Texture>();view.traverse(o=>{if(o instanceof THREE.Mesh){stats.viewMeshes++;for(const m of Array.isArray(o.material)?o.material:[o.material])for(const value of Object.values(m))if(value instanceof THREE.Texture)textures.add(value);}});
  for(const texture of textures)renderer.initTexture(texture);stats.textures=textures.size;
  await renderer.compileAsync(view,viewCamera);renderer.clear();renderer.render(view,viewCamera);progress(.3);
  for(const prop of props){const clone=prop.clone(true);clone.traverse(o=>{if(o instanceof THREE.Mesh)o.frustumCulled=false;});warm.add(clone);}scene.add(warm);
  level?.shadows?.prewarm(renderer,worldCamera);await renderer.compileAsync(scene,worldCamera);if(level)await renderer.compileAsync(level.layers.background,worldCamera);progress(.55);
  const render=()=>{renderer.clear();if(level)level.render(renderer,worldCamera);else renderer.render(scene,worldCamera);stats.worldViews++;};render();
  for(const v of views){worldCamera.position.copy(v.position);worldCamera.lookAt(new THREE.Vector3().copy(v.target));worldCamera.updateMatrixWorld(true);render();progress(.55+.4*stats.worldViews/(views.length+1));await new Promise<void>(r=>requestAnimationFrame(()=>r()));}
  // Smoke/scaled-world rendering also needs linear output variants. Compile them
  // into a tiny scratch target; the large frame/depth buffers stay demand-allocated.
  if(level){renderer.setRenderTarget(linearTarget);await renderer.compileAsync(scene,worldCamera);await renderer.compileAsync(level.layers.background,worldCamera);}
  stats.shadowBakes=level?.shadows?.stats.bakes??0;stats.programs=renderer.info.programs?.length??0;
 }finally{
  warm.removeFromParent();for(const[o,visible]of saved)o.visible=visible;renderer.setRenderTarget(target);if(target===null)renderer.setViewport(viewport);linearTarget.dispose();
 }
 stats.milliseconds=Math.round(performance.now()-started);return stats;
}
