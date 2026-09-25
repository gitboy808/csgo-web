import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {parseKV3} from './source2-kv3';
const root='local-assets/grenades/';await mkdir(root,{recursive:true});
const weapons=parseKV3(await readFile('local-assets/weapons/data/scripts/weapons.vdata','utf8'));
await writeFile(root+'weapons.json',JSON.stringify(Object.fromEntries(['weapon_hegrenade','weapon_flashbang','weapon_smokegrenade','weapon_molotov','weapon_incgrenade','weapon_decoy'].map(name=>[name,weapons[name]])),null,2));
const source=parseKV3(await readFile('local-assets/weapons/data/soundevents/game_sounds_weapons.vsndevts','utf8'));
const events=Object.fromEntries(Object.entries(source).filter(([key])=>/grenade|flashbang|molotov|decoy|incgrenade|smokegren/i.test(key)));events['Draw.Gear']=source['Draw.Gear'];
// Smoke emission is engine-driven rather than an animation sound event.
events['SmokeGrenade.Emit']={volume:.4,pitch:1,vsnd_files_track_01:'sounds/weapons/smokegrenade/smoke_emit.vsnd'};
const files=[...new Set(Object.values(events).flatMap((event:any)=>Object.entries(event).filter(([key])=>key.startsWith('vsnd_files')).flatMap(([,value])=>typeof value==='string'?[value+'_c']:Array.isArray(value)?value.map(file=>file+'_c'):[])))];
await writeFile(root+'audio-events-source.json',JSON.stringify(events));await writeFile(root+'audio-files.json',JSON.stringify(files));
console.log(Object.keys(events).length,'native sound events;',files.length,'recordings');
