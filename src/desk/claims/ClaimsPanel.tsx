import { useCallback, useEffect, useMemo, useState } from "react";
import {
  addClaim,
  bindEvidence,
  getClaimConflicts,
  getClaimGraph,
  getClaimsForSource,
  getUnsupportedClaims,
  removeSource,
} from "../api";
import type { Claim, ClaimEvidenceGraph, EvidenceConflict, ProjectView, RubricReport, SupportStrength } from "../types";

/**
 * The Claim–Evidence Graph (docs 02 glossary: "Claim", "Claim–Evidence
 * Binding", "Evidence Span"). Doc 01 §3 names "evidence-bound" as one of
 * three defining properties of Scholar, and none of the five graph
 * endpoints (plus the source-retraction pair) were called from Desk before
 * this — a claim could exist in the Rubric's rules but nothing in the UI
 * could add one, cite evidence for it, or see what was unsupported.
 *
 * There is no source registry yet (the Knowledge Vault only tracks that a
 * vault exists, not its contents — docs 25 §6, and AG-13's automatic claim
 * *extraction* from draft text needs app/mesh, which is not built — docs 13
 * §8.3). So this is manual end to end: the user names their own claims,
 * types their own source ids, and pastes their own quotes. Building a
 * source picker or auto-extraction here would be pretending those exist.
 *
 * "Unsupported" and "conflicts" are fetched from the server's own
 * unsupportedClaims()/findConflicts() rather than recomputed here, so the
 * definition of each has exactly one place it can drift.
 */
