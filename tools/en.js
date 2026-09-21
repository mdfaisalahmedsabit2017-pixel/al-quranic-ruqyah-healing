// The English-first international surface: /en/ — foundation only.
//
// WHY THIS EXISTS: the owner's product direction is an English-first
// international Ruqyah platform, built progressively ALONGSIDE the existing
// Bengali site, never by rewriting it. See PROJECT_MASTER_SPEC.md,
// ARCHITECTURE.md and DECISIONS.md (ADR-002) for the full reasoning — short
// version: the Bengali site is lang="bn", unprefixed, and stays that way
// forever; English lives at /en/ and nowhere else.
//
// WHAT THIS FILE DELIBERATELY DOES NOT DO: it does not machine-translate the
// Bengali corpus, does not invent Qur'an/Hadith citations, scholar quotes,
// testimonials or statistics, and does not promise services (consultation,
// assessment, accounts) that do not exist in English yet. Every number on
// these pages is read live from `catalog`, never typed by hand. Every
// not-yet-built module is labelled "Planned" and links to nothing that does
// not exist. This is the foundation phase (ROADMAP.md "EN-1") — later
// milestones add real English content on top of it, one module at a time.

const fs = require('fs');
const path = require('path');
const seo = require('./seo');

const { SITE, SITE_NAME, SITE_NAME_EN, AUTHOR, ORG_ID, SITE_ID, AUTHOR_ID, esc, contentDates, sitemapAdd } = seo;

// The repo's own package.json already uses this exact English transliteration
// (`"author": "Raqi Faisal Ahmed Sabit"`) — not invented here, just reused for
// English-reading visitors instead of the Bengali script AUTHOR constant.
const AUTHOR_EN = 'Raqi Faisal Ahmed Sabit';

const EN_SITE_ID = `${SITE}/en/#website`;
const WHATSAPP = 'https://wa.me/8801886608999'; // brand-kit standing CTA number, same one the bn site and video watermark use

// A second WebSite node for the English edition, sharing the one real-world
// Organization and the one real Person — not a second brand, one platform in
// two languages. inLanguage:'en' is what tells Google these are language
// variants of the same thing, alongside the hreflang pair on each page.
const EN_WEBSITE_NODE = {
    '@type': 'WebSite', '@id': EN_SITE_ID, url: `${SITE}/en/`, name: `${SITE_NAME_EN} (English)`,
    inLanguage: 'en', publisher: { '@id': ORG_ID },
};

function head({ title, desc, path: urlPath, ld = [] }) {
    const canonical = `${SITE}${urlPath}`;
    const bnEquivalent = urlPath === '/en/' ? `${SITE}/` : `${SITE}/`; // foundation phase: every EN page's closest bn analogue is the homepage until matching bn pages are identified per-module
    const graph = { '@context': 'https://schema.org', '@graph': [
        { '@type': 'Organization', '@id': ORG_ID, name: SITE_NAME, alternateName: SITE_NAME_EN, url: `${SITE}/` },
        { '@type': 'Person', '@id': AUTHOR_ID, name: AUTHOR, worksFor: { '@id': ORG_ID } },
        EN_WEBSITE_NODE,
        { '@type': 'WebPage', '@id': `${canonical}#page`, url: canonical, name: title,
          description: desc, inLanguage: 'en', isPartOf: { '@id': EN_SITE_ID } },
        ...ld,
    ] };
    return `<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<title>${esc(title)}</title>
<meta name="description" content="${esc(desc)}">
<meta name="author" content="${AUTHOR_EN}">
<meta name="theme-color" content="#080808">
<meta name="robots" content="index, follow, max-image-preview:large, max-snippet:-1">
<link rel="canonical" href="${canonical}">
<link rel="icon" href="/icons/icon-192.png" type="image/png">
<link rel="apple-touch-icon" href="/icons/icon-192.png">
<!-- Language variants: this is the foundation phase, so every EN page's
     nearest Bengali analogue is the Bengali homepage. As specific EN modules
     grow a matching bn page, point hreflang at that page instead. -->
<link rel="alternate" hreflang="bn" href="${bnEquivalent}">
<link rel="alternate" hreflang="en" href="${canonical}">
<link rel="alternate" hreflang="x-default" href="${SITE}/">
<meta property="og:site_name" content="${SITE_NAME_EN}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(desc)}">
<meta property="og:type" content="website">
<meta property="og:url" content="${canonical}">
<meta property="og:locale" content="en_US">
<meta property="og:locale:alternate" content="bn_BD">
<meta name="twitter:card" content="summary">
<meta name="twitter:title" content="${esc(title)}">
<meta name="twitter:description" content="${esc(desc)}">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/blog/blog.css">
<script type="application/ld+json">${JSON.stringify(graph)}</script>`;
}

