/**
 * Literature Matrix Modal — Academic Comparative Synthesis Workspace
 *
 * Provides side-by-side comparative matrices, publication-ready thematic
 * narrative synthesis, and AI-isolated grounded inquiry across selected sources.
 */

import { useState, useMemo } from "react";
import type { VaultItem } from "../../services/vaultContents";
import {
  generateLiteratureMatrix,
  exportMatrixToMarkdown,
  exportMatrixToCSV,
  formatInTextCitation,
} from "../../services/vault/literatureMatrixService";
import {
  askSelectedSources,
  SYNTHESIS_PRESETS,
  type GroundedSynthesisResult,
} from "../../services/vault/groundedSynthesisService";
import {
  generateBatchBibTeX,
  generateBatchBibliography,
  downloadTextFile,
} from "../../services/vault/batchExportHelper";

export interface LiteratureMatrixModalProps {
  items: VaultItem[];
  allItems?: VaultItem[];
  activeProject?: string;
  onClose: () => void;
  onOpenProject?: (projectId: string) => void;
  initialTab?: "matrix" | "narrative" | "ask";
}

type MatrixTab = "matrix" | "narrative" | "ask";

export default function LiteratureMatrixModal({
  items,
  allItems,
  activeProject,
  onClose,
  initialTab = "matrix",
}: LiteratureMatrixModalProps) {
  const [activeTab, setActiveTab] = useState<MatrixTab>(initialTab);
  const [copiedAction, setCopiedAction] = useState<string | null>(null);

  // Q&A state
  const [question, setQuestion] = useState("");
  const [isAsking, setIsAsking] = useState(false);
  const [qaResult, setQaResult] = useState<GroundedSynthesisResult | null>(null);
  const [qaError, setQaError] = useState<string | null>(null);

  // Generate Matrix data
  const matrix = useMemo(() => {
    return generateLiteratureMatrix(items, activeProject);
  }, [items, activeProject]);

  // Copy feedback helper
  function triggerCopyFeedback(actionKey: string, text: string) {
    navigator.clipboard.writeText(text);
    setCopiedAction(actionKey);
    setTimeout(() => setCopiedAction(null), 2500);
  }

  // Handle Q&A execution
  async function handleAskQuestion(queryText: string) {
    if (!queryText.trim()) return;
    setIsAsking(true);
    setQaError(null);
    try {
      // If user selected all items, ensure we pass at most 5 or take the first 5 to honor isolation
      const targetIds = items.slice(0, 5).map((i) => i.id);
      const library = allItems && allItems.length > items.length ? allItems : items;
      const pool =
        library.length === targetIds.length
          ? [...library, { id: "__unselected_library_item__", title: "", content: "", createdAt: "" } as VaultItem]
          : library;
      const res = await askSelectedSources(pool, targetIds, queryText.trim());
      setQaResult(res);
    } catch (err: any) {
      setQaError(err?.message || "Failed to synthesize answer across sources.");
    } finally {
      setIsAsking(false);
    }
  }

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="matrix-modal-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/65 backdrop-blur-xs animate-in fade-in duration-150"
    >
      <div className="relative flex flex-col w-full max-w-6xl max-h-[92vh] bg-[color:var(--surface-canvas)] border border-[color:var(--border-default)] rounded-[var(--radius-xl)] shadow-2xl overflow-hidden">
        {/* ================= HEADER ================= */}
        <header className="px-6 py-4 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[color:var(--accent-subtle)]/30 border border-[color:var(--accent-border)] flex items-center justify-center text-xl shrink-0">
              📊
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h2 id="matrix-modal-title" className="text-base font-bold text-[color:var(--text-primary)] truncate">
                  Literature Review Synthesis Matrix
                </h2>
                <span className="px-2 py-0.5 text-[11px] font-bold rounded-full bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] shrink-0">
                  {matrix.rows.length} Sources
                </span>
                {activeProject && (
                  <span className="px-2 py-0.5 text-[11px] font-medium rounded-full bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] text-[color:var(--text-secondary)] truncate">
                    📁 {activeProject}
                  </span>
                )}
              </div>
              <p className="text-xs text-[color:var(--text-muted)] mt-0.5 truncate">
                Cross-paper empirical comparison, thematic narrative synthesis, and grounded inquiry
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Quick Export Actions */}
            <button
              type="button"
              onClick={() => triggerCopyFeedback("copy-md", exportMatrixToMarkdown(matrix))}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-canvas)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] transition-colors cursor-pointer"
            >
              <span>{copiedAction === "copy-md" ? "✓ Copied" : "📋 Copy Markdown"}</span>
            </button>

            <button
              type="button"
              onClick={() => {
                const csv = exportMatrixToCSV(matrix);
                downloadTextFile(csv, `literature-matrix-${activeProject || "vault"}.csv`, "text/csv;charset=utf-8");
              }}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-canvas)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] transition-colors cursor-pointer"
            >
              <span>📥 Export CSV</span>
            </button>

            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="p-1.5 text-sm text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] rounded-[var(--radius-md)] transition-colors cursor-pointer"
            >
              ✕
            </button>
          </div>
        </header>

        {/* ================= TABS ================= */}
        <nav className="px-6 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] flex items-center gap-6 text-xs font-semibold shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab("matrix")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "matrix"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] font-bold"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <span>📊 Comparative Matrix</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("narrative")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "narrative"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] font-bold"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <span>📝 Thematic Synthesis Narrative</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("ask")}
            className={`py-3 border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
              activeTab === "ask"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] font-bold"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <span>💬 Ask Selected Sources</span>
          </button>
        </nav>

        {/* ================= CONTENT BODY ================= */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* TAB 1: COMPARATIVE MATRIX */}
          {activeTab === "matrix" && (
            <div className="flex flex-col gap-5">
              {/* Summary Stats Bar */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="p-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[var(--radius-lg)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                    Chronological Scope
                  </span>
                  <p className="text-base font-bold text-[color:var(--text-primary)] mt-0.5">
                    {matrix.summary.yearSpan.earliest} – {matrix.summary.yearSpan.latest}
                  </p>
                  <p className="text-[11px] text-[color:var(--text-secondary)] mt-0.5">
                    {matrix.rows.length} peer contributions analyzed
                  </p>
                </div>

                <div className="p-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[var(--radius-lg)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                    Methodological Diversity
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {Object.entries(matrix.summary.methodologyBreakdown).map(([method, count]) => (
                      <span
                        key={method}
                        className="px-1.5 py-0.5 text-[10px] font-semibold bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] rounded text-[color:var(--text-secondary)]"
                      >
                        {method.split(" ")[0]} ({count})
                      </span>
                    ))}
                  </div>
                </div>

                <div className="p-3 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-[var(--radius-lg)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                    Primary Thematic Focus
                  </span>
                  <div className="flex flex-wrap gap-1 mt-1">
                    {matrix.summary.commonThemes.slice(0, 4).map((t) => (
                      <span
                        key={t}
                        className="px-1.5 py-0.5 text-[10px] font-semibold bg-[color:var(--accent-subtle)]/30 text-[color:var(--accent)] rounded"
                      >
                        #{t}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Responsive Matrix Grid */}
              <div className="border border-[color:var(--border-default)] rounded-[var(--radius-lg)] overflow-hidden shadow-xs bg-[color:var(--surface-raised)]">
                <div className="overflow-x-auto">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead>
                      <tr className="bg-[color:var(--surface-inset)] border-b border-[color:var(--border-default)] text-[11px] font-bold text-[color:var(--text-secondary)] uppercase tracking-wider">
                        <th className="p-3 w-48 shrink-0">Source & Year</th>
                        <th className="p-3 w-56">Focus / Question</th>
                        <th className="p-3 w-44">Methodology</th>
                        <th className="p-3 min-w-[240px]">Key Findings & Claims</th>
                        <th className="p-3 w-56">Limitations & Gaps</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[color:var(--border-subtle)]">
                      {matrix.rows.map((row) => {
                        const inText = formatInTextCitation(row);
                        return (
                          <tr key={row.sourceId} className="hover:bg-[color:var(--surface-hover)] transition-colors">
                            {/* Source Column */}
                            <td className="p-3 align-top">
                              <div className="font-bold text-[color:var(--text-primary)]">{inText}</div>
                              <div className="text-[11px] text-[color:var(--text-secondary)] mt-0.5 leading-snug line-clamp-2">
                                {row.title}
                              </div>
                              {row.journal && (
                                <div className="text-[10px] text-[color:var(--text-muted)] italic mt-0.5">
                                  {row.journal}
                                </div>
                              )}
                              <div className="mt-1 flex flex-wrap gap-1">
                                {row.tags.slice(0, 2).map((tag) => (
                                  <span key={tag} className="text-[9px] px-1 py-0.2 bg-[color:var(--surface-inset)] rounded text-[color:var(--text-muted)]">
                                    #{tag}
                                  </span>
                                ))}
                              </div>
                            </td>

                            {/* Research Focus */}
                            <td className="p-3 align-top text-[color:var(--text-secondary)] leading-relaxed">
                              {row.researchQuestion}
                            </td>

                            {/* Methodology */}
                            <td className="p-3 align-top">
                              <span className="inline-block px-2 py-0.5 rounded text-[10px] font-semibold bg-[color:var(--accent-subtle)]/40 text-[color:var(--accent)] border border-[color:var(--accent-border)]">
                                {row.methodology}
                              </span>
                            </td>

                            {/* Key Findings */}
                            <td className="p-3 align-top">
                              <ul className="space-y-1.5">
                                {row.keyFindings.slice(0, 3).map((f, i) => (
                                  <li key={i} className="flex items-start gap-1.5 text-[color:var(--text-primary)]">
                                    <span className="text-[color:var(--accent)] font-bold shrink-0 mt-0.5">•</span>
                                    <span className="leading-relaxed">{f}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>

                            {/* Limitations */}
                            <td className="p-3 align-top text-[color:var(--text-muted)] leading-relaxed">
                              <ul className="space-y-1">
                                {row.limitations.slice(0, 2).map((l, i) => (
                                  <li key={i} className="flex items-start gap-1">
                                    <span className="text-amber-500 font-bold shrink-0">!</span>
                                    <span>{l}</span>
                                  </li>
                                ))}
                              </ul>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>

              {/* Actions below table */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <p className="text-xs text-[color:var(--text-muted)]">
                  💡 Tip: Use the tabs above to generate continuous literature review narratives or query selected papers.
                </p>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => triggerCopyFeedback("copy-md-2", exportMatrixToMarkdown(matrix))}
                    className="px-3 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                  >
                    {copiedAction === "copy-md-2" ? "✓ Table Copied" : "📋 Copy Table for Paper"}
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: THEMATIC SYNTHESIS NARRATIVE */}
          {activeTab === "narrative" && (
            <div className="max-w-4xl mx-auto flex flex-col gap-4">
              <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-lg)]">
                <div className="flex items-center justify-between pb-3 border-b border-[color:var(--border-subtle)]">
                  <div className="flex items-center gap-2">
                    <span className="text-lg">📝</span>
                    <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Publication-Ready Thematic Overview
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() =>
                      triggerCopyFeedback("copy-narrative", matrix.summary.synthesizedNarrative)
                    }
                    className="px-3 py-1.5 text-xs font-bold rounded-[var(--radius-md)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                  >
                    {copiedAction === "copy-narrative" ? "✓ Copied to Clipboard" : "📋 Copy Literature Review Text"}
                  </button>
                </div>

                <div className="mt-4 prose prose-sm dark:prose-invert max-w-none text-xs text-[color:var(--text-primary)] leading-relaxed whitespace-pre-wrap font-sans bg-[color:var(--surface-inset)] p-4 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)]">
                  {matrix.summary.synthesizedNarrative}
                </div>
              </div>

              {/* Reference list preview */}
              <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-lg)]">
                <div className="flex items-center justify-between pb-2">
                  <h4 className="text-xs font-bold text-[color:var(--text-secondary)] uppercase tracking-wider">
                    Associated Bibliographic Citations (APA 7th)
                  </h4>
                  <button
                    type="button"
                    onClick={() =>
                      triggerCopyFeedback(
                        "copy-biblio",
                        generateBatchBibliography(items, "apa7")
                      )
                    }
                    className="text-xs text-[color:var(--accent)] hover:underline font-semibold cursor-pointer"
                  >
                    {copiedAction === "copy-biblio" ? "✓ Citations Copied" : "Copy Citations"}
                  </button>
                </div>
                <div className="space-y-1.5 mt-2">
                  {items.map((it) => (
                    <p key={it.id} className="text-xs text-[color:var(--text-secondary)] pl-4 -indent-4">
                      {it.citation || it.title}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ASK SELECTED SOURCES */}
          {activeTab === "ask" && (
            <div className="max-w-4xl mx-auto flex flex-col gap-4">
              {/* Presets Bar */}
              <div className="flex flex-col gap-1.5">
                <span className="text-xs font-bold text-[color:var(--text-secondary)]">
                  ⚡ Quick Analytical Presets:
                </span>
                <div className="flex flex-wrap gap-2">
                  {SYNTHESIS_PRESETS.map((preset) => (
                    <button
                      key={preset.id}
                      type="button"
                      onClick={() => {
                        setQuestion(preset.prompt);
                        handleAskQuestion(preset.prompt);
                      }}
                      className="px-3 py-1.5 rounded-[var(--radius-md)] text-xs font-semibold bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] text-[color:var(--text-primary)] hover:border-[color:var(--accent)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                    >
                      {preset.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Query Input Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleAskQuestion(question);
                }}
                className="flex items-center gap-2"
              >
                <input
                  type="text"
                  value={question}
                  onChange={(e) => setQuestion(e.target.value)}
                  placeholder="Ask a question across these selected sources (e.g., 'What are the main limitations?')..."
                  className="flex-1 px-4 py-2.5 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-lg)] text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden focus:border-[color:var(--accent)]"
                />
                <button
                  type="submit"
                  disabled={isAsking || !question.trim()}
                  className="px-4 py-2.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-lg)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors disabled:opacity-50 cursor-pointer shrink-0"
                >
                  {isAsking ? "Analyzing..." : "Synthesize Answer"}
                </button>
              </form>

              {qaError && (
                <div role="alert" className="p-3 bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400 rounded-[var(--radius-md)]">
                  {qaError}
                </div>
              )}

              {/* Q&A Result */}
              {qaResult && (
                <div className="p-5 bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-lg)] flex flex-col gap-4 animate-in fade-in duration-150">
                  <div className="flex items-center justify-between pb-2 border-b border-[color:var(--border-subtle)]">
                    <div className="flex items-center gap-2">
                      <span className="text-base">💡</span>
                      <span className="text-xs font-bold text-[color:var(--text-primary)]">
                        Grounded Synthesis for: "{qaResult.question}"
                      </span>
                    </div>
                    <span className="px-2 py-0.5 text-[10px] font-bold rounded uppercase bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">
                      Consensus: {qaResult.consensusDegree}
                    </span>
                  </div>

                  <div className="text-xs text-[color:var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                    {qaResult.answer}
                  </div>

                  {/* Sources Cited & Verbatim Anchors */}
                  <div className="pt-3 border-t border-[color:var(--border-subtle)] flex flex-col gap-2">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                      Attributed Sources & Grounded Quotes:
                    </span>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                      {qaResult.referencedSources.map((ref) => (
                        <div key={ref.id} className="p-2.5 bg-[color:var(--surface-inset)] rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] text-[11px]">
                          <div className="font-bold text-[color:var(--text-primary)]">{ref.inTextCitation}</div>
                          <div className="text-[10px] text-[color:var(--text-muted)] truncate">{ref.title}</div>
                          {ref.matchedQuotes.length > 0 && (
                            <p className="mt-1 text-[10px] text-[color:var(--text-secondary)] italic">
                              "{ref.matchedQuotes[0]}"
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* ================= FOOTER ================= */}
        <footer className="px-6 py-3 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex flex-wrap items-center justify-between gap-3 text-xs shrink-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => {
                const bib = generateBatchBibTeX(items);
                downloadTextFile(bib, `references-${activeProject || "export"}.bib`, "application/x-bibtex;charset=utf-8");
              }}
              className="px-3 py-1 text-xs font-semibold rounded-[var(--radius-md)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer"
            >
              📥 Download .bib
            </button>
            <button
              type="button"
              onClick={() => {
                const csv = exportMatrixToCSV(matrix);
                downloadTextFile(csv, `matrix-${activeProject || "export"}.csv`, "text/csv;charset=utf-8");
              }}
              className="px-3 py-1 text-xs font-semibold rounded-[var(--radius-md)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer"
            >
              📥 Download CSV
            </button>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-1.5 text-xs font-semibold rounded-[var(--radius-md)] bg-[color:var(--surface-inset)] border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] cursor-pointer"
            >
              Close
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}
