import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

async function checkAuth(req: Request): Promise<boolean> {
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* ignore */ }
  const pw = body?._audit_password || req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

const SYSTEM = `You are an elite SEO/AEO/GEO editor for gearuptofit.com (fitness, running, nutrition, health, reviews).
Return STRICT JSON only matching the requested schema. No prose outside JSON.
Goals: Google rankings + AI Overviews + ChatGPT/Perplexity citations.
Tone: authoritative, scannable, practical. Use specific numbers and citations.`;
const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const DETAIL_FIELDS = "id,slug,link,title,excerpt,content,modified_gmt,date_gmt,categories,tags,author,yoast_head_json";

async function fetchPostDetails(postId: number) {
  const r = await fetch(`${WP_BASE}/posts/${postId}?status=publish&_fields=${DETAIL_FIELDS}`, {
    headers: { "User-Agent": "GearupAudit/1.0" },
  });
  if (!r.ok) return null;
  return await r.json();
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await checkAuth(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { post_id } = await req.json();
  if (!post_id) {
    return new Response(JSON.stringify({ error: "post_id required" }), {
      status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

  // Cache check (24h)
  const { data: cached } = await supabase.from("ai_fixes_cache").select("fixes, generated_at").eq("post_id", post_id).maybeSingle();
  if (cached && (Date.now() - new Date(cached.generated_at).getTime()) < 24 * 3600 * 1000) {
    return new Response(JSON.stringify({ cached: true, fixes: cached.fixes }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const { data: post } = await supabase.from("wp_posts_cache").select("*").eq("post_id", post_id).maybeSingle();
  const { data: scoreRow } = await supabase.from("audit_scores").select("*").eq("post_id", post_id).maybeSingle();
  if (!post) {
    return new Response(JSON.stringify({ error: "Post not found" }), { status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  const data: any = await fetchPostDetails(Number(post_id)) || post.data;
  const title = (data?.title?.rendered || post.title || "").replace(/<[^>]+>/g, "");
  const html = data?.content?.rendered || "";
  const text = html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 8000);

  // Pull related posts for internal linking
  const { data: others } = await supabase.from("wp_posts_cache").select("title, link, slug").neq("post_id", post_id).limit(80);

  const userPrompt = `POST URL: ${post.link}
TITLE: ${title}
ISSUES: ${JSON.stringify(scoreRow?.issues ?? [])}
METRICS: ${JSON.stringify(scoreRow?.metrics ?? {})}
CONTENT (truncated):
${text}

CANDIDATE INTERNAL LINKS (pick 3-5 most relevant):
${(others || []).map((o: any) => `- ${o.title} → ${o.link}`).join("\n")}

Return JSON with this exact shape:
{
  "metaTitle": "string ≤60 chars, includes primary keyword",
  "metaDescription": "string 140-155 chars, compelling, includes keyword",
  "introParagraph": "120-180 word rewritten intro: direct answer in first sentence, hook, primary keyword in first 100 words",
  "faq": [{"q":"...","a":"..."}, ...] (5-8 items, conversational questions, 40-90 word answers),
  "jsonLd": { full JSON-LD object, type Article or HowTo or FAQPage as appropriate, with author, datePublished, dateModified },
  "internalLinks": [{"anchor":"...","url":"https://gearuptofit.com/..."}] (3-5 from candidates),
  "altTextSuggestions": [{"imageContext":"description of what image shows","alt":"descriptive alt"}] (up to 6),
  "h2Outline": ["H2 heading 1", "H2 heading 2", ...] (5-8 headings for ideal structure),
  "primaryKeyword": "string",
  "secondaryKeywords": ["..."] (5-8)
}`;

  const r = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${Deno.env.get("LOVABLE_API_KEY")}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "google/gemini-2.5-flash",
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
