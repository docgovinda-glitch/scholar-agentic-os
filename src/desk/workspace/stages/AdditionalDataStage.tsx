import { useState, useRef, useMemo, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { saveIntakeAnswers } from "../../api";
import { addVaultItem } from "../../../services/vaultContents";
import { getSupabaseClient } from "../../../services/supabaseClient";
import { useOptionalResearchWorkspace } from "../ResearchContext";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";

export type DatasetFormat = "csv" | "tsv" | "json" | "pdf" | "markdown" | "text";

export interface DatasetItem {
  id: string;
  name: string;
  format: DatasetFormat;
  sizeBytes?: number;
  rowCount?: number;
  summary?: string;
  content: string;
  uploadedAt: string;
  sourceType: "file_upload" | "table_paste" | "vault_artifact";
}

export default function AdditionalDataStage({
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

  // 2. Initial Datasets State
  const initialDatasets: DatasetItem[] = useMemo(() => {
    try {
      const raw = project?.answers?.additional_datasets;
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  }, [project?.answers?.additional_datasets]);

  const [datasets, setDatasets] = useState<DatasetItem[]>(initialDatasets);
  const [activeTab, setActiveTab] = useState<"upload" | "paste">("upload");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // Direct paste form state
  const [pasteName, setPasteName] = useState("");
  const [pasteFormat, setPasteFormat] = useState<DatasetFormat>("csv");
  const [pasteContent, setPasteContent] = useState("");

  // Inspecting dataset drawer
  const [inspectingDataset, setInspectingDataset] = useState<DatasetItem | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  // Helper to get current user id safely
  const getUserId = useCallback(async (): Promise<string> => {
    try {
      const { data: userData } = await getSupabaseClient().auth.getUser();
      return userData?.user?.id || (project as any)?.userId || "default-user";
    } catch {
      return (project as any)?.userId || "default-user";
    }
  }, [project]);

  // Persistence helper
  const persistDatasets = async (nextDatasets: DatasetItem[]) => {
    if (project) {
      const newAnswers = {
        ...project.answers,
        additional_datasets: JSON.stringify(nextDatasets),
        additional_data: "completed",
      };
      const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      if (handleSave) {
        handleSave(updated);
      }
    }
  };

  // Helper to detect format
  const detectFormat = (filename: string): DatasetFormat => {
    const ext = filename.split(".").pop()?.toLowerCase();
    if (ext === "csv") return "csv";
    if (ext === "tsv") return "tsv";
    if (ext === "json") return "json";
    if (ext === "pdf") return "pdf";
    if (ext === "md") return "markdown";
    return "text";
  };

  // File Upload Handler
  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;

    setBusy(true);
    setError(null);
    setSuccess(null);

    try {
      const format = detectFormat(file.name);
      const text = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (ev) => resolve((ev.target?.result as string) || "");
        reader.onerror = () => reject(new Error("Failed to read file"));
        reader.readAsText(file);
      });

      // Simple row count estimate for CSV/TSV
      let rowCount: number | undefined;
      if (format === "csv" || format === "tsv") {
        rowCount = text.trim().split("\n").length;
      } else if (format === "json") {
        try {
          const parsed = JSON.parse(text);
          if (Array.isArray(parsed)) rowCount = parsed.length;
        } catch {}
      }

      const newItem: DatasetItem = {
        id: `data-${Date.now()}`,
        name: file.name,
        format,
        sizeBytes: file.size,
        rowCount,
        content: text.slice(0, 50000), // preserve ample data for extraction
        uploadedAt: new Date().toISOString(),
        sourceType: "file_upload",
      };

      // Add to user vault
      try {
        const uid = await getUserId();
        await addVaultItem(uid, {
          title: file.name,
          content: text.slice(0, 10000),
          sourceType: "file",
          filename: file.name,
          tags: ["Primary Data", format.toUpperCase()],
          citationStatus: "confirmed",
        });
      } catch (vaultErr) {
        console.warn("Could not save to remote vault, saved to workspace state:", vaultErr);
      }

      const nextList = [newItem, ...datasets];
      setDatasets(nextList);
      await persistDatasets(nextList);

      setSuccess(`Successfully ingested "${file.name}" into your evidence matrix!`);
      setTimeout(() => setSuccess(null), 4000);
    } catch (err: any) {
      setError(err.message || "Failed to parse file.");
    } finally {
      setBusy(false);
    }
  }

  // Handle Direct Paste Submit
  const handlePasteSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pasteName.trim() || !pasteContent.trim()) return;

    setBusy(true);
    setError(null);

    try {
      let rowCount: number | undefined;
      if (pasteFormat === "csv" || pasteFormat === "tsv" || pasteFormat === "markdown") {
        rowCount = pasteContent.trim().split("\n").length;
      }

      const newItem: DatasetItem = {
        id: `paste-${Date.now()}`,
        name: pasteName.trim(),
        format: pasteFormat,
        sizeBytes: new Blob([pasteContent]).size,
        rowCount,
        content: pasteContent,
        uploadedAt: new Date().toISOString(),
        sourceType: "table_paste",
      };

      const nextList = [newItem, ...datasets];
      setDatasets(nextList);
      await persistDatasets(nextList);

      setSuccess(`Successfully attached "${pasteName}"!`);
      setTimeout(() => setSuccess(null), 4000);

      setPasteName("");
      setPasteContent("");
    } catch (err: any) {
      setError(err.message || "Could not attach pasted data.");
    } finally {
      setBusy(false);
    }
  };

  // Remove dataset
  const handleRemove = async (id: string) => {
    const nextList = datasets.filter((d) => d.id !== id);
    setDatasets(nextList);
    await persistDatasets(nextList);
  };

  // Lock and advance
  const [isAdvancing, setIsAdvancing] = useState(false);
  const handleProceed = async () => {
    setIsAdvancing(true);
    try {
      await persistDatasets(datasets);
      if (handleAdvance) {
        handleAdvance("evidence_extraction");
      }
    } catch (err) {
      console.error("Failed to advance to evidence extraction:", err);
      if (handleAdvance) {
        handleAdvance("evidence_extraction");
      }
    } finally {
      setIsAdvancing(false);
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
                Phase II: Evidence Extraction
              </span>
              <span className="text-xs text-[color:var(--text-muted)] font-mono">Stage {def.number} of 25</span>
            </div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">
              {def.label}
            </h2>
            <p className="text-sm text-[color:var(--text-secondary)] mt-0.5">
              Ingest empirical datasets, experimental benchmarks, or supplementary tables into your manuscript evidence corpus.
            </p>
          </div>
        </div>

        {/* Status Pill */}
        <div className="flex items-center gap-2 px-3.5 py-1.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-xs font-medium">
          <span className={`w-2 h-2 rounded-full ${datasets.length > 0 ? "bg-[color:var(--state-success)]" : "bg-[color:var(--accent)]"}`} />
          <span className="text-[color:var(--text-primary)] font-semibold">
            {datasets.length > 0 ? `${datasets.length} Datasets Attached` : "0 Datasets (Optional Step)"}
          </span>
        </div>
      </div>

      {/* Success Notification Toast */}
      {success && (
        <div className="bg-[color:var(--state-success-subtle)] border-b border-[color:var(--state-success)] px-6 py-2.5 text-xs font-semibold text-[color:var(--state-success)] flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
            </svg>
            <span>{success}</span>
          </div>
          <button onClick={() => setSuccess(null)} className="text-xs hover:opacity-75">✕</button>
        </div>
      )}

      {/* Error Callout */}
      {error && (
        <div className="bg-[color:var(--state-danger-subtle)] border-b border-[color:var(--state-danger)] px-6 py-2.5 text-xs font-semibold text-[color:var(--state-danger)] flex items-center justify-between animate-fade-in">
          <div className="flex items-center gap-2">
            <svg className="w-4 h-4 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span>{error}</span>
          </div>
          <button onClick={() => setError(null)} className="text-xs hover:opacity-75">✕</button>
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
            🏛 {targetJournal}
          </span>
          <span className="px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-medium">
            🔬 {methodology}
          </span>
        </div>
      </div>

      <div className="shrink-0 px-4 sm:px-6 lg:px-8 py-3 bg-[color:var(--surface-canvas)]">
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 3 · Evidence Desk & Source Vault"
          stageLabel="Empirical Datasets & Supplementary Artifact Ingestion"
          description="Attach raw benchmarks, survey CSVs, computational traces, or supplemental tables to ground your Results and Discussion sections with reproducible empirical data."
          instructions={[
            "Upload structured data files (.csv, .tsv, .json) or paste tabular benchmark matrices",
            "Preview uploaded records, column headers, and data distributions",
            "Ground your empirical findings with real numbers and verifiable measurements",
            "Proceed to claim extraction to synthesize empirical findings into the claims matrix",
          ]}
          targetJournal={targetJournal}
          tips={[
            "Top-tier journals require Data Availability statements. Attaching your raw tables here ensures complete reproducibility.",
            "Tabular data ingested here can be directly referenced by the drafting agents to generate accurate markdown tables.",
          ]}
        />
      </div>

      {/* 3. Main Workspace Split Layout */}
      <div className="flex-1 overflow-hidden flex flex-col md:flex-row">
        {/* Left: Ingestion Engine (Upload / Paste Tabs) */}
        <div className="flex-1 flex flex-col min-w-0 border-r border-[color:var(--border-subtle)] overflow-y-auto p-6 space-y-6">
          {/* Ingestion Method Tabs */}
          <div className="flex items-center gap-2 border-b border-[color:var(--border-subtle)] pb-2">
            <button
              type="button"
              onClick={() => setActiveTab("upload")}
              className={`px-4 py-2 font-semibold text-xs rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "upload"
                  ? "bg-[color:var(--accent)] text-white shadow-xs"
                  : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
              Upload Data Files
            </button>

            <button
              type="button"
              onClick={() => setActiveTab("paste")}
              className={`px-4 py-2 font-semibold text-xs rounded-lg transition-all flex items-center gap-2 cursor-pointer ${
                activeTab === "paste"
                  ? "bg-[color:var(--accent)] text-white shadow-xs"
                  : "bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)]"
              }`}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              Paste Tabular Data / Notes
            </button>
          </div>

          {/* TAB 1: FILE DROPZONE */}
          {activeTab === "upload" && (
            <div className="space-y-4">
              <div
                className="border-2 border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] rounded-2xl p-10 text-center transition-all cursor-pointer group shadow-xs"
                onClick={() => fileInputRef.current?.click()}
              >
                <input
                  type="file"
                  ref={fileInputRef}
                  className="hidden"
                  onChange={handleFile}
                  disabled={busy}
                  accept=".csv,.tsv,.json,.txt,.md,.pdf"
                />
                <div className="w-16 h-16 bg-[color:var(--surface-sunken)] rounded-2xl flex items-center justify-center mx-auto mb-4 border border-[color:var(--border-subtle)] group-hover:border-[color:var(--accent)] transition-colors">
                  <svg
                    className={`w-8 h-8 transition-colors ${
                      busy ? "text-[color:var(--accent)] animate-bounce" : "text-[color:var(--text-muted)] group-hover:text-[color:var(--accent)]"
                    }`}
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={1.75}
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                </div>
                <h3 className="text-base font-bold text-[color:var(--text-primary)] mb-1">
                  {busy ? "Parsing and Indexing Data..." : "Choose Empirical Data Files to Ingest"}
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] max-w-sm mx-auto">
                  Drag and drop or browse from your desktop. Files will be parsed and linked to this manuscript.
                </p>

                {/* Supported Formats Strip */}
                <div className="flex flex-wrap items-center justify-center gap-2 mt-4">
                  {["CSV / TSV", "JSON", "Markdown Tables", "TXT", "PDF"].map((fmt) => (
                    <span
                      key={fmt}
                      className="px-2.5 py-0.5 rounded-full text-[10px] font-mono font-semibold bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)]"
                    >
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PASTE DATA WORKBENCH */}
          {activeTab === "paste" && (
            <form onSubmit={handlePasteSubmit} className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                    Dataset / Table Name <span className="text-[color:var(--state-danger)]">*</span>
                  </label>
                  <input
                    type="text"
                    required
                    value={pasteName}
                    onChange={(e) => setPasteName(e.target.value)}
                    placeholder="e.g. WAN Byzantine Latency Benchmarks (Table 1)"
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                    Format
                  </label>
                  <select
                    value={pasteFormat}
                    onChange={(e) => setPasteFormat(e.target.value as DatasetFormat)}
                    className="w-full px-3 py-2 text-xs bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  >
                    <option value="csv">CSV (Comma-Separated)</option>
                    <option value="tsv">TSV (Tab-Separated)</option>
                    <option value="markdown">Markdown Table</option>
                    <option value="json">JSON Records</option>
                    <option value="text">Raw Empirical Text</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-[color:var(--text-primary)] mb-1">
                  Pasted Data Content <span className="text-[color:var(--state-danger)]">*</span>
                </label>
                <textarea
                  rows={8}
                  required
                  value={pasteContent}
                  onChange={(e) => setPasteContent(e.target.value)}
                  placeholder="Paste CSV rows, markdown table, or JSON array..."
                  className="w-full px-3 py-2 text-xs font-mono bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] rounded-lg text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] leading-relaxed"
                />
              </div>

              <div className="flex justify-end">
                <button
                  type="submit"
                  disabled={busy || !pasteName.trim() || !pasteContent.trim()}
                  className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-white text-xs font-bold hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors shadow-xs cursor-pointer flex items-center gap-2"
                >
                  + Attach Data to Manuscript
                </button>
              </div>
            </form>
          )}
        </div>

        {/* Right: Attached Datasets Ledger */}
        <div className="w-full md:w-96 bg-[color:var(--surface-sunken)] p-6 flex flex-col justify-between space-y-6 overflow-y-auto shrink-0">
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                  Evidence Inventory
                </span>
                <h3 className="text-base font-bold text-[color:var(--text-primary)] mt-0.5">
                  Attached Datasets
                </h3>
              </div>
              <span className="font-mono text-xs font-bold px-2 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)]">
                {datasets.length} Files
              </span>
            </div>

            {datasets.length === 0 ? (
              <div className="p-8 text-center bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl text-xs space-y-2">
                <div className="text-2xl">📁</div>
                <div className="font-bold text-[color:var(--text-primary)]">No Primary Datasets Attached</div>
                <p className="text-[color:var(--text-secondary)] text-[11px] leading-relaxed">
                  If your paper is theoretical or a literature review without raw datasets, you can safely skip this step.
                </p>
              </div>
            ) : (
              <div className="space-y-2.5">
                {datasets.map((item) => (
                  <div
                    key={item.id}
                    className="p-3.5 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl space-y-2 shadow-xs"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-bold text-xs text-[color:var(--text-primary)] truncate">
                          {item.name}
                        </div>
                        <div className="text-[11px] text-[color:var(--text-secondary)] flex items-center gap-2 mt-0.5">
                          <span className="uppercase font-mono font-bold text-[10px] text-[color:var(--accent)]">
                            {item.format}
                          </span>
                          {item.rowCount !== undefined && (
                            <span>• {item.rowCount} rows</span>
                          )}
                          {item.sizeBytes && (
                            <span>• {(item.sizeBytes / 1024).toFixed(1)} KB</span>
                          )}
                        </div>
                      </div>

                      <button
                        type="button"
                        onClick={() => handleRemove(item.id)}
                        className="text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] text-xs cursor-pointer"
                        title="Remove dataset"
                      >
                        ✕
                      </button>
                    </div>

                    <div className="pt-2 border-t border-[color:var(--border-subtle)] flex items-center justify-between">
                      <span className="text-[10px] text-[color:var(--text-muted)] font-mono">
                        {item.sourceType === "file_upload" ? "File Upload" : "Pasted Data"}
                      </span>
                      <button
                        type="button"
                        onClick={() => setInspectingDataset(item)}
                        className="text-[11px] font-semibold text-[color:var(--accent)] hover:underline cursor-pointer"
                      >
                        Preview Excerpt →
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}

            {/* Methodological Guidance Callout */}
            <div className="p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl text-xs space-y-1.5">
              <div className="font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
                <span>💡 Methodological Alignment</span>
              </div>
              <p className="text-[color:var(--text-secondary)] leading-relaxed text-[11px]">
                Under <strong className="text-[color:var(--text-primary)] font-semibold">{methodology}</strong>, attaching raw data traces or benchmark measurements enhances evidentiary strength during Stage 10 claims extraction.
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* 4. Sticky Footer Dock */}
      <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/95 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-md">
        <div className="flex items-center gap-3 text-xs font-medium text-[color:var(--text-secondary)]">
          <svg className="w-5 h-5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>
            <strong className="font-bold text-[color:var(--text-primary)]">{datasets.length}</strong> primary datasets indexed for extraction.
          </span>
        </div>

        <div className="flex items-center gap-3">
          {datasets.length === 0 && (
            <button
              type="button"
              onClick={handleProceed}
              disabled={isAdvancing}
              className="px-5 py-2.5 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
            >
              Skip Supplementary Data →
            </button>
          )}

          <button
            type="button"
            onClick={handleProceed}
            disabled={isAdvancing}
            className="rounded-xl bg-[color:var(--accent)] px-8 py-3 text-sm font-bold text-white hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            {isAdvancing ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Proceeding...
              </>
            ) : (
              <>
                Proceed to Evidence Extraction
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 5. Dataset Preview Drawer / Modal */}
      {inspectingDataset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-fade-in">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl max-w-2xl w-full p-6 shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">
            <div className="flex items-start justify-between pb-4 border-b border-[color:var(--border-subtle)]">
              <div>
                <span className="font-mono text-xs font-bold text-[color:var(--accent)] uppercase tracking-wider">
                  Dataset Preview
                </span>
                <h3 className="text-xl font-bold text-[color:var(--text-primary)] mt-1">
                  {inspectingDataset.name}
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                  Format: <span className="uppercase font-mono">{inspectingDataset.format}</span> • {inspectingDataset.rowCount ? `${inspectingDataset.rowCount} rows` : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setInspectingDataset(null)}
                className="w-8 h-8 rounded-lg flex items-center justify-center text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto py-4">
              <div className="p-4 bg-[color:var(--surface-sunken)] rounded-xl border border-[color:var(--border-subtle)] text-xs font-mono text-[color:var(--text-secondary)] whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto">
                {inspectingDataset.content || "No excerpt available."}
              </div>
            </div>

            <div className="pt-4 border-t border-[color:var(--border-subtle)] flex items-center justify-between">
              <button
                type="button"
                onClick={() => {
                  handleRemove(inspectingDataset.id);
                  setInspectingDataset(null);
                }}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] text-[color:var(--state-danger)] hover:bg-[color:var(--state-danger-subtle)] cursor-pointer"
              >
                Remove Dataset
              </button>
              <button
                type="button"
                onClick={() => setInspectingDataset(null)}
                className="px-5 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
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
