// Crawlable pages for the audio library and the PDF guides.
//
// Both live inside app.html as JavaScript-rendered lists, so Google sees none
// of it — 278 ruqyah titles and 83 guide names that people actually search for
// are invisible. These pages put the same catalogue into plain HTML.
//
// Deliberately one page per category rather than one page per track: 278 pages
// carrying a title and a link each is thin content, which Google discounts (and
// can hold against a site). A category page with 30 real Bengali titles reads
// as a genuine index.

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://alquranicruqyahhealing.com';
const SITE_NAME = 'আল কুরআনিক রুকইয়াহ হিলিং';
const AUTHOR = 'রাকী ফয়সাল আহমেদ সাবিত';

const BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const toBn = (n) => String(n).replace(/\d/g, (d) => BN[+d]);
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// Bengali category -> URL slug. Transliterated by hand: an auto-slug of Bengali
// gives percent-encoded mush in the address bar and in every shared link.
const SLUGS = {
    'জাদু': 'jadu', 'তাবেআ': 'tabea', 'কারীন': 'karin', 'গিঁট ও বাঁধন': 'git-o-badhon',
    'বদনজর': 'bad-nazar', 'গাইড': 'guide', 'আমল': 'amol', 'সুরক্ষা': 'suroksha',
    'শিক্ষা': 'shikkha', 'জ্বিন': 'jinn', 'অসুখ': 'osukh', 'পারিবারিক': 'paribarik',
};

// What each category is for — without this the pages are just link lists, and a
// link list is exactly what Google treats as thin.
const BLURB = {
    'জাদু': 'সিহর বা জাদুর প্রভাব ভাঙতে যে আয়াতগুলো রুকইয়াহতে পড়া হয় — সূরা ইউনুস, আরাফ ও ত্বহার জাদু-সংক্রান্ত আয়াতসহ।',
    'বদনজর': 'বদনজর ও হাসাদের অনিষ্ট থেকে সুরক্ষা ও নিরাময়ের রুকইয়াহ — সূরা ফালাক, নাস ও কলমের আয়াতভিত্তিক।',
    'জ্বিন': 'জ্বিনের কষ্ট, আছর ও ওয়াসওয়াসা সংক্রান্ত রুকইয়াহ আয়াত ও আমল।',
    'গিঁট ও বাঁধন': 'বাঁধা পড়া, আটকে থাকা ও গিঁটের ধরনের সমস্যায় পড়া হয় এমন রুকইয়াহ।',
    'কারীন': 'প্রত্যেক মানুষের সাথে থাকা কারীন সংক্রান্ত রুকইয়াহ ও সুরক্ষার আমল।',
    'তাবেআ': 'তাবেআ সংক্রান্ত রুকইয়াহ — লক্ষণ ও চিকিৎসার আয়াতসমূহ।',
    'অসুখ': 'শারীরিক ও মানসিক অসুস্থতায় শিফা প্রার্থনার রুকইয়াহ ও মাসনুন দোয়া।',
    'সুরক্ষা': 'ঘর, পরিবার ও নিজের সুরক্ষার জন্য নিয়মিত পড়ার রুকইয়াহ ও আযকার।',
    'আমল': 'দৈনন্দিন আমল, আযকার ও রুকইয়াহর সাথে যুক্ত অতিরিক্ত করণীয়।',
    'পারিবারিক': 'দাম্পত্য ও পারিবারিক সমস্যা সংক্রান্ত রুকইয়াহ।',
    'গাইড': 'রুকইয়াহ কীভাবে করবেন, কী পড়বেন ও কী এড়াবেন — ধাপে ধাপে দিকনির্দেশনা।',
    'শিক্ষা': 'রুকইয়াহ ও আকীদা সংক্রান্ত শিক্ষামূলক আলোচনা।',
};

const HEAD = ({ title, desc, canonical }) => `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)} — ${SITE_NAME}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#080808">
<meta name="robots" content="index, follow, max-image-preview:large">
<link rel="canonical" href="${canonical}">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="bn_BD">
<meta property="og:image" content="${SITE}/blog/images/og-default.jpg">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600;700&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">`;

const NAV = `<nav class="nav">
  <div class="nav-in">
    <a class="brand" href="/"><span class="brand-dot"></span>${SITE_NAME}</a>
    <div class="nav-links">
      <a href="/audio/">অডিও</a>
      <a href="/guides/">গাইড</a>
      <a href="/blog/">ব্লগ</a>
      <a href="/#book">বই</a>
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
    <div class="foot-bot"><span>© ${toBn(new Date().getFullYear())} ${SITE_NAME}</span><span>${AUTHOR}</span></div>
  </div>
</footer>`;

