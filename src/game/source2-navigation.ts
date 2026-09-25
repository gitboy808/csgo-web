import { Triangle,Vector3 } from 'three';
import type { Vec3 } from './types';
import type { Source2NavArea } from '../world/source2-types';

interface Area extends Source2NavArea {center:Vector3;points:Vector3[];triangles:Triangle[];minX:number;minZ:number;maxX:number;maxZ:number}
export class Source2Navigation {
  readonly areas=new Map<number,Area>();
  private grid=new Map<string,Area[]>();
  constructor(data:Source2NavArea[]) {
    for(const input of data){
      const points=input.vertices.map(v=>new Vector3(...v)),center=new Vector3();points.forEach(p=>center.add(p));center.divideScalar(points.length);
      const triangles:Triangle[]=[];for(let i=1;i<points.length-1;i++)triangles.push(new Triangle(points[0],points[i],points[i+1]));
      const area:Area={...input,center,points,triangles,minX:Math.min(...points.map(p=>p.x)),maxX:Math.max(...points.map(p=>p.x)),minZ:Math.min(...points.map(p=>p.z)),maxZ:Math.max(...points.map(p=>p.z))};
      this.areas.set(area.id,area);
      for(let x=Math.floor(area.minX/4);x<=Math.floor(area.maxX/4);x++)for(let z=Math.floor(area.minZ/4);z<=Math.floor(area.maxZ/4);z++){const key=`${x},${z}`,bucket=this.grid.get(key)||[];bucket.push(area);this.grid.set(key,bucket);}
    }
  }
  nearest(point:Vec3):{area:Area;point:Vector3;distance:number}|null {
    const p=new Vector3(point.x,point.y,point.z),closest=new Vector3();let best:{area:Area;point:Vector3;distance:number}|null=null;
    const gx=Math.floor(point.x/4),gz=Math.floor(point.z/4),candidates=new Set<Area>();
    for(let x=gx-2;x<=gx+2;x++)for(let z=gz-2;z<=gz+2;z++)for(const a of this.grid.get(`${x},${z}`)||[])candidates.add(a);
    const iterable=candidates.size?candidates:this.areas.values();
    for(const a of iterable)for(const triangle of a.triangles){triangle.closestPointToPoint(p,closest);const distance=closest.distanceToSquared(p);if(!best||distance<best.distance)best={area:a,point:closest.clone(),distance};}
    return best;
  }
  heightAt(x:number,z:number,hint=Infinity):number {
    const candidates=this.grid.get(`${Math.floor(x/4)},${Math.floor(z/4)}`)||[];let chosen:number|undefined;
    for(const a of candidates)for(const triangle of a.triangles){
      const {a:p,b:q,c:r}=triangle,den=(q.z-r.z)*(p.x-r.x)+(r.x-q.x)*(p.z-r.z);if(Math.abs(den)<1e-10)continue;
      const u=((q.z-r.z)*(x-r.x)+(r.x-q.x)*(z-r.z))/den,v=((r.z-p.z)*(x-r.x)+(p.x-r.x)*(z-r.z))/den;
      if(u<-.002||v<-.002||u+v>1.002)continue;const y=u*p.y+v*q.y+(1-u-v)*r.y;
      if(chosen===undefined||(hint===Infinity?y>chosen:Math.abs(y-hint)<Math.abs(chosen-hint)))chosen=y;
    }
    return chosen??this.nearest({x,y:Number.isFinite(hint)?hint:0,z})?.point.y??0;
  }
  private portal(previous:Area,next:Area,edge:number,targetEdge:number){
    const a=previous.points[edge%previous.points.length],b=previous.points[(edge+1)%previous.points.length],c=next.points[targetEdge%next.points.length],d=next.points[(targetEdge+1)%next.points.length];
    const delta=b.clone().sub(a),len2=delta.x*delta.x+delta.z*delta.z;
    const project=(p:Vector3)=>len2>1e-8?((p.x-a.x)*delta.x+(p.z-a.z)*delta.z)/len2:.5;
    const low=Math.max(0,Math.min(project(c),project(d))),high=Math.min(1,Math.max(project(c),project(d)));
    const from=a.clone().lerp(b,low<=high?(low+high)/2:.5),other=d.clone().sub(c),otherLength=other.x*other.x+other.z*other.z;
    const t=otherLength>1e-8?Math.max(0,Math.min(1,((from.x-c.x)*other.x+(from.z-c.z)*other.z)/otherLength)):.5;
    return {from,to:c.clone().lerp(d,t)};
  }
  path(start:Vec3,end:Vec3):Vec3[]{
    const from=this.nearest(start),to=this.nearest(end);if(!from||!to)return [];
    if(from.area.id===to.area.id)return [from.point,to.point];
    const score=new Map<number,number>([[from.area.id,0]]),parent=new Map<number,{id:number;edge:number;targetEdge:number}>();
    const open=new Set<number>([from.area.id]),closed=new Set<number>();let found=false;
    while(open.size){
      let current=-1,best=Infinity;
      for(const id of open){const f=score.get(id)!+this.areas.get(id)!.center.distanceTo(to.area.center);if(f<best){best=f;current=id;}}
      if(current===to.area.id){found=true;break;}open.delete(current);closed.add(current);const area=this.areas.get(current)!;
      for(const connection of area.connections){
        const next=this.areas.get(connection.area);if(!next||closed.has(next.id))continue;
        const portal=this.portal(area,next,connection.fromEdge,connection.targetEdge);
        // The original graph includes jump/boost links. Walking bots must not treat
        // the CT boost boxes or the T-spawn wall as ordinary stairs.
        if(portal.to.y-portal.from.y>.46||portal.from.y-portal.to.y>4.05||Math.hypot(portal.to.x-portal.from.x,portal.to.z-portal.from.z)>.55)continue;
        const flags=BigInt(next.flags),penalty=(flags&0x40000n)?12:(flags&0x10000n)?2.5:(flags&0x80n)?1.4:1;
        const candidate=score.get(current)!+area.center.distanceTo(next.center)*penalty;
        if(candidate<(score.get(next.id)??Infinity)){score.set(next.id,candidate);parent.set(next.id,{id:current,edge:connection.fromEdge,targetEdge:connection.targetEdge});open.add(next.id);}
      }
    }
    if(!found)return [];
    const ids=[to.area.id];while(ids.at(-1)!==from.area.id)ids.push(parent.get(ids.at(-1)!)!.id);ids.reverse();
    const result:Vec3[]=[from.point];
    for(let i=1;i<ids.length;i++){
      const previous=this.areas.get(ids[i-1])!,next=this.areas.get(ids[i])!,link=parent.get(next.id)!;
      const portal=this.portal(previous,next,link.edge,link.targetEdge);result.push(portal.from,portal.to);
    }
    result.push(to.point);
    const out:Vec3[]=[];
    for(const p of result){
      if(out.length&&new Vector3(p.x,p.y,p.z).distanceTo(new Vector3().copy(out.at(-1)!))<.08)continue;
      if(out.length>=2){const a=out[out.length-2],b=out[out.length-1];const ab=new Vector3(b.x-a.x,b.y-a.y,b.z-a.z),bc=new Vector3(p.x-b.x,p.y-b.y,p.z-b.z);if(ab.normalize().dot(bc.normalize())>.995)out.pop();}
      out.push(p);
    }
    return out;
  }
}
