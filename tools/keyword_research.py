#!/usr/bin/env python3
"""Pull real Bengali search suggestions from Google autocomplete.

This is step 1 of the Brian Dean method the user asked about: instead of
guessing keywords, read what Google is already completing for people. The
endpoint is the same one the search box uses, so the suggestions are actual
queries, not estimates. There is no volume figure here — that needs a paid
tool — but the *wording* is real, and wording is what a title has to match.

    python tools/keyword_research.py                 # seeds below
    python tools/keyword_research.py --seed "রুকইয়াহ"
    python tools/keyword_research.py --out kw.md

Writes a markdown report grouped by seed.
"""

import argparse
import json
import sys
import time
import urllib.parse
import urllib.request
from pathlib import Path

ENDPOINT = 'https://suggestqueries.google.com/complete/search'
UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/124 Safari/537.36'

SEEDS = [
    'রুকইয়াহ', 'রুকইয়াহ কিভাবে করব', 'বদনজর', 'বদনজরের লক্ষণ', 'বদনজর কাটানোর উপায়',
    'জাদু', 'জাদুর লক্ষণ', 'জাদু নষ্ট করার উপায়', 'সিহর', 'হাসাদ',
    'জিন', 'জিনে ধরার লক্ষণ', 'বান মারা', 'তাবিজ', 'সূরা বাকারা',
    'আয়াতুল কুরসি', 'রুকইয়াহ শারিয়াহ', 'সেলফ রুকইয়াহ', 'রুকইয়াহ পানি',
    'ওয়াসওয়াসা', 'স্বপ্নে', 'ঘুমের সমস্যা রুকইয়াহ', 'রুকইয়াহ আয়াত',
]

# a-z style expansion in Bengali: append each vowel/consonant start to widen
EXPAND = ['', ' ক', ' কি', ' কী', ' কেন', ' কিভাবে', ' উপায়', ' লক্ষণ', ' দোয়া', ' আমল']


def suggest(q, lang='bn', gl='BD'):
    params = urllib.parse.urlencode({'client': 'firefox', 'hl': lang, 'gl': gl, 'q': q})
    req = urllib.request.Request(f'{ENDPOINT}?{params}', headers={'User-Agent': UA})
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read().decode('utf-8'))
        return data[1] if len(data) > 1 else []
    except Exception as e:
        print(f'  ! {q}: {e}', file=sys.stderr)
        return []


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--seed', action='append', help='extra seed (repeatable)')
    ap.add_argument('--out', default='seo-keywords.md')
    ap.add_argument('--deep', action='store_true', help='also expand each seed with modifiers')
    args = ap.parse_args()

    seeds = SEEDS + (args.seed or [])
    found = {}
    seen = set()

    for s in seeds:
        variants = [s + m for m in EXPAND] if args.deep else [s]
        got = []
        for v in variants:
            for k in suggest(v):
                k = k.strip()
                if k and k not in seen:
                    seen.add(k)
                    got.append(k)
            time.sleep(0.25)
        found[s] = got
        print(f'{s:<28} {len(got)} suggestions')

    out = Path(args.out)
    lines = ['# Google autocomplete — বাংলা রুকইয়াহ কীওয়ার্ড', '',
             f'সূত্র: Google suggest (hl=bn, gl=BD) · মোট {len(seen)}টি আলাদা কোয়েরি', '',
             'এগুলো সত্যিকারের সার্চ — অনুমান নয়। সার্চ ভলিউম এখানে নেই (তার জন্য পেইড টুল লাগে),',
             'কিন্তু মানুষ ঠিক **কোন শব্দে** খোঁজে সেটাই এখানে আছে, আর শিরোনামে ওই শব্দটাই দরকার।', '']
    for s, ks in found.items():
        if not ks:
            continue
        lines.append(f'## {s}')
        lines += [f'- {k}' for k in ks]
        lines.append('')
    out.write_text('\n'.join(lines), encoding='utf-8', newline='\n')
    print(f'\n{len(seen)} unique keywords -> {out}')
    return 0


if __name__ == '__main__':
    sys.exit(main())
