import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type Target = {
  label: string;
  host: string;
  prefix: string;
  status: number;
  ok: boolean;
  deploymentId: string | null;
  lastModified: string | null;
  date: string | null;
  cacheControl?: string | null;
  responseMs?: number;
  error?: string;
};

type StatusResponse = {
  checkedAt: string;
  targets: Target[];
  source?: "worker" | "cloud";
};

const parseStatusResponse = async (res: Response): Promise<StatusResponse> => {
  const contentType = res.headers.get("content-type") || "";
  const body = await res.text();

  if (!res.ok) {
    throw new Error(`Worker endpoint returned HTTP ${res.status}`);
  }

  if (!contentType.includes("application/json")) {
    throw new Error(`Worker endpoint returned ${contentType || "unknown content type"}`);
  }

  return JSON.parse(body) as StatusResponse;
};

const loadWorkerStatus = async () => {
  const res = await fetch(`/api/sub-app-status?ts=${Date.now()}`, {
    cache: "no-store",
    headers: { accept: "application/json" },
  });
  return { ...(await parseStatusResponse(res)), source: "worker" as const };
};

const loadCloudStatus = async () => {
  const { data, error } = await supabase.functions.invoke<StatusResponse>("sub-app-status", {
    body: { ts: Date.now() },
  });

  if (error) throw error;
  if (!data?.targets?.length) throw new Error("Cloud status endpoint returned no targets");
  return { ...data, source: "cloud" as const };
};

export default function StatusPage() {
  const [data, setData] = useState<StatusResponse | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      setData(await loadWorkerStatus());
    } catch (e) {
      try {
        setData(await loadCloudStatus());
      } catch (fallbackError) {
        setError(`Status unavailable. Worker: ${String(e)}. Cloud fallback: ${String(fallbackError)}`);
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, []);

  return (
    <main className="min-h-screen bg-background text-foreground p-6 md:p-12">
      <div className="max-w-4xl mx-auto">
        <h1 className="text-3xl md:text-5xl font-bold mb-2">Sub-app deployment status</h1>
        <p className="text-muted-foreground mb-6">
          Live deployment IDs from each Lovable origin. If something looks stale,
          open that project on Lovable and click <strong>Publish → Update</strong>.
        </p>

        <button
          onClick={load}
          disabled={loading}
          className="mb-6 px-4 py-2 rounded-md bg-primary text-primary-foreground disabled:opacity-50"
        >
          {loading ? "Refreshing…" : "Refresh now"}
        </button>

        {error && (
          <div className="p-4 rounded-md bg-destructive/10 text-destructive mb-4">
            {error}
          </div>
        )}

        {data && (
          <>
            <p className="text-xs text-muted-foreground mb-4">
              Checked at {new Date(data.checkedAt).toLocaleString()} · Source: {data.source === "cloud" ? "Lovable Cloud fallback" : "apex worker"}
            </p>
            <div className="space-y-3">
              {data.targets.map((t) => (
                <div
                  key={t.host}
                  className="border border-border rounded-lg p-4 bg-card"
                >
                  <div className="flex items-center justify-between gap-4 flex-wrap">
                    <div>
                      <div className="font-semibold">{t.label}</div>
                      <div className="text-xs text-muted-foreground">{t.host}</div>
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded ${
                        t.ok ? "bg-primary/10 text-primary" : "bg-destructive/10 text-destructive"
                      }`}
                    >
                      HTTP {t.status}
                    </span>
                  </div>
                  <dl className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-1 text-xs">
                    <div>
                      <dt className="text-muted-foreground inline">Deployment ID: </dt>
                      <dd className="inline font-mono">{t.deploymentId ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground inline">Last-Modified: </dt>
                      <dd className="inline">{t.lastModified ?? "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground inline">Response: </dt>
                      <dd className="inline">{typeof t.responseMs === "number" ? `${t.responseMs}ms` : "—"}</dd>
                    </div>
                    <div>
                      <dt className="text-muted-foreground inline">Cache-Control: </dt>
                      <dd className="inline">{t.cacheControl ?? "—"}</dd>
                    </div>
                  </dl>
                  {t.error && (
                    <div className="mt-2 text-xs text-destructive">{t.error}</div>
                  )}
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </main>
  );
}
