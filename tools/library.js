// Crawlable pages for the audio library, the legacy PDF guides and the topic hubs.
//
// The audio catalogue and the 104 PDF guides live inside app.html as
// JavaScript-rendered lists, so Google sees none of it — hundreds of Bengali
// titles that people actually search for are invisible. These pages put the
// same catalogue into plain HTML, one real URL per resource.
//
// This used to stop at one page per category, on the grounds that 278 pages
// carrying a title and a link each is thin content. The reason it now goes one
// page per track anyway: every track link pointed at /app.html#audio-<code>,
// and app.js had no hash routing at all, so all of those links were dead. A
// track needed a real URL before it could be linked, shared, or told to a
// patient over the phone. The thin-content worry is answered by giving each
// page the embedded video, both titles, the real duration and upload date
// (audio_meta.json, fetched from YouTube — never invented), the category
// blurb, its tags, eight siblings and the guides/PDFs on the same topic.
//
// Track URLs are /audio/<CODE>/ — flat, not nested under the category. Codes
// never change (patients already hold them), but a track's category can and
// does, and a URL that moves loses whatever ranking it had.
//
// PDF landing pages are /guides/pdf/<slug>/ (slug = filename minus .pdf).
// Not /pdf/<slug>/: everything under /pdf/ carries a one-year immutable cache
// header, which is right for the files and wrong for a page. Not
// /guides/<slug>/: the legacy pdf/ashik-jinn.pdf and the guides_src document
// ashik-jinn are different things with the same name.

const fs = require('fs');
const path = require('path');
const seo = require('./seo');

const { SITE, SITE_NAME, AUTHOR, AUTHOR_ID, ORG_ID, esc, toBn, nfc, bnDate, head, NAV, FOOT, crumbs, HOME_CRUMB } = seo;
const ROOT = path.join(__dirname, '..');

// Same shapes app.js's getYouTubeId() accepts. Every url in audio.json is a
// watch?v= link today, but youtu.be and /embed/ cost nothing to allow.
const ytId = (url) => {
    const m = String(url || '').match(
        /(?:youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|live\/|shorts\/)|youtu\.be\/)([\w-]{11})/);
    return m ? m[1] : '';
};

// Bengali category -> URL slug. Transliterated by hand: an auto-slug of Bengali
// gives percent-encoded mush in the address bar and in every shared link.
const SLUGS = {
    'জাদু': 'jadu', 'তাবেআ': 'tabea', 'কারীন': 'karin', 'গিঁট ও বাঁধন': 'git-o-badhon',
    'বদনজর': 'bad-nazar', 'গাইড': 'guide', 'আমল': 'amol', 'সুরক্ষা': 'suroksha',
    'শিক্ষা': 'shikkha', 'জ্বিন': 'jinn', 'অসুখ': 'osukh', 'পারিবারিক': 'paribarik',
    'আলোচনা ও লেকচার': 'alochona', 'রুকইয়াহ সেশন': 'ruqyah-session',
};

// Not everything in the library is a recitation: a large part is the shaykh
// talking — signs, causes, advice. Calling those "রুকইয়াহ অডিও" on their own
// page would be a plain untruth, so the wording follows the category.
const LECTURE_CAT = 'আলোচনা ও লেকচার';
// গাইড and শিক্ষা are instruction too — how to do ruqyah, what to avoid — not
// recitations to play over oneself, so they are not counted as রুকইয়াহ either.
const TALK_CATS = new Set([LECTURE_CAT, 'গাইড', 'শিক্ষা']);
const kindOf = (cat) => (cat === LECTURE_CAT ? 'আলোচনা' : TALK_CATS.has(cat) ? 'অডিও' : 'রুকইয়াহ অডিও');
// "আলোচনা ও লেকচার — আলোচনা" says the same word twice; that one category
// already names its own kind.
const headingOf = (cat) => (cat === LECTURE_CAT ? cat : `${cat} — ${kindOf(cat)}`);

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
    'আলোচনা ও লেকচার': 'এগুলো তিলাওয়াত নয় — শায়খের আলোচনা: আক্রান্ত হওয়ার লক্ষণ কী, '
        + 'কেন শেফা দেরি হয়, ঘরে ও শরীরে কী খেয়াল রাখবেন। শুনে বোঝার জন্য, শুনে আমল করার জন্য নয়।',
    'রুকইয়াহ সেশন': 'রেকর্ড করা লাইভ রুকইয়াহ চিকিৎসা সেশন (আরবি ভাষায়) — বাস্তব রোগীর ওপর সরাসরি রুকইয়াহ পড়ার '
        + 'রেকর্ডিং; অনেকগুলো মরক্কোর রাকী নাঈম রাবীর, আর অনেকগুলো একই কেসের ধারাবাহিক পর্ব।',
};
// pdf_list.json spells one category differently from audio.json.
const pdfBlurb = (cat) => BLURB[cat] || BLURB[{ 'গিঁট': 'গিঁট ও বাঁধন' }[cat]] || '';

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

const trackItem = (t) => `<li>
  <a href="/audio/${esc(t.code)}/">
    <span class="lib-code">${esc(t.code)}</span>
    <span class="ep-b">
      <span class="ep-t">${esc(t.title_bn)}</span>
      ${t.tags?.length ? `<span class="ep-d">${t.tags.map(esc).join(' · ')}</span>` : ''}
    </span>
  </a></li>`;

// Topic chips, shown on the section indexes so every hub is one click from
// the pages people land on.
const topicChips = (catalog, current) => `<div class="topic-row">${seo.TOPICS.map((t) =>
    `<a class="topic" href="${seo.topicUrl(t)}"${t.slug === current ? ' aria-current="page"' : ''}>${esc(t.name)}</a>`).join('')}</div>`;

// ── Audio ───────────────────────────────────────────────────

// The YouTube player is ~500 KB of script before a single frame; on a phone
// on a Bangladeshi connection that is the whole page budget. So the page
// ships the thumbnail and a play button, and only builds the iframe on tap.
// Without JavaScript the link opens the embed page directly.
const FACADE_JS = `<script>
document.querySelectorAll('.yt-lite').forEach(function(a){a.addEventListener('click',function(e){
  e.preventDefault();var f=document.createElement('iframe');f.src=a.href;f.title=a.getAttribute('aria-label')||'';
  f.setAttribute('allow','autoplay; accelerometer; encrypted-media; gyroscope; picture-in-picture');
  f.setAttribute('allowfullscreen','');f.setAttribute('referrerpolicy','strict-origin-when-cross-origin');
  a.replaceWith(f);});});
</script>`;

