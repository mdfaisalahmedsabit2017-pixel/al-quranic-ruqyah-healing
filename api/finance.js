// Reads the owner's personal MFS ledger (bKash / Nagad / Rocket / bank) out of a
// Google Sheet and hands it to the admin dashboard.
//
//   GET /api/finance?path=dash&month=2026-08
//   Authorization: Bearer <firebase id token>
//
// This function is a proxy and nothing else. The Sheet's Apps Script URL and its
// read token stay on the server; the browser never sees either. The alternative
// — letting the page call Apps Script directly — would mean shipping the read
// token to the client, i.e. publishing the ledger to anyone who opens devtools.
//
// Only the admin may call it. The caller's ID token is checked against Identity
// Toolkit and the *verified* email is compared against ADMIN_EMAIL, exactly as
// api/push.js does. Worth stating plainly, because the client-side checks in
// app.js are easy to mistake for security: hiding the FAB and the pane is
// cosmetic. Anyone can unhide them from the console. This function is the only
// thing between the internet and the ledger.
//
// SETUP — until this is done the endpoint answers 501 and the tab says so:
//
//   1. Deploy the mfs-tracker Apps Script as a web app (see its README) and run
//      setSecrets() to mint READ_TOKEN.
//   2. Vercel -> Project -> Settings -> Environment Variables, for BOTH
//      Production and Preview:
//        SHEET_API_URL   = https://script.google.com/macros/s/AKfy…/exec
//        SHEET_API_TOKEN = the READ_TOKEN value  (never the ingest token —
//                          that one can write, this one only reads)
//   3. Redeploy.
//
// Those two values belong in the Vercel dashboard and nowhere else — never in
// this repository, which is public.

const https = require('https');

const API_KEY = 'AIzaSyBQyGnY8DhqdlTpOIwfZC6FZWqvOmwGDh8';  // public web key
const ADMIN_EMAIL = 'crackdmcbuet@gmail.com';               // must match app.js and api/push.js

// verifyAdmin and its two helpers are duplicated from api/push.js rather than
// factored into a shared module. api/book.js and api/push.js already each carry
// their own copy, so a third is consistent with this codebase; and a shared file
// under api/ raises a routing question (is api/_lib/auth reachable as an
// endpoint?) that is not worth guessing at on a live marketing site.
function request(url, options, payload) {
    return new Promise((resolve, reject) => {
        const req = https.request(url, options, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                let json = {};
                try { json = JSON.parse(data || '{}'); } catch (e) { /* keep {} */ }
                resolve({ status: res.statusCode, json, raw: data });
            });
        });
        req.on('error', reject);
        if (payload) req.write(payload);
        req.end();
    });
}

function postJSON(url, body, headers) {
    const payload = JSON.stringify(body);
    return request(url, {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(payload),
            ...(headers || {}),
        },
    }, payload);
}

// Returns the verified email on the token, or null.
async function verifyAdmin(idToken) {
    if (!idToken) return null;
    const { status, json } = await postJSON(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
        { idToken }
    );
    if (status !== 200) return null;
    const user = json.users && json.users[0];
    return user && user.email ? user.email : null;
}

// Per-instance fixed window, keyed on the verified email so it cannot be
// spoofed. Be clear about what this is: Vercel may run several instances, each
// with its own Map, so the effective ceiling is MAX x instances. It is a
// guardrail against a runaway client re-rendering in a loop and burning the
// Apps Script quota — not a security control. The real protection is the auth
// check above.
const WINDOW_MS = 60000;
const MAX_PER_WINDOW = 30;
const hits = new Map();

function overLimit(key) {
    const now = Date.now();
    const rec = hits.get(key);
    if (!rec || now - rec.t > WINDOW_MS) {
        hits.set(key, { t: now, n: 1 });
        return false;
    }
    rec.n += 1;
    return rec.n > MAX_PER_WINDOW;
}

const ALLOWED_PATHS = new Set(
    ['dash', 'summary', 'txns', 'balances', 'gaps', 'health', 'categories', 'meta', 'ping']);

