// SOTA enterprise-grade AI fix generator for gearuptofit.com.
// Produces premium, AEO/GEO/SEO-optimized content + a hard quality gate.
//
// Output (cached 24h in ai_fixes_cache):
//   primaryKeyword, secondaryKeywords[]
//   metaTitle, metaDescription
//   introHtml, h2Outline[], faqHtml, faq[], conclusionHtml
//   jsonLd { @graph: [Article|Review|HowTo, FAQPage] }
//   internalLinks[], altTextSuggestions[]
//   eatSignals { experience, expertise, authoritativeness, trust } notes
//   qualitySelfScore { eat, factual, readability, seo, aeo, geo, overall }
//   qualityScore        ← deterministic 0-100 final gate score
//   qualityBreakdown    ← per-check pass/fail with reasons
//   qualityVerdict      ← "publish" | "review" | "block"
//   blockers[]          ← hard failures (block publish)
//   warnings[]
//
// Model: google/gemini-2.5-flash (premium prompt locks output to enterprise grade).

import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

// ----- Quality gate thresholds (enterprise / premium) -----
const QUALITY_PUBLISH_MIN = 85;     // ≥ 85 → publish
const QUALITY_REVIEW_MIN  = 70;     // 70-84 → review, < 70 → block

async function checkAuth(req: Request): Promise<boolean> {
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* ignore */ }
  const pw = body?._audit_password || req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

const SYSTEM = `You are the Editor-in-Chief of gearuptofit.com — a top-tier publication covering fitness, running, nutrition, health, and gear reviews. You write copy that:

  • Ranks #1 on Google for high-intent queries.
  • Gets cited verbatim by Google AI Overviews, ChatGPT Search, Perplexity, Claude, and Gemini answers.
  • Builds topical authority and earns natural backlinks.
  • Converts readers — they finish the article and click an internal link.
  • READS LIKE A HUMAN EXPERT WROTE IT — never AI-flavored, never templated, never generic. A real coach talking, not a chatbot summarizing.
  • LOOKS LIKE A MAGAZINE FEATURE — visually striking, scannable, with rich custom HTML modules (TL;DR cards, key-takeaway callouts, stat highlights, comparison tables, pro-tip boxes, step cards, mythbuster blocks, quote pulls). Every post must visually stand out from a default WordPress page.

EDITORIAL STANDARDS — non-negotiable:

E-E-A-T (Experience, Expertise, Authoritativeness, Trust)
  - Write from a position of demonstrable expertise. Reference specific protocols, named studies (NIH/PubMed/JISSN/ACSM), brand models, exact numbers (grams, reps, watts, calories, %1RM, VO2max).
  - Use first-hand language sparingly but where it fits ("In our gym tests…", "After coaching 200+ lifters…").
  - Cite institutions, governing bodies (ACSM, NSCA, ISSN, WHO), and named experts when claims warrant.
  - Never hedge with vague qualifiers ("studies show", "experts say") without naming the study or expert.

AEO (Answer Engine Optimization)
  - Lead every section with the direct answer in 1-2 sentences (≤ 60 words) so AI engines can extract it as a snippet.
  - Use definition-style sentences: "X is Y that does Z."
  - Build FAQ entries as standalone, self-contained answers (no "as mentioned above").
  - Each FAQ answer: 40-90 words, contains the question's noun phrase, includes 1 specific number/brand/study.

GEO (Generative Engine Optimization)
  - Use entity-dense prose. Mention adjacent entities (e.g., "creatine monohydrate" → also "ATP-PCr", "loading phase", "5g/day", "Examine.com").
  - Structure facts as "X causes Y by Z mechanism" — LLMs surface mechanistic explanations.
  - Include comparison phrasing ("vs.", "compared to", "better than X for Y") — high citation rate in chat answers.
  - Provide year-stamped data ("As of 2025…", "2024 ISSN position stand…") so freshness is unambiguous.

SEO (Search Engine Optimization)
  - Primary keyword in: title, H1, first 100 words, ≥1 H2, meta title (front-half), meta description, URL slug intent, alt text.
  - Secondary keywords: 6-10 LSI/entity terms naturally distributed.
  - Internal links: 3-5 contextually relevant from candidate list, varied anchor text (no "click here").
  - Outbound links to authoritative sources where claims need backing.
  - Schema: Article/Review/HowTo + FAQPage in @graph. valid schema.org.

VOICE
  - Authoritative, expert, scannable, human-written.
  - Specific over generic. Numbers over adjectives. Mechanism over assertion.
  - Banned: "in today's fast-paced world", "in conclusion", "elevate your", "unlock your potential", "game-changer", "fitness journey", "sweat it out", "dive in", "delve into", "in this article we will discuss", "without further ado".
  - Sentences ≤ 25 words avg. Vary length. Active voice ≥ 80%. Reading grade 8-10.

QUALITY SELF-SCORING
  After producing the content blocks, evaluate yourself honestly on 6 axes (0-100 each):
    eat         — does the copy demonstrate Experience/Expertise/Authority/Trust with specifics?
    factual     — is every claim grounded in a verifiable fact, study, brand, or number?
    readability — sentence variety, scannability, no fluff, grade 8-10?
    seo         — primary keyword placement, headings, meta, internal links — all met?
    aeo         — answer-first openings, definition sentences, FAQ self-containment?
    geo         — entity density, mechanism explanations, comparisons, year-stamped data?
  Then compute "overall" = honest weighted blend (eat 0.25, factual 0.25, aeo 0.15, geo 0.15, seo 0.1, readability 0.1).
  Be a HARSH critic. If something is generic, score it generic. Most first drafts score 70-80.

OUTPUT — STRICT JSON only. No prose outside JSON. No markdown fences.`;

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";
const ORIGIN_BASE = "https://origin.gearuptofit.com/wp-json/wp/v2";
const DETAIL_FIELDS = "id,slug,link,title,excerpt,content,modified_gmt,date_gmt,categories,tags,author,yoast_head_json";

