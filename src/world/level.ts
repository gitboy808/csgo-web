import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { Sky } from 'three/addons/objects/Sky.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MAP, heightAt, makeMapGeometry, walkable, type Surface, type Solid } from './map';
import { boxGeometry, canvasTexture, type Materials } from './materials';

export class Level {
  readonly group=new THREE.Group();
  readonly sun:THREE.DirectionalLight;
  private batches=new Map<THREE.Material,THREE.BufferGeometry[]>();
  private plasterVariants:THREE.MeshStandardMaterial[]=[];
  private leafMaterial=new THREE.MeshStandardMaterial({color:0x66714a,roughness:1,side:THREE.DoubleSide});
  private tunnelMaterial:THREE.MeshStandardMaterial;
  private randomState=42;
  constructor(readonly scene:THREE.Scene,readonly renderer:THREE.WebGLRenderer,readonly mats:Materials) {
    scene.background=new THREE.Color(0xa8c5d0);
    scene.fog=new THREE.Fog(0xd1d5ca,90,270);
    scene.add(this.group);
    this.plasterVariants=[0xe7d9be,0xd0c8b3,0xcabf9f,0xe9dfc9,0xbfc7bc].map(color=>{const m=mats.plaster.clone();m.color.setHex(color);return m;});
    this.tunnelMaterial=mats.stone.clone();this.tunnelMaterial.color.setHex(0x918268);
    const sky=new Sky();sky.scale.setScalar(1000);
    sky.material.uniforms.turbidity.value=3.2;sky.material.uniforms.rayleigh.value=1.7;
    sky.material.uniforms.mieCoefficient.value=.004;sky.material.uniforms.mieDirectionalG.value=.78;
    sky.material.uniforms.sunPosition.value.set(-.55,.8,-.45);scene.add(sky);
    const pmrem=new THREE.PMREMGenerator(renderer);
    const environment=new RoomEnvironment();
    scene.environment=pmrem.fromScene(environment,.04).texture;
    scene.environmentIntensity=.4;environment.dispose();pmrem.dispose();
    scene.add(new THREE.HemisphereLight(0xeaf4ff,0x857157,1.5));
    this.sun=new THREE.DirectionalLight(0xfff1d5,3.1);
    this.sun.position.set(-65,100,-45);this.sun.target.position.set(0,0,0);scene.add(this.sun,this.sun.target);
    this.sun.castShadow=true;this.sun.shadow.mapSize.set(4096,4096);
    Object.assign(this.sun.shadow.camera,{left:-94,right:94,top:94,bottom:-94,near:1,far:230});
    this.sun.shadow.bias=-.00015;this.sun.shadow.normalBias=.045;
    this.sun.shadow.camera.updateProjectionMatrix();
    this.build();
    this.flush();
  }
  private random(){this.randomState=(Math.imul(1664525,this.randomState)+1013904223)>>>0;return this.randomState/4294967296;}
  private add(g:THREE.BufferGeometry,m:THREE.Material,x=0,y=0,z=0,ry=0) {
    g.applyMatrix4(new THREE.Matrix4().makeRotationY(ry));g.translate(x,y,z);
    const arr=this.batches.get(m)||[];arr.push(g);this.batches.set(m,arr);
  }
  private box(w:number,h:number,d:number,m:THREE.Material,x:number,y:number,z:number,ry=0) { this.add(boxGeometry(w,h,d),m,x,y,z,ry); }
  private flush() {
    for(const [material,geometries] of this.batches) {
      // Zone batches keep shadow work and visible geometry reasonably local.
      const bins=new Map<string,THREE.BufferGeometry[]>();
      for(const g of geometries) {
        g.computeBoundingBox();const c=g.boundingBox!.getCenter(new THREE.Vector3());
        const key=`${Math.floor(c.x/32)},${Math.floor(c.z/32)}`;
        const arr=bins.get(key)||[];arr.push(g);bins.set(key,arr);
      }
      for(const geos of bins.values()) {
        const compatible=geos.map(g=>g.index?g.toNonIndexed():g);
        const g=mergeGeometries(compatible,false);if(!g)continue;
        const mesh=new THREE.Mesh(g,material);mesh.castShadow=!material.transparent;mesh.receiveShadow=true;mesh.matrixAutoUpdate=false;mesh.updateMatrix();this.group.add(mesh);
        geos.forEach(g=>g.dispose());
      }
    }
    this.batches.clear();
  }
  private build() {
    const map=makeMapGeometry();
    const floors=new Map<Surface,{p:number[],uv:number[],ind:number[]}>();
    for(let cell=0;cell<map.surfaces.length;cell++) {
      const kind=map.surfaces[cell],batch=floors.get(kind)||{p:[],uv:[],ind:[]},offset=batch.p.length/3;
      for(let i=0;i<4;i++) {
        const at=cell*12+i*3,x=map.positions[at],y=map.positions[at+1],z=map.positions[at+2];
        batch.p.push(x,y,z);batch.uv.push(x/4,z/4);
      }
      batch.ind.push(offset,offset+1,offset+2,offset,offset+2,offset+3);floors.set(kind,batch);
    }
    for(const [kind,b] of floors) {
      const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(b.p,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(b.uv,2));g.setIndex(b.ind);g.computeVertexNormals();
      this.add(g,this.mats[kind]);
    }
    this.box(700,.5,700,this.mats.sand,0,-2,0);
    for(const solid of map.solids) {
      if(solid.kind==='prop')continue;
      const tunnel=solid.x<-33&&solid.z>-25&&solid.z<29;
      const mat=solid.material==='plaster'?this.plasterVariants[Math.abs(Math.round(solid.x+solid.z))%5]:tunnel&&solid.material==='stone'?this.tunnelMaterial:this.mats[solid.material];
      this.box(solid.w,solid.h,solid.d,mat,solid.x,solid.y,solid.z,solid.rotation);
      if(solid.kind==='wall')this.facade(solid);
      if(solid.kind==='cover')this.crate(solid);
      if(solid.kind==='door')this.door(solid);
    }
    // Build masses outside the traversable streets, leaving the entire playable graph open.
    for(let x=-78;x<82;x+=10)for(let z=-78;z<82;z+=10) {
      if([[0,0],[-5,-5],[5,5],[-5,5],[5,-5]].some(([dx,dz])=>walkable(x+dx,z+dz)))continue;
      const h=5+this.random()*12;
      this.box(9.8,h,9.8,this.random()>.3?this.mats.plaster:this.mats.stone,x,h/2,z);
      this.box(10.2,.22,10.2,this.mats.trim,x,h,z);
      if(this.random()>.6) {
        this.box(2.2,1.3,1.7,this.mats.metal,x+1,h+.65,z);
        this.antenna(x-2,h,z+1);
      }
    }
    this.arch(-5,-18,0,12,6.4,0);this.arch(-28,-42,0,16,6.7,Math.PI/2);this.arch(34,34,0,12,6.6,0);
    this.arch(-43,-23,0,10,5.1,0);
    // A's raised edge, crenellated perimeter, B's restored kasbah and hotel frontage.
    this.box(25,.3,1.4,this.mats.trim,44,4.04,-23);
    this.box(.28,1.1,16,this.mats.metal,29.7,4.65,-34);
    for(let i=0;i<9;i++)this.box(.18,1.3,.18,this.mats.metal,29.7,4.65,-26-i*1.75);
    this.box(9,5.5,1,this.mats.plaster,45,7.7,-54.6);
    this.sign('HÔTEL AURORE','فندق أورور',11,2,45,10,-53.75,.0,0x204c5f,0xe3dcc6);
    this.sign('A','',2.3,2.8,34,6.2,-53.7,0,0xd6c6a7,0x9b3c24);
    this.sign('B','',2.5,3,-59.3,3,-38,Math.PI/2,0xc6b99b,0x9b3c24);
    this.sign('A  →','LONGUE',2.7,1.5,40.3,3,31,Math.PI,0xd5c8aa,0x984229);
    this.sign('←  B','TUNNELS',2.8,1.4,-16.6,2.4,47,Math.PI/2,0xd7c7a7,0x9c422e);
    this.sign('SALON DE COIFFURE','صالون الحلاقة',7,1.5,61.7,4.6,-1,-Math.PI/2,0x38758a,0xf5ecd6);
    this.sign('MÉCANIQUE GÉNÉRALE','خدمات السيارات',8,1.3,38,5.8,54.55,Math.PI,0xded2ae,0x285469);
    this.sign('ÉPICERIE DU SOLEIL','بقالة الشمس',8,1.2,-17,4.8,60,Math.PI/2,0x6d3930,0xe8d7b4);
    this.sign('DENTISTE','عيادة الأسنان',5,1.1,25.35,7,-12,Math.PI/2,0xc1d0c5,0x3a6470);
    this.landmarks();
    for(const site of MAP.sites)this.sitePaint(site.x,heightAt(site.x,site.z)+.025,site.z,site.name);
    this.car(59,-14,-.07,0xacc1b9);this.car(-57,-49,.05,0xc3b899);
    for(const [x,z] of [[-55,-25],[-53,-25],[57,-49],[57,-47],[35,25],[-36,24],[-34,-51]])this.barrel(x,heightAt(x,z),z);
    // Arched tunnel ribs, exposed timber and skylight rubble.
    for(let z=-19;z<3;z+=5) {
      this.box(.3,4.9,.4,this.mats.trim,-47.7,2.45,z);this.box(.3,4.9,.4,this.mats.trim,-38.3,2.45,z);
      this.box(10,.24,.4,this.mats.trim,-43,4.7,z);
    }
    for(let z=15;z<=19;z+=2)this.box(18,.3,.2,this.mats.wood,-43,5.8,z);
    const warmLight=new THREE.PointLight(0xffd18b,16,19,2);warmLight.position.set(-42,3.9,-7);this.scene.add(warmLight);
    const lowerLight=new THREE.PointLight(0xffd797,12,16,2);lowerLight.position.set(-27,3.6,6);this.scene.add(lowerLight);
    for(const [x,z]of [[63,8],[61,-18],[27,40],[-18,44],[-61,-23],[-25,-53]])this.palm(x,0,z);
    this.wire(new THREE.Vector3(62,9,16),new THREE.Vector3(37,10,26));
    this.wire(new THREE.Vector3(-15,9,28),new THREE.Vector3(13,10,39));
    this.wire(new THREE.Vector3(-26,10,-50),new THREE.Vector3(16,10,-61));
    this.wire(new THREE.Vector3(-52,9,41),new THREE.Vector3(-18,9,52));
    // Dirt stains, weeds and rubble collect along building footings.
    for(let i=0;i<360;i++) {
      const wall=map.walls[Math.floor(this.random()*map.walls.length)];
      const x=wall.x+(this.random()-.5)*wall.w,z=wall.z+(this.random()-.5)*wall.d;
      const y=heightAt(x,z);
      if(this.random()<.4)this.add(new THREE.DodecahedronGeometry(.06+this.random()*.18,0),this.mats.stone,x,y+.07,z,this.random()*6);
      else this.weed(x,y,z,.15+this.random()*.3);
    }
  }
  private facade(s:Solid) {
    const horizontal=s.w>s.d,len=horizontal?s.w:s.d;
    const base=s.y-s.h/2,top=s.y+s.h/2;
    const m=this.mats;
    this.box(s.w+.2,.26,s.d+.2,m.trim,s.x,top+.03,s.z);
    this.box(s.w+.06,.8,s.d+.06,m.stone,s.x,base+.4,s.z);
    if(s.x<-33&&s.z>-25&&s.z<29)return;
    if(s.x<-25&&s.z<-22){
      for(let i=-len/2+.6;i<len/2-.5;i+=1.9)this.box(horizontal?.9:1.2,.8,horizontal?1.2:.9,m.stone,s.x+(horizontal?i:0),top+.5,s.z+(horizontal?0:i));
      if(len>8)this.box(s.w+.2,.17,s.d+.2,m.trim,s.x,base+3,s.z);
      return;
    }
    if(len<4 || s.kind==='roof')return;
    for(let along=-len/2+2.3;along<len/2-1;along+=4.5) {
      const x=s.x+(horizontal?along:0),z=s.z+(horizontal?0:along);
      for(const side of [-1,1]) {
        const xx=x+(horizontal?0:side*(s.w/2+.025)),zz=z+(horizontal?side*(s.d/2+.025):0);
        if(!walkable(xx+(horizontal?0:side),zz+(horizontal?side:0)))continue;
        const ry=horizontal?(side>0?0:Math.PI):(side>0?Math.PI/2:-Math.PI/2);
        const level=base+3.8+(this.random()-.5)*.25;
        this.box(1.35,1.85,.12,m.trim,xx,level,zz,ry);
        this.box(1.1,1.6,.16,m.window,xx,level,zz,ry);
        const v=new THREE.Vector3(.38,0,.1).applyAxisAngle(new THREE.Vector3(0,1,0),ry);
        for(const sign of [-1,1]) this.box(.06,1.6,.21,m.dark,xx+sign*v.x,level,zz+sign*v.z,ry);
        this.box(1.6,.16,.5,m.trim,xx,level-.95,zz,ry);
        if(s.h>9) {
          this.box(1.3,1.5,.14,m.blue,xx,level+3.2,zz,ry);
          this.box(1.5,.12,.45,m.trim,xx,level+2.35,zz,ry);
          for(let j=0;j<8;j++)this.box(1.17,.032,.17,m.dark,xx,level+2.61+j*.16,zz,ry);
        }
        if(this.random()>.68) {
          const offset=horizontal?.7:0;
          this.box(1.1,.65,.6,m.trim,xx+offset,level+1.5,zz,ry);
          for(let j=0;j<4;j++)this.box(.9,.025,.64,m.dark,xx+offset,level+1.28+j*.13,zz,ry);
        }
        if(this.random()>.45){
          this.box(1.6,2.45,.18,m.wood,xx,base+1.23,zz,ry);
          for(let j=0;j<7;j++)this.box(.055,2.37,.22,m.dark,xx+(horizontal?(j-3)*.21:0),base+1.22,zz+(horizontal?0:(j-3)*.21),ry);
          this.box(1.9,.12,.5,m.trim,xx,base+2.51,zz,ry);
        }
      }
    }
    if(this.random()>.55)this.antenna(s.x,top,s.z);
  }
  private crate(s:Solid) {
    const m=s.material==='wood'?this.mats.wood:this.mats.dark;
    for(const x of [-1,1])for(const z of [-1,1]) {
      const p=new THREE.Vector3(x*(s.w/2-.08),0,z*(s.d/2-.08)).applyAxisAngle(new THREE.Vector3(0,1,0),s.rotation||0);
      this.box(.17,s.h+.1,.17,this.mats.dark,s.x+p.x,s.y,s.z+p.z,s.rotation);
    }
    for(const y of [-1,1])this.box(s.w+.07,.16,s.d+.07,m,s.x,s.y+y*(s.h/2-.12),s.z,s.rotation);
    if(s.material==='metal')for(let i=-s.w/2+.3;i<s.w/2;i+=.6)this.box(.045,s.h,.045,this.mats.trim,s.x+i,s.y,s.z+s.d/2+.015);
  }
  private door(s:Solid) {
    const wide=s.w>s.d;
    for(let h=.6;h<s.h;h+=1.2)this.box(wide?s.w+.04:.3,.1,wide?.3:s.d+.04,this.mats.dark,s.x,h,s.z,s.rotation);
    for(let p=-1;p<=1;p+=2)this.box(.13,.15,.13,this.mats.trim,s.x+p*(wide?s.w*.3:.2),2,s.z+p*(wide?.2:s.d*.3));
  }
  private arch(x:number,z:number,y:number,width:number,height:number,rotation:number) {
    const shape=new THREE.Shape(),r=width/2;
    shape.moveTo(-r-1,0);shape.lineTo(-r-1,height+1.4);shape.lineTo(r+1,height+1.4);shape.lineTo(r+1,0);shape.lineTo(r,0);shape.lineTo(r,height-r*.48);
    shape.absellipse(0,height-r*.48,r,r*.48,0,Math.PI,false,0);shape.lineTo(-r,0);shape.lineTo(-r-1,0);
    const g=new THREE.ExtrudeGeometry(shape,{depth:.7,bevelEnabled:false,curveSegments:20});g.translate(0,0,-.35);
    this.add(g,this.mats.stone,x,y,z,rotation);
    for(const side of [-1,1]) {
      const p=new THREE.Vector3(side*(r+.5),0,0).applyAxisAngle(new THREE.Vector3(0,1,0),rotation);
      this.box(1.1,height+.8,1.2,this.mats.trim,x+p.x,y+(height+.8)/2,z+p.z,rotation);
    }
  }
  private sign(text:string,sub:string,w:number,h:number,x:number,y:number,z:number,ry:number,bg:number,fg:number) {
    const color=(n:number)=>'#'+n.toString(16).padStart(6,'0');
    const height=Math.round(1024*h/w);
    const texture=canvasTexture(1024,height,ctx=>{
      ctx.fillStyle=color(bg);ctx.fillRect(0,0,1024,height);
      ctx.strokeStyle=color(fg);ctx.lineWidth=5;ctx.strokeRect(12,12,1000,height-24);
      ctx.fillStyle=color(fg);ctx.textAlign='center';ctx.textBaseline='middle';
      ctx.font=`bold ${text.length<4?height*.76:Math.min(height*.36,140)}px Arial`;ctx.fillText(text,512,sub?height*.36:height*.55,900);
      if(sub){ctx.font=`${height*.23}px Arial`;ctx.fillText(sub,512,height*.76,950);}
      // A deterministic weathered print, without remote imagery.
      for(let i=0;i<180;i++){ctx.fillStyle=`rgba(35,30,22,${this.random()*.14})`;ctx.fillRect(this.random()*1024,this.random()*height,this.random()*30,1+this.random()*4);}
    });
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(w,h),new THREE.MeshStandardMaterial({map:texture,roughness:.95,side:THREE.DoubleSide}));
    mesh.position.set(x,y,z);mesh.rotation.y=ry;this.group.add(mesh);
  }
  private sitePaint(x:number,y:number,z:number,name:string) {
    const tex=canvasTexture(512,512,c=>{c.clearRect(0,0,512,512);c.strokeStyle='#a64c29';c.lineWidth=10;c.strokeRect(35,35,442,442);c.beginPath();c.arc(256,256,170,0,Math.PI*2);c.stroke();c.fillStyle='#a64c29';c.font='bold 260px Arial';c.textAlign='center';c.textBaseline='middle';c.fillText(name,256,270);});
    const mesh=new THREE.Mesh(new THREE.PlaneGeometry(12,12),new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.72,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-1}));
    mesh.rotation.x=-Math.PI/2;mesh.position.set(x,y,z);this.group.add(mesh);
  }
  private barrel(x:number,y:number,z:number) {
    this.add(new THREE.CylinderGeometry(.46,.46,1.25,14),this.mats.metal,x,y+.63,z);
    for(const h of [.13,.99])this.add(new THREE.CylinderGeometry(.48,.48,.07,14),this.mats.dark,x,y+h,z);
  }
  private car(x:number,z:number,ry:number,color:number) {
    const m=new THREE.MeshStandardMaterial({color,roughness:.8,metalness:.25}),base=heightAt(x,z);
    this.box(2.1,.65,4.4,m,x,base+.8,z,ry);this.box(1.9,.75,2.3,m,x,base+1.4,z-.25,ry);
    this.box(1.77,.57,2.36,this.mats.window,x,base+1.45,z-.25,ry);
    this.box(1.9,.12,2.1,m,x,base+1.85,z-.25,ry);
    this.box(2.14,.2,.2,this.mats.dark,x,base+.65,z+2.25,ry);
    for(const a of [-1,1])for(const b of [-1,1]) {
      const g=new THREE.CylinderGeometry(.46,.46,.32,14);g.rotateZ(Math.PI/2);
      this.add(g,this.mats.dark,x+a*1.02,base+.46,z+b*1.35,ry);
    }
    for(const a of [-1,1])this.box(.56,.22,.1,this.mats.trim,x+a*.66,base+1,z+2.25,ry);
  }
  private wire(a:THREE.Vector3,b:THREE.Vector3) {
    const mid=a.clone().lerp(b,.5);mid.y-=2;
    const curve=new THREE.QuadraticBezierCurve3(a,mid,b);
    this.add(new THREE.TubeGeometry(curve,20,.025,4,false),this.mats.dark);
  }
  private antenna(x:number,y:number,z:number) {
    this.box(.045,2.6,.045,this.mats.dark,x,y+1.3,z);
    this.box(2.1,.035,.035,this.mats.dark,x,y+2.3,z);
    for(let i=0;i<5;i++)this.box(.03,.03,.8,this.mats.dark,x-.8+i*.4,y+2.3,z);
    if(this.random()>.5){const g=new THREE.SphereGeometry(.65,12,8,0,Math.PI);g.rotateX(.7);this.add(g,this.mats.trim,x+.8,y+.5,z);}
  }
  private palm(x:number,y:number,z:number) {
    this.add(new THREE.CylinderGeometry(.22,.35,9,8),this.mats.wood,x,y+4.5,z);
    for(let i=0;i<9;i++) {
      const a=i*Math.PI*2/9,curve=new THREE.QuadraticBezierCurve3(new THREE.Vector3(x,y+9,z),new THREE.Vector3(x+Math.cos(a)*2.4,y+10,z+Math.sin(a)*2.4),new THREE.Vector3(x+Math.cos(a)*4,y+8,z+Math.sin(a)*4));
      this.add(new THREE.TubeGeometry(curve,8,.024,4,false),this.leafMaterial);
      for(let j=1;j<19;j++)for(const side of [-1,1]){
        const t=j/20,p=curve.getPoint(t),q=curve.getPoint(t+.025),length=Math.sin(t*Math.PI)*.85;
        const tip=p.clone().add(new THREE.Vector3(Math.cos(a+side*1.1)*length,-.15,Math.sin(a+side*1.1)*length));
        const g=new THREE.BufferGeometry().setFromPoints([p,q,tip]);g.setAttribute('uv',new THREE.Float32BufferAttribute([0,0,0,1,1,.5],2));g.computeVertexNormals();this.add(g,this.leafMaterial);
      }
    }
  }
  private landmarks(){
    const m=this.mats;
    // The kasbah has massive buttresses, a broken wall and a small raised window.
    for(const z of [-50,-42,-31])this.box(1.2,7,1.3,m.stone,-59.1,3.5,z);
    for(const x of [-56,-46,-36])this.box(1.5,7,1.3,m.stone,x,3.5,-53.1);
    this.box(.5,.9,6.4,m.stone,-26,.45,-53.1);
    this.box(.5,1,6.4,m.stone,-26,4.15,-53.1);
    this.box(.5,4.4,.8,m.stone,-26,2.2,-55.6);this.box(.5,4.4,.8,m.stone,-26,2.2,-50.6);
    this.box(1.4,.15,5.8,m.trim,-26,1,-53.1);
    // A's hotel has a sun-faded blue band and shuttered, recessed shop fronts.
    this.box(26,1.4,.12,m.blue,44,5.4,-53.72);
    for(const x of [38,44,50]){
      this.box(3.2,3.1,.2,m.dark,x,6,-53.55);
      for(let j=0;j<18;j++)this.box(3.05,.105,.24,m.metal,x,4.6+j*.16,-53.53);
      this.box(3.45,.16,.6,m.trim,x,7.68,-53.5);
    }
    this.box(11.4,.16,1.1,m.trim,45,11.1,-53.5);
    // A long: blue lower facades, retail shutters and awnings.
    this.box(.14,2.4,17,m.blue,61.75,1.2,-.5);
    for(const z of [-6,0,6]){
      this.box(.19,2.7,3,m.dark,61.65,1.38,z);
      for(let j=0;j<15;j++)this.box(.22,.13,2.9,m.metal,61.57,.16+j*.17,z);
      this.box(1.6,.15,3.3,m.trim,61,3.2,z);
    }
    // Road paint, utility poles and cable runs break up the large street surfaces.
    const paint=new THREE.MeshStandardMaterial({color:0xdbd7be,roughness:1,transparent:true,opacity:.5,depthWrite:false});
    for(let z=14;z>-24;z-=7){const y=heightAt(52,z)+.015;const g=new THREE.PlaneGeometry(.12,3);g.rotateX(-Math.PI/2);this.add(g,paint,52,y,z);}
    for(const [x,z]of [[61,17],[-13,29],[-25,-49]]){
      this.add(new THREE.CylinderGeometry(.1,.16,9,8),m.wood,x,4.5,z);this.box(2,.1,.1,m.dark,x,8.8,z);
      for(const dx of [-.7,0,.7])this.add(new THREE.CylinderGeometry(.08,.08,.25,8),m.trim,x+dx,8.94,z);
    }
    // Layered grime and cracks are geometry-aligned so they do not change collision.
    const dirt=canvasTexture(256,256,c=>{
      const gradient=c.createLinearGradient(0,0,0,256);gradient.addColorStop(0,'rgba(50,40,23,0)');gradient.addColorStop(.8,'rgba(65,55,32,.2)');gradient.addColorStop(1,'rgba(48,40,24,.58)');c.fillStyle=gradient;c.fillRect(0,0,256,256);
      c.strokeStyle='rgba(42,39,29,.24)';c.lineWidth=1;for(let i=0;i<12;i++){let x=this.random()*256,y=this.random()*170;c.beginPath();c.moveTo(x,y);for(let j=0;j<8;j++){x+=(this.random()-.5)*10;y+=this.random()*13;c.lineTo(x,y);}c.stroke();}
    });
    const grime=new THREE.MeshBasicMaterial({map:dirt,transparent:true,opacity:.65,depthWrite:false,side:THREE.DoubleSide});
    for(const wall of makeMapGeometry().walls){
      const horizontal=wall.w>wall.d;
      for(const side of [-1,1]){
        const x=wall.x+(horizontal?0:side*(wall.w/2+.02)),z=wall.z+(horizontal?side*(wall.d/2+.02):0);
        if(!walkable(x+(horizontal?0:side),z+(horizontal?side:0)))continue;
        const geo=new THREE.PlaneGeometry(horizontal?wall.w:wall.d,2.3);this.add(geo,grime,x,heightAt(x,z)+1.15,z,horizontal?0:Math.PI/2);
      }
    }
  }
  private weed(x:number,y:number,z:number,h:number) {
    const g=new THREE.ConeGeometry(.13,h,3);this.add(g,this.mats.wood,x,y+h/2,z,this.random()*6);
  }
}
