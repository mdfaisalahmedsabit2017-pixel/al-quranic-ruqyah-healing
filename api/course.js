// Gated delivery for the premium course area: which lessons exist, and — only
// for a paying member — the video behind each one and the note that goes with it.
//
//   GET /api/course                                  -> { courses: [...] }   (free, cacheable)
//   GET /api/course?course=<id>                      -> { course, lessons, access }
//   GET /api/course?course=<id>&lesson=<n>           -> { host, video, notes } (gated)
//   GET /api/course?course=<id>&lesson=<n>&notes=html -> the note, as HTML     (gated)
//   GET /api/course?course=<id>&lesson=<n>&notes=pdf  -> the note, as a PDF    (gated)
//
// WHY THE VIDEO ID IS NOT IN app.js. The ৳490 course card has promised
// 'প্রতিটি সেশনের রেকর্ডেড ভিডিও' since the day it went on sale, and the obvious
// way to deliver that is a YouTube iframe next to the rest of the course copy.
// But app.js is a public static file and this repository is public, so an
// unlisted video id sitting in either one is a paid recording with a free door —
// and unlike a Telegram link, nobody would ever notice it had been taken.
//
// So the ids live in course_data/private.json, which is gitignored and reaches
// production only through vercel.json -> functions.includeFiles. The client asks
// for one lesson at a time, over an authenticated request, and holds the id in a
// local variable that is never written to storage or to the DOM.
//
// BE HONEST ABOUT WHAT THAT BUYS. YouTube has no domain lock: an unlisted id, if
// it ever gets out, plays for anyone who has it, forever. What this design gives
// is that the id is not lying around to be scraped, and that a leak is
// *revocable* — re-upload the video, change one line in private.json, redeploy,
// and the leaked id is dead. That is strictly better than a Telegram invite,
// which needs every member re-invited. It is not DRM. If real protection is ever
// needed the `host` field is the seam: add a branch here and in app.js, move the
// files to Bunny/Cloudflare Stream, and nothing else in the feature changes.
//
// Verification is api/membership.js's shape, for its reasons: the ID token is
// checked against Identity Toolkit and the membership is read from Firestore AS
// THAT USER, so this function needs no service-account key. Each api/*.js keeps
// its own copy of these three helpers on purpose — see the note in api/finance.js.

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_ID = 'al-quranic-ruqyah';
const API_KEY = 'AIzaSyBQyGnY8DhqdlTpOIwfZC6FZWqvOmwGDh8';  // public web key

const DATA_DIR = path.join(__dirname, '..', 'course_data');
const NOTES_DIR = path.join(__dirname, '..', 'course_notes');

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

// One read of users/<uid> answers both entitlement questions, so the two shapes
// of ownership the site already has are checked together rather than twice:
//
//   memberships.<id>.until  — the ৳490 subscription, admin-written, expires
//   courses[]               — a permanent unlock, the same array the books use
//
// Today only the first is used; the second is here so that selling a course
// outright later is a catalog change and not a rewrite. Note that a user can
// write their own courses[] (firestore.rules allows it deliberately, so a book
// unlocks the moment a TrxID is submitted). That is fine for a ৳100 book and
// would NOT be fine for a video course — so any course sold that way must first
// get its own admin-only field. docs/course.md spells this out.
async function readEntitlements(uid, idToken) {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
              + `/databases/(default)/documents/users/${uid}`;
    const { status, json } = await getJSON(url, { Authorization: `Bearer ${idToken}` });
    if (status !== 200) return { memberships: {}, courses: [] };

    const fields = json.fields || {};

    const memberships = {};
    const mf = fields.memberships && fields.memberships.mapValue && fields.memberships.mapValue.fields;
    Object.keys(mf || {}).forEach((id) => {
        const until = mf[id] && mf[id].mapValue && mf[id].mapValue.fields && mf[id].mapValue.fields.until;
        if (!until) return;
        const raw = until.integerValue != null ? until.integerValue : until.doubleValue;
        const n = parseInt(raw, 10);
        memberships[id] = Number.isFinite(n) ? n : 0;
    });

    const arr = fields.courses && fields.courses.arrayValue;
    const courses = ((arr && arr.values) || [])
        .map((v) => v.stringValue)
        .filter(Boolean);

    return { memberships, courses };
}

function accessFor(course, ent) {
    if (course.membership) {
        const until = (ent.memberships || {})[course.membership] || 0;
        if (until > Date.now()) return { granted: true, reason: 'membership', until };
        if (until) return { granted: false, reason: 'membership_expired', until };
    }
    if (course.product && (ent.courses || []).indexOf(course.product) !== -1) {
        return { granted: true, reason: 'purchase' };
    }
    return { granted: false, reason: 'not_purchased' };
}

// Read once per warm instance. Both files only change on a deploy, so re-reading
// them per request would buy nothing; but a throw here must not take the whole
// function down, because "the catalog is missing" and "the private map is
// missing" have different answers (404 vs 501) and different fixes.
let catalogCache;
let privateCache;

function catalog() {
    if (catalogCache === undefined) {
        try {
            catalogCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'catalog.json'), 'utf8'));
        } catch (e) {
            catalogCache = null;
        }
    }
    return catalogCache;
}

function privateMap() {
    if (privateCache === undefined) {
        try {
            privateCache = JSON.parse(fs.readFileSync(path.join(DATA_DIR, 'private.json'), 'utf8'));
        } catch (e) {
            privateCache = null;
        }
    }
    return privateCache;
}

function findCourse(id) {
    const cat = catalog();
    if (!cat) return null;
    return (cat.courses || []).find((c) => c.id === id) || null;
}

