# ARCHITECTURE — Al Quranic Ruqyah Healing

Written 2026-09-20 from a direct read of the repository. Every "today" statement below names the file it came from.
Every "extension" is an increment on top of what exists — see `DECISIONS.md` for why each was chosen.

> **Reading order for a new session:** `docs/README.md` (launch state) → this file (structure) →
> `ROADMAP.md` (order of work) → `CLAUDE.md` (how to operate the repo safely).

---

## 0. System map (today)

```
                         ┌──────────────────────────────────────────┐
  content sources        │  build.js  (zero-dependency Node)        │
  ─────────────          │                                          │
  landing.html           │   --target=web   ──▶  public/   (Vercel) │
  index.html   ──────────▶   --target=native ──▶ native/  (Capacitor APK)
  app.js  (7,675 lines)  │                                          │
  styles/*.css (7 files) │   tools/seo.js      identity, head, JSON-LD,
  audio.json      (389)  │                     TOPICS registry, sitemaps
  audio_meta.json (369)  │   tools/blog.js     posts/*.md → /blog/<slug>/
  pdf_list.json   (104)  │   tools/guides.js   guides_src/*.html → /guides/<slug>/
  pdf_meta.json   (104)  │   tools/library.js  → /audio/<CODE>/, /guides/pdf/<slug>/,
  guides_src/*.html(169) │                       /topics/<slug>/, 404.html
  posts/*.md      (316)  │   tools/export_reviews.js → reviews.json snapshot
  course_data/*.json     └──────────────────────────────────────────┘
                                          │
            ┌─────────────────────────────┼──────────────────────────────┐
            ▼                             ▼                              ▼
   public/ on Vercel CDN          api/*.js (6 functions)        native/ → Capacitor → AAB
   ~900 static URLs               book · course · membership      com.selfruqyah.app
   + sitemap index                finance · push · chat           Play closed testing
                                          │
                                          ▼
                          Firebase (project `al-quranic-ruqyah`)
                          Auth (Google, email/pw) · Firestore
                          users · patients · purchases · reviews · announcements
                                          │
                          external: Gemini API · Google Apps Script (MFS ledger) · FCM
```

---

## 1. Product architecture

**Two products, one source tree.** `build.js` produces:

- `public/` — the website: marketing root + `/app.html` web app + ~900 crawlable static pages.
- `native/` — the Android app's webDir: the app only, no marketing page, no `pdf/`, no blog, no prices.

They diverge through marker regions checked at build time:

| Marker | In | Stripper | Validation |
|---|---|---|---|
| `<!-- #web-only -->…<!-- /#web-only -->` | HTML | `stripMarkers()` | `assertMarkersWellFormed()` — nesting is a hard build failure |
| `/* #web-only */…/* /#web-only */` | `app.js`, CSS | `stripJsMarkers()` | result is parsed with `new Function()`; a syntax error fails the build |

Anything not structurally strippable stays gated at runtime on `IS_NATIVE` (`app.js:6`, from generated
`build-flags.js`). This is deliberate: regex surgery on a 7,675-line global-scope file is how you ship a
syntax error to a phone.

**Extension path** — the international surface is a **third build dimension, not a third product**:
`build.js --target=web` gains a locale loop, emitting `/en/…` alongside the Bengali root. The native target
stays Bengali-only until the English app is a deliberate product decision.

---

## 2. Frontend architecture

**Today:**
- No framework, no bundler, no npm runtime dependency. `app.js` is one global-scope file, 7,675 lines,
  loaded as a classic script.
- `styles/01-base.css` … `07-course.css` are inlined into a single `<style>` at build time. **Filename order is
  load-bearing** — `01-base.css` defines the custom properties everything else reads.
- `build.js` cross-checks `index.html`'s `<link>` list against `styles/` on disk and fails on any mismatch, so
  a stylesheet can never be silently dropped.
- Generated static pages (`blog`, `guides`, `audio`, `topics`, `guides/pdf`) share chrome from
  `tools/seo.js` (`head`, `NAV`, `FOOT`, `CSS`, `crumbs`) — one place to change a title pattern or a favicon.
- Ruqyah guide documents (`guides_src/*.html`) are **complete standalone A4 documents** with their own `<head>`
  and inline `<style>`. `tools/guides.js` only relocates them (font paths, links, canonical, breadcrumbs,
  related block). They are not templated and must not be.

**Bottleneck (named):** `app.js` is the scaling constraint for Phases 5–9. Every new feature adds to a single
global scope with no module boundaries, no tests at the unit level, and a jsdom smoke test as the only
executable check.

**Extension path — incremental ES-module islands, no bundler:**
1. New features ship as `modules/<feature>.js`, loaded with `<script type="module">`. `build.js` copies
   `modules/` into both targets like it already copies `icons/` and `fonts/`.
2. `app.js` stays exactly as it is. An existing feature is extracted **only when you are already changing it**,
   never as a standalone refactor.