function audioTrackPage(t, related, catalog) {
    const cat = t.category || 'অন্যান্য';
    const catSlug = SLUGS[cat] || cat;
    const canonical = `${SITE}/audio/${t.code}/`;
    const id = ytId(t.url);
    const title = t.title_bn.trim();
    const kind = kindOf(cat);
    const tags = (t.tags || []).filter(Boolean);
    const meta = (id && catalog.audioMeta[id]) || null;
    const desc = `${title} — ${cat} বিষয়ের ${kind} (${t.code})।`
        + `${meta ? ` দৈর্ঘ্য ${seo.bnDuration(meta.duration)}।` : ''}`
        + `${tags.length ? ` ${tags.join(' · ')}।` : ''} বিনামূল্যে শোনা যায়।`;
    const thumb = id ? `https://i.ytimg.com/vi/${id}/hqdefault.jpg` : '';
    const dates = seo.contentDates(`/audio/${t.code}/`, { t, meta });

    const trail = crumbs([HOME_CRUMB, { name: 'অডিও', url: '/audio/' }, { name: cat, url: `/audio/${catSlug}/` },
                          { name: title, url: canonical }]);
    const ld = [{
        '@type': 'VideoObject', '@id': `${canonical}#video`,
        // No inLanguage: the site's title is Bengali but most recordings are
        // Arabic recitation or Arabic talks, and audio.json does not say which.
        name: title, description: desc,
        url: canonical, identifier: t.code,
        ...(id ? { thumbnailUrl: thumb, embedUrl: `https://www.youtube-nocookie.com/embed/${id}` } : {}),
        // uploadDate and duration come from YouTube via tools/fetch_audio_meta.py.
        // A track YouTube would not describe simply has neither — the page is
        // still indexable, it just does not claim a date it cannot back.
        ...(meta ? { uploadDate: meta.uploadDate, duration: seo.isoDuration(meta.duration) } : {}),
        ...(tags.length ? { keywords: tags.join(', ') } : {}),
        isFamilyFriendly: true, isAccessibleForFree: true,
    }, {
        '@type': 'WebPage', '@id': canonical, url: canonical, name: `${title} (${t.code})`,
        isPartOf: { '@id': seo.SITE_ID }, inLanguage: 'bn',
        datePublished: dates.published, dateModified: dates.modified,
        mainEntity: { '@id': `${canonical}#video` }, breadcrumb: trail.ld,
    }];

    const topics = seo.topicsForAudio(t);
    const related_html = seo.relatedHtml(topics, catalog, `/audio/${t.code}/`, { audioSlugs: SLUGS });

    return page({ title: `${title} (${t.code}) — ${SITE_NAME}`, ogTitle: `${title} (${t.code})`, desc, canonical, ld,
                  ogType: 'video.other', ogImage: thumb || undefined, ogImageW: thumb ? 480 : 0, ogImageH: 360 }, `
<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <p class="trk-code">${esc(t.code)} · ${esc(kind)}</p>
    <h1>${esc(title)}</h1>
    ${t.title_ar?.trim() ? `<p class="trk-ar" lang="ar" dir="rtl">${esc(t.title_ar.trim())}</p>` : ''}
    ${meta ? `<p class="trk-meta">দৈর্ঘ্য ${seo.bnDuration(meta.duration)} · ইউটিউবে প্রকাশ ${bnDate(meta.uploadDate)}</p>` : ''}
  </div></header>
<main class="wrap blog-main">
  ${id ? `<div class="trk-embed"><a class="yt-lite" href="https://www.youtube-nocookie.com/embed/${id}?autoplay=1"
      aria-label="চালান: ${esc(title)}"><img src="${thumb}" alt="${esc(title)} — ভিডিও থাম্বনেইল" width="480" height="360" fetchpriority="high"><span class="yt-play" aria-hidden="true"></span></a></div>` : ''}
  <p class="trk-acts">
    <a class="btn btn-p btn-sm" href="/app.html#audio-${esc(t.code)}">অ্যাপে খুলুন</a>
    <a class="btn btn-sm" href="${esc(t.url)}" rel="noopener" target="_blank">ইউটিউবে খুলুন</a>
  </p>
  ${tags.length ? `<p class="trk-tags">${tags.map((tag) =>
      `<a href="/audio/?q=${encodeURIComponent(tag)}" rel="nofollow">${esc(tag)}</a>`).join('')}</p>` : ''}
  <p class="lib-blurb">${esc(BLURB[cat] || '')}</p>
  ${related.length ? `<section class="lib-sec">
    <h2 class="row-hd">${cat === LECTURE_CAT ? 'আরো আলোচনা' : `${esc(cat)} — আরো ${kind}`}</h2>
    <ol class="ep-list">${related.map(trackItem).join('')}</ol>
    <p class="lib-more"><a href="/audio/${esc(catSlug)}/">${esc(cat)}-এর সবগুলো →</a></p>
  </section>` : ''}
  ${related_html}
</main>
${id ? FACADE_JS : ''}`);
}

// People type Banglish far more often than Bengali. `.toLowerCase().includes()`
// — which is all app.js does — finds nothing for "jadu", so the words the
// catalogue is actually organised around get a hand-written alias each. The
// category slugs come free by reversing SLUGS.
// A value may be a list: the catalogue spells the same word more than one way
// (রুকিয়াহ and রুকইয়াহ both occur), and one spelling would miss half the titles.
// Prefer the shortest form that is a substring of the longer ones — "নজর"
// matches "বদনজর" too, while "বদনজর" would miss the plain "নজর" titles.
const ALIASES = {
    ...Object.fromEntries(Object.entries(SLUGS).map(([bn, slug]) => [slug, bn])),
    sihr: 'জাদু', sehr: 'জাদু', magic: 'জাদু', jadoo: 'জাদু',
    nazar: 'নজর', 'bad nazar': 'নজর', ain: 'নজর', eye: 'নজর',
    hasad: 'হাসাদ', hased: 'হাসাদ',
    jin: 'জ্বিন', jinn: 'জ্বিন', jvin: 'জ্বিন', ashik: 'আশিক',
    karin: 'কারীন', qarin: 'কারীন', tabea: 'তাবেআ',
    ruqyah: ['রুকিয়াহ', 'রুকইয়াহ'], rukiyah: ['রুকিয়াহ', 'রুকইয়াহ'],
    ruqiyah: ['রুকিয়াহ', 'রুকইয়াহ'], rokiyah: ['রুকিয়াহ', 'রুকইয়াহ'],
    dua: ['দোয়া', 'দুআ'], doa: ['দোয়া', 'দুআ'],
    sura: ['সূরা', 'সুরা'], surah: ['সূরা', 'সুরা'], ayat: 'আয়াত',
    amol: 'আমল', amal: 'আমল', zikir: ['যিকির', 'জিকির'], jikir: ['যিকির', 'জিকির'],
    git: 'গিঁট', gith: 'গিঁট', bondhon: 'বন্ধন', badha: 'বাধা',
    rizik: 'রিজিক', rizq: 'রিজিক', biye: 'বিয়ে', ghum: 'ঘুম',
    waswasa: 'ওয়াসওয়াসা', oshukh: 'অসুখ', shefa: 'শেফা', shifa: 'শেফা',
    lecture: LECTURE_CAT, alochona: LECTURE_CAT, alap: LECTURE_CAT,
    session: 'রুকইয়াহ সেশন', sessions: 'রুকইয়াহ সেশন', naim: 'রুকইয়াহ সেশন', rabie: 'রুকইয়াহ সেশন',
};

