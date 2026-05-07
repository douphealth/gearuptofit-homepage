## Pre-flight verified ✅

I just checked your origin live:

- `https://origin.gearuptofit.com/` → **HTTP 200** (WP homepage, no redirect)
- `https://origin.gearuptofit.com/shoe-match/` → **HTTP 200**
- `https://gearuptofit.com/` → **HTTP 200** (still WP — Worker not bound yet)

Steps 3 & 4 are done correctly. Time for the Worker.

---

## Step 5 — Create the Cloudflare Worker

### 5a. Create the Worker

1. Cloudflare dashboard → **Workers & Pages** → **Create** → **Create Worker**
2. Name: `gearuptofit-router`
3. Click **Deploy** (the placeholder hello-world is fine for now)
4. Click **Edit code** and replace everything with the script below

### 5b. Worker script

```js
const LOVABLE = "https://gearup-flow-master.lovable.app";
const WP      = "https://origin.gearuptofit.com";
const APEX    = "gearuptofit.com";

// Paths Lovable owns. Everything else → WordPress.
const LOVABLE_EXACT = new Set([
  "/",
  "/robots.txt",
  "/sitemap.xml",
  "/llms.txt",
  "/manifest.webmanifest",
]);

const LOVABLE_PREFIXES = [
  "/assets/",        // Vite build assets
  "/src/",           // dev only, harmless in prod
  "/@",              // Vite internal
  "/node_modules/",  // dev only
];

function isLovablePath(pathname) {
  if (LOVABLE_EXACT.has(pathname)) return true;
  return LOVABLE_PREFIXES.some(p => pathname.startsWith(p));
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    // Force apex (strip www) — optional but recommended for SEO
    if (url.hostname === "www." + APEX) {
      url.hostname = APEX;
      return Response.redirect(url.toString(), 301);
    }

    const target = isLovablePath(url.pathname) ? LOVABLE : WP;
    const upstream = new URL(url.pathname + url.search, target);

    // Clone request, rewrite Host so origin accepts it
    const headers = new Headers(request.headers);
    headers.set("host", new URL(target).host);
    headers.set("x-forwarded-host", APEX);
    headers.set("x-forwarded-proto", "https");

    const init = {
      method: request.method,
      headers,
      body: ["GET","HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    };

    let resp = await fetch(upstream.toString(), init);

    // Rewrite redirects so Location header points back to the apex
    if ([301,302,303,307,308].includes(resp.status)) {
      const loc = resp.headers.get("location");
      if (loc) {
        const fixed = new URL(loc, upstream);
        if (fixed.hostname === new URL(target).hostname) {
          fixed.hostname = APEX;
          fixed.protocol = "https:";
          const newHeaders = new Headers(resp.headers);
          newHeaders.set("location", fixed.toString());
          resp = new Response(resp.body, { status: resp.status, headers: newHeaders });
        }
      }
    }

    return resp;
  },
};
```

5. Click **Deploy**.

### 5c. Bind the Worker to your domain

1. Still in the Worker → **Settings** → **Domains & Routes** → **Add** → **Route**
2. Zone: `gearuptofit.com`
3. Route: `gearuptofit.com/*` → **Add route**
4. Repeat: add `www.gearuptofit.com/*`

### 5d. Cloudflare DNS for the apex must be **proxied (orange cloud)**

In Cloudflare → DNS for `gearuptofit.com`:

- `A  @   <your VPS IP>`  → **Proxied (orange cloud)** ✅
- `A  www <your VPS IP>`  → **Proxied (orange cloud)** ✅
- `A  origin <your VPS IP>` → **DNS only (grey cloud)** ✅ (already done)

The orange cloud on apex/www is what makes the Worker actually intercept traffic. The grey cloud on `origin` is what lets the Worker reach WP without looping.

---

## Step 6 — Test

Run these (or paste in browser):

```
https://gearuptofit.com/                  → Lovable landing page
https://gearuptofit.com/shoe-match/       → WP page
https://gearuptofit.com/fitness/          → WP category
https://gearuptofit.com/wp-admin/         → WP login
https://gearuptofit.com/sitemap.xml       → Lovable sitemap
https://www.gearuptofit.com/              → 301 to apex, then Lovable
```

If `/` shows Lovable and `/shoe-match/` shows WP, you're done.

---

## Step 7 — Tell me when deployed

Once the Worker is live and routes are bound, paste me the output of:

```
curl -sI https://gearuptofit.com/ | head -20
curl -sI https://gearuptofit.com/shoe-match/ | head -10
```

I'll verify the swap landed cleanly and then we'll submit the new sitemap to Google Search Console.

---

## Notes

- **Nothing in the Lovable codebase needs to change for this step.** The Worker lives in Cloudflare, not in this repo.
- After approval, switching to build mode isn't required — this is a Cloudflare config task, not a code change. Approve so I can confirm and walk you through any issues.
