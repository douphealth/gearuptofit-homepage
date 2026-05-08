import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const TTL_MIN = 15;
const PER_PAGE = 10;
const FIELDS = "id,slug,link,title,excerpt,content,modified_gmt,date_gmt,categories,tags,author,yoast_head_json";

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

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Mode: list (return cached metadata) | fetch (fetch one page from WP)
  const mode = body?.mode || "list";

  if (mode === "list") {
    const force = body?.force === true;
    if (!force) {
      const { data: latest } = await supabase
        .from("wp_posts_cache").select("fetched_at")
        .order("fetched_at", { ascending: false }).limit(1).maybeSingle();
      if (latest?.fetched_at) {
        const ageMin = (Date.now() - new Date(latest.fetched_at).getTime()) / 60000;
        if (ageMin < TTL_MIN) {
          const { data: posts } = await supabase
            .from("wp_posts_cache")
            .select("post_id, slug, title, link, modified_at")
            .order("modified_at", { ascending: false });
          return new Response(JSON.stringify({ cached: true, posts, totalPages: 0, done: true }), {
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          });
        }
      }
    }
    // Probe page 1 to get totalPages
    const probe = await fetch(`${WP_BASE}/posts?per_page=${PER_PAGE}&page=1&status=publish&_fields=id`, {
      headers: { "User-Agent": "GearupAudit/1.0" },
    });
    const totalPages = parseInt(probe.headers.get("x-wp-totalpages") || "1", 10);
    await probe.text();
    return new Response(JSON.stringify({ totalPages, perPage: PER_PAGE, needsFetch: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (mode === "fetch") {
    const page = Math.max(1, parseInt(body?.page ?? "1", 10));
    const r = await fetch(`${WP_BASE}/posts?per_page=${PER_PAGE}&page=${page}&_embed=1&status=publish`, {
      headers: { "User-Agent": "GearupAudit/1.0" },
    });
    if (!r.ok) {
      await r.text();
      return new Response(JSON.stringify({ error: `WP fetch failed: ${r.status}`, page }), {
        status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const totalPages = parseInt(r.headers.get("x-wp-totalpages") || "1", 10);
    const batch = await r.json();
    const fetchedAt = new Date().toISOString();
    const rows = (Array.isArray(batch) ? batch : []).map((p: any) => ({
      post_id: p.id,
      slug: p.slug,
      title: typeof p.title === "object" ? p.title.rendered : String(p.title ?? ""),
      link: p.link,
      modified_at: p.modified_gmt ? new Date(p.modified_gmt + "Z").toISOString() : null,
      data: p,
      fetched_at: fetchedAt,
    }));
    if (rows.length > 0) {
      const { error } = await supabase.from("wp_posts_cache").upsert(rows, { onConflict: "post_id" });
      if (error) console.error("Upsert error", error);
    }
    return new Response(JSON.stringify({ page, totalPages, fetched: rows.length, done: page >= totalPages }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  if (mode === "results") {
    const { data: posts } = await supabase
      .from("wp_posts_cache")
      .select("post_id, slug, title, link, modified_at")
      .order("modified_at", { ascending: false });
    return new Response(JSON.stringify({ posts }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  return new Response(JSON.stringify({ error: "Unknown mode" }), {
    status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
