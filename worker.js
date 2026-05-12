const APEX_HOST = 'gearuptofit.com';
const ORIGIN_HOST = 'origin.gearuptofit.com';
const ORIGIN_BASE = `https://${ORIGIN_HOST}`;
const SITEMAP_TTL = 3600;
const MAX_REST_PAGES = 50;
const AUTHORITATIVE_POST_SITEMAPS = ['/post-sitemap.xml', '/post-sitemap2.xml'];

// Reverse-proxied Lovable apps mounted under apex paths.
// SEO note: served from gearuptofit.com (200 OK, same origin) — full link juice retained.
const PROXIED_APPS = [
  {
    prefix: '/fitness-plan',
    upstreamHost: 'body-recomp-os-guru.lovable.app',
    title: '8-Week Training Plan | Gear Up To Fit',
    description: 'Build your custom 8-week running and fitness plan. Science-backed programming personalized to your goals, pace, and experience.',
  },
  {
    prefix: '/watch-match',
    upstreamHost: 'wrist-wonderland-hub.lovable.app',
    title: 'Watch Match — Find Your Perfect Sports Watch | Gear Up To Fit',
    description: 'Match the right GPS / sports watch to your training. Honest, data-driven recommendations from Gear Up To Fit.',
  },
];

const LOVABLE_ROUTES = [
  '/',
  '/fitness/',
  '/running/',
  '/nutrition/',
  '/health/',
  '/weight-loss/',
  '/review/',
  '/shoe-match/',
  '/blog/',
  '/about/',
  '/contact/',
  '/fitness-plan/',
  '/watch-match/',
];

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

function escapeXml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
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
  const seen = new Set();
  const items = [];
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
  const urls = items
    .map((item) => {
      const loc = normalizeApexUrl(item.link || item.loc);
      if (!loc || !loc.startsWith(`https://${APEX_HOST}/`)) return '';
      const lastmod = lastmodFrom(item);
      return [
        '  <url>',
        `    <loc>${escapeXml(loc)}</loc>`,
        lastmod ? `    <lastmod>${escapeXml(lastmod)}</lastmod>` : '',
        '  </url>',
      ].filter(Boolean).join('\n');
    })
    .filter(Boolean)
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls}\n</urlset>`;
}

function buildSitemapIndex() {
  return `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n  <sitemap><loc>https://${APEX_HOST}/post-sitemap.xml</loc></sitemap>\n  <sitemap><loc>https://${APEX_HOST}/post-sitemap2.xml</loc></sitemap>\n  <sitemap><loc>https://${APEX_HOST}/sitemap-pages.xml</loc></sitemap>\n  <sitemap><loc>https://${APEX_HOST}/sitemap-lovable.xml</loc></sitemap>\n</sitemapindex>`;
}

function buildLovableSitemap() {
  return buildUrlset(LOVABLE_ROUTES.map((path) => ({ loc: `https://${APEX_HOST}${path}` })));
}

async function handleSitemap(pathname) {
  if (pathname === '/sitemap.xml' || pathname === '/sitemap_index.xml') {
    return xmlResponse(buildSitemapIndex(), { headers: { 'x-sitemap-source': 'worker-index' } });
  }

  if (pathname === '/sitemap-posts.xml') {
    const posts = await fetchAuthoritativePostSitemapItems();
    return xmlResponse(buildUrlset(posts), {
      headers: { 'x-sitemap-source': 'wp-authoritative-post-sitemaps', 'x-url-count': String(posts.length) },
    });
  }

  if (pathname === '/sitemap-pages.xml') {
    const pages = await fetchAllFromRest('pages');
    return xmlResponse(buildUrlset(pages), {
      headers: { 'x-sitemap-source': 'wp-rest-pages', 'x-url-count': String(pages.length) },
    });
  }

  if (pathname === '/sitemap-lovable.xml') {
    return xmlResponse(buildLovableSitemap(), {
      headers: { 'x-sitemap-source': 'lovable-routes', 'x-url-count': String(LOVABLE_ROUTES.length) },
    });
  }

  return null;
}

