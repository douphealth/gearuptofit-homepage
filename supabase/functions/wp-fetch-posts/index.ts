import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const TTL_MIN = 15;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const pw = body?._audit_password || req.headers.get("x-audit-password");
  if (!pw || pw !== Deno.env.get("AUDIT_PASSWORD")) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const force = body?.force === true || body?.force === "1";

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  if (!force) {
    const { data: latest } = await supabase
      .from("wp_posts_cache").select("fetched_at")
      .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
    if (latest?.fetched_at) {
      const ageMin = (Date.now() - new Date(latest.fetched_at).getTime()) / 60000;
      if (ageMin < TTL_MIN) {
        const { data: posts } = await supabase
          .from("wp_posts_cache")
          .select("post_id, slug, title, link, modified_at, data, fetched_at")
          .order("modified_at", { ascending: false });
        return new Response(JSON.stringify({ cached: true, count: posts?.length ?? 0, posts }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }
    }
  }

  const all: any[] = [];
  let page = 1;
  while (true) {
    const r = await fetch(`${WP_BASE}/posts?per_page=100&page=${page}&_embed=1&status=publish`, {
      headers: { "User-Agent": "GearupAudit/1.0" },
    });
    if (r.status === 400 || r.status === 404) break;
    if (!r.ok) {
      return new Response(JSON.stringify({ error: `WP fetch failed: ${r.status}` }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const batch = await r.json();
    if (!Array.isArray(batch) || batch.length === 0) break;
    all.push(...batch);
    const totalPages = parseInt(r.headers.get("x-wp-totalpages") || "1", 10);
    if (page >= totalPages) break;
    page++;
    if (page > 50) break;
  }

  const rows = all.map((p) => ({
    post_id: p.id,
    slug: p.slug,
    title: typeof p.title === "object" ? p.title.rendered : String(p.title ?? ""),
    link: p.link,
    modified_at: p.modified_gmt ? new Date(p.modified_gmt + "Z").toISOString() : null,
    data: p,
    fetched_at: new Date().toISOString(),
  }));

  if (rows.length > 0) {
    for (let i = 0; i < rows.length; i += 50) {
      const chunk = rows.slice(i, i + 50);
      const { error } = await supabase.from("wp_posts_cache").upsert(chunk, { onConflict: "post_id" });
      if (error) console.error("Upsert error", error);
    }
  }

  const { data: posts } = await supabase
    .from("wp_posts_cache")
    .select("post_id, slug, title, link, modified_at, data, fetched_at")
    .order("modified_at", { ascending: false });

  return new Response(JSON.stringify({ cached: false, count: posts?.length ?? 0, posts }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
