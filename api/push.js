// Sends one push notification to every installed copy of the app.
//
//   POST /api/push
//   Authorization: Bearer <firebase id token>
//   { "title": "...", "body": "..." }
//
// Only the admin may call it. The caller's ID token is checked against Identity
// Toolkit — the same approach api/book.js uses, and for the same reason: a
// forged or expired token fails there, so this needs no session of its own.
// The email is then compared against ADMIN_EMAIL. Note that the check is on the
// *verified* email from the token, not on anything the client sent.
//
// Delivery goes to the FCM topic "all", which every device subscribes to on
// launch (see registerForPush in app.js). No token table, nothing to clean up
// when a phone is wiped, and no document anywhere listing who has the app.
//
// SETUP — until this is done the endpoint answers 501 and the app says so:
//
//   1. Firebase Console -> Project settings -> Service accounts
//      -> "Generate new private key". A JSON file downloads.
//   2. Vercel -> Project -> Settings -> Environment Variables
//      FIREBASE_SERVICE_ACCOUNT = the entire contents of that file, one line.
//   3. Redeploy.
//
// That JSON is a credential with full project access. It belongs in the Vercel
// dashboard and nowhere else — never in this repository, which is public.

const crypto = require('crypto');
const https = require('https');

const PROJECT_ID = 'al-quranic-ruqyah';
const API_KEY = 'AIzaSyBQyGnY8DhqdlTpOIwfZC6FZWqvOmwGDh8';  // public web key
const ADMIN_EMAIL = 'crackdmcbuet@gmail.com';               // must match app.js
const TOPIC = 'all';

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
    // emailVerified is deliberately not required: the admin account signs in
    // with Google, where the address is verified by Google itself and the flag
    // is not always set on the Identity Toolkit record.
    return user && user.email ? user.email : null;
}

const b64url = (buf) =>
    Buffer.from(buf).toString('base64')
        .replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

// Service-account JWT -> OAuth2 access token. Signing this by hand rather than
// pulling in googleapis keeps the function's cold start and bundle small; the
// grant is a documented, stable flow and this is the whole of it.
async function accessToken(sa) {
    const now = Math.floor(Date.now() / 1000);
    const header = b64url(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
    const claim = b64url(JSON.stringify({
        iss: sa.client_email,
        scope: 'https://www.googleapis.com/auth/firebase.messaging',
        aud: 'https://oauth2.googleapis.com/token',
        iat: now,
        exp: now + 3600,
    }));
    const signature = b64url(
        crypto.createSign('RSA-SHA256').update(`${header}.${claim}`).sign(sa.private_key)
    );
    const assertion = `${header}.${claim}.${signature}`;

    const form = new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
        assertion,
    }).toString();

    const { status, json } = await request('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(form),
        },
    }, form);

    if (status !== 200 || !json.access_token) {
        throw new Error(`token exchange failed (${status}): ${json.error_description || json.error || 'unknown'}`);
    }
    return json.access_token;
}

module.exports = async (req, res) => {
    // The APK is served from https://localhost, so this is a cross-origin call.
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'POST') { res.status(405).json({ error: 'POST only' }); return; }

    const token = (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const email = await verifyAdmin(token);
    if (!email) { res.status(401).json({ error: 'login_required' }); return; }
    if (email !== ADMIN_EMAIL) { res.status(403).json({ error: 'admin_only' }); return; }

    let payload = req.body;
    if (typeof payload === 'string') {
        try { payload = JSON.parse(payload); } catch (e) { payload = {}; }
    }
    const title = String((payload && payload.title) || '').trim();
    const body = String((payload && payload.body) || '').trim();
    if (!title || !body) { res.status(400).json({ error: 'title and body are required' }); return; }

    const raw = process.env.FIREBASE_SERVICE_ACCOUNT;
    if (!raw) {
        // Not an error the admin caused, and not one that lost the notice —
        // it is already in Firestore by the time this is called.
        res.status(501).json({ error: 'push_not_configured' });
        return;
    }

    let sa;
    try {
        sa = JSON.parse(raw);
        if (!sa.client_email || !sa.private_key) throw new Error('missing client_email/private_key');
        // Pasting the JSON into a dashboard field turns real newlines into \n.
        sa.private_key = sa.private_key.replace(/\\n/g, '\n');
    } catch (e) {
        res.status(500).json({ error: `FIREBASE_SERVICE_ACCOUNT is not valid JSON: ${e.message}` });
        return;
    }

    try {
        const at = await accessToken(sa);
        // Truncated to what a notification shade will show anyway. The full
        // text lives in the Firestore document the app reads on open.
        const { status, json } = await postJSON(
            `https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`,
            {
                message: {
                    topic: TOPIC,
                    notification: { title: title.slice(0, 100), body: body.slice(0, 240) },
                    android: {
                        priority: 'HIGH',
                        notification: { channel_id: 'default', icon: 'ic_stat_icon', color: '#00E599' },
                    },
                },
            },
            { Authorization: `Bearer ${at}` }
        );
        if (status !== 200) {
            res.status(502).json({ error: json.error?.message || `fcm ${status}` });
            return;
        }
        res.status(200).json({ ok: true, name: json.name });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
};
