const fs = require('fs');
const path = require('path');

// Two products come out of one source tree:
//
//   --target=web    -> public/       the Vercel site, unchanged from before
//   --target=native -> native/       what Capacitor packs into the APK
//
// They differ in two ways. Size: the APK cannot carry pdf/ (134 MB) or the
// generated blog, so the native build simply doesn't copy them and fetches
// those bytes from the live site instead. Policy: Play forbids selling digital
// goods outside Play Billing, so every price, buy button and bKash number has
// to be *absent* from the APK, not merely hidden — a reviewer unzips the
// bundle. Markup is therefore cut at build time (see stripMarkers), and so is
// the purchase code itself (see stripJsMarkers) — but only whole, self-contained
// top-level assignments, and the result is parse-checked before it is written.
// Everything else stays gated at runtime on IS_NATIVE, because regex-surgery on
// a 4,300-line global-scope file is how you ship a syntax error.

const target = (process.argv.find(a => a.startsWith('--target=')) || '--target=web').split('=')[1];
if (target !== 'web' && target !== 'native') {
    console.error(`Unknown --target "${target}". Use --target=web or --target=native.`);
    process.exit(1);
}
const isNative = target === 'native';

const outName = isNative ? 'native' : 'public';
const distDir = path.join(__dirname, outName);

console.log(`Building Ruqyah Audio App [target: ${target}] -> ${outName}/`);

if (fs.existsSync(distDir)) {
    console.log(`Cleaning existing ${outName} folder...`);
    fs.rmSync(distDir, { recursive: true, force: true });
}
fs.mkdirSync(distDir, { recursive: true });

// Regions of index.html wrapped in
//     <!-- #web-only --> ... <!-- /#web-only -->
// are cut from the native build, and vice versa for #native-only. An opening
// marker may carry a trailing comment explaining itself, so the pattern only
// anchors on the tag name.
function stripMarkers(html, tag) {
    const re = new RegExp(`<!--\\s*#${tag}\\b[\\s\\S]*?<!--\\s*/#${tag}\\s*-->`, 'g');
    return html.replace(re, '');
}

// The match above is non-greedy, so a nested pair of the same tag ends the
// OUTER region early: everything between the inner close and the outer close
// survives, and the outer closing marker is left behind as a stray. That
// produces unbalanced HTML and no error at all — it cost an afternoon once.
// Markers must therefore alternate strictly open, close, open, close.
function assertMarkersWellFormed(html, tag, srcFile) {
    const re = new RegExp(`<!--\\s*(/?)#${tag}\\b[^>]*-->`, 'g');
    let depth = 0, m;
    while ((m = re.exec(html)) !== null) {
        const line = html.slice(0, m.index).split('\n').length;
        if (m[1] === '/') {
            if (--depth < 0) {
                console.error(`\n❌ ${srcFile}:${line} — closing #${tag} marker with nothing open.`);
                process.exit(1);
            }
        } else if (++depth > 1) {
            console.error(`\n❌ ${srcFile}:${line} — #${tag} region opened inside another one.`);
            console.error('   Nested markers of the same tag silently truncate the outer region.');
            console.error('   Remove the inner pair; the outer region already covers it.');
            process.exit(1);
        }
    }
    if (depth !== 0) {
        console.error(`\n❌ ${srcFile} — ${depth} unclosed #${tag} region(s).`);
        process.exit(1);
    }
}

// The stylesheet is authored as styles/*.css and inlined into a single <style>
// here, replacing the run of <link> tags in the source. Two reasons it is
// inlined rather than shipped as a file:
//
//   - service-worker.js is network-first on the app shell and cache-first on
//     everything else. A separate stylesheet would fall on the cache-first
//     side, making CSS the one asset a fix could never reach on a device that
//     already has the app.
//   - it is one fewer request on a cold start, and on the phone that start is
//     the whole first impression.
//
// Order is the filename order, and it is load-bearing: 01-base.css defines the
// custom properties everything after it reads. Splitting on any other basis —
// by feature, alphabetically by selector — would need @layer to stay correct.
const STYLE_LINKS = /(?:[ \t]*<link rel="stylesheet" href="styles\/[^"]+">\r?\n)+/;

