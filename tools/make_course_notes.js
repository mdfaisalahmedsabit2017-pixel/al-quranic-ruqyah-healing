// কোর্সের নোট বানায়: একটা HTML ডকুমেন্ট → অ্যাপে পড়ার HTML + ডাউনলোডের A4 PDF,
// দুটোই course_notes/<course-id>/ এ, আর private.json + catalog.json নিজে থেকে
// আপডেট করে দেয়।
//
//     node tools/make_course_notes.js --course course-live --lesson 3 --from "D:\নোট\session-03.html"
//     node tools/make_course_notes.js --course course-ruqyah --from-dir "A:\claude code projects sabit\ruqyah-course\out"
//
// --from-dir মোডে ফোল্ডারের ভেতর class-01/handout.html, class-02/handout.html …
// এই ছাঁচ খোঁজে (ruqyah-course এর আউটপুট ঠিক এভাবেই সাজানো) আর নম্বরটাই ক্লাস নম্বর।
//
// কেন build.js এর ভেতরে নয়: build.js public/ এ লেখে, আর কোর্সের একটা বাইটও
// public/ এ যায় না। এটা ডিপ্লয়ের আগে হাতে চালানোর জিনিস — watermark_pdfs.py যেমন।
//
// রেন্ডার headless Chrome এ, PDF/ইমেজ লাইব্রেরি দিয়ে নয় — বাংলা যুক্তাক্ষর আর আরবি
// জোড়া লেখা ওরা ঠিকমতো বসাতে পারে না, আর ভাঙা যুক্তাক্ষর ছাপার আগে চোখে পড়ে না,
// পড়ে ছাত্রের চোখে। tools/make_note_page.js এ একই সিদ্ধান্ত, একই কারণে।

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const puppeteer = require('puppeteer-core');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'course_data');
const NOTES_DIR = path.join(ROOT, 'course_notes');

const CHROME = [
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
    process.env.LOCALAPPDATA + '\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe',
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
].find((p) => p && fs.existsSync(p));

function arg(name) {
    const i = process.argv.indexOf(`--${name}`);
    return i === -1 ? null : process.argv[i + 1];
}

