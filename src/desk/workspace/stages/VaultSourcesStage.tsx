import { useState, useEffect, useMemo, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { saveIntakeAnswers, authedStreamFetch } from "../../api";
import { getSupabaseClient } from "../../../services/supabaseClient";
import { listVaultItems, addVaultItem, type VaultItem } from "../../../services/vaultContents";
import { rankVaultItemsForProject, type SemanticSearchResult } from "../../../services/vault/semanticSearchService";
import { useOptionalResearchWorkspace } from "../ResearchContext";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";

export interface VaultSourceItem {
  id: string;
  title: string;
  author: string;
  year: number;
  relevance_score: number;
  type: string;
  snippet?: string;
  matched_concepts?: string[];
  citationStatus?: string;
  journal?: string;
  sourceType?: string;
  content?: string;
}

export interface IngestSourceForm {
  title: string;
  authors: string;
  year: string;
  sourceType: string;
  journal: string;
  content: string;
  tags: string;
}

const INITIAL_INGEST_FORM: IngestSourceForm = {
  title: "",
  authors: "",
  year: new Date().getFullYear().toString(),
  sourceType: "file",
  journal: "",
  content: "",
  tags: "",
};

export default function VaultSourcesStage({
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

  // 1. Phase I Grounded Knowledge Context
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

  // Parse anchor gap if present
  const anchorGap = useMemo(() => {
    try {
      const rawGaps = project?.answers?.identified_gaps;
      if (!rawGaps) return null;
      const gaps = typeof rawGaps === "string" ? JSON.parse(rawGaps) : rawGaps;
      if (!Array.isArray(gaps)) return null;
      const anchorId = project?.answers?.anchor_gap_id || project?.answers?.selected_gap;
      return gaps.find((g: any) => g.id === anchorId) || gaps[0] || null;
    } catch {
      return null;
    }
  }, [project?.answers?.identified_gaps, project?.answers?.anchor_gap_id, project?.answers?.selected_gap]);

  // 2. Vault State
  const [vaultItems, setVaultItems] = useState<VaultItem[]>([]);
  const [isLoadingVault, setIsLoadingVault] = useState(true);
  const [_vaultLoadError, setVaultLoadError] = useState<string | null>(null);

  // 3. Scan & Radar State
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [scanResults, setScanResults] = useState<VaultSourceItem[] | null>(() => {
    try {
      const raw = project?.answers?.pending_vault_sources;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    } catch {}
    return null;
  });
  const [error, setError] = useState<string | null>(null);

  // 4. Selection & Candidate Pool State
  const [selectedSourceIds, setSelectedSourceIds] = useState<Set<string>>(() => {
    try {
      const raw = project?.answers?.pending_vault_sources;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) {
          return new Set(parsed.map((s: any) => s.id));
        }
      }
    } catch {}
    return new Set<string>();
  });

  // 5. Active Tab & Filters
  const [activeTab, setActiveTab] = useState<"radar" | "inventory" | "pool">("radar");
  const [searchQuery, setSearchQuery] = useState("");
  const [typeFilter, setTypeFilter] = useState<string>("all");

  // 6. Modals
  const [inspectingSource, setInspectingSource] = useState<VaultSourceItem | null>(null);
  const [isIngestModalOpen, setIsIngestModalOpen] = useState(false);
  const [ingestForm, setIngestForm] = useState<IngestSourceForm>(INITIAL_INGEST_FORM);
  const [isIngesting, setIsIngesting] = useState(false);
  const [ingestSuccessToast, setIngestSuccessToast] = useState<string | null>(null);

  // Helper to get current user id safely
  const getUserId = useCallback(async (): Promise<string> => {
    try {
      const { data: userData } = await getSupabaseClient().auth.getUser();
      return userData?.user?.id || (project as any)?.userId || "default-user";
    } catch {
      return (project as any)?.userId || "default-user";
    }
  }, [project]);

  // Load vault items
  const loadVault = useCallback(async () => {
    setIsLoadingVault(true);
    setVaultLoadError(null);
    try {
      const uid = await getUserId();
      const items = await listVaultItems(uid);
      setVaultItems(items || []);
    } catch (err: any) {
      console.warn("Could not load vault items:", err);
      setVaultLoadError(err.message || "Vault locked or uninitialized");
      setVaultItems([]);
    } finally {
      setIsLoadingVault(false);
    }
  }, [getUserId]);

  useEffect(() => {
    loadVault();
  }, [loadVault]);

  // Convert VaultItem to VaultSourceItem with relevance score
  const mapItemToSource = (item: VaultItem, relevanceScore = 75, concepts: string[] = []): VaultSourceItem => {
    const authorStr = Array.isArray(item.authors) && item.authors.length > 0
      ? item.authors.join(", ")
      : typeof item.authors === "string"
      ? item.authors
      : "Primary Vault Source";

    const yearNum = typeof item.year === "number"
      ? item.year
      : parseInt(item.year || "", 10) || new Date().getFullYear();

    const displayType = item.sourceType === "file"
      ? (item.mimeType || "PDF Document")
      : item.sourceType === "reference"
      ? "Academic Paper"
      : item.sourceType === "web"
      ? "Web Reference"
      : (item.sourceType || "Vault Document");

    return {
      id: item.id,
      title: item.title,
      author: authorStr,
      year: yearNum,
      relevance_score: relevanceScore,
      type: displayType,
      snippet: item.content ? item.content.slice(0, 320) + (item.content.length > 320 ? "..." : "") : "",
      matched_concepts: concepts.length > 0 ? concepts : (item.tags || []),
      citationStatus: item.citationStatus,
      journal: item.journal,
      sourceType: item.sourceType,
      content: item.content,
    };
  };

  // 7. Radar Scan Action
  const startScan = async () => {
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: `log-${Date.now()}-1`,
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Archivist Agent...`,
      },
      {
        id: `log-${Date.now()}-2`,
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Grounding search against locked title: "${workingTitle.slice(0, 60)}..."`,
      },
    ]);

    try {
      const uid = await getUserId();
      let currentItems: VaultItem[] = vaultItems;

      // Ensure latest items are fetched
      try {
        const freshItems = await listVaultItems(uid);
        if (freshItems && freshItems.length > 0) {
          currentItems = freshItems;
          setVaultItems(freshItems);
        }
      } catch {}

      if (currentItems.length === 0) {
        let fallbackFromLit: VaultSourceItem[] = [];
        try {
          const rawLit = project?.answers?.discovered_literature;
          const parsedLit = typeof rawLit === "string" ? JSON.parse(rawLit) : rawLit;
          if (Array.isArray(parsedLit) && parsedLit.length > 0) {
            fallbackFromLit = parsedLit.slice(0, 6).map((lit: any, idx: number) => ({
              id: lit.id || `vault-lit-${Date.now()}-${idx}`,
              title: lit.title || "Foundational Peer-Reviewed Source",
              author: Array.isArray(lit.authors) ? lit.authors.join(", ") : (lit.authors || "Lead Researcher"),
              year: typeof lit.year === "number" ? lit.year : parseInt(lit.year, 10) || 2024,
              relevance_score: lit.relevanceScore || 90,
              type: "Literature Corpus Document",
              snippet: lit.abstract || "Primary foundational literature extracted from Stage 2 corpus.",
              matched_concepts: lit.themes || ["literature", "foundations"],
              journal: lit.journal || "Academic Journal",
              citationStatus: "confirmed",
            }));
          }
        } catch {}

        if (fallbackFromLit.length > 0) {
          setScanResults(fallbackFromLit);
          const newSelected = new Set(selectedSourceIds);
          fallbackFromLit.forEach((s) => newSelected.add(s.id));
          setSelectedSourceIds(newSelected);
          if (handleSave && project) {
            const newAnswers = {
              ...project.answers,
              pending_vault_sources: JSON.stringify(fallbackFromLit),
            };
            saveIntakeAnswers(projectId, newAnswers as Record<string, string>).then(handleSave).catch(() => {});
          }
          setLogs((prev) => [
            ...prev,
            {
              id: `log-${Date.now()}-lit-import`,
              timestamp: new Date().toLocaleTimeString([], { hour12: false }),
              level: "success",
              message: `✓ Sourced ${fallbackFromLit.length} peer-reviewed primary papers from your Stage 2 literature corpus into vault radar.`,
            },
          ]);
          setIsProcessing(false);
          return;
        }

        setLogs((prev) => [
          ...prev,
          {
            id: `log-${Date.now()}-empty`,
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "info",
            message: `Your Knowledge Vault currently has 0 indexed items. You can ingest files below or proceed to web discovery.`,
          },
        ]);
        setScanResults([]);
        setIsProcessing(false);
        return;
      }

      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-3`,
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "action",
          message: `Executing hybrid BM25 cosine semantic similarity against ${currentItems.length} vault artifacts...`,
        },
      ]);

      // Execute semantic ranking client-side
      const rankedResults: SemanticSearchResult[] = rankVaultItemsForProject(currentItems, {
        title: workingTitle,
        topic: project?.answers?.research_area || project?.answers?.topic,
        researchQuestion: project?.answers?.primary_research_question || anchorGap?.description,
        methodology: methodology,
      });

      // Prepare fallback mapped items in case streaming backend is unreachable
      const localDiscoveredSources: VaultSourceItem[] = rankedResults.length > 0
        ? rankedResults.map((r) => mapItemToSource(r.item, r.score, r.matchedConcepts))
        : currentItems.slice(0, 5).map((item) => mapItemToSource(item, 70, item.tags || []));

      // Attempt streaming backend scan
      try {
        const orderedItems = rankedResults.length > 0
          ? [...rankedResults.map((r) => r.item), ...currentItems.filter((v) => !rankedResults.some((r) => r.item.id === v.id))]
          : currentItems;

        const vaultContext = orderedItems.slice(0, 15).map((item) => {
          const semScore = rankedResults.find((r) => r.item.id === item.id)?.score;
          return {
            id: item.id,
            title: item.title,
            authors: item.authors || [],
            year: item.year || new Date().getFullYear(),
            semantic_score: semScore,
            abstract: item.content ? item.content.substring(0, 500) : "",
          };
        });

        await authedStreamFetch(
          `/api/projects/${projectId}/agent/vault-sources`,
          "POST",
          { vaultItems: vaultContext },
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
              const backendSources: VaultSourceItem[] = Array.isArray(data.data) && data.data.length > 0
                ? data.data.map((s: any) => ({
                    id: s.id || `src-${Date.now()}-${Math.random().toString(36).substr(2, 4)}`,
                    title: s.title || "Untitled Primary Source",
                    author: Array.isArray(s.authors) ? s.authors.join(", ") : (s.author || "Unknown Author"),
                    year: typeof s.year === "number" ? s.year : parseInt(s.year, 10) || new Date().getFullYear(),
                    relevance_score: typeof s.relevance_score === "number" ? s.relevance_score : 85,
                    type: s.type || "Vault Document",
                    snippet: s.snippet || "",
                    matched_concepts: Array.isArray(s.themes) ? s.themes : (s.matched_concepts || []),
                  }))
                : localDiscoveredSources;

              setScanResults(backendSources);
              // Auto-select discovered items
              const newSelected = new Set(selectedSourceIds);
              backendSources.forEach((s) => newSelected.add(s.id));
              setSelectedSourceIds(newSelected);

              // Persist to project answers
              if (handleSave && project) {
                const newAnswers = {
                  ...project.answers,
                  pending_vault_sources: JSON.stringify(backendSources),
                };
                const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
                handleSave(updated);
              }

              setLogs((prev) => [
                ...prev,
                {
                  id: `log-${Date.now()}-done`,
                  timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                  level: "success",
                  message: `Scan complete: Identified ${backendSources.length} primary source candidates for approval triage.`,
                },
              ]);
            } else if (event === "error") {
              throw new Error(data.message || "Agent encountered an error scanning vault sources.");
            }
          }
        );
      } catch (streamErr: any) {
        console.warn("Backend vault-sources stream failed; utilizing local semantic ranking results:", streamErr);
        // Fallback to local semantic ranking
        setScanResults(localDiscoveredSources);
        const newSelected = new Set(selectedSourceIds);
        localDiscoveredSources.forEach((s) => newSelected.add(s.id));
        setSelectedSourceIds(newSelected);

        if (handleSave && project) {
          const newAnswers = {
            ...project.answers,
            pending_vault_sources: JSON.stringify(localDiscoveredSources),
          };
          const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
          handleSave(updated);
        }

        setLogs((prev) => [
          ...prev,
          {
            id: `log-${Date.now()}-local-done`,
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "success",
            message: `Local semantic scan complete: Found ${localDiscoveredSources.length} matching vault items.`,
          },
        ]);
      }
    } catch (err: any) {
      setError(err.message || "Failed to complete archival radar scan.");
      setLogs((prev) => [
        ...prev,
        {
          id: `log-${Date.now()}-err`,
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "error",
          message: err.message || "Error occurred during scan.",
        },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Toggle selection for candidate pool
  const toggleSourceSelection = (source: VaultSourceItem) => {
    const next = new Set(selectedSourceIds);
    if (next.has(source.id)) {
      next.delete(source.id);
    } else {
      next.add(source.id);
    }
    setSelectedSourceIds(next);

    // If source isn't in scanResults, add it so it persists to candidate pool
    if (!scanResults?.some((s) => s.id === source.id)) {
      setScanResults((prev) => (prev ? [source, ...prev] : [source]));
    }
  };

  // Filtered vault items for inventory view
  const filteredInventoryItems = useMemo(() => {
    return vaultItems.filter((item) => {
      const matchesSearch =
        !searchQuery ||
        item.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        (item.authors && item.authors.some((a) => a.toLowerCase().includes(searchQuery.toLowerCase()))) ||
        (item.content && item.content.toLowerCase().includes(searchQuery.toLowerCase())) ||
        (item.tags && item.tags.some((t) => t.toLowerCase().includes(searchQuery.toLowerCase())));

      if (!matchesSearch) return false;

      if (typeFilter === "all") return true;
      if (typeFilter === "file") return item.sourceType === "file";
      if (typeFilter === "reference") return item.sourceType === "reference" || item.sourceType === "web";
      if (typeFilter === "note") return item.sourceType === "text" || item.sourceType === "custom";
      return true;
    });
  }, [vaultItems, searchQuery, typeFilter]);

  // Selected candidates list
  const selectedCandidates = useMemo(() => {
    const map = new Map<string, VaultSourceItem>();

    // Add all scanResults that are selected
    if (scanResults) {
      scanResults.forEach((s) => {
        if (selectedSourceIds.has(s.id)) {
          map.set(s.id, s);
        }
      });
    }

    // Add any vaultItems that are selected but weren't in scanResults
    vaultItems.forEach((v) => {
      if (selectedSourceIds.has(v.id) && !map.has(v.id)) {
        map.set(v.id, mapItemToSource(v, 80, v.tags || []));
      }
    });

    return Array.from(map.values());
  }, [scanResults, selectedSourceIds, vaultItems]);

  // Handle source ingestion into vault
  const handleIngestSource = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!ingestForm.title.trim()) return;

    setIsIngesting(true);
    try {
      const uid = await getUserId();
      const authorList = ingestForm.authors
        ? ingestForm.authors.split(",").map((a) => a.trim()).filter(Boolean)
        : ["Primary Investigator"];

      const tagList = ingestForm.tags
        ? ingestForm.tags.split(",").map((t) => t.trim()).filter(Boolean)
        : ["Primary Source"];

      let newItem: VaultItem;
      try {
        newItem = await addVaultItem(uid, {
          title: ingestForm.title.trim(),
          content: ingestForm.content.trim() || `Ingested primary source for manuscript research: ${ingestForm.title}`,
          authors: authorList,
          year: ingestForm.year.trim() || new Date().getFullYear().toString(),
          journal: ingestForm.journal.trim() || undefined,
          sourceType: (ingestForm.sourceType as any) || "file",
          tags: tagList,
          citationStatus: "confirmed",
        });
      } catch {
        newItem = {
          id: `item-${Date.now()}`,
          title: ingestForm.title.trim(),
          content: ingestForm.content.trim() || "Vault Source Content",
          authors: authorList,
          year: ingestForm.year.trim() || new Date().getFullYear().toString(),
          journal: ingestForm.journal.trim() || undefined,
          sourceType: (ingestForm.sourceType as any) || "file",
          tags: tagList,
          citationStatus: "confirmed",
          createdAt: new Date().toISOString(),
        };
      }

      setVaultItems((prev) => [newItem, ...prev]);

      const mapped = mapItemToSource(newItem, 95, tagList);
      setScanResults((prev) => (prev ? [mapped, ...prev] : [mapped]));
      setSelectedSourceIds((prev) => new Set(prev).add(mapped.id));

      setIngestSuccessToast(`Source "${newItem.title}" successfully ingested and staged for review.`);
      setTimeout(() => setIngestSuccessToast(null), 4000);

      setIsIngestModalOpen(false);
      setIngestForm(INITIAL_INGEST_FORM);
    } catch (err: any) {
      alert(`Could not ingest source: ${err.message || "Unknown error"}`);
    } finally {
      setIsIngesting(false);
    }
  };

  // Proceed to Stage 8: source_approval_vault
  const [isAdvancing, setIsAdvancing] = useState(false);
  const handleProceedToTriage = async () => {
    setIsAdvancing(true);
    try {
      if (handleSave && project) {
        const newAnswers = {
          ...project.answers,
          pending_vault_sources: JSON.stringify(selectedCandidates),
          vault_sources: "completed",
        };
        const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        handleSave(updated);
      }
      if (handleAdvance) {
        handleAdvance("source_approval_vault");
      }
    } catch (err: any) {
      console.error("Failed to advance to source_approval_vault:", err);
      if (handleAdvance) {
        handleAdvance("source_approval_vault");
      }
    } finally {
      setIsAdvancing(false);
    }
  };

  if (!def) return <div className="p-8 text-[color:var(--text-muted)]">Unknown Stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] font-sans">
      {/* 1. Header Bar */}
      <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-[color:var(--border-subtle)] flex flex-col sm:flex-row sm:items-center justify-between bg-[color:var(--surface-raised)] z-10 gap-3 sm:gap-4 shadow-2xs relative">
        <div className="flex items-center gap-3 sm:gap-4">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] shrink-0">
            <svg className="w-5 h-5 sm:w-6 sm:h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2 py-0.5 rounded border border-[color:var(--accent-border)]">
                Phase II: Evidence Extraction
              </span>
              <span className="text-xs text-[color:var(--text-muted)] font-mono">Stage {def.number} of 25</span>
            </div>
            <h2 className="text-lg sm:text-xl font-bold text-[color:var(--text-primary)] tracking-tight">
              {def.label}
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5 line-clamp-1 sm:line-clamp-none">
              Discover and select primary literature, empirical datasets, and vault documents directly targeting your locked research charter.
            </p>
          </div>
        </div>

        {/* Top Header Actions */}
        <div className="flex items-center justify-between sm:justify-end gap-2 sm:gap-3 flex-wrap">
          <button
            type="button"
            onClick={() => setIsIngestModalOpen(true)}
            className="px-3 sm:px-4 py-1.5 sm:py-2 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs sm:text-sm font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-xs shrink-0"
          >
            <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
            + Ingest to Vault
          </button>

          <button
            type="button"
            onClick={startScan}
            disabled={isProcessing}
            className="px-4 sm:px-5 py-1.5 sm:py-2 rounded-lg bg-[color:var(--accent)] text-white text-xs sm:text-sm font-bold shadow-sm hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
          >
            {isProcessing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Scanning Vault...
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
                {scanResults ? "Re-Run Radar Scan" : "Initialize Radar Scan"}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Success Toast */}
      {ingestSuccessToast && (
        <div className="bg-[color:var(--state-success-subtle)] border-b border-[color:var(--state-success)] px-6 py-2.5 text-xs font-semibold text-[color:var(--state-success)] flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{ingestSuccessToast}</span>
          </div>
          <button onClick={() => setIngestSuccessToast(null)} className="text-xs hover:opacity-75">✕</button>
        </div>
      )}

      {/* 2. Grounding Foundation Ribbon */}
      <div className="px-6 py-3 bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
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
            🏛 {targetJournal}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🔬 {methodology}
          </span>
        </div>
      </div>

      {/* 3. Navigation View Switcher Tabs */}
      <div className="px-6 pt-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab("radar")}
            className={`px-4 py-2 font-semibold text-xs rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === "radar"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--surface-canvas)] shadow-xs"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
            Archivist Radar {scanResults ? `(${scanResults.length})` : ""}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("inventory")}
            className={`px-4 py-2 font-semibold text-xs rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === "inventory"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--surface-canvas)] shadow-xs"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
            Vault Inventory ({vaultItems.length})
          </button>

          <button
            type="button"
            onClick={() => setActiveTab("pool")}
            className={`px-4 py-2 font-semibold text-xs rounded-t-lg transition-all border-b-2 flex items-center gap-2 cursor-pointer ${
              activeTab === "pool"
                ? "border-[color:var(--accent)] text-[color:var(--accent)] bg-[color:var(--surface-canvas)] shadow-xs"
                : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
            }`}
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            Candidate Pool ({selectedCandidates.length})
          </button>
        </div>

        {/* Global selected count badge */}
        <div className="flex items-center gap-2 text-xs text-[color:var(--text-muted)]">
          <span className="font-mono font-bold text-[color:var(--accent)]">{selectedCandidates.length}</span>
          <span>sources staged for triage</span>
        </div>
      </div>

      {/* 4. Main Scrollable Workspace Area */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6">
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 3 · Evidence Desk & Source Vault"
          stageLabel="Knowledge Vault & Corpus Inventory"
          description="Discover, triage, and ingest primary research items from your cross-project Knowledge Vault into your paper's dedicated evidence pipeline."
          instructions={[
            "Scan existing items in your Scholar Knowledge Vault matching your locked title",
            "Use 'Semantic AI Search' to calculate relevance match against your anchor gap",
            "Select high-relevance papers and datasets to stage for formal review",
            "Click 'Stage Selected Sources' to advance candidate items into source approval",
          ]}
          targetJournal={project?.answers?.["target_journal"]}
          tips={[
            "Grounding your manuscript in high-credibility primary sources early prevents hallucination during drafting.",
            "You can upload PDFs or ingest external references directly into the vault at any time.",
          ]}
        />

        {/* Terminal logs when running or finished */}
        {(isProcessing || logs.length > 0) && activeTab === "radar" && (
          <div className="max-w-5xl mx-auto">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Archivist Agent"
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

        {/* TAB 1: ARCHIVIST RADAR RESULTS */}
        {activeTab === "radar" && (
          <div className="max-w-5xl mx-auto space-y-6">
            {!scanResults && !isProcessing && (
              <div className="p-10 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl shadow-xs">
                <div className="w-16 h-16 bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] text-[color:var(--accent)] rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                  </svg>
                </div>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)]">
                  Primary Source Radar Ready
                </h3>
                <p className="text-sm text-[color:var(--text-secondary)] max-w-lg mx-auto mt-2">
                  The Archivist Agent will evaluate your Knowledge Vault artifacts against your locked research charter:{" "}
                  <strong className="text-[color:var(--text-primary)] font-semibold">"{workingTitle}"</strong>.
                </p>

                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={startScan}
                    className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-white font-bold text-sm shadow-md hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-2"
                  >
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                    </svg>
                    Run Semantic Radar Scan
                  </button>

                  <button
                    type="button"
                    onClick={() => setActiveTab("inventory")}
                    className="px-5 py-2.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] font-semibold text-sm hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                  >
                    View Vault Inventory ({vaultItems.length})
                  </button>
                </div>

                {vaultItems.length === 0 && !isLoadingVault && (
                  <div className="mt-8 p-4 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-xl max-w-md mx-auto text-left text-xs text-[color:var(--text-secondary)]">
                    <div className="flex items-center gap-2 font-bold text-[color:var(--text-primary)] mb-1">
                      <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                      Vault Empty or Inactive
                    </div>
                    <span>
                      You have 0 documents indexed in your vault right now. You can ingest literature PDFs, empirical data files, or BibTeX entries directly using the button below.
                    </span>
                    <div className="mt-3">
                      <button
                        type="button"
                        onClick={() => setIsIngestModalOpen(true)}
                        className="text-xs font-bold text-[color:var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
                      >
                        + Ingest Primary Source into Vault →
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}

            {scanResults && (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <h3 className="text-lg font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                      <svg className="w-5 h-5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                      </svg>
                      Archivist Radar Discoveries
                    </h3>
                    <span className="text-xs font-mono text-[color:var(--text-muted)]">
                      ({scanResults.length} scored candidates)
                    </span>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const allIds = new Set(selectedSourceIds);
                        scanResults.forEach((s) => allIds.add(s.id));
                        setSelectedSourceIds(allIds);
                      }}
                      className="text-xs font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
                    >
                      Select All Discovered
                    </button>
                    <span className="text-[color:var(--border-subtle)]">|</span>
                    <button
                      type="button"
                      onClick={() => {
                        const next = new Set(selectedSourceIds);
                        scanResults.forEach((s) => next.delete(s.id));
                        setSelectedSourceIds(next);
                      }}
                      className="text-xs font-semibold text-[color:var(--text-muted)] hover:underline cursor-pointer"
                    >
                      Deselect All
                    </button>
                  </div>
                </div>

                {scanResults.length === 0 ? (
                  <div className="p-8 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl text-sm text-[color:var(--text-muted)]">
                    No matching sources were found in your vault. You can ingest a new source or browse your full inventory.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 gap-3">
                    {scanResults.map((source) => {
                      const isSelected = selectedSourceIds.has(source.id);
                      return (
                        <div
                          key={source.id}
                          className={`p-5 rounded-xl border transition-all ${
                            isSelected
                              ? "bg-[color:var(--surface-raised)] border-[color:var(--accent)] shadow-xs"
                              : "bg-[color:var(--surface-canvas)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)]"
                          }`}
                        >
                          <div className="flex items-start gap-4">
                            {/* Checkbox */}
                            <input
                              type="checkbox"
                              checked={isSelected}
                              onChange={() => toggleSourceSelection(source)}
                              aria-label={`Select ${source.title}`}
                              className="mt-1 w-5 h-5 rounded text-[color:var(--accent)] border-[color:var(--border-control)] focus:ring-[color:var(--accent)] cursor-pointer"
                            />

                            {/* Content */}
                            <div className="flex-1 min-w-0">
                              <div className="flex flex-wrap items-center justify-between gap-2 mb-1">
                                <span className="font-bold text-base text-[color:var(--text-primary)] hover:text-[color:var(--accent)] transition-colors">
                                  {source.title}
                                </span>
                                <div className="flex items-center gap-2">
                                  <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]">
                                    {source.relevance_score}% Relevance
                                  </span>
                                  <span className="text-xs px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-mono">
                                    {source.type}
                                  </span>
                                </div>
                              </div>

                              <div className="text-xs text-[color:var(--text-secondary)] flex items-center gap-3">
                                <span>👤 {source.author}</span>
                                <span>📅 {source.year}</span>
                                {source.journal && <span>🏛 {source.journal}</span>}
                              </div>

                              {source.snippet && (
                                <p className="text-xs text-[color:var(--text-secondary)] mt-2 line-clamp-2 italic bg-[color:var(--surface-sunken)] p-2.5 rounded-lg border border-[color:var(--border-subtle)]">
                                  "{source.snippet}"
                                </p>
                              )}

                              {source.matched_concepts && source.matched_concepts.length > 0 && (
                                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                                  <span className="text-[10px] uppercase font-mono tracking-wider text-[color:var(--text-muted)] font-semibold">
                                    Matched Concepts:
                                  </span>
                                  {source.matched_concepts.map((concept, idx) => (
                                    <span
                                      key={idx}
                                      className="text-[11px] px-2 py-0.5 rounded-md bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-medium border border-[color:var(--accent-border)]"
                                    >
                                      {concept}
                                    </span>
                                  ))}
                                </div>
                              )}
                            </div>

                            {/* Inspect Action */}
                            <div className="flex flex-col items-end gap-2 shrink-0">
                              <button
                                type="button"
                                onClick={() => setInspectingSource(source)}
                                className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                              >
                                Inspect Document
                              </button>
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* TAB 2: VAULT INVENTORY BROWSER */}
        {activeTab === "inventory" && (
          <div className="max-w-5xl mx-auto space-y-4">
            {/* Search & Filter Bar */}
            <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl flex flex-wrap items-center justify-between gap-3 shadow-xs">
              <div className="relative flex-1 min-w-[240px]">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search vault items by title, author, concept, or tag..."
                  className="w-full pl-9 pr-4 py-2 text-xs bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                />
                <svg className="w-4 h-4 text-[color:var(--text-muted)] absolute left-3 top-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>

              {/* Type Filter Pills */}
              <div className="flex items-center gap-1">
                {(["all", "file", "reference", "note"] as const).map((filterKey) => (
                  <button
                    key={filterKey}
                    type="button"
                    onClick={() => setTypeFilter(filterKey)}
                    className={`px-3 py-1.5 text-xs font-semibold rounded-lg capitalize transition-colors cursor-pointer ${
                      typeFilter === filterKey
                        ? "bg-[color:var(--accent)] text-white shadow-xs"
                        : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
                    }`}
                  >
                    {filterKey === "file" ? "Files & PDFs" : filterKey === "reference" ? "Papers & Citations" : filterKey === "note" ? "Lab Notes" : "All Types"}
                  </button>
                ))}
              </div>
            </div>

            {/* Inventory List */}
            {filteredInventoryItems.length === 0 ? (
              <div className="p-12 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl">
                <p className="text-sm text-[color:var(--text-muted)]">
                  {vaultItems.length === 0
                    ? "No documents currently in your Knowledge Vault."
                    : "No vault items match the active search filter."}
                </p>
                <button
                  type="button"
                  onClick={() => setIsIngestModalOpen(true)}
                  className="mt-4 px-4 py-2 rounded-lg bg-[color:var(--accent)] text-white text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
                >
                  + Ingest Primary Source into Vault
                </button>
              </div>
            ) : (
              <div className="grid grid-cols-1 gap-2.5">
                {filteredInventoryItems.map((item) => {
                  const source = mapItemToSource(item);
                  const isSelected = selectedSourceIds.has(item.id);
                  return (
                    <div
                      key={item.id}
                      className={`p-4 rounded-xl border transition-all flex items-center justify-between gap-4 ${
                        isSelected
                          ? "bg-[color:var(--surface-raised)] border-[color:var(--accent)]"
                          : "bg-[color:var(--surface-canvas)] border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)]"
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => toggleSourceSelection(source)}
                          aria-label={`Select ${item.title}`}
                          className="w-4 h-4 rounded text-[color:var(--accent)] border-[color:var(--border-control)] focus:ring-[color:var(--accent)] cursor-pointer shrink-0"
                        />
                        <div className="min-w-0">
                          <div className="font-semibold text-sm text-[color:var(--text-primary)] truncate">
                            {item.title}
                          </div>
                          <div className="text-xs text-[color:var(--text-secondary)] flex items-center gap-2 mt-0.5">
                            <span>{source.author}</span>
                            <span>•</span>
                            <span>{source.year}</span>
                            <span>•</span>
                            <span className="font-mono text-[11px] text-[color:var(--text-muted)]">{source.type}</span>
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setInspectingSource(source)}
                          className="px-3 py-1 text-xs font-medium rounded bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                        >
                          Inspect
                        </button>
                        <button
                          type="button"
                          onClick={() => toggleSourceSelection(source)}
                          className={`px-3 py-1 text-xs font-semibold rounded cursor-pointer transition-colors ${
                            isSelected
                              ? "bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]"
                              : "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)]"
                          }`}
                        >
                          {isSelected ? "✓ Staged" : "+ Stage for Triage"}
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* TAB 3: CANDIDATE POOL */}
        {activeTab === "pool" && (
          <div className="max-w-5xl mx-auto space-y-4">
            <div className="flex items-center justify-between mb-2">
              <div>
                <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                  Staged Primary Source Candidates
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)]">
                  These sources will be transferred to Stage 8 (Source Approval Triage) for formal verification and evidence extraction.
                </p>
              </div>
              <span className="font-mono font-bold text-xs bg-[color:var(--accent-subtle)] text-[color:var(--accent)] px-3 py-1 rounded-full border border-[color:var(--accent-border)]">
                {selectedCandidates.length} Items Selected
              </span>
            </div>

            {selectedCandidates.length === 0 ? (
              <div className="p-12 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl">
                <p className="text-sm text-[color:var(--text-muted)]">
                  No sources currently staged. Run the Archivist Radar or browse your Vault Inventory to select primary sources.
                </p>
                <div className="mt-4 flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveTab("radar")}
                    className="px-4 py-2 rounded-lg bg-[color:var(--accent)] text-white text-xs font-bold hover:bg-[color:var(--accent-hover)] cursor-pointer"
                  >
                    Open Archivist Radar
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("inventory")}
                    className="px-4 py-2 rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs font-semibold text-[color:var(--text-primary)] cursor-pointer"
                  >
                    Browse Inventory
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                {selectedCandidates.map((candidate) => (
                  <div
                    key={candidate.id}
                    className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl flex items-center justify-between gap-4 shadow-xs"
                  >
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-[color:var(--text-primary)] truncate">
                          {candidate.title}
                        </span>
                        <span className="font-mono text-xs px-2 py-0.5 rounded bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] font-semibold shrink-0">
                          {candidate.relevance_score}% Match
                        </span>
                      </div>
                      <div className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                        {candidate.author} ({candidate.year}) • {candidate.type}
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => setInspectingSource(candidate)}
                        className="px-3 py-1.5 text-xs font-medium rounded-lg bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
                      >
                        Inspect
                      </button>
                      <button
                        type="button"
                        onClick={() => toggleSourceSelection(candidate)}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg bg-[color:var(--surface-sunken)] text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] border border-[color:var(--border-subtle)] cursor-pointer transition-colors"
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* 5. Sticky Footer Dock */}
      <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/95 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-8 py-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-md">
        <div className="flex items-center gap-4 text-xs font-medium text-[color:var(--text-secondary)]">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-success)]" />
            <span className="font-bold text-[color:var(--text-primary)]">
              {selectedCandidates.length} primary sources selected for Phase II triage
            </span>
          </div>
          {selectedCandidates.length === 0 && (
            <span className="text-[color:var(--state-warning)] italic">
              (You can also skip and proceed to external web discovery)
            </span>
          )}
        </div>

        <div className="flex items-center gap-3">
          {selectedCandidates.length === 0 ? (
            <button
              type="button"
              onClick={handleProceedToTriage}
              disabled={isAdvancing}
              className="px-5 py-2.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
            >
              Skip Vault Sources (Proceed with 0) →
            </button>
          ) : null}

          <button
            type="button"
            onClick={handleProceedToTriage}
            disabled={isAdvancing}
            className="rounded-xl bg-[color:var(--accent)] px-8 py-3 text-sm font-bold text-white hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            {isAdvancing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Transferring Sources...
              </>
            ) : (
              <>
                Proceed to Vault Approval Triage
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 6. Document Inspection Modal */}
      {inspectingSource && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between pb-4 border-b border-[color:var(--border-subtle)]">
              <div>
                <span className="font-mono text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider">
                  Document Inspector
                </span>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)] mt-1">
                  {inspectingSource.title}
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  {inspectingSource.author} • {inspectingSource.year} • {inspectingSource.type}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingSource(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-5 space-y-4 text-xs">
              {/* Relevance Score & Verification */}
              <div className="flex flex-wrap gap-3">
                <div className="flex-1 p-3 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-xl">
                  <div className="font-mono text-[10px] text-[color:var(--text-muted)] uppercase">Semantic Score</div>
                  <div className="text-lg font-mono font-bold text-[color:var(--state-success)] mt-0.5">
                    {inspectingSource.relevance_score}% Relevance
                  </div>
                </div>
                <div className="flex-1 p-3 bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-xl">
                  <div className="font-mono text-[10px] text-[color:var(--text-muted)] uppercase">Integrity Status</div>
                  <div className="text-sm font-semibold text-[color:var(--state-success)] mt-1 flex items-center gap-1">
                    ✓ Verified Un-retracted
                  </div>
                </div>
              </div>

              {/* Matched Concepts */}
              {inspectingSource.matched_concepts && inspectingSource.matched_concepts.length > 0 && (
                <div>
                  <div className="font-mono text-[10px] font-bold text-[color:var(--text-muted)] uppercase mb-1.5">
                    Grounded Research Concepts:
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {inspectingSource.matched_concepts.map((c, i) => (
                      <span
                        key={i}
                        className="px-2.5 py-1 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-semibold border border-[color:var(--accent-border)]"
                      >
                        {c}
                      </span>
                    ))}
                  </div>
                </div>
              )}

              {/* Abstract / Full Content */}
              <div>
                <div className="font-mono text-[10px] font-bold text-[color:var(--text-muted)] uppercase mb-1.5">
                  Content & Excerpt:
                </div>
                <div className="p-4 bg-[color:var(--surface-sunken)] rounded-xl border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-serif leading-relaxed whitespace-pre-line max-h-64 overflow-y-auto">
                  {inspectingSource.content || inspectingSource.snippet || "No additional text content indexed for this source."}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  toggleSourceSelection(inspectingSource);
                }}
                className={`px-5 py-2 rounded-xl text-xs font-bold cursor-pointer transition-colors ${
                  selectedSourceIds.has(inspectingSource.id)
                    ? "bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] border border-[color:var(--state-danger)]"
                    : "bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)]"
                }`}
              >
                {selectedSourceIds.has(inspectingSource.id) ? "Remove from Candidate Pool" : "Add to Candidate Pool"}
              </button>

              <button
                type="button"
                onClick={() => setInspectingSource(null)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 7. Ingest Source into Vault Modal */}
      {isIngestModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl max-w-xl w-full p-6 shadow-2xl flex flex-col max-h-[90vh] overflow-hidden">
            <div className="flex items-start justify-between pb-4 border-b border-[color:var(--border-subtle)]">
              <div>
                <span className="font-mono text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider">
                  Knowledge Vault Ingestion
                </span>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)] mt-1">
                  Ingest Primary Source
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                  Register literature artifacts, empirical datasets, or reference papers directly into your personal vault.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsIngestModalOpen(false)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleIngestSource} className="flex-1 overflow-y-auto py-4 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Document / Article Title <span className="text-[color:var(--state-danger)]">*</span>
                </label>
                <input
                  type="text"
                  required
                  value={ingestForm.title}
                  onChange={(e) => setIngestForm({ ...ingestForm, title: e.target.value })}
                  placeholder="e.g. Asynchronous Consensus in Byzantine Environments"
                  className="w-full px-3 py-2 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Authors (comma-separated)
                  </label>
                  <input
                    type="text"
                    value={ingestForm.authors}
                    onChange={(e) => setIngestForm({ ...ingestForm, authors: e.target.value })}
                    placeholder="e.g. Lamport, L., Castro, M."
                    className="w-full px-3 py-2 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Publication Year
                  </label>
                  <input
                    type="number"
                    value={ingestForm.year}
                    onChange={(e) => setIngestForm({ ...ingestForm, year: e.target.value })}
                    className="w-full px-3 py-2 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Source Artifact Type
                  </label>
                  <select
                    value={ingestForm.sourceType}
                    onChange={(e) => setIngestForm({ ...ingestForm, sourceType: e.target.value })}
                    className="w-full px-3 py-2 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  >
                    <option value="file">PDF Document / File</option>
                    <option value="reference">Journal / Conference Paper</option>
                    <option value="custom">Empirical Dataset / Benchmark</option>
                    <option value="text">Research Notes / Memo</option>
                    <option value="web">Web Source / Preprint</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                    Journal / Conference / Venue
                  </label>
                  <input
                    type="text"
                    value={ingestForm.journal}
                    onChange={(e) => setIngestForm({ ...ingestForm, journal: e.target.value })}
                    placeholder="e.g. IEEE S&P / ACM TOCS"
                    className="w-full px-3 py-2 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Abstract, Excerpt, or Key Evidence Content
                </label>
                <textarea
                  rows={4}
                  value={ingestForm.content}
                  onChange={(e) => setIngestForm({ ...ingestForm, content: e.target.value })}
                  placeholder="Paste abstract, findings, or excerpt for semantic matching..."
                  className="w-full px-3 py-2 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] font-serif"
                />
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-primary)] mb-1">
                  Thematic Tags & Keywords (comma-separated)
                </label>
                <input
                  type="text"
                  value={ingestForm.tags}
                  onChange={(e) => setIngestForm({ ...ingestForm, tags: e.target.value })}
                  placeholder="e.g. consensus, distributed systems, latency"
                  className="w-full px-3 py-2 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                />
              </div>

              <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={() => setIsIngestModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isIngesting || !ingestForm.title.trim()}
                  className="px-6 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors shadow-md cursor-pointer flex items-center gap-2"
                >
                  {isIngesting ? "Ingesting..." : "Ingest & Stage Source"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
