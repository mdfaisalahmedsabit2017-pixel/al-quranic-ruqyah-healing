// Generates PLACEHOLDER launcher/PWA icons so the app has local, offline-safe
// artwork instead of hotlinking icons8. These are deliberately plain — a dark
// tile with the brand green — and must be replaced with real art before the
// Play Store release. See assets/README.md for the files to supply.
//
//   node tools/make_placeholder_icons.js
//
// Written with only Node built-ins (zlib) so the repo stays dependency-free.

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const BG = [0x08, 0x08, 0x08];      // --bg
const FG = [0x00, 0xe5, 0x99];      // --green

const CRC_TABLE = (() => {
    const t = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        t[n] = c;
    }
    return t;
})();

function crc32(buf) {
    let c = -1;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
    return (c ^ -1) >>> 0;
}

function chunk(type, data) {
    const len = Buffer.alloc(4);
    len.writeUInt32BE(data.length);
    const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(body));
    return Buffer.concat([len, body, crc]);
}

// `paint(x, y, size)` returns [r,g,b] for each pixel.
function png(size, paint) {
    const raw = Buffer.alloc(size * (size * 3 + 1));
    let p = 0;
    for (let y = 0; y < size; y++) {
        raw[p++] = 0;                       // filter: none
        for (let x = 0; x < size; x++) {
            const [r, g, b] = paint(x, y, size);
            raw[p++] = r; raw[p++] = g; raw[p++] = b;
        }
    }
    const ihdr = Buffer.alloc(13);
    ihdr.writeUInt32BE(size, 0);
    ihdr.writeUInt32BE(size, 4);
    ihdr[8] = 8;    // bit depth
    ihdr[9] = 2;    // colour type: truecolour
    return Buffer.concat([
        Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
        chunk('IHDR', ihdr),
        chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
        chunk('IEND', Buffer.alloc(0)),
    ]);
}

// A ring with a book-spine bar through it — abstract enough to read at 48px,
// and obviously provisional at 512.
function mark(inset) {
    return (x, y, size) => {
        const c = size / 2;
        const dx = x - c, dy = y - c;
        const d = Math.sqrt(dx * dx + dy * dy);
        const scale = size * inset;
        const ringOuter = scale * 0.78, ringInner = scale * 0.60;
        const barHalfW = scale * 0.085, barHalfH = scale * 0.52;
        const inRing = d <= ringOuter && d >= ringInner;
        const inBar = Math.abs(dx) <= barHalfW && Math.abs(dy) <= barHalfH;
        return inRing || inBar ? FG : BG;
    };
}

const solid = () => BG;

const outDir = path.join(__dirname, '..', 'icons');
const assetsDir = path.join(__dirname, '..', 'assets');
fs.mkdirSync(outDir, { recursive: true });
fs.mkdirSync(assetsDir, { recursive: true });

const jobs = [
    // PWA / manifest
    [path.join(outDir, 'icon-192.png'), 192, mark(0.5)],
    [path.join(outDir, 'icon-512.png'), 512, mark(0.5)],
    // Maskable needs the art inside the safe zone, so it sits smaller.
    [path.join(outDir, 'icon-maskable-512.png'), 512, mark(0.33)],
    // @capacitor/assets sources
    [path.join(assetsDir, 'icon-only.png'), 1024, mark(0.5)],
    [path.join(assetsDir, 'icon-foreground.png'), 1024, mark(0.33)],
    [path.join(assetsDir, 'icon-background.png'), 1024, solid],
    [path.join(assetsDir, 'splash.png'), 2732, mark(0.12)],
    [path.join(assetsDir, 'splash-dark.png'), 2732, mark(0.12)],
];

for (const [file, size, paint] of jobs) {
    fs.writeFileSync(file, png(size, paint));
    console.log(`wrote ${path.relative(path.join(__dirname, '..'), file)} (${size}x${size})`);
}
console.log('\n⚠️  These are PLACEHOLDERS. Replace them with real brand art before release.');
