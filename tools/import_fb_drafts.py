#!/usr/bin/env python3
"""Turn the Facebook card drafts into blog posts.

Source: A:/claude code projects sabit/fb-ruqyah-content/drafts
    <name>-fb-cards.html   the real content, one <section class="card"> per slide
    <name>-caption.md      the Facebook teaser (source link + hashtags live here)

The cards carry the teaching; the caption is written to sell the swipe ("সবটা
ছবিগুলোতে সাজিয়ে দিয়েছি") and reads as a dangling reference on a page where
there are no cards. So the post body is built from the cards, and only the
caption's source link and hashtags are borrowed.

Every post is dated today because that is when it is actually published;
ordering inside a series comes from `series` + `episode`, not the date.

    python tools/import_fb_drafts.py --dry-run
    python tools/import_fb_drafts.py            # write posts/*.md
    python tools/import_fb_drafts.py --covers   # also build cover images
"""

import argparse
import html
import re
import sys
from datetime import date
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / 'posts'
IMAGES = ROOT / 'blog_images'
SRC = Path(r'A:/claude code projects sabit/fb-ruqyah-content')
DRAFTS = SRC / 'drafts'
FB_READY = SRC / 'fb-ready'

# filename stem -> (series slug, series title, episode number)
SERIES = {
    'day':    ('ruqyah-program', 'রুকইয়াহ প্রোগ্রাম'),
    'bali':   ('sheikh-bali',    'শাইখ বালী সিরিজ'),
    'hibshi': ('sheikh-hibshi',  'শাইখ হিবশী সিরিজ'),
}


def clean(s):
    """Tag soup -> plain text, keeping <strong> as markdown bold."""
    s = re.sub(r'<svg.*?</svg>', '', s, flags=re.S)
    s = re.sub(r'<br\s*/?>', ' ', s)
    s = re.sub(r'<(strong|b)>(.*?)</\1>', r'**\2**', s, flags=re.S)
    s = re.sub(r'<(em|i)>(.*?)</\1>', r'*\2*', s, flags=re.S)
    s = re.sub(r'<[^>]+>', '', s)
    s = html.unescape(s)
    s = s.replace('\u00a0', ' ')
    return re.sub(r'\s+', ' ', s).strip()


def grab(chunk, cls, tag=r'\w+'):
    """All text of elements carrying a given class, in document order."""
    out = []
    for m in re.finditer(rf'<({tag})[^>]*class="[^"]*\b{cls}\b[^"]*"[^>]*>(.*?)</\1>', chunk, re.S):
        t = clean(m.group(2))
        if t:
            out.append(t)
    return out


def inner_html(chunk, start, tag):
    """Text between `start` and the close of `tag`, respecting nesting.

    Returns (inner, index just past the closing tag).
    """
    depth = 1
    pos = start
    token = re.compile(rf'<(/?){tag}\b[^>]*>', re.I)
    while depth and pos < len(chunk):
        m = token.search(chunk, pos)
        if not m:
            return chunk[start:], len(chunk)
        depth += -1 if m.group(1) else 1
        pos = m.end()
    return chunk[start:pos - len(m.group(0))], pos


def parse_cards(path):
    raw = path.read_text(encoding='utf-8')
    body = raw.split('</style>', 1)[-1]
    body = re.sub(r'<script.*?</script>', '', body, flags=re.S)
    return re.split(r'<section class="card"', body)[1:]


