"""Export selected local CS2 models and their original first-person animation clips."""
import json,subprocess,concurrent.futures
from pathlib import Path
root=Path(__file__).resolve().parent.parent
index=json.loads((root/'local-assets/references/vpk-index.json').read_text())
items={
 'ak47':('weapons/models/ak47/weapon_rif_ak47','rifle/rifle_ak','ak'),
 'm4a1':('weapons/models/m4a1_silencer/weapon_rif_m4a1_silencer','rifle/_default_rifle','rifle'),
 'awp':('weapons/models/awp/weapon_snip_awp','rifle/rifle_awp','awp'),
 'glock':('weapons/models/glock18/weapon_pist_glock18','pistol/pistol_glock18','glock'),
 'usp':('weapons/models/usp_silencer/weapon_pist_usp_silencer','pistol/_default_pistol','pistol'),
 'deagle':('weapons/models/deagle/weapon_pist_deagle','pistol/pistol_deagle','deagle'),
 'knife':('weapons/models/knife/knife_m9/weapon_knife_m9','knife/knife_m9','m9'),
}
config={}; jobs=[]
for key,(model,folder,suffix) in items.items():
 clips={}
 for role,stem in {'idle':'idle1' if key=='knife' else 'idle','draw':'draw_silenced' if key=='usp' else 'draw','fire':'light_miss1' if key=='knife' else 'shoot1','reload':'reload','reloadEmpty':'reload_empty','fireEmpty':'shoot_empty','empty':'idle_slide_back','inspect':'lookat01'}.items():
  path=f'animation/anims/viewmodel/{folder}/{stem}_{suffix}.vnmclip_c'
  if path in index:
   clips[role]=path;jobs.append((path,root/f'local-assets/weapons/export/{key}/{role}.gltf'))
 config[key]={'model':model+'.vmdl_c','clips':clips}
 jobs.append((model+'.vmdl_c',root/f'local-assets/weapons/export/{key}/model.gltf'))
jobs.append(('weapons/models/shared/arms/weapon_arms.vmdl_c',root/'local-assets/weapons/export/arms/model.gltf'))
(root/'local-assets/weapons/config.json').write_text(json.dumps(config,indent=2))
dll=root/'scripts/source2-helper/bin/Debug/net10.0/source2-helper.dll'
def export(job):
 path,out=job;out.parent.mkdir(parents=True,exist_ok=True)
 with open(str(out)+'.log','w') as log:
  p=subprocess.run([str(root/'.local-tools/dotnet/dotnet'),str(dll),'export-animated',str(root/'local-assets/cs2/game/csgo/pak01_dir.vpk'),path,str(out)],cwd=root,stdout=log,stderr=subprocess.STDOUT)
 return path,p.returncode
failed=[]
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
 for name,code in pool.map(export,jobs):
  print(('PASS' if code==0 else 'FAIL'),name,flush=True)
  if code:failed.append(name)
if failed:raise SystemExit(f'{len(failed)} exports failed; inspect each .log file')
print(f'Exported {len(jobs)} models and clips.')