const NAV = `<nav class="nav en">
  <div class="nav-in">
    <a class="brand" href="/en/"><span class="brand-dot"></span>${SITE_NAME_EN}</a>
    <div class="nav-links">
      <a href="/en/">Home</a>
      <a href="/en/start-here/">Start Here</a>
      <a href="/">বাংলা সংস্করণ</a>
    </div>
    <a class="btn btn-p btn-sm" href="/en/start-here/">Start Here</a>
  </div>
</nav>`;

const FOOT = `<footer class="en">
  <div class="wrap">
    <nav class="foot-links" aria-label="Site sections">
      <a href="/en/">Home</a>
      <a href="/en/start-here/">Start Here</a>
      <a href="/">বাংলা সংস্করণ (Bengali site)</a>
      <a href="/privacy.html">Privacy</a>
    </nav>
    <p class="disclaimer">
      Note: Ruqyah is a form of du'a (supplication) and spiritual treatment rooted in the Qur'an and Sunnah —
      it is not a substitute for modern medical or mental-health care. If you or someone you know has severe
      physical or psychological symptoms, please consult a qualified medical professional. Healing (shifa)
      comes from Allah alone.
    </p>
    <div class="foot-bot">
      <span>© ${new Date().getFullYear()} ${SITE_NAME_EN}</span>
      <span>${AUTHOR_EN}</span>
    </div>
  </div>
</footer>`;

// Site-wide facts, read from the real catalogue — never hand-typed, so this
// sentence cannot go stale or overstate what the library actually holds.
function libraryFacts(catalog) {
    const audio = (catalog && catalog.audio && catalog.audio.length) || 0;
    const guides = (catalog && catalog.guides && catalog.guides.items && catalog.guides.items.length) || 0;
    const pdfs = (catalog && catalog.pdfs && catalog.pdfs.length) || 0;
    return { audio, guides, pdfs, docs: guides + pdfs };
}

// Modules from PROJECT_MASTER_SPEC.md / ROADMAP.md that are planned but not
// yet built in English. Each links nowhere — a "Planned" card with no href is
// safer than a live-looking link to a page that does not exist.
const PLANNED_MODULES = [
    { name: 'Ruqyah Knowledge Library', desc: 'Books, guidelines, articles and Qur’an/Hadith references — searchable, sourced, and reviewed before publication.' },
    { name: 'Video Academy', desc: 'Structured video lessons on Ruqyah, self-Ruqyah, and protection adhkar.' },
    { name: 'Educational Assessment', desc: 'A guided, rules-based questionnaire that suggests resources and, where appropriate, a consultation — never a diagnosis.' },
    { name: 'Consultation', desc: 'Booking and case intake for one-to-one guidance with the Raqi. English-language availability is being planned.' },
    { name: 'AI Knowledge Assistant', desc: 'A source-grounded assistant that answers from the platform’s own reviewed library and always cites what it draws from.' },
    { name: 'User Dashboard', desc: 'Saved resources, learning progress, and consultation history in one place.' },
];

function plannedCardsHtml() {
    return PLANNED_MODULES.map((m) => `<div class="card en-card">
        <div class="card-b">
          <span class="tag en-tag-planned">Planned</span>
          <h3>${esc(m.name)}</h3>
          <p class="card-d">${esc(m.desc)}</p>
        </div>
      </div>`).join('');
}

