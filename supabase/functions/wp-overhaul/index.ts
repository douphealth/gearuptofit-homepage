// FULL OVERHAUL — applies AI fixes + visual responsive wrappers + JSON-LD in one pass.
//
// Strategy (safe, idempotent):
//   1. GET raw post content via REST (?context=edit, requires app password).
//   2. Apply visual transforms:
//        - Wrap unwrapped <table> in <div class="gutf-table-wrap">…</div>
//        - Wrap unwrapped <iframe> in <div class="gutf-embed-wrap">…</div>
//        - Strip fixed style="width:Xpx" on img/div when X > 360
//        - Add loading="lazy" + decoding="async" on <img> missing them
//        - Apply alt text suggestions to images that match imageContext
//   3. Inject AI blocks IF NOT ALREADY PRESENT (idempotent markers):
//        - <!--gutf:intro-->        before first paragraph (only if not present)
//        - <!--gutf:faq-->          before conclusion or at end
//        - <!--gutf:bottom-line-->  at very end
//        - <!--gutf:jsonld-->       JSON-LD <script> block
//        - <!--gutf:responsive-->   one <style> with overflow guards (only once)
//   4. PUT updated content back. Title + excerpt updated too.
//
// Each marker is checked before insertion → re-running the overhaul is safe.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WP_BASE = "https://origin.gearuptofit.com/wp-json/wp/v2";
const APEX = "https://gearuptofit.com";

function jsonRes(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function readBody(req: Request) {
  try { return await req.json() as Record<string, any>; } catch { return {}; }
}

const RESPONSIVE_CSS = `<style>/*gutf-overhaul-v1*/
.gutf-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;margin:1.25em 0}
.gutf-table-wrap table{min-width:100%}
.gutf-embed-wrap{position:relative;width:100%;max-width:100%;aspect-ratio:16/9;margin:1.25em 0}
.gutf-embed-wrap iframe{position:absolute;inset:0;width:100%!important;height:100%!important;max-width:100%;border:0}
.gutf-faq{margin:2em 0;padding:1.5em;border:1px solid rgba(0,0,0,.08);border-radius:12px;background:rgba(0,0,0,.02)}
.gutf-faq h2{margin-top:0}
.gutf-faq-item{margin:1em 0;padding-bottom:1em;border-bottom:1px solid rgba(0,0,0,.06)}
.gutf-faq-item:last-child{border-bottom:0;padding-bottom:0}
.gutf-faq-item h3{margin:0 0 .5em;font-size:1.05em}
.gutf-bottom-line{margin:2em 0;padding:1.25em 1.5em;border-left:4px solid #e11d48;background:rgba(225,29,72,.06);border-radius:6px}
.gutf-bottom-line h2{margin-top:0}
@media(max-width:640px){
  .gutf-article img,.gutf-article video,.gutf-article iframe{max-width:100%!important;height:auto!important}
  .gutf-article *{max-width:100%!important;box-sizing:border-box!important}
}
</style>`;

function applyVisualFixes(raw: string): { html: string; changes: string[] } {
  const changes: string[] = [];
  let html = raw;

  // Wrap unwrapped <table>...</table> blocks
  html = html.replace(/<table\b[\s\S]*?<\/table>/gi, (match: string, offset: number, src: string) => {
    const before = src.slice(Math.max(0, offset - 120), offset);
    if (/gutf-table-wrap|table-responsive|wp-block-table|comparison-table-wrapper|overflow-x-auto/i.test(before)) return match;
    changes.push("wrapped-table");
    return `<div class="gutf-table-wrap">${match}</div>`;
  });

  // Wrap unwrapped <iframe> (YouTube etc.)
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (match: string, offset: number, src: string) => {
    const before = src.slice(Math.max(0, offset - 80), offset);
    if (/gutf-embed-wrap|embed-responsive|video-wrapper/i.test(before)) return match;
    changes.push("wrapped-iframe");
    return `<div class="gutf-embed-wrap">${match}</div>`;
  });

  // Strip fixed style="width:Xpx" when X>360
  html = html.replace(/style=(["'])([^"']*)\1/gi, (m, q, css) => {
    const fixed = css.replace(/width\s*:\s*(\d{3,})px\s*;?/gi, (_mm: string, n: string) =>
      Number(n) > 360 ? "" : `width:${n}px;`,
    );
    if (fixed !== css) changes.push("stripped-fixed-width");
    return `style=${q}${fixed.trim()}${q}`;
  });

  // Lazy-loading + decoding=async on imgs
  html = html.replace(/<img\b([^>]*)>/gi, (m, attrs) => {
    let a = attrs;
    let touched = false;
    if (!/\bloading=/i.test(a)) { a += ' loading="lazy"'; touched = true; }
    if (!/\bdecoding=/i.test(a)) { a += ' decoding="async"'; touched = true; }
    if (touched) changes.push("img-lazy");
    return `<img${a}>`;
  });

  return { html, changes };
}

function ensureResponsiveCss(html: string): { html: string; added: boolean } {
  if (html.includes("/*gutf-overhaul-v1*/")) return { html, added: false };
  return { html: RESPONSIVE_CSS + "\n" + html, added: true };
}

function injectIntro(html: string, introHtml: string): { html: string; added: boolean } {
  if (!introHtml || html.includes("<!--gutf:intro-->")) return { html, added: false };
  // Insert at the very beginning of post content
  return { html: `<!--gutf:intro-->${introHtml}<!--/gutf:intro-->\n${html}`, added: true };
}

function injectFaq(html: string, faqHtml: string): { html: string; added: boolean } {
  if (!faqHtml || html.includes("<!--gutf:faq-->")) return { html, added: false };
  // Inject before <!--gutf:bottom-line--> if it exists, else append at end
  const marker = "<!--gutf:bottom-line-->";
  if (html.includes(marker)) {
    return { html: html.replace(marker, `<!--gutf:faq-->${faqHtml}<!--/gutf:faq-->\n${marker}`), added: true };
  }
  return { html: `${html}\n<!--gutf:faq-->${faqHtml}<!--/gutf:faq-->`, added: true };
}

function injectConclusion(html: string, conclusionHtml: string): { html: string; added: boolean } {
  if (!conclusionHtml || html.includes("<!--gutf:bottom-line-->")) return { html, added: false };
  return { html: `${html}\n<!--gutf:bottom-line-->${conclusionHtml}<!--/gutf:bottom-line-->`, added: true };
}

function injectJsonLd(html: string, jsonLd: any): { html: string; added: boolean } {
  if (!jsonLd || html.includes("<!--gutf:jsonld-->")) return { html, added: false };
  const payload = JSON.stringify(jsonLd).replace(/<\/script/gi, "<\\/script");
  const block = `<!--gutf:jsonld--><script type="application/ld+json">${payload}</script><!--/gutf:jsonld-->`;
  return { html: `${html}\n${block}`, added: true };
}

function stripNonContent(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<header\b[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, "");
}

function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim().length;
}

