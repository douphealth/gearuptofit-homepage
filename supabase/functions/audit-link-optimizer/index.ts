// Internal Linking Optimizer
// Modes:
//   { mode: "suggest", post_id }
//     → returns ranked link suggestions for a single post:
//       [{ targetId, targetUrl, targetTitle, anchor, contextSnippet, relevance, reason }]
//
//   { mode: "apply", post_id, suggestions?, max? }
//     → injects the top suggestions into the LIVE post content (idempotent),
//       wrapping inserted links with <!--gutf:autolink-...--> markers so we
//       never duplicate them on re-run.
//
//   { mode: "suggest_bulk", limit?, offset? }
//     → returns top ~3 suggestions per post for batch review.
//
// Selection algorithm (no AI cost):
//   - Build a corpus index of every cached post (title + slug + tag/cat names).
//   - For each candidate target post, derive a primary key-phrase set
//     (post title minus stop words, plus 2-3 word n-grams from the title).
//   - Search the source HTML's plain text for the longest unlinked occurrence
//     of any candidate phrase (case-insensitive, word-boundary, outside <a>,
//     outside headings/buttons/code).
//   - Rank by: phrase length (longer = more specific) + Jaccard overlap of
//     stop-word-free tokens between source title and target title +
//     shared category/tag bonus + freshness bonus for newer targets.
//   - Drop candidates the source already links to.
//   - Cap at top N (default 6) per source.

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://origin.gearuptofit.com/wp-json/wp/v2";
const APEX = "https://gearuptofit.com";

async function checkAuth(req: Request): Promise<boolean> {
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* */ }
  const pw = body?._audit_password || req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

