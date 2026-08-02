// Gated delivery for the paid book ("শেখার শিল্প").
//
// The book is sold, so its pages must never live in public/ — anything there is
// a free static file on Vercel and one shared link would give the whole book
// away. Pages live in book_pages/ (bundled with this function via
// vercel.json -> functions.includeFiles) and are handed out one at a time,
// only after the caller proves they are a signed-in user whose purchase the
// admin has confirmed.
//
//   GET /api/book?page=12&token=<firebase id token>   -> image/webp
//   GET /api/book?meta=1                              -> { pages, preview }
//
// Verification uses Firebase's REST endpoints rather than firebase-admin so the
// project needs no service-account secret: the ID token is checked against
// Identity Toolkit (a forged or expired token fails there), and the purchase is
// read from Firestore as that same user.

const fs = require('fs');
const path = require('path');
const https = require('https');

const BOOK_ID     = 'shekhar-shilpo';       // must match the id in app.js BOOKS
const PREVIEW     = 12;                     // pages anyone may read for free
const PAGES_DIR   = path.join(__dirname, '..', 'book_pages');
const PROJECT_ID  = 'al-quranic-ruqyah';
const API_KEY     = 'AIzaSyBQyGnY8DhqdlTpOIwfZC6FZWqvOmwGDh8';  // public web key

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

// Returns the uid if the token is a genuine, unexpired token for this project.
async function verifyToken(idToken) {
    if (!idToken) return null;
    const { status, json } = await postJSON(
        `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${API_KEY}`,
        { idToken }
    );
    if (status !== 200) return null;
    return json.users && json.users[0] ? json.users[0].localId : null;
}

// Reads users/<uid> as that user and looks for the book in their unlocked list.
async function hasPurchased(uid, idToken) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
              + `/databases/(default)/documents/users/${uid}`;
    const { status, json } = await getJSON(url, { Authorization: `Bearer ${idToken}` });
    if (status !== 200) return false;
    const arr = json.fields && json.fields.courses && json.fields.courses.arrayValue;
    const values = (arr && arr.values) || [];
    return values.some((v) => v.stringValue === BOOK_ID);
}

function totalPages() {
    try {
        return JSON.parse(fs.readFileSync(path.join(PAGES_DIR, 'meta.json'), 'utf8')).pages;
    } catch (e) {
        return 0;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const q = req.query || {};

    if (q.meta) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).json({ pages: totalPages(), preview: PREVIEW });
        return;
    }

    // Store-card thumbnail — the cover is the shop window, so it stays free.
    if (q.thumb) {
        const cover = path.join(PAGES_DIR, 'cover.webp');
        if (!fs.existsSync(cover)) { res.status(404).end(); return; }
        const buf = fs.readFileSync(cover);
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Content-Length', buf.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.status(200).send(buf);
        return;
    }

    const page = parseInt(q.page, 10);
    const total = totalPages();
    if (!Number.isInteger(page) || page < 1 || page > total) {
        res.status(400).json({ error: 'Invalid page' });
        return;
    }

    if (page > PREVIEW) {
        const token = q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        const uid = await verifyToken(token);
        if (!uid) {
            res.status(401).json({ error: 'login_required' });
            return;
        }
        if (!(await hasPurchased(uid, token))) {
            res.status(403).json({ error: 'purchase_required' });
            return;
        }
    }

    const file = path.join(PAGES_DIR, `p${String(page).padStart(4, '0')}.webp`);
    if (!fs.existsSync(file)) { res.status(404).json({ error: 'Page not found' }); return; }

    const buf = fs.readFileSync(file);
    res.setHeader('Content-Type', 'image/webp');
    res.setHeader('Content-Length', buf.length);
    // private: a shared CDN copy would leak paid pages to unauthenticated callers
    res.setHeader('Cache-Control', page <= PREVIEW
        ? 'public, max-age=86400'
        : 'private, no-store');
    res.status(200).send(buf);
};