// The catalogue stays in the HTML underneath; this only filters what is
// already there, so the page is whole with JavaScript switched off.
const SEARCH = `<form class="lib-search" role="search" onsubmit="return false">
  <input id="lib-q" type="search" autocomplete="off" spellcheck="false"
         aria-label="অডিও খুঁজুন"
         placeholder="নাম, কোড (যেমন S04), বিষয় বা ট্যাগ দিয়ে খুঁজুন…">
</form>
<div id="lib-out" hidden></div>
<script>
(function () {
  var ALIAS = ${JSON.stringify(ALIASES)};
  var box = document.getElementById('lib-q');
  var out = document.getElementById('lib-out');
  var body = document.getElementById('lib-body');
  var data = null, pending = null;

  // NFC is not optional here. audio.json stores য় as the single code point
  // U+09DF, while anything typed on a phone keyboard — and every Bengali string
  // in this file — is য + nukta. Without normalising both sides, searching
  // "রুকিয়াহ" matched zero of the 111 titles that contain it.
  function norm(s) { return String(s == null ? '' : s).normalize('NFC').toLowerCase(); }
  function hay(t) {
    return norm([t.code, t.title_bn, t.title_ar, t.category, (t.tags || []).join(' ')].join(' '));
  }
  function terms(q) {
    var list = [q];
    for (var k in ALIAS) {
      if (k.indexOf(q) === 0 || (q.length > 2 && q.indexOf(k) === 0)) {
        var v = ALIAS[k];
        if (v && v.push) { for (var i = 0; i < v.length; i++) list.push(norm(v[i])); }
        else list.push(norm(v));
      }
    }
    return list;
  }
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function row(t) {
    return '<li><a href="/audio/' + encodeURIComponent(t.code) + '/">'
      + '<span class="lib-code">' + esc(t.code) + '</span><span class="ep-b">'
      + '<span class="ep-t">' + esc(t.title_bn) + '</span>'
      + '<span class="ep-d">' + esc(t.category) + (t.tags && t.tags.length ? ' · ' + esc(t.tags.join(' · ')) : '')
      + '</span></span></a></li>';
  }
  function draw(q) {
    if (!q) { out.hidden = true; out.innerHTML = ''; if (body) body.hidden = false; return; }
    if (!data) { pending = q; return; }
    var want = terms(q);
    var hits = data.filter(function (t) {
      var h = hay(t);
      for (var i = 0; i < want.length; i++) if (want[i] && h.indexOf(want[i]) !== -1) return true;
      return false;
    });
    if (body) body.hidden = true;
    out.hidden = false;
    out.innerHTML = hits.length
      ? '<p class="lib-count">' + hits.length + 'টি মিলেছে</p><ol class="ep-list">'
        + hits.slice(0, 60).map(row).join('') + '</ol>'
        + (hits.length > 60 ? '<p class="lib-more">প্রথম ৬০টি দেখানো হলো — আরো নির্দিষ্ট করে লিখুন।</p>' : '')
      : '<p class="lib-count">কিছু পাওয়া যায়নি। কোড (S04), বিষয় (জাদু, বদনজর) বা বাংলিশেও (jadu, nazar) খুঁজে দেখুন।</p>';
  }

  fetch('/audio.json').then(function (r) { return r.json(); }).then(function (j) {
    data = j;
    if (pending !== null) { draw(pending); pending = null; }
  }).catch(function () {
    out.hidden = false;
    out.innerHTML = '<p class="lib-count">তালিকা লোড করা যায়নি — নিচের বিষয়গুলো থেকে বেছে নিন।</p>';
  });

  box.addEventListener('input', function () { draw(norm(box.value.trim())); });

  var q = new URLSearchParams(location.search).get('q');
  if (q) { box.value = q; draw(norm(q.trim())); }
})();
</script>`;

function audioCategoryPage(cat, tracks, catalog) {
    const slug = SLUGS[cat] || cat;
    const canonical = `${SITE}/audio/${slug}/`;
    const kind = kindOf(cat);
    const desc = `${BLURB[cat] || ''} ${toBn(tracks.length)}টি ${kind}, বিনামূল্যে শোনা যায়।`.trim();
    const trail = crumbs([HOME_CRUMB, { name: 'অডিও', url: '/audio/' }, { name: cat, url: canonical }]);
    const dates = seo.contentDates(`/audio/${slug}/`, tracks.map((t) => t.code));
    // The category's topics: every topic that lists this category explicitly.
    const topics = seo.TOPICS.filter((t) => (t.audioCats || []).map(nfc).includes(nfc(cat)));
    return page({
        title: `${headingOf(cat)} — ${SITE_NAME}`, ogTitle: headingOf(cat),
        desc, canonical,
        ld: [{
            '@type': 'CollectionPage', '@id': canonical,
            name: headingOf(cat), description: desc, url: canonical, inLanguage: 'bn',
            isPartOf: { '@id': seo.SITE_ID }, breadcrumb: trail.ld,
            datePublished: dates.published, dateModified: dates.modified,
            mainEntity: { '@type': 'ItemList', numberOfItems: tracks.length,
                itemListElement: tracks.slice(0, 100).map((t, i) => ({
                    '@type': 'ListItem', position: i + 1, name: t.title_bn,
                    url: `${SITE}/audio/${t.code}/` })) },
        }],
    }, `<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <h1>${esc(headingOf(cat))}</h1>
    <p>${esc(BLURB[cat] || '')}</p>
  </div></header>
<main class="wrap blog-main">
  ${SEARCH}
  <div id="lib-body">
    <p class="lib-count">${toBn(tracks.length)}টি ${esc(kind)} · সবগুলো বিনামূল্যে</p>
    <ol class="ep-list">${tracks.map(trackItem).join('')}</ol>
  </div>
  ${seo.relatedHtml(topics, catalog, `/audio/${slug}/`, { audioSlugs: SLUGS })}
</main>`);
}

