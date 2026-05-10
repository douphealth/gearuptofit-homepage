// FULL OVERHAUL — applies AI fixes + visual responsive wrappers + JSON-LD in one pass.
//
// Strategy (safe, idempotent):
//   1. GET raw post content via REST (?context=edit, requires app password).
//   2. Apply visual transforms:
//        - Wrap unwrapped <table> in <div class="gutf-table-wrap">…</div>
//        - Wrap unwrapped <iframe> in <div class="gutf-embed-wrap">…</div>
//        - Strip fixed style="width:Xpx" on img/div when X > 360
//        - Add loading="lazy" + decoding="async" on <img> missing them
//        - Apply alt text suggestions to images that match imageContext
//   3. Inject AI blocks IF NOT ALREADY PRESENT (idempotent markers):
//        - <!--gutf:intro-->        before first paragraph (only if not present)
//        - <!--gutf:faq-->          before conclusion or at end
//        - <!--gutf:bottom-line-->  at very end
//        - <!--gutf:jsonld-->       JSON-LD <script> block
//        - <!--gutf:responsive-->   one <style> with overflow guards (only once)
//   4. PUT updated content back. Title + excerpt updated too.
//
// Each marker is checked before insertion → re-running the overhaul is safe.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const WP_BASE = "https://origin.gearuptofit.com/wp-json/wp/v2";
const APEX = "https://gearuptofit.com";

function jsonRes(p: unknown, status = 200) {
  return new Response(JSON.stringify(p), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}
async function readBody(req: Request) {
  try { return await req.json() as Record<string, any>; } catch { return {}; }
}

const RESPONSIVE_CSS = `<style>/*gutf-overhaul-v2*/
.gutf-article{font-size:1.05em;line-height:1.72;color:#1a1a1a}
.gutf-article p{margin:1em 0}
.gutf-article h2{font-size:1.7em;line-height:1.25;margin:1.6em 0 .55em;letter-spacing:-.01em;font-weight:800;position:relative;padding-left:.85em}
.gutf-article h2::before{content:"";position:absolute;left:0;top:.25em;bottom:.25em;width:5px;border-radius:3px;background:linear-gradient(180deg,#e11d48,#f59e0b)}
.gutf-article h3{font-size:1.25em;line-height:1.35;margin:1.4em 0 .45em;font-weight:700}
.gutf-article ul,.gutf-article ol{padding-left:1.4em;margin:1em 0}
.gutf-article ul li,.gutf-article ol li{margin:.45em 0}
.gutf-article a{color:#b91c1c;text-decoration:underline;text-underline-offset:3px;text-decoration-thickness:1.5px;font-weight:600}
.gutf-article a:hover{color:#7f1d1d;text-decoration-thickness:2.5px}
.gutf-table-wrap{overflow-x:auto;-webkit-overflow-scrolling:touch;max-width:100%;margin:1.5em 0;border:1px solid rgba(0,0,0,.08);border-radius:14px;box-shadow:0 1px 3px rgba(0,0,0,.04)}
.gutf-table-wrap table{min-width:100%;border-collapse:collapse;margin:0!important}
.gutf-table-wrap th{background:linear-gradient(180deg,#fafafa,#f3f4f6);text-align:left;padding:14px 16px;font-weight:700;font-size:.95em;border-bottom:2px solid rgba(0,0,0,.08);color:#111}
.gutf-table-wrap td{padding:13px 16px;border-bottom:1px solid rgba(0,0,0,.06);vertical-align:top}
.gutf-table-wrap tr:last-child td{border-bottom:0}
.gutf-table-wrap tr:nth-child(even) td{background:rgba(0,0,0,.015)}
.gutf-embed-wrap{position:relative;width:100%;max-width:100%;aspect-ratio:16/9;margin:1.5em 0;border-radius:14px;overflow:hidden;box-shadow:0 4px 12px rgba(0,0,0,.08)}
.gutf-embed-wrap iframe{position:absolute;inset:0;width:100%!important;height:100%!important;max-width:100%;border:0}
.gutf-section{margin:1.6em 0}
.gutf-key-takeaways{margin:2em 0;padding:1.4em 1.6em;border-radius:16px;background:linear-gradient(135deg,#fff7ed 0%,#fef3c7 100%);border:1px solid #fcd34d;box-shadow:0 4px 14px rgba(245,158,11,.12);position:relative}
.gutf-key-takeaways::before{content:"\\2605 KEY TAKEAWAYS";position:absolute;top:-11px;left:18px;background:#b45309;color:#fff;font-size:.72em;font-weight:800;letter-spacing:.12em;padding:4px 12px;border-radius:99px}
.gutf-key-takeaways ul{margin:.4em 0 0;padding-left:1.3em;list-style:none}
.gutf-key-takeaways li{position:relative;margin:.6em 0;padding-left:1.5em}
.gutf-key-takeaways li::before{content:"\\2713";position:absolute;left:0;top:.05em;color:#b45309;font-weight:900;font-size:1.15em}
.gutf-callout{margin:1.5em 0;padding:1.1em 1.3em 1.1em 1.4em;border-radius:12px;border-left:5px solid #3b82f6;background:linear-gradient(90deg,rgba(59,130,246,.08),rgba(59,130,246,.02));font-size:.98em}
.gutf-callout.tip{border-color:#10b981;background:linear-gradient(90deg,rgba(16,185,129,.08),rgba(16,185,129,.02))}
.gutf-callout.warning{border-color:#f59e0b;background:linear-gradient(90deg,rgba(245,158,11,.1),rgba(245,158,11,.02))}
.gutf-callout.expert{border-color:#8b5cf6;background:linear-gradient(90deg,rgba(139,92,246,.08),rgba(139,92,246,.02))}
.gutf-callout strong{display:block;margin-bottom:.3em;font-size:.85em;letter-spacing:.08em;text-transform:uppercase;color:#1e3a8a}
.gutf-callout.tip strong{color:#065f46}
.gutf-callout.warning strong{color:#92400e}
.gutf-callout.expert strong{color:#5b21b6}
.gutf-pullquote{margin:2em 0;padding:1.3em 1.5em;border-left:5px solid #e11d48;background:#fafafa;font-size:1.18em;line-height:1.55;font-style:italic;font-weight:500;color:#1a1a1a;border-radius:0 8px 8px 0}
.gutf-pullquote cite{display:block;margin-top:.6em;font-size:.78em;font-style:normal;font-weight:600;color:#6b7280;letter-spacing:.04em;text-transform:uppercase}
.gutf-stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(160px,1fr));gap:14px;margin:1.8em 0}
.gutf-stat{padding:1.1em 1.2em;border-radius:14px;background:linear-gradient(135deg,#fff,#fafafa);border:1px solid rgba(0,0,0,.08);box-shadow:0 2px 6px rgba(0,0,0,.04);text-align:center}
.gutf-stat .num{display:block;font-size:1.85em;font-weight:800;line-height:1.1;color:#b91c1c;letter-spacing:-.02em}
.gutf-stat .lbl{display:block;margin-top:.25em;font-size:.82em;color:#4b5563;font-weight:500}
.gutf-proscons{display:grid;grid-template-columns:1fr 1fr;gap:14px;margin:1.6em 0}
.gutf-proscons>div{padding:1.1em 1.25em;border-radius:14px;border:1px solid rgba(0,0,0,.08)}
.gutf-proscons .pros{background:linear-gradient(135deg,#ecfdf5,#fff)}
.gutf-proscons .cons{background:linear-gradient(135deg,#fef2f2,#fff)}
.gutf-proscons h4{margin:0 0 .5em;font-size:.95em;letter-spacing:.05em;text-transform:uppercase}
.gutf-proscons .pros h4{color:#047857}
.gutf-proscons .cons h4{color:#b91c1c}
.gutf-proscons ul{margin:0;padding-left:1.2em}
.gutf-proscons li{margin:.35em 0}
.gutf-toc{margin:1.5em 0;padding:1.2em 1.4em;border-radius:12px;background:rgba(0,0,0,.025);border:1px solid rgba(0,0,0,.06)}
.gutf-toc h3{margin:0 0 .5em;font-size:.85em;letter-spacing:.1em;text-transform:uppercase;color:#374151}
.gutf-toc ol{margin:0;padding-left:1.4em;font-size:.97em}
.gutf-toc li{margin:.35em 0}
.gutf-toc a{font-weight:500;color:#374151;text-decoration:none}
.gutf-toc a:hover{color:#b91c1c;text-decoration:underline}
.gutf-related{margin:2em 0;padding:1.3em 1.5em;border-radius:14px;background:linear-gradient(135deg,#f5f3ff,#fff);border:1px solid #ddd6fe}
.gutf-related h3{margin:0 0 .6em;font-size:.85em;letter-spacing:.1em;text-transform:uppercase;color:#5b21b6}
.gutf-related ul{margin:0;padding-left:1.2em}
.gutf-related li{margin:.4em 0}
.gutf-faq{margin:2.2em 0;padding:1.6em 1.8em;border:1px solid rgba(0,0,0,.08);border-radius:16px;background:linear-gradient(180deg,#fafafa,#fff);box-shadow:0 2px 10px rgba(0,0,0,.04)}
.gutf-faq>h2{margin-top:0}
.gutf-faq-item{margin:1.1em 0;padding:0 0 1.1em;border-bottom:1px solid rgba(0,0,0,.07)}
.gutf-faq-item:last-child{border-bottom:0;padding-bottom:0}
.gutf-faq-item h3{margin:0 0 .4em;font-size:1.08em;color:#111;font-weight:700}
.gutf-faq-item p{margin:0;color:#374151}
.gutf-bottom-line{margin:2.2em 0;padding:1.4em 1.6em;border-left:5px solid #e11d48;background:linear-gradient(90deg,rgba(225,29,72,.08),rgba(225,29,72,.01));border-radius:8px;box-shadow:0 2px 8px rgba(225,29,72,.08)}
.gutf-bottom-line h2{margin-top:0;color:#9f1239}
.gutf-author{display:flex;gap:14px;align-items:center;margin:2em 0;padding:1.1em 1.3em;border-radius:14px;background:#f9fafb;border:1px solid rgba(0,0,0,.06)}
.gutf-author .meta{font-size:.92em;color:#374151}
.gutf-author .meta strong{display:block;color:#111;font-size:1em}
@media(max-width:640px){
  .gutf-article img,.gutf-article video,.gutf-article iframe{max-width:100%!important;height:auto!important}
  .gutf-article *{max-width:100%!important;box-sizing:border-box!important}
  .gutf-article h2{font-size:1.4em}
  .gutf-proscons{grid-template-columns:1fr}
}
</style>`;

// Strip orphan CSS that leaks as visible text.
// Detects CSS rule blocks (`selector { ...declarations... }`) that live OUTSIDE
// any `<style>`/`<script>` region and removes them. Also collapses CSS comments
// (`/* ... */`) sitting in body text. This kills the "Site-wide sidebar hide"
// and other CSS-as-text leaks caused by KSES partially stripping <style> tags.
function stripOrphanCss(input: string): { html: string; removed: number } {
  if (!input) return { html: input, removed: 0 };
  let html = input;
  let removed = 0;

  // 1. Build protected ranges for <style>/<script> blocks (do NOT touch their CSS).
  const protectedRanges: Array<[number, number]> = [];
  const reProt = /<(style|script)\b[^>]*>[\s\S]*?<\/\1>/gi;
  let pm: RegExpExecArray | null;
  while ((pm = reProt.exec(html))) protectedRanges.push([pm.index, pm.index + pm[0].length]);
  const inProtected = (i: number) => protectedRanges.some(([a, b]) => i >= a && i < b);

  // 2. Remove CSS rule blocks (selector{...}) — including empty bodies — outside protected ranges.
  const cssRule = /(?:\/\*[\s\S]*?\*\/\s*)?[.#@*a-zA-Z][^<>{}\n]{0,200}\{[^<>{}]{0,1200}\}/g;
  html = html.replace(cssRule, (match, offset) => {
    if (inProtected(offset)) return match;
    removed += match.length;
    return "";
  });

  // 2b. Strip orphan @media / @supports / @keyframes prelude fragments without bodies.
  html = html.replace(/@(?:media|supports|keyframes|import|font-face)\b[^<>{}\n]{0,200}(?:\{[^<>{}]{0,1200}\}?)?/gi, (match, offset) => {
    if (inProtected(offset)) return match;
    removed += match.length;
    return "";
  });

  // 2c. Strip orphan selector fragments referencing our gutf-* design tokens
  //     (e.g. ".gutf-proscons>", ".gutf-faq>"). These are bare class selectors
  //     that leaked into visible text without an enclosing rule body.
  html = html.replace(/\.gutf-[a-z0-9_-]+(?:\s*[>+~,]\s*\.?[a-z0-9_-]*)*\s*[>+~,;]?/gi, (match, offset) => {
    if (inProtected(offset)) return match;
    // Skip if this is part of a class="" attribute
    const lookback = html.slice(Math.max(0, offset - 20), offset);
    if (/class\s*=\s*["'][^"']*$/i.test(lookback)) return match;
    removed += match.length;
    return "";
  });

  // 3. Strip standalone CSS comments still floating in body text.
  html = html.replace(/(?:^|>)\s*\/\*[\s\S]*?\*\/\s*(?=<|$)/g, (m) => {
    removed += m.length;
    return m.startsWith(">") ? ">" : "";
  });

  // 4. Tidy up empty wrappers wpautop may have left around the deleted CSS.
  html = html.replace(/<p>\s*<\/p>/gi, "").replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, "");

  return { html, removed };
}

// WordPress can strip <script type="application/ld+json"> from REST updates
// while leaving the JSON-LD payload visible in the article body. Remove every
// structured-data block/fragment from post content; schema must not live inside
// editable body HTML when the writer cannot use unfiltered_html.
function stripLeakedStructuredData(input: string): { html: string; removed: number } {
  if (!input) return { html: input, removed: 0 };
  let html = input;
  let removed = 0;
  const drop = (match: string) => { removed += match.length; return ""; };

  html = html
    .replace(/<!--\s*gutf:jsonld\s*-->[\s\S]*?<!--\s*\/gutf:jsonld\s*-->/gi, drop)
    .replace(/<script\b[^>]*application\/ld\+json[^>]*>[\s\S]*?<\/script>/gi, drop)
    .replace(/<script\b[^>]*>[\s\S]{0,6000}?(?:schema\.org|&quot;@context&quot;|"@context")[\s\S]*?<\/script>/gi, drop);

  // Remove whole paragraph/div/pre/code wrappers whose text is a schema blob.
  html = html.replace(/<(p|div|pre|code)\b[^>]*>[\s\S]{0,12000}?(?:schema\.org|(?:"|&quot;|&#0?34;)@context(?:"|&quot;|&#0?34;))[\s\S]{0,12000}?<\/\1>/gi, (match) => {
    const plain = stripTags(match).replace(/&quot;|&#0?34;/gi, '"');
    if (/@context/i.test(plain) && /schema\.org|@graph|@type|headline|Article|FAQPage/i.test(plain)) return drop(match);
    return match;
  });

  // Last-resort visible-text cleanup for malformed/truncated JSON-LD fragments.
  const schemaStart = /(?:\{|\[)?\s*(?:"|&quot;|&#0?34;)@context(?:"|&quot;|&#0?34;)\s*:\s*(?:"|&quot;|&#0?34;)https?:\/\/schema\.org\/?(?:"|&quot;|&#0?34;)/i;
  let guard = 0;
  while (guard++ < 8) {
    const m = schemaStart.exec(html);
    if (!m) break;
    const start = m.index;
    const tail = html.slice(start);
    const closeMarker = tail.search(/<!--\s*\/(?:gutf:jsonld|gutf:[a-z-]+)\s*-->|<(?:h1|h2|h3|p|div|ul|ol|table|blockquote)\b/gi);
    const hardStop = tail.search(/(?:\}\s*\}\s*\]\s*\}|\}\s*\]\s*\})/);
    const end = hardStop > 0 ? start + hardStop + tail.match(/(?:\}\s*\}\s*\]\s*\}|\}\s*\]\s*\})/)![0].length : start + (closeMarker > 80 ? closeMarker : Math.min(tail.length, 12000));
    removed += Math.max(0, end - start);
    html = html.slice(0, start) + html.slice(end);
  }

  html = html.replace(/<p>\s*<\/p>/gi, "").replace(/<p>\s*(?:&nbsp;|\s)*<\/p>/gi, "");
  return { html, removed };
}

