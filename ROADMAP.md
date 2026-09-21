# ROADMAP

Phased, incremental, **every phase ends in a working deployed system.** Nothing here proposes
"implement everything at once", and nothing here proposes a rewrite.

Legend: **DONE** = verified on disk today · **PARTIAL** = real implementation exists but is incomplete ·
**NEW** = does not exist · **BLOCKED** = waiting on something outside the code.

> Each phase's "Evidence" lines are the files I actually read. If a future session disagrees with a DONE
> claim, check the named file before rewriting the claim.

---

## Phase 0 — Safety net (do this first, it is small)

Not in the owner's original phase list, but everything after it is riskier without it.

| # | Item | Status | Why now |
|---|---|---|---|
| 0.1 | **Harden `/api/chat`**: require a Firebase ID token, per-uid rate limit, replace `Access-Control-Allow-Origin: *` with an origin allowlist | **NEW** | Today it is an unauthenticated, uncapped LLM proxy on a public domain spending the owner's `GEMINI_API_KEY`. Every caller on the internet can use it. |
| 0.2 | **`tools/verify-prod.js`** — after a deploy, assert `/api/book?book=<id>&meta=1` returns `pages > 0` for all three books, `/api/course` returns the catalog, `/api/membership` returns 401 unauthenticated | **NEW** | The exact silent failure that already shipped একবার (শেখার শিল্প → empty reader, nothing in the build log). |
| 0.3 | **Off-machine backup of the gitignored paid bytes** (`book_pages*/`, `book_html_yasin/`, `course_notes/`, `course_data/private.json`) | **NEW** | These are gitignored *and* local-only. The working copy is currently the only copy. |
| 0.4 | **Keystore password into a password manager** | **BLOCKED (owner)** | File is on Drive; password is on one machine (`A:\keys\CREDENTIALS.txt`). Losing it means the app can never be updated. |
| 0.5 | **Record the Vercel env var names** in `docs/` (names only, never values) | **NEW** | `TELEGRAM_LINKS`, `SHEET_API_URL`, `SHEET_API_TOKEN`, `FIREBASE_SERVICE_ACCOUNT`, `GEMINI_API_KEY`. Nothing currently lists them in one place. |

**Ends in:** same site, same features, but abuse-resistant and verifiable after deploy.
**Dependencies:** none. 0.1 and 0.2 are independent of each other.

---

## Phase 1 — Foundation + design system

| # | Item | Status | Evidence / Note |
|---|---|---|---|
| 1.1 | Build system, two targets, marker stripping with validation | **DONE** | `build.js` — `assertMarkersWellFormed()`, `new Function()` parse check, 20 MB native cap |
| 1.2 | CSS architecture with a token layer | **DONE** | `styles/01-base.css`…`07-course.css`, order-dependent, inlined at build, `<link>`-vs-disk cross-check |
| 1.3 | Brand assets, icons, splash, self-hosted fonts | **DONE** | `tools/make_brand_assets.js`, `icons/`, `fonts/`, `npm run brand` |
| 1.4 | PWA shell + service worker with a network-first strategy for changing pages | **DONE** | `service-worker.js` v17 |
| 1.5 | Test/verify harness | **DONE** | `npm run check` = build ×2 + `audit-native` + `check-android` + `smoke` ×3 |
| 1.6 | **`tools/content.js`** — normalize all content sources into one `ContentItem[]` | **DONE (2026-09-21)** | The keystone for Phases 3, 9, 11. See `ARCHITECTURE.md` §4.3 and `DECISIONS.md` ADR-017. 979 items (389 audio + 169 guide + 104 pdf + 315 post + 2 `/en/` page), zero migration of the 5 source files. **Not yet covered:** `COURSES`/`BOOKS` (still hardcoded in `app.js` — see 3.7-style note) |
| 1.7 | **`content_overrides.json`** — overlay for `lang`, `status`, `visibility`, order, `translationOf` | **DONE (2026-09-21)** | Lets the owner unpublish/reorder/retag without editing HTML. Currently `{}` — no overrides in use yet |
| 1.8 | **Design tokens audited for RTL and for a second locale** (logical properties where cheap) | **NEW** | Bounded because `01-base.css` is the only place properties are defined |

