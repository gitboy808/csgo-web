import { init, importNavMesh, NavMeshQuery, type NavMesh } from '@recast-navigation/core';
import type { Vec3 } from './types';

export class Navigation {
  mesh!:NavMesh;query!:NavMeshQuery;
  async init() {
    await init();
    const response=await fetch(`${import.meta.env.BASE_URL}assets/dust2.navmesh.bin`);
    if(!response.ok)throw new Error('导航资源未能加载，请刷新重试。');
    const data=importNavMesh(new Uint8Array(await response.arrayBuffer()));this.mesh=data.navMesh;
    this.query=new NavMeshQuery(this.mesh,{maxNodes:8192});this.query.defaultQueryHalfExtents={x:4,y:6,z:4};
  }
  path(start:Vec3,end:Vec3):Vec3[] {
    const s=this.query.findClosestPoint(start),e=this.query.findClosestPoint(end);
    if(!s.success||!e.success)return [];
    const result=this.query.computePath(s.point,e.point);
    return result.success?result.path:[];
  }
}
