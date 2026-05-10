import { useEffect, useState } from "react";
import { Settings2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/hooks/use-toast";
import {
  type LlmProvider, type LlmSettings,
  PROVIDER_LABELS, DEFAULT_MODELS,
  getLlmSettings, setLlmSettings, clearLlmSettings,
} from "@/lib/llmSettings";

const KEY_HELP: Record<LlmProvider, string> = {
  lovable: "Uses your Lovable AI workspace balance. No key needed.",
  openai: "Get a key at platform.openai.com → API keys (sk-…).",
  anthropic: "Get a key at console.anthropic.com → API Keys (sk-ant-…).",
  gemini: "Get a key at aistudio.google.com/apikey (AIza…).",
  openrouter: "Get a key at openrouter.ai/keys (sk-or-…). Any model slug works.",
};

const MODEL_PLACEHOLDER: Record<LlmProvider, string> = {
  lovable: "google/gemini-2.5-flash",
  openai: "gpt-4o, gpt-4o-mini, gpt-5, o1, …",
  anthropic: "claude-3-5-sonnet-20241022, claude-opus-4-…",
  gemini: "gemini-2.5-pro, gemini-2.5-flash, …",
  openrouter: "anthropic/claude-3.5-sonnet, openai/gpt-4o, x-ai/grok-…",
};

export function LlmSettingsDialog() {
  const [open, setOpen] = useState(false);
  const [provider, setProvider] = useState<LlmProvider>("lovable");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState(DEFAULT_MODELS.lovable);
  const [active, setActive] = useState<LlmSettings>(getLlmSettings());

  useEffect(() => {
    if (open) {
      const s = getLlmSettings();
      setProvider(s.provider);
      setApiKey(s.apiKey);
      setModel(s.model);
    }
  }, [open]);

  const save = () => {
    if (provider !== "lovable" && !apiKey.trim()) {
      toast({ title: "API key required", description: "Add a key or pick Lovable AI.", variant: "destructive" });
      return;
    }
    const next: LlmSettings = {
      provider,
      apiKey: apiKey.trim(),
      model: (model || DEFAULT_MODELS[provider]).trim(),
    };
    setLlmSettings(next);
    setActive(next);
    toast({ title: "LLM settings saved", description: `${PROVIDER_LABELS[provider]} · ${next.model}` });
    setOpen(false);
  };

  const reset = () => {
    clearLlmSettings();
    const s = getLlmSettings();
    setActive(s);
    setProvider(s.provider); setApiKey(s.apiKey); setModel(s.model);
    toast({ title: "Reverted to Lovable AI" });
  };

  const activeLabel =
    active.provider === "lovable" ? "Lovable AI" : `${PROVIDER_LABELS[active.provider].split(" ")[0]} · ${active.model}`;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <Settings2 className="size-4" />
          <span className="hidden sm:inline">LLM</span>
          <Badge variant={active.provider === "lovable" ? "secondary" : "default"} className="ml-1">
            {activeLabel}
          </Badge>
        </Button>
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-5" /> Content engine — choose your LLM
          </DialogTitle>
          <DialogDescription>
            Bring your own key. Used only for AI content generation in this dashboard.
            Stored in your browser session — never persisted server-side.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label>Provider</Label>
            <Select value={provider} onValueChange={(v) => {
              const p = v as LlmProvider;
              setProvider(p);
              setModel(DEFAULT_MODELS[p]);
            }}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {(Object.keys(PROVIDER_LABELS) as LlmProvider[]).map((p) => (
                  <SelectItem key={p} value={p}>{PROVIDER_LABELS[p]}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">{KEY_HELP[provider]}</p>
          </div>

          {provider !== "lovable" && (
            <div className="space-y-2">
              <Label>API key</Label>
              <Input
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="Paste API key"
                autoComplete="off"
              />
            </div>
          )}

          <div className="space-y-2">
            <Label>Model {provider === "openrouter" && <span className="text-xs text-muted-foreground">(any OpenRouter slug)</span>}</Label>
            <Input
              value={model}
              onChange={(e) => setModel(e.target.value)}
              placeholder={MODEL_PLACEHOLDER[provider]}
            />
            <p className="text-xs text-muted-foreground">
              Default: <code>{DEFAULT_MODELS[provider]}</code>
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="ghost" onClick={reset}>Reset to Lovable AI</Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
