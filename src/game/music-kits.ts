/** One catalog for the UI and the local Steam asset exporter. */
export const MUSIC_KITS = [
  {id:'cs2',source:'valve_cs2_01',name:'CS2 默认',artist:'Valve'},
  {id:'classic',source:'valve_01',name:'CS:GO 经典',artist:'Valve'},
  {id:'ez4ence',source:'theverkkars_01',name:'EZ4ENCE',artist:'The Verkkars'},
  {id:'dashstar',source:'knock2_01',name:'dashstar*',artist:'Knock2'},
  {id:'hotline',source:'hotlinemiami_01',name:'迈阿密热线',artist:'多名作曲家'},
  {id:'flashbang',source:'theverkkars_02',name:'闪光舞',artist:'The Verkkars & n0thing'},
  {id:'ultimate',source:'denzelcurry_01',name:'ULTIMATE',artist:'Denzel Curry'},
  {id:'hualian',source:'perfectworld_01',name:'花脸',artist:'Perfect World'},
  {id:'neckdeep',source:'neckdeep_01',name:'人生何处不青山',artist:'Neck Deep'},
  {id:'lowlife',source:'neckdeep_02',name:'躺平青年',artist:'Neck Deep'},
  {id:'bbnos',source:'bbnos_01',name:'你急了！ · u mad!',artist:'bbno$'},
] as const;
export type MusicKitId = typeof MUSIC_KITS[number]['id'] | 'off';
export function isMusicKit(value:unknown):value is MusicKitId{return value==='off'||MUSIC_KITS.some(kit=>kit.id===value);}
