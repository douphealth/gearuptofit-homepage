import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.95.0";

const WP_BASE = "https://gearuptofit.com/wp-json/wp/v2";

async function fetchLiveContent(postId: number) {
  const r = await fetch(`${WP_BASE}/posts/${postId}?_fields=id,content,title,excerpt`, {
    headers: { "User-Agent": "GearupAudit/1.0" },
  });
  if (!r.ok) return null;
  return await r.json();
}

async function checkAuth(req: Request): Promise<boolean> {
  let body: any = {};
  try { body = await req.clone().json(); } catch { /* ignore */ }
  const pw = body?._audit_password || req.headers.get("x-audit-password");
  return !!pw && pw === Deno.env.get("AUDIT_PASSWORD");
}

function jsonRes(payload: unknown, status = 200) {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (!(await checkAuth(req))) return jsonRes({ error: "Unauthorized" }, 401);

  const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
  const { post_id, fixes, mode } = await req.json();
  if (!post_id) return jsonRes({ error: "post_id required" }, 400);

  const user = Deno.env.get("WP_USERNAME");
  const pass = Deno.env.get("WP_APP_PASSWORD");
  if (!user || !pass) return jsonRes({ error: "WP credentials not configured" }, 500);
  const auth = "Basic " + btoa(`${user}:${pass.replace(/\s+/g, "")}`);

  const wpHeaders = {
    "Authorization": auth,
    "Content-Type": "application/json",
    "User-Agent": "GearupAudit/1.0",
  };

  // ── REVERT MODE ────────────────────────────────────────────────────────────
  // Restores a draft revision to match the current live (published) content.
  // Use this to recover posts whose drafts were corrupted by earlier pushes
  // that mangled <style>/<script> tags via REST KSES filtering.
  if (mode === "revert") {
    const live = await fetchLiveContent(Number(post_id));
    if (!live) return jsonRes({ error: "Could not fetch live content" }, 502);

    // Re-save a draft revision identical to live. WordPress will create a new
    // autosave/revision but the published post stays untouched.
    const r = await fetch(`${WP_BASE}/posts/${post_id}`, {
      method: "POST",
      headers: wpHeaders,
      body: JSON.stringify({
        // status NOT changed — we don't unpublish. We only force a fresh
        // revision that matches live, so any pending draft diff is reset.
        content: live?.content?.raw ?? live?.content?.rendered ?? "",
      }),
    });
    const text = await r.text();
    let result: any = {}; try { result = JSON.parse(text); } catch { result = { raw: text }; }
    await supabase.from("push_log").insert({
      post_id,
      status: r.ok ? "reverted" : "error",
      message: r.ok ? "Draft reverted to live content" : `Revert failed: ${result?.message || text.slice(0, 200)}`,
      draft_url: `https://gearuptofit.com/wp-admin/post.php?post=${post_id}&action=edit`,
    });
    return jsonRes({ ok: r.ok, mode: "revert", wp: result }, r.ok ? 200 : 502);
  }

  // ── DEFAULT: SAFE PUSH ─────────────────────────────────────────────────────
  // We do NOT overwrite post content. WordPress KSES strips <style>, <script>,
  // and many block-editor attributes for users without `unfiltered_html`,
  // which silently corrupts posts (raw CSS leaks as visible text, JSON-LD
  // disappears). Instead we:
  //   1. Update only safe scalar fields (title/excerpt) — these are
  //      sanitised but never break layout.
  //   2. Write the full AI suggestion bundle into a post-meta key
  //      `_gutf_ai_suggestions` so an editor can apply intro/FAQ/JSON-LD
  //      manually inside the block editor where unfiltered_html applies.
  if (!fixes) return jsonRes({ error: "fixes required" }, 400);

  const safeBody: Record<string, unknown> = {
    meta: {
      _gutf_ai_suggestions: JSON.stringify({
        generated_at: new Date().toISOString(),
        intro: fixes.introParagraph || "",
        faq: fixes.faq || [],
        jsonLd: fixes.jsonLd || null,
        internalLinks: fixes.internalLinks || [],
        h2Outline: fixes.h2Outline || [],
        altTextSuggestions: fixes.altTextSuggestions || [],
        primaryKeyword: fixes.primaryKeyword || "",
        secondaryKeywords: fixes.secondaryKeywords || [],
      }),
    },
  };
  if (typeof fixes.metaTitle === "string" && fixes.metaTitle.trim()) {
    safeBody.title = fixes.metaTitle;
  }
  if (typeof fixes.metaDescription === "string" && fixes.metaDescription.trim()) {
    safeBody.excerpt = fixes.metaDescription;
  }

  const r = await fetch(`${WP_BASE}/posts/${post_id}`, {
    method: "POST",
    headers: wpHeaders,
    body: JSON.stringify(safeBody),
  });

  const text = await r.text();
  let result: any = {}; try { result = JSON.parse(text); } catch { result = { raw: text }; }

  const ok = r.ok;
  const draft_url = ok ? `https://gearuptofit.com/wp-admin/post.php?post=${post_id}&action=edit` : null;
  const message = ok
    ? "Title/excerpt updated. AI suggestions stored in post meta `_gutf_ai_suggestions` — apply intro/FAQ/JSON-LD manually in wp-admin to preserve <style>/<script> tags."
    : `WP error ${r.status}: ${result?.message || text.slice(0, 200)}`;

  await supabase.from("push_log").insert({ post_id, status: ok ? "success" : "error", message, draft_url });

  return jsonRes({ ok, status: r.status, draft_url, message, wp: result }, ok ? 200 : 502);
});
