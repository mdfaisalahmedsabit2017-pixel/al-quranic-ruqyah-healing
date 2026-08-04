"""Stamp the guide PDFs with an ownership watermark, into guides_src/files/.

The 70 documents under guides_src/ are given away free, but they are the centre's
own work and the plain files were being lifted. Two measures here:

1. A tiled diagonal watermark written into every page's *content stream* — not as
   a PDF annotation. Annotations are one click to delete in any viewer; content
   is not. Removing this means editing every page.
2. AES-256 encryption with an empty user password and a random owner password.
   The file still opens for anyone, but copy and modify are denied. Printing and
   accessibility (screen readers) stay allowed, because refusing those punishes
   the people the documents are for.

Neither is unbreakable — nothing published is — but together they mean a stolen
copy carries the centre's domain on every page and cannot be quietly re-edited.

The watermark is Latin script on purpose. PyMuPDF's text insertion does no
complex-script shaping, so Bengali matras and conjuncts (and Arabic joining)
would come out visibly mangled. The domain and the romanised name are the parts
that identify the source anyway.

DOCX is deliberately not handled: an editable source file cannot be watermarked
in any way that survives one save, so those are not published at all.

Usage (run after syncing new HTML, before `node build.js`):
    python tools/watermark_pdfs.py
    python tools/watermark_pdfs.py --engine "A:\\...\\ruqyah pdf maker\\output"
"""

import argparse
import secrets
import sys
from pathlib import Path

import fitz  # PyMuPDF

REPO = Path(__file__).resolve().parent.parent
GUIDES = REPO / "guides_src"
DEST = GUIDES / "files"
DEFAULT_ENGINE = Path(r"A:\claude code projects sabit\ruqyah pdf maker\output")

MARK = "alquranicruqyahhealing.com"
SIGN = "Raqi Faisal Ahmed Sabit"
FOOT = "\u00a9 Al Quran Ruqyah Healing Center  \u2022  " + SIGN + "  \u2022  " + MARK

ANGLE = 45
STEP_X, STEP_Y = 215, 155
SIZE = 14
# The cover page is a full-bleed dark green panel; the body pages are cream. A
# single colour cannot read on both, so the cover gets the light variant.
DARK = ((0.20, 0.20, 0.20), 0.13)
LIGHT = ((1.0, 1.0, 1.0), 0.16)


def stamp(page: fitz.Page, light: bool) -> None:
    colour, opacity = LIGHT if light else DARK
    rect = page.rect
    shape = page.new_shape()

    # Offset every other row so the grid does not form clean vertical corridors
    # that a cropping tool could slot between.
    row = 0
    y = -30.0
    while y < rect.height + STEP_Y:
        x = -70.0 + (STEP_X / 2 if row % 2 else 0)
        while x < rect.width + STEP_X:
            pivot = fitz.Point(x, y)
            shape.insert_text(
                pivot, MARK,
                fontname="hebo", fontsize=SIZE,
                color=colour, fill_opacity=opacity,
                morph=(pivot, fitz.Matrix(ANGLE)),
            )
            x += STEP_X
        y += STEP_Y
        row += 1

    # Attribution inside the bottom margin, upright and legible — the diagonal
    # tile is the deterrent, this is the credit.
    shape.insert_text(
        fitz.Point(30, rect.height - 11), FOOT,
        fontname="helv", fontsize=6.5,
        color=colour, fill_opacity=min(1.0, opacity * 4),
    )
    shape.commit(overlay=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", type=Path, default=DEFAULT_ENGINE,
                    help="the ruqyah pdf maker output/ directory")
    args = ap.parse_args()

    if not args.engine.is_dir():
        print(f"!! engine output not found: {args.engine}", file=sys.stderr)
        return 1

    slugs = sorted(p.stem for p in GUIDES.glob("*.html"))
    if not slugs:
        print("!! no guides_src/*.html — nothing to watermark", file=sys.stderr)
        return 1

    DEST.mkdir(parents=True, exist_ok=True)
    done = pages = 0
    missing = []

    for slug in slugs:
        src = (args.engine / "pdf" / "alroqya" / f"{slug}.pdf") if slug.startswith("ayat-") \
            else (args.engine / "pdf" / f"{slug}.pdf")
        if not src.is_file():
            missing.append(slug)
            continue

        doc = fitz.open(src)
        for n, page in enumerate(doc):
            stamp(page, light=(n == 0))
        pages += doc.page_count

        doc.set_metadata({
            "title": slug,
            "author": SIGN,
            "creator": "Al Quran Ruqyah Healing Center",
            "producer": MARK,
        })
        # Empty user password: opens for everyone. Random owner password nobody
        # keeps: the restrictions cannot be lifted by us either, which is fine —
        # the engine can always regenerate the source PDF.
        doc.save(
            DEST / f"{slug}.pdf",
            encryption=fitz.PDF_ENCRYPT_AES_256,
            owner_pw=secrets.token_urlsafe(24),
            user_pw="",
            permissions=fitz.PDF_PERM_PRINT | fitz.PDF_PERM_ACCESSIBILITY,
            garbage=3, deflate=True,
        )
        doc.close()
        done += 1

    for docx in DEST.glob("*.docx"):
        docx.unlink()
        print(f"removed {docx.name} (DOCX is not published)")

    size = sum(p.stat().st_size for p in DEST.glob("*.pdf")) / 1048576
    print(f"watermarked {done}/{len(slugs)} PDFs, {pages} pages, {size:.1f} MB -> {DEST}")
    if missing:
        print(f"!! no source PDF for: {', '.join(missing)}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
