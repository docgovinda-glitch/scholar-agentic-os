import { useState } from "react";
import { invalidateGate, signOffGate } from "../api";
import type { GateSummary, ProjectView } from "../types";

/**
 * The eight gates (docs 30 §3) — status, and the two transitions that move a
 * project through them.
 *
 * Desk displayed gate status from the beginning but could not change it: the
 * signoff and invalidate endpoints were among the eight of seventeen project
 * routes it never called. Intake could reach "ready" and then stop, with
 * nothing able to sign it off.
 *
 * WHY A GATE IS BLOCKED, honestly. `isReadyToSignOff` is
 * `entrySatisfied && every blocking exit criterion satisfied`, and those are
 * two different problems needing two different answers:
 *
 *   * exit criteria unsatisfied → the work in THIS gate is not finished, and
 *     `outstandingBlocking` names what is missing.
 *   * entry prerequisites unmet → an EARLIER gate is not signed off, and
 *     nothing done here will help.
 *
 * `GateSummary` carries `outstandingBlocking` but not `entrySatisfied`, so the
 * second case is inferred from status: `initialProjectGateState` marks only G0
 * as entry-satisfied, and `signOffGate` promotes a gate from `not_started` to
 * `in_progress` the moment its prerequisites are met. So `not_started` means
 * exactly "waiting on an earlier gate". Without that distinction the panel
 * would show a gate with no listed blockers, sit there, and then surface a 409
 * — which is the "this action is unavailable" non-answer UX5 rules out.
 */

const STATUS_LABEL: Record<GateSummary["status"], string> = {
  not_started: "Waiting",
  in_progress: "In progress",
  ready: "Ready to sign off",
  signed_off: "Signed off",
  invalidated: "Reopened",
};

export default function GatesPanel({
  projectId,
  project,
  actor,
  onChanged,
}: {
  projectId: string;
  project: ProjectView;
  /** Recorded on the signoff. The signed-in user. */
  actor: string;
  onChanged: (updated: ProjectView) => void;
}) {
  const [busyGate, setBusyGate] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Which gate is mid-invalidation, and the reason typed so far. */
  const [reopening, setReopening] = useState<{ gate: string; reason: string } | null>(null);

  async function handleSignOff(gate: string) {
    setBusyGate(gate);
    setError(null);
    try {
      onChanged(await signOffGate(projectId, gate, actor));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyGate(null);
    }
  }

  async function handleInvalidate() {
    if (!reopening || !reopening.reason.trim()) return;
    setBusyGate(reopening.gate);
    setError(null);
    try {
      onChanged(await invalidateGate(projectId, reopening.gate, reopening.reason.trim()));
      setReopening(null);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusyGate(null);
    }
  }

  return (
    <div className="mx-auto w-full max-w-2xl px-6 py-8">
      <header className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">Progress</h2>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          Each stage is signed off by you before the next one opens. Nothing advances on its own.
        </p>
      </header>

      {error && (
        <p
          role="alert"
          className="mb-5 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-danger-subtle)] px-3 py-2 text-sm text-[color:var(--state-danger)]"
        >
          {error}
        </p>
      )}

      <ol className="flex flex-col gap-2" aria-label="Gates">
        {project.gates.map((gate) => (
          <li key={gate.gate}>
            <GateRow
              gate={gate}
              busy={busyGate === gate.gate}
              reopening={reopening?.gate === gate.gate ? reopening.reason : null}
              onSignOff={() => handleSignOff(gate.gate)}
              onStartReopen={() => setReopening({ gate: gate.gate, reason: "" })}
              onReasonChange={(reason) => setReopening({ gate: gate.gate, reason })}
              onCancelReopen={() => setReopening(null)}
              onConfirmReopen={handleInvalidate}
            />
          </li>
        ))}
      </ol>
    </div>
  );
}

