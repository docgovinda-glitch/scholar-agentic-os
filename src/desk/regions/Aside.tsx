import { useState } from "react";
import { waiveFinding } from "../api";
import type { Finding, ProjectView, RubricReport } from "../types";

const SEVERITY_ORDER: Finding["severity"][] = ["blocking", "required", "advisory"];
const SEVERITY_LABEL: Record<Finding["severity"], string> = {
  blocking: "Blocking",
  required: "Required",
  advisory: "Advisory",
};
const SEVERITY_COLOR: Record<Finding["severity"], string> = {
  blocking: "text-[color:var(--state-danger)] border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)]",
  required: "text-[color:var(--state-warning)] border-[color:var(--accent-border)] bg-[color:var(--state-warning-subtle)]",
  advisory: "text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]",
};

/**
 * One finding, rendered per docs 20 §5.4's shared shape: [severity] [what]
 * [where] → [action]. A `warn`-status finding is, by construction, always a
 * `fail` that a waiver downgraded (domain/compliance/types.ts's
 * isEffectivelyWaived — no evaluator produces "warn" any other way), so it
 * is shown as already waived rather than offered the action again. Blocking
 * findings never get a Waive action: the server 400s on them by design
 * (docs 31 §3 — "Waivable: No"), and offering an action guaranteed to fail
 * is worse than not offering one (UX5).
 */
function FindingRow({
  finding,
  waiving,
  busy,
  onStartWaive,
  onReasonChange,
  onCancelWaive,
  onConfirmWaive,
}: {
  finding: Finding;
  waiving: string | null;
  busy: boolean;
  onStartWaive: () => void;
  onReasonChange: (reason: string) => void;
  onCancelWaive: () => void;
  onConfirmWaive: () => void;
}) {
  if (finding.status === "pass" || finding.status === "not_applicable") return null;
  const canWaive = finding.status === "fail" && finding.severity !== "blocking";

  return (
    <li className={`rounded-[var(--radius-md)] border px-3 py-2 text-xs ${SEVERITY_COLOR[finding.severity]}`}>
      <div className="mb-1 flex items-center justify-between gap-2">
        <span>{SEVERITY_LABEL[finding.severity]}</span>
        {finding.status === "warn" && <span className="text-[color:var(--text-muted)]">Waived</span>}
      </div>
      <div>{finding.message}</div>
      {finding.location?.sectionKey && (
        <div className="mt-0.5 text-[10px] opacity-70">Section: {finding.location.sectionKey}</div>
      )}
      {finding.remedy && <div className="mt-1 text-[10px] opacity-90">→ {finding.remedy}</div>}

      {canWaive && waiving === null && (
        <button
          type="button"
          onClick={onStartWaive}
          className="mt-1.5 text-[10px] text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
        >
          Waive
        </button>
      )}

      {/* UX3: the server requires a reason too, so this is not client-side
          theatre — a waiver is a judgement call recorded against the
          submission, not a dismissal. */}
      {waiving !== null && (
        <div className="mt-2 flex flex-col gap-1.5">
          <label htmlFor={`waive-${finding.ruleId}`} className="text-[10px] text-[color:var(--text-secondary)]">
            Why is this okay to waive?
          </label>
          <input
            id={`waive-${finding.ruleId}`}
            type="text"
            value={waiving}
            autoFocus
            onChange={(e) => onReasonChange(e.target.value)}
            className="w-full px-2 py-1 text-xs"
          />
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onConfirmWaive}
              disabled={busy || waiving.trim() === ""}
              className="rounded-[var(--radius-sm)] border border-[color:var(--border-control)] px-2 py-1 text-[10px] text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              {busy ? "Waiving…" : "Waive"}
            </button>
            <button
              type="button"
              onClick={onCancelWaive}
              className="text-[10px] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </li>
  );
}

/** Region D (docs 22 §2/§3): Studio (top) and Compliance (below) panels,
 * stacked per the spec's ASCII mockup. Citations and Chat still aren't
 * built — no Corpus API for the former, no project-scoped assistant for
 * the latter. */
export default function Aside({
  projectId,
  rubric,
  sessionId,
  onChanged,
}: {
  projectId: string;
  rubric: RubricReport | null;
  sessionId: string;
  onChanged: (updated: ProjectView, rubric: RubricReport) => void;
}) {
  const unresolved = rubric?.findings.filter((f) => f.status === "fail" || f.status === "warn") ?? [];
  const [waiving, setWaiving] = useState<{ ruleId: string; reason: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleConfirmWaive() {
    if (!waiving || !waiving.reason.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await waiveFinding(projectId, waiving.ruleId, waiving.reason.trim());
      onChanged(result, result.rubric);
      setWaiving(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <aside className="flex w-72 shrink-0 flex-col overflow-y-auto border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
      <div className="flex flex-col">
        <div className="border-b border-[color:var(--border-subtle)] px-3 py-2 text-xs text-[color:var(--text-secondary)]">
          Compliance {unresolved.length > 0 && <span className="text-[color:var(--state-warning)]">· {unresolved.length}</span>}
        </div>
        <div className="p-2">
          {!rubric ? (
            <p className="p-2 text-xs text-[color:var(--text-muted)]">Requirements are checked once a document is submitted.</p>
          ) : (
            <>
              {error && (
                <p role="alert" className="mb-2 px-2 text-xs text-[color:var(--state-danger)]">
                  {error}
                </p>
              )}
              {unresolved.length === 0 ? (
                <p className="p-2 text-xs text-[color:var(--text-muted)]">Nothing blocking you. Requirements are checked as you write.</p>
              ) : (
                <ul className="flex flex-col gap-2">
                  {SEVERITY_ORDER.flatMap((sev) =>
                    unresolved
                      .filter((f) => f.severity === sev)
                      .map((f) => (
                        <FindingRow
                          key={f.ruleId}
                          finding={f}
                          waiving={waiving?.ruleId === f.ruleId ? waiving.reason : null}
                          busy={busy}
                          onStartWaive={() => setWaiving({ ruleId: f.ruleId, reason: "" })}
                          onReasonChange={(reason) => setWaiving({ ruleId: f.ruleId, reason })}
                          onCancelWaive={() => setWaiving(null)}
                          onConfirmWaive={handleConfirmWaive}
                        />
                      ))
                  )}
                </ul>
              )}
            </>
          )}
        </div>
      </div>
      <div className="border-t border-[color:var(--border-subtle)] px-3 py-2 text-xs text-[color:var(--text-muted)]">
        Citations, Chat — not yet built
      </div>
    </aside>
  );
}
