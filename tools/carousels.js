// carousels_src/{carousels.json,webp/<slug>/*.webp} -> public/carousels/<slug>/index.html
//
// 242 opus-audited Bangla Facebook carousel posts (শাইখ ফাওয়াজ আল-আসওয়াদ,
// মাদিনাতুল ইলম) from the separate fawaz-carousel project, synced here by
// tools/sync_carousels.py (which also converts the 1080x1350 PNG slides to
// 720px WebP). Unlike guides.js this builder is a real templating pass, not a
// relocation of finished HTML — the source is structured JSON, so the page
// (gallery + accessible per-slide text + SEO/JSON-LD) is built from scratch
// here, following blog.js's postPage()/indexPage() shape.
//
// The gallery itself is plain CSS scroll-snap, not a hand-rolled touch
// handler: overflow-x + scroll-snap-type gives real native swipe on every
// mobile browser for free, and a small IntersectionObserver only keeps the
// dot indicator in sync — there is nothing to get wrong in gesture math.

const fs = require('fs');
const path = require('path');
const seo = require('./seo');

const ROOT = path.join(__dirname, '..');
const SRC = path.join(ROOT, 'carousels_src');
const { SITE, SITE_NAME, AUTHOR, ORG_ID, SITE_ID, AUTHOR_ID, esc, toBn, bnDate, head, NAV, FOOT, crumbs, HOME_CRUMB, metaDesc } = seo;

// Slide text arrives already-authored plain text with occasional **bold**
// (fawaz-carousel's content schema); escape first so a post can never inject
// markup, then re-open exactly that one construct — same order as
// tools/blog.js's inline().
const bold = (s) => esc(s).replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');

const page = (meta, body) => `<!DOCTYPE html>
<html lang="bn">
<head>
${head(meta)}
</head>
<body>
${NAV}
${body}
${FOOT}
</body>
</html>`;

const CSS = `
.car-gallery{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;-webkit-overflow-scrolling:touch;
  gap:0;margin:0 -18px 14px;padding:0 0 4px;scrollbar-width:none}
.car-gallery::-webkit-scrollbar{display:none}
.car-slide{flex:0 0 100%;scroll-snap-align:center;padding:0 18px;box-sizing:border-box}
.car-slide img{width:100%;height:auto;border-radius:var(--r-md);display:block;background:var(--surface)}
.car-slide-text{margin:10px 4px 0;font-size:.92rem;line-height:1.6}
.car-slide-text .kicker{display:block;font-size:.76rem;font-weight:700;color:var(--dim);letter-spacing:.03em;margin-bottom:3px}
.car-slide-text strong{color:var(--green)}
.car-dots{display:flex;gap:6px;justify-content:center;margin:0 0 20px}
.car-dots button{width:7px;height:7px;padding:0;border:0;border-radius:50%;background:var(--border);cursor:pointer}
.car-dots button[aria-current="true"]{background:var(--green);width:18px;border-radius:4px}
.car-caption{white-space:pre-line;line-height:1.75;margin:0 0 14px}
.car-tags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 20px}
.car-tags span{font-size:.8rem;font-weight:600;color:var(--dim);background:var(--surface);
  border:1px solid var(--border);border-radius:999px;padding:3px 11px}
.car-yt{font-size:.86rem;font-weight:600;color:var(--sub)}
.car-cta{display:inline-block;margin:6px 0 22px;padding:11px 20px;border-radius:var(--r-sm);
  background:var(--green);color:#04140c;font-weight:700;text-decoration:none}
.car-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:14px}
.car-card{border:1px solid var(--border);border-radius:var(--r-md);overflow:hidden;background:var(--surface)}
.car-card img{width:100%;aspect-ratio:4/5;object-fit:cover;display:block}
.car-card-b{padding:9px 11px}
.car-card-b h3{font-size:.86rem;font-weight:700;margin:0 0 3px;line-height:1.4}
.car-card-b span{font-size:.72rem;color:var(--dim)}
`;

const GALLERY_JS = `<script>
document.querySelectorAll('.car-gallery').forEach(function(g){
  var dots = g.parentElement.querySelectorAll('.car-dots button');
  if (!dots.length) return;
  var slides = g.querySelectorAll('.car-slide');
  var obs = new IntersectionObserver(function(entries){
    entries.forEach(function(e){
      if (e.isIntersecting) {
        var i = Array.prototype.indexOf.call(slides, e.target);
        dots.forEach(function(d, j){ d.setAttribute('aria-current', j === i ? 'true' : 'false'); });
      }
    });
  }, { root: g, threshold: 0.6 });
  slides.forEach(function(s){ obs.observe(s); });
  dots.forEach(function(d, i){
    d.addEventListener('click', function(){ slides[i].scrollIntoView({ behavior: 'smooth', inline: 'center' }); });
  });
});
</script>`;

