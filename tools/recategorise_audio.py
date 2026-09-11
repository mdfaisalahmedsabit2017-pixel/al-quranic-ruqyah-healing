#!/usr/bin/env python3
"""audio.json-এর `category` ফিল্ড পুনর্বিন্যাস — আর কিছুই ছোঁয় না।

কেন: লাইব্রেরির অনেক এন্ট্রি আসলে রুকইয়াহ তিলাওয়াত নয়, শায়খের আরবি আলোচনা —
লক্ষণ বোঝানো, পরামর্শ, "কীভাবে বুঝবেন" ধরনের ভিডিও। রুকইয়াহর সাথে মিশে থাকায়
যিনি শুনে আমল করতে এসেছেন তিনি ভুল জিনিস পান। ওগুলো "আলোচনা ও লেকচার"-এ যাবে।

অলঙ্ঘনীয়: `code` কখনো বদলায় না। আগের রোগীদের কাছে S04, H12 — এই কোডগুলোই গেছে।
তাই এই স্ক্রিপ্ট `category` ছাড়া আর কোনো ফিল্ড লিখতে পারে না, আর লেখার আগে-পরে
কোড/URL/শিরোনাম/ট্যাগ মিলিয়ে দেখে। যেকোনো অমিলে কিছু না লিখে থেমে যায়।

শ্রেণিবিভাগ হাতে করা — শিরোনাম (বাংলা + আরবি) পড়ে। ভিডিও শোনা হয়নি, তাই
সন্দেহজনকগুলো UNCERTAIN তালিকায় আলাদা রাখা, ওগুলো নিজে থেকে সরে না।

    python tools/recategorise_audio.py            # শুধু তালিকা দেখায়, কিছু বদলায় না
    python tools/recategorise_audio.py --write     # অনুমোদনের পর প্রয়োগ
    python tools/recategorise_audio.py --write --include-uncertain
"""

import argparse
import json
import os
import sys

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
AUDIO = os.path.join(ROOT, 'audio.json')
LOCK = os.path.join(ROOT, 'tools', 'audio-codes.lock.json')
REPORT = os.path.join(ROOT, 'docs', 'audio-recategorise.md')

NEW_CATEGORY = 'আলোচনা ও লেকচার'

