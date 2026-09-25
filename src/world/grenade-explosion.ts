import * as THREE from 'three';
interface Burst {root:THREE.Group;flame:THREE.Sprite;smoke:THREE.Sprite;age:number;variant:number;size:number}
export class GrenadeExplosion {
 private pool:Burst[]=[];private active:Burst[]=[];private flame!:THREE.Texture;private smoke!:THREE.Texture;
 constructor(private scene:THREE.Scene){}
 async load(){const loader=new THREE.TextureLoader();[this.flame,this.smoke]=await Promise.all(['flame','smoke'].map(kind=>loader.loadAsync(`${import.meta.env.BASE_URL}assets/source2/grenades/vfx/blast-${kind}.webp`)));this.flame.colorSpace=this.smoke.colorSpace=THREE.SRGBColorSpace;}
 prewarm(renderer:THREE.WebGLRenderer){if(!this.flame)return;renderer.initTexture(this.flame);renderer.initTexture(this.smoke);for(let i=0;i<4;i++)this.burst(new THREE.Vector3());this.clear();}
 burst(position:THREE.Vector3,size=1){if(!this.flame)return;let burst=this.pool.pop();if(!burst){if(this.active.length>=8){burst=this.active.shift()!;}else{const flameMap=this.flame.clone(),smokeMap=this.smoke.clone();flameMap.repeat.set(1/8,1/8);smokeMap.repeat.set(1/8,1/16);const flame=new THREE.Sprite(new THREE.SpriteMaterial({map:flameMap,transparent:true,depthWrite:false,color:0xffd69a,blending:THREE.AdditiveBlending})),smoke=new THREE.Sprite(new THREE.SpriteMaterial({map:smokeMap,transparent:true,depthWrite:false,color:0x716b60})),root=new THREE.Group();root.add(smoke,flame);this.scene.add(root);burst={root,flame,smoke,age:0,variant:0,size};}}
  burst.root.position.copy(position);burst.root.visible=true;burst.age=0;burst.size=size;burst.variant=Math.floor(Math.random()*4);this.active.push(burst);this.updateBurst(burst);
 }
 private updateBurst(b:Burst){
  const ff=Math.min(15,Math.floor(b.age/.5*16))+b.variant*16,sf=Math.min(31,Math.floor(b.age/1.8*32))+b.variant*32;b.flame.material.map!.offset.set(ff%8/8,1-(Math.floor(ff/8)+1)/8);b.smoke.material.map!.offset.set(sf%8/8,1-(Math.floor(sf/8)+1)/16);
  b.flame.visible=b.age<.5;b.flame.scale.setScalar((2.2+b.age*5)*b.size);b.flame.material.opacity=Math.max(0,1-b.age/.5);b.smoke.position.y=b.age*.45;b.smoke.scale.setScalar((2.3+b.age*2)*b.size);b.smoke.material.opacity=Math.min(1,b.age*10)*Math.max(0,1-b.age/1.8)*.85;
 }
 update(dt:number){for(let i=this.active.length-1;i>=0;i--){const b=this.active[i];b.age+=dt;if(b.age>1.8){b.root.visible=false;this.pool.push(b);this.active.splice(i,1);}else this.updateBurst(b);}}
 clear(){for(const b of this.active){b.root.visible=false;this.pool.push(b);}this.active=[];}
}