function GateRow({
  gate,
  busy,
  reopening,
  onSignOff,
  onStartReopen,
  onReasonChange,
  onCancelReopen,
  onConfirmReopen,
}: {
  gate: GateSummary;
  busy: boolean;
  reopening: string | null;
  onSignOff: () => void;
  onStartReopen: () => void;
  onReasonChange: (reason: string) => void;
  onCancelReopen: () => void;
  onConfirmReopen: () => void;
}) {
  const signedOff = gate.status === "signed_off";
  // See the module comment: only G0 begins entry-satisfied, and a gate leaves
  // "not_started" as soon as its prerequisites are met.
  const waitingOnEarlierGate = gate.status === "not_started";
  const canSignOff = !signedOff && !waitingOnEarlierGate && gate.outstandingBlocking.length === 0;

  return (
    <div
      className={[
        "rounded-[var(--radius-md)] border px-4 py-3",
        signedOff
          ? "border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]"
          : "border-[color:var(--border-default)] bg-[color:var(--surface-raised)]",
      ].join(" ")}
    >
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <span className="text-sm font-medium text-[color:var(--text-primary)]">
          <span className="text-[color:var(--text-muted)]">{gate.gate}</span> {gate.name}
        </span>
        {/* Status carries meaning, so it is a word rather than only a colour
            (21 §5.2 — never by colour alone). */}
        <span
          className={[
            "text-xs",
            signedOff
              ? "text-[color:var(--state-success)]"
              : gate.status === "ready"
                ? "text-[color:var(--accent)]"
                : "text-[color:var(--text-muted)]",
          ].join(" ")}
        >
          {STATUS_LABEL[gate.status]}
        </span>
      </div>

      {/* UX5: every blocked action states what is blocking it and what would
          unblock it. The two causes are genuinely different problems. */}
      {waitingOnEarlierGate && !signedOff && (
        <p className="mt-1.5 text-xs text-[color:var(--text-muted)]">
          Opens once the stages before it are signed off.
        </p>
      )}

      {!waitingOnEarlierGate && !signedOff && gate.outstandingBlocking.length > 0 && (
        <ul className="mt-2 flex flex-col gap-1">
          {gate.outstandingBlocking.map((item) => (
            <li key={item} className="text-xs text-[color:var(--text-secondary)]">
              · {item}
            </li>
          ))}
        </ul>
      )}

      {canSignOff && (
        <button
          type="button"
          onClick={onSignOff}
          disabled={busy}
          className="mt-3 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {busy ? "Signing off…" : `Sign off ${gate.gate}`}
        </button>
      )}

      {signedOff && reopening === null && (
        <button
          type="button"
          onClick={onStartReopen}
          className="mt-2 text-xs text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
        >
          Reopen this stage
        </button>
      )}

      {/* Deliberate friction (UX3): reopening discards approvals downstream of
          this gate, so it asks for a reason and will not proceed without one.
          The server requires it too — this is not client-side theatre. */}
      {reopening !== null && (
        <div className="mt-3 flex flex-col gap-2">
          <label htmlFor={`reopen-${gate.gate}`} className="text-xs text-[color:var(--text-secondary)]">
            Reopening {gate.gate} also reopens every stage that depended on it. Why?
          </label>
          <input
            id={`reopen-${gate.gate}`}
            type="text"
            value={reopening}
            autoFocus
            onChange={(e) => onReasonChange(e.target.value)}
            className="w-full px-3 py-2 text-sm"
          />
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={onConfirmReopen}
              disabled={busy || reopening.trim() === ""}
              className="rounded-[var(--radius-md)] border border-[color:var(--border-control)] px-3 py-1.5 text-sm text-[color:var(--text-primary)] transition-colors duration-[var(--motion-fast)] hover:border-[color:var(--border-strong)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
            >
              {busy ? "Reopening…" : "Reopen"}
            </button>
            <button
              type="button"
              onClick={onCancelReopen}
              className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