function homePage(catalog) {
    const facts = libraryFacts(catalog);
    const ld = [{
        '@type': 'CollectionPage', '@id': `${SITE}/en/#page`, url: `${SITE}/en/`,
        name: `${SITE_NAME_EN} — English`, inLanguage: 'en', isPartOf: { '@id': EN_SITE_ID },
    }];
    return `<!DOCTYPE html>
<html lang="en" class="en">
<head>
${head({
    title: `${SITE_NAME_EN} — Qur'an & Sunnah-Based Ruqyah Education (English)`,
    desc: `An Islamic Ruqyah education and resource platform by ${AUTHOR_EN}. The full library — ${facts.audio}+ Ruqyah audio recitations and ${facts.docs}+ guides — is live today in Bengali, with an English edition being built module by module.`,
    path: '/en/', ld,
})}
</head>
<body>
${NAV}
<main class="wrap en-main">
  <section class="en-hero">
    <h1>Qur'an &amp; Sunnah-Based Ruqyah, in English</h1>
    <p class="en-hero-sub">${esc(SITE_NAME_EN)} is an Islamic Ruqyah education, resource and consultation platform
      by ${esc(AUTHOR_EN)}. This English edition is being built module by module, alongside the existing Bengali
      platform — nothing here replaces or slows that platform down.</p>
    <div class="en-hero-actions">
      <a class="btn btn-p" href="/en/start-here/">Start Here</a>
      <a class="btn btn-o" href="/">Visit the Bengali site →</a>
    </div>
  </section>

  <section class="en-section">
    <h2>Live today</h2>
    <p class="en-section-sub">The underlying library already exists and is growing daily — currently presented
      in Bengali. The Qur'an recitations themselves are in Arabic regardless of the site's interface language,
      so they are usable today even before every page has an English translation.</p>
    <div class="cards en-cards">
      <a class="card en-card en-card-link" href="/audio/">
        <div class="card-b"><h3>${facts.audio}+ Ruqyah audio recitations</h3>
          <p class="card-d">Categorised Qur'an recitations for self-Ruqyah, on the Bengali site.</p></div>
      </a>
      <a class="card en-card en-card-link" href="/guides/">
        <div class="card-b"><h3>${facts.docs}+ practical guides</h3>
          <p class="card-d">Step-by-step Ruqyah protocols and guidelines, on the Bengali site.</p></div>
      </a>
      <a class="card en-card en-card-link" href="/en/start-here/">
        <div class="card-b"><h3>Start Here (English)</h3>
          <p class="card-d">What Ruqyah is, what this platform can and cannot tell you, and where to go next.</p></div>
      </a>
    </div>
  </section>

  <section class="en-section">
    <h2>Coming to English</h2>
    <p class="en-section-sub">Built one module at a time, each sourced and reviewed before publication rather
      than launched all at once.</p>
    <div class="cards en-cards">
      ${plannedCardsHtml()}
    </div>
  </section>
</main>
${FOOT}
</body>
</html>`;
}

function startHerePage() {
    const trail = seo.crumbs([{ name: 'Home', url: '/en/' }, { name: 'Start Here', url: '/en/start-here/' }]);
    const ld = [{
        '@type': 'WebPage', '@id': `${SITE}/en/start-here/#page`, url: `${SITE}/en/start-here/`,
        name: 'Start Here', inLanguage: 'en', isPartOf: { '@id': EN_SITE_ID }, breadcrumb: trail.ld,
    }];
    return `<!DOCTYPE html>
<html lang="en" class="en">
<head>
${head({
    title: `Start Here — ${SITE_NAME_EN}`,
    desc: "What Ruqyah is, how this platform is organised, and the safety boundaries it holds to — read this before anything else.",
    path: '/en/start-here/', ld,
})}
</head>
<body>
${NAV}
<main class="wrap en-main post-in">
  ${trail.html}
  <h1>Start Here</h1>

  <div class="prose">
    <h2>What Ruqyah is</h2>
    <p>Ruqyah is the practice of reciting the Qur'an and authentic supplications (du'a) over oneself or another
      person, seeking Allah's protection and healing. It is a well-established part of Islamic practice — this
      platform's role is to make sourced, structured Ruqyah education and resources easy to find, not to
      introduce anything new to it.</p>

    <h2>What this platform can and cannot tell you</h2>
    <p>To keep that distinction honest as the platform grows, every part of it holds to the same four
      boundaries:</p>
    <ul>
      <li><strong>Educational information</strong> — general knowledge about Ruqyah, adhkar and related Islamic
        practice.</li>
      <li><strong>Ruqyah guidance</strong> — structured protocols and guidelines for a named concern.</li>
      <li><strong>Preliminary, educational assessment</strong> — a questionnaire that can point toward resources
        or a consultation. It is never a diagnosis, medical or otherwise, and it will never claim that a set of
        symptoms definitively proves the presence of jinn, sihr (magic) or the evil eye.</li>
      <li><strong>Professional consultation</strong> — one-to-one guidance from the Raqi. Where a concern looks
        medical or psychological, this platform's role is to say so and point toward a qualified professional —
        not to replace one.</li>
    </ul>
    <p>If you or someone you know is experiencing severe physical or psychological symptoms, please see a
      qualified medical or mental-health professional. Ruqyah is a form of du'a and spiritual treatment; healing
      (shifa) comes from Allah alone.</p>

    <h2>What's on this platform today</h2>
    <p>The full resource library — Qur'an audio recitations, practical guides, and more — already exists and is
      updated regularly. It is presented in Bengali today, since that is the platform's founding language and
      audience. The Qur'an recitations themselves are in Arabic, so they are already usable regardless of the
      page language.</p>
    <p><a href="/audio/">Browse the audio library →</a> · <a href="/guides/">Browse the guides →</a></p>

    <h2>What's being built for English</h2>
    <p>The English edition is being built one module at a time — starting with this foundation, then a proper
      Knowledge Library, Video Academy, Educational Assessment, Consultation booking, and an AI assistant that
      only answers from this platform's own reviewed sources and always says where its answer came from. Content
      for each module will be original English writing, careful translation, or generated strictly from approved,
      reviewed sources — never a blind machine translation of the Bengali corpus, and never an invented citation,
      quotation or statistic.</p>

    <h2>Get in touch</h2>
    <p>For anything not yet covered here, reach the platform through
      <a href="${WHATSAPP}" rel="nofollow noopener">WhatsApp</a> or
      <a href="https://www.facebook.com/al.quranic.ruqyah.healing1" rel="nofollow noopener">Facebook</a>.</p>
  </div>
</main>
${FOOT}
</body>
</html>`;
}

