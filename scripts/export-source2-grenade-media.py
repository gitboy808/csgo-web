"""Decode original grenade sound events, textures and HUD silhouettes for local use."""
import json, subprocess, concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent;out=root/'public/assets/source2/grenades';audio=out/'audio';audio.mkdir(exist_ok=True)
events=json.loads((root/'local-assets/grenades/audio-events-source.json').read_text());files=json.loads((root/'local-assets/grenades/audio-files.json').read_text())
cli=str(root/'.local-tools/source2/Source2Viewer-CLI');vpk=str(root/'local-assets/cs2/game/csgo/pak01_dir.vpk')
def export(path):
 subprocess.run([cli,'-i',vpk,'-f',path,'-o',str(audio),'-d'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
 matches=[p for p in audio.glob(str(Path(path).with_suffix(''))+'.*')if p.suffix in ['.wav','.mp3','.ogg']]
 if len(matches)!=1:raise RuntimeError(path)
 return path,'audio/'+str(matches[0].relative_to(audio))
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:urls=dict(pool.map(export,files))
result={}
for name,e in events.items():
 paths=[]
 for k,v in e.items():
  if not k.startswith('vsnd_files'):continue
  paths.extend([v]if isinstance(v,str)else v)
 result[name.lower()]={'files':[urls[p+'_c']for p in paths],'volume':e.get('volume',1),'pitch':e.get('pitch',1)}
(out/'audio.json').write_text(json.dumps(result,separators=(',',':')))
(out/'icons').mkdir(exist_ok=True)
index=json.loads((root/'local-assets/references/vpk-index.json').read_text())
for kind,name in [('he','hegrenade'),('flash','flashbang'),('smoke','smokegrenade'),('molotov','molotov'),('incendiary','incgrenade'),('decoy','decoy')]:
 matches=[p for p in index if p.endswith('/'+name+'.vsvg_c') and 'equipment' in p]
 if not matches:matches=[p for p in index if p.endswith('/'+name+'.vsvg_c')]
 if matches:subprocess.run([cli,'-i',vpk,'-f',matches[0],'-o',str(out/'icons'/f'{kind}.svg'),'-d'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
(out/'vfx').mkdir(exist_ok=True)
subprocess.run([cli,'-i',vpk,'-f','materials/particle/fire_small_sim/fire_small_sim_b.vtex_c','-o',str(root/'local-assets/grenades/vfx/fire-original.vtex'),'-d','--texture_decode_flags','none'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
print(f'Converted {len(files)} original grenade sounds and native HUD icons.',flush=True)

for kind in ['flame', 'smoke']:
    subprocess.run([cli, '-i', vpk, '-f', f'materials/particle/explosion_fireballs/{kind}/explosion_fireball_01_{kind}.vtex_c', '-o', str(root / f'local-assets/grenades/vfx/blast-{kind}.vtex'), '-d', '--texture_decode_flags', 'none'], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