3. Modules communicate with `app.js` through `window.*` exactly as `payments.js` and `firebase-config.js`
   already do — an established pattern in this codebase, not a new one.

Rejected: adding a bundler/framework. See `DECISIONS.md` ADR-001.

---

## 3. Backend / API architecture

Six Vercel serverless functions under `api/`. **Zero npm dependencies** — raw `node:https`, `node:crypto`, and
global `fetch`. Each function re-implements its own `postJSON`/`getJSON`/`verifyToken` helpers; `api/finance.js`
documents why (a shared `api/_lib/` file raises a routing question on a live site and the duplication is three
small functions, not three subsystems).

| Endpoint | Auth | Purpose | Config |
|---|---|---|---|
| `GET /api/book` | Firebase ID token → Identity Toolkit → `users/{uid}.courses[]` | Paid book pages one at a time; free preview (12/8/25 pages), free cover thumb, text edition for `yasin-karishma` | `includeFiles: {book_pages,book_pages_yasin,book_html_yasin,book_pages_isme_azam}/**` |
| `GET /api/course` | same + `memberships.<id>.until` | Free catalog; gated lesson video id + notes (HTML/PDF) | `includeFiles: {course_data,course_notes}/**` |
| `GET /api/membership` | same | Returns private Telegram links only to an unexpired `live-class` member | env `TELEGRAM_LINKS` (JSON); 501 if unset |
| `GET /api/finance` | admin only (verified email == `ADMIN_EMAIL`) | Read-only proxy to the owner's MFS ledger Apps Script | env `SHEET_API_URL`, `SHEET_API_TOKEN` (read token, never the ingest token); 501 if unset |
| `POST /api/push` | admin only | One FCM message to topic `all` | env `FIREBASE_SERVICE_ACCOUNT`; 501 if unset |
| `POST /api/chat` | **none** | Gemini 2.5 Flash proxy with a fixed Ruqyah system prompt | env `GEMINI_API_KEY` |

**Two design properties worth preserving:**
- *No service-account key except in `push.js`.* Every other function verifies the caller's ID token against
  Identity Toolkit and then reads Firestore **as that user** over REST. Firestore rules therefore remain the
  single authorisation truth — a function cannot accidentally over-read.
- *Absence is a 501, never a broken UI.* Unconfigured features say so.

**Named defect (must be fixed early):** `/api/chat` is unauthenticated, uncapped, `Access-Control-Allow-Origin: *`,
and spends the owner's Gemini key on every caller on the internet. It is also the only function with no
rate limit of any kind. See `ROADMAP.md` Phase 1.

**Extension path:**
- Keep the one-function-per-concern layout. New endpoints: `/api/assessment`, `/api/consultation`,
  `/api/search`, `/api/ask` (RAG), `/api/admin/*`.
- Introduce **`api/_shared/auth.js`** at the point where the fourth copy of `verifyToken` would be written —
  Vercel does not route `_`-prefixed directories as endpoints. Do this as part of the role-claims work
  (Phase 5), not as a standalone refactor.
- Latency bottleneck to watch: every gated request costs one Identity Toolkit round-trip *plus* one Firestore
  REST read. At high volume, cache the verified-uid→entitlement mapping in-function for 60s (keyed on the token
  hash), or move to verifying the JWT locally against Google's public keys. Do **not** do this before it is
  measured — see `ROADMAP.md` Phase 12.

---

## 4. Database / content architecture

### 4.1 Dynamic data — Firestore (`al-quranic-ruqyah`)

Rules live in `firestore.rules` **in the repository** (since 2026-08-09) and are deployed separately from the site.

| Collection | Doc id | Contents | Rule summary |
|---|---|---|---|
| `users` | `{uid}` | profile, `courses[]` (permanent unlocks), `memberships{}` (expiring), `courseProgress{}`, favourites, recently played | self or admin read; self may write **except** `memberships` |
| `patients` | `{uid}` | health intake: name, age, gender, phone, location, marital, problems, duration, prevTreatment, details, dreams, status, adminNotes | self or admin only |
| `purchases` | auto | uid, TrxID, product, status | create by self; read/update self or admin; delete admin |
| `reviews` | `{uid}_{target}` | rating 1–5, text, `improve` (admin-only field) | **world-readable**; write only where `id.split('_')[0] == auth.uid` |
| `announcements` | auto | notice title/body/time | world-readable; admin write |

Two deliberate asymmetries, both documented in the rules file and both worth re-reading before changing anything:

1. **A user may write their own `courses[]`.** A book unlocks the instant a TrxID is submitted and is revoked
   later if the payment doesn't exist. `api/course.js` states plainly that this is acceptable for a ৳১০০ book and
   would **not** be acceptable for a video course — any course sold outright needs a separate admin-only field
   (`courseGrants`) first.
2. **`memberships` is admin-write-only.** Before 2026-09-02 it was not, and a signed-in user could grant
   themselves the ৳৪৯০ product from the browser console. See `DECISIONS.md` ADR-009.