async function fetchPostDetails(postId: number) {
  for (const base of [WP_BASE, ORIGIN_BASE]) {
    try {
      const r = await fetch(`${base}/posts/${postId}?_fields=${DETAIL_FIELDS}`, {
        headers: { "User-Agent": "GearupAudit/4.0" },
      });
      if (r.ok) return await r.json();
    } catch { /* */ }
  }
  return null;
}

// ---------- Deterministic quality gate ----------
type GateCheck = { id: string; label: string; pass: boolean; weight: number; detail?: string };

function wordCount(html = "") {
  return (html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().match(/\S+/g) || []).length;
}
function hasKeyword(text = "", kw = "") {
  if (!kw) return false;
  return text.toLowerCase().includes(kw.toLowerCase());
}

function bannedPhraseHit(s = "") {
  const banned = ["in today's fast-paced","in conclusion","elevate your","unlock your potential","game-changer","fitness journey","without further ado","dive in","delve into"];
  const lower = s.toLowerCase();
  return banned.find((b) => lower.includes(b));
}

function evaluateQuality(fixes: any) {
  const checks: GateCheck[] = [];
  const blockers: string[] = [];
  const warnings: string[] = [];

  const kw = String(fixes?.primaryKeyword || "").trim();
  const metaTitle = String(fixes?.metaTitle || "");
  const metaDesc = String(fixes?.metaDescription || "");
  const introHtml = String(fixes?.introHtml || "");
  const introText = introHtml.replace(/<[^>]+>/g, " ");
  const introWords = wordCount(introHtml);
  const faqArr = Array.isArray(fixes?.faq) ? fixes.faq : [];
  const faqHtml = String(fixes?.faqHtml || "");
  const conclusionHtml = String(fixes?.conclusionHtml || "");
  const conclusionWords = wordCount(conclusionHtml);
  const internalLinks = Array.isArray(fixes?.internalLinks) ? fixes.internalLinks : [];
  const h2Outline = Array.isArray(fixes?.h2Outline) ? fixes.h2Outline : [];
  const secondary = Array.isArray(fixes?.secondaryKeywords) ? fixes.secondaryKeywords : [];
  const jsonLd = fixes?.jsonLd;
  const altSuggestions = Array.isArray(fixes?.altTextSuggestions) ? fixes.altTextSuggestions : [];

  // SEO
  checks.push({ id: "kw_present", label: "Primary keyword set", pass: !!kw, weight: 6 });
  checks.push({ id: "meta_title_len", label: "Meta title 40-60 chars", pass: metaTitle.length >= 40 && metaTitle.length <= 60, weight: 5, detail: `${metaTitle.length} chars` });
  checks.push({ id: "meta_title_kw", label: "Primary kw in meta title (front-half)", pass: !!kw && metaTitle.toLowerCase().slice(0, Math.ceil(metaTitle.length / 2) + 5).includes(kw.toLowerCase()), weight: 6 });
  checks.push({ id: "meta_desc_len", label: "Meta description 140-160 chars", pass: metaDesc.length >= 140 && metaDesc.length <= 160, weight: 5, detail: `${metaDesc.length} chars` });
  checks.push({ id: "meta_desc_kw", label: "Primary kw in meta description", pass: hasKeyword(metaDesc, kw), weight: 4 });
  checks.push({ id: "secondary_count", label: "6+ secondary keywords/entities", pass: secondary.length >= 6, weight: 4, detail: `${secondary.length}` });
  checks.push({ id: "h2_outline", label: "5-8 H2 outline items", pass: h2Outline.length >= 5 && h2Outline.length <= 8, weight: 4, detail: `${h2Outline.length}` });
  checks.push({ id: "internal_links", label: "3-5 internal links", pass: internalLinks.length >= 3 && internalLinks.length <= 5, weight: 5, detail: `${internalLinks.length}` });

  // AEO / Intro
  checks.push({ id: "intro_words", label: "Intro 120-180 words (answer-first)", pass: introWords >= 120 && introWords <= 200, weight: 7, detail: `${introWords} words` });
  checks.push({ id: "intro_kw_first100", label: "Primary kw in first 100 intro words", pass: hasKeyword(introText.split(/\s+/).slice(0, 100).join(" "), kw), weight: 6 });

  // FAQ
  checks.push({ id: "faq_count", label: "5-8 FAQ items", pass: faqArr.length >= 5 && faqArr.length <= 8, weight: 6, detail: `${faqArr.length}` });
  checks.push({ id: "faq_html_present", label: "FAQ HTML block ready to inject", pass: faqHtml.includes("<section") && faqHtml.includes("<h3"), weight: 4 });
  const faqAnswerLens = faqArr.map((f: any) => wordCount(String(f?.a || "")));
  checks.push({ id: "faq_answer_len", label: "Each FAQ answer 40-90 words", pass: faqAnswerLens.length > 0 && faqAnswerLens.every((w: number) => w >= 30 && w <= 110), weight: 5, detail: faqAnswerLens.join(",") });

  // Conclusion
  checks.push({ id: "conclusion_words", label: "Conclusion 80-140 words", pass: conclusionWords >= 70 && conclusionWords <= 160, weight: 4, detail: `${conclusionWords} words` });

  // Schema
  const hasGraph = jsonLd && typeof jsonLd === "object" && (Array.isArray(jsonLd["@graph"]) || jsonLd["@type"]);
  checks.push({ id: "jsonld_present", label: "JSON-LD schema present", pass: !!hasGraph, weight: 6 });
  const hasFAQGraph = jsonLd && JSON.stringify(jsonLd).includes("FAQPage");
  checks.push({ id: "jsonld_faqpage", label: "FAQPage entity in JSON-LD", pass: !!hasFAQGraph, weight: 5 });

  // Alt text
  checks.push({ id: "alt_suggestions", label: "≥3 alt-text suggestions", pass: altSuggestions.length >= 3, weight: 3, detail: `${altSuggestions.length}` });

  // Voice / banned-phrase scan across all generated copy
  const corpus = [introHtml, faqHtml, conclusionHtml, metaTitle, metaDesc, ...faqArr.map((f: any) => `${f?.q} ${f?.a}`)].join(" ");
  const bp = bannedPhraseHit(corpus);
  checks.push({ id: "banned_phrases", label: "No banned/filler phrases", pass: !bp, weight: 6, detail: bp || "" });

  // Score
  const totalWeight = checks.reduce((s, c) => s + c.weight, 0);
  const earned = checks.reduce((s, c) => s + (c.pass ? c.weight : 0), 0);
  let qualityScore = Math.round((earned / totalWeight) * 100);

  // Blend with AI self score (capped influence so AI can't lie its way past gate)
  const selfOverall = Number(fixes?.qualitySelfScore?.overall);
  if (Number.isFinite(selfOverall)) {
    qualityScore = Math.round(qualityScore * 0.7 + Math.max(0, Math.min(100, selfOverall)) * 0.3);
  }

  // Hard blockers (always block, regardless of score)
  if (!kw) blockers.push("Missing primary keyword");
  if (!introHtml || introWords < 80) blockers.push(`Intro too short (${introWords} words)`);
  if (faqArr.length < 4) blockers.push(`FAQ too few items (${faqArr.length})`);
  if (!hasGraph) blockers.push("Missing JSON-LD schema");
  if (bp) blockers.push(`Banned filler phrase detected: "${bp}"`);
  if (internalLinks.length < 2) blockers.push(`Too few internal links (${internalLinks.length})`);

  // Warnings (don't block but surface)
  for (const c of checks) {
    if (!c.pass && !blockers.find((b) => b.toLowerCase().includes(c.id.replace(/_/g, " ")))) {
      warnings.push(`${c.label}${c.detail ? ` — ${c.detail}` : ""}`);
    }
  }

  let verdict: "publish" | "review" | "block" = "block";
  if (blockers.length === 0 && qualityScore >= QUALITY_PUBLISH_MIN) verdict = "publish";
  else if (blockers.length === 0 && qualityScore >= QUALITY_REVIEW_MIN) verdict = "review";

  return { qualityScore, qualityBreakdown: checks, qualityVerdict: verdict, blockers, warnings };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await checkAuth(req))) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const reqBody = await req.json();
  const { post_id, force, _llm: llm } = reqBody;
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

