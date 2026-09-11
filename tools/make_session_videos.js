// লাইভ সেশনের অডিও রেকর্ডিং → ইউটিউবে তোলার মতো mp4 (স্থির কভার + অডিও)।
//
//     node tools/make_session_videos.js              # সবগুলো
//     node tools/make_session_videos.js --only 3     # শুধু n=3
//     node tools/make_session_videos.js --cover-only # শুধু কভারগুলো দেখে নেওয়া
//
// কেন এটা লাগে: আগস্ট ব্যাচের প্রথম ছয়টা সেশনের রেকর্ডিং কখনো ইউটিউবে ওঠেনি —
// টেলিগ্রামে m4a হিসেবে পড়ে ছিল, আর ৳৪৯০-এর কার্ড "প্রতিটি সেশনের রেকর্ডেড
// ভিডিও" প্রতিশ্রুতি দিচ্ছিল। অডিওকে ভিডিও বানিয়ে unlisted আপলোড করলে কোর্সের
// বিদ্যমান প্লেয়ারই (createCourseYTPlayer) অপরিবর্তিতভাবে কাজ করে — অগ্রগতির
// টিক, "কোথায় থেমেছিলেন", সব। অডিও-অনলি শাখা বানালে api/course.js, app.js আর
// check_course_data.js তিন জায়গাতেই নতুন কোড লাগত।
//
// আউটপুট রিপোর **বাইরে** যায় (A:\course-uploads\) — course_data/ ও
// course_notes/ নিয়ে .gitignore/.vercelignore এর যে সূক্ষ্ম নিয়মগুলো আছে, শত
// শত মেগাবাইটের mp4 তার ধারেকাছে না থাকাই নিরাপদ।
//
// কভার headless Chrome এ আঁকা হয়, Pillow/ImageMagick এ নয় — বাংলা যুক্তাক্ষর
// শেপিং লাগে, আর ভাঙা যুক্তাক্ষর কোনো স্ক্রিপ্ট ধরে না। make_course_notes.js
// এ একই সিদ্ধান্ত, একই কারণে।

const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const OUT_DIR = process.env.SESSION_VIDEO_OUT || 'A:\\course-uploads';

const REC = 'F:\\disk b\\OneDrive - 浮光浅夏\\Documents\\Sound Recordings';
const ZOOM = 'F:\\disk b\\OneDrive - 浮光浅夏\\Documents\\Zoom';

// ── কোন সেশনে কোন ফাইল ─────────────────────────────────────────────────────
//
// n গুলো catalog.json এর সাথে মেলানো, আর সেখানে n = তারিখের ক্রম: 0 = ৩১ জুলাই
// ওরিয়েন্টেশন, 6 = ৭ আগস্ট সন্ধ্যা, 9 = ১১ আগস্ট, 10 = ১৩ আগস্ট, 11 = ১৪ আগস্ট।
// ফাঁকগুলো (1–5) ঠিক এই সেশনগুলোর জায়গা, তাই কোনো বিদ্যমান n বদলাতে হচ্ছে না —
// কারও অগ্রগতি বা রিভিউ target (course-live-cN) নষ্ট হচ্ছে না।
//
// parts এর ক্রম তারিখ-সময় ধরে, টেলিগ্রামে যে ক্রমে পোস্ট হয়েছিল সেটা ধরে নয়:
// ৫ আগস্টের সেশনে Recording (14) আগে ও (15) পরে, অথচ টেলিগ্রামে উল্টো গিয়েছিল।
// স্ক্রিপ্ট প্রতিটা ফাইলের mtime ও দৈর্ঘ্য দিয়ে ক্রমটা যাচাই করে, না মিললে থামে।
const SESSIONS = [
    {
        n: 1, date: '১ আগস্ট ২০২৬',
        title: 'সেশন ১',
        parts: [
            path.join(ZOOM, "2026-08-01 21.27.16 FAISAL AHMED SABIT's Zoom Meeting", 'Day 1 part 1.m4a'),
            path.join(ZOOM, "2026-08-01 22.04.32 FAISAL AHMED SABIT's Zoom Meeting", 'Day 1 part 2 .m4a'),
        ],
    },
    {
        n: 2, date: '২ আগস্ট ২০২৬',
        title: 'সেশন ২',
        parts: [path.join(REC, 'Recording (10).m4a'), path.join(REC, 'Recording (11).m4a')],
    },
    {
        n: 3, date: '৪ আগস্ট ২০২৬',
        title: 'সেশন ৩',
        parts: [path.join(REC, 'Recording (12).m4a'), path.join(REC, 'Recording (13).m4a')],
    },
    {
        n: 4, date: '৫ আগস্ট ২০২৬',
        title: 'সেশন ৪',
        parts: [path.join(REC, 'Recording (14).m4a'), path.join(REC, 'Recording (15).m4a')],
    },
    {
        n: 5, date: '৬ আগস্ট ২০২৬',
        title: 'সেশন ৫',
        parts: [path.join(REC, 'Recording (16).m4a')],
    },
    {
        // catalog.json এ এই সারিটা আগে থেকেই আছে, নোটসহ — শুধু ভিডিওটা নেই।
        n: 6, date: '৭ আগস্ট ২০২৬',
        title: 'পড়ালেখার রুকইয়াহ ও মাথা-সংক্রান্ত রুকইয়াহ',
        parts: [
            path.join(REC, 'Recording (17).m4a'),
            path.join(REC, 'Recording (18).m4a'),
            path.join(REC, 'Recording (19).m4a'),
        ],
    },
];