function carouselPage(item, others) {
    const canonical = `${SITE}/carousels/${item.slug}/`;
    const ogImage = `${SITE}/carousels/${item.slug}/${item.images[0]}`;
    const desc = metaDesc(item.caption || item.title_bn);
    const trail = crumbs([HOME_CRUMB, { name: 'ক্যারোসেল', url: '/carousels/' }, { name: item.title_bn, url: canonical }]);
    const dates = seo.contentDates(`/carousels/${item.slug}/`, item, item.published_at || undefined);

    const ld = [{
        '@type': 'CreativeWork', '@id': `${canonical}#work`,
        name: item.title_bn, description: desc, url: canonical, inLanguage: 'bn',
        image: ogImage,
        datePublished: dates.published, dateModified: dates.modified,
        author: { '@id': AUTHOR_ID }, publisher: { '@id': ORG_ID },
        isAccessibleForFree: true,
        ...(item.topic ? { about: item.topic } : {}),
    }, trail.ld];

    const slidesBySlide = new Map(item.slides.map((s) => [s.n, s]));
    const gallery = item.images.map((file, i) => {
        const n = i + 1;
        const s = slidesBySlide.get(n);
        const text = s && (s.kicker || s.headline || s.body)
            ? `<div class="car-slide-text">${s.kicker ? `<span class="kicker">${bold(s.kicker)}</span>` : ''}
              ${s.headline ? `<strong style="display:block;font-size:1.02rem;margin-bottom:3px">${bold(s.headline)}</strong>` : ''}
              ${s.body ? `<span>${bold(s.body)}</span>` : ''}</div>`
            : (item.has_promo && n === item.images.length
                ? `${item.promo_cta ? `<div class="car-slide-text"><a class="car-cta" href="${esc(item.promo_cta.href)}">${esc(item.promo_cta.label)} →</a></div>` : ''}`
                : '');
        return `<figure class="car-slide"><img src="${file}" alt="${esc(item.title_bn)} — স্লাইড ${toBn(n)}" loading="${i === 0 ? 'eager' : 'lazy'}" width="720" height="900">${text}</figure>`;
    }).join('');
    const dots = item.images.map((_, i) => `<button type="button" aria-label="স্লাইড ${toBn(i + 1)}" aria-current="${i === 0 ? 'true' : 'false'}"></button>`).join('');

    const body = `<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <a class="back" href="/carousels/">← সব ক্যারোসেল</a>
    <h1>${esc(item.title_bn)}</h1>
    ${item.topic ? `<p class="kicker">${esc(item.topic)}</p>` : ''}
  </div></header>
<main class="wrap blog-main">
  <div class="car-gallery">${gallery}</div>
  <div class="car-dots">${dots}</div>
  <p class="car-caption">${bold(item.caption)}</p>
  ${item.hashtags.length ? `<div class="car-tags">${item.hashtags.map((h) => `<span>${esc(h)}</span>`).join('')}</div>` : ''}
  ${item.youtube_url ? `<p class="car-yt"><a href="${esc(item.youtube_url)}" target="_blank" rel="noopener noreferrer">মূল ভিডিও দেখুন (আরবি) →</a></p>` : ''}
  ${others.length ? `<section class="more reveal">
    <h2>আরও ক্যারোসেল</h2>
    <div class="car-grid">${others.slice(0, 6).map(cardOf).join('')}</div>
  </section>` : ''}
</main>
${GALLERY_JS}`;

    return { html: page({
        title: `${item.title_bn} — ক্যারোসেল — ${SITE_NAME}`,
        desc, canonical, ogType: 'article', ogImage, ogImageW: 720, ogImageH: 900,
        ld, extra: `<style>${CSS}</style>`,
    }, body), dates };
}

const cardOf = (item) => `<a class="car-card" href="/carousels/${item.slug}/">
  <img src="/carousels/${item.slug}/${item.images[0]}" alt="" loading="lazy" width="720" height="900">
  <div class="car-card-b"><h3>${esc(item.title_bn)}</h3>${item.topic ? `<span>${esc(item.topic)}</span>` : ''}</div>
</a>`;

