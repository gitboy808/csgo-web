import * as THREE from 'three';

/** Reuse static depth, then depth-test moving casters into the same shadow map.
 * The final texture and hardware PCF are identical to an ordinary combined pass.
 * Uses Three r186's public depth-texture copy (WebGL2 framebuffer depth blit).
 */
export class StaticShadowCache {
  enabled=true;
  readonly stats={bakes:0,restores:0,staticCasters:0};
  private casters:THREE.Mesh[]=[];
  private identities=new Set<THREE.Object3D>();
  private cached:THREE.WebGLRenderTarget|null=null;
  private scratch=new THREE.WebGLRenderTarget(1,1);
  private signature='';
  constructor(root:THREE.Object3D,private scene:THREE.Scene,private sun:THREE.DirectionalLight){
    root.traverse(o=>{if(o instanceof THREE.Mesh&&o.castShadow){this.casters.push(o);this.identities.add(o);}});
    this.stats.staticCasters=this.casters.length;
  }
  private staticCasting(enabled:boolean){for(const object of this.casters)object.castShadow=enabled;}
  invalidate(){this.signature='';}
  prewarm(renderer:THREE.WebGLRenderer,camera:THREE.Camera){
    if(this.enabled&&renderer.shadowMap.enabled&&renderer.shadowMap.type===THREE.PCFShadowMap&&(!this.cached||this.signature!==this.key(renderer)))this.bake(renderer,camera);
  }
  private key(renderer:THREE.WebGLRenderer){const s=this.sun.shadow;return [renderer.shadowMap.type,s.mapSize.x,s.mapSize.y,...this.sun.position.toArray(),...this.sun.target.position.toArray(),...s.camera.projectionMatrix.elements].join(',');}
  private bake(renderer:THREE.WebGLRenderer,camera:THREE.Camera){
    this.staticCasting(true);
    const moving:THREE.Object3D[]=[];
    this.scene.traverse(o=>{if(o instanceof THREE.Mesh&&o.castShadow&&!this.identities.has(o)){moving.push(o);o.castShadow=false;}});
    const target=renderer.getRenderTarget(),viewport=renderer.getViewport(new THREE.Vector4()),clear=renderer.getClearColor(new THREE.Color()),alpha=renderer.getClearAlpha();
    try{
      renderer.setRenderTarget(this.scratch);renderer.shadowMap.needsUpdate=true;this.sun.shadow.needsUpdate=true;
      renderer.render(this.scene,camera);
      const shadow=this.sun.shadow.map!,source=shadow.depthTexture;
      if(!source)throw new Error('Static shadow caching requires native depth-texture shadows.');
      this.cached?.depthTexture?.dispose();this.cached?.dispose();
      const depth=new THREE.DepthTexture(shadow.width,shadow.height,source.type);
      depth.format=source.format;depth.compareFunction=source.compareFunction;depth.minFilter=source.minFilter;depth.magFilter=source.magFilter;
      this.cached=new THREE.WebGLRenderTarget(shadow.width,shadow.height,{depthTexture:depth,stencilBuffer:false});
      renderer.initRenderTarget(this.cached);renderer.copyTextureToTexture(source,depth);
      this.signature=this.key(renderer);this.stats.bakes++;
    }finally{
      for(const object of moving)object.castShadow=true;
      renderer.setRenderTarget(target);if(target===null)renderer.setViewport(viewport);renderer.setClearColor(clear,alpha);
    }
  }
  render(renderer:THREE.WebGLRenderer,camera:THREE.Camera,draw:()=>void){
    if(!this.enabled||!renderer.shadowMap.enabled||renderer.shadowMap.type!==THREE.PCFShadowMap){this.staticCasting(true);draw();return;}
    if(!this.cached||!this.sun.shadow.map||this.signature!==this.key(renderer))this.bake(renderer,camera);
    this.staticCasting(false);
    const clear=renderer.clear;
    // Three clears the light's framebuffer immediately before drawing casters.
    // Restore cached depth at that point, leaving all other clear calls untouched.
    renderer.clear=(color=true,depth=true,stencil=true)=>{
      clear.call(renderer,color,depth,stencil);
      const target=renderer.getRenderTarget();
      if(depth&&target===this.sun.shadow.map&&target?.depthTexture){
        renderer.copyTextureToTexture(this.cached!.depthTexture!,target.depthTexture);
        renderer.setRenderTarget(target);this.stats.restores++;
      }
    };
    renderer.shadowMap.needsUpdate=true;this.sun.shadow.needsUpdate=true;
    try{draw();}finally{renderer.clear=clear;}
  }
  dispose(){this.staticCasting(true);this.cached?.depthTexture?.dispose();this.cached?.dispose();this.scratch.dispose();}
}