function inlineStyles(html, srcFile) {
    if (!STYLE_LINKS.test(html)) {
        // Not a warning. Every stylesheet rule in the app is in those files, so
        // a build that quietly skipped them would produce an unstyled page and
        // say nothing about it.
        console.error(`\n❌ ${srcFile} has no <link rel="stylesheet" href="styles/...">.`);
        console.error('   build.js inlines styles/*.css there; without the tags the page has no CSS.');
        process.exit(1);
    }
    const dir = path.join(__dirname, 'styles');
    const files = fs.existsSync(dir)
        ? fs.readdirSync(dir).filter(f => f.endsWith('.css')).sort()
        : [];
    if (!files.length) {
        console.error('\n❌ styles/ is missing or has no .css files.');
        console.error('   Every rule in the app lives there; the built page would have no CSS at all.');
        process.exit(1);
    }
    // The build inlines whatever is on disk, so a new file always reaches both
    // outputs. What drifts is index.html's own <link> list, which is the only
    // thing that styles the page when it is opened straight from the repo —
    // and a rule that works in the build but not in the source file is a
    // uniquely confusing thing to debug.
    const linked = [...html.matchAll(/href="styles\/([^"]+)"/g)].map(m => m[1]);
    const missing = files.filter(f => !linked.includes(f));
    const extra = linked.filter(f => !files.includes(f));
    if (missing.length || extra.length) {
        console.error(`\n❌ ${srcFile}'s <link> tags do not match styles/.`);
        if (missing.length) console.error(`   on disk but not linked: ${missing.join(', ')}`);
        if (extra.length) console.error(`   linked but not on disk: ${extra.join(', ')}`);
        process.exit(1);
    }

    let css = files.map(f => fs.readFileSync(path.join(dir, f), 'utf8')).join('\n');
    // CSS comments and the JS marker syntax are the same shape, so the same
    // stripper works. It has to run here rather than in buildHtml: the styles
    // are inlined AFTER the markup is stripped, so rules for markup that was
    // just cut would otherwise ride along into the APK — which is how the
    // install banner's styles survived while its markup did not.
    css = stripJsMarkers(css, isNative ? 'web-only' : 'native-only');
    // Re-indented to sit inside <style> exactly as the hand-written block did,
    // so the built output is unchanged by the extraction.
    const indented = css.split('\n').map(l => (l.trim() ? '        ' + l : l)).join('\n');
    return html.replace(STYLE_LINKS, `    <style>\n${indented}\n    </style>\n`);
}

function buildHtml(srcFile, destFile) {
    let html = fs.readFileSync(path.join(__dirname, srcFile), 'utf8');
    const before = html.length;
    assertMarkersWellFormed(html, 'web-only', srcFile);
    assertMarkersWellFormed(html, 'native-only', srcFile);
    html = stripMarkers(html, isNative ? 'web-only' : 'native-only');
    const stripped = before - html.length;
    // After stripping, so a #web-only region can never contain the link block.
    const afterStrip = html.length;
    if (srcFile === 'index.html') html = inlineStyles(html, srcFile);
    const inlined = html.length - afterStrip;
    fs.writeFileSync(path.join(distDir, destFile), html);
    // Reported separately: stripping removes markup and inlining adds CSS, and
    // netting them off produced a single "stripped -120 KB" that read as a bug.
    const note = [
        stripped ? `stripped ${(stripped / 1024).toFixed(1)} KB` : '',
        inlined ? `+${(inlined / 1024).toFixed(1)} KB css` : '',
    ].filter(Boolean).join(', ');
    console.log(`Built ${srcFile} -> ${outName}/${destFile}` + (note ? ` (${note})` : ''));
}