**Ends in:** identical output, plus a normalized content view every later phase consumes.
**Critical path:** 1.6 → (3.x, 9.x, 11.x). Build it before anything that needs a content list.

---

## Phase 2 — Public website

| # | Item | Status | Evidence |
|---|---|---|---|
| 2.1 | Marketing landing page with FAQ, products, counts filled from data (no hand-typed numbers) | **DONE** | `landing.html` + `build.js:injectLanding()` `@@N_…@@` placeholders |
| 2.2 | Blog: 316 Markdown posts → static pages | **DONE** | `posts/*.md` → `tools/blog.js` → `public/blog/` (321 dirs built) |
| 2.3 | Topic hubs with explicit membership | **DONE** | `tools/seo.js` `TOPICS` (11 hubs) → `public/topics/` |
| 2.4 | Full SEO system: head, breadcrumbs, JSON-LD, honest dates, sitemap index | **DONE** | `tools/seo.js`, `tools/content-dates.json`, 6 section sitemaps |
| 2.5 | Legal: privacy policy + in-app and web account deletion | **DONE** | `privacy.html`, `privacy.html#delete-account`, `purgeUserData()` |
| 2.6 | **Analytics** — none exists anywhere | **NEW** | Web build only, inside `#web-only`, so the Play Data safety form is unaffected |
| 2.7 | **Site-wide search UI + `/search` page** | **NEW** | Depends on Phase 3.6 index |
| 2.8 | **English landing + core pages under `/en/`** | **PARTIAL — foundation DONE (2026-09-21)** | Homepage + Start Here shipped without waiting on 1.6 (`tools/content.js` doesn't exist yet — `tools/en.js` reads `catalog` counts directly instead). Core content pages (Knowledge Library, Video Academy, etc.) still block on real English content — see 11.7 |

**Ends in:** the current site plus measurement, search, and a first English surface.
**Depends on:** 1.6 (for 2.7/2.8).

---

## Phase 3 — Content library

| # | Item | Status | Evidence |
|---|---|---|---|
| 3.1 | 389 audio tracks, 14 categories, per-track crawlable pages | **DONE** | `audio.json`, `tools/library.js` → 404 dirs under `public/audio/` |
| 3.2 | Real durations/upload dates from YouTube, never invented | **DONE** | `audio_meta.json` (369 entries), `tools/fetch_audio_meta.py` |
| 3.3 | 104 legacy PDF guides with landing pages, previews, page counts, sha256 | **DONE** | `pdf_list.json`, `pdf_meta.json`, `tools/make_pdf_previews.py` |
| 3.4 | 169 HTML Ruqyah documents published as real pages with breadcrumbs, related blocks, watermarked PDFs | **DONE / IN FLIGHT** | `guides_src/` (121 committed, 48 untracked — owner's current work), `tools/guides.js`, `tools/watermark_pdfs.py`, `tools/sync_guides.py` |
| 3.5 | Audio recategorisation applied | **DONE** | Live category counts match the "after" table in `docs/audio-recategorise.md` exactly (জাদু 37, জ্বিন 29, গিঁট 27, বদনজর 22, অসুখ 20, আমল 15…) |
| 3.6 | **Build-time search index** (`tools/search.js` → `search-index-<lang>.json`), NFC-normalized | **NEW** | `seo.nfc()` already exists for the য়/য+nukta problem |
| 3.7 | **Duas / adhkar / amal as first-class content items** | **PARTIAL** | `DUAS` and `TASBEEH_TYPES` are hardcoded in `app.js` (lines ~4889, ~4961). Move to data files under the Phase 1.6 model |
| 3.8 | **Qur'an / Hadith reference type** with verifiable citations | **NEW** | Required by R5; the RAG pipeline depends on it |

**Ends in:** everything already published, plus searchable, plus duas/adhkar no longer hardcoded.

---

## Phase 4 — Video platform

| # | Item | Status | Evidence |
|---|---|---|---|
| 4.1 | Gated lesson delivery: free catalog, authenticated video id + notes | **DONE** | `api/course.js`, `course_data/catalog.json` (1 course, 6 lessons) |
| 4.2 | Video ids kept out of the public repo, revocable on leak | **DONE** | `course_data/private.json` gitignored, reaches prod only via `includeFiles`; `host` field is the seam for moving off YouTube |
| 4.3 | Watermarked session notes (HTML + PDF), gated | **DONE** | `course_notes/course-live/` (4 PDFs on disk), `tools/watermark_course_notes.py` |
| 4.4 | Progress tracking, throttled | **DONE** | `users/{uid}.courseProgress`, localStorage 5 s / Firestore 30 s |
| 4.5 | Per-lesson reviews | **DONE** | target id pattern `course-live-c<n>` |
| 4.6 | Content completion | **PARTIAL** | 6 lessons defined; 3 have video, 4 have notes. `docs/HANDOFF-course.md` lists the 3 missing note PDFs and notes that days 1–8 exist only as Telegram audio |
| 4.7 | Verify the three YouTube videos are actually Unlisted | **BLOCKED (owner)** | `docs/HANDOFF-course.md` item 1 — cannot be checked from code |
| 4.8 | **Course structure beyond one course** (paths, prerequisites, certificates) | **NEW** | `catalog.json` already has `modules`; extend rather than replace |

**Ends in:** the course area fully populated and a second course addable as data.

---

## Phase 5 — User accounts

| # | Item | Status | Evidence |
|---|---|---|---|
| 5.1 | Firebase Auth: Google + email/password, web and native, one session | **DONE** | `firebase-config.js`, `skipNativeAuth: true` + `signInWithCredential` |
| 5.2 | Phone and Facebook login written, tested, flag-disabled | **DONE (intentionally off)** | `window.PHONE_LOGIN_ENABLED`, `window.FACEBOOK_ENABLED`; `docs/facebook-login.md`, `docs/firebase-android.md` §৩ক |
| 5.3 | Profile, favourites, recently played, entitlements, progress | **DONE** | `users/{uid}` |
| 5.4 | Account deletion with disclosed retention | **DONE** | `purgeUserData()` + `privacy.html` |
| 5.5 | **Custom-claim roles** (`editor`, `consultant`, `reviewer`, `admin`, `superadmin`) | **NEW** | **This is the gate for Phases 6, 7 and 8.** Migrate non-breaking: `role == 'admin' \|\| email == ADMIN_EMAIL`, then remove the four hardcoded copies in one commit |
| 5.6 | **Second super-admin** | **NEW** | Today a lost Google account means a code change + site deploy + rules deploy to recover admin |
| 5.7 | **`api/_shared/auth.js`** — do the deduplication *here*, as part of 5.5 | **NEW** | Not as a standalone refactor; `_`-prefixed dirs are not routed as endpoints |
| 5.8 | **Full user dashboard** (bookmarks, assessment history, consultation history, downloads, preferences) | **PARTIAL** | Pieces exist scattered; assemble as one dashboard surface |

**Critical path:** 5.5 blocks 6.4, 7.x and 8.x. Do it before the assessment/consultation work, not after.

---

## Phase 6 — Assessment system

| # | Item | Status | Evidence |
|---|---|---|---|
| 6.1 | Weighted symptom checker with disclaimer | **PARTIAL (hardcoded)** | `app.js:6694–6724` — 19 items, 4 conditions (`nazar`/`sihr`/`jinn`/`hasad`), percentage ranking |
| 6.2 | **Move to `assessments/*.json`** — items, weights, bands, disclaimers, escalation rules as data | **NEW** | Behaviour-preserving first step: port the existing 19 items verbatim and diff the results |
| 6.3 | **`/api/assessment`** — scoring server-side, result persisted to history | **NEW** | |
| 6.4 | **Recommended resources resolve to real `ContentItem` ids**; a dangling reference fails the build | **NEW** | Depends on 1.6 |
| 6.5 | **Escalation blocks** for self-harm / child safety / severe untreated illness, shown *before* any Ruqyah recommendation | **NEW** | Product rule R4 |
| 6.6 | **The ৳৩০০ "250+ question" diagnosis intake** moves from Google Forms into the platform | **NEW** | Currently `formLink: https://forms.gle/…` in `app.js` `COURSES` |
| 6.7 | Assessment history in the dashboard | **NEW** | |

**Rule that governs all of 6.x:** results say *what to study*, never *what you have* (R2).

---

## Phase 7 — Consultation system

| # | Item | Status | Evidence |
|---|---|---|---|
| 7.1 | Health intake form → Firestore, admin list with status + notes | **DONE** | `patients/{uid}`, `loadPatientList()`, `renderPatientList()`, status filter, `adminNotes` |
| 7.2 | Delivery via Facebook Messenger hand-off | **DONE (manual)** | `buildWAMessage()` + `contactAdmin()` |
| 7.3 | **`services/*.json`** — service catalogue as content | **NEW** | Replaces hardcoded `COURSES` entries for services |
| 7.4 | **`consultations/{id}`** + `case/` subcollection, strict rules | **NEW** | Depends on 5.5 |
| 7.5 | **Scheduling + availability** | **NEW** | `consultants/{uid}.availability` |
| 7.6 | **Status pipeline, follow-ups, client-visible history** | **NEW** | |
| 7.7 | **Consultant role UI** (assigned cases only) | **NEW** | Depends on 5.5 |

---

## Phase 8 — Admin panel

| # | Item | Status | Evidence |
|---|---|---|---|
| 8.1 | Admin pane: patients, purchases, reviews, announcements | **DONE** | `app.js` `adminView` = `'patients' \| 'purchases' \| 'reviews'`, admin FAB gated on `ADMIN_EMAIL` |
| 8.2 | Finance tab reading the MFS ledger through a server proxy | **DONE** | `api/finance.js` + `docs/finance.md`; web-build only, triple-stripped from the APK, audited by `tools/audit-native.js` |
| 8.3 | Push/notice publishing | **DONE (code)** / **BLOCKED (config)** | `api/push.js`; `FIREBASE_SERVICE_ACCOUNT` not yet set per `docs/README.md` — notices publish, pushes 501 |
| 8.4 | **Content status/visibility/order editing** via `content_overrides.json` | **NEW** | The realistic "manage content without editing source" for authored documents |
| 8.5 | **Review moderation queue + reporting** | **NEW** | Today reviews publish instantly and deletion is the only remedy |
| 8.6 | **Assessment + service + consultation management** | **NEW** | Depends on 6.x, 7.x |
| 8.7 | **User + role management** | **NEW** | Depends on 5.5 |
| 8.8 | **AI knowledge-source management** (which content is in the RAG corpus, review state) | **NEW** | Depends on 9.x |

**Honest scope note:** a full headless CMS for guides/blog/audio is **not** on this roadmap. See
`DECISIONS.md` ADR-005 — the guides come from an external Python engine, and rebuilding `tools/guides.js`,
`tools/blog.js`, `tools/library.js` and `tools/seo.js` is a cost only worth paying when the owner stops being
the sole author.

---

## Phase 9 — AI / RAG

| # | Item | Status | Evidence |
|---|---|---|---|
| 9.1 | LLM assistant with a Ruqyah system prompt, server proxy + optional user key | **PARTIAL** | `api/chat.js` (Gemini 2.5 Flash) + `app.js:callGeminiAPI()`. **No retrieval, no citations, no auth** |
| 9.2 | Auth + rate limit on the assistant | **NEW** | Already listed as Phase 0.1 — do it there |
| 9.3 | **Build-time pipeline**: extract → OCR where needed → clean → chunk → embed → `public/rag/<lang>/` | **NEW** | Depends on 1.6 |
| 9.4 | **`/api/ask`** — embed query, cosine over chunks, top-k, generate | **NEW** | Static index; no vector DB (ADR-007) |
| 9.5 | **Retrieval-first behaviour**: below the relevance floor, the assistant says it has no sourced answer | **NEW** | R5, R6 |
| 9.6 | **Every claim carries a resolvable citation**; unresolvable citation = build failure | **NEW** | |
| 9.7 | **Sensitive-topic routing before generation** | **NEW** | R3, R4 |
| 9.8 | **Human review state on chunks** (`reviewedBy`, `reviewedAt`); unreviewed material excludable by config | **NEW** | R6 |
| 9.9 | Semantic search merged into the keyword results | **NEW** | Re-uses 9.3's embeddings |

---

## Phase 10 — Payments

| # | Item | Status | Evidence |
|---|---|---|---|
| 10.1 | Manual bKash/Nagad/Rocket TrxID flow, books unlock immediately, memberships admin-confirmed | **DONE** | `purchases`, `users.courses[]`, `users.memberships{}`, renewal from `max(now, expiry)` |
| 10.2 | Merchant numbers structurally absent from the APK | **DONE** | `payments.js` web-only + `tools/audit-native.js` FORBIDDEN needles |
| 10.3 | Ledger reconciliation | **DONE** | `api/finance.js` |
| 10.4 | **`courseGrants` admin-only field** before any course is sold outright | **NEW** | `docs/course.md` warns explicitly: `courses[]` is user-writable by design and must not be used for a video course |
| 10.5 | **International payments** (Stripe/Paddle) as an additive path + webhook writing entitlements server-side | **NEW** | First genuine need for a service-account key outside `push.js` — record it in `DECISIONS.md` when taken |
| 10.6 | **Orders/receipts in the user dashboard** | **NEW** | |
| 10.7 | Resolve the ৳৪৯০ / ৳৮০০ product overlap | **BLOCKED (owner)** | `COURSES` carries both; `live-class` is marked LEGACY and filtered from display but must not be deleted |

**Non-negotiable:** every new payment surface goes inside `#web-only` markers and gets a matching needle in
`tools/audit-native.js` in the same commit.

---

## Phase 11 — Multilingual

| # | Item | Status | Evidence |
|---|---|---|---|
| 11.1 | Current state: Bengali only | **N/A** | `lang="bn"` both roots, zero `hreflang` — superseded 2026-09-21, see 11.1b |
| 11.1b | **`/en/` foundation: homepage + Start Here** | **DONE (2026-09-21)** | `tools/en.js` — `public/en/`, `public/en/start-here/`. Homepage states real catalogue counts only (`libraryFacts()`, read from `catalog`, never hand-typed); every not-yet-built module (Knowledge Library, Video Academy, Educational Assessment, Consultation, AI Assistant, Dashboard) shown as a link-less "Planned" card. Start Here restates `PROJECT_MASTER_SPEC.md` §5's four-way safety split (educational / guidance / assessment / consultation) in English, with zero Qur'an/Hadith citations of its own — cites nothing so it cannot fabricate anything. Deployed to production. |
| 11.2 | **Locale prefix routing** (`/en/…`), Bengali stays unprefixed forever | **DONE (2026-09-21)** | ADR-002. `build.js` calls `tools/en.js` after `buildLibrary`, web-target only, additive |
| 11.3 | **`hreflang` + `lang` emission** | **PARTIAL (2026-09-21)** | `/en/` pages emit `hreflang="bn"`/`"en"`/`"x-default"` pointing at the bn homepage. **Reverse tag on the bn side not yet added** — `landing.html` had an unrelated owner edit in flight when this shipped and was left untouched; add the reciprocal `<link>` there once that edit lands. `tools/seo.js`'s shared `NAV`/`FOOT` (blog/guides/audio/topics/pdf/404) now link to `/en/`; `index.html` (built straight from `landing.html`, not through `NAV`/`FOOT`) does not yet — same blocker |
| 11.4 | **Locale segment in the sitemap index** | **DONE (2026-09-21)** | `sitemap-en.xml`, 2 URLs, via the existing `seo.sitemapAdd('en', …)` |
| 11.5 | **`i18n/<lang>.json` for new/touched surfaces only** | **NEW** | Not needed yet at 2 pages; revisit once a third `/en/` page exists |
| 11.6 | **RTL** (`dir="rtl"`, logical CSS properties) for Arabic/Urdu | **NEW** | Bounded — `01-base.css` is the single token source |
| 11.7 | English content production for the real modules (Knowledge Library, Video Academy, Assessment, Consultation, AI Assistant) | **BLOCKED (owner)** | Translation vs. original English changes the editorial workload by an order of magnitude — see `PROJECT_MASTER_SPEC.md` §8 Q3. Also gates whether Consultation can honestly claim English-language availability at all (raqi's own language capacity is an owner fact, not an engineering one) |

---

## Phase 12 — International scaling

| # | Item | Status | Note |
|---|---|---|---|
| 12.1 | Static pages on the CDN | **DONE** | ~900 URLs; 10× is a non-event |
| 12.2 | **Measure before optimizing the API latency floor** (one Identity Toolkit round-trip + one Firestore REST read per gated request) | **NEW** | Then: in-function token cache, or local JWT verification against Google's public keys |
| 12.3 | **Move paid media to object storage** via `api/course.js`'s `host` seam | **NEW** | When `includeFiles` outgrows itself |
| 12.4 | **Firestore read batching + caching in `app.js`** | **NEW** | `courseProgress` is already throttled for exactly this reason |
| 12.5 | **Error capture + log drain** | **NEW** | There is none today |
| 12.6 | **Firestore scheduled export** | **NEW** | No backup schedule found |
| 12.7 | Multi-region / CDN for media | **NEW** | Only when measured |

---

## Android / Play (runs alongside, not a numbered phase)

| Item | Status | Evidence |
|---|---|---|
| Capacitor 7 Android shell, `com.selfruqyah.app`, "Self Ruqyah" | **DONE** | `capacitor.config.json`, `android/` |
| Signed AAB, keystore, Firebase Android app, `google-services.json` | **DONE** | `docs/README.md` (2026-09-01/02) |
| Play policy compliance: no prices/purchase surface in the APK | **DONE** | `tools/audit-native.js`, `docs/release.md` §৩ক |
| Store listing, App content, Data safety (Health info declared **yes**) | **DONE** | `docs/play-listing.md` |
| Closed testing (Alpha) 1.0.1(2) published | **DONE 2026-09-03** | `docs/play-listing.md` §8 |
| 12+ testers opted in for 14 consecutive days → apply for production | **BLOCKED (owner)** | 99 clean emails collected; the clock resets if the count drops below 12 |
| Play App Signing SHA added back to Firebase + `google-services.json` re-downloaded | **PENDING** | `docs/firebase-android.md` §৬ — the single most common cause of "Google login worked on my phone but not from Play" |

---

## The single first recommended milestone

**Phase 0.1 + 0.2 together, shipped as one change:**

> Put authentication and a per-user rate limit on `/api/chat`, and add `tools/verify-prod.js` that asserts the
> three gated endpoints actually return real content after a `vercel --prod`.

Why this one, ahead of everything the owner is more excited about:

- **0.1 closes a live, open, metered hole.** `/api/chat` is on a public domain with `CORS: *`, no auth and no
  quota, spending the owner's Gemini key. It is the only endpoint in the repo with no gate of any kind, and it
  is the foundation the whole Phase 9 RAG assistant will be built on — hardening it later means hardening it twice.
- **0.2 costs about twenty lines and closes the failure mode that has already cost real money.** A git-based
  deploy once shipped a book with zero pages and nothing said so. Nothing today would catch a repeat.
- **Both are independent of every architectural decision in this document.** They can be done today, they change
  no URL, no data model and no user-visible behaviour, and they make every later phase safer to ship.
- **Neither requires an owner decision.** Q1–Q5 in `PROJECT_MASTER_SPEC.md` §8 can stay open.

Immediately after: **Phase 1.6 (`tools/content.js`)** — **done, 2026-09-21** — because search, RAG, the admin
overlay and i18n all consume it, and building it three times would have been the most expensive mistake
available here. Next up per this same logic: **7.x (search)**, the first real consumer of `ContentItem[]`.