// ── ffmpeg খোঁজা ────────────────────────────────────────────────────────────
//
// PATH এ ffmpeg নেই। মেশিনে যেটা আছে সেটা একটা তৃতীয় পক্ষের অ্যাপের ইনস্টল
// ফোল্ডারের ভেতরে (gyan.dev এর পূর্ণ 7.1.1 বিল্ড, libx264 + aac সহ) — অ্যাপ
// আপডেট হলে উধাও হতে পারে। তাই env দিয়ে ওভাররাইড করা যায়, আর না পেলে অনুমান
// না করে পরিষ্কার বার্তা দিয়ে থামে।
function findTool(name) {
    const env = process.env[name.toUpperCase()];
    const candidates = [
        env,
        path.join(process.env.APPDATA || '', 'UdvashUnmeshDesktopApp', `${name}.exe`),
        `C:\\ffmpeg\\bin\\${name}.exe`,
        `/usr/bin/${name}`,
    ].filter(Boolean);
    const found = candidates.find((p) => { try { return fs.existsSync(p); } catch (e) { return false; } });
    if (found) return found;
    try {
        execFileSync(name, ['-version'], { stdio: 'ignore' });
        return name;                       // PATH এ আছে
    } catch (e) { /* নেই */ }
    return null;
}

const FFMPEG = findTool('ffmpeg');
const FFPROBE = findTool('ffprobe');

const CHROME = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    (process.env.LOCALAPPDATA || '') + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p));

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? null : process.argv[i + 1];
}
const has = (name) => process.argv.includes(`--${name}`);

function run(bin, args) {
    return execFileSync(bin, args, { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });
}

function probe(file) {
    const out = run(FFPROBE, [
        '-v', 'error',
        '-select_streams', 'a:0',
        '-show_entries', 'format=duration:stream=codec_name,sample_rate,channels',
        '-of', 'json', '--', file,
    ]);
    const j = JSON.parse(out);
    const s = (j.streams && j.streams[0]) || {};
    return {
        duration: parseFloat(j.format.duration),
        codec: s.codec_name,
        rate: String(s.sample_rate),
        channels: s.channels,
    };
}

const BN = '০১২৩৪৫৬৭৮৯';
const toBn = (x) => String(x).replace(/\d/g, (d) => BN[+d]);

function hhmm(sec) {
    const m = Math.round(sec / 60);
    return `${toBn(Math.floor(m / 60))}ঘ ${toBn(String(m % 60).padStart(2, '0'))}মি`;
}