// ---------- Reverse proxy for embedded Lovable apps ----------

function matchProxiedApp(pathname) {
  for (const app of PROXIED_APPS) {
    if (pathname === app.prefix || pathname === `${app.prefix}/` || pathname.startsWith(`${app.prefix}/`)) {
      return app;
    }
  }
  return null;
}

// Rewrite root-relative URLs in attributes so SPA assets resolve under the apex prefix.
class AttrPrefixer {
  constructor(attr, prefix) {
    this.attr = attr;
    this.prefix = prefix;
  }
  element(el) {
    const v = el.getAttribute(this.attr);
    if (!v) return;
    // Only rewrite root-relative URLs (start with "/" but not "//" and not data:)
    if (v.startsWith('/') && !v.startsWith('//')) {
      el.setAttribute(this.attr, `${this.prefix}${v}`);
    }
  }
}

class CanonicalRewriter {
  constructor(canonicalUrl) { this.canonicalUrl = canonicalUrl; }
  element(el) {
    const rel = (el.getAttribute('rel') || '').toLowerCase();
    if (rel === 'canonical') el.setAttribute('href', this.canonicalUrl);
  }
}

class MetaContentRewriter {
  constructor(prefix, canonicalUrl) { this.prefix = prefix; this.canonicalUrl = canonicalUrl; }
  element(el) {
    const prop = (el.getAttribute('property') || el.getAttribute('name') || '').toLowerCase();
    const content = el.getAttribute('content');
    if (!content) return;
    if (prop === 'og:url' || prop === 'twitter:url') {
      el.setAttribute('content', this.canonicalUrl);
      return;
    }
    if ((prop === 'og:image' || prop === 'twitter:image' || prop.endsWith(':image')) &&
        content.startsWith('/') && !content.startsWith('//')) {
      el.setAttribute('content', `https://${APEX_HOST}${this.prefix}${content}`);
    }
  }
}

class TitleRewriter {
  constructor(title) { this.title = title; this.replaced = false; }
  element() { /* set inner text via text handler */ }
  text(t) {
    if (this.replaced) { t.remove(); return; }
    t.replace(this.title);
    this.replaced = true;
  }
}

class HeadInjector {
  constructor(html) { this.html = html; this.injected = false; }
  element(el) {
    if (this.injected) return;
    el.append(this.html, { html: true });
    this.injected = true;
  }
}

