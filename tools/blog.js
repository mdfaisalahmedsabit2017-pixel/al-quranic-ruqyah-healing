// Blog builder: posts/*.md -> static pages in public/blog/ + JSON for the app.
//
// Static HTML per post, not a client-rendered list, because the whole point of
// the blog is Google and Facebook: a crawler and the Facebook scraper both read
// the HTML they are served and never run the JS, so the title, description and
// og:image have to be in the file itself.
//
// Each post becomes a directory (blog/<slug>/index.html) so the public URL is
// /blog/<slug>/ with no .html and no cleanUrls setting — cleanUrls would also
// rewrite /app.html and collide with the existing /app rewrite.
//
// The Markdown subset is deliberately small (headings, lists, quotes, images,
// links, bold/italic, ayah blocks, raw HTML passthrough). It stays dependency
// free, so `npm install` and the Vercel build are untouched.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const IMAGES_DIR = path.join(ROOT, 'blog_images');
const SITE = 'https://alquranicruqyahhealing.com';
const AUTHOR = 'রাকী ফয়সাল আহমেদ সাবিত';
const SITE_NAME = 'আল কুরআনিক রুকইয়াহ হিলিং';

const BN_DIGITS = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
                   'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];

const toBn = (n) => String(n).replace(/\d/g, (d) => BN_DIGITS[+d]);
const today = () => new Date().toISOString().slice(0, 10);

function bnDate(iso) {
    const [y, m, d] = String(iso).split('-').map(Number);
    if (!y || !m || !d) return '';
    return `${toBn(d)} ${BN_MONTHS[m - 1]} ${toBn(y)}`;
}

const esc = (s) => String(s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// ── Markdown ────────────────────────────────────────────────

// Posts are written with `images/foo.jpg`, but a page lives at /blog/<slug>/,
// so a relative src would resolve to /blog/<slug>/images/foo.jpg and 404. Every
// image path becomes root-absolute here; post.json later makes them fully
// qualified for the Android build, which has no /blog on its local origin.
const imgSrc = (src) => (/^(https?:)?\/\//.test(src) ? src : `/blog/${src.replace(/^\.?\//, '')}`);

// Inline rules run on already-escaped text, so a post can't inject markup by
// accident — except through a deliberate raw-HTML block (see below).
function inline(s) {
    return esc(s)
        .replace(/!\[([^\]]*)\]\(([^)\s]+)\)/g, (m, a, src) =>
            `<img src="${imgSrc(src)}" alt="${a}" loading="lazy">`)
        .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, (m, t, h) =>
            /^https?:\/\//.test(h) && !h.startsWith(SITE)
                ? `<a href="${h}" target="_blank" rel="noopener noreferrer">${t}</a>`
                : `<a href="${h}">${t}</a>`)
        .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
        .replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2</em>')
        .replace(/`([^`]+)`/g, '<code>$1</code>');
}

// Bengali digits count as list markers too: a Bengali post is naturally written
// "১. ..." and treating that as prose silently glued whole numbered sections
// into one paragraph. CSS list-style:bengali renders the markers back in
// Bengali, so the numbers in the source are only a signal.
const BULLET  = /^[-*]\s+/;
const ORDERED = /^[\d০-৯]+[.)]\s+/;
const isBlockStart = (l) =>
    /^(#{2,4}\s|>|```|---|\*\*\*)/.test(l) || BULLET.test(l) || ORDERED.test(l);