### 4.2 Static content — files, built at deploy time

| Source | Shape | Count | Built to |
|---|---|---|---|
| `audio.json` | `{code, category, title_bn, title_ar, tags[], url}` | 389 | `/audio/<CODE>/`, `/audio/<cat-slug>/` |
| `audio_meta.json` | `{ytId: {duration, uploadDate, ytTitle}}` | 369 | durations/dates on audio pages (never invented) |
| `pdf_list.json` | `{title_bn, filename, category}` | 104 | `/guides/pdf/<slug>/` + `/pdf/<file>.pdf` |
| `pdf_meta.json` | `{file: {bytes, pages, preview, sha256, slug}}` | 104 | page counts, previews |
| `guides_src/*.html` + `guides.json` | standalone documents + 10 categories + 169 slug→category | 169 on disk (121 committed) | `/guides/<slug>/` |
| `posts/*.md` | front-matter + restricted Markdown | 316 | `/blog/<slug>/` |
| `course_data/catalog.json` | course → modules → lessons | 1 course, 6 lessons | `/api/course` (free half) |
| `course_data/private.json` + `course_notes/` | video ids + note bytes | 3 videos, 4 note PDFs | `/api/course` (gated half) — **gitignored** |
| `reviews.json` | build-time Firestore snapshot | 12 max | landing page + `aggregateRating` |

