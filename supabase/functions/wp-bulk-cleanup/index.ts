// Site-wide cleanup of leaked WordPress CSS.
//
// Root cause: the visible `.gutf-article { ... }` text was created by globally
// published Elementor snippets. One duplicate snippet injected the CSS without
// a <style> wrapper, so every apex-domain post rendered the rules as text. Post
// re-saves cannot fix this because the bad source is global snippet metadata,
// not individual post content.
//
// This function now scans/fixes the source: published Elementor snippets whose
// code is raw article-layout CSS or the duplicated "Post Layout Fix" snippets.
// It avoids full-site HTML crawling to stay below worker memory limits.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WP_BASE = "https://origin.gearuptofit.com/wp-json/wp/v2";
const APEX = "https://gearuptofit.com";
const MAX_FIX_PER_CALL = 1;

const LEAK_ANCHORS = [
  ".gutf-article {",
  ".gutf-article{",
  ".product-box-inner {",
  ".product-box-inner{",
];

type Snippet = {
  id: number;
  slug?: string;
  status?: string;
  title?: { raw?: string; rendered?: string };
  meta?: Record<string, unknown>;
};

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

function codeHasRawCssLeak(code: string): boolean {
  const trimmed = code.trim();
  if (!trimmed) return false;
  if (/^<style\b[\s\S]*<\/style>\s*$/i.test(trimmed)) return false;
  return LEAK_ANCHORS.some((a) => trimmed.includes(a));
}

function snippetTitle(item: Snippet): string {
  return stripTags(String(item.title?.raw || item.title?.rendered || "Untitled snippet"));
}

function snippetHasLeak(item: Snippet): { found: boolean; sample?: string; reason?: string } {
  const title = snippetTitle(item);
  const code = String(item.meta?._elementor_code || "");
  if (/post layout fix/i.test(title) && LEAK_ANCHORS.some((a) => code.includes(a.replace(" ", "")) || code.includes(a))) {
    return { found: true, reason: "duplicated global Elementor CSS snippet", sample: code.slice(0, 180).replace(/\s+/g, " ") };
  }
  if (codeHasRawCssLeak(code)) {
    return { found: true, reason: "raw CSS missing <style> wrapper", sample: code.slice(0, 180).replace(/\s+/g, " ") };
  }
  return { found: false };
}

function htmlHasLeak(html: string): { found: boolean; sample?: string } {
  const withoutStyles = stripStyleAndScript(html);
  const stripped = withoutStyles.replace(/<!--[\s\S]*?-->/g, "");
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
    const authUser = Deno.env.get("WP_USERNAME");
    const authPass = Deno.env.get("WP_APP_PASSWORD")?.replace(/\s+/g, "");
    const headers: Record<string, string> = { "User-Agent": "GearupAudit/1.0", "Accept": "application/json" };
    if (authUser && authPass) headers.Authorization = "Basic " + btoa(`${authUser}:${authPass}`);

    const res = await fetch(`${WP_BASE}/elementor_snippet?per_page=100&status=publish&context=edit&_fields=id,slug,status,title,meta`, { headers });
    if (!res.ok) {
      const text = await res.text();
      return jsonRes({ error: `Elementor snippet scan failed: ${res.status} ${text.slice(0, 160)}` }, 502);
    }

    const snippets: Snippet[] = await res.json();
    const affected = snippets.flatMap((item) => {
      const leak = snippetHasLeak(item);
      if (!leak.found) return [];
      return [{
        post_id: Number(item.id),
        link: `${APEX}/wp-admin/post.php?post=${Number(item.id)}&action=edit`,
        title: snippetTitle(item),
        sample: `${leak.reason}: ${leak.sample || ""}`,
      }];
    });

    return jsonRes({ mode, page: 1, per_page: snippets.length, totalPages: 1, count: affected.length, affected, done: true });
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
