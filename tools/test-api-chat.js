// Exercises the security gates added to api/chat.js: origin allowlist, auth,
// and the per-user rate limit — without making any real network call.
//
//     node tools/test-api-chat.js
//
// WHY MOCKED RATHER THAN HIT A LIVE DEPLOYMENT: this repo has no npm test
// framework and no local Vercel dev server in CI, and the whole point is to
// prove the *logic* (reject before Gemini is ever called, count correctly,
// reset after the window) without spending a real Gemini quota or needing a
// real Firebase project reachable from wherever this runs. `https.request`
// and `https.get` are monkeypatched — chat.js reads `https.<method>` off the
// module object at call time, not at require time, so this works without
// touching chat.js itself.

const https = require('https');
const assert = require('assert');

function fakeResponse(status, bodyStr) {
    const listeners = {};
    const res = {
        statusCode: status,
        on(event, cb) { (listeners[event] = listeners[event] || []).push(cb); return res; },
    };
    setImmediate(() => {
        (listeners.data || []).forEach((cb) => cb(bodyStr));
        (listeners.end || []).forEach((cb) => cb());
    });
    return res;
}

function fakeRequest() {
    const listeners = {};
    const req = {
        on(event, cb) { (listeners[event] = listeners[event] || []).push(cb); return req; },
        write() {},
        end() {},
    };
    return req;
}

// `rules` is an ordered list of { test(url) -> bool, status, body }. The
// first match wins; an unmatched URL throws loudly rather than hanging, so a
// test that forgot to mock a call fails immediately instead of timing out.
function installMockHttp(rules) {
    const calls = [];
    const dispatch = (url) => {
        calls.push(url);
        const rule = rules.find((r) => r.test(url));
        if (!rule) throw new Error(`test-api-chat: no mock rule matched ${url}`);
        return rule;
    };
    https.request = (url, options, callback) => {
        const rule = dispatch(url);
        setImmediate(() => callback(fakeResponse(rule.status, rule.body)));
        return fakeRequest();
    };
    https.get = (url, options, callback) => {
        const rule = dispatch(url);
        setImmediate(() => callback(fakeResponse(rule.status, rule.body)));
        return fakeRequest();
    };
    return calls;
}

function makeReq({ method = 'POST', headers = {}, body = {} } = {}) {
    return { method, headers, body };
}

function makeRes() {
    return {
        statusCode: 200,
        _headers: {},
        _body: null,
        setHeader(k, v) { this._headers[k] = v; },
        status(code) { this.statusCode = code; return this; },
        json(obj) { this._body = obj; return this; },
        end() { return this; },
    };
}

const IDENTITY_OK = { status: 200, body: JSON.stringify({ users: [{ localId: 'uid-123' }] }) };
const IDENTITY_FAIL = { status: 400, body: JSON.stringify({ error: 'INVALID_ID_TOKEN' }) };
const GEMINI_OK = { status: 200, body: JSON.stringify({ candidates: [{ content: { parts: [{ text: 'ওয়ালাইকুম আসসালাম' }] } }] }) };

let failed = 0;
const lines = [];
function check(label, cond, detail = '') {
    if (!cond) failed++;
    lines.push(`  ${cond ? 'ok  ' : 'FAIL'}  ${label}${detail ? '  — ' + detail : ''}`);
}

