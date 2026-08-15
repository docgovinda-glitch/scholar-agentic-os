import { useEffect, useState } from "react";
import {
  addManualSource,
  approveEvidenceItem,
  discoverSources,
  extractEvidenceQuote,
  getClaimGraph,
  getEvidenceLedger,
  proposeEvidenceItem,
  rejectEvidenceItem,
  verifyEvidenceItem,
} from "../api";
import { isVaultUnlocked, listVaultItems, searchVaultItems, type VaultItem } from "../../services/vaultContents";
import type { Claim, DiscoveredSource, EvidenceItem, EvidenceLedger, EvidenceState, RubricReport, SupportStrength } from "../types";

/**
 * Source discovery and the evidence-provenance pipeline (domain/evidence):
 * DISCOVERED → EXTRACTED → VERIFIED → PROPOSED → USER APPROVED → CITABLE.
 * Sits above ClaimsPanel in the Evidence tab — approving an item here is
 * what actually creates a binding in the Claim–Evidence Graph ClaimsPanel
 * reads and writes, via the one server route that can ever make evidence
 * citable (server/routes/project.ts's .../items/:id/approve).
 */

const STATE_LABEL: Record<EvidenceState, string> = {
  discovered: "Discovered",
  extracted: "Extracted",
  verified: "Verified",
  proposed: "Proposed",
  user_approved: "Approved",
  citable: "Citable",
};

const STRENGTHS: SupportStrength[] = ["strong", "moderate", "weak", "contradicts"];

