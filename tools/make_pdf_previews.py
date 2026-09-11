"""pdf/*.pdf (the 104 legacy guides in pdf_list.json) -> pdf_previews/<slug>.jpg + pdf_meta.json

Each legacy PDF gets a landing page at /guides/pdf/<slug>/ (tools/library.js).
Most of those PDFs are image-only ("Microsoft: Print To PDF" of a rendered
page), so there is no text to quote on the page — but the first page rendered
as an image is an honest preview, and the page count and file size are real
facts about the resource. This script produces both, once, on a machine that
has PyMuPDF; the build on Vercel only reads the results.

Idempotent by sha256: a PDF whose bytes have not changed is not re-rendered, so
re-running after adding one PDF costs one render.

    python tools/make_pdf_previews.py
"""
import hashlib
import json
import os
import sys

import fitz  # PyMuPDF — already a dependency of tools/watermark_pdfs.py

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
PDF_DIR = os.path.join(ROOT, 'pdf')
OUT_DIR = os.path.join(ROOT, 'pdf_previews')
META = os.path.join(ROOT, 'pdf_meta.json')
WIDTH = 720  # px; the landing page shows it at <= 360 CSS px, so this is 2x


def sha256(path):
    h = hashlib.sha256()
    with open(path, 'rb') as f:
        for chunk in iter(lambda: f.read(1 << 20), b''):
            h.update(chunk)
    return h.hexdigest()


def main():
    with open(os.path.join(ROOT, 'pdf_list.json'), encoding='utf-8') as f:
        pdfs = json.load(f)
    os.makedirs(OUT_DIR, exist_ok=True)
    meta = {}
    if os.path.exists(META):
        with open(META, encoding='utf-8') as f:
            meta = json.load(f)

    done = kept = 0
    for p in pdfs:
        name = p['filename']
        slug = name[:-4] if name.lower().endswith('.pdf') else name
        src = os.path.join(PDF_DIR, name)
        if not os.path.exists(src):
            print(f'!! missing pdf/{name}', file=sys.stderr)
            continue
        digest = sha256(src)
        # JPEG, not WebP: PyMuPDF's Pixmap.save() cannot write WebP, and a
        # first-page render of a text document compresses well enough as JPEG.
        out = os.path.join(OUT_DIR, f'{slug}.jpg')
        if meta.get(name, {}).get('sha256') == digest and os.path.exists(out):
            kept += 1
            continue
        try:
            doc = fitz.open(src)
            page = doc[0]
        except Exception as e:  # a corrupt file must not abort the batch
            print(f'!! cannot render pdf/{name}: {e}', file=sys.stderr)
            continue
        zoom = WIDTH / page.rect.width
        pix = page.get_pixmap(matrix=fitz.Matrix(zoom, zoom), alpha=False)
        pix.save(out, jpg_quality=80)
        meta[name] = {
            'slug': slug,
            'pages': len(doc),
            'bytes': os.path.getsize(src),
            'sha256': digest,
            'preview': f'{slug}.jpg',
            'previewWidth': pix.width,
            'previewHeight': pix.height,
        }
        doc.close()
        done += 1

    # Drop entries for PDFs no longer listed, so the file never claims a page
    # that does not exist.
    listed = {p['filename'] for p in pdfs}
    for stale in [k for k in meta if k not in listed]:
        del meta[stale]

    with open(META, 'w', encoding='utf-8') as f:
        json.dump(meta, f, ensure_ascii=False, indent=1, sort_keys=True)
        f.write('\n')
    print(f'rendered {done}, unchanged {kept} -> pdf_previews/ + pdf_meta.json ({len(meta)} entries)')


if __name__ == '__main__':
    main()
