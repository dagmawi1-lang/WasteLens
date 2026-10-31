#!/usr/bin/env python3
"""Download and inspect the UCI RealWaste dataset (4,752 images)."""
import argparse, hashlib, json, urllib.request, zipfile
from pathlib import Path

URL = "https://archive.ics.uci.edu/static/public/908/realwaste.zip"
EXPECTED = {
    "Cardboard": 461, "Food Organics": 411, "Glass": 420, "Metal": 790,
    "Miscellaneous Trash": 495, "Paper": 500, "Plastic": 921,
    "Textile Trash": 318, "Vegetation": 436,
}

def main():
    p = argparse.ArgumentParser()
    p.add_argument('--output', default='data/realwaste.zip')
    p.add_argument('--extract-to', default='data/realwaste')
    args = p.parse_args()
    archive = Path(args.output); archive.parent.mkdir(parents=True, exist_ok=True)
    if not archive.exists():
        print(f'Downloading {URL}')
        request = urllib.request.Request(URL, headers={'User-Agent': 'WasteLens dataset preparation/1.0'})
        with urllib.request.urlopen(request, timeout=60) as response, archive.open('wb') as out:
            total = int(response.headers.get('Content-Length', '0'))
            copied = 0
            while True:
                chunk = response.read(1024 * 1024)
                if not chunk: break
                out.write(chunk); copied += len(chunk)
                if total: print(f'  {copied/total:.0%}', end='\r')
        print(f'\nDownloaded {archive.stat().st_size:,} bytes')
    digest = hashlib.sha256(archive.read_bytes()).hexdigest()
    target = Path(args.extract_to); target.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(archive) as z:
        bad = z.testzip()
        if bad: raise SystemExit(f'Archive integrity check failed at {bad}')
        z.extractall(target)
    roots = list(target.rglob('RealWaste'))
    data_root = next((x for x in roots if x.is_dir() and all((x / c).is_dir() for c in EXPECTED)), None)
    if data_root is None:
        raise SystemExit('Could not locate RealWaste folder with all nine expected class directories.')
    counts = {c: sum(1 for f in (data_root / c).rglob('*') if f.suffix.lower() in {'.jpg','.jpeg','.png','.webp'}) for c in EXPECTED}
    report = {'dataset':'RealWaste','source':URL,'license':'UCI record states CC BY 4.0; verify source terms before redistribution','sha256':digest,'root':str(data_root.resolve()),'counts':counts,'total':sum(counts.values())}
    Path('realwaste_dataset_manifest.json').write_text(json.dumps(report, indent=2), encoding='utf-8')
    print(json.dumps(report, indent=2))
    if report['total'] != 4752: print('WARNING: observed image count differs from the UCI record; inspect before training.')

if __name__ == '__main__': main()