function audioIndexPage(byCat, total, catalog) {
    const canonical = `${SITE}/audio/`;
    const lectures = [...TALK_CATS].reduce((n, c) => n + (byCat[c] || []).length, 0);
    const sessions = (byCat['রুকইয়াহ সেশন'] || []).length;
    // Saying "389 ruqyah audio" is not true once the shaykh's talks and the
    // recorded treatment sessions are separated out, so the count says what
    // each part actually is.
    const split = `${toBn(total - lectures - sessions)}টি রুকইয়াহ, ${toBn(lectures)}টি আলোচনা ও গাইড এবং ${toBn(sessions)}টি চিকিৎসা সেশন`;
    const desc = `${split} — জাদু, বদনজর, জ্বিন, হাসাদ ও গিঁটের রুকইয়াহ অডিও। `
        + `কোড, বিষয় বা ট্যাগ দিয়ে খুঁজুন, বিনামূল্যে শোনা যায়।`;
    const trail = crumbs([HOME_CRUMB, { name: 'অডিও', url: canonical }]);
    const dates = seo.contentDates('/audio/', Object.values(byCat).flat().map((t) => t.code));
    return page({
        title: `রুকইয়াহ অডিও লাইব্রেরি — ${toBn(total)}টি অডিও, বিষয় অনুযায়ী — ${SITE_NAME}`,
        ogTitle: 'রুকইয়াহ অডিও লাইব্রেরি', desc, canonical,
        ld: [{ '@type': 'CollectionPage', '@id': canonical, isPartOf: { '@id': seo.SITE_ID },
               name: 'রুকইয়াহ অডিও লাইব্রেরি', description: desc, url: canonical, inLanguage: 'bn',
               breadcrumb: trail.ld, datePublished: dates.published, dateModified: dates.modified }],
    }, `<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <h1>রুকইয়াহ অডিও লাইব্রেরি</h1>
    <p>জাদু, বদনজর, হাসাদ, জ্বিন ও গিঁটের রুকইয়াহ — মোট ${toBn(total)}টি অডিও (${split}), সবই বিনামূল্যে।
       নাম, কোড বা বিষয় দিয়ে খুঁজুন, অথবা নিচ থেকে বিষয় বেছে নিন।</p>
  </div></header>
<main class="wrap blog-main">
  ${SEARCH}
  <div id="lib-body">
    <div class="topic-row">${Object.entries(byCat).map(([c, ts]) =>
        `<a class="topic" href="/audio/${SLUGS[c] || c}/">${esc(c)}<span>${toBn(ts.length)}</span></a>`).join('')}</div>
    ${Object.entries(byCat).map(([c, ts]) => `<section class="lib-sec">
      <h2 class="row-hd"><a href="/audio/${SLUGS[c] || c}/">${esc(c)}</a>
        <span class="lib-count">${toBn(ts.length)}টি</span></h2>
      <p class="lib-blurb">${esc(BLURB[c] || '')}</p>
      <ol class="ep-list">${ts.slice(0, 8).map(trackItem).join('')}</ol>
      ${ts.length > 8 ? `<p class="lib-more"><a href="/audio/${SLUGS[c] || c}/">${esc(c)}-এর সব ${toBn(ts.length)}টি →</a></p>` : ''}
    </section>`).join('')}
    <section class="lib-sec">
      <h2 class="row-hd">বিষয় অনুযায়ী গাইড, অডিও ও PDF</h2>
      ${topicChips(catalog)}
    </section>
  </div>
</main>`);
}

// ── Guides index + PDF landing pages ────────────────────────

function guidesPage(pdfs, guides, catalog) {
    const canonical = `${SITE}/guides/`;
    const total = pdfs.length + guides.items.length;
    const desc = `${toBn(guides.items.length)}টি রুকইয়াহ প্রোটোকল ও আয়াত সংকলন এবং ${toBn(pdfs.length)}টি PDF গাইড — জাদু, বদনজর, জ্বিন, গিঁট ও দৈনন্দিন আমল। সবই বিনামূল্যে পড়া ও ডাউনলোড করা যায়।`;

    // The guides_src documents come first: they are full text pages with their
    // own URL, so they are what a visitor (and a crawler) should reach first.
    // The PDFs follow, each linking to its landing page under /guides/pdf/.
    const gsecs = guides.categories
        .map((c) => ({ ...c, items: guides.items.filter((i) => i.category === c.bn) }))
        .filter((s) => s.items.length);

    const byCat = {};
    for (const p of pdfs) (byCat[p.category || 'অন্যান্য'] ||= []).push(p);
    const trail = crumbs([HOME_CRUMB, { name: 'গাইড', url: canonical }]);
    const dates = seo.contentDates('/guides/', [guides.items.map((g) => g.slug), pdfs.map((p) => p.filename)]);

    return page({
        title: `রুকইয়াহ গাইড ও প্রোটোকল — ${toBn(total)}টি বাংলা গাইড, আয়াত সংকলন ও PDF — ${SITE_NAME}`,
        ogTitle: 'রুকইয়াহ গাইড ও প্রোটোকল', desc, canonical,
        ld: [{ '@type': 'CollectionPage', '@id': canonical, isPartOf: { '@id': seo.SITE_ID },
               name: 'রুকইয়াহ গাইড ও প্রোটোকল', description: desc, url: canonical, inLanguage: 'bn',
               breadcrumb: trail.ld, datePublished: dates.published, dateModified: dates.modified }],
    }, `<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <h1>রুকইয়াহ গাইড ও প্রোটোকল</h1>
    <p>সেলফ রুকইয়াহ, দৈনন্দিন আমল, বিষয়ভিত্তিক প্রোটোকল ও আয়াত সংকলন — মোট ${toBn(total)}টি, সবই বিনামূল্যে পড়া যায়।</p>
  </div></header>
<main class="wrap blog-main">
  <section class="lib-sec">
    <h2 class="row-hd">বিষয় অনুযায়ী</h2>
    ${topicChips(catalog)}
  </section>
  ${gsecs.map((s) => `<section class="lib-sec" id="${seo.guideCatId(s.bn)}">
    <h2 class="row-hd">${esc(s.bn)} <span class="lib-count">${toBn(s.items.length)}টি</span></h2>
    <p class="lib-blurb">${esc(s.blurb)}</p>
    <ol class="ep-list">${s.items.map((g) => `<li><a href="${g.url}">
      <span class="ep-b"><span class="ep-t">${esc(g.title_bn)}</span><span class="ep-d">${esc(g.desc)}</span></span></a></li>`).join('')}</ol>
  </section>`).join('')}
  <h2 class="row-hd" id="pdf">PDF গাইড <span class="lib-count">${toBn(pdfs.length)}টি</span> · <a href="/guides/pdf/">সবগুলো এক পাতায় →</a></h2>
  ${Object.entries(byCat).map(([c, ps]) => `<section class="lib-sec">
    <h3 class="row-hd">${esc(c)} — PDF <span class="lib-count">${toBn(ps.length)}টি</span></h3>
    <ol class="ep-list">${ps.map((p) => `<li><a href="${seo.pdfUrl(p)}">
      <span class="ep-b"><span class="ep-t">${esc(p.title_bn)}</span>${p.meta ? `<span class="ep-d">PDF · ${toBn(p.meta.pages)} পৃষ্ঠা</span>` : ''}</span></a></li>`).join('')}</ol>
  </section>`).join('')}
</main>`);
}

