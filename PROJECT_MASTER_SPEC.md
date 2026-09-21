# PROJECT MASTER SPEC — Al Quranic Ruqyah Healing

**Owner:** রাকী ফয়সাল আহমেদ সাবিত (Raqi Faisal Ahmed Sabit)
**Live product:** https://alquranicruqyahhealing.com + Android app `com.selfruqyah.app` ("Self Ruqyah")
**Status of this document:** written 2026-09-20 from a read of the live codebase. It is the product contract.
It does **not** replace `docs/README.md` or `docs/*.md` — those stay the operational truth for shipped subsystems.

---

## 1. What this project actually is today

A **live, revenue-carrying Bengali Ruqyah platform**, not a greenfield project:

| Surface | Reality on disk / in production |
|---|---|
| Marketing site | `landing.html` → `public/index.html`, Bengali, real SEO system |
| Web app | `index.html` → `public/app.html` + `app.js` (7,675 lines, no framework) |
| Content library | 389 audio tracks, 104 legacy PDF guides, 169 HTML Ruqyah documents, 316 blog posts, 11 topic hubs |
| Paid products | 3 books (৳২০০/৳১০০/৳১০০), ৳৪৯০ live-class membership (legacy), ৳৮০০ monthly package (external form), ৳৩০০ diagnosis service |
| Backend | 6 Vercel serverless functions, zero npm dependencies |
| Data | Firebase Auth + Firestore (5 collections) |
| Mobile | Capacitor 7 Android app, Closed Testing (Alpha) 1.0.1(2) published to Play 2026-09-03 |

**Everything below is an extension of that.** Nothing in this spec authorises a rewrite.

---

## 2. Product vision

An **international (English-first, multilingual-ready) Ruqyah education, knowledge, resource, assessment and
consultation platform**, built for long-term growth toward a very large audience — while the existing Bengali
site continues to serve its current audience without disruption.

### 2.1 Pillars

1. **Education** — Ruqyah and self-Ruqyah teaching: courses, guided programmes, structured learning paths.
2. **Knowledge** — Qur'an/Sunnah resources, adhkar, amal, books, guidelines, articles, videos, audio.
3. **Assessment** — configurable educational questionnaires producing an *educational* result + recommended resources.
4. **Consultation** — service selection, intake, scheduling, payment, status, follow-up, history.
5. **Community trust** — verified reviews, transparent sourcing, visible disclaimers.
6. **Discovery** — search (keyword → filtered → semantic) and an AI assistant that cites platform sources.

### 2.2 The English-first question, answered honestly

The current site is **Bengali-only**: `lang="bn"` on both HTML roots, no `hreflang` anywhere, and every
content record (audio.json titles, pdf_list.json, guides.json categories, 316 blog posts) is Bengali.

**Decision: the international surface is a NEW English-first tree alongside the existing Bengali site, not a
migration.** See `DECISIONS.md` ADR-002 for the full reasoning. In one line: ~900 indexed Bengali URLs with
accumulated ranking, an already-shipped Android app that links into them, and patients who hold `/audio/<CODE>/`
URLs are all assets that a migration would put at risk for no product gain.

- Bengali stays at the root (`/guides/…`, `/audio/…`, `/blog/…`, `/topics/…`) — **no existing URL moves, ever.**
- English lives under `/en/…` and is added builder-by-builder.
- Further languages (Arabic, Urdu, Indonesian, Malay, Turkish) follow the same prefix pattern.

---

## 3. Safety and scope principle → concrete product rules

These are **binding product rules**, not aspirations. Any feature that violates one does not ship.

### R1 — Four content classes, always visibly distinguished

Every piece of content, every AI answer and every assessment result must be presentable as exactly one of:

| Class | Means | Required framing |
|---|---|---|
| **Educational information** | Sourced fact about Ruqyah, the Qur'an, Sunnah, or scholarship | Cite the source |
| **Ruqyah guidance** | A practice, protocol or amal | Say where it comes from; separate sunnah from scholarly opinion from practitioner experience |
| **Preliminary assessment** | Output of a questionnaire or symptom tool | Must carry the "not a diagnosis" statement inline, not in a footer |
| **Consultation** | A human raqi's personal reading of a case | Attributed to the raqi, never to the system |

Medical diagnosis is a **fifth class the platform never produces**.

### R2 — Never present AI or automated assessment as diagnosis

- No assessment result may state or imply that symptoms *prove* jinn, sihr, hasad or evil eye.
- Results are expressed as *which educational material is most relevant*, never as a verdict.
- The existing symptom checker in `app.js` already carries a disclaimer line
  (`⚠️ এটি প্রাথমিক ধারণা মাত্র — চূড়ান্ত মূল্যায়নের জন্য অভিজ্ঞ রাকীর পরামর্শ নিন`). That is the floor, not the ceiling —
  see R6.

### R3 — Never replace qualified medical or mental-health professionals

