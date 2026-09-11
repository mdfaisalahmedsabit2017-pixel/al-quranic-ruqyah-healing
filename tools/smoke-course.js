// কোর্স এরিয়াটা jsdom-এ চালিয়ে দেখে — নকল /api/course দিয়ে, শুরু থেকে শেষ পর্যন্ত।
//
//     node tools/smoke-course.js
//
// tools/smoke.js দেখে সারফেসগুলো *আছে* কি না। এটা দেখে সেগুলো *কাজ করে* কি না:
// তাক → সিলেবাস → ক্লাস → ট্যাব → অগ্রগতি, আর সমান গুরুত্বে — সদস্যপদ না থাকলে
// কী দেখায়। ফিচারটার সবকিছু ফেচ করা, তাই নেটওয়ার্ক নকল না করলে একটা লাইনও চলে না।
//
// একটা কৌশল দরকার হয়: app.js এর currentUser/userProfile let দিয়ে ঘোষিত, আর
// আলাদা eval থেকে let বাইন্ডিং ছোঁয়া যায় না (function ঘোষণা যায়, কারণ সেগুলো
// window এ বসে)। তাই টেস্ট-হুকটা একই সোর্সের শেষে জুড়ে দিয়ে eval করা হয় — শিপ
// করা ফাইলে এর একটা অক্ষরও যায় না।

const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
    ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch (e) {
    console.error('jsdom is not installed. Run `npm install` (it is a devDependency).');
    process.exit(1);
}

const dir = path.resolve(__dirname, '..', 'public');
if (!fs.existsSync(path.join(dir, 'app.js'))) {
    console.error('public/ not found — run `npm run build` first.');
    process.exit(1);
}

const VIDEO = 'ABCDEFGHIJK';   // ১১ অক্ষর, ঠিক ইউটিউবের মতো
const CATALOG = { courses: [{
    id: 'course-live', title: 'পরীক্ষার কোর্স', subtitle: 'রেকর্ডিং ও নোট', desc: '',
    membership: 'live-class', product: null, lessonCount: 3, videoCount: 2, noteCount: 2,
}] };
const SYLLABUS = {
    course: CATALOG.courses[0],
    modules: [{ id: 'm1', name: 'সেশন' }],
    lessons: [
        { n: 1, module: 'm1', title: 'প্রথম সেশন', brief: '', duration: 45, hasVideo: true, hasNotes: true, free: false },
        { n: 2, module: 'm1', title: 'দ্বিতীয় সেশন', brief: '', duration: 40, hasVideo: true, hasNotes: true, free: false },
        { n: 3, module: 'm1', title: 'তৃতীয় সেশন', brief: '', duration: 50, hasVideo: false, hasNotes: false, free: false },
    ],
    access: { granted: true, reason: 'membership', until: Date.now() + 8.64e7 },
};
const LESSON = { n: 1, title: 'প্রথম সেশন', duration: 45, host: 'youtube', video: VIDEO,
                 notes: { html: true, pdf: true, name: 'সেশন-০১.pdf' } };

const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', (e) => {
    if (!/Not implemented/.test(e.message)) console.error('jsdom:', e.message);
});

const dom = new JSDOM(fs.readFileSync(path.join(dir, 'app.html'), 'utf8'), {
    runScripts: 'outside-only', pretendToBeVisual: true, url: 'https://localhost/', virtualConsole,
});
const { window } = dom;
const d = window.document;

window.IntersectionObserver = class { observe() {} disconnect() {} unobserve() {} };
window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
window.scrollTo = () => {};
window.navigator.vibrate = () => {};
window.URL.createObjectURL = () => 'blob:test';
window.URL.revokeObjectURL = () => {};

