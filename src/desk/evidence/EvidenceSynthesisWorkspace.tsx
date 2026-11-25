import { useState, useMemo } from "react";
import {
  Table,
  BarChart3,
  Download,
  Search,
  CheckCircle,
  ExternalLink,
  Copy,
  ArrowRight,
  BookOpen,
  Sparkles,
  X,
  FileCode,
} from "lucide-react";
import {
  type EvidenceMatrixItem,
  extractEvidenceFromPaper,
  exportEvidenceMatrixToLatex,
  canPoolStudies,
} from "../../services/evidence/evidenceExtractionService";
import { type CitationGraphNode } from "../../services/discovery/snowballSamplingService";
import { classifyResearchPrompt } from "../../config/askScholarConfig";
import { frameworkForDiscipline, NOT_REPORTED_FIELD } from "../../domain/ask/evidenceFramework";
import InteractiveForestPlot from "./InteractiveForestPlot";

export interface EvidenceSynthesisWorkspaceProps {
  projectId?: string;
  seedPapers?: Array<Partial<CitationGraphNode> & { title: string }>;
  initialItems?: EvidenceMatrixItem[];
  onOpenLiteratureDiscovery?: () => void;
  onOpenPublishingExport?: (items: EvidenceMatrixItem[]) => void;
  onClose?: () => void;
  /** The question that produced these sources; it picks the discipline's evidence frame. */
  query?: string;
}

