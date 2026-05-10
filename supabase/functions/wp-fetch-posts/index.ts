import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const SITE_BASE = "https://gearuptofit.com";
const ORIGIN_SITE_BASE = "https://origin.gearuptofit.com";
const WP_BASE = `${SITE_BASE}/wp-json/wp/v2`;
const ORIGIN_WP_BASE = `${ORIGIN_SITE_BASE}/wp-json/wp/v2`;
const AUTHORITATIVE_POST_SITEMAPS = [
  `${SITE_BASE}/post-sitemap.xml`,
  `${SITE_BASE}/post-sitemap2.xml`,
];
const PER_PAGE = 50;
const FIELDS = "id,slug,link,title,modified_gmt,date_gmt";
const MAX_MISSING = 500;
let sitemapCache: { at: number; entries: SitemapEntry[] } | null = null;

type WpPost = {
  id: number;
  slug?: string;
  link?: string;
  title?: { rendered?: string } | string;
  modified_gmt?: string;
  date_gmt?: string;
};

type SitemapEntry = { loc: string; lastmod?: string };

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function postTitle(title: WpPost["title"]) {
  return typeof title === "object" ? title?.rendered || "" : String(title ?? "");
}

function normalizeApexUrl(value?: string | null): string {
  if (!value) return "";
  return String(value)
    .replace(/^https?:\/\/origin\.gearuptofit\.com/i, SITE_BASE)
    .replace(/^http:\/\/gearuptofit\.com/i, SITE_BASE)
    .replace(/#.*$/, "")
    .trim();
}

function slugFromUrl(value: string): string {
  try {
    const path = new URL(value).pathname.replace(/\/+$/, "");
    return decodeURIComponent(path.split("/").filter(Boolean).pop() || "");
  } catch {
    return "";
  }
}

async function fetchSitemapXml(url: string): Promise<string> {
  const headers = { "User-Agent": "GearupAudit/4.0 (+authoritative-sitemap)", accept: "application/xml,text/xml" };
  for (const target of [url, url.replace(SITE_BASE, ORIGIN_SITE_BASE)]) {
    try {
      const res = await fetch(target, { headers });
      if (res.ok) return await res.text();
    } catch { /* try next */ }
  }
  throw new Error(`Sitemap fetch failed: ${url}`);
}

function parseSitemapEntries(xml: string): SitemapEntry[] {
  const entries: SitemapEntry[] = [];
  const urlBlocks = xml.match(/<url[\s\S]*?<\/url>/gi) || [];
  for (const block of urlBlocks) {
    const loc = normalizeApexUrl((block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i) || [])[1]);
    if (!loc || !loc.startsWith(`${SITE_BASE}/`)) continue;
    const lastmod = (block.match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i) || [])[1]?.trim();
    entries.push({ loc, lastmod });
  }
  if (!entries.length) {
    for (const [, locRaw] of xml.matchAll(/<loc>\s*([\s\S]*?)\s*<\/loc>/gi)) {
      const loc = normalizeApexUrl(locRaw);
      if (loc && loc.startsWith(`${SITE_BASE}/`)) entries.push({ loc });
    }
  }
  return entries;
}

async function getAuthoritativeSitemapEntries(): Promise<SitemapEntry[]> {
  if (sitemapCache && Date.now() - sitemapCache.at < 5 * 60 * 1000) return sitemapCache.entries;
  const seen = new Set<string>();
  const all: SitemapEntry[] = [];
  for (const sitemap of AUTHORITATIVE_POST_SITEMAPS) {
    const xml = await fetchSitemapXml(sitemap);
    for (const entry of parseSitemapEntries(xml)) {
      if (seen.has(entry.loc)) continue;
      seen.add(entry.loc);
      all.push(entry);
    }
  }
  sitemapCache = { at: Date.now(), entries: all };
  return all;
}

async function getWpCount(entries?: SitemapEntry[]) {
  const sourceEntries = entries || await getAuthoritativeSitemapEntries();
  const total = sourceEntries.length;
  const totalPages = Math.max(1, Math.ceil(total / PER_PAGE));
  return { total, totalPages };
}

async function getCachedPosts(supabase: any) {
  const PAGE = 1000;
  let from = 0;
  const all: any[] = [];
  // Paginate around PostgREST default max-rows cap (1000)
  while (true) {
    const { data, error } = await supabase
      .from("wp_posts_cache")
      .select("post_id, slug, title, link, modified_at")
      .order("modified_at", { ascending: false })
      .range(from, from + PAGE - 1);
    if (error) throw error;
    const rows = data || [];
    all.push(...rows);
    if (rows.length < PAGE) break;
    from += PAGE;
    if (from > 50000) break; // safety
  }
  return all;
}

