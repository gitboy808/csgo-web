"""Decode the native hit bank. No transcoding, gain normalization or resampling."""
import json, subprocess, concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
base=root/'local-assets/hit-audio';out=root/'public/assets/source2/hits';out.mkdir(parents=True,exist_ok=True)
events=json.loads((base/'audio-events.json').read_text());files=json.loads((base/'audio-files.json').read_text())
def export(path):
    matches=[p for p in out.glob(str(Path(path).with_suffix(''))+'.*') if p.suffix in ['.wav','.mp3','.ogg']]
    if not matches:
        subprocess.run([str(root/'.local-tools/source2/Source2Viewer-CLI'),'-i',str(root/'local-assets/cs2/game/csgo/pak01_dir.vpk'),'-f',path,'-o',str(out),'-d'],stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL,check=True)
        matches=[p for p in out.glob(str(Path(path).with_suffix(''))+'.*') if p.suffix in ['.wav','.mp3','.ogg']]
    if len(matches)!=1: raise RuntimeError(path)
    return path,str(matches[0].relative_to(out))
with concurrent.futures.ThreadPoolExecutor(max_workers=4)as pool:urls=dict(pool.map(export,files))
for event in events.values():event['files']=[urls[p]for p in event['files']]
(out/'audio.json').write_text(json.dumps(events,separators=(',',':')))
(out/'sources.json').write_text(json.dumps({'app':730,'depot':2347770,'manifest':'5009084625236407721','definitions':['soundevents/game_sounds_player.vsndevts_c','soundevents/game_sounds_weapons.vsndevts_c'],'files':urls},separators=(',',':')))
print(f'Exported {len(files)} native hit samples.')
