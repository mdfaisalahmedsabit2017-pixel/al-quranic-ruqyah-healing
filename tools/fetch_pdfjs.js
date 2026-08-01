// Vendors pdf.js into vendor/pdfjs/.
//
// Why this exists at all: the PDF viewer used to be an <iframe src="...pdf">.
// Android System WebView has no PDF renderer, so inside the APK that iframe was
// always going to be a blank white rectangle — the 130 MB of guides bundled with
// the old build bought exactly zero working features.
//
// Version choice: 4.9.155 is the last 4.x. It ships ESM only (no UMD), which is
// fine because app.js loads it lazily with dynamic import() the first time a
// guide is opened — nothing is parsed at startup. Staying off 3.x also avoids
// CVE-2024-4367 (script execution from a crafted PDF), fixed in 4.2.67.
//
//   node tools/fetch_pdfjs.js

const fs = require('fs');
const path = require('path');
const https = require('https');
const { execSync } = require('child_process');
const os = require('os');

const VERSION = '4.9.155';
const BASE = `https://cdn.jsdelivr.net/npm/pdfjs-dist@${VERSION}`;
const OUT = path.join(__dirname, '..', 'vendor', 'pdfjs');

// The engine and its worker.
const FILES = [
    'legacy/build/pdf.min.mjs',
    'legacy/build/pdf.worker.min.mjs',
];

// Two support directories come from the npm tarball rather than one-by-one
// over CDN (169 + 16 files).
//
//   standard_fonts/ (804 KB) — the 14 base PDF fonts. A PDF that says "use
//     Helvetica" without embedding it needs these, which is common, so they
//     ship in BOTH builds.
//   cmaps/ (1.5 MB) — character maps for CID-keyed fonts, in practice CJK.
//     Rarely needed here, so build.js keeps them out of the APK and the app
//     points cMapUrl at the website instead.
function extractSupportDirs() {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pdfjs-'));
    try {
        execSync(`npm pack pdfjs-dist@${VERSION}`, { cwd: tmp, stdio: 'ignore' });
        const tgz = fs.readdirSync(tmp).find((f) => f.endsWith('.tgz'));
        execSync(`tar -xzf "${tgz}" package/cmaps package/standard_fonts`, { cwd: tmp, stdio: 'ignore' });
        for (const dir of ['cmaps', 'standard_fonts']) {
            const from = path.join(tmp, 'package', dir);
            const to = path.join(OUT, dir);
            fs.rmSync(to, { recursive: true, force: true });
            fs.cpSync(from, to, { recursive: true });
            const n = fs.readdirSync(to).length;
            const size = fs.readdirSync(to).reduce((s, f) => s + fs.statSync(path.join(to, f)).size, 0);
            console.log(`  ${dir}/  ${n} files, ${(size / 1024).toFixed(0)} KB`);
        }
    } finally {
        fs.rmSync(tmp, { recursive: true, force: true });
    }
}

function get(url) {
    return new Promise((resolve, reject) => {
        https.get(url, (res) => {
            if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
                return get(res.headers.location).then(resolve, reject);
            }
            if (res.statusCode !== 200) return reject(new Error(`${res.statusCode} for ${url}`));
            const chunks = [];
            res.on('data', (c) => chunks.push(c));
            res.on('end', () => resolve(Buffer.concat(chunks)));
        }).on('error', reject);
    });
}

(async () => {
    fs.mkdirSync(OUT, { recursive: true });
    let total = 0;
    for (const f of FILES) {
        const buf = await get(`${BASE}/${f}`);
        const name = path.basename(f);
        fs.writeFileSync(path.join(OUT, name), buf);
        total += buf.length;
        console.log(`  ${name}  ${(buf.length / 1024).toFixed(0)} KB`);
    }
    extractSupportDirs();
    fs.writeFileSync(path.join(OUT, 'VERSION'), VERSION + '\n');
    console.log(`\npdfjs-dist ${VERSION} -> vendor/pdfjs/  (engine ${(total / 1024).toFixed(0)} KB + support dirs)`);
})().catch((e) => { console.error('failed:', e.message); process.exit(1); });
