// The Ruqyah AI chat proxy: hides GEMINI_API_KEY from the client and answers
// with a fixed Ruqyah system prompt. See app.js:callGeminiAPI() for the two
// frontend paths — this file only serves the one where the visitor has no
// personal Gemini key of their own.
//
// SECURITY HISTORY (2026-09-21): until this change the endpoint had none of
// the below — no auth, no rate limit, and `Access-Control-Allow-Origin: *` —
// so anyone on the internet could spend the owner's GEMINI_API_KEY quota
// through a public domain. The fix mirrors the pattern already used by
// api/book.js, api/course.js and api/membership.js: verify the caller's
// Firebase ID token against Identity Toolkit, then read/write Firestore AS
// THAT USER over the REST API, so this function still needs no
// service-account key.
//
// Auth is required only on this proxy path. A visitor who supplies their own
// Gemini key in the chat settings (gear icon) still calls Google directly
// from the browser and never reaches this file — that path spends their own
// quota and was never the vulnerability.

const https = require('https');

const PROJECT_ID = 'al-quranic-ruqyah';
const API_KEY = 'AIzaSyBQyGnY8DhqdlTpOIwfZC6FZWqvOmwGDh8';  // public web key, same as api/book.js

// The site's real origins, plus Vercel's own preview subdomains and local dev.
// A request whose Origin header fails this check is rejected before any auth
// or Firestore work happens — cheap to reject, and it is what turns the old
// `Access-Control-Allow-Origin: *` into something a browser will only let a
// legitimate page read the response from.
const ALLOWED_ORIGINS = [
    'https://alquranicruqyahhealing.com',
    'https://www.alquranicruqyahhealing.com',
];
function isAllowedOrigin(origin) {
    if (!origin) return true; // no Origin header: not a browser CORS request (native fetch, curl, verify-prod.js)
    if (ALLOWED_ORIGINS.includes(origin)) return true;
    if (/^https:\/\/[a-z0-9-]+\.vercel\.app$/.test(origin)) return true;      // preview deployments
    if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return true;              // local dev
    return false;
}

// Per-user budget for the proxy path. Generous enough for a real conversation,
// small enough that a compromised or scripted token cannot run up an
// unbounded Gemini bill. Counted server-side in Firestore, not trusted from
// the client.
const RATE_LIMIT = 20;
const RATE_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function postJSON(url, body, headers) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = https.request(url, {
            method: 'POST',
            headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, headers || {}),
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function patchJSON(url, body, headers) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = https.request(url, {
            method: 'PATCH',
            headers: Object.assign({ 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) }, headers || {}),
        }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.write(payload);
        req.end();
    });
}

function getJSON(url, headers) {
    return new Promise((resolve, reject) => {
        https.get(url, { headers }, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
                catch (e) { reject(e); }
            });
        }).on('error', reject);
    });
}

async function verifyToken(idToken) {
    if (!idToken) return null;
    const { status, json } = await postJSON(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
        { idToken }
    );
    if (status !== 200) return null;
    return json.users && json.users[0] ? json.users[0].localId : null;
}

// Reads users/<uid>.chatUsage = {ws: <window-start-ms>, n: <count-in-window>}
// and, if the caller is still under budget, writes the incremented value back
// — both as the signed-in user, per firestore.rules (self-update is allowed
// on any field except `memberships`). If Firestore is unreachable this fails
// OPEN on the check (a transient outage should not lock out a legitimate
// chat) but the increment write is still attempted so usage stays honest
// once the outage clears.
async function checkAndBumpRateLimit(uid, idToken) {
    const docUrl = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
                 + `/databases/(default)/documents/users/${uid}`;
    const authHeaders = { Authorization: `Bearer ${idToken}` };

    let ws = Date.now();
    let n = 0;
    try {
        const { status, json } = await getJSON(docUrl, authHeaders);
        if (status === 200) {
            const usage = json.fields && json.fields.chatUsage && json.fields.chatUsage.mapValue
                && json.fields.chatUsage.mapValue.fields;
            const rawWs = usage && usage.ws && (usage.ws.integerValue != null ? usage.ws.integerValue : usage.ws.doubleValue);
            const rawN = usage && usage.n && (usage.n.integerValue != null ? usage.n.integerValue : usage.n.doubleValue);
            const parsedWs = parseInt(rawWs, 10);
            const parsedN = parseInt(rawN, 10);
            const now = Date.now();
            if (Number.isFinite(parsedWs) && (now - parsedWs) < RATE_WINDOW_MS) {
                ws = parsedWs;
                n = Number.isFinite(parsedN) ? parsedN : 0;
            }
        }
    } catch (e) {
        // Firestore read failed — proceed as if this is the first message in a
        // fresh window rather than blocking a legitimate user.
    }

    if (n >= RATE_LIMIT) {
        return { allowed: false, retryAfterMs: Math.max(0, ws + RATE_WINDOW_MS - Date.now()) };
    }

    const nextN = n + 1;
    try {
        await patchJSON(
            `${docUrl}?updateMask.fieldPaths=chatUsage`,
            { fields: { chatUsage: { mapValue: { fields: {
                ws: { integerValue: String(ws) },
                n: { integerValue: String(nextN) },
            } } } } },
            authHeaders
        );
    } catch (e) {
        // Write failed — still let this one message through; the next request
        // will simply re-read the same (stale) count.
    }

    return { allowed: true };
}

