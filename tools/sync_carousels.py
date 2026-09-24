"""C:\\Users\\faisa\\fawaz-carousel\\{db/videos.json,exports/<id>/*} -> carousels_src/{carousels.json,webp/<id>/*.webp}

242 opus-audited Bangla Facebook carousel posts (Fawaz al-Aswad channel) get a
second life as a browsable site section (tools/carousels.js -> /carousels/).
This script is the sync half of that pipeline — it asks the source project
"what is ready" (db/videos.json status READY or PUBLISHED) rather than
hardcoding a video-id list, the same way tools/sync_guides.py asks the ruqyah
pdf maker engine what documents exist.

Two things happen here that sync_guides.py never needed to do, because guides
arrive as finished HTML with no images of its own to touch:
  - each exported PNG slide (1080x1350, ~500-600KB) is resized to 720px wide
    and re-encoded as WebP (quality 82) -> carousels_src/webp/<id>/NN.webp.
    Idempotent by sha256 (tools/watermark_pdfs.py's manifest pattern): a slide
    whose source PNG has not changed is not re-encoded.
  - per-slide accessible text (kicker/headline/body) is pulled from the
    source project's posts/<id>/... no — from exports/<id>/content.json,
    since PNG-baked slide text is not indexable or screen-reader visible.

Run after fawaz-carousel produces new READY/PUBLISHED posts:

    python tools/sync_carousels.py
"""
import hashlib
import json
import os
import sys

from PIL import Image

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC_PROJECT = r'C:\Users\faisa\fawaz-carousel'
SRC_DB = os.path.join(SRC_PROJECT, 'db', 'videos.json')
SRC_EXPORTS = os.path.join(SRC_PROJECT, 'exports')

DEST = os.path.join(ROOT, 'carousels_src')
DEST_WEBP = os.path.join(DEST, 'webp')
MANIFEST = os.path.join(DEST, 'webp_manifest.json')
OUT_JSON = os.path.join(DEST, 'carousels.json')

WEBP_WIDTH = 720   # matches tools/make_pdf_previews.py's WIDTH convention
WEBP_QUALITY = 82

# The promo slide (last image when promotional_slides == 1) is a pre-designed
# branded ad, not part of content.json's own `slides` array — render.py in
# fawaz-carousel appends it from config/promotion/ after the fact. Map its
# asset name to a real on-site route (never invent a URL): confirmed by
# grepping landing.html/app.js — "ruqyah.png" is the monthly live-treatment
# package (landing.html's #live-class section), "guide.png" is the paid
# diagnosis product (app.html's #courses-section, same anchor landing.html's
# own "ডায়াগনোসিস শুরু করুন" button uses). "default.png" has no single mapped
# offer, so it gets no CTA link rather than a guess.
PROMO_CTA = {
    'ruqyah.png': {'href': '/#live-class', 'label': 'রুকইয়াহ প্যাকেজ দেখুন'},
    'guide.png': {'href': '/app.html#courses-section', 'label': 'ডায়াগনোসিস শুরু করুন'},
}


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def to_webp(src, dest):
    with Image.open(src) as im:
        im = im.convert('RGB')
        w, h = im.size
        if w > WEBP_WIDTH:
            im = im.resize((WEBP_WIDTH, round(h * WEBP_WIDTH / w)), Image.LANCZOS)
        im.save(dest, 'WEBP', quality=WEBP_QUALITY)


def main():
    with open(SRC_DB, encoding='utf-8') as f:
        videos = json.load(f)['videos']
    ready = {v['video_id']: v for v in videos if v.get('status') in ('READY', 'PUBLISHED')}

    os.makedirs(DEST_WEBP, exist_ok=True)
    manifest = {}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding='utf-8') as f:
            manifest = json.load(f)

    items = []
    converted = kept = 0
    for vid, v in sorted(ready.items()):
        export_dir = os.path.join(SRC_EXPORTS, vid)
        content_path = os.path.join(export_dir, 'content.json')
        if not os.path.exists(content_path):
            print(f'!! {vid}: status {v["status"]} but no exports/{vid}/content.json — skipped', file=sys.stderr)
            continue
        with open(content_path, encoding='utf-8') as f:
            content = json.load(f)

        post = v.get('post') or {}
        educational = post.get('educational_slides') or len(content.get('slides') or [])
        png_count = post.get('png_count') or educational
        has_promo = png_count > educational

        webp_dir = os.path.join(DEST_WEBP, vid)
        os.makedirs(webp_dir, exist_ok=True)
        slide_files = []
        ok = True
        for n in range(1, png_count + 1):
            src_png = os.path.join(export_dir, f'{n:02d}.png')
            if not os.path.exists(src_png):
                print(f'!! {vid}: missing exports/{vid}/{n:02d}.png — post skipped', file=sys.stderr)
                ok = False
                break
            key = f'{vid}/{n:02d}.png'
            digest = sha256(src_png)
            dest_webp = os.path.join(webp_dir, f'{n:02d}.webp')
            if manifest.get(key) == digest and os.path.exists(dest_webp):
                kept += 1
            else:
                to_webp(src_png, dest_webp)
                manifest[key] = digest
                converted += 1
            slide_files.append(f'{n:02d}.webp')
        if not ok:
            continue

        slides = []
        for i, s in enumerate(content.get('slides') or []):
            slides.append({
                'n': i + 1,
                'kicker': s.get('kicker') or '',
                'headline': s.get('headline') or '',
                'body': s.get('body') or '',
            })

        promo_asset = post.get('promo_asset') if has_promo else None
        items.append({
            'slug': vid,
            'title_bn': content.get('title_bn') or post.get('title_bn') or '',
            'topic': content.get('topic') or v.get('topic') or '',
            'caption': content.get('caption') or post.get('caption') or '',
            'hashtags': content.get('hashtags') or [],
            'youtube_url': content.get('url') or v.get('url') or '',
            'slides': slides,
            'images': slide_files,
            'has_promo': has_promo,
            'promo_asset': promo_asset,
            'promo_cta': PROMO_CTA.get(promo_asset) if promo_asset else None,
            'published_at': v.get('published_at') or '',
        })

    # Stale sweep: a post that fell out of READY/PUBLISHED (or was deleted
    # upstream) should not keep a dead webp folder around forever.
    live_slugs = {i['slug'] for i in items}
    for name in os.listdir(DEST_WEBP):
        if name not in live_slugs:
            stale_dir = os.path.join(DEST_WEBP, name)
            for f in os.listdir(stale_dir):
                os.remove(os.path.join(stale_dir, f))
            os.rmdir(stale_dir)
            print(f'removed stale carousels_src/webp/{name}/')
    for key in [k for k in manifest if k.split('/')[0] not in live_slugs]:
        del manifest[key]

    items.sort(key=lambda i: i['published_at'], reverse=True)

    with open(OUT_JSON, 'w', encoding='utf-8') as f:
        json.dump(items, f, ensure_ascii=False, indent=1)
        f.write('\n')
    with open(MANIFEST, 'w', encoding='utf-8') as f:
        json.dump(manifest, f, indent=1, sort_keys=True)
        f.write('\n')

    print(f'{len(items)} carousel posts -> carousels_src/carousels.json '
          f'({converted} slide(s) encoded, {kept} unchanged)')


if __name__ == '__main__':
    main()
