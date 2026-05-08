import { useEffect, useMemo, useState } from "react";
import { Loader2, RefreshCw, ShieldCheck, LogOut, ExternalLink, Sparkles, Send, AlertTriangle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "@/hooks/use-toast";
import {
  verifyAuditPassword, setAuditPw, getAuditPw, clearAuditPw, callAudit,
} from "@/lib/auditClient";

type Issue = { severity: "critical" | "high" | "polish"; code: string; message: string };
type ScoreRow = { post_id: number; score: number; issues: Issue[]; metrics: any; scanned_at: string };
type Post = { post_id: number; slug: string; title: string; link: string; modified_at: string; data: any };

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
  const [selected, setSelected] = useState<Post | null>(null);

  const load = async (force = false) => {
    setLoading(true);
    try {
      const r = await callAudit<{ posts: Post[] }>("wp-fetch-posts", { method: "GET", query: force ? { force: "1" } : {} });
      setPosts(r.posts || []);
      // also fetch scores via direct supabase
      const ids = (r.posts || []).map((p) => p.post_id);
      if (ids.length) {
        const { data } = await (await import("@/integrations/supabase/client")).supabase
          .from("audit_scores").select("*").in("post_id", ids);
        const map: Record<number, ScoreRow> = {};
        (data || []).forEach((s: any) => { map[s.post_id] = s; });
        setScores(map);
      }
    } catch (e: any) { toast({ title: "Load failed", description: e.message, variant: "destructive" }); }
    setLoading(false);
  };

  const runScan = async () => {
    setScanning(true);
    try {
      const r = await callAudit<{ scanned: number; avgScore: number }>("audit-score", { method: "POST", body: {} });
      toast({ title: `Scanned ${r.scanned} posts`, description: `Avg score ${r.avgScore}` });
      await load();
    } catch (e: any) { toast({ title: "Scan failed", description: e.message, variant: "destructive" }); }
    setScanning(false);
  };

  useEffect(() => { load(); }, []);

  const ranked = useMemo(() => {
    const arr = posts.map((p) => ({ post: p, score: scores[p.post_id] }));
    let f = arr.filter(({ post }) => post.title?.toLowerCase().includes(filter.toLowerCase()));
    if (sevFilter !== "all") {
      f = f.filter(({ score }) => score?.issues?.some((i) => i.severity === sevFilter));
    }
    return f.sort((a, b) => (a.score?.score ?? 999) - (b.score?.score ?? 999));
  }, [posts, scores, filter, sevFilter]);

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
            <RefreshCw className={`size-4 mr-2 ${loading ? "animate-spin" : ""}`} /> Refresh WP
          </Button>
          <Button size="sm" onClick={runScan} disabled={scanning}>
            <Sparkles className={`size-4 mr-2 ${scanning ? "animate-spin" : ""}`} /> Re-score all
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

      <div className="flex flex-wrap gap-2 mb-4">
        <Input placeholder="Filter by title…" value={filter} onChange={(e) => setFilter(e.target.value)} className="max-w-xs" />
        {(["all", "critical", "high"] as const).map((s) => (
          <Button key={s} size="sm" variant={sevFilter === s ? "default" : "outline"} onClick={() => setSevFilter(s)}>
            {s}
          </Button>
        ))}
      </div>

      <Card>
        <CardContent className="p-0 overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-left">
              <tr>
                <th className="p-3">Score</th>
                <th className="p-3">Title</th>
                <th className="p-3 hidden md:table-cell">Issues</th>
                <th className="p-3 hidden lg:table-cell">Updated</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {ranked.map(({ post, score }) => (
                <tr key={post.post_id} className="border-t hover:bg-muted/20">
                  <td className={`p-3 font-bold ${scoreColor(score?.score ?? 0)}`}>{score?.score ?? "—"}</td>
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
              ))}
              {!ranked.length && !loading && (
                <tr><td colSpan={5} className="p-8 text-center text-muted-foreground">No posts. Click "Refresh WP" then "Re-score all".</td></tr>
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

function PostDrawer({ post, score, onClose }: { post: Post | null; score?: ScoreRow; onClose: () => void }) {
  const [fixes, setFixes] = useState<any>(null);
  const [busy, setBusy] = useState(false);
  const [pushing, setPushing] = useState(false);

  useEffect(() => { setFixes(null); }, [post?.post_id]);

  if (!post) return null;

  const generate = async () => {
    setBusy(true);
    try {
      const r = await callAudit<{ fixes: any }>("audit-generate-fixes", { method: "POST", body: { post_id: post.post_id } });
      setFixes(r.fixes);
    } catch (e: any) { toast({ title: "AI failed", description: e.message, variant: "destructive" }); }
    setBusy(false);
  };

  const pushDraft = async () => {
    if (!fixes) return;
    if (!confirm("Push these changes as a DRAFT to WordPress? Your live post will NOT change until you publish in wp-admin.")) return;
    setPushing(true);
    try {
      // Build payload: prepend FAQ as HTML + JSON-LD script
      const faqHtml = (fixes.faq || []).map((f: any) => `<h3>${f.q}</h3><p>${f.a}</p>`).join("\n");
      const jsonLd = fixes.jsonLd ? `<script type="application/ld+json">${JSON.stringify(fixes.jsonLd)}</script>` : "";
      const intro = fixes.introParagraph ? `<p><strong>${fixes.introParagraph}</strong></p>` : "";
      const original = post.data?.content?.rendered || "";
      const newContent = `${intro}\n${original}\n<h2>Frequently Asked Questions</h2>\n${faqHtml}\n${jsonLd}`;
      const r = await callAudit<{ draft_url: string; message: string }>("wp-push-draft", {
        method: "POST",
        body: {
          post_id: post.post_id,
          payload: {
            title: fixes.metaTitle || undefined,
            content: newContent,
            excerpt: fixes.metaDescription || undefined,
          },
        },
      });
      toast({ title: "Draft pushed", description: r.message });
      if (r.draft_url) window.open(r.draft_url, "_blank");
    } catch (e: any) { toast({ title: "Push failed", description: e.message, variant: "destructive" }); }
    setPushing(false);
  };

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

          {!fixes && (
            <Button onClick={generate} disabled={busy} className="w-full">
              {busy ? <Loader2 className="size-4 animate-spin mr-2" /> : <Sparkles className="size-4 mr-2" />}
              Generate AI fixes
            </Button>
          )}

          {fixes && (
            <div className="space-y-3">
              <FixBlock label="Meta title" value={fixes.metaTitle} />
              <FixBlock label="Meta description" value={fixes.metaDescription} />
              <FixBlock label="Intro paragraph" value={fixes.introParagraph} />
              {fixes.h2Outline && <FixBlock label="H2 outline" value={fixes.h2Outline.join("\n")} />}
              {fixes.faq && (
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">FAQ ({fixes.faq.length})</CardTitle></CardHeader>
                  <CardContent className="space-y-2 text-sm">
                    {fixes.faq.map((f: any, i: number) => (
                      <div key={i}><div className="font-medium">{f.q}</div><div className="text-muted-foreground">{f.a}</div></div>
                    ))}
                  </CardContent></Card>
              )}
              {fixes.internalLinks && (
                <Card><CardHeader className="pb-2"><CardTitle className="text-sm">Internal links</CardTitle></CardHeader>
                  <CardContent className="space-y-1 text-sm">
                    {fixes.internalLinks.map((l: any, i: number) => (
                      <div key={i}><a className="text-primary" href={l.url} target="_blank" rel="noreferrer">{l.anchor}</a></div>
                    ))}
                  </CardContent></Card>
              )}
              {fixes.jsonLd && <FixBlock label="JSON-LD schema" value={JSON.stringify(fixes.jsonLd, null, 2)} mono />}

              <Button onClick={pushDraft} disabled={pushing} className="w-full" variant="default">
                {pushing ? <Loader2 className="size-4 animate-spin mr-2" /> : <Send className="size-4 mr-2" />}
                Push as DRAFT to WordPress
              </Button>
              <p className="text-xs text-muted-foreground text-center">
                Safe: writes status=draft only. Your live post won't change until you click Publish in wp-admin.
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
