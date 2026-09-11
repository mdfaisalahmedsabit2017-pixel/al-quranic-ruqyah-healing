#!/usr/bin/env python3
"""একটা PDF থেকে book_pages*/ ফোল্ডার বানায় — যা /api/book সার্ভ করে।

পেইড বই কখনো PDF হিসেবে দেওয়া হয় না; `api/book.js` পাতা-প্রতি webp ছবি দেয়,
আর কেনা না থাকলে preview-র পরে থামিয়ে দেয়। এই স্ক্রিপ্ট সেই ছবিগুলো বানায়:

    book_pages_<id>/
      meta.json      {"pages": N, "width": 1200}
      cover.webp     মলাট — সবার জন্য ফ্রি, দোকানের সাজানো জানালা
      p0001.webp ...  প্রতিটি পাতা

`--strip-image` দিয়ে PDF-এ বসানো ওয়াটারমার্ক/সিল বাদ দেওয়া যায়। ইসমে আজমের
ক্ষেত্রে দরকার হয়েছিল: প্রতিটি পাতায় প্রতিষ্ঠানের সিল বসানো ছিল আর তাতে দুটো
ফোন নম্বর লেখা — সাইটে তুললে ১৭১ পাতায় নম্বর দুটো পাবলিক হয়ে যেত।

    python tools/make_book_pages.py "<in.pdf>" book_pages_isme_azam --strip-image 5
    python tools/make_book_pages.py "<in.pdf>" book_pages_x --list-images   # আগে দেখে নিন
"""

import argparse
import io
import json
import os
import shutil
import sys

try:
    import fitz  # PyMuPDF
except ImportError:
    sys.exit('PyMuPDF লাগবে:  pip install pymupdf')
try:
    from PIL import Image
except ImportError:
    sys.exit('Pillow লাগবে:  pip install pillow')

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
WIDTH = 1200          # api/book.js-এর অন্য দুটো বই এই প্রস্থেই তৈরি
QUALITY = 80


def list_images(doc):
    """কোন ছবি কত পাতায় আছে — ওয়াটারমার্ক চেনার সবচেয়ে সহজ উপায়।"""
    seen = {}
    for i in range(doc.page_count):
        for img in doc[i].get_images(full=True):
            xref, _, w, h = img[0], img[1], img[2], img[3]
            e = seen.setdefault(xref, {'w': w, 'h': h, 'pages': 0})
            e['pages'] += 1
    for xref, e in sorted(seen.items(), key=lambda kv: -kv[1]['pages']):
        flag = '  <- সব পাতায়, সম্ভবত ওয়াটারমার্ক' if e['pages'] == doc.page_count else ''
        print(f"  xref {xref:>4}  {e['w']}x{e['h']}  {e['pages']} পাতায়{flag}")


