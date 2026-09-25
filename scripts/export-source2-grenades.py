"""Export the six original grenade models and authored viewmodel clips locally."""
import json, subprocess, concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
config=json.loads((root/'scripts/source2-grenades.json').read_text());jobs=[]
for kind,model in config['models'].items():
    jobs.append((model,root/f'local-assets/grenades/export/{kind}/model.gltf'))
    jobs.extend((path,root/f'local-assets/grenades/export/{kind}/{role}.gltf')for role,path in config['clips'][kind].items())
def export(job):
    path,out=job;out.parent.mkdir(parents=True,exist_ok=True)
    with Path(str(out)+'.log').open('w') as log:
        subprocess.run([str(root/'.local-tools/dotnet/dotnet'),str(root/'scripts/source2-helper/bin/Debug/net10.0/source2-helper.dll'),'export-animated',str(root/'local-assets/cs2/game/csgo/pak01_dir.vpk'),path,str(out)],cwd=root,stdout=log,stderr=log,check=True)
    return str(out.relative_to(root))
with concurrent.futures.ThreadPoolExecutor(max_workers=3)as pool:
    for path in pool.map(export,jobs):print(path,flush=True)