function findBalancedElement(html: string, tag: string, start: number): string {
  const openClose = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  openClose.lastIndex = start;
  let depth = 0;
  let first = -1;
  let m: RegExpExecArray | null;
  while ((m = openClose.exec(html))) {
    const token = m[0];
    const isClose = token.startsWith(`</`);
    const selfClosing = /\/\s*>$/.test(token);
    if (!isClose) {
      if (depth === 0) first = m.index;
      if (!selfClosing) depth++;
    } else {
      depth--;
      if (depth === 0 && first >= 0) return html.slice(first, openClose.lastIndex);
    }
  }
  return "";
}

function extractPublicPostContent(pageHtml: string): { html: string; source: string; wordish: number } {
  const clean = stripNonContent(pageHtml);
  const candidates: Array<{ source: string; html: string }> = [];
  for (const match of clean.matchAll(/<(article|main)\b[^>]*>/gi)) {
    const html = findBalancedElement(clean, match[1].toLowerCase(), match.index || 0);
    if (html) candidates.push({ source: match[1].toLowerCase(), html });
  }
  const contentClass = /<div\b[^>]*class=(['"])[^'"]*(?:entry-content|post-content|wp-block-post-content|elementor-widget-theme-post-content|elementor-widget-text-editor)[^'"]*\1[^>]*>/gi;
  for (const match of clean.matchAll(contentClass)) {
    const html = findBalancedElement(clean, "div", match.index || 0);
    if (html) candidates.push({ source: "content-container", html });
  }
  const best = candidates
    .map((c) => ({ ...c, wordish: textLength(c.html) }))
    .filter((c) => c.wordish > 700 && /<(p|h2|h3|ul|ol|table|figure)\b/i.test(c.html))
    .sort((a, b) => b.wordish - a.wordish)[0];
  return best || { html: "", source: "none", wordish: 0 };
}

function hasLiveContentSlot(pageHtml: string): boolean {
  const clean = stripNonContent(pageHtml);
  return /<(article|main)\b/i.test(clean) || /class=(['"])[^'"]*(entry-content|post-content|wp-block-post-content|elementor-widget-theme-post-content)[^'"]*\1/i.test(clean);
}

function containsAppliedSignal(html: string): boolean {
  return /gutf-faq|gutf-bottom-line|gutf-overhaul-v1|gutf:intro|application\/ld\+json/i.test(html || "");
}

function canonicalPublicUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.hostname = "gearuptofit.com";
    u.protocol = "https:";
    return u.toString();
  } catch {
    return url.replace(/^https?:\/\/origin\.gearuptofit\.com/i, APEX);
  }
}

function cleanPublicUrl(url: string): string {
  const canonical = canonicalPublicUrl(url);
  if (!canonical) return "";
  try {
    const u = new URL(canonical);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return canonical.split("#")[0].split("?")[0];
  }
}

async function purgeCloudflareUrl(url: string) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const cleanUrl = cleanPublicUrl(url);
  if (!token || !cleanUrl) return { attempted: false, ok: false, reason: token ? "missing_url" : "missing_token" };
  async function cfFetch(target: string, init: RequestInit = {}) {
    const bearerHeaders = { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>;
    const bearer = await fetch(target, { ...init, headers: bearerHeaders });
    if (bearer.status !== 403 && bearer.status !== 401) return bearer;
    const keyHeaders = { ...(init.headers || {}), "X-Auth-Email": "Papalexios@gmail.com", "X-Auth-Key": token, "Content-Type": "application/json" } as Record<string, string>;
    return await fetch(target, { ...init, headers: keyHeaders });
  }
  try {
    const zonesRes = await cfFetch("https://api.cloudflare.com/client/v4/zones?name=gearuptofit.com");
    const zonesText = await zonesRes.text();
    let zones: any = {}; try { zones = JSON.parse(zonesText); } catch { zones = {}; }
    const zoneId = zones?.result?.[0]?.id;
    if (!zonesRes.ok || !zoneId) return { attempted: true, ok: false, stage: "zone_lookup", status: zonesRes.status, detail: zonesText.slice(0, 240) };

    const variants = Array.from(new Set([
      cleanUrl,
      cleanUrl.endsWith("/") ? cleanUrl.slice(0, -1) : `${cleanUrl}/`,
    ]));
    const purgeRes = await cfFetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
      method: "POST",
      body: JSON.stringify({ files: variants }),
    });
    const purgeText = await purgeRes.text();
    let purge: any = {}; try { purge = JSON.parse(purgeText); } catch { purge = {}; }
    return { attempted: true, ok: purgeRes.ok && purge?.success !== false, status: purgeRes.status, files: variants, detail: purgeText.slice(0, 240) };
  } catch (e) {
    return { attempted: true, ok: false, error: String((e as any)?.message || e) };
  }
}

function runMarker(runId: string): string {
  return `gutf-publish-run-${runId}`;
}

function runMarkerHtml(runId: string): string {
  const marker = runMarker(runId);
  return `<!--${marker}--><span class="gutf-publish-verification" data-gutf-run="${marker}" hidden></span>`;
}

function containsRunMarker(html: string, runId: string): boolean {
  return !!runId && String(html || "").includes(runMarker(runId));
}

