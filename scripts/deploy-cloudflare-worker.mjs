import { spawnSync } from 'node:child_process';

const token = process.env.CLOUDFLARE_API_TOKEN?.trim();

if (!token) {
  console.error('CLOUDFLARE_API_TOKEN is missing.');
  process.exit(1);
}

const verify = await fetch('https://api.cloudflare.com/client/v4/user/tokens/verify', {
  headers: { Authorization: `Bearer ${token}` },
});

const verification = await verify.json().catch(() => ({}));

if (!verification.success || verification.result?.status !== 'active') {
  const errors = Array.isArray(verification.errors)
    ? verification.errors.map((error) => `${error.code ?? 'unknown'}: ${error.message}`).join('; ')
    : 'Cloudflare rejected the token';

  console.error(`Cloudflare token check failed: ${errors}`);
  process.exit(1);
}

const deploy = spawnSync('wrangler', ['deploy', 'worker.js'], {
  stdio: 'inherit',
  env: { ...process.env, CLOUDFLARE_API_TOKEN: token },
});

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