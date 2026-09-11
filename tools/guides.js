// guides_src/*.html -> public/guides/<slug>/index.html
//
// 97 finished Ruqyah documents (5 articles, 40 topic protocols, 21 আয়াত সিরিজ,
// 30 আয়াত সংকলন, plus the hand-maintained ones in manual.json) produced by
// the separate "ruqyah pdf maker" engine. They arrive as complete standalone
// A4 documents — own <head>, own inline <style>, own print rules — so unlike
// the blog these are not templated. This builder only relocates them:
//
//   - the two different relative font paths become one absolute URL, so the
//     3.3 MB base64 font sheet is fetched once and cached across all pages
//   - the "← সব রুকইয়াহ গাইডলাইন" link points at /guides/ instead of a sibling
//     index.html that does not exist here
//   - the PDF download link is repointed at /guides/_files/, and the file itself
//     is copied out of guides_src/files/ — where tools/watermark_pdfs.py has
//     already stamped and locked it. Only the documents' own PDFs ship: the
//     engine's output/pdf/ also holds PDFs with no published page and a 24 MB
//     781-page master book.
//   - the DOCX button is removed. A .docx cannot hold a watermark past one save,
//     so it is not published at all.
//   - canonical/OG/JSON-LD/favicon are injected, which the source has no way to
//     know, with real dates from tools/content-dates.json
//   - a breadcrumb trail and an "এই বিষয়ে আরও" block (the audio, PDFs and blog
//     posts on the same topic, from the registry in tools/seo.js) are added
//     around the document. Both are hidden in print and inside the app's
//     embedded frame, where the app supplies its own chrome.
//
// Why per-slug pages rather than appending to pdf_list.json: the legacy PDF
// guides are files, not text pages — a raw PDF has no title/description to
// index and no HTML to give a proper article URL. These documents are real
// text pages; giving them real URLs is the whole point of publishing them as
// HTML.

const fs = require('fs');
const path = require('path');
const seo = require('./seo');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'guides_src');
const { SITE, SITE_NAME, AUTHOR, esc } = seo;

// The engine emits "<name> — রুকইয়াহ প্রোটোকল | রাকী ফয়সাল আহমেদ সাবিত" and
// "<name> — আয়াত সংকলন | ...". Only <name> belongs in a link on an index that
// already says both of those things in its own heading.
function shortTitle(fullTitle) {
    return fullTitle
        .split('|')[0]
        .replace(/\s*—\s*(রুকইয়াহ প্রোটোকল|আয়াত সংকলন)\s*$/, '')
        .trim();
}

function extract(html, slug) {
    const title = /<title>([^<]*)<\/title>/.exec(html);
    const desc = /<meta\s+name="description"\s+content="([^"]*)"/.exec(html);
    if (!title) throw new Error(`guides_src/${slug}.html has no <title>`);
    if (!desc) throw new Error(`guides_src/${slug}.html has no meta description`);
    return { fullTitle: title[1].trim(), desc: desc[1].trim() };
}

// The web-only furniture injected around the document. The document's own
// stylesheet defines --indigo (its dark header colour) and loads Hind
// Siliguri, so the block matches the sticky .web-nav bar above it.
const EMBED_CSS = `<style>
.web-crumbs{background:var(--indigo,#1c2340);color:#d9d6cc;font-family:"Hind Siliguri",sans-serif;font-size:13px;padding:6px 18px 10px;margin-top:-1px}
.web-crumbs ol{list-style:none;margin:0;padding:0;display:flex;flex-wrap:wrap;gap:2px 6px}
.web-crumbs li+li::before{content:"›";margin-right:6px;opacity:.6}
.web-crumbs a{color:#fffdf5;text-decoration:none}.web-crumbs a:hover{text-decoration:underline}
.web-related{background:var(--indigo,#1c2340);color:#fffdf5;font-family:"Hind Siliguri",sans-serif;padding:26px 18px 34px;margin-top:24px}
.web-related .in{max-width:860px;margin:0 auto}
.web-related h2{font-size:18px !important;margin:0 0 14px !important;color:#fffdf5 !important;font-weight:700;border:0 !important;padding:0 !important;background:none !important}
.web-related h3{font-size:12px !important;letter-spacing:.04em;opacity:.75;margin:16px 0 6px !important;font-weight:700;color:#fffdf5 !important;border:0 !important;padding:0 !important;background:none !important}
.web-related ul{list-style:none;margin:0;padding:0;display:grid;gap:6px}
.web-related li a{display:block;padding:9px 12px;border:1px solid rgba(255,253,245,.18);border-radius:8px;color:#fffdf5;text-decoration:none;font-size:14px;line-height:1.45}
.web-related li a:hover{border-color:var(--gold-light,#e8c877);color:var(--gold-light,#e8c877)}
.web-related li a small{display:block;opacity:.7;font-size:12px}
.web-related .more{display:inline-block;margin-top:12px;color:var(--gold-light,#e8c877);font-weight:700;text-decoration:none;font-size:14px}
html.app-embed .web-nav,html.app-embed .web-crumbs,html.app-embed .web-related{display:none}
@media print{.web-crumbs,.web-related{display:none}}
</style>
<script>if(location.search.indexOf('app=1')>-1)document.documentElement.className+=' app-embed'</script>`;

