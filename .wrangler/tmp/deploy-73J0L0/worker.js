var __defProp = Object.defineProperty;
var __name = (target, value) => __defProp(target, "name", { value, configurable: true });

// worker.js
var APEX_HOST = "gearuptofit.com";
var ORIGIN_HOST = "origin.gearuptofit.com";
var ORIGIN_BASE = `https://${ORIGIN_HOST}`;
var SITEMAP_TTL = 3600;
var MAX_REST_PAGES = 50;
var AUTHORITATIVE_POST_SITEMAPS = ["/post-sitemap.xml", "/post-sitemap2.xml"];
var PROXIED_APPS = [
  {
    prefix: "/fitness-plan",
    upstreamHost: "body-recomp-os-guru.lovable.app",
    title: "8-Week Training Plan | Gear Up To Fit",
    description: "Build your custom 8-week running and fitness plan. Science-backed programming personalized to your goals, pace, and experience.",
    framework: "react-router"
  },
  {
    prefix: "/watch-match",
    upstreamHost: "wrist-wonderland-hub.lovable.app",
    title: "Watch Match \u2014 Find Your Perfect Sports Watch | Gear Up To Fit",
    description: "Match the right GPS / sports watch to your training. Honest, data-driven recommendations from Gear Up To Fit.",
    framework: "tanstack-start"
  }
];
var LOVABLE_ROUTES = [
  "/",
  "/fitness/",
  "/running/",
  "/nutrition/",
  "/health/",
  "/weight-loss/",
  "/review/",
  "/shoe-match/",
  "/blog/",
  "/about/",
  "/contact/",
  "/fitness-plan/",
  "/watch-match/"
];
function xmlResponse(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      "content-type": "application/xml; charset=utf-8",
      "cache-control": `public, max-age=${SITEMAP_TTL}`,
      ...init.headers || {}
    }
  });
}
__name(xmlResponse, "xmlResponse");
function escapeXml(v = "") {
  return String(v).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
}
__name(escapeXml, "escapeXml");
function normalizeApexUrl(value) {
  if (!value) return "";
  let url = String(value).replaceAll(`https://${ORIGIN_HOST}`, `https://${APEX_HOST}`);
  url = url.replaceAll(`http://${ORIGIN_HOST}`, `https://${APEX_HOST}`);
  url = url.replace(/^http:\/\/gearuptofit\.com/i, `https://${APEX_HOST}`);
  return url;
}
__name(normalizeApexUrl, "normalizeApexUrl");
function lastmodFrom(item) {
  const raw = item.modified_gmt || item.modified || item.date_gmt || item.date;
  if (!raw) return "";
  const iso = /(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : `${raw.replace("+00:00", "")}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString();
}
__name(lastmodFrom, "lastmodFrom");
async function fetchOriginXml(pathname) {
  const res = await fetch(`${ORIGIN_BASE}${pathname}`, {
    headers: { accept: "application/xml,text/xml", "user-agent": "GearUpToFit sitemap worker" },
    cf: { cacheTtl: SITEMAP_TTL, cacheEverything: true }
  });
  if (!res.ok) throw new Error(`Origin sitemap ${pathname} failed: ${res.status}`);
  return res.text();
}
__name(fetchOriginXml, "fetchOriginXml");
function parseUrlsetXml(xml) {
  const entries = [];
  const blocks = xml.match(/<url[\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const loc = normalizeApexUrl((block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i) || [])[1] || "");
    if (!loc || !loc.startsWith(`https://${APEX_HOST}/`)) continue;
    const lastmod = (block.match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i) || [])[1] || "";
    entries.push({ loc, lastmod });
  }
  return entries;
}
__name(parseUrlsetXml, "parseUrlsetXml");
async function fetchAuthoritativePostSitemapItems() {
  const seen = /* @__PURE__ */ new Set(), items = [];
  for (const path of AUTHORITATIVE_POST_SITEMAPS) {
    const xml = await fetchOriginXml(path);
    for (const item of parseUrlsetXml(xml)) {
      if (seen.has(item.loc)) continue;
      seen.add(item.loc);
      items.push(item);
    }
  }
  return items;
}
__name(fetchAuthoritativePostSitemapItems, "fetchAuthoritativePostSitemapItems");
async function fetchAllFromRest(type) {
  const all = [];
  for (let page = 1; page <= MAX_REST_PAGES; page += 1) {
    const endpoint = `${ORIGIN_BASE}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=link,modified_gmt,modified,date_gmt,date`;
    const res = await fetch(endpoint, {
      headers: { accept: "application/json", "user-agent": "GearUpToFit sitemap worker" },
      cf: { cacheTtl: SITEMAP_TTL, cacheEverything: true }
    });
    if (res.status === 400 && page > 1) break;
    if (!res.ok) throw new Error(`REST ${type} failed: ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    const totalPages = Number(res.headers.get("x-wp-totalpages") || 0);
    if (totalPages && page >= totalPages) break;
    if (items.length < 100) break;
  }
  return all;
}
__name(fetchAllFromRest, "fetchAllFromRest");
function buildUrlset(items) {
  const urls = items.map((item) => {
    const loc = normalizeApexUrl(item.link || item.loc);
    if (!loc || !loc.startsWith(`https://${APEX_HOST}/`)) return "";
    const lastmod = lastmodFrom(item);
    return [
      "  <url>",
      `    <loc>${escapeXml(loc)}</loc>`,
      lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : "",
      "  </url>"
    ].filter(Boolean).join("\n");
  }).filter(Boolean).join("\n");
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls}
</urlset>`;
}
__name(buildUrlset, "buildUrlset");
function buildSitemapIndex() {
  return `<?xml version="1.0" encoding="UTF-8"?>