**Upstream source of truth for guides is an external project**, referenced by `guides_src/README.md`:
`A:\claude code projects sabit\ruqyah pdf maker\` holds the content as Python dicts and generates the HTML/PDF.
`guides_src/*.html` are copies — **editing them here is overwritten on the next sync.**

### 4.3 Extension — one normalized content layer, not a new database

The metadata model in `PROJECT_MASTER_SPEC.md` §4.1 must not be built by rewriting five JSON files. Instead:

**Add `tools/content.js`** — a read-only normalizer that loads every existing source and returns one
`ContentItem[]` in the canonical shape, with a `source` field saying which file it came from.

```
audio.json ─┐
pdf_list    ├─▶ tools/content.js ─▶ ContentItem[]  ─┬─▶ builders (migrate one at a time)
guides.json ┤       (+ overlay)                     ├─▶ search index (build-time)
posts/*.md  ┤                                       ├─▶ RAG corpus (build-time)
catalog.json┘                                       └─▶ sitemap / hreflang
```

- Missing fields (`lang`, `status`, `visibility`, `translationOf`, editorial ordering) live in a small tracked
  **overlay file** — `content_overrides.json` — keyed by `type:slug`. The owner can unpublish, reorder, retag or
  mark a translation without touching a single HTML or Markdown file.
- `build.js`'s existing `loadCatalog()` is the natural place to call it; it already assembles a whole-site
  catalogue up front precisely so builders "only write, never discover".
- **Nothing is migrated.** The five source files keep their shapes forever.

This earns its complexity because **search, RAG, i18n and the admin panel all need the same normalized view**;
building it once is strictly cheaper than building it three times.

---

## 5. Authentication and authorization

**Today:**
- Firebase Auth. Live providers: Google, email/password. Phone and Facebook are **written, tested and
  flag-disabled** in `firebase-config.js` (`window.PHONE_LOGIN_ENABLED`, `window.FACEBOOK_ENABLED`) —
  each has a real setup cost, and a sign-in button that always fails costs more trust than a missing one.
- Native Google sign-in uses `@capacitor-firebase/authentication` with `skipNativeAuth: true`, so the plugin
  returns a credential and `app.js` does `signInWithCredential` into the JS SDK — **one session, not two**.
- Authorization is `email == 'crackdmcbuet@gmail.com'`, hardcoded in **four places**:
  `app.js:3827`, `api/push.js:33`, `api/finance.js:36`, `firestore.rules`.
- Entitlement is two Firestore fields: `courses[]` (permanent) and `memberships{}.until` (expiring).

**Extension — Firebase custom claims. This is the one structural auth change, and it gates Phases 6–8.**

```
users/{uid}                         (profile — unchanged)
auth token claims: { role: "editor" | "consultant" | "reviewer" | "admin" | "superadmin" }
```

Why claims and not a Firestore `roles` document:
- `firestore.rules` can read `request.auth.token.role` **without a document read**, so rules stay cheap and
  cannot be circumvented by a client.
- Every `api/*.js` already receives the verified token from Identity Toolkit; the claim arrives in the same
  response it already parses. No new dependency, no service-account key in the read path.

Migration is non-breaking: keep the `ADMIN_EMAIL` comparison as a fallback (`role == 'admin' || email == ADMIN_EMAIL`)
until the owner's own token carries the claim, then remove the four copies in one commit.

**Blast radius to respect:** the single admin email is a single point of failure. If that Google account is lost,
admin functions require a code change *plus* a `vercel --prod` *plus* a `npm run deploy:rules` to restore.
Adding a second super-admin claim is cheap insurance and belongs in Phase 5.

---

## 6. Content management

**Honest split.** There are two kinds of content here and they need different answers:

| Kind | Examples | Managed how, today | Realistic target |
|---|---|---|---|
| **Authored documents** | guides, blog posts, books, audio catalogue | External engine / Markdown files / JSON, built at deploy | **Stays a file pipeline.** Add the `content_overrides.json` overlay so status, visibility, order, tags and translation links are editable without source edits |
| **Operational records** | reviews, announcements, patients, purchases, memberships, assessments, consultations | Firestore + the admin pane already in `app.js` | **Full CRUD in the admin panel.** This is where "manage without editing source code" is actually achievable |

A headless CMS for the authored documents would mean rebuilding `tools/guides.js`, `tools/blog.js`,
`tools/library.js` and `tools/seo.js` — roughly 145 KB of code that encodes hard-won URL, date and SEO rules —
and re-homing an external Python engine. That cost is only worth paying when the owner is no longer the sole
author. See `DECISIONS.md` ADR-005.

---

## 7. Search

**Today: there is none.** `app.js` filters `audio.json` client-side inside the app. No cross-content search,
no search page, no query URLs.

**Extension — build-time inverted index, served as a static file.**

1. `tools/search.js` walks `ContentItem[]` and emits `public/search-index-<lang>.json`:
   token → posting list with a per-field weight (title > tags > category > description).
2. Bengali normalization is mandatory: `seo.nfc()` already exists because `audio.json` spells য় as one code point
   (U+09DF) while typed Bengali uses য + nukta. Every token goes through it, both at index time and query time.
3. Query runs **client-side** for the site (the index is small and cacheable) and inside `/api/search` for the
   app/mobile when the index grows past a few hundred KB.
4. Filters (type, category, tag, language) are facets on the same index — no second system.
5. Semantic search (Phase 9) re-uses the RAG embeddings and merges results by score; it does not replace keyword.

Why build-time: the corpus **is** build-time. A static site whose content only changes on deploy has no reason
to run a search server. See `DECISIONS.md` ADR-006.

---

## 8. AI / RAG assistant

**Today (`api/chat.js` + `app.js:~7212`):**
- Gemini 2.5 Flash, fixed system prompt (orthodox 'aqidah, sunnah protections, warnings against
  ta'weez/magicians/pirs, Bengali-or-English, mandatory medical disclaimer).
- Two call paths: the server proxy, **or** the client calling Gemini directly with a user-supplied key from
  `localStorage.gemini_api_key`.
- **No retrieval. No platform corpus. No citations. No auth. No rate limit.**

**Extension — a build-time RAG pipeline that matches the rest of the architecture.**

```
ContentItem[] ──▶ extract ──▶ (OCR where needed) ──▶ clean ──▶ chunk (~500 tok, overlap)
                                                                    │
                                              embed at build time ──┤
                                                                    ▼
                                            public/rag/<lang>/chunks.bin + meta.json
                                                                    │
  user question ──▶ /api/ask ──▶ embed query ──▶ cosine over chunks ──▶ top-k
                                                                    │
                                        prompt = question + top-k chunks + rules
                                                                    ▼
                                  answer + citation list (content id + slug + anchor)
```

Design commitments (each maps to a product rule):
- **Retrieval-first.** If retrieval returns nothing above a relevance floor, the assistant says it has no sourced
  answer and offers the contact path. It does not fall back to model knowledge. (R5, R6)
- **Every claim carries a citation** to a real `ContentItem` id. A citation that does not resolve to a live URL
  is a build failure, not a runtime surprise.
- **Sensitive-topic routing** happens before generation, not after. (R3, R4)
- **Human review seam**: chunks carry `reviewedBy`/`reviewedAt`. Material not yet reviewed can be excluded from
  retrieval by configuration, so the assistant's corpus can be tightened without a code change.

Why a static index and not a vector database: the corpus changes only when the site is rebuilt, ~900 items →
roughly 10k–30k chunks → a few tens of MB of float16, which a serverless function can load and scan in
well under the existing 20 s `maxDuration`. A vector DB adds a vendor, a bill, a secret and a failure mode for
capability this corpus does not need. **Trigger to revisit:** user-generated or continuously-updated material
entering the corpus, or the chunk count passing ~100k. See `DECISIONS.md` ADR-007.

**Before any of this: fix `/api/chat`.** Auth + per-user rate limit + origin allowlist. An unauthenticated,
uncapped LLM proxy on a public domain is a bill and an abuse vector.

---

## 9. Assessment system

**Today:** `SYMPTOM_GROUPS` and `CONDITIONS` in `app.js:6694–6724` — 19 hardcoded Bengali symptom items, each
carrying integer weights over four conditions (`nazar`, `sihr`, `jinn`, `hasad`). `showSymptomResult()` sums
selected weights, normalizes to a percentage of each condition's maximum, ranks, and renders — with a
disclaimer line. The ৳৩০০ "২৫০+ প্রশ্ন" diagnosis service is a **Google Form**, entirely outside the platform.

**Extension — the same algorithm, moved to data.**

```json
{
  "id": "quick-check", "lang": "bn", "version": 3, "status": "published",
  "disclaimer": "…", "escalationRules": [ { "if": ["self-harm"], "show": "crisis-block" } ],
  "sections": [ { "title": "…", "items": [ { "id": "q1", "text": "…", "weights": { "sihr": 2 } } ] } ],
  "bands": [ { "min": 60, "label": "…", "recommend": ["guide:ashik-jinn", "audio:S01", "topic:jinn"] } ]
}
```

- Questionnaires live in `assessments/*.json` (public, tracked) — a new questionnaire is a data file, not a deploy
  of new logic.
- Scoring runs in `/api/assessment` so the weights are not trivially readable and so results can be recorded.
- Results are stored as `users/{uid}.assessments[]` or an `assessments` collection (history requirement).
- Recommendations reference **real content ids** resolved against `ContentItem[]` — a broken reference fails the build.
- Output obeys R2/R3/R4: band labels describe *what to study*, never *what you have*.

The existing 19-item checker becomes `assessments/quick-check.bn.json` with identical weights — behaviour-preserving,
verifiable by comparing results before and after.

---

## 10. Consultation system

**Today:** `patients/{uid}` (one document per user, health data), submitted from an in-app form, plus an admin pane
in `app.js` (`loadPatientList`, `renderPatientList`, status filter, `adminNotes`). Delivery of the actual
consultation happens on **Facebook Messenger** — `buildWAMessage()` builds a summary and `contactAdmin()` copies it
for the user to paste. The ৳৮০০ package and ৳৩০০ diagnosis intake are **external Google Forms**.

**Extension — make the case a first-class record, keep the human workflow.**

| Piece | Design |
|---|---|
| Services | `services/*.json` content items (price, duration, what's included, language) |
| Request | `consultations/{id}` — `{ clientUid, serviceId, status, createdAt, assignedTo, scheduledFor }` |
| Case data | `consultations/{id}/case/{doc}` — health details, separated from the request so access can differ |
| Scheduling | availability as data (`consultants/{uid}.availability`), slot booking writes a `scheduledFor` |
| Payment | same manual TrxID flow as books initially; see §13 |
| Follow-up | append-only `consultations/{id}/notes` — consultant + client visible, per-note visibility flag |
| Access | rules: client (own), `role == 'consultant' && assignedTo == uid`, `role == 'admin'`. **No world-read, ever.** |

Migrate `patients/{uid}` by writing new cases to `consultations` and leaving the old collection readable —
it is one document per user and is already covered by account deletion (`purgeUserData`).

---

## 11. Reviews

**Today** (`docs/reviews.md`, `firestore.rules`, `tools/export_reviews.js`, `build.js:injectReviews`):
- Targets: books, `live-class`, course lessons (`course-live-c3`), plus `ruqyah-service` / website / app.
- Doc id `uid_target` — the structural guarantee that one person cannot write under another's name or stack
  ratings. Works because a Firebase uid never contains `_` and every target uses hyphens.
- Rating validated as an int 1–5 **in the rules**, not just in the UI.
- `improve` field is admin-only and never leaves the admin pane.
- **Publish-immediately; deletion is the only remedy, and it is admin-only.**
- The landing page shows a **build-time snapshot** (`reviews.json`, max 6 shown, 12 stored), and `aggregateRating`
  structured data is computed from the same numbers. Where there are no reviews, the markup is **omitted entirely** —
  because a rating Google shows must be a rating a visitor can see. If Firestore is unreachable at build time, the
  previous `reviews.json` is kept rather than publishing an empty list.
- Inside `/app` reviews are always live.

**Extension:** add `status: pending|published|removed` + a reporting path + a `verifiedClient` boolean derived from
`purchases`/entitlements (never from anything the client sends). Moderation goes to the `reviewer` role.
Anti-spam: the account gate stays the primary control; add a per-uid write rate limit in rules
(`request.time > resource.data.createdAt + duration.value(60,'s')`) before opening reviews to unauthenticated locales.

---

## 12. Payments

**Today:** manual Bangladeshi MFS. The user sends money to a merchant number, submits a TrxID in-app, a `purchases`
document is created, and:
- **Books** unlock immediately (user writes their own `courses[]`) and are revoked if the payment doesn't exist.
- **Memberships** require an explicit admin confirmation (admin writes `memberships.<id>.until`); renewal extends
  from `max(now, current expiry)` so paying early never loses days.
- Merchant numbers live in `payments.js`, copied **only into the web build**. `tools/audit-native.js` fails the
  native build if a price, buy button, purchase function or merchant number reaches the APK — this is Play
  anti-steering policy, enforced structurally rather than by promise.
- The owner reconciles against a Google Sheet MFS ledger through `/api/finance`.

**Extension:**
- International payments (Stripe/Paddle) are a **new, additive path**, not a replacement. They live behind
  `/api/checkout` + a webhook that writes entitlements server-side with a service-account key — which is the first
  genuine reason this project would need one outside `push.js`. Record that in `DECISIONS.md` when it happens.
- Any course or service sold outright needs the admin-only `courseGrants` field first (`docs/course.md` says so
  explicitly). Do not extend `courses[]`.
- The APK's zero-purchase-surface guarantee must survive: any new payment code goes inside `#web-only` markers and
  `tools/audit-native.js` gets a new needle in the same commit.

---

## 13. Notifications

**Today:** two independent paths, deliberately.
- **Firestore `announcements`** — the durable record, read by the in-app 🔔. Written **before** the push is sent,
  so a failed push still publishes the notice.
- **FCM topic `all`** — `POST /api/push`, admin-only, service-account JWT signed by hand in `api/push.js`
  (no `googleapis` dependency). No per-device token table, so nothing to clean up and no document listing who
  has the app. Title ≤100 chars, body ≤240 in the push itself.
- `FIREBASE_SERVICE_ACCOUNT` is **still not set** per `docs/README.md` — the endpoint answers 501 and the admin
  panel says so. Notices publish; pushes don't.

**Extension:** add topic segmentation (`lang-en`, `members`, `clients`) once locales exist; keep the
publish-before-send order; add per-user in-app notification state to the dashboard. Email transactional
notifications (consultation confirmed, session reminder) are a new dependency decision — record it when taken.

---

## 14. File / media storage

**Today — four tiers, deliberately different:**

| Tier | Where | Why |
|---|---|---|
| Free public files | `pdf/` (~134 MB) → `public/pdf/`, one-year immutable cache | Static, CDN-served, free |
| Paid book pages | `book_pages*/` — **gitignored**, reach production only via `includeFiles` | The repo is public; committing them would give the books away |
| Paid course bytes | `course_data/private.json`, `course_notes/` — **gitignored**, `includeFiles` | Same reason |
| Audio | **Not hosted.** `audio.json` links YouTube; `audio_files/` (~4 GB) is local-only and gitignored | Bandwidth and rights |

**The trap this creates is the single most dangerous operational fact in this repository.** `includeFiles` can
only bundle files present in the *deployment source*, and a git-integration deploy's source **is the repository** —
so a `git push` deploy ships the gated functions with nothing in them. `/api/book?meta=1` answers `{"pages":0}`,
every buyer gets an empty reader, and the build log says nothing. This happened to শেখার শিল্প.
`vercel.json` sets `git.deploymentEnabled.master = false` to make it structurally impossible.
**Deploy only with `vercel --prod` from a working copy.**

A second form of the same trap: adding `course_data/` or `course_notes/` to `.vercelignore` (they look like the
already-listed `book_notes/`) removes them from the deployment source and `/api/course` returns 404 for every note,
silently. `.vercelignore` carries a comment saying exactly this. Do not "tidy" it.

**Extension:** when paid media outgrows `includeFiles` (or English-language media is added), move to
Cloudflare R2 / Bunny with signed URLs minted by the existing gated functions. `api/course.js`'s `host` field is
already the seam for this and says so. Until then, no new storage vendor.

---

## 15. Analytics

**Today: none.** No Google Analytics, no gtag, no Plausible, no PostHog, no Firebase Analytics anywhere in
`landing.html`, `index.html`, `app.js` or the builders. (`tools/seo.js` matches only on the string "analytics"
inside a comment.) The owner currently has **no visibility into traffic, funnel or drop-off.**

**Extension:** Vercel Web Analytics or a self-hosted privacy-preserving counter, added to the **web build only**
(inside `#web-only` markers) so the APK's Data safety declaration in `docs/play-listing.md` does not change.
Anything added to the native build must be reflected in the Play Data safety form in the same commit.

