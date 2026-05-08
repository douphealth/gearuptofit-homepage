import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";

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
  const { post_id, payload } = await req.json();
  if (!post_id || !payload) {
    return new Response(JSON.stringify({ error: "post_id and payload required" }), {
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

  // SAFETY: hardcode draft. Allow only safe fields.
  const safeBody: Record<string, unknown> = {
    status: "draft",
  };
  if (typeof payload.title === "string") safeBody.title = payload.title;
  if (typeof payload.content === "string") safeBody.content = payload.content;
  if (typeof payload.excerpt === "string") safeBody.excerpt = payload.excerpt;
  if (payload.meta && typeof payload.meta === "object") safeBody.meta = payload.meta;

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
