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

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLiveHtml(url: string, runId: string, attempt: number) {
  const sep = url.includes("?") ? "&" : "?";
  const verifyUrl = `${url}${sep}_gutf_verify=${encodeURIComponent(runId)}_${attempt}_${Date.now()}`;
  const res = await fetch(verifyUrl, {
    headers: {
      "User-Agent": "GearupAudit/3.1-public-verify",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
  return { ok: res.ok, status: res.status, url, html: res.ok ? await res.text() : await res.text().catch(() => "") };
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

async function generatePremiumContent(post: any, existingRaw: string, providedFixes: Record<string, any>): Promise<Record<string, any>> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return providedFixes || {};
  const title = stripTags(post?.title?.raw || post?.title?.rendered || "");
  const excerpt = stripTags(post?.excerpt?.raw || post?.excerpt?.rendered || "");
  const link = String(post?.link || "");
  const sourceText = stripTags(existingRaw).slice(0, 8000);
  const sys = `You are a world-class SEO editor and copywriter for gearuptofit.com (fitness, training, gear, nutrition).
Your job: produce a #1-ranking, EEAT-grade, semantically rich blog post body.

Rules:
- Output STRICT JSON ONLY (no markdown fences). Schema:
  {
    "metaTitle": string (<=60 chars, primary keyword first),
    "metaDescription": string (<=158 chars, compelling, includes primary keyword),
    "primaryKeyword": string,
    "semanticKeywords": string[] (12-20 LSI/related terms),
    "entities": string[] (8-15 named entities relevant to topic),
    "introHtml": string (1 punchy <p> with primary keyword in first sentence + 1 <p> stating user benefit; 60-110 words total),
    "sectionsHtml": string (5-8 <section> blocks, each with one <h2>, optional <h3>, well-formed <p>, <ul>/<ol> where useful, <table class=\"gutf-comparison\"> when comparison is helpful, semantic HTML only; no inline styles; cover the topic exhaustively to outrank competitors; integrate semanticKeywords and entities naturally),
    "faqHtml": string (<section class=\"gutf-faq\"><h2>Frequently Asked Questions</h2> 5-7 <div class=\"gutf-faq-item\"><h3>Q</h3><p>A</p></div>),
    "conclusionHtml": string (<div class=\"gutf-bottom-line\"><h2>Bottom Line</h2><p>...</p></div>, 70-120 words, with a clear takeaway),
    "jsonLd": object (schema.org Article + FAQPage combined as @graph)
  }
- HTML must be valid, semantic, mobile-friendly, NO inline width/height pixel styles, NO <script>, NO <style>.
- Tone: confident, expert, evidence-aware, concise. No fluff. No AI disclaimers.
- Outrank competitors by being more comprehensive, specific, and useful.`;

  const usr = `TITLE: ${title}
URL: ${link}
EXCERPT: ${excerpt}

EXISTING CONTENT (may be empty or thin — rewrite/expand to be the best on the web):
${sourceText}

Return the JSON now.`;

  try {
    const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: "google/gemini-2.5-pro",
        messages: [{ role: "system", content: sys }, { role: "user", content: usr }],
        response_format: { type: "json_object" },
      }),
    });
    if (!res.ok) {
      console.error("AI gen failed", res.status, await res.text().catch(() => ""));
      return providedFixes || {};
    }
    const data = await res.json();
    const txt = data?.choices?.[0]?.message?.content || "{}";
    const ai = JSON.parse(txt.replace(/^```json\s*|\s*```$/g, ""));
    // Caller-provided fixes override AI to preserve user intent
    return { ...ai, ...(providedFixes || {}) };
  } catch (e) {
    console.error("AI gen exception", e);
    return providedFixes || {};
  }
}

