import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

function checkAuth(req: Request): boolean {
  const pw = req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

type Issue = { severity: "critical" | "high" | "polish"; code: string; message: string };

function stripHtml(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}
function countMatches(html: string, re: RegExp): number {
  return (html.match(re) || []).length;
}
function flesch(text: string): number {
  const words = text.split(/\s+/).filter(Boolean);
  const sentences = text.split(/[.!?]+/).filter((s) => s.trim().length > 0);
  if (words.length === 0 || sentences.length === 0) return 0;
  const syllables = words.reduce((acc, w) => acc + Math.max(1, (w.toLowerCase().match(/[aeiouy]+/g) || []).length), 0);
  return 206.835 - 1.015 * (words.length / sentences.length) - 84.6 * (syllables / words.length);
}
function monthsSince(iso?: string | null): number {
  if (!iso) return 999;
  return (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 30);
}

function scorePost(post: any) {
  const issues: Issue[] = [];
  const data = post.data || {};
  const title = stripHtml(data.title?.rendered || post.title || "");
  const content = data.content?.rendered || "";
  const excerpt = stripHtml(data.excerpt?.rendered || "");
  const yoastTitle = data.yoast_head_json?.title || "";
  const yoastDesc = data.yoast_head_json?.description || "";
  const text = stripHtml(content);
  const wordCount = text.split(/\s+/).filter(Boolean).length;

  let score = 100;

  // Title
  const tLen = (yoastTitle || title).length;
  if (tLen < 30) { score -= 8; issues.push({ severity: "high", code: "title-short", message: `Title is ${tLen} chars (aim 50-60)` }); }
  else if (tLen > 65) { score -= 5; issues.push({ severity: "polish", code: "title-long", message: `Title is ${tLen} chars (truncates in SERP)` }); }

  // Meta description
  const dLen = (yoastDesc || excerpt).length;
  if (dLen < 80) { score -= 10; issues.push({ severity: "critical", code: "meta-desc-missing", message: `Meta description is ${dLen} chars (aim 140-155)` }); }
  else if (dLen > 165) { score -= 4; issues.push({ severity: "polish", code: "meta-desc-long", message: `Meta description ${dLen} chars (truncates)` }); }

  // Slug
  const slug = post.slug || data.slug || "";
  if (slug.length > 75) { score -= 3; issues.push({ severity: "polish", code: "slug-long", message: "Slug is too long" }); }
  if (/\d{4,}/.test(slug)) { score -= 2; issues.push({ severity: "polish", code: "slug-numbers", message: "Slug contains long number sequence" }); }

  // Headings
  const h1 = countMatches(content, /<h1[\s>]/gi);
  const h2 = countMatches(content, /<h2[\s>]/gi);
  if (h1 > 1) { score -= 6; issues.push({ severity: "high", code: "multi-h1", message: `${h1} H1 tags found (should be 1)` }); }
  if (h2 < 2 && wordCount > 600) { score -= 5; issues.push({ severity: "high", code: "few-h2", message: "Few H2 sections — content lacks structure" }); }

  // Images alt
  const imgs = content.match(/<img[^>]+>/gi) || [];
  const missingAlt = imgs.filter((i) => !/\salt=["'][^"']+["']/i.test(i)).length;
  if (missingAlt > 0) {
    score -= Math.min(10, missingAlt * 2);
    issues.push({ severity: "high", code: "img-alt", message: `${missingAlt} images missing alt text` });
  }
  // WebP
  const nonWebp = imgs.filter((i) => /\.(jpg|jpeg|png)["']/i.test(i)).length;
  if (nonWebp > 3) {
    score -= 3;
    issues.push({ severity: "polish", code: "img-webp", message: `${nonWebp} non-WebP images (slow LCP)` });
  }

  // Links
  const internal = countMatches(content, /href=["']https?:\/\/(www\.)?gearuptofit\.com/gi);
  const external = countMatches(content, /href=["']https?:\/\/(?!(www\.)?gearuptofit\.com)/gi);
  if (internal < 2 && wordCount > 500) { score -= 6; issues.push({ severity: "high", code: "few-internal-links", message: `Only ${internal} internal links` }); }
  if (external === 0 && wordCount > 800) { score -= 3; issues.push({ severity: "polish", code: "no-citations", message: "No outbound citations (E-E-A-T)" }); }

  // Word count
  if (wordCount < 300) { score -= 15; issues.push({ severity: "critical", code: "thin-content", message: `Only ${wordCount} words (thin content)` }); }
  else if (wordCount < 600) { score -= 6; issues.push({ severity: "high", code: "short-content", message: `${wordCount} words (could expand)` }); }

  // Readability
  const fk = flesch(text);
  if (fk < 40 && wordCount > 200) { score -= 4; issues.push({ severity: "polish", code: "readability", message: `Flesch ${fk.toFixed(0)} — hard to read` }); }

  // Freshness
  const months = monthsSince(post.modified_at || data.modified_gmt);
  if (months > 18) { score -= 8; issues.push({ severity: "high", code: "stale", message: `Not updated in ${months.toFixed(0)} months` }); }
  else if (months > 12) { score -= 4; issues.push({ severity: "polish", code: "aging", message: `${months.toFixed(0)} months since update` }); }

  // FAQ schema
  const hasFaq = /FAQPage|itemtype=["'][^"']*FAQPage/i.test(content) || /<h[23][^>]*>\s*(faq|frequently asked)/i.test(content);
  if (!hasFaq) { score -= 5; issues.push({ severity: "high", code: "no-faq", message: "No FAQ schema (AEO opportunity)" }); }

  // Answer-style intro (first 200 chars contain a definition/answer)
  const intro = text.slice(0, 250);
  if (!/\b(is|are|means|refers to|defined as)\b/i.test(intro)) {
    score -= 2; issues.push({ severity: "polish", code: "no-answer-intro", message: "Intro lacks direct answer (AI Overviews)" });
  }

  score = Math.max(0, Math.min(100, Math.round(score)));

  return {
    score,
    issues,
    metrics: {
      wordCount, titleLen: tLen, metaDescLen: dLen, h1, h2, images: imgs.length,
      missingAlt, internalLinks: internal, externalLinks: external,
      flesch: Math.round(fk), monthsSinceUpdate: Math.round(months), hasFaq,
    },
  };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!checkAuth(req)) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: posts, error } = await supabase
    .from("wp_posts_cache")
    .select("post_id, slug, title, link, modified_at, data");
  if (error || !posts) {
    return new Response(JSON.stringify({ error: "No cached posts. Run fetch first." }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const scoreRows: any[] = [];
  const histRows: any[] = [];
  const now = new Date().toISOString();
  for (const p of posts) {
    const r = scorePost(p);
    scoreRows.push({ post_id: p.post_id, score: r.score, issues: r.issues, metrics: r.metrics, scanned_at: now });
    histRows.push({ post_id: p.post_id, score: r.score, scanned_at: now });
  }

  for (let i = 0; i < scoreRows.length; i += 100) {
    await supabase.from("audit_scores").upsert(scoreRows.slice(i, i + 100), { onConflict: "post_id" });
  }
  for (let i = 0; i < histRows.length; i += 100) {
    await supabase.from("audit_history").insert(histRows.slice(i, i + 100));
  }

  const avg = scoreRows.reduce((a, b) => a + b.score, 0) / Math.max(1, scoreRows.length);
  return new Response(JSON.stringify({ scanned: scoreRows.length, avgScore: Math.round(avg) }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
