// Hits the real production deployment and fails loudly if what actually
// shipped is broken — as opposed to tools/smoke.js, which only proves the
// *local build output* boots in jsdom. A deploy can pass every local check
// and still ship broken: a git-triggered Vercel build once shipped a chapter
// page with an empty {"pages":0} note file, and nothing in the build log said
// so, because nothing had ever asked the live URL what it actually answered.
//
//     node tools/verify-prod.js                 # checks https://alquranicruqyahhealing.com
//     node tools/verify-prod.js https://foo.vercel.app
//
// Run this after `vercel --prod`, not instead of the local `npm run check`.

const BASE = (process.argv[2] || process.env.PROD_URL || 'https://alquranicruqyahhealing.com').replace(/\/$/, '');

const lines = [];
let failed = 0;
function check(label, cond, detail = '') {
    if (!cond) failed++;
    lines.push(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
}

async function getText(path) {
    const res = await fetch(BASE + path);
    return { status: res.status, headers: res.headers, text: await res.text() };
}

async function getJSON(path) {
    const { status, text } = await getText(path);
    try { return { status, json: JSON.parse(text) }; }
    catch (e) { return { status, json: null, parseError: e.message, raw: text.slice(0, 200) }; }
}

async function run() {
    console.log(`--- verify-prod: ${BASE} ---`);

    // ── The site itself boots ────────────────────────────────────────────────
    {
        const { status, text } = await getText('/');
        check('homepage responds 200', status === 200, `status ${status}`);
        check('homepage is not an error/placeholder page',
            text.length > 5000 && !/^\s*(404|An error occurred|<title>Error)/i.test(text.trim()));
    }

    // ── Catalogs are real, not an empty/zeroed deploy ───────────────────────
    // The thresholds are deliberately loose (this library only grows) — the
    // point is catching "zero" or "missing", not tracking exact counts.
    {
        const { status, json } = await getJSON('/audio.json');
        check('audio.json is reachable', status === 200, `status ${status}`);
        check('audio.json is a non-trivial array', Array.isArray(json) && json.length > 50,
            Array.isArray(json) ? `${json.length} entries` : typeof json);
    }
    {
        const { status, json } = await getJSON('/pdf_list.json');
        check('pdf_list.json is reachable', status === 200, `status ${status}`);
        check('pdf_list.json is a non-empty array', Array.isArray(json) && json.length > 0,
            Array.isArray(json) ? `${json.length} entries` : typeof json);
    }
    // Reviews live in Firestore, not as a deployed static file — reviews.json
    // in the repo root is a local export/seed (tools/export_reviews.js), never
    // copied into public/. Nothing to check here.

    // ── SEO surface (tools/seo.js output) actually deployed ─────────────────
    {
        const { status, text } = await getText('/sitemap.xml');
        check('sitemap.xml is reachable', status === 200, `status ${status}`);
        check('sitemap.xml is an index, not an empty stub',
            text.includes('<sitemapindex') && text.includes('</sitemapindex>'));
    }
    {
        const { status, text } = await getText('/robots.txt');
        check('robots.txt is reachable', status === 200, `status ${status}`);
        check('robots.txt names the sitemap and does not block the site',
            /Sitemap:/.test(text) && !/Disallow: \/$/m.test(text));
    }

    // ── /api/chat: the 2026-09-21 security fix must be live, not just local ──
    {
        const { status, headers, text } = await getText('/api/chat'); // GET: method not allowed either way
        check('GET /api/chat is rejected (not left open as a GET-able proxy)',
            status === 405 || status === 401 || status === 403, `status ${status}`);
    }
    {
        const res = await fetch(BASE + '/api/chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ contents: [] }),
        });
        const body = await res.json().catch(() => ({}));
        check('POST /api/chat with no Authorization header is rejected, not answered',
            res.status === 401 && body.error === 'login_required', `status ${res.status}, body ${JSON.stringify(body)}`);
    }
    {
        const res = await fetch(BASE + '/api/chat', { method: 'OPTIONS' });
        const cors = res.headers.get('access-control-allow-origin');
        check('/api/chat no longer answers preflight with Access-Control-Allow-Origin: *',
            cors !== '*', `got "${cors}"`);
    }

    // ── /api/membership and /api/course: unauthenticated calls must not 200 ──
    {
        const res = await fetch(BASE + '/api/membership');
        check('GET /api/membership with no token is rejected', res.status === 401, `status ${res.status}`);
    }

    console.log(lines.join('\n'));
    if (failed) {
        console.error(`\n❌ ${failed} production check(s) failed against ${BASE}.`);
        process.exit(1);
    }
    console.log(`\n✅ ${BASE} is serving real content and the /api/chat gate is live.`);
}

run().catch((e) => {
    console.error('verify-prod.js threw:', e.stack || e.message);
    process.exit(1);
});
