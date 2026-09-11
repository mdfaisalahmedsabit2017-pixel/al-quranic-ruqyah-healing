#!/usr/bin/env python3
"""Release blog posts once their Facebook post is live.

Imported posts sit at `draft: true` so the blog trails Facebook — a page that
already gives the answer away competes with the "সোয়াইপ করে দেখুন" card post.
This flips them to published, one at a time or in batches.

    python tools/publish_posts.py --list
    python tools/publish_posts.py day-01-post-1 day-01-post-2
    python tools/publish_posts.py --series ruqyah-program --upto 20
    python tools/publish_posts.py --from-posted
    python tools/publish_posts.py --unpublish day-01-post-2

Then `node build.js` and deploy. Nothing here touches the post text.
"""

import argparse
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
POSTS = ROOT / 'posts'
POSTED = Path(r'A:/claude code projects sabit/fb-ruqyah-content/posted')


def read(p):
    return p.read_text(encoding='utf-8').replace('\r\n', '\n')


def meta_of(p):
    txt = read(p)
    get = lambda k: (re.search(rf'^{k}:\s*(.*)$', txt, re.M) or [None, ''])[1].strip()
    return {
        # matches tools/blog.js: only an explicit `draft: true` holds a post back,
        # so a hand-written post with no draft line counts as published
        'draft': get('draft') == 'true',
        'series': get('series'),
        'episode': int(get('episode') or 0),
        'title': get('title'),
    }


def set_draft(p, value):
    """Rewrite (or insert) the draft line without disturbing anything else."""
    txt = read(p)
    want = 'true' if value else 'false'
    if re.search(r'^draft:\s*\w+$', txt, re.M):
        new = re.sub(r'^draft:\s*\w+$', f'draft: {want}', txt, count=1, flags=re.M)
    else:
        new = re.sub(r'^(date:.*)$', rf'\1\ndraft: {want}', txt, count=1, flags=re.M)
    if new == txt:
        return False
    p.write_text(new, encoding='utf-8', newline='\n')
    return True


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('slugs', nargs='*', help='post slugs (filename without .md)')
    ap.add_argument('--series', help='limit to one series slug')
    ap.add_argument('--upto', type=int, help='with --series: publish episodes 1..N')
    ap.add_argument('--from-posted', action='store_true',
                    help='publish everything present in the fb-ruqyah-content/posted folder')
    ap.add_argument('--all', action='store_true', help='every post, held back or not')
    ap.add_argument('--unpublish', action='store_true', help='send back to draft instead')
    ap.add_argument('--list', action='store_true', help='show what is live and what is held')
    args = ap.parse_args()

    files = {p.stem: p for p in POSTS.glob('*.md') if p.name != 'README.md'}
    if not files:
        sys.exit('no posts found')

    if args.list:
        live = {k: v for k, v in files.items() if not meta_of(v)['draft']}
        by_series = {}
        for k, p in files.items():
            m = meta_of(p)
            key = m['series'] or '(আলাদা লেখা)'
            s = by_series.setdefault(key, [0, 0])
            s[0] += 0 if m['draft'] else 1
            s[1] += 1
        print(f'live: {len(live)} / {len(files)}\n')
        for k, (n, total) in sorted(by_series.items(), key=lambda x: -x[1][1]):
            print(f'  {k:<20} {n}/{total} published')
        held = sorted(k for k, v in files.items() if meta_of(v)['draft'])
        if held:
            print(f'\nnext up: {", ".join(held[:6])}{" …" if len(held) > 6 else ""}')
        return 0

    targets = []
    if args.all:
        targets = sorted(files.values(), key=lambda p: p.stem)
    elif args.from_posted:
        if not POSTED.exists():
            sys.exit(f'not found: {POSTED}')
        names = {p.stem.replace('-caption', '').replace('-fb-cards', '')
                 for p in POSTED.iterdir()}
        targets = [files[n] for n in names if n in files]
        if not targets:
            print(f'{POSTED} holds nothing that matches a post — nothing to do.')
            return 0
    elif args.series:
        for k, p in files.items():
            m = meta_of(p)
            if m['series'] == args.series and (not args.upto or 0 < m['episode'] <= args.upto):
                targets.append(p)
        targets.sort(key=lambda p: meta_of(p)['episode'])
    elif args.slugs:
        missing = [s for s in args.slugs if s not in files]
        if missing:
            sys.exit(f'unknown post(s): {", ".join(missing)}')
        targets = [files[s] for s in args.slugs]
    else:
        ap.error('give slugs, or --series, or --from-posted, or --all, or --list')

    changed = 0
    for p in targets:
        if set_draft(p, args.unpublish):
            changed += 1
            print(f'  {"held back" if args.unpublish else "published"}: {p.stem}')

    verb = 'sent back to draft' if args.unpublish else 'published'
    print(f'\n{changed} {verb} ({len(targets) - changed} already there)')
    if changed:
        print('next: node build.js, then deploy')
    return 0


if __name__ == '__main__':
    sys.exit(main())
