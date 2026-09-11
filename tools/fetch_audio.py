#!/usr/bin/env python3
"""Pull the audio track out of every YouTube entry in audio.json.

The app's offline-download engine needs real media files; audio.json only has
watch URLs. This grabs the bestaudio stream as-is (m4a, no re-encode, so no
ffmpeg needed) into audio_files/, named by video id.

Named by video id, not track code, on purpose: three codes share a URL, and one
file serving all of them saves a download, an upload and a copy in the user's
cache.

    python tools/fetch_audio.py            # everything still missing
    python tools/fetch_audio.py --limit 3  # smoke test
    python tools/fetch_audio.py --retry    # re-try the ones that failed

Safe to stop and re-run: finished files are skipped, so it picks up where it
left off. State lives in audio_files/_fetch_state.json.
"""

import argparse
import json
import re
import subprocess
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
AUDIO_JSON = ROOT / 'audio.json'
OUT_DIR = ROOT / 'audio_files'
STATE = OUT_DIR / '_fetch_state.json'

# bestaudio[ext=m4a] first so the common case needs no muxing at all; the
# generic fallbacks are for the odd video that only offers opus/webm.
FORMAT = 'bestaudio[ext=m4a]/bestaudio[acodec^=mp4a]/bestaudio'


def video_id(url):
    """YouTube ids out of watch?v=, youtu.be/ and /shorts/ links."""
    m = (re.search(r'[?&]v=([\w-]{11})', url)
         or re.search(r'youtu\.be/([\w-]{11})', url)
         or re.search(r'/shorts/([\w-]{11})', url)
         or re.search(r'/embed/([\w-]{11})', url))
    return m.group(1) if m else None


def load_state():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {'failed': {}}


def save_state(state):
    STATE.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding='utf-8')


def existing_file(vid):
    for f in OUT_DIR.glob(f'{vid}.*'):
        if f.suffix.lower() in ('.m4a', '.mp3', '.opus', '.webm', '.ogg'):
            return f
    return None


def fetch(vid, url):
    """One download. yt-dlp writes audio_files/<vid>.<ext> itself."""
    cmd = [
        'yt-dlp',
        '-f', FORMAT,
        '-o', str(OUT_DIR / '%(id)s.%(ext)s'),
        '--no-playlist',
        '--no-part',                 # don't leave .part files behind on Ctrl-C
        '--retries', '5',
        '--fragment-retries', '5',
        '--no-progress',
        '--quiet', '--no-warnings',
        url,
    ]
    p = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    if p.returncode != 0:
        return None, (p.stderr or p.stdout or 'unknown error').strip().splitlines()[-1][:300]
    f = existing_file(vid)
    return (f, None) if f else (None, 'yt-dlp reported success but no file appeared')


def human(nbytes):
    for unit in ('B', 'KB', 'MB', 'GB'):
        if nbytes < 1024 or unit == 'GB':
            return f'{nbytes:.1f}{unit}'
        nbytes /= 1024


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--limit', type=int, default=0, help='stop after N downloads')
    ap.add_argument('--retry', action='store_true', help='also re-try previously failed videos')
    ap.add_argument('--sleep', type=float, default=1.0, help='seconds between downloads')
    args = ap.parse_args()

    tracks = json.loads(AUDIO_JSON.read_text(encoding='utf-8'))
    OUT_DIR.mkdir(exist_ok=True)
    state = load_state()
    failed = {} if args.retry else state.get('failed', {})

    # url -> the codes that use it, so a shared file is fetched once
    targets = {}
    no_id = []
    for t in tracks:
        url = t.get('url') or ''
        vid = video_id(url)
        if not vid:
            no_id.append(t.get('code'))
            continue
        targets.setdefault(vid, {'url': url, 'codes': []})['codes'].append(t.get('code'))

    todo = [(vid, d) for vid, d in targets.items()
            if not existing_file(vid) and (args.retry or vid not in failed)]
    have = len(targets) - len([v for v in targets if not existing_file(v)])

    print(f'{len(tracks)} tracks -> {len(targets)} unique videos')
    print(f'already downloaded: {have} | to fetch: {len(todo)}'
          + (f' | skipping {len(failed)} known-failed (use --retry)' if failed and not args.retry else ''))
    if no_id:
        print(f'no video id on: {", ".join(str(c) for c in no_id)}')
    if not todo:
        print('nothing to do.')
        return 0

    if args.limit:
        todo = todo[:args.limit]

    ok = 0
    for i, (vid, d) in enumerate(todo, 1):
        codes = ','.join(str(c) for c in d['codes'])
        print(f'[{i}/{len(todo)}] {vid} ({codes}) ... ', end='', flush=True)
        f, err = fetch(vid, d['url'])
        if f:
            ok += 1
            state.get('failed', {}).pop(vid, None)
            print(f'ok {human(f.stat().st_size)}')
        else:
            state.setdefault('failed', {})[vid] = err
            print(f'FAILED — {err}')
        save_state(state)
        if i < len(todo) and args.sleep:
            time.sleep(args.sleep)

    total = sum(f.stat().st_size for f in OUT_DIR.iterdir() if f.suffix.lower() != '.json')
    print(f'\ndone: {ok}/{len(todo)} fetched | {len(state.get("failed", {}))} failing'
          f' | audio_files/ is now {human(total)}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
