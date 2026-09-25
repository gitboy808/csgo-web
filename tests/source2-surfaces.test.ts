import {expect,it} from 'vitest';
import * as THREE from 'three';
import {restoreSurfaceGeometry,adaptSurfaceDepth} from '../src/world/source2-surfaces';

function prepare(mesh:THREE.Mesh<THREE.BufferGeometry,THREE.MeshStandardMaterial>){
  restoreSurfaceGeometry(mesh);
  adaptSurfaceDepth(mesh.material,mesh.material.userData.vmat);
  return mesh;
}
it('restores a depth-biased inset to its original wall instead of extruding it 39 cm',()=>{
  const material=new THREE.MeshStandardMaterial();material.userData.vmat={ShaderName:'csgo_vertexlitgeneric.vfx',IntParams:{F_ALPHA_TEST:1,F_DEPTH_BIAS:1},FloatParams:{g_flAlphaTestReference:.1}};
  const geometry=new THREE.PlaneGeometry(1,1);geometry.translate(0,0,.01/.0254);
  const mesh=prepare(new THREE.Mesh(geometry,material)),adapted=mesh.material as THREE.MeshStandardMaterial;
  expect(Math.max(...Array.from(mesh.geometry.attributes.position.array).filter((_,i)=>i%3===2))).toBeCloseTo(0,5);
  expect(adapted.polygonOffset).toBe(true);expect(adapted.depthWrite).toBe(true);
});
it('uses Source modulate-2x blending for neutral-grey wall transition overlays',()=>{
  const material=new THREE.MeshStandardMaterial();material.userData.vmat={ShaderName:'csgo_static_overlay.vfx',IntParams:{F_BLEND_MODE:3}};
  const mesh=prepare(new THREE.Mesh(new THREE.PlaneGeometry(),material)),adapted=mesh.material as THREE.MeshStandardMaterial;
  expect(adapted.blending).toBe(THREE.CustomBlending);expect(adapted.blendSrc).toBe(THREE.DstColorFactor);expect(adapted.blendDst).toBe(THREE.SrcColorFactor);
  expect(adapted.depthWrite).toBe(false);expect(adapted.userData.source2NoShadow).toBe(true);
});
