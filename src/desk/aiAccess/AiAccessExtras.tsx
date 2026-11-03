import { useEffect, useState } from "react";
import { ExternalLink, Loader2, RefreshCw } from "lucide-react";
import { getCloudProvider } from "../../config/providerCatalog";
import { getLocalRunner } from "../../config/localRunnerCatalog";
import { routeDecision, type RoutingDecision, type RoutingTaskType } from "./aiAccessApi";

/** A provider id as the person knows it. */
export function providerLabel(id: string): string {
  if (id === "premium") return "Scholar Core Premium";
  return getCloudProvider(id)?.name ?? getLocalRunner(id)?.name ?? id;
}

const TASKS: Array<{ type: RoutingTaskType; label: string }> = [
  { type: "reasoning", label: "Research, drafting and reviews" },
  { type: "literatureDiscovery", label: "Finding and reading sources" },
  { type: "long-context", label: "Long documents" },
  { type: "simple", label: "Quick replies and small edits" },
];

/**
 * Which AI each kind of task would use right now, and what it falls back to,
 * from the same router the server uses for real requests (no AI is called).
 */
export function LiveRouting({ refreshKey, privacy }: { refreshKey: string; privacy?: "no-cloud" | "any" }) {
  const [rows, setRows] = useState<Record<string, RoutingDecision | { error: string }>>({});
  const [loading, setLoading] = useState(true);
  const [tick, setTick] = useState(0);

  useEffect(() => {
    let alive = true;
    setLoading(true);
    Promise.all(
      TASKS.map((t) =>
        routeDecision(t.type, privacy)
          .then((d) => [t.type, d] as const)
          .catch((e: unknown) => [t.type, { error: e instanceof Error ? e.message : "Routing could not be checked." }] as const)
      )
    ).then((pairs) => {
      if (!alive) return;
      setRows(Object.fromEntries(pairs));
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [refreshKey, privacy, tick]);

  return (
    <section aria-label="How tasks are routed now" className="rounded-2xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 p-5 space-y-3 shadow-2xs">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Which AI does what, right now</h3>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400">Worked out from what you have connected, by the same router your requests use. Nothing is sent to any AI to check this.</p>
        </div>
        <button type="button" onClick={() => setTick((n) => n + 1)} disabled={loading} aria-label="Check routing again" className="p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-neutral-800 cursor-pointer disabled:opacity-50">
          {loading ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : <RefreshCw className="w-3.5 h-3.5" aria-hidden="true" />}
        </button>
      </div>
      <ul className="divide-y divide-slate-100 dark:divide-neutral-800">
        {TASKS.map((t) => {
          const d = rows[t.type];
          let main: string;
          let sub = "";
          let ok = false;
          if (!d) main = loading ? "Checking…" : "Not checked";
          else if ("error" in d) main = d.error;
          else if (d.ok) {
            ok = true;
            main = `${providerLabel(d.choice.providerId)}${d.choice.modelId ? ` · ${d.choice.modelId}` : ""}`;
            sub = d.fallbacks.length ? `Then ${d.fallbacks.slice(0, 2).map((f) => providerLabel(f.providerId)).join(", ")}${d.fallbacks.length > 2 ? ` and ${d.fallbacks.length - 2} more` : ""} if it is unavailable` : "No fallback connected";
          } else main = d.reasoning;
          return (
            <li key={t.type} className="py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-1">
              <span className="text-xs font-semibold text-slate-700 dark:text-neutral-300">{t.label}</span>
              <span className="text-right">
                <span className={`block text-xs ${ok ? "font-semibold text-slate-900 dark:text-white" : "text-amber-700 dark:text-amber-400"}`}>{main}</span>
                {sub && <span className="block text-[11px] text-slate-500 dark:text-neutral-400">{sub}</span>}
              </span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}

const QUICK_START: Array<{ id: string; kind: "cloud" | "local"; badge: string; time: string }> = [
  { id: "gemini", kind: "cloud", badge: "Free key, no card", time: "About 2 minutes" },
  { id: "groq", kind: "cloud", badge: "Free key, very fast", time: "About 2 minutes" },
  { id: "ollama", kind: "local", badge: "Private, on your computer", time: "About 10 minutes" },
];

/** Three good ways to start, for someone who has never connected an AI. */
export function QuickStart({ onOpen }: { onOpen: (id: string) => void }) {
  return (
    <section aria-label="Get started" className="rounded-2xl border border-slate-200/90 dark:border-neutral-800 bg-white dark:bg-neutral-900/90 p-5 space-y-3 shadow-2xs">
      <div>
        <h3 className="text-sm font-bold tracking-tight text-slate-900 dark:text-white">Connect an AI to get started</h3>
        <p className="mt-0.5 text-xs text-slate-500 dark:text-neutral-400 max-w-xl">
          Scholar uses your own AI account. Pick one; you can add more later and Scholar will choose between them for each task.
        </p>
      </div>
      <ol className="grid gap-3 md:grid-cols-3">
        {QUICK_START.map((q, i) => {
          const cloud = q.kind === "cloud" ? getCloudProvider(q.id) : undefined;
          const local = q.kind === "local" ? getLocalRunner(q.id) : undefined;
          const name = cloud?.name ?? local?.name ?? q.id;
          const description = cloud?.description ?? local?.description ?? "";
          const link = cloud?.getKeyUrl ?? local?.installUrl;
          return (
            <li key={q.id} className="rounded-xl border border-slate-200/90 dark:border-neutral-800 p-4 flex flex-col gap-2">
              <div className="flex items-center justify-between gap-2">
                <span className="text-sm font-bold text-slate-900 dark:text-white">
                  {i === 0 ? "Recommended: " : ""}
                  {name}
                </span>
                <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-400 border border-emerald-200/80 dark:border-emerald-800/60 shrink-0">{q.badge}</span>
              </div>
              <p className="text-xs text-slate-500 dark:text-neutral-400 flex-1">{description}</p>
              <p className="text-[11px] text-slate-500 dark:text-neutral-400">{q.time}</p>
              <div className="flex items-center gap-2 flex-wrap">
                <button type="button" onClick={() => onOpen(q.id)} className="rounded-lg bg-slate-900 hover:bg-black dark:bg-white dark:text-slate-950 text-white px-3 py-1.5 text-xs font-semibold cursor-pointer">
                  Set up {name}
                </button>
                {link && (
                  <a href={link} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-xs underline text-slate-600 dark:text-neutral-300">
                    {q.kind === "cloud" ? "Get a key" : "Download"} <ExternalLink className="w-3 h-3" aria-hidden="true" />
                  </a>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