export default function ClaimsPanel({
  projectId,
  onChanged,
}: {
  projectId: string;
  onChanged: (updated: ProjectView, rubric?: RubricReport) => void;
}) {
  const [graph, setGraph] = useState<ClaimEvidenceGraph | null>(null);
  const [unsupported, setUnsupported] = useState<Claim[]>([]);
  const [conflicts, setConflicts] = useState<EvidenceConflict[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [claimText, setClaimText] = useState("");
  const [evidenceForm, setEvidenceForm] = useState<{
    claimId: string;
    sourceId: string;
    quote: string;
    page: string;
    paragraph: string;
    strength: SupportStrength;
    rationale: string;
  } | null>(null);
  const [retracting, setRetracting] = useState<{ sourceId: string; affected: Claim[] } | null>(null);

  const reload = useCallback(async () => {
    const [g, u, c] = await Promise.all([
      getClaimGraph(projectId),
      getUnsupportedClaims(projectId),
      getClaimConflicts(projectId),
    ]);
    setGraph(g);
    setUnsupported(u.claims);
    setConflicts(c.conflicts);
  }, [projectId]);

  useEffect(() => {
    reload().catch((e) => setError((e as Error).message));
  }, [reload]);

  const unsupportedIds = useMemo(() => new Set(unsupported.map((c) => c.id)), [unsupported]);
  const conflictByClaim = useMemo(() => new Map(conflicts.map((c) => [c.claimId, c])), [conflicts]);
  const sourceIds = useMemo(
    () => Array.from(new Set((graph?.bindings ?? []).flatMap((b) => b.evidence.map((e) => e.sourceId)))).sort(),
    [graph]
  );

  async function handleAddClaim(e: React.FormEvent) {
    e.preventDefault();
    if (!claimText.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const result = await addClaim(projectId, { id: crypto.randomUUID(), text: claimText.trim() });
      setClaimText("");
      onChanged(result, result.rubric);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleBindEvidence() {
    if (!evidenceForm) return;
    const { claimId, sourceId, quote, page, paragraph, strength, rationale } = evidenceForm;
    if (!sourceId.trim() || !quote.trim() || !rationale.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const locator: { page?: number; paragraph?: number } = {};
      if (page.trim()) locator.page = Number(page);
      if (paragraph.trim()) locator.paragraph = Number(paragraph);
      const result = await bindEvidence(projectId, {
        id: crypto.randomUUID(),
        claimId,
        evidence: [{ sourceId: sourceId.trim(), quote: quote.trim(), locator }],
        strength,
        rationale: rationale.trim(),
      });
      setEvidenceForm(null);
      onChanged(result, result.rubric);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  async function handleStartRetract(sourceId: string) {
    setError(null);
    try {
      const { claims } = await getClaimsForSource(projectId, sourceId);
      setRetracting({ sourceId, affected: claims });
    } catch (e) {
      setError((e as Error).message);
    }
  }

  async function handleConfirmRetract() {
    if (!retracting) return;
    setBusy(true);
    setError(null);
    try {
      const result = await removeSource(projectId, retracting.sourceId);
      setRetracting(null);
      onChanged(result, result.rubric);
      await reload();
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  if (!graph) {
    return (
      <Wrap>
        <p className="text-sm text-[color:var(--text-muted)]">Loading the claim–evidence graph…</p>
      </Wrap>
    );
  }

  return (
    <Wrap>
      <header className="mb-6">
        <h2 className="text-lg font-semibold tracking-tight text-[color:var(--text-primary)]">Evidence</h2>
        <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
          Every claim in the draft needs a located quote behind it. Add claims here, then cite the evidence that
          supports — or contradicts — each one.
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

      <form onSubmit={handleAddClaim} className="mb-6 flex items-end gap-3">
        <div className="flex-1">
          <label htmlFor="new-claim" className="mb-1.5 block text-sm font-medium text-[color:var(--text-primary)]">
            New claim
          </label>
          <input
            id="new-claim"
            type="text"
            value={claimText}
            onChange={(e) => setClaimText(e.target.value)}
            placeholder="An assertion the draft makes that needs evidentiary support"
            className="w-full px-3 py-2 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={busy || !claimText.trim()}
          className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          Add claim
        </button>
      </form>

      {graph.claims.length === 0 ? (
        <p className="text-sm text-[color:var(--text-muted)]">No claims recorded yet.</p>
      ) : (
        <ul aria-label="Claims" className="flex flex-col gap-3">
          {graph.claims.map((claim) => {
            const bindings = graph.bindings.filter((b) => b.claimId === claim.id);
            const conflict = conflictByClaim.get(claim.id);
            const isUnsupported = unsupportedIds.has(claim.id);
            return (
              <li
                key={claim.id}
                className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] px-4 py-3"
              >
                <div className="flex flex-wrap items-baseline justify-between gap-2">
                  <p className="text-sm text-[color:var(--text-primary)]">{claim.text}</p>
                  <span
                    className={[
                      "text-xs",
                      conflict
                        ? "text-[color:var(--state-danger)]"
                        : isUnsupported
                          ? "text-[color:var(--state-warning)]"
                          : "text-[color:var(--state-success)]",
                    ].join(" ")}
                  >
                    {conflict ? "Conflicting evidence" : isUnsupported ? "Unsupported" : "Supported"}
                  </span>
                </div>

                {bindings.length > 0 && (
                  <ul className="mt-2 flex flex-col gap-1.5">
                    {bindings.map((b) => (
                      <li key={b.id} className="text-xs text-[color:var(--text-secondary)]">
                        <span className="font-medium text-[color:var(--text-primary)]">{STRENGTH_LABEL[b.strength]}</span>{" "}
                        — “{b.evidence[0]?.quote}” ({b.evidence[0]?.sourceId}
                        {b.evidence[0]?.locator.page !== undefined ? `, p. ${b.evidence[0].locator.page}` : ""}
                        {b.evidence[0]?.locator.paragraph !== undefined ? `, ¶${b.evidence[0].locator.paragraph}` : ""})
                        <span className="block text-[color:var(--text-muted)]">{b.rationale}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {evidenceForm?.claimId === claim.id ? (
                  <EvidenceForm
                    value={evidenceForm}
                    busy={busy}
                    onChange={setEvidenceForm}
                    onCancel={() => setEvidenceForm(null)}
                    onSubmit={handleBindEvidence}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() =>
                      setEvidenceForm({
                        claimId: claim.id,
                        sourceId: "",
                        quote: "",
                        page: "",
                        paragraph: "",
                        strength: "strong",
                        rationale: "",
                      })
                    }
                    className="mt-2 text-xs text-[color:var(--accent)] transition-colors duration-[var(--motion-fast)] hover:text-[color:var(--accent-hover)] cursor-pointer"
                  >
                    Add evidence
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {sourceIds.length > 0 && (
        <div className="mt-8">
          <h3 className="mb-2 text-sm font-medium text-[color:var(--text-primary)]">Sources cited</h3>
          <ul aria-label="Sources" className="flex flex-col gap-1.5">
            {sourceIds.map((sourceId) => (
              <li key={sourceId} className="flex items-center justify-between gap-2 text-xs text-[color:var(--text-secondary)]">
                <span>{sourceId}</span>
                {retracting?.sourceId === sourceId ? null : (
                  <button
                    type="button"
                    onClick={() => handleStartRetract(sourceId)}
                    className="text-[color:var(--state-danger)] transition-colors duration-[var(--motion-fast)] hover:opacity-80 cursor-pointer"
                  >
                    Retract this source
                  </button>
                )}
              </li>
            ))}
          </ul>

          {/* UX3: deliberate friction — retracting a source drops evidence
              from every claim citing it and can turn a passing claim-support
              finding into a failing one, so this states the blast radius
              before it happens rather than after. */}
          {retracting && (
            <div className="mt-3 rounded-[var(--radius-md)] border border-[color:var(--accent-border)] bg-[color:var(--state-warning-subtle)] px-3.5 py-3">
              <p className="text-sm text-[color:var(--text-primary)]">
                Retracting <span className="font-medium">{retracting.sourceId}</span> removes its evidence from{" "}
                {retracting.affected.length === 0
                  ? "no claims currently."
                  : `${retracting.affected.length} ${retracting.affected.length === 1 ? "claim" : "claims"}: ${retracting.affected
                      .map((c) => `"${c.text}"`)
                      .join(", ")}.`}
              </p>
              <div className="mt-2.5 flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleConfirmRetract}
                  disabled={busy}
                  className="rounded-[var(--radius-md)] border border-[color:var(--state-danger)] px-3 py-1.5 text-sm text-[color:var(--state-danger)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--state-danger-subtle)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
                >
                  {busy ? "Retracting…" : "Retract this source"}
                </button>
                <button
                  type="button"
                  onClick={() => setRetracting(null)}
                  className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </Wrap>
  );
}

const STRENGTH_LABEL: Record<SupportStrength, string> = {
  strong: "Strong support",
  moderate: "Moderate support",
  weak: "Weak support",
  contradicts: "Contradicts",
};

function EvidenceForm({
  value,
  busy,
  onChange,
  onCancel,
  onSubmit,
}: {
  value: {
    claimId: string;
    sourceId: string;
    quote: string;
    page: string;
    paragraph: string;
    strength: SupportStrength;
    rationale: string;
  };
  busy: boolean;
  onChange: (next: typeof value) => void;
  onCancel: () => void;
  onSubmit: () => void;
}) {
  const canSubmit = value.sourceId.trim() && value.quote.trim() && value.rationale.trim();
  return (
    <div className="mt-3 flex flex-col gap-2.5 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] px-3.5 py-3">
      <div>
        <label htmlFor={`source-${value.claimId}`} className="mb-1 block text-xs font-medium text-[color:var(--text-primary)]">
          Source
        </label>
        <input
          id={`source-${value.claimId}`}
          type="text"
          value={value.sourceId}
          onChange={(e) => onChange({ ...value, sourceId: e.target.value })}
          placeholder="How you identify this source (e.g. an author-year key)"
          className="w-full px-2.5 py-1.5 text-sm"
        />
      </div>
      <div>
        <label htmlFor={`quote-${value.claimId}`} className="mb-1 block text-xs font-medium text-[color:var(--text-primary)]">
          Quote
        </label>
        <textarea
          id={`quote-${value.claimId}`}
          rows={2}
          value={value.quote}
          onChange={(e) => onChange({ ...value, quote: e.target.value })}
          placeholder="The exact text at that location — never a paraphrase"
          className="w-full resize-y px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="flex gap-2.5">
        <div className="flex-1">
          <label htmlFor={`page-${value.claimId}`} className="mb-1 block text-xs font-medium text-[color:var(--text-primary)]">
            Page
          </label>
          <input
            id={`page-${value.claimId}`}
            type="number"
            value={value.page}
            onChange={(e) => onChange({ ...value, page: e.target.value })}
            className="w-full px-2.5 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1">
          <label htmlFor={`paragraph-${value.claimId}`} className="mb-1 block text-xs font-medium text-[color:var(--text-primary)]">
            Paragraph
          </label>
          <input
            id={`paragraph-${value.claimId}`}
            type="number"
            value={value.paragraph}
            onChange={(e) => onChange({ ...value, paragraph: e.target.value })}
            className="w-full px-2.5 py-1.5 text-sm"
          />
        </div>
      </div>
      <div>
        <label htmlFor={`strength-${value.claimId}`} className="mb-1 block text-xs font-medium text-[color:var(--text-primary)]">
          Strength
        </label>
        <select
          id={`strength-${value.claimId}`}
          value={value.strength}
          onChange={(e) => onChange({ ...value, strength: e.target.value as SupportStrength })}
          className="w-full px-2.5 py-1.5 text-sm"
        >
          {(Object.keys(STRENGTH_LABEL) as SupportStrength[]).map((s) => (
            <option key={s} value={s}>
              {STRENGTH_LABEL[s]}
            </option>
          ))}
        </select>
      </div>
      <div>
        <label htmlFor={`rationale-${value.claimId}`} className="mb-1 block text-xs font-medium text-[color:var(--text-primary)]">
          Why?
        </label>
        <input
          id={`rationale-${value.claimId}`}
          type="text"
          value={value.rationale}
          onChange={(e) => onChange({ ...value, rationale: e.target.value })}
          placeholder="What this quote establishes about the claim"
          className="w-full px-2.5 py-1.5 text-sm"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onSubmit}
          disabled={busy || !canSubmit}
          className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3 py-1.5 text-sm font-medium text-[color:var(--text-inverse)] transition-colors duration-[var(--motion-fast)] hover:bg-[color:var(--accent-hover)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
        >
          {busy ? "Saving…" : "Save evidence"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="text-sm text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function Wrap({ children }: { children: React.ReactNode }) {
  return <div className="mx-auto w-full max-w-2xl px-6 py-8">{children}</div>;
}
