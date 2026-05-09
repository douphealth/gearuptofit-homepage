import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, LogOut, ExternalLink, Sparkles, Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/hooks/use-toast";
import {
  verifyAuditPassword, setAuditPw, getAuditPw, clearAuditPw, callAudit,
} from "@/lib/auditClient";

type Issue = { severity: "critical" | "high" | "polish"; code: string; message: string };
type ScoreRow = { post_id: number; score: number; issues: Issue[]; metrics: any; scanned_at: string };
type Post = { post_id: number; slug: string; title: string; link: string; modified_at: string };
type ImportPage = { page: number; status: string; retry_count: number; imported_count: number; post_ids?: number[]; error?: string | null };
type MissingPost = { id: number; slug: string; title?: string };
type Diagnostics = {
  authoritative?: { totalPublished: number; totalPages: number; perPage: number; cachedCount: number; difference: number; complete: boolean };
  run?: { id: string; status: string; expected_total: number; expected_pages: number; imported_total: number; first_missing_page?: number | null; updated_at?: string } | null;
  pages?: ImportPage[];
  firstMissingPage?: number | null;
  missingFromCache?: MissingPost[];
};

function sevColor(s: Issue["severity"]) {
  return s === "critical" ? "destructive" : s === "high" ? "default" : "secondary";
}
function scoreColor(n: number) {
  if (n >= 80) return "text-emerald-500";
  if (n >= 60) return "text-amber-500";
  return "text-destructive";
}

function LoginGate({ onAuth }: { onAuth: () => void }) {
  const [pw, setPw] = useState("");
  const [loading, setLoading] = useState(false);
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-4">
      <Card className="w-full max-w-md">
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><ShieldCheck className="size-5" /> SEO Audit Dashboard</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">Private access. Enter the audit password.</p>
          <Input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="Password" autoFocus
            onKeyDown={(e) => e.key === "Enter" && submit()} />
          <Button className="w-full" onClick={submit} disabled={loading}>
            {loading ? <Loader2 className="size-4 animate-spin" /> : "Unlock"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
  async function submit() {
    if (!pw) return;
    setLoading(true);
    const ok = await verifyAuditPassword(pw);
    setLoading(false);
    if (ok) { setAuditPw(pw); onAuth(); }
    else toast({ title: "Wrong password", variant: "destructive" });
  }
}

function Dashboard({ onLogout }: { onLogout: () => void }) {
  const [posts, setPosts] = useState<Post[]>([]);
  const [scores, setScores] = useState<Record<number, ScoreRow>>({});
  const [loading, setLoading] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [filter, setFilter] = useState("");
  const [sevFilter, setSevFilter] = useState<"all" | "critical" | "high">("all");
  const [sortBy, setSortBy] = useState<"worst-overall" | "worst-cwv" | "worst-lcp" | "worst-cls" | "worst-inp">("worst-overall");
  const [selected, setSelected] = useState<Post | null>(null);
  const [progress, setProgress] = useState<string>("");
  const [diagnostics, setDiagnostics] = useState<Diagnostics | null>(null);

  const loadScores = async (ids: number[]) => {
    if (!ids.length) { setScores({}); return; }
    const { scores: data } = await callAudit<{ scores: ScoreRow[] }>("audit-score", { mode: "list", post_ids: ids });
    const map: Record<number, ScoreRow> = {};
    (data || []).forEach((s: any) => { map[s.post_id] = s as ScoreRow; });
    setScores(map);
  };

  const load = async (force = false) => {
    setLoading(true);
    setProgress("");
    try {
      let state = await callAudit<Diagnostics & { posts?: Post[] }>("wp-fetch-posts", { mode: force ? "start" : "list" });
      setDiagnostics(state);
      if (force) {
        const runId = state.run?.id;
        if (!runId) throw new Error("Import run could not start");
        const attempts: Record<number, number> = {};
        while (state.firstMissingPage) {
          const page = state.firstMissingPage;
          const total = state.authoritative?.totalPages || state.run?.expected_pages || "?";
          attempts[page] = (attempts[page] || 0) + 1;
          setProgress(`Fetching page ${page}/${total} · try ${attempts[page]}…`);
          try {
            state = await callAudit<Diagnostics & { done?: boolean }>("wp-fetch-posts", { mode: "continue", run_id: runId });
          } catch (err) {
            state = await callAudit<Diagnostics>("wp-fetch-posts", { mode: "diagnostics", run_id: runId });
          }
          setDiagnostics(state);
          if (attempts[page] >= 3 && state.firstMissingPage === page) break;
        }
      }
      setProgress("Loading…");
      const r = await callAudit<Diagnostics & { posts: Post[] }>("wp-fetch-posts", { mode: "results", run_id: state.run?.id });
      setDiagnostics(r);
      setPosts(r.posts || []);
      await loadScores((r.posts || []).map((p) => p.post_id));
      if (r.authoritative && !r.authoritative.complete) toast({ title: `${r.authoritative.difference} posts still missing`, description: "Diagnostics shows the first missing page and missing IDs.", variant: "destructive" });
    } catch (e: any) { toast({ title: "Load failed", description: e.message, variant: "destructive" }); }
    setProgress("");
    setLoading(false);
  };

  const retryMissing = async () => {
    setLoading(true);
    try {
      let state = await callAudit<Diagnostics>("wp-fetch-posts", { mode: "retry", run_id: diagnostics?.run?.id });
      setDiagnostics(state);
      const runId = state.run?.id;
      const attempts: Record<number, number> = {};
      while (runId && state.firstMissingPage) {
        const page = state.firstMissingPage;
        attempts[page] = (attempts[page] || 0) + 1;
        setProgress(`Retrying page ${page}/${state.authoritative?.totalPages || "?"} · try ${attempts[page]}…`);
        try {
          state = await callAudit<Diagnostics>("wp-fetch-posts", { mode: "continue", run_id: runId });
        } catch (err) {
          state = await callAudit<Diagnostics>("wp-fetch-posts", { mode: "diagnostics", run_id: runId });
        }
        setDiagnostics(state);
        if (attempts[page] >= 3 && state.firstMissingPage === page) break;
      }
      await load(false);
    } catch (e: any) { toast({ title: "Retry failed", description: e.message, variant: "destructive" }); }
    setProgress("");
    setLoading(false);
  };

  // Parallel scan: 20 concurrent workers, scan in chunks of 10 per call.
  // For 200 posts at ~1.5s/post → ~15-30s total.
  const runScan = async () => {
    if (!posts.length) {
      toast({ title: "No cached posts", description: "Run Refresh WP first." });
      return;
    }
    setScanning(true);
    try {
      const total = posts.length;
      let scanned = 0;
      const CHUNK = 10;       // posts per edge call
      const CONCURRENCY = 4;  // parallel edge calls (40 posts in flight)
      const offsets: number[] = [];
      for (let o = 0; o < total; o += CHUNK) offsets.push(o);

      let cursor = 0;
      const workers = Array.from({ length: CONCURRENCY }, async () => {
        while (cursor < offsets.length) {
          const my = offsets[cursor++];
          if (my === undefined) return;
          try {
            const r = await callAudit<{ scanned: number }>("audit-score", { mode: "scan_all", offset: my, limit: CHUNK });
            scanned += r.scanned || 0;
            setProgress(`Scored ${Math.min(scanned, total)}/${total}…`);
          } catch (e) { /* continue */ }
        }
      });
      await Promise.all(workers);
      toast({ title: `Scanned ${scanned} posts`, description: "All scores updated in parallel." });
      await load();
    } catch (e: any) { toast({ title: "Scan failed", description: e.message, variant: "destructive" }); }
    setProgress("");
    setScanning(false);
  };

  useEffect(() => { load(); }, []);

  const ranked = useMemo(() => {
    const arr = posts.map((p) => ({ post: p, score: scores[p.post_id] }));
    let f = arr.filter(({ post }) => post.title?.toLowerCase().includes(filter.toLowerCase()));
    if (sevFilter !== "all") {
      f = f.filter(({ score }) => score?.issues?.some((i) => i.severity === sevFilter));
    }
    const cwvOf = (s: any, key: string) => {
      const v = s?.metrics?.cwv?.[key];
      return typeof v === "number" ? v : 999;
    };
    return f.sort((a, b) => {
      switch (sortBy) {
        case "worst-cwv": return cwvOf(a.score, "score") - cwvOf(b.score, "score");
        case "worst-lcp": return cwvOf(a.score, "lcpScore") - cwvOf(b.score, "lcpScore");
        case "worst-cls": return cwvOf(a.score, "clsScore") - cwvOf(b.score, "clsScore");
        case "worst-inp": return cwvOf(a.score, "inpScore") - cwvOf(b.score, "inpScore");
        default: return (a.score?.score ?? 999) - (b.score?.score ?? 999);
      }
    });
  }, [posts, scores, filter, sevFilter, sortBy]);

  const stats = useMemo(() => {
    const ss = Object.values(scores);
    const avg = ss.length ? Math.round(ss.reduce((a, b) => a + b.score, 0) / ss.length) : 0;
    const critical = ss.filter((s) => s.issues?.some((i) => i.severity === "critical")).length;
    const high = ss.filter((s) => s.issues?.some((i) => i.severity === "high")).length;
    return { avg, critical, high, total: posts.length };
  }, [scores, posts]);

  return (
    <div className="min-h-screen bg-background p-4 md:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3 mb-6">
        <div>
          <h1 className="text-2xl md:text-3xl font-bold">SEO Audit · gearuptofit.com</h1>
          <p className="text-sm text-muted-foreground">Read-only by default. Drafts only on push.</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => load(true)} disabled={loading}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} /> {progress || "Refresh WP"}
          </Button>
          <Button size="sm" onClick={runScan} disabled={scanning}>
            <Sparkles className={`size-4 mr-2 ${scanning ? "animate-spin" : ""}`} /> {scanning && progress ? progress : "Re-score all"}
          </Button>
          <Button variant="ghost" size="sm" onClick={onLogout}><LogOut className="size-4" /></Button>
        </div>
      </header>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-6">
        <Stat label="Posts" value={stats.total} />
        <Stat label="Avg score" value={stats.avg} className={scoreColor(stats.avg)} />
        <Stat label="Critical issues" value={stats.critical} className="text-destructive" />
        <Stat label="High issues" value={stats.high} className="text-amber-500" />
      </div>

      <DiagnosticPanel diagnostics={diagnostics} loading={loading} onRetry={retryMissing} />

      <BulkCleanupPanel />


      <div className="flex flex-wrap gap-2 mb-4 items-center">
        <Input placeholder="Filter by title…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
        {(["all", "critical", "high"] as const).map((s) => (
          <Button key={s} size="sm" variant={sevFilter === s ? "default" : "outline"} onClick={() => setSevFilter(s)}>
            {s}
          </Button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">Sort</span>
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as any)}>
            <SelectTrigger className="h-8 w-[200px] text-xs"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="worst-overall">Worst overall score</SelectItem>
              <SelectItem value="worst-cwv">Worst Core Web Vitals</SelectItem>
              <SelectItem value="worst-lcp">Worst LCP</SelectItem>
              <SelectItem value="worst-cls">Worst CLS</SelectItem>
              <SelectItem value="worst-inp">Worst INP</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Score</th>
                <th className="p-3 hidden sm:table-cell">CWV</th>
                <th className="p-3">Title</th>
                <th className="p-3 hidden md:table-cell">Issues</th>
                <th className="p-3 hidden lg:table-cell">Updated</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ post, score }) => {
                const c: any = (score?.metrics as any)?.cwv;
                return (
                <tr key={post.post_id} className="border-t hover:bg-muted/20">
                  <td className={`p-3 font-bold ${scoreColor(score?.score ?? 0)}`}>{score?.score ?? "—"}</td>
                  <td className="p-3 hidden sm:table-cell text-xs">
                    {c ? (
                      <div className="flex gap-1">
                        <span className={scoreColor(c.lcpScore ?? 0)}>L{c.lcpScore ?? "—"}</span>
                        <span className={scoreColor(c.clsScore ?? 0)}>C{c.clsScore ?? "—"}</span>
                        <span className={scoreColor(c.inpScore ?? 0)}>I{c.inpScore ?? "—"}</span>
                      </div>
                    ) : <span className="text-muted-foreground">—</span>}
                  </td>
                  <td className="p-3" dangerouslySetInnerHTML={{ __html: post.title }} />
                  <td className="p-3 hidden md:table-cell">
                    <div className="flex gap-1 flex-wrap">
                      {(score?.issues || []).slice(0, 3).map((i, idx) => (
                        <Badge key={idx} variant={sevColor(i.severity) as any}>{i.code}</Badge>
                      ))}
                      {(score?.issues?.length ?? 0) > 3 && <Badge variant="outline">+{score!.issues.length - 3}</Badge>}
                    </div>
                  </td>
                  <td className="p-3 hidden lg:table-cell text-muted-foreground">
                    {post.modified_at ? new Date(post.modified_at).toLocaleDateString() : "—"}
                  </td>
                  <td className="p-3 text-right">
                    <Button size="sm" variant="outline" onClick={() => setSelected(post)}>Open</Button>
                  </td>
                </tr>
                );
              })}
              {!ranked.length && !loading && (
                <tr><td colSpan={6} className="p-8 text-center text-muted-foreground">No posts. Click "Refresh WP" then "Re-score all".</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
      </Card>

      <PostDrawer post={selected} score={selected ? scores[selected.post_id] : undefined} onClose={() => setSelected(null)} />
    </div>
  );
}