// The related block reuses seo.relatedHtml's markup but restyled for the
// document's cream/indigo palette rather than the site's dark theme.
function relatedBlock(topics, catalog, self, audioSlugs) {
    const html = seo.relatedHtml(topics, catalog, self, { audioSlugs });
    if (!html) return '';
    return `<aside class="web-related"><div class="in">${html
        .replace(/<section class="rel">/g, '<section>')
        .replace(/class="rel-more"/g, 'class="more"')}</div></aside>`;
}

// Each rewrite asserts it actually matched. A silent no-op here ships a page
// with a dead font link or a dead download button, which is exactly the class of
// bug that is invisible until someone opens the page on their phone.
function rewrite(html, slug, meta, ctx) {
    const canonical = `${SITE}/guides/${slug}/`;
    let out = html;

    const fonts = /href="(?:\.\.\/)?assets\/fonts\.css"/g;
    if (!fonts.test(out)) throw new Error(`${slug}: no assets/fonts.css link to rewrite`);
    out = out.replace(fonts, 'href="/guides/_assets/fonts.css"');

    const home = /(<a class="home" )href="index\.html"/;
    if (!home.test(out)) throw new Error(`${slug}: no <a class="home"> back-link to rewrite`);
    out = out.replace(home, '$1href="/guides/"');

    // The DOCX button goes, whole anchor and all. An editable source file cannot
    // carry a watermark that survives one save, so those are not published — see
    // tools/watermark_pdfs.py.
    const docx = /\s*<a href="(?:\.\.\/)+docx\/[^"]+\.docx">[^<]*<\/a>/g;
    out = out.replace(docx, '');

    // Three shapes reach the same place, because /guides/_files/ is flat:
    //   topics       ../pdf/<slug>.pdf
    //   collections  ../../pdf/alroqya/<slug>.pdf
    //   articles     ../../pdf/articles/<slug>.pdf
    // An article links its own PDF and also the PDF of the protocol it discusses,
    // so more than one is normal; a document with none has lost its download.
    const pdf = /href="(?:\.\.\/)+pdf\/(?:[\w-]+\/)?([^"/]+\.pdf)"/g;
    const linked = new Set();
    out = out.replace(pdf, (_m, file) => {
        linked.add(file);
        return `href="/guides/_files/${file}"`;
    });
    if (!linked.size) throw new Error(`${slug}: no PDF download link found`);

    // Articles link the protocol they discuss (../ayat-badnazar-hasad-series.html).
    // In the folder-per-slug layout that sibling path resolves nowhere.
    const crossLinks = [];
    out = out.replace(/href="(?:\.\.\/)+([\w-]+)\.html"/g, (_m, target) => {
        crossLinks.push(target);
        return `href="/guides/${target}/"`;
    });
    // Links only — some collection pages name the engine's original .docx source
    // in their attribution prose ("মূল ফাইল: sabit special alroqya.docx"), which
    // is a credit, not something a reader can download.
    if (/href="[^"]*\.docx"/.test(out)) throw new Error(`${slug}: a .docx link survived`);

    // Dates: the source file's bytes are the content. A document the engine
    // regenerates unchanged keeps its dates; one that changed is marked
    // modified today. First-seen dates were seeded from git history.
    const dates = seo.contentDates(`/guides/${slug}/`, html);
    const trail = seo.crumbs([seo.HOME_CRUMB, { name: 'গাইড', url: '/guides/' },
                              { name: meta.category, url: `/guides/#${seo.guideCatId(meta.category)}` },
                              { name: meta.shortTitle, url: canonical }]);
    const ld = {
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article', '@id': `${canonical}#article`,
                headline: meta.fullTitle.split('|')[0].trim(),
                name: meta.shortTitle,
                description: meta.desc,
                url: canonical, mainEntityOfPage: canonical,
                inLanguage: 'bn',
                image: seo.OG_FALLBACK,
                datePublished: dates.published, dateModified: dates.modified,
                author: { '@type': 'Person', '@id': seo.AUTHOR_ID, name: AUTHOR },
                publisher: { '@type': 'Organization', '@id': seo.ORG_ID, name: SITE_NAME, url: SITE, logo: { '@type': 'ImageObject', url: seo.LOGO } },
                articleSection: meta.category,
                isAccessibleForFree: true,
                ...(meta.pdf ? { associatedMedia: { '@type': 'MediaObject', contentUrl: `${SITE}/guides/_files/${meta.pdf}`, encodingFormat: 'application/pdf' } } : {}),
            },
            trail.ld,
        ],
    };

    const head = `${EMBED_CSS}
<link rel="canonical" href="${canonical}">
<link rel="icon" href="${seo.ICON}" type="image/png">
<meta name="author" content="${AUTHOR}">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(meta.fullTitle)}">
<meta property="og:description" content="${esc(seo.metaDesc(meta.desc))}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="bn_BD">
<meta property="og:image" content="${seo.OG_FALLBACK}">
<meta property="article:published_time" content="${dates.published}">
<meta property="article:modified_time" content="${dates.modified}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(meta.fullTitle)}">
<meta name="twitter:description" content="${esc(seo.metaDesc(meta.desc))}">
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>`;
    if (!out.includes('</head>')) throw new Error(`${slug}: no </head>`);
    out = out.replace('</head>', head);

    // Breadcrumbs go right under the document's own sticky web bar.
    const navEnd = /(<nav class="web-nav">[\s\S]*?<\/nav>)/;
    if (!navEnd.test(out)) throw new Error(`${slug}: no <nav class="web-nav"> to hang the breadcrumbs on`);
    out = out.replace(navEnd, `$1\n${trail.html.replace('class="crumbs"', 'class="web-crumbs"')}`);

    // Related resources go after the document, before </body>.
    const related = relatedBlock(seo.topicsForGuide({ slug, category: meta.category }), ctx.catalog, `/guides/${slug}/`, ctx.audioSlugs);
    if (!out.includes('</body>')) throw new Error(`${slug}: no </body>`);
    out = out.replace('</body>', `${related}\n</body>`);

    return { html: out, linked, crossLinks, dates };
}

