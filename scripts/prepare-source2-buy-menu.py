"""Export the pinned CS2 buy-menu reference and its native equipment SVGs."""
import json
import subprocess
from pathlib import Path

root = Path(__file__).resolve().parent.parent
reference = root / 'local-assets/buy-menu'
target = root / 'public/assets/source2/buy-menu'
reference.mkdir(parents=True, exist_ok=True)
target.mkdir(parents=True, exist_ok=True)
cli = root / '.local-tools/source2/Source2Viewer-CLI'
vpk = root / 'local-assets/cs2/game/csgo/pak01_dir.vpk'
icons = {
    'armor': 'panorama/images/icons/equipment/kevlar.vsvg_c',
    'helmet': 'panorama/images/icons/equipment/assaultsuit.vsvg_c',
    'kit': 'panorama/images/icons/equipment/defuser.vsvg_c',
    'c4': 'panorama/images/icons/equipment/c4.vsvg_c',
    'refund': 'panorama/images/icons/ui/undo.vsvg_c',
    'CT': 'panorama/images/icons/ct_logo.vsvg_c',
    'T': 'panorama/images/icons/ui/t_logo_1c.vsvg_c',
}
for name, source in icons.items():
    output = target / (name + '.svg')
    subprocess.run([str(cli), '-i', str(vpk), '-f', source, '-o', str(output), '-d'],
                   stdout=subprocess.DEVNULL, check=True)
    if not output.is_file() or '<svg' not in output.read_text():
        raise RuntimeError('Missing native SVG: ' + source)
for source in ['panorama/layout/buymenu.vxml_c', 'panorama/styles/buymenu.vcss_c',
               'resource/csgo_schinese.txt']:
    subprocess.run([str(cli), '-i', str(vpk), '-f', source, '-o', str(reference), '-d'],
                   stdout=subprocess.DEVNULL, check=True)
(target / 'sources.json').write_text(json.dumps({
    'source': {'app': 730, 'depot': 2347770, 'manifest': '5009084625236407721'},
    'icons': icons,
    'layout': 'panorama/layout/buymenu.vxml_c',
    'styles': 'panorama/styles/buymenu.vcss_c',
    'weaponIcons': '../weapons/icons/', 'grenadeIcons': '../grenades/icons/',
}, ensure_ascii=False, indent=2))
print(f'Prepared {len(icons)} native SVGs; existing weapon/grenade icons are reused.')
