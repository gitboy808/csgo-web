import*as THREE from'three';
/** Bake a posed rig once before play. Copies share the resulting buffers and need no skinning. */
export function bakeStaticProp(source:THREE.Object3D){
 const root=new THREE.Group(),bounds=new THREE.Box3(),v=new THREE.Vector3(),n=new THREE.Vector3(),zero=new THREE.Vector3();source.updateMatrixWorld(true);
 source.traverseVisible(o=>{if(!(o instanceof THREE.Mesh))return;if(o instanceof THREE.SkinnedMesh)o.skeleton.update();
  const g=o.geometry.clone(),position=g.attributes.position.clone(),normal=g.attributes.normal?.clone();
  for(let i=0;i<position.count;i++){
   o.getVertexPosition(i,v).applyMatrix4(o.matrixWorld);position.setXYZ(i,v.x,v.y,v.z);bounds.expandByPoint(v);
   if(normal){n.fromBufferAttribute(normal,i);if(o instanceof THREE.SkinnedMesh){o.applyBoneTransform(i,n);o.applyBoneTransform(i,zero.set(0,0,0));n.sub(zero);}n.transformDirection(o.matrixWorld);normal.setXYZ(i,n.x,n.y,n.z);}
  }
  g.setAttribute('position',position);if(normal)g.setAttribute('normal',normal);g.deleteAttribute('skinIndex');g.deleteAttribute('skinWeight');g.deleteAttribute('tangent');g.morphAttributes={};g.userData.source2Shared=true;
  const mesh=new THREE.Mesh(g,o.material);mesh.name=o.name;mesh.castShadow=mesh.receiveShadow=true;root.add(mesh);
 });
 const center=bounds.getCenter(new THREE.Vector3()),size=bounds.getSize(new THREE.Vector3());
 for(const m of root.children as THREE.Mesh[]){m.geometry.translate(-center.x,-center.y,-center.z);m.geometry.computeBoundingBox();m.geometry.computeBoundingSphere();}
 root.userData.halfExtents={x:Math.max(.015,size.x/2),y:Math.max(.015,size.y/2),z:Math.max(.015,size.z/2)};
 return root;
}
