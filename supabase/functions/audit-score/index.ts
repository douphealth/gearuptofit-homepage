// SOTA scoring engine for gearuptofit.com
// Adds: mobile-overflow heuristics, table/iframe/image responsiveness checks,
// FAQ/conclusion/intro presence, semantic entity coverage, JSON-LD detection,
// fixed-width/inline-style detection, and live HTML render fallback.
//
// Modes:
//   { mode: "list", post_ids?: number[] }   → return cached scores
//   { post_ids: number[] }                   → score exact cached post IDs synchronously (max 1)
//   { mode: "scan_all", offset?, limit? }    → legacy exact chunk, synchronous and bounded

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
type LiveInspection = {
  url: string;
  finalUrl: string;
  status: number;
  ok: boolean;
  html: string;
  contentHtml: string;
  text: string;
  wordCount: number;
  source: "article" | "main" | "entry-content" | "body" | "none";
  looks404: boolean;
  bytes: number;
};

const HARD = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function stripHtml(html: string): string {
  return decodeEntities(html.replace(/<[^>]+>/g, " ")).replace(/\s+/g, " ").trim();
}
function decodeEntities(text: string): string {
  return String(text || "")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(Number(n)))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCharCode(parseInt(n, 16)));
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

function normalizeApexUrl(value?: string | null): string {
  if (!value) return "";
  return String(value)
    .replace(/^https?:\/\/origin\.gearuptofit\.com/i, "https://gearuptofit.com")
    .replace(/^http:\/\/gearuptofit\.com/i, "https://gearuptofit.com")
    .replace(/#.*$/, "")
    .trim();
}

function stripNonContent(html: string): string {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, " ")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, " ")
    .replace(/<form\b[\s\S]*?<\/form>/gi, " ");
}

function extractLargest(html: string, re: RegExp): string {
  let best = "";
  for (const match of html.matchAll(re)) {
    const block = match[0] || "";
    if (stripHtml(stripNonContent(block)).split(/\s+/).filter(Boolean).length > stripHtml(stripNonContent(best)).split(/\s+/).filter(Boolean).length) best = block;
  }
  return best;
}

