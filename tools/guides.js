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
//   - the PDF download link is repointed at /guides/_files/, and the file itself
//     is copied out of guides_src/files/ — where tools/watermark_pdfs.py has
//     already stamped and locked it. Only the 70 documents' own PDFs ship: the
//     engine's output/pdf/ also holds 21 PDFs with no published page and a 24 MB
//     781-page master book.
//   - the DOCX button is removed. A .docx cannot hold a watermark past one save,
//     so it is not published at all.
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
    return { html: out.replace('</head>', head), linked, crossLinks };
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
    const crossRefs = [];

    for (const file of files) {
        const slug = file.replace(/\.html$/, '');

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

        const { html: out, linked, crossLinks } = rewrite(html, slug, meta);
        for (const target of crossLinks) crossRefs.push([slug, target]);
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
        }

        items.push({
            slug,
            url: `/guides/${slug}/`,
            title_bn: meta.shortTitle,
            desc: meta.desc,
            category,
        });
    }

    // An article pointing at a protocol that was never copied here would render
    // as a live link to a 404. Cheaper to fail now than to find it in the wild.
    const published = new Set(items.map((i) => i.slug));
    const dangling = crossRefs.filter(([, target]) => !published.has(target));
    if (dangling.length) throw new Error(
        `cross-links to unpublished documents: `
        + dangling.map(([from, to]) => `${from} -> ${to}`).join(', '));

    // Measured off disk, not accumulated per link: articles link the protocol
    // PDFs too, so summing per document counts those twice.
    const dl = fs.readdirSync(path.join(outDir, '_files'));
    const bytes = dl.reduce(
        (n, f) => n + fs.statSync(path.join(outDir, '_files', f)).size, 0);
    console.log(`Guides: ${items.length} documents -> public/guides/<slug>/, `
              + `${dl.length} downloads (${(bytes / 1048576).toFixed(1)} MB)`);
    return { items, categories: cfg.categories };
}

module.exports = { buildGuides };
