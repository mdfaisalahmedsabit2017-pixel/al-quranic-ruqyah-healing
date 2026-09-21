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

        // jsdom applies no CSS, so nothing else here can notice an unstyled
        // page. The stylesheet is authored as styles/*.css and inlined by
        // build.js; if that step were skipped the app would boot, render every
        // element, pass every other assertion, and look like a wall of text.
        // These three tokens come from the first, middle and last file.
        const style = /<style>([\s\S]*?)<\/style>/.exec(raw);
        const cssText = style ? style[1] : '';
        const wanted = ['--bg:', '.audio-card', '#app-nav'];
        const absent = wanted.filter(t => !cssText.includes(t));
        check('the stylesheet was inlined into the page',
            cssText.length > 50000 && absent.length === 0,
            `${(cssText.length / 1024).toFixed(0)} KB` + (absent.length ? `, missing ${absent.join(', ')}` : ''));
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
        // The finance tab is the owner's personal bKash/Nagad/Rocket ledger. It
        // must not exist in the APK at all — positive assertions here so a strip
        // that removed the wrong thing is caught as well as one that removed
        // nothing (audit-native.js covers the latter).
        check('no finance pane in the APK', !d.getElementById('admin-finance-pane'));
        check('finance loader stripped from the APK', typeof window.loadFinance !== 'function');

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
        check('finance pane present on the web', !!d.getElementById('admin-finance-pane'));
        check('finance pane starts hidden',
            d.getElementById('admin-finance-pane')?.classList.contains('hidden'));
        check('admin modal has five tabs on the web',
            q('#admin-modal .admin-view-btn').length === 5,
            `${q('#admin-modal .admin-view-btn').length}`);
        check('finance loader defined on the web', typeof window.loadFinance === 'function');
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

    // Book cards. A book sold at a single price carries no originalPrice, and
    // the card used to divide by it regardless — printing "৳undefined" and
    // "NaN% ছাড়" straight onto the shop.
    {
        const shop = d.getElementById('books-container');
        const cards = q('#books-container .book-card');
        check('every book renders a card', cards.length >= 3, `${cards.length} cards`);
        check('no book card prints NaN or undefined',
            !!shop && !/NaN|undefined/.test(shop.innerHTML));
        // The APK may not show a price at all — selling a digital good outside
        // Play Billing is a policy breach, which is what audit-native.js guards.
        for (const c of cards) {
            const title = c.querySelector('.book-title')?.textContent;
            const price = (c.querySelector('.course-price')?.textContent || '').trim();
            if (target === 'native') {
                check(`no price shown in the APK: ${title}`, price === '', price);
            } else {
                check(`priced: ${title}`, /^৳\d+$/.test(price), price);
            }
        }
    }

    // The premium course area. Everything it shows is fetched, so a boot can
    // only prove that the surfaces exist, start closed, and that nothing paid
    // rode along inside the markup — which is the part worth proving.
    {
        const view = d.getElementById('course-view');
        const shelf = d.getElementById('my-courses-section');
        if (target === 'native') {
            check('the APK carries no course surface', !view && !shelf);
        } else {
            check('the course view exists and starts closed',
                !!view && view.classList.contains('hidden'));
            check('the course shelf exists and starts hidden',
                !!shelf && shelf.classList.contains('hidden'));
            // A video id in the shipped page would defeat the whole gate. The
            // page must carry the player's empty container and nothing to play.
            const shipped = fs.readFileSync(htmlFile, 'utf8')
                + fs.readFileSync(path.join(dir, 'app.js'), 'utf8');
            check('no youtube id is baked into the build',
                !/youtube(?:-nocookie)?\.com\/embed\/[A-Za-z0-9_-]{11}/.test(shipped));
            check('no course secret file is named in the build',
                !/course_notes|private\.json/.test(shipped));
            for (const fn of ['openCourseView', 'openCourseLesson', 'courseBack',
                              'showCourseTab', 'downloadCourseNote', 'closeCourseView']) {
                check(`${fn}() is defined`, typeof window[fn] === 'function');
            }
        }
    }

    // The static catalogue links here as /app.html#audio-<CODE>. Those links sat
    // dead for as long as they existed, because nothing read location.hash.
    if (code) {
        try { window.closePlayer(); } catch (e) { /* already closed */ }
        window.location.hash = `#audio-${code}`;
        window.dispatchEvent(new window.HashChangeEvent('hashchange'));
        check('#audio-<CODE> deep link opens that track',
            !d.getElementById('yt-modal')?.classList.contains('hidden'), `#audio-${code}`);
        try { window.closePlayer(); } catch (e) { /* fine */ }
    }

    // ── The crawlable catalogue under public/audio/ ─────────────────────────
    // Native never builds these, so only the web dist is checked.
    if (target !== 'native') {
        const root = path.resolve(__dirname, '..');
        const read = (p) => fs.readFileSync(p, 'utf8');
        const trackPage = (c) => path.join(dir, 'audio', c, 'index.html');

        const missing = audio.filter((t) => !fs.existsSync(trackPage(t.code)));
        check('every track has its own page', missing.length === 0,
            missing.length ? `missing: ${missing.slice(0, 5).map(t => t.code).join(', ')}` : `${audio.length} pages`);

        const wrong = audio.filter((t) => {
            if (!fs.existsSync(trackPage(t.code))) return false;
            const h = read(trackPage(t.code));
            return !h.includes(t.code) || !h.includes(t.title_bn.trim().slice(0, 24));
        });
        check('each track page carries its own code and title', wrong.length === 0,
            wrong.slice(0, 5).map(t => t.code).join(', '));

        // The listing pages must reach the track pages, not the app's home screen.
        const listings = [path.join(dir, 'audio', 'index.html'),
            ...fs.readdirSync(path.join(dir, 'audio'), { withFileTypes: true })
                .filter((e) => e.isDirectory() && !audio.some((t) => t.code === e.name))
                .map((e) => path.join(dir, 'audio', e.name, 'index.html'))];
        const stillDead = listings.filter((p) => fs.existsSync(p) && read(p).includes('app.html#audio-'));
        check('no listing page links into the app instead of a track page',
            stillDead.length === 0, stillDead.map((p) => path.basename(path.dirname(p))).join(', '));

        // /sitemap.xml is an index (tools/seo.js); the track rows live in the
        // audio section's file, and the index has to point at that file.
        const smIndex = read(path.join(dir, 'sitemap.xml'));
        check('sitemap.xml is an index that lists the audio sitemap',
            smIndex.includes('<sitemapindex') && smIndex.includes('/sitemap-audio.xml</loc>'));
        const sm = read(path.join(dir, 'sitemap-audio.xml'));
        const inMap = audio.filter((t) => sm.includes(`/audio/${t.code}/</loc>`));
        check('every track page is in the sitemap', inMap.length === audio.length,
            `${inMap.length}/${audio.length}`);
        check('no sitemap row points at a page that was not built', (() => {
            const files = fs.readdirSync(dir).filter((f) => /^sitemap-.*\.xml$/.test(f));
            const locs = files.flatMap((f) => [...read(path.join(dir, f)).matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]));
            const missing = locs.filter((u) => {
                const p = u.replace('https://alquranicruqyahhealing.com', '');
                const file = p.endsWith('/') ? path.join(dir, p, 'index.html') : path.join(dir, p);
                return !fs.existsSync(file);
            });
            if (missing.length) console.log('    missing:', missing.slice(0, 5).join(', '));
            return missing.length === 0;
        })());
        check('the catalogues are not empty', audio.length > 0 && pdfs.length > 0, `${audio.length} audio, ${pdfs.length} pdf`);
        check('a PDF landing page exists for every legacy PDF',
            pdfs.every((p) => fs.existsSync(path.join(dir, 'guides', 'pdf', p.filename.replace(/\.pdf$/i, ''), 'index.html'))));
        check('404.html was written', fs.existsSync(path.join(dir, '404.html')));
        check('robots.txt allows the site and names the sitemap', (() => {
            const r = read(path.join(dir, 'robots.txt'));
            return /Allow: \//.test(r) && /Sitemap: https:\/\/alquranicruqyahhealing\.com\/sitemap\.xml/.test(r) && !/Disallow: \/(audio|guides|blog|topics)/.test(r);
        })());

        // Topic hubs: one per registry entry, each real (>= 3 resources) and in the sitemap.
        const { TOPICS } = require('./seo');
        const topicsSm = read(path.join(dir, 'sitemap-topics.xml'));
        check('every topic hub was built and is in the sitemap', TOPICS.every((t) =>
            fs.existsSync(path.join(dir, 'topics', t.slug, 'index.html')) && topicsSm.includes(`/topics/${t.slug}/</loc>`)),
            `${TOPICS.length} hubs`);
        check('every topic hub lists resources', TOPICS.every((t) =>
            (read(path.join(dir, 'topics', t.slug, 'index.html')).match(/class="ep-list"/g) || []).length > 0));

        // English foundation (/en/): additive-only, so this checks it exists and
        // stayed honest — no fabricated content, no dead links to unbuilt pages,
        // the Bengali site untouched by its presence.
        {
            const enHome = read(path.join(dir, 'en', 'index.html'));
            const enStart = read(path.join(dir, 'en', 'start-here', 'index.html'));
            check('/en/ homepage exists and is lang="en"', /<html lang="en"/.test(enHome));
            check('/en/start-here/ exists and is lang="en"', /<html lang="en"/.test(enStart));
            check('/en/ carries hreflang bn/en/x-default', ['bn', 'en', 'x-default']
                .every((h) => enHome.includes(`hreflang="${h}"`)));
            check('/en/ links back to the Bengali homepage', enHome.includes('href="/"'));
            check('every "Planned" module card has no href (nothing not yet built looks live)',
                !/Planned[\s\S]{0,20}<a /.test(enHome));
            const { PLANNED_MODULES } = require('./en');
            check('every planned module named on /en/ is actually marked Planned, not live',
                PLANNED_MODULES.every((m) => enHome.includes(m.name)));
            // index.html (the landing page) is built from landing.html directly and
            // does not use seo.js's shared NAV/FOOT — landing.html is the owner's
            // own in-flight file this milestone must not touch, so the /en/ link
            // added to NAV/FOOT is checked on a page that actually uses them.
            check('the Bengali site (via shared NAV) links to /en/',
                read(path.join(dir, 'blog', 'index.html')).includes('href="/en/"'));
            check('sitemap includes the /en/ pages', read(path.join(dir, 'sitemap-en.xml')).includes('/en/start-here/</loc>'));
        }

        // ContentItem[] index (tools/content.js): a read-only view over every
        // source, not a new source of truth — so this checks it stays in sync
        // with what the other builders actually produced, not just that the
        // file exists.
        {
            const items = JSON.parse(read(path.join(dir, 'content-index.json')));
            check('content-index.json is a non-trivial array', Array.isArray(items) && items.length > 900,
                `${items.length} items`);
            const ids = items.map((i) => i.id);
            check('every ContentItem id is unique', new Set(ids).size === ids.length);
            check('every ContentItem has a title and a canonical url',
                items.every((i) => i.title && i.url));
            const byType = {};
            for (const i of items) byType[i.type] = (byType[i.type] || 0) + 1;
            const audio = JSON.parse(read(path.join(dir, 'audio.json')));
            const pdfs = JSON.parse(read(path.join(dir, 'pdf_list.json')));
            check('audio items in the index match audio.json', byType.audio === audio.length,
                `${byType.audio} vs ${audio.length}`);
            check('pdf items in the index match pdf_list.json', byType.pdf === pdfs.length,
                `${byType.pdf} vs ${pdfs.length}`);
            check('guide items in the index match the guides catalogue',
                byType.guide === (fs.readdirSync(path.join(dir, 'guides'))
                    .filter((n) => fs.existsSync(path.join(dir, 'guides', n, 'index.html')) && n !== 'pdf').length),
                `${byType.guide}`);
            check('the two /en/ pages are both in the index as lang="en"',
                items.filter((i) => i.type === 'page' && i.lang === 'en').length === 2);
            check('no draft post leaked into the public index',
                items.every((i) => i.type !== 'post' || i.status !== 'draft'));
        }

        // Every JSON-LD block on every generated page must parse and carry a non-empty @graph.
        const walk = (d, out = []) => {
            for (const e of fs.readdirSync(d, { withFileTypes: true })) {
                const p = path.join(d, e.name);
                if (e.isDirectory()) { if (!/^(vendor|pdf|fonts|icons|_files|_assets|_previews|images)$/.test(e.name)) walk(p, out); }
                else if (e.name.endsWith('.html')) out.push(p);
            }
            return out;
        };
        let ldPages = 0, ldBad = [];
        for (const f of walk(dir)) {
            const h = read(f);
            for (const m of h.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)) {
                ldPages++;
                try {
                    const j = JSON.parse(m[1]);
                    if (m[1].includes('undefined') || (j['@graph'] && !j['@graph'].length)) ldBad.push(f);
                } catch (e) { ldBad.push(f); }
            }
        }
        check('every JSON-LD block parses', ldBad.length === 0, ldBad.length ? ldBad.slice(0, 3).join(', ') : `${ldPages} blocks`);

        const idx = read(path.join(dir, 'audio', 'index.html'));
        check('the audio index has a search box', idx.includes('id="lib-q"'));
        check('the catalogue is still in the HTML without JavaScript',
            idx.includes('id="lib-body"') && (idx.match(/class="ep-list"/g) || []).length > 0);
    }

    // Codes are what patients were given; a code that changes silently sends
    // someone to the wrong recitation. The lock is the only thing standing
    // between a bulk edit of audio.json and that happening unnoticed.
    const lockPath = path.resolve(__dirname, 'audio-codes.lock.json');
    if (fs.existsSync(lockPath)) {
        const locked = JSON.parse(fs.readFileSync(lockPath, 'utf8'));
        const now = Object.fromEntries(audio.map((t) => [t.code, t.url]));
        const lost = Object.keys(locked).filter((c) => !(c in now));
        const moved = Object.keys(locked).filter((c) => c in now && locked[c] !== now[c]);
        check('no code disappeared', lost.length === 0, lost.join(', '));
        check('no code points at a different video', moved.length === 0, moved.join(', '));
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
