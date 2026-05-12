#!/usr/bin/env node
/**
 * Validates that critical outbound links in the codebase resolve to HTTP 200.
 * Fails the build if any required slug 404s, 5xxs, or times out.
 *
 * Run locally: `node scripts/validate-outbound-links.mjs`
 * Run in CI:   add to the test/build pipeline before deploy.
 */
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, extname } from "node:path";

// Slugs that MUST exist on gearuptofit.com. Add new required outbound links here.
const REQUIRED_URLS = [
  "https://gearuptofit.com/fitness-plan/",
  "https://gearuptofit.com/watch-match/",
  "https://gearuptofit.com/shoe-match/",
];

const SRC_DIR = "src";
const SCAN_EXTS = new Set([".ts", ".tsx", ".js", ".jsx"]);
const URL_RE = /https?:\/\/[^\s"'`<>)]+/g;

function walk(dir, files = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) walk(p, files);
    else if (SCAN_EXTS.has(extname(name))) files.push(p);
  }
  return files;
}

function collectUrlsFromSource() {
  const urls = new Map(); // url -> [files]
  for (const f of walk(SRC_DIR)) {
    const txt = readFileSync(f, "utf8");
    const matches = txt.match(URL_RE) || [];
    for (const raw of matches) {
      const u = raw.replace(/[.,);]+$/, "");
      if (!u.includes("gearuptofit.com")) continue;
      if (!urls.has(u)) urls.set(u, []);
      urls.get(u).push(f);
    }
  }
  return urls;
}

async function check(url) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 10_000);
  try {
    // HEAD first; some WP setups don't support HEAD, fall back to GET.
    let res = await fetch(url, { method: "HEAD", redirect: "follow", signal: ctrl.signal });
    if (res.status === 405 || res.status === 501) {
      res = await fetch(url, { method: "GET", redirect: "follow", signal: ctrl.signal });
    }
    return { url, status: res.status, finalUrl: res.url };
  } catch (e) {
    return { url, status: 0, error: e.message };
  } finally {
    clearTimeout(timer);
  }
}

const sourceUrls = collectUrlsFromSource();

// Always check required URLs; also check any other gearuptofit.com URL found in source.
const toCheck = new Set([...REQUIRED_URLS, ...sourceUrls.keys()]);
console.log(`Validating ${toCheck.size} outbound link(s)…\n`);

const results = await Promise.all([...toCheck].map(check));
let failed = 0;
for (const r of results.sort((a, b) => a.url.localeCompare(b.url))) {
  const required = REQUIRED_URLS.includes(r.url);
  const ok = r.status >= 200 && r.status < 400;
  const tag = ok ? "OK " : required ? "FAIL" : "WARN";
  if (!ok && required) failed++;
  console.log(`[${tag}] ${r.status || "ERR"}  ${r.url}${r.error ? `  (${r.error})` : ""}`);
}

// Verify every REQUIRED url is actually referenced somewhere in source (catches accidental removal).
for (const u of REQUIRED_URLS) {
  if (!sourceUrls.has(u)) {
    console.log(`[FAIL] Required URL not referenced in src/: ${u}`);
    failed++;
  }
}

if (failed > 0) {
  console.error(`\n${failed} required link check(s) failed.`);
  process.exit(1);
}
console.log("\nAll required outbound links OK.");