- Every assessment and every AI answer touching physical or psychological symptoms must include the
  medical-referral line. `api/chat.js`'s system prompt already mandates this (rule 5); it stays mandatory.
- Categories with a known medical overlap (chronic pain, sleep disorder, anxiety, self-harm ideation,
  child developmental concerns) get an **explicit escalation block**, not a generic disclaimer.

### R4 — Escalation guidance for sensitive cases

A defined set of triggers (self-harm, harm to others, child safety, severe untreated physical illness,
pregnancy complications) must route the user to professional help **before** any Ruqyah recommendation is shown.
This applies to the assessment engine, the AI assistant, and the consultation intake form alike.

### R5 — Never fabricate a source

The AI assistant, the RAG pipeline and every generated page must never invent a citation, book, verse, hadith,
scholar, quotation, number or date. **Where evidence is unavailable, say so.**
This rule already exists in the codebase and is enforced today by `tools/seo.js`
("Nothing here is allowed to invent a fact") and by `build.js`'s review injection
(no `aggregateRating` markup where there are no real reviews). Extend it; do not weaken it.

### R6 — The AI is not a religious authority

- The assistant answers from **platform-approved resources first**, with citations.
- Architecture must allow **human review of sensitive content** before publication (a review state on
  generated/AI-assisted material; a moderation path for reviews and consultation notes).
- The assistant must be able to decline. "I don't have a sourced answer for this — here is how to ask the raqi"
  is a correct answer.

### R7 — Private data stays private

- Health intake (`patients/{uid}`), consultation cases, payment rows and the finance ledger are never exposed to
  a non-owner, never indexed, never cached in a shared CDN.
- Reviews never expose private client information; a "verified client" indicator must not leak *what* they bought
  beyond the product they are reviewing.
- Admin functionality is never exposed to ordinary users. Client-side hiding is cosmetic — the server check is
  the control (this is already the pattern in `api/finance.js` and `api/push.js`; keep it).

### R8 — Pricing and purchase claims must be true and must be one number

There is a live inconsistency to resolve, not to paper over: `COURSES` in `app.js` carries a legacy ৳৪৯০
`live-class` entry *and* an ৳৮০০ `ruqyah-package` entry, and `docs/live-class.md` records claims made on
Facebook that were deliberately **not** put on the site because they could not be verified. That discipline
stands: **no number goes on the site that cannot be verified from data.**

---

## 4. In scope

### 4.1 Content types to support (with full metadata)

Books · book chapters · guidelines · articles · videos · video courses · audio · duas · adhkar · amal ·
Qur'an references · Hadith references · FAQs · case studies · services · consultation resources.

**Canonical metadata field set** (every content type, regardless of where it is stored today):

```
id, type, slug, lang, title, description, category, topics[], tags[],
author, source, publishedAt, updatedAt, references[], relatedIds[],
status (draft|review|published|archived), visibility (public|members|clients|internal),
seo { title, description, ogImage, canonical }, translationOf
```

**No content may be hardcoded into a component.** The existing pattern already respects this — `audio.json`,
`pdf_list.json`, `guides_src/guides.json`, `posts/*.md`, `course_data/catalog.json` are all data files read by
builders. Two violations exist and are named in `ROADMAP.md`: the symptom-checker questions and the
product catalogue (`COURSES`/`BOOKS`) are hardcoded inside `app.js`.

### 4.2 Roles

| Role | Can |
|---|---|
| Visitor | Read public content, run assessments, submit a consultation request |
| Registered user | + dashboard, bookmarks, progress, reviews, purchases |
| Client | + their own consultation cases, case files, follow-ups |
| Content editor | + create/edit/publish content, manage categories/tags/translations |
| Consultant | + assigned consultation cases, availability, case notes |
| Reviewer | + moderate reviews, approve sensitive/AI-assisted content |
| Administrator | + users, services, payments, assessments, site settings, analytics |
| Super administrator | + role assignment, AI knowledge sources, destructive operations |

**Today the system has three levels: visitor, signed-in user, and one hardcoded admin email**
(`crackdmcbuet@gmail.com`, duplicated in `app.js`, `api/push.js`, `api/finance.js` and `firestore.rules`).
Moving to claim-based roles is a prerequisite for the Consultant/Editor/Reviewer roles — see `ROADMAP.md` Phase 5.

### 4.3 User dashboard

Profile · saved books/videos · bookmarks · learning progress · assessment history · consultation history ·
orders & payments · reviews · notifications · downloads · preferences.

Partially exists: `users/{uid}` already carries `courses[]`, `memberships{}`, `courseProgress{}`, favourites and
recently-played.

### 4.4 Assessment engine

`Questionnaire → Answers → Rules/Scoring → Educational Result → Recommended Resources → Optional Consultation`

- Questionnaires, items, weights and result bands are **data**, not code.
- Multiple questionnaires coexist (quick check, full 250+-item diagnosis intake, topic-specific).
- Results link to real content ids from the content layer — never to invented material.
- Output obeys R2, R3, R4.

