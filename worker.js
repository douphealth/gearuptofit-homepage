const APEX_HOST = 'gearuptofit.com';
const ORIGIN_HOST = 'origin.gearuptofit.com';
const ORIGIN_BASE = `https://${ORIGIN_HOST}`;
const SITEMAP_TTL = 3600;
const MAX_REST_PAGES = 50;
const AUTHORITATIVE_POST_SITEMAPS = ['/post-sitemap.xml', '/post-sitemap2.xml'];

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

export default {
  async fetch(request) {
    const url = new URL(request.url);
    const sitemap = await handleSitemap(url.pathname);
    if (sitemap) return sitemap;

    return fetch(request);
  },
};
