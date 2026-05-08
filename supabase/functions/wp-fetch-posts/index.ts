import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const PER_PAGE = 100;
const FIELDS = "id,slug,link,title,modified_gmt,date_gmt";
const MAX_MISSING = 500;

type WpPost = {
  id: number;
  slug?: string;
  link?: string;
  title?: { rendered?: string } | string;
  modified_gmt?: string;
  date_gmt?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function postTitle(title: WpPost["title"]) {
  return typeof title === "object" ? title?.rendered || "" : String(title ?? "");
}

async function getWpCount() {
  const probe = await fetch(`${WP_BASE}/posts?per_page=1&page=1&status=publish&_fields=id`, {
    headers: { "User-Agent": "GearupAudit/1.0" },
  });
  if (!probe.ok) {
    await probe.text();
    throw new Error(`WP count failed: ${probe.status}`);
  }
  await probe.text();
  const total = parseInt(probe.headers.get("x-wp-total") || "0", 10);
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  return { total, totalPages };
}

async function getCachedPosts(supabase: ReturnType<typeof createClient>) {
  const { data, error } = await supabase
    .from("wp_posts_cache")
    .select("post_id, slug, title, link, modified_at")
    .order("modified_at", { ascending: false })
    .range(0, 4999);
  if (error) throw error;
  return data || [];
}

async function getDiagnostics(supabase: ReturnType<typeof createClient>, runId?: string) {
  const runQuery = supabase
    .from("wp_import_runs")
    .select("*")
    .order("started_at", { ascending: false })
    .limit(1);
  const { data: latestRun } = runId
    ? await supabase.from("wp_import_runs").select("*").eq("id", runId).maybeSingle()
    : await runQuery.maybeSingle();
  const run = latestRun || null;

  const pagesQuery = run
    ? supabase.from("wp_import_pages").select("*").eq("run_id", run.id).order("page", { ascending: true }).range(0, 999)
    : null;
  const { data: pages } = pagesQuery ? await pagesQuery : { data: [] };

  const { total, totalPages } = await getWpCount();
  const cached = await getCachedPosts(supabase);
  const cachedIds = new Set(cached.map((p: any) => Number(p.post_id)));
  const expectedRefs = (pages || []).flatMap((p: any) => Array.isArray(p.post_refs) ? p.post_refs : []);
  const missingFromCache = expectedRefs
    .filter((p: any) => !cachedIds.has(Number(p.id)))
    .slice(0, MAX_MISSING);
  const successfulPages = (pages || []).filter((p: any) => p.status === "success").map((p: any) => Number(p.page));
  const pageSet = new Set(successfulPages);
  let firstMissingPage: number | null = null;
  for (let page = 1; page <= (run?.expected_pages || totalPages); page++) {
    if (!pageSet.has(page)) { firstMissingPage = page; break; }
  }

  return {
    authoritative: {
      totalPublished: total,
      totalPages,
      perPage: PER_PAGE,
      cachedCount: cached.length,
      difference: total - cached.length,
      complete: cached.length >= total,
    },
    run,
    pages: pages || [],
    firstMissingPage,
    missingFromCache,
  };
}

async function createRun(supabase: ReturnType<typeof createClient>) {
  const { total, totalPages } = await getWpCount();
  const { data: run, error } = await supabase
    .from("wp_import_runs")
    .insert({
      status: "running",
      expected_total: total,
      expected_pages: totalPages,
      per_page: PER_PAGE,
      imported_total: 0,
      first_missing_page: 1,
      updated_at: new Date().toISOString(),
    })
    .select("*")
    .single();
  if (error) throw error;

  const pageRows = Array.from({ length: totalPages }, (_, i) => ({
    run_id: run.id,
    page: i + 1,
    status: "pending",
    updated_at: new Date().toISOString(),
  }));
  for (let i = 0; i < pageRows.length; i += 100) {
    const { error: pageError } = await supabase.from("wp_import_pages").upsert(pageRows.slice(i, i + 100), { onConflict: "run_id,page" });
    if (pageError) throw pageError;
  }
  return run;
}

async function fetchPage(supabase: ReturnType<typeof createClient>, runId: string, page: number) {
  const now = new Date().toISOString();
  await supabase
    .from("wp_import_pages")
    .update({ status: "running", error: null, updated_at: now })
    .eq("run_id", runId)
    .eq("page", page);

  try {
    const r = await fetch(`${WP_BASE}/posts?per_page=${PER_PAGE}&page=${page}&status=publish&_fields=${FIELDS}`, {
      headers: { "User-Agent": "GearupAudit/1.0" },
    });
    if (!r.ok) {
      const text = await r.text();
      throw new Error(`WP fetch failed ${r.status}: ${text.slice(0, 160)}`);
    }

    const batch = await r.json();
    const posts: WpPost[] = Array.isArray(batch) ? batch : [];
    const fetchedAt = new Date().toISOString();
    const rows = posts.map((p) => ({
      post_id: p.id,
      slug: p.slug,
      title: postTitle(p.title),
      link: p.link,
      modified_at: p.modified_gmt ? new Date(`${p.modified_gmt}Z`).toISOString() : null,
      data: {
        id: p.id,
        slug: p.slug,
        link: p.link,
        title: p.title,
        modified_gmt: p.modified_gmt,
        date_gmt: p.date_gmt,
      },
      fetched_at: fetchedAt,
    }));

    if (rows.length) {
      const { error } = await supabase.from("wp_posts_cache").upsert(rows, { onConflict: "post_id" });
      if (error) throw error;
    }

    const postRefs = posts.map((p) => ({ id: p.id, slug: p.slug || "", title: postTitle(p.title) }));
    await supabase
      .from("wp_import_pages")
      .update({
        status: "success",
        imported_count: rows.length,
        post_ids: posts.map((p) => p.id),
        post_refs: postRefs,
        error: null,
        fetched_at: fetchedAt,
        updated_at: fetchedAt,
      })
      .eq("run_id", runId)
      .eq("page", page);

    return { page, fetched: rows.length };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown page fetch error";
    await supabase
      .from("wp_import_pages")
      .update({
        status: "failed",
        error: message,
        updated_at: new Date().toISOString(),
      })
      .eq("run_id", runId)
      .eq("page", page);
    const { data: pageRow } = await supabase
      .from("wp_import_pages")
      .select("retry_count")
      .eq("run_id", runId)
      .eq("page", page)
      .maybeSingle();
    await supabase
      .from("wp_import_pages")
      .update({ retry_count: Number(pageRow?.retry_count || 0) + 1, updated_at: new Date().toISOString() })
      .eq("run_id", runId)
      .eq("page", page);
    throw error;
  }
}

async function updateRunSummary(supabase: ReturnType<typeof createClient>, runId: string) {
  const { data: pages } = await supabase
    .from("wp_import_pages")
    .select("page,status,imported_count")
    .eq("run_id", runId)
    .order("page", { ascending: true })
    .range(0, 999);
  const rows = pages || [];
  const importedTotal = rows.reduce((sum: number, p: any) => sum + Number(p.imported_count || 0), 0);
  const firstMissing = rows.find((p: any) => p.status !== "success")?.page || null;
  const failed = rows.find((p: any) => p.status === "failed");
  const status = firstMissing ? (failed ? "failed" : "running") : "completed";
  const now = new Date().toISOString();
  await supabase
    .from("wp_import_runs")
    .update({
      status,
      imported_total: importedTotal,
      first_missing_page: firstMissing,
      completed_at: status === "completed" ? now : null,
      updated_at: now,
    })
    .eq("id", runId);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  let body: any = {};
  try { body = await req.json(); } catch { /* ignore */ }

  const pw = body?._audit_password || req.headers.get("x-audit-password");
  if (!pw || pw !== Deno.env.get("AUDIT_PASSWORD")) return json({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const mode = body?.mode || "diagnostics";

  try {
    if (mode === "start") {
      const run = await createRun(supabase);
      const diagnostics = await getDiagnostics(supabase, run.id);
      return json({ run, ...diagnostics });
    }

    if (mode === "continue") {
      const runId = String(body?.run_id || "");
      if (!runId) return json({ error: "run_id required" }, 400);
      const diagnostics = await getDiagnostics(supabase, runId);
      const page = Number(body?.page || diagnostics.firstMissingPage || 1);
      if (!page) return json({ done: true, ...diagnostics });
      let fetched: { page: number; fetched: number } | { page: number; fetched: number; error: string };
      try {
        fetched = await fetchPage(supabase, runId, page);
      } catch (error) {
        fetched = { page, fetched: 0, error: error instanceof Error ? error.message : "Unknown page fetch error" };
      }
      await updateRunSummary(supabase, runId);
      const next = await getDiagnostics(supabase, runId);
      return json({ ...fetched, done: !next.firstMissingPage, ...next }, "error" in fetched ? 502 : 200);
    }

    if (mode === "retry") {
      const latest = await getDiagnostics(supabase, body?.run_id);
      const runId = latest.run?.id;
      if (!runId) return json({ error: "No import run found" }, 404);
      await supabase
        .from("wp_import_pages")
        .update({ status: "pending", error: null, updated_at: new Date().toISOString() })
        .eq("run_id", runId)
        .neq("status", "success");
      await supabase.from("wp_import_runs").update({ status: "running", error: null, first_missing_page: latest.firstMissingPage || 1 }).eq("id", runId);
      return json(await getDiagnostics(supabase, runId));
    }

    if (mode === "diagnostics" || mode === "count") return json(await getDiagnostics(supabase, body?.run_id));

    if (mode === "results" || mode === "list") {
      const diagnostics = await getDiagnostics(supabase, body?.run_id);
      const posts = await getCachedPosts(supabase);
      return json({ posts, ...diagnostics });
    }

    return json({ error: "Unknown mode" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown WP import error";
    return json({ error: message }, 500);
  }
});