function Stat({ label, value, className = "" }: { label: string; value: number | string; className?: string }) {
  return (
    <Card><CardContent className="p-4">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-3xl font-bold ${className}`}>{value}</div>
    </CardContent></Card>
  );
}

type LeakItem = { post_id: number; link: string; title: string; sample?: string; found?: boolean };
type DiffSummary = {
  chars_before: number; chars_after: number; chars_delta: number;
  lines_added: number; lines_removed: number;
  wrapper_tags_removed: number;
  style_tags_before: number; style_tags_after: number; style_tags_added: number;
};
type VerifyStatus = "pending" | "checking" | "clean" | "leak" | "stale_cache" | "error";
type FixResult = {
  post_id: number; ok: boolean;
  removed_chars?: number; error?: string;
  http_status?: number; completed_at?: string;
  published?: boolean; rolled_back?: boolean;
  dry_run?: boolean; would_change?: boolean; would_publish?: boolean;
  diff?: DiffSummary;
  verify?: VerifyStatus;
  verify_verdict?: "clean" | "stale_cache" | "real_leak" | "origin_only" | "unknown";
  verified_at?: string;
  verify_error?: string;
};
type Verdict = {
  verdict: "clean" | "stale_cache" | "real_leak" | "origin_only";
  liveUrl: string; liveStatus: number; liveBytes: number;
  live: { found: boolean; sample?: string };
  rest: { found: boolean; sample?: string };
  post_id: number | null;
  cacheHeaders: Record<string, string>;
};

function downloadFile(name: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = name; document.body.appendChild(a); a.click();
  setTimeout(() => { URL.revokeObjectURL(url); a.remove(); }, 0);
}
function toCsv(rows: LeakItem[], results: FixResult[] | null): string {
  const head = [
    "post_id", "title", "url",
    "fix_status", "publish_status", "http_code", "completed_at",
    "removed_chars", "chars_delta", "wrapper_tags_removed", "style_tags_added",
    "verify_status", "verify_verdict", "verified_at",
    "fix_error", "sample",
  ];
  const esc = (v: any) => `"${String(v ?? "").replace(/"/g, '""').replace(/\r?\n/g, " ")}"`;
  const lines = [head.join(",")];
  for (const it of rows) {
    const r = results?.find((x) => x.post_id === it.post_id);
    lines.push([
      it.post_id, it.title, it.link,
      r ? (r.ok ? (r.dry_run ? "would_change" : (r.rolled_back ? "rolled_back" : "fixed")) : "failed") : "pending",
      r?.published ? "published" : (r?.would_publish ? "would_publish" : ""),
      r?.http_status ?? "",
      r?.completed_at ?? "",
      r?.removed_chars ?? "",
      r?.diff?.chars_delta ?? "",
      r?.diff?.wrapper_tags_removed ?? "",
      r?.diff?.style_tags_added ?? "",
      r?.verify ?? "",
      r?.verify_verdict ?? "",
      r?.verified_at ?? "",
      r?.error ?? "",
      it.sample ?? "",
    ].map(esc).join(","));
  }
  return lines.join("\n");
}