async function proxyApp(request, app) {
  const url = new URL(request.url);
  let upstreamPath = url.pathname.slice(app.prefix.length) || '/';
  if (!upstreamPath.startsWith('/')) upstreamPath = `/${upstreamPath}`;
  const upstreamUrl = `https://${app.upstreamHost}${upstreamPath}${url.search}`;

  // Build a clean request — do NOT clone the original headers (they include
  // host/cookie/cf-* that Cloudflare forbids modifying inside Workers).
  const upstreamHeaders = new Headers();
  const accept = request.headers.get('accept');
  const ua = request.headers.get('user-agent');
  const lang = request.headers.get('accept-language');
  if (accept) upstreamHeaders.set('accept', accept);
  if (ua) upstreamHeaders.set('user-agent', ua);
  if (lang) upstreamHeaders.set('accept-language', lang);
  upstreamHeaders.set('x-forwarded-host', APEX_HOST);
  upstreamHeaders.set('x-forwarded-proto', 'https');

  let upstreamRes;
  try {
    upstreamRes = await fetch(upstreamUrl, {
      method: request.method,
      headers: upstreamHeaders,
      redirect: 'manual',
      cf: { cacheTtl: 60, cacheEverything: false },
    });
  } catch (err) {
    return new Response(`Upstream fetch failed: ${err.message}`, { status: 502 });
  }

  // Translate upstream redirects so they stay on the apex path.
  if (upstreamRes.status >= 300 && upstreamRes.status < 400) {
    const loc = upstreamRes.headers.get('location') || '';
    let newLoc = loc;
    try {
      if (loc.startsWith(`https://${app.upstreamHost}`)) {
        const parsed = new URL(loc);
        newLoc = `https://${APEX_HOST}${app.prefix}${parsed.pathname}${parsed.search}`;
      } else if (loc.startsWith('/')) {
        newLoc = `${app.prefix}${loc}`;
      }
    } catch { /* ignore */ }
    return new Response(null, {
      status: upstreamRes.status,
      headers: { location: newLoc, 'x-proxied-from': app.upstreamHost },
    });
  }

  const contentType = upstreamRes.headers.get('content-type') || '';
  // Build a fresh response headers map (avoid CF-managed headers from upstream).
  const resHeaders = new Headers();
  resHeaders.set('content-type', contentType || 'application/octet-stream');
  resHeaders.set('x-proxied-from', app.upstreamHost);
  if (upstreamPath.startsWith('/assets/') || /\.(js|mjs|css|woff2?|png|jpe?g|svg|webp|ico|gif|map|json|txt)$/i.test(upstreamPath)) {
    resHeaders.set('cache-control', 'public, max-age=86400, s-maxage=86400');
  } else {
    resHeaders.set('cache-control', 'public, max-age=120, s-maxage=120');
  }

  // Non-HTML → stream through unchanged.
  if (!contentType.includes('text/html')) {
    return new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders });
  }

  // HTML → rewrite root-relative URLs and inject SEO tags.
  const canonicalUrl = `https://${APEX_HOST}${app.prefix}/`;
  const headInjection =
    `<link rel="canonical" href="${canonicalUrl}" data-apex-injected="1">` +
    `<meta property="og:url" content="${canonicalUrl}" data-apex-injected="1">` +
    `<meta name="robots" content="index,follow,max-image-preview:large" data-apex-injected="1">`;

  const srcsetHandler = {
    element(el) {
      const v = el.getAttribute('srcset');
      if (!v) return;
      const out = v.split(',').map((part) => {
        const seg = part.trim().split(/\s+/);
        if (seg[0] && seg[0].startsWith('/') && !seg[0].startsWith('//')) {
          seg[0] = `${app.prefix}${seg[0]}`;
        }
        return seg.join(' ');
      }).join(', ');
      el.setAttribute('srcset', out);
    },
  };

  const rewriter = new HTMLRewriter()
    .on('a[href]', new AttrPrefixer('href', app.prefix))
    .on('link[href]', new AttrPrefixer('href', app.prefix))
    .on('script[src]', new AttrPrefixer('src', app.prefix))
    .on('img[src]', new AttrPrefixer('src', app.prefix))
    .on('img[srcset]', srcsetHandler)
    .on('source[src]', new AttrPrefixer('src', app.prefix))
    .on('source[srcset]', srcsetHandler)
    .on('form[action]', new AttrPrefixer('action', app.prefix))
    .on('use[href]', new AttrPrefixer('href', app.prefix))
    .on('title', new TitleRewriter(app.title))
    .on('head', new HeadInjector(headInjection));

  return rewriter.transform(
    new Response(upstreamRes.body, { status: upstreamRes.status, headers: resHeaders }),
  );
}

// ---------- Entrypoint ----------

export default {
  async fetch(request) {
    const url = new URL(request.url);

    const sitemap = await handleSitemap(url.pathname);
    if (sitemap) return sitemap;

    // Bare prefix → redirect to trailing-slash form for SEO consistency.
    for (const app of PROXIED_APPS) {
      if (url.pathname === app.prefix) {
        return Response.redirect(`https://${APEX_HOST}${app.prefix}/${url.search}`, 301);
      }
    }

    const app = matchProxiedApp(url.pathname);
    if (app) return proxyApp(request, app);

    return fetch(request);
  },
};