function pdfIndexPage(pdfs, catalog) {
    const canonical = `${SITE}/guides/pdf/`;
    const byCat = {};
    for (const p of pdfs) (byCat[p.category || 'অন্যান্য'] ||= []).push(p);
    const desc = `${toBn(pdfs.length)}টি বাংলা রুকইয়াহ PDF গাইড — জাদু, জ্বিন, বদনজর, গিঁট, অসুখ, সুরক্ষা ও দৈনিক আমল — বিষয় অনুযায়ী সাজানো, বিনামূল্যে পড়া ও ডাউনলোড করা যায়।`;
    const trail = crumbs([HOME_CRUMB, { name: 'গাইড', url: '/guides/' }, { name: 'PDF গাইড', url: canonical }]);
    const dates = seo.contentDates('/guides/pdf/', pdfs.map((p) => p.filename));
    return page({
        title: `রুকইয়াহ PDF গাইড — ${toBn(pdfs.length)}টি বাংলা PDF, বিষয় অনুযায়ী — ${SITE_NAME}`,
        ogTitle: 'রুকইয়াহ PDF গাইড', desc, canonical,
        ld: [{ '@type': 'CollectionPage', '@id': canonical, isPartOf: { '@id': seo.SITE_ID },
               name: 'রুকইয়াহ PDF গাইড', description: desc, url: canonical, inLanguage: 'bn',
               breadcrumb: trail.ld, datePublished: dates.published, dateModified: dates.modified,
               mainEntity: { '@type': 'ItemList', numberOfItems: pdfs.length,
                   itemListElement: pdfs.map((p, i) => ({ '@type': 'ListItem', position: i + 1,
                       name: p.title_bn, url: `${SITE}${seo.pdfUrl(p)}` })) } }],
    }, `<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <h1>রুকইয়াহ PDF গাইড</h1>
    <p>${esc(desc)}</p>
  </div></header>
<main class="wrap blog-main">
  <div class="topic-row">${Object.entries(byCat).map(([c, ps]) =>
      `<a class="topic" href="#${esc(SLUGS[c] || c)}">${esc(c)}<span>${toBn(ps.length)}</span></a>`).join('')}</div>
  ${Object.entries(byCat).map(([c, ps]) => `<section class="lib-sec" id="${esc(SLUGS[c] || c)}">
    <h2 class="row-hd">${esc(c)} <span class="lib-count">${toBn(ps.length)}টি</span></h2>
    <p class="lib-blurb">${esc(pdfBlurb(c))}</p>
    <ol class="ep-list">${ps.map((p) => `<li><a href="${seo.pdfUrl(p)}">
      <span class="ep-b"><span class="ep-t">${esc(p.title_bn)}</span>${p.meta ? `<span class="ep-d">PDF · ${toBn(p.meta.pages)} পৃষ্ঠা</span>` : ''}</span></a></li>`).join('')}</ol>
  </section>`).join('')}
</main>`);
}

const fmtBytes = (n) => (n >= 1048576 ? `${toBn((n / 1048576).toFixed(1))} MB` : `${toBn(Math.round(n / 1024))} KB`);

