// Direct Cloudflare REST deploy. Wrangler 4.x rejects Email+Key auth, but
// the Cloudflare API still accepts it for legacy global-key admins.
import { readFileSync } from 'node:fs';


const cloudflareSecret = process.env.CLOUDFLARE_API_TOKEN?.trim();
const cloudflareEmail = 'Papalexios@gmail.com';
const accountId = '5dc0401c38d9de0c6947fee40a210937';
const scriptName = 'gearuptofit-sitemap-router';
const zoneName = 'gearuptofit.com';

if (!cloudflareSecret) {
  console.error('CLOUDFLARE_API_TOKEN env var is missing.');
  process.exit(1);
}

async function jget(url, headers) {
  const r = await fetch(url, { headers });
  return r.json().catch(() => ({}));
}

const tokenCheck = await jget('https://api.cloudflare.com/client/v4/user/tokens/verify', {
  Authorization: `Bearer ${cloudflareSecret}`,
});
const useToken = tokenCheck.success && tokenCheck.result?.status === 'active';

const authHeaders = useToken
  ? { Authorization: `Bearer ${cloudflareSecret}` }
  : { 'X-Auth-Email': cloudflareEmail, 'X-Auth-Key': cloudflareSecret };

if (!useToken) {
  const userCheck = await jget('https://api.cloudflare.com/client/v4/user', authHeaders);
  if (!userCheck.success) {
    console.error('Cloudflare auth failed for both API token and Email+Key.');
    process.exit(1);
  }
  console.log('Auth: Email + Global API Key');
} else {
  console.log('Auth: API Token');
}

// --- Resolve zone id ---
const zoneRes = await jget(
  `https://api.cloudflare.com/client/v4/zones?name=${zoneName}`,
  authHeaders,
);
const zoneId = zoneRes.result?.[0]?.id;
if (!zoneId) {
  console.error('Could not find Cloudflare zone for', zoneName, JSON.stringify(zoneRes));
  process.exit(1);
}

// --- Upload worker script (multipart with module metadata) ---
const scriptBody = readFileSync('worker.js', 'utf8');
const metadata = {
  main_module: 'worker.js',
  compatibility_date: '2026-05-07',
  bindings: [],
};