---

## 16. SEO — a real, working system. Describe it; do not replace it.

`tools/seo.js` (36 KB) is the single source of SEO truth and **its governing rule is that nothing may invent a fact.**

| Piece | Implementation |
|---|---|
| Identity | `SITE`, `SITE_NAME` (bn), `SITE_NAME_EN`, `AUTHOR`, `ORG_ID`/`SITE_ID`/`AUTHOR_ID` `@id` anchors, `LOGO`, `FB_PAGE`, `FB_RAQI` |
| Page head | `head()`, `NAV`, `FOOT`, `CSS`, `crumbs()` — every generated page shares one shape |
| Topic registry | `TOPICS` — 11 hubs (`jadu`, `bad-nazar`, `jinn`, `git-o-badhon`, `waswasa`, `osukh-o-shifa`, `suroksha-o-amol`, `biye-o-poribar`, `rizik-o-kaj`, `ruqyah-guide`, `porashona`). Membership is **explicit lists, never text matching**, so a hub can only list what was deliberately put there |
| Cross-linking | `topicsForGuide/Audio/Pdf/Post` + `relatedHtml()` — every page carries an "এই বিষয়ে আরও" block |
| Honest dates | `contentDates(key, content)` hashes the rendered content into `tools/content-dates.json`; `modified` moves **only when the hash changes**. `saveDates()` drops rows for pages that no longer build, so `datesOf()` can never vouch for a dead URL |
| Sitemaps | Sitemap index + 6 section files: `pages`, `audio`, `guides`, `pdf`, `blog`, `topics` |
| Structured data | Organization / WebSite / Person / BreadcrumbList; `FAQPage` built **from the rendered `<details>` markup**, not a second copy of the text; `AggregateRating` only where real reviews exist |
| URL policy | Track URLs are `/audio/<CODE>/` — flat, because codes never change but categories do, and a URL that moves loses its ranking. PDF landings are `/guides/pdf/<slug>/`, deliberately not under `/pdf/` (immutable cache) or `/guides/<slug>/` (name collision with the HTML documents) |
| Normalization | `nfc()` — `audio.json` spells য় as U+09DF, typed Bengali as য + nukta; anything compared across sources is normalized first |