# শায়খ কথা বলছেন — তিলাওয়াত নয়। লক্ষণ, কারণ, "কীভাবে বুঝবেন", পরামর্শ,
# "ঘরের যে ৩টি জায়গা" ধরনের ভিডিও। ব্যবহারকারীর সিদ্ধান্ত: খাঁটি লেকচার ও
# গাইড/পরামর্শ — দুটোই সরবে।
MOVE = {
    # গাইড (H) — প্রায় পুরোটাই আলোচনা
    'H01': 'ঈদের দিনে "যা করবেন না" — পরামর্শ, তিলাওয়াত নেই',
    'H02': 'ঘরের ৩টি স্থান চেনানো — আলোচনা',
    'H03': 'মোবাইলের কারণে কারীনের প্রভাব — আলোচনা',
    'H04': 'আরোগ্যের লক্ষণ চেনানো — আলোচনা',
    'H05': '"আপনি কোন অবস্থায়" — লক্ষণ আলোচনা',
    'H06': 'ভুল চিকিৎসার কারণ ব্যাখ্যা — আলোচনা',
    'H07': 'স্বপ্নের ব্যাখ্যা — আলোচনা',
    'H08': 'স্বপ্ন ভুলে যাওয়ার কারণ ব্যাখ্যা — আলোচনা',
    'H09': 'স্বপ্ন দেখে জাদু চেনা — আলোচনা',
    'H10': 'ঘরের জিনিস চেনানো — আলোচনা',
    'H11': 'স্বপ্নের ব্যাখ্যা — আলোচনা',
    'H12': '"রুকিয়াহর পরও কেন জিন বের হয় না" — কারণ ব্যাখ্যা, আলোচনা',
    'H13': 'আয়াত পরিচয় করানো — আলোচনা',
    'H14': 'স্বপ্নের ব্যাখ্যা — আলোচনা',
    'H20': 'জাদুটোনা করা ঘর চেনার উপায় — আলোচনা',
    'H21': 'Ruqyah Shariah 6 — Advice (NASEEHA): উপদেশ, তিলাওয়াত নয়',
    'H28': 'স্বপ্নে বাধার লক্ষণ ও ব্যাখ্যা — আলোচনা',
    # জাদু (S)
    'S06': 'জাদুকরের ওপর প্রভাব "বোঝার উপায়" — আলোচনা',
    'S12': 'গোপন রহস্য — আলোচনা',
    'S14': 'তেল মালিশের পদ্ধতি দেখানো — আলোচনা',
    'S15': 'জাদুর স্থান চেনার উপায় — আলোচনা',
    'S17': 'জাদু ঠেকানোর উপায় — আলোচনা',
    'S21': 'জাদু নষ্ট হওয়ার চিহ্ন চেনানো — আলোচনা',
    'S22': 'ঈদুল আযহায় জাদুর লক্ষণ — আলোচনা',
    'S23': 'যিলহজে জাদুর ৩টি লক্ষণ — আলোচনা',
    'S25': 'আক্রমণের ধরন ব্যাখ্যা — আলোচনা',
    'S26': 'বাড়ির ৫টি স্থান চেনানো — আলোচনা',
    'S27': '"একটি সূরা আছে যা…" — পরিচয় করানো, আলোচনা',
    'S28': 'ব্যবহারিক পদ্ধতি দেখানো — আলোচনা',
    'S29': '"যে আয়াতের কারণে জাদুকর মারা গেল" — ঘটনা বর্ণনা, আলোচনা',
    'S30': 'গোপন আয়াত পরিচয় করানো — আলোচনা',
    'S31': 'জাদুকরের নজর থেকে বাঁচার উপায় — আলোচনা',
    'S36': 'সূরা পরিচয় করানো — আলোচনা',
    # জ্বিন (J)
    'J01': 'হাসাদের শয়তানের লক্ষণ ও কর্মপদ্ধতি — আলোচনা',
    'J02': 'শরীরে জিনের জীবনযাপন — আলোচনা',
    'J03': 'লুকানো জিনের ধরন ব্যাখ্যা — আলোচনা',
    'J06': 'জাদুকর জিনের আছর ব্যাখ্যা — আলোচনা',
    'J07': 'সাপ জিনের অবস্থান ও পদ্ধতি ব্যাখ্যা — আলোচনা',
    'J08': '"জিনেরা চুরি করা টাকা কোথায় নেয়" — আলোচনা',
    'J09': 'পাহারাদার জিন ব্যাখ্যা ও আয়াত পরিচয় — আলোচনা',
    # গিঁট (G)
    'G13': 'মাথার স্থান চেনানো — আলোচনা',
    'G16': '"আমি বাধাগ্রস্ত ছিলাম, তারপর…" — অভিজ্ঞতা বর্ণনা, আলোচনা',
    'G18': 'শয়তান কীভাবে বাধা দেয় — আলোচনা',
    'G19': 'আয়াত পরিচয় ও পড়ার নিয়ম — আলোচনা',
    # বদনজর (B)
    'B13': 'হাসেদ এলে কী করবেন — পরামর্শ',
    'B14': 'ঈদের দিনে ৩টি কাজ — পরামর্শ',
    'B15': 'রমজানে করণীয় — পরামর্শ',
    'B16': 'বের করার পদ্ধতি বোঝানো — আলোচনা',
    'B18': 'শয়তান কীভাবে এলো ও কীভাবে পোড়াবেন — আলোচনা',
    # কারীন (K)
    'K06': 'কারীনের রহস্য — আলোচনা',
    'K07': 'জাদুকর ও কারীনের সম্পর্ক — আলোচনা',
    'K12': 'গিঁট ও আছরের পার্থক্য চেনানো — আলোচনা',
    'K14': 'কারীনের প্রভাব চেনার উপায় — আলোচনা',
    'K16': '"কারীন কি মানুষকে ধরে ও রুকইয়াহতে প্রভাবিত হয়" — প্রশ্নোত্তর, আলোচনা',
    # তাবেআ (T)
    'T03': 'তাবেআ আছে কি না চেনার উপায় — আলোচনা',
    'T09': '"পারিবারিক তাবেআ আরো ভয়ংকর" — ব্যাখ্যা, আলোচনা',
    'T10': 'তাবেআ কারীনার কুপ্রভাব ব্যাখ্যা — আলোচনা',
    # আমল (A)
    'A04': 'সূরা দুখানের উপকারিতা বর্ণনা — আলোচনা',
    'A05': 'সূরা বাকারার রহস্য — আলোচনা',
    'A06': 'ছোট সূরা পরিচয় করানো — আলোচনা',
    # অসুখ (D)
    'D01': 'কোষ্ঠকাঠিন্যে বদনজরের লক্ষণ — আলোচনা',
    # সুরক্ষা (P)
    'P01': 'সুরক্ষা কমার ৩টি লক্ষণ — আলোচনা',
    'P02': 'শয়তান ও সূরা পরিচয় করানো — আলোচনা',
    # পারিবারিক (F)
    'F01': 'বিয়ের বাধার পদ্ধতি দেখানো — আলোচনা',
    # শিক্ষা (E)
    'E01': '"শয়তান কেন ভয় পায়" — আলোচনা',
    'E03': 'ছিটানো জাদুর লক্ষণ — আলোচনা',
    'E06': 'হিংসুকের নজরের লক্ষণ — আলোচনা',
}

