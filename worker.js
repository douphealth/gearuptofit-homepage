const APEX_HOST = 'gearuptofit.com';
const ORIGIN_HOST = 'origin.gearuptofit.com';
const ORIGIN_BASE = `https://${ORIGIN_HOST}`;
const APEX_APP_HOST = 'gearup-flow-master.lovable.app';
const SITEMAP_TTL = 3600;
const MAX_REST_PAGES = 50;
const AUTHORITATIVE_POST_SITEMAPS = ['/post-sitemap.xml', '/post-sitemap2.xml'];

// Reverse-proxied Lovable apps mounted under apex paths.
// Both upstream apps were built with Vite base "/" and have no router basename,
// so the worker must transparently rewrite all `/assets/...` references and
// (for React Router) strip the apex prefix from the initial location read.
const PROXIED_APPS = [
  {
    prefix: '/fitness-plan',
    upstreamHost: 'body-recomp-os-guru.lovable.app',
    title: '8-Week Training Plan | Gear Up To Fit',
    description: 'Build your custom 8-week running and fitness plan. Science-backed programming personalized to your goals, pace, and experience.',
    framework: 'react-router',
  },
  {
    prefix: '/watch-match',
    upstreamHost: 'wrist-wonderland-hub.lovable.app',
    title: 'Watch Match — Find Your Perfect Sports Watch | Gear Up To Fit',
    description: 'Match the right GPS / sports watch to your training. Honest, data-driven recommendations from Gear Up To Fit.',
    framework: 'tanstack-start',
  },
  {
    prefix: '/shoe-finder',
    upstreamHost: 'runmatch-ai-buddy.lovable.app',
    title: 'Shoe Finder — Match Your Perfect Running Shoe | Gear Up To Fit',
    description: 'Find the right running shoe for your gait, mileage, and terrain. Honest, data-driven matches from Gear Up To Fit.',
    framework: 'react-router',
  },
];

// Only routes that actually return 200 from the apex (verified). Routes that
// 301 to WordPress (e.g. /fitness/, /running/, /nutrition/, /health/, /review/,
// /weight-loss/, /about/, /contact/) MUST NOT be advertised in the sitemap —
// submitting redirects kills crawl budget and dilutes topical authority.
const LOVABLE_ROUTES = [
  '/',
  '/shoe-match/',
  '/shoe-finder/',
  '/blog/',
  '/calculators/',
  '/fitness-plan/',
  '/watch-match/',
];

// ---------- sitemap helpers (unchanged) ----------

