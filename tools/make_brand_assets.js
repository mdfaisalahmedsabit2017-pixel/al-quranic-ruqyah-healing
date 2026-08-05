// Generates the five brand PNGs in assets/ that @capacitor/assets consumes.
//
//     node tools/make_brand_assets.js
//     npx capacitor-assets generate --android
//
// WHY THIS IS A SCRIPT AND NOT FIVE HAND-DRAWN FILES
//
// The mark is one SVG path. It has to appear at five sizes with three different
// framings — full-bleed icon, adaptive foreground safe-area, splash — and the
// adaptive-icon rules are unforgiving: anything outside the centre 66% of
// icon-foreground.png is masked away on a round launcher, so a logo drawn to
// fill the square loses its edges on half the phones in the world. Deriving all
// five from one source is the only way those stay in step when the mark changes.
//
// The mark: a leaf, the same 🌿 the app already uses in its header, its
// onboarding and its notification icon. Solid green on near-black, no gradient
// and no interior detail — a launcher renders this at 48dp, and anything finer
// than a single silhouette turns to mush at that size.
//
// It replaces a placeholder that was, literally, the IEC power symbol: a green
// ring with a vertical bar through it. On a Qur'anic ruqyah app.

const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const GREEN = '#00E599';
const BG = '#080808';

// Material's "eco" leaf, authored on a 24x24 grid — the same path as the
// notification icon in android/.../drawable/ic_stat_icon.xml, so the mark in
// the status bar and the mark on the home screen are the same drawing.
const LEAF = 'M6.05,8.05c-2.73,2.73 -2.73,7.15 -0.02,9.88 1.47,-3.4 4.09,-6.24 '
           + '7.36,-7.93 -2.77,2.34 -4.71,5.61 -5.39,9.32 2.6,1.23 5.8,0.78 '
           + '7.95,-1.37C19.43,14.47 20,4 20,4S9.53,4.57 6.05,8.05z';