# শিরোনাম থেকে নিশ্চিত হওয়া যায়নি — বাংলা শিরোনাম "রুকিয়াহ" বলছে কিন্তু আরবি
# শিরোনাম আলোচনার ধাঁচের, বা উল্টোটা। --include-uncertain ছাড়া এগুলো সরে না।
UNCERTAIN = {
    'S01': 'বাংলায় "সূরা ও আমল", আরবি শিরোনাম আলোচনার ধাঁচে',
    'S04': 'পানির গ্লাসে পরীক্ষা — শুনে-দেখে করার পদ্ধতি, নাকি নিছক ব্যাখ্যা?',
    'S09': '"শাহিদ" (দেখুন) দিয়ে শুরু, কিন্তু বাংলায় রুকিয়াহ',
    'S11': 'বাংলায় রুকিয়াহ, আরবি শিরোনাম বর্ণনামূলক',
    'S24': '"চ্যালেঞ্জ" — তিলাওয়াতসহ পদ্ধতি হতে পারে',
    'S32': 'বাংলায় রুকিয়াহ, আরবিতে "কীভাবে বাতিল করবেন"',
    'T06': 'বাংলায় "পদ্ধতি", আরবি শিরোনাম রুকইয়াহর ফল বর্ণনা করছে',
    'T08': 'বাংলায় রুকিয়াহ, আরবি শিরোনাম কাটা',
    'T12': 'S01-এর মতো একই আরবি শিরোনাম',
    'K02': 'বাংলায় রুকিয়াহ, আরবি শিরোনাম আলোচনার ধাঁচে',
    'K05': 'একটি আয়াত — তিলাওয়াত নাকি পরিচয়?',
    'K08': '"যিকির ও আমল" — পাঠ হতে পারে',
    'K09': 'বাংলায় রুকিয়াহ, আরবি প্রশ্নবোধক',
    'K11': '"বিশেষ সূরা" — পাঠ নাকি পরিচয়?',
    'A02': '"যে সূরা শয়তান সহ্য করতে পারে না" — পাঠ নাকি পরিচয়?',
    'J05': '"লুকানো জিনের ওপর আয়াতসমূহ" — তিলাওয়াত হতে পারে',
    'J11': '"যে আয়াতগুলো ধ্বংস করে" — তিলাওয়াত হতে পারে',
    'H15': 'তাহরীজ — পাঠ করার জিনিস, আলোচনা নাও হতে পারে',
    'H19': 'আরবি শিরোনাম ফাঁকা, বাংলায় "গাইড ও আমল"',
    'H22': 'রুকইয়াহ সেশনের লাইভ রেকর্ডিং — শোনাটাই রুকইয়াহ, তবু আলোচনাও থাকে',
    'B21': '"১ মিনিটের আমল" — আয়াত দশবার পড়া, পাঠ হতে পারে',
}

