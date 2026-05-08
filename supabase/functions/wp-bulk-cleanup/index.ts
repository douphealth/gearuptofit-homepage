// Site-wide cleanup of leaked WordPress post CSS.
//
// Designed for strict Edge Function memory limits:
// - no heavy SDK imports
// - scan reads one small WP page per invocation by default
// - fix rewrites one post per invocation by default
// - leaked CSS is removed, not re-wrapped in <style>, because WP REST/KSES can
//   strip <style> and expose the CSS as visible text again.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const MAX_SCAN_PER_PAGE = 3;
const MAX_FIX_PER_CALL = 1;

const LEAK_ANCHORS = [
  ".gutf-article {",
  ".product-box-inner {",
  ".elementor-widget-theme-post-content {",
];

function toInt(value: unknown, fallback: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, Math.trunc(n)));
}

function decodeEntities(value: string): string {
  return value
    .replace(/&#8211;/g, "–")
    .replace(/&#8212;/g, "—")
    .replace(/&#038;/g, "&")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">");
}

function stripTags(value: string): string {
  return decodeEntities(value.replace(/<[^>]+>/g, "").trim());
}

function extractLeak(text: string): { start: number; end: number; css: string } | null {
  let start = -1;
  for (const anchor of LEAK_ANCHORS) {
    const idx = text.indexOf(anchor);
    if (idx !== -1 && (start === -1 || idx < start)) start = idx;
  }
  if (start === -1) return null;

  let depth = 0;
  let lastClose = -1;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) {
        lastClose = i;
        let j = i + 1;
        while (j < text.length && /\s/.test(text[j])) j++;
        if (j >= text.length) break;
        const next = text[j];
        if (next === "." || next === "@" || next === "#" || /[a-zA-Z]/.test(next)) {
          const nextBrace = text.indexOf("{", j);
          const nextLt = text.indexOf("<", j);
          if (nextBrace !== -1 && (nextLt === -1 || nextBrace < nextLt)) continue;
        }
        break;
      }
    } else if (c === "<" && depth === 0) {
      break;
    }
  }
  if (lastClose === -1) return null;
  return { start, end: lastClose + 1, css: text.slice(start, lastClose + 1) };
}

function styleRanges(html: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const re = /<style[\s\S]*?<\/style>/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(html)) !== null) ranges.push([match.index, match.index + match[0].length]);
  return ranges;
}

function findLeakStartOutsideStyle(html: string): number {
  const ranges = styleRanges(html);
  const inStyle = (pos: number) => ranges.some(([s, e]) => pos >= s && pos < e);
  let found = -1;
  for (const anchor of LEAK_ANCHORS) {
    let from = 0;
    while (from < html.length) {
      const idx = html.indexOf(anchor, from);
      if (idx === -1) break;
      if (!inStyle(idx) && (found === -1 || idx < found)) {
        found = idx;
        break;
      }
      from = idx + anchor.length;
    }
  }
  return found;
}

function hasLeakOutsideStyle(html: string): boolean {
  if (!LEAK_ANCHORS.some((anchor) => html.includes(anchor))) return false;
  return findLeakStartOutsideStyle(html) !== -1;
}

function cleanContent(html: string): { cleaned: string; removed: string } | null {
  const leakStart = findLeakStartOutsideStyle(html);
  if (leakStart === -1) return null;
  const leak = extractLeak(html.slice(leakStart));
  if (!leak) return null;

  const before = html.slice(0, leakStart);
  const after = html.slice(leakStart + leak.css.length);
  const cleaned = (before + after).replace(/^\s+/, "");
  return { cleaned, removed: leak.css };
}

async function readBody(req: Request): Promise<Record<string, unknown>> {
  try {
    return await req.json();
  } catch {
    return {};
  }
}

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

