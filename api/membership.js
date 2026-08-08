// Hands out the live class's private Telegram invite links — but only to a
// signed-in member whose membership has not expired.
//
//   GET /api/membership            (+ Authorization: Bearer <id token>)
//     -> 200 { active, until, links: { session, sisters, brothers }, form }
//     -> 200 { active: false }     when signed in but not a member
//     -> 401                       when not signed in
//
// WHY THIS EXISTS AT ALL, rather than the links sitting in app.js next to the
// rest of the course copy: app.js is a public static file. Anyone can open
// alquranicruqyahhealing.com/app.js and read it, and this repository is public
// too. A Telegram invite link in either place is a paid group with a free door,
// and the link cannot be un-shared once it is out — it has to be revoked and
// every existing member re-invited.
//
// So the links live in one Vercel environment variable and never touch git:
//
//   TELEGRAM_LINKS = {"session":"https://t.me/+…","sisters":"https://t.me/+…","brothers":"https://t.me/+…"}
//
// Set it with:  vercel env add TELEGRAM_LINKS production
// Without it the endpoint answers 501 and the member card says the links are
// being set up, rather than showing an empty box.
//
// Verification is the same shape as api/book.js: the ID token is checked against
// Identity Toolkit, and the membership is read from Firestore AS THAT USER, so
// the function needs no service-account key. A forged or expired token fails at
// Identity Toolkit; a token belonging to a non-member reads a document whose
// membership has no future expiry and gets nothing back.

const https = require('https');

const PROJECT_ID = 'al-quranic-ruqyah';
const API_KEY = 'AIzaSyBQyGnY8DhqdlTpOIwfZC6FZWqvOmwGDh8';  // public web key
const MEMBERSHIP_ID = 'live-class';                         // must match app.js COURSES

// The intake form is not a secret — it is in every Facebook post — so it stays
// here rather than in the environment variable.
const FORM_URL = 'https://forms.gle/zHEfZFkP6BfcS4pp9';

function postJSON(url, body) {
    return new Promise((resolve, reject) => {
        const payload = JSON.stringify(body);
        const req = https.request(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(payload) },
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

// users/<uid>.memberships.<id>.until — milliseconds since the epoch, stored as a
// Firestore integer, which the REST API returns as a string.
async function membershipUntil(uid, idToken) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
              + `/databases/(default)/documents/users/${uid}`;
    const { status, json } = await getJSON(url, { Authorization: `Bearer ${idToken}` });
    if (status !== 200) return 0;
    const m = json.fields
        && json.fields.memberships
        && json.fields.memberships.mapValue
        && json.fields.memberships.mapValue.fields
        && json.fields.memberships.mapValue.fields[MEMBERSHIP_ID];
    const until = m && m.mapValue && m.mapValue.fields && m.mapValue.fields.until;
    if (!until) return 0;
    const raw = until.integerValue != null ? until.integerValue : until.doubleValue;
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : 0;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // The response is per-user and short-lived by nature; a shared CDN copy of
    // one member's links served to the next caller would defeat the whole point.
    res.setHeader('Cache-Control', 'private, no-store');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const token = (req.query && req.query.token)
        || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uid = await verifyToken(token);
    if (!uid) { res.status(401).json({ error: 'login_required' }); return; }

    const until = await membershipUntil(uid, token);
    if (!until || until < Date.now()) {
        res.status(200).json({ active: false, until: until || null });
        return;
    }

    let links;
    try {
        links = JSON.parse(process.env.TELEGRAM_LINKS || '');
    } catch (e) {
        res.status(501).json({ active: true, until, error: 'links_not_configured' });
        return;
    }

    res.status(200).json({ active: true, until, links, form: FORM_URL });
};
