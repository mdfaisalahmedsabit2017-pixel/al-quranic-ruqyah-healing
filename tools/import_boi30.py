#!/usr/bin/env python3
"""Import the 30-day "শেখার শিল্প" book series into posts/.

Source: A:/fb-ruqyah-content/drafts/boi30/out/day-XX/
    day-XX.html          six cards — used for the title and the cover
    day-XX-card-01.png   card 1, becomes the cover image
    caption.txt          the full article

Unlike the ruqyah drafts, this caption is NOT a teaser — the README says the
caption carries the whole topic, and it runs ~600 words with the guideline
spelled out. So here the caption is the body and the cards only supply the
title and cover; taking the cards instead would throw away the better text.

    python tools/import_boi30.py --dry-run
    python tools/import_boi30.py --covers
"""

import argparse
import re
import sys
from datetime import date
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
from import_fb_drafts import clean, grab, parse_cards, POSTS, IMAGES  # noqa: E402

SRC = Path(r'A:/fb-ruqyah-content/drafts/boi30/out')
SERIES_SLUG = 'shekhar-shilpo-30'
SERIES_NAME = 'শেখার শিল্প — ৩০ দিন'

# Blocks that exist only to work on a Facebook feed. Dropping them by content
# rather than by position, because the tail order varies between days.
FB_ONLY = [
    'এরকম আরও অনেক কিছু',        # book plug — replaced by the callout below
    'সংগ্রহ করতে ভিজিট',
    'হাদিয়া মাত্র',
    'পেজটা ফলো',
    'পোস্টটা সেভ',
    'ট্যাগ করে দিন',
    'সাথে পুরো একটা পর্ব',
    '— রাকী ফয়সাল আহমেদ সাবিত',
    'রুকইয়াহ একটি শরয়ী চিকিৎসা',
]

CALLOUT = ('> লেখাটি **"শেখার শিল্প"** বইয়ের একটি অংশ নিয়ে। পুরো কাঠামো, বাকি অধ্যায় এবং '
           '**ইলম, দোয়া ও রুকইয়াহ** পর্বটি বইটিতে রয়েছে — '
           '[বইটি দেখুন](/app.html#books-section)')


def caption_to_md(path):
    raw = path.read_text(encoding='utf-8').replace('\r\n', '\n')
    tags = [t.replace('_', ' ') for t in re.findall(r'#([^\s#]+)', raw)
            if re.search(r'[ঀ-৿]', t)]

    keep = []
    for block in raw.split('\n\n'):
        b = block.strip()
        if not b:
            continue
        if b.lstrip().startswith('#'):            # the hashtag line
            continue
        if any(m in b for m in FB_ONLY):
            continue
        if b.startswith('আল কুরআন রুকইয়াহ হিলিং সেন্টার'):   # signature tail
            continue
        keep.append(b)

    keep.append(CALLOUT)
    return '\n\n'.join(keep), tags


def build(day_dir):
    html = day_dir / f'{day_dir.name}.html'
    caption = day_dir / 'caption.txt'
    if not html.exists() or not caption.exists():
        raise ValueError('missing day html or caption.txt')

    cards = parse_cards(html)
    if not cards:
        raise ValueError('no cards')
    title = (grab(cards[0], 'big-title') or [''])[0]
    if not title:
        raise ValueError('no title on card 1')

    body, tags = caption_to_md(caption)

    # The kicker under card 1 is the hook line — a better excerpt than the
    # opening paragraph, which on day 1 is housekeeping about the series.
    desc = (grab(cards[0], 'sub-title') or grab(cards[0], 'kicker') or [''])[0]
    desc = re.sub(r'^[✦\s]+|[✦\s]+$', '', desc)
    if len(desc) < 40:
        first = next((b for b in body.split('\n\n') if not b.startswith(('>', '**'))), '')
        desc = clean(first)[:155]

    return title, desc, tags, body


def make_cover(day_dir, out_name):
    src = day_dir / f'{day_dir.name}-card-01.png'
    if not src.exists():
        return ''
    try:
        from PIL import Image
    except ImportError:
        return ''
    dest = IMAGES / out_name
    if not dest.exists():
        IMAGES.mkdir(exist_ok=True)
        im = Image.open(src).convert('RGB')
        im.thumbnail((900, 1125), Image.LANCZOS)
        im.save(dest, 'JPEG', quality=82, optimize=True)
    return f'images/{out_name}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--covers', action='store_true')
    ap.add_argument('--limit', type=int, default=0)
    args = ap.parse_args()

    if not SRC.exists():
        sys.exit(f'not found: {SRC}')

    days = sorted(d for d in SRC.iterdir() if d.is_dir() and re.match(r'^day-\d+$', d.name))
    if args.limit:
        days = days[:args.limit]

    POSTS.mkdir(exist_ok=True)
    today = date.today().isoformat()
    ok, failed, covers = 0, [], 0

    for d in days:
        try:
            title, desc, tags, body = build(d)
        except Exception as e:
            failed.append((d.name, str(e)))
            continue

        stem = f'shekhar-shilpo-{d.name}'
        episode = int(d.name.split('-')[1])
        dest = POSTS / f'{stem}.md'

        draft = True
        if dest.exists():
            m = re.search(r'^draft:\s*(\w+)', dest.read_text(encoding='utf-8'), re.M)
            draft = (m.group(1) != 'false') if m else True

        cover = make_cover(d, f'{stem}.jpg') if args.covers else ''
        if cover:
            covers += 1
        elif dest.exists():
            m = re.search(r'^cover:\s*(\S+)', dest.read_text(encoding='utf-8'), re.M)
            if m:
                cover = m.group(1)

        fm = ['---', f'title: {title}', f'description: {desc}', f'date: {today}',
              f'draft: {"true" if draft else "false"}']
        if cover:
            fm.append(f'cover: {cover}')
        if tags:
            fm.append(f'tags: {", ".join(tags[:5])}')
        fm += [f'series: {SERIES_SLUG}', f'seriesTitle: {SERIES_NAME}', f'episode: {episode}', '---']

        text = '\n'.join(fm) + '\n\n' + body + '\n'
        if args.dry_run:
            if ok < 1:
                print(text[:1800])
        else:
            dest.write_text(text, encoding='utf-8', newline='\n')
        ok += 1

    print(f'\nconverted {ok}/{len(days)}'
          + (f' | covers built: {covers}' if args.covers else '')
          + (f' | failed: {len(failed)}' if failed else ''))
    for n, e in failed[:10]:
        print(f'  ⚠️  {n}: {e}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