async function getCachedCount(supabase: any) {
  const { count, error } = await supabase
    .from("wp_posts_cache")
    .select("post_id", { count: "exact", head: true });
  if (error) throw error;
  return count || 0;
}

async function getDiagnostics(supabase: any, runId?: string) {
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

  const sitemapEntries = await getAuthoritativeSitemapEntries();
  const { total, totalPages } = await getWpCount(sitemapEntries);
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
      source: "post-sitemap.xml + post-sitemap2.xml",
      sitemapUrls: AUTHORITATIVE_POST_SITEMAPS,
      totalPublished: total,
      totalPages,
      perPage: PER_PAGE,
      cachedCount: await getCachedCount(supabase),
      difference: total - (await getCachedCount(supabase)),
      complete: (await getCachedCount(supabase)) >= total,
    },
    run,
    pages: pages || [],
    firstMissingPage,
    missingFromCache,
  };
}

async function createRun(supabase: any) {
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

  await supabase.from("wp_posts_cache").delete().gte("post_id", 0);

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

async function fetchWpPostBySlug(slug: string): Promise<WpPost | null> {
  if (!slug) return null;
  for (const base of [WP_BASE, ORIGIN_WP_BASE]) {
    try {
      const r = await fetch(`${base}/posts?slug=${encodeURIComponent(slug)}&status=publish&_fields=${FIELDS}`, {
        headers: { "User-Agent": "GearupAudit/4.0" },
      });
      if (!r.ok) continue;
      const data = await r.json().catch(() => []);
      if (Array.isArray(data) && data[0]?.id) return data[0] as WpPost;
    } catch { /* try next */ }
  }
  return null;
}

async function fetchPage(supabase: any, runId: string, page: number) {
  const now = new Date().toISOString();
  await supabase
    .from("wp_import_pages")
    .update({ status: "running", error: null, updated_at: now })
    .eq("run_id", runId)
    .eq("page", page);

  try {
    const entries = await getAuthoritativeSitemapEntries();
    const batch = entries.slice((page - 1) * PER_PAGE, page * PER_PAGE);
    const posts: Array<WpPost & { sitemap_loc?: string; sitemap_lastmod?: string }> = [];
    const unresolved: SitemapEntry[] = [];
    for (const entry of batch) {
      const post = await fetchWpPostBySlug(slugFromUrl(entry.loc));
      if (post) posts.push({ ...post, sitemap_loc: entry.loc, sitemap_lastmod: entry.lastmod });
      else unresolved.push(entry);
    }
    const fetchedAt = new Date().toISOString();
    const rows = posts.map((p) => ({
      post_id: p.id,
      slug: p.slug,
      title: postTitle(p.title),
      link: normalizeApexUrl(p.link || p.sitemap_loc),
      modified_at: p.modified_gmt ? new Date(`${p.modified_gmt}Z`).toISOString() : (p.sitemap_lastmod ? new Date(p.sitemap_lastmod).toISOString() : null),
      data: {
        id: p.id,
        slug: p.slug,
        link: normalizeApexUrl(p.link || p.sitemap_loc),
        title: p.title,
        modified_gmt: p.modified_gmt,
        date_gmt: p.date_gmt,
        sitemap_loc: p.sitemap_loc,
        sitemap_lastmod: p.sitemap_lastmod,
      },
      fetched_at: fetchedAt,
    }));

    if (rows.length) {
      const { error } = await supabase.from("wp_posts_cache").upsert(rows, { onConflict: "post_id" });
      if (error) throw error;
    }

    const postRefs = posts.map((p) => ({ id: p.id, slug: p.slug || "", title: postTitle(p.title), loc: p.sitemap_loc }));
    await supabase
      .from("wp_import_pages")
      .update({
        status: "success",
        imported_count: rows.length,
        post_ids: posts.map((p) => p.id),
        post_refs: [...postRefs, ...unresolved.map((entry) => ({ id: 0, slug: slugFromUrl(entry.loc), title: "Unresolved sitemap URL", loc: entry.loc }))],
        error: unresolved.length ? `Skipped ${unresolved.length} sitemap URL(s) that are not published posts` : null,
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

async function updateRunSummary(supabase: any, runId: string) {
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
