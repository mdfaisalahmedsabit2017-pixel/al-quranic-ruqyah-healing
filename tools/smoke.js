// Boots a built output in jsdom and asserts on the DOM it actually produces.
//
//     node tools/smoke.js native
//     node tools/smoke.js public
//
// WHY THIS EXISTS
//
// Static checks — does app.js parse, does every onclick resolve to a function —
// pass happily on code that throws the moment it runs. This file found exactly
// that: updateNotifBtn() dereferenced window.Notification, which does not exist
// in many Android WebView builds, and because it runs inside init()'s try block
// the whole startup collapsed into "তথ্য লোড করা যায়নি". Nothing short of
// executing the page would have caught it.
//
// jsdom is not a browser. It has no layout, no real network, no WebView quirks.
// Treat a pass here as "the app boots and builds the DOM it should", not as a
// substitute for the device checklist in docs/release.md.

const fs = require('fs');
const path = require('path');

let JSDOM, VirtualConsole;
try {
    ({ JSDOM, VirtualConsole } = require('jsdom'));
} catch {
    console.error('jsdom is not installed. Run `npm install` (it is a devDependency).');
    process.exit(1);
}

const target = process.argv[2] || 'native';
const dir = path.resolve(__dirname, '..', target);
if (!fs.existsSync(dir)) {
    console.error(`${target}/ not found — run the matching build first.`);
    process.exit(1);
}

const htmlFile = fs.existsSync(path.join(dir, 'app.html'))
    ? path.join(dir, 'app.html')
    : path.join(dir, 'index.html');

const audio = JSON.parse(fs.readFileSync(path.join(dir, 'audio.json'), 'utf8'));
const pdfs = JSON.parse(fs.readFileSync(path.join(dir, 'pdf_list.json'), 'utf8'));

// jsdom announces every unimplemented browser API it is asked for
// ("HTMLMediaElement's pause() method"). That is a statement about jsdom, not
// about the app, and it buries the actual results in CI output.
const virtualConsole = new VirtualConsole();
virtualConsole.on('jsdomError', e => {
    if (!/Not implemented/.test(e.message)) console.error('jsdom:', e.message);
});

const dom = new JSDOM(fs.readFileSync(htmlFile, 'utf8'), {
    runScripts: 'outside-only',
    pretendToBeVisual: true,
    url: 'https://localhost/',
    virtualConsole,
});
const { window } = dom;

// Browser APIs jsdom lacks. Note what is deliberately NOT stubbed:
// navigator.serviceWorker stays absent, because that is what a browser without
// support looks like — defining it as undefined would make the app's
// `'serviceWorker' in navigator` guard pass and then throw, which reads as an
// app bug when it is a harness bug.
window.IntersectionObserver = class {
    constructor(cb) { this.cb = cb; }
    observe() {} disconnect() {} unobserve() {}
};
window.matchMedia = () => ({ matches: false, addEventListener() {}, addListener() {} });
window.scrollTo = () => {};
window.navigator.vibrate = () => {};
window.fetch = (u) => {
    const name = String(u).split('/').pop();
    const body = name === 'audio.json' ? audio : name === 'pdf_list.json' ? pdfs : [];
    return Promise.resolve({
        ok: true,
        json: () => Promise.resolve(body),
        text: () => Promise.resolve('[]'),
    });
};
window.BUILD_TARGET =
    fs.readFileSync(path.join(dir, 'build-flags.js'), 'utf8').includes('"native"')
        ? 'native' : 'web';

// Startup errors must fail the run, not scroll past in a log.
const fatal = [];
window.console.error = (...a) => fatal.push(a.map(x => (x && x.stack) ? x.stack : String(x)).join(' '));
window.console.warn = () => {};
window.addEventListener('error', e => fatal.push('window error: ' + e.message));

try {
    window.eval(fs.readFileSync(path.join(dir, 'app.js'), 'utf8'));
} catch (e) {
    console.error('app.js threw while evaluating:', e.message);
    process.exit(1);
}