function extractLiveContent(html: string): Pick<LiveInspection, "contentHtml" | "text" | "wordCount" | "source"> {
  const candidates: Array<{ source: LiveInspection["source"]; html: string }> = [
    { source: "article", html: extractLargest(html, /<article\b[\s\S]*?<\/article>/gi) },
    { source: "main", html: extractLargest(html, /<main\b[\s\S]*?<\/main>/gi) },
    { source: "entry-content", html: extractLargest(html, /<(?:div|section)\b[^>]*class=["'][^"']*(?:entry-content|post-content|wp-block-post-content|gutf-article|td-post-content|single-post-content|article-content)[^"']*["'][^>]*>[\s\S]*?<\/(?:div|section)>/gi) },
  ];
  const scored = candidates
    .map((c) => {
      const cleaned = stripNonContent(c.html);
      const text = stripHtml(cleaned);
      const wordCount = text.split(/\s+/).filter(Boolean).length;
      return { ...c, html: cleaned, text, wordCount };
    })
    .filter((c) => c.wordCount > 0)
    .sort((a, b) => b.wordCount - a.wordCount);
  const best = scored[0];
  if (best && best.wordCount >= 80) return { contentHtml: best.html, text: best.text, wordCount: best.wordCount, source: best.source };
  const body = (html.match(/<body\b[\s\S]*?<\/body>/i)?.[0] || html);
  const bodyClean = stripNonContent(body);
  const bodyText = stripHtml(bodyClean);
  return {
    contentHtml: bodyClean,
    text: bodyText,
    wordCount: bodyText.split(/\s+/).filter(Boolean).length,
    source: bodyText ? "body" : "none",
  };
}

async function fetchLiveInspection(url: string): Promise<LiveInspection> {
  const target = normalizeApexUrl(url);
  const empty: LiveInspection = { url: target, finalUrl: target, status: 0, ok: false, html: "", contentHtml: "", text: "", wordCount: 0, source: "none", looks404: true, bytes: 0 };
  if (!target || !/^https?:\/\//i.test(target)) return empty;
  try {
    const res = await fetch(target, {
      headers: { "User-Agent": "GearupAudit/5.0 (+live-rendered-scoring)", accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
      signal: AbortSignal.timeout(5500),
    });
    const raw = await res.text().catch(() => "");
    const html = raw.length > 250_000 ? raw.slice(0, 250_000) : raw;
    const extracted = extractLiveContent(html);
    const looks404 =
      res.status === 404 ||
      /\bpage you requested could not be found\b/i.test(html) ||
      /<title>[^<]*\b(404|not found|page not found)\b[^<]*<\/title>/i.test(html) ||
      /\bnothing found\b.*\bsearching will help\b/is.test(html);
    return { url: target, finalUrl: res.url || target, status: res.status, ok: res.ok && !looks404, html, ...extracted, looks404, bytes: raw.length };
  } catch {
    return empty;
  }
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

  // ── Extra mobile/desktop layout overflow heuristics ─────────────────
  // Images with width attribute > 800 px (cut-off on phones, awkward on desktop article columns)
  const oversizedImgs = imgs.filter((i) => {
    const w = Number((i.match(/\swidth=["']?(\d{3,})/) || [])[1] || 0);
    return w > 800;
  });
  if (oversizedImgs.length) {
    issues.push({
      severity: "high", category: "visual", code: "img-oversize",
      message: `${oversizedImgs.length} image(s) with width >800px — overflow mobile, awkward on desktop`,
    });
  }
  // Tables with many columns (>=6 <th>/<td> in first row) cut off on mobile
  const firstRow = (html.match(/<tr\b[^>]*>([\s\S]*?)<\/tr>/i) || [])[1] || "";
  const colCount = countMatches(firstRow, /<t[hd]\b/gi);
  if (colCount >= 6) {
    issues.push({
      severity: "high", category: "visual", code: "table-many-cols",
      message: `Table has ${colCount} columns — guaranteed horizontal cut-off on mobile`,
    });
  }
  // Absolute / fixed positioned inline styles (escape document flow → overflow)
  const absPos = countMatches(html, /style=["'][^"']*position\s*:\s*(?:absolute|fixed)/gi);
  if (absPos > 0) {
    issues.push({
      severity: "medium", category: "visual", code: "abs-positioned",
      message: `${absPos} element(s) with absolute/fixed positioning — risk of overflow & CLS`,
    });
  }
  // Inline background-image (often huge, no responsive handling)
  if (/style=["'][^"']*background-image\s*:\s*url\(/i.test(html)) {
    issues.push({
      severity: "polish", category: "visual", code: "inline-bg-image",
      message: "Inline background-image style — bypasses responsive image pipeline",
    });
  }
  // Twitter / Instagram embeds without responsive wrapper
  const socialEmbeds = countMatches(html, /<blockquote[^>]*class=["'][^"']*(twitter-tweet|instagram-media|tiktok-embed)/gi);
  if (socialEmbeds && !/gutf-embed-wrap|embed-responsive|aspect-ratio/i.test(html)) {
    issues.push({
      severity: "medium", category: "visual", code: "social-embed-overflow",
      message: `${socialEmbeds} social embed(s) without responsive wrapper`,
    });
  }
  // white-space:nowrap on long inline text — guaranteed horizontal scroll
  if (countMatches(html, /style=["'][^"']*white-space\s*:\s*nowrap/gi) > 1) {
    issues.push({
      severity: "medium", category: "visual", code: "nowrap-overflow",
      message: "Multiple elements force white-space:nowrap — overflow on narrow screens",
    });
  }

  return issues;
}

/* ----------------------- CORE WEB VITALS HEURISTICS -------------------- */
// Static, content-level signals that correlate with CWV (LCP / CLS / INP).
// We can't measure runtime metrics from REST content alone, but we can
// surface every issue that materially harms each pillar.
function detectCwvIssues(html: string): { issues: Issue[]; cwv: any } {
  const issues: Issue[] = [];
  const imgs = html.match(/<img\b[^>]*>/gi) || [];
  const iframes = html.match(/<iframe\b[^>]*>/gi) || [];

  // ── LCP signals ─────────────────────────────────────────────────────────
  // Hero image (first <img> in content) — needs fetchpriority=high, eager, no lazy.
  const firstImg = imgs[0] || "";
  const hasFetchPriority = /\bfetchpriority=["']high["']/i.test(firstImg);
  const heroLazy = /\bloading=["']lazy["']/i.test(firstImg);
  if (firstImg && !hasFetchPriority) {
    issues.push({
      severity: "high", category: "visual", code: "lcp-no-fetchpriority",
      message: "Hero image missing fetchpriority=\"high\" — slows LCP",
    });
  }
  if (firstImg && heroLazy) {
    issues.push({
      severity: "high", category: "visual", code: "lcp-hero-lazy",
      message: "Hero image is lazy-loaded — delays LCP",
    });
  }
  // Non-WebP/AVIF hero
  if (firstImg && /\.(jpg|jpeg|png)["'?\s]/i.test(firstImg)) {
    issues.push({
      severity: "medium", category: "visual", code: "lcp-hero-format",
      message: "Hero image is JPG/PNG — convert to WebP/AVIF for faster LCP",
    });
  }
  // Total image weight proxy: many large images above the fold
  const aboveFold = imgs.slice(0, 3);
  const eagerCount = aboveFold.filter((i) => !/\bloading=["']lazy["']/i.test(i)).length;
  if (eagerCount > 2) {
    issues.push({
      severity: "medium", category: "visual", code: "lcp-many-eager",
      message: `${eagerCount} eager-loaded images above the fold — competes for LCP bandwidth`,
    });
  }

  // ── CLS signals ─────────────────────────────────────────────────────────
  const imgsNoDims = imgs.filter((i) => !/\swidth=/i.test(i) || !/\sheight=/i.test(i));
  if (imgsNoDims.length > 0) {
    issues.push({
      severity: imgsNoDims.length > 4 ? "high" : "medium",
      category: "visual", code: "cls-img-no-dims",
      message: `${imgsNoDims.length} image(s) without explicit width/height — causes CLS`,
    });
  }
  const iframesNoDims = iframes.filter((i) => !/\swidth=/i.test(i) || !/\sheight=/i.test(i));
  if (iframesNoDims.length > 0) {
    issues.push({
      severity: "medium", category: "visual", code: "cls-iframe-no-dims",
      message: `${iframesNoDims.length} iframe(s) without dimensions — causes CLS`,
    });
  }
  // Web fonts loaded with @font-face inside content (causes FOIT/FOUT layout shift)
  if (/@font-face/i.test(html)) {
    issues.push({
      severity: "polish", category: "visual", code: "cls-font-in-content",
      message: "@font-face declared in post content — risks layout shift; move to theme with font-display:swap",
    });
  }
  // Ad/affiliate iframes without aspect-ratio container
  const adlikeIframes = iframes.filter((i) => /amazon|adsbygoogle|affiliate|impact|skimresources/i.test(i));
  if (adlikeIframes.length && !/aspect-ratio|gutf-embed-wrap|min-height/i.test(html)) {
    issues.push({
      severity: "medium", category: "visual", code: "cls-ad-no-reserve",
      message: `${adlikeIframes.length} ad/affiliate iframe(s) without reserved space — causes CLS on load`,
    });
  }

  // ── INP signals ─────────────────────────────────────────────────────────
  const inlineScripts = (html.match(/<script\b(?![^>]*\bsrc=)[^>]*>[\s\S]*?<\/script>/gi) || []);
  const heavyInline = inlineScripts.filter((s) => s.length > 4000);
  if (heavyInline.length) {
    issues.push({
      severity: "high", category: "visual", code: "inp-heavy-inline-script",
      message: `${heavyInline.length} large inline script(s) (>4KB) — blocks interactivity`,
    });
  }
  const externalScripts = (html.match(/<script\b[^>]*\bsrc=["'][^"']+["'][^>]*>/gi) || []);
  const blockingScripts = externalScripts.filter(
    (s) => !/\b(async|defer)\b/i.test(s),
  );
  if (blockingScripts.length) {
    issues.push({
      severity: "high", category: "visual", code: "inp-blocking-script",
      message: `${blockingScripts.length} render-blocking script(s) (no async/defer)`,
    });
  }
  if (externalScripts.length > 6) {
    issues.push({
      severity: "medium", category: "visual", code: "inp-script-bloat",
      message: `${externalScripts.length} third-party scripts in content — risks INP`,
    });
  }

  // DOM size proxy (huge HTML payload)
  const domNodes = countMatches(html, /<[a-z][a-z0-9]*\b/gi);
  if (domNodes > 1500) {
    issues.push({
      severity: "medium", category: "visual", code: "cwv-dom-bloat",
      message: `~${domNodes} DOM nodes in post content — heavy DOM hurts INP/CLS`,
    });
  }

  // ── Layout-overflow → CLS/LCP impact attribution ───────────────────────
  const oversizedImgs = imgs.filter((i) => Number((i.match(/\swidth=["']?(\d{3,})/) || [])[1] || 0) > 800).length;
  const tableUnwrapped = (() => {
    const total = countMatches(html, /<table\b/gi);
    const wrapped = countMatches(html, /<(?:div|figure)[^>]*class=["'][^"']*(?:table-wrapper|comparison-table-wrapper|wp-block-table|overflow-x-auto|table-responsive|gutf-table-wrap)[^"']*["'][^>]*>\s*<table/gi);
    return Math.max(0, total - wrapped);
  })();
  const fixedIframes = iframes.filter((i) => /\bwidth=["']?\d{3,}/.test(i) && !/\bstyle=["'][^"']*max-width/i.test(i)).length;
  const layoutOverflowCount = oversizedImgs + tableUnwrapped + fixedIframes;
  if (layoutOverflowCount > 0) {
    issues.push({
      severity: layoutOverflowCount > 2 ? "high" : "medium",
      category: "visual", code: "cwv-overflow-impact",
      message: `${layoutOverflowCount} cut-off/overflow element(s) likely to inflate CLS and shift LCP candidates`,
    });
  }

  // Compose CWV sub-score (0-100) — now also penalised for overflow elements
  const cwvWeights: Record<Sev, number> = { critical: 25, high: 15, medium: 8, polish: 3 };
  let cwvPenalty = 0;
  for (const i of issues) cwvPenalty += cwvWeights[i.severity] || 0;
  const cwvScore = HARD(100 - cwvPenalty);

  // Sub-pillar scores — used by the UI to sort by worst LCP / worst CLS.
  const lcpPenalty =
    (firstImg && !hasFetchPriority ? 15 : 0) +
    (firstImg && heroLazy ? 20 : 0) +
    (firstImg && /\.(jpg|jpeg|png)["'?\s]/i.test(firstImg) ? 8 : 0) +
    (eagerCount > 2 ? 8 : 0) +
    (oversizedImgs * 4);
  const clsPenalty =
    imgsNoDims.length * 4 +
    iframesNoDims.length * 4 +
    adlikeIframes.length * 6 +
    (/@font-face/i.test(html) ? 5 : 0) +
    tableUnwrapped * 6 +
    fixedIframes * 6 +
    oversizedImgs * 3;
  const inpPenalty =
    heavyInline.length * 12 +
    blockingScripts.length * 10 +
    (externalScripts.length > 6 ? 8 : 0) +
    (domNodes > 1500 ? 8 : 0);

  return {
    issues,
    cwv: {
      score: cwvScore,
      lcpScore: HARD(100 - lcpPenalty),
      clsScore: HARD(100 - clsPenalty),
      inpScore: HARD(100 - inpPenalty),
      lcp: {
        heroFetchPriority: hasFetchPriority,
        heroLazy,
        heroFormat: /\.(webp|avif)["'?\s]/i.test(firstImg) ? "modern" : (firstImg ? "legacy" : "none"),
        eagerAboveFold: eagerCount,
        oversizedImages: oversizedImgs,
      },
      cls: {
        imagesMissingDims: imgsNoDims.length,
        iframesMissingDims: iframesNoDims.length,
        adsWithoutReserve: adlikeIframes.length,
        unwrappedTables: tableUnwrapped,
        fixedWidthIframes: fixedIframes,
      },
      inp: {
        inlineScripts: inlineScripts.length,
        heavyInlineScripts: heavyInline.length,
        blockingScripts: blockingScripts.length,
        externalScripts: externalScripts.length,
      },
      layoutOverflowCount,
      domNodes,
    },
  };
}

/* ----------------------------- SEO / AEO ------------------------------ */
function detectStructureIssues(html: string, text: string, wordCount: number, fullHtml = html): Issue[] {
  const issues: Issue[] = [];

  // H1 hierarchy
  const h1 = countMatches(fullHtml, /<h1[\s>]/gi);
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
  if (!/(?:last\s+updated|updated\s+on|reviewed\s+on)\b/i.test(fullHtml.slice(0, 8000))) {
    issues.push({ severity: "polish", category: "seo", code: "no-updated-date", message: "No 'last updated' date visible to readers" });
  }

  return issues;
}

function detectContentIntegrityIssues(html: string, text: string, live?: LiveInspection | null): Issue[] {
  const issues: Issue[] = [];
  const visible = decodeEntities(text);
  if (live && (!live.ok || live.looks404)) {
    issues.push({
      severity: "critical", category: "content", code: live.looks404 ? "live-404" : "live-unreachable",
      message: `Live page is not a valid published article (HTTP ${live.status || "0"}) — ${live.url}`,
    });
  }
  if (live && live.ok && live.wordCount < 120) {
    issues.push({ severity: "critical", category: "content", code: "live-empty", message: `Live article content is almost empty (${live.wordCount} words extracted from ${live.source})` });
  }
  if (/@context\s*[:{]|schema\.org|"@graph"|"@type"\s*:/i.test(visible)) {
    issues.push({ severity: "critical", category: "content", code: "schema-leak-visible", message: "JSON-LD/schema markup is visible inside reader text" });
  }
  if (/\/\*[^*]{0,80}(?:site-wide|sidebar|widget|gutf|wp-|important)|\.[a-z][\w-]*(?:>|\s*,|\s*\{)|@media\s*\(/i.test(visible)) {
    issues.push({ severity: "critical", category: "visual", code: "css-leak-visible", message: "CSS selectors/rules are visible inside reader text" });
  }
  if (/\{\s*"(?:@context|@type|headline|description)"/i.test(visible) || /&quot;@context&quot;|&#8220;@context/i.test(text)) {
    issues.push({ severity: "critical", category: "content", code: "encoded-json-visible", message: "Encoded JSON/structured-data fragments are visible in the post body" });
  }
  const badShortcodes = visible.match(/\[(?:vc_|et_|caption|gallery|embed|shortcode)[^\]]*\]/gi) || [];
  if (badShortcodes.length) {
    issues.push({ severity: "high", category: "content", code: "shortcode-leak", message: `${badShortcodes.length} raw shortcode(s) visible to readers` });
  }
  const emptyBlocks = countMatches(html, /<(?:p|h2|h3|li)\b[^>]*>\s*(?:&nbsp;|<br\s*\/?>|\s)*<\/(?:p|h2|h3|li)>/gi);
  if (emptyBlocks > 8) {
    issues.push({ severity: "medium", category: "content", code: "empty-html-blocks", message: `${emptyBlocks} empty paragraph/list/heading blocks in rendered content` });
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

function scorePost(post: any, live?: LiveInspection | null): { score: number; issues: Issue[]; metrics: any } {
  const data = post.data || {};
  const title = stripHtml(data.title?.rendered || post.title || "");
  const restHtml = data.content?.rendered || "";
  const html = live?.contentHtml || restHtml;
  const fullHtml = live?.html || restHtml;
  const excerpt = stripHtml(data.excerpt?.rendered || "");
  const yoast = data.yoast_head_json || {};
  const yoastTitle = yoast.title || "";
  const yoastDesc = yoast.description || "";
  const text = live?.text || stripHtml(html);
  const wordCount = live?.wordCount ?? text.split(/\s+/).filter(Boolean).length;

  const issues: Issue[] = [];

  if (!live) {
    issues.push({ severity: "high", category: "content", code: "live-not-inspected", message: "Score used REST content only because live HTML inspection was unavailable" });
  } else if (!live.ok || live.looks404) {
    issues.push({ severity: "critical", category: "content", code: "live-invalid", message: `Live URL failed validation (HTTP ${live.status || "0"}) — score forced very low` });
  } else {
    const restWords = stripHtml(restHtml).split(/\s+/).filter(Boolean).length;
    const delta = Math.abs(restWords - wordCount);
    if (restWords > 0 && delta > Math.max(250, restWords * 0.35)) {
      issues.push({ severity: "high", category: "content", code: "rest-live-mismatch", message: `REST body (${restWords} words) differs from live rendered article (${wordCount} words); scoring uses live HTML` });
    }
  }

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
  const missingAlt = imgs.filter((i: string) => !/\salt=["'][^"']+["']/i.test(i)).length;
  if (missingAlt > 0) issues.push({ severity: "high", category: "seo", code: "img-alt", message: `${missingAlt} images missing alt text` });

  const internal = countMatches(html, /href=["']https?:\/\/(?:www\.|origin\.)?gearuptofit\.com/gi);
  const external = countMatches(html, /href=["']https?:\/\/(?!(?:www\.|origin\.)?gearuptofit\.com)/gi);
  if (internal < 3 && wordCount > 500) issues.push({ severity: "high", category: "seo", code: "few-internal-links", message: `Only ${internal} internal links` });
  if (external === 0 && wordCount > 800) issues.push({ severity: "polish", category: "seo", code: "no-citations", message: "No outbound citations (E-E-A-T)" });

  // Push composed checks
  issues.push(...detectStructureIssues(html, text, wordCount, fullHtml));
  issues.push(...detectContentIntegrityIssues(html, text, live));
  issues.push(...detectVisualIssues(html));
  issues.push(...detectSchemaIssues(fullHtml, yoast));
  const cwvOut = detectCwvIssues(fullHtml);
  issues.push(...cwvOut.issues);

  // Score = 100 minus weighted penalties
  const weights: Record<Sev, number> = { critical: 18, high: 8, medium: 4, polish: 1 };
  let penalty = 0;
  for (const i of issues) penalty += weights[i.severity] || 0;
  let score = HARD(100 - penalty);
  if (live && (!live.ok || live.looks404)) score = Math.min(score, 3);
  else if (live && live.wordCount < 120) score = Math.min(score, 8);
  if (issues.some((i) => ["schema-leak-visible", "css-leak-visible", "encoded-json-visible"].includes(i.code))) score = Math.min(score, 25);

  return {
    score, issues,
    metrics: {
      wordCount, titleLen: tLen, metaDescLen: dLen,
      scoredFrom: live?.ok ? "live_html" : "rest_fallback",
      live: live ? { status: live.status, ok: live.ok, url: live.url, finalUrl: live.finalUrl, source: live.source, wordCount: live.wordCount, bytes: live.bytes } : null,
      h1: countMatches(fullHtml, /<h1[\s>]/gi), h2: countMatches(html, /<h2[\s>]/gi),
      images: imgs.length, missingAlt, internalLinks: internal, externalLinks: external,
      flesch: Math.round(fk), monthsSinceUpdate: Math.round(months),
      tables: countMatches(html, /<table\b/gi),
      lists: countMatches(html, /<(?:ul|ol)\b/gi),
      hasFaqHeading: /<h[23][^>]*>\s*(faq|frequently asked|questions)\b/i.test(html),
      hasConclusion: /<h[23][^>]*>\s*(conclusion|bottom line|takeaway)/i.test(html),
      cwv: cwvOut.cwv,
    },
  };
}

async function scoreOneAndPersist(supabase: any, post: any) {
  const details = await fetchPostDetails(Number(post.post_id));
  const liveUrl = normalizeApexUrl(post.link || details?.link || "");
  const live = await fetchLiveInspection(liveUrl);
  const r = scorePost({ ...post, data: details || post.data, link: liveUrl }, live);

  const now = new Date().toISOString();
  await supabase.from("audit_scores").upsert(
    { post_id: post.post_id, score: r.score, issues: r.issues, metrics: r.metrics, scanned_at: now },
    { onConflict: "post_id" },
  );
  await supabase.from("audit_history").insert({ post_id: post.post_id, score: r.score, scanned_at: now });
  return r.score;
}

async function persistScoreFailure(supabase: any, post: any, error: unknown) {
  const now = new Date().toISOString();
  const issue: Issue = {
    severity: "critical", category: "content", code: "score-failed",
    message: `Scoring failed for this URL: ${error instanceof Error ? error.message : "unknown error"}`,
  };
  await supabase.from("audit_scores").upsert(
    { post_id: post.post_id, score: 0, issues: [issue], metrics: { scoredFrom: "failed", live: { url: post.link || "" } }, scanned_at: now },
    { onConflict: "post_id" },
  );
  await supabase.from("audit_history").insert({ post_id: post.post_id, score: 0, scanned_at: now });
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
    const rows = data || [];
    if (requested.length) {
      const found = new Set(rows.map((r: any) => Number(r.post_id)));
      const missing = requested.filter((id: number) => !found.has(id)).map((id: number) => ({
        post_id: id,
        score: 0,
        issues: [{ severity: "critical", category: "content", code: "not-scored", message: "This published URL has not been scored yet — run Re-score all or score this post immediately" }],
        metrics: { scoredFrom: "missing" },
        scanned_at: null,
      }));
      return new Response(JSON.stringify({ scores: [...rows, ...missing] }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ scores: rows }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── SCAN_ALL chunk (background) ──────────────────────────────────────────
  if (body?.mode === "scan_all") {
    const offset = Math.max(0, Number(body.offset) || 0);
    const limit = Math.max(1, Math.min(2, Number(body.limit) || 2));
    const { data: posts, error } = await supabase
      .from("wp_posts_cache")
      .select("post_id, slug, title, link, modified_at, data")
      .order("post_id", { ascending: true })
      .range(offset, offset + limit - 1);
    if (error || !posts) return new Response(JSON.stringify({ error: error?.message || "no cache" }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });

    // Offload heavy scoring to background to stay under the 2s CPU/wall budget
    // @ts-ignore - EdgeRuntime is provided by Supabase Edge runtime
    EdgeRuntime.waitUntil((async () => {
      for (const p of posts) {
        try { await scoreOneAndPersist(supabase, p); }
        catch (e) { await persistScoreFailure(supabase, p, e); }
      }
    })());

    const { count } = await supabase.from("wp_posts_cache").select("*", { count: "exact", head: true });
    return new Response(JSON.stringify({
      scanned: posts.length,
      queued: true,
      offset, limit, total: count ?? null,
      done: posts.length < limit,
      nextOffset: offset + posts.length,
    }), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  // ── EXPLICIT IDS (background, max 4) ─────────────────────────────────────
  const ids = Array.isArray(body?.post_ids)
    ? body.post_ids.map((id: unknown) => Number(id)).filter((id: number) => Number.isFinite(id)).slice(0, 4)
    : [];
  if (!ids.length) return new Response(JSON.stringify({ error: "post_ids required" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const { data: posts } = await supabase.from("wp_posts_cache")
    .select("post_id, slug, title, link, modified_at, data").in("post_id", ids);
  if (!posts || !posts.length) return new Response(JSON.stringify({ error: "no cached posts" }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  // Offload heavy scoring to background; client polls list mode for updates
  // @ts-ignore - EdgeRuntime is provided by Supabase Edge runtime
  EdgeRuntime.waitUntil((async () => {
    for (const p of posts) {
      try { await scoreOneAndPersist(supabase, p); }
      catch (e) { await persistScoreFailure(supabase, p, e); }
    }
  })());

  return new Response(JSON.stringify({ scanned: posts.length, queued: true }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