const LIVE_MIN_VISIBLE_WORDS = 600;
const LIVE_MIN_VISIBLE_H2 = 3;

function stripInvisibleHtml(html: string): string {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+\b(?:hidden|aria-hidden=(['"])true\1)[^>]*>[\s\S]*?<\/[^>]+>/gi, " ")
    .replace(/<[^>]+style=(['"])[^'"]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^'"]*\1[^>]*>[\s\S]*?<\/[^>]+>/gi, " ");
}

function sampleH2(html: string): string[] {
  return Array.from(String(html || "").matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((m) => stripTags(m[1]).slice(0, 120))
    .filter(Boolean)
    .slice(0, 8);
}

function analyzeLiveVisibility(pageHtml: string, runId: string, exactRunRequired: boolean) {
  const rawPage = String(pageHtml || "");
  const clean = stripInvisibleHtml(stripNonContent(pageHtml));
  const candidates: Array<{ source: string; html: string; priority: number }> = [];
  const contentClass = /<div\b[^>]*class=(['"])[^'"]*(?:entry-content|post-content|wp-block-post-content|elementor-widget-theme-post-content|elementor-widget-text-editor|gutf-article)[^'"]*\1[^>]*>/gi;
  for (const match of clean.matchAll(contentClass)) {
    const html = findBalancedElement(clean, "div", match.index || 0);
    if (html) candidates.push({ source: "content-container", html, priority: 4000 });
  }
  for (const match of clean.matchAll(/<(article|main)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    const html = findBalancedElement(clean, tag, match.index || 0);
    if (html) candidates.push({ source: tag, html, priority: tag === "article" ? 2500 : 1800 });
  }
  candidates.push({ source: "full-page-fallback", html: clean, priority: 0 });

  const scored = candidates.map((c) => {
    const hasRunMarker = containsRunMarker(c.html, runId);
    const hasSignals = containsAppliedSignal(c.html);
    const words = htmlWordCount(c.html);
    const h2 = countTag(c.html, "h2");
    const score = (hasRunMarker ? 1_000_000 : 0) + (hasSignals ? 250_000 : 0) + c.priority + (h2 * 500) + words;
    return { ...c, hasRunMarker, hasSignals, words, h2, score };
  });
  const best = scored.sort((a, b) => b.score - a.score)[0] || scored[0];
  const text = stripTags(best?.html || "").slice(0, 600);
  const fullHasRunMarker = containsRunMarker(rawPage, runId);
  const fullHasSignals = containsAppliedSignal(clean);
  const visibleZoneOk = !!best && best.source !== "full-page-fallback";
  return {
    live_has_content_slot: hasLiveContentSlot(clean),
    live_has_signals: fullHasSignals,
    live_has_run_marker: fullHasRunMarker,
    live_body_word_count: best?.words || 0,
    live_body_h2_count: best?.h2 || 0,
    live_body_ok: visibleZoneOk && (!exactRunRequired || fullHasRunMarker) && (best?.words || 0) >= LIVE_MIN_VISIBLE_WORDS && (best?.h2 || 0) >= LIVE_MIN_VISIBLE_H2,
    live_content_source: best?.source || "none",
    live_selected_html_bytes: (best?.html || "").length,
    live_heading_samples: sampleH2(best?.html || ""),
    live_text_sample: text,
    live_min_word_count: LIVE_MIN_VISIBLE_WORDS,
    live_min_h2_count: LIVE_MIN_VISIBLE_H2,
    live_exact_run_required: exactRunRequired,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLiveHtml(url: string, runId: string, attempt: number, cacheBust = true) {
  const cleanUrl = cleanPublicUrl(url);
  const sep = cleanUrl.includes("?") ? "&" : "?";
  const fetchUrl = cacheBust ? `${cleanUrl}${sep}_gutf_verify=${encodeURIComponent(runId)}_${attempt}_${Date.now()}` : cleanUrl;
  const res = await fetch(fetchUrl, {
    headers: {
      "User-Agent": "GearupAudit/3.1-public-verify",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
  return { ok: res.ok, status: res.status, url: cleanUrl, fetched_url: fetchUrl, html: res.ok ? await res.text() : await res.text().catch(() => "") };
}

async function verifyLiveVisibility(url: string, runId: string, exactRunRequired: boolean, attempts = 5, cacheBust = true) {
  let last: any = {
    live_url: cleanPublicUrl(url),
    live_cache_busted: cacheBust,
    live_status: null,
    live_body_word_count: 0,
    live_body_h2_count: 0,
    live_body_ok: false,
    live_has_content_slot: null,
    live_has_signals: false,
    live_has_run_marker: false,
    live_content_source: "not-fetched",
    live_min_word_count: LIVE_MIN_VISIBLE_WORDS,
    live_min_h2_count: LIVE_MIN_VISIBLE_H2,
    live_exact_run_required: exactRunRequired,
    live_attempts: 0,
  };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const liveRes = await fetchLiveHtml(url, runId || `existing_${crypto.randomUUID()}`, attempt, cacheBust);
      const analysis = liveRes.ok ? analyzeLiveVisibility(liveRes.html, runId, exactRunRequired) : {};
      last = { ...last, ...analysis, live_url: liveRes.url, live_fetched_url: liveRes.fetched_url, live_cache_busted: cacheBust, live_status: liveRes.status, live_attempts: attempt, live_visual_report: liveRes.ok ? visualValidate(liveRes.html) : null };
      const exactOk = exactRunRequired ? last.live_has_run_marker : true;
      if (liveRes.ok && exactOk && last.live_body_ok) break;
    } catch (e) {
      last = { ...last, live_attempts: attempt, live_error: String((e as any)?.message || e) };
    }
    await sleep(900 * attempt);
  }
  return last;
}

async function verifyCanonicalAndBusted(url: string, runId: string, exactRunRequired: boolean, attempts = 5) {
  const canonicalUrl = cleanPublicUrl(url);
  let canonical = await verifyLiveVisibility(canonicalUrl, runId, exactRunRequired, attempts, false);
  let purge = null;
  if (!canonical.live_body_ok || (exactRunRequired && !canonical.live_has_run_marker)) {
    purge = await purgeCloudflareUrl(canonicalUrl);
    if (purge?.ok) canonical = await verifyLiveVisibility(canonicalUrl, runId, exactRunRequired, Math.max(2, attempts), false);
  }
  const busted = await verifyLiveVisibility(canonicalUrl, runId, exactRunRequired, Math.max(2, Math.min(3, attempts)), true);
  const canonicalOk = !!canonical.live_body_ok && (!exactRunRequired || !!canonical.live_has_run_marker);
  const bustedOk = !!busted.live_body_ok && (!exactRunRequired || !!busted.live_has_run_marker);
  return {
    ...canonical,
    live_canonical_url: canonicalUrl,
    clean: canonical,
    cache_busted: busted,
    cache_purge: purge,
    live_clean_ok: canonicalOk,
    live_cache_busted_ok: bustedOk,
    live_body_ok: canonicalOk && bustedOk,
  };
}

async function logEvent(postId: number, message: string, ok: boolean) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/push_log`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        post_id: postId, status: ok ? "overhaul" : "overhaul_error", message,
        draft_url: `${APEX}/wp-admin/post.php?post=${postId}&action=edit`,
      }),
    }).then((r) => r.text());
  } catch { /* */ }
}

async function backupPostContent(postId: number, runId: string | null, content: string, status?: string, dateGmt?: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !content.trim()) return;
  try {
    await fetch(`${url}/rest/v1/wp_post_backups`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ post_id: postId, run_id: runId, content, status: status || null, date_gmt: dateGmt || null }),
    }).then((r) => r.text());
  } catch { /* best-effort */ }
}

function buildSeedContent(fixes: Record<string, any>): string {
  const blocks: string[] = [];
  const intro = typeof fixes.introHtml === "string" && fixes.introHtml.trim()
    ? fixes.introHtml.trim()
    : (typeof fixes.introParagraph === "string" && fixes.introParagraph.trim() ? `<p>${fixes.introParagraph.trim()}</p>` : "");
  if (intro) blocks.push(`<!--gutf:intro-->${intro}<!--/gutf:intro-->`);
  // Note: deliberately NOT injecting an "Recommended Content Structure" outline list.
  // That placeholder rendered as visible bullet points and made the post look empty.
  // Real <section><h2> body content must come from generatePremiumContent.sectionsHtml.
  if (typeof fixes.faqHtml === "string" && fixes.faqHtml.trim()) blocks.push(`<!--gutf:faq-->${fixes.faqHtml.trim()}<!--/gutf:faq-->`);
  if (typeof fixes.conclusionHtml === "string" && fixes.conclusionHtml.trim()) blocks.push(`<!--gutf:bottom-line-->${fixes.conclusionHtml.trim()}<!--/gutf:bottom-line-->`);
  return blocks.length ? `<div class="gutf-article gutf-generated-overhaul">\n${blocks.join("\n")}\n</div>` : "";
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripTags(value: unknown): string {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function htmlWordCount(html: string): number {
  return stripTags(html).split(/\s+/).filter(Boolean).length;
}
function countTag(html: string, tag: string): number {
  return (String(html || "").match(new RegExp(`<${tag}\\b`, "gi")) || []).length;
}

async function generatePremiumContent(post: any, existingRaw: string, providedFixes: Record<string, any>): Promise<Record<string, any>> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return providedFixes || {};
  const title = stripTags(post?.title?.raw || post?.title?.rendered || "");
  const excerpt = stripTags(post?.excerpt?.raw || post?.excerpt?.rendered || "");
  const link = String(post?.link || "");
  const sourceText = stripTags(existingRaw).slice(0, 8000);

  // Strict body requirements — anything less = "empty looking" post.
  const MIN_BODY_WORDS = 1200;
  const MIN_BODY_H2 = 4;

  const sys = `You are a world-class SEO editor and copywriter for gearuptofit.com (fitness, training, gear, nutrition).
Your job: produce a #1-ranking, EEAT-grade, semantically rich, FULL-LENGTH blog post body.

CRITICAL CONTENT REQUIREMENTS — non-negotiable:
- sectionsHtml MUST contain at least ${MIN_BODY_H2} <div class="gutf-section"> blocks, each with one <h2> headline and 2-5 well-developed <p> paragraphs (plus optional <h3>, <ul>/<ol>, <table class="gutf-comparison">).
- DO NOT use <section>, <article>, <header>, <footer>, <aside> — WordPress KSES sanitizer strips them. Use <div class="gutf-section"> instead.
- Total visible prose across sectionsHtml MUST be at least ${MIN_BODY_WORDS} words.
- Cover the topic exhaustively — methodology, science, mistakes, programming, examples, comparisons, FAQ-adjacent depth.
- Integrate semanticKeywords and entities naturally throughout the body.
- No filler, no AI disclaimers, no "in this article we will...". Confident expert voice.

Output STRICT JSON ONLY (no markdown fences). Schema:
{
  "metaTitle": string (<=60 chars, primary keyword first),
  "metaDescription": string (<=158 chars, primary keyword, compelling),
  "primaryKeyword": string,
  "semanticKeywords": string[] (12-20 LSI/related terms),
  "entities": string[] (8-15 named entities),
  "introHtml": string (1 punchy <p> with primary keyword in first sentence + 1 <p> stating user benefit; 60-110 words),
  "sectionsHtml": string (the FULL article body — 5-8 <div class="gutf-section"> blocks meeting the requirements above),
  "faqHtml": string (<div class="gutf-faq"><h2>Frequently Asked Questions</h2> 5-7 <div class="gutf-faq-item"><h3>Q</h3><p>A</p></div></div>),
  "conclusionHtml": string (<div class="gutf-bottom-line"><h2>Bottom Line</h2><p>...</p></div>, 70-120 words),
  "jsonLd": object (schema.org Article + FAQPage @graph)
}
- HTML must be valid, semantic, mobile-friendly, NO inline width/height pixel styles, NO <script>, NO <style>, NO <section>/<article>/<header>/<footer>/<aside>.`;

  const usr = `TITLE: ${title}
URL: ${link}
EXCERPT: ${excerpt}

EXISTING CONTENT (may be empty or thin — rewrite/expand to be the best on the web):
${sourceText}

Return the JSON now. Remember: sectionsHtml must be the full ${MIN_BODY_WORDS}+ word body with ${MIN_BODY_H2}+ <h2> sections.`;

  let lastAi: Record<string, any> = {};
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const reinforcement = attempt === 1 ? "" :
        `\n\nPREVIOUS ATTEMPT FAILED VALIDATION: sectionsHtml had ${htmlWordCount(lastAi.sectionsHtml || "")} words and ${countTag(lastAi.sectionsHtml || "", "h2")} <h2> sections. You MUST return a sectionsHtml field with at least ${MIN_BODY_H2} <h2> sections and ${MIN_BODY_WORDS}+ words of real prose. This is your retry attempt ${attempt}/3.`;
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-pro",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: usr + reinforcement },
          ],
          max_tokens: 16000,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        console.error("AI gen failed", res.status, await res.text().catch(() => ""));
        continue;
      }
      const data = await res.json();
      const txt = data?.choices?.[0]?.message?.content || "{}";
      const ai = JSON.parse(String(txt).replace(/^```json\s*|\s*```$/g, ""));
      lastAi = ai;
      const wc = htmlWordCount(ai.sectionsHtml || "");
      const h2c = countTag(ai.sectionsHtml || "", "h2");
      console.log(`AI attempt ${attempt}: sections words=${wc}, h2=${h2c}`);
      if (wc >= MIN_BODY_WORDS && h2c >= MIN_BODY_H2) {
        return { ...ai, ...(providedFixes || {}) };
      }
    } catch (e) {
      console.error("AI gen exception", attempt, e);
    }
  }
  // Return whatever we got; downstream verification will reject if body is empty.
  return { ...lastAi, ...(providedFixes || {}) };
}

// WordPress KSES strips <section>, <article>, <header>, <footer>, <aside> for users
// without `unfiltered_html` capability (Application Passwords NEVER have it).
// Convert every semantic block element to a div with the same class so the body
// actually survives the REST update.
function ksesSafe(html: string): string {
  if (!html) return html;
  return String(html)
    .replace(/<section\b/gi, '<div data-gutf-section="1"')
    .replace(/<\/section>/gi, "</div>")
    .replace(/<article\b/gi, '<div data-gutf-article="1"')
    .replace(/<\/article>/gi, "</div>");
}

function extractBetween(html: string, openMarker: string, closeMarker: string): { before: string; inner: string; after: string; found: boolean } {
  const a = html.indexOf(openMarker);
  if (a < 0) return { before: html, inner: "", after: "", found: false };
  const b = html.indexOf(closeMarker, a + openMarker.length);
  if (b < 0) return { before: html, inner: "", after: "", found: false };
  return { before: html.slice(0, a), inner: html.slice(a + openMarker.length, b), after: html.slice(b + closeMarker.length), found: true };
}

function injectOrReplaceSections(html: string, sectionsHtml: string): { html: string; added: boolean; replaced: boolean } {
  if (!sectionsHtml) return { html, added: false, replaced: false };
  const safe = ksesSafe(sectionsHtml);
  const block = `\n<!--gutf:sections-->${safe}<!--/gutf:sections-->\n`;
  const ex = extractBetween(html, "<!--gutf:sections-->", "<!--/gutf:sections-->");
  if (ex.found) {
    const innerWords = htmlWordCount(ex.inner);
    const innerH2 = countTag(ex.inner, "h2");
    // If existing body was wiped by KSES (or otherwise too thin), replace it.
    if (innerWords < 600 || innerH2 < 3) {
      return { html: `${ex.before}${block}${ex.after}`, added: false, replaced: true };
    }
    return { html, added: false, replaced: false };
  }
  const introClose = "<!--/gutf:intro-->";
  if (html.includes(introClose)) return { html: html.replace(introClose, introClose + block), added: true, replaced: false };
  const cssIdx = html.indexOf("</style>");
  if (cssIdx >= 0) return { html: html.slice(0, cssIdx + 8) + block + html.slice(cssIdx + 8), added: true, replaced: false };
  return { html: block + html, added: true, replaced: false };
}

function buildStandaloneOverhaulHtml(enriched: Record<string, any>): string {
  let html = `${RESPONSIVE_CSS}\n<div class="gutf-article gutf-generated-overhaul gutf-live-repair">\n`;
  if (enriched.introHtml) html += `<!--gutf:intro-->${ksesSafe(enriched.introHtml)}<!--/gutf:intro-->\n`;
  if (enriched.sectionsHtml) html += `<!--gutf:sections-->${ksesSafe(enriched.sectionsHtml)}<!--/gutf:sections-->\n`;
  if (enriched.conclusionHtml) html += `<!--gutf:bottom-line-->${ksesSafe(enriched.conclusionHtml)}<!--/gutf:bottom-line-->\n`;
  if (enriched.faqHtml) html += `<!--gutf:faq-->${ksesSafe(enriched.faqHtml)}<!--/gutf:faq-->\n`;
  html += `</div>`;
  const ld = injectJsonLd(html, enriched.jsonLd);
  return ld.html;
}

function visualValidate(liveHtml: string): { score: number; checks: Record<string, boolean | number>; issues: string[] } {
  const issues: string[] = [];
  const checks: Record<string, boolean | number> = {};
  const h2Count = (liveHtml.match(/<h2\b/gi) || []).length;
  checks.h2_count = h2Count; if (h2Count < 3) issues.push("low-h2-count");
  const h3Count = (liveHtml.match(/<h3\b/gi) || []).length;
  checks.h3_count = h3Count;
  const imgs = liveHtml.match(/<img\b[^>]*>/gi) || [];
  const imgsWithAlt = imgs.filter((i) => /\balt=(["'])[^"']+\1/i.test(i)).length;
  checks.img_total = imgs.length;
  checks.img_alt_coverage = imgs.length ? Math.round((imgsWithAlt / imgs.length) * 100) : 100;
  if (imgs.length && imgsWithAlt / imgs.length < 0.8) issues.push("low-alt-coverage");
  const fixedWidth = /style=(["'])[^"']*width\s*:\s*\d{3,}px[^"']*\1/i.test(liveHtml);
  checks.no_fixed_width = !fixedWidth; if (fixedWidth) issues.push("fixed-pixel-widths");
  const hasFaq = /class=(['"])[^'"]*gutf-faq[^'"]*\1/i.test(liveHtml);
  checks.has_faq_block = hasFaq;
  const hasBottomLine = /class=(['"])[^'"]*gutf-bottom-line[^'"]*\1/i.test(liveHtml);
  checks.has_bottom_line = hasBottomLine;
  const hasResponsiveCss = /gutf-overhaul-v1/.test(liveHtml);
  checks.has_responsive_css = hasResponsiveCss; if (!hasResponsiveCss) issues.push("missing-responsive-css");
  let jsonLdValid = false;
  const ldMatch = liveHtml.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) { try { JSON.parse(ldMatch[1]); jsonLdValid = true; } catch { issues.push("invalid-jsonld"); } }
  checks.jsonld_valid = jsonLdValid;
  // Score 0-100
  let score = 100;
  if (!hasFaq) score -= 10;
  if (!hasBottomLine) score -= 10;
  if (!hasResponsiveCss) score -= 15;
  if (!jsonLdValid) score -= 10;
  if (h2Count < 3) score -= 15;
  if (imgs.length && imgsWithAlt / imgs.length < 0.8) score -= 10;
  if (fixedWidth) score -= 10;
  return { score: Math.max(0, score), checks, issues };
}

function buildEmergencySeed(post: any, fixes: Record<string, any>): string {
  const title = stripTags(fixes.metaTitle || post?.title?.raw || post?.title?.rendered || "Updated article");
  const excerpt = stripTags(fixes.metaDescription || post?.excerpt?.raw || post?.excerpt?.rendered || "This article has been refreshed for clarity, structure, and mobile readability.");
  return `<div class="gutf-article gutf-generated-overhaul gutf-emergency-overhaul">
<!--gutf:intro--><p>${escapeHtml(excerpt)}</p><!--/gutf:intro-->
<h2>${escapeHtml(title)}</h2>
<p>This post has been republished with a clean responsive structure so it can be stored directly in WordPress post content and rendered by any standard post template.</p>
<!--gutf:bottom-line--><div class="gutf-bottom-line"><h2>Bottom Line</h2><p>${escapeHtml(excerpt)}</p></div><!--/gutf:bottom-line-->
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await readBody(req);
  const pw = String(body._audit_password || req.headers.get("x-audit-password") || "");
  if (!pw || pw !== Deno.env.get("AUDIT_PASSWORD")) return jsonRes({ error: "Unauthorized" }, 401);

  const postId = Number(body.post_id);
  if (!postId) return jsonRes({ error: "post_id required" }, 400);
  const fixes = body.fixes || {};
  const dryRun = !!body.dry_run;
  const premiumQuality = body.premium_quality !== false; // default ON

  const user = Deno.env.get("WP_USERNAME");
  const pass = Deno.env.get("WP_APP_PASSWORD")?.replace(/\s+/g, "");
  if (!user || !pass) return jsonRes({ error: "WP credentials not configured" }, 500);
  const auth = "Basic " + btoa(`${user}:${pass}`);

  // 1. Fetch editable content. Some Elementor/template posts legitimately return
  // empty post_content; those must be detected instead of reported as "applied".
  async function fetchPost(ctx: "edit" | "view") {
    const r = await fetch(`${WP_BASE}/posts/${postId}?context=${ctx}&_fields=id,link,title,excerpt,content,status,date_gmt`, {
      headers: { Authorization: auth, "User-Agent": "GearupAudit/3.0" },
    });
    return { ok: r.ok, status: r.status, body: r.ok ? await r.json() : await r.text() };
  }
  let g = await fetchPost("edit");
  if (!g.ok) {
    // Try view context as fallback (e.g. 401/403 on edit)
    const g2 = await fetchPost("view");
    if (!g2.ok) return jsonRes({ error: `GET ${g.status}: ${String(g.body).slice(0, 200)}` }, 502);
    g = g2;
  }
  let post: any = g.body;
  let raw: string =
    (typeof post?.content?.raw === "string" && post.content.raw) ||
    (typeof post?.content?.rendered === "string" && post.content.rendered) ||
    "";
  const originalRaw = raw;
  let contentSource = raw.trim() ? (typeof post?.content?.raw === "string" && post.content.raw ? "rest_raw" : "rest_rendered") : "empty";
  let publicPageHtml = "";
  // If raw is empty (edit context returned rendered-only blank), try view context which always returns rendered HTML
  if (!raw.trim()) {
    const g2 = await fetchPost("view");
    if (g2.ok) {
      post = g2.body;
      raw =
        (typeof post?.content?.rendered === "string" && post.content.rendered) ||
        (typeof post?.content?.raw === "string" && post.content.raw) ||
        "";
      if (raw.trim()) contentSource = typeof post?.content?.rendered === "string" && post.content.rendered ? "rest_view_rendered" : "rest_view_raw";
    }
  }
  // Last-resort fallback: extract visible article content from the public URL.
  if (!raw.trim()) {
    try {
      const link: string | undefined = post?.link;
      if (link) {
        const pageRes = await fetch(link, { headers: { "User-Agent": "GearupAudit/3.0", "Cache-Control": "no-cache" } });
        if (pageRes.ok) {
          publicPageHtml = await pageRes.text();
          const extracted = extractPublicPostContent(publicPageHtml);
          if (extracted.html) {
            raw = extracted.html;
            contentSource = `public_${extracted.source}`;
          }
        }
      }
    } catch { /* ignore */ }
  }
  if (!raw.trim()) {
    const diag = `status=${post?.status} hasContent=${!!post?.content} keys=${post?.content ? Object.keys(post.content).join(",") : "none"}`;
    const hasSlot = publicPageHtml ? hasLiveContentSlot(publicPageHtml) : false;
    const seed = buildSeedContent(fixes) || buildEmergencySeed(post, fixes);
    raw = seed;
    contentSource = hasSlot ? "generated_seed_empty_rest" : "generated_seed_for_empty_template_post";
    await logEvent(postId, `Recovered empty editable content with generated seed (${diag}; live_slot=${hasSlot})`, true);
  }


  // 1b. Premium AI generation (SOTA, semantic, outranking content) — merged with caller fixes.
  const enrichedRaw = premiumQuality ? await generatePremiumContent(post, raw, fixes) : (fixes || {});
  // KSES sanitization: strip <section>/<article> from any AI/caller HTML so the body
  // actually survives the WordPress REST update (Application Passwords lack unfiltered_html).
  const enriched: Record<string, any> = {
    ...enrichedRaw,
    introHtml: ksesSafe(enrichedRaw.introHtml || ""),
    sectionsHtml: ksesSafe(enrichedRaw.sectionsHtml || ""),
    faqHtml: ksesSafe(enrichedRaw.faqHtml || ""),
    conclusionHtml: ksesSafe(enrichedRaw.conclusionHtml || ""),
  };

  // 2. Visual transforms — also strip leftover <section>/<article> from existing raw,
  // so an old post that had its body stripped by KSES gets fully rewritten.
  const visual = applyVisualFixes(ksesSafe(raw));
  let html = visual.html;
  const changes: string[] = [...visual.changes];

  // 3. Inject blocks (responsive CSS first so it sits above content)
  const css = ensureResponsiveCss(html); html = css.html; if (css.added) changes.push("responsive-css");
  const intro = injectIntro(html, enriched.introHtml); html = intro.html; if (intro.added) changes.push("intro");
  const sections = injectOrReplaceSections(html, enriched.sectionsHtml);
  html = sections.html;
  if (sections.added) changes.push("premium-sections");
  if (sections.replaced) changes.push("premium-sections-replaced");
  const concl = injectConclusion(html, enriched.conclusionHtml); html = concl.html; if (concl.added) changes.push("conclusion");
  const faq = injectFaq(html, enriched.faqHtml); html = faq.html; if (faq.added) changes.push("faq");
  const ld = injectJsonLd(html, enriched.jsonLd); html = ld.html; if (ld.added) changes.push("jsonld");
  // Re-run visual transforms over AI-injected blocks (lazy imgs, table wrap, iframe wrap)
  const visual2 = applyVisualFixes(html); html = visual2.html; changes.push(...visual2.changes.map((c) => `post:${c}`));

  // Pre-publish gate: refuse to write a post that will look empty.
  let bodyWords = htmlWordCount(html);
  let bodyH2 = countTag(html, "h2");
  if (bodyWords < LIVE_MIN_VISIBLE_WORDS || bodyH2 < LIVE_MIN_VISIBLE_H2) {
    await logEvent(postId, `Refusing to publish empty-looking content: words=${bodyWords} h2=${bodyH2}`, false);
    return jsonRes({
      ok: false, post_id: postId, changes,
      message: `Refused to publish: AI body content insufficient (words=${bodyWords}, h2 sections=${bodyH2}). Required: ≥${LIVE_MIN_VISIBLE_WORDS} words and ≥${LIVE_MIN_VISIBLE_H2} H2 sections. The AI Gateway likely returned a truncated response — retry the overhaul.`,
      content_source: contentSource, body_word_count: bodyWords, body_h2_count: bodyH2,
    }, 200);
  }

  if (dryRun) return jsonRes({ ok: true, dry_run: true, changes, preview: html.slice(0, 4000), body_word_count: bodyWords, body_h2_count: bodyH2 });

  // Idempotency: only treat as no-op when the live page ALSO renders a substantial body.
  // If html === raw but the existing live post has fewer than 600 words / 3 H2s
  // (e.g. KSES previously stripped the section bodies), we MUST re-publish so the
  // server re-receives the full content.
  const publicUrl = cleanPublicUrl(String(post?.link || ""));
  if (html === raw && (!fixes.metaTitle || fixes.metaTitle === post.title?.raw) && (!fixes.metaDescription || fixes.metaDescription === post.excerpt?.raw)) {
    const rawWords = htmlWordCount(raw);
    const rawH2 = countTag(raw, "h2");
    if (rawWords >= LIVE_MIN_VISIBLE_WORDS && rawH2 >= LIVE_MIN_VISIBLE_H2) {
      const existingLive = publicUrl ? await verifyCanonicalAndBusted(publicUrl, "", false, 2) : null;
      if (existingLive?.live_body_ok) {
        await logEvent(postId, `No-op verified live-visible (${existingLive.live_body_word_count}w/${existingLive.live_body_h2_count}h2)`, true);
        return jsonRes({ ok: true, post_id: postId, changes: ["noop"], message: `Already fully overhauled and visibly live on the clean original URL (${existingLive.live_body_word_count} words · ${existingLive.live_body_h2_count} H2 sections).`, content_source: contentSource, verification: { ...existingLive, rest_body_word_count: rawWords, rest_body_h2_count: rawH2, saved_status_publish: String(post?.status || "") === "publish" } });
      }
      html = buildStandaloneOverhaulHtml(enriched);
      changes.push("live-visible-repair-republish");
      contentSource = `${contentSource}+standalone_live_repair`;
    }
    // Force a re-injection by stripping the empty sections marker so the next pass rewrites it.
    html = html.replace(/<!--gutf:sections-->[\s\S]*?<!--\/gutf:sections-->/g, "");
    if (enriched.sectionsHtml) {
      const reinj = injectOrReplaceSections(html, enriched.sectionsHtml);
      html = reinj.html;
      changes.push("forced-sections-rewrite");
    }
  }

  bodyWords = htmlWordCount(html);
  bodyH2 = countTag(html, "h2");
  if (bodyWords < LIVE_MIN_VISIBLE_WORDS || bodyH2 < LIVE_MIN_VISIBLE_H2) {
    await logEvent(postId, `Refusing final publish after repair: words=${bodyWords} h2=${bodyH2}`, false);
    return jsonRes({ ok: false, post_id: postId, changes, message: `Refused final publish: generated body is still too thin (${bodyWords} words · ${bodyH2} H2).`, content_source: contentSource, body_word_count: bodyWords, body_h2_count: bodyH2 }, 200);
  }

  // 4. PUT update
  const runId = crypto.randomUUID();
  const marker = runMarker(runId);
  html = `${html}\n${runMarkerHtml(runId)}`;
  await backupPostContent(postId, runId, originalRaw || raw, post?.status, post?.date_gmt);
  const updateBody: Record<string, unknown> = { content: html, status: "publish" };
  const finalMetaTitle = (typeof enriched.metaTitle === "string" && enriched.metaTitle.trim()) ? enriched.metaTitle.trim() : "";
  const finalMetaDesc = (typeof enriched.metaDescription === "string" && enriched.metaDescription.trim()) ? enriched.metaDescription.trim() : "";
  if (finalMetaTitle) updateBody.title = finalMetaTitle;
  if (finalMetaDesc) updateBody.excerpt = finalMetaDesc;

  const updateRes = await fetch(`${WP_BASE}/posts/${postId}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", "User-Agent": "GearupAudit/3.0" },
    body: JSON.stringify(updateBody),
  });
  if (!updateRes.ok) {
    const t = await updateRes.text();
    await logEvent(postId, `Overhaul failed: ${updateRes.status} ${t.slice(0, 160)}`, false);
    return jsonRes({ ok: false, error: `Update ${updateRes.status}`, detail: t.slice(0, 240) }, 502);
  }
  const updatedText = await updateRes.text();
  let updatedPost: any = {}; try { updatedPost = JSON.parse(updatedText); } catch { updatedPost = { raw: updatedText }; }

  const verifyEdit = await fetchPost("edit");
  const verifyBody: any = verifyEdit.ok ? verifyEdit.body : updatedPost;
  const verifyContent = String(verifyBody?.content?.raw || verifyBody?.content?.rendered || "");
  const restHasSignals = containsAppliedSignal(verifyContent);
  const restHasRunMarker = containsRunMarker(verifyContent, runId);
  const restBodyWords = htmlWordCount(verifyContent);
  const restBodyH2 = countTag(verifyContent, "h2");
  const savedPublished = String(verifyBody?.status || updatedPost?.status || "") === "publish";
  let liveUrl = cleanPublicUrl(String(updatedPost?.link || post?.link || ""));
  const liveCheck = liveUrl ? await verifyCanonicalAndBusted(liveUrl, runId, true, 5) : null;
  const visualReport = liveCheck?.live_visual_report || null;
  const verification = { rest_has_signals: restHasSignals, rest_has_run_marker: restHasRunMarker, rest_body_word_count: restBodyWords, rest_body_h2_count: restBodyH2, saved_status_publish: savedPublished, run_marker: marker, ...(liveCheck || { live_url: liveUrl, live_status: null, live_body_word_count: 0, live_body_h2_count: 0, live_body_ok: false, live_has_run_marker: false, live_has_signals: false, live_has_content_slot: null, live_min_word_count: LIVE_MIN_VISIBLE_WORDS, live_min_h2_count: LIVE_MIN_VISIBLE_H2 }) };
  if (!savedPublished || !restHasSignals || !restHasRunMarker || !verification.live_has_run_marker || !verification.live_body_ok) {
    const reason = verification.cache_busted?.live_body_ok && !verification.clean?.live_has_run_marker
      ? "WordPress saved the update and the cache-busted URL shows it, but the clean original URL is still serving stale/old content. Treating as NOT published to the real public URL."
      : !verification.live_body_ok && verification.live_has_run_marker
      ? `Live page renders the exact publish run marker but the visible article body is too thin (words=${verification.live_body_word_count}, h2=${verification.live_body_h2_count}; required ≥${LIVE_MIN_VISIBLE_WORDS} words and ≥${LIVE_MIN_VISIBLE_H2} H2). Reader will see a near-empty post.`
      : (verification.live_has_run_marker ? "WordPress saved the overhaul, but clean URL publish verification failed." : "WordPress accepted the update, but the clean original public URL did not show this exact publish run. Treating as NOT published/visible.");
    await logEvent(postId, `Overhaul not clean-url verified; saved=${savedPublished} rest_marker=${restHasRunMarker} clean_marker=${verification.clean?.live_has_run_marker} busted_marker=${verification.cache_busted?.live_has_run_marker} body_ok=${verification.live_body_ok} clean_words=${verification.clean?.live_body_word_count} clean_h2=${verification.clean?.live_body_h2_count} purge=${verification.cache_purge?.ok} (${changes.join(", ")})`, false);
    return jsonRes({ ok: false, post_id: postId, changes, message: reason, content_source: contentSource, wp_status: updateRes.status, verification, visual: visualReport, seo: { primary_keyword: enriched.primaryKeyword, semantic_keywords: enriched.semanticKeywords, entities: enriched.entities, meta_title: finalMetaTitle, meta_description: finalMetaDesc } }, 200);
  }

  const visualScore = visualReport?.score ?? null;
  await logEvent(postId, `Overhauled and public-live verified: ${changes.join(", ")} (source=${contentSource}; visual=${visualScore ?? "n/a"}; body=${verification.live_body_word_count}w/${verification.live_body_h2_count}h2; selected=${verification.live_content_source}; ${marker})`, true);
  return jsonRes({ ok: true, post_id: postId, changes, message: `Applied, published, and verified (${verification.live_body_word_count} visible words · ${verification.live_body_h2_count} visible H2 sections · visual ${visualScore ?? "n/a"}/100): ${changes.join(", ")}`, content_source: contentSource, wp_status: updateRes.status, verification, visual: visualReport, seo: { primary_keyword: enriched.primaryKeyword, semantic_keywords: enriched.semanticKeywords, entities: enriched.entities, meta_title: finalMetaTitle, meta_description: finalMetaDesc } });
});