<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <sitemap><loc>https://${APEX_HOST}/post-sitemap.xml</loc></sitemap>
  <sitemap><loc>https://${APEX_HOST}/post-sitemap2.xml</loc></sitemap>
  <sitemap><loc>https://${APEX_HOST}/sitemap-pages.xml</loc></sitemap>
  <sitemap><loc>https://${APEX_HOST}/sitemap-lovable.xml</loc></sitemap>
</sitemapindex>`;
}
__name(buildSitemapIndex, "buildSitemapIndex");
function buildLovableSitemap() {
  return buildUrlset(LOVABLE_ROUTES.map((p) => ({ loc: `https://${APEX_HOST}${p}` })));
}
__name(buildLovableSitemap, "buildLovableSitemap");
async function handleSitemap(pathname) {
  if (pathname === "/sitemap.xml" || pathname === "/sitemap_index.xml") {
    return xmlResponse(buildSitemapIndex(), { headers: { "x-sitemap-source": "worker-index" } });
  }
  if (pathname === "/sitemap-posts.xml") {
    const posts = await fetchAuthoritativePostSitemapItems();
    return xmlResponse(buildUrlset(posts), { headers: { "x-sitemap-source": "wp-authoritative-post-sitemaps", "x-url-count": String(posts.length) } });
  }
  if (pathname === "/sitemap-pages.xml") {
    const pages = await fetchAllFromRest("pages");
    return xmlResponse(buildUrlset(pages), { headers: { "x-sitemap-source": "wp-rest-pages", "x-url-count": String(pages.length) } });
  }
  if (pathname === "/sitemap-lovable.xml") {
    return xmlResponse(buildLovableSitemap(), { headers: { "x-sitemap-source": "lovable-routes", "x-url-count": String(LOVABLE_ROUTES.length) } });
  }
  return null;
}
__name(handleSitemap, "handleSitemap");
function matchProxiedApp(pathname) {
  for (const app of PROXIED_APPS) {
    if (pathname === app.prefix || pathname === `${app.prefix}/` || pathname.startsWith(`${app.prefix}/`)) return app;
  }
  return null;
}
__name(matchProxiedApp, "matchProxiedApp");
function addPrefix(value, prefix) {
  if (!value || typeof value !== "string") return value;
  if (!value.startsWith("/") || value.startsWith("//")) return value;
  if (value === prefix || value.startsWith(`${prefix}/`)) return value;
  return `${prefix}${value}`;
}
__name(addPrefix, "addPrefix");
var ASSET_ROOT_RE = /(["'`(=,\s])(\/(?:assets|static|images|img|fonts|icons|locales|public|build|chunks)\/)/g;
function rewriteAssetStringsInText(text, prefix) {
  if (!text) return text;
  return text.replace(ASSET_ROOT_RE, (m, lead, path) => {
    if (path.startsWith(`${prefix}/`)) return m;
    return `${lead}${prefix}${path}`;
  });
}
__name(rewriteAssetStringsInText, "rewriteAssetStringsInText");
function patchReactRouterPathname(text, prefix) {
  return text.replace(
    /let\{pathname:([a-zA-Z_$]),search:([a-zA-Z_$]),hash:([a-zA-Z_$])\}=([a-zA-Z_$]+)\.location;/g,
    (_m, p, s, h, n) => `let{pathname:${p},search:${s},hash:${h}}=${n}.location;${p}=(${p}.indexOf(${JSON.stringify(prefix + "/")})===0?${p}.slice(${prefix.length})||"/":${p}===${JSON.stringify(prefix)}?"/":${p});`
  );
}
__name(patchReactRouterPathname, "patchReactRouterPathname");
var AttrPrefixer = class {
  static {
    __name(this, "AttrPrefixer");
  }
  constructor(attr, prefix) {
    this.attr = attr;
    this.prefix = prefix;
  }
  element(el) {
    const v = el.getAttribute(this.attr);
    if (!v) return;
    const next = addPrefix(v, this.prefix);
    if (next !== v) el.setAttribute(this.attr, next);
  }
};
var SrcsetPrefixer = class {
  static {
    __name(this, "SrcsetPrefixer");
  }
  constructor(prefix) {
    this.prefix = prefix;
  }
  element(el) {
    const v = el.getAttribute("srcset");
    if (!v) return;
    const out = v.split(",").map((part) => {
      const seg = part.trim().split(/\s+/);
      seg[0] = addPrefix(seg[0], this.prefix);
      return seg.join(" ");
    }).join(", ");
    if (out !== v) el.setAttribute("srcset", out);
  }
};
var HeadInjector = class {
  static {
    __name(this, "HeadInjector");
  }
  constructor(html) {
    this.html = html;
    this.injected = false;
  }
  element(el) {
    if (this.injected) return;
    el.prepend(this.html, { html: true });
    this.injected = true;
  }
};
async function fetchUpstream(request, app, upstreamUrl) {
  const upstreamHeaders = new Headers();
  for (const h of ["accept", "user-agent", "accept-language", "range", "if-none-match", "if-modified-since"]) {
    const v = request.headers.get(h);
    if (v) upstreamHeaders.set(h, v);
  }
  upstreamHeaders.set("x-forwarded-host", APEX_HOST);
  upstreamHeaders.set("x-forwarded-proto", "https");
  return fetch(upstreamUrl, {
    method: request.method,
    headers: upstreamHeaders,
    redirect: "manual",
    cf: { cacheTtl: 60, cacheEverything: false }
  });
}
__name(fetchUpstream, "fetchUpstream");
async function proxyApp(request, app) {
  const url = new URL(request.url);
  let upstreamPath = url.pathname.slice(app.prefix.length) || "/";
  if (!upstreamPath.startsWith("/")) upstreamPath = `/${upstreamPath}`;
  const upstreamUrl = `https://${app.upstreamHost}${upstreamPath}${url.search}`;
  let upstreamRes;
  try {
    upstreamRes = await fetchUpstream(request, app, upstreamUrl);
  } catch (err) {
    return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
  }
  if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
    const loc = upstreamRes.headers.get("location") || "";
    let newLoc = loc;
    try {
      if (loc.startsWith(`https://${app.upstreamHost}`)) {
        const parsed = new URL(loc);
        newLoc = `https://${APEX_HOST}${app.prefix}${parsed.pathname}${parsed.search}`;
      } else if (loc.startsWith("/")) {
        newLoc = addPrefix(loc, app.prefix);
      }
    } catch {
    }
    return new Response(null, {
      status: upstreamRes.status,
      headers: { location: newLoc, "x-proxied-from": app.upstreamHost }
    });
  }
  const contentType = upstreamRes.headers.get("content-type") || "";
  const resHeaders = new Headers();
  resHeaders.set("content-type", contentType || "application/octet-stream");
  resHeaders.set("x-proxied-from", app.upstreamHost);
  if (upstreamPath.startsWith("/assets/") || /\.(js|mjs|css|woff2?|png|jpe?g|svg|webp|ico|gif|map|json|txt)$/i.test(upstreamPath)) {
    resHeaders.set("cache-control", "public, max-age=86400, s-maxage=86400");
  } else {
    resHeaders.set("cache-control", "public, max-age=120, s-maxage=120");
  }
  const isJs = /\b(?:javascript|ecmascript|json)\b/i.test(contentType) || /\.(?:js|mjs|json)$/i.test(upstreamPath);
  if (isJs) {
    let text = await upstreamRes.text();
    text = rewriteAssetStringsInText(text, app.prefix);
    if (app.framework === "react-router") text = patchReactRouterPathname(text, app.prefix);
    return new Response(text, { status: upstreamRes.status, headers: resHeaders });
  }
  if (!contentType.includes("text/html")) {
    return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
  }
  const canonicalUrl = `https://${APEX_HOST}${app.prefix}/`;
  const headInjection = `<link rel="canonical" href="${canonicalUrl}" data-apex-injected="1"><meta property="og:url" content="${canonicalUrl}" data-apex-injected="1"><meta name="robots" content="index,follow,max-image-preview:large" data-apex-injected="1">`;
  const rewriter = new HTMLRewriter().on("a[href]", new AttrPrefixer("href", app.prefix)).on("link[href]", new AttrPrefixer("href", app.prefix)).on("script[src]", new AttrPrefixer("src", app.prefix)).on("img[src]", new AttrPrefixer("src", app.prefix)).on("img[srcset]", new SrcsetPrefixer(app.prefix)).on("source[src]", new AttrPrefixer("src", app.prefix)).on("source[srcset]", new SrcsetPrefixer(app.prefix)).on("form[action]", new AttrPrefixer("action", app.prefix)).on("use[href]", new AttrPrefixer("href", app.prefix)).on("head", new HeadInjector(headInjection));
  const transformed = rewriter.transform(
    new Response(upstreamRes.body, { status: upstreamRes.status, headers: { "content-type": "text/html; charset=utf-8" } })
  );
  let html = await transformed.text();
  html = html.replace(/<script(\b[^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (/\bsrc=/.test(attrs)) return m;
    return `<script${attrs}>${rewriteAssetStringsInText(body, app.prefix)}<\/script>`;
  });
  return new Response(html, { status: upstreamRes.status, headers: resHeaders });
}
__name(proxyApp, "proxyApp");
var worker_default = {
  async fetch(request) {
    const url = new URL(request.url);
    const sitemap = await handleSitemap(url.pathname);
    if (sitemap) return sitemap;
    for (const app2 of PROXIED_APPS) {
      if (url.pathname === app2.prefix) {
        return Response.redirect(`https://${APEX_HOST}${app2.prefix}/${url.search}`, 301);
      }
    }
    const app = matchProxiedApp(url.pathname);
    if (app) return proxyApp(request, app);
    return fetch(request);
  }
};
export {
  worker_default as default
};
//# sourceMappingURL=worker.js.map
