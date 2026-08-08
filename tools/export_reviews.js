// Snapshots the published reviews into reviews.json at build time, so the
// landing page can show them without loading Firebase.
//
// The landing page is the first thing a stranger sees and the only page that
// has to convince anyone of anything. Pulling 300 KB of Firebase SDK onto it to
// render a handful of quotes would be a poor trade, and a review that only
// exists after JavaScript runs is a review Google does not read. So the build
// takes a copy, the page ships with the text already in it, and the
// aggregateRating in the structured data is computed from the same numbers.
//
// The cost is staleness: the landing page shows the reviews as of the last
// deploy. Inside the app (/app) they are always live, read straight from
// Firestore. That asymmetry is deliberate — the app is for people who already
// arrived, the landing page is for people deciding whether to.
//
// No credentials. `reviews` is world-readable by rule (docs/reviews.md), which
// it has to be anyway for the app's own rendering, so the build reads it the
// same way any visitor could. If it cannot — rules not yet in place, network
// down, Firestore having a bad day — the previous reviews.json is kept and the
// build says so rather than failing or, worse, silently publishing an empty
// list where testimonials used to be.

const fs = require('fs');
const path = require('path');
const https = require('https');

const PROJECT_ID = 'al-quranic-ruqyah';
const API_KEY = 'AIzaSyBQyGnY8DhqdlTpOIwfZC6FZWqvOmwGDh8';  // public web key
const OUT = path.join(__dirname, '..', 'reviews.json');
const MAX_SHOWN = 12;

function getJSON(url) {
    return new Promise((resolve, reject) => {
        const req = https.get(url, (res) => {
            let data = '';
            res.on('data', (c) => { data += c; });
            res.on('end', () => {
                try { resolve({ status: res.statusCode, json: JSON.parse(data || '{}') }); }
                catch (e) { reject(e); }
            });
        });
        req.on('error', reject);
        req.setTimeout(15000, () => req.destroy(new Error('timed out')));
    });
}

// Firestore REST wraps every value in a one-key object naming its type.
function plain(field) {
    if (!field) return undefined;
    if ('stringValue' in field) return field.stringValue;
    if ('integerValue' in field) return parseInt(field.integerValue, 10);
    if ('doubleValue' in field) return field.doubleValue;
    if ('timestampValue' in field) return field.timestampValue;
    if ('booleanValue' in field) return field.booleanValue;
    return undefined;
}

async function fetchReviews() {
    const url = `https://firestore.googleapis.com/v1/projects/${PROJECT_ID}`
              + `/databases/(default)/documents/reviews?key=${API_KEY}&pageSize=300`;
    const { status, json } = await getJSON(url);
    if (status !== 200) {
        const msg = (json.error && json.error.message) || `HTTP ${status}`;
        throw new Error(msg);
    }
    return (json.documents || []).map((d) => {
        const f = d.fields || {};
        return {
            target: plain(f.target) || plain(f.bookId) || '',
            name: plain(f.name) || 'একজন পাঠক',
            rating: plain(f.rating),
            review: plain(f.review) || '',
            // NOT exported: `improve`. The modal promises that field is seen by
            // the author alone, and this file is served to the whole internet.
            createdAt: plain(f.createdAt) || d.createTime || '',
        };
    }).filter((r) => r.target && Number.isInteger(r.rating) && r.rating >= 1 && r.rating <= 5);
}

function summarise(rows) {
    const targets = {};
    rows.forEach((r) => {
        if (!targets[r.target]) targets[r.target] = { count: 0, sum: 0 };
        targets[r.target].count++;
        targets[r.target].sum += r.rating;
    });
    Object.values(targets).forEach((t) => {
        t.avg = Math.round((t.sum / t.count) * 10) / 10;
        delete t.sum;
    });

    const items = rows
        .filter((r) => r.review.trim())
        .sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)))
        .slice(0, MAX_SHOWN);

    return { generatedAt: new Date().toISOString(), total: rows.length, targets, items };
}

async function exportReviews() {
    try {
        const rows = await fetchReviews();
        const data = summarise(rows);
        fs.writeFileSync(OUT, JSON.stringify(data, null, 2) + '\n');
        console.log(`Reviews: ${data.total} total, ${data.items.length} with text `
                  + `across ${Object.keys(data.targets).length} target(s) -> reviews.json`);
        return data;
    } catch (e) {
        console.warn(`Reviews: could not refresh (${e.message}) — keeping the committed snapshot`);
        try {
            return JSON.parse(fs.readFileSync(OUT, 'utf8'));
        } catch (e2) {
            console.warn('Reviews: no snapshot on disk either — the landing page will show none');
            return { generatedAt: null, total: 0, targets: {}, items: [] };
        }
    }
}

module.exports = { exportReviews };

if (require.main === module) exportReviews();