const page = (meta, body) => `<!DOCTYPE html>
<html lang="bn">
<head>
${HEAD(meta)}
${meta.ld ? `<script type="application/ld+json">${JSON.stringify(meta.ld)}</script>` : ''}
</head>
<body>
${NAV}
${body}
${FOOT}
</body>
</html>`;

const trackItem = (t) => `<li>
  <a href="/app.html#audio-${esc(t.code)}">
    <span class="lib-code">${esc(t.code)}</span>
    <span class="ep-b">
      <span class="ep-t">${esc(t.title_bn)}</span>
      ${t.tags?.length ? `<span class="ep-d">${t.tags.map(esc).join(' · ')}</span>` : ''}
    </span>
  </a></li>`;

function audioCategoryPage(cat, tracks) {
    const slug = SLUGS[cat] || cat;
    const canonical = `${SITE}/audio/${slug}/`;
    const desc = `${BLURB[cat] || ''} ${toBn(tracks.length)}টি রুকইয়াহ অডিও, বিনামূল্যে শোনা যায়।`.trim();
    return page({
        title: `${cat} — রুকইয়াহ অডিও`,
        desc, canonical,
        ld: {
            '@context': 'https://schema.org', '@type': 'CollectionPage',
            name: `${cat} — রুকইয়াহ অডিও`, description: desc, url: canonical, inLanguage: 'bn',
            mainEntity: { '@type': 'ItemList', numberOfItems: tracks.length,
                itemListElement: tracks.slice(0, 100).map((t, i) => ({
                    '@type': 'ListItem', position: i + 1, name: t.title_bn })) },
        },
    }, `<header class="blog-hd"><div class="wrap">
    <a class="back" href="/audio/">← সব অডিও</a>
    <h1>${esc(cat)} — রুকইয়াহ অডিও</h1>
    <p>${esc(BLURB[cat] || '')}</p>
  </div></header>
<main class="wrap blog-main">
  <p class="lib-count">${toBn(tracks.length)}টি অডিও · সবগুলো বিনামূল্যে</p>
  <ol class="ep-list">${tracks.map(trackItem).join('')}</ol>
</main>`);
}

function audioIndexPage(byCat, total) {
    const canonical = `${SITE}/audio/`;
    const desc = `${toBn(total)}টি রুকইয়াহ অডিও — জাদু, বদনজর, জ্বিন, হাসাদ ও গিঁটের রুকইয়াহ। বিনামূল্যে শোনা যায়।`;
    return page({
        title: 'রুকইয়াহ অডিও লাইব্রেরি', desc, canonical,
        ld: { '@context': 'https://schema.org', '@type': 'CollectionPage',
              name: 'রুকইয়াহ অডিও লাইব্রেরি', description: desc, url: canonical, inLanguage: 'bn' },
    }, `<header class="blog-hd"><div class="wrap">
    <h1>রুকইয়াহ অডিও লাইব্রেরি</h1>
    <p>জাদু, বদনজর, হাসাদ, জ্বিন ও গিঁটের রুকইয়াহ — মোট ${toBn(total)}টি অডিও, সবই বিনামূল্যে।
       বিষয় বেছে নিয়ে শুরু করুন।</p>
  </div></header>
<main class="wrap blog-main">
  <div class="topic-row">${Object.entries(byCat).map(([c, ts]) =>
      `<a class="topic" href="/audio/${SLUGS[c] || c}/">${esc(c)}<span>${toBn(ts.length)}</span></a>`).join('')}</div>
  ${Object.entries(byCat).map(([c, ts]) => `<section class="lib-sec">
    <h2 class="row-hd"><a href="/audio/${SLUGS[c] || c}/">${esc(c)}</a>
      <span class="lib-count">${toBn(ts.length)}টি</span></h2>
    <p class="lib-blurb">${esc(BLURB[c] || '')}</p>
    <ol class="ep-list">${ts.slice(0, 8).map(trackItem).join('')}</ol>
    ${ts.length > 8 ? `<p class="lib-more"><a href="/audio/${SLUGS[c] || c}/">${esc(c)}-এর সব ${toBn(ts.length)}টি অডিও →</a></p>` : ''}
  </section>`).join('')}
</main>`);
}