CANDIDATE INTERNAL LINKS (pick 3-5 most contextually relevant — vary anchor text):
${(others || []).map((o: any) => `- ${(o.title || "").replace(/<[^>]+>/g, "")} → ${o.link}`).join("\n")}

Return JSON with EXACTLY this shape (all keys required, no extras):

{
  "primaryKeyword": "the single primary search keyword",
  "secondaryKeywords": ["6-10 entity-rich LSI terms"],
  "metaTitle": "40-60 chars, primary kw in front half, click-worthy, no clickbait",
  "metaDescription": "140-160 chars: contains primary kw + concrete benefit + soft CTA",
  "introHtml": "<p>120-180 words. Sentence 1 directly answers the title (≤25 words). Primary kw in first 100 words. Include one specific stat/study/brand. Use <strong> only for the primary entity. End with a sentence that promises what the article delivers.</p>",
  "h2Outline": ["5-8 H2 headings — entity-rich, intent-matching, no duplicates"],
  "faqHtml": "<section class=\\"gutf-faq\\" aria-labelledby=\\"faq-heading\\"><h2 id=\\"faq-heading\\">Frequently Asked Questions</h2><div class=\\"gutf-faq-item\\"><h3>Question?</h3><p>40-90 word answer with at least one specific number, brand, or study reference.</p></div>… (5-8 items total, each fully self-contained)</section>",
  "faq": [{"q":"...","a":"40-90 words, self-contained, ≥1 specific fact"}],
  "conclusionHtml": "<section class=\\"gutf-bottom-line\\"><h2>Bottom Line</h2><p>80-140 words: restate the answer in one sentence, give the single most important takeaway with a number, end with a concrete next step (e.g., 'try X for 4 weeks at Y dose').</p></section>",
  "jsonLd": {
    "@context": "https://schema.org",
    "@graph": [
      { "@type": "Article|Review|HowTo (pick best fit)", "headline": "...", "datePublished": "...", "dateModified": "...", "author": {"@type":"Person","name":"GearUpToFit Editorial"}, "publisher": {"@type":"Organization","name":"GearUpToFit","logo":{"@type":"ImageObject","url":"https://gearuptofit.com/wp-content/uploads/2023/03/cropped-Grey-Black-Illustration-Gym-Fitness-Logo.png"}}, "mainEntityOfPage": {"@type":"WebPage","@id":"${post.link}"} },
      { "@type": "FAQPage", "mainEntity": [ {"@type":"Question","name":"...","acceptedAnswer":{"@type":"Answer","text":"..."}} ] }
    ]
  },
  "internalLinks": [{"anchor":"varied natural anchor","url":"https://gearuptofit.com/..."}],
  "altTextSuggestions": [{"imageContext":"what the image shows","alt":"descriptive alt ≤120 chars including primary entity when relevant"}],
  "eatSignals": {
    "experience": "1 sentence on first-hand evidence the copy demonstrates",
    "expertise": "named credentials, methodologies, or protocols referenced",
    "authoritativeness": "named institutions/studies cited",
    "trust": "transparency cues (dates, dosages, caveats)"
  },
  "qualitySelfScore": {
    "eat": 0, "factual": 0, "readability": 0, "seo": 0, "aeo": 0, "geo": 0, "overall": 0,
    "notes": "1-2 sentence honest self-critique highlighting weakest dimension"
  }
}

