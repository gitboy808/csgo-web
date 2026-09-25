import * as THREE from 'three';

const LEGACY_OVERLAY_EXTRUSION=.01/.0254;
export function isSourceOverlay(vmat:any){return vmat.IntParams?.F_OVERLAY===1||String(vmat.ShaderName).endsWith('static_overlay.vfx')||vmat.ShaderName==='citadel_overlay.vfx';}
function hasSourceDepthBias(vmat:any){return isSourceOverlay(vmat)||vmat.IntParams?.F_DEPTH_BIAS===1||vmat.IntParams?.F_DEPTHBIAS===1;}

/** The pinned VRF exporter offsets already-converted metre positions by a value
 * still expressed in Source inches (0.01 / 0.0254). Undo that geometry inflation;
 * use a raster depth bias for coplanar layers instead of distorting their mesh.
 */
export function restoreSurfaceGeometry(mesh:THREE.Mesh){
  const materials=Array.isArray(mesh.material)?mesh.material:[mesh.material],geometry=mesh.geometry;
  if(geometry.userData.source2OverlayRestored||!materials.every(m=>hasSourceDepthBias(m.userData.vmat??{})))return false;
  const position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal');if(!position||!normal)return false;
  const distance=materials[0].userData.source2OverlayOffset??LEGACY_OVERLAY_EXTRUSION;
  const restored=position.clone();
  // Clone the attribute: glTF may share its accessor with another primitive.
  for(let i=0;i<restored.count;i++)restored.setXYZ(i,position.getX(i)-normal.getX(i)*distance,position.getY(i)-normal.getY(i)*distance,position.getZ(i)-normal.getZ(i)*distance);
  geometry.setAttribute('position',restored);geometry.computeBoundingBox();geometry.computeBoundingSphere();
  geometry.userData.source2OverlayRestored=true;return true;
}

export function adaptSurfaceDepth(material:THREE.Material,vmat:any){
  const flags=vmat.IntParams??{},floats=vmat.FloatParams??{},overlay=isSourceOverlay(vmat);
  if(flags.F_ALPHA_TEST){material.alphaTest=floats.g_flAlphaTestReference??(material.alphaTest||.5);}
  if(hasSourceDepthBias(vmat)){material.polygonOffset=true;material.polygonOffsetFactor=-1;material.polygonOffsetUnits=-1;}
  if(!overlay)return;
  material.depthWrite=false;material.userData.source2NoShadow=true;
  const mode=flags.F_BLEND_MODE??1;
  material.transparent=mode!==2;
  if(mode===2){material.alphaTest=floats.g_flAlphaTestReference??.5;return;}
  if(mode===3||mode===5||mode===6){
    material.blending=THREE.CustomBlending;material.blendEquation=THREE.AddEquation;
    material.blendSrc=mode===5?THREE.ZeroFactor:THREE.DstColorFactor;
    material.blendDst=mode===3||mode===5?THREE.SrcColorFactor:THREE.OneMinusSrcAlphaFactor;
    // Modulation works on the existing wall color; the decal is not another lit wall.
    material.toneMapped=false;
  }else if(mode===4)material.blending=THREE.AdditiveBlending;
}