const boundary = `----cfdeploy${Date.now()}`;
const parts = [];
parts.push(
  `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="metadata"\r\n' +
    'Content-Type: application/json\r\n\r\n' +
    JSON.stringify(metadata) +
    '\r\n',
);
parts.push(
  `--${boundary}\r\n` +
    'Content-Disposition: form-data; name="worker.js"; filename="worker.js"\r\n' +
    'Content-Type: application/javascript+module\r\n\r\n' +
    scriptBody +
    '\r\n',
);
parts.push(`--${boundary}--\r\n`);
const body = parts.join('');

const uploadRes = await fetch(
  `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${scriptName}`,
  {
    method: 'PUT',
    headers: {
      ...authHeaders,
      'Content-Type': `multipart/form-data; boundary=${boundary}`,
    },
    body,
  },
);
const uploadJson = await uploadRes.json().catch(() => ({}));
if (!uploadRes.ok || !uploadJson.success) {
  console.error('Worker upload failed:', uploadRes.status, JSON.stringify(uploadJson, null, 2));
  process.exit(1);
}
console.log(`Uploaded worker script (${(scriptBody.length / 1024).toFixed(2)} KiB).`);

// --- Reconcile routes ---
const desiredRoutes = [
  '/sitemap.xml',
  '/sitemap_index.xml',
  '/sitemap-posts.xml',
  '/sitemap-pages.xml',
  '/sitemap-lovable.xml',
  '/fitness-plan',
  '/fitness-plan/*',
  '/watch-match',
  '/watch-match/*',
  '/~api/analytics',
].map((p) => `${zoneName}${p}`);

// Routes we previously created but must NOT own — the apex homepage is itself
// a Lovable SPA and needs unfiltered access to /assets/*.
const forbiddenPatterns = new Set([`${zoneName}/assets/*`]);

const existingRes = await jget(
  `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
  authHeaders,
);
const existing = existingRes.result || [];
const existingForScript = existing.filter((r) => r.script === scriptName);
const existingPatterns = new Set(existingForScript.map((r) => r.pattern));

// Delete any forbidden routes we previously created (e.g. the global /assets/*
// route that was breaking the apex SPA's bundle loading).
for (const route of existingForScript) {
  if (!forbiddenPatterns.has(route.pattern)) continue;
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes/${route.id}`,
    { method: 'DELETE', headers: authHeaders },
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) {
    console.warn('  route delete failed:', route.pattern, JSON.stringify(j.errors || j));
  } else {
    console.log('  - route', route.pattern);
    existingPatterns.delete(route.pattern);
  }
}

for (const pattern of desiredRoutes) {
  if (existingPatterns.has(pattern)) continue;
  if (forbiddenPatterns.has(pattern)) continue;
  const r = await fetch(
    `https://api.cloudflare.com/client/v4/zones/${zoneId}/workers/routes`,
    {
      method: 'POST',
      headers: { ...authHeaders, 'Content-Type': 'application/json' },
      body: JSON.stringify({ pattern, script: scriptName }),
    },
  );
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.success) {
    console.warn('  route create failed:', pattern, JSON.stringify(j.errors || j));
  } else {
    console.log('  + route', pattern);
  }
}

// --- Post-deploy smoke tests: hard-fail if any critical surface regresses. ---
// These are the contract every deploy MUST satisfy. If any check fails, this
// script exits non-zero so a regression cannot silently reach production.
async function head(url) {
  const r = await fetch(url, { method: 'GET', redirect: 'manual' });
  return { status: r.status, headers: r.headers, ct: r.headers.get('content-type') || '' };
}

async function expect(label, url, predicate) {
  try {
    const res = await head(url);
    const ok = predicate(res);
    console.log(`  ${ok ? '✔' : '✘'} ${label}  [${res.status} ${res.ct.split(';')[0]}]  ${url}`);
    return ok;
  } catch (err) {
    console.log(`  ✘ ${label}  [ERROR ${err.message}]  ${url}`);
    return false;
  }
}

console.log('\nSmoke tests:');
const apexHomeRes = await fetch(`https://${zoneName}/`);
const apexHomeHtml = await apexHomeRes.text();
const assetMatch = apexHomeHtml.match(/\/assets\/[A-Za-z0-9_.-]+\.(?:js|css)/g) || [];

const checks = await Promise.all([
  expect('apex homepage 200 + html', `https://${zoneName}/`, (r) => r.status === 200 && r.ct.includes('text/html')),
  ...assetMatch.slice(0, 4).map((a) =>
    expect(`apex asset 200 ${a}`, `https://${zoneName}${a}`, (r) => r.status === 200 && (r.ct.includes('javascript') || r.ct.includes('css'))),
  ),
  expect('/fitness-plan/ proxied 200', `https://${zoneName}/fitness-plan/`, (r) => r.status === 200 && r.headers.get('x-proxied-from')),
  expect('/watch-match/ proxied 200', `https://${zoneName}/watch-match/`, (r) => r.status === 200 && r.headers.get('x-proxied-from')),
  expect('sitemap-posts.xml has urls', `https://${zoneName}/sitemap-posts.xml`, (r) => r.status === 200 && Number(r.headers.get('x-url-count') || 0) > 100),
  expect('sitemap-pages.xml ok', `https://${zoneName}/sitemap-pages.xml`, (r) => r.status === 200),
  expect('sitemap-lovable.xml ok', `https://${zoneName}/sitemap-lovable.xml`, (r) => r.status === 200),
  expect('/~api/analytics 204 no-op', `https://${zoneName}/~api/analytics`, (r) => r.status === 204),
  // Guardrail: bare /assets/* requests on the apex MUST go to the Lovable SPA,
  // not to the worker. We assert by confirming there is NO x-proxied-from header.
  expect('apex /assets/* not hijacked', `https://${zoneName}/assets/index-CTzGmr15.css`, (r) => !r.headers.get('x-proxied-from')),
]);

if (checks.some((ok) => !ok)) {
  console.error('\n✘ One or more smoke tests failed. Investigate before considering this deploy healthy.');
  process.exit(1);
}
console.log('\n✔ All smoke tests passed.');
