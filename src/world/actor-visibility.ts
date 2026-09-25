import * as THREE from 'three';

export const AGENT_BOUND_RADIUS=3.25;
export function setAgentBounds(root:THREE.Object3D){
  root.traverse(o=>{if(o instanceof THREE.SkinnedMesh){o.frustumCulled=true;o.boundingSphere=new THREE.Sphere(new THREE.Vector3(0,1,0),AGENT_BOUND_RADIUS);}});
}

/** Conservative bounds include the entire possible sun-shadow footprint. */
export class ActorVisibility {
  private frustum=new THREE.Frustum();private matrix=new THREE.Matrix4();
  private box=new THREE.Box3();private shadow=new THREE.Box3();private offset=new THREE.Vector3();
  private incoming=new THREE.Vector3();
  begin(camera:THREE.Camera,sun:THREE.DirectionalLight){
    camera.updateMatrixWorld(true);this.frustum.setFromProjectionMatrix(this.matrix.multiplyMatrices(camera.projectionMatrix,camera.matrixWorldInverse));
    this.incoming.copy(sun.target.position).sub(sun.position).normalize();
  }
  test(position:THREE.Vector3,minimumReceiverY:number){
    const r=AGENT_BOUND_RADIUS;
    this.box.min.copy(position).addScalar(-r);this.box.max.copy(position).addScalar(r);this.box.max.y+=1;
    const visible=this.frustum.intersectsBox(this.box);
    if(visible)return {visible:true,shadow:true};
    // Low/horizontal light can cast arbitrarily long shadows; keep such actors.
    if(this.incoming.y>-.05)return {visible:false,shadow:true};
    this.offset.copy(this.incoming).multiplyScalar(Math.max(0,this.box.max.y-minimumReceiverY)/-this.incoming.y);
    this.shadow.copy(this.box);this.shadow.expandByPoint(this.box.min.clone().add(this.offset));this.shadow.expandByPoint(this.box.max.clone().add(this.offset));
    return {visible:false,shadow:this.frustum.intersectsBox(this.shadow)};
  }
}
