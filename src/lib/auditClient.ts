import { supabase } from "@/integrations/supabase/client";

const KEY = "audit_pw";

export function getAuditPw(): string | null {
  return sessionStorage.getItem(KEY);
}
export function setAuditPw(pw: string) { sessionStorage.setItem(KEY, pw); }
export function clearAuditPw() { sessionStorage.removeItem(KEY); }

export async function verifyAuditPassword(password: string): Promise<boolean> {
  const { data } = await supabase.functions.invoke("audit-verify", { body: { password } });
  return !!data?.ok;
}

export async function callAudit<T = any>(
  path: string,
  body: Record<string, any> = {},
): Promise<T> {
  const pw = getAuditPw();
  if (!pw) throw new Error("Not authenticated");
  const { data, error } = await supabase.functions.invoke(path, {
    body: { ...body, _audit_password: pw },
  });
  if (error) {
    // Try to extract server-provided error from FunctionsHttpError
    let msg = error.message || "Request failed";
    try {
      const ctx: any = (error as any).context;
      if (ctx?.json) { const j = await ctx.json(); if (j?.error) msg = j.error; }
    } catch { /* ignore */ }
    throw new Error(msg);
  }
  return data as T;
}
