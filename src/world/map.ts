import type { Vec3, Side } from '../game/types';
import type { Source2MapData } from './source2-types';

interface Area { name: string; callout: string; x1: number; z1: number; x2: number; z2: number; y1: number; y2: number }
interface MapDefinition {
  name: string; areas: Area[]; spawns: Record<Side, Vec3[]>;
  sites: { name: 'A' | 'B'; x: number; z: number }[];
}

let source2Map: Source2MapData | null = null;
export const getSource2Map = () => source2Map;
export const MAP: MapDefinition = { name: 'DUST II', areas: [], spawns: { T: [], CT: [] }, sites: [] };

export function useSource2Map(data: Source2MapData) {
  source2Map = data;
  MAP.spawns = data.spawns;
  MAP.areas = data.places.map(p => ({ name: p.name, callout: p.callout, x1: p.min.x, x2: p.max.x, z1: p.min.z, z2: p.max.z, y1: p.min.y, y2: p.max.y }));
  MAP.sites = data.sites.map(s => ({ name: s.name, x: s.position.x, z: s.position.z }));
}

export function zoneAt(x: number, z: number, y?: number): Area | undefined {
  return [...MAP.areas].reverse().find(a => x >= a.x1 && x <= a.x2 && z >= a.z1 && z <= a.z2 && (y === undefined || y >= a.y1 && y <= a.y2));
}

export function siteAt(x: number, z: number, y?: number) {
  const site = source2Map?.sites.find(s => s.volumes.some(v => x >= v.min.x && x <= v.max.x && z >= v.min.z && z <= v.max.z && (y === undefined || y >= v.min.y - .2 && y <= v.max.y)));
  return MAP.sites.find(s => s.name === site?.name);
}

export function inSpawn(side: Side, x: number, z: number) {
  return source2Map?.buyzones[side].some(v => x >= v.min.x && x <= v.max.x && z >= v.min.z && z <= v.max.z) ?? false;
}