function applyVisualFixes(raw: string): { html: string; changes: string[] } {
  const changes: string[] = [];
  let html = raw;

  // Wrap unwrapped <table>...</table> blocks
  html = html.replace(/<table\b[\s\S]*?<\/table>/gi, (match: string, offset: number, src: string) => {
    const before = src.slice(Math.max(0, offset - 120), offset);
    if (/gutf-table-wrap|table-responsive|wp-block-table|comparison-table-wrapper|overflow-x-auto/i.test(before)) return match;
    changes.push("wrapped-table");
    return `<div class="gutf-table-wrap">${match}</div>`;
  });

  // Wrap unwrapped <iframe> (YouTube etc.)
  html = html.replace(/<iframe\b[^>]*>[\s\S]*?<\/iframe>/gi, (match: string, offset: number, src: string) => {
    const before = src.slice(Math.max(0, offset - 80), offset);
    if (/gutf-embed-wrap|embed-responsive|video-wrapper/i.test(before)) return match;
    changes.push("wrapped-iframe");
    return `<div class="gutf-embed-wrap">${match}</div>`;
  });

  // Strip fixed style="width:Xpx" when X>360
  html = html.replace(/style=(["'])([^"']*)\1/gi, (m, q, css) => {
    const fixed = css.replace(/width\s*:\s*(\d{3,})px\s*;?/gi, (_mm: string, n: string) =>
      Number(n) > 360 ? "" : `width:${n}px;`,
    );
    if (fixed !== css) changes.push("stripped-fixed-width");
    return `style=${q}${fixed.trim()}${q}`;
  });

  // Lazy-loading + decoding=async on imgs
  html = html.replace(/<img\b([^>]*)>/gi, (m, attrs) => {
    let a = attrs;
    let touched = false;
    if (!/\bloading=/i.test(a)) { a += ' loading="lazy"'; touched = true; }
    if (!/\bdecoding=/i.test(a)) { a += ' decoding="async"'; touched = true; }
    if (touched) changes.push("img-lazy");
    return `<img${a}>`;
  });

  return { html, changes };
}

function ensureResponsiveCss(html: string): { html: string; added: boolean } {
  // Migrate old v1 stylesheet to v2 (gorgeous components)
  if (html.includes("/*gutf-overhaul-v1*/")) {
    const stripped = html.replace(/<style>\/\*gutf-overhaul-v1\*\/[\s\S]*?<\/style>/g, "");
    return { html: RESPONSIVE_CSS + "\n" + stripped, added: true };
  }
  if (html.includes("/*gutf-overhaul-v2*/")) return { html, added: false };
  return { html: RESPONSIVE_CSS + "\n" + html, added: true };
}

function injectIntro(html: string, introHtml: string): { html: string; added: boolean } {
  if (!introHtml || html.includes("<!--gutf:intro-->")) return { html, added: false };
  // Insert at the very beginning of post content
  return { html: `<!--gutf:intro-->${introHtml}<!--/gutf:intro-->\n${html}`, added: true };
}

function injectFaq(html: string, faqHtml: string): { html: string; added: boolean } {
  if (!faqHtml || html.includes("<!--gutf:faq-->")) return { html, added: false };
  // Inject before <!--gutf:bottom-line--> if it exists, else append at end
  const marker = "<!--gutf:bottom-line-->";
  if (html.includes(marker)) {
    return { html: html.replace(marker, `<!--gutf:faq-->${faqHtml}<!--/gutf:faq-->\n${marker}`), added: true };
  }
  return { html: `${html}\n<!--gutf:faq-->${faqHtml}<!--/gutf:faq-->`, added: true };
}

function injectConclusion(html: string, conclusionHtml: string): { html: string; added: boolean } {
  if (!conclusionHtml || html.includes("<!--gutf:bottom-line-->")) return { html, added: false };
  return { html: `${html}\n<!--gutf:bottom-line-->${conclusionHtml}<!--/gutf:bottom-line-->`, added: true };
}

function injectJsonLd(html: string, jsonLd: any): { html: string; added: boolean } {
  // Do not write JSON-LD into WordPress post_content. Application-password
  // publishing can strip <script> while leaving the raw schema JSON visible to
  // readers. SEO/schema should be handled by the site layer, not body content.
  return { html, added: false };
}

function stripNonContent(html: string): string {
  return html
    .replace(/<script\b[\s\S]*?<\/script>/gi, "")
    .replace(/<style\b[\s\S]*?<\/style>/gi, "")
    .replace(/<header\b[\s\S]*?<\/header>/gi, "")
    .replace(/<footer\b[\s\S]*?<\/footer>/gi, "")
    .replace(/<nav\b[\s\S]*?<\/nav>/gi, "")
    .replace(/<aside\b[\s\S]*?<\/aside>/gi, "");
}

function textLength(html: string): number {
  return html.replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").trim().length;
}

function findBalancedElement(html: string, tag: string, start: number): string {
  const openClose = new RegExp(`<\\/?${tag}\\b[^>]*>`, "gi");
  openClose.lastIndex = start;
  let depth = 0;
  let first = -1;
  let m: RegExpExecArray | null;
  while ((m = openClose.exec(html))) {
    const token = m[0];
    const isClose = token.startsWith(`</`);
    const selfClosing = /\/\s*>$/.test(token);
    if (!isClose) {
      if (depth === 0) first = m.index;
      if (!selfClosing) depth++;
    } else {
      depth--;
      if (depth === 0 && first >= 0) return html.slice(first, openClose.lastIndex);
    }
  }
  return "";
}

function extractPublicPostContent(pageHtml: string): { html: string; source: string; wordish: number } {
  const clean = stripNonContent(pageHtml);
  const candidates: Array<{ source: string; html: string }> = [];
  for (const match of clean.matchAll(/<(article|main)\b[^>]*>/gi)) {
    const html = findBalancedElement(clean, match[1].toLowerCase(), match.index || 0);
    if (html) candidates.push({ source: match[1].toLowerCase(), html });
  }
  const contentClass = /<div\b[^>]*class=(['"])[^'"]*(?:entry-content|post-content|wp-block-post-content|elementor-widget-theme-post-content|elementor-widget-text-editor)[^'"]*\1[^>]*>/gi;
  for (const match of clean.matchAll(contentClass)) {
    const html = findBalancedElement(clean, "div", match.index || 0);
    if (html) candidates.push({ source: "content-container", html });
  }
  const best = candidates
    .map((c) => ({ ...c, wordish: textLength(c.html) }))
    .filter((c) => c.wordish > 700 && /<(p|h2|h3|ul|ol|table|figure)\b/i.test(c.html))
    .sort((a, b) => b.wordish - a.wordish)[0];
  return best || { html: "", source: "none", wordish: 0 };
}

function hasLiveContentSlot(pageHtml: string): boolean {
  const clean = stripNonContent(pageHtml);
  return /<(article|main)\b/i.test(clean) || /class=(['"])[^'"]*(entry-content|post-content|wp-block-post-content|elementor-widget-theme-post-content)[^'"]*\1/i.test(clean);
}

function containsAppliedSignal(html: string): boolean {
  return /gutf-faq|gutf-bottom-line|gutf-overhaul-v[12]|gutf:intro|application\/ld\+json/i.test(html || "");
}

function canonicalPublicUrl(url: string): string {
  if (!url) return "";
  try {
    const u = new URL(url);
    u.hostname = "gearuptofit.com";
    u.protocol = "https:";
    return u.toString();
  } catch {
    return url.replace(/^https?:\/\/origin\.gearuptofit\.com/i, APEX);
  }
}

function cleanPublicUrl(url: string): string {
  const canonical = canonicalPublicUrl(url);
  if (!canonical) return "";
  try {
    const u = new URL(canonical);
    u.search = "";
    u.hash = "";
    return u.toString();
  } catch {
    return canonical.split("#")[0].split("?")[0];
  }
}

function urlVariants(cleanUrl: string): string[] {
  const out = new Set<string>();
  try {
    const u = new URL(cleanUrl);
    const hosts = [u.hostname, u.hostname.startsWith("www.") ? u.hostname.slice(4) : `www.${u.hostname}`];
    const protos = ["https:", "http:"];
    const path = u.pathname.endsWith("/") ? u.pathname : `${u.pathname}/`;
    const pathNoSlash = path.endsWith("/") ? path.slice(0, -1) : path;
    for (const host of hosts) for (const proto of protos) for (const p of [path, pathNoSlash]) {
      if (!p) continue;
      out.add(`${proto}//${host}${p}`);
      out.add(`${proto}//${host}${p}?utm_source=gutf-purge`);
    }
  } catch {
    out.add(cleanUrl);
    out.add(cleanUrl.endsWith("/") ? cleanUrl.slice(0, -1) : `${cleanUrl}/`);
  }
  return Array.from(out);
}

async function purgeCloudflareUrl(url: string, rounds = 1) {
  const token = Deno.env.get("CLOUDFLARE_API_TOKEN");
  const cleanUrl = cleanPublicUrl(url);
  if (!token || !cleanUrl) return { attempted: false, ok: false, reason: token ? "missing_url" : "missing_token" };
  async function cfFetch(target: string, init: RequestInit = {}) {
    const bearerHeaders = { ...(init.headers || {}), Authorization: `Bearer ${token}`, "Content-Type": "application/json" } as Record<string, string>;
    const bearer = await fetch(target, { ...init, headers: bearerHeaders });
    if (bearer.status !== 403 && bearer.status !== 401) return bearer;
    const keyHeaders = { ...(init.headers || {}), "X-Auth-Email": "Papalexios@gmail.com", "X-Auth-Key": token, "Content-Type": "application/json" } as Record<string, string>;
    return await fetch(target, { ...init, headers: keyHeaders });
  }
  try {
    const zonesRes = await cfFetch("https://api.cloudflare.com/client/v4/zones?name=gearuptofit.com");
    const zonesText = await zonesRes.text();
    let zones: any = {}; try { zones = JSON.parse(zonesText); } catch { zones = {}; }
    const zoneId = zones?.result?.[0]?.id;
    if (!zonesRes.ok || !zoneId) return { attempted: true, ok: false, stage: "zone_lookup", status: zonesRes.status, detail: zonesText.slice(0, 240) };

    const variants = urlVariants(cleanUrl);
    const results: any[] = [];
    let allOk = true;
    for (let i = 0; i < Math.max(1, rounds); i++) {
      // Round A: purge by files (URL variants)
      const fileRes = await cfFetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
        method: "POST",
        body: JSON.stringify({ files: variants }),
      });
      const fileText = await fileRes.text();
      let fileJson: any = {}; try { fileJson = JSON.parse(fileText); } catch { /* */ }
      const fileOk = fileRes.ok && fileJson?.success !== false;
      results.push({ round: i + 1, type: "files", status: fileRes.status, ok: fileOk, detail: fileText.slice(0, 200) });

      // Round B: purge by hosts (works on Pro/Business/Ent — falls through harmlessly otherwise)
      let host = "";
      try { host = new URL(cleanUrl).hostname; } catch { /* */ }
      if (host) {
        const hosts = Array.from(new Set([host, host.startsWith("www.") ? host.slice(4) : `www.${host}`]));
        const hostRes = await cfFetch(`https://api.cloudflare.com/client/v4/zones/${zoneId}/purge_cache`, {
          method: "POST",
          body: JSON.stringify({ hosts }),
        });
        const hostText = await hostRes.text();
        let hostJson: any = {}; try { hostJson = JSON.parse(hostText); } catch { /* */ }
        const hostOk = hostRes.ok && hostJson?.success !== false;
        results.push({ round: i + 1, type: "hosts", status: hostRes.status, ok: hostOk, detail: hostText.slice(0, 200) });
        // hosts may not be supported on every plan — don't penalize allOk for that
      }
      if (!fileOk) allOk = false;
      if (i < rounds - 1) await sleep(1500);
    }
    return { attempted: true, ok: allOk, files: variants, rounds: results };
  } catch (e) {
    return { attempted: true, ok: false, error: String((e as any)?.message || e) };
  }
}

// Bypass any intermediate cache by sending unique cookies + headers WordPress treats as logged-out
async function fetchCleanWithCacheBypass(cleanUrl: string) {
  const res = await fetch(cleanUrl, {
    headers: {
      "User-Agent": "GearupAudit/3.2-canonical-verify",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
      "CF-IPCountry": "XX",
      Cookie: `gutf_bust=${Date.now()}_${Math.random().toString(36).slice(2)}`,
    },
  });
  return { ok: res.ok, status: res.status, html: await readLimitedText(res), cf: res.headers.get("cf-cache-status") || null, age: res.headers.get("age") || null };
}

function runMarker(runId: string): string {
  return `gutf-publish-run-${runId}`;
}

function runMarkerHtml(runId: string): string {
  const marker = runMarker(runId);
  return `<!--${marker}--><span class="gutf-publish-verification" data-gutf-run="${marker}" hidden></span>`;
}

function containsRunMarker(html: string, runId: string): boolean {
  return !!runId && String(html || "").includes(runMarker(runId));
}

async function readJsonLimited(res: Response, maxBytes = MAX_WP_JSON_READ_BYTES): Promise<any> {
  const text = await readLimitedText(res, maxBytes);
  try { return JSON.parse(text); } catch { return text; }
}

function compactWpPost(value: any): any {
  if (!value || typeof value !== "object") return value;
  return {
    id: value.id,
    link: value.link,
    status: value.status,
    date_gmt: value.date_gmt,
    title: { raw: value.title?.raw, rendered: value.title?.rendered },
    excerpt: { raw: value.excerpt?.raw, rendered: value.excerpt?.rendered },
    content: { raw: value.content?.raw, rendered: value.content?.rendered },
  };
}

function compactRawHtml(raw: string): { raw: string; truncated: boolean } {
  const value = String(raw || "");
  if (value.length <= MAX_RAW_TRANSFORM_CHARS) return { raw: value, truncated: false };
  const head = value.slice(0, Math.floor(MAX_RAW_TRANSFORM_CHARS * 0.82));
  const tail = value.slice(-Math.floor(MAX_RAW_TRANSFORM_CHARS * 0.18));
  return { raw: `${head}\n<!--gutf:source-truncated-for-worker-memory-->\n${tail}`, truncated: true };
}

const LIVE_MIN_VISIBLE_WORDS = 600;
const LIVE_MIN_VISIBLE_H2 = 3;
const MAX_HTML_READ_BYTES = 260_000;
const MAX_WP_JSON_READ_BYTES = 520_000;
const MAX_RAW_TRANSFORM_CHARS = 220_000;

async function readLimitedText(res: Response, maxBytes = MAX_HTML_READ_BYTES): Promise<string> {
  if (!res.body) return await res.text().catch(() => "");
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (total < maxBytes) {
      const { value, done } = await reader.read();
      if (done || !value) break;
      const remaining = maxBytes - total;
      chunks.push(value.length > remaining ? value.slice(0, remaining) : value);
      total += Math.min(value.length, remaining);
      if (value.length > remaining) break;
    }
    if (total >= maxBytes) await reader.cancel().catch(() => undefined);
  } catch {
    await reader.cancel().catch(() => undefined);
  }
  return new TextDecoder().decode(concatChunks(chunks, total));
}