`vercel.json` completes it: trailing-slash redirects for `audio|guides|blog|topics`, `/index.html → /` permanent,
per-path cache headers, and a `Link: rel="canonical"` header on raw PDFs pointing at their landing page.

**Extension for i18n:** add `hreflang` emission to `head()` (driven by `ContentItem.translationOf`), a locale
segment to the sitemap index, and `lang` on the `<html>` element from the item's language. That is the whole change —
the system was built to absorb it.

---

## 17. Internationalization

**Today:** `lang="bn"` on both roots, zero `hreflang`, all content Bengali. `SITE_NAME_EN` exists but is unused
for routing.

**Extension — locale as a URL prefix, Bengali unprefixed:**

```
/guides/ashik-jinn/        bn (unchanged, forever)
/en/guides/ashik-jinn/     en
/ar/guides/ashik-jinn/     ar (later)
```

- `ContentItem.lang` + `ContentItem.translationOf` drive `hreflang` and the language switcher.
- `tools/seo.js` gains a locale-aware `head()`, `NAV` and `FOOT`; builders take a locale parameter.
- UI strings move out of `landing.html`/`index.html` into `i18n/<lang>.json` **only for new or touched surfaces** —
  a full string extraction of a 122 KB hand-written HTML file is not worth it and is not required by any
  named requirement.
