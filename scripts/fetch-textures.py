"""Download a small, fixed set of CC0 PBR maps. No runtime third-party requests."""
import concurrent.futures, json, pathlib, subprocess, hashlib

root = pathlib.Path(__file__).resolve().parents[1]
assets = {
    'plaster': 'painted_plaster_wall',
    'stone': 'sandstone_blocks_05',
    'road': 'asphalt_02',
    'paving': 'concrete_floor_02',
    'sand': 'aerial_sand',
    'wood': 'weathered_brown_planks',
    'metal': 'rusty_painted_metal',
}
target = root / 'public/assets/textures'
target.mkdir(parents=True, exist_ok=True)
manifest = []
def fetch(url, path):
    subprocess.run(['curl', '-f', '-sS', '--retry', '3', '--connect-timeout', '15', '--max-time', '90', '-A', 'DustIIWeb/1.0 (asset preparation)', '-L', url, '-o', str(path)], check=True)
def download(item):
    name, asset = item
    metadata = target / (name+'.metadata.json')
    fetch('https://api.polyhaven.com/files/'+asset, metadata)
    data = json.loads(metadata.read_text())
    entries = []
    for key, suffix in [('Diffuse', 'color'), ('nor_gl', 'normal'), ('arm', 'arm')]:
        actual = key if key in data else 'diff'
        info = data[actual]['1k']['jpg']
        path = target / (name+'-'+suffix+'.jpg')
        fetch(info['url'], path)
        digest = hashlib.md5(path.read_bytes()).hexdigest()
        if digest != info['md5']: raise RuntimeError('Checksum mismatch: '+str(path))
        entries.append({'file':str(path.relative_to(root/'public')), 'source':info['url'], 'md5':digest})
    metadata.unlink()
    print(name, 'downloaded and verified', flush=True)
    return {'material':name, 'asset':asset, 'url':'https://polyhaven.com/a/'+asset, 'license':'CC0-1.0', 'files':entries}
with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
    manifest = list(pool.map(download, assets.items()))
(root/'public/assets/materials.json').write_text(json.dumps(manifest, indent=2)+'\n')
