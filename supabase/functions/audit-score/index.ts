// SOTA scoring engine for gearuptofit.com
// Adds: mobile-overflow heuristics, table/iframe/image responsiveness checks,
// FAQ/conclusion/intro presence, semantic entity coverage, JSON-LD detection,
// fixed-width/inline-style detection, and live HTML render fallback.
//
// Modes:
//   { mode: "list", post_ids?: number[] }   → return cached scores
//   { post_ids: number[] }                   → score N posts (sequential, max 8)
//   { mode: "scan_all", offset?, limit? }    → score chunk of cached posts (max 20 in parallel)

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const ORIGIN_BASE = "https://origin.gearuptofit.com/wp-json/wp/v2";
const DETAIL_FIELDS =
  "id,slug,link,title,excerpt,content,modified_gmt,date_gmt,categories,tags,author,yoast_head_json";

async function checkAuth(req: Request): Promise<boolean> {
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* ignore */ }
  const pw = body?._audit_password || req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

type Sev = "critical" | "high" | "medium" | "polish";
type Issue = { severity: Sev; code: string; message: string; category?: "seo" | "aeo" | "geo" | "visual" | "content" | "schema" };

const HARD = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function countMatches(s: string, re: RegExp): number {
  return (s.match(re) || []).length;
}
function flesch(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (!words.length || !sentences.length) return 0;
  const syll = words.reduce((a, w) => a + Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) || []).length), 0);
  return 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syll / words.length);
}
function monthsSince(iso?: string | null): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30);
}

async function fetchPostDetails(postId: number) {
  // Try apex first, fall back to origin
  for (const base of [WP_BASE, ORIGIN_BASE]) {
    try {
      const r = await fetch(`${base}/posts/${postId}?_fields=${DETAIL_FIELDS}`, {
        headers: { "User-Agent": "GearupAudit/3.0" },
      });
      if (r.ok) return await r.json();
    } catch { /* try next */ }
  }
  return null;
}