// ── কভার ────────────────────────────────────────────────────────────────────
//
// ফন্ট সাইটের নিজের fonts/fonts.css থেকে — Hind Siliguri, ঠিক যেটা অ্যাপে
// ব্যবহার হয়। লোগো icon-only.png, base64 এ বসানো যাতে file:// এর আপেক্ষিক পথ
// নিয়ে কোনো প্রশ্ন না থাকে।
function coverHtml(s, totalSec) {
    const fontsCss = 'file:///' + path.join(ROOT, 'fonts', 'fonts.css').replace(/\\/g, '/');
    const logo = fs.readFileSync(path.join(ROOT, 'assets', 'icon-only.png')).toString('base64');
    const esc = (t) => String(t).replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
    return `<!doctype html><html lang="bn"><head><meta charset="utf-8">
<link rel="stylesheet" href="${fontsCss}">
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  html,body{width:1920px;height:1080px;overflow:hidden}
  body{
    background:radial-gradient(1200px 800px at 50% 22%, #10241d 0%, #080808 62%);
    color:#f2f5f4;font-family:'Hind Siliguri',sans-serif;
    display:flex;flex-direction:column;align-items:center;justify-content:center;
    text-align:center;padding:0 150px;position:relative;
  }
  .glow{position:absolute;inset:auto 0 -340px 0;height:700px;
        background:radial-gradient(closest-side, rgba(0,229,153,.13), transparent 70%)}
  /* icon-only.png একটা ভরাট চৌকো — গ্রেডিয়েন্টের ওপর কাঁচা লাগে, তাই
     লঞ্চারের মতোই কোণ গোল আর একটা হালকা রিং। */
  img.logo{width:132px;height:132px;opacity:.95;margin-bottom:34px;
           border-radius:30px;box-shadow:0 0 0 2px rgba(0,229,153,.22)}
  .kicker{font-size:34px;letter-spacing:.14em;color:#00E599;font-weight:600;margin-bottom:26px}
  h1{font-size:96px;line-height:1.3;font-weight:700;max-width:1500px}
  .rule{width:190px;height:5px;background:#00E599;border-radius:4px;margin:46px 0 38px;opacity:.9}
  .meta{font-size:40px;color:#9fb3ac;font-weight:400;display:flex;gap:34px;align-items:center}
  .dot{width:9px;height:9px;border-radius:50%;background:#3d5850}
  .foot{position:absolute;bottom:64px;font-size:30px;color:#6d827b;letter-spacing:.03em}
</style></head><body>
  <div class="glow"></div>
  <img class="logo" src="data:image/png;base64,${logo}" alt="">
  <div class="kicker">মাসিক লাইভ রুকইয়াহ কোর্স</div>
  <h1>${esc(s.title)}</h1>
  <div class="rule"></div>
  <div class="meta"><span>${esc(s.date)}</span><span class="dot"></span><span>${hhmm(totalSec)}</span></div>
  <div class="foot">আল কুরআন রুকইয়াহ হিলিং সেন্টার · শুধুমাত্র সদস্যদের জন্য</div>
</body></html>`;
}

async function renderCover(browser, s, totalSec, outFile) {
    const tmp = path.join(os.tmpdir(), `cover-${s.n}-${process.pid}.html`);
    fs.writeFileSync(tmp, coverHtml(s, totalSec), 'utf8');
    const page = await browser.newPage();
    await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
    await page.goto('file:///' + tmp.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);
    // শিরোনামটা সত্যিই বসেছে কি না — খালি কভার ছাপা হয়ে গেলে ধরা পড়ে না।
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());
    await page.screenshot({ path: outFile, type: 'png' });
    await page.close();
    fs.unlinkSync(tmp);
    return text;
}

// ── অডিও জোড়া ──────────────────────────────────────────────────────────────
// দুটোই AAC হলে concat demuxer + -c copy — রি-এনকোড নেই, তাই কোনো ক্ষতি নেই।
// sample rate বা চ্যানেল না মিললে সেটা নীরবে জোড়া দেওয়া বিপজ্জনক, তাই তখন
// একবারে aac 128k এ রি-এনকোড।
function mergeAudio(parts, infos, tmpDir, n) {
    if (parts.length === 1) return parts[0];
    const same = infos.every((i) => i.codec === infos[0].codec
        && i.rate === infos[0].rate && i.channels === infos[0].channels);
    const listFile = path.join(tmpDir, `list-${n}.txt`);
    const body = parts
        .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
        .join('\n');
    fs.writeFileSync(listFile, body + '\n', 'utf8');

    const out = path.join(tmpDir, `merged-${n}.m4a`);
    const codecArgs = same
        ? ['-c', 'copy']
        : ['-c:a', 'aac', '-b:a', '128k', '-ar', '48000'];
    if (!same) console.log('   ⚠ অংশগুলোর ফরম্যাট এক নয় — রি-এনকোড করে জোড়া দেওয়া হচ্ছে');
    run(FFMPEG, ['-y', '-v', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
        ...codecArgs, out]);
    return out;
}

