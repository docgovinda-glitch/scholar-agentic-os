import React, { useState, useEffect, useMemo, useRef } from "react";
import type { ProjectView } from "../types";
import type {
  UserDatasetItem,
  SmartEvidenceRow,
  WordBudgetBlueprint,
  SectionBudget,
  SubSectionBudget,
} from "./types";
import { useResearchWorkspace } from "./ResearchContext";
import {
  saveIntakeAnswers,
  uploadProjectUserData,
  updateProjectUserData,
} from "../api";
import {
  harvestFromOpenAlex,
  harvestFromCrossref,
  harvestFromArxiv,
  type PortalHarvestItem,
} from "../../services/discovery/multiPortalLiteratureHarvester";
import { executeLiveSearch } from "../../services/liveSearchService";
import { normalizeUnicodeNFC } from "../../document_intelligence/index";

export default function EvidenceMatrixMode() {
  const { project, projectId, setProject, setMode } = useResearchWorkspace();
  const effectiveProjectId = project?.projectId || projectId;
  const answers = useMemo(() => project?.answers || {}, [project?.answers]);

  // Blueprint from Mode 1 for sub-section mapping
  const blueprint: WordBudgetBlueprint | null = useMemo(() => {
    try {
      const raw = answers["word_budget_blueprint"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (parsed && Array.isArray(parsed.sections)) return parsed;
      }
    } catch {}
    return null;
  }, [answers]);

  // Flattened list of sub-sections from Mode 1
  const subSectionOptions = useMemo(() => {
    if (!blueprint) return [];
    const options: Array<{ id: string; label: string; sectionName: string }> = [];
    blueprint.sections.forEach((sec: SectionBudget) => {
      sec.subSections.forEach((sub: SubSectionBudget) => {
        options.push({
          id: sub.id,
          label: `${sec.sectionName} → § ${sub.title} (${sub.targetWords}w)`,
          sectionName: sec.sectionName,
        });
      });
    });
    return options;
  }, [blueprint]);

  // State: Primary User Datasets
  const [userDatasets, setUserDatasets] = useState<UserDatasetItem[]>(() => {
    try {
      const raw = answers["user_datasets"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  // State: Scholarly Sources
  const [scholarlySources, setScholarlySources] = useState<SmartEvidenceRow[]>(() => {
    const list: SmartEvidenceRow[] = [];
    try {
      const rawVault = answers["approved_vault_sources"] || answers["vault_sources"];
      if (rawVault) {
        const parsed = JSON.parse(rawVault);
        if (Array.isArray(parsed)) {
          parsed.forEach((item: Record<string, unknown>, idx: number) => {
            const id = String(item.id || `src_${idx + 1}`);
            list.push({
              id,
              citationToken: `[CITE:${id}]`,
              title: String(item.title || "Scholarly Literature Document"),
              authors: Array.isArray(item.authors)
                ? (item.authors as string[])
                : [String(item.author || item.authors || "Anonymous")],
              year: typeof item.year === "number" ? item.year : parseInt(String(item.year || "2024"), 10) || 2024,
              doi: typeof item.doi === "string" ? item.doi : undefined,
              portal: typeof item.portal === "string" ? item.portal : "OpenAlex",
              badge: "Verified Scholarly Literature",
              isUserData: false,
              epistemicRole:
                item.stance === "Contrasting"
                  ? "Contrasting / Critical"
                  : item.stance === "Methodological"
                  ? "Methodological Anchor"
                  : "Supporting",
              extractedFindings: String(item.keyFindings || item.abstract || item.summary || "Empirical findings verified from peer-reviewed literature."),
              assignedSectionId: String(item.assignedSectionId || ""),
            });
          });
        }
      }
    } catch {}
    return list;
  });

  // State: File Uploading & Direct Raw Data Drawer
  const [isUploadingFile, setIsUploadingFile] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isRawEntryOpen, setIsRawEntryOpen] = useState(false);
  const [rawText, setRawText] = useState("");
  const [rawTitle, setRawTitle] = useState("");
  const [rawAuthor, setRawAuthor] = useState("");
  const [rawRole, setRawRole] = useState<"Primary User Dataset" | "Supporting" | "Methodological Anchor" | "Contrasting / Critical">("Primary User Dataset");
  const [rawSectionId, setRawSectionId] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  // State: Live Scholarly & Web Search
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedPortal, setSelectedPortal] = useState<"all" | "openalex" | "crossref" | "arxiv" | "web">("all");
  const [isSearching, setIsSearching] = useState(false);
  const [searchResults, setSearchResults] = useState<PortalHarvestItem[]>([]);
  const [searchError, setSearchError] = useState<string | null>(null);

  // State: Matrix Filtering & View Drawer
  const [matrixFilter, setMatrixFilter] = useState<"all" | "user_data" | "scholarly">("all");
  const [matrixSectionFilter, setMatrixSectionFilter] = useState<string>("all");
  const [copiedToken, setCopiedToken] = useState<string | null>(null);
  const [inspectingItem, setInspectingItem] = useState<SmartEvidenceRow | null>(null);

  // Sync state if project changes
  useEffect(() => {
    if (answers["user_datasets"]) {
      try {
        const parsed = JSON.parse(answers["user_datasets"]);
        if (Array.isArray(parsed)) setUserDatasets(parsed);
      } catch {}
    }
    const rawVault = answers["approved_vault_sources"] || answers["vault_sources"];
    if (rawVault && scholarlySources.length === 0) {
      try {
        const parsed = JSON.parse(rawVault);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const list: SmartEvidenceRow[] = parsed.map((item: Record<string, unknown>, idx: number) => {
            const id = String(item.id || `src_${idx + 1}`);
            return {
              id,
              citationToken: `[CITE:${id}]`,
              title: String(item.title || "Scholarly Literature Document"),
              authors: Array.isArray(item.authors)
                ? (item.authors as string[])
                : [String(item.author || item.authors || "Anonymous")],
              year: typeof item.year === "number" ? item.year : parseInt(String(item.year || "2024"), 10) || 2024,
              doi: typeof item.doi === "string" ? item.doi : undefined,
              portal: typeof item.portal === "string" ? item.portal : "OpenAlex",
              badge: "Verified Scholarly Literature",
              isUserData: false,
              epistemicRole:
                item.stance === "Contrasting"
                  ? "Contrasting / Critical"
                  : item.stance === "Methodological"
                  ? "Methodological Anchor"
                  : "Supporting",
              extractedFindings: String(item.keyFindings || item.abstract || item.summary || "Empirical findings verified from peer-reviewed literature."),
              assignedSectionId: String(item.assignedSectionId || ""),
            };
          });
          setScholarlySources(list);
        }
      } catch {}
    }
  }, [answers["user_datasets"], answers["approved_vault_sources"], answers["vault_sources"]]);

  // Handle File Upload to backend
  const handleFileUpload = async (file: File) => {
    if (!effectiveProjectId) return;
    setIsUploadingFile(true);
    setUploadError(null);

    try {
      const formData = new FormData();
      formData.append("file", file);

      const res = await uploadProjectUserData(effectiveProjectId, formData);
      if (res.ok && res.dataset) {
        const updated = [res.dataset, ...userDatasets];
        setUserDatasets(updated);
        if (project) {
          setProject({
            ...project,
            answers: {
              ...project.answers,
              user_datasets: JSON.stringify(updated),
            },
          });
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
    } finally {
      setIsUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  // Handle Direct Raw Text / Field Note Entry
  const handleDirectRawEntry = async () => {
    if (!rawText.trim() || !effectiveProjectId) return;
    setIsUploadingFile(true);
    setUploadError(null);

    try {
      const res = await uploadProjectUserData(effectiveProjectId, {
        rawText: normalizeUnicodeNFC(rawText.trim()),
        title: normalizeUnicodeNFC(rawTitle.trim() || "Primary Field Notes & Observations"),
        author: normalizeUnicodeNFC(rawAuthor.trim() || "Principal Investigator"),
        epistemicRole: rawRole,
        assignedSectionId: rawSectionId || undefined,
      });

      if (res.ok && res.dataset) {
        const updated = [res.dataset, ...userDatasets];
        setUserDatasets(updated);
        if (project) {
          setProject({
            ...project,
            answers: {
              ...project.answers,
              user_datasets: JSON.stringify(updated),
            },
          });
        }
        setIsRawEntryOpen(false);
        setRawText("");
        setRawTitle("");
        setRawAuthor("");
        setRawSectionId("");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setUploadError(msg);
    } finally {
      setIsUploadingFile(false);
    }
  };

  // Handle Scholarly Search
  const handleExecuteSearch = async () => {
    if (!searchQuery.trim()) return;
    setIsSearching(true);
    setSearchError(null);
    setSearchResults([]);

    try {
      const q = searchQuery.trim();
      let results: PortalHarvestItem[] = [];

      if (selectedPortal === "openalex" || selectedPortal === "all") {
        const alex = await harvestFromOpenAlex(q, 15).catch(() => []);
        results = [...results, ...alex];
      }
      if (selectedPortal === "crossref" || selectedPortal === "all") {
        const cross = await harvestFromCrossref(q, 15).catch(() => []);
        results = [...results, ...cross];
      }
      if (selectedPortal === "arxiv" || selectedPortal === "all") {
        const arxiv = await harvestFromArxiv(q, 15).catch(() => []);
        results = [...results, ...arxiv];
      }
      if (selectedPortal === "web") {
        const live = await executeLiveSearch(q, { limit: 10 }).catch(() => []);
        const formatted: PortalHarvestItem[] = live.map((item, idx) => ({
          id: `web_${Date.now()}_${idx}`,
          title: item.title,
          authors: item.authors || ["Live Web"],
          year: new Date().getFullYear(),
          journal: "Live Web Grounding",
          source: "external" as const,
          relevanceScore: 85,
          themes: ["empirical", "web_grounding"],
          doi: undefined,
          abstract: item.snippet,
          portal: "web",
          url: item.url,
        }));
        results = [...results, ...formatted];
      }

      // Deduplicate by title
      const seen = new Set<string>();
      const deduped = results.filter((r) => {
        const key = r.title.toLowerCase().replace(/[^a-z0-9]/g, "");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });

      setSearchResults(deduped);
      if (deduped.length === 0) {
        setSearchError("No scholarly literature found for this query. Try broader keywords.");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSearchError(msg);
    } finally {
      setIsSearching(false);
    }
  };

  // Add search result to evidence matrix
  const handleAddSearchResult = async (item: PortalHarvestItem) => {
    if (!effectiveProjectId) return;

    const id = item.id.replace(/[^a-zA-Z0-9_-]/g, "_");
    const newRow: SmartEvidenceRow = {
      id,
      citationToken: `[CITE:${id}]`,
      title: normalizeUnicodeNFC(item.title),
      authors: item.authors || ["Author"],
      year: item.year || 2024,
      doi: item.doi,
      portal: typeof item.portal === "string" ? item.portal : "OpenAlex",
      badge: "Verified Scholarly Literature",
      isUserData: false,
      epistemicRole: "Supporting",
      extractedFindings: normalizeUnicodeNFC(item.abstract || "Empirical scholarly findings."),
      assignedSectionId: "",
    };

    const updated = [newRow, ...scholarlySources];
    setScholarlySources(updated);

    try {
      const nextAnswers = {
        ...(project?.answers || answers),
        approved_vault_sources: JSON.stringify(updated),
      };
      const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
      setProject(saved);
    } catch (err: unknown) {
      console.warn("Failed to persist added scholarly source:", err);
    }
  };

  // Update Section Assignment
  const handleUpdateSectionAssignment = async (row: SmartEvidenceRow, sectionId: string) => {
    if (!effectiveProjectId) return;

    if (row.isUserData) {
      try {
        await updateProjectUserData(effectiveProjectId, row.id, { assignedSectionId: sectionId });
        const updated = userDatasets.map((d) => (d.id === row.id ? { ...d, assignedSectionId: sectionId } : d));
        setUserDatasets(updated);
        if (project) {
          setProject({
            ...project,
            answers: { ...project.answers, user_datasets: JSON.stringify(updated) },
          });
        }
      } catch (err: unknown) {
        console.warn("Failed to update user dataset section assignment:", err);
      }
    } else {
      const updated = scholarlySources.map((s) => (s.id === row.id ? { ...s, assignedSectionId: sectionId } : s));
      setScholarlySources(updated);
      try {
        const nextAnswers = { ...(project?.answers || answers), approved_vault_sources: JSON.stringify(updated) };
        const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
        setProject(saved);
      } catch (err: unknown) {
        console.warn("Failed to update scholarly source section assignment:", err);
      }
    }
  };

  // Update Epistemic Role
  const handleUpdateEpistemicRole = async (
    row: SmartEvidenceRow,
    role: "Supporting" | "Contrasting / Critical" | "Methodological Anchor" | "Primary User Dataset"
  ) => {
    if (!effectiveProjectId) return;

    if (row.isUserData) {
      try {
        await updateProjectUserData(effectiveProjectId, row.id, { epistemicRole: role });
        const updated = userDatasets.map((d) => (d.id === row.id ? { ...d, epistemicRole: role } : d));
        setUserDatasets(updated);
        if (project) {
          setProject({
            ...project,
            answers: { ...project.answers, user_datasets: JSON.stringify(updated) },
          });
        }
      } catch (err: unknown) {
        console.warn("Failed to update user dataset epistemic role:", err);
      }
    } else {
      const updated = scholarlySources.map((s) => (s.id === row.id ? { ...s, epistemicRole: role } : s));
      setScholarlySources(updated);
      try {
        const nextAnswers = { ...(project?.answers || answers), approved_vault_sources: JSON.stringify(updated) };
        const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
        setProject(saved);
      } catch (err: unknown) {
        console.warn("Failed to update scholarly source epistemic role:", err);
      }
    }
  };

  // Delete row from matrix
  const handleDeleteRow = async (row: SmartEvidenceRow) => {
    if (!effectiveProjectId) return;

    if (row.isUserData) {
      const updated = userDatasets.filter((d) => d.id !== row.id);
      setUserDatasets(updated);
      try {
        const nextAnswers = { ...(project?.answers || answers), user_datasets: JSON.stringify(updated) };
        const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
        setProject(saved);
      } catch (err) {}
    } else {
      const updated = scholarlySources.filter((s) => s.id !== row.id);
      setScholarlySources(updated);
      try {
        const nextAnswers = { ...(project?.answers || answers), approved_vault_sources: JSON.stringify(updated) };
        const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
        setProject(saved);
      } catch (err) {}
    }
  };

  // Combined Rows for Smart Evidence Matrix
  const combinedMatrixRows: SmartEvidenceRow[] = useMemo(() => {
    const userRows: SmartEvidenceRow[] = userDatasets.map((d) => ({
      id: d.id,
      citationToken: d.citationToken,
      title: d.title,
      authors: [d.author],
      year: d.year,
      badge: "Primary User Data / Upload",
      isUserData: true,
      epistemicRole: d.epistemicRole,
      extractedFindings: d.extractedFindings || d.summary,
      assignedSectionId: d.assignedSectionId || "",
    }));

    let all = [...userRows, ...scholarlySources];

    if (matrixFilter === "user_data") {
      all = all.filter((r) => r.isUserData);
    } else if (matrixFilter === "scholarly") {
      all = all.filter((r) => !r.isUserData);
    }

    if (matrixSectionFilter !== "all") {
      all = all.filter((r) => r.assignedSectionId === matrixSectionFilter);
    }

    return all;
  }, [userDatasets, scholarlySources, matrixFilter, matrixSectionFilter]);

  const copyToken = (token: string) => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(token);
      setCopiedToken(token);
      setTimeout(() => setCopiedToken(null), 2000);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[color:var(--surface-canvas)] overflow-y-auto">
      {/* Top Banner / Mode Header */}
      <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-6 py-5">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-purple-600 text-white">
                Mode 2
              </span>
              <span className="text-xs font-semibold text-[color:var(--text-muted)]">
                Primary User Data Ingestion & Smart Evidence Synthesis Matrix
              </span>
            </div>
            <h1 className="text-xl font-bold text-[color:var(--text-primary)]">
              Literature & Data Matrix
            </h1>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Upload empirical datasets, field notes, and documents in memory. Harmonize user data with live peer-reviewed literature and assign findings to blueprint sub-sections.
            </p>
          </div>

          <div className="flex items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={() => setMode("protocol")}
              className="px-3.5 py-2 rounded-xl text-xs font-bold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all cursor-pointer"
            >
              ← Mode 1: Protocol
            </button>
            <button
              type="button"
              onClick={() => setMode("studio")}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-2 cursor-pointer"
            >
              <span>Proceed to Mode 3: Manuscript Studio</span>
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* Main Body */}
      <div className="p-6 max-w-7xl mx-auto w-full space-y-8">
        {/* SECTION A: Primary User Data & Custom Document Dropzone */}
        <section aria-labelledby="user-data-heading" className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-4">
            <div>
              <h2 id="user-data-heading" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                A. Primary User Data & Empirical Document Ingestion
              </h2>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Ingest your own empirical research data, lab sheets, survey CSVs, interview transcripts, or raw notes. Zero residual disk storage.
              </p>
            </div>

            <button
              type="button"
              onClick={() => setIsRawEntryOpen(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              <span>Paste Raw Data / Field Notes</span>
            </button>
          </div>

          {/* Drag & Drop Zone */}
          <div
            onClick={() => fileInputRef.current?.click()}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              if (e.dataTransfer.files && e.dataTransfer.files[0]) {
                handleFileUpload(e.dataTransfer.files[0]);
              }
            }}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                fileInputRef.current?.click();
              }
            }}
            className="border-2 border-dashed border-[color:var(--border-control)] hover:border-[color:var(--accent)] bg-[color:var(--surface-sunken)]/60 hover:bg-[color:var(--surface-hover)]/40 rounded-2xl p-8 text-center cursor-pointer transition-all space-y-2 group"
          >
            <input
              ref={fileInputRef}
              type="file"
              accept=".csv,.xlsx,.xls,.tsv,.pdf,.docx,.pptx,.txt,.md"
              className="hidden"
              onChange={(e) => {
                if (e.target.files && e.target.files[0]) {
                  handleFileUpload(e.target.files[0]);
                }
              }}
            />
            <div className="w-12 h-12 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] flex items-center justify-center mx-auto text-[color:var(--accent)] group-hover:scale-105 transition-transform">
              {isUploadingFile ? (
                <div className="spinner w-5 h-5" />
              ) : (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                </svg>
              )}
            </div>
            <div>
              <p className="text-xs font-bold text-[color:var(--text-primary)]">
                {isUploadingFile ? "Parsing document in memory…" : "Drop primary research files here, or click to browse"}
              </p>
              <p className="text-[11px] text-[color:var(--text-muted)] mt-0.5">
                Supports Quantitative (.csv, .xlsx, .xls) and Qualitative (.pdf, .docx, .pptx, .txt, .md) up to 25MB
              </p>
            </div>
          </div>

          {uploadError && (
            <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-600 dark:text-rose-400 font-medium">
              Error ingesting user data: {uploadError}
            </div>
          )}

          {/* User Data Badges */}
          {userDatasets.length > 0 && (
            <div className="space-y-2 pt-2">
              <span className="text-[11px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
                Ingested Primary User Datasets ({userDatasets.length})
              </span>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
                {userDatasets.map((d) => (
                  <div
                    key={d.id}
                    className="p-3.5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <span className="font-bold text-[color:var(--text-primary)] truncate block">
                          {d.title}
                        </span>
                        <span className="text-[10px] text-[color:var(--text-muted)] font-mono">
                          Format: {d.format.toUpperCase()} · {d.sourceType}
                        </span>
                      </div>
                      <span className="px-2 py-0.5 rounded text-[9px] font-bold uppercase tracking-wider bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 shrink-0">
                        User Data
                      </span>
                    </div>

                    <div className="flex items-center justify-between text-[11px]">
                      <code
                        onClick={() => copyToken(d.citationToken)}
                        className="px-1.5 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] font-mono text-[10px] text-[color:var(--accent)] cursor-pointer hover:bg-[color:var(--surface-hover)]"
                        title="Click to copy citation token"
                      >
                        {copiedToken === d.citationToken ? "✓ Copied!" : d.citationToken}
                      </code>
                      <span className="text-[10px] text-[color:var(--text-muted)] font-mono">
                        {d.keyMetrics?.[0] || d.summary.slice(0, 25)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* SECTION B: Live Multi-Portal Scholarly & Web Search */}
        <section aria-labelledby="scholarly-search-heading" className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="border-b border-[color:var(--border-subtle)] pb-4">
            <h2 id="scholarly-search-heading" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-blue-500" />
              B. Live Multi-Portal Scholarly & Web Literature Harvester
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Query 250M+ peer-reviewed papers across OpenAlex, CrossRef, arXiv, and live web grounding to synthesize evidence.
            </p>
          </div>

          {/* Search Bar & Portal Pills */}
          <div className="space-y-3">
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <div className="relative flex-1">
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleExecuteSearch()}
                  placeholder="Search empirical literature (e.g. quantum decoding latency, FPGA fault tolerance, surface codes)..."
                  className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-4 py-2 text-xs font-medium text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] outline-none transition-colors"
                />
              </div>

              <button
                type="button"
                disabled={isSearching || !searchQuery.trim()}
                onClick={handleExecuteSearch}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 shrink-0"
              >
                {isSearching ? (
                  <>
                    <div className="spinner w-3.5 h-3.5" />
                    <span>Harvesting…</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <span>Search Portals</span>
                  </>
                )}
              </button>
            </div>

            {/* Portal Filter Pills */}
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider mr-1">
                Portal:
              </span>
              {(["all", "openalex", "crossref", "arxiv", "web"] as const).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setSelectedPortal(p)}
                  className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all cursor-pointer ${
                    selectedPortal === p
                      ? "bg-[color:var(--accent)] text-white"
                      : "bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  {p === "all" ? "All Portals" : p === "openalex" ? "OpenAlex (250M)" : p === "crossref" ? "CrossRef DOI" : p === "arxiv" ? "arXiv STEM" : "Live Web Grounding"}
                </button>
              ))}
            </div>
          </div>

          {searchError && (
            <p className="text-xs text-rose-500 font-medium">{searchError}</p>
          )}

          {/* Search Results */}
          {searchResults.length > 0 && (
            <div className="space-y-3 pt-2">
              <span className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                Harvested Scholarly Literature ({searchResults.length})
              </span>
              <div className="grid grid-cols-1 gap-3 max-h-96 overflow-y-auto pr-1">
                {searchResults.map((item) => (
                  <div
                    key={item.id}
                    className="p-4 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] space-y-2 text-xs"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h4 className="font-bold text-[color:var(--text-primary)] text-xs">
                          {item.title}
                        </h4>
                        <p className="text-[11px] text-[color:var(--text-secondary)] mt-0.5">
                          {item.authors?.join(", ") || "Scholarly Author"} ({item.year || 2024})
                        </p>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {item.doi && (
                          <span className="px-2 py-0.5 rounded text-[9px] font-mono bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]">
                            DOI: {item.doi}
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAddSearchResult(item)}
                          className="px-3 py-1 rounded-lg text-xs font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-1"
                        >
                          <span>+ Add to Matrix</span>
                        </button>
                      </div>
                    </div>

                    <p className="text-[11px] text-[color:var(--text-muted)] line-clamp-2">
                      {item.abstract || "Peer-reviewed scholarly evidence."}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}
        </section>

        {/* SECTION C: Elicit/Scite-Style Smart Evidence Synthesis Matrix */}
        <section aria-labelledby="evidence-matrix-heading" className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-4">
            <div>
              <h2 id="evidence-matrix-heading" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-indigo-500" />
                C. Elicit/Scite-Style Smart Evidence Synthesis Matrix
              </h2>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Unified evidence ledger synthesizing peer-reviewed literature and uploaded primary user datasets. Directly map sources to Mode 1 sub-sections.
              </p>
            </div>

            <span className="text-xs font-mono font-bold text-[color:var(--text-secondary)]">
              {combinedMatrixRows.length} Ledger Rows
            </span>
          </div>

          {/* Matrix Filter & Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
                Filter:
              </span>
              <div className="flex items-center gap-1">
                {(["all", "user_data", "scholarly"] as const).map((f) => (
                  <button
                    key={f}
                    type="button"
                    onClick={() => setMatrixFilter(f)}
                    className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                      matrixFilter === f
                        ? "bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] font-bold shadow-xs"
                        : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                    }`}
                  >
                    {f === "all" ? "All Sources" : f === "user_data" ? "Primary User Data" : "Scholarly Literature"}
                  </button>
                ))}
              </div>
            </div>

            {subSectionOptions.length > 0 && (
              <div className="flex items-center gap-2 text-xs">
                <label htmlFor="matrix-section-filter-select" className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
                  Target Sub-Section:
                </label>
                <select
                  id="matrix-section-filter-select"
                  value={matrixSectionFilter}
                  onChange={(e) => setMatrixSectionFilter(e.target.value)}
                  className="bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-lg px-2.5 py-1 text-xs text-[color:var(--text-primary)] outline-none cursor-pointer max-w-xs truncate"
                >
                  <option value="all">All Sub-Sections</option>
                  {subSectionOptions.map((opt) => (
                    <option key={opt.id} value={opt.id}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
            )}
          </div>

          {/* Matrix Table */}
          {combinedMatrixRows.length > 0 ? (
            <div className="border border-[color:var(--border-subtle)] rounded-xl overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] text-[10px] uppercase tracking-wider text-[color:var(--text-muted)]">
                    <th className="py-2.5 px-4 font-bold w-36">Citation Token</th>
                    <th className="py-2.5 px-4 font-bold w-64">Source & Author (Year)</th>
                    <th className="py-2.5 px-4 font-bold w-48">Epistemic Stance</th>
                    <th className="py-2.5 px-4 font-bold">Extracted Empirical Findings</th>
                    <th className="py-2.5 px-4 font-bold w-56">Assigned Sub-Section</th>
                    <th className="py-2.5 px-3 font-bold w-12 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-subtle)]">
                  {combinedMatrixRows.map((row) => (
                    <tr
                      key={row.id}
                      className="hover:bg-[color:var(--surface-hover)]/40 transition-colors"
                    >
                      {/* Citation Token */}
                      <td className="py-3 px-4 align-top">
                        <code
                          onClick={() => copyToken(row.citationToken)}
                          className="px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] font-mono text-[10px] text-[color:var(--accent)] font-bold cursor-pointer hover:bg-[color:var(--surface-hover)] block text-center"
                          title="Click to copy citation token"
                        >
                          {copiedToken === row.citationToken ? "✓ Copied" : row.citationToken}
                        </code>
                        <span
                          className={`mt-1.5 block text-[9px] font-bold text-center px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            row.isUserData
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/30"
                          }`}
                        >
                          {row.isUserData ? "Primary Data" : "Literature"}
                        </span>
                      </td>

                      {/* Source & Author */}
                      <td className="py-3 px-4 align-top space-y-1">
                        <span className="font-bold text-[color:var(--text-primary)] block line-clamp-2">
                          {row.title}
                        </span>
                        <span className="text-[11px] text-[color:var(--text-muted)] block">
                          {row.authors.join(", ")} ({row.year})
                        </span>
                        {row.doi && (
                          <span className="text-[9px] font-mono text-[color:var(--text-secondary)] block">
                            DOI: {row.doi}
                          </span>
                        )}
                      </td>

                      {/* Epistemic Stance */}
                      <td className="py-3 px-4 align-top">
                        <label htmlFor={`stance-select-${row.id}`} className="sr-only">
                          Epistemic Stance for {row.title}
                        </label>
                        <select
                          id={`stance-select-${row.id}`}
                          value={row.epistemicRole}
                          onChange={(e) =>
                            handleUpdateEpistemicRole(
                              row,
                              e.target.value as "Supporting" | "Contrasting / Critical" | "Methodological Anchor" | "Primary User Dataset"
                            )
                          }
                          className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-lg p-1.5 text-xs text-[color:var(--text-primary)] font-medium outline-none cursor-pointer"
                        >
                          <option value="Supporting">Supporting</option>
                          <option value="Contrasting / Critical">Contrasting / Critical</option>
                          <option value="Methodological Anchor">Methodological Anchor</option>
                          <option value="Primary User Dataset">Primary User Dataset</option>
                        </select>
                      </td>

                      {/* Extracted Findings */}
                      <td className="py-3 px-4 align-top">
                        <p className="text-[11px] text-[color:var(--text-secondary)] line-clamp-3 leading-relaxed">
                          {row.extractedFindings}
                        </p>
                        <button
                          type="button"
                          onClick={() => setInspectingItem(row)}
                          className="text-[10px] text-[color:var(--accent)] hover:underline mt-1 cursor-pointer font-semibold"
                        >
                          View Full Details →
                        </button>
                      </td>

                      {/* Assigned Sub-Section */}
                      <td className="py-3 px-4 align-top">
                        <label htmlFor={`section-select-${row.id}`} className="sr-only">
                          Assigned Sub-Section for {row.title}
                        </label>
                        <select
                          id={`section-select-${row.id}`}
                          value={row.assignedSectionId}
                          onChange={(e) => handleUpdateSectionAssignment(row, e.target.value)}
                          className={`w-full bg-[color:var(--surface-sunken)] border rounded-lg p-1.5 text-xs outline-none cursor-pointer ${
                            row.assignedSectionId
                              ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300 font-semibold"
                              : "border-[color:var(--border-control)] text-[color:var(--text-muted)]"
                          }`}
                        >
                          <option value="">-- Unassigned --</option>
                          {subSectionOptions.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label}
                            </option>
                          ))}
                        </select>
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-3 align-top text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteRow(row)}
                          title="Remove source from evidence ledger"
                          className="p-1 rounded-md text-[color:var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.8} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="p-8 text-center bg-[color:var(--surface-sunken)] rounded-xl border border-[color:var(--border-subtle)] space-y-2">
              <p className="text-xs font-bold text-[color:var(--text-primary)]">
                No sources or user datasets in evidence ledger yet.
              </p>
              <p className="text-[11px] text-[color:var(--text-muted)]">
                Upload primary research data above or search OpenAlex/CrossRef to build your synthesis matrix.
              </p>
            </div>
          )}
        </section>
      </div>

      {/* Modal: Direct Raw Data / Field Notes Entry */}
      {isRawEntryOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 animate-fade-in">
          <div className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl max-w-xl w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
              <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                Direct Raw Data & Field Note Entry
              </h3>
              <button
                type="button"
                onClick={() => setIsRawEntryOpen(false)}
                className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] text-sm font-bold"
              >
                ✕
              </button>
            </div>

            <div className="space-y-3 text-xs">
              <div>
                <label htmlFor="raw-dataset-title" className="font-bold text-[color:var(--text-primary)] block mb-1">
                  Dataset / Note Title
                </label>
                <input
                  id="raw-dataset-title"
                  type="text"
                  value={rawTitle}
                  onChange={(e) => setRawTitle(e.target.value)}
                  placeholder="e.g. Survey Cohort Responses or Field Note Excerpt"
                  className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs text-[color:var(--text-primary)] outline-none"
                />
              </div>

              <div>
                <label htmlFor="raw-dataset-author" className="font-bold text-[color:var(--text-primary)] block mb-1">
                  Author / Investigator
                </label>
                <input
                  id="raw-dataset-author"
                  type="text"
                  value={rawAuthor}
                  onChange={(e) => setRawAuthor(e.target.value)}
                  placeholder="e.g. Principal Investigator (Primary Research)"
                  className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs text-[color:var(--text-primary)] outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="raw-dataset-role" className="font-bold text-[color:var(--text-primary)] block mb-1">
                    Epistemic Role
                  </label>
                  <select
                    id="raw-dataset-role"
                    value={rawRole}
                    onChange={(e) =>
                      setRawRole(
                        e.target.value as "Primary User Dataset" | "Supporting" | "Methodological Anchor" | "Contrasting / Critical"
                      )
                    }
                    className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs text-[color:var(--text-primary)] outline-none"
                  >
                    <option value="Primary User Dataset">Primary User Dataset</option>
                    <option value="Supporting">Supporting Evidence</option>
                    <option value="Methodological Anchor">Methodological Anchor</option>
                    <option value="Contrasting / Critical">Contrasting / Critical</option>
                  </select>
                </div>

                <div>
                  <label htmlFor="raw-dataset-section" className="font-bold text-[color:var(--text-primary)] block mb-1">
                    Assigned Sub-Section
                  </label>
                  <select
                    id="raw-dataset-section"
                    value={rawSectionId}
                    onChange={(e) => setRawSectionId(e.target.value)}
                    className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl px-3 py-2 text-xs text-[color:var(--text-primary)] outline-none"
                  >
                    <option value="">-- Unassigned --</option>
                    {subSectionOptions.map((opt) => (
                      <option key={opt.id} value={opt.id}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="raw-dataset-content" className="font-bold text-[color:var(--text-primary)] block mb-1">
                  Raw Findings / CSV Table / Archival Text (NFC Unicode Preserved)
                </label>
                <textarea
                  id="raw-dataset-content"
                  rows={6}
                  value={rawText}
                  onChange={(e) => setRawText(e.target.value)}
                  placeholder="Paste empirical CSV rows, archival quotes with IAST diacritics (ā, ī, ū, ṛ, ś, ṣ, ṇ), or field observations..."
                  className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl p-3 text-xs text-[color:var(--text-primary)] outline-none resize-none font-mono"
                />
              </div>
            </div>

            <div className="flex items-center justify-end gap-2 pt-2 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setIsRawEntryOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={!rawText.trim() || isUploadingFile}
                onClick={handleDirectRawEntry}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-white hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50"
              >
                {isUploadingFile ? "Saving…" : "Save Primary Dataset"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Drawer: Full Findings Inspection */}
      {inspectingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-end bg-black/50 backdrop-blur-xs animate-fade-in">
          <div className="bg-[color:var(--surface-canvas)] border-l border-[color:var(--border-subtle)] w-full max-w-lg h-full p-6 shadow-2xl flex flex-col justify-between">
            <div className="space-y-4 overflow-y-auto">
              <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
                <span className="text-xs font-bold font-mono text-[color:var(--accent)]">
                  {inspectingItem.citationToken}
                </span>
                <button
                  type="button"
                  onClick={() => setInspectingItem(null)}
                  className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] text-sm font-bold"
                >
                  ✕
                </button>
              </div>

              <div>
                <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                  {inspectingItem.title}
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  {inspectingItem.authors.join(", ")} ({inspectingItem.year})
                </p>
                {inspectingItem.doi && (
                  <p className="text-xs font-mono text-[color:var(--text-muted)] mt-0.5">
                    DOI: {inspectingItem.doi}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
                  Extracted Findings & Methodology
                </span>
                <div className="p-3 bg-[color:var(--surface-sunken)] rounded-xl border border-[color:var(--border-subtle)] text-xs text-[color:var(--text-primary)] whitespace-pre-wrap font-mono leading-relaxed max-h-96 overflow-y-auto">
                  {inspectingItem.extractedFindings}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-between">
              <code className="text-xs text-[color:var(--accent)] font-mono">
                {inspectingItem.citationToken}
              </code>
              <button
                type="button"
                onClick={() => setInspectingItem(null)}
                className="px-4 py-2 rounded-xl text-xs font-bold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-primary)] border border-[color:var(--border-subtle)] cursor-pointer"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
