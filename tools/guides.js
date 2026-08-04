// guides_src/*.html -> public/guides/<slug>/index.html
//
// 70 finished Ruqyah documents (40 topic protocols + 30 আয়াত সংকলন) produced by
// the separate "ruqyah pdf maker" engine. They arrive as complete standalone A4
// documents — own <head>, own inline <style>, own print rules — so unlike the
// blog these are not templated. This builder only relocates them:
//
//   - the two different relative font paths become one absolute URL, so the
//     3.3 MB base64 font sheet is fetched once and cached across all 70 pages
//   - the "← সব রুকইয়াহ গাইডলাইন" link points at /guides/ instead of a sibling
//     index.html that does not exist here
//   - the PDF/DOCX download links are cut. Those trees are not deployed (127 MB
//     and 1.9 MB), so shipping the buttons would mean 70 pages of 404s.
//   - canonical/OG/JSON-LD are injected, which the source has no way to know
//
// Why per-slug pages rather than appending to pdf_list.json: every one of the 82
// PDF guides collapses to /app.html#pdf (see tools/library.js), so none of them
// is indexable and none can be linked to directly. These 70 are real text pages;
// giving them real URLs is the whole point of publishing them as HTML.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'guides_src');
const SITE = 'https://alquranicruqyahhealing.com';
const SITE_NAME = 'আল কুরআনিক রুকইয়াহ হিলিং';
const AUTHOR = 'রাকী ফয়সাল আহমেদ সাবিত';

const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

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

// Each rewrite asserts it actually matched. A silent no-op here ships a page
// with a dead font link or a dead download button, which is exactly the class of
// bug that is invisible until someone opens the page on their phone.
function rewrite(html, slug, meta) {
    const canonical = `${SITE}/guides/${slug}/`;
    let out = html;

    const fonts = /href="(?:\.\.\/)?assets\/fonts\.css"/g;
    if (!fonts.test(out)) throw new Error(`${slug}: no assets/fonts.css link to rewrite`);
    out = out.replace(fonts, 'href="/guides/_assets/fonts.css"');

    const home = /(<a class="home" )href="index\.html"/;
    if (!home.test(out)) throw new Error(`${slug}: no <a class="home"> back-link to rewrite`);
    out = out.replace(home, '$1href="/guides/"');

    // <span class="dl"> holds only <a> elements, never a nested <span>, so the
    // first </span> is reliably its own.
    const dl = /\s*<span class="dl">[\s\S]*?<\/span>/;
    if (!dl.test(out)) throw new Error(`${slug}: no download block to strip`);
    out = out.replace(dl, '');

    const head = `<link rel="canonical" href="${canonical}">
<meta name="author" content="${AUTHOR}">
<meta name="robots" content="index, follow, max-image-preview:large">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(meta.fullTitle)}">
<meta property="og:description" content="${esc(meta.desc)}">
<meta property="og:type" content="article">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="bn_BD">
<meta property="og:image" content="${SITE}/blog/images/og-default.jpg">
<meta name="twitter:card" content="summary_large_image">
<script type="application/ld+json">${JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'Article',
                headline: meta.fullTitle,
                description: meta.desc,
                url: canonical,
                inLanguage: 'bn',
                author: { '@type': 'Person', name: AUTHOR },
                publisher: { '@type': 'Organization', name: SITE_NAME, url: SITE },
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    { '@type': 'ListItem', position: 1, name: 'হোম', item: `${SITE}/` },
                    { '@type': 'ListItem', position: 2, name: 'গাইড', item: `${SITE}/guides/` },
                    { '@type': 'ListItem', position: 3, name: meta.shortTitle, item: canonical },
                ],
            },
        ],
    })}</script>
</head>`;
    if (!out.includes('</head>')) throw new Error(`${slug}: no </head>`);
    return out.replace('</head>', head);
}

function buildGuides(distDir) {
    if (!fs.existsSync(SRC)) throw new Error('guides_src/ is missing — nothing to build');
    const cfg = JSON.parse(fs.readFileSync(path.join(SRC, 'guides.json'), 'utf8'));

    const outDir = path.join(distDir, 'guides');
    fs.mkdirSync(path.join(outDir, '_assets'), { recursive: true });
    fs.copyFileSync(path.join(SRC, 'assets', 'fonts.css'),
                    path.join(outDir, '_assets', 'fonts.css'));

    const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).sort();
    const items = [];

    for (const file of files) {
        const slug = file.replace(/\.html$/, '');

        // An uncategorised slug is a new document nobody classified. Failing here
        // beats quietly dropping it off the index or filing it under "অন্যান্য".
        let category = cfg.slugs[slug];
        if (!category) {
            const hit = Object.entries(cfg.prefixCategory)
                .find(([p]) => slug.startsWith(p));
            if (!hit) throw new Error(
                `guides_src/${file}: no category. Add it to guides.json "slugs".`);
            category = hit[1];
        }
        if (!cfg.categories.some((c) => c.bn === category)) {
            throw new Error(`${slug}: category "${category}" is not in guides.json "categories"`);
        }

        const html = fs.readFileSync(path.join(SRC, file), 'utf8');
        const meta = extract(html, slug);
        meta.shortTitle = shortTitle(meta.fullTitle);

        const dir = path.join(outDir, slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), rewrite(html, slug, meta));

        items.push({
            slug,
            url: `/guides/${slug}/`,
            title_bn: meta.shortTitle,
            desc: meta.desc,
            category,
        });
    }

    console.log(`Guides: ${items.length} documents -> public/guides/<slug>/`);
    return { items, categories: cfg.categories };
}

module.exports = { buildGuides };
