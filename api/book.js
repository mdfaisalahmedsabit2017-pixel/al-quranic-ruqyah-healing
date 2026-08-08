// Gated delivery for the paid books.
//
// A book is sold, so its pages must never live in public/ — anything there is
// a free static file on Vercel and one shared link would give the whole book
// away. Pages live in book_pages*/ (bundled with this function via
// vercel.json -> functions.includeFiles) and are handed out one at a time,
// only after the caller proves they are a signed-in user whose purchase the
// admin has confirmed.
//
//   GET /api/book?book=<id>&page=12   (+ Authorization: Bearer <id token>)
//   GET /api/book?book=<id>&meta=1    -> { pages, preview }
//   GET /api/book?book=<id>&thumb=1   -> cover, always free
//
// Verification uses Firebase's REST endpoints rather than firebase-admin so the
// project needs no service-account secret: the ID token is checked against
// Identity Toolkit (a forged or expired token fails there), and the purchase is
// read from Firestore as that same user.

const fs = require('fs');
const path = require('path');
const https = require('https');

// id -> where its pages live and how much is free. Ids must match app.js BOOKS.
//
// `book` is optional on purpose: installed APKs and any cached page from before
// the second book existed call /api/book with no book param at all. Defaulting
// to shekhar-shilpo keeps those clients working exactly as before.
// `htmlDir`, where present, holds a text edition of the same book: full.html for
// buyers and preview.html for everyone. Page images cannot be resized, reflowed,
// searched, read in the dark or read aloud, which is a poor way to hand someone
// a book they are consulting because they are unwell. Only books typeset from
// source have one; শেখার শিল্প exists as scanned pages and has none.
const BOOKS = {
    'shekhar-shilpo':  { dir: 'book_pages',       preview: 12 },
    'yasin-karishma':  { dir: 'book_pages_yasin', preview: 8, htmlDir: 'book_html_yasin' },
};
const DEFAULT_BOOK = 'shekhar-shilpo';

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
async function hasPurchased(uid, idToken, bookId) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
              + `/databases/(default)/documents/users/${uid}`;
    const { status, json } = await getJSON(url, { Authorization: `Bearer ${idToken}` });
    if (status !== 200) return false;
    const arr = json.fields && json.fields.courses && json.fields.courses.arrayValue;
    const values = (arr && arr.values) || [];
    return values.some((v) => v.stringValue === bookId);
}

function pagesDir(bookId) {
    return path.join(__dirname, '..', BOOKS[bookId].dir);
}

function totalPages(bookId) {
    try {
        return JSON.parse(fs.readFileSync(path.join(pagesDir(bookId), 'meta.json'), 'utf8')).pages;
    } catch (e) {
        return 0;
    }
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }

    const q = req.query || {};

    const bookId = q.book || DEFAULT_BOOK;
    if (!Object.prototype.hasOwnProperty.call(BOOKS, bookId)) {
        res.status(404).json({ error: 'unknown_book' });
        return;
    }
    const PREVIEW = BOOKS[bookId].preview;

    if (q.meta) {
        res.setHeader('Cache-Control', 'public, max-age=3600');
        res.status(200).json({
            pages: totalPages(bookId),
            preview: PREVIEW,
            html: !!BOOKS[bookId].htmlDir,
        });
        return;
    }

    // The text edition. Unlike the page images this is one document, so the
    // decision is not per page but per reader: a buyer gets the whole book, and
    // everyone else gets the free part — which is a separate file, not the same
    // file truncated, so there is nothing in the response to un-hide.
    if (q.html) {
        const htmlDir = BOOKS[bookId].htmlDir;
        if (!htmlDir) { res.status(404).json({ error: 'no_text_edition' }); return; }

        const token = q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
        let full = false;
        if (token) {
            const uid = await verifyToken(token);
            full = !!uid && await hasPurchased(uid, token, bookId);
        }

        const file = path.join(__dirname, '..', htmlDir, full ? 'full.html' : 'preview.html');
        if (!fs.existsSync(file)) { res.status(404).json({ error: 'not_found' }); return; }

        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        // X-Book-Full so the reader can label the preview honestly without
        // guessing from the length of what it got.
        res.setHeader('X-Book-Full', full ? '1' : '0');
        res.setHeader('Access-Control-Expose-Headers', 'X-Book-Full');
        res.setHeader('Cache-Control', full ? 'private, no-store' : 'public, max-age=3600');
        res.status(200).send(fs.readFileSync(file, 'utf8'));
        return;
    }

    // Store-card thumbnail — the cover is the shop window, so it stays free.
    if (q.thumb) {
        const cover = path.join(pagesDir(bookId), 'cover.webp');
        if (!fs.existsSync(cover)) { res.status(404).end(); return; }
        const buf = fs.readFileSync(cover);
        res.setHeader('Content-Type', 'image/webp');
        res.setHeader('Content-Length', buf.length);
        res.setHeader('Cache-Control', 'public, max-age=86400');
        res.status(200).send(buf);
        return;
    }

    const page = parseInt(q.page, 10);
    const total = totalPages(bookId);
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
        if (!(await hasPurchased(uid, token, bookId))) {
            res.status(403).json({ error: 'purchase_required' });
            return;
        }
    }

    const file = path.join(pagesDir(bookId), `p${String(page).padStart(4, '0')}.webp`);
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
