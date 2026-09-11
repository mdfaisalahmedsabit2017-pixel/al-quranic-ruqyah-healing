// The one place the site's SEO facts live: identity, page <head> shape,
// breadcrumbs, structured-data helpers, the topic registry that ties guides,
// audio, PDFs and blog posts together, honest content dates, and the sitemap.
//
// Every generated page — blog (tools/blog.js), guides (tools/guides.js), the
// audio/PDF/topic catalogue (tools/library.js) — goes through this module, so a
// title pattern or a favicon path is fixed once, not three times.
//
// Nothing here is allowed to invent a fact. A date comes from the content
// hash file or from git; a duration comes from YouTube (audio_meta.json); a
// page count comes from the PDF (pdf_meta.json). Where a value is unknown the
// markup simply omits it.

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const ROOT = path.join(__dirname, '..');
const SITE = 'https://alquranicruqyahhealing.com';
const SITE_NAME = 'আল কুরআনিক রুকইয়াহ হিলিং';
const SITE_NAME_EN = 'Al Quranic Ruqyah Healing';
const AUTHOR = 'রাকী ফয়সাল আহমেদ সাবিত';
const ORG_ID = `${SITE}/#org`;
const SITE_ID = `${SITE}/#site`;
const AUTHOR_ID = `${SITE}/#raqi`;
const OG_FALLBACK = `${SITE}/blog/images/og-default.jpg`;
// The launcher icon is the only square artwork the site has; the previous
// /assets/icon.png reference 404'd on every blog and guide page.
const ICON = '/icons/icon-192.png';
const LOGO = `${SITE}/icons/icon-512.png`;
const FB_PAGE = 'https://www.facebook.com/al.quranic.ruqyah.healing1';
const FB_RAQI = 'https://www.facebook.com/raqi.faisal.ahmed';

const BN = ['০', '১', '২', '৩', '৪', '৫', '৬', '৭', '৮', '৯'];
const BN_MONTHS = ['জানুয়ারি', 'ফেব্রুয়ারি', 'মার্চ', 'এপ্রিল', 'মে', 'জুন',
                   'জুলাই', 'আগস্ট', 'সেপ্টেম্বর', 'অক্টোবর', 'নভেম্বর', 'ডিসেম্বর'];
const toBn = (n) => String(n).replace(/\d/g, (d) => BN[+d]);
const esc = (s) => String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
// audio.json spells য় as one code point (U+09DF), typed Bengali as য + nukta.
// Anything compared across sources goes through NFC first.
const nfc = (s) => String(s == null ? '' : s).normalize('NFC');
const today = () => new Date().toISOString().slice(0, 10);

function bnDate(iso) {
    const [y, m, d] = String(iso || '').split('-').map(Number);
    if (!y || !m || !d) return '';
    return `${toBn(d)} ${BN_MONTHS[m - 1]} ${toBn(y)}`;
}

// Search engines cut descriptions around 155–160 characters.
function metaDesc(s, max = 158) {
    const t = String(s || '').replace(/\s+/g, ' ').trim();
    if (t.length <= max) return t;
    const cut = t.slice(0, max);
    return cut.slice(0, Math.max(cut.lastIndexOf(' '), 40)) + '…';
}

// seconds -> ISO 8601 duration (PT12M34S) and a Bengali phrase for the page.
function isoDuration(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
    return `PT${h ? `${h}H` : ''}${m ? `${m}M` : ''}${s || (!h && !m) ? `${s}S` : ''}`;
}
function bnDuration(sec) {
    sec = Math.round(sec);
    const h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60);
    if (h) return `${toBn(h)} ঘণ্টা ${m ? `${toBn(m)} মিনিট` : ''}`.trim();
    if (m) return `${toBn(m)} মিনিট`;
    return `${toBn(sec)} সেকেন্ড`;
}

// ── Page shell ──────────────────────────────────────────────

const ORG_GRAPH = [
    { '@type': 'Organization', '@id': ORG_ID, name: SITE_NAME, alternateName: SITE_NAME_EN,
      url: `${SITE}/`, logo: LOGO,
      founder: { '@id': AUTHOR_ID }, areaServed: 'BD', knowsLanguage: 'bn', sameAs: [FB_PAGE] },
    { '@type': 'Person', '@id': AUTHOR_ID, name: AUTHOR, url: FB_RAQI, sameAs: [FB_RAQI],
      worksFor: { '@id': ORG_ID } },
    { '@type': 'WebSite', '@id': SITE_ID, url: `${SITE}/`, name: SITE_NAME,
      inLanguage: 'bn', publisher: { '@id': ORG_ID } },
];

