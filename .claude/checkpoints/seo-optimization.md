# SEO + indexing optimisation — checkpoint

Started 2026-09-11. Site = custom Node static generator (`build.js` → `public/`) on Vercel; NOT Next.js.
Deploy rule (memory): `vercel --prod` from the working copy; git push does not deploy.
Working copy already had ~4,200 uncommitted lines (audio library expansion etc.) — preserve, never revert.

## Audit findings (Phase 1)

| # | Finding | Fix |
|---|---|---|
| 1 | `/audio` and `/audio/` both 200 (no trailing-slash canonicalisation); `/index.html` 200 duplicate of `/` | `trailingSlash: true` + redirect `/index.html` → `/` in vercel.json; keep `/app` rewrite working |
| 2 | www → apex is a **307** (temporary) | Vercel domain setting — manual/API (308) |
| 3 | `<link rel="icon" href="/assets/icon.png">` 404s on every blog/guide page; library pages have no icon at all | point at `/icons/icon-192.png` everywhere |
| 4 | No custom 404 (plain text) | generate `public/404.html` |
| 5 | Sitemap: one 827-URL file; audio/guide `lastmod` = build date every build (dishonest); `app.html` listed | sitemap index + per-section sitemaps; content-hash dates file; keep app.html (it gets a canonical) |
| 6 | 104 legacy PDFs (`pdf_list.json`) have no landing page — linked as raw files; 64 have no extractable text (image PDFs) | `/guides/pdf/<slug>/` landing pages with real page count, first-page preview image, related resources; `/guides/pdf/` index |
| 7 | Audio track pages: no visible breadcrumb, no links to related guides/PDFs, VideoObject lacks uploadDate/duration | fetch real metadata via yt-dlp (`audio_meta.json`), add breadcrumb + topic links, YouTube facade |
| 8 | Guide pages: Article JSON-LD has no dates/image; no related resources block; favicon 404 | inject dates from content-hash file, related block hidden in print/app-embed |
| 9 | No topic-cluster layer; blog posts never link to guides/audio (0/316) | `/topics/<slug>/` hubs from an explicit registry; related block on blog posts by tag |
| 10 | Landing: stale counts (২৭৮ audio / ৮৩ guides — now 389 / 97+104); Organization.logo is a 1200×630 banner; visible FAQ has no FAQPage schema | build-time count substitution, logo → icon-512, FAQPage from the visible `<details>` |
| 11 | `app.html`: generic title, no canonical/description of value | canonical + descriptive title/description |
| 12 | `features.html`: no description/canonical | add |
| 13 | robots.txt fine; add `Disallow: /*?q=` for the client-side search variants | |
| 14 | Blog cover `<img>` lacks width/height (CLS) | read JPEG dims at build |
| 15 | 22 PDFs in `pdf/` + `pdf_list.json` changes are untracked in git (working copy only) | report to user |

## Plan / status (2026-09-12)
- [x] tools/fetch_audio_meta.py → audio_meta.json (369/389 tracks have real uploadDate+duration; 16 unreadable on YouTube)
- [x] tools/make_pdf_previews.py → pdf_previews/*.jpg (104, 6.9 MB) + pdf_meta.json
- [x] tools/seo.js shared module; tools/seed_content_dates.js → tools/content-dates.json (460 seeded from git)
- [x] library.js: audio pages (facade, breadcrumb, related), PDF landing pages /guides/pdf/<slug>/, topic hubs /topics/, 404.html
- [x] guides.js: two-pass, dates, breadcrumbs, related block (hidden in print/app-embed), favicon
- [x] blog.js: seo.head, img dims, related block, `canonical:` frontmatter (boi-promo-post-3 → shekhar-shilpo-day-13)
- [x] build.js: catalog, landing counts (@@N_..@@), FAQPage, sitemap index; index.html app canonical; features/privacy meta
- [x] vercel.json: explicit trailing-slash 308s, /index.html→/, Link canonical on /pdf/*.pdf, cache headers, X-Robots on /api
- [x] service-worker.js v17
- [x] smoke.js updated; `npm run check` ALL PASS; verify_seo.js: 840 pages, 943 sitemap URLs, 0 broken links, 0 dup canonicals
- [x] preview deploy (al-quranic-ruqyah-healing-31ccx9n8s.vercel.app) → 308s, /app rewrites, Link canonical header, 404, sitemaps all verified
- [x] Opus QA review → 20 findings; substantive ones fixed (VideoObject inLanguage dropped, session blurb softened, PDF author/language claims removed, "সব N" counts now the destination's total, গাইড/শিক্ষা no longer counted as রুকইয়াহ, sibling window, content-dates pruning, smoke tests for topics/JSON-LD/robots). Not done: SW still precaches /index.html (harmless; shared with native target).
- [x] `vercel --prod` DONE 2026-09-12 (al-quranic-ruqyah-healing-w3m8husnb) — live verified: 308s, /app rewrite, Link canonical, 404, sitemap index (6 files), audio dates live, FAQPage, /api/book still returns pages:318 (includeFiles intact)
- [ ] user should commit: tools/seo.js, tools/seed_content_dates.js, tools/content-dates.json, audio_meta.json, pdf_meta.json, pdf_previews/, tools/fetch_audio_meta.py, tools/make_pdf_previews.py + all edited files (and the pre-existing uncommitted work)
- Known/accepted: app.html has no h1 (app shell); tabiah-ruqyah has 2 h1 (hand-made doc); www→apex is 307 (domain not attached to project — manual)