function xmlResponse(body, init = {}) {
  return new Response(body, {
    ...init,
    headers: {
      'content-type': 'application/xml; charset=utf-8',
      'cache-control': `public, max-age=${SITEMAP_TTL}`,
      ...(init.headers || {}),
    },
  });
}
function escapeXml(v = '') {
  return String(v).replaceAll('&', '&amp;').replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;').replaceAll('"', '&quot;').replaceAll("'", '&apos;');
}
function normalizeApexUrl(value) {
  if (!value) return '';
  let url = String(value).replaceAll(`https://${ORIGIN_HOST}`, `https://${APEX_HOST}`);
  url = url.replaceAll(`http://${ORIGIN_HOST}`, `https://${APEX_HOST}`);
  url = url.replace(/^http:\/\/gearuptofit\.com/i, `https://${APEX_HOST}`);
  return url;
}
function lastmodFrom(item) {
  const raw = item.modified_gmt || item.modified || item.date_gmt || item.date;
  if (!raw) return '';
  const iso = /(?:Z|[+-]\d\d:\d\d)$/.test(raw) ? raw : `${raw.replace('+00:00', '')}Z`;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? '' : d.toISOString();
}
async function fetchOriginXml(pathname) {
  const res = await fetch(`${ORIGIN_BASE}${pathname}`, {
    headers: { accept: 'application/xml,text/xml', 'user-agent': 'GearUpToFit sitemap worker' },
    cf: { cacheTtl: SITEMAP_TTL, cacheEverything: true },
  });
  if (!res.ok) throw new Error(`Origin sitemap ${pathname} failed: ${res.status}`);
  return res.text();
}
function parseUrlsetXml(xml) {
  const entries = [];
  const blocks = xml.match(/<url[\s\S]*?<\/url>/gi) || [];
  for (const block of blocks) {
    const loc = normalizeApexUrl((block.match(/<loc>\s*([\s\S]*?)\s*<\/loc>/i) || [])[1] || '');
    if (!loc || !loc.startsWith(`https://${APEX_HOST}/`)) continue;
    const lastmod = (block.match(/<lastmod>\s*([\s\S]*?)\s*<\/lastmod>/i) || [])[1] || '';
    entries.push({ loc, lastmod });
  }
  return entries;
}
async function fetchAuthoritativePostSitemapItems() {
  const seen = new Set(), items = [];
  for (const path of AUTHORITATIVE_POST_SITEMAPS) {
    const xml = await fetchOriginXml(path);
    for (const item of parseUrlsetXml(xml)) {
      if (seen.has(item.loc)) continue;
      seen.add(item.loc); items.push(item);
    }
  }
  return items;
}
async function fetchAllFromRest(type) {
  const all = [];
  for (let page = 1; page <= MAX_REST_PAGES; page += 1) {
    const endpoint = `${ORIGIN_BASE}/wp-json/wp/v2/${type}?per_page=100&page=${page}&status=publish&_fields=link,modified_gmt,modified,date_gmt,date`;
    const res = await fetch(endpoint, {
      headers: { accept: 'application/json', 'user-agent': 'GearUpToFit sitemap worker' },
      cf: { cacheTtl: SITEMAP_TTL, cacheEverything: true },
    });
    if (res.status === 400 && page > 1) break;
    if (!res.ok) throw new Error(`REST ${type} failed: ${res.status}`);
    const items = await res.json();
    if (!Array.isArray(items) || items.length === 0) break;
    all.push(...items);
    const totalPages = Number(res.headers.get('x-wp-totalpages') || 0);
    if (totalPages && page >= totalPages) break;
    if (items.length < 100) break;
  }
  return all;
}
function buildUrlset(items) {
  const urls = items.map((item) => {
    const loc = normalizeApexUrl(item.link || item.loc);
    if (!loc || !loc.startsWith(`https://${APEX_HOST}/`)) return '';
    const lastmod = lastmodFrom(item);
    return ['  <url>', `    <loc>${escapeXml(loc)}</loc>`,
      lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : '', '  </url>']
      .filter(Boolean).join('\n');
  }).filter(Boolean).join('\n');
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}
function buildSitemapIndex() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>https://${APEX_HOST}/post-sitemap.xml</loc></sitemap>\n  <sitemap><loc>https://${APEX_HOST}/post-sitemap2.xml</loc></sitemap>\n  <sitemap><loc>https://${APEX_HOST}/sitemap-pages.xml</loc></sitemap>\n  <sitemap><loc>https://${APEX_HOST}/sitemap-lovable.xml</loc></sitemap>\n</sitemapindex>`;
}
function buildLovableSitemap() {
  return buildUrlset(LOVABLE_ROUTES.map((p) => ({ loc: `https://${APEX_HOST}${p}` })));
}
async function handleSitemap(pathname) {
  if (pathname === '/sitemap.xml' || pathname === '/sitemap_index.xml') {
    return xmlResponse(buildSitemapIndex(), { headers: { 'x-sitemap-source': 'worker-index' } });
  }
  if (pathname === '/sitemap-posts.xml') {
    const posts = await fetchAuthoritativePostSitemapItems();
    return xmlResponse(buildUrlset(posts), { headers: { 'x-sitemap-source': 'wp-authoritative-post-sitemaps', 'x-url-count': String(posts.length) } });
  }
  if (pathname === '/sitemap-pages.xml') {
    const pages = await fetchAllFromRest('pages');
    return xmlResponse(buildUrlset(pages), { headers: { 'x-sitemap-source': 'wp-rest-pages', 'x-url-count': String(pages.length) } });
  }
  if (pathname === '/sitemap-lovable.xml') {
    return xmlResponse(buildLovableSitemap(), { headers: { 'x-sitemap-source': 'lovable-routes', 'x-url-count': String(LOVABLE_ROUTES.length) } });
  }
  return null;
}

// ---------- reverse proxy ----------

