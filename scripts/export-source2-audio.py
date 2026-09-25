"""Convert selected original gun sound events into local browser audio assets."""
import json,subprocess,concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent;out=root/'public/assets/source2/weapons/audio';out.mkdir(parents=True,exist_ok=True)
files=json.loads((root/'local-assets/weapons/audio-files.json').read_text());events=json.loads((root/'local-assets/weapons/audio-events.json').read_text())
def convert(path):
 args=[str(root/'.local-tools/source2/Source2Viewer-CLI'),'-i',str(root/'local-assets/cs2/game/csgo/pak01_dir.vpk'),'-f',path,'-o',str(out),'-d']
 p=subprocess.run(args,cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,text=True)
 if p.returncode:return path,p.stderr[:200]
 return path,None
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
 for path,error in pool.map(convert,files):
  if error:raise RuntimeError(f'{path}: {error}')
for event in events.values():
 urls=[]
 for path in event['files']:
  matches=list(out.glob(str(Path(path).with_suffix(''))+'.*'))
  matches=[p for p in matches if p.suffix.lower() in ['.wav','.mp3','.ogg']]
  if len(matches)!=1:raise RuntimeError(f'Missing or ambiguous decoded sound: {path}')
  urls.append('audio/'+str(matches[0].relative_to(out)))
 event['files']=urls
(out.parent/'audio.json').write_text(json.dumps(events,separators=(',',':')))
print('Converted',len(files),'original sounds for',len(events),'events.')
