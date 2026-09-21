# CLAUDE.md — operating instructions for this repository

**This is a LIVE production system with real users and real money flowing through it.**
Site: https://alquranicruqyahhealing.com · Android: `com.selfruqyah.app` (Play closed testing).

This file supplements — it does **not** replace — the living operational docs:

| Read first | For |
|---|---|
| `docs/README.md` | Launch state, what's blocked, the Firestore-rules incident, the two-Google-account warning |
| `docs/course.md`, `docs/HANDOFF-course.md` | The premium course area and its traps |
| `docs/finance.md` | The admin finance tab and its accepted risks |
| `docs/live-class.md` | The membership product and the Telegram links |
| `docs/notifications.md` | Announcements + FCM push |
| `docs/reviews.md` | The review system and the build-time snapshot |
| `docs/release.md`, `docs/play-listing.md`, `docs/firebase-android.md`, `docs/facebook-login.md` | Android/Play |
| `docs/seo-keywords.md`, `docs/audio-recategorise.md` | Content research/decisions |
| `ARCHITECTURE.md`, `ROADMAP.md`, `DECISIONS.md`, `PROJECT_MASTER_SPEC.md` | Structure, order of work, why |

**When a `docs/*.md` file and this one disagree, the `docs/` file wins** — it was written by whoever shipped
that subsystem.

---

## 1. Commands

```bash
npm run build          # node build.js --target=web     → public/
npm run build:native   # node build.js --target=native  → native/
npm run check          # build + build:native + audit:native + check:android + smoke  ← run before any deploy
npm run smoke          # jsdom: boots native/, public/ and the course feature
npm run sync           # build:native + audits + npx cap sync android
npm run deploy:rules   # firebase-tools deploy --only firestore:rules   ← SEPARATE from the site deploy
npm run course:check   # validates course_data (blocks placeholder rows)
npm run brand          # regenerate icons/splash/feature graphic

vercel --prod          # deploy the site — FROM A WORKING COPY, NEVER FROM GIT
```

Android release build (local):
```powershell
$env:JAVA_HOME='C:\Program Files\Eclipse Adoptium\jdk-21.0.12.101-hotspot'
cd 'A:\Ruqyah Audio App\android'; .\gradlew.bat bundleRelease --no-daemon
```

---

## 2. The five things that break silently

Every one of these has actually happened, or is documented in the code as having happened.

### 2.1 `vercel --prod` does NOT deploy Firestore rules

Editing `firestore.rules` changes **nothing** live. Rules are a separate system.
`firestore.rules` was written 2026-08-09 and never deployed; until 2026-09-02 production was running a
17-line July ruleset, which meant:

- every review read/write returned `Missing or insufficient permissions` → the review feature was **completely
  dead** for weeks, with no error anywhere except the browser console;
- publishing a notice failed for the same reason;
- `users/{uid}` allowed unrestricted self-write, so **any signed-in user could grant themselves the ৳৪৯০
  membership from the browser console** and `/api/membership` would hand over the private Telegram links.

**Rule: every time `firestore.rules` changes, run `npm run deploy:rules`. After any Firebase Console edit,
copy the Console's version back into the file.** The old ruleset is still in the Console's version history if a
rollback is ever needed.

### 2.2 A `git push` deploy ships the paid products EMPTY

`vercel.json` bundles paid bytes into the serverless functions with `includeFiles`. `includeFiles` can only
bundle files **present in the deployment source**, and a git-integration deploy's source *is the repository* —
where `book_pages*/`, `book_html_yasin/`, `course_data/private.json` and `course_notes/` are all **gitignored**
(the repo is public; committing them would give away the paid products).

Result of a git deploy: `/api/book?meta=1` answers `{"pages":0}`, every buyer gets an empty reader, `/api/course`
returns 404 for every note — **and the build log says nothing.** This shipped once, to শেখার শিল্প.

`vercel.json` sets `git.deploymentEnabled.master = false` to make it structurally impossible.
**Never re-enable it. Always `vercel --prod` from a working copy.**

### 2.3 Never add `course_data/` or `course_notes/` to `.vercelignore`

They look exactly like `book_notes/`, which *is* listed there. But `book_notes/` is only a source for generating
PNGs and no function reads it; `course_data/` and `course_notes/` are read by `api/course.js`. `.vercelignore`
removes files from the deployment source, and `includeFiles` cannot bundle what isn't there → every note 404s,
silently. There is a comment in `.vercelignore` saying exactly this. **Do not "tidy" that file.**

### 2.4 Build markers must alternate strictly open/close