TRACKED = ('code', 'url', 'title_bn', 'title_ar', 'tags')


def load():
    with open(AUDIO, encoding='utf-8') as f:
        return json.load(f)


def fingerprint(data):
    """`category` বাদে বাকি সব — এটাই অপরিবর্তিত থাকতে হবে।"""
    return [{k: e[k] for k in TRACKED} for e in data]


def check_lock(data):
    """কোড ও URL-এর স্ন্যাপশটের সাথে মিলিয়ে দেখা। lock না থাকলে বানিয়ে দেয়।"""
    current = {e['code']: e['url'] for e in data}
    if not os.path.exists(LOCK):
        with open(LOCK, 'w', encoding='utf-8') as f:
            json.dump(current, f, ensure_ascii=False, indent=1, sort_keys=True)
            f.write('\n')
        print(f'lock তৈরি হলো: {os.path.relpath(LOCK, ROOT)} ({len(current)}টি কোড)')
        return
    with open(LOCK, encoding='utf-8') as f:
        locked = json.load(f)
    if locked != current:
        missing = sorted(set(locked) - set(current))
        added = sorted(set(current) - set(locked))
        changed = sorted(c for c in set(locked) & set(current) if locked[c] != current[c])
        sys.exit('কোড lock মেলেনি — কিছু লেখা হয়নি।\n'
                 f'  হারানো কোড: {missing}\n  নতুন কোড: {added}\n  URL বদলেছে: {changed}')