function mdToHtml(md) {
    const lines = md.replace(/\r\n/g, '\n').split('\n');
    const out = [];
    let i = 0;

    const flushList = (tag, items) =>
        out.push(`<${tag}>${items.map((t) => `<li>${inline(t)}</li>`).join('')}</${tag}>`);

    while (i < lines.length) {
        const line = lines[i];

        if (!line.trim()) { i++; continue; }

        // Fenced blocks: ```ayah for Quran/hadith Arabic, ```html for raw markup
        if (line.startsWith('```')) {
            const kind = line.slice(3).trim();
            const buf = [];
            i++;
            while (i < lines.length && !lines[i].startsWith('```')) buf.push(lines[i++]);
            i++;
            if (kind === 'html') {
                out.push(buf.join('\n'));                       // trusted: we author the posts
            } else if (kind === 'ayah') {
                // last line starting with — is the reference
                const ref = buf.length > 1 && buf[buf.length - 1].trim().startsWith('—')
                    ? buf.pop().replace(/^—\s*/, '') : '';
                out.push(`<blockquote class="ayah"><p class="ar">${esc(buf.join('<br>'))}</p>`
                    + (ref ? `<cite>${inline(ref)}</cite>` : '') + '</blockquote>');
            } else {
                out.push(`<pre><code>${esc(buf.join('\n'))}</code></pre>`);
            }
            continue;
        }

        const h = line.match(/^(#{2,4})\s+(.*)$/);
        if (h) {
            const lvl = h[1].length;
            const id = h[2].trim().replace(/\s+/g, '-').replace(/[^\p{L}\p{N}-]/gu, '');
            out.push(`<h${lvl} id="${esc(id)}">${inline(h[2])}</h${lvl}>`);
            i++;
            continue;
        }

        if (/^(---|\*\*\*)\s*$/.test(line)) { out.push('<hr>'); i++; continue; }

        if (/^>\s?/.test(line)) {
            const buf = [];
            while (i < lines.length && /^>\s?/.test(lines[i])) buf.push(lines[i++].replace(/^>\s?/, ''));
            out.push(`<blockquote><p>${inline(buf.join(' '))}</p></blockquote>`);
            continue;
        }

        if (BULLET.test(line) || ORDERED.test(line)) {
            const ordered = ORDERED.test(line);
            const mark = ordered ? ORDERED : BULLET;
            const buf = [];
            while (i < lines.length && lines[i].trim()) {
                if (mark.test(lines[i])) {
                    buf.push(lines[i++].replace(mark, ''));
                } else if (isBlockStart(lines[i]) || !buf.length) {
                    break;
                } else {
                    buf[buf.length - 1] += ' ' + lines[i++].trim();   // wrapped item
                }
            }
            flushList(ordered ? 'ol' : 'ul', buf);
            continue;
        }

        // A line of its own that is only an image gets figure treatment
        const onlyImg = line.trim().match(/^!\[([^\]]*)\]\(([^)\s]+)\)$/);
        if (onlyImg) {
            out.push(`<figure><img src="${esc(imgSrc(onlyImg[2]))}" alt="${esc(onlyImg[1])}" loading="lazy">`
                + (onlyImg[1] ? `<figcaption>${inline(onlyImg[1])}</figcaption>` : '') + '</figure>');
            i++;
            continue;
        }

        const buf = [];
        while (i < lines.length && lines[i].trim() && !isBlockStart(lines[i])) buf.push(lines[i++]);
        out.push(`<p>${inline(buf.join(' '))}</p>`);
    }
    return out.join('\n');
}

// ── Post loading ────────────────────────────────────────────