function BulkCleanupPanel() {
  const [scanning, setScanning] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [items, setItems] = useState<LeakItem[] | null>(null);
  const [results, setResults] = useState<FixResult[] | null>(null);
  const [status, setStatus] = useState("");
  const [targetUrl, setTargetUrl] = useState("");
  const [targetBusy, setTargetBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [verifyResult, setVerifyResult] = useState<Verdict | null>(null);
  const [autoPublish, setAutoPublish] = useState(true);
  const [autoRollback, setAutoRollback] = useState(true);
  const [autoVerify, setAutoVerify] = useState(true);
  const [resumable, setResumable] = useState<{ phase: string; page: number; processed: number; updated_at: string } | null>(null);
  const [runId] = useState(() => `run-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`);

  const CKPT_KEY = "bulk-cleanup-default";

  const isResourceLimit = (msg: string) =>
    /WORKER_RESOURCE_LIMIT|546|compute resources|memory/i.test(msg || "");

  // On mount, look for an interrupted run.
  useEffect(() => {
    (async () => {
      try {
        const r = await callAudit<{ checkpoint: any }>("wp-bulk-cleanup", { mode: "checkpoint_load", key: CKPT_KEY });
        if (r.checkpoint) {
          setResumable({
            phase: r.checkpoint.phase,
            page: r.checkpoint.page,
            processed: (r.checkpoint.processed_ids || []).length,
            updated_at: r.checkpoint.updated_at,
          });
        }
      } catch { /* ignore */ }
    })();
  }, []);

  const saveCheckpoint = async (payload: Record<string, any>) => {
    try { await callAudit("wp-bulk-cleanup", { mode: "checkpoint_save", key: CKPT_KEY, ...payload }); } catch { /* best-effort */ }
  };
  const clearCheckpoint = async () => {
    try { await callAudit("wp-bulk-cleanup", { mode: "checkpoint_clear", key: CKPT_KEY }); } catch { /* best-effort */ }
    setResumable(null);
  };

  const scan = async (resume = false) => {
    setScanning(true);
    const MIN = 10, MAX = 100, RAMP = 10;
    let perPage = 50;
    let startPage = 1;
    let all: LeakItem[] = [];

    if (resume) {
      try {
        const r = await callAudit<{ checkpoint: any }>("wp-bulk-cleanup", { mode: "checkpoint_load", key: CKPT_KEY });
        if (r.checkpoint) {
          startPage = Math.max(1, Number(r.checkpoint.page) || 1);
          perPage = Math.max(MIN, Math.min(MAX, Number(r.checkpoint.per_page) || 50));
          all = (r.checkpoint.affected as LeakItem[]) || [];
        }
      } catch { /* ignore */ }
    } else {
      setResults(null); setItems([]);
    }
    setItems([...all]);

    try {
      let page = startPage;
      let totalPages = 1;
      while (page <= 400) {
        let attempt = 0;
        // eslint-disable-next-line no-constant-condition
        while (true) {
          try {
            const r = await callAudit<{ count: number; affected: LeakItem[]; done: boolean; totalPages: number; page: number; perPage: number }>(
              "wp-bulk-cleanup",
              { mode: "scan", page, perPage },
            );
            totalPages = r.totalPages || totalPages;
            all.push(...r.affected);
            setItems([...all]);
            setStatus(`Scanned page ${page}/${totalPages} · ${all.length} affected · ${perPage}/page`);
            if (perPage < MAX) perPage = Math.min(MAX, perPage + RAMP);
            await saveCheckpoint({ phase: "scan", page: page + 1, per_page: perPage, total_pages: totalPages, affected: all });
            if (r.done) { page = totalPages + 1; break; }
            page++; break;
          } catch (e: any) {
            if (isResourceLimit(e?.message) && perPage > MIN && attempt < 4) {
              perPage = Math.max(MIN, Math.floor(perPage / 2));
              attempt++;
              setStatus(`Resource limit · retrying page ${page} at ${perPage}/page`);
              continue;
            }
            throw e;
          }
        }
      }
      await clearCheckpoint();
      toast({ title: `Scan complete`, description: `${all.length} posts contain leaked CSS.` });
    } catch (e: any) {
      toast({ title: "Scan stopped", description: `${e.message}. Checkpoint saved — click Resume to continue.`, variant: "destructive" });
      setResumable({ phase: "scan", page: startPage, processed: all.length, updated_at: new Date().toISOString() });
    }
    setStatus(""); setScanning(false);
  };

  // Dry-run: preview which posts would change without writing.
  const dryRunAll = async () => {
    if (!items || items.length === 0) return;
    setFixing(true);
    try {
      const ids = items.map((i) => i.post_id);
      const all: FixResult[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        setStatus(`Dry-run ${i + 1}/${ids.length} · post ${ids[i]}`);
        try {
          const r = await callAudit<{ results: FixResult[] }>("wp-bulk-cleanup", { mode: "fix", post_ids: [ids[i]], dry_run: true, publish: autoPublish });
          all.push(...r.results);
        } catch (e: any) {
          all.push({ post_id: ids[i], ok: false, error: e.message });
        }
        setResults([...all]);
      }
      const wouldChange = all.filter((r) => r.ok && r.would_change).length;
      const noChange = all.filter((r) => r.ok && !r.would_change).length;
      toast({ title: `Dry-run complete`, description: `${wouldChange} would change, ${noChange} no-op. No posts modified.` });
    } catch (e: any) { toast({ title: "Dry-run failed", description: e.message, variant: "destructive" }); }
    setStatus(""); setFixing(false);
  };

  const rollbackBatch = async (ids: number[]): Promise<FixResult[]> => {
    const out: FixResult[] = [];
    for (let i = 0; i < ids.length; i += 1) {
      setStatus(`Rollback ${i + 1}/${ids.length} · post ${ids[i]}`);
      try {
        const r = await callAudit<{ results: FixResult[] }>("wp-bulk-cleanup", { mode: "rollback", post_ids: [ids[i]] });
        out.push(...r.results);
      } catch (e: any) {
        out.push({ post_id: ids[i], ok: false, error: e.message });
      }
    }
    return out;
  };

  const rollbackAllSucceeded = async () => {
    if (!results) return;
    const ids = results.filter((r) => r.ok && !r.dry_run && !r.rolled_back).map((r) => r.post_id);
    if (!ids.length) { toast({ title: "Nothing to rollback" }); return; }
    if (!confirm(`Rollback ${ids.length} post(s) to their pre-fix backup?`)) return;
    setFixing(true);
    const r = await rollbackBatch(ids);
    setResults((prev) => (prev || []).map((p) => {
      const m = r.find((x) => x.post_id === p.post_id);
      return m ? { ...p, ...m } : p;
    }));
    const ok = r.filter((x) => x.ok).length;
    toast({ title: `Rollback done`, description: `${ok}/${ids.length} restored.` });
    setStatus(""); setFixing(false);
  };


  // Post-publish verification — re-fetches the post via WP REST + live URL
  // (cache-busted) and reports whether the orphan CSS wrapper is correctly
  // re-wrapped on origin and absent on the live page.
  const verifyOne = async (postId: number, link?: string): Promise<Partial<FixResult>> => {
    try {
      const v = await callAudit<{
        ok: boolean; verdict: FixResult["verify_verdict"]; verified_at: string;
        rest: { found: boolean; wrapped: boolean }; live: { found: boolean };
      }>("wp-bulk-cleanup", { mode: "verify_post", post_id: postId, url: link, check_live: true });
      const status: VerifyStatus =
        v.verdict === "clean" ? "clean"
        : v.verdict === "stale_cache" ? "stale_cache"
        : (v.rest?.found || v.live?.found) ? "leak"
        : "clean";
      return { verify: status, verify_verdict: v.verdict, verified_at: v.verified_at };
    } catch (e: any) {
      return { verify: "error", verify_error: e?.message || String(e) };
    }
  };

  // Re-run fix on only the posts whose last result was non-2xx, errored, or
  // was rolled back. Useful for "Fix failed only" recovery passes.
  const fixFailedOnly = async () => {
    if (!results || !items) return;
    const failedIds = results
      .filter((r) => !r.dry_run && (
        !r.ok || r.rolled_back || (typeof r.http_status === "number" && (r.http_status < 200 || r.http_status >= 300))
      ))
      .map((r) => r.post_id);
    const uniqueIds = Array.from(new Set(failedIds));
    if (!uniqueIds.length) { toast({ title: "Nothing to retry", description: "No failed or rolled-back posts." }); return; }
    if (!confirm(`Retry ${uniqueIds.length} failed post(s)?${autoPublish ? " Each will also be republished." : ""}`)) return;
    setFixing(true);
    try {
      const all: FixResult[] = [...results];
      for (let i = 0; i < uniqueIds.length; i += 1) {
        const id = uniqueIds[i];
        setStatus(`Retry ${i + 1}/${uniqueIds.length} · post ${id}${autoPublish ? " (+publish)" : ""}`);
        try {
          const r = await callAudit<{ results: FixResult[] }>("wp-bulk-cleanup", {
            mode: "fix", post_ids: [id], publish: autoPublish, run_id: runId,
          });
          const next = r.results[0];
          const idx = all.findIndex((x) => x.post_id === id);
          if (idx >= 0) all[idx] = next; else all.push(next);
          setResults([...all]);
          if (next?.ok && autoVerify) {
            const link = items.find((it) => it.post_id === id)?.link;
            const v = await verifyOne(id, link);
            const idx2 = all.findIndex((x) => x.post_id === id);
            if (idx2 >= 0) all[idx2] = { ...all[idx2], ...v };
            setResults([...all]);
          }
        } catch (e: any) {
          const idx = all.findIndex((x) => x.post_id === id);
          const next: FixResult = { post_id: id, ok: false, error: e?.message || String(e) };
          if (idx >= 0) all[idx] = next; else all.push(next);
          setResults([...all]);
        }
      }
      const ok = all.filter((r) => uniqueIds.includes(r.post_id) && r.ok && !r.rolled_back).length;
      toast({ title: "Retry complete", description: `${ok}/${uniqueIds.length} fixed on retry.` });
    } catch (e: any) {
      toast({ title: "Retry interrupted", description: e.message, variant: "destructive" });
    }
    setStatus(""); setFixing(false);
  };

  const fixAll = async (resume = false) => {
    if (!items || items.length === 0) return;
    const willPublish = autoPublish;
    if (!resume && !confirm(`Re-wrap orphan CSS in ${items.length} post(s)?${willPublish ? " Each post will also be republished to flush CDN caches." : ""}${autoRollback ? " On failure, successfully-fixed posts will be auto-rolled-back." : ""}`)) return;
    setFixing(true);

    let processed: number[] = [];
    let priorResults: FixResult[] = results || [];
    if (resume) {
      try {
        const r = await callAudit<{ checkpoint: any }>("wp-bulk-cleanup", { mode: "checkpoint_load", key: CKPT_KEY });
        if (r.checkpoint?.phase === "fix") {
          processed = (r.checkpoint.processed_ids as number[]) || [];
          priorResults = (r.checkpoint.results as FixResult[]) || priorResults;
          setResults([...priorResults]);
        }
      } catch { /* ignore */ }
    }

    try {
      const ids = items.map((i) => i.post_id).filter((id) => !processed.includes(id));
      const all: FixResult[] = [...priorResults];
      const succeededThisBatch: number[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        setStatus(`Fixing ${i + 1}/${ids.length} · post ${ids[i]}${willPublish ? " (+publish)" : ""}`);
        try {
          const r = await callAudit<{ results: FixResult[]; fixed: number }>("wp-bulk-cleanup", {
            mode: "fix", post_ids: [ids[i]], publish: willPublish, run_id: runId,
          });
          all.push(...r.results);
          if (r.results[0]?.ok && !r.results[0]?.dry_run) succeededThisBatch.push(ids[i]);
          setResults([...all]);
          processed.push(ids[i]);
          await saveCheckpoint({ phase: "fix", page: 1, processed_ids: processed, affected: items, results: all });

          // Auto-verify after each successful fix.
          if (r.results[0]?.ok && !r.results[0]?.dry_run && autoVerify) {
            const link = items.find((it) => it.post_id === ids[i])?.link;
            const v = await verifyOne(ids[i], link);
            const idx = all.findIndex((x) => x.post_id === ids[i] && !x.dry_run);
            if (idx >= 0) all[idx] = { ...all[idx], ...v };
            setResults([...all]);
            await saveCheckpoint({ phase: "fix", page: 1, processed_ids: processed, affected: items, results: all });
          }

          if (!r.results[0]?.ok && autoRollback && succeededThisBatch.length > 0) {
            toast({ title: `Post ${ids[i]} failed`, description: `Auto-rolling back ${succeededThisBatch.length} previously-fixed post(s).`, variant: "destructive" });
            const rb = await rollbackBatch(succeededThisBatch);
            const merged = all.map((p) => {
              const m = rb.find((x) => x.post_id === p.post_id);
              return m ? { ...p, rolled_back: m.ok } : p;
            });
            setResults(merged);
            throw new Error(`Halted at post ${ids[i]}. Batch rolled back.`);
          }
        } catch (e: any) {
          if (autoRollback && succeededThisBatch.length > 0 && !/Halted/.test(e.message)) {
            const rb = await rollbackBatch(succeededThisBatch);
            const merged = all.map((p) => {
              const m = rb.find((x) => x.post_id === p.post_id);
              return m ? { ...p, rolled_back: m.ok } : p;
            });
            setResults(merged);
          }
          throw e;
        }
      }
      await clearCheckpoint();
      const ok = all.filter((r) => r.ok && !r.rolled_back && !r.dry_run).length;
      const failed = all.filter((r) => !r.ok).length;
      toast({ title: `Cleanup done`, description: `${ok} fixed, ${failed} failed${willPublish ? `, republished` : ""}.` });
    } catch (e: any) {
      toast({ title: "Cleanup interrupted", description: `${e.message}. Click Resume to continue.`, variant: "destructive" });
      setResumable({ phase: "fix", page: 0, processed: processed.length, updated_at: new Date().toISOString() });
    }
    setStatus(""); setFixing(false);
  };

  const publishAll = async () => {
    if (!items || items.length === 0) return;
    if (!confirm(`Force-republish ${items.length} post(s)? This bumps the modified date and re-fires WordPress publish hooks (purges page/CDN caches). Content is NOT changed.`)) return;
    setFixing(true);
    try {
      const ids = items.map((i) => i.post_id);
      const all: FixResult[] = [];
      for (let i = 0; i < ids.length; i += 1) {
        setStatus(`Republishing ${i + 1}/${ids.length} · post ${ids[i]}`);
        const r = await callAudit<{ results: FixResult[] }>("wp-bulk-cleanup", { mode: "publish", post_ids: [ids[i]] });
        all.push(...r.results);
        setResults([...all]);
      }
      const ok = all.filter((r) => r.ok).length;
      toast({ title: `Republish done`, description: `${ok}/${ids.length} republished.` });
    } catch (e: any) { toast({ title: "Republish failed", description: e.message, variant: "destructive" }); }
    setStatus(""); setFixing(false);
  };

  const scanUrl = async () => {
    if (!targetUrl.trim()) return;
    setTargetBusy(true);
    try {
      const r = await callAudit<{ affected: LeakItem[]; count: number }>("wp-bulk-cleanup", { mode: "scan_url", url: targetUrl.trim() });
      const affected = (r.affected || []).filter((a) => a.found);
      setItems(affected);
      setResults(null);
      toast({
        title: affected.length ? `Leak found in ${affected.length} post` : "No leak in this post",
        description: affected.length ? `Post ID ${affected[0].post_id} — click "Fix ${affected.length}" to clean it.` : "The WordPress origin REST content is clean.",
      });
    } catch (e: any) { toast({ title: "URL scan failed", description: e.message, variant: "destructive" }); }
    setTargetBusy(false);
  };

  const fixUrl = async () => {
    if (!targetUrl.trim()) return;
    setTargetBusy(true);
    try {
      const lookup = await callAudit<{ affected: LeakItem[] }>("wp-bulk-cleanup", { mode: "scan_url", url: targetUrl.trim() });
      const post = (lookup.affected || [])[0];
      if (!post) { toast({ title: "No matching post" }); setTargetBusy(false); return; }
      const r = await callAudit<{ results: FixResult[] }>("wp-bulk-cleanup", { mode: "fix", post_ids: [post.post_id], publish: autoPublish });
      setItems([{ ...post, found: true }]);
      const merged: FixResult[] = [...r.results];
      if (merged[0]?.ok && !merged[0]?.dry_run && autoVerify) {
        const v = await verifyOne(post.post_id, post.link);
        merged[0] = { ...merged[0], ...v };
      }
      setResults(merged);
      const res = merged[0];
      toast({
        title: res?.ok ? `Fixed post ${post.post_id}` : `Fix failed`,
        description: res?.ok
          ? `Removed ${res.removed_chars} chars of orphan wrappers${res.verify ? ` · verify: ${res.verify}` : ""}.`
          : (res?.error || "Unknown error"),
        variant: res?.ok ? undefined : "destructive",
      });
    } catch (e: any) { toast({ title: "URL fix failed", description: e.message, variant: "destructive" }); }
    setTargetBusy(false);
  };

  const verify = async () => {
    if (!targetUrl.trim()) return;
    setVerifyBusy(true);
    setVerifyResult(null);
    try {
      const r = await callAudit<Verdict>("wp-bulk-cleanup", { mode: "verify", url: targetUrl.trim() });
      setVerifyResult(r);
    } catch (e: any) { toast({ title: "Verify failed", description: e.message, variant: "destructive" }); }
    setVerifyBusy(false);
  };

  const exportJson = () => {
    if (!items) return;
    const payload = {
      generated_at: new Date().toISOString(),
      total: items.length,
      items: items.map((it) => ({
        ...it,
        fix: results?.find((r) => r.post_id === it.post_id) || null,
      })),
    };
    downloadFile(`audit-leaks-${Date.now()}.json`, JSON.stringify(payload, null, 2), "application/json");
  };
  const exportCsv = () => {
    if (!items) return;
    downloadFile(`audit-leaks-${Date.now()}.csv`, toCsv(items, results), "text/csv");
  };

  const verdictMeta: Record<Verdict["verdict"], { label: string; tone: string; explain: string }> = {
    clean: { label: "Clean", tone: "text-emerald-500", explain: "Both the live page (cache-busted) and the WordPress origin are clean. If you still see the leak, your browser is showing a stored copy — hard-refresh with Ctrl/Cmd + Shift + R." },
    stale_cache: { label: "Stale cache", tone: "text-amber-500", explain: "The WordPress origin is FIXED, but the live CDN/page cache still serves the old leak. Purge the CDN cache or wait for it to expire." },
    real_leak: { label: "Real leak", tone: "text-destructive", explain: "Both the live page and the origin still contain the leak. Run Fix on this URL." },
    origin_only: { label: "Origin only", tone: "text-amber-500", explain: "The origin REST content still has the leak but the rendered live HTML doesn't. Run Fix to normalize the source." },
  };

  return (
    <Card className="mb-6 border-destructive/40">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <CardTitle className="text-base">Site-wide CSS leak cleanup</CardTitle>
            <p className="text-xs text-muted-foreground mt-1">Scans every published post for orphan CSS rendered as visible text (the <code>.gutf-article {`{ ... !important }`}</code> block at the top of posts). The fix re-wraps the orphan CSS in a single <code>&lt;style&gt;</code> tag inside the post — preserving the design, removing the visible leak.</p>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <Button size="sm" variant="outline" onClick={() => scan(false)} disabled={scanning || fixing}>
              {scanning ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
              {scanning && status ? status : "Scan all posts"}
            </Button>
            <Button size="sm" variant="secondary" onClick={dryRunAll} disabled={fixing || scanning || !items || items.length === 0} title="Preview which posts would change without writing anything">
              Dry-run {items?.length ?? 0}
            </Button>
            <Button size="sm" variant="destructive" onClick={() => fixAll(false)} disabled={fixing || scanning || !items || items.length === 0}>
              {fixing ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
              {fixing && status ? status : `Fix ${items?.length ?? 0} posts`}
            </Button>
            <Button size="sm" variant="default" onClick={publishAll} disabled={fixing || scanning || !items || items.length === 0} title="Force-republish (bumps modified date, purges CDN). Does not modify content.">
              Republish {items?.length ?? 0}
            </Button>
            <Button size="sm" variant="outline" onClick={rollbackAllSucceeded} disabled={fixing || scanning || !results?.some((r) => r.ok && !r.dry_run && !r.rolled_back)} title="Restore previously-fixed posts to their pre-fix backup">
              Rollback fixed
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={fixFailedOnly}
              disabled={fixing || scanning || !results?.some((r) => !r.dry_run && (!r.ok || r.rolled_back || (typeof r.http_status === "number" && (r.http_status < 200 || r.http_status >= 300))))}
              title="Re-run fix only on posts whose last result was non-2xx, errored, or was rolled back"
            >
              Fix failed only
            </Button>
            {resumable && (
              <Button size="sm" variant="default" onClick={() => (resumable.phase === "fix" ? fixAll(true) : scan(true))} disabled={scanning || fixing} title={`Resume interrupted ${resumable.phase} from ${resumable.updated_at}`}>
                Resume {resumable.phase} ({resumable.processed} done)
              </Button>
            )}
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none ml-1">
              <input type="checkbox" checked={autoPublish} onChange={(e) => setAutoPublish(e.target.checked)} className="size-3.5 accent-primary" />
              Auto-publish on Fix
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none">
              <input type="checkbox" checked={autoRollback} onChange={(e) => setAutoRollback(e.target.checked)} className="size-3.5 accent-primary" />
              Auto-rollback on failure
            </label>
            <label className="flex items-center gap-1.5 text-xs text-muted-foreground cursor-pointer select-none" title="After every successful fix/republish, re-fetch the post via REST + live URL (cache-busted) to confirm the orphan CSS is correctly re-wrapped.">
              <input type="checkbox" checked={autoVerify} onChange={(e) => setAutoVerify(e.target.checked)} className="size-3.5 accent-primary" />
              Auto-verify after publish
            </label>
            <Button size="sm" variant="outline" onClick={exportCsv} disabled={!items || items.length === 0}>Export CSV</Button>
            <Button size="sm" variant="outline" onClick={exportJson} disabled={!items || items.length === 0}>Export JSON</Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="border rounded-md p-3 space-y-3 bg-muted/20">
          <div className="text-sm font-medium">Targeted URL · scan / fix / verify (cache-busted)</div>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="https://gearuptofit.com/review/some-post/"
              value={targetUrl}
              onChange={(e) => setTargetUrl(e.target.value)}
              className="flex-1 min-w-[260px]"
            />
            <Button size="sm" variant="outline" onClick={scanUrl} disabled={targetBusy || !targetUrl.trim()}>
              {targetBusy ? <Loader2 className="size-4 animate-spin" /> : "Scan URL"}
            </Button>
            <Button size="sm" variant="destructive" onClick={fixUrl} disabled={targetBusy || !targetUrl.trim()}>
              Fix URL
            </Button>
            <Button size="sm" variant="outline" onClick={verify} disabled={verifyBusy || !targetUrl.trim()}>
              {verifyBusy ? <Loader2 className="size-4 animate-spin" /> : "Verify (cache-bust)"}
            </Button>
          </div>
          {verifyResult && (
            <div className="text-xs space-y-2 border-t pt-3">
              <div className="flex items-center gap-2">
                <span className="font-medium">Verdict:</span>
                <span className={`font-bold ${verdictMeta[verifyResult.verdict].tone}`}>
                  {verdictMeta[verifyResult.verdict].label}
                </span>
                <span className="text-muted-foreground">· HTTP {verifyResult.liveStatus} · {verifyResult.liveBytes.toLocaleString()} bytes</span>
              </div>
              <p className="text-muted-foreground">{verdictMeta[verifyResult.verdict].explain}</p>
              <div className="grid md:grid-cols-2 gap-2">
                <div className="border rounded p-2">
                  <div className="font-medium">Live HTML (cache-busted)</div>
                  <div className={verifyResult.live.found ? "text-destructive" : "text-emerald-500"}>
                    {verifyResult.live.found ? "Leak present" : "Clean"}
                  </div>
                  {verifyResult.live.sample && <div className="text-muted-foreground mt-1 truncate">{verifyResult.live.sample}</div>}
                </div>
                <div className="border rounded p-2">
                  <div className="font-medium">WordPress origin (REST)</div>
                  <div className={verifyResult.rest.found ? "text-destructive" : "text-emerald-500"}>
                    {verifyResult.rest.found ? "Leak present" : "Clean"}
                  </div>
                  {verifyResult.post_id && <div className="text-muted-foreground mt-1">post_id: {verifyResult.post_id}</div>}
                </div>
              </div>
              {Object.keys(verifyResult.cacheHeaders).length > 0 && (
                <details className="text-muted-foreground">
                  <summary className="cursor-pointer">Cache headers</summary>
                  <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px]">{Object.entries(verifyResult.cacheHeaders).map(([k, v]) => `${k}: ${v}`).join("\n")}</pre>
                </details>
              )}
              <a href={verifyResult.liveUrl} target="_blank" rel="noreferrer" className="text-primary underline inline-flex items-center gap-1">
                Open cache-busted URL <ExternalLink className="size-3" />
              </a>
            </div>
          )}
        </div>

        {items && items.length === 0 && !scanning && (
          <div className="text-sm text-emerald-500">No posts contain leaked CSS. ✓</div>
        )}
        {items && items.length > 0 && (
          <div className="overflow-x-auto border rounded-md max-h-96">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left sticky top-0">
                <tr>
                  <th className="p-2">ID</th>
                  <th className="p-2">Title</th>
                  <th className="p-2">Result</th>
                  <th className="p-2">Publish</th>
                  <th className="p-2">HTTP</th>
                  <th className="p-2">Diff</th>
                  <th className="p-2" title="Post-publish verification: re-fetch via REST + live URL (cache-busted) to confirm the orphan CSS is correctly re-wrapped.">Verified</th>
                  <th className="p-2">When</th>
                </tr>
              </thead>
              <tbody>
                {items.map((it) => {
                  const res = results?.find((r) => r.post_id === it.post_id);
                  const ts = res?.completed_at ? new Date(res.completed_at).toLocaleTimeString() : "";
                  return (
                    <tr key={it.post_id} className="border-t">
                      <td className="p-2 font-medium">{it.post_id}</td>
                      <td className="p-2"><a className="text-primary hover:underline" href={it.link} target="_blank" rel="noreferrer">{it.title}</a></td>
                      <td className="p-2">
                        {!res ? <span className="text-muted-foreground">pending</span>
                          : res.dry_run ? (res.would_change
                              ? <span className="text-amber-500">would change · −{res.removed_chars}c</span>
                              : <span className="text-muted-foreground">no change</span>)
                          : res.rolled_back ? <span className="text-amber-500">↺ rolled back</span>
                          : res.ok ? <span className="text-emerald-500">✓ removed {res.removed_chars}c</span>
                          : <span className="text-destructive">✗ {res.error}</span>}
                      </td>
                      <td className="p-2">
                        {res?.published ? <Badge variant="secondary">published</Badge>
                          : res?.would_publish ? <Badge variant="outline">would publish</Badge>
                          : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 font-mono">
                        {res?.http_status ? (
                          <span className={res.http_status >= 200 && res.http_status < 300 ? "text-emerald-500" : "text-destructive"}>{res.http_status}</span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </td>
                      <td className="p-2 text-muted-foreground">
                        {res?.diff ? `Δ${res.diff.chars_delta}c · −${res.diff.wrapper_tags_removed}p · +${res.diff.style_tags_added}<style>` : "—"}
                      </td>
                      <td className="p-2">
                        {!res?.verify ? <span className="text-muted-foreground">—</span>
                          : res.verify === "checking" ? <span className="text-muted-foreground">checking…</span>
                          : res.verify === "clean" ? <span className="text-emerald-500" title={`Verdict: ${res.verify_verdict ?? "clean"}`}>✓ wrapped</span>
                          : res.verify === "stale_cache" ? <span className="text-amber-500" title="Origin clean, CDN stale">⏳ stale CDN</span>
                          : res.verify === "leak" ? <span className="text-destructive" title={`Verdict: ${res.verify_verdict ?? "leak"}`}>✗ leak</span>
                          : <span className="text-amber-500" title={res.verify_error}>? error</span>}
                      </td>
                      <td className="p-2 text-muted-foreground">{ts || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}


function DiagnosticPanel({ diagnostics, loading, onRetry }: { diagnostics: Diagnostics | null; loading: boolean; onRetry: () => void }) {
  const a = diagnostics?.authoritative;
  const pages = diagnostics?.pages || [];
  const missing = diagnostics?.missingFromCache || [];
  return (
    <Card className="mb-6">
      <CardHeader className="pb-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <CardTitle className="text-base">WordPress Import Diagnostics</CardTitle>
          <Button size="sm" variant="outline" onClick={onRetry} disabled={loading || !diagnostics?.run}>
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Retry missing pages
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3 text-sm">
          <MiniStat label="WP total" value={a?.totalPublished ?? "—"} />
          <MiniStat label="Cached" value={a?.cachedCount ?? "—"} />
          <MiniStat label="Missing" value={a?.difference ?? "—"} className={a?.complete ? "text-emerald-500" : "text-destructive"} />
          <MiniStat label="Pages" value={a ? `${pages.filter((p) => p.status === "success").length}/${a.totalPages}` : "—"} />
          <MiniStat label="First gap" value={diagnostics?.firstMissingPage ?? "none"} />
        </div>

        {pages.length > 0 && (
          <div className="overflow-x-auto border rounded-md">
            <table className="w-full text-xs">
              <thead className="bg-muted/40 text-left">
                <tr>
                  <th className="p-2">Page</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">Retries</th>
                  <th className="p-2">Imported</th>
                  <th className="p-2">IDs</th>
                  <th className="p-2">Error</th>
                </tr>
              </thead>
              <tbody>
                {pages.map((p) => (
                  <tr key={p.page} className="border-t">
                    <td className="p-2 font-medium">{p.page}</td>
                    <td className="p-2"><Badge variant={p.status === "success" ? "secondary" : p.status === "failed" ? "destructive" : "outline"}>{p.status}</Badge></td>
                    <td className="p-2">{p.retry_count}</td>
                    <td className="p-2">{p.imported_count}</td>
                    <td className="p-2 text-muted-foreground max-w-xs truncate">{(p.post_ids || []).slice(0, 12).join(", ")}{(p.post_ids?.length || 0) > 12 ? "…" : ""}</td>
                    <td className="p-2 text-destructive max-w-xs truncate">{p.error || ""}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}

        {missing.length > 0 && (
          <div className="space-y-2">
            <div className="text-sm font-medium">Missing from cache ({missing.length} shown)</div>
            <div className="grid md:grid-cols-2 gap-2 text-xs">
              {missing.slice(0, 60).map((m) => (
                <div key={m.id} className="border rounded-md p-2">
                  <span className="font-medium">#{m.id}</span> <span className="text-muted-foreground">/{m.slug}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function MiniStat({ label, value, className = "" }: { label: string; value: number | string; className?: string }) {
  return (
    <div className="rounded-md border p-3">
      <div className="text-xs text-muted-foreground uppercase tracking-wide">{label}</div>
      <div className={`text-xl font-bold ${className}`}>{value}</div>
    </div>
  );
}

function PostDrawer({ post, score, onClose }: { post: Post | null; score?: ScoreRow; onClose: () => void }) {
  const [fixes, setFixes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);
  const [overhaulResult, setOverhaulResult] = useState<{ ok: boolean; changes: string[]; message: string; content_source?: string; verification?: any } | null>(null);
  const [linkSugs, setLinkSugs] = useState<any[] | null>(null);
  const [linkBusy, setLinkBusy] = useState(false);
  const [linkApplied, setLinkApplied] = useState<{ applied: number; links: any[] } | null>(null);

  useEffect(() => { setFixes(null); setOverhaulResult(null); setLinkSugs(null); setLinkApplied(null); }, [post?.post_id]);

  if (!post) return null;

  const generate = async (force = false) => {
    setBusy(true);
    try {
      const r = await callAudit<{ fixes: any }>("audit-generate-fixes", { post_id: post.post_id, force });
      setFixes(r.fixes);
    } catch (e: any) { toast({ title: "AI failed", description: e.message, variant: "destructive" }); }
    setBusy(false);
  };

  const fullOverhaul = async () => {
    if (!fixes) { toast({ title: "Generate AI fixes first" }); return; }
    if (!confirm(`FULL OVERHAUL — applies all changes to LIVE post ${post.post_id}:\n\n• Wraps tables/iframes for mobile responsiveness\n• Strips fixed pixel widths\n• Adds lazy-loading to images\n• Injects intro, FAQ section, conclusion (idempotent — safe to re-run)\n• Adds JSON-LD schema\n• Adds responsive CSS guard\n• Updates meta title + description\n\nProceed?`)) return;
    setPushing(true);
    try {
      const r = await callAudit<{ ok: boolean; changes: string[]; message: string; content_source?: string; verification?: any }>("wp-overhaul", { post_id: post.post_id, fixes });
      setOverhaulResult({ ok: !!r.ok, changes: r.changes || [], message: r.message || "", content_source: r.content_source, verification: r.verification });
      toast({ title: r.ok ? `Verified overhaul ${post.post_id}` : "Overhaul not applied", description: r.message, variant: r.ok ? "default" : "destructive" });
    } catch (e: any) { toast({ title: "Overhaul failed", description: e.message, variant: "destructive" }); }
    setPushing(false);
  };

  const pushDraft = async () => {
    if (!fixes) return;
    if (!confirm("SAFE PUSH: only title/excerpt update + suggestions stored in post meta. Use Full Overhaul to inject FAQ/intro/conclusion/schema directly.")) return;
    setPushing(true);
    try {
      const r = await callAudit<{ draft_url: string; message: string }>("wp-push-draft", { post_id: post.post_id, fixes });
      toast({ title: "Draft pushed", description: r.message });
      if (r.draft_url) window.open(r.draft_url, "_blank");
    } catch (e: any) { toast({ title: "Push failed", description: e.message, variant: "destructive" }); }
    setPushing(false);
  };

  const revertDraft = async () => {
    if (!confirm("Revert this post's draft to match the current LIVE content?")) return;
    setPushing(true);
    try {
      const r = await callAudit<{ ok: boolean; message?: string }>("wp-push-draft", { post_id: post.post_id, mode: "revert" });
      toast({ title: r.ok ? "Draft reverted" : "Revert failed", description: r.message || "" });
    } catch (e: any) { toast({ title: "Revert failed", description: e.message, variant: "destructive" }); }
    setPushing(false);
  };

  const fetchLinkSuggestions = async () => {
    setLinkBusy(true);
    try {
      const r = await callAudit<{ suggestions: any[] }>("audit-link-optimizer", { mode: "suggest", post_id: post.post_id, max: 8 });
      setLinkSugs(r.suggestions || []);
      if (!r.suggestions?.length) toast({ title: "No link opportunities found" });
    } catch (e: any) { toast({ title: "Link optimizer failed", description: e.message, variant: "destructive" }); }
    setLinkBusy(false);
  };

  const applyLinks = async () => {
    if (!linkSugs?.length) return;
    if (!confirm(`Insert ${linkSugs.length} internal link(s) directly into LIVE post ${post.post_id}? Idempotent — re-running won't duplicate.`)) return;
    setLinkBusy(true);
    try {
      const r = await callAudit<{ applied: number; links: any[] }>("audit-link-optimizer", {
        mode: "apply", post_id: post.post_id, suggestions: linkSugs, max: linkSugs.length,
      });
      setLinkApplied({ applied: r.applied, links: r.links });
      toast({ title: `Inserted ${r.applied} link(s)`, description: r.links.map((l: any) => l.anchor).join(", ") });
    } catch (e: any) { toast({ title: "Apply failed", description: e.message, variant: "destructive" }); }
    setLinkBusy(false);
  };

  const cwv = (score?.metrics as any)?.cwv;

  return (
    <Sheet open={!!post} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
        <SheetHeader>
          <SheetTitle dangerouslySetInnerHTML={{ __html: post.title }} />
        </SheetHeader>
        <div className="mt-4 space-y-4">
          <div className="flex items-center gap-3">
            <span className={`text-4xl font-bold ${scoreColor(score?.score ?? 0)}`}>{score?.score ?? "—"}</span>
            <a href={post.link} target="_blank" rel="noreferrer" className="text-sm text-primary inline-flex items-center gap-1">
              View live <ExternalLink className="size-3" />
            </a>
            <Button onClick={revertDraft} disabled={pushing} variant="outline" size="sm" className="ml-auto">
              Revert draft to live
            </Button>
          </div>

          {score?.issues && score.issues.length > 0 && (
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base flex items-center gap-2"><AlertTriangle className="size-4" /> Issues</CardTitle></CardHeader>
              <CardContent className="space-y-2">
                {score.issues.map((i, idx) => (
                  <div key={idx} className="flex items-start gap-2 text-sm">
                    <Badge variant={sevColor(i.severity) as any}>{i.severity}</Badge>
                    <div><span className="font-medium">{i.code}</span> — {i.message}</div>
                  </div>
                ))}
              </CardContent>
            </Card>
          )}

          {cwv && (
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-base flex items-center gap-2">
                  Core Web Vitals
                  <Badge variant={cwv.score >= 80 ? "default" : cwv.score >= 60 ? "secondary" : "destructive"}>
                    {cwv.score}/100
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs grid grid-cols-3 gap-3">
                <div>
                  <div className="font-semibold mb-1 flex items-center gap-2">LCP <Badge variant="outline">{cwv.lcpScore ?? "—"}</Badge></div>
                  <div className="text-muted-foreground">Hero priority: {cwv.lcp?.heroFetchPriority ? "✓" : "✗"}</div>
                  <div className="text-muted-foreground">Hero lazy: {cwv.lcp?.heroLazy ? "⚠ yes" : "✓ no"}</div>
                  <div className="text-muted-foreground">Format: {cwv.lcp?.heroFormat}</div>
                  <div className="text-muted-foreground">Eager above-fold: {cwv.lcp?.eagerAboveFold}</div>
                  <div className="text-muted-foreground">Oversized imgs: {cwv.lcp?.oversizedImages ?? 0}</div>
                </div>
                <div>
                  <div className="font-semibold mb-1 flex items-center gap-2">CLS <Badge variant="outline">{cwv.clsScore ?? "—"}</Badge></div>
                  <div className="text-muted-foreground">Imgs no-dims: {cwv.cls?.imagesMissingDims}</div>
                  <div className="text-muted-foreground">Iframes no-dims: {cwv.cls?.iframesMissingDims}</div>
                  <div className="text-muted-foreground">Ads no-reserve: {cwv.cls?.adsWithoutReserve}</div>
                  <div className="text-muted-foreground">Tables unwrapped: {cwv.cls?.unwrappedTables ?? 0}</div>
                  <div className="text-muted-foreground">Fixed iframes: {cwv.cls?.fixedWidthIframes ?? 0}</div>
                </div>
                <div>
                  <div className="font-semibold mb-1 flex items-center gap-2">INP <Badge variant="outline">{cwv.inpScore ?? "—"}</Badge></div>
                  <div className="text-muted-foreground">Inline scripts: {cwv.inp?.inlineScripts}</div>
                  <div className="text-muted-foreground">Heavy: {cwv.inp?.heavyInlineScripts}</div>
                  <div className="text-muted-foreground">Blocking: {cwv.inp?.blockingScripts}</div>
                  <div className="text-muted-foreground">DOM nodes: {cwv.domNodes}</div>
                  <div className="text-muted-foreground">Overflow elems: {cwv.layoutOverflowCount ?? 0}</div>
                </div>
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Internal linking optimizer</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {!linkSugs && (
                <Button onClick={fetchLinkSuggestions} disabled={linkBusy} size="sm" className="w-full" variant="outline">
                  {linkBusy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                  Find best internal links
                </Button>
              )}
              {linkSugs && linkSugs.length > 0 && (
                <>
                  <div className="space-y-2">
                    {linkSugs.map((s, i) => (
                      <div key={i} className="text-xs p-2 border rounded-md">
                        <div className="flex items-center gap-2 mb-1">
                          <Badge variant="secondary">{(s.relevance * 100).toFixed(0)}%</Badge>
                          <span className="font-medium truncate">{s.anchor}</span>
                          <span className="text-muted-foreground">→</span>
                          <a className="text-primary truncate" href={s.targetUrl} target="_blank" rel="noreferrer">{s.targetTitle}</a>
                        </div>
                        <div className="text-muted-foreground italic truncate">{s.contextSnippet}</div>
                        <div className="text-muted-foreground">{s.reason}</div>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Button onClick={fetchLinkSuggestions} disabled={linkBusy} size="sm" variant="outline">
                      <RefreshCw className="size-4 mr-1" /> Refresh
                    </Button>
                    <Button onClick={applyLinks} disabled={linkBusy} size="sm" className="flex-1">
                      {linkBusy ? <Loader2 className="size-4 animate-spin mr-2" /> : null}
                      Apply {linkSugs.length} link(s) to live post
                    </Button>
                  </div>
                </>
              )}
              {linkSugs && linkSugs.length === 0 && (
                <p className="text-xs text-muted-foreground">No high-confidence link opportunities — content already well-linked or no topical matches.</p>
              )}
              {linkApplied && (
                <div className="text-xs p-2 rounded-md bg-emerald-500/10 border">
                  <div className="font-medium text-emerald-500">Inserted {linkApplied.applied} link(s)</div>
                  {linkApplied.links.map((l, i) => (
                    <div key={i} className="text-muted-foreground">→ {l.anchor}</div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {!fixes && (
            <Button onClick={() => generate(false)} disabled={busy} className="w-full">
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
              Generate AI fixes
            </Button>
          )}

          {fixes && (
            <div className="space-y-3">
              <div className="flex gap-2">
                <Button size="sm" variant="outline" onClick={() => generate(true)} disabled={busy}>
                  {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <RefreshCw className="size-4 mr-2" />}
                  Regenerate
                </Button>
              </div>
              <FixBlock label="Primary keyword" value={fixes.primaryKeyword || "—"} />
              <FixBlock label="Meta title" value={fixes.metaTitle || ""} />
              <FixBlock label="Meta description" value={fixes.metaDescription || ""} />
              {fixes.introHtml && <FixBlock label="Intro (HTML, ready to inject)" value={fixes.introHtml} mono />}
              {!fixes.introHtml && fixes.introParagraph && <FixBlock label="Intro" value={fixes.introParagraph} />}
              {fixes.h2Outline && <FixBlock label="H2 outline" value={(fixes.h2Outline || []).join("\n")} />}
              {fixes.faqHtml && <FixBlock label="FAQ HTML (full overhaul block)" value={fixes.faqHtml} mono />}
              {fixes.faq && (
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">FAQ preview ({fixes.faq.length})</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {fixes.faq.map((f: any, i: number) => (
                      <div key={i}><div className="font-medium">{f.q}</div><div className="text-muted-foreground">{f.a}</div></div>
                    ))}
                  </CardContent></Card>
              )}
              {fixes.conclusionHtml && <FixBlock label="Bottom Line / Conclusion HTML" value={fixes.conclusionHtml} mono />}
              {fixes.internalLinks && (
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Internal links</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {fixes.internalLinks.map((l: any, i: number) => (
                      <div key={i}><a className="text-primary" href={l.url} target="_blank" rel="noreferrer">{l.anchor}</a></div>
                    ))}
                  </CardContent></Card>
              )}
              {fixes.jsonLd && <FixBlock label="JSON-LD schema" value={JSON.stringify(fixes.jsonLd, null, 2)} mono />}

              <Button onClick={fullOverhaul} disabled={pushing} className="w-full" variant="destructive">
                {pushing ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
                FULL OVERHAUL — apply all to live post
              </Button>
              {overhaulResult && (
                <div className={`text-xs p-3 border rounded-md ${overhaulResult.ok ? "bg-emerald-500/10" : "bg-destructive/10"}`}>
                  <div className={`font-medium mb-1 ${overhaulResult.ok ? "text-emerald-500" : "text-destructive"}`}>
                    {overhaulResult.ok ? "Overhaul applied and verified" : "Overhaul was not applied"}
                  </div>
                  <div className="text-muted-foreground">{overhaulResult.message}</div>
                  {overhaulResult.content_source && <div className="mt-1 text-muted-foreground">Source: {overhaulResult.content_source}</div>}
                  {overhaulResult.verification && (
                    <div className="mt-1 text-muted-foreground">
                      Saved markers: {overhaulResult.verification.rest_has_signals ? "yes" : "no"} · Live slot: {String(overhaulResult.verification.live_has_content_slot ?? "unknown")} · Live markers: {overhaulResult.verification.live_has_signals ? "yes" : "no"}
                    </div>
                  )}
                  <div className="mt-1 flex flex-wrap gap-1">
                    {overhaulResult.changes.map((c, i) => <Badge key={i} variant="secondary">{c}</Badge>)}
                  </div>
                </div>
              )}
              <Button onClick={pushDraft} disabled={pushing} className="w-full" variant="outline">
                {pushing ? <Loader2 className="size-4 animate-spin mr-2" /> : <Send className="size-4 mr-2" />}
                Safe push (title + suggestions only)
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Full Overhaul writes intro/FAQ/conclusion/JSON-LD/responsive CSS directly to live content. Idempotent (safe to re-run). Safe push only updates title/excerpt.
              </p>
            </div>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}

function FixBlock({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <Card>
      <CardHeader className="pb-2"><CardTitle className="text-sm">{label}</CardTitle></CardHeader>
      <CardContent>
        <pre className={`text-sm whitespace-pre-wrap ${mono ? "font-mono text-xs" : ""}`}>{value}</pre>
      </CardContent>
    </Card>
  );
}

export default function AuditPage() {
  const [authed, setAuthed] = useState(!!getAuditPw());
  useEffect(() => {
    document.title = "SEO Audit Dashboard · Private";
    let m = document.querySelector('meta[name="robots"]') as HTMLMetaElement | null;
    if (!m) { m = document.createElement("meta"); m.name = "robots"; document.head.appendChild(m); }
    m.content = "noindex,nofollow";
  }, []);
  return authed
    ? <Dashboard onLogout={() => { clearAuditPw(); setAuthed(false); }} />
    : <LoginGate onAuth={() => setAuthed(true)} />;
}
