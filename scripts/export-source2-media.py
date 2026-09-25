"""Decode original SAS/Phoenix radio, announcer and Valve music kit sounds locally."""
import json, subprocess, concurrent.futures
from pathlib import Path
root = Path(__file__).resolve().parent.parent
out = root / 'public/assets/source2/media'; out.mkdir(parents=True, exist_ok=True)
config = json.loads((root / 'local-assets/characters/media.json').read_text())
files = json.loads((root / 'local-assets/characters/media-files.json').read_text())
def convert(path):
    matches = [p for p in out.glob(str(Path(path).with_suffix('')) + '.*') if p.suffix in ['.wav', '.mp3', '.ogg']]
    if not matches:
        subprocess.run([str(root / '.local-tools/source2/Source2Viewer-CLI'), '-i', str(root / 'local-assets/cs2/game/csgo/pak01_dir.vpk'), '-f', path, '-o', str(out), '-d'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
        matches = [p for p in out.glob(str(Path(path).with_suffix('')) + '.*') if p.suffix in ['.wav', '.mp3', '.ogg']]
    if len(matches) != 1: raise RuntimeError(f'Missing decoded audio: {path}')
    return path, str(matches[0].relative_to(out))
with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool: urls = dict(pool.map(convert, files))
for event in config['radio'].values():
    for variant in event['variants']: variant['files'] = [urls[p] for p in variant['files']]
for kit in config['music'].values():
    for event in kit['events'].values(): event['files'] = [urls[p] for p in event['files']]
config['source'] = {'app': 730, 'depot': 2347770, 'manifest': '5009084625236407721'}
(out / 'manifest.json').write_text(json.dumps(config, separators=(',', ':')))
print(f'Converted {len(urls)} radio / music files.', flush=True)

(out / 'covers').mkdir(exist_ok=True)
for kit, entry in config['music'].items():
    name=entry['sourceName']
    # Regenerate covers: a catalog id may have been corrected to a different source kit.
    subprocess.run([str(root / '.local-tools/source2/Source2Viewer-CLI'), '-i', str(root / 'local-assets/cs2/game/csgo/pak01_dir.vpk'), '-f', f'panorama/images/econ/music_kits/{name}_png.vtex_c', '-o', str(out / 'covers' / f'{kit}.png'), '-d', '--texture_decode_flags', 'none'], cwd=root, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, check=True)