const RUQYAH_CHAT_SYSTEM = `You are a helpful, spiritual, and compassionate Islamic Ruqyah Healing AI assistant.
Your goal is to guide users in light of the Quran, Sahih Hadith, and teachings of classical and contemporary Islamic scholars (like Ibn Taymiyyah, Ibn al-Qayyim, and respected Raqis).
Guidelines:
1. Ground your answers strictly in orthodox Islamic theology (Ahlus Sunnah wal Jama'ah).
2. Recommend Sunnah protections (Aytul Kursi, Char Qul, Morning/Evening Adhkar, Ajwa dates, Zamzam water, black seed, Sidr leaves).
3. Warn against un-Islamic practices (ta'weez/amulets with numbers/symbols, going to magicians, calling upon Jinns/pirs/saints, slaughtering for other than Allah).
4. Maintain a polite and caring tone. Write primarily in Bengali if the user queries in Bengali, or English if they query in English. Keep answers concise, informative, and formatted with bullet points for readability.
5. REMINDER: Always include a polite disclaimer at the end that Ruqyah is a form of du'a and spiritual healing, and not a replacement for medical or psychological science. If the user presents severe physical/mental symptoms, advise them to consult a qualified medical professional.`;

function callGemini(apiKey, contents) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify({
            systemInstruction: { parts: [{ text: RUQYAH_CHAT_SYSTEM }] },
            contents,
            generationConfig: { temperature: 0.7, maxOutputTokens: 1200 },
        });
        const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
        const apiRequest = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
        }, (apiResponse) => {
            let responseData = '';
            apiResponse.on('data', (chunk) => { responseData += chunk; });
            apiResponse.on('end', () => resolve({ status: apiResponse.statusCode, body: responseData }));
        });
        apiRequest.on('error', reject);
        apiRequest.write(payload);
        apiRequest.end();
    });
}

module.exports = async (req, res) => {
    const origin = req.headers.origin;
    if (!isAllowedOrigin(origin)) {
        res.status(403).json({ error: 'origin_not_allowed' });
        return;
    }
    if (origin) {
        res.setHeader('Access-Control-Allow-Origin', origin);
        res.setHeader('Vary', 'Origin');
    }
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Cache-Control', 'private, no-store');

    if (req.method === 'OPTIONS') {
        res.status(200).end();
        return;
    }

    if (req.method !== 'POST') {
        res.status(405).json({ error: 'Method not allowed' });
        return;
    }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uid = await verifyToken(token);
    if (!uid) {
        res.status(401).json({ error: 'login_required' });
        return;
    }

    const { contents } = req.body;
    if (!contents || !Array.isArray(contents)) {
        res.status(400).json({ error: 'Missing contents array' });
        return;
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        res.status(500).json({
            error: 'Backend API key not configured. Please add your own free Gemini API key in the chat settings (gear icon).'
        });
        return;
    }

    const { allowed, retryAfterMs } = await checkAndBumpRateLimit(uid, token);
    if (!allowed) {
        res.setHeader('Retry-After', String(Math.ceil(retryAfterMs / 1000)));
        res.status(429).json({ error: 'rate_limited', retryAfterMs });
        return;
    }

    try {
        const { status, body } = await callGemini(apiKey, contents);
        if (status >= 200 && status < 300) {
            try {
                const parsed = JSON.parse(body);
                const reply = parsed.candidates?.[0]?.content?.parts?.[0]?.text;
                if (reply) {
                    res.status(200).json({ reply });
                } else {
                    res.status(500).json({ error: 'Invalid response structure from Gemini API', details: body });
                }
            } catch (e) {
                res.status(500).json({ error: 'Failed to parse response from Gemini API', details: body });
            }
        } else {
            res.status(status).json({ error: 'Gemini API returned error', details: body });
        }
    } catch (err) {
        res.status(500).json({ error: 'Proxy request failed', details: err.message });
    }
};

// Exposed for tools/test-api-chat.js only; harmless in production.
module.exports._internal = { isAllowedOrigin, RATE_LIMIT, RATE_WINDOW_MS };
