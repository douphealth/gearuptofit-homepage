// Site-wide cleanup of leaked WordPress post CSS.
//
// IMPORTANT: The leak is NOT inside the WP post content (REST `content.rendered`
// returns clean content with proper <style> blocks). The leak appears only in
// the *rendered apex HTML* (gearuptofit.com/<slug>/) — it's injected by the
// theme/Elementor render pipeline and the <style> wrapper gets stripped
// downstream, exposing the CSS rules as visible text.
//
// Therefore the scanner must fetch the *rendered apex page* per post and look
// for leak signatures appearing OUTSIDE <style>/<script> blocks. Memory stays
// tiny by processing one post per invocation.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const APEX = "https://gearuptofit.com";
const MAX_SCAN_PER_PAGE = 2;
const MAX_FIX_PER_CALL = 1;

const LEAK_ANCHORS = [
  ".gutf-article {",
  ".gutf-article{",
  ".product-box-inner {",
  ".product-box-inner{",
];

function toInt(v: unknown, def: number, min: number, max: number): number {
  const n = Number(v);
  if (!Number.isFinite(n)) return def;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function decodeEntities(v: string): string {
  return v
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—")
    .replace(/&#038;/g, "&").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function stripTags(v: string): string {
  return decodeEntities(v.replace(/<[^>]+>/g, "").trim());
}

function stripStyleAndScript(html: string): string {
  return html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "");
}

function htmlHasLeak(html: string): { found: boolean; sample?: string } {
  const stripped = stripStyleAndScript(html);
  for (const a of LEAK_ANCHORS) {
    const i = stripped.indexOf(a);
    if (i !== -1) {
      return { found: true, sample: stripped.slice(i, i + 160).replace(/\s+/g, " ") };
    }
  }
  return { found: false };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try { return await req.json(); } catch { return {}; }
}
function jsonRes(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logEvent(postId: number, message: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/push_log`, {
      method: "POST",
      headers: {
        apikey: key, Authorization: `Bearer ${key}`,
        "Content-Type": "application/json", Prefer: "return=minimal",
      },
      body: JSON.stringify({
        post_id: postId, status: "cleanup", message,
        draft_url: `${APEX}/wp-admin/post.php?post=${postId}&action=edit`,
      }),
    }).then((r) => r.text());
  } catch { /* never fail on logging */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await readBody(req);
  const pw = String(body._audit_password || req.headers.get("x-audit-password") || "");
  if (!pw || pw !== Deno.env.get("AUDIT_PASSWORD")) return jsonRes({ error: "Unauthorized" }, 401);

  const mode = String(body.mode || "scan");

  // ── SCAN ──────────────────────────────────────────────────────────────
  if (mode === "scan") {
    const page = toInt(body.page, 1, 1, 10000);
    const perPage = toInt(body.per_page, 1, 1, MAX_SCAN_PER_PAGE);

    // 1) Get list of posts (id + link) for this page — tiny payload.
    const listUrl = `${WP_BASE}/posts?per_page=${perPage}&page=${page}&status=publish&_fields=id,link,title`;
    const listRes = await fetch(listUrl, { headers: { "User-Agent": "GearupAudit/1.0" } });
    if (listRes.status === 400) {
      await listRes.text();
      return jsonRes({ mode, page, per_page: perPage, count: 0, affected: [], totalPages: 0, done: true });
    }
    if (!listRes.ok) {
      await listRes.text();
      return jsonRes({ error: `WP REST list page ${page} failed: ${listRes.status}` }, 502);
    }
    const totalPages = Number(listRes.headers.get("x-wp-totalpages") || 0);
    const items: Array<{ id: number; link: string; title: { rendered: string } }> = await listRes.json();

    const affected: Array<{ post_id: number; link: string; title: string; sample: string }> = [];

    // 2) For each post, fetch the rendered apex HTML and look for leaks
    //    OUTSIDE <style>/<script>.
    for (const item of items) {
      const link = String(item.link || "");
      if (!link) continue;
      try {
        const pageRes = await fetch(link, {
          headers: {
            "User-Agent": "Mozilla/5.0 GearupAudit/1.0",
            "Accept": "text/html",
          },
          redirect: "follow",
        });
        if (!pageRes.ok) { await pageRes.text(); continue; }
        const html = await pageRes.text();
        const { found, sample } = htmlHasLeak(html);
        if (found) {
          affected.push({
            post_id: Number(item.id),
            link,
            title: stripTags(String(item.title?.rendered || "Untitled")),
            sample: sample || "",
          });
        }
      } catch {
        // skip on individual page failure
      }
    }

    const done = totalPages > 0 ? page >= totalPages : false;
    return jsonRes({ mode, page, per_page: perPage, totalPages, count: affected.length, affected, done });
  }

  // ── FIX ──────────────────────────────────────────────────────────────
  // Because the leak is injected by theme/Elementor render and is not in
  // post.content, we can't surgically fix it from REST content. As a best
  // effort, we re-save the post (forces WP to re-process content) which
  // sometimes flushes broken caches. We log every attempt.
  if (mode === "fix") {
    const user = Deno.env.get("WP_USERNAME");
    const pass = Deno.env.get("WP_APP_PASSWORD")?.replace(/\s+/g, "");
    if (!user || !pass) return jsonRes({ error: "WP credentials not configured" }, 500);

    const ids = Array.isArray(body.post_ids) ? body.post_ids.map(Number).filter(Boolean) : [];
    const limited = ids.slice(0, MAX_FIX_PER_CALL);
    if (!limited.length) return jsonRes({ error: "post_ids required" }, 400);

    const auth = "Basic " + btoa(`${user}:${pass}`);
    const results: Array<{ post_id: number; ok: boolean; removed_chars?: number; error?: string }> = [];

    for (const id of limited) {
      try {
        // Re-save with same content to bust render cache.
        const getRes = await fetch(`${WP_BASE}/posts/${id}?_fields=id,content&context=edit`, {
          headers: { Authorization: auth, "User-Agent": "GearupAudit/1.0" },
        });
        if (!getRes.ok) {
          await getRes.text();
          results.push({ post_id: id, ok: false, error: `GET ${getRes.status} — fix requires manual edit (theme-injected CSS)` });
          continue;
        }
        const post = await getRes.json();
        const raw = post?.content?.raw ?? post?.content?.rendered ?? "";
        const updateRes = await fetch(`${WP_BASE}/posts/${id}`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json", "User-Agent": "GearupAudit/1.0" },
          body: JSON.stringify({ content: raw }),
        });
        if (!updateRes.ok) {
          const t = await updateRes.text();
          results.push({ post_id: id, ok: false, error: `PUT ${updateRes.status}: ${t.slice(0, 160)}` });
          continue;
        }
        await updateRes.text();
        results.push({ post_id: id, ok: true, removed_chars: 0 });
        await logEvent(id, "Re-saved post to bust render cache. If leak persists, source is theme/Elementor custom CSS — edit in wp-admin.");
      } catch (e) {
        results.push({ post_id: id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    return jsonRes({ mode, attempted: results.length, fixed: results.filter((r) => r.ok).length, results });
  }

  return jsonRes({ error: "Unknown mode" }, 400);
});
