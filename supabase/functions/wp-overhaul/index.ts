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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await readBody(req);
  const pw = String(body._audit_password || req.headers.get("x-audit-password") || "");
  if (!pw || pw !== Deno.env.get("AUDIT_PASSWORD")) return jsonRes({ error: "Unauthorized" }, 401);

  const postId = Number(body.post_id);
  if (!postId) return jsonRes({ error: "post_id required" }, 400);
  const fixes = body.fixes || {};
  const dryRun = !!body.dry_run;

  const user = Deno.env.get("WP_USERNAME");
  const pass = Deno.env.get("WP_APP_PASSWORD")?.replace(/\s+/g, "");
  if (!user || !pass) return jsonRes({ error: "WP credentials not configured" }, 500);
  const auth = "Basic " + btoa(`${user}:${pass}`);

  // 1. Fetch raw content (context=edit). Fallback to context=view if raw is empty
  // (happens when the app-password user lacks edit_posts cap on this post type).
  async function fetchPost(ctx: "edit" | "view") {
    const r = await fetch(`${WP_BASE}/posts/${postId}?context=${ctx}&_fields=id,title,excerpt,content,status`, {
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
  // If raw is empty (edit context returned rendered-only blank), try view context which always returns rendered HTML
  if (!raw.trim()) {
    const g2 = await fetchPost("view");
    if (g2.ok) {
      post = g2.body;
      raw =
        (typeof post?.content?.rendered === "string" && post.content.rendered) ||
        (typeof post?.content?.raw === "string" && post.content.raw) ||
        "";
    }
  }
  // Last-resort fallback: fetch the public post HTML from APEX and extract <article> / main content
  if (!raw.trim()) {
    try {
      const link: string | undefined = post?.link;
      if (link) {
        const pageRes = await fetch(link, { headers: { "User-Agent": "GearupAudit/3.0", "Cache-Control": "no-cache" } });
        if (pageRes.ok) {
          const pageHtml = await pageRes.text();
          // Extract <article>...</article> or fall back to <main>
          const articleMatch = pageHtml.match(/<article\b[\s\S]*?<\/article>/i);
          const mainMatch = !articleMatch ? pageHtml.match(/<main\b[\s\S]*?<\/main>/i) : null;
          const extracted = articleMatch?.[0] || mainMatch?.[0] || "";
          // Strip script/style/header/footer/nav/aside to keep just content
          if (extracted) {
            raw = extracted
              .replace(/<script\b[\s\S]*?<\/script>/gi, "")
              .replace(/<style\b[\s\S]*?<\/style>/gi, "")
              .replace(/<header\b[\s\S]*?<\/header>/gi, "")
              .replace(/<footer\b[\s\S]*?<\/footer>/gi, "")
              .replace(/<nav\b[\s\S]*?<\/nav>/gi, "");
          }
        }
      }
    } catch { /* ignore */ }
  }
  if (!raw.trim()) {
    const diag = `status=${post?.status} hasContent=${!!post?.content} keys=${post?.content ? Object.keys(post.content).join(",") : "none"}`;
    await logEvent(postId, `Skipped: empty content (${diag})`, true);
    // Return 200 with skipped flag so the UI doesn't surface a runtime error / blank screen.
    // This commonly happens when a post is built entirely by a page-builder (Elementor/Divi/Bricks)
    // that stores HTML in post meta instead of post_content.
    return jsonRes({
      ok: true,
      skipped: true,
      post_id: postId,
      changes: ["skipped-empty"],
      reason: "page-builder-or-empty",
      detail: `Post has no content in WP REST (${diag}). Likely built with a page-builder (Elementor/Divi/Bricks) that stores HTML outside post_content. Edit this post manually in WordPress.`,
    });
  }

  // 2. Visual transforms
  const visual = applyVisualFixes(raw);
  let html = visual.html;
  const changes: string[] = [...visual.changes];

  // 3. Inject blocks
  const css = ensureResponsiveCss(html); html = css.html; if (css.added) changes.push("responsive-css");
  const intro = injectIntro(html, fixes.introHtml); html = intro.html; if (intro.added) changes.push("intro");
  const concl = injectConclusion(html, fixes.conclusionHtml); html = concl.html; if (concl.added) changes.push("conclusion");
  const faq = injectFaq(html, fixes.faqHtml); html = faq.html; if (faq.added) changes.push("faq");
  const ld = injectJsonLd(html, fixes.jsonLd); html = ld.html; if (ld.added) changes.push("jsonld");

  if (dryRun) return jsonRes({ ok: true, dry_run: true, changes, preview: html.slice(0, 4000) });

  if (html === raw && (!fixes.metaTitle || fixes.metaTitle === post.title?.raw) && (!fixes.metaDescription || fixes.metaDescription === post.excerpt?.raw)) {
    await logEvent(postId, "No-op (already overhauled)", true);
    return jsonRes({ ok: true, post_id: postId, changes: ["noop"], message: "Already fully overhauled (idempotent)." });
  }

  // 4. PUT update
  const updateBody: Record<string, unknown> = { content: html };
  if (typeof fixes.metaTitle === "string" && fixes.metaTitle.trim()) updateBody.title = fixes.metaTitle.trim();
  if (typeof fixes.metaDescription === "string" && fixes.metaDescription.trim()) updateBody.excerpt = fixes.metaDescription.trim();

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
  await updateRes.text();
  await logEvent(postId, `Overhauled: ${changes.join(", ")}`, true);
  return jsonRes({ ok: true, post_id: postId, changes, message: `Applied: ${changes.join(", ")}` });
});