// init() is async; fetch resolves on the microtask queue.
setTimeout(() => {
    const d = window.document;
    const q = s => d.querySelectorAll(s);
    const lines = [];
    let failed = 0;
    const check = (label, cond, detail = '') => {
        if (!cond) failed++;
        lines.push(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
    };

    console.log(`--- smoke: ${target}/  (BUILD_TARGET=${window.BUILD_TARGET}) ---`);

    check('startup produced no errors', fatal.length === 0, fatal.join(' | '));

    const cards = q('#audio-container .audio-card');
    check('audio list renders', cards.length > 0, `${cards.length} cards of ${audio.length}`);
    check('audio list is paged', cards.length <= 30, `${cards.length} on first paint`);
    check('sentinel present while more remain',
        !!d.getElementById('audio-sentinel') || cards.length >= audio.length);
    check('pdf grid renders', q('#pdf-container > *').length > 0,
        `${q('#pdf-container > *').length} items`);

    if (window.BUILD_TARGET === 'native') {
        window.showSection('practice');
        const rows = q('#practice-list .practice-row');
        check('আমল tab renders its rows', rows.length === 8, `${rows.length} rows`);
        check('every আমল row has a status line',
            [...rows].every(r => r.querySelector('.practice-row-status')?.textContent.trim()));
        check('books moved into the pdf tab', !!d.querySelector('#section-pdf #books-section'));
        check('recently-played sits above the dua', (() => {
            const parent = d.getElementById('dua-container')?.parentNode;
            if (!parent) return false;
            const kids = [...parent.children];
            const r = kids.indexOf(d.getElementById('recently-played-section'));
            const u = kids.indexOf(d.getElementById('dua-container'));
            return r >= 0 && u >= 0 && r < u;
        })());
        check('no purchase modal in the DOM', !d.getElementById('course-buy-modal'));
        check('account deletion is reachable', !!d.getElementById('delete-account-modal'));
        check('four nav tabs', q('.nav-item').length === 4, `${q('.nav-item').length}`);
        check('health disclaimers pinned on all three screens',
            q('.health-disclaimer').length === 3, `${q('.health-disclaimer').length} of 3`);
    } else {
        check('five nav tabs', q('.nav-item').length === 5, `${q('.nav-item').length}`);
        check('purchase modal still present', !!d.getElementById('course-buy-modal'));
        check('utility rows still on the home screen', q('#section-home .util-row').length === 2);
    }

    const before = fatal.length;
    for (const t of [...q('.nav-item')].map(b => b.dataset.section)) {
        try { window.showSection(t); } catch (e) { fatal.push(`showSection(${t}): ${e.message}`); }
    }
    check('every tab switches without throwing', fatal.length === before);

    // Favouriting must update one star, not rebuild the paged list — otherwise
    // starring the 150th track scrolls it off the screen.
    window.showSection('library');
    const shown = q('#audio-container .audio-card').length;
    const code = audio[0]?.code;
    if (code) {
        try { window.toggleFavorite(code); } catch (e) { fatal.push('toggleFavorite: ' + e.message); }
        check('favouriting does not reset the list',
            q('#audio-container .audio-card').length === shown);
        check('the star updates in place',
            d.querySelector(`.fav-btn[data-code="${code}"]`)?.classList.contains('on'));
    }

    // Mini player. The assertion that matters is the last one: if the iframe's
    // parent chain changes between states, the embed reloads and the recitation
    // restarts from zero.
    if (code) {
        const frameParentBefore = d.getElementById('yt-frame')?.parentElement?.id;
        try { window.openPlayer(code); } catch (e) { fatal.push('openPlayer: ' + e.message); }
        check('player opens full-screen', !d.body.classList.contains('player-mini'));

        try { window.minimizePlayer(); } catch (e) { fatal.push('minimizePlayer: ' + e.message); }
        check('minimise puts the player in bar state', d.body.classList.contains('player-mini'));
        check('minimised player is not treated as a back-button overlay', (() => {
            // With only the bar showing, back must navigate rather than close.
            const openSheets = [...q('.modal:not(.hidden), .modal-overlay:not(.hidden)')]
                .filter(el => el.id !== 'yt-modal');
            return openSheets.length === 0;
        })());

        try { window.expandPlayer(); } catch (e) { fatal.push('expandPlayer: ' + e.message); }
        check('expand returns to full-screen', !d.body.classList.contains('player-mini'));

        const frameParentAfter = d.getElementById('yt-frame')?.parentElement?.id;
        check('the player iframe never changes parent',
            frameParentBefore === frameParentAfter,
            `${frameParentBefore} -> ${frameParentAfter}`);

        try { window.closePlayer(); } catch (e) { fatal.push('closePlayer: ' + e.message); }
        check('close clears the bar state', !d.body.classList.contains('player-mini'));
    }

    console.log(lines.join('\n'));

    // Exit explicitly. The app sets progress intervals and jsdom keeps its own
    // timers, so node would otherwise sit with a live event loop forever — a
    // hung CI job that looks like a slow one.
    dom.window.close();
    if (failed) {
        console.error(`\n❌ ${failed} smoke check(s) failed in ${target}/.`);
        process.exit(1);
    }
    console.log(`\n✅ ${target}/ boots clean.`);
    process.exit(0);
}, 300);
