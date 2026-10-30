import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { saveIntakeAnswers, authedStreamFetch } from "../../api";
import { useOptionalResearchWorkspace } from "../ResearchContext";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";

export type AcademicDatabase =
  | "CrossRef"
  | "arXiv"
  | "Semantic Scholar"
  | "PubMed"
  | "IEEE Xplore"
  | "DOAJ";

export const ACADEMIC_DATABASES: AcademicDatabase[] = [
  "CrossRef",
  "arXiv",
  "Semantic Scholar",
  "PubMed",
  "IEEE Xplore",
  "DOAJ",
];

export interface ExternalSourceItem {
  id: string;
  title: string;
  author: string;
  year?: number;
  database: AcademicDatabase | string;
  doi?: string;
  url?: string;
  gap_addressed: string;
  snippet: string;
  relevance: number; // 0-100
  relevance_score?: number; // alias for Stage 12 compatibility
  evidentiary_role?: string;
  match_rationale?: string;
  matched_concepts?: string[];
  citation_count?: number;
  journal?: string;
  is_open_access?: boolean;
  open_access_pdf_url?: string;
}

export function formatApaCitation(item: ExternalSourceItem): string {
  // Missing metadata stays visibly missing; nothing is invented.
  const author = item.author || "[Author unknown]";
  const year = item.year || "n.d.";
  const title = item.title || "[Untitled]";
  const journal = item.journal ? ` ${item.journal}.` : "";
  const link = item.doi ? ` https://doi.org/${item.doi}` : item.url ? ` ${item.url}` : "";
  return `${author} (${year}). ${title}.${journal}${link}`;
}

export function formatBibtexCitation(item: ExternalSourceItem): string {
  const firstAuthor = (item.author?.split(/[\s,]+/)[0] || "Author").replace(/[^a-zA-Z]/g, "");
  const firstWord = (item.title?.split(/[\s,]+/)[0] || "Paper").replace(/[^a-zA-Z]/g, "");
  const citeKey = `${firstAuthor.toLowerCase()}${item.year || "nd"}${firstWord.toLowerCase()}`;
  return `@article{${citeKey},
  author = {${item.author || "Unknown"}},
  title = {${item.title}},
  journal = {${item.journal || ""}},
  year = {${item.year || ""}},
  doi = {${item.doi || ""}},
  note = {Evidentiary Role: ${item.evidentiary_role || "general"}}
}`;
}

export interface ManualSourceForm {
  title: string;
  author: string;
  year?: number;
  database: AcademicDatabase | string;
  doi?: string;
  url?: string;
  gap_addressed: string;
  snippet: string;
  evidentiary_role: string;
  relevance: number;
}

const INITIAL_MANUAL_FORM: ManualSourceForm = {
  title: "",
  author: "",
  year: new Date().getFullYear(),
  database: "CrossRef",
  doi: "",
  gap_addressed: "",
  snippet: "",
  evidentiary_role: "comparative",
  relevance: 92,
};