// Build the upstream URL from validated pieces only. Never forward req.query
// wholesale: that would let a caller inject arbitrary Apps Script parameters,
// including their own `token`.
function upstreamUrl(q) {
    const url = new URL(process.env.SHEET_API_URL);
    const put = (k, v) => { if (v) url.searchParams.set(k, v); };

    put('path', ALLOWED_PATHS.has(q.path) ? q.path : 'dash');
    put('month', /^\d{4}-(0[1-9]|1[0-2])$/.test(q.month || '') ? q.month : '');
    put('from', /^\d{4}-\d{2}-\d{2}$/.test(q.from || '') ? q.from : '');
    put('to', /^\d{4}-\d{2}-\d{2}$/.test(q.to || '') ? q.to : '');
    put('scope', ['month', 'day', 'all'].includes(q.scope) ? q.scope : '');
    put('group_by', /^[a-z_]{1,20}$/.test(q.group_by || '') ? q.group_by : '');
    put('operator', /^[a-z]{1,12}$/.test(q.operator || '') ? q.operator : '');
    put('account', /^01[3-9]\d{8}$/.test(q.account || '') ? q.account : '');
    put('type', /^[a-z_]{1,20}$/.test(q.type || '') ? q.type : '');
    put('direction', ['in', 'out'].includes(q.direction) ? q.direction : '');
    put('status', /^[a-z]{1,12}$/.test(q.status || '') ? q.status : '');
    put('category', (q.category && String(q.category).length <= 40) ? String(q.category) : '');
    put('cursor', /^[A-Za-z0-9_=-]{0,120}$/.test(q.cursor || '') ? q.cursor : '');

    const limit = Math.min(Math.max(parseInt(q.limit, 10) || 50, 1), 200);
    url.searchParams.set('limit', String(limit));

    // Set last so nothing above can shadow it.
    url.searchParams.set('token', process.env.SHEET_API_TOKEN);
    return url;
}

module.exports = async (req, res) => {
    // Financial data: never in a shared cache, never indexed.
    res.setHeader('Cache-Control', 'private, no-store, max-age=0');
    res.setHeader('Vary', 'Authorization');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    // `*` is safe here because auth is a bearer header rather than a cookie —
    // the same reasoning as api/push.js. A cookie-based gate could not do this.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');

    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'GET') { res.status(405).json({ error: 'GET only' }); return; }

    const auth = req.headers.authorization || '';
    const idToken = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    // Short-circuit before touching Identity Toolkit, so unauthenticated
    // probing of a publicly discoverable endpoint costs nothing upstream.
    if (!idToken) { res.status(401).json({ error: 'login_required' }); return; }

    let email;
    try {
        email = await verifyAdmin(idToken);
    } catch (e) {
        res.status(502).json({ error: 'auth_unreachable' });
        return;
    }
    if (!email) { res.status(401).json({ error: 'login_required' }); return; }
    if (email !== ADMIN_EMAIL) { res.status(403).json({ error: 'admin_only' }); return; }

    if (overLimit(email)) {
        res.setHeader('Retry-After', '60');
        res.status(429).json({ error: 'too_many_requests', retryAfter: 60 });
        return;
    }

    if (!process.env.SHEET_API_URL || !process.env.SHEET_API_TOKEN) {
        res.status(501).json({ error: 'finance_not_configured' });
        return;
    }

    let url;
    try {
        url = upstreamUrl(req.query || {});
    } catch (e) {
        res.status(500).json({ error: 'bad_sheet_url' });
        return;
    }

    // Apps Script /exec answers with a 302 to script.googleusercontent.com.
    // The https.get helpers in api/book.js and api/push.js do NOT follow
    // redirects, so lifting one of them here returns an empty body and looks
    // like "the Sheet is broken". global fetch follows redirects; it needs
    // Node >= 18, which the project's runtime provides.
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8000);
    let upstream;
    try {
        upstream = await fetch(url.toString(), {
            redirect: 'follow',
            headers: { Accept: 'application/json' },
            signal: ctrl.signal,
        });
    } catch (e) {
        clearTimeout(timer);
        const timedOut = e && (e.name === 'AbortError' || /abort/i.test(String(e.message)));
        res.status(timedOut ? 504 : 502)
           .json({ error: timedOut ? 'sheet_timeout' : 'sheet_unreachable' });
        return;
    }
    clearTimeout(timer);

    if (!upstream.ok) {
        res.status(502).json({ error: 'sheet_unreachable', status: upstream.status });
        return;
    }

    const text = await upstream.text();
    let json;
    try {
        json = JSON.parse(text);
    } catch (e) {
        // Not hypothetical: when an Apps Script doGet throws, it answers 200
        // with an HTML error page. Log a snippet server-side for debugging but
        // return only the code — that HTML can contain the script URL.
        console.error('finance: non-JSON from Sheet:', text.slice(0, 200));
        res.status(502).json({ error: 'sheet_bad_response' });
        return;
    }

    if (json && json.ok === false) {
        // bad_token / rate_limited from the Sheet side is a server-config
        // problem, not something the browser did.
        console.error('finance: Sheet refused:', json.status);
        res.status(502).json({ error: 'sheet_refused', status: json.status || '' });
        return;
    }

    res.status(200).json(json);
};