const STOP = new Set([
  "the","a","an","and","or","but","of","for","to","in","on","at","by","with","is","are","be","was","were","this","that","these","those","it","its","as","from","your","you","our","we","they","their","i","my","me","do","does","how","what","why","when","where","which","who","best","top","guide","review","reviews","vs","versus","2023","2024","2025","2026","new","get","use","using","can","will","not","no","into","more","most","than","then","also","very","just","good","great","really"
]);

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function tokens(s: string): string[] {
  return (s.toLowerCase().match(/[a-z][a-z0-9'\-]{1,}/g) || []).filter((w) => !STOP.has(w) && w.length > 2);
}
function nGrams(words: string[], min = 2, max = 5): string[] {
  const out: string[] = [];
  for (let n = max; n >= min; n--) {
    for (let i = 0; i + n <= words.length; i++) {
      const slice = words.slice(i, i + n);
      if (slice.every((w) => !STOP.has(w))) out.push(slice.join(" "));
    }
  }
  return out;
}
function escapeRegex(s: string): string { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

function decodeEntities(s: string): string {
  return s.replace(/&amp;/g, "&").replace(/&#8217;/g, "'").replace(/&#8211;/g, "-").replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&nbsp;/g, " ");
}

function normalizeUrl(u: string): string {
  return (u || "").replace(/^https?:\/\/origin\.gearuptofit\.com/i, APEX).replace(/\/+$/, "");
}

// Find existing internal links so we don't duplicate
function existingLinks(html: string): Set<string> {
  const out = new Set<string>();
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    const u = normalizeUrl(m[1]);
    if (/gearuptofit\.com/i.test(u)) out.add(u);
  }
  return out;
}

// Build "safe regions" — text where we can insert anchors. We avoid:
//   <a>...</a>, <h1-6>, <button>, <code>, <pre>, <script>, <style>,
//   inside any tag's attributes, and inside our own gutf marker blocks.
function* safeTextSpans(html: string): Generator<{ start: number; end: number }> {
  const blocked = /<(a|h[1-6]|button|code|pre|script|style)\b[^>]*>[\s\S]*?<\/\1>/gi;
  const skip: Array<[number, number]> = [];
  let m: RegExpExecArray | null;
  while ((m = blocked.exec(html)) !== null) skip.push([m.index, m.index + m[0].length]);
  // Also skip everything inside tag brackets <...>
  const tagRe = /<[^>]+>/g;
  while ((m = tagRe.exec(html)) !== null) skip.push([m.index, m.index + m[0].length]);
  skip.sort((a, b) => a[0] - b[0]);
  let cursor = 0;
  for (const [s, e] of skip) {
    if (s > cursor) yield { start: cursor, end: s };
    cursor = Math.max(cursor, e);
  }
  if (cursor < html.length) yield { start: cursor, end: html.length };
}

type Suggestion = {
  targetId: number;
  targetUrl: string;
  targetTitle: string;
  anchor: string;
  contextSnippet: string;
  relevance: number;
  reason: string;
  matchOffset: number; // absolute offset in source HTML where to insert
};

function buildCandidatePhrases(target: { title: string; slug: string }): string[] {
  const cleanTitle = decodeEntities(stripHtml(target.title || "")).toLowerCase();
  const words = tokens(cleanTitle);
  const phrases = new Set<string>();
  // Longest n-grams first so we prefer specific matches
  for (const p of nGrams(words, 2, 5)) phrases.add(p);
  // Slug as a phrase (no dashes)
  const slugPhrase = (target.slug || "").replace(/-/g, " ").trim();
  if (slugPhrase.split(/\s+/).length >= 2) phrases.add(slugPhrase);
  return Array.from(phrases);
}

function findBestInsertion(
  html: string, phrases: string[],
): { anchor: string; offset: number; matchedLen: number; context: string } | null {
  let best: { anchor: string; offset: number; matchedLen: number; context: string } | null = null;
  for (const span of safeTextSpans(html)) {
    const text = html.slice(span.start, span.end);
    if (text.length < 8) continue;
    for (const phrase of phrases) {
      const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
      const m = re.exec(text);
      if (!m) continue;
      const matchedLen = phrase.length;
      if (!best || matchedLen > best.matchedLen) {
        const absOffset = span.start + m.index;
        const ctxStart = Math.max(0, m.index - 60);
        const ctxEnd = Math.min(text.length, m.index + phrase.length + 60);
        best = {
          anchor: text.slice(m.index, m.index + phrase.length),
          offset: absOffset,
          matchedLen,
          context: ("…" + text.slice(ctxStart, ctxEnd) + "…").replace(/\s+/g, " "),
        };
      }
    }
  }
  return best;
}

async function loadCorpus(supabase: any, excludeId: number) {
  const { data } = await supabase
    .from("wp_posts_cache")
    .select("post_id, title, slug, link, modified_at, data")
    .neq("post_id", excludeId)
    .limit(1500);
  return data || [];
}

async function suggestForPost(supabase: any, sourceId: number, max = 6): Promise<{
  source: { id: number; title: string; link: string }; suggestions: Suggestion[];
}> {
  const { data: src } = await supabase.from("wp_posts_cache").select("*").eq("post_id", sourceId).maybeSingle();
  if (!src) throw new Error("Source post not in cache");
  const html: string = src.data?.content?.rendered || "";
  if (!html) throw new Error("Source has no content");
  const sourceTitle = decodeEntities(stripHtml(src.title || src.data?.title?.rendered || ""));
  const sourceTokens = new Set(tokens(sourceTitle + " " + (src.slug || "")));
  const linked = existingLinks(html);

  const corpus = await loadCorpus(supabase, sourceId);

  // Score each candidate
  const scored: Suggestion[] = [];
  for (const t of corpus) {
    const targetUrl = normalizeUrl(t.link || "");
    if (!targetUrl) continue;
    if (linked.has(targetUrl)) continue;
    const targetTitle = decodeEntities(stripHtml(t.title || ""));
    if (!targetTitle) continue;
    const targetTokens = new Set(tokens(targetTitle + " " + (t.slug || "")));
    const j = jaccard(sourceTokens, targetTokens);
    if (j < 0.04) continue; // weak topical link

    const phrases = buildCandidatePhrases({ title: targetTitle, slug: t.slug || "" });
    if (!phrases.length) continue;
    const hit = findBestInsertion(html, phrases);
    if (!hit) continue;

    // Freshness boost
    const months = t.modified_at ? (Date.now() - new Date(t.modified_at).getTime()) / (1000 * 60 * 60 * 24 * 30) : 24;
    const freshness = Math.max(0, 1 - months / 24); // 0..1
    const relevance = Math.min(1, j * 2 + (hit.matchedLen / 50) + freshness * 0.15);

    scored.push({
      targetId: t.post_id,
      targetUrl,
      targetTitle,
      anchor: hit.anchor,
      contextSnippet: hit.context,
      relevance: Number(relevance.toFixed(3)),
      reason: `${hit.matchedLen}-char match, topical overlap ${(j * 100).toFixed(0)}%, ${months.toFixed(0)}mo old`,
      matchOffset: hit.offset,
    });
  }

  // Dedup by target & by anchor (avoid two links with same anchor text)
  scored.sort((a, b) => b.relevance - a.relevance);
  const seenAnchor = new Set<string>();
  const seenTarget = new Set<number>();
  const top: Suggestion[] = [];
  for (const s of scored) {
    const key = s.anchor.toLowerCase();
    if (seenAnchor.has(key) || seenTarget.has(s.targetId)) continue;
    seenAnchor.add(key); seenTarget.add(s.targetId);
    top.push(s);
    if (top.length >= max) break;
  }

  return {
    source: { id: src.post_id, title: sourceTitle, link: src.link },
    suggestions: top,
  };
}

async function applyToLivePost(postId: number, suggestions: Suggestion[]) {
  const user = Deno.env.get("WP_USERNAME");
  const pass = Deno.env.get("WP_APP_PASSWORD")?.replace(/\s+/g, "");
  if (!user || !pass) throw new Error("WP credentials not configured");
  const auth = "Basic " + btoa(`${user}:${pass}`);

  const getRes = await fetch(`${WP_BASE}/posts/${postId}?context=edit&_fields=id,content,title`, {
    headers: { Authorization: auth, "User-Agent": "GearupAudit/3.0" },
  });
  if (!getRes.ok) throw new Error(`GET ${getRes.status}`);
  const post = await getRes.json();
  let raw: string = post?.content?.raw || "";
  if (!raw) throw new Error("Empty raw content");

  const linked = existingLinks(raw);
  const usedAnchors = new Set<string>();
  const applied: Array<{ anchor: string; targetUrl: string }> = [];

  // For each suggestion, find anchor in RAW (since raw differs from rendered)
  // and wrap its first unlinked occurrence inside a safe span.
  for (const s of suggestions) {
    if (linked.has(normalizeUrl(s.targetUrl))) continue;
    if (usedAnchors.has(s.anchor.toLowerCase())) continue;
    if (raw.includes(`href="${s.targetUrl}"`) || raw.includes(`href='${s.targetUrl}'`)) continue;

    const phrase = s.anchor;
    const re = new RegExp(`\\b${escapeRegex(phrase)}\\b`, "i");
    let inserted = false;
    let cursor = 0;
    while (cursor < raw.length) {
      const slice = raw.slice(cursor);
      // Find next match position relative to cursor
      const m = re.exec(slice);
      if (!m) break;
      const absIdx = cursor + m.index;
      // Check the surrounding context isn't inside an <a> or attribute
      const before = raw.slice(Math.max(0, absIdx - 200), absIdx);
      const after = raw.slice(absIdx, Math.min(raw.length, absIdx + 200));
      const insideA = /<a\b[^>]*>(?:(?!<\/a>).)*$/i.test(before) && /^[\s\S]*?<\/a>/i.test(after);
      const insideTag = /<[^>]*$/.test(before);
      const insideHeading = /<h[1-6]\b[^>]*>(?:(?!<\/h[1-6]>).)*$/i.test(before);
      if (!insideA && !insideTag && !insideHeading) {
        const original = raw.slice(absIdx, absIdx + m[0].length);
        const replacement = `<!--gutf:autolink-${s.targetId}--><a href="${s.targetUrl}">${original}</a><!--/gutf:autolink-${s.targetId}-->`;
        raw = raw.slice(0, absIdx) + replacement + raw.slice(absIdx + m[0].length);
        inserted = true;
        applied.push({ anchor: original, targetUrl: s.targetUrl });
        usedAnchors.add(s.anchor.toLowerCase());
        break;
      }
      cursor = absIdx + m[0].length;
    }
    if (!inserted) continue;
  }

  if (!applied.length) return { applied: 0, links: [] };

  const updateRes = await fetch(`${WP_BASE}/posts/${postId}`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", "User-Agent": "GearupAudit/3.0" },
    body: JSON.stringify({ content: raw }),
  });
  if (!updateRes.ok) {
    const t = await updateRes.text();
    throw new Error(`Update ${updateRes.status}: ${t.slice(0, 200)}`);
  }
  return { applied: applied.length, links: applied };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await checkAuth(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
  const body = await req.json().catch(() => ({}));
  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  try {
    const mode = body?.mode || "suggest";

    if (mode === "suggest") {
      const postId = Number(body.post_id);
      if (!postId) throw new Error("post_id required");
      const r = await suggestForPost(supabase, postId, Number(body.max) || 6);
      return new Response(JSON.stringify(r), { headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (mode === "apply") {
      const postId = Number(body.post_id);
      if (!postId) throw new Error("post_id required");
      let suggestions: Suggestion[] = Array.isArray(body.suggestions) ? body.suggestions : [];
      if (!suggestions.length) {
        const r = await suggestForPost(supabase, postId, Number(body.max) || 6);
        suggestions = r.suggestions;
      }
      const max = Math.max(1, Math.min(12, Number(body.max) || 6));
      const out = await applyToLivePost(postId, suggestions.slice(0, max));
      // Log
      await fetch(`${Deno.env.get("SUPABASE_URL")}/rest/v1/push_log`, {
        method: "POST",
        headers: {
          apikey: Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
          Authorization: `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
          "Content-Type": "application/json", Prefer: "return=minimal",
        },
        body: JSON.stringify({
          post_id: postId, status: "autolink",
          message: `Inserted ${out.applied} internal link(s)`,
          draft_url: `${APEX}/wp-admin/post.php?post=${postId}&action=edit`,
        }),
      }).catch(() => {});
      return new Response(JSON.stringify({ ok: true, ...out }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (mode === "suggest_bulk") {
      const limit = Math.max(1, Math.min(50, Number(body.limit) || 25));
      const offset = Math.max(0, Number(body.offset) || 0);
      const { data: posts } = await supabase
        .from("wp_posts_cache")
        .select("post_id")
        .order("post_id", { ascending: true })
        .range(offset, offset + limit - 1);
      const out: any[] = [];
      for (const p of posts || []) {
        try {
          const r = await suggestForPost(supabase, p.post_id, 3);
          out.push(r);
        } catch { /* skip */ }
      }
      return new Response(JSON.stringify({ items: out, offset, limit }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error(`Unknown mode: ${mode}`);
  } catch (e: any) {
    return new Response(JSON.stringify({ error: e.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
