# DECISIONS — architecture decision log

One entry per significant architectural choice. Format: **Decision / Context / Options considered / Choice /
Rationale / Date.**

ADR-008 onward record decisions that were made *before* this log existed and are reconstructed from the code and
`docs/*.md`; they are marked **(retrospective)** and their dates are the dates of the change, not of this entry.

Decision rule applied throughout: **reliability > security > maintainability > scalability > development speed > cost.**

---

## ADR-001 — Keep the static-site + Firebase + Vercel-functions + Capacitor stack

**Context.** The owner wants to grow this into an international, multi-role, AI-assisted platform potentially
serving very large numbers of users. The obvious modern answer is a framework rewrite. The existing system is a
zero-dependency Node build script producing static HTML, a 7,675-line global-scope `app.js`, six dependency-free
serverless functions, Firestore, and a Capacitor Android shell that is already in Play closed testing.

**Options considered.**

| | Option A — extend the current stack | Option B — Next.js + Postgres/Neon + headless CMS |
|---|---|---|
| Cost | Incremental; each phase ships | Rewrite of `build.js` and `tools/*` (~145 KB encoding URL, date, SEO and policy rules), `app.js`, the Capacitor `webDir` contract, the service-worker strategy |
| Risk to SEO | Zero — no URL moves | ~900 indexed URLs re-derived; canonical/sitemap/date system rebuilt |
| Risk to the Android app | Zero — `native/` target unchanged | No direct equivalent of a static `webDir` without a separate export path; a published closed-test build would need re-qualification |
| Risk to revenue flows | Zero | Books, membership, course gating, MFS reconciliation all re-implemented |
| Benefit | None beyond what's needed | Real routing, components, typed content, off-the-shelf CMS, server-side i18n |
| Infra bill | Unchanged (~free tier) | New database + CMS + possibly a vector DB |

**Choice.** **Option A.** Extend incrementally. New frontend work ships as ES-module islands
(`<script type="module">`, copied by `build.js` like `icons/` and `fonts/`); `app.js` is only refactored where it
is already being changed.

**Rationale.** Option B's genuine benefit is developer ergonomics, which is the *cheapest* thing on the priority
list, purchased at the price of the two hardest assets to rebuild — the SEO surface and a shipped mobile app.
Reliability and security both argue for not touching working, audited paths. **Trigger to revisit:** the owner
hires a development team, or two or more people are editing the frontend concurrently. At that point ergonomics
stop being cheap.

**Date.** 2026-09-20.

---

## ADR-002 — The international surface is a NEW English tree, not a migration

**Context.** The vision is "English-first, multilingual-ready". The reality is Bengali-only: `lang="bn"` on both
HTML roots, zero `hreflang`, and every content record (389 audio titles, 104 PDF titles, 169 guide documents,
316 blog posts, 10 guide categories, 11 topic hubs) is Bengali. The Android app, now in Play closed testing,
links into those Bengali URLs. Patients hold `/audio/<CODE>/` links given to them over the phone.

**Options considered.**
1. **Migrate** — rebrand the site English-first, move Bengali under `/bn/`.
2. **Separate project** — a second Vercel project/repo for `en.alquranicruqyahhealing.com`.
3. **New locale tree in the same build** — Bengali stays unprefixed at the root; English is added under `/en/`.

**Choice.** **Option 3.** Bengali stays at the root **permanently**. English is `/en/…`. Further languages follow
the same prefix. `hreflang` and `lang` are emitted from `ContentItem.lang` / `translationOf`.

**Rationale.**
- Option 1 moves ~900 URLs with accumulated ranking, breaks in-app links in an already-published APK, and breaks
  links already given to patients — for zero product gain, since the English content does not exist yet.
- Option 2 duplicates `tools/seo.js`, the Firebase integration and the gated functions across two repos that will
  diverge. Two codebases is the most expensive maintenance shape available here.