- RTL (Arabic, Urdu) needs `dir="rtl"` and logical CSS properties. `styles/01-base.css` is the one place custom
  properties are defined, so this is a bounded change — but it is a Phase 11 change, not a Phase 2 one.

**Do not** design any new data structure with a single-language assumption. Every new Firestore document and every
new JSON content file carries `lang` from day one, even while `bn` is the only value.

---

## 18. Security

**Working controls today (keep all of them):**
- Server-side authorization only. `app.js` hiding the admin FAB is cosmetic and `api/finance.js` says so in a
  comment — the function is the control.
- Verified email off the token, never a client-supplied field.
- Secrets exclusively in Vercel environment variables: `TELEGRAM_LINKS`, `SHEET_API_URL`, `SHEET_API_TOKEN`,
  `FIREBASE_SERVICE_ACCOUNT`, `GEMINI_API_KEY`. None in the (public) repository.
- Two-token separation on the finance proxy: the read token cannot write to the ledger.
- Strict parameter allowlisting in `api/finance.js` — `req.query` is never forwarded wholesale, and `token` is set
  last so nothing can shadow it.
- `esc()` on every ledger field before `innerHTML`, because counterparty names come from raw SMS and the admin is
  the highest-privilege session.
- Firestore rules in the repository, reviewable, with an explicit default-deny tail.
- `Cache-Control: private, no-store` on every per-user response; `X-Robots-Tag: noindex` on `/api/*`.
- Account deletion deletes `users`, `patients` and `reviews`, and **anonymizes** `purchases` (transaction records
  are retained for reconciliation, and `privacy.html` discloses exactly that).

**Open risks, named:**

| Risk | Nature | Where it's handled |
|---|---|---|
| `/api/chat` unauthenticated + uncapped + CORS `*` | Bill/abuse | ROADMAP Phase 1 |
| Single hardcoded admin email, 4 copies | Availability + drift | ROADMAP Phase 5 (claims) |
| A leaked Firebase ID token grants ~1 h of full read | Accepted, documented in `docs/finance.md` | Bearer tokens have no revocation before expiry |
| `/api/finance` is publicly discoverable | Accepted; `noindex` is the only mitigation | Auth is the real control |
| Per-instance rate limits are throttles, not security | Accepted, stated in code | — |
| Personal financial data behind the same origin as patient data | Accepted; "moving it later is cheap" | — |
| Paid page bytes exist only on one machine | **Data loss** — no documented off-machine backup of `book_pages*/`, `course_notes/` | ROADMAP Phase 1 |
| Keystore password on one machine only | **App can never be updated if lost** | `docs/release.md`, `docs/README.md` |