// Everything a generated page's <head> needs. `ld` is an array of extra
// JSON-LD nodes; they are merged into one @graph with the organisation.
function head({ title, desc, canonical, ogType = 'website', ogImage, ogImageW, ogImageH,
                robots = 'index, follow, max-image-preview:large, max-snippet:-1',
                ogTitle, ld = [], extra = '' }) {
    const d = metaDesc(desc);
    const img = ogImage || OG_FALLBACK;
    const graph = { '@context': 'https://schema.org', '@graph': [...ORG_GRAPH, ...ld] };
    return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(d)}">
<meta name="author" content="${AUTHOR}">
<meta name="theme-color" content="#080808">
<meta name="robots" content="${robots}">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="${ICON}" type="image/png">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<meta property="og:site_name" content="${SITE_NAME}">
<meta property="og:title" content="${esc(ogTitle || title)}">
<meta property="og:description" content="${esc(d)}">
<meta property="og:type" content="${ogType}">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="bn_BD">
<meta property="og:image" content="${img}">
${ogImageW ? `<meta property="og:image:width" content="${ogImageW}">\n<meta property="og:image:height" content="${ogImageH}">\n` : ''}<meta property="og:image:alt" content="${esc(ogTitle || title)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${esc(ogTitle || title)}">
<meta name="twitter:description" content="${esc(d)}">
<meta name="twitter:image" content="${img}">
<link rel="alternate" type="application/rss+xml" title="${SITE_NAME} — ব্লগ" href="/blog/feed.xml">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Hind+Siliguri:wght@400;500;600;700&family=Amiri:wght@400;700&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
${extra}<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

const NAV = `<nav class="nav">
  <div class="nav-in">
    <a class="brand" href="/"><span class="brand-dot"></span>${SITE_NAME}</a>
    <div class="nav-links">
      <a href="/topics/">বিষয়</a>
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
    <nav class="foot-links" aria-label="সাইটের বিভাগ">
      <a href="/topics/">বিষয় অনুযায়ী</a>
      <a href="/audio/">অডিও লাইব্রেরি</a>
      <a href="/guides/">গাইড ও প্রোটোকল</a>
      <a href="/guides/pdf/">PDF গাইড</a>
      <a href="/blog/">ব্লগ</a>
      <a href="/#book">বই</a>
      <a href="/privacy.html">প্রাইভেসি</a>
    </nav>
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

// A visible breadcrumb trail plus its BreadcrumbList node. `items` is
// [{name, url}] from the home page down to (and including) the current page.
function crumbs(items) {
    const html = `<nav class="crumbs" aria-label="breadcrumb"><ol>${items.map((c, i) =>
        i === items.length - 1
            ? `<li aria-current="page">${esc(c.name)}</li>`
            : `<li><a href="${esc(c.url)}">${esc(c.name)}</a></li>`).join('')}</ol></nav>`;
    const ld = { '@type': 'BreadcrumbList',
        itemListElement: items.map((c, i) => ({
            '@type': 'ListItem', position: i + 1, name: c.name,
            item: c.url.startsWith('http') ? c.url : `${SITE}${c.url}` })) };
    return { html, ld };
}
const HOME_CRUMB = { name: 'হোম', url: '/' };

// Styles for the pieces this module adds to the shared blog.css.
const CSS = `
.crumbs{font-size:.78rem;color:var(--sub);margin:0 0 10px}
.crumbs ol{list-style:none;padding:0;margin:0;display:flex;flex-wrap:wrap;gap:4px 6px}
.crumbs li+li::before{content:"›";margin-right:6px;color:var(--dim)}
.crumbs a{color:var(--sub)}.crumbs a:hover{color:var(--green)}
.foot-links{display:flex;flex-wrap:wrap;gap:8px 18px;font-size:.82rem;font-weight:600;margin-bottom:18px}
.foot-links a{color:var(--sub)}.foot-links a:hover{color:var(--green)}
.rel{margin-top:34px;padding-top:22px;border-top:1px solid var(--border)}
.rel h2{font-size:1.1rem;font-weight:800;margin-bottom:12px}
.rel h3{font-size:.8rem;font-weight:700;color:var(--dim);letter-spacing:.04em;margin:14px 0 6px}
.rel ul{list-style:none;padding:0;margin:0;display:grid;gap:6px}
.rel li a{display:block;padding:10px 14px;background:var(--surface);border:1px solid var(--border);
  border-radius:var(--r-sm);font-size:.9rem;font-weight:600;line-height:1.5}
