import { spawnSync } from 'node:child_process';

const cloudflareSecret = process.env.CLOUDFLARE_API_TOKEN?.trim();
const cloudflareEmail = 'Papalexios@gmail.com';

if (!cloudflareSecret) {
  console.error('CLOUDFLARE_API_TOKEN is missing.');
  process.exit(1);
}

async function readCloudflareJson(url, headers) {
  const response = await fetch(url, { headers });
  return response.json().catch(() => ({}));
}

const tokenVerification = await readCloudflareJson('https://api.cloudflare.com/client/v4/user/tokens/verify', {
  Authorization: `Bearer ${cloudflareSecret}`,
});

const wranglerEnv = { ...process.env };

if (tokenVerification.success && tokenVerification.result?.status === 'active') {
  wranglerEnv.CLOUDFLARE_API_TOKEN = cloudflareSecret;
} else {
  const globalKeyVerification = await readCloudflareJson('https://api.cloudflare.com/client/v4/user', {
    'X-Auth-Email': cloudflareEmail,
    'X-Auth-Key': cloudflareSecret,
  });

  if (!globalKeyVerification.success) {
    const tokenErrors = Array.isArray(tokenVerification.errors)
      ? tokenVerification.errors.map((error) => `${error.code ?? 'unknown'}: ${error.message}`).join('; ')
      : 'Cloudflare rejected the API token';
    const keyErrors = Array.isArray(globalKeyVerification.errors)
      ? globalKeyVerification.errors.map((error) => `${error.code ?? 'unknown'}: ${error.message}`).join('; ')
      : 'Cloudflare rejected the Global API Key';

    console.error(`Cloudflare auth failed. API Token check: ${tokenErrors}. Global API Key check: ${keyErrors}.`);
    process.exit(1);
  }

  delete wranglerEnv.CLOUDFLARE_API_TOKEN;
  wranglerEnv.CLOUDFLARE_EMAIL = cloudflareEmail;
  wranglerEnv.CLOUDFLARE_API_KEY = cloudflareSecret;
}

const deploy = spawnSync('bunx', ['--bun', 'wrangler@latest', 'deploy', 'worker.js'], {
  stdio: 'inherit',
  env: wranglerEnv,
});

if (deploy.error) {
  console.error('wrangler spawn failed:', deploy.error.message);
  process.exit(1);
}
if (deploy.status !== 0) process.exit(deploy.status ?? 1);

const sitemapCheck = spawnSync('curl', ['-fsSI', 'https://gearuptofit.com/sitemap-posts.xml'], {
  encoding: 'utf8',
});

if (sitemapCheck.status !== 0) {
  console.error(sitemapCheck.stderr || 'Sitemap verification failed.');
  process.exit(sitemapCheck.status ?? 1);
}

const urlCount = sitemapCheck.stdout
  .split('\n')
  .find((line) => line.toLowerCase().startsWith('x-url-count:'));

if (!urlCount) {
  console.error('Worker deployed, but x-url-count header is missing from sitemap-posts.xml.');
  process.exit(1);
}

console.log(urlCount.trim());