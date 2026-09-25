import{execFile}from'node:child_process';
import{promisify}from'node:util';
import{mkdir,readFile,writeFile}from'node:fs/promises';
import{MUSIC_KITS}from'../src/game/music-kits';
const run=promisify(execFile),cli='.local-tools/source2/Source2Viewer-CLI',vpk='local-assets/cs2/game/csgo/pak01_dir.vpk';
await mkdir('local-assets/hit-audio',{recursive:true});await mkdir('local-assets/characters',{recursive:true});
const jobs=MUSIC_KITS.map(kit=>({path:`soundevents/music/${kit.source}/game_sounds_music.vsndevts_c`,dest:`local-assets/characters/music-${kit.id==='cs2'||kit.id==='classic'?kit.id:kit.source}.vsndevts`}));
jobs.push({path:'soundevents/game_sounds_player.vsndevts_c',dest:'local-assets/hit-audio/player.vsndevts'});
let cursor=0;await Promise.all(Array.from({length:3},async()=>{while(cursor<jobs.length){const job=jobs[cursor++];await run(cli,['-i',vpk,'-f',job.path,'-o',job.dest,'-d'],{maxBuffer:4*1024*1024});}}));
const models=JSON.parse(await readFile('scripts/source2-characters.json','utf8')).models as Record<string,string>;
for(const[side,path]of Object.entries(models)){
  const{stdout}=await run(cli,['-i',vpk,'-f',path,'-b','MDAT'],{maxBuffer:4*1024*1024});
  await writeFile(`local-assets/hit-audio/model-${side}.txt`,stdout);
}
console.log(`Exported ${MUSIC_KITS.length} music definitions, player sound events and both native hitbox sets.`);
