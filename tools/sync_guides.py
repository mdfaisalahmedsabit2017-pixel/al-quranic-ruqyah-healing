"""Copy the finished documents out of the ruqyah pdf maker engine into guides_src/.

The engine is the source of truth for content; this repository only publishes it.
Rather than hardcode a file list, this asks the engine's own content modules what
exists, so a document added there cannot be silently missed here.

Three families, filed differently by the engine and flattened here:

    topics_*.py            output/html/<slug>.html
    collections_alroqya    output/html/alroqya/<slug>.html
    articles_jundul        output/html/articles/<slug>.html

Flattening is safe because every slug is unique across all three — verified below
rather than assumed. The index.html each family emits is deliberately NOT copied:
/guides/ is the single index, built by tools/library.js.

Run this, then tools/watermark_pdfs.py, then `node build.js --target=web`.

    python tools/sync_guides.py
    python tools/sync_guides.py --engine "A:\\...\\ruqyah pdf maker"
"""

import argparse
import importlib
import shutil
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
DEST = REPO / "guides_src"
DEFAULT_ENGINE = Path(r"A:\claude code projects sabit\ruqyah pdf maker")


def load(engine):
    """Ask the engine which documents exist. Returns [(slug, html_path)]."""
    sys.path[:0] = [str(engine / "engine"), str(engine / "content")]
    html = engine / "output" / "html"
    docs = []

    for path in sorted((engine / "content").glob("topics_*.py")):
        mod = importlib.import_module(path.stem)
        for t in mod.TOPICS:
            docs.append((t["slug"], html / f"{t['slug']}.html"))

    ca = importlib.import_module("collections_alroqya")
    for c in ca.load():
        docs.append((c["slug"], html / "alroqya" / f"{c['slug']}.html"))

    aj = importlib.import_module("articles_jundul")
    for a in aj.ARTICLES:
        docs.append((a["slug"], html / "articles" / f"{a['slug']}.html"))

    return docs


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--engine", type=Path, default=DEFAULT_ENGINE)
    args = ap.parse_args()

    if not (args.engine / "content").is_dir():
        print(f"!! not an engine checkout: {args.engine}", file=sys.stderr)
        return 1

    docs = load(args.engine)

    # A duplicate slug would mean one document silently overwriting another once
    # the three source folders are flattened into one.
    seen = {}
    for slug, src in docs:
        if slug in seen:
            print(f"!! duplicate slug {slug!r}: {seen[slug]} and {src}", file=sys.stderr)
            return 1
        seen[slug] = src

    missing = [slug for slug, src in docs if not src.is_file()]
    if missing:
        print(f"!! {len(missing)} document(s) not rendered yet: {', '.join(missing)}",
              file=sys.stderr)
        print("   run the engine's build first (topics, --collections, --articles)",
              file=sys.stderr)
        return 1

    DEST.mkdir(parents=True, exist_ok=True)
    (DEST / "assets").mkdir(exist_ok=True)

    for slug, src in docs:
        shutil.copyfile(src, DEST / f"{slug}.html")

    fonts = args.engine / "output" / "html" / "assets" / "fonts.css"
    shutil.copyfile(fonts, DEST / "assets" / "fonts.css")

    # Anything here that the engine no longer knows about is a document that was
    # renamed or dropped upstream, and would otherwise linger on the website.
    stale = sorted({p.stem for p in DEST.glob("*.html")} - set(seen))
    for slug in stale:
        (DEST / f"{slug}.html").unlink()
        print(f"removed stale {slug}.html (engine no longer has it)")

    print(f"synced {len(docs)} documents + fonts.css -> {DEST}")
    if stale:
        print(f"!! {len(stale)} stale removed — also delete their PDFs from files/",
              file=sys.stderr)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