function indexPage(items) {
    const canonical = `${SITE}/carousels/`;
    const desc = `শাইখ ফাওয়াজ আল-আসওয়াদের (মাদিনাতুল ইলম) লেকচার থেকে তৈরি ${toBn(items.length)}টি বাংলা রুকইয়াহ ক্যারোসেল — সিহর, জাদু, বদনজর, হাসাদ, কারীন ও জ্বিন সংক্রান্ত।`;
    const trail = crumbs([HOME_CRUMB, { name: 'ক্যারোসেল', url: canonical }]);
    const dates = seo.contentDates('/carousels/', items.map((i) => i.slug));
    const ld = [{ '@type': 'CollectionPage', '@id': canonical, url: canonical, isPartOf: { '@id': SITE_ID },
        name: 'রুকইয়াহ ক্যারোসেল', description: desc, inLanguage: 'bn', breadcrumb: trail.ld,
        datePublished: dates.published, dateModified: dates.modified }];
    return page({
        title: `রুকইয়াহ ক্যারোসেল — ${toBn(items.length)}টি — ${SITE_NAME}`,
        ogTitle: 'রুকইয়াহ ক্যারোসেল', desc, canonical, ld, extra: `<style>${CSS}</style>`,
    }, `<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <h1>রুকইয়াহ ক্যারোসেল</h1>
    <p>${esc(desc)}</p>
  </div></header>
<main class="wrap blog-main">
  <div class="car-grid">${items.map(cardOf).join('')}</div>
</main>`);
}

function readCarousels() {
    if (!fs.existsSync(SRC)) return [];   // pipeline not synced yet — build must not fail
    const file = path.join(SRC, 'carousels.json');
    if (!fs.existsSync(file)) return [];
    const items = JSON.parse(fs.readFileSync(file, 'utf8'));
    for (const it of items) {
        if (!it.slug) throw new Error('carousels_src/carousels.json: item with no slug');
        if (!it.title_bn) throw new Error(`carousels_src/carousels.json: ${it.slug} has no title_bn`);
        if (!it.images || !it.images.length) throw new Error(`carousels_src/carousels.json: ${it.slug} has no images`);
        const webpDir = path.join(SRC, 'webp', it.slug);
        for (const f of it.images) {
            if (!fs.existsSync(path.join(webpDir, f))) throw new Error(
                `${it.slug}: carousels_src/webp/${it.slug}/${f} is missing (run tools/sync_carousels.py)`);
        }
    }
    return items;
}

function buildCarousels(distDir, catalog) {
    const items = (catalog && catalog.carousels) || readCarousels();
    const outDir = path.join(distDir, 'carousels');
    fs.mkdirSync(outDir, { recursive: true });
    if (!items.length) {
        fs.writeFileSync(path.join(outDir, 'index.html'), indexPage(items));
        console.log('Carousels: 0 items (carousels_src/ not synced) -> public/carousels/');
        return items;
    }

    for (const item of items) {
        const dir = path.join(outDir, item.slug);
        fs.mkdirSync(dir, { recursive: true });
        const webpDir = path.join(SRC, 'webp', item.slug);
        for (const f of item.images) fs.copyFileSync(path.join(webpDir, f), path.join(dir, f));

        const others = items.filter((i) => i.slug !== item.slug);
        const { html, dates } = carouselPage(item, others);
        fs.writeFileSync(path.join(dir, 'index.html'), html);
        seo.sitemapAdd('carousels', `${SITE}/carousels/${item.slug}/`,
            { lastmod: dates.modified, changefreq: 'yearly', priority: '0.5' });
    }

    fs.writeFileSync(path.join(outDir, 'index.html'), indexPage(items));
    seo.sitemapAdd('carousels', `${SITE}/carousels/`, { lastmod: seo.datesOf('/carousels/').modified, changefreq: 'weekly', priority: '0.6' });

    fs.writeFileSync(path.join(outDir, 'index.json'), JSON.stringify(items.map(
        ({ slug, title_bn, topic, images, published_at }) => ({ slug, title_bn, topic, cover: images[0], published_at }))));

    const bytes = items.reduce((n, i) => n + i.images.reduce(
        (m, f) => m + fs.statSync(path.join(SRC, 'webp', i.slug, f)).size, 0), 0);
    console.log(`Carousels: ${items.length} posts -> public/carousels/<slug>/ (${(bytes / 1048576).toFixed(1)} MB of WebP)`);
    return items;
}

module.exports = { readCarousels, buildCarousels };
