import React, { useState, useEffect } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedFetch } from "../../api";
import type { EvidenceItem } from "../types";

export default function AssignmentEvidenceStage() {
  const {
    projectId,
    sources,
    evidenceItems,
    setEvidenceItems,
    toggleEvidenceStatus,
    addEvidenceItem,
    advanceStage,
  } = useAssignmentWorkspace();

  const [claimText, setClaimText] = useState("");
  const [evidenceSnippet, setEvidenceSnippet] = useState("");
  const [sourceTitle, setSourceTitle] = useState("");
  const [citationText, setCitationText] = useState("");
  const [themeText, setThemeText] = useState("");
  const [showAddModal, setShowAddModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [selectedThemeFilter, setSelectedThemeFilter] = useState<string>("all");

  // Auto-generate evidence items from kept sources on first entry
  useEffect(() => {
    if (evidenceItems.length === 0 && sources.length > 0) {
      const kept = sources.filter((s) => s.status === "kept");
      if (kept.length > 0) {
        const initial: EvidenceItem[] = kept.map((s, idx) => ({
          id: `ev-${idx}-${s.id}`,
          claim: s.mainFinding.slice(0, 120),
          evidenceSnippet: s.mainFinding,
          sourceTitle: s.title,
          sourceType: s.fromVault ? "vault" : "file",
          authors: s.authors,
          year: s.year,
          citation: s.citation,
          theme: s.suggestedUse.slice(0, 40),
          status: "approved",
        }));
        setEvidenceItems(initial);
      }
    }
  }, [sources]);

  const handleCreateCustomEvidence = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!claimText.trim() || !evidenceSnippet.trim() || !sourceTitle.trim()) return;

    await addEvidenceItem({
      claim: claimText.trim(),
      evidenceSnippet: evidenceSnippet.trim(),
      sourceTitle: sourceTitle.trim(),
      sourceType: "custom",
      citation: citationText.trim() || sourceTitle.trim(),
      theme: themeText.trim() || "General Evidence",
      status: "approved",
    });

    setClaimText("");
    setEvidenceSnippet("");
    setSourceTitle("");
    setCitationText("");
    setThemeText("");
    setShowAddModal(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await authedFetch(`/api/projects/${projectId}/parse-file`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to parse file");
      const data = await res.json();
      const text = data.text || "";

      await addEvidenceItem({
        claim: `Evidence extracted from ${file.name}`,
        evidenceSnippet: text.slice(0, 300) + (text.length > 300 ? "…" : ""),
        sourceTitle: file.name,
        sourceType: "file",
        citation: `${file.name} (Uploaded Document)`,
        theme: "Uploaded Evidence",
        status: "approved",
      });
    } catch (err: any) {
      alert(`File parsing failed: ${err.message}`);
    } finally {
      setUploadingFile(false);
    }
  };

  const approvedCount = evidenceItems.filter((e) => e.status === "approved").length;
  const uniqueThemes = Array.from(new Set(evidenceItems.map((e) => e.theme || "General Evidence")));

  const displayedEvidence =
    selectedThemeFilter === "all"
      ? evidenceItems
      : evidenceItems.filter((e) => (e.theme || "General Evidence") === selectedThemeFilter);

  return (
    <div className="max-w-5xl mx-auto p-6 space-y-8">
      {/* Header */}
      <div className="border-b border-[color:var(--border-subtle)] pb-4 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xl">📋</span>
            <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
              Phase 4: Evidence Board
            </h2>
          </div>
          <p className="text-xs text-[color:var(--text-secondary)]">
            Organize and verify your Claim → Evidence → Source → Citation bindings. Only approved evidence is permitted in your draft.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <label className="px-3.5 py-1.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-semibold hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer flex items-center gap-1.5 shadow-xs">
            <span>📎 Upload Material (PDF/Word/Excel)</span>
            <input
              type="file"
              onChange={handleFileUpload}
              disabled={uploadingFile}
              accept=".pdf,.docx,.doc,.xlsx,.xls,.csv,.txt"
              className="hidden"
            />
          </label>
          <button
            type="button"
            onClick={() => setShowAddModal(true)}
            className="px-3.5 py-1.5 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
          >
            + Add Custom Evidence
          </button>
        </div>
      </div>

      {uploadingFile && (
        <div className="p-3 rounded-lg bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-xs text-[color:var(--accent)] animate-pulse flex items-center gap-2">
          <div className="w-3 h-3 border-2 border-[color:var(--accent)] border-t-transparent rounded-full animate-spin" />
          <span>Parsing user document & extracting academic evidence claims…</span>
        </div>
      )}

      {/* Theme Filters & Stats */}
      <div className="flex items-center justify-between flex-wrap gap-2 border-b border-[color:var(--border-subtle)] pb-2">
        <div className="flex items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => setSelectedThemeFilter("all")}
            className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors ${
              selectedThemeFilter === "all"
                ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)]"
                : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            All Themes ({evidenceItems.length})
          </button>
          {uniqueThemes.map((th) => (
            <button
              key={th}
              type="button"
              onClick={() => setSelectedThemeFilter(th)}
              className={`px-3 py-1 rounded-full text-xs font-semibold cursor-pointer transition-colors truncate max-w-xs ${
                selectedThemeFilter === th
                  ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)]"
                  : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
              }`}
            >
              {th}
            </button>
          ))}
        </div>

        <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400">
          ✓ {approvedCount} Verified Claims Approved
        </span>
      </div>

      {/* Evidence Cards Grid */}
      <div className="grid grid-cols-1 gap-4">
        {displayedEvidence.map((item) => {
          const isApproved = item.status === "approved";
          const isRejected = item.status === "rejected";

          return (
            <div
              key={item.id}
              className={`p-4 rounded-[var(--radius-lg)] border transition-all ${
                isApproved
                  ? "border-emerald-500/40 bg-emerald-500/5 shadow-xs"
                  : isRejected
                  ? "border-neutral-500/20 bg-neutral-500/5 opacity-50"
                  : "border-[color:var(--border-default)] bg-[color:var(--surface-inset)]"
              }`}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="space-y-2 flex-1 min-w-0">
                  {/* Claim */}
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-[10px] uppercase font-bold px-2 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)]">
                      Claim
                    </span>
                    <h4 className="text-xs font-bold text-[color:var(--text-primary)]">
                      {item.claim}
                    </h4>
                  </div>

                  {/* Evidence Snippet */}
                  <div className="p-3 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-secondary)] leading-relaxed italic">
                    "{item.evidenceSnippet}"
                  </div>

                  {/* Provenance: Source & Citation */}
                  <div className="flex items-center justify-between text-[11px] text-[color:var(--text-muted)] flex-wrap gap-2 pt-1">
                    <div className="flex items-center gap-2">
                      <span>📄 <strong className="text-[color:var(--text-primary)]">{item.sourceTitle}</strong></span>
                      {item.theme && (
                        <span className="px-2 py-0.5 rounded-full bg-[color:var(--surface-sunken)] text-[10px]">
                          🏷️ {item.theme}
                        </span>
                      )}
                    </div>
                    <span className="font-mono text-[10px] text-[color:var(--text-secondary)]">
                      Citation: {item.citation}
                    </span>
                  </div>
                </div>

                {/* Approve / Reject Controls */}
                <div className="flex items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={() => toggleEvidenceStatus(item.id, "approved")}
                    className={`px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-bold transition-all cursor-pointer ${
                      isApproved
                        ? "bg-emerald-600 text-white shadow-xs"
                        : "border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:text-emerald-600 hover:border-emerald-500"
                    }`}
                  >
                    {isApproved ? "✓ Approved" : "Approve"}
                  </button>
                  <button
                    type="button"
                    onClick={() => toggleEvidenceStatus(item.id, "rejected")}
                    className={`px-2.5 py-1.5 rounded-[var(--radius-md)] text-xs font-semibold transition-all cursor-pointer ${
                      isRejected
                        ? "bg-neutral-500 text-white"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)]"
                    }`}
                  >
                    ✕
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Add Custom Evidence Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-default)] rounded-[var(--radius-xl)] max-w-lg w-full p-6 space-y-4 shadow-xl">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
              <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                Add Custom Academic Evidence
              </h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
              >
                ✕ Close
              </button>
            </div>

            <form onSubmit={handleCreateCustomEvidence} className="space-y-3 text-xs">
              <div>
                <label className="font-bold text-[color:var(--text-primary)] block mb-1">
                  Core Claim / Proposition
                </label>
                <input
                  type="text"
                  required
                  value={claimText}
                  onChange={(e) => setClaimText(e.target.value)}
                  placeholder="e.g. Realist theory emphasizes systemic anarchy as the primary driver of state conflict."
                  className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] p-2 text-xs text-[color:var(--text-primary)]"
                />
              </div>

              <div>
                <label className="font-bold text-[color:var(--text-primary)] block mb-1">
                  Evidence Snippet / Quotation / Data
                </label>
                <textarea
                  required
                  rows={3}
                  value={evidenceSnippet}
                  onChange={(e) => setEvidenceSnippet(e.target.value)}
                  placeholder="Paste direct excerpt, quotation, empirical finding, or statistical result..."
                  className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] p-2 text-xs text-[color:var(--text-primary)]"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="font-medium text-[color:var(--text-secondary)] block mb-1">
                    Source Title / Author
                  </label>
                  <input
                    type="text"
                    required
                    value={sourceTitle}
                    onChange={(e) => setSourceTitle(e.target.value)}
                    placeholder="e.g. Waltz (1979) Theory of International Politics"
                    className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] p-2 text-xs text-[color:var(--text-primary)]"
                  />
                </div>
                <div>
                  <label className="font-medium text-[color:var(--text-secondary)] block mb-1">
                    Theme / Argument Focus
                  </label>
                  <input
                    type="text"
                    value={themeText}
                    onChange={(e) => setThemeText(e.target.value)}
                    placeholder="e.g. Theoretical Foundations"
                    className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] p-2 text-xs text-[color:var(--text-primary)]"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-[var(--radius-md)] border border-[color:var(--border-default)] text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] text-xs font-bold hover:bg-[color:var(--accent-hover)]"
                >
                  Add to Evidence Board
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Advance Banner */}
      <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] flex items-center justify-between">
        <div>
          <h4 className="text-xs font-bold text-[color:var(--accent)]">
            Ready to develop your critical thesis and arguments?
          </h4>
          <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
            Proceed to the Think & Critique stage to evaluate competing perspectives and choose your central argument.
          </p>
        </div>
        <button
          type="button"
          disabled={approvedCount < 2}
          onClick={() => advanceStage("think")}
          className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs"
        >
          Proceed to Think & Critique →
        </button>
      </div>
    </div>
  );
}