function pdfPage(p, siblings, catalog) {
    const slug = seo.pdfSlug(p.filename);
    const canonical = `${SITE}${seo.pdfUrl(p)}`;
    const file = `/pdf/${p.filename}`;
    const cat = p.category || 'অন্যান্য';
    const m = p.meta;
    const preview = m ? `${SITE}/guides/_previews/${m.preview}` : '';
    const desc = `${p.title_bn} — ${cat} বিষয়ের বাংলা রুকইয়াহ PDF গাইড`
        + `${m ? `, ${toBn(m.pages)} পৃষ্ঠা` : ''}। ${pdfBlurb(cat)} বিনামূল্যে পড়ুন ও ডাউনলোড করুন।`;
    const dates = seo.contentDates(seo.pdfUrl(p), m ? m.sha256 : p);
    const trail = crumbs([HOME_CRUMB, { name: 'গাইড', url: '/guides/' }, { name: 'PDF গাইড', url: '/guides/pdf/' },
                          { name: p.title_bn, url: canonical }]);
    const topics = seo.topicsForPdf(p);
    const ld = [{
        '@type': 'DigitalDocument', '@id': `${canonical}#doc`,
        name: p.title_bn, description: desc, url: canonical, inLanguage: 'bn',
        genre: cat, isAccessibleForFree: true,
        // pdf_list.json names no author, so none is claimed; the site is the publisher.
        publisher: { '@id': ORG_ID },
        datePublished: dates.published, dateModified: dates.modified,
        ...(preview ? { thumbnailUrl: preview, image: preview } : {}),
        encoding: { '@type': 'MediaObject', contentUrl: `${SITE}${file}`, encodingFormat: 'application/pdf',
                    ...(m ? { contentSize: `${Math.round(m.bytes / 1024)} KB` } : {}) },
    }, {
        '@type': 'WebPage', '@id': canonical, url: canonical, name: p.title_bn,
        isPartOf: { '@id': seo.SITE_ID }, inLanguage: 'bn', breadcrumb: trail.ld,
        datePublished: dates.published, dateModified: dates.modified,
        mainEntity: { '@id': `${canonical}#doc` },
    }];

    return page({
        title: `${p.title_bn} — রুকইয়াহ PDF গাইড${m ? ` (${toBn(m.pages)} পৃষ্ঠা)` : ''} — ${SITE_NAME}`,
        ogTitle: `${p.title_bn} — PDF`, desc, canonical, ld, ogType: 'article',
        ogImage: preview || undefined, ogImageW: m ? m.previewWidth : 0, ogImageH: m ? m.previewHeight : 0,
    }, `<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <p class="trk-code">PDF গাইড · ${esc(cat)}</p>
    <h1>${esc(p.title_bn)}</h1>
    <p>${esc(pdfBlurb(cat))}</p>
  </div></header>
<main class="wrap blog-main">
  <div class="pdf-prev">
    ${m ? `<a href="${esc(file)}" target="_blank" rel="noopener"><img src="/guides/_previews/${esc(m.preview)}" alt="${esc(p.title_bn)} — PDF-এর প্রথম পৃষ্ঠা" width="${m.previewWidth}" height="${m.previewHeight}" fetchpriority="high"></a>` : ''}
    <div class="pdf-facts">
      <dl>
        <dt>বিষয়</dt><dd><a href="/guides/pdf/#${esc(SLUGS[cat] || cat)}">${esc(cat)}</a></dd>
        ${m ? `<dt>পৃষ্ঠা</dt><dd>${toBn(m.pages)}</dd><dt>ফাইল</dt><dd>PDF · ${fmtBytes(m.bytes)}</dd>` : '<dt>ফাইল</dt><dd>PDF</dd>'}
        <dt>মূল্য</dt><dd>বিনামূল্যে</dd>
      </dl>
      <p class="trk-acts">
        <a class="btn btn-p btn-sm" href="${esc(file)}" target="_blank" rel="noopener">PDF খুলুন</a>
        <a class="btn btn-sm" href="${esc(file)}" download>ডাউনলোড</a>
      </p>
      <p class="lib-blurb">${m ? 'প্রথম পৃষ্ঠার ছবিটি PDF থেকে নেওয়া। ' : ''}পুরো গাইডটি ব্রাউজারেই পড়া যায়, প্রিন্টও করা যায়;
        অ্যাপে "গাইড" ট্যাব থেকেও এটি খোলা যায়। কোনো গাইডই চিকিৎসকের পরামর্শের বিকল্প নয়।</p>
    </div>
  </div>
  ${siblings.length ? `<section class="lib-sec">
    <h2 class="row-hd">${esc(cat)} — আরো PDF গাইড</h2>
    <ol class="ep-list">${siblings.map((s) => `<li><a href="${seo.pdfUrl(s)}">
      <span class="ep-b"><span class="ep-t">${esc(s.title_bn)}</span>${s.meta ? `<span class="ep-d">PDF · ${toBn(s.meta.pages)} পৃষ্ঠা</span>` : ''}</span></a></li>`).join('')}</ol>
    <p class="lib-more"><a href="/guides/pdf/#${esc(SLUGS[cat] || cat)}">${esc(cat)}-এর সব PDF →</a></p>
  </section>` : ''}
  ${seo.relatedHtml(topics, catalog, seo.pdfUrl(p), { audioSlugs: SLUGS })}
</main>`);
}

// ── Topic hubs ──────────────────────────────────────────────

function topicPage(t, catalog) {
    const canonical = `${SITE}${seo.topicUrl(t)}`;
    const m = seo.topicMembers(t, catalog);
    const counts = [
        m.guides.length ? `${toBn(m.guides.length)}টি গাইড` : '',
        m.audio.length ? `${toBn(m.audio.length)}টি অডিও` : '',
        m.pdfs.length ? `${toBn(m.pdfs.length)}টি PDF` : '',
        m.posts.length ? `${toBn(m.posts.length)}টি লেখা` : '',
    ].filter(Boolean).join(', ');
    const desc = `${t.name} — ${counts}। ${t.blurb}`;
    const trail = crumbs([HOME_CRUMB, { name: 'বিষয়', url: '/topics/' }, { name: t.name, url: canonical }]);
    const dates = seo.contentDates(seo.topicUrl(t), {
        g: m.guides.map((g) => g.slug), a: m.audio.map((a) => a.code),
        p: m.pdfs.map((p) => p.filename), b: m.posts.map((p) => p.slug), blurb: t.blurb });

    const audioByCat = {};
    for (const a of m.audio) (audioByCat[a.category] ||= []).push(a);

    return page({
        title: `${t.name} — রুকইয়াহ গাইড, অডিও, PDF ও লেখা — ${SITE_NAME}`, ogTitle: t.name, desc, canonical,
        ld: [{ '@type': 'CollectionPage', '@id': canonical, isPartOf: { '@id': seo.SITE_ID },
               name: t.name, description: desc, url: canonical, inLanguage: 'bn', about: { '@type': 'Thing', name: t.name },
               breadcrumb: trail.ld, datePublished: dates.published, dateModified: dates.modified,
               hasPart: [
                   ...m.guides.map((g) => ({ '@type': 'Article', name: g.title_bn, url: `${SITE}${g.url}` })),
                   ...m.pdfs.map((p) => ({ '@type': 'DigitalDocument', name: p.title_bn, url: `${SITE}${seo.pdfUrl(p)}` })),
               ].slice(0, 100) }],
    }, `<header class="blog-hd topic-hero"><div class="wrap">
    ${trail.html}
    <h1>${esc(t.name)}</h1>
    <p>${esc(t.blurb)}</p>
    <p class="lib-count">${esc(counts)}</p>
  </div></header>
<main class="wrap blog-main">
  ${m.guides.length ? `<section class="lib-sec">
    <h2 class="row-hd">গাইড, প্রোটোকল ও আয়াত সংকলন <span class="lib-count">${toBn(m.guides.length)}টি</span></h2>
    <ol class="ep-list">${m.guides.map((g) => `<li><a href="${g.url}">
      <span class="ep-b"><span class="ep-t">${esc(g.title_bn)}</span><span class="ep-d">${esc(g.desc)}</span></span></a></li>`).join('')}</ol>
  </section>` : ''}
  ${m.audio.length ? `<section class="lib-sec">
    <h2 class="row-hd">রুকইয়াহ অডিও <span class="lib-count">${toBn(m.audio.length)}টি</span></h2>
    ${Object.entries(audioByCat).map(([c, ts]) => `
    <h3 class="row-hd"><a href="/audio/${SLUGS[c] || c}/">${esc(c)}</a> <span class="lib-count">${toBn(ts.length)}টি</span></h3>
    <ol class="ep-list">${ts.slice(0, 8).map(trackItem).join('')}</ol>
    ${ts.length > 8 ? `<p class="lib-more"><a href="/audio/${SLUGS[c] || c}/">${esc(c)} বিভাগের সব ${toBn(catalog.audio.filter((a) => a.category === c).length)}টি অডিও →</a></p>` : ''}`).join('')}
  </section>` : ''}
  ${m.pdfs.length ? `<section class="lib-sec">
    <h2 class="row-hd">PDF গাইড <span class="lib-count">${toBn(m.pdfs.length)}টি</span></h2>
    <ol class="ep-list">${m.pdfs.map((p) => `<li><a href="${seo.pdfUrl(p)}">
      <span class="ep-b"><span class="ep-t">${esc(p.title_bn)}</span><span class="ep-d">${esc(p.category)} · PDF${p.meta ? ` · ${toBn(p.meta.pages)} পৃষ্ঠা` : ''}</span></span></a></li>`).join('')}</ol>
  </section>` : ''}
  ${m.posts.length ? `<section class="lib-sec">
    <h2 class="row-hd">ব্লগের লেখা <span class="lib-count">${toBn(m.posts.length)}টি</span></h2>
    <ol class="ep-list">${m.posts.slice(0, 15).map((p) => `<li><a href="/blog/${esc(p.slug)}/">
      <span class="ep-b"><span class="ep-t">${esc(p.title)}</span><span class="ep-d">${esc(p.description)}</span></span></a></li>`).join('')}</ol>
    ${m.posts.length > 15 ? `<p class="lib-more"><a href="/blog/">ব্লগে আরো →</a></p>` : ''}
  </section>` : ''}
  <section class="lib-sec">
    <h2 class="row-hd">অন্যান্য বিষয়</h2>
    ${topicChips(catalog, t.slug)}
  </section>
</main>`);
}