export default function ExternalResearchStage({
  stage,
  projectId,
  project: propProject,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved?: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const workspaceContext = useOptionalResearchWorkspace();
  const project = propProject || workspaceContext?.project;
  const def = STAGE_MAP.get(stage);

  const handleSave = onSaved || workspaceContext?.setProject;
  const handleAdvance = onAdvance || workspaceContext?.advanceStage;

  // 1. Phase I & II Grounding Context
  const workingTitle =
    project?.answers?.working_title ||
    project?.answers?.assignment_title ||
    project?.answers?.title ||
    "Untitled Research Manuscript";

  const targetJournal = project?.answers?.target_journal || "Peer-Reviewed Venue";
  const methodology =
    project?.answers?.methodology ||
    project?.answers?.study_design ||
    project?.answers?.article_type ||
    "Empirical Research";

  const parsedGaps = useMemo(() => {
    try {
      const rawGaps = project?.answers?.identified_gaps;
      if (!rawGaps) return [];
      const gaps = typeof rawGaps === "string" ? JSON.parse(rawGaps) : rawGaps;
      return Array.isArray(gaps) ? gaps : [];
    } catch {
      return [];
    }
  }, [project?.answers?.identified_gaps]);

  const anchorGap = useMemo(() => {
    if (parsedGaps.length === 0) return null;
    const anchorId = project?.answers?.anchor_gap_id || project?.answers?.selected_gap;
    return parsedGaps.find((g: any) => g.id === anchorId) || parsedGaps[0] || null;
  }, [parsedGaps, project?.answers?.anchor_gap_id, project?.answers?.selected_gap]);

  const approvedVaultSourcesCount = useMemo(() => {
    try {
      const raw = project?.answers?.approved_vault_sources;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  }, [project?.answers?.approved_vault_sources]);

  const primaryDatasetsCount = useMemo(() => {
    try {
      const raw = project?.answers?.additional_datasets;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  }, [project?.answers?.additional_datasets]);

  const extractedEvidenceCount = useMemo(() => {
    try {
      const raw = project?.answers?.extracted_evidence;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed.length;
      }
    } catch {}
    return 0;
  }, [project?.answers?.extracted_evidence]);

  // 2. Crawler Query & State
  const defaultQuery = useMemo(() => {
    if (anchorGap?.title) {
      return `${anchorGap.title} empirical evaluation benchmark`;
    }
    return `${workingTitle} comparative analysis`;
  }, [anchorGap?.title, workingTitle]);

  const [searchQuery, setSearchQuery] = useState(defaultQuery);
  const [selectedDatabases, setSelectedDatabases] = useState<AcademicDatabase[]>([
    "CrossRef",
    "arXiv",
    "Semantic Scholar",
    "IEEE Xplore",
  ]);
  const [minRelevance, setMinRelevance] = useState<number>(75);

  // 3. Results State (Hydrated from project answers)
  const [results, setResults] = useState<ExternalSourceItem[] | null>(() => {
    try {
      const saved = project?.answers?.pending_external_sources;
      if (saved) {
        const parsed = typeof saved === "string" ? JSON.parse(saved) : saved;
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return null;
  });

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successToast, setSuccessToast] = useState<string | null>(null);

  // 4. Modals State
  const [inspectItem, setInspectItem] = useState<ExternalSourceItem | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [manualForm, setManualForm] = useState<ManualSourceForm>(INITIAL_MANUAL_FORM);

  // 5. Filter & Interactive States
  const [ledgerSearch, setLedgerSearch] = useState("");
  const [databaseFilter, setDatabaseFilter] = useState<string>("all");
  const [roleFilter, setRoleFilter] = useState<string>("all");
  const [showOnlyOpenAccess, setShowOnlyOpenAccess] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [copyFeedback, setCopyFeedback] = useState<{ id: string; type: "apa" | "bibtex" } | null>(null);

  const keywordSuggestions = useMemo(() => {
    const rawTokens = [
      anchorGap?.title,
      methodology,
      targetJournal,
      "empirical benchmark",
      "comparative analysis",
      "reproducibility bounds",
      "cross-validation",
      "robustness",
    ]
      .filter(Boolean)
      .join(" ")
      .split(/[\s,;:()"]+/)
      .filter((w) => w.length > 3 && !/^(with|under|from|that|this|these|about|into|more|over|research|study)$/i.test(w));
    const uniqueTokens = Array.from(new Set(rawTokens));
    return uniqueTokens
      .filter((tok) => !searchQuery.toLowerCase().includes(tok.toLowerCase()))
      .slice(0, 6);
  }, [anchorGap?.title, methodology, targetJournal, searchQuery]);

  const handleAppendKeyword = (kw: string) => {
    setSearchQuery((prev) => {
      if (prev.toLowerCase().includes(kw.toLowerCase())) return prev;
      return `${prev} ${kw}`.trim();
    });
  };

  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const clearTimer = () => {
    if (logIntervalRef.current) {
      clearInterval(logIntervalRef.current);
      logIntervalRef.current = null;
    }
  };

  useEffect(() => {
    return () => {
      clearTimer();
    };
  }, []);

  // 6. Persistence Helper
  const persistDiscoveredSources = useCallback(
    async (nextResults: ExternalSourceItem[]) => {
      if (project) {
        const newAnswers = {
          ...project.answers,
          pending_external_sources: JSON.stringify(nextResults),
          external_research_status: "completed",
        };
        const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        if (handleSave) {
          handleSave(updated);
        }
      }
    },
    [handleSave, project, projectId]
  );

  // Toggle Database Selection
  const toggleDatabase = (db: AcademicDatabase) => {
    setSelectedDatabases((prev) =>
      prev.includes(db) ? prev.filter((d) => d !== db) : [...prev, db]
    );
  };


  // 8. Start Search / Web Crawler
  const startSearch = async () => {
    clearTimer();
    setIsProcessing(true);
    setError(null);

    const activeDbs = selectedDatabases.length > 0 ? selectedDatabases : ["CrossRef", "arXiv"];

    setLogs([
      {
        id: `log-${Date.now()}-1`,
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: "Starting literature search…",
      },
      {
        id: `log-${Date.now()}-2`,
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Constructing academic query for missing gap: "${anchorGap?.title || workingTitle}"...`,
      },
    ]);


    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/external-research`,
        "POST",
        {
          query: searchQuery,
          databases: activeDbs,
          minRelevance,
          anchorGap: anchorGap?.title,
          workingTitle,
          targetJournal,
          methodology,
        },
        async (event, data) => {
          if (event === "log" || event === "chunk") {
            setLogs((prev) => [
              ...prev,
              {
                id: `log-${Date.now()}-${Math.random()}`,
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: event === "chunk" ? "action" : "info",
                message: data.message || data.chunk || JSON.stringify(data),
              },
            ]);
          } else if (event === "done") {
            clearTimer();
            // Only records the scholarly indexes returned; nothing is
            // filled in (no default DOI, relevance, citations or snippet).
            const minedSources: ExternalSourceItem[] = (Array.isArray(data.data) ? data.data : [])
              .filter((d: any) => typeof d?.title === "string" && d.title.trim())
              .map((d: any, idx: number) => ({
                id: d.id || `ext-stream-${Date.now()}-${idx}`,
                title: d.title,
                author: d.author || "",
                year: Number(d.year) || undefined,
                database: d.database || "",
                doi: d.doi || undefined,
                url: d.url || undefined,
                gap_addressed: d.gap_addressed || anchorGap?.title || "",
                snippet: d.snippet || "",
                relevance: Number(d.relevance) || 0,
                relevance_score: Number(d.relevance) || 0,
                evidentiary_role: d.evidentiary_role || undefined,
                matched_concepts: Array.isArray(d.matched_concepts) ? d.matched_concepts : [],
                citation_count: typeof d.citation_count === "number" ? d.citation_count : undefined,
                journal: d.journal || undefined,
                is_open_access: d.is_open_access === true,
                open_access_pdf_url: d.open_access_pdf_url || undefined,
              }));

            // An empty answer must not wipe papers the user already has.
            if (minedSources.length > 0) {
              setResults(minedSources);
              await persistDiscoveredSources(minedSources);
            }

            setLogs((prev) => [
              ...prev,
              {
                id: `log-${Date.now()}-done`,
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message:
                  minedSources.length > 0
                    ? `Search complete: ${minedSources.length} records from scholarly indexes. Review and prune before triage.`
                    : "No records found for this query. Try different keywords.",
              },
            ]);

            setSuccessToast(
              minedSources.length > 0 ? `Found ${minedSources.length} records. Review and prune before triage.` : "No records found."
            );
            setTimeout(() => setSuccessToast(null), 5000);
          } else if (event === "error") {
            throw new Error(data.message || "Agent encountered an error searching external databases.");
          }
        }
      );
    } catch (err: any) {
      clearTimer();
      console.warn("External literature search failed:", err);
      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-fail`,
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: "Literature search unavailable: nothing was added. Try again, or add papers manually.",
        },
      ]);
    } finally {
      clearTimer();
      setIsProcessing(false);
    }
  };

  // 9. Manual Paper Addition Handler
  const handleOpenAddModal = () => {
    setManualForm({
      ...INITIAL_MANUAL_FORM,
      gap_addressed: anchorGap?.title || parsedGaps[0]?.title || "Methodological Gap",
    });
    setIsAddModalOpen(true);
  };

  const handleSaveManualPaper = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualForm.title.trim()) return;

    const newPaper: ExternalSourceItem = {
      id: `ext-manual-${Date.now()}`,
      title: manualForm.title.trim(),
      author: manualForm.author.trim(),
      year: Number(manualForm.year) || undefined,
      database: manualForm.database || "CrossRef",
      doi: (manualForm.doi || "").trim() || undefined,
      gap_addressed: manualForm.gap_addressed || anchorGap?.title || "Identified Gap",
      snippet: manualForm.snippet.trim(),
      relevance: Number(manualForm.relevance) || 0,
      relevance_score: Number(manualForm.relevance) || 0,
      evidentiary_role: manualForm.evidentiary_role || "comparative",
      matched_concepts: ["Manual Addition", manualForm.database.toString()],
      citation_count: undefined,
      journal: undefined,
      is_open_access: false,
    };

    const nextResults = [newPaper, ...(results || [])];
    setResults(nextResults);
    await persistDiscoveredSources(nextResults);
    setIsAddModalOpen(false);
    setSuccessToast(`Added "${newPaper.title}" to discovered external papers.`);
    setTimeout(() => setSuccessToast(null), 4000);
  };

  // 10. Paper Exclusion / Removal Handlers
  const handleDeletePaper = async (id: string) => {
    const nextResults = (results || []).filter((r) => r.id !== id);
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.delete(id);
      return next;
    });
    setResults(nextResults);
    await persistDiscoveredSources(nextResults);
    setSuccessToast("Paper excluded from external triage ledger.");
    setTimeout(() => setSuccessToast(null), 3000);
  };

  const handleToggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

  const handleSelectAll = () => {
    if (!filteredResults) return;
    if (selectedIds.size === filteredResults.length && filteredResults.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredResults.map((r) => r.id)));
    }
  };

  const handleBatchExclude = async () => {
    if (selectedIds.size === 0 || !results) return;
    const count = selectedIds.size;
    const nextResults = results.filter((r) => !selectedIds.has(r.id));
    setSelectedIds(new Set());
    setResults(nextResults);
    await persistDiscoveredSources(nextResults);
    setSuccessToast(`Excluded ${count} papers from discovery ledger.`);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handlePruneLowMatch = async () => {
    if (!results) return;
    const initialCount = results.length;
    const nextResults = results.filter((r) => (r.relevance || 0) >= 85);
    const prunedCount = initialCount - nextResults.length;
    if (prunedCount === 0) {
      setSuccessToast("All discovered papers meet the ≥85% relevance threshold.");
      setTimeout(() => setSuccessToast(null), 3000);
      return;
    }
    setResults(nextResults);
    await persistDiscoveredSources(nextResults);
    setSuccessToast(`Pruned ${prunedCount} low-relevance (<85%) papers.`);
    setTimeout(() => setSuccessToast(null), 3500);
  };

  const handleCopyCitation = async (item: ExternalSourceItem, type: "apa" | "bibtex") => {
    const text = type === "apa" ? formatApaCitation(item) : formatBibtexCitation(item);
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      }
      setCopyFeedback({ id: item.id, type });
      setTimeout(() => setCopyFeedback(null), 2500);
    } catch (err) {
      console.warn("Failed to copy citation to clipboard:", err);
    }
  };

  const handleExportBibtex = () => {
    const itemsToExport =
      selectedIds.size > 0
        ? (results || []).filter((r) => selectedIds.has(r.id))
        : filteredResults || results || [];

    if (itemsToExport.length === 0) return;

    const bibtexContent = itemsToExport.map(formatBibtexCitation).join("\n\n");
    const blob = new Blob([bibtexContent], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `scholar_external_sources_${Date.now()}.bib`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    setSuccessToast(`Exported ${itemsToExport.length} citations to BibTeX.`);
    setTimeout(() => setSuccessToast(null), 3000);
  };

  // 11. Lock & Advance to Stage 12 (source_approval_external)
  const [isAdvancing, setIsAdvancing] = useState(false);
  const handleProceed = async () => {
    setIsAdvancing(true);
    try {
      if (results) {
        await persistDiscoveredSources(results);
      }
      if (handleAdvance) {
        handleAdvance("source_approval_external");
      }
    } catch (err) {
      console.error("Failed to advance stage:", err);
      if (handleAdvance) {
        handleAdvance("source_approval_external");
      }
    } finally {
      setIsAdvancing(false);
    }
  };

  // 12. Filtered Results for Ledger
  const filteredResults = useMemo(() => {
    if (!results) return null;
    return results.filter((item) => {
      const q = ledgerSearch.toLowerCase();
      const matchesSearch =
        !q ||
        item.title.toLowerCase().includes(q) ||
        item.author.toLowerCase().includes(q) ||
        item.snippet.toLowerCase().includes(q) ||
        (item.doi || "").toLowerCase().includes(q) ||
        item.gap_addressed.toLowerCase().includes(q) ||
        (item.evidentiary_role && item.evidentiary_role.toLowerCase().includes(q));

      if (!matchesSearch) return false;

      if (databaseFilter !== "all" && item.database !== databaseFilter) return false;

      if (roleFilter !== "all") {
        if (!item.evidentiary_role || !item.evidentiary_role.toLowerCase().includes(roleFilter.toLowerCase())) {
          return false;
        }
      }

      if (showOnlyOpenAccess && !item.is_open_access) {
        return false;
      }

      return true;
    });
  }, [results, ledgerSearch, databaseFilter, roleFilter, showOnlyOpenAccess]);

  const roleCounts = useMemo(() => {
    const counts: Record<string, number> = {
      all: results?.length || 0,
      benchmark: 0,
      empirical: 0,
      theoretical: 0,
      methodological: 0,
      comparative: 0,
    };
    if (results) {
      for (const item of results) {
        const role = (item.evidentiary_role || "").toLowerCase();
        if (role.includes("benchmark")) counts.benchmark++;
        else if (role.includes("empirical")) counts.empirical++;
        else if (role.includes("theoretical")) counts.theoretical++;
        else if (role.includes("method")) counts.methodological++;
        else if (role.includes("compar")) counts.comparative++;
      }
    }
    return counts;
  }, [results]);

  const getDatabaseBadgeClass = (db: string) => {
    switch (db) {
      case "arXiv":
        return "bg-rose-500/10 text-rose-600 border-rose-500/20 dark:text-rose-400";
      case "IEEE Xplore":
        return "bg-cyan-500/10 text-cyan-600 border-cyan-500/20 dark:text-cyan-400";
      case "Semantic Scholar":
        return "bg-purple-500/10 text-purple-600 border-purple-500/20 dark:text-purple-400";
      case "PubMed":
        return "bg-emerald-500/10 text-emerald-600 border-emerald-500/20 dark:text-emerald-400";
      case "DOAJ":
        return "bg-amber-500/10 text-amber-600 border-amber-500/20 dark:text-amber-400";
      default:
        return "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border-[color:var(--accent-border)]";
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-muted)]">Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] font-sans">
      {/* 1. Header Bar */}
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-[color:var(--border-subtle)] flex flex-wrap gap-4 justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-xs relative">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded border border-[color:var(--accent-border)]">
                Phase II: Evidence
              </span>
              <span className="text-xs text-[color:var(--text-muted)] font-mono">
                Stage {def.number} of 25
              </span>
            </div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">
              {def.label}
            </h2>
            <p className="text-sm text-[color:var(--text-secondary)] mt-0.5">
              Deploy the Web Crawler Agent across global academic registries to discover literature that fills remaining evidentiary gaps.
            </p>
          </div>
        </div>

        {/* Header Actions */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleOpenAddModal}
            className="px-4 py-2 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-sm font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors flex items-center gap-2 cursor-pointer shadow-xs"
          >
            <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + Add External Paper / DOI
          </button>

          <button
            type="button"
            onClick={startSearch}
            disabled={isProcessing}
            className="px-5 py-2 rounded-lg bg-[color:var(--accent)] text-[color:var(--text-inverse)] text-sm font-bold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Crawling Databases...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {results ? "Re-Crawl Databases" : "Initialize Web Crawl"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Notification Toast */}
      {successToast && (
        <div className="bg-[color:var(--state-success-subtle)] border-b border-[color:var(--state-success)] px-6 py-2.5 text-xs font-semibold text-[color:var(--state-success)] flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{successToast}</span>
          </div>
          <button
            type="button"
            onClick={() => setSuccessToast(null)}
            className="text-[color:var(--state-success)] opacity-70 hover:opacity-100 cursor-pointer"
          >
            ✕
          </button>
        </div>
      )}

      {/* 2. Grounding Foundation Ribbon */}
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 min-w-0">
          <span className="font-mono uppercase font-bold text-[color:var(--accent)] shrink-0 bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded border border-[color:var(--accent-border)]">
            Grounding Anchor
          </span>
          <span className="font-semibold text-[color:var(--text-primary)] truncate max-w-xl" title={workingTitle}>
            "{workingTitle}"
          </span>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {anchorGap && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
              <span>👑 Anchor Gap:</span>
              <span className="font-semibold text-[color:var(--text-primary)] max-w-xs truncate">{anchorGap.title}</span>
            </span>
          )}
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            📚 {approvedVaultSourcesCount} Vault Sources
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            📊 {primaryDatasetsCount} Datasets
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            ⛏️ {extractedEvidenceCount} Claims Extracted
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🏛 {targetJournal}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🔬 {methodology}
          </span>
        </div>
      </div>

      {/* 3. Main Scrollable Workspace */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 4 · Claim Extraction & Synthesis"
          stageLabel="External Academic Crawler & Deep Literature Harvest"
          description="Autonomous scholarly crawler interrogating CrossRef, arXiv, Semantic Scholar, PubMed, and IEEE Xplore to discover preprints and peer-reviewed literature bridging your anchor gap."
          instructions={[
            "Configure target academic databases and set relevance threshold (e.g., ≥ 75%)",
            "Click 'Start Academic Crawler' to launch multi-registry discovery stream",
            "Inspect candidate papers, citations, open access links, and matching rationales",
            "Queue discovered papers for approval triage before claim matrix synthesis",
          ]}
          targetJournal={project?.answers?.["target_journal"]}
          tips={[
            "Grounding your paper with recent preprints (2024-2026) demonstrates command of the bleeding edge of the discipline.",
            "All crawled papers capture real DOIs, minimizing editorial verification overhead.",
          ]}
        />

        {/* Crawler Configuration Panel */}
        <div className="max-w-5xl mx-auto bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-5 shadow-xs space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 pb-3 border-b border-[color:var(--border-subtle)]">
            <div>
              <h3 className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Web Crawler Targeting & Query Parameters
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Tune the academic registries and semantic query parameters directing the autonomous search agent.
              </p>
            </div>

            <div className="flex items-center gap-2 text-xs">
              <span className="text-[color:var(--text-muted)] font-mono">Min Match:</span>
              <select
                value={minRelevance}
                onChange={(e) => setMinRelevance(Number(e.target.value))}
                className="px-2.5 py-1 text-xs bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] font-mono focus:outline-none"
              >
                <option value={70}>≥ 70% Relevance</option>
                <option value={75}>≥ 75% Relevance</option>
                <option value={80}>≥ 80% Relevance</option>
                <option value={85}>≥ 85% Relevance</option>
                <option value={90}>≥ 90% Strict Baseline</option>
              </select>
            </div>
          </div>

          {/* Query Refinement Field */}
          <div>
            <label className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
              Academic Search Query
            </label>
            <div className="relative">
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="e.g. Byzantine fault tolerance WAN latency sub-second consensus"
                className="w-full px-3 py-2 text-xs font-mono bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
              />
              <button
                type="button"
                onClick={() => setSearchQuery(defaultQuery)}
                className="absolute right-2.5 top-2 text-[11px] font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
              >
                Reset to Gap
              </button>
            </div>

            {/* Keyword Query Expansion Suggestions */}
            {keywordSuggestions.length > 0 && (
              <div className="flex flex-wrap items-center gap-1.5 mt-2 pt-2 border-t border-[color:var(--border-subtle)] text-xs">
                <span className="text-[color:var(--text-muted)] font-medium">Quick suggestions:</span>
                {keywordSuggestions.map((kw) => (
                  <button
                    key={kw}
                    type="button"
                    data-testid={`keyword-chip-${kw}`}
                    onClick={() => handleAppendKeyword(kw)}
                    className="px-2 py-0.5 rounded-full bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] font-mono text-[11px] transition-colors cursor-pointer"
                  >
                    + {kw}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Target Academic Databases */}
          <div>
            <label className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1.5">
              Target Academic Databases & Registries
            </label>
            <div className="flex flex-wrap gap-2">
              {ACADEMIC_DATABASES.map((db) => {
                const isActive = selectedDatabases.includes(db);
                return (
                  <button
                    key={db}
                    type="button"
                    onClick={() => toggleDatabase(db)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-pointer flex items-center gap-1.5 ${
                      isActive
                        ? "bg-[color:var(--accent-subtle)] text-[color:var(--accent)] border-[color:var(--accent-border)] font-semibold shadow-xs"
                        : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                    }`}
                  >
                    <span>{isActive ? "✓ " : "+ "}</span>
                    <span>{db}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Terminal Logs During Crawl */}
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-5xl mx-auto">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Web Crawler Agent"
            />
          </div>
        )}

        {/* Error Callout */}
        {error && (
          <div className="max-w-5xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)] text-sm flex items-center gap-3">
            <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
        )}

        {/* Empty State before crawl */}
        {!results && !isProcessing && (
          <div className="max-w-4xl mx-auto p-12 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs space-y-4">
            <div className="w-16 h-16 bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--accent)] rounded-2xl flex items-center justify-center mx-auto text-2xl">
              🌐
            </div>
            <h3 className="text-xl font-bold text-[color:var(--text-primary)]">
              Ready for Web Discovery
            </h3>
            <p className="text-sm text-[color:var(--text-secondary)] max-w-lg mx-auto leading-relaxed">
              The Web Crawler Agent will scan external academic databases like CrossRef, arXiv, PubMed, and IEEE Xplore to locate peer-reviewed papers that fill the open research gap: <strong className="text-[color:var(--text-primary)]">"{anchorGap?.title || workingTitle}"</strong>.
            </p>

            <div className="pt-2 flex justify-center gap-3">
              <button
                type="button"
                onClick={startSearch}
                className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-[color:var(--text-inverse)] font-bold text-sm shadow-md hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                Launch Web Crawler Agent
              </button>

              <button
                type="button"
                onClick={handleOpenAddModal}
                className="px-5 py-2.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                + Ingest DOI Manually
              </button>
            </div>
          </div>
        )}

        {/* Discovered External Papers Ledger */}
        {results && (
          <div className="max-w-5xl mx-auto space-y-4 animate-fade-in">
            {/* Header / Filter Toolbar */}
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] p-4 rounded-xl space-y-3.5">
              <div className="flex flex-wrap items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <span className="w-8 h-8 rounded-lg bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] text-sm font-bold">
                    {results.length}
                  </span>
                  <div>
                    <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                      Discovered External Literature Candidates
                    </h3>
                    <p className="text-xs text-[color:var(--text-muted)]">
                      Indexed papers addressing missing literature gaps. Review relevance before triage handoff.
                    </p>
                  </div>
                </div>

                {/* Search & DB / OA Controls */}
                <div className="flex flex-wrap items-center gap-2.5 text-xs">
                  <div className="relative">
                    <input
                      type="text"
                      value={ledgerSearch}
                      onChange={(e) => setLedgerSearch(e.target.value)}
                      placeholder="Search discovered papers..."
                      className="w-52 px-3 py-1.5 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                    />
                    {ledgerSearch && (
                      <button
                        type="button"
                        onClick={() => setLedgerSearch("")}
                        aria-label="Clear search"
                        className="absolute right-2 top-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                      >
                        ✕
                      </button>
                    )}
                  </div>

                  <select
                    value={databaseFilter}
                    onChange={(e) => setDatabaseFilter(e.target.value)}
                    className="px-3 py-1.5 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none"
                  >
                    <option value="all">All Databases</option>
                    {ACADEMIC_DATABASES.map((db) => (
                      <option key={db} value={db}>
                        {db}
                      </option>
                    ))}
                  </select>

                  <button
                    type="button"
                    onClick={() => setShowOnlyOpenAccess((prev) => !prev)}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors border cursor-pointer flex items-center gap-1.5 ${
                      showOnlyOpenAccess
                        ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/30 dark:text-emerald-400 font-semibold"
                        : "bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] border-[color:var(--border-control)] hover:bg-[color:var(--surface-hover)]"
                    }`}
                    title="Filter only open access papers with free full-text access"
                  >
                    <span>{showOnlyOpenAccess ? "✓" : "🔓"}</span>
                    <span>Open Access</span>
                  </button>
                </div>
              </div>

              {/* Multi-Lens Evidentiary Role Filter Pills */}
              <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[color:var(--border-subtle)]">
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="text-[11px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mr-1">
                    Role Lens:
                  </span>
                  {[
                    { id: "all", label: "All Roles", count: roleCounts.all },
                    { id: "benchmark", label: "🏆 Benchmark", count: roleCounts.benchmark },
                    { id: "empirical", label: "🔬 Empirical", count: roleCounts.empirical },
                    { id: "theoretical", label: "📐 Theoretical", count: roleCounts.theoretical },
                    { id: "methodological", label: "🧪 Methodological", count: roleCounts.methodological },
                    { id: "comparative", label: "⚖️ Comparative", count: roleCounts.comparative },
                  ].map((tab) => {
                    const isSelected = roleFilter === tab.id;
                    return (
                      <button
                        key={tab.id}
                        type="button"
                        onClick={() => setRoleFilter(tab.id)}
                        className={`px-2.5 py-1 rounded-lg text-xs font-medium transition-all border cursor-pointer flex items-center gap-1.5 ${
                          isSelected
                            ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)] border-[color:var(--accent)] font-semibold shadow-xs"
                            : "bg-[color:var(--surface-canvas)] text-[color:var(--text-secondary)] border-[color:var(--border-subtle)] hover:bg-[color:var(--surface-hover)]"
                        }`}
                      >
                        <span>{tab.label}</span>
                        <span
                          className={`text-[10px] font-mono px-1.5 py-0.2 rounded-full ${
                            isSelected
                              ? "bg-white/20 text-white"
                              : "bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]"
                          }`}
                        >
                          {tab.count}
                        </span>
                      </button>
                    );
                  })}
                </div>

                {/* Batch Actions Group */}
                <div className="flex flex-wrap items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={handleSelectAll}
                    className="px-2.5 py-1 rounded-lg bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
                  >
                    {selectedIds.size > 0 && selectedIds.size === filteredResults?.length
                      ? "Deselect All"
                      : "Select All"}
                  </button>

                  {selectedIds.size > 0 && (
                    <button
                      type="button"
                      onClick={handleBatchExclude}
                      className="px-2.5 py-1 rounded-lg bg-[color:var(--state-danger-subtle)] border border-[color:var(--state-danger)] text-[color:var(--state-danger)] font-semibold hover:bg-[color:var(--state-danger)] hover:text-white transition-colors cursor-pointer"
                    >
                      Batch Exclude ({selectedIds.size})
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={handlePruneLowMatch}
                    className="px-2.5 py-1 rounded-lg bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] hover:border-[color:var(--accent-border)] transition-colors cursor-pointer"
                    title="Exclude all papers with relevance match under 85%"
                  >
                    Prune &lt; 85%
                  </button>

                  <button
                    type="button"
                    onClick={handleExportBibtex}
                    className="px-2.5 py-1 rounded-lg bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] hover:border-[color:var(--accent-border)] transition-colors cursor-pointer flex items-center gap-1"
                    title="Export citations as BibTeX file"
                  >
                    <span>📥 Export BibTeX</span>
                    {selectedIds.size > 0 && (
                      <span className="font-mono text-[10px] bg-[color:var(--accent-subtle)] text-[color:var(--accent)] px-1.5 py-0.2 rounded-full">
                        {selectedIds.size}
                      </span>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Papers List */}
            {filteredResults && filteredResults.length === 0 ? (
              <div className="p-8 text-center bg-[color:var(--surface-raised)] rounded-xl border border-[color:var(--border-subtle)] text-[color:var(--text-muted)] text-sm space-y-2">
                <p>No external papers match your search or role filter criteria.</p>
                <button
                  type="button"
                  onClick={() => {
                    setLedgerSearch("");
                    setDatabaseFilter("all");
                    setRoleFilter("all");
                    setShowOnlyOpenAccess(false);
                  }}
                  className="text-xs font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
                >
                  Reset all filters
                </button>
              </div>
            ) : (
              <div className="space-y-3.5">
                {filteredResults?.map((item) => (
                  <div
                    key={item.id}
                    className={`p-5 bg-[color:var(--surface-raised)] border rounded-2xl transition-all shadow-xs space-y-3 relative group ${
                      selectedIds.has(item.id)
                        ? "border-[color:var(--accent)] bg-[color:var(--accent-subtle)]/15"
                        : "border-[color:var(--border-subtle)] hover:border-[color:var(--accent-border)]"
                    }`}
                  >
                    {/* Top Meta Line */}
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div className="flex flex-wrap items-center gap-2 text-xs">
                        <input
                          type="checkbox"
                          checked={selectedIds.has(item.id)}
                          onChange={() => handleToggleSelect(item.id)}
                          className="w-4 h-4 rounded border-[color:var(--border-control)] text-[color:var(--accent)] focus:ring-[color:var(--accent)] cursor-pointer mr-1"
                          title="Select paper for batch actions"
                        />

                        <span
                          className={`font-mono text-xs font-bold uppercase px-2.5 py-0.5 rounded-md border ${getDatabaseBadgeClass(
                            item.database
                          )}`}
                        >
                          {item.database}
                        </span>

                        {item.relevance > 0 && (
                          <span className="inline-flex items-center gap-1 font-mono text-xs font-bold px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--state-success)] border border-[color:var(--border-subtle)]">
                            ★ {item.relevance}% Match
                          </span>
                        )}

                        {item.evidentiary_role && (
                          <span className="capitalize px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)] font-medium text-[11px]">
                            {item.evidentiary_role}
                          </span>
                        )}

                        {item.is_open_access && (
                          <span className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-600 border border-emerald-500/20 dark:text-emerald-400">
                            🔓 Open Access
                          </span>
                        )}

                        {item.doi && (
                          <a
                            href={`https://doi.org/${item.doi}`}
                            target="_blank"
                            rel="noreferrer"
                            className="text-[color:var(--text-muted)] hover:text-[color:var(--accent)] font-mono text-[11px] truncate max-w-[180px] hover:underline"
                            title={`Open DOI: ${item.doi}`}
                          >
                            doi:{item.doi} ↗
                          </a>
                        )}
                      </div>

                      {/* Card Action Buttons */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleCopyCitation(item, "apa")}
                          className="px-2.5 py-1 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] rounded-lg cursor-pointer transition-colors flex items-center gap-1"
                          title="Copy APA 7th Edition Citation"
                        >
                          {copyFeedback?.id === item.id && copyFeedback?.type === "apa" ? (
                            <span className="text-[color:var(--state-success)] font-bold">✓ Copied APA</span>
                          ) : (
                            <span>📋 Copy APA</span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCopyCitation(item, "bibtex")}
                          className="px-2.5 py-1 text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] rounded-lg cursor-pointer transition-colors flex items-center gap-1"
                          title="Copy BibTeX Citation"
                        >
                          {copyFeedback?.id === item.id && copyFeedback?.type === "bibtex" ? (
                            <span className="text-[color:var(--state-success)] font-bold">✓ Copied BibTeX</span>
                          ) : (
                            <span>📜 BibTeX</span>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => setInspectItem(item)}
                          className="px-3 py-1 text-xs font-semibold text-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] rounded-lg cursor-pointer transition-colors"
                        >
                          Inspect Abstract
                        </button>

                        <button
                          type="button"
                          onClick={() => handleDeletePaper(item.id)}
                          className="px-2.5 py-1 text-xs font-semibold text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] rounded-lg cursor-pointer transition-colors"
                        >
                          Exclude
                        </button>
                      </div>
                    </div>

                    {/* Paper Title & Authors */}
                    <div>
                      <h4 className="text-base font-bold text-[color:var(--text-primary)] leading-snug group-hover:text-[color:var(--accent)] transition-colors">
                        {item.title}
                      </h4>
                      <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                        <strong className="text-[color:var(--text-primary)]">{item.author}</strong> ({item.year}) • {item.journal || "Venue not listed"}
                        {item.citation_count !== undefined && (
                          <span className="ml-2 font-mono text-[color:var(--text-muted)]">
                            • {item.citation_count} Citations
                          </span>
                        )}
                      </p>
                    </div>

                    {/* Verbatim Excerpt */}
                    <blockquote className="text-xs font-serif text-[color:var(--text-primary)] leading-relaxed border-l-3 border-[color:var(--accent)] pl-3.5 py-1 italic bg-[color:var(--surface-canvas)] rounded-r-lg">
                      "{item.snippet}"
                    </blockquote>

                    {/* Addressed Gap Tag */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-[color:var(--border-subtle)] text-xs">
                      <div className="flex items-center gap-1.5 text-[color:var(--text-secondary)] font-medium">
                        <span className="text-[color:var(--accent)] font-bold">👑 Addresses Gap:</span>
                        <span className="text-[color:var(--text-primary)] font-semibold">{item.gap_addressed}</span>
                      </div>

                      {item.matched_concepts && item.matched_concepts.length > 0 && (
                        <div className="flex flex-wrap gap-1">
                          {item.matched_concepts.map((c, i) => (
                            <span
                              key={i}
                              className="text-[10px] font-mono px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)] border border-[color:var(--border-subtle)]"
                            >
                              {c}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 4. Sticky Footer Dock */}
      <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/95 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-md">
        <div className="flex items-center gap-3 text-xs font-medium text-[color:var(--text-secondary)]">
          <svg className="w-5 h-5 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>
            <strong className="font-bold text-[color:var(--text-primary)]">{results?.length || 0}</strong> external papers discovered and queued for approval triage.
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleProceed}
            disabled={isAdvancing}
            className="rounded-xl bg-[color:var(--accent)] px-8 py-3 text-sm font-bold text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            {isAdvancing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Transferring to Triage...
              </>
            ) : (
              <>
                Lock Discovered Sources & Proceed to External Approval Triage
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 5. Paper Inspector Modal */}
      {inspectItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden space-y-4">
            <div className="flex items-start justify-between pb-3 border-b border-[color:var(--border-subtle)]">
              <div>
                <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                  External Paper Inspector
                </span>
                <h3 className="text-lg font-bold text-[color:var(--text-primary)] mt-0.5">
                  {inspectItem.title}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-4 text-xs pr-1">
              <div className="grid grid-cols-2 gap-3 p-3 bg-[color:var(--surface-sunken)] rounded-xl border border-[color:var(--border-subtle)] font-mono">
                <div>
                  <span className="text-[color:var(--text-muted)]">Authors:</span>
                  <div className="font-semibold text-[color:var(--text-primary)] mt-0.5">{inspectItem.author}</div>
                </div>
                <div>
                  <span className="text-[color:var(--text-muted)]">Year:</span>
                  <div className="font-semibold text-[color:var(--text-primary)] mt-0.5">{inspectItem.year}</div>
                </div>
                <div>
                  <span className="text-[color:var(--text-muted)]">Database:</span>
                  <div className="font-semibold text-[color:var(--accent)] mt-0.5">{inspectItem.database}</div>
                </div>
                <div>
                  <span className="text-[color:var(--text-muted)]">Match Relevance:</span>
                  <div className="font-semibold text-[color:var(--state-success)] mt-0.5">{inspectItem.relevance}%</div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Digital Object Identifier (DOI)
                </label>
                <div className="p-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg font-mono text-[11px] text-[color:var(--text-primary)] break-all flex items-center justify-between">
                  <span>{inspectItem.doi}</span>
                  <a
                    href={`https://doi.org/${inspectItem.doi}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-[color:var(--accent)] hover:underline ml-2"
                  >
                    Open DOI ↗
                  </a>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Verbatim Abstract / Proof Excerpt
                </label>
                <div className="p-3 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg font-serif text-sm leading-relaxed italic text-[color:var(--text-primary)]">
                  "{inspectItem.snippet}"
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Addressed Research Gap
                </label>
                <div className="p-2.5 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-lg text-xs font-semibold text-[color:var(--text-primary)]">
                  👑 {inspectItem.gap_addressed}
                </div>
              </div>

              {/* Citations Copy Section in Modal */}
              <div className="space-y-3 pt-2 border-t border-[color:var(--border-subtle)]">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[color:var(--text-primary)]">
                      APA 7th Edition Citation
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCopyCitation(inspectItem, "apa")}
                      className="px-2.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-semibold hover:bg-[color:var(--accent)] hover:text-[color:var(--text-inverse)] transition-colors cursor-pointer"
                    >
                      {copyFeedback?.id === inspectItem.id && copyFeedback?.type === "apa"
                        ? "✓ Copied!"
                        : "Copy APA"}
                    </button>
                  </div>
                  <div className="p-2 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg font-sans text-xs text-[color:var(--text-primary)] select-all">
                    {formatApaCitation(inspectItem)}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-[color:var(--text-primary)]">
                      BibTeX Entry
                    </label>
                    <button
                      type="button"
                      onClick={() => handleCopyCitation(inspectItem, "bibtex")}
                      className="px-2.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-semibold hover:bg-[color:var(--accent)] hover:text-[color:var(--text-inverse)] transition-colors cursor-pointer"
                    >
                      {copyFeedback?.id === inspectItem.id && copyFeedback?.type === "bibtex"
                        ? "✓ Copied!"
                        : "Copy BibTeX"}
                    </button>
                  </div>
                  <pre className="p-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg font-mono text-[11px] text-[color:var(--text-secondary)] whitespace-pre-wrap select-all">
                    {formatBibtexCitation(inspectItem)}
                  </pre>
                </div>
              </div>
            </div>

            <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-end">
              <button
                type="button"
                onClick={() => setInspectItem(null)}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                Close Inspector
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. Manual Add Paper / DOI Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl max-w-xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-start justify-between pb-4 border-b border-[color:var(--border-subtle)]">
              <div>
                <span className="font-mono text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider">
                  Manual Literature Ingestion
                </span>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)] mt-0.5">
                  Add External Paper or DOI
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsAddModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveManualPaper} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Paper Title <span className="text-[color:var(--state-danger)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={manualForm.title}
                  onChange={(e) => setManualForm({ ...manualForm, title: e.target.value })}
                  placeholder="e.g. Asynchronous Byzantine Agreement in Practice"
                  className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Authors <span className="text-[color:var(--state-danger)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={manualForm.author}
                    onChange={(e) => setManualForm({ ...manualForm, author: e.target.value })}
                    placeholder="e.g. Lamport & Melliar-Smith"
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Publication Year
                  </label>
                  <input
                    type="number"
                    value={manualForm.year}
                    onChange={(e) => setManualForm({ ...manualForm, year: Number(e.target.value) })}
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Database Source
                  </label>
                  <select
                    value={manualForm.database}
                    onChange={(e) => setManualForm({ ...manualForm, database: e.target.value as AcademicDatabase })}
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none"
                  >
                    {ACADEMIC_DATABASES.map((db) => (
                      <option key={db} value={db}>
                        {db}
                      </option>
                    ))}
                    <option value="Manual Direct">Manual Direct Entry</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    DOI or Preprint URL
                  </label>
                  <input
                    type="text"
                    value={manualForm.doi}
                    onChange={(e) => setManualForm({ ...manualForm, doi: e.target.value })}
                    placeholder="10.1145/... or arXiv:2401.xxxx"
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Addressed Research Gap
                </label>
                <select
                  value={manualForm.gap_addressed}
                  onChange={(e) => setManualForm({ ...manualForm, gap_addressed: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none"
                >
                  {anchorGap && <option value={anchorGap.title}>👑 Anchor Gap: {anchorGap.title}</option>}
                  {parsedGaps
                    .filter((g: any) => g.title !== anchorGap?.title)
                    .map((g: any) => (
                      <option key={g.id || g.title} value={g.title}>
                        {g.title}
                      </option>
                    ))}
                  <option value="General Literature Grounding">General Literature Grounding</option>
                </select>
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Key Findings / Abstract Snippet
                </label>
                <textarea
                  rows={3}
                  value={manualForm.snippet}
                  onChange={(e) => setManualForm({ ...manualForm, snippet: e.target.value })}
                  placeholder="Paste excerpt, empirical proof bound, or key finding..."
                  className="w-full px-3 py-2 text-xs font-serif bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsAddModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-6 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-colors shadow-xs cursor-pointer"
                >
                  Ingest External Paper
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