def render(doc, index, width):
    page = doc[index]
    zoom = width / page.rect.width
    pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
    return Image.open(io.BytesIO(pix.tobytes('png'))).convert('RGB')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('pdf')
    ap.add_argument('outdir', help='book_pages_<id> — রিপোর রুটের সাপেক্ষে')
    ap.add_argument('--strip-image', type=int, action='append', default=[],
                    metavar='XREF', help='এই ছবিটা প্রতিটি পাতা থেকে বাদ দাও')
    ap.add_argument('--cover-page', type=int, default=1, help='মলাট কোন পাতা (১ থেকে)')
    ap.add_argument('--insert-image', metavar='PNG',
                    help='এই ছবিটা বইয়ের ভেতরে একটা পাতা হিসেবে ঢোকাও (রাকীর টীকা)')
    ap.add_argument('--insert-after', type=int, default=1, metavar='N',
                    help='কত নম্বর মূল পাতার পরে ঢুকবে (ডিফল্ট ১, অর্থাৎ মলাটের পরে)')
    ap.add_argument('--width', type=int, default=WIDTH)
    ap.add_argument('--list-images', action='store_true', help='শুধু ছবির তালিকা দেখাও')
    args = ap.parse_args()

    doc = fitz.open(args.pdf)
    if doc.needs_pass:
        sys.exit('PDF-টা পাসওয়ার্ড-দেওয়া — খোলা কপি লাগবে।')

    if args.list_images:
        print(f'{os.path.basename(args.pdf)} — {doc.page_count} পাতা')
        list_images(doc)
        return

    # ওয়াটারমার্ক বাদ। একই xref সব পাতায় থাকে, কিন্তু মোছাটা পাতা-প্রতি।
    stripped = 0
    for xref in args.strip_image:
        for i in range(doc.page_count):
            if any(im[0] == xref for im in doc[i].get_images(full=True)):
                doc[i].delete_image(xref)
                stripped += 1
    if args.strip_image:
        print(f'ওয়াটারমার্ক সরানো হলো: {stripped}টি স্থান')
        # delete_image() ছবিটাকে ১x১ ফাঁকা প্লেসহোল্ডার দিয়ে বদলে দেয়, xref-টা
        # পাতার রিসোর্সে থেকেই যায়। তাই "get_images-এ আছে কি না" দেখে যাচাই করা
        # যায় না — দেখতে হয় ছবিটা সত্যিই ছোট হয়ে গেছে কি না।
        for xref in args.strip_image:
            try:
                info = doc.extract_image(xref)
            except Exception:
                continue
            if info and info.get('width', 0) * info.get('height', 0) > 16:
                sys.exit(f'xref {xref} এখনো {info["width"]}x{info["height"]} — '
                         'সরানো যায়নি, কিছু লেখা হয়নি।')

    out = os.path.join(ROOT, args.outdir)
    if os.path.exists(out):
        shutil.rmtree(out)
    os.makedirs(out)

    # ঢোকানো পাতাটি বইয়ের বাকি পাতার মাপেই হতে হবে — না হলে রিডারে পাতা
    # বদলানোর সময় লাফ দেয়।
    insert = None
    if args.insert_image:
        src = args.insert_image if os.path.isabs(args.insert_image) \
            else os.path.join(ROOT, args.insert_image)
        if not os.path.exists(src):
            sys.exit(f'ঢোকানোর ছবিটা নেই: {src}')
        insert = Image.open(src).convert('RGB')
        ref = render(doc, 0, args.width).size
        if insert.size != ref:
            insert = insert.resize(ref)
            print(f'ঢোকানো পাতা {ref[0]}x{ref[1]}-এ মেলানো হলো')

    n = 0
    for i in range(doc.page_count):
        n += 1
        render(doc, i, args.width).save(
            os.path.join(out, f'p{n:04d}.webp'), 'WEBP', quality=QUALITY, method=6)
        if insert is not None and i + 1 == args.insert_after:
            n += 1
            insert.save(os.path.join(out, f'p{n:04d}.webp'),
                        'WEBP', quality=QUALITY, method=6)
            print(f'  টীকা বসল {n} নম্বর পাতায়')
        if n % 25 == 0 or i + 1 == doc.page_count:
            print(f'  {n}/{doc.page_count + (1 if insert is not None else 0)}')

    if insert is not None and args.insert_after > doc.page_count:
        sys.exit(f'--insert-after {args.insert_after} — বইয়ে অত পাতা নেই, কিছু বসেনি।')

    render(doc, args.cover_page - 1, args.width).save(
        os.path.join(out, 'cover.webp'), 'WEBP', quality=QUALITY, method=6)

    with open(os.path.join(out, 'meta.json'), 'w', encoding='utf-8') as f:
        json.dump({'pages': n, 'width': args.width}, f)

    size = sum(os.path.getsize(os.path.join(out, n)) for n in os.listdir(out))
    print(f'\n{args.outdir}/ — {n} পাতা + মলাট, {size / 1024 / 1024:.1f} MB')
    print('পরের ধাপ: api/book.js-এর BOOKS, app.js-এর BOOKS, vercel.json includeFiles, .gitignore')


if __name__ == '__main__':
    main()
