"""audio.json -> audio_meta.json: real upload dates and durations from YouTube.

The /audio/<CODE>/ pages carry VideoObject structured data. Google requires
uploadDate and wants duration, and audio.json has neither. Inventing them would
be a lie in structured data, so this asks YouTube (via yt-dlp) for the real
values and stores them, keyed by video id, in audio_meta.json — which is tracked
and read by tools/library.js at build time.

Idempotent: ids already in audio_meta.json are skipped, so a re-run only costs
the new tracks. A video that yt-dlp cannot read (private, removed) is simply
absent from the file and its page stays as it was: indexable, no dates claimed.

    python tools/fetch_audio_meta.py            # fetch what is missing
    python tools/fetch_audio_meta.py --refresh  # re-fetch everything
"""
import json
import os
import re
import subprocess
import sys

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
AUDIO = os.path.join(ROOT, 'audio.json')
OUT = os.path.join(ROOT, 'audio_meta.json')

YT = re.compile(r'(?:youtube\.com/(?:watch\?(?:.*&)?v=|embed/|live/|shorts/)|youtu\.be/)([\w-]{11})')


def yt_id(url):
    m = YT.search(url or '')
    return m.group(1) if m else ''


def main():
    refresh = '--refresh' in sys.argv
    with open(AUDIO, encoding='utf-8') as f:
        audio = json.load(f)
    meta = {}
    if os.path.exists(OUT) and not refresh:
        with open(OUT, encoding='utf-8') as f:
            meta = json.load(f)

    ids = []
    for t in audio:
        vid = yt_id(t.get('url'))
        if vid and vid not in meta and vid not in ids:
            ids.append(vid)
    print(f'{len(audio)} tracks, {len(meta)} already known, {len(ids)} to fetch')
    if not ids:
        return

    # One yt-dlp process for the whole batch: it keeps a session and is much
    # faster than one process per video. --ignore-errors so one dead video does
    # not stop the run; the missing line is simply not in the output.
    cmd = ['yt-dlp', '--skip-download', '--ignore-errors', '--no-warnings', '--quiet',
           '--print', '%(id)s\t%(upload_date)s\t%(duration)s\t%(title)s',
           *[f'https://www.youtube.com/watch?v={i}' for i in ids]]
    proc = subprocess.run(cmd, capture_output=True, text=True, encoding='utf-8', errors='replace')
    got = 0
    for line in proc.stdout.splitlines():
        parts = line.rstrip('\n').split('\t')
        if len(parts) < 3:
            continue
        vid, up, dur = parts[0], parts[1], parts[2]
        if not re.fullmatch(r'\d{8}', up or '') or not re.fullmatch(r'\d+(\.\d+)?', dur or ''):
            continue
        meta[vid] = {
            'uploadDate': f'{up[:4]}-{up[4:6]}-{up[6:]}',
            'duration': int(float(dur)),
            'ytTitle': parts[3] if len(parts) > 3 else '',
        }
        got += 1
    if proc.returncode not in (0, 1):
        print(proc.stderr[-2000:], file=sys.stderr)
    with open(OUT, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print(f'fetched {got}/{len(ids)} -> audio_meta.json ({len(meta)} total)')


if __name__ == '__main__':
    main()
