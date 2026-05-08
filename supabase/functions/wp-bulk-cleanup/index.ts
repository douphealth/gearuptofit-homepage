// Site-wide cleanup of "leaked CSS" in WordPress posts.
//
// Background:
//   When earlier drafts were pushed via the REST API, WordPress's KSES filter
//   stripped <style> tags from post content. The CSS rules survived as raw
//   visible text at the top of the post, e.g. ".gutf-article { max-width: 100%
//   !important; ... }". This function scans every cached post, detects the
//   leakage, removes it, re-wraps the rules inside a proper <style> block
//   (preserved by the block editor when written through wp.update via REST
//   *with* `meta` only — but here we keep it simple and just clean content),
//   and writes the cleaned content back to WP.
//
// Modes:
//   scan : returns a list of affected post IDs + a small preview, no writes.
//   fix  : applies the cleanup for the given post_ids (or all detected if
//          omitted). Writes status=publish updates (the live posts already
//          contain the leaked text, so we are *fixing* live, not introducing
//          a draft diff).

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";

const LEAKED_CSS = `.gutf-article { max-width: 100% !important; width: 100% !important; padding: 24px 16px !important; margin: 0 auto !important; box-sizing: border-box !important; } .product-box-inner { flex-direction: row !important; flex-wrap: wrap !important; gap: 20px !important; } .product-box-img { flex: 0 0 auto !important; width: 100% !important; max-width: 280px !important; } .product-box-content { flex: 1 1 300px !important; min-width: 250px !important; } .gutf-article table { display: block !important; width: 100% !important; max-width: 100% !important; overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; white-space: normal !important; } .gutf-article table td, .gutf-article table th { white-space: normal !important; word-break: break-word !important; } .video-container { position: relative !important; width: 100% !important; max-width: 100% !important; padding-bottom: 56.25% !important; height: 0 !important; overflow: hidden !important; } .video-container iframe { position: absolute !important; top: 0 !important; left: 0 !important; width: 100% !important; height: 100% !important; } .gutf-article img { max-width: 100% !important; height: auto !important; } .comparison-table, .wp-block-table { display: block !important; width: 100% !important; overflow-x: auto !important; } .section, .toc-card, .key-takeaway, .methodology-box, .pros-box, .cons-box { width: 100% !important; max-width: 100% !important; box-sizing: border-box !important; } .elementor-widget-theme-post-content { max-width: 880px !important; margin: 0 auto !important; } @media (max-width: 768px) { .gutf-article { padding: 16px 12px !important; font-size: 16px !important; line-height: 1.75 !important; } .product-box-inner { flex-direction: column !important; align-items: center !important; } .product-box-img { max-width: 200px !important; } .product-box-content { width: 100% !important; text-align: center !important; } .product-box-specs { text-align: left !important; } .comparison-table-wrapper { overflow-x: auto !important; -webkit-overflow-scrolling: touch !important; } .gutf-article * { max-width: 100vw !important; box-sizing: border-box !important; } .e-con-inner { padding-left: 10px !important; padding-right: 10px !important; } } @media (max-width: 480px) { .gutf-article { padding: 12px 10px !important; font-size: 15px !important; } .product-box-img { max-width: 160px !important; } }`;

const LEAK_ANCHORS = [
  ".gutf-article {",
  ".product-box-inner {",
  ".elementor-widget-theme-post-content {",
];

function extractLeak(text: string): { start: number; end: number; css: string } | null {
  let start = -1;
  for (const a of LEAK_ANCHORS) {
    const i = text.indexOf(a);
    if (i !== -1 && (start === -1 || i < start)) start = i;
  }
  if (start === -1) return null;

  let depth = 0;
  let i = start;
  let lastClose = -1;
  for (; i < text.length; i++) {
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
  const end = lastClose + 1;
  return { start, end, css: text.slice(start, end) };
}

function cleanContent(html: string): { cleaned: string; removed: string } | null {
  const noStyle = html.replace(/<style[\s\S]*?<\/style>/gi, "");
  const hasLeak = LEAK_ANCHORS.some((a) => noStyle.includes(a));
  if (!hasLeak) return null;

  const styleRegex = /<style[\s\S]*?<\/style>/gi;
  const styleRanges: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = styleRegex.exec(html)) !== null) {
    styleRanges.push([m.index, m.index + m[0].length]);
  }
  const inStyle = (pos: number) => styleRanges.some(([s, e]) => pos >= s && pos < e);

  let leakStart = -1;
  for (const a of LEAK_ANCHORS) {
    let from = 0;
    while (true) {
      const i = html.indexOf(a, from);
      if (i === -1) break;
      if (!inStyle(i)) { if (leakStart === -1 || i < leakStart) leakStart = i; break; }
      from = i + a.length;
    }
  }
  if (leakStart === -1) return null;

  const sub = html.slice(leakStart);
  const ext = extractLeak(sub);
  if (!ext) return null;
  const removed = ext.css;
  const before = html.slice(0, leakStart);
  const after = html.slice(leakStart + removed.length);

  const styleBlock = `<style>${LEAKED_CSS}</style>\n`;
  const cleaned = styleBlock + (before + after).replace(/^\s+/, "");
  return { cleaned, removed };
}