`<!-- #web-only -->…<!-- /#web-only -->` (HTML/CSS) and `/* #web-only */…/* /#web-only */` (JS).
Nesting a pair of the same tag silently truncates the outer region and leaves a stray closing marker —
unbalanced HTML with no error. `build.js` now hard-fails on it (`assertMarkersWellFormed`), and stripped JS is
parse-checked with `new Function()`. **Only ever wrap complete top-level statements.** A marker opening inside
a function or a template literal produces broken output.

### 2.5 Android Gradle flags and Capacitor providers must change together

`android/variables.gradle` (`rgcfaIncludeGoogle`, `rgcfaIncludeFacebook`) and `capacitor.config.json`'s
`plugins.FirebaseAuthentication.providers` list are paired. Listing a provider whose SDK isn't packaged gives a
`NoClassDefFoundError` and the app dies at launch with no message — this happened before v1.0.
`npm run check:android` verifies the pairing. Facebook additionally needs
`android/app/src/main/res/values/facebook.xml` to exist *before* the flag is flipped.

---

## 3. What NOT to touch

| Don't | Why |
|---|---|
| **Any existing public URL** (`/audio/<CODE>/`, `/guides/<slug>/`, `/blog/<slug>/`, `/topics/<slug>/`, `/guides/pdf/<slug>/`) | ~900 indexed pages with accumulated ranking. Track codes are held by patients. A URL that moves loses what it had. |
| **`guides_src/*.html`** by hand | They are copies. The source is an external project — `A:\claude code projects sabit\ruqyah pdf maker\` — and the next `sync_guides.py` run overwrites local edits. See `guides_src/README.md`. |
| **`guides_src/files/*.pdf`** by hand | Generated by `python tools/watermark_pdfs.py`, which tracks source sha256 in `sources.json` so unchanged files aren't re-stamped (otherwise 174 MB of churn per sync). |
| **The `live-class` entry in `app.js` `COURSES`** | Marked LEGACY. ~30 lines in `renderCourses()` and `memberCardMarkup()` read it by id. Anyone already holding `memberships['live-class']` depends on its price and expiry math. It is filtered from display; do not delete it or change its id/price. |
| **`createYTPlayer()`** | Separate from `createCourseYTPlayer()` on purpose (`docs/HANDOFF-course.md`). |
| **`styles/` filename ordering** | `01-base.css` defines the custom properties everything after reads. Renaming or reordering breaks the cascade. |
| **The `courses[]` field as an entitlement for anything expensive** | `firestore.rules` deliberately lets a user write their own `courses[]` so a ৳১০০ book unlocks the instant a TrxID is submitted. Fine for a book; **not** fine for a video course. Anything sold outright needs a new admin-only field (`courseGrants`) first — `docs/course.md` and `api/course.js` both say so. |
| **`payments.js` / merchant numbers / prices reaching the APK** | Play forbids selling digital goods outside Play Billing and forbids steering. `tools/audit-native.js` fails the build. Any new payment code goes inside `#web-only` **and** gets a matching needle in the audit, in the same commit. |
| **`versionCode` reuse** | Once used on Play, never reusable — not even for a discarded internal build. |
| **`git.deploymentEnabled` in `vercel.json`** | See §2.2. |
| **The keystore** (`A:\keys\ruqyah-upload.keystore`) | Lose it and the app can never be updated again. |

---

## 4. Gitignored vs tracked — and why it matters

**Tracked (and must stay tracked):** `firebase-config.js` (CI builds from git and a blank apiKey means nobody can
sign in — `build.js` now fails the build on it), `audio.json`, `pdf_list.json`, `audio_meta.json`, `pdf_meta.json`,
`course_data/catalog.json` (it's the sales copy), `reviews.json`, `tools/content-dates.json`, `firestore.rules`,
`guides_src/*.html` + `guides.json` + `files/*.pdf`.

**Gitignored, and the repository is PUBLIC:**
`book_pages/`, `book_pages_yasin/`, `book_html_yasin/`, `book_pages_isme_azam/`, `course_data/private.json`,
`course_notes/`, `audio_files/` (~4 GB), `public/`, `native/`, `www/`, `pdf_archive/`, `docx/`, `research_src/`,
`node_modules/`, `*.jks`, `*.keystore`, `keystore.properties`, `google-services.json`.

> `docx/` and `research_src/` were pushed once by a `git add -A` and had to be untracked — `docx/` held editable
> guide sources (the watermark policy forbids publishing them) and quiz sheets with students' names.
> **Never `git add -A` in this repository.**

**Secrets live only in Vercel environment variables, never in the repo:**
`TELEGRAM_LINKS`, `SHEET_API_URL`, `SHEET_API_TOKEN`, `FIREBASE_SERVICE_ACCOUNT`, `GEMINI_API_KEY`.
The Firebase web apiKey in `firebase-config.js` and the `API_KEY` constants in `api/*.js` are the **public**
web key — that is intentional and correct.

---

## 5. How the codebase is shaped (so you don't fight it)

- **No framework, no bundler, no runtime npm dependency.** `app.js` is 7,675 lines of global scope. That is a
  deliberate, working choice — see `DECISIONS.md` ADR-001. Do not introduce React/Next/Vite.
- **`api/*.js` have zero npm dependencies** — raw `https`, `crypto`, global `fetch`. Each duplicates its own
  `verifyToken`/`postJSON`/`getJSON`. `api/finance.js` explains why. Don't factor them out as a standalone
  refactor; do it as part of the role-claims work (ROADMAP 5.5/5.7).
- **Every gated function verifies the caller's ID token against Identity Toolkit and reads Firestore *as that
  user*.** No service-account key anywhere except `api/push.js`. Keep that property — it makes `firestore.rules`
  the single authorisation truth.
- **Client-side checks are cosmetic.** Hiding the admin FAB is not security. The server check is.
- **Unconfigured features answer 501 and say so.** Never let a missing env var produce a broken UI.
- **Nothing may invent a fact.** `tools/seo.js`'s governing rule. Dates come from content hashes, durations from
  `audio_meta.json`, page counts from `pdf_meta.json`, ratings from real reviews. Where a value is unknown, the
  markup omits it. Extend this rule; never weaken it.
- **Bengali text normalization:** `audio.json` spells য় as one code point (U+09DF); typed Bengali uses য + nukta.
  Anything compared across sources goes through `seo.nfc()` first.

---

## 6. Verifying a change

```bash
npm run check          # the gate. build web + native, policy audit, android pairing, 3 jsdom smokes
```

`tools/smoke.js` boots the **built** output in jsdom and asserts on the DOM it actually produces — it caught a
`window.Notification` dereference that collapsed startup inside a try block, which no static check would find.
jsdom is not a browser: treat a pass as "the app boots and builds the DOM it should", not as a substitute for
the device checklist in `docs/release.md`.

**There is no test coverage for `api/*.js` at all, and no runtime error monitoring anywhere.** If you change a
function, exercise it by hand against production after deploying, or add a check to
`tools/verify-prod.js` (ROADMAP 0.2).

After a site deploy, at minimum confirm:
- `/api/book?book=shekhar-shilpo&meta=1` returns `pages > 0` (repeat for `yasin-karishma`, `isme-azam`)
- `/api/course` returns the catalog
- `curl -s https://alquranicruqyahhealing.com/api/membership` returns 401
- `git grep 't\.me/+'` returns nothing, and `grep -c 't\.me' public/app.js` is 0

---

## 7. Android / Play state (as of 2026-09-20)

- Package `com.selfruqyah.app`, app name "Self Ruqyah" (the site brand and the app name differ on purpose).
- **Closed testing (Alpha) release 1.0.1(2) published 2026-09-03.** Store listing, App content and Store settings
  approved in the same submission.
- **Blocked on:** 12+ testers opted in for 14 *consecutive* days before production can be applied for. 99 clean
  tester emails collected. The clock resets if the count drops below 12. Aim for 15–16.
- `FIREBASE_SERVICE_ACCOUNT` is **not yet set** in Vercel → notices publish, push notifications return 501.
- **After Play App Signing enrolment**, the Play-generated cert's SHA-1/SHA-256 must be added to Firebase and
  `google-services.json` re-downloaded. Skipping this is the single most common cause of
  "Google login worked on my phone but not from the Play version."
- Data safety declares **Health info = yes** (patient forms + symptom checker). Any feature that collects new
  data types requires the Play form to be updated in the same change.
- Phone OTP and Facebook login are written and tested but **deliberately off**
  (`window.PHONE_LOGIN_ENABLED`, `window.FACEBOOK_ENABLED`). Flipping either is the *last* step of its setup.

---

## 8. Working rules for a Claude session in this repo

1. **Read before writing.** This codebase's comments encode incidents that cost real money. They are not decoration.
2. **Do not commit, push, deploy or run a build unless explicitly asked.** Publishing is a human action here.
3. **Check `git status` first.** The owner frequently has content work in flight (e.g. 48 untracked guide
   documents + PDFs as of 2026-09-19). Never `git add -A`, never stage files you didn't create.
4. **Prefer the smallest change that survives the constraints.** Reuse what exists. No new dependency and no new
   infrastructure unless the current approach genuinely cannot do the job — and then record it in `DECISIONS.md`.
5. **Arabic text is never typed from memory.** Pull it from a verified corpus. Same for Qur'an references,
   hadith, scholar names and quotations — fabricating any of them is the worst failure available in this project.
6. **Health, religious and medical claims follow the product rules in `PROJECT_MASTER_SPEC.md` §3.**
   No feature ships that presents an automated result as a diagnosis.
7. **If something is ambiguous, say so in writing rather than guessing confidently.**