async function logCleanup(postId: number, removedChars: number) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || removedChars <= 0) return;

  try {
    const res = await fetch(`${url}/rest/v1/push_log`, {
      method: "POST",
      headers: {
        apikey: key,
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/json",
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        post_id: postId,
        status: "cleanup",
        message: `Removed ${removedChars} chars of leaked CSS text.`,
        draft_url: `https://gearuptofit.com/wp-admin/post.php?post=${postId}&action=edit`,
      }),
    });
    await res.text();
  } catch {
    // Logging must never make cleanup fail.
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await readBody(req);
  const pw = String(body._audit_password || req.headers.get("x-audit-password") || "");
  if (!pw || pw !== Deno.env.get("AUDIT_PASSWORD")) return jsonRes({ error: "Unauthorized" }, 401);

  const mode = String(body.mode || "scan");
  const user = Deno.env.get("WP_USERNAME");
  const pass = Deno.env.get("WP_APP_PASSWORD")?.replace(/\s+/g, "");

  if (mode === "scan") {
    const page = toInt(body.page, 1, 1, 10000);
    const perPage = toInt(body.per_page, 1, 1, MAX_SCAN_PER_PAGE);
    const endpoint = `${WP_BASE}/posts?per_page=${perPage}&page=${page}&status=publish&_fields=id,link,title,content`;
    const wpRes = await fetch(endpoint, { headers: { "User-Agent": "GearupAudit/1.0" } });

    if (wpRes.status === 400) {
      await wpRes.text();
      return jsonRes({ mode, page, per_page: perPage, count: 0, affected: [], totalPages: 0, done: true });
    }
    if (!wpRes.ok) {
      await wpRes.text();
      return jsonRes({ error: `WP REST page ${page} failed: ${wpRes.status}` }, 502);
    }

    const totalPages = Number(wpRes.headers.get("x-wp-totalpages") || 0);
    const text = await wpRes.text();
    const affected: Array<{ post_id: number; link: string; title: string }> = [];

    if (LEAK_ANCHORS.some((anchor) => text.includes(anchor))) {
      const items = JSON.parse(text);
      if (Array.isArray(items)) {
        for (const item of items) {
          const html = item?.content?.rendered || item?.content?.raw || "";
          if (!hasLeakOutsideStyle(html)) continue;
          affected.push({
            post_id: Number(item.id),
            link: String(item.link || ""),
            title: stripTags(String(item.title?.rendered || "Untitled")),
          });
        }
      }
    }

    const done = totalPages > 0 ? page >= totalPages : false;
    return jsonRes({ mode, page, per_page: perPage, totalPages, count: affected.length, affected, done });
  }

  if (mode === "fix") {
    if (!user || !pass) return jsonRes({ error: "WP credentials not configured" }, 500);
    const ids = Array.isArray(body.post_ids) ? body.post_ids.map(Number).filter(Boolean) : [];
    const limitedIds = ids.slice(0, MAX_FIX_PER_CALL);
    if (!limitedIds.length) return jsonRes({ error: "post_ids required (one post per call)" }, 400);

    const auth = "Basic " + btoa(`${user}:${pass}`);
    const results: Array<{ post_id: number; ok: boolean; removed_chars?: number; error?: string }> = [];

    for (const id of limitedIds) {
      try {
        const getRes = await fetch(`${WP_BASE}/posts/${id}?_fields=id,content&context=edit`, {
          headers: { Authorization: auth, "User-Agent": "GearupAudit/1.0" },
        });
        if (!getRes.ok) {
          await getRes.text();
          results.push({ post_id: id, ok: false, error: `GET ${getRes.status}` });
          continue;
        }
        const post = await getRes.json();
        const raw = post?.content?.raw ?? post?.content?.rendered ?? "";
        const cleaned = cleanContent(raw);
        if (!cleaned) {
          results.push({ post_id: id, ok: true, removed_chars: 0 });
          continue;
        }

        const updateRes = await fetch(`${WP_BASE}/posts/${id}`, {
          method: "POST",
          headers: { Authorization: auth, "Content-Type": "application/json", "User-Agent": "GearupAudit/1.0" },
          body: JSON.stringify({ content: cleaned.cleaned }),
        });
        if (!updateRes.ok) {
          const errorText = await updateRes.text();
          results.push({ post_id: id, ok: false, error: `PUT ${updateRes.status}: ${errorText.slice(0, 160)}` });
          continue;
        }
        await updateRes.text();
        results.push({ post_id: id, ok: true, removed_chars: cleaned.removed.length });
        await logCleanup(id, cleaned.removed.length);
      } catch (e) {
        results.push({ post_id: id, ok: false, error: e instanceof Error ? e.message : String(e) });
      }
    }

    const fixed = results.filter((result) => result.ok && (result.removed_chars || 0) > 0).length;
    return jsonRes({ mode, attempted: results.length, fixed, results });
  }

  return jsonRes({ error: "Unknown mode" }, 400);
});