function matchProxiedApp(pathname) {
  for (const app of PROXIED_APPS) {
    if (pathname === app.prefix || pathname === `${app.prefix}/` || pathname.startsWith(`${app.prefix}/`)) return app;
  }
  return null;
}

// Add prefix to a root-relative path; idempotent (won't double-prefix).
function addPrefix(value, prefix) {
  if (!value || typeof value !== 'string') return value;
  if (!value.startsWith('/') || value.startsWith('//')) return value;
  if (value === prefix || value.startsWith(`${prefix}/`)) return value;
  return `${prefix}${value}`;
}

// Rewrite every "/assets/..." (and other known root-absolute asset roots) inside
// arbitrary text (inline JS, JSON manifests, JS bundles). Idempotent.
const ASSET_ROOT_RE = /(["'`(=,\s])(\/(?:assets|static|images|img|fonts|icons|locales|public|build|chunks)\/)/g;
function rewriteAssetStringsInText(text, prefix) {
  if (!text) return text;
  return text.replace(ASSET_ROOT_RE, (m, lead, path) => {
    if (path.startsWith(`${prefix}/`)) return m;
    return `${lead}${prefix}${path}`;
  });
}

// React Router 6 surgical patch — strip the apex prefix from the initial
// location read inside createBrowserHistory(), so <Routes> matches `/`.
function patchReactRouterPathname(text, prefix) {
  // Minified pattern: `let{pathname:o,search:a,hash:s}=n.location;`
  return text.replace(
    /let\{pathname:([a-zA-Z_$]),search:([a-zA-Z_$]),hash:([a-zA-Z_$])\}=([a-zA-Z_$]+)\.location;/g,
    (_m, p, s, h, n) =>
      `let{pathname:${p},search:${s},hash:${h}}=${n}.location;` +
      `${p}=(${p}.indexOf(${JSON.stringify(prefix + '/')})===0?${p}.slice(${prefix.length})||"/":${p}===${JSON.stringify(prefix)}?"/":${p});`,
  );
}

// TanStack Start surgical patch — the bundler emits `basepath:""` in the
// router init call (D2()). We rewrite that single literal to the apex
// prefix so TSR's parsePathname strips it and matches the `/` route.
function patchTanstackBasepath(text, prefix) {
  return text.replace(/basepath:""/g, `basepath:${JSON.stringify(prefix)}`);
}

class AttrPrefixer {
  constructor(attr, prefix) { this.attr = attr; this.prefix = prefix; }
  element(el) {
    const v = el.getAttribute(this.attr);
    if (!v) return;
    const next = addPrefix(v, this.prefix);
    if (next !== v) el.setAttribute(this.attr, next);
  }
}

class SrcsetPrefixer {
  constructor(prefix) { this.prefix = prefix; }
  element(el) {
    const v = el.getAttribute('srcset');
    if (!v) return;
    const out = v.split(',').map((part) => {
      const seg = part.trim().split(/\s+/);
      seg[0] = addPrefix(seg[0], this.prefix);
      return seg.join(' ');
    }).join(', ');
    if (out !== v) el.setAttribute('srcset', out);
  }
}

// Buffer text inside specific elements (script/style) and rewrite asset paths.
class TextContentRewriter {
  constructor(prefix) { this.prefix = prefix; this.buffer = ''; }
  element(el) {
    this.buffer = '';
    el.onEndTag(() => { /* handled per-text below */ });
  }
  text(t) {
    this.buffer += t.text;
    if (t.lastInTextNode) {
      const out = rewriteAssetStringsInText(this.buffer, this.prefix);
      t.replace(out, { html: false });
      this.buffer = '';
    } else {
      t.remove();
    }
  }
}

class HeadInjector {
  constructor(html) { this.html = html; this.injected = false; }
  element(el) {
    if (this.injected) return;
    el.prepend(this.html, { html: true });
    this.injected = true;
  }
}

async function fetchUpstream(_request, _app, upstreamUrl) {
  return fetch(upstreamUrl, {
    method: 'GET',
    headers: {
      accept: '*/*',
      'user-agent': 'GearUpToFit-Apex-Proxy/1.0 (+https://gearuptofit.com)',
      'accept-encoding': 'gzip',
    },
    redirect: 'manual',
  });
}

async function proxyApp(request, app) {
  const url = new URL(request.url);
  let upstreamPath = url.pathname.slice(app.prefix.length) || '/';
  if (!upstreamPath.startsWith('/')) upstreamPath = `/${upstreamPath}`;
  const upstreamUrl = `https://${app.upstreamHost}${upstreamPath}${url.search}`;

  let upstreamRes;
  try {
    upstreamRes = await fetchUpstream(request, app, upstreamUrl);
  } catch (err) {
    return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
  }

  if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
    const loc = upstreamRes.headers.get('location') || '';
    let newLoc = loc;
    try {
      if (loc.startsWith(`https://${app.upstreamHost}`)) {
        const parsed = new URL(loc);
        newLoc = `https://${APEX_HOST}${app.prefix}${parsed.pathname}${parsed.search}`;
      } else if (loc.startsWith('/')) {
        newLoc = addPrefix(loc, app.prefix);
      }
    } catch { /* ignore */ }
    return new Response(null, {
      status: upstreamRes.status,
      headers: { location: newLoc, 'x-proxied-from': app.upstreamHost },
    });
  }

  const contentType = upstreamRes.headers.get('content-type') || '';
  const resHeaders = new Headers();
  resHeaders.set('content-type', contentType || 'application/octet-stream');
  resHeaders.set('x-proxied-from', app.upstreamHost);
  if (upstreamPath.startsWith('/assets/') || /\.(js|mjs|css|woff2?|png|jpe?g|svg|webp|ico|gif|map|json|txt)$/i.test(upstreamPath)) {
    resHeaders.set('cache-control', 'public, max-age=86400, s-maxage=86400');
  } else {
    resHeaders.set('cache-control', 'public, max-age=120, s-maxage=120');
  }

  // ---- JS / JSON: text rewrite for asset paths and (React Router) pathname patch.
  const isJs = /\b(?:javascript|ecmascript|json)\b/i.test(contentType) ||
    /\.(?:js|mjs|json)$/i.test(upstreamPath);
  if (isJs) {
    let text = await upstreamRes.text();
    const upstreamStatus = upstreamRes.status;
    const upstreamCT = upstreamRes.headers.get('content-type') || '';
    const beforeLen = text.length;
    const before = (text.match(/\/assets\//g) || []).length;
    text = rewriteAssetStringsInText(text, app.prefix);
    const after = (text.match(new RegExp(`${app.prefix.replace(/[/]/g, '\\/')}/assets/`, 'g')) || []).length;
    let routerPatched = 0;
    if (app.framework === 'react-router') {
      const t2 = patchReactRouterPathname(text, app.prefix);
      routerPatched = t2 === text ? 0 : 1;
      text = t2;
    } else if (app.framework === 'tanstack-start') {
      const t2 = patchTanstackBasepath(text, app.prefix);
      routerPatched = t2 === text ? 0 : 1;
      text = t2;
    }
    resHeaders.set('x-rewrite', `s=${upstreamStatus};ct=${upstreamCT.slice(0,20)};len=${beforeLen};before=${before};after=${after};router=${routerPatched}`);
    return new Response(text, { status: upstreamRes.status, headers: resHeaders });
  }

  // ---- Non-HTML, non-JS → stream through unchanged.
  if (!contentType.includes('text/html')) {
    return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
  }

  // ---- HTML → buffer, run HTMLRewriter, then text-rewrite inline scripts.
  const canonicalUrl = `https://${APEX_HOST}${app.prefix}/`;
  const headInjection =
    `<link rel="canonical" href="${canonicalUrl}" data-apex-injected="1">` +
    `<meta property="og:url" content="${canonicalUrl}" data-apex-injected="1">` +
    `<meta name="robots" content="index,follow,max-image-preview:large" data-apex-injected="1">`;

  const rewriter = new HTMLRewriter()
    .on('a[href]', new AttrPrefixer('href', app.prefix))
    .on('link[href]', new AttrPrefixer('href', app.prefix))
    .on('script[src]', new AttrPrefixer('src', app.prefix))
    .on('img[src]', new AttrPrefixer('src', app.prefix))
    .on('img[srcset]', new SrcsetPrefixer(app.prefix))
    .on('source[src]', new AttrPrefixer('src', app.prefix))
    .on('source[srcset]', new SrcsetPrefixer(app.prefix))
    .on('form[action]', new AttrPrefixer('action', app.prefix))
    .on('use[href]', new AttrPrefixer('href', app.prefix))
    .on('head', new HeadInjector(headInjection));

  const transformed = rewriter.transform(
    new Response(upstreamRes.body, { status: upstreamRes.status, headers: { 'content-type': 'text/html; charset=utf-8' } }),
  );

  // Final pass: rewrite asset strings inside inline <script>/<style>/JSON blocks.
  let html = await transformed.text();
  html = html.replace(/<script(\b[^>]*)>([\s\S]*?)<\/script>/gi, (m, attrs, body) => {
    if (/\bsrc=/.test(attrs)) return m;
    return `<script${attrs}>${rewriteAssetStringsInText(body, app.prefix)}</script>`;
  });

  return new Response(html, { status: upstreamRes.status, headers: resHeaders });
}

// ---------- Entrypoint ----------

// Map a `/assets/...` request that lost its apex prefix back to the right
// proxied app, based on the Referer header. This rescues runtime dynamic
// imports whose path strings are constructed by framework code we can't
// safely rewrite (e.g. TSR's basepath-stripping in route preloads).
function recoverAssetByReferer(url, request) {
  if (!url.pathname.startsWith('/assets/')) return null;
  const ref = request.headers.get('referer') || '';
  for (const app of PROXIED_APPS) {
    if (ref.includes(`${APEX_HOST}${app.prefix}`)) return app;
  }
  return null;
}

async function proxyApexApp(request) {
  const url = new URL(request.url);
  const upstreamUrl = `https://${APEX_APP_HOST}${url.pathname}${url.search}`;
  const upstreamRes = await fetch(upstreamUrl, {
    headers: {
      accept: request.headers.get('accept') || '*/*',
      'user-agent': request.headers.get('user-agent') || 'GearUpToFit-Apex-App/1.0',
    },
    redirect: 'manual',
  });

  if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
    const loc = upstreamRes.headers.get('location') || '';
    let nextLoc = loc;
    if (loc.startsWith(`https://${APEX_APP_HOST}`)) {
      const parsed = new URL(loc);
      nextLoc = `https://${APEX_HOST}${parsed.pathname}${parsed.search}`;
    }
    return new Response(null, { status: upstreamRes.status, headers: { location: nextLoc } });
  }

  const headers = new Headers(upstreamRes.headers);
  headers.set('x-apex-source', APEX_APP_HOST);
  if (headers.get('content-type')?.includes('text/html')) {
    headers.set('cache-control', 'public, max-age=60, must-revalidate');
    headers.set('cdn-cache-control', 'public, max-age=60, stale-while-revalidate=300');
    headers.set('cloudflare-cdn-cache-control', 'public, max-age=60, stale-while-revalidate=300');
    headers.set('surrogate-control', 'max-age=60');
    headers.delete('age');
    headers.delete('expires');
    headers.set('x-apex-cache', 'short-html-v3');
  }
  return new Response(upstreamRes.body, { status: upstreamRes.status, statusText: upstreamRes.statusText, headers });
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    const sitemap = await handleSitemap(url.pathname);
    if (sitemap) return sitemap;

    for (const app of PROXIED_APPS) {
      if (url.pathname === app.prefix) {
        return Response.redirect(`https://${APEX_HOST}${app.prefix}/${url.search}`, 301);
      }
    }

    const app = matchProxiedApp(url.pathname);
    if (app) return proxyApp(request, app);

    const refererApp = recoverAssetByReferer(url, request);
    if (refererApp) return proxyApp(request, refererApp);

    // Lovable badge analytics endpoint does not exist on the apex domain; make
    // it a clean no-op so production consoles stay error-free.
    if (url.pathname === '/~api/analytics') {
      return new Response(null, { status: 204, headers: { 'cache-control': 'no-store' } });
    }

    if (url.pathname === '/api/sub-app-status') {
      return handleSubAppStatus();
    }

    return proxyApexApp(request);
  },
};
