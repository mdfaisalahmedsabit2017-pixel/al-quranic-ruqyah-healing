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
// Guides and blog posts are fetched from the deployment, not read out of the
// bundle, so there is no file to point at — these stand in for the two indexes
// the reading tab loads. Small on purpose: the assertions below care that the
// list renders and groups by category, not how many rows come back.
const GUIDES = {
    categories: [{ bn: 'সিহর ও জাদু' }, { bn: 'জিন সংক্রান্ত' }],
    items: [
        { slug: 'a', title_bn: 'ক', desc: 'এক', category: 'সিহর ও জাদু', pdf: 'a.pdf' },
        { slug: 'b', title_bn: 'খ', desc: 'দুই', category: 'সিহর ও জাদু', pdf: 'b.pdf' },
        { slug: 'c', title_bn: 'গ', desc: 'তিন', category: 'জিন সংক্রান্ত', pdf: 'c.pdf' },
    ],
};

window.fetch = (u) => {
    const url = String(u);
    const name = url.split('/').pop();
    const body = name === 'audio.json' ? audio
        : name === 'pdf_list.json' ? pdfs
        : /\/guides\/index\.json/.test(url) ? GUIDES
        : [];
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

// Lets a fetch chain started by a click settle before the next assertion reads
// the DOM. setTimeout(0) rather than a microtask: the app awaits a response and
// then renders, so the render lands one macrotask later.
const tick = () => new Promise((r) => setTimeout(r, 0));

// init() is async; fetch resolves on the microtask queue.
setTimeout(async () => {
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

    // Every local src/href in the shipped markup must resolve to a file that is
    // actually in the bundle. Marker stripping removes the code that uses a
    // file but happily leaves a <script> tag or a footer link pointing at it —
    // that is how payments.js came to 404 on every launch and how the features
    // link became a dead end with no way back inside a WebView.
    {
        const raw = fs.readFileSync(htmlFile, 'utf8').replace(/<!--[\s\S]*?-->/g, '');
        const refs = new Set();
        for (const m of raw.matchAll(/(?:src|href)="(?!https?:|data:|mailto:|tel:|#)([^"]+)"/g)) {
            refs.add(m[1]);
        }
        const missing = [...refs].filter(r => {
            const clean = r.split('?')[0].split('#')[0];
            return clean && clean !== '/' && !fs.existsSync(path.join(dir, clean));
        });
        check('every local file the markup references is bundled',
            missing.length === 0, missing.join(', '));
    }

    const cards = q('#audio-container .audio-card');
    check('audio list renders', cards.length > 0, `${cards.length} cards of ${audio.length}`);
    check('audio list is paged', cards.length <= 30, `${cards.length} on first paint`);
    check('sentinel present while more remain',
        !!d.getElementById('audio-sentinel') || cards.length >= audio.length);
    check('pdf grid renders', q('#pdf-container > *').length > 0,
        `${q('#pdf-container > *').length} items`);

    // ── Reading tab: গাইড / পিডিএফ / লেখা ────────────────────────────────────
    // The guides reached the app last and are the easiest thing here to break
    // silently: the list is fetched, so an empty pane looks like "nothing
    // published yet" rather than like a bug. It did exactly that on the website
    // for months, because /blog/index.json had no CORS header and the fetch the
    // app makes from https://localhost was rejected with no visible symptom.
    check('reading tab has three segments', q('.seg-btn[data-lib]').length === 3,
        `${q('.seg-btn[data-lib]').length}`);
    check('blog list moved into the reading tab', !!d.querySelector('#lib-pane-blog #blog-list'));

    window.showSection('pdf');
    window.showLibraryTab('guides');
    await tick();
    const guideCards = q('#guide-list .guide-card');
    check('guide list renders', guideCards.length === GUIDES.items.length,
        `${guideCards.length} of ${GUIDES.items.length}`);
    check('guides are grouped by category', q('#guide-list .guide-grp').length === 2,
        `${q('#guide-list .guide-grp').length} headings`);
    check('category chips include an "all" chip', q('#guide-cats .guide-cat').length === 3,
        `${q('#guide-cats .guide-cat').length}`);

    window.filterGuides('জিন সংক্রান্ত');
    check('filtering a category narrows the list',
        q('#guide-list .guide-card').length === 1, `${q('#guide-list .guide-card').length}`);
    check('a filtered list drops the group headings', q('#guide-list .guide-grp').length === 0);
    window.filterGuides('');

    // The whole point of framing the published page rather than re-rendering it
    // is that the document keeps its own design; ?app=1 is what stops its web
    // bar from showing up inside the app on top of the app's own header.
    window.openGuide('a');
    const guideSrc = d.getElementById('guide-frame')?.getAttribute('src') || '';
    check('opening a guide frames the published page',
        /\/guides\/a\/\?app=1$/.test(guideSrc), guideSrc);
    check('guide reader opens', !d.getElementById('guide-modal')?.classList.contains('hidden'));
    window.closeGuide();
    check('closing a guide unloads the frame',
        d.getElementById('guide-frame')?.getAttribute('src') === 'about:blank');

    // ── Notices ──────────────────────────────────────────────────────────────
    check('notices are reachable from the header', !!d.getElementById('notice-btn'));
    check('notice inbox exists', !!d.getElementById('notice-modal'));
    window.openNoticeModal();
    check('notice inbox opens', !d.getElementById('notice-modal')?.classList.contains('hidden'));
    check('an empty inbox says so, rather than rendering nothing',
        (d.getElementById('notice-list')?.textContent || '').trim().length > 0);
    window.closeNoticeModal();

    // ── Sign-in options ──────────────────────────────────────────────────────
    // v1.0 ships Google and email only. Both of the other flows are written and
    // switched off at the config, so what is asserted here is that they are
    // genuinely not on screen — and, below, that the phone number formatter
    // still behaves, since it is what a wrong keystroke reaches first on the
    // day the flag is flipped.
    check('phone sign-in is built into the login sheet', !!d.getElementById('phone-auth-block'));
    check('phone sign-in stays hidden while PHONE_LOGIN_ENABLED is false',
        d.getElementById('phone-auth-block')?.classList.contains('hidden'));
    check('phone starts on the number step, not the code step',
        d.getElementById('phone-step-code')?.classList.contains('hidden'));
    // The formatter is the part a wrong keystroke reaches first, and Bangladeshi
    // numbers get typed all three of these ways.
    for (const [input, want] of [
        ['01712345678', '+8801712345678'],
        ['1712345678', '+8801712345678'],
        ['+880 1712-345678', '+8801712345678'],
    ]) {
        d.getElementById('ph-number').value = input;
        window.sendOtp();
        check(`"${input}" is accepted as a phone number`,
            !/ঠিক নয়/.test(d.getElementById('ph-error')?.textContent || ''),
            d.getElementById('ph-error')?.textContent);
    }
    d.getElementById('ph-number').value = '12345';
    window.sendOtp();
    check('a short number is rejected before any SMS is attempted',
        /ঠিক নয়/.test(d.getElementById('ph-error')?.textContent || ''));
    window.resetPhoneAuth();
    check('Facebook stays hidden until it is configured',
        d.getElementById('facebook-signin-btn')?.classList.contains('hidden'));

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

        // There is no window.Capacitor in this harness, so the Firebase auth
        // plugin reads as absent — the state a build without google-services.json
        // is in. initNativeShell must then hide the Google button, and these two
        // assertions are really a proxy for "initNativeShell ran at all".
        //
        // It did not, on the first device build: updateNotifBtn() threw on
        // window.Notification eleven lines earlier in the same try block, so the
        // button stayed visible, was tapped, and reported a plugin it could not
        // have reached. Back-button handling and the status-bar config were lost
        // in the same silence.
        check('Google button hidden when the native plugin is absent',
            d.getElementById('google-signin-btn')?.classList.contains('hidden'));
        check('native shell ran (or-divider hidden with it)',
            d.querySelector('#login-modal .or-divider')?.classList.contains('hidden'));
        check('email sign-in survives in the APK', !!d.getElementById('auth-email'));
        check('account deletion is reachable', !!d.getElementById('delete-account-modal'));
        check('four nav tabs', q('.nav-item').length === 4, `${q('.nav-item').length}`);
        check('health disclaimers pinned on all three screens',
            q('.health-disclaimer').length === 3, `${q('.health-disclaimer').length} of 3`);
    } else {
        check('five nav tabs', q('.nav-item').length === 5, `${q('.nav-item').length}`);
        check('purchase modal still present', !!d.getElementById('course-buy-modal'));
        check('utility rows still on the home screen', q('#section-home .util-row').length === 2);
        // Google and email survive on both targets — email above all, because
        // every account created before this release has a password and nothing
        // else. Removing it would lock those people out for good.
        check('Google sign-in offered on the web',
            !d.getElementById('google-signin-btn')?.classList.contains('hidden'));
        check('email sign-in still offered', !!d.getElementById('auth-email')
            && !d.getElementById('auth-login-section')?.classList.contains('hidden'));
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