def write_report(data, uncertain_moves):
    by_code = {e['code']: e for e in data}
    lines = [
        '# অডিও পুনর্বিন্যাস — অনুমোদনের তালিকা',
        '',
        f'`audio.json`-এর {len(data)}টি এন্ট্রি শিরোনাম (বাংলা + আরবি) পড়ে ভাগ করা হয়েছে।',
        f'যেগুলো রুকইয়াহ তিলাওয়াত নয় — শায়খের আলোচনা, লক্ষণ চেনানো, পরামর্শ — সেগুলো',
        f'**{NEW_CATEGORY}** ক্যাটাগরিতে যাবে।',
        '',
        '> **কোড বদলায় না।** শুধু `category` ফিল্ড বদলাবে। `code`, `url`, শিরোনাম ও',
        '> ট্যাগ অপরিবর্তিত থাকবে — স্ক্রিপ্ট লেখার আগে-পরে মিলিয়ে দেখে।',
        '',
        '> ভিডিও শোনা হয়নি, শুধু শিরোনাম দেখা হয়েছে। তাই দ্বিতীয় তালিকাটা',
        '> (সন্দেহজনক) আলাদা — ওগুলো নিজে থেকে সরবে না।',
        '',
        f'## ১. সরবে — {len(MOVE)}টি',
        '',
        '| কোড | এখনকার ক্যাটাগরি | শিরোনাম | কেন সরছে |',
        '|---|---|---|---|',
    ]
    for code, why in sorted(MOVE.items(), key=lambda kv: (kv[0][0], kv[0])):
        e = by_code[code]
        lines.append(f"| `{code}` | {e['category']} | {e['title_bn'].strip()} | {why} |")

    lines += [
        '',
        f'## ২. সন্দেহজনক — {len(UNCERTAIN)}টি (এখন সরছে না)',
        '',
        'বাংলা শিরোনাম "রুকিয়াহ" বলছে কিন্তু আরবি শিরোনাম আলোচনার ধাঁচের, বা উল্টোটা।',
        'যেগুলো আসলে আলোচনা, সেগুলোর কোড জানালে পরের রানে সরিয়ে দেওয়া হবে',
        '(অথবা `--include-uncertain` দিলে সবগুলোই সরবে)।',
        '',
        '| কোড | এখনকার ক্যাটাগরি | শিরোনাম | কেন সন্দেহ |',
        '|---|---|---|---|',
    ]
    for code, why in sorted(UNCERTAIN.items(), key=lambda kv: (kv[0][0], kv[0])):
        e = by_code[code]
        mark = ' ← এই রানে সরছে' if code in uncertain_moves else ''
        lines.append(f"| `{code}` | {e['category']} | {e['title_bn'].strip()}{mark} | {why} |")

    moving = set(MOVE) | set(uncertain_moves)
    counts = {}
    for e in data:
        cat = NEW_CATEGORY if e['code'] in moving else e['category']
        counts[cat] = counts.get(cat, 0) + 1
    lines += [
        '',
        '## ৩. প্রয়োগের পর ক্যাটাগরির হিসাব',
        '',
        '| ক্যাটাগরি | আগে | পরে |',
        '|---|---|---|',
    ]
    before = {}
    for e in data:
        before[e['category']] = before.get(e['category'], 0) + 1
    for cat in sorted(set(before) | set(counts), key=lambda c: -counts.get(c, 0)):
        b, a = before.get(cat, 0), counts.get(cat, 0)
        note = ' **(খালি — পাতা বাদ যাবে, 301 লাগবে)**' if b and not a else ''
        lines.append(f'| {cat} | {b} | {a}{note} |')
    lines += ['', f'মোট: {sum(before.values())} → {sum(counts.values())}', '']

    os.makedirs(os.path.dirname(REPORT), exist_ok=True)
    with open(REPORT, 'w', encoding='utf-8') as f:
        f.write('\n'.join(lines))
    return counts, before


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--write', action='store_true', help='audio.json-এ প্রয়োগ করো')
    ap.add_argument('--include-uncertain', action='store_true',
                    help='সন্দেহজনকগুলোও সরাও')
    ap.add_argument('--also', nargs='*', default=[],
                    help='সন্দেহজনক তালিকা থেকে যে কোডগুলো সরাতে হবে')
    args = ap.parse_args()

    data = load()
    check_lock(data)

    unknown = (set(MOVE) | set(UNCERTAIN)) - {e['code'] for e in data}
    if unknown:
        sys.exit(f'তালিকায় এমন কোড আছে যা audio.json-এ নেই: {sorted(unknown)}')
    overlap = set(MOVE) & set(UNCERTAIN)
    if overlap:
        sys.exit(f'একই কোড দুই তালিকায়: {sorted(overlap)}')

    if args.include_uncertain:
        uncertain_moves = set(UNCERTAIN)
    else:
        uncertain_moves = set(args.also) & set(UNCERTAIN)
        stray = set(args.also) - set(UNCERTAIN)
        if stray:
            sys.exit(f'--also-তে দেওয়া কোড সন্দেহজনক তালিকায় নেই: {sorted(stray)}')

    counts, before = write_report(data, uncertain_moves)
    moving = set(MOVE) | uncertain_moves
    print(f'সরবে: {len(moving)}টি ({len(MOVE)} নিশ্চিত + {len(uncertain_moves)} সন্দেহজনক)')
    print(f'তালিকা: {os.path.relpath(REPORT, ROOT)}')

    if not args.write:
        print('\n--write দেওয়া হয়নি — audio.json অপরিবর্তিত।')
        return

    before_fp = fingerprint(data)
    for e in data:
        if e['code'] in moving:
            e['category'] = NEW_CATEGORY

    # শুধু category বদলেছে — আর কিছু নয়
    if fingerprint(data) != before_fp:
        sys.exit('category ছাড়া অন্য ফিল্ড বদলে গেছে — কিছু লেখা হয়নি।')
    if len(data) != len(before_fp):
        sys.exit('এন্ট্রির সংখ্যা বদলে গেছে — কিছু লেখা হয়নি।')

    with open(AUDIO, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)
        f.write('\n')
    print(f'\nলেখা হলো: audio.json — {len(moving)}টি এন্ট্রির category বদলালো, '
          f'{len(data)}টি কোডের একটিও বদলায়নি।')
    for cat, n in sorted(counts.items(), key=lambda kv: -kv[1]):
        print(f'  {n:>4}  {cat}')
    for cat, n in before.items():
        if not counts.get(cat):
            print(f'  খালি হলো: {cat} — /audio/ পাতায় 301 redirect লাগবে')


if __name__ == '__main__':
    main()
