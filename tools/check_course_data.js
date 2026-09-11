// কোর্সের তিনটে অংশ — catalog.json, private.json আর course_notes/ — একে অন্যের
// সাথে মেলে কি না দেখে। **প্রতিটা `vercel --prod` এর আগে চালান।**
//
//     node tools/check_course_data.js
//
// কেন আলাদা স্ক্রিপ্ট, build.js এর ভেতরে নয়: build.js public/ এ লেখে, আর কোর্সের
// কিছুই public/ এ যায় না। তার চেয়ে বড় কারণ — এখানকার ভুলগুলো নীরব। catalog বলল
// ক্লাসে ভিডিও আছে, private.json এ নেই — সাইট তখন পেইড ছাত্রকে একটা খালি প্লেয়ার
// দেখায় আর কোথাও কোনো ত্রুটি ছাপে না। সেটা ধরার একমাত্র উপায় আগে থেকে মিলিয়ে দেখা।
//
// non-zero exit মানে ডিপ্লয় করা যাবে না; ⚠ মানে দেখে নিন, ইচ্ছাকৃত হলে চালিয়ে যান।

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const DATA_DIR = path.join(ROOT, 'course_data');
const NOTES_DIR = path.join(ROOT, 'course_notes');

// নমুনা সারিগুলো পাইপলাইন পরীক্ষার জন্য রাখা — কিন্তু সেগুলো নিয়ে ডিপ্লয় হলে
// ছাত্র "নমুনা — প্রথম সেশন" দেখবে। তাই এটাই সবচেয়ে শক্ত গেট।
const PLACEHOLDER = 'নমুনা —';

const errors = [];
const warnings = [];

function readJson(file, label) {
    try {
        return JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (e) {
        errors.push(`${label} পড়া গেল না: ${e.message}`);
        return null;
    }
}

const catalog = readJson(path.join(DATA_DIR, 'catalog.json'), 'course_data/catalog.json');
const priv = readJson(path.join(DATA_DIR, 'private.json'), 'course_data/private.json');

if (!catalog || !priv) {
    errors.forEach((e) => console.error(`✗ ${e}`));
    process.exit(1);
}

const rows = [];

(catalog.courses || []).forEach((course) => {
    const lessons = course.lessons || [];
    const map = priv[course.id] || {};
    let videos = 0;
    let notes = 0;

    if (!priv[course.id]) {
        warnings.push(`${course.id}: private.json এ এই কোর্সের কোনো এন্ট্রি নেই`);
    }
    if (!course.membership && !course.product) {
        errors.push(`${course.id}: membership ও product দুটোই খালি — কেউ কোর্সটা খুলতে পারবে না`);
    }

    const seen = new Set();
    lessons.forEach((l) => {
        const at = `${course.id} ক্লাস ${l.n}`;
        if (!Number.isInteger(l.n)) errors.push(`${at}: n একটা পূর্ণসংখ্যা হতে হবে`);
        if (seen.has(l.n)) errors.push(`${at}: n দুবার ব্যবহার হয়েছে`);
        seen.add(l.n);
        if (!l.title) errors.push(`${at}: শিরোনাম নেই`);
        if (l.title && l.title.startsWith(PLACEHOLDER)) {
            errors.push(`${at}: এখনো নমুনা শিরোনাম — আসল সেশনের নাম বসান`);
        }
        if (l.module && !(course.modules || []).some((m) => m.id === l.module)) {
            errors.push(`${at}: module "${l.module}" কোর্সের modules তালিকায় নেই`);
        }

        const e = map[String(l.n)] || {};

        if (e.video) videos += 1;
        if (l.hasVideo && !e.video) {
            errors.push(`${at}: catalog বলছে ভিডিও আছে, private.json এ নেই — ছাত্র খালি প্লেয়ার পাবে`);
        }
        if (!l.hasVideo && e.video) {
            warnings.push(`${at}: private.json এ ভিডিও আছে কিন্তু catalog এ hasVideo=false — কেউ দেখবে না`);
        }

        const files = [e.notesHtml, e.notesPdf].filter(Boolean);
        const missing = files.filter((rel) => !fs.existsSync(path.join(NOTES_DIR, rel)));
        missing.forEach((rel) => errors.push(`${at}: নোট ফাইল নেই — course_notes/${rel}`));
        if (files.length && !missing.length) notes += 1;
        if (l.hasNotes && !files.length) {
            errors.push(`${at}: catalog বলছে নোট আছে, private.json এ কোনো ফাইল দেওয়া নেই`);
        }
        if (!l.hasNotes && files.length) {
            warnings.push(`${at}: নোট ফাইল আছে কিন্তু catalog এ hasNotes=false — কেউ পাবে না`);
        }
        if (e.notesPdf && !e.notesName) {
            warnings.push(`${at}: notesName নেই — ডাউনলোডে ফাইলের নাম হবে ${course.id}-${String(l.n).padStart(2, '0')}.pdf`);
        }
    });

    Object.keys(map).forEach((k) => {
        if (!seen.has(parseInt(k, 10))) {
            warnings.push(`${course.id}: private.json এ ক্লাস ${k} আছে, catalog এ নেই`);
        }
    });

    if (!lessons.length) warnings.push(`${course.id}: একটাও ক্লাস নেই — দেওয়ার মতো কিছু নেই`);
    rows.push({ id: course.id, lessons: lessons.length, videos, notes });
});

console.log('');
rows.forEach((r) => {
    const flag = (r.videos === 0 || r.notes === 0) ? '  ⚠' : '';
    console.log(
        `${r.id.padEnd(18)} ${String(r.lessons).padStart(3)} ক্লাস | `
        + `${String(r.videos).padStart(3)} ভিডিও | ${String(r.notes).padStart(3)} নোট${flag}`
    );
});
console.log('');

warnings.forEach((w) => console.log(`⚠ ${w}`));
errors.forEach((e) => console.error(`✗ ${e}`));

if (errors.length) {
    console.error(`\n${errors.length}টি সমস্যা — ডিপ্লয় করবেন না।\n`);
    process.exit(1);
}
console.log(warnings.length ? '\nত্রুটি নেই (উপরের সতর্কতাগুলো দেখে নিন)।\n' : '\nসব ঠিক আছে।\n');
