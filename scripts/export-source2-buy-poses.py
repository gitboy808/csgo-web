"""Retarget original static buy-menu poses to the existing SAS/Phoenix agents."""
import json
import subprocess
from pathlib import Path
root = Path(__file__).resolve().parent.parent
out = root / 'local-assets/buy-menu/poses'
out.mkdir(parents=True, exist_ok=True)
models = json.loads((root / 'scripts/source2-characters.json').read_text())['models']
roles = {
    'CT': {'ak47':'ct/ct_buymenu_ak','m4a1':'ct/ct_buymenu_m4a1','awp':'ct/ct_buymenu_awp','deagle':'ct/ct_buymenu_deagle','glock':'ct/ct_buymenu_glock18','usp':'ct/ct_buymenu_usp_silencer'},
    'T': {'ak47':'t/t_buymenu_ak_03','m4a1':'t/t_buymenu_m4a1','awp':'t/t_buymenu_awp_03','deagle':'t/t_buymenu_deagle_03','glock':'t/t_buymenu_glock18_03','usp':'t/t_buymenu_usp_silencer'},
}
shared = {'knife':'knife','he':'hegrenade','flash':'flash','smoke':'smoke','molotov':'molotov','incendiary':'incendiary','decoy':'decoy'}
for side, guns in roles.items():
    guns.update({key:'shared/sh_buymenu_'+value for key,value in shared.items()})
    roles[side] = {key:'animation/anims/ui_anims/buy_menu/'+value+'.vnmclip_c' for key,value in guns.items()}
    clips = out / (side + '-clips.json')
    clips.write_text(json.dumps(list(roles[side].values())))
    with (out / (side + '.log')).open('w') as log:
        subprocess.run([str(root / '.local-tools/dotnet/dotnet'),str(root / 'scripts/source2-helper/bin/Debug/net10.0/source2-helper.dll'),
                        'export-character-poses',str(root / 'local-assets/cs2/game/csgo/pak01_dir.vpk'),models[side],
                        str(out / (side + '.gltf')),str(clips)],stdout=log,stderr=log,check=True,cwd=root)
    print(side, 'exported', len(roles[side]), 'original buy-menu poses', flush=True)
(out / 'sources.json').write_text(json.dumps(roles,indent=2))
