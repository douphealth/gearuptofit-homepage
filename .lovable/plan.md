
# SEO Content Audit Dashboard for gearuptofit.com

## Goal
A private, password-protected `/audit` route inside this Lovable app that continuously audits every WordPress post on gearuptofit.com, gives each one an SEO/AEO/GEO score, generates AI-powered fixes, and pushes improvements back to WordPress **as Drafts only** — so nothing on the live site can break.

---

## How It Works (end-to-end)

```text
 WordPress (gearuptofit.com)        Lovable Audit Dashboard
 ─────────────────────────          ───────────────────────
 wp-json/wp/v2/posts  ──READ──►   1. Fetch all posts
                                   2. Score each (20 signals)
                                   3. Show ranked fix-list
                                   4. Click "Generate Fixes" → AI
                                   5. Click "Push as Draft" ──WRITE──►  Drafts inbox in WP
                                                                         (you publish manually)
```

Two channels:
- **READ** = public REST API (`/wp-json/wp/v2/posts`) — no auth, zero risk.
- **WRITE** = WordPress Application Password over HTTPS, scoped to **Draft status only**. You always click "Update / Publish" inside WordPress yourself.

---

## Safety Guarantees (the "without breaking anything" part)

| Layer | Guarantee |
|---|---|
| Default mode | Read-only. Writes disabled until you flip a toggle. |
| Write scope | Hard-coded to `status: 'draft'`. The code path that publishes is removed entirely. |
| Originals | Never touched. Drafts are new revisions; you can discard them. |
| Schema (JSON-LD) | Validated against schema.org before being shown. |
| Internal links | Cross-checked against live sitemap so no broken links. |
| AI cost control | Per-post button (you trigger). No bulk auto-rewrites. |
| Cloudflare safe | Uses standard WP REST endpoints + WAF-friendly headers. |
| Access | `/audit` route gated behind a password (Lovable Cloud-stored). |

---

## What Gets Built

### 1. Auth gate (`/audit` route)
- Single password screen (password stored as Lovable Cloud secret `AUDIT_PASSWORD`).
- Session kept in `sessionStorage`. Logout button.

### 2. WordPress data layer
Edge function `wp-fetch-posts`:
- Pages through `/wp-json/wp/v2/posts?per_page=100&_embed` until all posts retrieved.
- Caches results in Lovable Cloud DB table `wp_posts_cache` (15-min TTL).
- Stores: id, slug, title, content, excerpt, modified date, categories, tags, featured image, author, yoast meta (if exposed).

### 3. SEO Scoring engine (`src/lib/seoScorer.ts`)
Each post scored 0–100 across:
- **Technical**: title length, meta desc length, slug quality, H1/H2 hierarchy, image alt text, WebP usage, internal/external link counts.
- **Content**: word count, readability (Flesch), keyword presence, semantic coverage, freshness (months since update).
- **AEO/GEO**: FAQ schema present, JSON-LD type, "answer-style" intro, listicle/HowTo structure.
- **E-E-A-T**: author bio, citations, "last updated" visible.
- **Cannibalization**: cosine-similarity between post titles/topics flags duplicates.

Output per post: score, list of issues (severity: critical / high / polish), recommended actions.

### 4. Dashboard UI (`/audit`)
- **Overview**: site-wide health score, distribution chart, count of critical issues.
- **Posts table**: sortable by score, filters by category / severity / freshness. Search.
- **Post detail drawer**: full audit, before/after preview, fix list with checkboxes.
- **Content gap finder**: lists topics competitors rank for that you don't (uses target-keyword input later).
- **Decay tracker**: posts whose score dropped vs. last scan.

### 5. AI fix generator (Lovable AI Gateway, `google/gemini-2.5-flash`)
Edge function `audit-generate-fixes` produces, per post:
- Rewritten meta title (≤60 chars) + meta description (≤155 chars).
- Improved intro paragraph (hook + primary keyword in first 100 words).
- 5–10 FAQ block (question + answer).
- JSON-LD schema (Article / Review / HowTo / FAQPage as appropriate).
- Internal-link suggestions (post → 3–5 related posts on your site).
- Alt text for every image missing one.
- Suggested new H2/H3 outline if content is thin.

All output is shown in a diff viewer. You approve each piece individually.

### 6. WordPress Draft Push (Pro feature)
Edge function `wp-push-draft`:
- Auth: WordPress Application Password (you create one in WP → Users → Profile → Application Passwords). Stored as secret `WP_APP_PASSWORD` + `WP_USERNAME`.
- Endpoint: `POST /wp-json/wp/v2/posts/{id}` with `{ status: 'draft', content, excerpt, meta }`.
- **Hardcoded `status: 'draft'`** — never `publish`.
- Returns the WP draft URL so you can jump into WP and review.
- Activity log table records every push.

### 7. Scheduled re-scans
Cron edge function `audit-weekly-scan` runs every Monday:
- Re-fetches all posts, re-scores, diffs against last week.
- Writes a "Decay report" row to DB.
- Dashboard shows "5 posts dropped score this week" alert.

---

## Why This Drives Long-Term Organic Traffic

1. **Freshness loop** — Google rewards updated content. Weekly decay alerts mean nothing rots.
2. **AEO/GEO ready** — FAQ + JSON-LD schema = eligibility for AI Overviews, ChatGPT citations, Perplexity sources.
3. **Topical authority** — Internal-link suggestions tighten clusters around your 6 pillars.
4. **No cannibalization** — Duplicate-topic detector flags posts that compete with each other.
5. **E-E-A-T signals** — Author, citations, last-updated dates added systematically.
6. **Core Web Vitals** — WebP + alt-text fixes improve Lighthouse scores.
7. **Continuous, not one-shot** — The dashboard is a permanent operating system, not a one-time clean-up.

---

## Technical Section

**Stack additions:**
- Lovable Cloud (already enabled? — will enable if not) for: auth-gate password, edge functions, DB tables, secrets.
- Tables: `wp_posts_cache`, `audit_scores`, `audit_history`, `push_log`.
- Edge functions: `wp-fetch-posts`, `audit-generate-fixes`, `wp-push-draft`, `audit-weekly-scan` (cron).
- Secrets: `AUDIT_PASSWORD`, `WP_USERNAME`, `WP_APP_PASSWORD`.
- Lovable AI Gateway for all AI generation (no external OpenAI key needed).
- Frontend: new `/audit` route, components reusing existing dark/red design tokens.

**What you do once before first push:**
1. WordPress → Users → Your Profile → Application Passwords → create one named "Lovable Audit" → copy the 24-char password.
2. Paste it into the secret prompt I'll trigger.
3. Done. Read-only audit works without this; only the "Push as Draft" button needs it.

**Build order:**
1. Auth gate + `/audit` shell.
2. WP fetch + cache + scoring engine.
3. Dashboard UI (table + detail drawer).
4. AI fix generator.
5. WP draft push + activity log.
6. Weekly cron scan + decay alerts.

**Out of scope (intentionally):**
- No auto-publishing. Ever.
- No editing live HTML/CSS/theme files of WordPress.
- No plugin install/deactivation (that's the wp-admin issue you had — separate Cloudflare problem).
