import * as THREE from 'three';
import type { Surface } from './map';

export type Materials = Record<Surface, THREE.MeshStandardMaterial> & { trim: THREE.MeshStandardMaterial; blue: THREE.MeshStandardMaterial; window: THREE.MeshStandardMaterial; red: THREE.MeshStandardMaterial };
export async function loadMaterials(progress: (fraction:number)=>void): Promise<Materials> {
  const loader=new THREE.TextureLoader();
  let done=0;
  const palette:Record<Surface,number>={plaster:0xebdec2,stone:0xd0bf9a,road:0xc4c5b9,sand:0xe5d7b7,wood:0x9f8f6e,metal:0x8d9f9b,dark:0x222c2c,paving:0xdfd4bc};
  const result={} as Materials;
  await Promise.all(Object.entries(palette).map(async([key,color])=>{
    const kind=key as Surface;
    if(kind==='dark') { result[kind]=new THREE.MeshStandardMaterial({color,roughness:.85}); return; }
    const textures=await Promise.all(['color','normal','arm'].map(async type=>{
      const texture=await loader.loadAsync(`${import.meta.env.BASE_URL}assets/textures/${kind}-${type}.jpg`);
      texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
      texture.anisotropy=8;
      if(type==='color')texture.colorSpace=THREE.SRGBColorSpace;
      progress(++done/21);
      return texture;
    }));
    result[kind]=new THREE.MeshStandardMaterial({color,map:textures[0],normalMap:textures[1],normalScale:new THREE.Vector2(.5,.5),roughnessMap:textures[2],aoMap:textures[2],aoMapIntensity:.8,roughness:kind==='metal'?.7:1,metalness:kind==='metal'?.35:0});
  }));
  result.trim=new THREE.MeshStandardMaterial({color:0xcabca0,roughness:.91});
  result.blue=new THREE.MeshStandardMaterial({color:0x467b8b,roughness:.83,normalMap:result.plaster.normalMap});
  result.window=new THREE.MeshStandardMaterial({color:0x1d373b,roughness:.32,metalness:.3});
  result.red=new THREE.MeshStandardMaterial({color:0x963e2d,roughness:.9});
  return result;
}
export function boxGeometry(w:number,h:number,d:number):THREE.BoxGeometry {
  const g=new THREE.BoxGeometry(w,h,d);
  const p=g.attributes.position,n=g.attributes.normal,uv=g.attributes.uv;
  for(let i=0;i<p.count;i++) {
    if(Math.abs(n.getY(i))>.5) uv.setXY(i,p.getX(i)/3,p.getZ(i)/3);
    else uv.setXY(i,(Math.abs(n.getX(i))>.5?p.getZ(i):p.getX(i))/3,p.getY(i)/3);
  }
  return g;
}
export function canvasTexture(w:number,h:number,draw:(ctx:CanvasRenderingContext2D)=>void) {
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d')!;draw(ctx);
  const t=new THREE.CanvasTexture(canvas);t.colorSpace=THREE.SRGBColorSpace;t.anisotropy=4;return t;
}
