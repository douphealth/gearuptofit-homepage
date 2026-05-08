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

  // 1. Fetch raw content
  const getRes = await fetch(`${WP_BASE}/posts/${postId}?context=edit&_fields=id,title,excerpt,content,status`, {
    headers: { Authorization: auth, "User-Agent": "GearupAudit/3.0" },
  });
  if (!getRes.ok) {
    const t = await getRes.text();
    return jsonRes({ error: `GET ${getRes.status}: ${t.slice(0, 200)}` }, 502);
  }
  const post = await getRes.json();
  const raw: string = post?.content?.raw || "";
  if (!raw) return jsonRes({ error: "Empty raw content" }, 400);

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