// The web root must be the marketing page, but Vercel checks the filesystem
// before it applies rewrites — a public/index.html would always beat the
// /app -> /app.html rewrite. So on web the landing page IS index.html and the
// app moves to app.html.
//
// The APK has no marketing page at all: index.html is the app itself. That
// removes the landing->app redirect flash on cold start, and keeps every price
// and bKash section in landing.html out of the bundle entirely.
if (isNative) {
    buildHtml('index.html', 'index.html');
} else {
    buildHtml('landing.html', 'index.html');
    buildHtml('index.html', 'app.html');
}

// Read by app.js before anything else runs, so IS_NATIVE is known at load.
fs.writeFileSync(
    path.join(distDir, 'build-flags.js'),
    `// Generated by build.js — do not edit.\nwindow.BUILD_TARGET = ${JSON.stringify(target)};\n`
);
console.log(`Wrote ${outName}/build-flags.js (BUILD_TARGET=${target})`);

// The JS counterpart of stripMarkers. Regions of app.js wrapped in
//     /* #web-only */ ... /* /#web-only */
// are cut from the native build. Only ever wrap complete top-level statements —
// a marker that starts inside a function or a template literal produces broken
// output — and note that the result is fed to new Function() below, so a
// mistake fails the build here rather than at runtime on someone's phone.
function stripJsMarkers(js, tag) {
    const re = new RegExp(`/\\*\\s*#${tag}\\b[\\s\\S]*?/\\*\\s*/#${tag}\\s*\\*/`, 'g');
    return js.replace(re, '');
}

function buildJs(srcFile, destFile) {
    let js = fs.readFileSync(path.join(__dirname, srcFile), 'utf8');
    const before = js.length;
    js = stripJsMarkers(js, isNative ? 'web-only' : 'native-only');
    if (js.length !== before) {
        // Parse, do not execute: new Function compiles the body and throws a
        // SyntaxError on malformed output, without touching the DOM globals
        // app.js expects.
        try {
            new Function(js);
        } catch (err) {
            console.error(`\n❌ ${srcFile} does not parse after marker stripping: ${err.message}`);
            console.error('   A /* #web-only */ region probably opens or closes mid-statement.');
            process.exit(1);
        }
    }
    fs.writeFileSync(path.join(distDir, destFile), js);
    const saved = before - js.length;
    console.log(`Built ${srcFile} -> ${outName}/${destFile}` + (saved ? ` (stripped ${(saved / 1024).toFixed(1)} KB)` : ''));
}

buildJs('app.js', 'app.js');

const filesToCopy = [
    'audio.json',
    'pdf_list.json',
    'service-worker.js',
    'firebase-config.js',
    'privacy.html',   // Play Store requires a reachable privacy policy URL
];

// The payment numbers live in their own file so they can be withheld from the
// APK outright rather than merely left unreferenced in it.
if (!isNative) filesToCopy.push('payments.js', 'features.html');

// firebase-config.js was committed with every field blank and filled in only on
// one laptop, so CI — which builds from git — produced an APK whose
// FIREBASE_CONFIG had an empty apiKey. Firebase then initialises against
// nothing and every sign-in fails, including email and password. Nothing said
// so; the app simply could not log anybody in. Fail the build instead.
{
    const cfgPath = path.join(__dirname, 'firebase-config.js');
    if (fs.existsSync(cfgPath)) {
        const cfg = fs.readFileSync(cfgPath, 'utf8');
        const key = /apiKey\s*:\s*["']([^"']*)["']/.exec(cfg);
        if (!key || !key[1].trim()) {
            console.error('\n❌ firebase-config.js has no apiKey.');
            console.error('   A build from this checkout cannot authenticate anyone.');
            process.exit(1);
        }
    } else {
        console.error('\n❌ firebase-config.js is missing — sign-in would be dead in this build.');
        process.exit(1);
    }
}

filesToCopy.forEach(name => {
    const src = path.join(__dirname, name);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, path.join(distDir, name));
        console.log(`Copied ${name}`);
    } else {
        console.warn(`Warning: ${name} not found in root.`);
    }
});