// Pass 1: what every document is, without writing anything. build.js puts
// this in the catalogue so the blog, audio and PDF pages can link to guides
// before the guide pages themselves are written.
function readGuides() {
    if (!fs.existsSync(SRC)) throw new Error('guides_src/ is missing — nothing to build');
    const cfg = JSON.parse(fs.readFileSync(path.join(SRC, 'guides.json'), 'utf8'));
    const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).sort();
    const items = [];
    for (const file of files) {
        const slug = file.replace(/\.html$/, '');
        // "pdf" is the PDF landing-page namespace under /guides/ (tools/library.js).
        if (slug === 'pdf') throw new Error('guides_src/pdf.html: the slug "pdf" is reserved for /guides/pdf/');

        // An uncategorised slug is a new document nobody classified. Failing here
        // beats quietly dropping it off the index or filing it under "অন্যান্য".
        // There is deliberately no prefix fallback — see the note in guides.json:
        // the alroqya collections and the jundul series both use ayat-* slugs.
        const category = cfg.slugs[slug];
        if (!category) throw new Error(
            `guides_src/${file}: no category. Add it to guides.json "slugs".`);
        if (!cfg.categories.some((c) => c.bn === category)) {
            throw new Error(`${slug}: category "${category}" is not in guides.json "categories"`);
        }
        const html = fs.readFileSync(path.join(SRC, file), 'utf8');
        const meta = extract(html, slug);
        meta.shortTitle = shortTitle(meta.fullTitle);
        items.push({ slug, url: `/guides/${slug}/`, title_bn: meta.shortTitle, desc: meta.desc, category,
                     fullTitle: meta.fullTitle, html });
    }
    return { items, categories: cfg.categories };
}

