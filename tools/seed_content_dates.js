// One-off: fill tools/content-dates.json with first-published dates taken
// from git history, so the sitemap and the Article/WebPage structured data
// do not claim that every page was published on the day this system was
// switched on.
//
//   node tools/seed_content_dates.js
//
// For each kind of page it asks git when the source was first committed
// (--diff-filter=A) and when it last changed. Sources that git has never seen
// (new guides, the 22 legacy PDFs still uncommitted, audio codes added in the
// working copy) get no seed and will be dated by the next build — which is
// the truth: they went live with that build.
//
// The hash field is left null on seeded records; the first build adopts the
// real hash without touching the dates (see seo.contentDates).

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.join(__dirname, '..');
const FILE = path.join(__dirname, 'content-dates.json');

function git(args) {
    try {
        return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
    } catch (e) { return ''; }
}
const firstCommit = (file) => git(['log', '--diff-filter=A', '--follow', '--format=%as', '--', file]).split('\n').filter(Boolean).pop() || '';
const lastCommit = (file) => git(['log', '-1', '--format=%as', '--', file]) || '';

const dates = fs.existsSync(FILE) ? JSON.parse(fs.readFileSync(FILE, 'utf8')) : {};
let seeded = 0;
const seed = (key, published, modified) => {
    if (!published || dates[key]) return;
    dates[key] = { hash: null, published, modified: modified && modified > published ? modified : published };
    seeded++;
};

// Guides: the document's source file.
for (const f of fs.readdirSync(path.join(ROOT, 'guides_src')).filter((f) => f.endsWith('.html'))) {
    const src = `guides_src/${f}`;
    seed(`/guides/${f.replace(/\.html$/, '')}/`, firstCommit(src), lastCommit(src));
}

// Legacy PDFs: the file itself.
for (const p of JSON.parse(fs.readFileSync(path.join(ROOT, 'pdf_list.json'), 'utf8'))) {
    const src = `pdf/${p.filename}`;
    seed(`/guides/pdf/${p.filename.replace(/\.pdf$/i, '')}/`, firstCommit(src), lastCommit(src));
}

// Audio tracks: the commit that first mentioned the code in audio.json.
// -S with the exact JSON fragment; one git call per track.
const audio = JSON.parse(fs.readFileSync(path.join(ROOT, 'audio.json'), 'utf8'));
for (const t of audio) {
    const needle = `"code": "${t.code}"`;
    const first = git(['log', '--format=%as', '-S', needle, '--', 'audio.json']).split('\n').filter(Boolean).pop() || '';
    seed(`/audio/${t.code}/`, first, '');
}

// Section indexes: when the builder that makes them first landed.
seed('/audio/', firstCommit('tools/library.js'), '');
seed('/guides/', firstCommit('tools/guides.js'), '');
seed('/blog/', firstCommit('tools/blog.js'), '');

const sorted = Object.fromEntries(Object.keys(dates).sort().map((k) => [k, dates[k]]));
fs.writeFileSync(FILE, JSON.stringify(sorted, null, 1) + '\n');
console.log(`seeded ${seeded} record(s) -> tools/content-dates.json (${Object.keys(dates).length} total)`);
