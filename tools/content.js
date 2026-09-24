// A read-only normalizer over every existing content source, into one
// ContentItem[] in the canonical shape from PROJECT_MASTER_SPEC.md §4.1.
// See ARCHITECTURE.md §4.3 for the full rationale — short version: search,
// RAG, i18n and the admin panel all need the same normalized view of "every
// piece of content on the platform", and building that view once here is
// cheaper than building it three times inside three different features.
//
// WHAT THIS DELIBERATELY DOES NOT DO: it does not migrate or rewrite any of
// the five source files (audio.json, guides_src, pdf_list.json, posts/*.md,
// tools/en.js's pages) — they keep their shapes forever, exactly as
// ARCHITECTURE.md §4.3 specifies. This is purely a read-side view over them.
// It also does not (yet) cover the course/book catalogue hardcoded in
// app.js's COURSES/BOOKS — a known, separately tracked violation of the
// "no content hardcoded into a component" rule (PROJECT_MASTER_SPEC.md §4.1,
// ROADMAP.md) that this file does not attempt to fix.

const fs = require('fs');
const path = require('path');
const seo = require('./seo');

const { SITE, AUTHOR, topicsForAudio, topicsForGuide, topicsForPdf, topicsForPost, pdfSlug, pdfUrl } = seo;
const ROOT = path.join(__dirname, '..');
const OVERRIDES_FILE = path.join(ROOT, 'content_overrides.json');

// Lets the owner unpublish, reorder, retag, or mark a translation link
// without touching a single HTML/Markdown/JSON source file — keyed by
// "type:slug". Every field is optional; whatever is set here overwrites the
// normalizer's own value for that one item. An empty file (`{}`) is the
// default and changes nothing.
function loadOverrides() {
    if (!fs.existsSync(OVERRIDES_FILE)) return {};
    try {
        return JSON.parse(fs.readFileSync(OVERRIDES_FILE, 'utf8'));
    } catch (e) {
        throw new Error(`content_overrides.json does not parse: ${e.message}`);
    }
}

function applyOverride(item, overrides) {
    const o = overrides[`${item.type}:${item.slug}`];
    if (!o) return item;
    // id/type/slug are the item's identity and never come from the override —
    // letting an override change them would let two different overrides
    // silently rename their items to the same effective type+slug without
    // the duplicate-id check below ever seeing it (each would still carry
    // its own original id).
    const { id: _id, type: _type, slug: _slug, seo: seoOverride, ...rest } = o;
    const seoObj = (seoOverride && typeof seoOverride === 'object' && !Array.isArray(seoOverride)) ? seoOverride : {};
    return { ...item, ...rest, seo: { ...item.seo, ...seoObj } };
}

const baseItem = (fields) => ({
    id: `${fields.type}:${fields.slug}`,
    lang: 'bn',
    description: '',
    category: null,
    topics: [],
    tags: [],
    author: null,
    publishedAt: null,
    updatedAt: null,
    references: [],
    relatedIds: [],
    status: 'published',
    visibility: 'public',
    translationOf: null,
    ...fields,
});

function normalizeAudio(catalog) {
    return (catalog.audio || []).map((a) => baseItem({
        type: 'audio', slug: a.code, source: 'audio.json',
        title: a.title_bn, category: a.category, tags: a.tags || [],
        topics: topicsForAudio(a).map((t) => t.slug),
        seo: { title: a.title_bn, description: '', ogImage: null, canonical: `${SITE}/audio/${a.code}/` },
    }));
}

function normalizeGuides(catalog) {
    const items = (catalog.guides && catalog.guides.items) || [];
    // title is the clean display name (g.title_bn) — the same one
    // relatedHtml() and guides/index.json use elsewhere in the codebase.
    // g.fullTitle is the long, SEO-suffixed <title> tag text ("... | রাকী
    // ফয়সাল আহমেদ সাবিত"), which belongs in seo.title, not the display title.
    return items.map((g) => baseItem({
        type: 'guide', slug: g.slug, source: 'guides_src',
        title: g.title_bn, description: g.desc, category: g.category, author: AUTHOR,
        topics: topicsForGuide(g).map((t) => t.slug),
        seo: { title: g.fullTitle || g.title_bn, description: g.desc, ogImage: null, canonical: `${SITE}/guides/${g.slug}/` },
    }));
}

function normalizePdfs(catalog) {
    return (catalog.pdfs || []).map((p) => {
        const slug = pdfSlug(p.filename);
        return baseItem({
            type: 'pdf', slug, source: 'pdf_list.json',
            title: p.title_bn, category: p.category,
            topics: topicsForPdf(p).map((t) => t.slug),
            seo: { title: p.title_bn, description: '', ogImage: null, canonical: `${SITE}${pdfUrl(p)}` },
        });
    });
}

