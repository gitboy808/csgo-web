import { init, exportNavMesh } from '@recast-navigation/core';
import { generateSoloNavMesh } from '@recast-navigation/generators';
import { mkdir, writeFile } from 'node:fs/promises';
import { makeMapGeometry, solidTriangles } from '../src/world/map';

await init();
const map=makeMapGeometry();
const positions=[...map.positions],indices=[...map.indices];
for(const solid of map.solids) {
  const box=solidTriangles(solid),offset=positions.length/3;
  positions.push(...box.positions); indices.push(...box.indices.map(i=>i+offset));
}
const result=generateSoloNavMesh(positions,indices,{
  cs:.3,ch:.15,walkableSlopeAngle:48,walkableHeight:13,walkableClimb:3,walkableRadius:2,
  minRegionArea:8,mergeRegionArea:20,maxSimplificationError:1.1,detailSampleDist:6,
});
if(!result.success) throw new Error('Dust II navigation build failed: '+result.error);
await mkdir('public/assets',{recursive:true});
await writeFile('public/assets/dust2.navmesh.bin',exportNavMesh(result.navMesh));
result.navMesh.destroy();
console.log(`Dust II navigation built from ${positions.length/3} vertices.`);
