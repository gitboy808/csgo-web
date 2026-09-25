"""Export the selected CS2 agent meshes with world animations retargeted by VRF."""
import json, subprocess, concurrent.futures
from pathlib import Path
root = Path(__file__).resolve().parent.parent
config = json.loads((root / 'scripts/source2-characters.json').read_text())
(root / 'local-assets/characters').mkdir(parents=True, exist_ok=True)
(root / 'local-assets/characters/clips.json').write_text(json.dumps(list(dict.fromkeys(config['clips'].values()))))
with (root / 'local-assets/characters/world-skeleton.log').open('w') as log:
    subprocess.run([str(root / '.local-tools/dotnet/dotnet'), str(root / 'scripts/source2-helper/bin/Debug/net10.0/source2-helper.dll'), 'export-animated', str(root / 'local-assets/cs2/game/csgo/pak01_dir.vpk'), 'animation/anims/world/pistol/_default_pistol/idle_pistol.vnmclip_c', str(root / 'local-assets/characters/world-skeleton.gltf')], cwd=root, stdout=log, stderr=log, check=True)
def export(item):
    side, model = item
    out = root / f'local-assets/characters/export/{side}'
    out.mkdir(parents=True, exist_ok=True)
    with (out / 'export.log').open('w') as log:
        subprocess.run([str(root / '.local-tools/dotnet/dotnet'), str(root / 'scripts/source2-helper/bin/Debug/net10.0/source2-helper.dll'), 'export-character', str(root / 'local-assets/cs2/game/csgo/pak01_dir.vpk'), model, str(out / 'model.gltf'), str(root / 'local-assets/characters/clips.json')], cwd=root, stdout=log, stderr=log, check=True)
    print(side, 'exported', flush=True)
with concurrent.futures.ThreadPoolExecutor(max_workers=2) as pool:
    list(pool.map(export, config['models'].items()))