// The path does not fill its own 24x24 artboard, and it is not symmetric within
// it — the leaf sits low and to the right. Centring the artboard therefore does
// NOT centre the leaf, which on a launcher grid is instantly visible as a logo
// nudged off its tile. So the mark is rendered alone on transparency, trimmed
// to its true ink bounds, and only then placed. Measured rather than
// hand-tuned: a nudge that looks right at 1024 is wrong at 2732.
async function markBuffer(px) {
    const art = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 24 24">
  <path d="${LEAF}" fill="${GREEN}"/>
</svg>`;
    return sharp(Buffer.from(art), { density: 384 })
        .trim()                                   // tight crop to the ink
        .resize(px, px, { fit: 'contain', background: { r: 0, g: 0, b: 0, alpha: 0 } })
        .png()
        .toBuffer();
}

// `scale` is the fraction of the canvas the mark's longest side should occupy.
// A framing change is one number.
async function render(size, scale, background) {
    const canvas = sharp({
        create: {
            width: size, height: size, channels: 4,
            background: background || { r: 0, g: 0, b: 0, alpha: 0 },
        },
    });
    if (scale <= 0) return canvas.png({ compressionLevel: 9 }).toBuffer();

    const px = Math.round(size * scale);
    const mark = await markBuffer(px);
    // gravity:'centre' places the trimmed mark on the exact canvas centre,
    // which is the whole point of trimming it first.
    return canvas
        .composite([{ input: mark, gravity: 'centre' }])
        .png({ compressionLevel: 9 })
        .toBuffer();
}

const out = path.join(__dirname, '..', 'assets');
fs.mkdirSync(out, { recursive: true });

const jobs = [
    // The square icon, used wherever there is no adaptive mask — including the
    // 512x512 the Play Console asks for. 0.62 leaves the optical margin a
    // launcher grid expects; filling the square reads as cramped next to
    // every other icon on the screen.
    ['icon-only.png', 1024, 0.62, BG],

    // Adaptive foreground. The mark must sit inside the centre 66% or a round
    // or squircle mask will clip it, so it is drawn smaller still and on
    // transparency — the background layer below supplies the colour.
    ['icon-foreground.png', 1024, 0.42, null],

    // Adaptive background: flat colour, nothing else. Any detail here shows
    // through the mask differently on every launcher.
    ['icon-background.png', 1024, 0, BG],

    // Splash. Small on purpose: @capacitor/assets center-crops this to fill
    // screens from 1:2 to 4:3, and a mark drawn large enough to look right on a
    // tall phone is cropped through on a tablet.
    ['splash.png', 2732, 0.16, BG],
    ['splash-dark.png', 2732, 0.16, BG],
];

// The Play listing's feature graphic: 1024x500, and Play rejects it outright if
// it carries an alpha channel — hence channels: 3 and a solid background.
//
// Deliberately quiet. It sits directly above the screenshots, and a busy banner
// competes with the thing it is meant to introduce. Mark, name, one line of
// what the app is.
//
// Latin only. The Bengali face this brand uses (Hind Siliguri) ships as woff2
// in fonts/, which the SVG renderer here cannot load; setting Bengali text
// without it would silently substitute some other face, and wrong Bengali
// letterforms on a store banner are worse than no Bengali at all.
async function featureGraphic() {
    const W = 1024, H = 500;
    const MARK = 200;
    const left = Math.round(W * 0.09);
    const textX = left + MARK + 56;

    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}">
  <text x="${textX}" y="${H / 2 - 8}" font-family="Segoe UI, Arial, sans-serif"
        font-size="82" font-weight="700" fill="#ffffff" letter-spacing="-1">Self Ruqyah</text>
  <text x="${textX + 3}" y="${H / 2 + 52}" font-family="Segoe UI, Arial, sans-serif"
        font-size="30" font-weight="400" fill="${GREEN}" letter-spacing="1.5">Ruqyah audio, guides and daily practice</text>
  <rect x="${textX + 3}" y="${H / 2 + 84}" width="112" height="3" fill="${GREEN}" opacity="0.55"/>
</svg>`;

    // flatten + removeAlpha, not just channels: 3 on the canvas. Compositing a
    // transparent layer puts the alpha channel back regardless of how the
    // canvas was created, and Play rejects a feature graphic that has one —
    // which is a rejection you collect after uploading everything else.
    return sharp({ create: { width: W, height: H, channels: 3, background: hex(BG) } })
        .composite([
            { input: await markBuffer(MARK), left, top: Math.round((H - MARK) / 2) },
            { input: Buffer.from(text), left: 0, top: 0 },
        ])
        .flatten({ background: hex(BG) })
        .removeAlpha()
        .png({ compressionLevel: 9 })
        .toBuffer();
}

const hex = (h) => ({
    r: parseInt(h.slice(1, 3), 16),
    g: parseInt(h.slice(3, 5), 16),
    b: parseInt(h.slice(5, 7), 16),
    alpha: 1,
});

(async () => {
    for (const [name, size, scale, bg] of jobs) {
        const buf = await render(size, scale, bg ? hex(bg) : null);
        fs.writeFileSync(path.join(out, name), buf);
        const kb = (buf.length / 1024).toFixed(1);
        console.log(`  ${name.padEnd(22)} ${size}x${size}  ${kb} KB`);
    }
    // Not consumed by @capacitor/assets — this one is uploaded to the Play
    // Console by hand, so it lives alongside the others rather than in a
    // separate folder nobody remembers to look in.
    const fg = await featureGraphic();
    fs.writeFileSync(path.join(out, 'feature-graphic.png'), fg);
    console.log(`  ${'feature-graphic.png'.padEnd(22)} 1024x500   ${(fg.length / 1024).toFixed(1)} KB`);

    console.log('\nassets/ written. Now run:  npx capacitor-assets generate --android');
    console.log('feature-graphic.png is for the Play listing — upload it by hand.');
})().catch((e) => { console.error(e); process.exit(1); });