.rel li a:hover{border-color:rgba(0,229,153,.3);color:var(--green)}
.rel li a small{display:block;font-weight:500;color:var(--sub);font-size:.78rem}
.rel .rel-more{font-size:.84rem;font-weight:700;color:var(--green);margin-top:8px;display:inline-block}
.topic-hero p{color:var(--sub);margin-top:10px;max-width:64ch}
.yt-lite{display:block;position:absolute;inset:0;background:#000;cursor:pointer}
.yt-lite img{width:100%;height:100%;object-fit:cover;opacity:.85}
.yt-lite .yt-play{position:absolute;left:50%;top:50%;width:68px;height:48px;margin:-24px 0 0 -34px;
  background:rgba(0,0,0,.72);border-radius:14px}
.yt-lite .yt-play::after{content:"";position:absolute;left:27px;top:14px;border-style:solid;
  border-width:10px 0 10px 18px;border-color:transparent transparent transparent #fff}
.yt-lite:hover .yt-play{background:#ff0000}
.pdf-prev{display:flex;gap:22px;flex-wrap:wrap;align-items:flex-start;margin:0 0 22px}
.pdf-prev img{width:min(320px,100%);height:auto;border-radius:var(--r-md);border:1px solid var(--border);background:#fff}
.pdf-facts{flex:1;min-width:240px}
.pdf-facts dl{display:grid;grid-template-columns:auto 1fr;gap:6px 14px;font-size:.9rem;margin:0 0 18px}
.pdf-facts dt{color:var(--dim);font-weight:600}.pdf-facts dd{margin:0}
.not-found{text-align:center;padding:70px 0 40px}
.not-found h1{font-size:clamp(1.8rem,5vw,2.6rem);font-weight:800;margin-bottom:12px}
.not-found p{color:var(--sub);margin-bottom:22px}
`;

// ── Topic registry ──────────────────────────────────────────
//
// One entry per subject the site genuinely covers across more than one kind of
// resource. Membership is explicit — category names and slugs — never a fuzzy
// text match, so a hub can only list things that were deliberately put there.
// A topic with nothing in a bucket simply has no section for that bucket.
//
//   guideCats / guideSlugs : guides_src documents (category from guides.json)
//   audioCats / audioTags  : audio.json tracks
//   pdfCats / pdfSlugs     : pdf_list.json legacy PDFs (slug = filename minus .pdf)
//   blogHubs / blogTags    : posts/*.md (hub posts are listed first)
//
// The blurb describes what the site holds on the topic. It makes no religious
// or medical claim of its own — the documents do that in their own words.
const TOPICS = [
    { slug: 'jadu', name: 'সিহর ও জাদু', short: 'জাদু',
      blurb: 'জাদু বা সিহরের বিভিন্ন ধরন — খাওয়ানো, ছিটানো, পুঁতে রাখা, বিচ্ছেদ, বশীকরণ, মাথা ও রেহেমের জাদু — প্রতিটির জন্য আলাদা রুকইয়াহ প্রোটোকল, জুন্দ আল-জানুব সংকলনের আয়াত সিরিজ, রুকইয়াহ অডিও ও PDF গাইড এক জায়গায়। সাথে জাদুর আয়াত ও লক্ষণ নিয়ে ব্লগের লেখা।',
      guideCats: ['সিহর ও জাদু'],
      guideSlugs: ['ayat-puta-jadu', 'ayat-khaoyano-jadu', 'ayat-chhitano-jadu', 'ayat-mass-o-jadur-prabhab',
                   'ayat-tadmir', 'ayat-shasti-o-dohon', 'ayat-durgo', 'atke-thaka-kaj-o-git'],
      audioCats: ['জাদু'], audioTags: ['সিহর', 'জাদু'], pdfCats: ['জাদু'],
      blogHubs: ['sihorer-ayat-o-lokkhon'], blogTags: ['সিহর', 'জাদু', 'কালো জাদু', 'যাদু'] },

    { slug: 'bad-nazar', name: 'বদনজর ও হাসাদ', short: 'বদনজর',
      blurb: 'বদনজর (আইন) ও হাসাদের অনিষ্ট থেকে সুরক্ষা ও নিরাময় — রুকইয়াহ প্রোটোকল, আয়াতুল আইন ওয়াল হাসাদ সংকলন, সূরা ফালাক-নাস ও কলমের আয়াতভিত্তিক রুকইয়াহ অডিও, PDF গাইড, আর লক্ষণ ও দোয়া নিয়ে ব্লগের বিস্তারিত লেখা।',
      guideSlugs: ['badnazar-hasad', 'mathar-badnazar', 'badnazar-ki-o-korniyo', 'ayat-badnazar-hasad-series', 'ayat-al-ayn-hasad'],
      audioCats: ['বদনজর'], audioTags: ['হাসাদ', 'নজর', 'বদনজর'], pdfCats: ['বদনজর'],
      blogHubs: ['bad-nazar-lokkhon-o-dua', 'hasad-er-lokkhon-o-ayat'], blogTags: ['বদনজর', 'হাসাদ', 'নজর'] },

    { slug: 'jinn', name: 'জ্বিন, কারীন ও তাবেআ', short: 'জ্বিন',
      blurb: 'জ্বিনের আছর ও স্পর্শ, আশিক জ্বিন, কারীন, তাবেআ, খুরুজ (শরীর থেকে জ্বিন বের করা) ও জ্বিন চালান — ধাপে ধাপে রুকইয়াহ প্রোটোকল, জ্বিন-সংক্রান্ত আয়াত সিরিজ, রুকইয়াহ অডিও ও PDF গাইড।',
      guideCats: ['জিন সংক্রান্ত'],
      guideSlugs: ['jiner-sporsho-mass', 'ayat-dawat-al-jinn', 'ayat-uranto-jin', 'ayat-shoytan-bitaron', 'ayat-al-khuruj'],
      audioCats: ['জ্বিন', 'কারীন', 'তাবেআ'], pdfCats: ['জ্বিন', 'কারীন'],
      blogTags: ['জ্বিন', 'জিন', 'কারীন', 'আশিক জ্বিন'] },

    { slug: 'git-o-badhon', name: 'গিঁট ও বাঁধন', short: 'গিঁট',
      blurb: 'শরীরের বিভিন্ন জায়গার গিঁট, বন্ধন ও শিকল — মাথা, বুক, পা ও স্নায়ুর গিঁট খোলার রুকইয়াহ অডিও, গিঁট খোলা ও পবিত্রকরণের আয়াত-প্রোটোকল, আর গিঁট-বিষয়ক PDF গাইড।',
      guideSlugs: ['ayat-git-khola', 'rehem-jadu', 'atke-thaka-kaj-o-git'],
      audioCats: ['গিঁট ও বাঁধন'], audioTags: ['গিঁট', 'বন্ধন'], pdfCats: ['গিঁট'],
      blogTags: ['গিঁট', 'বাঁধন', 'বন্ধন'] },

    { slug: 'waswasa', name: 'ওয়াসওয়াসা ও মানসিক অস্থিরতা', short: 'ওয়াসওয়াসা',
      blurb: 'ওয়াসওয়াসা (শয়তানের কুমন্ত্রণা), কারীন, অকারণ ভয়, অ্যাংজাইটি ও মনোযোগের সমস্যা — কখন এটি রুকইয়াহর বিষয় আর কখন চিকিৎসার, সে আলোচনাসহ প্রোটোকল, অন্তরের প্রশান্তির আয়াত, অডিও ও ব্লগের লেখা।',
      guideSlugs: ['karin-waswasa', 'waswasa-o-ontorer-osthirota', 'monojog-anxiety', 'ayat-ontorer-proshanti', 'ibadate-olosota'],
      audioTags: ['ওয়াসওয়াসা'], pdfSlugs: ['head-waswasa-jinn'],
      blogHubs: ['waswasa-theke-muktir-upay'], blogTags: ['ওয়াসওয়াসা', 'নফসের চিকিৎসা'] },

    { slug: 'osukh-o-shifa', name: 'অসুখ ও শিফা', short: 'শিফা',
      blurb: 'শারীরিক অসুস্থতায় শিফা প্রার্থনার রুকইয়াহ — মাথাব্যথা, ঘুম, পেট, শরীর ও কোমর ব্যথা, গোপন অসুখসহ — আয়াতুশ শিফা সংকলন, শিফার রুকইয়াহ অডিও ও রোগভিত্তিক PDF গাইড। রুকইয়াহ চিকিৎসার বিকল্প নয়; প্রতিটি ডকুমেন্টে সে কথা আলাদা করে বলা আছে।',
      guideSlugs: ['sadharon-shifa', 'mathabetha', 'ghumer-somossa', 'peter-somossa', 'shorir-komor-betha', 'gopon-osukh',
                   'ojon-period-pcos', 'chul-pora-soundorjo', 'ayat-ash-shifa', 'ayat-shifa-o-punorjibon'],
      audioCats: ['অসুখ'], audioTags: ['নিরাময়', 'শেফা'], pdfCats: ['অসুখ'],
      blogTags: ['অসুখ', 'শিফা', 'রোগ'] },

    { slug: 'suroksha-o-amol', name: 'সুরক্ষা ও দৈনিক আমল', short: 'সুরক্ষা',
      blurb: 'সমস্যা আসার আগেই ঘর, পরিবার ও নিজের হিফাজতের আমল — ঘর বন্ধ, সার্বিক হিফাজত, শত্রু থেকে সুরক্ষা, সকাল-সন্ধ্যার আযকার ও সূরা বাকারার আমল — প্রোটোকল, আয়াতুত তাহাসসুন সংকলন, সুরক্ষার রুকইয়াহ অডিও ও আমলের PDF।',
      guideSlugs: ['ghor-hifazoter-amol', 'sarbik-hifazat', 'ghor-bondho', 'shotru-theke-hifazat', 'ayat-al-tahassun', 'ayat-ghor-o-shishu'],
      audioCats: ['সুরক্ষা', 'আমল'], pdfCats: ['আমল', 'সুরক্ষা'],
      blogHubs: ['sura-baqarah-ghorer-suroksha'], blogTags: ['সুরক্ষা', 'আমল', 'যিকির', 'সূরা বাকারা'] },

    { slug: 'biye-o-poribar', name: 'বিয়ে, দাম্পত্য ও সন্তান', short: 'পরিবার',
      blurb: 'বিয়ে বন্ধ বা দেরি, দাম্পত্য কলহ ও বিচ্ছেদের জাদু, স্বামী-স্ত্রীর মহব্বত, সন্তান লাভ, গর্ভপাত রোধ, গর্ভবতী মায়ের হিফাজত ও সন্তানের অবাধ্যতা — প্রোটোকল, যাওয়াজ-তালাক ও নুতফার আয়াত, পারিবারিক রুকইয়াহ অডিও ও PDF।',
      guideSlugs: ['biye-bondho', 'dampotto-mohabbot', 'paribarik-kolah', 'bichchheder-jadu', 'sontan-labh', 'gorbhopat-rodh',
                   'gorbhoboti-hifazat', 'sontaner-obaddhota', 'autism-bishesh-shishu', 'tabiah-ruqyah',
                   'ayat-az-zawaj-talaq', 'ayat-nutfa-o-gorbho', 'ayat-jorayur-jadu'],
      audioCats: ['পারিবারিক'], audioTags: ['বিয়ে', 'বিচ্ছেদ'], pdfCats: ['পারিবারিক'],
      blogTags: ['পরিবার', 'দাম্পত্য', 'বিয়ে', 'সন্তান লালন'] },

    { slug: 'rizik-o-kaj', name: 'রিজিক, চাকরি ও আটকে থাকা কাজ', short: 'রিজিক',
      blurb: 'রিজিকে বাধা, চাকরি না হওয়া, ক্যারিয়ারে প্রতিবন্ধকতা, জমিজমার বিরোধ ও আটকে থাকা কাজ — কখন এগুলো সিহরের লক্ষণ আর কখন নয়, সে আলোচনাসহ রুকইয়াহ প্রোটোকল, আয়াতুর রিযক্ব সংকলন ও PDF।',
      guideSlugs: ['rizqe-badha', 'chakri', 'career-badha', 'jomijoma-mamla', 'atke-thaka-kaj', 'atke-thaka-kaj-o-git', 'ayat-ar-rizq'],
      audioTags: ['রিজিক'], pdfSlugs: ['rizq-blessings', 'fakkut-tatil-rizq-blockage'],
      blogTags: ['হালাল রিজিক', 'রিজিক', 'বরকত'] },

    { slug: 'ruqyah-guide', name: 'রুকইয়াহ কীভাবে করবেন', short: 'নিয়ম',
      blurb: 'রুকইয়াহ শুরুর আগে যা জানা দরকার — সেলফ রুকইয়াহর নিয়ম, কী পড়বেন ও কী এড়াবেন, তাবিজ কেন নয়, সমস্যার উৎস চেনা ও ৪১ দিনের কোর্স — প্রবন্ধ, গাইড-অডিও ও ধাপে ধাপে PDF।',
      guideCats: ['প্রবন্ধ'],
      audioCats: ['গাইড', 'শিক্ষা'], audioTags: ['গাইড', 'পরামর্শ'], pdfCats: ['গাইড'],
      blogHubs: ['ruqyah-korar-niyom', 'tabij-ki-jayez'], blogTags: ['সেলফ রুকইয়াহ'] },

    { slug: 'porashona', name: 'পড়াশোনা ও শিক্ষার্থী', short: 'পড়াশোনা',
      blurb: 'শিক্ষার্থীদের জন্য — পড়ায় মনোযোগ, পরীক্ষার প্রস্তুতি, পড়াশোনায় বাধার জাদু ও শিক্ষার্থীর বদনজর — ইলম ও হিকমাহর আয়াত সংকলন, PDF গাইড আর "শেখার শিল্প" সিরিজের ব্লগ লেখা।',
      guideSlugs: ['ayat-al-ilm', 'monojog-anxiety'], pdfCats: ['শিক্ষা'],
      blogTags: ['শিক্ষার্থী', 'পড়ালেখা', 'স্টাডিটিপস', 'শেখারশিল্প'] },
];

const topicUrl = (t) => `/topics/${t.slug}/`;

// guides.json category -> the id of its section on /guides/, so a breadcrumb
// can point at the section with an ASCII anchor instead of a percent-encoded
// Bengali one. A category not listed here falls back to encoding its name.
const GUIDE_CAT_IDS = {
    'প্রবন্ধ': 'probondho', 'সিহর ও জাদু': 'sihr-jadu', 'জিন সংক্রান্ত': 'jinn',
    'বদনজর, হাসাদ ও রিজিক': 'badnazar-hasad-rizik', 'বিয়ে, পরিবার ও মানসিক': 'biye-poribar-manosik',
    'শারীরিক সুস্থতা ও আত্মরক্ষা': 'sharirik-sustho-attorokkha', 'রুকইয়াহ আয়াত সিরিজ': 'ayat-series',
    'আয়াত সংকলন': 'ayat-songkolon',
};
const guideCatId = (cat) => GUIDE_CAT_IDS[nfc(cat)] || GUIDE_CAT_IDS[cat] || encodeURIComponent(cat);
const pdfSlug = (filename) => String(filename).replace(/\.pdf$/i, '');
const pdfUrl = (p) => `/guides/pdf/${pdfSlug(p.filename)}/`;

// Which topics a given resource belongs to. Each predicate checks only the
// explicit lists above.
const inList = (list, v) => Array.isArray(list) && list.map(nfc).includes(nfc(v));
const topicsForGuide = (g) => TOPICS.filter((t) => inList(t.guideCats, g.category) || inList(t.guideSlugs, g.slug));
const topicsForAudio = (a) => TOPICS.filter((t) => inList(t.audioCats, a.category)
    || (a.tags || []).some((tag) => inList(t.audioTags, tag)));
const topicsForPdf = (p) => TOPICS.filter((t) => inList(t.pdfCats, p.category) || inList(t.pdfSlugs, pdfSlug(p.filename)));
const topicsForPost = (p) => TOPICS.filter((t) => inList(t.blogHubs, p.slug)
    || (p.tags || []).some((tag) => inList(t.blogTags, tag)));

// Everything a topic gathers, from the catalogue build.js assembles:
//   { audio: [...audio.json], pdfs: [...pdf_list.json], guides: [{slug,url,title_bn,desc,category}], posts: [{slug,title,description,date,tags}] }
function topicMembers(t, catalog) {
    const guideList = (catalog.guides && catalog.guides.items) || catalog.guides || [];
    const guides = guideList.filter((g) => topicsForGuide(g).includes(t));
    const audio = (catalog.audio || []).filter((a) => topicsForAudio(a).includes(t));
    const pdfs = (catalog.pdfs || []).filter((p) => topicsForPdf(p).includes(t));
    const posts = (catalog.posts || []).filter((p) => topicsForPost(p).includes(t));
    // hub posts first, then newest first
    posts.sort((a, b) => (inList(t.blogHubs, b.slug) - inList(t.blogHubs, a.slug)) || (a.date < b.date ? 1 : -1));
    return { guides, audio, pdfs, posts };
}

// The "এই বিষয়ে আরও" block that guides, audio, PDF and blog pages share. It
// lists the *other* kinds of resource on the same topic, a few of each, and
// links to the topic hub for the rest. `self` is the URL of the page being
// rendered so it never links to itself.
function relatedHtml(topics, catalog, self, { audioSlugs } = {}) {
    if (!topics.length) return '';
    const seen = new Set([self]);
    const pick = (arr, n, urlOf) => {
        const out = [];
        for (const x of arr) {
            const u = urlOf(x);
            if (seen.has(u)) continue;
            seen.add(u); out.push(x);
            if (out.length >= n) break;
        }
        return out;
    };
    const secs = [];
    for (const t of topics.slice(0, 2)) {
        const m = topicMembers(t, catalog);
        const guides = pick(m.guides, 4, (g) => g.url);
        const pdfs = pick(m.pdfs, 3, pdfUrl);
        const cats = [...new Set(m.audio.map((a) => a.category))].filter((c) => audioSlugs && audioSlugs[c]);
        const posts = pick(m.posts, 3, (p) => `/blog/${p.slug}/`);
        const parts = [];
        if (guides.length) parts.push(`<h3>গাইড ও প্রোটোকল</h3><ul>${guides.map((g) =>
            `<li><a href="${esc(g.url)}">${esc(g.title_bn)}<small>${esc(metaDesc(g.desc, 110))}</small></a></li>`).join('')}</ul>`);
        if (cats.length && m.audio.length) parts.push(`<h3>অডিও</h3><ul>${cats.slice(0, 3).map((c) =>
            `<li><a href="/audio/${audioSlugs[c]}/">${esc(c)} — অডিও<small>বিভাগে ${toBn((catalog.audio || []).filter((a) => a.category === c).length)}টি, বিনামূল্যে</small></a></li>`).join('')}</ul>`);
        if (pdfs.length) parts.push(`<h3>PDF গাইড</h3><ul>${pdfs.map((p) =>
            `<li><a href="${pdfUrl(p)}">${esc(p.title_bn)}<small>PDF${p.meta ? ` · ${toBn(p.meta.pages)} পৃষ্ঠা` : ''}</small></a></li>`).join('')}</ul>`);
        if (posts.length) parts.push(`<h3>ব্লগ</h3><ul>${posts.map((p) =>
            `<li><a href="/blog/${esc(p.slug)}/">${esc(p.title)}<small>${esc(metaDesc(p.description, 110))}</small></a></li>`).join('')}</ul>`);
        if (!parts.length) continue;
        secs.push(`<section class="rel">
  <h2>${esc(t.name)} — এই বিষয়ে আরও</h2>
  ${parts.join('\n  ')}
  <a class="rel-more" href="${topicUrl(t)}">${esc(t.name)} — সব গাইড, অডিও, PDF ও লেখা →</a>
</section>`);
    }
    return secs.join('\n');
}

// ── Content dates ───────────────────────────────────────────
//
// A sitemap <lastmod> that is always "today" teaches Google to ignore it. This
// file remembers, per URL, a hash of the *source* content and the dates it
// first appeared and last changed. tools/seed_content_dates.js fills the
// first-seen dates from git history; after that the build maintains it.
const DATES_FILE = path.join(__dirname, 'content-dates.json');
let datesCache = null;
let datesDirty = false;
const datesTouched = new Set();

function loadDates() {
    if (!datesCache) {
        datesCache = fs.existsSync(DATES_FILE) ? JSON.parse(fs.readFileSync(DATES_FILE, 'utf8')) : {};
    }
    return datesCache;
}
const hashOf = (x) => crypto.createHash('sha1').update(typeof x === 'string' ? x : JSON.stringify(x)).digest('hex').slice(0, 16);

// Returns {published, modified} for `key` (a site-relative URL), updating the
// record when the content hash changed. A brand-new key is dated today unless
// a seed date is given.
function contentDates(key, content, seed) {
    const all = loadDates();
    datesTouched.add(key);
    const h = hashOf(content);
    const now = today();
    let rec = all[key];
    if (!rec) {
        rec = all[key] = { hash: h, published: seed || now, modified: seed || now };
        datesDirty = true;
    } else if (!rec.hash) {
        rec.hash = h; datesDirty = true;           // seeded record: adopt the hash silently
    } else if (rec.hash !== h) {
        rec.hash = h; rec.modified = now; datesDirty = true;
    }
    if (rec.published > rec.modified) rec.modified = rec.published;
    return { published: rec.published, modified: rec.modified };
}

// Read-only lookup for a key a page function has already recorded, so a
// caller can fetch the dates for a sitemap row without re-hashing (and
// without accidentally hashing something different).
function datesOf(key) {
    const rec = loadDates()[key];
    if (!rec) throw new Error(`content-dates: ${key} was never recorded — call contentDates() first`);
    return { published: rec.published, modified: rec.modified };
}

function saveDates() {
    const all = loadDates();
    // A page that was not built this run no longer exists; keeping its row
    // would let datesOf() vouch for a URL that is gone.
    for (const k of Object.keys(all)) if (!datesTouched.has(k)) { delete all[k]; datesDirty = true; }
    if (!datesDirty) return;
    const sorted = Object.fromEntries(Object.keys(all).sort().map((k) => [k, all[k]]));
    fs.writeFileSync(DATES_FILE, JSON.stringify(sorted, null, 1) + '\n');
    datesDirty = false;
}

// ── Sitemap ─────────────────────────────────────────────────
//
// One index at /sitemap.xml (the URL Search Console already knows) pointing at
// a file per section, so a problem in one section is visible on its own row
// in the Sitemaps report. Only canonical, indexable, 200 pages go in; the
// builders are responsible for never adding anything else.
const sitemapSections = new Map();

function sitemapAdd(section, loc, { lastmod, changefreq, priority } = {}) {
    if (!/^https:\/\//.test(loc)) throw new Error(`sitemap: not an absolute https URL: ${loc}`);
    if (!sitemapSections.has(section)) sitemapSections.set(section, new Map());
    sitemapSections.get(section).set(loc, { lastmod, changefreq, priority });
}

function writeSitemaps(distDir) {
    const files = [];
    let total = 0;
    for (const [section, rows] of sitemapSections) {
        const name = `sitemap-${section}.xml`;
        let newest = '';
        const body = [...rows].map(([loc, r]) => {
            if (r.lastmod && r.lastmod > newest) newest = r.lastmod;
            return `  <url><loc>${esc(loc)}</loc>`
                + (r.lastmod ? `<lastmod>${r.lastmod}</lastmod>` : '')
                + (r.changefreq ? `<changefreq>${r.changefreq}</changefreq>` : '')
                + (r.priority ? `<priority>${r.priority}</priority>` : '') + '</url>';
        }).join('\n');
        fs.writeFileSync(path.join(distDir, name),
            '<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
            + body + '\n</urlset>\n');
        files.push({ name, newest, count: rows.size });
        total += rows.size;
    }
    fs.writeFileSync(path.join(distDir, 'sitemap.xml'),
        '<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
        + files.map((f) => `  <sitemap><loc>${SITE}/${f.name}</loc>${f.newest ? `<lastmod>${f.newest}</lastmod>` : ''}</sitemap>`).join('\n')
        + '\n</sitemapindex>\n');
    fs.writeFileSync(path.join(distDir, 'robots.txt'),
        `User-agent: *\nAllow: /\n\n`
        + `# The paid book and the course are served per-request by serverless functions — never index them.\n`
        + `Disallow: /api/\n\nSitemap: ${SITE}/sitemap.xml\n`);
    console.log(`Sitemap: ${total} URLs in ${files.length} files (${files.map((f) => `${f.name.replace(/^sitemap-|\.xml$/g, '')}=${f.count}`).join(', ')})`);
    return total;
}

// The 404 page. Vercel serves public/404.html for any path that has no file.
function notFoundPage() {
    return `<!DOCTYPE html>
<html lang="bn">
<head>
${head({ title: `পাতাটি পাওয়া যায়নি — ${SITE_NAME}`, desc: 'এই ঠিকানায় কোনো পাতা নেই। অডিও, গাইড, PDF ও ব্লগ থেকে খুঁজে নিন।',
         canonical: `${SITE}/404.html`, robots: 'noindex, follow' })}
</head>
<body>
${NAV}
<main class="wrap blog-main not-found">
  <h1>পাতাটি পাওয়া যায়নি</h1>
  <p>ঠিকানাটি ভুল হতে পারে, অথবা পাতাটি সরানো হয়েছে। নিচের বিভাগগুলো থেকে খুঁজে নিন —</p>
  <div class="topic-row" style="justify-content:center">
    <a class="topic" href="/topics/">বিষয় অনুযায়ী</a>
    <a class="topic" href="/audio/">অডিও লাইব্রেরি</a>
    <a class="topic" href="/guides/">গাইড ও প্রোটোকল</a>
    <a class="topic" href="/guides/pdf/">PDF গাইড</a>
    <a class="topic" href="/blog/">ব্লগ</a>
    <a class="topic" href="/">হোম</a>
  </div>
</main>
${FOOT}
</body>
</html>`;
}

module.exports = {
    SITE, SITE_NAME, SITE_NAME_EN, AUTHOR, ORG_ID, SITE_ID, AUTHOR_ID, OG_FALLBACK, ICON, LOGO, FB_PAGE, FB_RAQI,
    esc, toBn, nfc, bnDate, metaDesc, today, isoDuration, bnDuration,
    head, NAV, FOOT, CSS, crumbs, HOME_CRUMB,
    TOPICS, topicUrl, guideCatId, pdfSlug, pdfUrl, topicsForGuide, topicsForAudio, topicsForPdf, topicsForPost, topicMembers, relatedHtml,
    contentDates, datesOf, saveDates, hashOf,
    sitemapAdd, writeSitemaps, notFoundPage,
};
