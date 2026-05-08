// SOTA AI fix generator. Produces ready-to-inject HTML blocks for full overhaul:
//   - introHtml          → 120-180 word answer-first intro <p>
//   - faqHtml            → semantic FAQ section with FAQPage-compatible structure
//   - conclusionHtml     → "Bottom Line" closing block
//   - jsonLd             → object: Article/Review/HowTo + FAQPage @graph
//   - internalLinks[]    → 3-5 from candidates
//   - altTextSuggestions[] → up to 8
//   - h2Outline[]        → 5-8 H2s
//   - primaryKeyword, secondaryKeywords
//   - metaTitle, metaDescription
//
// Uses google/gemini-2.5-pro for top-tier reasoning. Cached 24h.

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

async function checkAuth(req: Request): Promise<boolean> {
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* ignore */ }
  const pw = body?._audit_password || req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

const SYSTEM = `You are the lead SEO/AEO/GEO editor for gearuptofit.com (fitness, running, nutrition, health, gear reviews).
Your output drives Google ranking, AI Overview citations, ChatGPT/Perplexity grounding, and human conversion.

VOICE: authoritative, expert, scannable, human-written. Use specific numbers, dates, brand names, study citations when relevant. No filler. No "in today's fast-paced world". No "in conclusion".
RULES:
- Cover the search intent completely in the first 100 words.
- Use entities + LSI keywords naturally (don't keyword-stuff).
- Every claim must be specific (numbers, brands, study refs).
- Output STRICT JSON matching the requested schema. No prose outside JSON. No markdown code fences.`;

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const ORIGIN_BASE = "https://origin.gearuptofit.com/wp-json/wp/v2";
const DETAIL_FIELDS = "id,slug,link,title,excerpt,content,modified_gmt,date_gmt,categories,tags,author,yoast_head_json";

async function fetchPostDetails(postId: number) {
  for (const base of [WP_BASE, ORIGIN_BASE]) {
    try {
      const r = await fetch(`${base}/posts/${postId}?_fields=${DETAIL_FIELDS}`, {
        headers: { "User-Agent": "GearupAudit/3.0" },
      });
      if (r.ok) return await r.json();
    } catch { /* */ }
  }
  return null;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await checkAuth(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { post_id, force } = await req.json();
  if (!post_id) {
    return new Response(JSON.stringify({ error: "post_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  if (!force) {
    const { data: cached } = await supabase.from("ai_fixes_cache").select("fixes, generated_at").eq("post_id", post_id).maybeSingle();
    if (cached && (Date.now() - new Date(cached.generated_at).getTime()) < 24 * 3600 * 1000) {
      return new Response(JSON.stringify({ cached: true, fixes: cached.fixes }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
  }

  const { data: post } = await supabase.from("wp_posts_cache").select("*").eq("post_id", post_id).maybeSingle();
  const { data: scoreRow } = await supabase.from("audit_scores").select("*").eq("post_id", post_id).maybeSingle();
  if (!post) return new Response(JSON.stringify({ error: "Post not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });

  const data: any = await fetchPostDetails(Number(post_id)) || post.data;
  const title = (data?.title?.rendered || post.title || "").replace(/<[^>]+>/g, "");
  const html = data?.content?.rendered || "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 12000);

  const { data: others } = await supabase.from("wp_posts_cache").select("title, link, slug").neq("post_id", post_id).limit(120);

  const userPrompt = `POST URL: ${post.link}
TITLE: ${title}
DETECTED ISSUES: ${JSON.stringify((scoreRow?.issues ?? []).map((i: any) => `${i.severity}:${i.code}`))}
METRICS: ${JSON.stringify(scoreRow?.metrics ?? {})}

CURRENT CONTENT (truncated):
${text}

CANDIDATE INTERNAL LINKS (pick 3-5 most contextually relevant):
${(others || []).map((o: any) => `- ${(o.title || "").replace(/<[^>]+>/g, "")} → ${o.link}`).join("\n")}

Return JSON with EXACTLY this shape (all keys required):

{
  "primaryKeyword": "the single primary search keyword",
  "secondaryKeywords": ["6-10 semantically related entities/LSI"],
  "metaTitle": "≤60 chars, primary keyword in first half, click-worthy",
  "metaDescription": "140-155 chars, contains primary keyword + benefit + light call-to-action",
  "introHtml": "<p>120-180 word answer-first intro. First sentence directly answers the title's question. Primary keyword in first 100 words. Hook the reader with a stat or specific fact. Use <strong> sparingly for entity emphasis.</p>",
  "h2Outline": ["5-8 H2 headings forming an ideal article skeleton — entity-rich and intent-matching"],
  "faqHtml": "<section class=\\"gutf-faq\\" aria-labelledby=\\"faq-heading\\"><h2 id=\\"faq-heading\\">Frequently Asked Questions</h2><div class=\\"gutf-faq-item\\"><h3>Question?</h3><p>40-90 word answer with specifics.</p></div>… (5-8 items total)</section>",
  "faq": [{"q":"...","a":"..."}],
  "conclusionHtml": "<section class=\\"gutf-bottom-line\\"><h2>Bottom Line</h2><p>80-140 word conclusion: restate the answer, give the single most important takeaway, end with a concrete next step or recommendation.</p></section>",
  "jsonLd": { full JSON-LD: pick @type Article OR Review OR HowTo as best fits; include headline, datePublished, dateModified, author { @type: Person, name: 'GearUpToFit Editorial' }, publisher { @type: Organization, name: 'GearUpToFit', logo }, mainEntityOfPage. Embed a separate FAQPage entity in @graph mirroring the FAQ items. },
  "internalLinks": [{"anchor":"natural anchor text","url":"https://gearuptofit.com/..."}],
  "altTextSuggestions": [{"imageContext":"what the image shows","alt":"descriptive alt ≤120 chars"}]
}

CRITICAL: faqHtml and conclusionHtml MUST be valid HTML strings ready to drop into the post. JSON-LD must be a real object, not a string.`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-pro",
      messages: [
        { role: "system", content: SYSTEM },
        { role: "user", content: userPrompt },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!r.ok) {
    const txt = await r.text();
    if (r.status === 429) return new Response(JSON.stringify({ error: "Rate limited, try again shortly" }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    if (r.status === 402) return new Response(JSON.stringify({ error: "AI credits exhausted. Add funds in Settings → Workspace → Usage." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    return new Response(JSON.stringify({ error: "AI error", detail: txt }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const j = await r.json();
  let fixes: any;
  try { fixes = JSON.parse(j.choices[0].message.content); }
  catch { fixes = { raw: j.choices[0].message.content }; }

  await supabase.from("ai_fixes_cache").upsert({ post_id, fixes, generated_at: new Date().toISOString() }, { onConflict: "post_id" });

  return new Response(JSON.stringify({ cached: false, fixes }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
