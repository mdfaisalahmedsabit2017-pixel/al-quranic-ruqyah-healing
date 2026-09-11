#!/usr/bin/env python3
"""Upload audio_files/ to S3-compatible storage and wire the URLs into audio.json.

Written against the S3 API rather than a vendor SDK so the same script works for
Cloudflare R2 (the recommendation: free egress, so a popular track can't run up
a bill), Backblaze B2, or plain S3 — only the endpoint changes.

Needs boto3:  pip install boto3

Config comes from the environment (put it in tools/.env.audio and source it, or
just export before running):

    S3_ENDPOINT   https://<account-id>.r2.cloudflarestorage.com
    S3_BUCKET     ruqyah-audio
    S3_KEY_ID     <access key id>
    S3_SECRET     <secret access key>
    PUBLIC_BASE   https://audio.alquranicruqyahhealing.com   (R2 public/custom domain)

    python tools/upload_audio.py --dry-run   # show what would happen
    python tools/upload_audio.py             # upload, then write audio.json
    python tools/upload_audio.py --urls-only # skip upload, just write audio.json

CORS matters: the app fetches these with mode:'cors' so it can put the response
in the Cache API. Without an allow-origin header the download button fails even
though playback might work. Set the bucket's CORS policy to allow GET+HEAD from
the site origins (see --print-cors).
"""

import argparse
import json
import mimetypes
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from fetch_audio import video_id, existing_file, human, OUT_DIR, AUDIO_JSON, ROOT  # noqa: E402

STATE = OUT_DIR / '_upload_state.json'
PREFIX = 'audio/'

CORS_POLICY = [{
    "AllowedOrigins": [
        "https://alquranicruqyahhealing.com",
        "https://www.alquranicruqyahhealing.com",
        "http://localhost:3000",
        "http://localhost:8080",
        "capacitor://localhost",   # the Android/Capacitor build's origin
        "https://localhost",
    ],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range", "Content-Type"],
    "ExposeHeaders": ["Content-Length", "Content-Range", "Accept-Ranges"],
    "MaxAgeSeconds": 3600,
}]

CONTENT_TYPES = {
    '.m4a': 'audio/mp4', '.mp3': 'audio/mpeg',
    '.opus': 'audio/opus', '.webm': 'audio/webm', '.ogg': 'audio/ogg',
}


def client():
    try:
        import boto3
        from botocore.config import Config
    except ImportError:
        sys.exit('boto3 missing — run: pip install boto3')
    missing = [k for k in ('S3_ENDPOINT', 'S3_BUCKET', 'S3_KEY_ID', 'S3_SECRET') if not os.getenv(k)]
    if missing:
        sys.exit(f'missing env: {", ".join(missing)}')
    return boto3.client(
        's3',
        endpoint_url=os.environ['S3_ENDPOINT'],
        aws_access_key_id=os.environ['S3_KEY_ID'],
        aws_secret_access_key=os.environ['S3_SECRET'],
        config=Config(signature_version='s3v4', retries={'max_attempts': 5}),
        region_name='auto',           # R2 ignores regions but boto3 wants one
    )


def load_state():
    if STATE.exists():
        try:
            return json.loads(STATE.read_text(encoding='utf-8'))
        except Exception:
            pass
    return {'uploaded': {}}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--urls-only', action='store_true', help='no upload; just write audio.json')
    ap.add_argument('--print-cors', action='store_true', help='print the bucket CORS json and exit')
    ap.add_argument('--put-cors', action='store_true', help='apply the CORS policy to the bucket and exit')
    args = ap.parse_args()

    if args.print_cors:
        print(json.dumps(CORS_POLICY, indent=2))
        return 0
    if args.put_cors:
        client().put_bucket_cors(Bucket=os.environ['S3_BUCKET'],
                                 CORSConfiguration={'CORSRules': CORS_POLICY})
        print('CORS applied.')
        return 0

    public_base = (os.getenv('PUBLIC_BASE') or '').rstrip('/')
    if not public_base:
        sys.exit('missing env: PUBLIC_BASE (the bucket\'s public URL)')

    tracks = json.loads(AUDIO_JSON.read_text(encoding='utf-8'))
    state = load_state()
    s3 = None if (args.dry_run or args.urls_only) else client()
    bucket = os.getenv('S3_BUCKET', '')

    uploaded, skipped, missing, wired = 0, 0, [], 0
    seen_files = {}

    for t in tracks:
        vid = video_id(t.get('url') or '')
        f = existing_file(vid) if vid else None
        if not f:
            missing.append(t.get('code'))
            continue

        key = f'{PREFIX}{f.name}'
        if vid not in seen_files:
            if args.urls_only or state['uploaded'].get(vid) == f.stat().st_size:
                skipped += 1
            elif args.dry_run:
                print(f'would upload {f.name} ({human(f.stat().st_size)}) -> {key}')
                uploaded += 1
            else:
                ctype = CONTENT_TYPES.get(f.suffix.lower()) \
                    or mimetypes.guess_type(f.name)[0] or 'application/octet-stream'
                s3.upload_file(str(f), bucket, key, ExtraArgs={
                    'ContentType': ctype,
                    # a year: the file at a given video id never changes
                    'CacheControl': 'public, max-age=31536000, immutable',
                })
                state['uploaded'][vid] = f.stat().st_size
                STATE.write_text(json.dumps(state, indent=2), encoding='utf-8')
                uploaded += 1
                print(f'uploaded {f.name} ({human(f.stat().st_size)})')
            seen_files[vid] = f'{public_base}/{key}'

        t['audio'] = seen_files[vid]
        wired += 1

    if not args.dry_run:
        AUDIO_JSON.write_text(json.dumps(tracks, ensure_ascii=False, indent=2) + '\n', encoding='utf-8')

    print(f'\nuploaded {uploaded} | already there {skipped} | audio.json: {wired}/{len(tracks)} tracks wired')
    if missing:
        print(f'no local file yet for {len(missing)}: {", ".join(str(c) for c in missing[:15])}'
              + (' …' if len(missing) > 15 else ''))
        print('run tools/fetch_audio.py first')
    if not args.dry_run:
        print('\nnext: npm run build   (and npx cap sync for the APK)')
    return 0


if __name__ == '__main__':
    sys.exit(main())