- Option 3 has **zero blast radius on existing URLs** and adds a locale loop inside a build system that was
  already written to absorb it (`tools/seo.js` centralises head/nav/canonical/sitemap; builders "only write,
  never discover").

**Date.** 2026-09-20.

---

## ADR-003 — Normalize content with a read-only layer; do not migrate the five content sources

**Context.** The target metadata model (title, slug, description, category, topics, tags, author, source,
language, dates, references, related, status, visibility, SEO) has to apply to every content type. Today metadata
is spread across `audio.json`, `audio_meta.json`, `pdf_list.json`, `pdf_meta.json`, `guides_src/guides.json`,
`posts/*.md` front-matter and `course_data/catalog.json` — seven files, six shapes — plus titles and descriptions
scraped from each guide document's own `<title>`/`<meta>` (deliberately, so they cannot drift).

**Options considered.**
1. Migrate everything into one canonical content file or database.
2. Leave it scattered; each new feature reads whatever it needs.
3. Add a read-only normalizer (`tools/content.js`) plus a small tracked overlay (`content_overrides.json`) for
   fields the sources don't carry.

**Choice.** **Option 3.**

**Rationale.** Option 1 touches every builder and every content-producing tool, including an external Python
engine that is the real source of truth for the guides — high risk, no user-visible gain. Option 2 means search,
RAG, i18n and the admin panel each re-derive the same view, three of which then disagree. Option 3 builds it
once, changes no source file, and is where the missing fields (`lang`, `status`, `visibility`, `translationOf`,
editorial order) can live so the owner can unpublish or retag without editing HTML. `build.js` already assembles
a whole-site catalogue up front precisely so that builders don't have to discover anything — this extends that.

**Date.** 2026-09-20.

---

## ADR-004 — Roles via Firebase custom claims, not a Firestore roles collection

**Context.** Authorization today is `email == 'crackdmcbuet@gmail.com'`, hardcoded in four places: `app.js:3827`,
`api/push.js:33`, `api/finance.js:36` and `firestore.rules`. Eight roles are required
(visitor, registered, client, editor, consultant, reviewer, admin, superadmin).

**Options considered.**
1. A `roles/{uid}` Firestore document, read by rules via `get()` and by functions via a REST read.
2. Firebase Auth **custom claims** carried in the ID token.
3. Keep the email list, just make it an array.

**Choice.** **Option 2**, with a non-breaking migration: rules and functions accept
`role == 'admin' || email == ADMIN_EMAIL` until the owner's own token carries the claim, then the four hardcoded
copies are removed in one commit.

**Rationale.** `firestore.rules` can read `request.auth.token.role` with **no document read** — rules stay cheap
and cannot be bypassed by a client. Every `api/*.js` already parses the Identity Toolkit response; the claim
arrives in it. Option 1 adds a read to every rule evaluation and a second source of truth. Option 3 doesn't
address the requirement at all. Also fixes a named availability risk: today a lost admin Google account requires
a code change **plus** `vercel --prod` **plus** `npm run deploy:rules` to recover — a second superadmin claim is
cheap insurance.

**Date.** 2026-09-20.

---

## ADR-005 — No headless CMS for authored documents; CMS-grade admin only for operational records

**Context.** The owner must be able to manage content without editing source code. But the guides are generated
by an external Python engine (`A:\claude code projects sabit\ruqyah pdf maker\`) and arrive here as finished
standalone HTML; the blog is `posts/*.md`; the audio catalogue is `audio.json`; the paid books are page images.

**Options considered.**
1. Headless CMS (Sanity/Strapi/Payload) for everything; rebuild all four builders to read from it.
2. Git-based CMS (Decap/TinaCMS) editing the Markdown/JSON in place.
3. Split: authored documents stay a file pipeline with a **status/visibility/order overlay**; operational records
   (reviews, announcements, patients, purchases, memberships, assessments, consultations, services) get full CRUD
   in the existing Firestore-backed admin pane.

**Choice.** **Option 3.**

**Rationale.** Option 1 means rebuilding `tools/guides.js`, `tools/blog.js`, `tools/library.js` and
`tools/seo.js` — roughly 145 KB of code encoding hard-won URL, date, SEO and watermark rules — and re-homing an
external content engine. That cost buys nothing while the owner is the sole author. Option 2 is closer, but the
guides are *copies* whose local edits are overwritten on the next engine sync, so editing them in place is a trap.
Option 3 delivers the actual requirement — the owner can unpublish, reorder, retag and translate-link without
touching source — for one JSON overlay file. **Trigger to revisit:** a second person is authoring content
regularly, or the guides engine is retired into this repo.

**Date.** 2026-09-20.

---

## ADR-006 — Search is a build-time inverted index served as a static file

**Context.** There is no site-wide search today; `app.js` only filters `audio.json` client-side. The requirement
spans books, videos, guidelines, articles, courses, services and FAQs, with category/tag/type/language filters
and relevance ranking.

**Options considered.**
1. Hosted search (Algolia/Typesense/Meilisearch).
2. Firestore queries over a mirrored content collection.
3. Build-time inverted index (`search-index-<lang>.json`) queried client-side, with `/api/search` as a fallback
   when the index outgrows the client.

**Choice.** **Option 3.**

**Rationale.** The corpus *is* build-time — a static site whose content only changes on deploy has no reason to
run a search server. Option 1 adds a vendor, a bill, a secret and an index-sync failure mode. Option 2 duplicates
the content into Firestore and charges per read for something the CDN serves free. Option 3 reuses the Phase 1.6
normalizer and the existing `seo.nfc()` normalizer, which already exists because `audio.json` spells য় as U+09DF
while typed Bengali uses য + nukta. **Trigger to revisit:** content becomes user-generated or updates more often
than the site is deployed.

**Date.** 2026-09-20.

---

## ADR-007 — RAG uses a build-time embedded index, not a vector database

**Context.** `api/chat.js` today is a plain Gemini 2.5 Flash proxy with a fixed system prompt — no retrieval, no
platform corpus, no citations. The requirement is a full pipeline ending in cited answers drawn from
platform-approved resources, with a human-review seam.

**Options considered.**
1. Managed vector DB (Pinecone/Weaviate/Qdrant/Supabase pgvector).
2. Embeddings in Firestore with a brute-force scan in a function.
3. Build-time chunk + embed → static index under `public/rag/<lang>/`, cosine scan inside `/api/ask`.

**Choice.** **Option 3.**

**Rationale.** ~900 content items → roughly 10k–30k chunks → tens of MB of float16, which a serverless function
can load and scan inside the existing 20 s `maxDuration`. The corpus only changes on deploy, which is exactly
when the index is rebuilt — the defining property that makes options 1 and 2 unnecessary. Option 1 adds a vendor,
a bill, a secret and a new failure mode for capability this corpus does not need. Option 2 charges Firestore
reads for a linear scan. **Trigger to revisit:** user-generated or continuously-updated material enters the
corpus, or the chunk count passes ~100k.

**Non-negotiable design commitments recorded with this decision:** retrieval-first (below the relevance floor the
assistant says it has no sourced answer rather than falling back to model knowledge); every claim carries a
citation that resolves to a live content id, and an unresolvable citation is a **build failure**; sensitive-topic
routing happens before generation; chunks carry a review state so unreviewed material can be excluded by
configuration.

**Date.** 2026-09-20.

---

## ADR-008 — Deploy only with `vercel --prod` from a working copy **(retrospective)**

**Context.** Paid book pages and course data are gitignored because the repository is public. They reach
production through `vercel.json`'s `functions.includeFiles`. But `includeFiles` can only bundle files present in
the **deployment source**, and a git-integration deploy's source is the repository.

**What happened.** A git-based deploy shipped `api/book.js` with no pages in it. `/api/book?meta=1` answered
`{"pages":0}` and every buyer of শেখার শিল্প got an empty reader. **Nothing in the build log said so.**

**Options considered.** (a) commit the paid bytes — gives the products away on a public repo; (b) accept the risk
and remember; (c) disable git deploys structurally.

**Choice.** (c) — `vercel.json` sets `git.deploymentEnabled.master = false`.

**Rationale.** A rule that depends on remembering is not a control. The same trap has a second form: adding
`course_data/` or `course_notes/` to `.vercelignore` (they resemble the already-listed `book_notes/`) removes them
from the deployment source and makes `/api/course` 404 every note, silently — `.vercelignore` now carries a
comment saying exactly that.

**Lesson recorded:** *a failure that produces a 200 response with empty content is worse than a crash.* This is
the direct motivation for `tools/verify-prod.js` in `ROADMAP.md` Phase 0.2.

**Date.** ~2026-08 (incident); `git.deploymentEnabled` control in place by 2026-09-12.

---

## ADR-009 — Firestore rules live in the repository, and deploying the site does not deploy them **(retrospective — the incident)**

**Context.** Until 2026-08-09 the Firestore security rules existed only in the Firebase Console. They were then
written into `firestore.rules` in the repository — but **were not deployed until 2026-09-02**.

**What was live in production during that window** (a 17-line ruleset from 5 July 2026 covering only `users`,
`patients`, `purchases`):

1. **No `reviews` match** → every review read and write returned `Missing or insufficient permissions`. The entire
   review feature was **dead** — no rating on any store card, no review submittable — for weeks. Nothing surfaced
   except a line in the browser console.
2. **No `announcements` match** → publishing a notice was impossible.
3. **`users/{uid}` allowed unrestricted self-write** → any signed-in user could set
   `memberships['live-class'].until` from the browser console and grant themselves the ৳৪৯০ product, after which
   `/api/membership` would hand over the three private Telegram invite links. Those links cannot be un-shared;
   recovery means revoking and re-inviting every legitimate member.

**Choice.** Rules stay in the repository, reviewable in diff, with an explicit default-deny tail and comments
explaining every non-obvious allow. `npm run deploy:rules` is a documented, mandatory step.

**Rationale.** The root cause was not a bad rule — it was that **a rule nobody could see could not be reviewed**,
and that **editing the file and making the change live are two different actions with no feedback between them.**
A mismatch between the file and production is silent on both sides. The file's own header comment now states this
in capital letters, and `CLAUDE.md` §2.1 repeats it.

**Lessons carried forward:**
- Every `firestore.rules` change is followed by `npm run deploy:rules`, and every Console edit is copied back into
  the file.
- Authorization on a *money* field must never be writable by the party who benefits — hence `memberships` is
  admin-write-only, while `courses[]` remains user-writable **only** because it gates ৳১০০ books that are revoked
  if the payment doesn't exist.
- A rules-drift check (deployed rules vs. the file) belongs in the observability work — `ARCHITECTURE.md` §19.

**Date.** Rules written 2026-08-09; incident discovered and closed 2026-09-02.

---

## ADR-010 — Paid content is delivered by a gated function, never as a static file **(retrospective)**

**Context.** Books and course videos/notes are sold. Anything under `public/` is a free static file on a CDN, and
one shared link gives the whole product away.

**Choice.** `api/book.js` and `api/course.js` hand out one page / one lesson at a time after verifying a Firebase
ID token against Identity Toolkit and reading the entitlement from Firestore **as that user**. Free previews
(12/8/25 pages) and covers stay public and cacheable; paid responses carry `Cache-Control: private, no-store`.
Video ids live in gitignored `course_data/private.json`.

**Rationale, stated honestly in the code itself.** Unlisted YouTube ids have no domain lock: a leaked id plays
forever for whoever has it. What this design buys is that the id is not lying around to be scraped, and that a
leak is **revocable** — re-upload, change one line, redeploy. That is strictly better than a Telegram invite,
which needs every member re-invited. **It is not DRM, and buyers are not told otherwise.** `api/course.js`'s
`host` field is the seam for moving to signed-URL storage if real protection is ever needed.

**Date.** `api/book.js` ~2026-08-16; `api/course.js` 2026-08-17.

---

## ADR-011 — The Android build has no purchase surface at all, enforced structurally **(retrospective)**

**Context.** Google Play forbids selling digital goods outside Play Billing and forbids steering users to an
outside purchase path. A reviewer unzips the bundle.

**Options considered.** (a) hide prices at runtime; (b) implement Play Billing; (c) cut prices, buy buttons,
purchase functions and merchant numbers out of the native build at build time.

**Choice.** (c). `payments.js` is copied into the web build only; `#web-only` marker regions cut the markup, the
CSS and the top-level purchase code; `tools/audit-native.js` fails the build if a price, a buy button, a purchase
function or a merchant number reaches the APK.

**Rationale.** Runtime hiding is a promise; build-time absence is a guarantee. Play Billing was declined as a
product decision — purchases happen on the website. The audit deliberately does **not** fail on comments, on
strings inside `IS_NATIVE ? … : …` branches that never execute, or on the admin panel showing historic ৳ amounts;
failing on those would mean either dropping the admin panel or piling up indirection that adds no real policy
safety. Those cases are printed as a review list instead. The WhatsApp contact number is exempt as real-world
service contact, outside Play Billing's scope.

**Date.** ~2026-08 (`tools/audit-native.js`), refined through the v1.0 release.

---

## ADR-012 — Secrets in Vercel environment variables only; unconfigured features answer 501 **(retrospective)**

**Context.** The repository is public. The project needs: private Telegram invite links, a Google Apps Script URL
and read token for the owner's personal MFS ledger, a Firebase service-account JSON, and a Gemini API key.

**Choice.** `TELEGRAM_LINKS`, `SHEET_API_URL`, `SHEET_API_TOKEN`, `FIREBASE_SERVICE_ACCOUNT`, `GEMINI_API_KEY`
live in the Vercel dashboard and nowhere else. A function whose configuration is missing returns **501** with a
named error code, and the UI says the feature is being set up rather than showing an empty box.

**Rationale.** A Telegram invite link in a public file is a paid group with a free door, and it cannot be
un-shared. The MFS ledger's **read** token is deliberately distinct from the ingest token, so a leaked read token
cannot inject fake transactions. And the 501 convention means a misconfiguration is visible as "not configured"
rather than as a silently broken feature — the same principle as ADR-008's lesson.

**Date.** Progressively, 2026-08 to 2026-09.

---

## ADR-013 — Landing-page reviews are a build-time snapshot; in-app reviews are live **(retrospective)**

**Context.** The landing page is the only page that has to convince a stranger of anything. Rendering reviews
from Firestore means pulling ~300 KB of SDK onto it, and a review that only exists after JavaScript runs is a
review Google does not read.

**Choice.** `tools/export_reviews.js` snapshots `reviews` into `reviews.json` at build time; `build.js` injects
up to 6 into the markup and computes `aggregateRating` from the same numbers. Inside `/app`, reviews are read
live from Firestore.

**Rationale and the rule it encodes.** *A rating Google shows in search results must be a rating a visitor can
see on the page.* Where there are no reviews, the `aggregateRating` markup is **omitted entirely** — inventing
one is both a lie and a manual action waiting to happen. If Firestore is unreachable at build time, the previous
`reviews.json` is kept rather than failing the build or silently publishing an empty list where testimonials used
to be. The cost — the landing page is as fresh as the last deploy — is accepted deliberately: the app is for
people who already arrived, the landing page is for people deciding whether to.

**Date.** ~2026-08-09.

---

## ADR-014 — Every generated page's dates come from a content hash, never from "now" **(retrospective)**

**Context.** Generated pages need `datePublished`/`dateModified` for structured data and sitemaps. The naive
implementation stamps the build date, which tells Google every page changed on every deploy.

**Choice.** `seo.contentDates(key, content)` hashes the rendered content into `tools/content-dates.json`.
`modified` advances **only when the hash changes**. `saveDates()` drops rows for pages that no longer build, so
`datesOf()` can never vouch for a URL that is gone.

**Rationale.** The governing rule of `tools/seo.js`: *nothing here is allowed to invent a fact.* Durations come
from YouTube (`audio_meta.json`), page counts from the PDFs (`pdf_meta.json`), dates from the hash file or git.
Where a value is unknown the markup omits it rather than guessing. This is the same principle as ADR-013 and it
is the rule the AI assistant (ADR-007) inherits.

**Date.** 2026-09-12 (commit "SEO: topic hubs, PDF landing pages, sitemap index, real dates").

---

## ADR-015 — Track URLs are flat (`/audio/<CODE>/`), not nested under category **(retrospective)**

**Context.** 389 audio tracks and 104 PDF guides lived only inside `app.html`'s JavaScript, invisible to crawlers,
and every track link pointed at `/app.html#audio-<code>` — which `app.js` had no hash routing for, so all of those
links were dead.

**Choice.** One real URL per track at `/audio/<CODE>/`, flat. PDF landing pages at `/guides/pdf/<slug>/`.

**Rationale.** A track's **code never changes** (patients already hold them) but its **category does and has**
(see `docs/audio-recategorise.md`, which moved 67 tracks), and a URL that moves loses whatever ranking it had.
PDF landings are deliberately *not* under `/pdf/` (everything there carries a one-year immutable cache header,
right for files and wrong for pages) and *not* under `/guides/<slug>/` (the legacy `pdf/ashik-jinn.pdf` and the
guide document `ashik-jinn` are different things with the same name).

The thin-content concern about one page per track is answered by giving each page the embedded video, both
titles, the real duration and upload date, the category blurb, its tags, eight siblings, and the guides/PDFs on
the same topic.

**This decision is why `PROJECT_MASTER_SPEC.md` §5 puts "moving any existing public URL" out of scope.**

**Date.** 2026-09-12.

---

## ADR-016 — `/en/` foundation: two honest pages before any real content module

**Context.** ADR-002 already decided English lives at `/en/`, Bengali stays unprefixed forever. The open question
was what to actually build first, given ROADMAP.md's own rule ("do not implement every feature simultaneously")
and `PROJECT_MASTER_SPEC.md`'s content rule: no blind machine-translation of the Bengali corpus, no fabricated
citations, testimonials, or statistics, and no promising a service (Consultation, Assessment, accounts) that
does not functionally exist in English yet.

**Options considered.**
1. Machine-translate the whole Bengali corpus into `/en/`. Rejected outright — explicitly forbidden by the
   content rule, and a translated guide carrying unreviewed Qur'an/Hadith renderings is exactly the fabrication
   risk the rule exists to prevent.
2. Build every planned English module's real UI now (Library, Academy, Assessment, Consultation, Dashboard)
   with placeholder content. Rejected — placeholder Islamic content is still content, and a Consultation page
   that looks bookable but isn't is a false promise a visitor could act on.
3. **Build only a homepage and a "Start Here" orientation page — zero doctrinal claims, zero citations, every
   unbuilt module shown as a link-less "Planned" card, and cross-links to the real (Bengali-labelled but
   Arabic-audio) library that already exists.** Chosen.

**Rationale.** Option 3 is the only one that can ship today without an owner decision: it makes no claim it can't
back up, quotes no source it would need to verify, and does not touch the Bengali site's URLs, content, or
`landing.html` (in flight with an unrelated owner edit at the time — left untouched). "Start Here" restates the
safety split from `PROJECT_MASTER_SPEC.md` §5 (educational / guidance / assessment / consultation) rather than
explaining Ruqyah doctrine itself, specifically so it cites nothing and therefore cannot fabricate anything.
Every number on the homepage (`389+ audio`, `273+ guides`) is read live from the same `catalog` object the
Bengali build uses — never hand-typed — so it cannot go stale or overstate the library.

**Implementation.** `tools/en.js`, wired into `build.js` right after `buildLibrary`, web-target only. Its own
`head()`/`NAV`/`FOOT` (not `seo.js`'s bn versions) — `lang="en"`, `og:locale: en_US`, hreflang trio pointing at
the bn homepage (every `/en/` page's nearest bn analogue, until a matching bn page exists per module). Appends
its own CSS to the shared `public/blog/blog.css` the same way `tools/library.js` does, reusing the existing
design tokens (`--green`, `--surface`, `--border`, the `.card`/`.topic`/`.prose` components) rather than
inventing a second design system — Inter leads instead of Hind Siliguri since English carries no Bengali
conjuncts. `tools/seo.js`'s shared `NAV`/`FOOT` (used by blog/guides/audio/topics/pdf/404 — everything except
`index.html`, which is `landing.html` directly) now link to `/en/`.

**Known gap, not a defect.** `index.html`'s own header has no `/en/` link and the bn side of the hreflang pair
is not yet reciprocated, because both live in `landing.html`, which had an unrelated in-flight owner edit at
deploy time. Add both once that edit lands — tracked in `ROADMAP.md` 11.3.

**Date.** 2026-09-21.

---

## ADR-017 — `tools/content.js`: a normalizer, not a migration, and what it deliberately leaves out

**Context.** `ARCHITECTURE.md` §4.3 specified a `ContentItem[]` normalizer over the five content sources as the
keystone for search, RAG, i18n and the admin panel — built once rather than three times. Three implementation
questions weren't settled by that spec and needed a call: what happens to dates, what happens to the `/en/`
pages, and what happens to `COURSES`/`BOOKS`.

**Choice 1 — dates are independent, not borrowed from the page builders.** `tools/seo.js`'s `contentDates()` /
`datesOf()` pair is keyed per URL and populated by whichever builder writes that page — `tools/library.js`,
`tools/blog.js`, etc. Those builders run *before* `tools/content.js` in `build.js`'s sequence today, but nothing
enforces that ordering, and coupling the normalizer to it would make `tools/content.js` silently wrong if the
sequence ever changed. Audio/guide/pdf items carry no `publishedAt`/`updatedAt` for now (left `null`) rather than
risk a stale or absent read; blog posts use their own frontmatter `date` directly, which is a real authored fact
independent of build ordering.

**Choice 2 — the two `/en/` pages are ContentItems too, sourced from `tools/en.js`'s `pageMeta(catalog)`, not a
second copy of their title/description.** The first version of this file hardcoded its own title/desc strings for
the 2 pages, on the theory that the dependency should run one way (`content.js` knows about `en.js`, not the
reverse). An independent review caught that the hand-typed copies had already drifted from the real pages — the
home page's real description is dynamic (built from live catalogue counts, `libraryFacts()`), so a static
hardcoded string could never match it. Fixed by having `tools/en.js` export `pageMeta(catalog)` — the same
function it uses to build each page's own `<head>` — and having `content.js` call it too. The dependency still
runs one way (`content.js` requires `en.js`, never the reverse); what changed is that the *copy* now has exactly
one source instead of two.

**Choice 2b (found in the same review) — a post's `canonical` frontmatter can be a path or a full URL; the
normalizer initially only handled the full-URL case.** `tools/blog.js`'s own canonical logic accepts either
and prepends `SITE` for a bare path; `content.js` originally didn't, so the one real post that sets a relative
`canonical` (`posts/boi-promo-post-3.md`) produced a non-absolute `seo.canonical` — the only one of 979 items
that would have been. Fixed to mirror `blog.js` exactly. Same review also caught that guide items were using the
long, SEO-suffixed `<title>` text as their display `title` (every other type uses the clean short name there) and
that `author` was unset for guides despite the suffix naming one — both fixed.

**Choice 3 — `COURSES`/`BOOKS` (hardcoded in `app.js`) are explicitly NOT normalized here.** They're already a
named violation of "no content hardcoded into a component" (`PROJECT_MASTER_SPEC.md` §4.1, `ROADMAP.md` 3.7-style
notes). Extracting them requires either parsing `app.js`'s JS source or moving the data to a JSON file first —
both are real work belonging to a dedicated migration, not a side effect of building the normalizer. `ROADMAP.md`
1.6 records this as a known gap rather than silently pretending the content layer is complete.

**Choice 4 — `content_overrides.json` starts empty (`{}`) and stays empty until something needs it.** No admin UI
writes to it yet; it exists so the shape is real and testable (`tools/content.js`'s `applyOverride()` merges by
`type:slug`, and the id-uniqueness/title/canonical validation in `buildContentItems()` runs *after* overrides are
applied, so a bad override can't silently produce a broken item — the build fails loudly instead).

The same review found two gaps in `applyOverride()` itself, dormant today because the file is `{}` but real once
it isn't: an override could set `id`/`type`/`slug`, letting two different overrides rename their items to the
same effective identity without the duplicate check ever seeing it (each keeps its own original `id`); and an
override setting `seo` to a non-object (a plausible hand-editing mistake) would spread garbage keys into the
item's `seo` object without the canonical-truthiness check catching it. Fixed: `applyOverride()` now drops
`id`/`type`/`slug` from an override before merging, and only merges `seo` when it is actually a plain object.

**Output.** `public/content-index.json` — a slim, real, inspectable artifact (979 items at write time: 389 audio
+ 169 guide + 104 pdf + 315 post + 2 page), not just a build-time intermediate nobody can see. `tools/smoke.js`
asserts its counts match the other builders' own output, so the normalizer cannot silently drift out of sync
with the site it's describing.

**Date.** 2026-09-21.