// অ্যাপের ভেতরে নোটটা srcdoc iframe এ বসে, প্যারেন্টের base URL নিয়ে। তাই
// Google Fonts এর <link> সরিয়ে সাইটের নিজের /fonts/ এ পাঠানো যায় — নোট তখন
// অফলাইনেও ঠিক দেখায়, আর ফন্টটা ব্রাউজারের কাছে আগে থেকেই আছে।
//
// base64 এ বসানো @font-face গুলো ছোঁয়া হয় না: আরবির IndoPak ফন্ট ওভাবেই আসে,
// আর সেটাই আরবিকে শুদ্ধ রাখে।
function forApp(html) {
    let seenFontLink = false;
    let out = html
        .replace(/<script[^>]*html2canvas[^<]*<\/script>/gi, '')
        .replace(/<link[^>]+rel=["']preconnect["'][^>]*>/gi, '')
        .replace(/<link[^>]+fonts\.gstatic\.com[^>]*>/gi, '')
        // একাধিক Google Fonts <link> থাকলে প্রথমটাই সাইটের ফন্টে বদলায়, বাকিগুলো
        // বাদ — নইলে একই স্টাইলশিট বারবার আসত।
        .replace(/<link[^>]+fonts\.googleapis\.com[^>]*>/gi, () => {
            if (seenFontLink) return '';
            seenFontLink = true;
            return '<link rel="stylesheet" href="/fonts/fonts.css">';
        });

    // নোটটা srcdoc iframe এ বসে, আর সেই iframe এ allow-scripts দেওয়া হয় না —
    // একটা নোট কখনো অ্যাপের স্টোরেজ বা Firebase সেশনে হাত দিতে পারবে না। ফলে
    // ডকুমেন্টের নিজের "প্রিন্ট" ও "PNG ডাউনলোড" বোতাম দুটো চাপলে কিছুই হয় না।
    // অকেজো বোতাম রেখে দেওয়ার চেয়ে লুকিয়ে দেওয়াই সৎ — অ্যাপের নিজের ডাউনলোড
    // বোতাম নোটের ঠিক নিচেই আছে।
    const hide = '<style>.btn-print,.btn-png{display:none!important}</style>';
    return out.includes('</head>') ? out.replace('</head>', hide + '</head>') : hide + out;
}

function readJson(file) {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
}

async function renderPdf(browser, srcFile, outFile) {
    const page = await browser.newPage();
    await page.goto('file:///' + srcFile.replace(/\\/g, '/'), { waitUntil: 'networkidle0' });
    await page.evaluate(() => document.fonts.ready);

    // উৎসের পাতা গোনা — নিচে PDF এর পাতার সাথে মেলানো হবে।
    const declared = await page.evaluate(() =>
        document.querySelectorAll('.a4-page, .page, [data-page]').length);
    const title = await page.evaluate(() => (document.title || '').trim());
    const text = await page.evaluate(() => document.body.innerText.replace(/\s+/g, ' ').trim());

    await page.pdf({
        path: outFile,
        format: 'A4',
        printBackground: true,
        preferCSSPageSize: true,
        margin: { top: 0, right: 0, bottom: 0, left: 0 },
    });
    await page.close();
    return { declared, title, text };
}

// PDF এর পাতার সংখ্যা। PyMuPDF-কেই জিজ্ঞেস করা হয়, কারণ ওটা পাইপলাইনের পরের
// ধাপেই (watermark_course_notes.py) লাগে — নতুন কোনো নির্ভরতা নয়।
//
// কাঁচা টেক্সটে `/Type /Page` গোনা হতো আগে, আর সেটা **নীরবে ভুল**: আধুনিক PDF
// অবজেক্টগুলো `/ObjStm` কম্প্রেসড স্ট্রিমে রাখে, তাই ১৩ পাতার একটা ফাইলও
// "০ পাতা" দেখাত। জানতে না পারলে null — অনুমান নয়।
function pdfPageCount(file) {
    try {
        const out = execFileSync('python', [
            '-c',
            'import sys,fitz;print(fitz.open(sys.argv[1]).page_count)',
            file,
        ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] });
        const n = parseInt(out.trim(), 10);
        if (Number.isInteger(n)) return n;
    } catch (e) { /* পাইথন বা PyMuPDF নেই — নিচের অনুমানে নামা */ }
    const m = fs.readFileSync(file).toString('latin1').match(/\/Type\s*\/Page[^s]/g);
    return m && m.length ? m.length : null;
}

(async () => {
    const courseId = arg('course');
    const fromDir = arg('from-dir');
    const from = arg('from');
    const lessonN = arg('lesson');

    if (!courseId || (!from && !fromDir)) {
        console.error('ব্যবহার:');
        console.error('  node tools/make_course_notes.js --course <id> --lesson <n> --from <file.pdf|file.html>');
        console.error('  node tools/make_course_notes.js --course <id> --from-dir <dir with class-NN/handout.html>');
        process.exit(1);
    }
    // PDF সরাসরি কপি হয়, রেন্ডার লাগে না — তখন Chrome না থাকলেও চলে।
    const needsChrome = !from || !/\.pdf$/i.test(from);
    if (needsChrome && !CHROME) { console.error('Chrome পাওয়া যায়নি — HTML থেকে PDF বানানো যাবে না।'); process.exit(1); }

    const catalogFile = path.join(DATA_DIR, 'catalog.json');
    const privFile = path.join(DATA_DIR, 'private.json');
    const catalog = readJson(catalogFile);
    const priv = fs.existsSync(privFile) ? readJson(privFile) : {};
    const course = (catalog.courses || []).find((c) => c.id === courseId);
    if (!course) { console.error(`catalog.json এ "${courseId}" নেই।`); process.exit(1); }

    // কাজের তালিকা: [ক্লাস নম্বর, উৎস ফাইল]
    const jobs = [];
    if (from) {
        const n = parseInt(lessonN, 10);
        if (!Number.isInteger(n)) { console.error('--lesson <n> লাগবে।'); process.exit(1); }
        jobs.push([n, path.resolve(from)]);
    } else {
        fs.readdirSync(fromDir).sort().forEach((name) => {
            const m = /^class-(\d+)$/.exec(name);
            const file = path.join(fromDir, name, 'handout.html');
            if (m && fs.existsSync(file)) jobs.push([parseInt(m[1], 10), file]);
        });
        if (!jobs.length) { console.error(`${fromDir} এ class-NN/handout.html পাওয়া যায়নি।`); process.exit(1); }
    }

    const outDir = path.join(NOTES_DIR, courseId);
    fs.mkdirSync(outDir, { recursive: true });
    const browser = needsChrome
        ? await puppeteer.launch({ executablePath: CHROME, headless: 'new' })
        : null;
    const problems = [];
    const warnings = [];

    for (const [n, srcFile] of jobs) {
        if (!fs.existsSync(srcFile)) { problems.push(`ক্লাস ${n}: উৎস নেই — ${srcFile}`); continue; }
        const lesson = (course.lessons || []).find((l) => l.n === n);
        if (!lesson) { problems.push(`ক্লাস ${n}: catalog.json এ এই ক্লাসটা নেই`); continue; }

        const stem = `l${String(n).padStart(2, '0')}`;
        const htmlOut = path.join(outDir, `${stem}.html`);
        const pdfOut = path.join(outDir, `${stem}.pdf`);

        // ইতিমধ্যে PDF হয়ে থাকা নোট — শুধু জায়গামতো বসানো। রেন্ডার করার কিছু নেই,
        // আর অ্যাপে পড়ার HTML সংস্করণও নেই: অ্যাপ তখন নিজের pdf.js রিডারেই খোলে
        // (নোট ট্যাবের "পড়ুন" বোতাম), ঠিক গাইডের PDF গুলোর মতো।
        if (/\.pdf$/i.test(srcFile)) {
            fs.copyFileSync(srcFile, pdfOut);
            if (fs.existsSync(htmlOut)) fs.rmSync(htmlOut);   // আগের HTML সংস্করণ থাকলে বাসি
            const pdfPages = pdfPageCount(pdfOut);
            const pdfSize = fs.statSync(pdfOut).size;
            if (pdfPages === null) {
                warnings.push(`ক্লাস ${n}: পাতা গোনা গেল না (PyMuPDF নেই?) — PDF টা নিজে খুলে দেখুন`);
            }
            if (pdfSize < 20 * 1024) {
                problems.push(`ক্লাস ${n}: PDF মাত্র ${(pdfSize / 1024).toFixed(1)} KB — সম্ভবত ফাঁকা`);
            }

            priv[courseId] = priv[courseId] || {};
            const pe = priv[courseId][String(n)] || { host: 'youtube', video: null };
            pe.notesHtml = null;
            pe.notesPdf = `${courseId}/${stem}.pdf`;
            pe.notesName = pe.notesName || `${lesson.title}.pdf`;
            priv[courseId][String(n)] = pe;
            lesson.hasNotes = true;

            console.log(`ক্লাস ${String(n).padStart(2)} → ${stem}.pdf `
                + `(${pdfPages === null ? '?' : pdfPages} পাতা, ${(pdfSize / 1024 / 1024).toFixed(1)} MB, সরাসরি কপি)`);
            continue;
        }

        fs.writeFileSync(htmlOut, forApp(fs.readFileSync(srcFile, 'utf8')));
        const info = await renderPdf(browser, srcFile, pdfOut);

        // নীরব ট্রাংকেশনই এখানকার আসল ভয় — ফন্ট না এলে বা প্রিন্টে CSS অন্যভাবে
        // ভাগ করলে PDF দেখতে ঠিকই লাগে, শুধু ভেতরে কিছু থাকে না।
        //
        // কম পাতা = লেখা হারিয়েছে, সেটা থামানোর মতো ভুল। বেশি পাতা = লেখা আছে,
        // শুধু ডিজাইনার যেখানে পাতা ভাঙতে চেয়েছিলেন সেখানে ভাঙেনি (উৎসের
        // .a4-page এ min-height থাকলে ব্রাউজারে বাড়ে, ছাপায় উপচে পড়ে) — সেটা
        // দেখে নেওয়ার জিনিস, ফেল করানোর নয়।
        const pages = pdfPageCount(pdfOut);
        const size = fs.statSync(pdfOut).size;
        if (pages === null) {
            warnings.push(`ক্লাস ${n}: পাতা গোনা গেল না (PyMuPDF নেই?) — PDF টা নিজে খুলে দেখুন`);
        } else if (info.declared && pages < info.declared) {
            problems.push(`ক্লাস ${n}: উৎসে ${info.declared} পাতা, PDF এ মাত্র ${pages} — লেখা হারিয়েছে`);
        } else if (info.declared && pages > info.declared) {
            warnings.push(`ক্লাস ${n}: উৎসে ${info.declared} পাতা, PDF এ ${pages} — ছাপায় উপচে পড়েছে, পাতা-ভাঙা দেখে নিন`);
        }
        if (size < 40 * 1024) {
            problems.push(`ক্লাস ${n}: PDF মাত্র ${(size / 1024).toFixed(1)} KB — সম্ভবত ফাঁকা`);
        }
        if (!info.text || info.text.length < 400) {
            problems.push(`ক্লাস ${n}: রেন্ডার করা পাতায় প্রায় কোনো লেখা নেই — ফন্ট বা উৎস ভাঙা`);
        } else if (lesson.title && !info.text.includes(lesson.title.slice(0, 12))) {
            // catalog এর শিরোনাম আর ডকুমেন্টের শিরোনাম আলাদা হতেই পারে, তাই
            // এটা সন্দেহ — নিশ্চয়তা নয়।
            warnings.push(`ক্লাস ${n}: রেন্ডার করা লেখায় catalog এর শিরোনাম নেই — ঠিক ফাইলটাই দিয়েছেন তো?`);
        }

        priv[courseId] = priv[courseId] || {};
        const e = priv[courseId][String(n)] || { host: 'youtube', video: null };
        e.notesHtml = `${courseId}/${stem}.html`;
        e.notesPdf = `${courseId}/${stem}.pdf`;
        e.notesName = e.notesName || `${lesson.title}.pdf`;
        priv[courseId][String(n)] = e;
        lesson.hasNotes = true;

        console.log(`ক্লাস ${String(n).padStart(2)} → ${stem}.html + ${stem}.pdf `
            + `(${pages} পাতা, ${(size / 1024 / 1024).toFixed(1)} MB)`);
    }

    if (browser) await browser.close();
    fs.writeFileSync(privFile, JSON.stringify(priv, null, 2) + '\n');
    fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + '\n');

    if (warnings.length) {
        console.log('');
        warnings.forEach((w) => console.log(`⚠ ${w}`));
    }
    if (problems.length) {
        console.error('');
        problems.forEach((p) => console.error(`✗ ${p}`));
        console.error(`\n${problems.length}টি সমস্যা — এই নোটগুলো দেওয়ার মতো হয়নি।\n`);
        process.exit(1);
    }
    console.log('\nএরপর: python tools/watermark_course_notes.py → node tools/check_course_data.js');
    console.log('আর প্রতিটা PDF অন্তত একবার খুলে দেখুন — যুক্তাক্ষর ও আরবি ঠিক আছে কি না।\n');
})();