// The manifest is one source file, but the app lives at a different path in
// each target: /app.html on the web (the root is the marketing page) and the
// root itself in the APK.
//
// The two products also carry different names. The website is the clinic's
// brand, "Al Quranic Ruqyah Healing"; the Play Store listing is the product,
// "Self Ruqyah". Keeping one name in both places would either put a mouthful on
// the launcher or lose the site's identity in search.
{
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, 'manifest.json'), 'utf8'));
    if (isNative) {
        manifest.id = '/';
        manifest.start_url = './';
        manifest.name = 'Self Ruqyah';
        manifest.short_name = 'Self Ruqyah';
    }
    fs.writeFileSync(path.join(distDir, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
    console.log(`Built manifest.json (start_url ${manifest.start_url})`);
}

function copyDirSync(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        if (entry.isDirectory()) copyDirSync(srcPath, destPath);
        else fs.copyFileSync(srcPath, destPath);
    }
}

// Local launcher/PWA artwork. These used to be hotlinked from icons8, which
// meant the installed app had no icon offline and nothing usable for the store.
const iconsSrc = path.join(__dirname, 'icons');
if (fs.existsSync(iconsSrc)) {
    copyDirSync(iconsSrc, path.join(distDir, 'icons'));
    console.log('Copied icons/');
} else {
    console.warn('Warning: icons/ not found — run `node tools/make_placeholder_icons.js`.');
}

// Self-hosted webfonts, so Bengali renders correctly on a first offline launch.
const fontsSrc = path.join(__dirname, 'fonts');
if (fs.existsSync(fontsSrc)) {
    copyDirSync(fontsSrc, path.join(distDir, 'fonts'));
    console.log('Copied fonts/');
} else {
    console.warn('Warning: fonts/ not found — run `node tools/fetch_fonts.js`.');
}

// pdf.js. Goes into both targets: Android WebView cannot render a PDF at all,
// and desktop browsers disagree about how an <iframe> PDF behaves.
//
// cmaps/ (1.4 MB) is web-only. It matters for CID-keyed fonts, in practice CJK,
// which these guides do not use — so rather than carry it in the APK, app.js
// points cMapUrl at the website for the rare PDF that needs it. standard_fonts/
// ships in both because a PDF that references Helvetica without embedding it is
// ordinary, and that must work offline.
const pdfjsSrc = path.join(__dirname, 'vendor', 'pdfjs');
if (fs.existsSync(pdfjsSrc)) {
    const pdfjsDest = path.join(distDir, 'vendor', 'pdfjs');
    fs.mkdirSync(pdfjsDest, { recursive: true });
    for (const entry of fs.readdirSync(pdfjsSrc, { withFileTypes: true })) {
        if (isNative && entry.name === 'cmaps') continue;
        const from = path.join(pdfjsSrc, entry.name);
        const to = path.join(pdfjsDest, entry.name);
        if (entry.isDirectory()) copyDirSync(from, to);
        else fs.copyFileSync(from, to);
    }
    console.log(`Copied vendor/pdfjs/${isNative ? ' (without cmaps)' : ''}`);
} else {
    console.warn('Warning: vendor/pdfjs/ not found — run `node tools/fetch_pdfjs.js`.');
}

// The whole-site catalogue every web-only builder reads. Assembled once, up
// front, so a blog post can link to a guide and a guide to an audio page
// before either has been written — the builders only write, never discover.
let catalog = null;
function loadCatalog() {
    const readJson = (name, fallback) => {
        const p = path.join(__dirname, name);
        return fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : fallback;
    };
    const audio = readJson('audio.json', []);
    const audioMeta = readJson('audio_meta.json', {});     // tools/fetch_audio_meta.py
    const pdfMeta = readJson('pdf_meta.json', {});         // tools/make_pdf_previews.py
    const pdfs = readJson('pdf_list.json', []).map((p) => ({ ...p, meta: pdfMeta[p.filename] || null }));
    return {
        audio, audioMeta, pdfs,
        guides: require('./tools/guides').readGuides(),
        posts: require('./tools/blog').readPosts(),
        audioSlugs: require('./tools/library').SLUGS,
    };
}