// The public half of a lesson: enough to render a syllabus to a stranger, and
// nothing a stranger could use. hasVideo/hasNotes come from the catalog rather
// than from private.json so that this stays answerable without the secrets.
function publicLesson(l) {
    return {
        n: l.n,
        module: l.module || null,
        title: l.title,
        brief: l.brief || '',
        duration: l.duration || null,
        hasVideo: !!l.hasVideo,
        hasNotes: !!l.hasNotes,
        free: !!l.free,
    };
}

function courseSummary(c) {
    const lessons = c.lessons || [];
    return {
        id: c.id,
        title: c.title,
        subtitle: c.subtitle || '',
        desc: c.desc || '',
        membership: c.membership || null,
        product: c.product || null,
        lessonCount: lessons.length,
        videoCount: lessons.filter((l) => l.hasVideo).length,
        noteCount: lessons.filter((l) => l.hasNotes).length,
    };
}

// private.json is authored by hand, so a stray "../" is a typo rather than an
// attack — but a typo that reads book_pages/ or .env would be just as bad, and
// the check costs one comparison.
function notesPath(rel) {
    if (!rel) return null;
    const file = path.resolve(NOTES_DIR, rel);
    if (file !== NOTES_DIR && !file.startsWith(NOTES_DIR + path.sep)) return null;
    return file;
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    res.setHeader('X-Robots-Tag', 'noindex');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    if (req.method !== 'GET') {
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(405).json({ error: 'method_not_allowed' });
        return;
    }

    const q = req.query || {};
    const cat = catalog();
    if (!cat) {
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(501).json({ error: 'course_data_not_configured' });
        return;
    }

    // 1. The shop window: every course, no lesson detail, nothing secret. This is
    //    the only cacheable response in the file, and only because there is
    //    nothing in it a stranger could not be shown.
    if (!q.course) {
        res.setHeader('Cache-Control', 'public, max-age=300');
        res.status(200).json({ courses: (cat.courses || []).map(courseSummary) });
        return;
    }

    const course = findCourse(q.course);
    if (!course) {
        res.setHeader('Cache-Control', 'private, no-store');
        res.status(404).json({ error: 'unknown_course' });
        return;
    }

    // Everything past this point is per-user, so no shared copy may be kept.
    res.setHeader('Cache-Control', 'private, no-store');

    const token = q.token || (req.headers.authorization || '').replace(/^Bearer\s+/i, '');
    const uid = token ? await verifyToken(token) : null;
    const ent = uid ? await readEntitlements(uid, token) : { memberships: {}, courses: [] };
    const access = uid ? accessFor(course, ent) : { granted: false, reason: 'not_signed_in' };

    // 2. The syllabus. Readable signed out — a visible lesson list is what sells
    //    the course — but it never carries a video id, whoever asks.
    if (q.lesson === undefined) {
        res.status(200).json({
            course: courseSummary(course),
            modules: course.modules || [],
            lessons: (course.lessons || []).map(publicLesson),
            access,
        });
        return;
    }

    const n = parseInt(q.lesson, 10);
    if (!Number.isInteger(n)) { res.status(400).json({ error: 'bad_request' }); return; }

    const lesson = (course.lessons || []).find((l) => l.n === n);
    if (!lesson) { res.status(404).json({ error: 'unknown_lesson' }); return; }

    if (!lesson.free) {
        if (!uid) { res.status(401).json({ error: 'login_required' }); return; }
        if (!access.granted) {
            res.status(403).json({
                error: 'purchase_required',
                product: course.product || null,
                membership: course.membership || null,
                reason: access.reason,
            });
            return;
        }
    }

    const priv = privateMap();
    if (!priv) { res.status(501).json({ error: 'course_data_not_configured' }); return; }
    const entry = (priv[course.id] || {})[String(n)] || {};

    const htmlFile = notesPath(entry.notesHtml);
    const pdfFile = notesPath(entry.notesPdf);
    const hasHtml = !!(htmlFile && fs.existsSync(htmlFile));
    const hasPdf = !!(pdfFile && fs.existsSync(pdfFile));

    // 3. The note, as a document. srcdoc in the client, so this is sent as plain
    //    HTML and never framed by us — see showReaderHtml() in app.js for why the
    //    note keeps its own stylesheet instead of inheriting the app's.
    if (q.notes === 'html') {
        if (!hasHtml) { res.status(404).json({ error: 'not_found' }); return; }
        res.setHeader('Content-Type', 'text/html; charset=utf-8');
        res.status(200).send(fs.readFileSync(htmlFile, 'utf8'));
        return;
    }

    if (q.notes === 'pdf') {
        if (!hasPdf) { res.status(404).json({ error: 'not_found' }); return; }
        const buf = fs.readFileSync(pdfFile);
        const name = entry.notesName || `${course.id}-${String(n).padStart(2, '0')}.pdf`;
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Length', buf.length);
        // filename* so the Bengali name survives; the plain filename is the
        // ASCII fallback for anything that cannot read RFC 5987.
        res.setHeader('Content-Disposition',
            `attachment; filename="note-${n}.pdf"; filename*=UTF-8''${encodeURIComponent(name)}`);
        res.status(200).send(buf);
        return;
    }

    if (q.notes !== undefined) { res.status(400).json({ error: 'bad_request' }); return; }

    // 4. The lesson itself. If it has neither a video nor a note there is nothing
    //    to open, and saying so plainly is better than handing back an empty
    //    player: the catalog says the lesson exists, the content has not landed.
    const video = entry.video || null;
    if (!video && !hasHtml && !hasPdf) {
        res.status(503).json({ error: 'lesson_not_ready', n });
        return;
    }

    res.status(200).json({
        n,
        title: lesson.title,
        duration: lesson.duration || null,
        host: entry.host || 'youtube',
        video,
        notes: { html: hasHtml, pdf: hasPdf, name: entry.notesName || null },
    });
};
