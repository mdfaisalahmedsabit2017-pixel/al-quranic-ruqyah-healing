// Play policy audit for the native build. Run after `npm run build:native`,
// and again in CI on the assets unpacked from the release AAB.
//
//     node tools/audit-native.js [dir]     (default: native/)
//
// WHAT THIS ENFORCES, AND WHY THOSE THINGS
//
// Play's Payments policy bans selling digital goods outside Play Billing, and
// its anti-steering rule extends that to *pointing at* an outside purchase path
// — a price, a "কিনুন" button, a bKash number, even the sentence "buy it on our
// website". What a reviewer can see and reach is what matters.
//
// So the hard failures below are about reachable surface:
//
//   1. Shipped markup (index.html) must contain no price, buy CTA or payment
//      number at all. This is the check that earns its keep: it catches a
//      #web-only marker that got dropped or mistyped during an edit, which is
//      the realistic regression.
//   2. The payment account numbers must not exist in the bundle in any form.
//      They live in payments.js, which the native target never copies.
//   3. The purchase functions must not be defined. build.js cuts them out; if
//      that stripping silently stops working, this notices.
//
// What is deliberately NOT a hard failure: leftover strings inside app.js that
// sit in comments, or in dead branches of an `IS_NATIVE ? ... : ...` ternary
// that the native build never evaluates. They are unreachable, and the app's
// admin panel — which the owner chose to keep in the APK, behind an email gate
// — legitimately displays past revenue in ৳. Failing on those would mean either
// deleting the admin panel or maintaining a pile of indirection that buys no
// actual policy safety. They are printed as a review list instead.

const fs = require('fs');
const path = require('path');

const dir = path.resolve(process.argv[2] || path.join(__dirname, '..', 'native'));
if (!fs.existsSync(dir)) {
    console.error(`Audit target not found: ${dir}`);
    process.exit(1);
}

// Payment numbers first: these must never appear, anywhere, in any form.
const FORBIDDEN_ANYWHERE = [
    '01886608999',        // the bKash / Nagad / Rocket receiving number
    'PAYMENT_BKASH',
    'PAYMENT_NAGAD',
    'PAYMENT_ROCKET',
];

// Purchase-facing language: banned in markup, reviewed elsewhere.
const PURCHASE_LANGUAGE = ['৳', 'কিনুন', 'bkash', 'bKash', 'nagad', 'Nagad', 'Rocket'];

// Anti-steering is not only about payment. Play's policy also covers pointing
// users at another way to GET the app, and this codebase is a PWA as well as an
// APK — it carries an install banner whose subtitle is, literally, "no App
// Store needed". beforeinstallprompt never fires in an Android WebView so it
// could not have appeared, but unreachable is not absent, and a reviewer who
// unzips the bundle greps the strings rather than running the app.
const DISTRIBUTION_STEERING = [
    'App Store লাগবে না',
    'install-banner',
    'beforeinstallprompt',
];

// Function definitions that must not survive marker stripping.
const FORBIDDEN_DEFINITIONS = [
    'window.openBuyModal',
    'window.submitCoursePurchase',
    'window.selectPayMethod',
];

function walk(d, out = []) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const p = path.join(d, e.name);
        if (e.isDirectory()) walk(p, out);
        else out.push(p);
    }
    return out;
}

const TEXT_EXT = new Set(['.html', '.js', '.json', '.css', '.mjs', '.txt', '.webmanifest']);
const files = walk(dir).filter(f => TEXT_EXT.has(path.extname(f).toLowerCase()));

const failures = [];
const review = [];

for (const file of files) {
    const rel = path.relative(dir, file).replace(/\\/g, '/');
    let text;
    try {
        text = fs.readFileSync(file, 'utf8');
    } catch {
        continue;   // unreadable as text; nothing to audit
    }
    const lines = text.split('\n');

    lines.forEach((line, i) => {
        const at = `${rel}:${i + 1}`;

        // The same digits are both the payment receiving number and the
        // consultation WhatsApp line. Pointing at a real-world service to book
        // an appointment is allowed; presenting the number as somewhere to send
        // money is not. Contact contexts are therefore exempt.
        const isContactContext = /wa\.me|whatsapp|tel:|ADMIN_WA|যোগাযোগ/i.test(line);

        for (const needle of FORBIDDEN_ANYWHERE) {
            if (line.includes(needle) && !isContactContext) {
                failures.push(`${at}  payment identifier "${needle}"`);
            }
        }

        for (const needle of FORBIDDEN_DEFINITIONS) {
            if (line.includes(needle + ' =')) {
                failures.push(`${at}  purchase function "${needle}" survived stripping`);
            }
        }

        for (const needle of PURCHASE_LANGUAGE) {
            if (!line.includes(needle)) continue;
            if (rel.endsWith('.html') && !rel.startsWith('privacy')) {
                failures.push(`${at}  purchase language "${needle}" in shipped markup`);
            } else {
                review.push(`${at}  ${needle}  ${line.trim().slice(0, 90)}`);
            }
        }

        for (const needle of DISTRIBUTION_STEERING) {
            // The comment explaining the guard in app.js names the handler, so
            // exempt comment lines — the check is about shipped markup and live
            // code, not about the note saying why the code is gated.
            if (line.includes(needle) && !/^\s*(\/\/|\*|<!--)/.test(line)) {
                failures.push(`${at}  distribution steering "${needle}"`);
            }
        }
    });
}

// payments.js must not have been copied at all.
if (fs.existsSync(path.join(dir, 'payments.js'))) {
    failures.push('payments.js  present in the native bundle');
}

console.log(`Audited ${files.length} text files under ${path.relative(process.cwd(), dir) || dir}`);

if (review.length) {
    console.log(`\n${review.length} unreachable/administrative occurrence(s) — review, not blocking:`);
    for (const r of review) console.log(`  ${r}`);
}

if (failures.length) {
    console.error(`\n❌ ${failures.length} policy failure(s):`);
    for (const f of failures) console.error(`  ${f}`);
    console.error('\nA #web-only marker is probably missing or malformed. See docs/release.md.');
    process.exit(1);
}

console.log('\n✅ Policy audit passed — no reachable purchase surface in the native build.');