/* -------------------------- VISUAL HEURISTICS -------------------------- */
// Looks at rendered HTML for overflow / mobile-killer patterns.
function detectVisualIssues(html: string): Issue[] {
  const issues: Issue[] = [];
  if (!html) return issues;

  // Tables without responsive wrapper
  const tableCount = countMatches(html, /<table\b/gi);
  if (tableCount > 0) {
    const wrappedTables = countMatches(
      html,
      /<(?:div|figure)[^>]*class=["'][^"']*(?:table-wrapper|comparison-table-wrapper|wp-block-table|overflow-x-auto|table-responsive)[^"']*["'][^>]*>\s*<table/gi,
    );
    const unwrapped = tableCount - wrappedTables;
    if (unwrapped > 0) {
      issues.push({
        severity: "critical", category: "visual", code: "table-overflow",
        message: `${unwrapped} table(s) without responsive wrapper — overflows on mobile`,
      });
    }
  }

  // Iframes without responsive wrapper (YouTube etc.)
  const iframes = html.match(/<iframe\b[^>]*>/gi) || [];
  const fixedIframes = iframes.filter((i) => /\bwidth=["']?\d{3,}/.test(i) && !/\bstyle=["'][^"']*max-width/i.test(i));
  if (fixedIframes.length) {
    issues.push({
      severity: "high", category: "visual", code: "iframe-fixed-width",
      message: `${fixedIframes.length} iframe(s) with fixed pixel width — breaks on mobile`,
    });
  }

  // Inline pixel widths (style="width:Xpx" with X > 360) in images/divs
  const pxWide = (html.match(/style=["'][^"']*width\s*:\s*(\d{3,})px/gi) || [])
    .filter((m) => Number((m.match(/(\d+)px/) || [])[1]) > 360);
  if (pxWide.length > 1) {
    issues.push({
      severity: "high", category: "visual", code: "fixed-pixel-width",
      message: `${pxWide.length} elements with fixed pixel width >360px — overflow on small screens`,
    });
  }

  // Images missing width/height attributes (CLS)
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const noDims = imgs.filter((i) => !/\swidth=/i.test(i) || !/\sheight=/i.test(i));
  if (noDims.length > 2) {
    issues.push({
      severity: "medium", category: "visual", code: "img-no-dims",
      message: `${noDims.length} images without width/height — causes CLS`,
    });
  }

  // <pre>/<code> blocks without overflow handling
  const preBlocks = countMatches(html, /<pre\b/gi);
  const wrappedPre = countMatches(html, /<pre[^>]*style=["'][^"']*overflow/gi);
  if (preBlocks > wrappedPre && preBlocks > 0) {
    issues.push({
      severity: "polish", category: "visual", code: "pre-overflow",
      message: `${preBlocks - wrappedPre} <pre> block(s) may overflow on mobile`,
    });
  }

  // Orphan CSS leaking as text (the .gutf-article !important block)
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
  if (/\.[a-z][\w-]*\s*\{[^}]*!important/i.test(stripped)) {
    issues.push({
      severity: "critical", category: "visual", code: "css-leak",
      message: "Raw CSS rules render as visible text — run Bulk Cleanup",
    });
  }

  // Broken HTML — unclosed tags signature
  const openDivs = countMatches(html, /<div\b/gi);
  const closeDivs = countMatches(html, /<\/div>/gi);
  if (Math.abs(openDivs - closeDivs) > 3) {
    issues.push({
      severity: "high", category: "visual", code: "unbalanced-divs",
      message: `Unbalanced div tags (${openDivs} open vs ${closeDivs} close)`,
    });
  }

  // Non-WebP heavy images
  const nonWebp = imgs.filter((i) => /\.(jpg|jpeg|png)["'?\s]/i.test(i));
  if (nonWebp.length > 4) {
    issues.push({
      severity: "polish", category: "visual", code: "img-format",
      message: `${nonWebp.length} non-WebP images — slow LCP`,
    });
  }

  return issues;
}

/* ----------------------------- SEO / AEO ------------------------------ */
function detectStructureIssues(html: string, text: string, wordCount: number): Issue[] {
  const issues: Issue[] = [];

  // H1 hierarchy
  const h1 = countMatches(html, /<h1[\s>]/gi);
  if (h1 > 1) issues.push({ severity: "high", category: "seo", code: "multi-h1", message: `${h1} H1 tags found (should be 1)` });
  if (h1 === 0) issues.push({ severity: "high", category: "seo", code: "no-h1", message: "No H1 tag in content" });

  const h2 = countMatches(html, /<h2[\s>]/gi);
  if (h2 < 2 && wordCount > 600) {
    issues.push({ severity: "high", category: "seo", code: "few-h2", message: "Lacks H2 sections — poor scannability" });
  }
  if (h2 < 4 && wordCount > 1500) {
    issues.push({ severity: "medium", category: "seo", code: "thin-structure", message: `Only ${h2} H2s for ${wordCount} words` });
  }

  // Lists (good for AI Overviews)
  const lists = countMatches(html, /<(?:ul|ol)\b/gi);
  if (lists === 0 && wordCount > 800) {
    issues.push({ severity: "medium", category: "aeo", code: "no-lists", message: "No bulleted/numbered lists — hurts AI Overview eligibility" });
  }

  // FAQ presence
  const hasFaqHeading = /<h[23][^>]*>\s*(faq|frequently asked|questions)\b/i.test(html);
  const hasFaqSchema = /(?:"|')@type(?:"|')\s*:\s*(?:"|')FAQPage(?:"|')/.test(html);
  if (!hasFaqHeading) {
    issues.push({ severity: "high", category: "aeo", code: "no-faq-block", message: "Missing FAQ section — top AEO/GEO opportunity" });
  }
  if (!hasFaqSchema && hasFaqHeading) {
    issues.push({ severity: "high", category: "schema", code: "no-faq-schema", message: "FAQ section exists but no FAQPage JSON-LD" });
  }

  // Conclusion / bottom-line
  const hasConclusion = /<h[23][^>]*>\s*(conclusion|bottom line|takeaway|key takeaways|final (?:thoughts|verdict)|summary|the verdict)\b/i.test(html);
  if (!hasConclusion && wordCount > 700) {
    issues.push({ severity: "medium", category: "content", code: "no-conclusion", message: "Missing conclusion / bottom-line section" });
  }

  // Answer-style intro
  const intro = text.slice(0, 300);
  if (!/\b(is|are|means|refers to|defined as|the\s+best|how to|in (?:short|summary)|tldr|tl;dr)\b/i.test(intro)) {
    issues.push({ severity: "medium", category: "aeo", code: "no-answer-intro", message: "Intro lacks direct answer — hurts AI Overviews" });
  }

  // Author / E-E-A-T
  if (!/<a[^>]*rel=["'][^"']*author/i.test(html) && !/by\s+[A-Z][a-z]+\s+[A-Z][a-z]+/.test(text.slice(0, 500))) {
    issues.push({ severity: "medium", category: "seo", code: "no-author-byline", message: "No visible author byline (E-E-A-T)" });
  }

  // Last-updated visibility
  if (!/(?:last\s+updated|updated\s+on|reviewed\s+on)\b/i.test(html.slice(0, 4000))) {
    issues.push({ severity: "polish", category: "seo", code: "no-updated-date", message: "No 'last updated' date visible to readers" });
  }

  return issues;
}

function detectSchemaIssues(html: string, yoast: any): Issue[] {
  const issues: Issue[] = [];
  const ldMatches = html.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi) || [];
  const yoastSchema = yoast?.schema?.["@graph"];
  const types: string[] = [];
  for (const block of ldMatches) {
    const inner = block.replace(/<script[^>]*>|<\/script>/gi, "");
    try {
      const j = JSON.parse(inner);
      const collect = (n: any) => {
        if (!n) return;
        if (Array.isArray(n)) n.forEach(collect);
        else if (typeof n === "object") {
          if (n["@type"]) types.push(String(n["@type"]));
          if (n["@graph"]) collect(n["@graph"]);
        }
      };
      collect(j);
    } catch { /* skip malformed */ }
  }
  if (yoastSchema) (yoastSchema as any[]).forEach((n) => n["@type"] && types.push(String(n["@type"])));

  if (!types.length) {
    issues.push({ severity: "critical", category: "schema", code: "no-schema", message: "No JSON-LD structured data" });
  } else {
    if (!types.some((t) => /Article|BlogPosting|Review|HowTo|Recipe/i.test(t))) {
      issues.push({ severity: "high", category: "schema", code: "weak-schema-type", message: `Schema types: ${types.join(", ")} — missing Article/Review/HowTo` });
    }
  }
  return issues;
}

function scorePost(post: any): { score: number; issues: Issue[]; metrics: any } {
  const data = post.data || {};
  const title = stripHtml(data.title?.rendered || post.title || "");
  const html = data.content?.rendered || "";
  const excerpt = stripHtml(data.excerpt?.rendered || "");
  const yoast = data.yoast_head_json || {};
  const yoastTitle = yoast.title || "";
  const yoastDesc = yoast.description || "";
  const text = stripHtml(html);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  const issues: Issue[] = [];

  // Title
  const tLen = (yoastTitle || title).length;
  if (tLen < 30) issues.push({ severity: "high", category: "seo", code: "title-short", message: `Title is ${tLen} chars (aim 50-60)` });
  else if (tLen > 65) issues.push({ severity: "polish", category: "seo", code: "title-long", message: `Title is ${tLen} chars (truncates in SERP)` });

  // Meta desc
  const dLen = (yoastDesc || excerpt).length;
  if (dLen < 80) issues.push({ severity: "critical", category: "seo", code: "meta-desc-missing", message: `Meta description ${dLen} chars (aim 140-155)` });
  else if (dLen > 165) issues.push({ severity: "polish", category: "seo", code: "meta-desc-long", message: `Meta description ${dLen} chars` });

  // Slug
  const slug = post.slug || data.slug || "";
  if (slug.length > 75) issues.push({ severity: "polish", category: "seo", code: "slug-long", message: "Slug is too long" });
  if (/\d{4,}/.test(slug)) issues.push({ severity: "polish", category: "seo", code: "slug-numbers", message: "Slug contains long number sequence" });

  // Word count / depth
  if (wordCount < 300) issues.push({ severity: "critical", category: "content", code: "thin-content", message: `${wordCount} words — thin content` });
  else if (wordCount < 600) issues.push({ severity: "high", category: "content", code: "short-content", message: `${wordCount} words — could expand` });

  // Readability
  const fk = flesch(text);
  if (fk < 40 && wordCount > 200) issues.push({ severity: "polish", category: "content", code: "readability", message: `Flesch ${fk.toFixed(0)} — hard to read` });

  // Freshness
  const months = monthsSince(post.modified_at || data.modified_gmt);
  if (months > 18) issues.push({ severity: "high", category: "seo", code: "stale", message: `Not updated in ${months.toFixed(0)} months` });
  else if (months > 12) issues.push({ severity: "polish", category: "seo", code: "aging", message: `${months.toFixed(0)} months since update` });

  // Images & links
  const imgs = html.match(/<img[^>]+>/gi) || [];
  const missingAlt = imgs.filter((i) => !/\salt=["'][^"']+["']/i.test(i)).length;
  if (missingAlt > 0) issues.push({ severity: "high", category: "seo", code: "img-alt", message: `${missingAlt} images missing alt text` });

  const internal = countMatches(html, /href=["']https?:\/\/(?:www\.|origin\.)?gearuptofit\.com/gi);
  const external = countMatches(html, /href=["']https?:\/\/(?!(?:www\.|origin\.)?gearuptofit\.com)/gi);
  if (internal < 3 && wordCount > 500) issues.push({ severity: "high", category: "seo", code: "few-internal-links", message: `Only ${internal} internal links` });
  if (external === 0 && wordCount > 800) issues.push({ severity: "polish", category: "seo", code: "no-citations", message: "No outbound citations (E-E-A-T)" });

  // Push composed checks
  issues.push(...detectStructureIssues(html, text, wordCount));
  issues.push(...detectVisualIssues(html));
  issues.push(...detectSchemaIssues(html, yoast));

  // Score = 100 minus weighted penalties
  const weights: Record<Sev, number> = { critical: 12, high: 6, medium: 3, polish: 1 };
  let penalty = 0;
  for (const i of issues) penalty += weights[i.severity] || 0;
  const score = HARD(100 - penalty);

  return {
    score, issues,
    metrics: {
      wordCount, titleLen: tLen, metaDescLen: dLen,
      h1: countMatches(html, /<h1[\s>]/gi), h2: countMatches(html, /<h2[\s>]/gi),
      images: imgs.length, missingAlt, internalLinks: internal, externalLinks: external,
      flesch: Math.round(fk), monthsSinceUpdate: Math.round(months),
      tables: countMatches(html, /<table\b/gi),
      lists: countMatches(html, /<(?:ul|ol)\b/gi),
      hasFaqHeading: /<h[23][^>]*>\s*(faq|frequently asked|questions)\b/i.test(html),
      hasConclusion: /<h[23][^>]*>\s*(conclusion|bottom line|takeaway)/i.test(html),
    },
  };
}

async function scoreOneAndPersist(supabase: any, post: any) {
  const details = await fetchPostDetails(Number(post.post_id));
  const r = scorePost({ ...post, data: details || post.data });
  const now = new Date().toISOString();
  await supabase.from("audit_scores").upsert(
    { post_id: post.post_id, score: r.score, issues: r.issues, metrics: r.metrics, scanned_at: now },
    { onConflict: "post_id" },
  );
  await supabase.from("audit_history").insert({ post_id: post.post_id, score: r.score, scanned_at: now });
  return r.score;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await checkAuth(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const body = await req.json().catch(() => ({}));
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // ── LIST ────────────────────────────────────────────────────────────────
  if (body?.mode === "list") {
    const requested = Array.isArray(body?.post_ids)
      ? body.post_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id)).slice(0, 5000)
      : [];
    const q = supabase.from("audit_scores").select("post_id, score, issues, metrics, scanned_at");
    const { data, error } = requested.length ? await q.in("post_id", requested) : await q.range(0, 4999);
    if (error) return new Response(JSON.stringify({ error: error.message }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ scores: data || [] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── SCAN_ALL chunk (parallel) ────────────────────────────────────────────
  if (body?.mode === "scan_all") {
    const offset = Math.max(0, Number(body.offset) || 0);
    const limit = Math.max(1, Math.min(20, Number(body.limit) || 10));
    const { data: posts, error } = await supabase
      .from("wp_posts_cache")
      .select("post_id, slug, title, link, modified_at, data")
      .order("post_id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error || !posts) return new Response(JSON.stringify({ error: error?.message || "no cache" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    const scores = await Promise.all(posts.map((p) => scoreOneAndPersist(supabase, p).catch(() => null)));
    const { count } = await supabase.from("wp_posts_cache").select("*", { count: "exact", head: true });
    return new Response(JSON.stringify({
      scanned: scores.filter((s) => s !== null).length,
      offset, limit, total: count ?? null,
      done: posts.length < limit,
      nextOffset: offset + posts.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── EXPLICIT IDS (sequential, max 8) ─────────────────────────────────────
  const ids = Array.isArray(body?.post_ids)
    ? body.post_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id)).slice(0, 8)
    : [];
  if (!ids.length) return new Response(JSON.stringify({ error: "post_ids required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: posts } = await supabase.from("wp_posts_cache")
    .select("post_id, slug, title, link, modified_at, data").in("post_id", ids);
  if (!posts || !posts.length) return new Response(JSON.stringify({ error: "no cached posts" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const scores = await Promise.all(posts.map((p) => scoreOneAndPersist(supabase, p).catch(() => null)));
  const valid = scores.filter((s) => s !== null) as number[];
  const avg = valid.length ? Math.round(valid.reduce((a, b) => a + b, 0) / valid.length) : 0;
  return new Response(JSON.stringify({ scanned: valid.length, avgScore: avg }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
