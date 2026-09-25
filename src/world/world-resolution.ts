import * as THREE from 'three';
export type WorldOverlay=(renderer:THREE.WebGLRenderer,depth:THREE.DepthTexture,width:number,height:number)=>THREE.Texture;

/** Optional world-only scaling. Weapons and HTML HUD stay at full resolution. */
export class WorldResolution {
  scale=1;
  private target:THREE.WebGLRenderTarget|null=null;
  private scene=new THREE.Scene();private camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  private material=new THREE.MeshBasicMaterial({depthTest:false,depthWrite:false,toneMapped:true});
  private overlayMap={value:null as THREE.Texture|null};private hasOverlay={value:0};
  constructor(){this.material.onBeforeCompile=shader=>{shader.uniforms.uVolume=this.overlayMap;shader.uniforms.uHasVolume=this.hasOverlay;shader.fragmentShader='uniform sampler2D uVolume;uniform float uHasVolume;\n'+shader.fragmentShader;shader.fragmentShader=shader.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nif(uHasVolume>0.5){vec4 volume=texture2D(uVolume,vMapUv);diffuseColor.rgb=diffuseColor.rgb*(1.0-volume.a)+volume.rgb;}');};const quad=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);quad.frustumCulled=false;this.scene.add(quad);}
  async prewarm(renderer:THREE.WebGLRenderer){
    const target=renderer.getRenderTarget(),map=this.material.map,placeholder=new THREE.DataTexture(new Uint8Array([0,0,0,255]),1,1);placeholder.colorSpace=THREE.LinearSRGBColorSpace;placeholder.needsUpdate=true;
    this.material.map=placeholder;this.material.needsUpdate=true;renderer.setRenderTarget(null);
    try{await renderer.compileAsync(this.scene,this.camera);}finally{this.material.map=map;this.material.needsUpdate=true;renderer.setRenderTarget(target);placeholder.dispose();}
  }
  render(renderer:THREE.WebGLRenderer,drawWorld:()=>void,overlay?:WorldOverlay){
    // The ordinary path stays byte-for-byte unchanged at native resolution.
    if((this.scale>=.999&&!overlay)||renderer.getRenderTarget()!==null||(!overlay&&!renderer.extensions.has('EXT_color_buffer_float'))){drawWorld();return;}
    const size=renderer.getDrawingBufferSize(new THREE.Vector2()),width=Math.round(size.x*this.scale),height=Math.round(size.y*this.scale);
    if(!this.target){this.target=new THREE.WebGLRenderTarget(width,height,{type:renderer.extensions.has('EXT_color_buffer_float')?THREE.HalfFloatType:THREE.UnsignedByteType,samples:Math.min(4,renderer.capabilities.maxSamples),depthBuffer:true,resolveDepthBuffer:true});this.target.depthTexture=new THREE.DepthTexture(width,height,THREE.UnsignedIntType);this.target.texture.colorSpace=THREE.LinearSRGBColorSpace;this.material.map=this.target.texture;this.material.needsUpdate=true;}
    else if(this.target.width!==width||this.target.height!==height)this.target.setSize(width,height);
    renderer.setRenderTarget(this.target);renderer.clear();
    try{drawWorld();}finally{renderer.setRenderTarget(null);}
    this.hasOverlay.value=overlay?1:0;if(overlay)this.overlayMap.value=overlay(renderer,this.target.depthTexture!,width,height);
    renderer.render(this.scene,this.camera);
  }
  get dimensions(){return this.scale<.999&&this.target?{width:this.target.width,height:this.target.height}:null;}
  dispose(){this.target?.depthTexture?.dispose();this.target?.dispose();this.material.dispose();this.scene.traverse(o=>{if(o instanceof THREE.Mesh)o.geometry.dispose();});}
}