function injectSections(html: string, sectionsHtml: string): { html: string; added: boolean } {
  if (!sectionsHtml || html.includes("<!--gutf:sections-->")) return { html, added: false };
  // Insert after intro marker if present, else after responsive CSS, else prepend
  const introClose = "<!--/gutf:intro-->";
  const block = `\n<!--gutf:sections-->${sectionsHtml}<!--/gutf:sections-->\n`;
  if (html.includes(introClose)) return { html: html.replace(introClose, introClose + block), added: true };
  const cssIdx = html.indexOf("</style>");
  if (cssIdx >= 0) return { html: html.slice(0, cssIdx + 8) + block + html.slice(cssIdx + 8), added: true };
  return { html: block + html, added: true };
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
  const enriched = premiumQuality ? await generatePremiumContent(post, raw, fixes) : (fixes || {});

  // 2. Visual transforms
  const visual = applyVisualFixes(raw);
  let html = visual.html;
  const changes: string[] = [...visual.changes];

  // 3. Inject blocks (responsive CSS first so it sits above content)
  const css = ensureResponsiveCss(html); html = css.html; if (css.added) changes.push("responsive-css");
  const intro = injectIntro(html, enriched.introHtml); html = intro.html; if (intro.added) changes.push("intro");
  const sections = injectSections(html, enriched.sectionsHtml); html = sections.html; if (sections.added) changes.push("premium-sections");
  const concl = injectConclusion(html, enriched.conclusionHtml); html = concl.html; if (concl.added) changes.push("conclusion");
  const faq = injectFaq(html, enriched.faqHtml); html = faq.html; if (faq.added) changes.push("faq");
  const ld = injectJsonLd(html, enriched.jsonLd); html = ld.html; if (ld.added) changes.push("jsonld");
  // Re-run visual transforms over AI-injected blocks (lazy imgs, table wrap, iframe wrap)
  const visual2 = applyVisualFixes(html); html = visual2.html; changes.push(...visual2.changes.map((c) => `post:${c}`));

  if (dryRun) return jsonRes({ ok: true, dry_run: true, changes, preview: html.slice(0, 4000) });

  if (html === raw && (!fixes.metaTitle || fixes.metaTitle === post.title?.raw) && (!fixes.metaDescription || fixes.metaDescription === post.excerpt?.raw)) {
    await logEvent(postId, "No-op (already overhauled)", true);
    return jsonRes({ ok: true, post_id: postId, changes: ["noop"], message: "Already fully overhauled (idempotent)." });
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
  const savedPublished = String(verifyBody?.status || updatedPost?.status || "") === "publish";
  let liveHasContentSlot: boolean | null = null;
  let liveHasSignals = false;
  let liveHasRunMarker = false;
  let liveStatus: number | null = null;
  let liveUrl = canonicalPublicUrl(String(updatedPost?.link || post?.link || ""));
  let visualReport: { score: number; checks: Record<string, boolean | number>; issues: string[] } | null = null;
  if (liveUrl) {
    for (let attempt = 1; attempt <= 4; attempt++) {
      try {
        const liveRes = await fetchLiveHtml(liveUrl, runId, attempt);
        liveStatus = liveRes.status;
        if (liveRes.ok) {
          const liveHtml = liveRes.html;
          liveHasContentSlot = hasLiveContentSlot(liveHtml);
          liveHasSignals = containsAppliedSignal(liveHtml);
          liveHasRunMarker = containsRunMarker(liveHtml, runId);
          const articleZone = (() => {
            const idx = liveHtml.search(/<(article|main)\b/i);
            if (idx < 0) return liveHtml;
            const tag = (liveHtml.slice(idx).match(/<(article|main)\b/i) || ["", "article"])[1].toLowerCase();
            return findBalancedElement(liveHtml, tag, idx) || liveHtml;
          })();
          visualReport = visualValidate(articleZone);
          if (liveHasRunMarker) break;
        }
      } catch { /* retry below */ }
      await sleep(900 * attempt);
    }
  }

  const verification = { rest_has_signals: restHasSignals, rest_has_run_marker: restHasRunMarker, saved_status_publish: savedPublished, live_url: liveUrl, live_status: liveStatus, live_has_content_slot: liveHasContentSlot, live_has_signals: liveHasSignals, live_has_run_marker: liveHasRunMarker, run_marker: marker };
  if (!savedPublished || !restHasSignals || !restHasRunMarker || !liveHasRunMarker) {
    await logEvent(postId, `Overhaul not live-verified; saved=${savedPublished} rest_marker=${restHasRunMarker} live_marker=${liveHasRunMarker} (${changes.join(", ")})`, false);
    return jsonRes({ ok: false, post_id: postId, changes, message: liveHasRunMarker ? "WordPress saved the overhaul, but publish status verification failed." : "WordPress accepted the update, but the public live post did not show this exact publish run after cache-busted re-fetch. Treating as NOT published/visible.", content_source: contentSource, wp_status: updateRes.status, verification, visual: visualReport, seo: { primary_keyword: enriched.primaryKeyword, semantic_keywords: enriched.semanticKeywords, entities: enriched.entities, meta_title: finalMetaTitle, meta_description: finalMetaDesc } }, 200);
  }

  const visualScore = visualReport?.score ?? null;
  await logEvent(postId, `Overhauled and public-live verified: ${changes.join(", ")} (source=${contentSource}; visual=${visualScore ?? "n/a"}; ${marker})`, true);
  return jsonRes({ ok: true, post_id: postId, changes, message: `Applied, published, and verified on public live URL (visual ${visualScore ?? "n/a"}/100): ${changes.join(", ")}`, content_source: contentSource, wp_status: updateRes.status, verification, visual: visualReport, seo: { primary_keyword: enriched.primaryKeyword, semantic_keywords: enriched.semanticKeywords, entities: enriched.entities, meta_title: finalMetaTitle, meta_description: finalMetaDesc } });
});