async function checkAuth(req: Request): Promise<boolean> {
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* ignore */ }
  const pw = body?._audit_password || req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

function jsonRes(p: unknown, s = 200) {
  return new Response(JSON.stringify(p), { status: s, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await checkAuth(req))) return jsonRes({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { mode = "scan", post_ids, limit = 50, page = 1, per_page = 25 } = await req.json().catch(() => ({}));

  const user = Deno.env.get("WP_USERNAME");
  const pass = Deno.env.get("WP_APP_PASSWORD");

  // ── SCAN (single page per call to stay under memory limit) ──────────────
  if (mode === "scan") {
    const affected: Array<{ post_id: number; link: string; title: string }> = [];
    const r = await fetch(`${WP_BASE}/posts?per_page=${per_page}&page=${page}&status=publish&_fields=id,link,title,content`, {
      headers: { "User-Agent": "GearupAudit/1.0" },
    });
    if (r.status === 400) return jsonRes({ mode, page, per_page, count: 0, affected, totalPages: 0, done: true });
    if (!r.ok) return jsonRes({ error: `WP REST page ${page} failed: ${r.status}` }, 502);
    const totalPages = Number(r.headers.get("x-wp-totalpages") || 0);
    const items = await r.json();
    if (Array.isArray(items)) {
      for (const it of items) {
        const html = it?.content?.rendered || "";
        // Quick anchor check first to avoid building a noStyle copy for every post.
        if (!LEAK_ANCHORS.some((a) => html.includes(a))) continue;
        const noStyle = html.replace(/<style[\s\S]*?<\/style>/gi, "");
        if (LEAK_ANCHORS.some((a) => noStyle.includes(a))) {
          affected.push({
            post_id: it.id,
            link: it.link,
            title: (it.title?.rendered || "").replace(/<[^>]+>/g, ""),
          });
        }
      }
    }
    const done = !Array.isArray(items) || items.length < per_page || (totalPages > 0 && page >= totalPages);
    return jsonRes({ mode, page, per_page, totalPages, count: affected.length, affected, done });
  }

  if (mode === "fix") {
    if (!user || !pass) return jsonRes({ error: "WP credentials not configured" }, 500);
    const auth = "Basic " + btoa(`${user}:${pass.replace(/\s+/g, "")}`);

    const ids: number[] = Array.isArray(post_ids) ? post_ids.map(Number).filter(Boolean) : [];
    if (ids.length === 0) return jsonRes({ error: "post_ids required (use mode=scan to discover)" }, 400);

    const results: Array<{ post_id: number; ok: boolean; removed_chars?: number; error?: string }> = [];
    for (const id of ids.slice(0, limit)) {
      try {
        const g = await fetch(`${WP_BASE}/posts/${id}?_fields=id,content&context=edit`, {
          headers: { "Authorization": auth, "User-Agent": "GearupAudit/1.0" },
        });
        if (!g.ok) { results.push({ post_id: id, ok: false, error: `GET ${g.status}` }); continue; }
        const post = await g.json();
        const raw = post?.content?.raw ?? post?.content?.rendered ?? "";
        const c = cleanContent(raw);
        if (!c) { results.push({ post_id: id, ok: true, removed_chars: 0 }); continue; }

        const u = await fetch(`${WP_BASE}/posts/${id}`, {
          method: "POST",
          headers: { "Authorization": auth, "Content-Type": "application/json", "User-Agent": "GearupAudit/1.0" },
          body: JSON.stringify({ content: c.cleaned }),
        });
        if (!u.ok) {
          const t = await u.text();
          results.push({ post_id: id, ok: false, error: `PUT ${u.status}: ${t.slice(0, 160)}` });
        } else {
          results.push({ post_id: id, ok: true, removed_chars: c.removed.length });
          await supabase.from("push_log").insert({
            post_id: id,
            status: "cleanup",
            message: `Removed ${c.removed.length} chars of leaked CSS, re-wrapped in <style>.`,
            draft_url: `https://gearuptofit.com/wp-admin/post.php?post=${id}&action=edit`,
          });
        }
      } catch (e: any) {
        results.push({ post_id: id, ok: false, error: e?.message || String(e) });
      }
    }
    const fixed = results.filter((r) => r.ok && (r.removed_chars ?? 0) > 0).length;
    return jsonRes({ mode, attempted: results.length, fixed, results });
  }

  return jsonRes({ error: "Unknown mode" }, 400);
});