function topicsIndexPage(catalog) {
    const canonical = `${SITE}/topics/`;
    const desc = 'জাদু, বদনজর, জ্বিন, গিঁট, ওয়াসওয়াসা, অসুখ, সুরক্ষা, পরিবার, রিজিক ও পড়াশোনা — প্রতিটি বিষয়ের রুকইয়াহ গাইড, অডিও, PDF ও ব্লগের লেখা এক পাতায়।';
    const trail = crumbs([HOME_CRUMB, { name: 'বিষয়', url: canonical }]);
    const dates = seo.contentDates('/topics/', seo.TOPICS.map((t) => [t.slug, t.name, t.blurb]));
    return page({
        title: `বিষয় অনুযায়ী রুকইয়াহ — গাইড, অডিও, PDF ও লেখা — ${SITE_NAME}`, ogTitle: 'বিষয় অনুযায়ী রুকইয়াহ', desc, canonical,
        ld: [{ '@type': 'CollectionPage', '@id': canonical, isPartOf: { '@id': seo.SITE_ID },
               name: 'বিষয় অনুযায়ী রুকইয়াহ', description: desc, url: canonical, inLanguage: 'bn',
               breadcrumb: trail.ld, datePublished: dates.published, dateModified: dates.modified }],
    }, `<header class="blog-hd"><div class="wrap">
    ${trail.html}
    <h1>বিষয় অনুযায়ী রুকইয়াহ</h1>
    <p>${esc(desc)}</p>
  </div></header>
<main class="wrap blog-main">
  <div class="cards">${seo.TOPICS.map((t) => {
        const m = seo.topicMembers(t, catalog);
        const bits = [m.guides.length && `${toBn(m.guides.length)} গাইড`, m.audio.length && `${toBn(m.audio.length)} অডিও`,
                      m.pdfs.length && `${toBn(m.pdfs.length)} PDF`, m.posts.length && `${toBn(m.posts.length)} লেখা`].filter(Boolean);
        return `<a class="card" href="${seo.topicUrl(t)}"><div class="card-ph"></div><div class="card-b">
      <p class="card-date">${esc(bits.join(' · '))}</p>
      <h3>${esc(t.name)}</h3>
      <p class="card-d">${esc(t.blurb)}</p>
    </div></a>`;
    }).join('')}</div>
</main>`);
}

const EXTRA_CSS = `
.lib-count{font-size:.8rem;color:var(--sub);font-weight:600}
.lib-blurb{font-size:.86rem;color:var(--sub);margin:-6px 0 12px;max-width:70ch}
.lib-sec{margin-bottom:34px}
.lib-sec .row-hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap}
.lib-sec .row-hd a{color:inherit}
.lib-sec .row-hd a:hover{color:var(--green)}
.lib-sec h3.row-hd{font-size:.98rem;margin:18px 0 10px}
.lib-more{margin-top:10px;font-size:.86rem;font-weight:700}
.lib-more a{color:var(--green)}
.lib-code{flex-shrink:0;min-width:3em;font-weight:800;color:var(--green);font-size:.78rem;padding-top:3px}
.lib-search{margin:0 0 22px}
.lib-search input{width:100%;padding:12px 14px;font:inherit;font-size:.95rem;border-radius:10px;
  border:1px solid var(--line,#2a2a2a);background:var(--card,#111);color:inherit}
.lib-search input:focus{outline:2px solid var(--green);outline-offset:1px}
.trk-code{font-weight:800;color:var(--green);font-size:.78rem;letter-spacing:.06em;margin-bottom:6px}
.trk-ar{font-family:Amiri,serif;font-size:1.05rem;line-height:1.9;color:var(--sub);margin-top:10px;max-width:60ch}
.trk-meta{font-size:.8rem;color:var(--dim);font-weight:600;margin-top:10px}
.trk-embed{position:relative;padding-top:56.25%;margin:0 0 18px;border-radius:12px;overflow:hidden;background:#000}
.trk-embed iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
.trk-acts{display:flex;flex-wrap:wrap;gap:10px;margin:0 0 16px}
.trk-tags{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px}
.trk-tags a{font-size:.78rem;font-weight:600;padding:4px 10px;border-radius:999px;
  border:1px solid var(--line,#2a2a2a);color:var(--sub)}
.trk-tags a:hover{color:var(--green);border-color:var(--green)}
`;

function copyDir(src, dest) {
    fs.mkdirSync(dest, { recursive: true });
    for (const e of fs.readdirSync(src, { withFileTypes: true })) {
        const s = path.join(src, e.name), d = path.join(dest, e.name);
        if (e.isDirectory()) copyDir(s, d); else fs.copyFileSync(s, d);
    }
}