def card_to_md(chunk):
    """One slide -> markdown blocks, walking the card in source order.

    The last slide is always the Facebook sales card (price, "মেসেজে লিখুন
    Diagnosis", course star-list). That belongs on Facebook, not in an article,
    so a card carrying the CTA markup is dropped whole.
    """
    if re.search(r'class="[^"]*\b(cta|price|kw)\b', chunk):
        return []
    out = []
    # Element-by-element so a note between two prose blocks keeps its place.
    # A depth-counting walk, not a non-greedy regex: headings sit inside
    # <div class="brand"> wrappers, and `<div class="brand">(.*?)</div>` stops
    # at the *inner* close, swallowing the heading it contains.
    pos_arabic = None
    consumed_to = 0
    for m in re.finditer(r'<(?P<tag>h1|h2|h3|p|ul|ol|div|section)[^>]*class="(?P<cls>[^"]*)"[^>]*>', chunk):
        if m.start() < consumed_to:
            continue                       # already taken as part of an outer block
        tag, classes = m.group('tag'), set(m.group('cls').split())
        handled = classes & {'raqi', 'prose', 'story', 'punch', 'note', 'sub-title',
                             'steps', 'symptoms', 'arabic-card', 'repeat-count'}
        if not handled:
            continue                       # a layout wrapper — keep scanning inside it
        inner, end = inner_html(chunk, m.end(), tag)
        consumed_to = end

        if 'raqi' in classes:
            t = clean(inner)
            if t and 'রাকী ফয়সাল' not in t:      # the sign-off card repeats the name
                out.append(f'## {t}')
        elif classes & {'prose', 'story', 'punch'}:
            t = clean(inner)
            if t:
                out.append(t)
        elif 'note' in classes:
            t = clean(inner)
            if t:
                out.append(f'> {t}')
        elif 'sub-title' in classes:
            t = clean(inner)
            if t:
                out.append(t)
        elif classes & {'steps', 'symptoms'} or (tag in ('ul', 'ol') and '<li' in inner):
            items = [clean(li) for li in re.findall(r'<li[^>]*>(.*?)</li>', inner, re.S)]
            items = [i for i in items if i]
            if items:
                ordered = tag == 'ol' or 'steps' in classes
                out.append('\n'.join(
                    (f'{n}. {t}' if ordered else f'- {t}') for n, t in enumerate(items, 1)))
        elif 'arabic-card' in classes:
            ar = grab(inner, 'arabic')
            tr = grab(inner, 'translation')
            if ar:
                block = ['```ayah', ar[0]]
                if tr:
                    block.append(f'— {tr[0]}')
                block.append('```')
                out.append('\n'.join(block))
                pos_arabic = len(out)
        elif 'repeat-count' in classes:
            t = clean(inner)
            if t:
                out.append(f'**{t}**')

    # a stray "৭ বার" line reads better above the ayah it counts
    if pos_arabic and out and out[-1].startswith('**') and pos_arabic == len(out) - 1:
        out.insert(pos_arabic - 1, out.pop())
    return out


def parse_caption(path):
    """Source link and hashtags — the only bits of the FB teaser worth keeping."""
    if not path.exists():
        return '', [], ''
    txt = path.read_text(encoding='utf-8')
    link = ''
    m = re.search(r'https?://(?:youtu\.be|www\.youtube\.com)/\S+', txt)
    if m:
        link = m.group(0).rstrip('.,)')
    # Bengali tags only — the captions also carry an English page-branding tag
    # ("learn ruqyah with Raqi sabit") that is noise on an article.
    tags = [t.replace('_', ' ') for t in re.findall(r'#([^\s#]+)', txt)
            if re.search(r'[ঀ-৿]', t)]
    credit = ''
    m = re.search(r'^মূল আলোচনা:\s*(.+?)(?:\s*[—-]\s*https?://|$)', txt, re.M)
    if m:
        credit = m.group(1).strip()
    return link, tags, credit


def build(stem):
    cards_file = DRAFTS / f'{stem}-fb-cards.html'
    cards = parse_cards(cards_file)
    if not cards:
        raise ValueError('no cards found')

    # The book-promo posts open on a cover mock-up, where the title sits in
    # `btitle` instead of the usual `big-title`.
    title = (grab(cards[0], 'big-title') or grab(cards[0], 'btitle') or [''])[0]
    if not title:
        raise ValueError('no title on card 1')
    desc = (grab(cards[0], 'sub-title') or [''])[0]

    link, tags, credit = parse_caption(DRAFTS / f'{stem}-caption.md')
    if not credit:
        for c in cards[::-1]:
            got = grab(c, 'credit')
            if got:
                credit = re.split(r'অনুবাদ ও সংকলন', got[0])[0].strip(' —')
                break

    blocks = []
    if desc:
        blocks.append(desc)
    for c in cards[1:]:
        blocks += card_to_md(c)

    if credit or link:
        blocks.append('---')
        src = f'**সূত্র:** {credit}' if credit else '**সূত্র**'
        if link:
            src += f' — [মূল ভিডিও]({link})'
        blocks.append(src)
        blocks.append('অনুবাদ ও সংকলন: রাকী ফয়সাল আহমেদ সাবিত — আল কুরআন রুকইয়াহ হিলিং সেন্টার')

    return title, desc, tags, '\n\n'.join(blocks)