### 4.5 Consultation system

Service selection → request → case info → scheduling → availability → payment → confirmation → status →
follow-up → history. Private data under strict access control (client + assigned consultant + admin only).

### 4.6 Reviews

Service-specific · star rating · written text · verified-client indicator · moderation · reporting · anti-spam.
A working version already exists (Firestore `reviews`, doc id `uid_target`, build-time snapshot on the landing page).
What is missing: a moderation queue, reporting, and any anti-spam beyond "must have an account".

### 4.7 Search

Keyword · filters · categories · tags · content-type filter · language filter · relevance ranking, across
books, videos, guidelines, articles, courses, services and FAQs. Semantic search later, sharing the RAG embeddings.

**There is no site-wide search today** — only client-side filtering of `audio.json` inside `app.js`.

### 4.8 AI / RAG assistant

`files → extraction → OCR if required → cleaning → metadata → chunking → indexing → search → retrieval →
AI response → source citations`

Today `api/chat.js` is a **plain Gemini 2.5 Flash proxy with a fixed system prompt** — no retrieval, no platform
corpus, no citations, no authentication, no rate limit. That is the starting point, not the design.

### 4.9 Admin panel

Users · books · videos · courses · guidelines · articles · audio · categories · tags · assessments · services ·
consultations · reviews · payments · AI knowledge sources · translations · SEO · site settings · analytics.

**Goal: the owner manages content without editing source code.** See `ARCHITECTURE.md` §11 for the honest
split between what can realistically become CMS-managed and what stays a file pipeline.

---

## 5. Out of scope

- **A rewrite.** No framework migration, no replacing Firebase/Vercel/Capacitor, no new database, unless a named
  requirement proves the current approach cannot do the job (and then it goes in `DECISIONS.md` with the reason).
- **Moving or renaming any existing public URL.** Ranking is an asset.
- **In-app purchases in the Android build.** Play forbids selling digital goods outside Play Billing; the current
  design deliberately strips every price, buy button and merchant number from the APK at build time
  (`payments.js` is web-only; `tools/audit-native.js` enforces it). This stays.
- **Real DRM on paid media.** `api/course.js` is explicit that unlisted YouTube IDs are revocable obscurity,
  not protection. Don't claim otherwise to buyers.
- **Medical diagnosis, treatment claims, or cure guarantees** — in any surface, any language, any channel.
- **Publishing editable source formats of paid/watermarked material** (the DOCX button is already stripped at
  build time for exactly this reason).
- **Numbers on the site that cannot be verified from data** (see R8).

---

## 6. Non-functional requirements

| Requirement | Target | Why it is reachable today |
|---|---|---|
| Availability of public content | Survives a Firebase outage | Public pages are static files on Vercel's CDN; Firebase is only needed for auth/dynamic features |
| Cold-start page weight | Unchanged or better | CSS is inlined, fonts self-hosted, no bundler, no framework runtime |
| Offline | App shell + previously-read content works offline | `service-worker.js` v17, network-first shell, cache-first assets |
| Paid content confidentiality | Never a public static file | `api/book.js` / `api/course.js` + `includeFiles`; paid bytes are gitignored |
| Auth latency | Accepted: one Identity Toolkit round-trip per gated request | Trades latency for "no service-account key in any function except push" |
| APK size | < 20 MB hard fail | `build.js` fails the native build above 20 MB |
| SEO integrity | No invented dates, durations, page counts or ratings | `tools/seo.js` + `tools/content-dates.json` + `pdf_meta.json` + `audio_meta.json` |

---

## 7. Decision rule (applies to every choice in this project)

**Reliability > Security > Maintainability > Scalability > Development speed > Cost.**

- Don't over-engineer.
- Don't add a dependency or a piece of infrastructure unless the current approach genuinely cannot do the job.
- Complexity must be earned by a requirement you can name.
- When two options are close, take the one with the smaller blast radius.

---

## 8. Known open questions (owner input required)

1. **Which Google account owns the Play listing long-term?** `docs/play-listing.md` §6 documents two entangled
   accounts; the package name is permanently bound to whichever created the app (`mdfaisalahmedsabit2017@gmail.com`
   per §7). This affects who can ever publish updates.
2. **৳৪৯০ vs ৳৮০০** — is `live-class` retired for new buyers permanently, and does the ৳৮০০ package ever move
   from the external Google Form into the platform's own flow?
3. **Is the English surface a translation of the Bengali corpus, or original English content?** This changes the
   content model's `translationOf` semantics and the editorial workload by an order of magnitude.
4. **Who else will ever have write access?** Editor/Consultant/Reviewer roles are only worth building if a second
   human will actually use them.
5. **Rights/licensing on third-party audio** — `audio.json` links 389 YouTube tracks from other channels. That
   is fine for linking; it is not fine for re-hosting or for an international commercial surface without a review.
