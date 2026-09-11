#!/usr/bin/env python3
"""Build the fallback og:image used by posts that have no cover of their own.

A share card with no image collapses to a bare text link on Facebook, which is
most of the click difference. Only ~90 of the posts carry a rendered card, so
the rest need something.

Deliberately Latin-only text: Pillow draws Bengali without the shaping engine
that joins conjuncts, so "রুকইয়াহ" comes out visibly broken. The brand's Latin
name renders correctly and is what appears on the domain anyway.

    python tools/make_og_default.py
"""

import sys
from pathlib import Path

OUT = Path(__file__).resolve().parent.parent / 'blog_images' / 'og-default.jpg'
W, H = 1200, 630
BG = (8, 8, 8)
GREEN = (0, 229, 153)
DIM = (140, 140, 140)


def font(size, bold=False):
    from PIL import ImageFont
    for name in (('arialbd.ttf', 'segoeuib.ttf') if bold else ('arial.ttf', 'segoeui.ttf')):
        try:
            return ImageFont.truetype(name, size)
        except OSError:
            continue
    return ImageFont.load_default()


def main():
    try:
        from PIL import Image, ImageDraw
    except ImportError:
        sys.exit('Pillow missing — run: pip install pillow')

    im = Image.new('RGB', (W, H), BG)
    d = ImageDraw.Draw(im)

    # soft green wash in the top-left, mirroring the site's hero
    glow = Image.new('RGB', (W, H), BG)
    gd = ImageDraw.Draw(glow)
    for i in range(28, 0, -1):
        r = i * 26
        v = int(10 + (28 - i) * 1.1)
        gd.ellipse([-r // 2, -r // 2, r, r], fill=(0, min(v * 2, 60), min(v + 8, 44)))
    im = Image.blend(im, glow, 0.55)
    d = ImageDraw.Draw(im)

    d.rectangle([0, 0, W, 6], fill=GREEN)
    d.ellipse([84, 250, 108, 274], fill=GREEN)

    d.text((124, 244), 'AL QURANIC', font=font(46, True), fill=(242, 242, 242))
    d.text((124, 300), 'RUQYAH HEALING', font=font(46, True), fill=(242, 242, 242))
    d.text((124, 374), 'Quran & Sunnah based ruqyah — audio, guides and articles',
           font=font(24), fill=DIM)
    d.text((124, 500), 'alquranicruqyahhealing.com', font=font(24, True), fill=GREEN)

    OUT.parent.mkdir(exist_ok=True)
    im.save(OUT, 'JPEG', quality=88, optimize=True)
    print(f'wrote {OUT} ({OUT.stat().st_size // 1024}KB, {W}x{H})')
    return 0


if __name__ == '__main__':
    sys.exit(main())
