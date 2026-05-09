// Site-wide cleanup of leaked WordPress CSS that renders as visible text.
//
// Root cause (verified on origin.gearuptofit.com REST API):
//   Authors pasted a large CSS block into post content as HTML. The first
//   <style>…</style> closes early (sidebar-hide CSS), and the remaining CSS
//   declarations sit OUTSIDE any <style> tag. WordPress's wpautop then wraps
//   the orphan CSS in <p>…</p> tags, so the browser renders the rules as
//   visible text at the top of the post (".gutf-article { … !important … }").
//
// SOTA fix: surgically re-wrap the orphan CSS region in a single <style> tag
// inside the raw post content, then PUT it back via the REST API. This keeps
// the author's design system intact and never touches valid prose.
//
// Memory-safe: 1 page (≤100 posts) per scan call, 1 post per fix call.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WP_BASE = "https://origin.gearuptofit.com/wp-json/wp/v2";
const APEX = "https://gearuptofit.com";

// CSS signatures that indicate orphan rules visible in body text.
const VISIBLE_LEAK_PATTERNS: RegExp[] = [
  /\.gutf-article\s*\{[^}]*!important/i,
  /\.product-box-(?:img|inner|content|specs)\s*\{[^}]*!important/i,
  /\.elementor-widget-theme-post-content\s*\{[^}]*max-width\s*:\s*\d+px\s*!important/i,
  /\.gutf-callout\s*\{/i,
  /\.gutf-toc\s*\{/i,
];

type Post = {
  id: number;
  slug?: string;
  link?: string;
  title?: { rendered?: string; raw?: string };
  content?: { rendered?: string; raw?: string };
};

function jsonRes(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
async function readBody(req: Request) {
  try { return await req.json() as Record<string, unknown>; } catch { return {}; }
}

function decodeEntities(v: string): string {
  return v
    .replace(/&#8211;/g, "–").replace(/&#8212;/g, "—")
    .replace(/&#038;/g, "&").replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"').replace(/&#039;/g, "'")
    .replace(/&lt;/g, "<").replace(/&gt;/g, ">");
}
function plainTitle(p: Post): string {
  const raw = p.title?.raw || p.title?.rendered || `Post ${p.id}`;
  return decodeEntities(raw.replace(/<[^>]+>/g, "").trim());
}

// Strip <style>/<script>/<!-- --> regions, then test for visible leak markers.
function renderedHasLeak(html: string): { found: boolean; sample?: string } {
  const stripped = html
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<script[\s\S]*?<\/script>/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
  for (const re of VISIBLE_LEAK_PATTERNS) {
    const m = re.exec(stripped);
    if (m) {
      const i = Math.max(0, m.index - 30);
      return { found: true, sample: stripped.slice(i, i + 200).replace(/\s+/g, " ") };
    }
  }
  return { found: false };
}

// Detect "this looks like CSS, not prose": at least one selector { … } pair.
const CSS_SIGNATURE = /[.@#a-zA-Z][^<>{}\n]{0,160}\{[^<>}]{2,}\}/;

/**
 * Walk the raw post HTML and re-wrap every orphan CSS region in <style>…</style>.
 *
 * Strategy:
 *   1. Find all `<style …>…</style>` and `<script …>…</script>` regions and treat
 *      them as protected.
 *   2. Look at every gap *between* HTML tags that lives OUTSIDE a protected region.
 *      If the gap contains a CSS rule signature (`selector { … }`) we mark it as
 *      orphan CSS.
 *   3. Merge consecutive orphan gaps (with their separating tags, like the `</p>
 *      <p>` injected by wpautop) into a single contiguous orphan block.
 *   4. Replace each merged block with `<style>cleaned-css</style>` where the
 *      cleaned CSS strips wrapper tags (`</p>`, `<p>`, `<br />`) but keeps the
 *      original CSS text.
 *
 * This is conservative: blocks that are pure prose are never touched because
 * they don't match the CSS rule signature.
 */
function rewrapOrphanCss(raw: string): { html: string; removed: number } {
  // Find protected regions (start, end) for <style> and <script>.
  const protectedRanges: Array<[number, number]> = [];
  const reProt = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = reProt.exec(raw))) protectedRanges.push([pm.index, pm.index + pm[0].length]);
  const inProtected = (i: number) => protectedRanges.some(([a, b]) => i >= a && i < b);

  // Tokenize into an array of segments: { kind: 'tag' | 'text', start, end }.
  type Seg = { kind: "tag" | "text"; start: number; end: number };
  const segs: Seg[] = [];
  let cursor = 0;
  const reTag = /<[^>]+>/g;
  let tm: RegExpExecArray | null;
  while ((tm = reTag.exec(raw))) {
    if (tm.index > cursor) segs.push({ kind: "text", start: cursor, end: tm.index });
    segs.push({ kind: "tag", start: tm.index, end: tm.index + tm[0].length });
    cursor = tm.index + tm[0].length;
  }
  if (cursor < raw.length) segs.push({ kind: "text", start: cursor, end: raw.length });

  // Find orphan CSS text segments (outside protected ranges, contain CSS signature).
  const orphanText = segs.map((s) => {
    if (s.kind !== "text") return false;
    if (inProtected(s.start)) return false;
    const txt = raw.slice(s.start, s.end);
    return CSS_SIGNATURE.test(txt);
  });

  if (!orphanText.some(Boolean)) return { html: raw, removed: 0 };

  // Group contiguous orphan runs. Tags that appear *between* two orphan text
  // segments (e.g. `</p><p>` injected by wpautop) are absorbed into the run.
  type Run = { firstSeg: number; lastSeg: number };
  const runs: Run[] = [];
  let i = 0;
  while (i < segs.length) {
    if (!orphanText[i]) { i++; continue; }
    let j = i;
    let k = i + 1;
    // Extend through tags + further orphan text.
    while (k < segs.length) {
      if (orphanText[k]) { j = k; k++; continue; }
      if (segs[k].kind === "tag" && !inProtected(segs[k].start)) {
        // Look ahead: is there more orphan text shortly?
        let look = k + 1;
        let foundMore = false;
        // Allow up to 3 intervening tags (e.g. </p><p> with whitespace text gap is rare here)
        while (look < segs.length && look <= k + 3) {
          if (orphanText[look]) { foundMore = true; break; }
          if (segs[look].kind === "text") {
            const t = raw.slice(segs[look].start, segs[look].end).trim();
            if (t.length > 0 && !CSS_SIGNATURE.test(raw.slice(segs[look].start, segs[look].end))) break;
          }
          look++;
        }
        if (foundMore) { k++; continue; }
      }
      break;
    }
    runs.push({ firstSeg: i, lastSeg: j });
    i = j + 1;
  }

  if (!runs.length) return { html: raw, removed: 0 };

  // Build new HTML by replacing each run with a single <style> block.
  let out = "";
  let lastEnd = 0;
  let removedTotal = 0;
  for (const run of runs) {
    const runStart = segs[run.firstSeg].start;
    const runEnd = segs[run.lastSeg].end;
    out += raw.slice(lastEnd, runStart);
    const slice = raw.slice(runStart, runEnd);
    // Strip wpautop wrappers and stray markup from inside the orphan CSS.
    const cleaned = slice
      .replace(/<\/?p\b[^>]*>/gi, "\n")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/?span\b[^>]*>/gi, "")
      .replace(/&nbsp;/g, " ")
      .trim();
    out += `<style>${cleaned}</style>`;
    removedTotal += slice.length - cleaned.length;
    lastEnd = runEnd;
  }
  out += raw.slice(lastEnd);
  return { html: out, removed: removedTotal };
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
  } catch { /* logging is best-effort */ }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await readBody(req);
  const pw = String(body._audit_password || req.headers.get("x-audit-password") || "");
  if (!pw || pw !== Deno.env.get("AUDIT_PASSWORD")) return jsonRes({ error: "Unauthorized" }, 401);

  const mode = String(body.mode || "scan");

  // ── SCAN ────────────────────────────────────────────────────────────────
  // Scans 1 REST page (up to 100 posts) of public posts per call.
  if (mode === "scan") {
    // Adaptive page size. Client passes `perPage`; server clamps to [10, 100].
    // On WORKER_RESOURCE_LIMIT the client halves and retries; on success it
    // ramps back up. Default 50 = 2x faster than the old 25 baseline while
    // still staying well under the 150MB worker cap on typical posts.
    const PER_PAGE = Math.max(10, Math.min(100, Number(body.perPage) || 50));
    const page = Math.max(1, Math.min(400, Number(body.page) || 1));
    const url = `${WP_BASE}/posts?per_page=${PER_PAGE}&page=${page}&status=publish&_fields=id,slug,link,title,content`;
    const res = await fetch(url, { headers: { "User-Agent": "GearupAudit/2.0", Accept: "application/json" } });
    if (res.status === 400 && page > 1) {
      return jsonRes({ mode, page, totalPages: page - 1, count: 0, affected: [], done: true });
    }
    if (!res.ok) {
      const txt = await res.text();
      return jsonRes({ error: `Posts scan failed: ${res.status} ${txt.slice(0, 160)}` }, 502);
    }
    const totalPages = Number(res.headers.get("x-wp-totalpages") || page);
    const posts: Post[] = await res.json();
    const affected: Array<{ post_id: number; link: string; title: string; sample?: string }> = [];
    // Process one post at a time and null out content to let GC reclaim memory.
    for (let i = 0; i < posts.length; i++) {
      const p = posts[i];
      const html = p.content?.rendered || "";
      if (html) {
        const leak = renderedHasLeak(html);
        if (leak.found) {
          affected.push({
            post_id: Number(p.id),
            link: p.link || `${APEX}/?p=${p.id}`,
            title: plainTitle(p),
            sample: leak.sample,
          });
        }
      }
      // Free the largest field on the post so it can be collected.
      if (p.content) p.content.rendered = "";
      posts[i] = undefined as unknown as Post;
    }
    const done = page >= totalPages || posts.length < PER_PAGE;
    return jsonRes({ mode, page, totalPages, count: affected.length, affected, done, perPage: PER_PAGE });
  }

  // ── FIX ─────────────────────────────────────────────────────────────────
  // Surgically re-wraps orphan CSS in 1 post per call.
  if (mode === "fix") {
    const user = Deno.env.get("WP_USERNAME");
    const pass = Deno.env.get("WP_APP_PASSWORD")?.replace(/\s+/g, "");
    if (!user || !pass) return jsonRes({ error: "WP credentials not configured" }, 500);

    const ids = Array.isArray(body.post_ids) ? body.post_ids.map(Number).filter(Boolean) : [];
    if (!ids.length) return jsonRes({ error: "post_ids required" }, 400);
    const id = ids[0]; // 1 per call to stay under worker memory.

    const auth = "Basic " + btoa(`${user}:${pass}`);
    try {
      const getRes = await fetch(`${WP_BASE}/posts/${id}?context=edit&_fields=id,title,content`, {
        headers: { Authorization: auth, "User-Agent": "GearupAudit/2.0" },
      });
      if (!getRes.ok) {
        const t = await getRes.text();
        return jsonRes({
          mode, attempted: 1, fixed: 0,
          results: [{ post_id: id, ok: false, error: `GET ${getRes.status}: ${t.slice(0, 120)}` }],
        });
      }
      const post: Post = await getRes.json();
      const raw = post.content?.raw || "";
      if (!raw) {
        return jsonRes({
          mode, attempted: 1, fixed: 0,
          results: [{ post_id: id, ok: false, error: "Post has no editable raw content" }],
        });
      }
      const { html: cleaned, removed } = rewrapOrphanCss(raw);
      const wantsPublish = body.publish === true || body.publish === "true";
      const contentChanged = cleaned !== raw;
      if (!contentChanged && !wantsPublish) {
        return jsonRes({
          mode, attempted: 1, fixed: 1,
          results: [{ post_id: id, ok: true, removed_chars: 0, published: false }],
        });
      }
      // Build update payload. When publish=true, also bump status and modified
      // date so WP fires the post_updated hook (purges page caches & CDN).
      const payload: Record<string, unknown> = {};
      if (contentChanged) payload.content = cleaned;
      if (wantsPublish) {
        payload.status = "publish";
        payload.date_gmt = new Date().toISOString().replace(/\.\d+Z$/, "");
      }
      const updateRes = await fetch(`${WP_BASE}/posts/${id}`, {
        method: "POST",
        headers: {
          Authorization: auth, "Content-Type": "application/json",
          "User-Agent": "GearupAudit/2.0",
        },
        body: JSON.stringify(payload),
      });
      if (!updateRes.ok) {
        const t = await updateRes.text();
        return jsonRes({
          mode, attempted: 1, fixed: 0,
          results: [{ post_id: id, ok: false, error: `Update ${updateRes.status}: ${t.slice(0, 160)}` }],
        });
      }
      await updateRes.text();
      await logEvent(id, `Re-wrapped orphan CSS (${removed} chars wrappers removed)${wantsPublish ? " · republished" : ""}`);
      return jsonRes({
        mode, attempted: 1, fixed: 1,
        results: [{ post_id: id, ok: true, removed_chars: removed, published: wantsPublish }],
      });
    } catch (e) {
      return jsonRes({
        mode, attempted: 1, fixed: 0,
        results: [{ post_id: id, ok: false, error: e instanceof Error ? e.message : String(e) }],
      });
    }
  }

  // ── SCAN_URL ────────────────────────────────────────────────────────────
  // Targeted scan for a single URL/slug.
  if (mode === "scan_url") {
    const url = String(body.url || "").trim();
    if (!url) return jsonRes({ error: "url required" }, 400);
    let slug = "";
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      slug = parts[parts.length - 1] || "";
    } catch {
      return jsonRes({ error: "Invalid URL" }, 400);
    }
    if (!slug) return jsonRes({ error: "Could not parse slug from URL" }, 400);
    const restUrl = `${WP_BASE}/posts?slug=${encodeURIComponent(slug)}&status=publish&_fields=id,slug,link,title,content`;
    const res = await fetch(restUrl, { headers: { "User-Agent": "GearupAudit/2.0", Accept: "application/json" } });
    if (!res.ok) return jsonRes({ error: `WP lookup failed: ${res.status}` }, 502);
    const posts: Post[] = await res.json();
    if (!posts.length) return jsonRes({ error: `No published post found for slug "${slug}"` }, 404);
    const affected = posts.flatMap((p) => {
      const html = p.content?.rendered || "";
      const leak = renderedHasLeak(html);
      return [{
        post_id: Number(p.id),
        link: p.link || url,
        title: plainTitle(p),
        sample: leak.sample,
        found: leak.found,
      }];
    });
    return jsonRes({ mode, count: affected.filter((a) => a.found).length, affected });
  }

  // ── VERIFY ──────────────────────────────────────────────────────────────
  // Cache-busting verification. Fetches the live URL with a cache-buster query
  // AND the WordPress REST API rendered content, then checks both for the
  // leak signatures. Lets the user see if they're staring at a stale browser
  // cache vs. an actual unfixed leak.
  if (mode === "verify") {
    const url = String(body.url || "").trim();
    if (!url) return jsonRes({ error: "url required" }, 400);
    let slug = "";
    try {
      const u = new URL(url);
      const parts = u.pathname.split("/").filter(Boolean);
      slug = parts[parts.length - 1] || "";
    } catch {
      return jsonRes({ error: "Invalid URL" }, 400);
    }
    const cacheBuster = `_cb=${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const liveUrl = url + (url.includes("?") ? "&" : "?") + cacheBuster;
    const headers = {
      "User-Agent": "GearupAudit/2.0 (cache-bust verify)",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      Pragma: "no-cache",
      Accept: "text/html,application/xhtml+xml",
    };

    let liveStatus = 0;
    let liveLeak: { found: boolean; sample?: string } = { found: false };
    let liveCacheHeaders: Record<string, string> = {};
    let liveBytes = 0;
    try {
      const lr = await fetch(liveUrl, { headers, redirect: "follow" });
      liveStatus = lr.status;
      ["age", "x-cache", "cf-cache-status", "cache-control", "x-served-by", "last-modified"].forEach((h) => {
        const v = lr.headers.get(h);
        if (v) liveCacheHeaders[h] = v;
      });
      const html = await lr.text();
      liveBytes = html.length;
      liveLeak = renderedHasLeak(html);
    } catch (e) {
      return jsonRes({ error: `Live fetch failed: ${e instanceof Error ? e.message : String(e)}` }, 502);
    }

    let restLeak: { found: boolean; sample?: string } = { found: false };
    let postId: number | null = null;
    if (slug) {
      try {
        const rr = await fetch(
          `${WP_BASE}/posts?slug=${encodeURIComponent(slug)}&status=publish&_fields=id,content`,
          { headers: { "User-Agent": "GearupAudit/2.0", Accept: "application/json" } },
        );
        if (rr.ok) {
          const arr: Post[] = await rr.json();
          if (arr[0]) {
            postId = Number(arr[0].id);
            restLeak = renderedHasLeak(arr[0].content?.rendered || "");
          }
        }
      } catch { /* best effort */ }
    }

    // Verdict matrix:
    //   live=true, rest=true  → real unfixed leak
    //   live=true, rest=false → CDN/browser cache stale (the fix worked, cache hasn't rolled over)
    //   live=false, rest=true → origin still leaks but live HTML doesn't (rare)
    //   live=false, rest=false → fully clean
    let verdict: "clean" | "stale_cache" | "real_leak" | "origin_only" = "clean";
    if (liveLeak.found && restLeak.found) verdict = "real_leak";
    else if (liveLeak.found && !restLeak.found) verdict = "stale_cache";
    else if (!liveLeak.found && restLeak.found) verdict = "origin_only";

    return jsonRes({
      mode, verdict,
      liveUrl, liveStatus, liveBytes,
      live: liveLeak,
      rest: restLeak,
      post_id: postId,
      cacheHeaders: liveCacheHeaders,
    });
  }

  return jsonRes({ error: "Unknown mode" }, 400);
});