function parsePost(file) {
    // CRLF and a BOM both break the frontmatter match, and both show up as soon
    // as a file is written by a Windows tool or edited in Notepad.
    const raw = fs.readFileSync(file, 'utf8').replace(/^﻿/, '').replace(/\r\n/g, '\n');
    const m = raw.match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
    if (!m) throw new Error(`${path.basename(file)}: missing --- frontmatter block`);

    const meta = {};
    for (const line of m[1].split('\n')) {
        const kv = line.match(/^([a-zA-Z_]+):\s*(.*)$/);
        if (kv) meta[kv[1]] = kv[2].trim();
    }
    const slug = meta.slug || path.basename(file, '.md');
    const body = m[2].trim();

    if (!meta.title) throw new Error(`${path.basename(file)}: title is required`);
    if (!meta.date)  throw new Error(`${path.basename(file)}: date is required (YYYY-MM-DD)`);

    // The excerpt feeds <meta description>, the card, and the Facebook preview.
    // All three render it as plain text, so emphasis markers have to come out —
    // otherwise a Facebook preview reads "**বিশ্বাসই করতে চান না**".
    const firstPara = body.split('\n\n').find((b) => !/^[#>`\-*!]/.test(b.trim())) || '';
    const unmark = (s) => s.replace(/\*\*|__|[*`_\[\]]/g, '').replace(/\s+/g, ' ').trim();
    const description = meta.description
        ? unmark(meta.description)
        : unmark(firstPara).slice(0, 155);

    return {
        slug,
        title: meta.title,
        // The on-page headline and the search-results headline have different
        // jobs. These posts came from Facebook, where the hook wins ("ঘুমের
        // মধ্যেই নবায়ন হচ্ছে জাদু?"), but nobody types that into Google —
        // they type "জাদু নষ্ট করার আমল". seoTitle lets the <title> carry the
        // words people search while the page keeps the hook. Falls back to the
        // title, so posts that don't set it are unaffected.
        seoTitle: meta.seoTitle || meta.title,
        description,
        date: meta.date,
        dateBn: bnDate(meta.date),
        cover: meta.cover || '',
        tags: meta.tags ? meta.tags.split(',').map((t) => t.trim()).filter(Boolean) : [],
        draft: meta.draft === 'true',
        // A 120-day programme read newest-first is the programme backwards, so
        // series posts are ordered by episode and get their own index page.
        series: meta.series || '',
        seriesTitle: meta.seriesTitle || '',
        episode: meta.episode ? parseInt(meta.episode, 10) : 0,
        // A hub page targets one search topic and gathers every post about it.
        // The value is the list of terms to match against titles and tags.
        hub: meta.hub ? meta.hub.split(',').map((t) => t.trim()).filter(Boolean) : null,
        html: mdToHtml(body),
        words: body.split(/\s+/).length,
    };
}

const readMins = (p) => Math.max(1, Math.round(p.words / 180));

// ── Page shells ─────────────────────────────────────────────

// Facebook shows a bare text link when a page has no og:image, so every page
// falls back to the branded card rather than shipping none.
const OG_FALLBACK = `${SITE}/blog/images/og-default.jpg`;

// Search engines cut the description around 155–160 characters; anything past
// that is wasted and can read as truncated mid-word in the result.
const metaDesc = (s) => {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= 158) return t;
    const cut = t.slice(0, 158);
    return cut.slice(0, cut.lastIndexOf(' ')) + '…';
};

const HEAD = (p, canonical, ogImage) => `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(p.seoTitle || p.title)} — ${SITE_NAME}</title>
<meta name="description" content="${esc(metaDesc(p.description))}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#080808">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(p.title)}">
<meta property="og:description" content="${esc(metaDesc(p.description))}">
<meta property="og:type" content="${p.slug ? 'article' : 'website'}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="bn_BD">
<meta property="og:image" content="${ogImage || OG_FALLBACK}">
<meta property="og:image:alt" content="${esc(p.title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(p.title)}">
<meta name="twitter:description" content="${esc(metaDesc(p.description))}">
<meta name="twitter:image" content="${ogImage || OG_FALLBACK}">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME}" href="/blog/feed.xml">
<link rel="icon" href="/assets/icon.png">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600;700&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${JSON.stringify({
    '@context': 'https://schema.org',
    '@graph': [
        { '@type': 'Organization', '@id': `${SITE}/#org`, name: SITE_NAME, url: SITE,
          founder: { '@type': 'Person', name: AUTHOR },
          sameAs: ['https://www.facebook.com/al.quranic.ruqyah.healing1'] },
        { '@type': 'WebSite', '@id': `${SITE}/#site`, url: SITE, name: SITE_NAME,
          inLanguage: 'bn', publisher: { '@id': `${SITE}/#org` } },
    ],
})}</script>`;

const NAV = `<nav class="nav">
  <div class="nav-in">
    <a class="brand" href="/"><span class="brand-dot"></span>${SITE_NAME}</a>
    <div class="nav-links">
      <a href="/audio/">অডিও</a>
      <a href="/guides/">গাইড</a>
      <a href="/blog/">ব্লগ</a>
      <a href="/#book">বই</a>
      <a href="/#course">কোর্স</a>
    </div>
    <a class="btn btn-p btn-sm" href="/app.html">অ্যাপে ঢুকুন</a>
  </div>
</nav>`;

const FOOT = `<footer>
  <div class="wrap">
    <p class="disclaimer">
      দ্রষ্টব্য: রুকইয়াহ একটি দুআ ও আত্মিক চিকিৎসা পদ্ধতি — এটি আধুনিক চিকিৎসাবিজ্ঞান বা মানসিক
      স্বাস্থ্যসেবার বিকল্প নয়। শারীরিক বা মানসিক গুরুতর উপসর্গে অবশ্যই যোগ্য চিকিৎসকের শরণাপন্ন হোন।
      শিফা একমাত্র আল্লাহর পক্ষ থেকে।
    </p>
    <div class="foot-bot">
      <span>© ${toBn(new Date().getFullYear())} ${SITE_NAME}</span>
      <span>${AUTHOR}</span>
    </div>
  </div>
</footer>`;

// Group posts into series, each ordered by episode; `loose` keeps everything
// that belongs to no series.
function groupSeries(posts) {
    const map = new Map();
    const loose = [];
    for (const p of posts) {
        if (!p.series) { loose.push(p); continue; }
        if (!map.has(p.series)) {
            map.set(p.series, { slug: p.series, title: p.seriesTitle || p.series, posts: [] });
        }
        map.get(p.series).posts.push(p);
    }
    const series = [...map.values()];
    for (const s of series) {
        s.posts.sort((a, b) => a.episode - b.episode);
        s.cover = (s.posts.find((p) => p.cover) || {}).cover || '';
    }
    series.sort((a, b) => b.posts.length - a.posts.length);
    return { series, loose };
}

function postPage(p, others) {
    const canonical = `${SITE}/blog/${p.slug}/`;
    const ogImage = p.cover ? `${SITE}/blog/${p.cover.replace(/^\.?\//, '')}` : '';
    const shareText = encodeURIComponent(`${p.title}\n${canonical}`);

    // JSON-LD so Google can show it as an article with a date and an author,
    // plus a breadcrumb trail — that is what turns the grey URL line in a
    // result into "ব্লগ › সিরিজ › লেখা".
    const crumbs = [
        { name: 'ব্লগ', item: `${SITE}/blog/` },
        ...(p.series ? [{ name: p.seriesTitle, item: `${SITE}/blog/series/${p.series}/` }] : []),
        { name: p.title, item: canonical },
    ];
    const ld = {
        '@context': 'https://schema.org',
        '@graph': [{
            '@type': 'Article',
            headline: p.title, description: metaDesc(p.description),
            datePublished: p.date, dateModified: p.date,
            inLanguage: 'bn',
            author: { '@type': 'Person', name: AUTHOR },
            publisher: { '@id': `${SITE}/#org` },
            mainEntityOfPage: canonical,
            image: ogImage || OG_FALLBACK,
            ...(p.series ? { isPartOf: { '@type': 'CreativeWorkSeries', name: p.seriesTitle,
                                         url: `${SITE}/blog/series/${p.series}/` } } : {}),
        }, {
            '@type': 'BreadcrumbList',
            itemListElement: crumbs.map((c, i) => ({
                '@type': 'ListItem', position: i + 1, name: c.name, item: c.item })),
        }],
    };

    const nav = p.series && p.nav ? `<nav class="ep-nav">
      ${p.nav.prev ? `<a href="/blog/${p.nav.prev.slug}/">← আগের পর্ব</a>` : '<span></span>'}
      ${p.nav.next ? `<a href="/blog/${p.nav.next.slug}/">পরের পর্ব →</a>` : '<span></span>'}
    </nav>` : '';

    return `<!DOCTYPE html>
<html lang="bn">
<head>
${HEAD(p, canonical, ogImage)}
<script type="application/ld+json">${JSON.stringify(ld)}</script>
</head>
<body>
${NAV}
<article class="post">
  <div class="wrap post-in">
    <a class="back" href="${p.series ? `/blog/series/${p.series}/` : '/blog/'}">← ${p.series ? esc(p.seriesTitle) : 'সব লেখা'}</a>
    <p class="post-meta">${p.series ? `পর্ব ${toBn(p.episode)} · ` : ''}${p.dateBn} · ${toBn(readMins(p))} মিনিট পড়া</p>
    <h1>${esc(p.title)}</h1>
    ${p.tags.length ? `<div class="tags">${p.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join('')}</div>` : ''}
    ${p.cover ? `<img class="cover" src="${esc(imgSrc(p.cover))}" alt="${esc(p.title)}">` : ''}
    <div class="prose">
${p.html}
    </div>
    ${nav}
    <div class="share">
      <span>শেয়ার করুন</span>
      <a href="https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(canonical)}" target="_blank" rel="noopener noreferrer">Facebook</a>
      <a href="https://wa.me/?text=${shareText}" target="_blank" rel="noopener noreferrer">WhatsApp</a>
    </div>
    ${others.length ? `<section class="more">
      <h2>আরও পড়ুন</h2>
      <div class="cards">${others.slice(0, 3).map(card).join('')}</div>
    </section>` : ''}
  </div>
</article>
${FOOT}
</body>
</html>`;
}

const card = (p) => `<a class="card" href="/blog/${p.slug}/">
  ${p.cover ? `<img src="${esc(imgSrc(p.cover))}" alt="" loading="lazy">`
            : '<div class="card-ph"></div>'}
  <div class="card-b">
    <p class="card-date">${p.dateBn} · ${toBn(readMins(p))} মিনিট</p>
    <h3>${esc(p.title)}</h3>
    <p class="card-d">${esc(p.description)}</p>
  </div>
</a>`;

const seriesCard = (s) => `<a class="card series-card" href="/blog/series/${s.slug}/">
  ${s.cover ? `<img src="${esc(imgSrc(s.cover))}" alt="" loading="lazy">` : '<div class="card-ph"></div>'}
  <div class="card-b">
    <p class="card-date">সিরিজ · ${toBn(s.posts.length)} পর্ব</p>
    <h3>${esc(s.title)}</h3>
    <p class="card-d">${esc(s.posts[0].description)}</p>
  </div>
</a>`;

function indexPage(posts) {
    const { series, loose } = groupSeries(posts);
    const hubList = posts.filter((p) => p.hub);
    const meta = {
        title: 'ব্লগ ও রুকইয়াহ গাইডলাইন',
        description: 'রুকইয়াহ, বদনজর, জাদু ও জ্বীন সংক্রান্ত কুরআন-সুন্নাহভিত্তিক লেখা ও গাইডলাইন — রাকী ফয়সাল আহমেদ সাবিত।',
        slug: '',
    };
    const withCover = posts.find((p) => p.cover);
    return `<!DOCTYPE html>
<html lang="bn">
<head>
${HEAD(meta, `${SITE}/blog/`, withCover ? `${SITE}${imgSrc(withCover.cover)}` : '')}
</head>
<body>
${NAV}
<header class="blog-hd">
  <div class="wrap">
    <h1>ব্লগ ও গাইডলাইন</h1>
    <p>রুকইয়াহ, বদনজর, হাসাদ, জাদু ও জ্বীন সংক্রান্ত কুরআন ও সহীহ সুন্নাহভিত্তিক লেখা।
       মোট ${toBn(posts.length)}টি লেখা।</p>
  </div>
</header>
<main class="wrap blog-main">
  ${hubList.length ? `<h2 class="row-hd">বিষয় অনুযায়ী</h2>
  <div class="topic-row">${hubList.map((h) => `<a class="topic" href="/blog/${h.slug}/">
      ${esc(h.title)}<span>${toBn(h.hubCount || 0)}</span></a>`).join('')}</div>` : ''}
  ${series.length ? `<h2 class="row-hd">সিরিজ</h2>
  <div class="cards">${series.map(seriesCard).join('')}</div>` : ''}
  ${loose.length ? `<h2 class="row-hd">সব লেখা</h2>
  <div class="cards">${loose.filter((p) => !p.hub).map(card).join('')}</div>` : ''}
  ${!posts.length ? '<p class="empty">এখনো কোনো লেখা প্রকাশ করা হয়নি।</p>' : ''}
</main>
${FOOT}
</body>
</html>`;
}

// A series page lists every episode in order. It is a plain list rather than
// cards: at 240 episodes a card grid is a scroll wall, and readers of a
// programme are looking for "where was I", not browsing.
function seriesPage(s) {
    const meta = {
        title: s.title,
        description: `${s.title} — ${s.posts.length}টি পর্ব। ${s.posts[0].description}`.slice(0, 300),
        slug: '',
    };
    const canonical = `${SITE}/blog/series/${s.slug}/`;
    return `<!DOCTYPE html>
<html lang="bn">
<head>
${HEAD(meta, canonical, s.cover ? `${SITE}${imgSrc(s.cover)}` : '')}
</head>
<body>
${NAV}
<header class="blog-hd">
  <div class="wrap">
    <a class="back" href="/blog/">← সব লেখা</a>
    <h1>${esc(s.title)}</h1>
    <p>${toBn(s.posts.length)}টি পর্ব · শুরু থেকে ক্রমানুসারে পড়ুন।</p>
  </div>
</header>
<main class="wrap blog-main">
  <ol class="ep-list">
    ${s.posts.map((p) => `<li>
      <a href="/blog/${p.slug}/">
        <span class="ep-no">${toBn(p.episode)}</span>
        <span class="ep-b">
          <span class="ep-t">${esc(p.title)}</span>
          <span class="ep-d">${esc(p.description)}</span>
        </span>
      </a></li>`).join('')}
  </ol>
</main>
${FOOT}
</body>
</html>`;
}

const CSS = `:root{
  --bg:#080808; --surface:#0f0f0f; --raised:#141414;
  --border:rgba(255,255,255,.07); --border-md:rgba(255,255,255,.12);
  --green:#00E599; --green-dim:rgba(0,229,153,.08);
  --text:#f2f2f2; --sub:#8d8d8d; --dim:#525252;
  --r-sm:10px; --r-md:14px; --r-lg:20px; --max:1140px;
}
*,*::before,*::after{box-sizing:border-box;margin:0;padding:0}
html{scroll-behavior:smooth;overflow-x:hidden}
body{background:var(--bg);color:var(--text);font-family:'Hind Siliguri','Inter',-apple-system,sans-serif;
  line-height:1.75;-webkit-font-smoothing:antialiased;overflow-wrap:anywhere}
a{color:inherit;text-decoration:none}
img{max-width:100%;display:block}
:focus-visible{outline:2px solid var(--green);outline-offset:3px;border-radius:6px}
.wrap{max-width:var(--max);margin:0 auto;padding:0 20px}

.nav{position:sticky;top:0;z-index:50;background:rgba(8,8,8,.82);backdrop-filter:blur(20px);
  -webkit-backdrop-filter:blur(20px);border-bottom:1px solid var(--border)}
.nav-in{display:flex;align-items:center;gap:20px;height:62px;max-width:var(--max);margin:0 auto;padding:0 20px}
.brand{display:flex;align-items:center;gap:9px;font-weight:700;font-size:.94rem}
.brand-dot{width:9px;height:9px;border-radius:50%;background:var(--green);flex-shrink:0;
  box-shadow:0 0 12px rgba(0,229,153,.6)}
.nav-links{display:none;gap:26px;font-size:.86rem;color:var(--sub);font-weight:500;margin-left:auto}
.nav-links a:hover{color:var(--text)}
@media(min-width:860px){.nav-links{display:flex}}
.btn{display:inline-flex;align-items:center;justify-content:center;gap:8px;border-radius:99px;
  font-family:inherit;font-weight:700;cursor:pointer;transition:.18s}
.btn-p{background:var(--green);color:#04150e}
.btn-p:hover{filter:brightness(1.08)}
.btn-sm{padding:9px 17px;font-size:.82rem;margin-left:auto}
@media(min-width:860px){.btn-sm{margin-left:0}}

.blog-hd{padding:56px 0 30px;border-bottom:1px solid var(--border)}
.blog-hd h1{font-size:clamp(1.9rem,5vw,2.9rem);font-weight:800;letter-spacing:-.02em;line-height:1.25}
.blog-hd p{color:var(--sub);margin-top:10px;max-width:60ch}
.blog-main{padding:34px 20px 70px}
.empty{color:var(--sub);text-align:center;padding:60px 0}

.cards{display:grid;gap:18px;grid-template-columns:1fr}
@media(min-width:640px){.cards{grid-template-columns:1fr 1fr}}
@media(min-width:980px){.cards{grid-template-columns:repeat(3,1fr)}}
.card{background:var(--surface);border:1px solid var(--border);border-radius:var(--r-lg);
  overflow:hidden;transition:border-color .18s,transform .18s}
.card:hover{border-color:var(--border-md);transform:translateY(-2px)}
.card img{width:100%;aspect-ratio:16/9;object-fit:cover;background:var(--raised)}
/* Without a cover image a flat grey box reads as a broken image, so the
   placeholder is a deliberate brand panel instead. */
.card-ph{width:100%;aspect-ratio:16/5;background:
  radial-gradient(120% 140% at 12% 0%,rgba(0,229,153,.16),transparent 60%),
  linear-gradient(160deg,#101010,#0b0b0b);
  border-bottom:1px solid var(--border)}
.card-b{padding:16px 17px 19px}
.card-date{font-size:.72rem;color:var(--dim);font-weight:600;letter-spacing:.02em}
.card h3{font-size:1.02rem;font-weight:700;line-height:1.45;margin:6px 0 7px}
.card-d{font-size:.84rem;color:var(--sub);line-height:1.6;
  display:-webkit-box;-webkit-line-clamp:3;-webkit-box-orient:vertical;overflow:hidden}

.post-in{max-width:720px;padding-top:34px;padding-bottom:70px}
.back{font-size:.82rem;color:var(--sub);font-weight:600}
.back:hover{color:var(--green)}
.post-meta{font-size:.76rem;color:var(--dim);font-weight:600;margin-top:22px}
.post h1{font-size:clamp(1.7rem,4.6vw,2.55rem);font-weight:800;letter-spacing:-.02em;
  line-height:1.32;margin:10px 0 14px}
.tags{display:flex;flex-wrap:wrap;gap:7px;margin-bottom:20px}
.tag{font-size:.72rem;font-weight:700;padding:4px 11px;border-radius:99px;
  background:var(--green-dim);color:var(--green)}
/* The cover is the Facebook card, which is portrait (1080x1350) and repeats the
   title. Full height it would push every word below the fold, so it is cropped
   to a banner here; og:image still gets the whole card. */
.cover{width:100%;max-height:340px;object-fit:cover;object-position:center 22%;
  border-radius:var(--r-lg);border:1px solid var(--border);margin-bottom:12px}

/* Bengali conjuncts need more room than Latin at the same nominal size, and
   "hard to read means won't read" — a quick bounce back to the results is a
   ranking signal, not just a lost reader. */
.prose{font-size:1.12rem;line-height:1.95;color:#e8e8e8}
.prose h2{font-size:1.42rem;font-weight:800;margin:38px 0 12px;letter-spacing:-.01em;line-height:1.4}
.prose h3{font-size:1.14rem;font-weight:700;margin:28px 0 9px;color:var(--green)}
.prose h4{font-size:1rem;font-weight:700;margin:22px 0 7px}
.prose p{margin:0 0 17px}
.prose ul,.prose ol{margin:0 0 18px;padding-left:24px}
.prose ol{list-style-type:bengali}   /* ১. ২. ৩. instead of 1. 2. 3. */
.prose li{margin-bottom:8px}
.prose li::marker{color:var(--green)}
.prose a{color:var(--green);text-decoration:underline;text-underline-offset:3px}
.prose strong{font-weight:700;color:#fff}
.prose code{background:var(--raised);padding:2px 6px;border-radius:6px;font-size:.9em}
.prose pre{background:var(--raised);border:1px solid var(--border);border-radius:var(--r-md);
  padding:14px;overflow-x:auto;margin:0 0 18px}
.prose hr{border:0;border-top:1px solid var(--border);margin:34px 0}
.prose figure{margin:0 0 22px}
.prose figure img,.prose p img{border-radius:var(--r-md);border:1px solid var(--border);margin:0 auto}
.prose figcaption{font-size:.78rem;color:var(--dim);text-align:center;margin-top:8px}
.prose blockquote{border-left:3px solid var(--green);background:var(--surface);
  padding:14px 18px;border-radius:0 var(--r-md) var(--r-md) 0;margin:0 0 20px;color:var(--sub)}
.prose blockquote.ayah{border-left:0;border:1px solid rgba(0,229,153,.18);background:var(--green-dim);
  border-radius:var(--r-md);text-align:center;padding:20px 18px}
.prose blockquote.ayah .ar{font-family:'Amiri',serif;font-size:1.5rem;line-height:2.1;
  color:var(--text);direction:rtl;margin:0}
.prose blockquote.ayah cite{display:block;font-style:normal;font-size:.78rem;
  color:var(--green);font-weight:700;margin-top:12px}

.share{display:flex;align-items:center;gap:12px;flex-wrap:wrap;margin:38px 0 0;
  padding-top:22px;border-top:1px solid var(--border);font-size:.82rem}
.share span{color:var(--dim);font-weight:600}
.share a{padding:7px 15px;border-radius:99px;border:1px solid var(--border-md);
  color:var(--sub);font-weight:600;transition:.18s}
.share a:hover{color:var(--green);border-color:rgba(0,229,153,.35)}

.more{margin-top:52px}
.more h2{font-size:1.2rem;font-weight:800;margin-bottom:16px}

.topic-row{display:flex;flex-wrap:wrap;gap:9px;margin-bottom:8px}
.topic{display:inline-flex;align-items:center;gap:8px;padding:10px 16px;border-radius:99px;
  background:var(--surface);border:1px solid var(--border);font-weight:700;font-size:.88rem;
  transition:border-color .18s,color .18s}
.topic:hover{border-color:rgba(0,229,153,.35);color:var(--green)}
.topic span{font-size:.74rem;font-weight:700;color:var(--green);background:var(--green-dim);
  padding:2px 8px;border-radius:99px}

.hub-list{margin-top:34px;padding-top:26px;border-top:1px solid var(--border)}
.hub-list h2{font-size:1.3rem;font-weight:800;margin-bottom:14px}
.hub-list h2 span{font-size:.86rem;color:var(--sub);font-weight:600}
.hub-list ul{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.hub-list a{display:flex;flex-direction:column;gap:3px;padding:13px 16px;background:var(--surface);
  border:1px solid var(--border);border-radius:var(--r-md);transition:border-color .18s,background .18s}
.hub-list a:hover{border-color:rgba(0,229,153,.3);background:var(--raised)}
.hub-list strong{font-size:.96rem;font-weight:700;color:var(--text);line-height:1.5}
.hub-list a span{font-size:.8rem;color:var(--sub);line-height:1.55;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

.row-hd{font-size:1.1rem;font-weight:800;margin:26px 0 14px}
.row-hd:first-child{margin-top:0}
.series-card .card-date{color:var(--green);font-weight:700}

.ep-nav{display:flex;justify-content:space-between;gap:12px;margin-top:36px;font-size:.84rem;font-weight:700}
.ep-nav a{color:var(--green)}
.ep-list{list-style:none;padding:0;margin:0;display:grid;gap:8px}
.ep-list a{display:flex;gap:14px;align-items:flex-start;padding:14px 16px;
  background:var(--surface);border:1px solid var(--border);border-radius:var(--r-md);
  transition:border-color .18s,background .18s}
.ep-list a:hover{border-color:rgba(0,229,153,.3);background:var(--raised)}
.ep-no{flex-shrink:0;min-width:2.2em;font-weight:800;color:var(--green);font-size:.9rem;padding-top:2px}
.ep-b{display:flex;flex-direction:column;gap:3px;min-width:0}
.ep-t{font-weight:700;font-size:.95rem;line-height:1.5}
.ep-d{font-size:.8rem;color:var(--sub);line-height:1.55;
  display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}

footer{border-top:1px solid var(--border);padding:32px 0 40px;margin-top:20px}
.disclaimer{font-size:.76rem;color:var(--dim);line-height:1.75;max-width:80ch;margin-bottom:20px}
.foot-bot{display:flex;flex-wrap:wrap;gap:10px;justify-content:space-between;
  font-size:.76rem;color:var(--dim);border-top:1px solid var(--border);padding-top:18px}
`;

// ── Build ───────────────────────────────────────────────────

const slim = (p) => (p ? { slug: p.slug, title: p.title, episode: p.episode } : null);

const forApp = (p) => ({
    ...p,
    html: p.html.replace(/src="\/blog\//g, `src="${SITE}/blog/`),
    cover: p.cover ? `${SITE}${imgSrc(p.cover)}` : '',
    url: `${SITE}/blog/${p.slug}/`,
    mins: readMins(p),
    // nav points at whole post objects, which are mutually referential —
    // JSON.stringify would blow up on the cycle.
    nav: p.nav ? { prev: slim(p.nav.prev), next: slim(p.nav.next) } : null,
});

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dest, e.name);
        if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
    }
}

function buildBlog(distDir) {
    const outDir = path.join(distDir, 'blog');
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'blog.css'), CSS);

    if (fs.existsSync(IMAGES_DIR)) copyDir(IMAGES_DIR, path.join(outDir, 'images'));

    const files = fs.existsSync(POSTS_DIR)
        ? fs.readdirSync(POSTS_DIR).filter((f) => f.endsWith('.md') && f !== 'README.md') : [];

    const posts = [];
    for (const f of files) {
        try {
            const p = parsePost(path.join(POSTS_DIR, f));
            if (!p.draft) posts.push(p);
            else console.log(`  skipped draft: ${f}`);
        } catch (e) {
            console.warn(`  ⚠️  ${e.message}`);
        }
    }
    posts.sort((a, b) => (a.date < b.date ? 1 : -1));    // newest first

    // Hub pages list every post on their topic. Building the list here rather
    // than by hand means a hub stays current as posts are added — the reason
    // hand-maintained "related reading" sections rot.
    const hubs = posts.filter((p) => p.hub);
    for (const h of hubs) {
        const matches = posts.filter((x) => !x.hub && x.slug !== h.slug
            && h.hub.some((t) => x.title.includes(t) || x.tags.join(' ').includes(t)
                                 || x.description.includes(t)));
        h.hubCount = matches.length;
        if (!matches.length) {
            console.warn(`  ⚠️  hub "${h.slug}" matched no posts — check its hub: terms`);
            continue;
        }
        h.html += `\n<section class="hub-list">
  <h2 id="সব-লখ">এই বিষয়ে সব লেখা <span>(${toBn(matches.length)}টি)</span></h2>
  <ul>${matches.map((m) => `<li><a href="/blog/${m.slug}/">
      <strong>${esc(m.title)}</strong>
      <span>${esc(m.description)}</span></a></li>`).join('')}</ul>
</section>`;
    }

    const { series, loose } = groupSeries(posts);
    for (const s of series) {
        s.posts.forEach((p, i) => {
            p.nav = { prev: s.posts[i - 1] || null, next: s.posts[i + 1] || null };
        });
        const dir = path.join(outDir, 'series', s.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), seriesPage(s));
    }

    for (const p of posts) {
        const dir = path.join(outDir, p.slug);
        fs.mkdirSync(dir, { recursive: true });
        // "আরও পড়ুন" stays inside the same series where there is one, so a
        // programme reader isn't thrown into an unrelated post mid-series.
        const pool = p.series ? (series.find((s) => s.slug === p.series).posts) : loose;
        fs.writeFileSync(path.join(dir, 'index.html'),
            postPage(p, pool.filter((x) => x.slug !== p.slug)));
        // The app renders from this rather than scraping the page. Inside the
        // APK the origin is the device's own server, so /blog/... would resolve
        // to nothing — the JSON gets fully-qualified URLs instead.
        fs.writeFileSync(path.join(dir, 'post.json'), JSON.stringify(forApp(p)));
    }

    fs.writeFileSync(path.join(outDir, 'index.html'), indexPage(posts));
    fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(
        posts.map((p) => {
            const { html, words, nav, ...rest } = forApp(p);
            return { ...rest, mins: readMins({ words: p.words }) };
        })));

    // Sitemap: the blog is only worth writing if Google can find the posts.
    // lastmod tells a crawler what actually changed, and priority stops 291
    // articles from competing with the pages that should rank first.
    const newest = posts.length ? posts[0].date : today();
    const entries = [
        { loc: `${SITE}/`, lastmod: newest, freq: 'weekly', pri: '1.0' },
        { loc: `${SITE}/blog/`, lastmod: newest, freq: 'daily', pri: '0.9' },
        { loc: `${SITE}/app.html`, lastmod: newest, freq: 'weekly', pri: '0.8' },
        { loc: `${SITE}/features.html`, lastmod: newest, freq: 'monthly', pri: '0.5' },
        ...series.map((s) => ({
            loc: `${SITE}/blog/series/${s.slug}/`, lastmod: newest, freq: 'weekly', pri: '0.8' })),
        ...posts.map((p) => ({
            loc: `${SITE}/blog/${p.slug}/`, lastmod: p.date, freq: 'monthly', pri: '0.7' })),
        { loc: `${SITE}/privacy.html`, lastmod: newest, freq: 'yearly', pri: '0.2' },
    ];
    fs.writeFileSync(path.join(distDir, 'sitemap.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + entries.map((e) => `  <url><loc>${e.loc}</loc><lastmod>${e.lastmod}</lastmod>`
            + `<changefreq>${e.freq}</changefreq><priority>${e.pri}</priority></url>`).join('\n')
        + '\n</urlset>\n');

    fs.writeFileSync(path.join(distDir, 'robots.txt'),
        `User-agent: *\nAllow: /\n\n# The paid book is served per-request by /api/book — never index it.\nDisallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);

    // RSS: how readers subscribe, and how aggregators discover new posts.
    const rssDate = (d) => new Date(`${d}T09:00:00+06:00`).toUTCString();
    fs.writeFileSync(path.join(outDir, 'feed.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n<rss version="2.0"><channel>\n'
        + `  <title>${esc(SITE_NAME)} — ব্লগ</title>\n  <link>${SITE}/blog/</link>\n`
        + `  <description>রুকইয়াহ, বদনজর, হাসাদ ও জাদু বিষয়ে কুরআন ও সুন্নাহভিত্তিক লেখা।</description>\n`
        + `  <language>bn</language>\n`
        + posts.slice(0, 50).map((p) => `  <item>\n    <title>${esc(p.title)}</title>\n`
            + `    <link>${SITE}/blog/${p.slug}/</link>\n`
            + `    <guid>${SITE}/blog/${p.slug}/</guid>\n`
            + `    <pubDate>${rssDate(p.date)}</pubDate>\n`
            + `    <description>${esc(p.description)}</description>\n  </item>`).join('\n')
        + '\n</channel></rss>\n');

    console.log(`Blog: ${posts.length} post(s), ${series.length} series -> public/blog/`);
    return posts.length;
}

module.exports = { buildBlog, mdToHtml, parsePost };