export default function EvidenceSynthesisWorkspace({
  seedPapers = [],
  initialItems,
  onOpenLiteratureDiscovery,
  onOpenPublishingExport,
  onClose,
  query,
}: EvidenceSynthesisWorkspaceProps) {
  const framework = useMemo(() => frameworkForDiscipline(query ? classifyResearchPrompt(query).discipline : "auto"), [query]);
  // Without a question to read the field from, items that carry real effect sizes keep the quantitative layout.
  const isClinical =
    framework.id === "clinical" || (!query?.trim() && (initialItems ?? []).some((it) => typeof it.effectSize === "number"));
  // Initialize matrix items from seed papers if not provided
  const [matrixItems, setMatrixItems] = useState<EvidenceMatrixItem[]>(() => {
    if (initialItems && initialItems.length > 0) return initialItems;
    if (seedPapers && seedPapers.length > 0) {
      return seedPapers.map((p, idx) => extractEvidenceFromPaper(p, idx, framework.id));
    }
    // No papers yet: an empty matrix. Never sample rows with made-up effect sizes
    // (earlier builds attributed invented SMDs and p-values to real papers here).
    return [];
  });

  const [activeTab, setActiveTab] = useState<"matrix" | "forest">("matrix");
  const poolingAvailable = (framework.supportsPooling || isClinical) && canPoolStudies(matrixItems);
  const [searchQuery, setSearchQuery] = useState("");
  const [designFilter, setDesignFilter] = useState<string>("all");
  const [metricFilter, setMetricFilter] = useState<string>("all");
  const [copiedStatus, setCopiedStatus] = useState<string | null>(null);

  // Filtered items
  const filteredItems = useMemo(() => {
    return matrixItems.filter((item) => {
      if (designFilter !== "all" && item.studyDesign !== designFilter) return false;
      if (metricFilter !== "all" && item.effectMetric !== metricFilter) return false;
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase();
        const matchesTitle = item.paperTitle.toLowerCase().includes(q);
        const matchesAuthor = item.authors.some((a) => a.toLowerCase().includes(q));
        const matchesOutcome = item.primaryOutcome.toLowerCase().includes(q);
        if (!matchesTitle && !matchesAuthor && !matchesOutcome) return false;
      }
      return true;
    });
  }, [matrixItems, designFilter, metricFilter, searchQuery]);

  // Verification status toggle
  const handleToggleVerification = (id: string) => {
    setMatrixItems((prev) =>
      prev.map((it) => {
        if (it.id !== id) return it;
        const nextStatus = it.verificationStatus === "human_verified" ? "ai_extracted" : "human_verified";
        return { ...it, verificationStatus: nextStatus };
      })
    );
  };

  // Inline value update

  // Export CSV
  const handleExportCsv = () => {
    let csv = "Study,Year,Design,Population,N,Intervention,Comparison,Outcome,Metric,Estimate,95% CI Lower,95% CI Upper,p-value,Risk of Bias,Quote,Status\n";
    for (const it of filteredItems) {
      const author = (it.authors[0] || "Author").replace(/"/g, '""');
      csv += `"${author} (${it.year || "n.d."})",${it.year || ""},"${it.studyDesign}","${it.population.replace(/"/g, '""')}",${it.sampleSizeTotal || ""},"${it.intervention.replace(/"/g, '""')}","${it.comparison.replace(/"/g, '""')}","${it.primaryOutcome.replace(/"/g, '""')}","${it.effectMetric}",${it.effectSize || ""},${it.ciLower || ""},${it.ciUpper || ""},${it.pValue || ""},"${it.riskOfBias}","${it.verbatimQuote.replace(/"/g, '""')}","${it.verificationStatus}"\n`;
    }
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `evidence_matrix_${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Copy LaTeX code
  const handleCopyLatex = () => {
    const latex = exportEvidenceMatrixToLatex(filteredItems);
    navigator.clipboard.writeText(latex);
    setCopiedStatus("Copied LaTeX!");
    setTimeout(() => setCopiedStatus(null), 3000);
  };

  return (
    <div className="flex flex-col h-full bg-[color:var(--surface-canvas,#f8fafc)] dark:bg-[color:var(--surface-canvas,#090d16)] text-neutral-900 dark:text-neutral-100 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-white/10 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
            <Table className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-neutral-900 dark:text-white leading-none">
                Evidence Synthesis Workspace
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-300/40">
                Layer C · Matrix & Forest Plots
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Empirical Extraction, Methodological Safeguards & Meta-Analytic Synthesis
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {onOpenLiteratureDiscovery && (
            <button
              type="button"
              onClick={onOpenLiteratureDiscovery}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <BookOpen className="w-3.5 h-3.5 text-indigo-500" />
              <span>Back to Discovery Graph</span>
            </button>
          )}

          {/* Export to LaTeX / Overleaf (Layer D) */}
          <button
            type="button"
            onClick={() => onOpenPublishingExport?.(matrixItems)}
            className="px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer"
          >
            <FileCode className="w-3.5 h-3.5" />
            <span>Export LaTeX & Overleaf Package</span>
            <ArrowRight className="w-3.5 h-3.5 ml-0.5" />
          </button>

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>
      </div>

      {/* Sub-Header: View Toggle (Evidence Matrix vs. Forest Plot) & Filter Controls */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-neutral-200/80 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.01] gap-3 text-xs flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          {/* View Tab Switcher */}
          <div className="flex items-center rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 p-0.5">
            <button
              type="button"
              onClick={() => setActiveTab("matrix")}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                activeTab === "matrix"
                  ? "bg-emerald-600 text-white font-semibold shadow-2xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <Table className="w-3.5 h-3.5" />
              <span>Structured Matrix ({matrixItems.length})</span>
            </button>
            <button
              type="button"
              disabled={!poolingAvailable}
              title={poolingAvailable ? undefined : "Pooling needs 2 or more studies reporting the same real effect metric"}
              onClick={() => setActiveTab("forest")}
              className={`px-3 py-1 rounded-md text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                !poolingAvailable
                  ? "opacity-40 cursor-not-allowed text-neutral-500"
                  : activeTab === "forest"
                  ? "bg-indigo-600 text-white font-semibold shadow-2xs"
                  : "text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
              }`}
            >
              <BarChart3 className="w-3.5 h-3.5" />
              <span>Interactive Forest Plot</span>
            </button>
          </div>

          {/* Search */}
          <div className="relative w-52">
            <Search className="w-3.5 h-3.5 absolute left-2.5 top-1/2 -translate-y-1/2 text-neutral-400" />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Filter matrix studies..."
              className="w-full pl-8 pr-2.5 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800/80 text-xs focus:outline-hidden"
            />
          </div>
        </div>

        {/* Filter Dropdowns & Export Buttons */}
        <div className="flex items-center gap-2 flex-wrap">
          {/* Design Filter */}
          <select
            value={designFilter}
            onChange={(e) => setDesignFilter(e.target.value)}
            className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 text-[11px] cursor-pointer"
          >
            <option value="all">All Designs</option>
            <option value="RCT">RCT</option>
            <option value="Cohort">Cohort</option>
            <option value="Case-Control">Case-Control</option>
            <option value="Observational">Observational</option>
          </select>

          {/* Metric Filter */}
          <select
            value={metricFilter}
            onChange={(e) => setMetricFilter(e.target.value)}
            className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 text-[11px] cursor-pointer"
          >
            <option value="all">All Metrics</option>
            <option value="SMD">SMD</option>
            <option value="Cohen's d">Cohen's d</option>
            <option value="Odds Ratio">Odds Ratio</option>
            <option value="Hazard Ratio">Hazard Ratio</option>
          </select>

          {/* Export Actions */}
          <button
            type="button"
            onClick={handleCopyLatex}
            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Copy LaTeX booktabs table syntax"
          >
            <Copy className="w-3 h-3 text-neutral-500" />
            <span>{copiedStatus || "LaTeX Table"}</span>
          </button>
          <button
            type="button"
            onClick={handleExportCsv}
            className="px-2.5 py-1 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 text-neutral-700 dark:text-neutral-300 flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Download CSV"
          >
            <Download className="w-3 h-3 text-emerald-500" />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* Main Workspace Body */}
      <div className="flex-1 min-h-0 overflow-y-auto p-5 scholar-scrollbar">
        {activeTab === "forest" && poolingAvailable ? (
          <div className="max-w-4xl mx-auto space-y-4">
            <InteractiveForestPlot items={filteredItems} />
          </div>
        ) : (
          /* Structured Evidence Matrix Table */
          <div className="rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900 shadow-sm overflow-hidden">
            <div className="overflow-x-auto scholar-scrollbar">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="bg-neutral-50 dark:bg-white/[0.03] border-b border-neutral-200 dark:border-white/10 text-[11px] font-semibold text-neutral-600 dark:text-neutral-400">
                    <th className="py-2.5 px-3 w-8">#</th>
                    <th className="py-2.5 px-3 min-w-[190px]">Study & Citation</th>
                    <th className="py-2.5 px-2.5 min-w-[90px]">Design</th>
                    {isClinical ? (
                      <>
                        <th className="py-2.5 px-3 min-w-[130px]">Population (N)</th>
                        <th className="py-2.5 px-3 min-w-[140px]">Intervention / Control</th>
                        <th className="py-2.5 px-3 min-w-[140px]">Effect Size [95% CI]</th>
                        <th className="py-2.5 px-2.5 min-w-[70px]">p-val</th>
                        <th className="py-2.5 px-2.5 min-w-[80px]">Bias</th>
                      </>
                    ) : (
                      framework.columns.map((col) => (
                        <th key={col.key} className="py-2.5 px-3 min-w-[150px]">{col.label}</th>
                      ))
                    )}
                    <th className="py-2.5 px-3 min-w-[200px]">{isClinical ? "Key Finding" : "Source Excerpt"}</th>
                    <th className="py-2.5 px-2.5 text-right w-24">Verification</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200/70 dark:divide-white/5">
                  {filteredItems.length === 0 && (
                    <tr data-testid="evidence-matrix-empty">
                      <td colSpan={isClinical ? 10 : 5 + framework.columns.length} className="py-10 px-4 text-center text-xs text-neutral-500 dark:text-neutral-400">
                        {matrixItems.length === 0
                          ? "No papers in the matrix yet. Add papers from Literature Discovery to extract their evidence."
                          : "No papers match these filters."}
                      </td>
                    </tr>
                  )}
                  {filteredItems.map((item, idx) => {
                    const rawAuthor = item.authors[0] || "Author";
                    const surname = rawAuthor.includes(",") ? rawAuthor.split(",")[0].trim() : rawAuthor.split(" ").pop()?.trim() || "Author";
                    const studyLabel = `${surname} (${item.year || "n.d."})`;

                    return (
                      <tr
                        key={item.id}
                        className="hover:bg-neutral-50/70 dark:hover:bg-white/[0.02] transition-colors"
                      >
                        <td className="py-3 px-3 font-mono text-[10px] text-neutral-400 align-top">
                          {idx + 1}
                        </td>

                        {/* Title & Study Label */}
                        <td className="py-3 px-3 align-top">
                          <div className="font-semibold text-neutral-900 dark:text-neutral-100 leading-snug">
                            {studyLabel}
                          </div>
                          <div className="text-[11px] text-neutral-500 dark:text-neutral-400 line-clamp-1 mt-0.5">
                            {item.paperTitle}
                          </div>
                          {item.doi && (
                            <a
                              href={item.url || `https://doi.org/${item.doi}`}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-[9.5px] font-mono text-indigo-500 hover:underline flex items-center gap-0.5 mt-0.5"
                            >
                              <span>doi:{item.doi}</span>
                              <ExternalLink className="w-2.5 h-2.5" />
                            </a>
                          )}
                        </td>

                        {/* Design */}
                        <td className="py-3 px-2.5 align-top">
                          <span className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 border border-neutral-200 dark:border-white/10">
                            {item.studyDesign}
                          </span>
                        </td>

                        {isClinical ? (
                          <>
                        {/* Population & N */}
                        <td className="py-3 px-3 text-[11px] text-neutral-700 dark:text-neutral-300 align-top">
                          <div>{item.population}</div>
                          <div className="font-mono text-[10px] text-neutral-400 mt-0.5">
                            N = {item.sampleSizeTotal?.toLocaleString() || "---"}
                          </div>
                        </td>

                        {/* Intervention vs Control */}
                        <td className="py-3 px-3 text-[11px] text-neutral-700 dark:text-neutral-300 align-top">
                          <div className="font-medium">{item.intervention}</div>
                          <div className="text-[10px] text-neutral-400 mt-0.5">
                            vs. {item.comparison}
                          </div>
                        </td>

                        {/* Effect Size & CI */}
                        <td className="py-3 px-3 align-top font-mono text-[11px]">
                          <div className="flex items-baseline gap-1">
                            <span className="font-bold text-neutral-900 dark:text-neutral-100">
                              {item.effectMetric}: {item.effectSize ?? "---"}
                            </span>
                            {typeof item.ciLower === "number" && (
                              <span className="text-[10px] text-neutral-500">
                                [{item.ciLower}, {item.ciUpper}]
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-neutral-400 font-sans mt-0.5">
                            {item.primaryOutcome}
                          </div>
                        </td>

                        {/* p-value */}
                        <td className="py-3 px-2.5 font-mono text-[11px] text-neutral-700 dark:text-neutral-300 align-top">
                          {typeof item.pValue === "number"
                            ? item.pValue < 0.001
                              ? "<0.001"
                              : item.pValue.toFixed(3)
                            : "---"}
                        </td>

                        {/* Risk of Bias */}
                        <td className="py-3 px-2.5 align-top">
                          <span
                            className={`inline-block px-1.5 py-0.5 rounded text-[9.5px] font-semibold ${
                              item.riskOfBias === "low"
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-300/50"
                                : item.riskOfBias === "moderate"
                                ? "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300 border border-amber-300/50"
                                : "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-300/50"
                            }`}
                          >
                            {item.riskOfBias.toUpperCase()}
                          </span>
                        </td>

                          </>
                        ) : (
                          framework.columns.map((col) => (
                            <td key={col.key} className="py-3 px-3 text-[11px] text-neutral-700 dark:text-neutral-300 align-top">
                              {item.frameworkFields?.[col.key] || NOT_REPORTED_FIELD}
                            </td>
                          ))
                        )}

                        {/* Verbatim Finding & Locator */}
                        <td className="py-3 px-3 text-[11px] text-neutral-600 dark:text-neutral-300 leading-relaxed align-top">
                          <p className="line-clamp-3 italic font-serif">
                            {item.verbatimQuote || item.findingsSummary}
                          </p>
                          {item.quoteLocator && (
                            <div className="text-[9.5px] font-mono text-neutral-400 mt-1">
                              Locator: {item.quoteLocator}
                            </div>
                          )}
                        </td>

                        {/* Verification Status */}
                        <td className="py-3 px-2.5 text-right align-top">
                          <button
                            type="button"
                            onClick={() => handleToggleVerification(item.id)}
                            className={`px-2 py-1 rounded-md text-[10px] font-semibold inline-flex items-center gap-1 transition-colors cursor-pointer border ${
                              item.verificationStatus === "human_verified"
                                ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-300"
                                : "bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-400 border-neutral-200 dark:border-white/10 hover:border-indigo-400"
                            }`}
                            title="Toggle human verified status"
                          >
                            {item.verificationStatus === "human_verified" ? (
                              <>
                                <CheckCircle className="w-3 h-3 text-emerald-600" />
                                <span>Verified</span>
                              </>
                            ) : (
                              <>
                                <Sparkles className="w-3 h-3 text-indigo-400" />
                                <span>AI Extracted</span>
                              </>
                            )}
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

