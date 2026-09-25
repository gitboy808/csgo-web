import * as THREE from 'three';

/** Combine submissions while retaining every source vertex and per-object culling. */
export function batchStaticMap(root:THREE.Object3D):{objects:number;batches:number}{
  root.updateMatrixWorld(true);
  type StaticMesh=THREE.Mesh<THREE.BufferGeometry,THREE.Material>;
  const groups=new Map<string,StaticMesh[]>(),inverse=root.matrixWorld.clone().invert();
  root.traverse(object=>{
    if(!(object instanceof THREE.Mesh)||object instanceof THREE.SkinnedMesh||Array.isArray(object.material)||object.material.transparent||object.material instanceof THREE.ShaderMaterial)return;
    if(object.matrixWorld.determinant()<0)return; // Mirrored props need their original face winding.
    const geometry=object.geometry as THREE.BufferGeometry;
    const layout=Object.entries(geometry.attributes).sort(([a],[b])=>a.localeCompare(b)).map(([name,a])=>`${name}:${a.itemSize}:${a.normalized}:${a.array.constructor.name}`).join(',');
    const key=`${object.material.uuid}/${!!object.geometry.index}/${object.castShadow}/${object.receiveShadow}/${object.renderOrder}/${layout}`;
    const list=groups.get(key)||[];list.push(object as StaticMesh);groups.set(key,list);
  });
  let objects=0,batches=0;const retired=new Set<THREE.BufferGeometry>();
  for(const list of groups.values()){
    if(list.length<3)continue;
    const geometries=[...new Set(list.map(m=>m.geometry))];
    const vertices=geometries.reduce((n,g)=>n+g.attributes.position.count,0),indices=geometries.reduce((n,g)=>n+(g.index?.count||0),0);
    const batch=new THREE.BatchedMesh(list.length,vertices,indices,list[0].material);
    batch.name=`Source 2 batch — ${list[0].material.name}`;batch.castShadow=list[0].castShadow;batch.receiveShadow=list[0].receiveShadow;batch.renderOrder=list[0].renderOrder;batch.sortObjects=false;
    const ids=new Map(geometries.map(g=>[g,batch.addGeometry(g)]));
    for(const mesh of list){const id=batch.addInstance(ids.get(mesh.geometry)!);batch.setMatrixAt(id,new THREE.Matrix4().multiplyMatrices(inverse,mesh.matrixWorld));mesh.removeFromParent();retired.add(mesh.geometry);}
    batch.computeBoundingBox();batch.computeBoundingSphere();root.add(batch);objects+=list.length;batches++;
  }
  root.traverse(object=>{if(object instanceof THREE.Mesh)retired.delete(object.geometry);});
  retired.forEach(geometry=>geometry.dispose());
  return {objects,batches};
}
