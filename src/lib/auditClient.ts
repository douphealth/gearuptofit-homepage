import { supabase } from "@/integrations/supabase/client";

const KEY = "audit_pw";

export function getAuditPw(): string | null {
  return sessionStorage.getItem(KEY);
}

export function setAuditPw(pw: string) {
  sessionStorage.setItem(KEY, pw);
}

export function clearAuditPw() {
  sessionStorage.removeItem(KEY);
}

export async function verifyAuditPassword(password: string): Promise<boolean> {
  const { data, error } = await supabase.functions.invoke("audit-verify", { body: { password } });
  if (error) return false;
  return !!data?.ok;
}

const FN_BASE = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1`;

export async function callAudit<T = any>(path: string, opts: { method?: string; body?: any; query?: Record<string, string> } = {}): Promise<T> {
  const pw = getAuditPw();
  if (!pw) throw new Error("Not authenticated");
  const url = new URL(`${FN_BASE}/${path}`);
  if (opts.query) Object.entries(opts.query).forEach(([k, v]) => url.searchParams.set(k, v));
  const r = await fetch(url.toString(), {
    method: opts.method || "GET",
    headers: {
      "Content-Type": "application/json",
      "x-audit-password": pw,
      "apikey": import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY,
      "Authorization": `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}`,
    },
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });
  const text = await r.text();
  let json: any;
  try { json = JSON.parse(text); } catch { json = { raw: text }; }
  if (!r.ok) throw new Error(json?.error || `Request failed: ${r.status}`);
  return json as T;
}
