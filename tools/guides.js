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
//   - the PDF/DOCX download links are repointed at /guides/_files/, and the files
//     themselves are copied out of guides_src/files/. Topic pages link both
//     formats, collection pages only a PDF, exactly as the engine emitted them.
//     Only the 70 documents' own files ship: the engine's output/pdf/ also holds
//     21 PDFs with no published page and a 24 MB 781-page master book.
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

    // Topic pages point at ../pdf/<slug>.pdf and ../docx/<slug>.docx; collection
    // pages at ../../pdf/alroqya/<slug>.pdf. All three become /guides/_files/.
    const dl = /href="(?:\.\.\/)+pdf\/(?:alroqya\/)?([^"]+\.pdf)"|href="(?:\.\.\/)+docx\/([^"]+\.docx)"/g;
    const linked = [];
    out = out.replace(dl, (_m, pdf, docx) => {
        const file = pdf || docx;
        linked.push(file);
        return `href="/guides/_files/${file}"`;
    });
    if (!linked.length) throw new Error(`${slug}: no download links to repoint`);

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
    return { html: out.replace('</head>', head), linked };
}

function buildGuides(distDir) {
    if (!fs.existsSync(SRC)) throw new Error('guides_src/ is missing — nothing to build');
    const cfg = JSON.parse(fs.readFileSync(path.join(SRC, 'guides.json'), 'utf8'));

    const outDir = path.join(distDir, 'guides');
    fs.mkdirSync(path.join(outDir, '_assets'), { recursive: true });
    fs.mkdirSync(path.join(outDir, '_files'), { recursive: true });
    fs.copyFileSync(path.join(SRC, 'assets', 'fonts.css'),
                    path.join(outDir, '_assets', 'fonts.css'));

    const files = fs.readdirSync(SRC).filter((f) => f.endsWith('.html')).sort();
    const items = [];
    let bytes = 0;

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

        const { html: out, linked } = rewrite(html, slug, meta);
        const dir = path.join(outDir, slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), out);

        // A download button is worse than no download button if it 404s, so the
        // file every page links has to be on disk before the build is allowed to
        // finish. The engine's naming is regular, but it has drifted before.
        for (const name of linked) {
            const from = path.join(SRC, 'files', name);
            if (!fs.existsSync(from)) throw new Error(
                `${slug} links ${name}, but guides_src/files/${name} is missing`);
            fs.copyFileSync(from, path.join(outDir, '_files', name));
            bytes += fs.statSync(from).size;
        }

        items.push({
            slug,
            url: `/guides/${slug}/`,
            title_bn: meta.shortTitle,
            desc: meta.desc,
            category,
        });
    }

    const downloads = fs.readdirSync(path.join(outDir, '_files')).length;
    console.log(`Guides: ${items.length} documents -> public/guides/<slug>/, `
              + `${downloads} downloads (${(bytes / 1048576).toFixed(1)} MB)`);
    return { items, categories: cfg.categories };
}

module.exports = { buildGuides };