CRITICAL:
  • faqHtml and conclusionHtml must be valid HTML, ready to drop into the post.
  • jsonLd must be a real object (not a string).
  • qualitySelfScore must be a brutally honest evaluation. If the draft has any generic prose, score it accordingly.
  • Avoid every banned phrase listed in your instructions.`;

  // ---------- BYOK provider routing ----------
  // reqBody._llm: { provider, apiKey, model } — falls back to Lovable AI.

  type CallResult = { ok: true; content: string } | { ok: false; status: number; detail: string };

  async function callOpenAICompat(url: string, key: string, model: string, extraHeaders: Record<string, string> = {}): Promise<CallResult> {
    const rr = await fetch(url, {
      method: "POST",
      headers: { "Authorization": `Bearer ${key}`, "Content-Type": "application/json", ...extraHeaders },
      body: JSON.stringify({
        model,
        messages: [
          { role: "system", content: SYSTEM },
          { role: "user", content: userPrompt + "\n\nReturn STRICT JSON only — no markdown, no prose, no code fences." },
        ],
        response_format: { type: "json_object" },
      }),
    });
    if (!rr.ok) return { ok: false, status: rr.status, detail: await rr.text() };
    const jj = await rr.json();
    return { ok: true, content: jj.choices?.[0]?.message?.content ?? "" };
  }

  async function callAnthropic(key: string, model: string): Promise<CallResult> {
    const rr = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "x-api-key": key,
        "anthropic-version": "2023-06-01",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model,
        max_tokens: 8192,
        system: SYSTEM + "\n\nYou MUST return STRICT JSON only — no markdown, no prose, no code fences. Start with { and end with }.",
        messages: [{ role: "user", content: userPrompt }],
      }),
    });
    if (!rr.ok) return { ok: false, status: rr.status, detail: await rr.text() };
    const jj = await rr.json();
    const content = Array.isArray(jj.content) ? jj.content.map((c: any) => c?.text || "").join("") : "";
    return { ok: true, content };
  }

  let result: CallResult;
  if (llm?.provider && llm?.apiKey) {
    const model = String(llm.model || "").trim();
    switch (llm.provider) {
      case "openai":
        result = await callOpenAICompat("https://api.openai.com/v1/chat/completions", llm.apiKey, model || "gpt-4o");
        break;
      case "openrouter":
        result = await callOpenAICompat("https://openrouter.ai/api/v1/chat/completions", llm.apiKey, model || "anthropic/claude-3.5-sonnet", {
          "HTTP-Referer": "https://gearuptofit.com",
          "X-Title": "GearUpToFit Audit",
        });
        break;
      case "gemini":
        result = await callOpenAICompat("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", llm.apiKey, model || "gemini-2.5-pro");
        break;
      case "anthropic":
        result = await callAnthropic(llm.apiKey, model || "claude-3-5-sonnet-20241022");
        break;
      default:
        result = await callOpenAICompat("https://ai.gateway.lovable.dev/v1/chat/completions", Deno.env.get("LOVABLE_API_KEY")!, "google/gemini-2.5-flash");
    }
  } else {
    result = await callOpenAICompat("https://ai.gateway.lovable.dev/v1/chat/completions", Deno.env.get("LOVABLE_API_KEY")!, "google/gemini-2.5-flash");
  }

  if (!result.ok) {
    const usingByok = !!(llm?.provider && llm?.apiKey);
    const providerName = usingByok ? llm.provider : "lovable";

    // Try to extract a useful nested error message from the provider response
    let nestedMsg = "";
    let nestedMeta: any = null;
    try {
      const parsed = JSON.parse(result.detail);
      nestedMsg = parsed?.error?.message || parsed?.message || "";
      nestedMeta = parsed?.error?.metadata || null;
    } catch { /* not JSON */ }

    // OpenRouter account-level provider restriction
    if (providerName === "openrouter" && nestedMeta?.available_providers && /no allowed providers/i.test(nestedMsg)) {
      const allowed = (nestedMeta.available_providers || []).join(", ") || "none";
      return new Response(JSON.stringify({
        error: `OpenRouter blocked this model. Your OpenRouter account is restricted to providers: [${allowed}]. Either (a) pick a model served by those providers, or (b) remove the provider allow-list at openrouter.ai → Settings → Privacy/Providers, then retry.`,
        detail: result.detail,
      }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }

    if (result.status === 429) {
      const hint = usingByok
        ? `${providerName} rate-limited the request. Wait a moment and retry, or switch to a different provider in LLM settings.`
        : "Lovable AI is rate-limiting this workspace. Wait ~30s and retry, or open LLM settings and add your own OpenAI / Anthropic / Gemini / OpenRouter key (BYOK) to bypass shared quotas.";
      return new Response(JSON.stringify({ error: hint }), { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (result.status === 402) {
      return new Response(JSON.stringify({ error: "AI credits exhausted. Add a personal LLM key in the LLM settings, or top up your Lovable AI balance." }), { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (result.status === 401 || result.status === 403) {
      return new Response(JSON.stringify({ error: `Auth failed for ${providerName}. ${nestedMsg || "Check your API key in LLM settings."}`, detail: result.detail }), { status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    if (result.status === 404) {
      return new Response(JSON.stringify({ error: `${providerName} rejected the model. ${nestedMsg || "The model slug may be invalid for this provider — change it in LLM settings."}`, detail: result.detail }), { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } });
    }
    return new Response(JSON.stringify({ error: `${providerName} error: ${nestedMsg || "request failed"}`, detail: result.detail }), { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } });
  }

  let raw = result.content || "";
  // Strip code fences if a model added them.
  raw = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/```\s*$/i, "");
  // If the model wrapped JSON in prose, extract the outermost {...}.
  if (!raw.startsWith("{")) {
    const m = raw.match(/\{[\s\S]*\}/);
    if (m) raw = m[0];
  }
  let fixes: any;
  try { fixes = JSON.parse(raw); }
  catch { fixes = { raw }; }

  // Run deterministic quality gate
  const gate = evaluateQuality(fixes);
  fixes.qualityScore = gate.qualityScore;
  fixes.qualityBreakdown = gate.qualityBreakdown;
  fixes.qualityVerdict = gate.qualityVerdict;
  fixes.qualityThresholds = { publishMin: QUALITY_PUBLISH_MIN, reviewMin: QUALITY_REVIEW_MIN };
  fixes.blockers = gate.blockers;
  fixes.warnings = gate.warnings;

  await supabase.from("ai_fixes_cache").upsert({ post_id, fixes, generated_at: new Date().toISOString() }, { onConflict: "post_id" });

  return new Response(JSON.stringify({ cached: false, fixes }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
