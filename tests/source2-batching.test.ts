import {it,expect} from 'vitest';
import * as THREE from 'three';
import {batchStaticMap} from '../src/world/source2-batching';

it('preserves transforms, lightmap UVs and transparent props when batching the static map',()=>{
  const root=new THREE.Group(),parent=new THREE.Group(),material=new THREE.MeshStandardMaterial(),geometry=new THREE.BoxGeometry();
  root.rotation.y=Math.PI/2;parent.position.set(3,2,-1);root.add(parent);
  geometry.setAttribute('uv1',geometry.attributes.uv.clone());
  const original:THREE.Matrix4[]=[];
  for(let i=0;i<3;i++){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(i*3,i,-i);mesh.rotation.y=i*.3;parent.add(mesh);}
  const glass=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({transparent:true}));root.add(glass);root.updateMatrixWorld(true);
  parent.children.forEach(mesh=>original.push(mesh.matrixWorld.clone()));
  const result=batchStaticMap(root);root.updateMatrixWorld(true);
  expect(result).toEqual({objects:3,batches:1});expect(glass.parent).toBe(root);
  const batch=root.children.find(o=>o instanceof THREE.BatchedMesh) as THREE.BatchedMesh;
  expect(Array.from(batch.geometry.attributes.uv1.array).slice(0,geometry.attributes.uv1.array.length)).toEqual(Array.from(geometry.attributes.uv1.array));
  for(let i=0;i<3;i++){const matrix=new THREE.Matrix4();batch.getMatrixAt(i,matrix);matrix.premultiply(batch.matrixWorld);matrix.elements.forEach((n,j)=>expect(n).toBeCloseTo(original[i].elements[j],5));}
});
