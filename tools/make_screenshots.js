// Captures the Play Store phone screenshots from the real app.
//
//     npm run screenshots
//
// Play wants 2–8 phone screenshots, at least 1080x1920. Those are usually taken
// by hand on a device; this drives the actual native/ build in headless Chrome
// at exactly 1080x1920 instead, which means:
//
//   - they can be regenerated after any UI change, in seconds, instead of
//     being a stale set nobody wants to redo
//   - the state in them is chosen rather than whatever happened to be on the
//     phone: a streak with real numbers, a track playing, a guide open
//
// It is the native build, so nothing with a price or a buy button can appear —
// the same guarantee tools/audit-native.js enforces for the APK.
//
// Chrome must be installed; puppeteer-core drives it rather than downloading a
// second copy. The app is served over HTTP because it registers a service
// worker and reads localStorage, neither of which works from file://.

const fs = require('fs');
const http = require('http');
const path = require('path');
const puppeteer = require('puppeteer-core');
const sharp = require('sharp');

const ROOT = path.join(__dirname, '..');
const DIR = path.join(ROOT, 'native');
const OUT = path.join(ROOT, 'assets', 'screenshots');
const PORT = 8477;
const W = 1080, H = 1920;
const GREEN = '#00E599';
const BG = '#080808';

const CHROME = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
].find((p) => p && fs.existsSync(p));

const MIME = {
    '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json',
    '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg',
    '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.wasm': 'application/wasm',
};

function serve() {
    return new Promise((resolve) => {
        const server = http.createServer((req, res) => {
            const rel = decodeURIComponent(req.url.split('?')[0]).replace(/^\/+/, '') || 'index.html';
            const file = path.join(DIR, rel);
            if (!file.startsWith(DIR) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
                res.writeHead(404).end('not found');
                return;
            }
            res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
            fs.createReadStream(file).pipe(res);
        });
        server.listen(PORT, '127.0.0.1', () => resolve(server));
    });
}

// The captions Play shows above each frame. Short: they are read at thumbnail
// size in a horizontally scrolling strip, not studied.
const SHOTS = [
    { name: '1-home',    caption: 'আজকের রুকইয়াহ ও আমল',      go: async (p) => sect(p, 'home') },
    // Several tabs open on chrome — category chips, a book card, a segmented
    // control — and the thing the caption promises is below it. Each of these
    // scrolls to its own subject, or the screenshot advertises a filter bar.
    { name: '2-audio',   caption: '২৭৮টি রুকইয়াহ অডিও',        scrollTo: '#audio-container .audio-card',
      go: async (p) => sect(p, 'library') },
    { name: '3-player',  caption: 'শুনুন, প্রিয় তালিকায় রাখুন', go: async (p) => {
        await sect(p, 'library');
        // Read the code off a rendered card. audioData is a top-level `let`,
        // which — unlike a top-level `function` — never becomes a window
        // property, so it cannot be reached from an injected script.
        await p.evaluate(() => {
            const el = document.querySelector('#audio-container .fav-btn[data-code]');
            if (el) window.openPlayer(el.dataset.code);
        });
    } },
    { name: '4-guides',  caption: '৯৬টি লিখিত গাইড',            scrollTo: '.seg',
      go: async (p) => {
        await sect(p, 'pdf');
        await p.evaluate(() => window.showLibraryTab('guides'));
        await wait(600);                        // the list is fetched
    } },
    { name: '5-pdf',     caption: '৮২টি পিডিএফ, অ্যাপেই পড়ুন',  scrollTo: '#pdf-container > *',
      go: async (p) => {
        await sect(p, 'pdf');
        await p.evaluate(() => window.showLibraryTab('pdf'));
    } },
    { name: '6-practice', caption: 'দৈনিক আমলের রুটিন',          go: async (p) => sect(p, 'practice') },
];

const sect = (p, s) => p.evaluate((x) => window.showSection(x), s);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