---

## 19. Monitoring and observability

**Today: build-time only. There is no runtime observability at all.**

| Exists | What it proves |
|---|---|
| `npm run build` / `build:native` | Markers balanced, CSS complete, `firebase-config.js` has an apiKey, native < 20 MB |
| `tools/audit-native.js` | No price/buy-button/merchant-number/purchase-function in the APK |
| `tools/check-android.js` | Gradle provider flags and capacitor provider list agree |
| `tools/smoke.js native` / `public` | Boots the **built** output in jsdom and asserts on the real DOM. Caught a `window.Notification` dereference that killed startup inside a try block |
| `tools/smoke-course.js` | Course feature end-to-end in jsdom |
| `tools/check_course_data.js` | Blocks deploy on placeholder rows in `course_data` |

**Missing, in priority order:**
1. **A post-deploy synthetic check.** Nothing verifies after a deploy that `/api/book?book=<id>&meta=1` returns
   `pages > 0` — the exact silent failure that has already happened once. A 20-line script hitting each gated
   endpoint would have caught it.
2. **A rules-drift check.** Nothing compares the deployed Firestore rules to `firestore.rules`.
3. **Error capture.** No Sentry, no log drain. A function throwing in production is visible only in Vercel's
   runtime logs, which nobody watches.
4. **Analytics** (see §15).

**Extension:** `tools/verify-prod.js` (item 1) is the highest value per line of code in this entire document and
belongs in Phase 1. Items 2–4 follow the same principle already in the codebase: *fail loudly rather than
discover it at upload.*

---

## 20. Backup and recovery

| Asset | Backed up? | Recovery |
|---|---|---|
| Tracked source | Yes — git + `origin/master` | `git checkout` |
| Firestore data | **Not documented.** No export schedule found | Firebase console export must be set up |
| Firestore rules | Yes — in repo + Firebase console version history (the pre-2026-09-02 ruleset is retrievable) | `npm run deploy:rules` or console rollback |
| Paid book pages / course notes | **No** — gitignored and local-only. The working copy *is* the backup | Must be fixed |
| Audio files (~4 GB) | Local only; source is YouTube | Re-downloadable |
| Android keystore | File on Google Drive ("Self Ruqyah — Android keystore backup"), **password on one machine only** (`A:\keys\CREDENTIALS.txt`) | Password must go into a password manager |
| Vercel env vars | Not documented anywhere as a list | Should be recorded (names, not values) |

---

## 21. Deployment

```
  Web:     npm run check           → build + build:native + audit:native + check:android + smoke
           vercel --prod           ← FROM A WORKING COPY, NEVER FROM GIT
  Rules:   npm run deploy:rules    ← separate system; editing firestore.rules changes nothing live
  Native:  npm run sync            → build:native + audits + npx cap sync android
           android/gradlew bundleRelease (local) or the "Release AAB" GitHub workflow (tag push)
```

- `vercel.json` sets `git.deploymentEnabled.master = false`. This is load-bearing (see §14).
- CI: `.github/workflows/build-apk.yml` (debug APK, secret-free) and `release-aab.yml` (signed AAB; checks four
  signing secrets exist, enforces the 20 MB cap, runs the policy audit, and deletes the keystore afterwards).
- `versionCode`, once used on Play, can never be reused — not even for a discarded internal build.

**Rollback:** Vercel keeps every deployment; promoting a previous one is instant and is the first move for any
site-level regression. Firestore rules roll back through console version history. Android rolls back by halting a
staged rollout — there is no un-publishing an installed APK, only a new versionCode.

---

## 22. Scaling strategy

Ordered by when each actually binds:

1. **Static pages** — Vercel CDN. ~900 pages today; 10× is a non-event. **Not a bottleneck.**
2. **Firestore reads per session** — `app.js` reads the user doc, reviews and announcements on load. At scale,
   batch and cache; `courseProgress` writes are already throttled to once per 30 s for exactly this reason.
3. **Identity Toolkit round-trip per gated request** — the current API latency floor. Mitigation (only when
   measured): in-function verified-token cache, or local JWT verification against Google's public keys.
4. **Gemini spend** — unbounded today. Auth + quota per user is Phase 1, not a scaling concern for later.
5. **`includeFiles` bundle size** — grows with every paid book. Move to object storage via the `host` seam.
6. **`app.js` size** — a developer-throughput bottleneck long before it is a runtime one. Module islands (§2).
7. **Search / RAG index size** — static files served from the CDN; the function-side scan is the limit.
   Revisit at ~100k chunks.

**Nothing on this list requires a new database, a new framework, or a new hosting provider.**
