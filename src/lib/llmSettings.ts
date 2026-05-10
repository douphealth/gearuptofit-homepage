// User-supplied LLM credentials for the audit content engine (BYOK).
// Stored in sessionStorage only — never sent anywhere except the audit
// edge functions where it is forwarded to the chosen provider directly.

export type LlmProvider = "lovable" | "openai" | "anthropic" | "gemini" | "openrouter";

export type LlmSettings = {
  provider: LlmProvider;
  apiKey: string;     // ignored when provider === "lovable"
  model: string;      // free-form for openrouter / overridable elsewhere
};

const KEY = "audit_llm";

export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  lovable: "Lovable AI (default — uses workspace balance)",
  openai: "OpenAI",
  anthropic: "Anthropic (Claude)",
  gemini: "Google Gemini",
  openrouter: "OpenRouter (any model)",
};

export const DEFAULT_MODELS: Record<LlmProvider, string> = {
  lovable: "google/gemini-2.5-flash",
  openai: "gpt-4o",
  anthropic: "claude-3-5-sonnet-20241022",
  gemini: "gemini-2.5-pro",
  openrouter: "anthropic/claude-3.5-sonnet",
};

export function getLlmSettings(): LlmSettings {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (raw) {
      const p = JSON.parse(raw) as LlmSettings;
      if (p && p.provider) return { provider: p.provider, apiKey: p.apiKey || "", model: p.model || DEFAULT_MODELS[p.provider] };
    }
  } catch { /* ignore */ }
  return { provider: "lovable", apiKey: "", model: DEFAULT_MODELS.lovable };
}

export function setLlmSettings(s: LlmSettings) {
  sessionStorage.setItem(KEY, JSON.stringify(s));
}

export function clearLlmSettings() {
  sessionStorage.removeItem(KEY);
}

// Body fragment forwarded with every audit call. Server uses it for
// AI-powered functions (audit-generate-fixes); other functions ignore it.
export function llmBody() {
  const s = getLlmSettings();
  if (s.provider === "lovable") return {};
  if (!s.apiKey) return {};
  return { _llm: { provider: s.provider, apiKey: s.apiKey, model: s.model || DEFAULT_MODELS[s.provider] } };
}