if (isNative) {
    // Everything below is web-only: the blog and the SEO catalogue pages exist
    // for crawlers, and the PDFs are streamed from the live site by the in-app
    // reader. Bundling them was what pushed the old build to 390 MB.
    console.log('Skipping blog, SEO catalogue and pdf/ — native build streams those.');
} else {
    const seo = require('./tools/seo');
    catalog = loadCatalog();

    // Blog: posts/*.md -> public/blog/<slug>/index.html (+ JSON the app reads)
    require('./tools/blog').buildBlog(distDir, catalog);

    // The Ruqyah documents: guides_src/*.html -> public/guides/<slug>/index.html.
    // Must run before buildLibrary, which writes the index that links to them.
    require('./tools/guides').buildGuides(distDir, catalog, catalog.audioSlugs);

    // Crawlable catalogue pages for the audio library, the PDF guides and the
    // topic hubs, which otherwise exist only inside app.html's JavaScript where
    // no crawler sees them. Also writes 404.html.
    require('./tools/library').buildLibrary(distDir, catalog);

    // The English-first international platform's foundation: /en/. Additive
    // only — it reads the same catalogue, links back to the Bengali site for
    // everything not yet built in English, and never touches a Bengali URL.
    require('./tools/en').buildEn(distDir, catalog);

    // The hand-written pages. The landing page is the one URL that should win
    // for the brand; app.html is the product itself and gets a canonical of
    // its own in index.html.
    // The landing page changes when its source or the counts it quotes change.
    const home = seo.contentDates('/', {
        src: fs.readFileSync(path.join(__dirname, 'landing.html'), 'utf8'),
        audio: catalog.audio.length, docs: catalog.guides.items.length + catalog.pdfs.length,
    });
    seo.sitemapAdd('pages', `${seo.SITE}/`, { lastmod: home.modified, changefreq: 'weekly', priority: '1.0' });
    seo.sitemapAdd('pages', `${seo.SITE}/app.html`, { changefreq: 'weekly', priority: '0.6' });
    seo.sitemapAdd('pages', `${seo.SITE}/features.html`, { changefreq: 'monthly', priority: '0.4' });
    seo.sitemapAdd('pages', `${seo.SITE}/privacy.html`, { changefreq: 'yearly', priority: '0.2' });
    seo.writeSitemaps(distDir);
    seo.saveDates();

    // One normalized ContentItem[] over every source above — the keystone for
    // search, RAG and i18n (ARCHITECTURE.md §4.3). Read-only; nothing above is
    // migrated or changed by this running.
    const content = require('./tools/content');
    content.writeContentIndex(distDir, content.buildContentItems(catalog));

    const pdfSrc = path.join(__dirname, 'pdf');
    if (fs.existsSync(pdfSrc)) {
        console.log('Copying pdf directory recursively to public/pdf...');
        copyDirSync(pdfSrc, path.join(distDir, 'pdf'));
    } else {
        console.warn('Warning: pdf directory not found in root.');
    }
}

function dirSize(dir) {
    let total = 0;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const p = path.join(dir, entry.name);
        total += entry.isDirectory() ? dirSize(p) : fs.statSync(p).size;
    }
    return total;
}