def series_of(stem):
    m = re.match(r'^(day|bali|hibshi)-d?(\d+)-post-(\d+)$', stem)
    if not m:
        return '', '', 0
    kind, day, post = m.group(1), int(m.group(2)), int(m.group(3))
    slug, name = SERIES[kind]
    return slug, name, (day - 1) * 2 + post


def make_cover(stem, out_name):
    """card-1.png (1080x1350) -> a web-weight JPEG. Skips if no render exists."""
    src = FB_READY / stem / 'card-1.png'
    if not src.exists():
        return ''
    try:
        from PIL import Image
    except ImportError:
        return ''
    dest = IMAGES / out_name
    if dest.exists():
        return f'images/{out_name}'
    IMAGES.mkdir(exist_ok=True)
    im = Image.open(src).convert('RGB')
    im.thumbnail((900, 1125), Image.LANCZOS)
    im.save(dest, 'JPEG', quality=82, optimize=True)
    return f'images/{out_name}'


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--covers', action='store_true', help='build cover images from fb-ready renders')
    ap.add_argument('--limit', type=int, default=0)
    ap.add_argument('--src', help='a different drafts folder (there are two copies of this tree)')
    ap.add_argument('--match', help='only stems containing this substring')
    args = ap.parse_args()

    global DRAFTS, FB_READY
    if args.src:
        DRAFTS = Path(args.src)
        FB_READY = DRAFTS.parent / 'fb-ready'

    if not DRAFTS.exists():
        sys.exit(f'drafts folder not found: {DRAFTS}')

    stems = sorted(p.name[:-len('-fb-cards.html')] for p in DRAFTS.glob('*-fb-cards.html'))
    if args.match:
        stems = [s for s in stems if args.match in s]
    if args.limit:
        stems = stems[:args.limit]

    POSTS.mkdir(exist_ok=True)
    today = date.today().isoformat()
    ok, failed, covers = 0, [], 0

    for stem in stems:
        try:
            title, desc, tags, body = build(stem)
        except Exception as e:
            failed.append((stem, str(e)))
            continue

        slug, sname, ep = series_of(stem)
        cover = make_cover(stem, f'{stem}.jpg') if args.covers else ''
        # keep an existing cover line when re-running without --covers
        if not cover and (POSTS / f'{stem}.md').exists():
            m = re.search(r'^cover:\s*(\S+)', (POSTS / f'{stem}.md').read_text(encoding='utf-8'), re.M)
            if m:
                cover = m.group(1)
        if cover:
            covers += 1

        # Imports start as drafts: the blog must trail Facebook, or the "swipe
        # to see it" card post is competing with a page that already gave the
        # answer away. tools/publish_posts.py releases them once posted.
        # A re-import must never silently re-hide something already released.
        dest = POSTS / f'{stem}.md'
        draft = True
        if dest.exists():
            m = re.search(r'^draft:\s*(\w+)', dest.read_text(encoding='utf-8'), re.M)
            draft = (m.group(1) != 'false') if m else True

        fm = [
            '---',
            f'title: {title}',
            f'description: {desc}',
            f'date: {today}',
            f'draft: {"true" if draft else "false"}',
        ]
        if cover:
            fm.append(f'cover: {cover}')
        if tags:
            fm.append(f'tags: {", ".join(tags[:5])}')
        if slug:
            fm += [f'series: {slug}', f'seriesTitle: {sname}', f'episode: {ep}']
        fm.append('---')

        text = '\n'.join(fm) + '\n\n' + body + '\n'
        if args.dry_run:
            if ok < 1:
                print(text[:1500])
        else:
            # newline='\n': the default would write CRLF on Windows
            (POSTS / f'{stem}.md').write_text(text, encoding='utf-8', newline='\n')
        ok += 1

    print(f'\nconverted {ok}/{len(stems)}'
          + (f' | covers built: {covers}' if args.covers else '')
          + (f' | failed: {len(failed)}' if failed else ''))
    for s, e in failed[:10]:
        print(f'  ⚠️  {s}: {e}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