// Pass 2. `catalog` is the whole-site catalogue from build.js; `audioSlugs`
// maps audio categories to their URL slugs (tools/library.js SLUGS).
function buildGuides(distDir, catalog, audioSlugs) {
    const { items, categories } = catalog.guides;
    const outDir = path.join(distDir, 'guides');
    fs.mkdirSync(path.join(outDir, '_assets'), { recursive: true });
    fs.mkdirSync(path.join(outDir, '_files'), { recursive: true });
    fs.copyFileSync(path.join(SRC, 'assets', 'fonts.css'),
                    path.join(outDir, '_assets', 'fonts.css'));

    const crossRefs = [];
    const published = new Set(items.map((i) => i.slug));
    const ctx = { catalog, audioSlugs };

    for (const g of items) {
        const meta = { fullTitle: g.fullTitle, desc: g.desc, shortTitle: g.title_bn, category: g.category };
        // The PDF name is needed inside the JSON-LD, so work it out from the
        // links first (cheap regex), then do the real rewrite.
        const linkedNames = [...g.html.matchAll(/href="(?:\.\.\/)+pdf\/(?:[\w-]+\/)?([^"/]+\.pdf)"/g)].map((m) => m[1]);
        meta.pdf = linkedNames.includes(`${g.slug}.pdf`) ? `${g.slug}.pdf` : linkedNames[0];

        const { html: out, linked, crossLinks, dates } = rewrite(g.html, g.slug, meta, ctx);
        for (const target of crossLinks) crossRefs.push([g.slug, target]);
        const dir = path.join(outDir, g.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), out);

        // A download button is worse than no download button if it 404s, so the
        // file every page links has to be on disk before the build is allowed to
        // finish. The engine's naming is regular, but it has drifted before.
        for (const name of linked) {
            const from = path.join(SRC, 'files', name);
            if (!fs.existsSync(from)) throw new Error(
                `${g.slug} links ${name}, but guides_src/files/${name} is missing`);
            fs.copyFileSync(from, path.join(outDir, '_files', name));
        }
        g.pdf = meta.pdf;
        seo.sitemapAdd('guides', `${SITE}/guides/${g.slug}/`, { lastmod: dates.modified, changefreq: 'monthly', priority: '0.8' });
    }

    // An article pointing at a protocol that was never copied here would render
    // as a live link to a 404. Cheaper to fail now than to find it in the wild.
    const dangling = crossRefs.filter(([, target]) => !published.has(target));
    if (dangling.length) throw new Error(
        `cross-links to unpublished documents: `
        + dangling.map(([from, to]) => `${from} -> ${to}`).join(', '));

    // The list the app reads. It is served from the deployment rather than
    // bundled in the APK for the same reason blog/index.json is: a guide
    // published today has to appear in an app installed last month, and the app
    // has no way to update its own bundle between Play releases.
    fs.writeFileSync(
        path.join(outDir, 'index.json'),
        JSON.stringify({ categories, items: items.map(({ slug, url, title_bn, desc, category, pdf }) =>
            ({ slug, url, title_bn, desc, category, pdf })) }));

    // Measured off disk, not accumulated per link: articles link the protocol
    // PDFs too, so summing per document counts those twice.
    const dl = fs.readdirSync(path.join(outDir, '_files'));
    const bytes = dl.reduce(
        (n, f) => n + fs.statSync(path.join(outDir, '_files', f)).size, 0);
    console.log(`Guides: ${items.length} documents -> public/guides/<slug>/, `
              + `${dl.length} downloads (${(bytes / 1048576).toFixed(1)} MB)`);
    return { items, categories };
}

module.exports = { readGuides, buildGuides };
