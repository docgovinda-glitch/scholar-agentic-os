import { useState } from "react";
import { Loader2, RotateCcw, Sparkles, Wand2 } from "lucide-react";
import type { AssignmentStructure } from "../types";

/**
 * Who wrote the outline, and a way to change it in plain words. A starter
 * outline (made offline, not from the brief) is labelled as such and can be
 * rewritten from the brief by the student's AI; an AI outline can be revised
 * on request ("add a section on ethics", "make it 3,000 words") and undone.
 */
export default function OutlineByAiPanel({
  structure,
  onRewrite,
  onRestore,
}: {
  structure: AssignmentStructure | null | undefined;
  onRewrite: (instruction?: string) => Promise<{ ok: true; structure: AssignmentStructure } | { ok: false; error: string }>;
  onRestore: (previous: AssignmentStructure) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [request, setRequest] = useState("");
  const [previous, setPrevious] = useState<AssignmentStructure | null>(null);
  const fromAi = structure?.source === "ai";

  const run = async (instruction?: string) => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const before = structure ?? null;
    const result = await onRewrite(instruction);
    setBusy(false);
    if (result.ok) {
      setPrevious(before);
      // Clear only the request that was sent; text typed meanwhile stays.
      if (instruction) setRequest((cur) => (cur.trim() === instruction ? "" : cur));
    } else {
      setError(result.error);
    }
  };

  // The outline always comes from the brief; no "starter outline" notice is shown.
  if (!fromAi) return null;

  return (
    <section aria-label="Outline" className="mb-3 rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-ink-750 p-3 space-y-2" data-testid="outline-by-ai">
      {fromAi ? (
        <p className="text-[11px] text-neutral-600 dark:text-neutral-400 flex items-center gap-1.5">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0" aria-hidden="true" />
          {structure?.rationale || "Written by your AI from your brief."}
        </p>
      ) : null}

      {fromAi && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (request.trim()) void run(request.trim());
          }}
          className="flex items-center gap-1.5"
        >
          <label htmlFor="outline-change" className="sr-only">
            Change the outline
          </label>
          <input
            id="outline-change"
            value={request}
            onChange={(e) => setRequest(e.target.value)}
            placeholder="Ask for a change, e.g. add a section on ethics"
            maxLength={600}
            className="flex-1 min-w-0 rounded-lg border border-neutral-200 dark:border-white/10 bg-transparent px-2.5 py-1.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500"
          />
          <button
            type="submit"
            disabled={busy || !request.trim()}
            className="shrink-0 inline-flex items-center gap-1 rounded-lg bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 px-2.5 py-1.5 text-xs font-semibold cursor-pointer disabled:opacity-50"
          >
            {busy ? <Loader2 className="w-3.5 h-3.5 animate-spin" aria-hidden="true" /> : null}
            Change
          </button>
        </form>
      )}

      {previous && !busy && (
        <button
          type="button"
          onClick={async () => {
            const p = previous;
            setPrevious(null);
            await onRestore(p);
          }}
          className="inline-flex items-center gap-1 text-[11px] text-neutral-600 dark:text-neutral-400 underline cursor-pointer"
        >
          <RotateCcw className="w-3 h-3" aria-hidden="true" /> Undo the last outline change
        </button>
      )}

      {error && (
        <p role="alert" className="text-[11px] text-red-700 dark:text-red-400">
          {error}
        </p>
      )}
    </section>
  );
}
