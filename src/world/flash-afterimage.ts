import * as THREE from 'three';
/** GPU-only capture: no canvas readback, PNG encoding or CPU pixel transfer. */
export class FlashAfterimage {
 private texture:THREE.FramebufferTexture|null=null;private scene=new THREE.Scene();private camera=new THREE.OrthographicCamera(-1,1,1,-1,0,1);private material=new THREE.MeshBasicMaterial({transparent:true,depthTest:false,depthWrite:false,toneMapped:false,opacity:0});
 constructor(){const plane=new THREE.Mesh(new THREE.PlaneGeometry(2,2),this.material);plane.frustumCulled=false;this.scene.add(plane);}
 capture(renderer:THREE.WebGLRenderer){const size=renderer.getDrawingBufferSize(new THREE.Vector2());if(!this.texture||this.texture.image.width!==size.x||this.texture.image.height!==size.y){this.texture?.dispose();this.texture=new THREE.FramebufferTexture(size.x,size.y);this.texture.colorSpace=THREE.SRGBColorSpace;this.material.map=this.texture;this.material.needsUpdate=true;}renderer.copyFramebufferToTexture(this.texture);}
 render(renderer:THREE.WebGLRenderer,amount:number){if(!this.texture||amount<=.005)return;this.material.opacity=Math.min(.85,amount*.8);renderer.render(this.scene,this.camera);}
 clear(){this.material.opacity=0;}
}
