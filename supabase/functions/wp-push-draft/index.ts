import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const DETAIL_FIELDS = "id,content";

async function fetchOriginalContent(postId: number) {
  const r = await fetch(`${WP_BASE}/posts/${postId}?status=publish&_fields=${DETAIL_FIELDS}`, {
    headers: { "User-Agent": "GearupAudit/1.0" },
  });
  if (!r.ok) return "";
  const data = await r.json();
  return data?.content?.rendered || "";
}

async function checkAuth(req: Request): Promise<boolean> {
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* ignore */ }
  const pw = body?._audit_password || req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await checkAuth(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { post_id, fixes } = await req.json();
  if (!post_id || !fixes) {
    return new Response(JSON.stringify({ error: "post_id and fixes required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const user = Deno.env.get("WP_USERNAME");
  const pass = Deno.env.get("WP_APP_PASSWORD");
  if (!user || !pass) {
    return new Response(JSON.stringify({ error: "WP credentials not configured" }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const auth = "Basic " + btoa(`${user}:${pass.replace(/\s+/g, "")}`);

  const original = await fetchOriginalContent(Number(post_id));

  const faqHtml = (fixes.faq || []).map((f: any) => `<h3>${f.q}</h3><p>${f.a}</p>`).join("\n");
  const jsonLd = fixes.jsonLd ? `<script type="application/ld+json">${JSON.stringify(fixes.jsonLd)}</script>` : "";
  const intro = fixes.introParagraph ? `<p><strong>${fixes.introParagraph}</strong></p>` : "";
  const newContent = `${intro}\n${original}\n<h2>Frequently Asked Questions</h2>\n${faqHtml}\n${jsonLd}`;

  // SAFETY: hardcoded status=draft.
  const safeBody: Record<string, unknown> = {
    status: "draft",
    content: newContent,
  };
  if (typeof fixes.metaTitle === "string") safeBody.title = fixes.metaTitle;
  if (typeof fixes.metaDescription === "string") safeBody.excerpt = fixes.metaDescription;

  const r = await fetch(`${WP_BASE}/posts/${post_id}`, {
    method: "POST",
    headers: { "Authorization": auth, "Content-Type": "application/json", "User-Agent": "GearupAudit/1.0" },
    body: JSON.stringify(safeBody),
  });

  const text = await r.text();
  let result: any = {};
  try { result = JSON.parse(text); } catch { result = { raw: text }; }

  const status = r.ok ? "success" : "error";
  const draft_url = result?.link ? `${result.link}?preview=true` : null;
  const message = r.ok ? `Draft updated for post ${post_id}` : `WP error ${r.status}: ${result?.message || text.slice(0, 200)}`;

  await supabase.from("push_log").insert({ post_id, status, message, draft_url });

  return new Response(JSON.stringify({ ok: r.ok, status: r.status, draft_url, message, wp: result }), {
    status: r.ok ? 200 : 502,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