// catalog: { guides: {items, categories}, posts, audio, audioMeta, pdfs } — see build.js
function buildLibrary(distDir, catalog) {
    const { audio, pdfs, guides } = catalog;

    const byCat = {};
    for (const t of audio) (byCat[t.category || 'অন্যান্য'] ||= []).push(t);
    // biggest categories first — the page should lead with what there is most of
    const sorted = Object.fromEntries(Object.entries(byCat).sort((a, b) => b[1].length - a[1].length));

    const audioDir = path.join(distDir, 'audio');
    fs.mkdirSync(audioDir, { recursive: true });
    fs.writeFileSync(path.join(audioDir, 'index.html'), audioIndexPage(sorted, audio.length, catalog));
    seo.sitemapAdd('audio', `${SITE}/audio/`, { lastmod: seo.datesOf('/audio/').modified, changefreq: 'weekly', priority: '0.8' });

    let trackPages = 0;
    for (const [cat, tracks] of Object.entries(sorted)) {
        const slug = SLUGS[cat] || cat;
        const dir = path.join(audioDir, slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), audioCategoryPage(cat, tracks, catalog));
        seo.sitemapAdd('audio', `${SITE}/audio/${slug}/`, { lastmod: seo.datesOf(`/audio/${slug}/`).modified, changefreq: 'weekly', priority: '0.7' });

        for (const t of tracks) {
            // A code is the only stable identifier a track has, and it is what
            // patients are given, so it is also the directory name. Reject
            // anything that would escape the audio directory rather than
            // trusting the data.
            if (!/^[A-Za-z]\d{1,4}$/.test(t.code)) {
                throw new Error(`audio.json: unusable code ${JSON.stringify(t.code)} — `
                    + 'a track URL is built from it, so it must be letter+digits');
            }
            // Eight neighbours around the track's own position, so a category of
            // 111 does not show the same eight on every page.
            const i = tracks.indexOf(t);
            const start = Math.max(0, Math.min(i - 4, tracks.length - 9));
            const related = tracks.slice(start, start + 9).filter((r) => r.code !== t.code).slice(0, 8);
            const tdir = path.join(audioDir, t.code);
            fs.mkdirSync(tdir, { recursive: true });
            fs.writeFileSync(path.join(tdir, 'index.html'), audioTrackPage(t, related, catalog));
            seo.sitemapAdd('audio', `${SITE}/audio/${t.code}/`, { lastmod: seo.datesOf(`/audio/${t.code}/`).modified, changefreq: 'monthly', priority: '0.6' });
            trackPages++;
        }
    }

    // buildGuides has already written public/guides/<slug>/; this adds the
    // index above them, the PDF landing pages beside them, and the previews.
    const guidesDir = path.join(distDir, 'guides');
    fs.mkdirSync(guidesDir, { recursive: true });
    fs.writeFileSync(path.join(guidesDir, 'index.html'), guidesPage(pdfs, guides, catalog));
    seo.sitemapAdd('guides', `${SITE}/guides/`, { lastmod: seo.datesOf('/guides/').modified, changefreq: 'weekly', priority: '0.9' });

    const pdfDir = path.join(guidesDir, 'pdf');
    fs.mkdirSync(pdfDir, { recursive: true });
    fs.writeFileSync(path.join(pdfDir, 'index.html'), pdfIndexPage(pdfs, catalog));
    seo.sitemapAdd('pdf', `${SITE}/guides/pdf/`, { lastmod: seo.datesOf('/guides/pdf/').modified, changefreq: 'weekly', priority: '0.8' });
    const previews = path.join(ROOT, 'pdf_previews');
    if (fs.existsSync(previews)) copyDir(previews, path.join(guidesDir, '_previews'));
    const pdfByCat = {};
    for (const p of pdfs) (pdfByCat[p.category || 'অন্যান্য'] ||= []).push(p);
    const usedSlugs = new Set();
    for (const p of pdfs) {
        const slug = seo.pdfSlug(p.filename);
        if (!/^[\w-]+$/.test(slug)) throw new Error(`pdf_list.json: filename ${JSON.stringify(p.filename)} cannot become a URL`);
        if (usedSlugs.has(slug)) throw new Error(`pdf_list.json: two entries share the slug ${slug}`);
        usedSlugs.add(slug);
        if (!fs.existsSync(path.join(ROOT, 'pdf', p.filename))) throw new Error(`pdf_list.json lists ${p.filename} but pdf/${p.filename} is missing`);
        const siblings = pdfByCat[p.category || 'অন্যান্য'].filter((s) => s !== p).slice(0, 8);
        const dir = path.join(pdfDir, slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), pdfPage(p, siblings, catalog));
        seo.sitemapAdd('pdf', `${SITE}${seo.pdfUrl(p)}`, { lastmod: seo.datesOf(seo.pdfUrl(p)).modified, changefreq: 'monthly', priority: '0.6' });
    }
    const noMeta = pdfs.filter((p) => !p.meta).length;
    if (noMeta) console.warn(`  ⚠️  ${noMeta} PDF(s) have no entry in pdf_meta.json — run \`python tools/make_pdf_previews.py\` for page counts and previews.`);

    // Topic hubs.
    const topicsDir = path.join(distDir, 'topics');
    fs.mkdirSync(topicsDir, { recursive: true });
    fs.writeFileSync(path.join(topicsDir, 'index.html'), topicsIndexPage(catalog));
    seo.sitemapAdd('topics', `${SITE}/topics/`, { lastmod: seo.datesOf('/topics/').modified, changefreq: 'weekly', priority: '0.8' });
    for (const t of seo.TOPICS) {
        const m = seo.topicMembers(t, catalog);
        const n = m.guides.length + m.audio.length + m.pdfs.length + m.posts.length;
        // A hub with fewer than three things on it is a thin page, not a hub.
        if (n < 3) throw new Error(`topic ${t.slug} gathers only ${n} resources — fix the registry in tools/seo.js`);
        const dir = path.join(topicsDir, t.slug);
        fs.mkdirSync(dir, { recursive: true });
        fs.writeFileSync(path.join(dir, 'index.html'), topicPage(t, catalog));
        seo.sitemapAdd('topics', `${SITE}${seo.topicUrl(t)}`, { lastmod: seo.datesOf(seo.topicUrl(t)).modified, changefreq: 'weekly', priority: '0.8' });
    }

    fs.writeFileSync(path.join(distDir, '404.html'), seo.notFoundPage());

    // append the library-only rules to the shared stylesheet
    const css = path.join(distDir, 'blog', 'blog.css');
    if (fs.existsSync(css)) fs.appendFileSync(css, EXTRA_CSS + seo.CSS);

    console.log(`Library: ${audio.length} audio in ${Object.keys(sorted).length} categories, `
              + `${trackPages} track pages, ${pdfs.length} PDF landing pages, ${seo.TOPICS.length} topic hubs, `
              + `${guides.items.length} documents -> public/audio/, public/guides/, public/topics/`);
}

module.exports = { buildLibrary, SLUGS };