const escHtml = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// The landing page's reviews are baked in, not fetched: see tools/export_reviews.js
// for why. This fills the two placeholders left in landing.html — the visible
// section, and the aggregateRating on each product in the structured data.
function injectReviews(data) {
    const file = path.join(distDir, 'index.html');
    let html = fs.readFileSync(file, 'utf8');

    // A rating Google shows in search results has to be a rating a visitor can
    // see on the page. Where there is no review there is no markup — inventing
    // one is both a lie and a manual action waiting to happen.
    html = html.replace(/,\s*"aggregateRating":"@@RATING:([a-z-]+)@@"/g, (_, target) => {
        const t = data.targets && data.targets[target];
        if (!t || !t.count) return '';
        return `,"aggregateRating":{"@type":"AggregateRating","ratingValue":"${t.avg}",`
             + `"reviewCount":"${t.count}","bestRating":"5","worstRating":"1"}`;
    });

    const items = (data.items || []).slice(0, 6);
    if (!items.length) {
        html = html.replace('<!--REVIEWS_SECTION-->', '');
    } else {
        const stars = (n) => '★'.repeat(n) + '☆'.repeat(5 - n);
        const cards = items.map((r) => `
      <figure class="rev">
        <div class="rev-stars" aria-label="${r.rating} / ৫">${stars(r.rating)}</div>
        <blockquote>${escHtml(r.review)}</blockquote>
        <figcaption>${escHtml(r.name)}</figcaption>
      </figure>`).join('');
        html = html.replace('<!--REVIEWS_SECTION-->', `
<section id="reviews">
  <div class="wrap">
    <div class="sec-head">
      <span class="eyebrow">যাঁরা ব্যবহার করেছেন</span>
      <h2>তাঁরা যা বলেছেন</h2>
      <p class="sec-sub">সবগুলোই অ্যাপে লগইন করা ব্যবহারকারীদের লেখা, হুবহু।</p>
    </div>
    <div class="rev-grid">${cards}
    </div>
  </div>
</section>`);
    }

    fs.writeFileSync(file, html);
    console.log(`Reviews: ${items.length} shown on the landing page, `
              + `${Object.keys(data.targets || {}).length} product rating(s) in structured data`);
}

// The landing page quotes how much the library holds. Those numbers used to be
// typed by hand and were two library expansions out of date ("২৭৮টি অডিও" when
// audio.json had 389). landing.html now carries @@N_...@@ placeholders that
// are filled from the catalogue, so the page cannot drift from the data.
//
// The FAQ section is real, visible <details> question/answer pairs, so it
// also gets FAQPage structured data — built from the rendered markup rather
// than a second copy of the text, which is the only way the two stay equal.
function injectLanding() {
    const file = path.join(distDir, 'index.html');
    let html = fs.readFileSync(file, 'utf8');
    const bn = (n) => String(n).replace(/\d/g, (d) => '০১২৩৪৫৬৭৮৯'[+d]);
    const counts = {
        N_AUDIO: catalog.audio.length,
        N_AUDIO_CATS: new Set(catalog.audio.map((t) => t.category)).size,
        N_GUIDES: catalog.guides.items.length,
        N_PDF: catalog.pdfs.length,
        N_DOCS: catalog.guides.items.length + catalog.pdfs.length,
        N_POSTS: catalog.posts.length,
    };
    html = html.replace(/@@(N_[A-Z_]+)@@/g, (m, k) => {
        if (!(k in counts)) throw new Error(`landing.html: unknown placeholder ${m}`);
        return bn(counts[k]);
    });

    const strip = (s) => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    const faqs = [...html.matchAll(/<details>\s*<summary>([\s\S]*?)<\/summary>\s*([\s\S]*?)<\/details>/g)]
        .map((m) => ({ q: strip(m[1]), a: strip(m[2]) })).filter((f) => f.q && f.a);
    if (faqs.length) {
        const faqLd = { '@context': 'https://schema.org', '@type': 'FAQPage',
            mainEntity: faqs.map((f) => ({ '@type': 'Question', name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a } })) };
        html = html.replace('</head>', `<script type="application/ld+json">${JSON.stringify(faqLd)}</script>\n</head>`);
    }
    fs.writeFileSync(file, html);
    console.log(`Landing: counts ${Object.entries(counts).map(([k, v]) => `${k}=${v}`).join(' ')}, FAQPage with ${faqs.length} questions`);
}

(async () => {
    if (!isNative) {
        injectLanding();
        injectReviews(await require('./tools/export_reviews').exportReviews());
    }

    const sizeMb = dirSize(distDir) / (1024 * 1024);
    console.log(`✅ Build completed — ${outName}/ is ${sizeMb.toFixed(1)} MB`);

    // Play's ceiling is 200 MB for an AAB and the whole point of the native target
    // is to stay nowhere near it. Fail loudly rather than discover this at upload.
    if (isNative && sizeMb > 20) {
        console.error(`\n❌ native/ is ${sizeMb.toFixed(1)} MB — expected well under 20 MB.`);
        console.error('   Something large is being copied into the APK bundle again.');
        process.exit(1);
    }
})();