// ── মূল ─────────────────────────────────────────────────────────────────────
(async () => {
    if (!FFMPEG || !FFPROBE) {
        console.error('ffmpeg/ffprobe পাওয়া গেল না।');
        console.error('পথটা env দিয়ে দিন, যেমন:');
        console.error('  $env:FFMPEG="C:\\path\\ffmpeg.exe"; $env:FFPROBE="C:\\path\\ffprobe.exe"');
        process.exit(1);
    }
    if (!CHROME) {
        console.error('Chrome/Edge পাওয়া গেল না — কভার আঁকা যাবে না।');
        process.exit(1);
    }

    const only = arg('only');
    const list = only ? SESSIONS.filter((s) => String(s.n) === String(only)) : SESSIONS;
    if (!list.length) { console.error(`--only ${only} — এমন কোনো সেশন নেই`); process.exit(1); }

    fs.mkdirSync(OUT_DIR, { recursive: true });
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sessvid-'));
    const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new' });

    const problems = [];
    const done = [];

    for (const s of list) {
        console.log(`\n▶ সেশন ${toBn(s.n)} — ${s.title}`);

        const missing = s.parts.filter((p) => !fs.existsSync(p));
        if (missing.length) {
            problems.push(`n=${s.n}: উৎস ফাইল নেই — ${missing.join(', ')}`);
            console.log('   ✗ উৎস ফাইল নেই, বাদ');
            continue;
        }

        const infos = s.parts.map(probe);
        const stats = s.parts.map((p) => fs.statSync(p));
        const totalSec = infos.reduce((a, i) => a + i.duration, 0);
        s.parts.forEach((p, i) => {
            console.log(`   · ${path.basename(p)} — ${Math.round(infos[i].duration)}s`
                + ` ${infos[i].codec}/${infos[i].rate}/${infos[i].channels}ch`);
        });

        // ক্রম যাচাই: প্রতিটা অংশের *শুরুর* সময় = mtime − দৈর্ঘ্য। কনফিগের ক্রম
        // ওই হিসাবের সাথে না মিললে থেমে যাওয়াই ভালো — উল্টো জোড়া লাগা সেশন
        // ছাত্রের কানে ধরা পড়ে, স্ক্রিপ্টে নয়।
        const starts = stats.map((st, i) => st.mtimeMs - infos[i].duration * 1000);
        for (let i = 1; i < starts.length; i++) {
            if (starts[i] < starts[i - 1]) {
                problems.push(`n=${s.n}: অংশের ক্রম উল্টো মনে হচ্ছে`
                    + ` — ${path.basename(s.parts[i])} শুরু হয়েছে`
                    + ` ${path.basename(s.parts[i - 1])} এর আগে`);
            }
        }

        const coverFile = path.join(OUT_DIR, `session-${String(s.n).padStart(2, '0')}-cover.png`);
        const text = await renderCover(browser, s, totalSec, coverFile);
        if (!text.includes(s.date)) problems.push(`n=${s.n}: কভারে তারিখ বসেনি`);
        console.log(`   ✓ কভার — ${path.basename(coverFile)}`);

        if (has('cover-only')) { done.push({ s, totalSec, coverFile }); continue; }

        const merged = mergeAudio(s.parts, infos, tmpDir, s.n);
        if (merged !== s.parts[0]) {
            const m = probe(merged);
            if (Math.abs(m.duration - totalSec) > 2) {
                problems.push(`n=${s.n}: জোড়া দেওয়া অডিও ${Math.round(m.duration)}s,`
                    + ` উৎসের যোগফল ${Math.round(totalSec)}s`);
            }
            console.log(`   ✓ অডিও জোড়া — ${Math.round(m.duration)}s`);
        }

        const outFile = path.join(OUT_DIR, `session-${String(s.n).padStart(2, '0')}.mp4`);
        run(FFMPEG, [
            '-y', '-v', 'error',
            '-loop', '1', '-framerate', '1', '-i', coverFile,
            '-i', merged,
            '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
            // ছবিটা কখনো বদলায় না, তাই খরচের প্রায় পুরোটাই কীফ্রেম। ২ fps আর
            // ১৫ সেকেন্ডের কীফ্রেমে ঘণ্টাখানেকের একটা সেশনে ৪৬ MB শুধু ভিডিওর
            // জন্যই যাচ্ছিল। ১ fps + আড়াই মিনিটের কীফ্রেমে সেটা কয়েক MB-তে নামে,
            // আর সিক করায় কোনো পার্থক্য হয় না — ইউটিউব যেভাবেই হোক পুরোটা
            // নিজে করে রি-এনকোড করে।
            '-r', '1', '-g', '150',
            '-c:a', 'copy',
            '-shortest', '-movflags', '+faststart',
            outFile,
        ]);

        const outInfo = probe(outFile);
        if (Math.abs(outInfo.duration - totalSec) > 3) {
            problems.push(`n=${s.n}: mp4 ${Math.round(outInfo.duration)}s,`
                + ` কিন্তু উৎস ${Math.round(totalSec)}s — অডিও কেটে গেছে`);
        }
        const mb = (fs.statSync(outFile).size / 1048576).toFixed(1);
        console.log(`   ✓ ${path.basename(outFile)} — ${Math.round(outInfo.duration)}s, ${mb} MB`);
        done.push({ s, totalSec, coverFile, outFile, mb });
    }

    await browser.close();
    fs.rmSync(tmpDir, { recursive: true, force: true });

    // ── আপলোডের চিরকুট ─────────────────────────────────────────────────────
    if (!has('cover-only') && done.length) {
        const md = [
            '# ইউটিউবে আপলোড — মাসিক লাইভ রুকইয়াহ কোর্স',
            '',
            '> **প্রতিটা ভিডিওর Visibility অবশ্যই `Unlisted`।**',
            '> Public হলে চ্যানেলে গিয়ে যে কেউ দেখে ফেলবে আর ৳৪৯০-এর গেটটাই',
            '> অর্থহীন হয়ে যাবে। Private দিলে সদস্যরা embed-এ দেখতে পাবেন না।',
            '',
            'আপলোডের সময় আরও দুটো: **Audience → "No, it\'s not made for kids"**,',
            'আর Advanced-এ **Embedding চালু** রাখতে হবে।',
            '',
            'তোলার পর প্রতিটার ১১ অক্ষরের ID (`youtu.be/<ID>`) লিখে রাখুন —',
            'ওটাই `course_data/private.json` এ বসবে।',
            '',
            '| n | ফাইল | দৈর্ঘ্য | আকার | ইউটিউব শিরোনাম | ভিডিও ID |',
            '|---|---|---|---|---|---|',
            ...done.map(({ s, totalSec, outFile, mb }) =>
                `| ${s.n} | \`${path.basename(outFile)}\` | ${hhmm(totalSec)} | ${mb} MB`
                + ` | মাসিক লাইভ রুকইয়াহ কোর্স — ${s.title} (${s.date}) | |`),
            '',
            '## বিবরণে বসানোর মতো লেখা',
            '',
            '```',
            'আল কুরআন রুকইয়াহ হিলিং সেন্টার — মাসিক লাইভ রুকইয়াহ কোর্স।',
            'এই রেকর্ডিং শুধু কোর্সের সদস্যদের জন্য। লিংক কারও সাথে শেয়ার করবেন না।',
            '```',
            '',
            '## এরপর',
            '',
            '```bash',
            '# ১. course_data/private.json — প্রতিটা n এর নিচে "video": "<ID>"',
            '# ২. course_data/catalog.json — hasVideo: true, duration বসানো',
            'node tools/check_course_data.js',
            'vercel --prod          # git push নয়',
            '```',
            '',
        ].join('\n');
        fs.writeFileSync(path.join(OUT_DIR, 'UPLOAD.md'), md, 'utf8');
        console.log(`\n📄 ${path.join(OUT_DIR, 'UPLOAD.md')}`);
    }

    // catalog.json এ বসানোর জন্য মিনিটে দৈর্ঘ্য — হাতে হিসাব করার দরকার নেই।
    if (done.length) {
        console.log('\ncatalog.json এর duration (মিনিট):');
        done.forEach(({ s, totalSec }) => console.log(`   n=${s.n} → ${Math.round(totalSec / 60)}`));
    }

    if (problems.length) {
        console.error('\n✗ সমস্যা:');
        problems.forEach((p) => console.error('   ' + p));
        process.exit(1);
    }
    console.log('\n✓ সব ঠিক আছে।');
})().catch((e) => { console.error(e); process.exit(1); });
