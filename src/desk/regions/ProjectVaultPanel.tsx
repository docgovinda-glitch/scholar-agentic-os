import React, { useState, useEffect } from "react";
import { searchVaultItems, type VaultItem, isVaultUnlocked } from "../../services/vaultContents";
import { getEvidenceLedger, addManualSource, extractEvidenceQuote } from "../api";
import { showAppToast } from "../../components/ui/FeedbackSystem";

export default function ProjectVaultPanel({
  projectId,
  onJumpToBlock,
}: {
  projectId: string;
  onJumpToBlock?: (id: string) => void;
}) {
  const [items, setItems] = useState<VaultItem[]>([]);
  const [query, setQuery] = useState("");
  const [unlocked, setUnlocked] = useState(isVaultUnlocked());
  const [userId, setUserId] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [evidenceLedgerVaultIds, setEvidenceLedgerVaultIds] = useState<Set<string>>(new Set());
  const [addingEvidenceId, setAddingEvidenceId] = useState<string | null>(null);
  const [copiedCitationId, setCopiedCitationId] = useState<string | null>(null);
  const [passphraseInput, setPassphraseInput] = useState("");
  const [unlocking, setUnlocking] = useState(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const fileInputRef = React.useRef<HTMLInputElement>(null);

  useEffect(() => {
    // Auto-detect if device does not require passphrase or is in synced mode
    import("../../services/userVault").then(async ({ currentUserId, hasVaultPassphraseOnThisDevice }) => {
      const uid = await currentUserId();
      if (uid) setUserId(uid);
      const hasPassphrase = await hasVaultPassphraseOnThisDevice();
      if (!hasPassphrase) {
        const { setSessionUnlocked } = await import("../../services/vaultContents");
        setSessionUnlocked(true);
        setUnlocked(true);
      } else {
        setUnlocked(isVaultUnlocked());
      }
    });
  }, []);

  useEffect(() => {
    // Sync current project evidence ledger to detect which vault items are already added
    getEvidenceLedger(projectId)
      .then((ledger) => {
        const ids = new Set<string>();
        for (const s of ledger.sources || []) {
          if (s.vaultItemId) ids.add(s.vaultItemId);
        }
        setEvidenceLedgerVaultIds(ids);
      })
      .catch(() => {});
  }, [projectId]);

  useEffect(() => {
    if (unlocked) {
      import("../../services/userVault").then(({ currentUserId }) => {
        currentUserId().then((uid) => {
          if (uid) {
            setUserId(uid);
            import("../../services/vaultContents").then(({ listVaultItems, searchVaultItems }) => {
              listVaultItems(uid)
                .then((vaultItems) => {
                  const filtered = searchVaultItems(vaultItems, query);
                  // Sort items linked to this project first
                  const sorted = [...filtered].sort((a, b) => {
                    const aLinked = (a.projects || a.metadata?.projects || (a.collection ? [a.collection] : [])).some(
                      (p: string) => p.toLowerCase().includes(projectId.toLowerCase())
                    );
                    const bLinked = (b.projects || b.metadata?.projects || (b.collection ? [b.collection] : [])).some(
                      (p: string) => p.toLowerCase().includes(projectId.toLowerCase())
                    );
                    if (aLinked && !bLinked) return -1;
                    if (!aLinked && bLinked) return 1;
                    return 0;
                  });
                  setItems(sorted);
                })
                .catch(console.error);
            });
          }
        });
      });
    }
  }, [query, unlocked, projectId]);

  const handleInlineUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!passphraseInput.trim()) return;
    setUnlocking(true);
    setUnlockError(null);
    try {
      const { unlockVault } = await import("../../services/vaultContents");
      const ok = await unlockVault(passphraseInput);
      if (ok) {
        setUnlocked(true);
        setPassphraseInput("");
      } else {
        setUnlockError("Incorrect passphrase.");
      }
    } catch (err: any) {
      setUnlockError(err.message || "Failed to unlock.");
    } finally {
      setUnlocking(false);
    }
  };

  if (!unlocked) {
    return (
      <div className="p-4 flex flex-col items-center justify-center text-center text-[color:var(--text-muted)] h-full">
        <form onSubmit={handleInlineUnlock} className="flex flex-col gap-2.5 p-4 text-center max-w-xs mx-auto bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[var(--radius-lg)] shadow-xs w-full">
          <div className="w-9 h-9 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center mx-auto text-sm">
            🔒
          </div>
          <div>
            <h4 className="text-xs font-bold text-[color:var(--text-primary)]">Unlock Knowledge Vault</h4>
            <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
              Enter your device passphrase to access research sources.
            </p>
          </div>
          <input
            type="password"
            placeholder="Vault Passphrase…"
            value={passphraseInput}
            onChange={(e) => setPassphraseInput(e.target.value)}
            className="w-full px-2.5 py-1.5 text-xs bg-[color:var(--surface-sunken)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] text-[color:var(--text-primary)]"
          />
          {unlockError && <p role="alert" className="text-[10px] text-red-500">{unlockError}</p>}
          <button
            type="submit"
            disabled={!passphraseInput.trim() || unlocking}
            className="px-3 py-1.5 text-xs font-bold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] hover:bg-[color:var(--accent-hover)] cursor-pointer disabled:opacity-50 transition-colors"
          >
            {unlocking ? "Unlocking…" : "Unlock Vault"}
          </button>
        </form>
      </div>
    );
  }

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !userId) return;

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);

      const { authedFetch } = await import("../api");
      const res = await authedFetch(`/api/projects/${projectId}/parse-file`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) {
        throw new Error("Failed to parse file");
      }

      const data = await res.json();
      if (data.text) {
        const { addVaultItem, listVaultItems } = await import("../../services/vaultContents");
        const newItem: VaultItem = {
          id: `vault-${Date.now()}`,
          title: file.name,
          content: data.text,
          createdAt: new Date().toISOString(),
        };
        await addVaultItem(userId, newItem);

        // Refresh list
        const updated = await listVaultItems(userId);
        setItems(searchVaultItems(updated, query));
      }
    } catch (err) {
      console.error(err);
      showAppToast("Failed to upload and parse file.", "error");
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = "";
      }
    }
  };

  const handleCopyCitation = (item: VaultItem) => {
    const citation =
      item.citation ||
      `${item.authors && item.authors.length > 0 ? item.authors.join(", ") : "Unknown Author"} (${
        item.year || "n.d."
      }). ${item.title}.`;
    navigator.clipboard.writeText(citation);
    setCopiedCitationId(item.id);
    setTimeout(() => setCopiedCitationId(null), 1800);
  };

  const handleAddToEvidence = async (item: VaultItem) => {
    setAddingEvidenceId(item.id);
    try {
      const ledger = await addManualSource(projectId, {
        title: item.title,
        authors: item.authors || [],
        sourceType: "vault",
        authorityTier: "D",
        discoveredVia: "vault",
        vaultItemId: item.id,
      });
      setEvidenceLedgerVaultIds((prev) => new Set(prev).add(item.id));

      // Auto-extract key quote if available
      const keyPoints = item.metadata?.keyPoints || item.metadata?.notes?.keyPoints || [];
      const quote = item.metadata?.notes?.keyQuote || (keyPoints.length > 0 ? keyPoints[0] : null);
      if (quote && ledger?.sources) {
        const createdSource = ledger.sources.find((s: any) => s.vaultItemId === item.id);
        if (createdSource) {
          await extractEvidenceQuote(projectId, createdSource.id, quote).catch(() => {});
        }
      }
    } catch (err) {
      console.error(err);
    } finally {
      setAddingEvidenceId(null);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[color:var(--surface-canvas)]">
      <div className="p-2 border-b border-[color:var(--border-subtle)] space-y-2">
        <input
          type="search"
          placeholder="Search vault..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full px-2 py-1 text-sm bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded text-[color:var(--text-primary)]"
        />
        <div className="flex justify-end">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            className="hidden"
            accept=".pdf,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
          />
          <button
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            className="px-2 py-1 text-xs font-semibold bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] disabled:opacity-50 transition-colors cursor-pointer"
          >
            {uploading ? "Importing..." : "Import File"}
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {items.length === 0 ? (
          <p className="text-xs text-[color:var(--text-muted)] text-center mt-4">
            {query ? "No matches found." : "Your vault is empty."}
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const inEvidence = evidenceLedgerVaultIds.has(item.id);
              const isRetracted = item.retractionStatus === "retracted";
              const projs: string[] = item.projects || item.metadata?.projects || (item.collection ? [item.collection] : []);
              const isLinkedToCurrent = projs.some((p: string) => p.toLowerCase().includes(projectId.toLowerCase()));
              const keyPoints: string[] = item.metadata?.keyPoints || item.metadata?.notes?.keyPoints || [];

              return (
                <li
                  key={item.id}
                  className={`p-2.5 text-xs rounded border transition-colors ${
                    isRetracted
                      ? "bg-red-500/5 border-red-500/30"
                      : isLinkedToCurrent
                      ? "bg-[color:var(--accent-subtle)]/20 border-[color:var(--accent-border)] shadow-2xs"
                      : "bg-[color:var(--surface-raised)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-default)]"
                  }`}
                >
                  <div className="flex items-start justify-between gap-1.5">
                    <div className="font-semibold text-[color:var(--text-primary)] leading-snug line-clamp-2">
                      {item.title}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      {isLinkedToCurrent && (
                        <span className="px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded">
                          Project
                        </span>
                      )}
                      {isRetracted && (
                        <span className="shrink-0 px-1 py-0.5 text-[9px] font-bold uppercase tracking-wider bg-red-500 text-white rounded">
                          Retracted
                        </span>
                      )}
                    </div>
                  </div>

                  {item.authors && item.authors.length > 0 && (
                    <div className="text-[color:var(--text-muted)] truncate mt-0.5 text-[11px]">
                      {item.authors.join(", ")} {item.year ? `(${item.year})` : ""}
                    </div>
                  )}

                  {item.journal && (
                    <div className="text-[color:var(--text-secondary)] italic truncate text-[11px] mt-0.5">
                      {item.journal}
                    </div>
                  )}

                  {/* Key points takeaways */}
                  {keyPoints.length > 0 && (
                    <div className="mt-1.5 space-y-0.5 bg-[color:var(--surface-inset)]/60 p-1.5 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] text-[11px] text-[color:var(--text-secondary)]">
                      {keyPoints.slice(0, 2).map((kp, idx) => (
                        <div key={idx} className="flex items-start gap-1 leading-tight line-clamp-1">
                          <span className="text-[color:var(--accent)] font-bold">•</span>
                          <span>{kp}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="flex items-center gap-1.5 mt-2 pt-1.5 border-t border-[color:var(--border-subtle)]">
                    <button
                      type="button"
                      onClick={() => handleCopyCitation(item)}
                      className="px-2 py-0.5 text-[10px] font-medium rounded border border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] transition-colors cursor-pointer"
                    >
                      {copiedCitationId === item.id ? "✓ Copied" : "📋 Cite"}
                    </button>

                    {inEvidence ? (
                      <span className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-0.5">
                        <span>✓</span> In Evidence
                      </span>
                    ) : (
                      <button
                        type="button"
                        onClick={() => handleAddToEvidence(item)}
                        disabled={addingEvidenceId === item.id}
                        className="px-2 py-0.5 text-[10px] font-medium rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] hover:text-[color:var(--text-inverse)] transition-colors cursor-pointer disabled:opacity-50"
                      >
                        {addingEvidenceId === item.id ? "Adding…" : "+ Evidence"}
                      </button>
                    )}

                    {item.externalReference && (
                      <a
                        href={item.externalReference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="ml-auto text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--accent)] hover:underline"
                      >
                        Open ↗
                      </a>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </div>
  );
}