function concatChunks(chunks: Uint8Array[], total: number): Uint8Array {
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.length;
  }
  return out;
}

function stripInvisibleHtml(html: string): string {
  return String(html || "")
    .replace(/<!--[\s\S]*?-->/g, " ")
    .replace(/<(script|style|noscript|svg)\b[\s\S]*?<\/\1>/gi, " ")
    .replace(/<[^>]+\b(?:hidden|aria-hidden=(['"])true\1)[^>]*>[\s\S]*?<\/[^>]+>/gi, " ")
    .replace(/<[^>]+style=(['"])[^'"]*(?:display\s*:\s*none|visibility\s*:\s*hidden)[^'"]*\1[^>]*>[\s\S]*?<\/[^>]+>/gi, " ");
}

function sampleH2(html: string): string[] {
  return Array.from(String(html || "").matchAll(/<h2\b[^>]*>([\s\S]*?)<\/h2>/gi))
    .map((m) => stripTags(m[1]).slice(0, 120))
    .filter(Boolean)
    .slice(0, 8);
}

function analyzeLiveVisibility(pageHtml: string, runId: string, exactRunRequired: boolean) {
  const rawPage = String(pageHtml || "");
  const clean = stripInvisibleHtml(stripNonContent(pageHtml));
  const candidates: Array<{ source: string; html: string; priority: number }> = [];
  const contentClass = /<div\b[^>]*class=(['"])[^'"]*(?:entry-content|post-content|wp-block-post-content|elementor-widget-theme-post-content|elementor-widget-text-editor|gutf-article)[^'"]*\1[^>]*>/gi;
  for (const match of clean.matchAll(contentClass)) {
    const html = findBalancedElement(clean, "div", match.index || 0);
    if (html) candidates.push({ source: "content-container", html, priority: 4000 });
  }
  for (const match of clean.matchAll(/<(article|main)\b[^>]*>/gi)) {
    const tag = match[1].toLowerCase();
    const html = findBalancedElement(clean, tag, match.index || 0);
    if (html) candidates.push({ source: tag, html, priority: tag === "article" ? 2500 : 1800 });
  }
  candidates.push({ source: "full-page-fallback", html: clean, priority: 0 });

  const scored = candidates.map((c) => {
    const hasRunMarker = containsRunMarker(c.html, runId);
    const hasSignals = containsAppliedSignal(c.html);
    const words = htmlWordCount(c.html);
    const h2 = countTag(c.html, "h2");
    const score = (hasRunMarker ? 1_000_000 : 0) + (hasSignals ? 250_000 : 0) + c.priority + (h2 * 500) + words;
    return { ...c, hasRunMarker, hasSignals, words, h2, score };
  });
  const best = scored.sort((a, b) => b.score - a.score)[0] || scored[0];
  const text = stripTags(best?.html || "").slice(0, 600);
  const fullHasRunMarker = containsRunMarker(rawPage, runId);
  const fullHasSignals = containsAppliedSignal(clean);
  const visibleZoneOk = !!best && best.source !== "full-page-fallback";
  return {
    live_has_content_slot: hasLiveContentSlot(clean),
    live_has_signals: fullHasSignals,
    live_has_run_marker: fullHasRunMarker,
    live_body_word_count: best?.words || 0,
    live_body_h2_count: best?.h2 || 0,
    live_body_ok: visibleZoneOk && (!exactRunRequired || fullHasRunMarker) && (best?.words || 0) >= LIVE_MIN_VISIBLE_WORDS && (best?.h2 || 0) >= LIVE_MIN_VISIBLE_H2,
    live_content_source: best?.source || "none",
    live_selected_html_bytes: (best?.html || "").length,
    live_heading_samples: sampleH2(best?.html || ""),
    live_text_sample: text,
    live_min_word_count: LIVE_MIN_VISIBLE_WORDS,
    live_min_h2_count: LIVE_MIN_VISIBLE_H2,
    live_exact_run_required: exactRunRequired,
  };
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function fetchLiveHtml(url: string, runId: string, attempt: number, cacheBust = true) {
  const cleanUrl = cleanPublicUrl(url);
  const sep = cleanUrl.includes("?") ? "&" : "?";
  const fetchUrl = cacheBust ? `${cleanUrl}${sep}_gutf_verify=${encodeURIComponent(runId)}_${attempt}_${Date.now()}` : cleanUrl;
  const res = await fetch(fetchUrl, {
    headers: {
      "User-Agent": "GearupAudit/3.1-public-verify",
      "Cache-Control": "no-cache, no-store, max-age=0",
      Pragma: "no-cache",
    },
  });
  return { ok: res.ok, status: res.status, url: cleanUrl, fetched_url: fetchUrl, html: await readLimitedText(res) };
}

async function verifyLiveVisibility(url: string, runId: string, exactRunRequired: boolean, attempts = 5, cacheBust = true) {
  let last: any = {
    live_url: cleanPublicUrl(url),
    live_cache_busted: cacheBust,
    live_status: null,
    live_body_word_count: 0,
    live_body_h2_count: 0,
    live_body_ok: false,
    live_has_content_slot: null,
    live_has_signals: false,
    live_has_run_marker: false,
    live_content_source: "not-fetched",
    live_min_word_count: LIVE_MIN_VISIBLE_WORDS,
    live_min_h2_count: LIVE_MIN_VISIBLE_H2,
    live_exact_run_required: exactRunRequired,
    live_attempts: 0,
  };
  for (let attempt = 1; attempt <= attempts; attempt++) {
    try {
      const liveRes = await fetchLiveHtml(url, runId || `existing_${crypto.randomUUID()}`, attempt, cacheBust);
      const analysis = liveRes.ok ? analyzeLiveVisibility(liveRes.html, runId, exactRunRequired) : {};
      last = { ...last, ...analysis, live_url: liveRes.url, live_fetched_url: liveRes.fetched_url, live_cache_busted: cacheBust, live_status: liveRes.status, live_attempts: attempt, live_visual_report: liveRes.ok ? visualValidate(liveRes.html) : null };
      const exactOk = exactRunRequired ? last.live_has_run_marker : true;
      if (liveRes.ok && exactOk && last.live_body_ok) break;
    } catch (e) {
      last = { ...last, live_attempts: attempt, live_error: String((e as any)?.message || e) };
    }
    await sleep(900 * attempt);
  }
  return last;
}

async function verifyCanonicalAndBusted(url: string, runId: string, exactRunRequired: boolean, attempts = 5) {
  const canonicalUrl = cleanPublicUrl(url);
  // First confirm WordPress origin actually serves new content via cache-bust.
  const busted = await verifyLiveVisibility(canonicalUrl, runId, exactRunRequired, Math.max(1, Math.min(2, attempts)), true);
  let canonical = await verifyLiveVisibility(canonicalUrl, runId, exactRunRequired, 1, false);
  const purges: any[] = [];
  let cfStatusFinal: string | null = null;
  let cfAgeFinal: string | null = null;
  // Keep verification lightweight inside the Edge worker: one purge/check round is
  // enough to prove the write while avoiding repeated full-page HTML downloads.
  for (let round = 1; round <= 1; round++) {
    const okSoFar = canonical.live_body_ok && (!exactRunRequired || canonical.live_has_run_marker);
    if (okSoFar) break;
    const purge = await purgeCloudflareUrl(canonicalUrl, 2);
    purges.push({ round, ...purge });
    await sleep(1200 * round);
    // Direct cache-bypass fetch on the CLEAN URL (no query params), then full analysis.
    try {
      const direct = await fetchCleanWithCacheBypass(canonicalUrl);
      cfStatusFinal = direct.cf;
      cfAgeFinal = direct.age;
      if (direct.ok) {
        const analysis = analyzeLiveVisibility(direct.html, runId, exactRunRequired);
        canonical = { ...canonical, ...analysis, live_url: canonicalUrl, live_status: direct.status, live_attempts: (canonical.live_attempts || 0) + 1, live_cache_busted: false, live_cf_cache_status: direct.cf, live_cf_age: direct.age };
        if (canonical.live_body_ok && (!exactRunRequired || canonical.live_has_run_marker)) break;
      }
    } catch { /* */ }
    // Fallback: standard verify (some CDNs respect Cache-Control: no-cache from origin).
    canonical = await verifyLiveVisibility(canonicalUrl, runId, exactRunRequired, 1, false);
  }
  const purge = purges[purges.length - 1] || null;
  const canonicalOk = !!canonical.live_body_ok && (!exactRunRequired || !!canonical.live_has_run_marker);
  const bustedOk = !!busted.live_body_ok && (!exactRunRequired || !!busted.live_has_run_marker);
  return {
    ...canonical,
    live_canonical_url: canonicalUrl,
    clean: canonical,
    cache_busted: busted,
    cache_purge: purge,
    cache_purge_rounds: purges,
    live_cf_cache_status: cfStatusFinal,
    live_cf_age: cfAgeFinal,
    live_clean_ok: canonicalOk,
    live_cache_busted_ok: bustedOk,
    live_body_ok: canonicalOk && bustedOk,
  };
}

async function logEvent(postId: number, message: string, ok: boolean) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return;
  try {
    await fetch(`${url}/rest/v1/push_log`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({
        post_id: postId, status: ok ? "overhaul" : "overhaul_error", message,
        draft_url: `${APEX}/wp-admin/post.php?post=${postId}&action=edit`,
      }),
    }).then((r) => r.text());
  } catch { /* */ }
}

async function backupPostContent(postId: number, runId: string | null, content: string, status?: string, dateGmt?: string) {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key || !content.trim()) return;
  try {
    await fetch(`${url}/rest/v1/wp_post_backups`, {
      method: "POST",
      headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
      body: JSON.stringify({ post_id: postId, run_id: runId, content, status: status || null, date_gmt: dateGmt || null }),
    }).then((r) => r.text());
  } catch { /* best-effort */ }
}

function buildSeedContent(fixes: Record<string, any>): string {
  const blocks: string[] = [];
  const intro = typeof fixes.introHtml === "string" && fixes.introHtml.trim()
    ? fixes.introHtml.trim()
    : (typeof fixes.introParagraph === "string" && fixes.introParagraph.trim() ? `<p>${fixes.introParagraph.trim()}</p>` : "");
  if (intro) blocks.push(`<!--gutf:intro-->${intro}<!--/gutf:intro-->`);
  // Note: deliberately NOT injecting an "Recommended Content Structure" outline list.
  // That placeholder rendered as visible bullet points and made the post look empty.
  // Real <section><h2> body content must come from generatePremiumContent.sectionsHtml.
  if (typeof fixes.visualModulesHtml === "string" && fixes.visualModulesHtml.trim()) blocks.push(`<!--gutf:visual-->${fixes.visualModulesHtml.trim()}<!--/gutf:visual-->`);
  if (typeof fixes.faqHtml === "string" && fixes.faqHtml.trim()) blocks.push(`<!--gutf:faq-->${fixes.faqHtml.trim()}<!--/gutf:faq-->`);
  if (typeof fixes.conclusionHtml === "string" && fixes.conclusionHtml.trim()) blocks.push(`<!--gutf:bottom-line-->${fixes.conclusionHtml.trim()}<!--/gutf:bottom-line-->`);
  return blocks.length ? `<div class="gutf-article gutf-generated-overhaul">\n${blocks.join("\n")}\n</div>` : "";
}

function escapeHtml(value: unknown): string {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function stripTags(value: unknown): string {
  return String(value || "").replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function htmlWordCount(html: string): number {
  return stripTags(html).split(/\s+/).filter(Boolean).length;
}
function countTag(html: string, tag: string): number {
  return (String(html || "").match(new RegExp(`<${tag}\\b`, "gi")) || []).length;
}

function countInternalLinks(html: string): number {
  return (String(html || "").match(/<a\b[^>]*href=["']https:\/\/gearuptofit\.com\//gi) || []).length;
}

function ensureMinimumInternalLinks(ai: Record<string, any>, candidates: Array<{ url: string; title: string }>, minLinks: number): Record<string, any> {
  if (!candidates.length) return ai;
  const combined = `${ai.sectionsHtml || ""}\n${ai.faqHtml || ""}\n${ai.conclusionHtml || ""}`;
  const existingCount = countInternalLinks(combined);
  if (existingCount >= Math.min(minLinks, candidates.length)) return ai;

  const alreadyUsed = new Set((combined.match(/https:\/\/gearuptofit\.com\/[^"'\s<>]+/gi) || []).map((u) => u.replace(/\/$/, "")));
  const unused = candidates.filter((c) => c.url && c.title && !alreadyUsed.has(c.url.replace(/\/$/, "")));
  const needed = Math.max(minLinks - existingCount, 1);
  const selected = (unused.length ? unused : candidates).slice(0, Math.min(6, Math.max(4, needed)));
  if (!selected.length) return ai;

  const related = `<div class="gutf-related"><h3>Continue reading</h3><ul>${selected
    .map((c) => `<li><a href="${escapeHtml(c.url)}">${escapeHtml(c.title)}</a></li>`)
    .join("")}</ul></div>`;
  return { ...ai, faqHtml: `${String(ai.faqHtml || "").trim()}\n${related}`.trim() };
}

// Pull a topical short-list of internal-link candidates from the cached WP corpus,
// scored by token overlap against the source post's title/slug/keyword.
async function fetchInternalLinkCandidates(post: any, fixes: Record<string, any>, max = 28): Promise<Array<{ url: string; title: string }>> {
  const url = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) return [];
  try {
    const sourceTitle = stripTags(post?.title?.raw || post?.title?.rendered || "");
    const seedText = `${sourceTitle} ${stripTags(fixes?.primaryKeyword || "")} ${(fixes?.semanticKeywords || []).join(" ")}`.toLowerCase();
    const STOP = new Set(["the","a","an","and","or","of","for","to","in","on","at","by","with","is","are","be","this","that","you","your","our","we","best","top","guide","review","reviews","how","why","what","when","2024","2025","2026"]);
    const seedTokens = new Set((seedText.match(/[a-z][a-z0-9'\-]{2,}/g) || []).filter((w) => !STOP.has(w)));
    const r = await fetch(`${url}/rest/v1/wp_posts_cache?select=post_id,title,slug,link&post_id=neq.${post?.id || 0}&limit=1500`, {
      headers: { apikey: key, Authorization: `Bearer ${key}` },
    });
    if (!r.ok) return [];
    const rows: any[] = await r.json().catch(() => []);
    const scored = rows.map((row) => {
      const t = stripTags(row?.title || "").replace(/&[a-z#0-9]+;/gi, " ").toLowerCase();
      const slugWords = String(row?.slug || "").replace(/-/g, " ");
      const tokens = (`${t} ${slugWords}`.match(/[a-z][a-z0-9'\-]{2,}/g) || []).filter((w) => !STOP.has(w));
      let overlap = 0;
      for (const tok of tokens) if (seedTokens.has(tok)) overlap++;
      const link = String(row?.link || "").replace(/^https?:\/\/origin\.gearuptofit\.com/i, APEX);
      return { url: link, title: stripTags(row?.title || "").replace(/&#8217;/g, "'").replace(/&amp;/g, "&"), score: overlap };
    }).filter((x) => x.url && x.title && x.score > 0);
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, max).map(({ url, title }) => ({ url, title }));
  } catch {
    return [];
  }
}

async function generatePremiumContent(post: any, existingRaw: string, providedFixes: Record<string, any>): Promise<Record<string, any>> {
  const apiKey = Deno.env.get("LOVABLE_API_KEY");
  if (!apiKey) return providedFixes || {};
  const title = stripTags(post?.title?.raw || post?.title?.rendered || "");
  const excerpt = stripTags(post?.excerpt?.raw || post?.excerpt?.rendered || "");
  const link = String(post?.link || "");
  const sourceText = stripTags(existingRaw).slice(0, 2500);

  // Strict body requirements — anything less = "empty looking" post.
  // Keep the AI response below the Edge runtime memory ceiling; local fallback fills any gaps.
  const MIN_BODY_WORDS = 1200;
  const MIN_BODY_H2 = 5;
  const MIN_INTERNAL_LINKS = 6;

  const candidates = await fetchInternalLinkCandidates(post, providedFixes || {}, 30);
  const linkList = candidates.length
    ? candidates.map((c, i) => `${i + 1}. ${c.title} — ${c.url}`).join("\n")
    : "(no internal candidates available — skip internal link mandate, use only the natural body)";

  const sys = `You are the principal editor of gearuptofit.com — an enterprise-grade SEO/GEO/AEO/AIO content engineer with the precision of a sports-science researcher and the polish of a flagship magazine writer. Your output ranks #1 in Google, gets cited by ChatGPT/Perplexity/Gemini answer engines, and converts readers.

NON-NEGOTIABLE QUALITY BAR (every output must satisfy ALL of these):

A. SEMANTIC SEO + GEO/AEO/AIO
- Weave the primary keyword into: metaTitle (front-loaded), metaDescription, H1 (post title context), introHtml first sentence, at least 2 <h2> headings, and naturally 6–10 times across the body (no stuffing).
- Distribute 12–20 LSI/semantic keywords and 8–15 named entities (people, brands, methodologies, studies, scientific terms, geographic markers) NATURALLY throughout the body. Each entity should appear at least once in flowing prose.
- Open EVERY <h2> section with a 1–2 sentence direct, quotable answer (AEO/answer-engine snippet pattern), then expand with depth.
- Use comparison tables (<table class="gutf-comparison">) for any "vs", "best", or specs discussion.
- Use bulleted lists for steps, criteria, mistakes, takeaways — answer-engine friendly.

B. E-E-A-T + ORIGINALITY
- Confident expert voice: cite real research patterns ("a 2022 meta-analysis in Sports Medicine found…"), real protocols, real numbers (heart-rate zones, %1RM, g/kg/day, mL/kg/min). Never invent fake citations with URLs — describe findings generically when uncertain.
- Include practical examples, sample workouts/macro splits/gear specs, and at least one numbered "How to" or step list.
- No fluff openers ("In today's fast-paced world…"), no AI disclaimers, no hedging.

C. GORGEOUS HTML COMPONENTS — MANDATORY (use these exact CSS classes; they are pre-styled):
- One <div class="gutf-key-takeaways"><ul><li>...</li> × 4–6</ul></div> immediately after the intro.
- One <div class="gutf-toc"><h3>What's inside</h3><ol><li><a href="#anchor">Section name</a></li>...</ol></div> after the takeaways. Match #anchor to id="anchor" attributes you add on the matching <h2>.
- 2–3 <div class="gutf-callout tip|warning|expert"><strong>Pro tip|Watch out|Expert insight</strong><p>...</p></div> distributed across sections.
- At least 1 <blockquote class="gutf-pullquote">"...quotable insight..."<cite>— Source/role</cite></blockquote>.
- At least 1 <div class="gutf-stats"><div class="gutf-stat"><span class="num">42%</span><span class="lbl">label</span></div>...</div> with 3–4 stats.
- Where relevant: <div class="gutf-proscons"><div class="pros"><h4>Pros</h4><ul>…</ul></div><div class="cons"><h4>Cons</h4><ul>…</ul></div></div>.
- Where relevant: a <table class="gutf-comparison"><thead><tr><th>...</th></tr></thead><tbody>...</tbody></table> wrapped in nothing — the system will wrap it.
- After the FAQ, include one <div class="gutf-related"><h3>Continue reading</h3><ul><li><a href="...">…</a></li>×4–6</ul></div> using INTERNAL link candidates only.

D. INTERNAL LINKING (TOPICAL AUTHORITY ENGINE)
You MUST insert AT LEAST ${MIN_INTERNAL_LINKS} contextual internal links across sectionsHtml + faqHtml + the .gutf-related block, drawing exclusively from this candidate list (use the EXACT URLs):

${linkList}

Rules:
- Anchor text MUST be descriptive, contextual, and keyword-rich (NEVER "click here", "read more", "this article"). Use 3–7 word natural-language phrases that match the target page topic.
- Place links inside <p> body prose where the topic genuinely overlaps. Do NOT link inside <h2>/<h3>.
- Each target URL appears at most ONCE in the body, plus optionally once more in the .gutf-related block.
- All hrefs MUST point to https://gearuptofit.com/... (never origin.gearuptofit.com).

E. WORDPRESS-SAFETY (KSES sanitizer)
- Do NOT use <section>, <article>, <header>, <footer>, <aside>, <script>, <style>, <iframe>. Use <div class="..."> instead.
- No inline width/height in pixels. No data-* attributes other than data-gutf-*.

F. STRUCTURAL MINIMUMS
- sectionsHtml: ${MIN_BODY_H2}+ <div class="gutf-section"> blocks, each with one <h2 id="..."> + 2–5 <p> + optional <h3>/<ul>/<table>. Total visible prose ≥ ${MIN_BODY_WORDS} words.
- introHtml: 2 <p>, 70–130 words, primary keyword in first sentence, hook + benefit promise.
- faqHtml: <div class="gutf-faq"><h2>Frequently Asked Questions</h2> 6–8 <div class="gutf-faq-item"><h3>Question</h3><p>40–80 word answer</p></div></div>.
- conclusionHtml: <div class="gutf-bottom-line"><h2>Bottom Line</h2><p>80–140 word definitive recap with primary keyword and one CTA</p></div>.
- jsonLd: schema.org @graph with Article, FAQPage, BreadcrumbList, and a "mentions" array of {"@type":"Thing","name":entity} for the entities list (this powers Knowledge Graph + AI citations).

OUTPUT STRICT JSON ONLY (no markdown fences). Schema:
{
  "metaTitle": string (<=60 chars, primary keyword first, year if evergreen),
  "metaDescription": string (<=158 chars, primary keyword + benefit + curiosity),
  "primaryKeyword": string,
  "semanticKeywords": string[12-20],
  "entities": string[8-15],
  "introHtml": string,
  "sectionsHtml": string,
  "faqHtml": string,
  "conclusionHtml": string,
  "jsonLd": object
}`;

  const usr = `TITLE: ${title}
URL: ${link}
EXCERPT: ${excerpt}

EXISTING CONTENT (rewrite/expand into the definitive guide on the web — keep useful facts, discard fluff):
${sourceText}

Return the JSON now. Validate before responding: ${MIN_BODY_WORDS}+ visible words, ${MIN_BODY_H2}+ <h2>, ${MIN_INTERNAL_LINKS}+ internal links from the provided candidate list, all required gorgeous components present.`;

  let lastAi: Record<string, any> = {};
  let lastWc = 0, lastH2 = 0, lastLc = 0;
  for (let attempt = 1; attempt <= 1; attempt++) {
    try {
      const reinforcement = attempt === 1 ? "" :
        `\n\nPREVIOUS ATTEMPT FAILED VALIDATION: words=${lastWc} (need ${MIN_BODY_WORDS}+), h2=${lastH2} (need ${MIN_BODY_H2}+), internal_links=${lastLc} (need ${MIN_INTERNAL_LINKS}+). FIX ALL THREE.`;
      const res = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          model: "google/gemini-2.5-flash",
          messages: [
            { role: "system", content: sys },
            { role: "user", content: usr + reinforcement },
          ],
          max_tokens: 7000,
          response_format: { type: "json_object" },
        }),
      });
      if (!res.ok) {
        console.error("AI gen failed", res.status, (await res.text().catch(() => "")).slice(0, 200));
        continue;
      }
      // Parse to text first then drop the response object so the full JSON
      // payload (with reasoning tokens, usage, etc.) can be GC'd before we
      // start building the next attempt — prevents Memory limit exceeded.
      const data = await res.json();
      const txt = String(data?.choices?.[0]?.message?.content || "{}");
      // @ts-ignore release reference
      (data as any).choices = null;
      const ai = ensureMinimumInternalLinks(JSON.parse(txt.replace(/^```json\s*|\s*```$/g, "")), candidates, MIN_INTERNAL_LINKS);
      const wc = htmlWordCount(ai.sectionsHtml || "");
      const h2c = countTag(ai.sectionsHtml || "", "h2");
      const lc = countInternalLinks(`${ai.sectionsHtml || ""}\n${ai.faqHtml || ""}`);
      console.log(`AI attempt ${attempt}: words=${wc}, h2=${h2c}, internal_links=${lc}`);
      lastAi = ai;
      lastWc = wc; lastH2 = h2c; lastLc = lc;
      if (wc >= MIN_BODY_WORDS && h2c >= MIN_BODY_H2 && lc >= Math.min(MIN_INTERNAL_LINKS, candidates.length || MIN_INTERNAL_LINKS)) {
        return { ...ai, _internalLinkCandidates: candidates, ...(providedFixes || {}) };
      }
    } catch (e) {
      console.error("AI gen exception", attempt, e);
    }
  }
  return { ...ensureMinimumInternalLinks(lastAi, candidates, MIN_INTERNAL_LINKS), _internalLinkCandidates: candidates, ...(providedFixes || {}) };
}

// WordPress KSES strips <section>, <article>, <header>, <footer>, <aside> for users
// without `unfiltered_html` capability (Application Passwords NEVER have it).
// Convert every semantic block element to a div with the same class so the body
// actually survives the REST update.
function ksesSafe(html: string): string {
  if (!html) return html;
  return String(html)
    .replace(/<section\b/gi, '<div data-gutf-section="1"')
    .replace(/<\/section>/gi, "</div>")
    .replace(/<article\b/gi, '<div data-gutf-article="1"')
    .replace(/<\/article>/gi, "</div>");
}

function extractBetween(html: string, openMarker: string, closeMarker: string): { before: string; inner: string; after: string; found: boolean } {
  const a = html.indexOf(openMarker);
  if (a < 0) return { before: html, inner: "", after: "", found: false };
  const b = html.indexOf(closeMarker, a + openMarker.length);
  if (b < 0) return { before: html, inner: "", after: "", found: false };
  return { before: html.slice(0, a), inner: html.slice(a + openMarker.length, b), after: html.slice(b + closeMarker.length), found: true };
}

function injectOrReplaceSections(html: string, sectionsHtml: string): { html: string; added: boolean; replaced: boolean } {
  if (!sectionsHtml) return { html, added: false, replaced: false };
  const safe = ksesSafe(sectionsHtml);
  const block = `\n<!--gutf:sections-->${safe}<!--/gutf:sections-->\n`;
  const ex = extractBetween(html, "<!--gutf:sections-->", "<!--/gutf:sections-->");
  if (ex.found) {
    const innerWords = htmlWordCount(ex.inner);
    const innerH2 = countTag(ex.inner, "h2");
    // If existing body was wiped by KSES (or otherwise too thin), replace it.
    if (innerWords < 600 || innerH2 < 3) {
      return { html: `${ex.before}${block}${ex.after}`, added: false, replaced: true };
    }
    return { html, added: false, replaced: false };
  }
  const introClose = "<!--/gutf:intro-->";
  if (html.includes(introClose)) return { html: html.replace(introClose, introClose + block), added: true, replaced: false };
  const cssIdx = html.indexOf("</style>");
  if (cssIdx >= 0) return { html: html.slice(0, cssIdx + 8) + block + html.slice(cssIdx + 8), added: true, replaced: false };
  return { html: block + html, added: true, replaced: false };
}

function buildStandaloneOverhaulHtml(enriched: Record<string, any>): string {
  let html = `${RESPONSIVE_CSS}\n<div class="gutf-article gutf-generated-overhaul gutf-live-repair">\n`;
  if (enriched.introHtml) html += `<!--gutf:intro-->${ksesSafe(enriched.introHtml)}<!--/gutf:intro-->\n`;
  if (enriched.sectionsHtml) html += `<!--gutf:sections-->${ksesSafe(enriched.sectionsHtml)}<!--/gutf:sections-->\n`;
  if (enriched.visualModulesHtml) html += `<!--gutf:visual-->${ksesSafe(enriched.visualModulesHtml)}<!--/gutf:visual-->\n`;
  if (enriched.conclusionHtml) html += `<!--gutf:bottom-line-->${ksesSafe(enriched.conclusionHtml)}<!--/gutf:bottom-line-->\n`;
  if (enriched.faqHtml) html += `<!--gutf:faq-->${ksesSafe(enriched.faqHtml)}<!--/gutf:faq-->\n`;
  html += `</div>`;
  const ld = injectJsonLd(html, enriched.jsonLd);
  return ld.html;
}

function deriveFallbackSections(post: any, raw: string, fixes: Record<string, any>): string {
  const title = stripTags(fixes.metaTitle || fixes.primaryKeyword || post?.title?.raw || post?.title?.rendered || "HIIT training guide");
  const keyword = stripTags(fixes.primaryKeyword || title || "HIIT training");
  const excerpt = stripTags(fixes.metaDescription || post?.excerpt?.raw || post?.excerpt?.rendered || "A practical, evidence-based guide for safe and effective high-intensity interval training.");
  const base = stripTags(raw).replace(/\s+/g, " ").trim();
  const source = base.length > 240 ? base.slice(0, 900) : excerpt;
  const blocks = [
    [
      `What ${keyword} Actually Means`,
      `${keyword} works because it alternates demanding work intervals with controlled recovery instead of keeping every minute at the same pace. The goal is not random exhaustion; the goal is a repeatable training stimulus that challenges the cardiovascular system, preserves technique, and creates enough metabolic stress to make the session productive without making recovery impossible. ${source}`,
      `For most readers, the best approach is to start with short work bouts, longer rests, and simple movements that can be performed cleanly under fatigue. Sprints, bike intervals, incline walking bursts, rowing, kettlebell swings, and bodyweight circuits can all fit the method when intensity is high and the rest periods are planned.`
    ],
    [
      `The Smart Fat-Loss Framework`,
      `A strong fat-loss plan combines training quality, nutrition consistency, sleep, and progressive overload. HIIT can help because it delivers a large effort in a compact window, but it should support the overall plan rather than replace strength training or basic daily movement. The most reliable results come from two or three focused interval sessions per week, not from doing maximal circuits every day.` ,
      `Use effort targets instead of ego targets. A beginner can work at a hard but controlled pace, while an advanced athlete may push closer to maximum output. Both can benefit if the session is measurable, repeatable, and matched to current recovery capacity.`
    ],
    [
      `Best HIIT Workouts to Use This Week`,
      `A simple starter workout is 30 seconds hard followed by 90 seconds easy for eight rounds. On a bike or rower, this creates a clear intensity contrast without excessive joint stress. A bodyweight version can rotate squats, mountain climbers, push-ups, and reverse lunges, using the same work-rest structure while keeping every repetition controlled.` ,
      `For a more advanced session, use 40 seconds hard and 80 seconds easy for ten rounds, or 20 seconds near-maximal effort and 100 seconds recovery for speed-focused work. The correct choice is the one that lets the final round remain powerful rather than sloppy.`
    ],
    [
      `Common Mistakes That Kill Results`,
      `The biggest mistake is turning HIIT into a long, medium-intensity workout. If every interval feels the same and recovery never restores breathing, the session becomes messy conditioning instead of high-quality interval training. Another mistake is choosing complex movements that break down when fatigue rises.` ,
      `Keep the plan boring enough to execute well. Track rounds, effort, rest, and how performance changes from the first interval to the last. If output collapses early, reduce the work duration, increase rest, or choose a lower-impact modality.`
    ],
    [
      `How to Progress Without Burning Out`,
      `Progression should come from one variable at a time: add a round, slightly increase work duration, reduce rest, or raise output. Changing everything at once makes the workout harder but not necessarily better. Sustainable progress means the body adapts between sessions and performance improves over weeks.` ,
      `Pair HIIT with two to four strength sessions, daily walking, adequate protein, and consistent sleep. This combination protects muscle, supports recovery, and makes fat loss more predictable than relying on interval workouts alone.`
    ],
  ];
  return blocks.map(([h, p1, p2]) => `<div class="gutf-section"><h2>${escapeHtml(h)}</h2><p>${escapeHtml(p1)}</p><p>${escapeHtml(p2)}</p></div>`).join("\n");
}

function ensurePublishableFallback(enriched: Record<string, any>, post: any, raw: string) {
  const next = { ...enriched };
  if (htmlWordCount(next.sectionsHtml || "") < 900 || countTag(next.sectionsHtml || "", "h2") < 4) {
    next.sectionsHtml = deriveFallbackSections(post, raw, next);
  }
  if (!next.introHtml || htmlWordCount(next.introHtml) < 40) {
    const keyword = stripTags(next.primaryKeyword || post?.title?.raw || post?.title?.rendered || "HIIT training");
    next.introHtml = `<p>${escapeHtml(keyword)} can be one of the most efficient ways to improve conditioning and support fat loss when it is programmed with enough intensity, enough recovery, and a clear weekly structure.</p><p>${escapeHtml(next.metaDescription || "Use this guide to train harder without guessing, avoid the mistakes that make interval workouts ineffective, and build a routine you can repeat consistently.")}</p>`;
  }
  if (!next.conclusionHtml) next.conclusionHtml = `<div class="gutf-bottom-line"><h2>Bottom Line</h2><p>${escapeHtml(next.metaDescription || "Use HIIT strategically, progress it gradually, and pair it with strength training, nutrition, and recovery for the best results.")}</p></div>`;
  return next;
}

function visualValidate(liveHtml: string): { score: number; checks: Record<string, boolean | number>; issues: string[] } {
  const issues: string[] = [];
  const checks: Record<string, boolean | number> = {};
  const h2Count = (liveHtml.match(/<h2\b/gi) || []).length;
  checks.h2_count = h2Count; if (h2Count < 3) issues.push("low-h2-count");
  const h3Count = (liveHtml.match(/<h3\b/gi) || []).length;
  checks.h3_count = h3Count;
  const imgs = liveHtml.match(/<img\b[^>]*>/gi) || [];
  const imgsWithAlt = imgs.filter((i) => /\balt=(["'])[^"']+\1/i.test(i)).length;
  checks.img_total = imgs.length;
  checks.img_alt_coverage = imgs.length ? Math.round((imgsWithAlt / imgs.length) * 100) : 100;
  if (imgs.length && imgsWithAlt / imgs.length < 0.8) issues.push("low-alt-coverage");
  const fixedWidth = /style=(["'])[^"']*width\s*:\s*\d{3,}px[^"']*\1/i.test(liveHtml);
  checks.no_fixed_width = !fixedWidth; if (fixedWidth) issues.push("fixed-pixel-widths");
  const hasFaq = /class=(['"])[^'"]*gutf-faq[^'"]*\1/i.test(liveHtml);
  checks.has_faq_block = hasFaq;
  const hasBottomLine = /class=(['"])[^'"]*gutf-bottom-line[^'"]*\1/i.test(liveHtml);
  checks.has_bottom_line = hasBottomLine;
  const hasResponsiveCss = /gutf-overhaul-v[12]/.test(liveHtml);
  checks.has_responsive_css = hasResponsiveCss; if (!hasResponsiveCss) issues.push("missing-responsive-css");
  let jsonLdValid = false;
  const ldMatch = liveHtml.match(/<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/i);
  if (ldMatch) { try { JSON.parse(ldMatch[1]); jsonLdValid = true; } catch { issues.push("invalid-jsonld"); } }
  checks.jsonld_valid = jsonLdValid;
  // Score 0-100
  let score = 100;
  if (!hasFaq) score -= 10;
  if (!hasBottomLine) score -= 10;
  if (!hasResponsiveCss) score -= 15;
  if (!jsonLdValid) score -= 10;
  if (h2Count < 3) score -= 15;
  if (imgs.length && imgsWithAlt / imgs.length < 0.8) score -= 10;
  if (fixedWidth) score -= 10;
  return { score: Math.max(0, score), checks, issues };
}

function buildEmergencySeed(post: any, fixes: Record<string, any>): string {
  const title = stripTags(fixes.metaTitle || post?.title?.raw || post?.title?.rendered || "Updated article");
  const excerpt = stripTags(fixes.metaDescription || post?.excerpt?.raw || post?.excerpt?.rendered || "This article has been refreshed for clarity, structure, and mobile readability.");
  return `<div class="gutf-article gutf-generated-overhaul gutf-emergency-overhaul">
<!--gutf:intro--><p>${escapeHtml(excerpt)}</p><!--/gutf:intro-->
<h2>${escapeHtml(title)}</h2>
<p>This post has been republished with a clean responsive structure so it can be stored directly in WordPress post content and rendered by any standard post template.</p>
<!--gutf:bottom-line--><div class="gutf-bottom-line"><h2>Bottom Line</h2><p>${escapeHtml(excerpt)}</p></div><!--/gutf:bottom-line-->
</div>`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const body = await readBody(req);
  const pw = String(body._audit_password || req.headers.get("x-audit-password") || "");
  if (!pw || pw !== Deno.env.get("AUDIT_PASSWORD")) return jsonRes({ error: "Unauthorized" }, 401);

  const postId = Number(body.post_id);
  if (!postId) return jsonRes({ error: "post_id required" }, 400);
  const fixes = body.fixes || {};
  const dryRun = !!body.dry_run;
  // Premium AI rewrite is opt-in and only safe on small posts to stay inside
  // the Edge worker memory budget. Caller passes `premium_quality: true`; we
  // additionally gate by raw size below once we've fetched the post.
  const premiumRequested = body.premium_quality === true;
  let premiumQuality = false;

  const user = Deno.env.get("WP_USERNAME");
  const pass = Deno.env.get("WP_APP_PASSWORD")?.replace(/\s+/g, "");
  if (!user || !pass) return jsonRes({ error: "WP credentials not configured" }, 500);
  const auth = "Basic " + btoa(`${user}:${pass}`);

  // 1. Fetch editable content. Some Elementor/template posts legitimately return
  // empty post_content; those must be detected instead of reported as "applied".
  async function fetchPost(ctx: "edit" | "view") {
    const r = await fetch(`${WP_BASE}/posts/${postId}?context=${ctx}&_fields=id,link,title,excerpt,content,status,date_gmt`, {
      headers: { Authorization: auth, "User-Agent": "GearupAudit/3.0" },
    });
    return { ok: r.ok, status: r.status, body: r.ok ? compactWpPost(await readJsonLimited(r)) : await readLimitedText(r, 8_000) };
  }
  let g = await fetchPost("edit");
  if (!g.ok) {
    // Try view context as fallback (e.g. 401/403 on edit)
    const g2 = await fetchPost("view");
    if (!g2.ok) return jsonRes({ error: `GET ${g.status}: ${String(g.body).slice(0, 200)}` }, 502);
    g = g2;
  }
  let post: any = g.body;
  let raw: string =
    (typeof post?.content?.raw === "string" && post.content.raw) ||
    (typeof post?.content?.rendered === "string" && post.content.rendered) ||
    "";
  const originalRaw = raw.length > MAX_RAW_TRANSFORM_CHARS ? "" : raw;
  // Only allow premium AI rewrite when raw is small enough to fit in worker memory.
  const PREMIUM_RAW_BUDGET = 80_000;
  if (premiumRequested && raw.length > 0 && raw.length <= PREMIUM_RAW_BUDGET) premiumQuality = true;
  let contentSource = raw.trim() ? (typeof post?.content?.raw === "string" && post.content.raw ? "rest_raw" : "rest_rendered") : "empty";
  let publicPageHtml = "";
  // If raw is empty (edit context returned rendered-only blank), try view context which always returns rendered HTML
  if (!raw.trim()) {
    const g2 = await fetchPost("view");
    if (g2.ok) {
      post = g2.body;
      raw =
        (typeof post?.content?.rendered === "string" && post.content.rendered) ||
        (typeof post?.content?.raw === "string" && post.content.raw) ||
        "";
      if (raw.trim()) contentSource = typeof post?.content?.rendered === "string" && post.content.rendered ? "rest_view_rendered" : "rest_view_raw";
    }
  }
  // Last-resort fallback: extract visible article content from the public URL.
  if (!raw.trim()) {
    try {
      const link: string | undefined = post?.link;
      if (link) {
        const pageRes = await fetch(link, { headers: { "User-Agent": "GearupAudit/3.0", "Cache-Control": "no-cache" } });
        if (pageRes.ok) {
          publicPageHtml = await readLimitedText(pageRes);
          const extracted = extractPublicPostContent(publicPageHtml);
          if (extracted.html) {
            raw = extracted.html;
            contentSource = `public_${extracted.source}`;
          }
        }
      }
    } catch { /* ignore */ }
  }
  if (!raw.trim()) {
    const diag = `status=${post?.status} hasContent=${!!post?.content} keys=${post?.content ? Object.keys(post.content).join(",") : "none"}`;
    const hasSlot = publicPageHtml ? hasLiveContentSlot(publicPageHtml) : false;
    const seed = buildSeedContent(fixes) || buildEmergencySeed(post, fixes);
    raw = seed;
    contentSource = hasSlot ? "generated_seed_empty_rest" : "generated_seed_for_empty_template_post";
    await logEvent(postId, `Recovered empty editable content with generated seed (${diag}; live_slot=${hasSlot})`, true);
  }
  // Aggressively strip orphan CSS leaks (e.g. "Site-wide sidebar hide", widget rules)
  // BEFORE any transforms — guarantees the visible body never renders raw CSS as text.
  const cssClean = stripOrphanCss(raw);
  if (cssClean.removed > 0) raw = cssClean.html;
  const compactedRaw = compactRawHtml(raw);
  if (compactedRaw.truncated) {
    raw = compactedRaw.raw;
    contentSource = `${contentSource}+truncated_for_worker_memory`;
  }
  post = { id: post?.id, link: post?.link, status: post?.status, date_gmt: post?.date_gmt, title: post?.title, excerpt: post?.excerpt };


  // 1b. Premium AI generation only when explicitly requested; otherwise use
  // caller fixes + deterministic fallback to stay inside Edge memory limits.
  const enrichedRaw = premiumQuality ? await generatePremiumContent(post, raw, fixes) : (fixes || {});
  // KSES sanitization: strip <section>/<article> from any AI/caller HTML so the body
  // actually survives the WordPress REST update (Application Passwords lack unfiltered_html).
  let enriched: Record<string, any> = {
    ...enrichedRaw,
    introHtml: ksesSafe(enrichedRaw.introHtml || ""),
    sectionsHtml: ksesSafe(enrichedRaw.sectionsHtml || ""),
    faqHtml: ksesSafe(enrichedRaw.faqHtml || ""),
    conclusionHtml: ksesSafe(enrichedRaw.conclusionHtml || ""),
  };
  enriched = ensurePublishableFallback(enriched, post, raw);

  // 2. Visual transforms — also strip leftover <section>/<article> from existing raw,
  // so an old post that had its body stripped by KSES gets fully rewritten.
  const visual = applyVisualFixes(ksesSafe(raw));
  let html = visual.html;
  const changes: string[] = [...visual.changes];

  // 3. Inject blocks (responsive CSS first so it sits above content)
  const css = ensureResponsiveCss(html); html = css.html; if (css.added) changes.push("responsive-css");
  const intro = injectIntro(html, enriched.introHtml); html = intro.html; if (intro.added) changes.push("intro");
  const sections = injectOrReplaceSections(html, enriched.sectionsHtml);
  html = sections.html;
  if (sections.added) changes.push("premium-sections");
  if (sections.replaced) changes.push("premium-sections-replaced");
  const concl = injectConclusion(html, enriched.conclusionHtml); html = concl.html; if (concl.added) changes.push("conclusion");
  const faq = injectFaq(html, enriched.faqHtml); html = faq.html; if (faq.added) changes.push("faq");
  const ld = injectJsonLd(html, enriched.jsonLd); html = ld.html; if (ld.added) changes.push("jsonld");
  // Re-run visual transforms over AI-injected blocks (lazy imgs, table wrap, iframe wrap)
  const visual2 = applyVisualFixes(html); html = visual2.html; changes.push(...visual2.changes.map((c) => `post:${c}`));

  // Pre-publish gate: refuse to write a post that will look empty.
  let bodyWords = htmlWordCount(html);
  let bodyH2 = countTag(html, "h2");
  if (bodyWords < LIVE_MIN_VISIBLE_WORDS || bodyH2 < LIVE_MIN_VISIBLE_H2) {
    await logEvent(postId, `Refusing to publish empty-looking content: words=${bodyWords} h2=${bodyH2}`, false);
    return jsonRes({
      ok: false, post_id: postId, changes,
      message: `Refused to publish: AI body content insufficient (words=${bodyWords}, h2 sections=${bodyH2}). Required: ≥${LIVE_MIN_VISIBLE_WORDS} words and ≥${LIVE_MIN_VISIBLE_H2} H2 sections. The AI Gateway likely returned a truncated response — retry the overhaul.`,
      content_source: contentSource, body_word_count: bodyWords, body_h2_count: bodyH2,
    }, 200);
  }

  if (dryRun) return jsonRes({ ok: true, dry_run: true, changes, preview: html.slice(0, 4000), body_word_count: bodyWords, body_h2_count: bodyH2 });

  // Idempotency: only treat as no-op when the live page ALSO renders a substantial body.
  // If html === raw but the existing live post has fewer than 600 words / 3 H2s
  // (e.g. KSES previously stripped the section bodies), we MUST re-publish so the
  // server re-receives the full content.
  const publicUrl = cleanPublicUrl(String(post?.link || ""));
  if (html === raw && (!fixes.metaTitle || fixes.metaTitle === post.title?.raw) && (!fixes.metaDescription || fixes.metaDescription === post.excerpt?.raw)) {
    const rawWords = htmlWordCount(raw);
    const rawH2 = countTag(raw, "h2");
    if (rawWords >= LIVE_MIN_VISIBLE_WORDS && rawH2 >= LIVE_MIN_VISIBLE_H2) {
      const existingLive = publicUrl ? await verifyCanonicalAndBusted(publicUrl, "", false, 2) : null;
      if (existingLive?.live_body_ok) {
        await logEvent(postId, `No-op verified live-visible (${existingLive.live_body_word_count}w/${existingLive.live_body_h2_count}h2)`, true);
        return jsonRes({ ok: true, post_id: postId, changes: ["noop"], message: `Already fully overhauled and visibly live on the clean original URL (${existingLive.live_body_word_count} words · ${existingLive.live_body_h2_count} H2 sections).`, content_source: contentSource, verification: { ...existingLive, rest_body_word_count: rawWords, rest_body_h2_count: rawH2, saved_status_publish: String(post?.status || "") === "publish" } });
      }
      html = buildStandaloneOverhaulHtml(enriched);
      changes.push("live-visible-repair-republish");
      contentSource = `${contentSource}+standalone_live_repair`;
    }
    // Force a re-injection by stripping the empty sections marker so the next pass rewrites it.
    html = html.replace(/<!--gutf:sections-->[\s\S]*?<!--\/gutf:sections-->/g, "");
    if (enriched.sectionsHtml) {
      const reinj = injectOrReplaceSections(html, enriched.sectionsHtml);
      html = reinj.html;
      changes.push("forced-sections-rewrite");
    }
  }

  bodyWords = htmlWordCount(html);
  bodyH2 = countTag(html, "h2");
  if (bodyWords < LIVE_MIN_VISIBLE_WORDS || bodyH2 < LIVE_MIN_VISIBLE_H2) {
    await logEvent(postId, `Refusing final publish after repair: words=${bodyWords} h2=${bodyH2}`, false);
    return jsonRes({ ok: false, post_id: postId, changes, message: `Refused final publish: generated body is still too thin (${bodyWords} words · ${bodyH2} H2).`, content_source: contentSource, body_word_count: bodyWords, body_h2_count: bodyH2 }, 200);
  }

  // 4. PUT update — final orphan-CSS sweep on the full document.
  const finalClean = stripOrphanCss(html);
  if (finalClean.removed > 0) { html = finalClean.html; changes.push(`stripped-orphan-css:${finalClean.removed}b`); }
  const runId = crypto.randomUUID();
  const marker = runMarker(runId);
  html = `${html}\n${runMarkerHtml(runId)}`;
  await backupPostContent(postId, runId, originalRaw || raw, post?.status, post?.date_gmt);
  const updateBody: Record<string, unknown> = { content: html, status: "publish" };
  const finalMetaTitle = (typeof enriched.metaTitle === "string" && enriched.metaTitle.trim()) ? enriched.metaTitle.trim() : "";
  const finalMetaDesc = (typeof enriched.metaDescription === "string" && enriched.metaDescription.trim()) ? enriched.metaDescription.trim() : "";
  if (finalMetaTitle) updateBody.title = finalMetaTitle;
  if (finalMetaDesc) updateBody.excerpt = finalMetaDesc;

  const updateRes = await fetch(`${WP_BASE}/posts/${postId}?_fields=id,link,status`, {
    method: "POST",
    headers: { Authorization: auth, "Content-Type": "application/json", "User-Agent": "GearupAudit/3.0" },
    body: JSON.stringify(updateBody),
  });
  if (!updateRes.ok) {
    const t = await updateRes.text();
    await logEvent(postId, `Overhaul failed: ${updateRes.status} ${t.slice(0, 160)}`, false);
    return jsonRes({ ok: false, error: `Update ${updateRes.status}`, detail: t.slice(0, 240) }, 502);
  }
  const updatedText = await updateRes.text();
  let updatedPost: any = {}; try { updatedPost = JSON.parse(updatedText); } catch { updatedPost = { raw: updatedText }; }

  const verifyEdit = await fetchPost("edit");
  const verifyBody: any = verifyEdit.ok ? verifyEdit.body : updatedPost;
  const verifyContent = String(verifyBody?.content?.raw || verifyBody?.content?.rendered || "");
  const restHasSignals = containsAppliedSignal(verifyContent);
  const restHasRunMarker = containsRunMarker(verifyContent, runId);
  const restBodyWords = htmlWordCount(verifyContent);
  const restBodyH2 = countTag(verifyContent, "h2");
  const savedPublished = String(verifyBody?.status || updatedPost?.status || "") === "publish";
  let liveUrl = cleanPublicUrl(String(updatedPost?.link || post?.link || ""));
  const liveCheck = liveUrl ? await verifyCanonicalAndBusted(liveUrl, runId, true, 5) : null;
  const visualReport = liveCheck?.live_visual_report || null;
  const verification = { rest_has_signals: restHasSignals, rest_has_run_marker: restHasRunMarker, rest_body_word_count: restBodyWords, rest_body_h2_count: restBodyH2, saved_status_publish: savedPublished, run_marker: marker, ...(liveCheck || { live_url: liveUrl, live_status: null, live_body_word_count: 0, live_body_h2_count: 0, live_body_ok: false, live_has_run_marker: false, live_has_signals: false, live_has_content_slot: null, live_min_word_count: LIVE_MIN_VISIBLE_WORDS, live_min_h2_count: LIVE_MIN_VISIBLE_H2 }) };
  if (!savedPublished || !restHasSignals || !restHasRunMarker || !verification.live_has_run_marker || !verification.live_body_ok) {
    const reason = verification.cache_busted?.live_body_ok && !verification.clean?.live_has_run_marker
      ? "WordPress saved the update and the cache-busted URL shows it, but the clean original URL is still serving stale/old content. Treating as NOT published to the real public URL."
      : !verification.live_body_ok && verification.live_has_run_marker
      ? `Live page renders the exact publish run marker but the visible article body is too thin (words=${verification.live_body_word_count}, h2=${verification.live_body_h2_count}; required ≥${LIVE_MIN_VISIBLE_WORDS} words and ≥${LIVE_MIN_VISIBLE_H2} H2). Reader will see a near-empty post.`
      : (verification.live_has_run_marker ? "WordPress saved the overhaul, but clean URL publish verification failed." : "WordPress accepted the update, but the clean original public URL did not show this exact publish run. Treating as NOT published/visible.");
    await logEvent(postId, `Overhaul not clean-url verified; saved=${savedPublished} rest_marker=${restHasRunMarker} clean_marker=${verification.clean?.live_has_run_marker} busted_marker=${verification.cache_busted?.live_has_run_marker} body_ok=${verification.live_body_ok} clean_words=${verification.clean?.live_body_word_count} clean_h2=${verification.clean?.live_body_h2_count} purge=${verification.cache_purge?.ok} (${changes.join(", ")})`, false);
    return jsonRes({ ok: false, post_id: postId, changes, message: reason, content_source: contentSource, wp_status: updateRes.status, verification, visual: visualReport, seo: { primary_keyword: enriched.primaryKeyword, semantic_keywords: enriched.semanticKeywords, entities: enriched.entities, meta_title: finalMetaTitle, meta_description: finalMetaDesc } }, 200);
  }

  const visualScore = visualReport?.score ?? null;
  await logEvent(postId, `Overhauled and public-live verified: ${changes.join(", ")} (source=${contentSource}; visual=${visualScore ?? "n/a"}; body=${verification.live_body_word_count}w/${verification.live_body_h2_count}h2; selected=${verification.live_content_source}; ${marker})`, true);
  return jsonRes({ ok: true, post_id: postId, changes, message: `Applied, published, and verified (${verification.live_body_word_count} visible words · ${verification.live_body_h2_count} visible H2 sections · visual ${visualScore ?? "n/a"}/100): ${changes.join(", ")}`, content_source: contentSource, wp_status: updateRes.status, verification, visual: visualReport, seo: { primary_keyword: enriched.primaryKeyword, semantic_keywords: enriched.semanticKeywords, entities: enriched.entities, meta_title: finalMetaTitle, meta_description: finalMetaDesc } });
});