export default function EvidenceLedgerPanel({
  projectId,
  actor,
  userId,
  onApproved,
  onOpenVault,
}: {
  projectId: string;
  actor: string;
  /** Needed to read the signed-in user's own Knowledge Vault (services/vaultContents.ts, keyed per-user) for the "Browse my Vault" picker below. Absent (e.g. no session yet) just hides that picker rather than erroring. */
  userId?: string;
  /** Called after a successful approve() — a claim binding was just added and, if the project already has a document, the Rubric was recomputed against it. The parent decides what else needs refreshing (e.g. re-rendering ClaimsPanel, gate state). */
  onApproved?: (rubric?: RubricReport) => void;
  /** Opens the Vault screen so the user can unlock it — offered when the picker below finds the Vault locked. */
  onOpenVault?: () => void;
}) {
  const [ledger, setLedger] = useState<EvidenceLedger | null>(null);
  // Fetched independently from ClaimsPanel's own copy of the graph, on
  // purpose — this panel only needs claim ids and text to populate the
  // "propose for a claim" picker, not full ownership of graph state, and
  // staying decoupled means neither panel has to know the other exists.
  const [claims, setClaims] = useState<Claim[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const [query, setQuery] = useState("");
  const [via, setVia] = useState<"arxiv" | "openalex" | "web_search">("openalex");
  const [manualTitle, setManualTitle] = useState("");
  const [showManual, setShowManual] = useState(false);

  // Vault picker: pulls from the same client-side-decrypted item list
  // VaultScreen itself reads (services/vaultContents.ts) — the server never
  // sees Vault contents, so this list is fetched fresh here rather than
  // coming from any project-scoped state.
  const [showVaultPicker, setShowVaultPicker] = useState(false);
  const [vaultItems, setVaultItems] = useState<VaultItem[] | null>(null);
  const [vaultQuery, setVaultQuery] = useState("");
  const [vaultLocked, setVaultLocked] = useState(false);
  const [vaultError, setVaultError] = useState<string | null>(null);
  const [addedVaultItemIds, setAddedVaultItemIds] = useState<Set<string>>(new Set());

  const [extractingSourceId, setExtractingSourceId] = useState<string | null>(null);
  const [quoteDraft, setQuoteDraft] = useState("");

  const [proposingItemId, setProposingItemId] = useState<string | null>(null);
  const [proposeClaimId, setProposeClaimId] = useState("");

  const [approvingItemId, setApprovingItemId] = useState<string | null>(null);
  const [approveStrength, setApproveStrength] = useState<SupportStrength>("strong");
  const [approveRationale, setApproveRationale] = useState("");

  useEffect(() => {
    let cancelled = false;
    Promise.all([getEvidenceLedger(projectId), getClaimGraph(projectId)])
      .then(([l, g]) => {
        if (cancelled) return;
        setLedger(l);
        setClaims(g.claims);
      })
      .catch((e) => !cancelled && setError((e as Error).message));
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  async function run<T>(action: () => Promise<T>, onDone: (result: T) => void) {
    setBusy(true);
    setError(null);
    try {
      onDone(await action());
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }

  function handleDiscover(e: React.FormEvent) {
    e.preventDefault();
    if (!query.trim()) return;
    run(
      () => discoverSources(projectId, query.trim(), via),
      (r) => setLedger(r.evidenceLedger)
    );
  }

  function handleAddManual(e: React.FormEvent) {
    e.preventDefault();
    if (!manualTitle.trim()) return;
    run(
      () => addManualSource(projectId, { title: manualTitle.trim(), authors: [], sourceType: "user_provided", authorityTier: "C" }),
      (l) => {
        setLedger(l);
        setManualTitle("");
        setShowManual(false);
      }
    );
  }

  function handleToggleVaultPicker() {
    const opening = !showVaultPicker;
    setShowVaultPicker(opening);
    if (!opening || !userId || vaultItems !== null) return;
    if (!isVaultUnlocked()) {
      setVaultLocked(true);
      return;
    }
    setVaultLocked(false);
    setVaultError(null);
    listVaultItems(userId)
      .then(setVaultItems)
      .catch((e) => setVaultError((e as Error).message));
  }

  function handleAddFromVault(item: VaultItem) {
    run(
      () => addManualSource(projectId, { title: item.title, authors: [], sourceType: "vault", authorityTier: "D", discoveredVia: "vault", vaultItemId: item.id }),
      (l) => {
        setLedger(l);
        setAddedVaultItemIds((prev) => new Set(prev).add(item.id));
      }
    );
  }

  function handleExtract(sourceId: string) {
    if (!quoteDraft.trim()) return;
    run(
      () => extractEvidenceQuote(projectId, sourceId, quoteDraft.trim()),
      (l) => {
        setLedger(l);
        setExtractingSourceId(null);
        setQuoteDraft("");
      }
    );
  }

  function handleVerify(item: EvidenceItem) {
    run(
      () => verifyEvidenceItem(projectId, item.id, actor),
      (l) => setLedger(l)
    );
  }

  function handlePropose(item: EvidenceItem) {
    if (!proposeClaimId) return;
    run(
      () => proposeEvidenceItem(projectId, item.id, proposeClaimId, actor),
      (l) => {
        setLedger(l);
        setProposingItemId(null);
        setProposeClaimId("");
      }
    );
  }

  function handleApprove(item: EvidenceItem) {
    if (!approveRationale.trim()) return;
    run(
      () => approveEvidenceItem(projectId, item.id, { actor, strength: approveStrength, rationale: approveRationale.trim() }),
      (result) => {
        setLedger(result.evidenceLedger);
        setApprovingItemId(null);
        setApproveRationale("");
        onApproved?.(result.rubric);
      }
    );
  }

  function handleReject(item: EvidenceItem) {
    run(
      () => rejectEvidenceItem(projectId, item.id, actor, "Not a good fit for this claim."),
      (l) => setLedger(l)
    );
  }

  if (!ledger) {
    return <p className="text-sm text-[color:var(--text-muted)]">Loading evidence…</p>;
  }

  function sourceTitle(sourceId: string): string {
    return ledger!.sources.find((s) => s.id === sourceId)?.title ?? sourceId;
  }

  return (
    <div className="flex flex-col gap-6">
      <section>
        <h3 className="text-sm font-medium text-[color:var(--text-primary)]">Discover sources</h3>
        <form onSubmit={handleDiscover} className="mt-2 flex flex-wrap items-center gap-2">
          <input
            aria-label="Search query"
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search topic…"
            className="min-w-[200px] flex-1 px-3 py-2 text-sm"
          />
          <select aria-label="Discovery source" value={via} onChange={(e) => setVia(e.target.value as "arxiv" | "openalex" | "web_search")} className="px-2 py-2 text-sm">
            <option value="openalex">OpenAlex (all scholarly literature)</option>
            <option value="arxiv">arXiv (preprints)</option>
            <option value="web_search">Web</option>
          </select>
          <button
            type="submit"
            disabled={busy || !query.trim()}
            className="rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] px-3.5 py-2 text-sm font-medium text-[color:var(--text-inverse)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
          >
            Search
          </button>
          <button type="button" onClick={() => setShowManual((v) => !v)} className="text-xs text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] cursor-pointer">
            {showManual ? "Cancel" : "Add a known source manually"}
          </button>
          {userId && (
            <button type="button" onClick={handleToggleVaultPicker} className="text-xs text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] cursor-pointer">
              {showVaultPicker ? "Cancel" : "Add from my Vault"}
            </button>
          )}
        </form>

        {showManual && (
          <form onSubmit={handleAddManual} className="mt-2 flex items-center gap-2">
            <input
              aria-label="Source title"
              type="text"
              value={manualTitle}
              onChange={(e) => setManualTitle(e.target.value)}
              placeholder="Source title"
              className="flex-1 px-3 py-2 text-sm"
            />
            <button type="submit" disabled={busy || !manualTitle.trim()} className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] px-3 py-2 text-sm cursor-pointer">
              Add
            </button>
          </form>
        )}

        {showVaultPicker && (
          <div className="mt-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] p-3">
            {vaultLocked ? (
              <div>
                <p className="text-xs text-[color:var(--text-secondary)]">Your Vault is locked. Unlock it, then come back here.</p>
                {onOpenVault && (
                  <button type="button" onClick={onOpenVault} className="mt-1.5 text-xs text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] cursor-pointer">
                    Open Vault
                  </button>
                )}
              </div>
            ) : vaultError ? (
              <p role="alert" className="text-xs text-[color:var(--state-danger)]">{vaultError}</p>
            ) : vaultItems === null ? (
              <p className="text-xs text-[color:var(--text-muted)]">Loading your Vault…</p>
            ) : vaultItems.length === 0 ? (
              <p className="text-xs text-[color:var(--text-muted)]">Your Vault is empty.</p>
            ) : (
              <>
                <input
                  aria-label="Search your Vault"
                  type="text"
                  value={vaultQuery}
                  onChange={(e) => setVaultQuery(e.target.value)}
                  placeholder="Search your Vault…"
                  className="w-full px-3 py-2 text-sm"
                />
                <ul className="mt-2 flex max-h-64 flex-col gap-1.5 overflow-y-auto">
                  {searchVaultItems(vaultItems, vaultQuery).map((item) => (
                    <li key={item.id} className="flex items-center justify-between gap-2 rounded border border-[color:var(--border-subtle)] px-2 py-1.5">
                      <div className="min-w-0">
                        <p className="truncate text-xs text-[color:var(--text-primary)]">{item.title}</p>
                        {item.citation && <p className="truncate text-[10px] text-[color:var(--text-muted)]">{item.citation}</p>}
                      </div>
                      {addedVaultItemIds.has(item.id) ? (
                        <span className="shrink-0 text-[10px] text-[color:var(--state-success)]">Added</span>
                      ) : (
                        <button
                          type="button"
                          onClick={() => handleAddFromVault(item)}
                          disabled={busy}
                          className="shrink-0 rounded border border-[color:var(--border-default)] px-2 py-1 text-[10px] cursor-pointer"
                        >
                          Add
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
              </>
            )}
          </div>
        )}

        {error && <p role="alert" className="mt-2 text-xs text-[color:var(--state-danger)]">{error}</p>}
      </section>

      <section>
        <h3 className="text-sm font-medium text-[color:var(--text-primary)]">Sources ({ledger.sources.length})</h3>
        {ledger.sources.length === 0 ? (
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">No sources discovered yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {ledger.sources.map((s: DiscoveredSource) => (
              <li key={s.id} className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm text-[color:var(--text-primary)]">{s.title}</p>
                    <p className="text-xs text-[color:var(--text-muted)]">
                      {s.sourceType} · tier {s.authorityTier} · via {s.discoveredVia}
                      {s.url && (
                        <>
                          {" · "}
                          <a href={s.url} target="_blank" rel="noopener noreferrer" className="text-[color:var(--accent)] hover:text-[color:var(--accent-hover)]">
                            link
                          </a>
                        </>
                      )}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => {
                      setExtractingSourceId(s.id);
                      setQuoteDraft("");
                    }}
                    className="shrink-0 text-xs text-[color:var(--accent)] hover:text-[color:var(--accent-hover)] cursor-pointer"
                  >
                    Extract a quote
                  </button>
                </div>
                {extractingSourceId === s.id && (
                  <div className="mt-2 flex items-center gap-2">
                    <input
                      aria-label={`Quote from ${s.title}`}
                      type="text"
                      value={quoteDraft}
                      onChange={(e) => setQuoteDraft(e.target.value)}
                      placeholder="Exact quote from the source…"
                      className="flex-1 px-2 py-1.5 text-xs"
                    />
                    <button type="button" onClick={() => handleExtract(s.id)} disabled={busy || !quoteDraft.trim()} className="rounded border border-[color:var(--border-default)] px-2 py-1.5 text-xs cursor-pointer">
                      Save
                    </button>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section>
        <h3 className="text-sm font-medium text-[color:var(--text-primary)]">Evidence pipeline ({ledger.items.length})</h3>
        {ledger.items.length === 0 ? (
          <p className="mt-1 text-xs text-[color:var(--text-muted)]">No evidence extracted yet.</p>
        ) : (
          <ul className="mt-2 flex flex-col gap-2">
            {ledger.items.map((item) => (
              <li key={item.id} className="rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-3">
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs text-[color:var(--text-secondary)]">{sourceTitle(item.sourceId)}</p>
                    {item.quote && <p className="mt-1 text-sm italic text-[color:var(--text-primary)]">"{item.quote}"</p>}
                  </div>
                  <span
                    className={[
                      "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium",
                      item.state === "citable" ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)]" : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]",
                    ].join(" ")}
                  >
                    {STATE_LABEL[item.state]}
                  </span>
                </div>

                <div className="mt-2 flex flex-wrap items-center gap-2">
                  {item.state === "extracted" && (
                    <button type="button" onClick={() => handleVerify(item)} disabled={busy} className="rounded border border-[color:var(--border-default)] px-2 py-1 text-xs cursor-pointer">
                      Verify
                    </button>
                  )}

                  {item.state === "verified" && proposingItemId !== item.id && (
                    <button type="button" onClick={() => setProposingItemId(item.id)} disabled={busy} className="rounded border border-[color:var(--border-default)] px-2 py-1 text-xs cursor-pointer">
                      Propose for a claim
                    </button>
                  )}
                  {item.state === "verified" && proposingItemId === item.id && (
                    <>
                      <select aria-label="Target claim" value={proposeClaimId} onChange={(e) => setProposeClaimId(e.target.value)} className="px-2 py-1 text-xs">
                        <option value="">Choose a claim…</option>
                        {claims.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.text.slice(0, 60)}
                          </option>
                        ))}
                      </select>
                      <button type="button" onClick={() => handlePropose(item)} disabled={busy || !proposeClaimId} className="rounded border border-[color:var(--border-default)] px-2 py-1 text-xs cursor-pointer">
                        Propose
                      </button>
                    </>
                  )}

                  {item.state === "proposed" && approvingItemId !== item.id && (
                    <>
                      <span className="text-xs text-[color:var(--text-muted)]">
                        Proposed for: {claims.find((c) => c.id === item.proposedClaimId)?.text.slice(0, 40) ?? item.proposedClaimId}
                      </span>
                      <button type="button" onClick={() => setApprovingItemId(item.id)} disabled={busy} className="rounded bg-[color:var(--accent-solid)] px-2 py-1 text-xs text-[color:var(--text-inverse)] cursor-pointer">
                        Approve
                      </button>
                      <button type="button" onClick={() => handleReject(item)} disabled={busy} className="rounded border border-[color:var(--border-default)] px-2 py-1 text-xs cursor-pointer">
                        Reject
                      </button>
                    </>
                  )}
                  {item.state === "proposed" && approvingItemId === item.id && (
                    <div className="flex w-full flex-col gap-2">
                      <select aria-label="Support strength" value={approveStrength} onChange={(e) => setApproveStrength(e.target.value as SupportStrength)} className="px-2 py-1 text-xs">
                        {STRENGTHS.map((s) => (
                          <option key={s} value={s}>
                            {s}
                          </option>
                        ))}
                      </select>
                      <input
                        aria-label="Approval rationale"
                        type="text"
                        value={approveRationale}
                        onChange={(e) => setApproveRationale(e.target.value)}
                        placeholder="Why this evidence supports the claim…"
                        className="px-2 py-1 text-xs"
                      />
                      <button
                        type="button"
                        onClick={() => handleApprove(item)}
                        disabled={busy || !approveRationale.trim()}
                        className="self-start rounded bg-[color:var(--accent-solid)] px-2 py-1 text-xs text-[color:var(--text-inverse)] disabled:cursor-not-allowed disabled:opacity-55 cursor-pointer"
                      >
                        Confirm approval — makes this citable
                      </button>
                    </div>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