const ok200 = (body, text) => ({
    ok: true, status: 200,
    json: async () => body,
    text: async () => text,
    blob: async () => ({ size: 1024 }),
    arrayBuffer: async () => new ArrayBuffer(1024),
    headers: { get: () => null },
});
const apiFetch = async (url) => {
    const u = String(url);
    if (/notes=pdf/.test(u)) return ok200(null, null);
    if (/notes=html/.test(u)) return ok200(null, '<html><body>নোট</body></html>');
    if (/lesson=1/.test(u)) return ok200(LESSON);
    if (/lesson=3/.test(u)) return { ok: false, status: 503, json: async () => ({ error: 'lesson_not_ready' }) };
    if (/course=course-live/.test(u)) return ok200(SYLLABUS);
    return ok200(CATALOG);
};
window.fetch = apiFetch;

const results = [];
const check = (name, cond, note) => results.push([!!cond, name, note || '']);
const wait = (ms) => new Promise(r => setTimeout(r, ms));

(async () => {
    const hook = `\nwindow.__t = {
        signIn: (u, p) => { currentUser = u; userProfile = p; },
        progress: (...a) => noteCourseProgress(...a),
        label: (id) => reviewTargetInfo(id).title,
        fromHash: () => openFromHash(),
    };`;
    try {
        window.eval(fs.readFileSync(path.join(dir, 'app.js'), 'utf8') + hook);
    } catch (e) {
        console.error('app.js threw on boot:', e.message);
        process.exit(1);
    }
    await wait(60);

    const stage = d.getElementById('course-stage');

    // ── একজন চালু সদস্য ────────────────────────────────────────────────────
    window.__t.signIn(
        { uid: 'u1', email: 'x@y.z', getIdToken: async () => 'tok' },
        { name: 'পরীক্ষার্থী', memberships: { 'live-class': { until: Date.now() + 8.64e7 } } });

    await window.renderMyCourses();
    check('সদস্যের হোম স্ক্রিনে তাক দেখা যায়',
        !d.getElementById('my-courses-section').classList.contains('hidden'));

    await window.openCourseView('course-live');
    await wait(30);
    check('ওভারলে খোলে', !d.getElementById('course-view').classList.contains('hidden'));
    check('সিলেবাসে প্রতিটি ক্লাস আছে', stage.querySelectorAll('.cv-row').length === 3);

    await window.openCourseLesson(1);
    await wait(30);
    check('ক্লাসে তিনটি ট্যাব', stage.querySelectorAll('.cv-tab').length === 3);
    check('প্লেয়ার nocookie ডোমেইনে',
        new RegExp(`youtube-nocookie\\.com/embed/${VIDEO}`).test(stage.innerHTML));
    check('প্লেয়ারের ওপর সদস্যের নাম', /পরীক্ষার্থী/.test(stage.innerHTML));

    window.showCourseTab('notes');
    await wait(40);
    const frame = stage.querySelector('.cv-note-frame');
    // allow-same-origin দিলে নোটটা অ্যাপের স্টোরেজ ও Firebase সেশনে পৌঁছে যেত।
    check('নোটের iframe এ allow-same-origin নেই',
        !!frame && !/allow-same-origin/.test(frame.getAttribute('sandbox') || ''));

    check('নোট পড়া ও ডাউনলোড দুটোই আছে',
        /openCourseNotePdf/.test(stage.innerHTML) && /downloadCourseNote/.test(stage.innerHTML));

    // শুধু PDF নোট (রাকী সরাসরি PDF দিলে যা হয়): iframe নয়, অ্যাপের pdf.js রিডার।
    LESSON.notes = { html: false, pdf: true, name: 'সেশন-০১.pdf' };
    await window.openCourseLesson(1);
    await wait(30);
    window.showCourseTab('notes');
    await wait(30);
    check('শুধু-PDF নোটে পড়ার বোতাম দেখায়', /openCourseNotePdf/.test(stage.innerHTML));
    check('শুধু-PDF নোটে iframe বসে না', !stage.querySelector('.cv-note-frame'));
    await window.openCourseNotePdf();
    await wait(60);
    check('নোট pdf.js রিডারে খোলে',
        !d.getElementById('pdf-modal').classList.contains('hidden'));
    window.closePDF();
    LESSON.notes = { html: true, pdf: true, name: 'সেশন-০১.pdf' };

    window.showCourseTab('review');
    check('মতামত ঠিক ক্লাসকে ধরে', /course-live-c1/.test(stage.innerHTML));
    check('মতামতের লেবেল ক্লাসের নাম পায়', window.__t.label('course-live-c1').includes('ক্লাস'));

    window.__t.progress('course-live', 1, 900, true);
    window.courseBack();
    await wait(20);
    check('‹ চাপলে তালিকায় ফেরে', stage.querySelectorAll('.cv-row').length === 3);
    check('শেষ করা ক্লাসে টিক পড়ে', stage.querySelectorAll('.cv-row.done').length === 1);

    await window.openCourseLesson(3);
    await wait(30);
    check('খালি ক্লাসে সৎ বার্তা', /এখনো যুক্ত হয়নি/.test(stage.innerHTML));

    window.courseBack();
    window.courseBack();
    check('বন্ধ করলে ওভারলে লুকায়', d.getElementById('course-view').classList.contains('hidden'));
    check('স্ক্রল আবার চালু হয়', d.body.style.overflow === 'auto');

    window.location.hash = '#course/course-live/2';
    window.__t.fromHash();
    await wait(60);
    check('#course/<id>/<n> ডিপ লিংক কাজ করে',
        !d.getElementById('course-view').classList.contains('hidden'));

    // গোটা ফিচারের মূল প্রতিশ্রুতি।
    check('ভিডিও ID কখনো localStorage এ যায় না',
        !JSON.stringify(window.localStorage).includes(VIDEO));
    check('ভিডিও ID কোনো DOM অ্যাট্রিবিউটে নেই',
        !new RegExp(`data-[a-z-]+="[^"]*${VIDEO}`).test(d.body.innerHTML));

    // ── মেয়াদ ফুরানো সদস্য ─────────────────────────────────────────────────
    window.closeCourseView();
    SYLLABUS.access = { granted: false, reason: 'membership_expired', until: Date.now() - 1000 };
    window.__t.signIn({ uid: 'u2', email: 'a@b.c', getIdToken: async () => 'tok' },
        { name: 'পুরনো সদস্য', memberships: { 'live-class': { until: Date.now() - 1000 } } });

    await window.renderMyCourses();
    check('মেয়াদ শেষে তাক লুকায়',
        d.getElementById('my-courses-section').classList.contains('hidden'));

    await window.openCourseView('course-live');
    await wait(30);
    check('লক থাকলেও সিলেবাস পড়া যায়', stage.querySelectorAll('.cv-row').length === 3);
    check('প্রতিটি সারি লক', stage.querySelectorAll('.cv-row[disabled]').length === 3);
    check('মেয়াদ শেষ কথাটা লেখা থাকে', /মেয়াদ শেষ/.test(stage.innerHTML));

    // সার্ভারের না-ই একমাত্র গেট; ক্লায়েন্ট সেটাকে ফাঁকা পর্দা না বানিয়ে দেখাক।
    window.fetch = async (u) => (/lesson=/.test(String(u))
        ? { ok: false, status: 403, json: async () => ({ error: 'purchase_required' }) }
        : apiFetch(u));
    await window.openCourseLesson(1);
    await wait(30);
    check('403 এলে গেট দেখায়, খালি প্লেয়ার নয়', /সদস্যপদ চালু নেই/.test(stage.innerHTML));
    check('গেটের পেছনে কোনো প্লেয়ার বানানো হয় না', !d.getElementById('cv-frame'));

    results.forEach(([pass, name, note]) =>
        console.log(`  ${pass ? 'ok  ' : 'FAIL'}  ${name}${note ? '  — ' + note : ''}`));
    const bad = results.filter(r => !r[0]).length;
    console.log(bad ? `\n❌ ${bad}টি ব্যর্থ\n` : '\n✅ কোর্স এরিয়া ঠিক চলছে।\n');
    process.exit(bad ? 1 : 0);
})();
