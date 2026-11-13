import { useEffect, useRef, useState } from "react";
import { ChevronDown, RefreshCw } from "lucide-react";
import { connectionsNeedingModel } from "./keyring";
import { lastAiAnswer, type LastAnswer } from "./liveAiStatus";
import { activeConnection, clearModelCache, fetchLiveModels, recommendFor, selectModel, type ProviderModels, type WorkspaceId } from "./modelChoices";
import type { KeyringEntry } from "./keyring";

/**
 * Switch the AI model without leaving the workspace. The choice is the one
 * central AI Access setting, so it applies to all five workspaces. Models come
 * live from each connected provider; the recommended one is marked for this workspace.
 */
export function AiModelSwitcher({ workspace, className = "" }: { workspace: WorkspaceId; className?: string }) {
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState<KeyringEntry | undefined>();
  const [providers, setProviders] = useState<ProviderModels[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsModel, setNeedsModel] = useState<string[]>([]);
  const [answer, setAnswer] = useState<LastAnswer | null>(lastAiAnswer.get());
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => lastAiAnswer.subscribe(setAnswer), []);

  useEffect(() => {
    activeConnection().then(setActive).catch(() => setActive(undefined));
    connectionsNeedingModel().then(setNeedsModel).catch(() => setNeedsModel([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  async function load(force: boolean) {
    setLoading(true);
    setError(null);
    try {
      if (force) clearModelCache();
      setProviders(await fetchLiveModels(force));
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load models.");
    } finally {
      setLoading(false);
    }
  }

  async function choose(provider: string, model: string) {
    const r = await selectModel(provider, model);
    if (!r.ok) { setError(r.error ?? "Could not save your choice."); return; }
    setActive(await activeConnection());
    setNeedsModel(await connectionsNeedingModel().catch(() => []));
    setOpen(false);
  }

  const label = active ? `${active.model}` : needsModel.length ? "Choose a model" : "No AI connected";

  return (
    <div className={`relative ${className}`} ref={ref}>
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); if (!providers) void load(false); }}
        aria-expanded={open}
        aria-label="AI model"
        title={active ? `Active model: ${active.model} (${active.provider})` : "Connect an AI in AI Access"}
        className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
      >
        <span className={`w-1.5 h-1.5 rounded-full shrink-0 ${active ? "bg-emerald-500" : "bg-amber-500"}`} aria-hidden="true" />
        <span className="max-w-[140px] truncate">{label}</span>
        <ChevronDown className="w-3 h-3" aria-hidden="true" />
      </button>
      {answer && (
        <span role="status" className={`ml-1.5 text-[10px] ${answer.switched ? "text-[color:var(--state-warning)]" : "text-[color:var(--text-muted)]"}`} title="Which model answered your last AI step">
          {answer.switched ? "Backup answered: " : "Answered by "}{answer.label}
        </span>
      )}
      {open && (
        <div className="absolute right-0 mt-2 w-80 max-h-96 overflow-y-auto p-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shadow-xl z-50 space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">AI model</span>
            <button type="button" onClick={() => void load(true)} disabled={loading} aria-label="Refresh models" className="p-1 rounded hover:bg-[color:var(--surface-hover)] disabled:opacity-50">
              <RefreshCw className={`w-3 h-3 ${loading ? "animate-spin" : ""}`} aria-hidden="true" />
            </button>
          </div>
          {needsModel.length > 0 && (
            <p role="status" className="text-xs text-[color:var(--state-warning)]">
              {needsModel.join(", ")} {needsModel.length === 1 ? "is" : "are"} connected but not used yet: pick a model below.
            </p>
          )}
          {error && <p role="alert" className="text-xs text-[color:var(--state-danger)]">{error}</p>}
          {loading && !providers && <p className="text-xs text-[color:var(--text-muted)]" role="status">Loading the models your providers offer…</p>}
          {providers && providers.length === 0 && <p className="text-xs text-[color:var(--text-muted)]">No cloud provider is connected. Local models are chosen in AI Access.</p>}
          {providers?.map((p) => {
            const { recommended, why, ranked } = recommendFor(workspace, p.models);
            return (
              <div key={p.provider}>
                <p className="text-[11px] font-semibold text-[color:var(--text-primary)] capitalize">{p.provider}</p>
                {p.error && <p className="text-[11px] text-[color:var(--state-danger)]">{p.error}</p>}
                <ul className="mt-1 space-y-0.5">
                  {ranked.map((m) => {
                    const isActive = active?.provider === p.provider && active.model === m.id;
                    return (
                      <li key={m.id}>
                        <button
                          type="button"
                          onClick={() => void choose(p.provider, m.id)}
                          aria-current={isActive}
                          className={`w-full text-left px-2 py-1.5 rounded-lg text-xs hover:bg-[color:var(--surface-hover)] ${isActive ? "bg-[color:var(--surface-hover)] font-semibold" : ""}`}
                        >
                          <span>{m.displayName ?? m.id}</span>
                          {recommended?.id === m.id && (
                            <span className="ml-1.5 rounded bg-emerald-500/15 px-1 py-0.5 text-[10px] text-emerald-700 dark:text-emerald-300" title={`Suits ${why}`}>Recommended here</span>
                          )}
                          {m.badges.map((b) => <span key={b.id} title={b.evidence} className="ml-1 text-[10px] text-[color:var(--text-muted)]">{b.label}</span>)}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
