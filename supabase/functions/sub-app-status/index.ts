import { corsHeaders } from "https://esm.sh/@supabase/supabase-js@2.95.0/cors";

const TARGETS = [
  { label: "Apex homepage", host: "gearup-flow-master.lovable.app", prefix: "/" },
  { label: "Training plan", host: "body-recomp-os-guru.lovable.app", prefix: "/fitness-plan" },
  { label: "Watch match", host: "wrist-wonderland-hub.lovable.app", prefix: "/watch-match" },
  { label: "Shoe finder", host: "runmatch-ai-buddy.lovable.app", prefix: "/shoe-finder" },
];

async function probeHost(target: (typeof TARGETS)[number]) {
  const startedAt = performance.now();

  try {
    const res = await fetch(`https://${target.host}/`, {
      method: "GET",
      headers: {
        accept: "text/html,*/*;q=0.8",
        "user-agent": "GearUpToFit-Deployment-Status/1.0",
        "cache-control": "no-cache",
      },
    });

    return {
      ...target,
      status: res.status,
      ok: res.ok,
      deploymentId: res.headers.get("x-deployment-id"),
      lastModified: res.headers.get("last-modified"),
      date: res.headers.get("date"),
      cacheControl: res.headers.get("cache-control"),
      responseMs: Math.round(performance.now() - startedAt),
    };
  } catch (error) {
    return {
      ...target,
      status: 0,
      ok: false,
      deploymentId: null,
      lastModified: null,
      date: null,
      cacheControl: null,
      responseMs: Math.round(performance.now() - startedAt),
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const targets = await Promise.all(TARGETS.map(probeHost));

  return new Response(JSON.stringify({ checkedAt: new Date().toISOString(), targets }), {
    headers: {
      ...corsHeaders,
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });
});