function normalizePosts(catalog) {
    return (catalog.posts || []).map((p) => baseItem({
        type: 'post', slug: p.slug, source: 'posts/*.md',
        title: p.title, description: p.description, tags: p.tags || [],
        topics: topicsForPost(p).map((t) => t.slug),
        author: AUTHOR,
        publishedAt: p.date || null, updatedAt: p.date || null,
        status: p.draft ? 'draft' : 'published',
        visibility: p.draft ? 'internal' : 'public',
        // tools/blog.js treats a post's own `canonical` frontmatter field as
        // either an absolute URL or a path relative to SITE (see its own
        // canonical logic) — mirrored here, since at least one real post
        // (posts/boi-promo-post-3.md) sets a relative path.
        seo: { title: p.seoTitle || p.title, description: p.description, ogImage: p.cover || null,
               canonical: p.canonical
                   ? (p.canonical.startsWith('http') ? p.canonical : `${SITE}${p.canonical}`)
                   : `${SITE}/blog/${p.slug}/` },
    }));
}

function normalizeCarousels(catalog) {
    return (catalog.carousels || []).map((c) => baseItem({
        type: 'carousel', slug: c.slug, source: 'fawaz-carousel/exports (synced via tools/sync_carousels.py)',
        title: c.title_bn, description: c.caption, category: c.topic || null, tags: c.hashtags || [],
        author: 'শাইখ ফাওয়াজ আল-আসওয়াদ (মাদিনাতুল ইলম)',
        publishedAt: c.published_at || null, updatedAt: c.published_at || null,
        references: c.youtube_url ? [c.youtube_url] : [],
        seo: { title: c.title_bn, description: c.caption, ogImage: `${SITE}/carousels/${c.slug}/${c.images[0]}`,
               canonical: `${SITE}/carousels/${c.slug}/` },
    }));
}

// tools/en.js's two foundation pages. Titles/descriptions come from
// en.pageMeta(catalog) — the same function en.js itself uses to build each
// page's <head> — so this can never drift out of sync with the real pages
// the way a second hand-typed copy of the same strings would (and already
// had, before this was fixed: the home page's description here used to be
// static text, while the real page's description is dynamic, built from
// live catalogue counts).
const EN_PAGE_PATHS = { home: '/en/', startHere: '/en/start-here/' };
const EN_PAGE_SLUGS = { home: 'home', startHere: 'start-here' };

function normalizeEnPages(catalog) {
    const meta = require('./en').pageMeta(catalog);
    return Object.keys(EN_PAGE_PATHS).map((key) => baseItem({
        type: 'page', slug: EN_PAGE_SLUGS[key], source: 'tools/en.js', lang: 'en',
        title: meta[key].title, description: meta[key].desc, author: 'Raqi Faisal Ahmed Sabit',
        seo: { title: meta[key].title, description: meta[key].desc, ogImage: null,
               canonical: `${SITE}${EN_PAGE_PATHS[key]}` },
    }));
}

// catalog: the same object build.js's loadCatalog() assembles — { audio,
// guides, pdfs, posts, ... }. Safe to call at any point after loadCatalog()
// runs; does not depend on any builder having written output yet.
function buildContentItems(catalog) {
    const overrides = loadOverrides();
    const items = [
        ...normalizeAudio(catalog),
        ...normalizeGuides(catalog),
        ...normalizePdfs(catalog),
        ...normalizePosts(catalog),
        ...normalizeCarousels(catalog),
        ...normalizeEnPages(catalog),
    ].map((item) => applyOverride(item, overrides));

    const seen = new Set();
    for (const item of items) {
        if (seen.has(item.id)) throw new Error(`tools/content.js: duplicate ContentItem id ${item.id}`);
        seen.add(item.id);
        if (!item.title) throw new Error(`tools/content.js: ${item.id} has no title`);
        if (!item.seo || !item.seo.canonical) throw new Error(`tools/content.js: ${item.id} has no seo.canonical`);
    }
    return items;
}

// A slim public artifact — real today (counts, coverage, a first search/RAG
// input) rather than only a build-time intermediate nobody can inspect.
// Deliberately excludes full HTML bodies: this is a catalogue, not a mirror
// of the content itself.
function writeContentIndex(distDir, items) {
    const slim = items.map(({ id, type, slug, lang, title, description, category, topics, tags,
                               author, status, visibility, publishedAt, updatedAt, translationOf, seo: s }) =>
        ({ id, type, slug, lang, title, description, category, topics, tags, author, status, visibility,
           publishedAt, updatedAt, translationOf, url: s.canonical }));
    fs.writeFileSync(path.join(distDir, 'content-index.json'), JSON.stringify(slim));
    const byType = {};
    for (const i of items) byType[i.type] = (byType[i.type] || 0) + 1;
    console.log(`Content index: ${items.length} items (${Object.entries(byType).map(([t, n]) => `${t}=${n}`).join(', ')}) -> public/content-index.json`);
}

module.exports = { buildContentItems, writeContentIndex };