// A caption above the screen, in the app's own colours. Play shows these at
// roughly thumbnail size first, so the type is large and nothing competes
// with it.
//
// The screen is scaled to FIT the space left over, never cropped. The first
// version reserved 300px for the caption and then cropped the overflow, which
// cut the bottom navigation off every shot — the one element that shows the app
// is four tabs and not a web page.
async function frame(shot, caption) {
    const BAR = 232;
    const GAP = 36;                          // breathing room under the screen
    const innerH = H - BAR - GAP;
    const innerW = Math.round(innerH * (W / H));   // the shot is already 9:16
    const left = Math.round((W - innerW) / 2);

    // Rounded corners, so it reads as a phone screen rather than as a pasted
    // rectangle. Applied as an alpha mask over the resized shot.
    const r = 28;
    const mask = Buffer.from(
        `<svg xmlns="http://www.w3.org/2000/svg" width="${innerW}" height="${innerH}">
           <rect width="${innerW}" height="${innerH}" rx="${r}" ry="${r}" fill="#fff"/>
         </svg>`);
    const inner = await sharp(shot)
        .resize(innerW, innerH)
        .composite([{ input: mask, blend: 'dest-in' }])
        .png()
        .toBuffer();

    const text = `<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${BAR}">
  <text x="${W / 2}" y="${BAR / 2 + 26}" text-anchor="middle"
        font-family="Nirmala UI, Segoe UI, Arial, sans-serif" font-size="58"
        font-weight="700" fill="#ffffff">${caption}</text>
  <rect x="${W / 2 - 46}" y="${BAR - 62}" width="92" height="5" rx="2.5" fill="${GREEN}" opacity="0.7"/>
</svg>`;

    return sharp({ create: { width: W, height: H, channels: 3, background: hex(BG) } })
        .composite([
            { input: Buffer.from(text), top: 0, left: 0 },
            { input: inner, top: BAR, left },
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
});

(async () => {
    if (!CHROME) {
        console.error('❌ No Chrome or Edge found. Install Chrome, or edit CHROME in this file.');
        process.exit(1);
    }
    if (!fs.existsSync(path.join(DIR, 'index.html'))) {
        console.error('❌ native/ is not built. Run `npm run build:native` first.');
        process.exit(1);
    }
    fs.mkdirSync(OUT, { recursive: true });

    const server = await serve();
    const browser = await puppeteer.launch({
        executablePath: CHROME,
        headless: 'new',
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--font-render-hinting=none'],
    });

    try {
        const page = await browser.newPage();
        // CSS pixels, not output pixels. Setting the viewport to 1080 wide put
        // the app past its own 1024px breakpoint and every shot came out with
        // the desktop sidebar instead of the bottom tab bar. 360x640 at 3x is a
        // real phone viewport and still renders at exactly 1080x1920.
        await page.setViewport({
            width: W / 3, height: H / 3, deviceScaleFactor: 3,
            isMobile: true, hasTouch: true,
        });

        // Seeded before the app runs, so the shots show an app in use rather
        // than one opened for the first time — an empty streak and a blank
        // "continue listening" row are the worst possible advertisement.
        //
        // The shapes have to match what app.js actually parses. Guessing them
        // produced "0/undefined" and "NaN টি বাকি" on the first run, printed
        // large in the middle of the home screenshot.
        await page.evaluateOnNewDocument(() => {
            const d = new Date();
            const dow = d.getDay();
            const mon = new Date(d);
            mon.setDate(d.getDate() + (dow === 0 ? -6 : 1 - dow));
            const weekStart = `${mon.getFullYear()}-${String(mon.getMonth() + 1).padStart(2, '0')}-${String(mon.getDate()).padStart(2, '0')}`;

            localStorage.setItem('onboarded', '1');
            localStorage.setItem('streakData', JSON.stringify({
                streak: 12, longest: 21, lastDate: d.toDateString(),
            }));
            localStorage.setItem('goalData', JSON.stringify({
                goal: 7, weekStart, playsThisWeek: 5,
            }));
        });

        await page.goto(`http://127.0.0.1:${PORT}/index.html`, { waitUntil: 'networkidle2', timeout: 60000 });
        await page.waitForFunction(
            () => document.querySelectorAll('#audio-container .audio-card').length > 0,
            { timeout: 30000 });
        // Recently-played needs tracks that have been opened; seeding it before
        // load would name codes the catalogue may not have.
        await page.evaluate(() => {
            const codes = [...document.querySelectorAll('#audio-container .fav-btn[data-code]')]
                .slice(0, 4).map((el) => el.dataset.code);
            localStorage.setItem('recentlyPlayed', JSON.stringify(codes));
        });
        await page.reload({ waitUntil: 'networkidle2' });
        await page.waitForFunction(
            () => document.querySelectorAll('#audio-container .audio-card').length > 0,
            { timeout: 30000 });

        for (const shot of SHOTS) {
            await shot.go(page);
            await wait(900);                        // let the enter animation finish
            if (shot.scrollTo) {
                await page.evaluate((sel) => {
                    const el = document.querySelector(sel);
                    if (el) el.scrollIntoView({ block: 'start' });
                    window.scrollBy(0, -110);       // keep the header in frame
                }, shot.scrollTo);
                await wait(250);
            }
            const raw = await page.screenshot({ type: 'png' });
            const out = path.join(OUT, `${shot.name}.png`);
            fs.writeFileSync(out, await frame(raw, shot.caption));
            console.log(`  ${shot.name.padEnd(12)} ${shot.caption}`);
            // Overlays stay open across iterations otherwise, and the player
            // covers everything after shot 3.
            await page.evaluate(() => {
                document.querySelectorAll('.modal:not(.hidden), .modal-overlay:not(.hidden)')
                    .forEach((el) => el.classList.add('hidden'));
                document.body.classList.remove('player-mini');
                document.body.style.overflow = 'auto';
                window.scrollTo(0, 0);          // a scrolled shot must not leak into the next
            });
        }
        console.log(`\n${SHOTS.length} screenshots -> assets/screenshots/  (${W}x${H})`);
    } finally {
        await browser.close();
        server.close();
    }
})().catch((e) => { console.error(e); process.exit(1); });