// Appended to the shared public/blog/blog.css alongside library.js's own
// EXTRA_CSS + seo.CSS — one stylesheet for the whole site, bn and en alike.
// English text does not carry Bengali conjuncts, so it leads with Inter
// instead of Hind Siliguri; everything else (colours, spacing, radii, the
// card/topic/prose components) is the same design system, not a new one.
const CSS = `
.en{font-family:'Inter',-apple-system,sans-serif}
.en .nav-links a[href="/"]{color:var(--sub);font-family:'Hind Siliguri','Inter',sans-serif}
.en-main{padding:0 20px 70px}
.en-hero{padding:56px 0 34px;border-bottom:1px solid var(--border)}
.en-hero h1{font-size:clamp(2rem,5.4vw,3.2rem);font-weight:800;letter-spacing:-.02em;line-height:1.2;max-width:18ch}
.en-hero-sub{color:var(--sub);margin-top:16px;max-width:64ch;font-size:1.05rem;line-height:1.7}
.en-hero-actions{display:flex;flex-wrap:wrap;gap:12px;margin-top:26px}
.btn-o{padding:9px 20px;border-radius:99px;border:1px solid var(--border-md);color:var(--text);font-weight:700;font-size:.92rem}
.btn-o:hover{border-color:rgba(0,229,153,.4);color:var(--green)}
.en-section{padding:38px 0;border-bottom:1px solid var(--border)}
.en-section:last-of-type{border-bottom:0}
.en-section h2{font-size:1.5rem;font-weight:800;letter-spacing:-.01em}
.en-section-sub{color:var(--sub);margin-top:8px;max-width:70ch;line-height:1.7}
.en-cards{margin-top:22px}
.en-card .card-b{padding:20px}
.en-card h3{font-size:1.05rem;font-weight:700;line-height:1.4;margin-top:8px}
.en-card-link:hover{border-color:rgba(0,229,153,.3);transform:translateY(-2px)}
.en-tag-planned{background:rgba(255,255,255,.08);color:var(--sub)}
`;

function buildEn(distDir, catalog) {
    const enDir = path.join(distDir, 'en');
    fs.mkdirSync(enDir, { recursive: true });
    fs.writeFileSync(path.join(enDir, 'index.html'), homePage(catalog));
    const homeDates = contentDates('/en/', { audio: (catalog.audio || []).length, guides: (catalog.guides && catalog.guides.items || []).length, pdfs: (catalog.pdfs || []).length });
    sitemapAdd('en', `${SITE}/en/`, { lastmod: homeDates.modified, changefreq: 'weekly', priority: '0.7' });

    const startHereDir = path.join(enDir, 'start-here');
    fs.mkdirSync(startHereDir, { recursive: true });
    const startHereHtml = startHerePage();
    fs.writeFileSync(path.join(startHereDir, 'index.html'), startHereHtml);
    const startHereDates = contentDates('/en/start-here/', startHereHtml);
    sitemapAdd('en', `${SITE}/en/start-here/`, { lastmod: startHereDates.modified, changefreq: 'monthly', priority: '0.6' });

    const css = path.join(distDir, 'blog', 'blog.css');
    if (fs.existsSync(css)) fs.appendFileSync(css, CSS);

    console.log(`English foundation: 2 pages -> public/en/ (library facts: ${libraryFacts(catalog).audio} audio, ${libraryFacts(catalog).docs} docs)`);
}

module.exports = { buildEn, PLANNED_MODULES };