async function run() {
    process.env.GEMINI_API_KEY = 'test-key';
    delete require.cache[require.resolve('../api/chat.js')];
    const chat = require('../api/chat.js');

    // ── Origin allowlist ────────────────────────────────────────────────────
    {
        installMockHttp([]); // no network call should happen before the origin check
        const req = makeReq({ headers: { origin: 'https://evil.example.com' } });
        const res = makeRes();
        await chat(req, res);
        check('an unrecognised Origin is rejected before any network call',
            res.statusCode === 403 && res._body?.error === 'origin_not_allowed');
        check('no CORS header is set for a rejected origin', res._headers['Access-Control-Allow-Origin'] === undefined);
    }
    {
        installMockHttp([
            { test: (u) => u.includes('identitytoolkit'), ...IDENTITY_FAIL },
        ]);
        const req = makeReq({ headers: { origin: 'https://alquranicruqyahhealing.com' } });
        const res = makeRes();
        await chat(req, res);
        check('the production origin is reflected back, not "*"',
            res._headers['Access-Control-Allow-Origin'] === 'https://alquranicruqyahhealing.com');
    }
    {
        installMockHttp([
            { test: (u) => u.includes('identitytoolkit'), ...IDENTITY_FAIL },
        ]);
        const req = makeReq({ headers: { origin: 'https://some-preview-xyz.vercel.app' } });
        const res = makeRes();
        await chat(req, res);
        check('a Vercel preview subdomain is allowed', res._headers['Access-Control-Allow-Origin'] === 'https://some-preview-xyz.vercel.app');
    }

    // ── OPTIONS preflight ───────────────────────────────────────────────────
    {
        const req = makeReq({ method: 'OPTIONS', headers: { origin: 'https://alquranicruqyahhealing.com' } });
        const res = makeRes();
        await chat(req, res);
        check('OPTIONS preflight returns 200 with no body', res.statusCode === 200);
    }

    // ── Authentication ──────────────────────────────────────────────────────
    {
        installMockHttp([]); // no Authorization header at all: must not even reach Identity Toolkit
        const req = makeReq({ headers: {}, body: { contents: [] } });
        const res = makeRes();
        await chat(req, res);
        check('a request with no Authorization header is rejected',
            res.statusCode === 401 && res._body?.error === 'login_required');
    }
    {
        const calls = installMockHttp([
            { test: (u) => u.includes('identitytoolkit'), ...IDENTITY_FAIL },
        ]);
        const req = makeReq({ headers: { authorization: 'Bearer garbage-token' }, body: { contents: [] } });
        const res = makeRes();
        await chat(req, res);
        check('an invalid token is rejected', res.statusCode === 401 && res._body?.error === 'login_required');
        check('Gemini is never called for an unauthenticated request',
            !calls.some((u) => u.includes('generativelanguage')));
    }

    // ── Happy path: authenticated, under budget ─────────────────────────────
    {
        const calls = installMockHttp([
            { test: (u) => u.includes('identitytoolkit'), ...IDENTITY_OK },
            { test: (u) => u.includes('firestore') && !u.includes('?'), status: 200, body: JSON.stringify({}) }, // GET: no prior usage
            { test: (u) => u.includes('firestore') && u.includes('updateMask'), status: 200, body: '{}' }, // PATCH
            { test: (u) => u.includes('generativelanguage'), ...GEMINI_OK },
        ]);
        const req = makeReq({
            headers: { authorization: 'Bearer good-token', origin: 'https://alquranicruqyahhealing.com' },
            body: { contents: [{ role: 'user', parts: [{ text: 'আসসালামু আলাইকুম' }] }] },
        });
        const res = makeRes();
        await chat(req, res);
        check('a fresh, authenticated caller gets a reply', res.statusCode === 200 && !!res._body?.reply);
        check('the usage counter is written back to Firestore',
            calls.some((u) => u.includes('firestore') && u.includes('updateMask')));
    }

    // ── Rate limit ───────────────────────────────────────────────────────────
    {
        const { RATE_LIMIT } = chat._internal;
        const usageAtLimit = JSON.stringify({
            fields: { chatUsage: { mapValue: { fields: {
                ws: { integerValue: String(Date.now()) },
                n: { integerValue: String(RATE_LIMIT) },
            } } } } }
        );
        const calls = installMockHttp([
            { test: (u) => u.includes('identitytoolkit'), ...IDENTITY_OK },
            { test: (u) => u.includes('firestore') && !u.includes('?'), status: 200, body: usageAtLimit },
            { test: (u) => u.includes('generativelanguage'), ...GEMINI_OK },
        ]);
        const req = makeReq({
            headers: { authorization: 'Bearer good-token' },
            body: { contents: [{ role: 'user', parts: [{ text: 'আরেকটা প্রশ্ন' }] }] },
        });
        const res = makeRes();
        await chat(req, res);
        check('a caller already at the limit is rejected with 429',
            res.statusCode === 429 && res._body?.error === 'rate_limited');
        check('Retry-After is set on a rate-limited response', !!res._headers['Retry-After']);
        check('Gemini is never called once the limit is hit',
            !calls.some((u) => u.includes('generativelanguage')));
    }
    {
        // A window that has already expired must reset rather than staying stuck.
        const { RATE_LIMIT, RATE_WINDOW_MS } = chat._internal;
        const usageExpired = JSON.stringify({
            fields: { chatUsage: { mapValue: { fields: {
                ws: { integerValue: String(Date.now() - RATE_WINDOW_MS - 1000) },
                n: { integerValue: String(RATE_LIMIT) },
            } } } } }
        );
        installMockHttp([
            { test: (u) => u.includes('identitytoolkit'), ...IDENTITY_OK },
            { test: (u) => u.includes('firestore') && !u.includes('?'), status: 200, body: usageExpired },
            { test: (u) => u.includes('firestore') && u.includes('updateMask'), status: 200, body: '{}' },
            { test: (u) => u.includes('generativelanguage'), ...GEMINI_OK },
        ]);
        const req = makeReq({
            headers: { authorization: 'Bearer good-token' },
            body: { contents: [{ role: 'user', parts: [{ text: 'নতুন উইন্ডো' }] }] },
        });
        const res = makeRes();
        await chat(req, res);
        check('an expired rate-limit window resets instead of staying blocked', res.statusCode === 200);
    }

    // ── Missing GEMINI_API_KEY (unrelated pre-existing behaviour must survive) ──
    {
        delete process.env.GEMINI_API_KEY;
        installMockHttp([
            { test: (u) => u.includes('identitytoolkit'), ...IDENTITY_OK },
            { test: (u) => u.includes('firestore') && !u.includes('?'), status: 200, body: '{}' },
        ]);
        const req = makeReq({ headers: { authorization: 'Bearer good-token' }, body: { contents: [] } });
        const res = makeRes();
        await chat(req, res);
        check('a missing GEMINI_API_KEY still answers 500 with the original message',
            res.statusCode === 500 && /Gemini API key/.test(res._body?.error || ''));
    }

    console.log(lines.join('\n'));
    if (failed) {
        console.error(`\n❌ ${failed} check(s) failed in tools/test-api-chat.js.`);
        process.exit(1);
    }
    console.log('\n✅ api/chat.js security gates behave as expected.');
}

run().catch((e) => {
    console.error('test-api-chat.js threw:', e.stack || e.message);
    process.exit(1);
});