function guidesPage(pdfs) {
    const canonical = `${SITE}/guides/`;
    const desc = `${toBn(pdfs.length)}টি বিনামূল্যের রুকইয়াহ গাইড ও সেলফ রুকইয়াহ PDF — জাদু, বদনজর, জ্বিন ও দৈনন্দিন আমল।`;
    const byCat = {};
    for (const p of pdfs) (byCat[p.category || 'অন্যান্য'] ||= []).push(p);
    return page({
        title: 'রুকইয়াহ গাইড ও PDF', desc, canonical,
        ld: { '@context': 'https://schema.org', '@type': 'CollectionPage',
              name: 'রুকইয়াহ গাইড ও PDF', description: desc, url: canonical, inLanguage: 'bn' },
    }, `<header class="blog-hd"><div class="wrap">
    <h1>রুকইয়াহ গাইড ও PDF</h1>
    <p>সেলফ রুকইয়াহ, দৈনন্দিন আমল ও বিষয়ভিত্তিক গাইড — মোট ${toBn(pdfs.length)}টি, সবই বিনামূল্যে পড়া যায়।</p>
  </div></header>
<main class="wrap blog-main">
  ${Object.entries(byCat).map(([c, ps]) => `<section class="lib-sec">
    <h2 class="row-hd">${esc(c)} <span class="lib-count">${toBn(ps.length)}টি</span></h2>
    <ol class="ep-list">${ps.map((p) => `<li><a href="/app.html#pdf">
      <span class="ep-b"><span class="ep-t">${esc(p.title_bn)}</span></span></a></li>`).join('')}</ol>
  </section>`).join('')}
</main>`);
}

const EXTRA_CSS = `
.lib-count{font-size:.8rem;color:var(--sub);font-weight:600}
.lib-blurb{font-size:.86rem;color:var(--sub);margin:-6px 0 12px;max-width:70ch}
.lib-sec{margin-bottom:34px}
.lib-sec .row-hd{display:flex;align-items:baseline;gap:10px}
.lib-sec .row-hd a{color:inherit}
.lib-sec .row-hd a:hover{color:var(--green)}
.lib-more{margin-top:10px;font-size:.86rem;font-weight:700}
.lib-more a{color:var(--green)}
.lib-code{flex-shrink:0;min-width:3em;font-weight:800;color:var(--green);font-size:.78rem;padding-top:3px}
`;

function buildLibrary(distDir) {
    const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio.json'), 'utf8'));
    const pdfs = JSON.parse(fs.readFileSync(path.join(ROOT, 'pdf_list.json'), 'utf8'));

    const byCat = {};
    for (const t of audio) (byCat[t.category || 'অন্যান্য'] ||= []).push(t);
    // biggest categories first — the page should lead with what there is most of
    const sorted = Object.fromEntries(Object.entries(byCat).sort((a, b) => b[1].length - a[1].length));

    const audioDir = path.join(distDir, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(path.join(audioDir, 'index.html'), audioIndexPage(sorted, audio.length));

    const urls = [`${SITE}/audio/`, `${SITE}/guides/`];
    for (const [cat, tracks] of Object.entries(sorted)) {
        const dir = path.join(audioDir, SLUGS[cat] || cat);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), audioCategoryPage(cat, tracks));
        urls.push(`${SITE}/audio/${SLUGS[cat] || cat}/`);
    }

    const guidesDir = path.join(distDir, 'guides');
    fs.mkdirSync(guidesDir, { recursive: true });
    fs.writeFileSync(path.join(guidesDir, 'index.html'), guidesPage(pdfs));

    // append the library-only rules to the shared stylesheet
    const css = path.join(distDir, 'blog', 'blog.css');
    if (fs.existsSync(css)) fs.appendFileSync(css, EXTRA_CSS);

    // The blog writes the sitemap before this runs, so splice these in rather
    // than leaving the library pages undiscoverable.
    const smPath = path.join(distDir, 'sitemap.xml');
    if (fs.existsSync(smPath)) {
        const lastmod = new Date().toISOString().slice(0, 10);
        const rows = urls.map((u) => `  <url><loc>${u}</loc><lastmod>${lastmod}</lastmod>`
            + `<changefreq>weekly</changefreq><priority>0.8</priority></url>`).join('\n');
        fs.writeFileSync(smPath,
            fs.readFileSync(smPath, 'utf8').replace('</urlset>', `${rows}\n</urlset>`));
    }

    console.log(`Library: ${audio.length} audio in ${Object.keys(sorted).length} categories, `
              + `${pdfs.length} guides -> public/audio/, public/guides/`);
    return urls;
}

module.exports = { buildLibrary };
