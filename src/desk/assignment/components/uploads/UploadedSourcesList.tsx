import { SourceTypeIcon,SourceFormatBadge,formatBytes,formatTimestamp } from "./uploadFormat";
import type { UploadedSourceDocument } from "../../types";
import {
FileText,
CheckCircle2,
Trash2,ChevronDown,
ChevronUp,
Quote,
Sparkles,
Table,
Target,
ArrowRight,
Copy,
Check,
BookOpen,ShieldCheck,
CheckCheck
} from "lucide-react";
import { deriveSourceTraceability } from "../../services/sourceEvidenceExtractionService";

export interface UploadedSourcesListProps {
  activeInspectTabs: { [x: string]: "extracted" | "used" | "original"; };
  assignmentQuestion: string;
  citationStyle: string;
  copiedDocId: string | null;
  expandedDocIds: Set<string>;
  handleCopyCitation: (docId: string, text: string) => void;
  onRemove: (documentId: string) => void | Promise<void>;
  setInspectTab: (docId: string, tab: "extracted" | "used" | "original") => void;
  toggleExpand: (docId: string) => void;
  uploadedFiles: UploadedSourceDocument[];
}

export function UploadedSourcesList({ activeInspectTabs, assignmentQuestion, citationStyle, copiedDocId, expandedDocIds, handleCopyCitation, onRemove, setInspectTab, toggleExpand, uploadedFiles }: UploadedSourcesListProps) {
  return (
    <>
          {/* List of Uploaded Source Cards with 3-Layer Architecture */}
          <div className="space-y-3.5">
            {uploadedFiles.map((doc) => {
              const isExpanded = expandedDocIds.has(doc.id);
              const traceability = deriveSourceTraceability(doc, assignmentQuestion, citationStyle);
              const currentTab = activeInspectTabs[doc.id] || "extracted";
              const isCopied = copiedDocId === doc.id;

              return (
                <div
                  key={doc.id}
                  data-testid={`uploaded-file-${doc.id}`}
                  className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 sm:p-5 shadow-xs transition-all hover:border-neutral-300 dark:hover:border-white/20 space-y-4"
                >
                  {/* Top Card Identity Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-[color:var(--border-subtle)]">
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-[color:var(--surface-inset)] flex items-center justify-center shrink-0 border border-[color:var(--border-subtle)]">
                        <SourceTypeIcon type={doc.sourceType} />
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-[color:var(--text-primary)] truncate">
                            {doc.name}
                          </h3>
                          <SourceFormatBadge type={doc.sourceType} />
                          {/* Processed Status Badge */}
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>Processed</span>
                          </span>
                        </div>
                        <p className="text-xs text-[color:var(--text-muted)] font-mono">
                          {formatBytes(doc.fileSize)} · Uploaded {formatTimestamp(doc.uploadedAt)} · Text read
                        </p>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => toggleExpand(doc.id)}
                        className="px-3 py-1.5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-xs font-semibold text-[color:var(--text-secondary)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        aria-expanded={isExpanded}
                      >
                        <span>{isExpanded ? "Hide Details" : "Inspect Details"}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyCitation(doc.id, doc.citation || traceability.citationsList[0] || doc.name)}
                        className="p-2 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] transition-colors cursor-pointer"
                        title="Copy citation reference"
                        aria-label="Copy citation reference"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemove(doc.id)}
                        aria-label={`Remove ${doc.name}`}
                        className="p-2 rounded-xl text-[color:var(--text-muted)] hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Remove source from assignment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 3-Tier Layered Transparency Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Layer 1: Uploaded Material */}
                    <div className="p-3.5 rounded-xl bg-[color:var(--surface-inset)]/80 border border-[color:var(--border-subtle)] space-y-2 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1">
                            <FileText className="w-3 h-3 text-[color:var(--text-muted)]" />
                            <span>1. Uploaded Material</span>
                          </span>
                          <span className="text-xs font-mono text-[color:var(--text-muted)]">Original</span>
                        </div>
                        <p className="text-xs font-bold text-[color:var(--text-primary)] truncate">
                          {doc.name}
                        </p>
                        <p className="text-xs text-[color:var(--text-muted)] leading-snug">
                          Original file provided by user. Stored as verified course grounding material.
                        </p>
                      </div>

                      <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs px-2 py-0.5 rounded-md bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] font-mono">
                          {formatBytes(doc.fileSize)}
                        </span>
                        <span className="text-xs px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-500/20">
                          ✓ Processed
                        </span>
                      </div>
                    </div>

                    {/* Layer 2: Processed Material / Engine Extracted */}
                    <div className="p-3.5 rounded-xl bg-blue-50/40 dark:bg-blue-950/15 border border-blue-200/60 dark:border-blue-500/20 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-blue-500" />
                            <span>2. What was read</span>
                          </span>
                          <span className="text-xs font-mono text-blue-600 dark:text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            {traceability.relevantEvidences.length} excerpts
                          </span>
                        </div>

                        <ul className="text-xs text-[color:var(--text-secondary)] space-y-1">
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span><strong>Summary:</strong> {traceability.abstract ? "from the file\u2019s text" : "none"}</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span><strong>Key passages:</strong> {traceability.keyFindings.length}</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span className="truncate"><strong>Material:</strong> {traceability.methodology}</span>
                          </li>
                        </ul>
                      </div>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isExpanded) toggleExpand(doc.id);
                            setInspectTab(doc.id, "extracted");
                          }}
                          className="text-xs font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>Inspect extracted data</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>

                    {/* Layer 3: Used Material / Evidence in Assignment */}
                    <div className="p-3.5 rounded-xl bg-emerald-50/40 dark:bg-emerald-950/15 border border-emerald-200/60 dark:border-emerald-500/20 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <Target className="w-3 h-3 text-emerald-500" />
                            <span>3. Used in Assignment</span>
                          </span>
                          <span className="text-xs font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/25">
                            Active
                          </span>
                        </div>

                        <ul className="text-xs text-[color:var(--text-secondary)] space-y-1">
                          <li className="flex items-center gap-1.5 font-medium text-emerald-900 dark:text-emerald-200">
                            <CheckCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span>{traceability.usedInAssignment.passagesCount} relevant passages</span>
                          </li>
                          <li className="flex items-center gap-1.5 font-medium text-emerald-900 dark:text-emerald-200">
                            <CheckCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span>{traceability.usedInAssignment.findingsCount} findings</span>
                          </li>
                          <li className="flex items-center gap-1.5 font-medium text-emerald-900 dark:text-emerald-200">
                            <CheckCheck className="w-3 h-3 text-emerald-500 shrink-0" />
                            <span>{traceability.usedInAssignment.citationsCount} citations</span>
                          </li>
                        </ul>
                      </div>

                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => {
                            if (!isExpanded) toggleExpand(doc.id);
                            setInspectTab(doc.id, "used");
                          }}
                          className="text-xs font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>View assignment usage</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Inspection Drawer */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-[color:var(--border-subtle)] space-y-4 animate-in fade-in duration-150">
                      {/* Sub-tab Navigation Switcher */}
                      <div className="flex items-center gap-1 bg-[color:var(--surface-inset)] p-1 rounded-xl w-fit">
                        <button
                          type="button"
                          onClick={() => setInspectTab(doc.id, "extracted")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            currentTab === "extracted"
                              ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs font-semibold"
                              : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                          <span>Text read from the file</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setInspectTab(doc.id, "used")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            currentTab === "used"
                              ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs font-semibold"
                              : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                          }`}
                        >
                          <Target className="w-3.5 h-3.5 text-emerald-500" />
                          <span>Used in Assignment</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setInspectTab(doc.id, "original")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            currentTab === "original"
                              ? "bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] shadow-xs font-semibold"
                              : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5 text-[color:var(--text-muted)]" />
                          <span>Original File & Citation</span>
                        </button>
                      </div>

                      {/* Tab 1 Content: Engine Extracted Material */}
                      {currentTab === "extracted" && (
                        <div className="space-y-3.5">
                          {/* Abstract / Overview */}
                          <div className="p-3.5 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1">
                              <BookOpen className="w-3 h-3 text-[color:var(--text-muted)]" />
                              <span>Abstract & Source Overview</span>
                            </span>
                            <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                              {traceability.abstract}
                            </p>
                          </div>

                          {/* Key Findings */}
                          <div className="p-3.5 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-blue-500" />
                              <span>Key Findings Extracted by Engine</span>
                            </span>
                            <div className="space-y-1.5">
                              {traceability.keyFindings.map((finding, fIdx) => (
                                <div
                                  key={fIdx}
                                  className="text-xs text-[color:var(--text-primary)] flex items-start gap-2"
                                >
                                  <span className="w-4 h-4 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-xs flex items-center justify-center font-bold shrink-0 mt-0.5">
                                    {fIdx + 1}
                                  </span>
                                  <span className="leading-snug">{finding}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Material type and dataset summary */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-1">
                              <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                                Material
                              </span>
                              <p className="text-xs font-semibold text-[color:var(--text-primary)]">
                                {traceability.methodology}
                              </p>
                            </div>

                            {doc.structuredDataSummary ? (
                              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 space-y-1">
                                <span className="text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <Table className="w-3 h-3" />
                                  <span>Structured Data Summary</span>
                                </span>
                                <p className="text-xs text-emerald-900 dark:text-emerald-200 font-medium">
                                  {doc.structuredDataSummary}
                                </p>
                              </div>
                            ) : (
                              <div className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-1">
                                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                                  Grounding Status
                                </span>
                                <p className="text-xs font-semibold text-[color:var(--text-primary)]">
                                  Context-Aligned & Verified
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Extracted Excerpts with Precise Locators */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-xs font-semibold text-[color:var(--text-muted)]">
                              <span className="flex items-center gap-1">
                                <Quote className="w-3 h-3 text-[color:var(--text-muted)]" />
                                <span>Extracted Relevant Evidence Excerpts ({traceability.relevantEvidences.length})</span>
                              </span>
                              <span className="text-xs font-mono text-[color:var(--text-muted)]">
                                Exact Page / Slide Locators
                              </span>
                            </div>

                            <div className="space-y-2">
                              {traceability.relevantEvidences.map((ev, eIdx) => (
                                <div
                                  key={ev.id || eIdx}
                                  className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-xs font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                      📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                                    </span>
                                    {ev.claim && (
                                      <span className="text-xs text-[color:var(--text-muted)] truncate max-w-sm">
                                        {ev.claim}
                                      </span>
                                    )}
                                  </div>

                                  <p className="font-medium text-[color:var(--text-primary)] text-xs leading-relaxed italic">
                                    "{ev.excerpt}"
                                  </p>

                                  {ev.context && ev.context !== ev.excerpt && (
                                    <p className="text-xs text-[color:var(--text-muted)] leading-normal">
                                      <span className="font-semibold text-[color:var(--text-secondary)]">Context: </span>
                                      {ev.context}
                                    </p>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tab 2 Content: Used in Assignment */}
                      {currentTab === "used" && (
                        <div className="space-y-3.5">
                          {/* Summary Banner */}
                          <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-950 dark:text-emerald-200 flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <div>
                              <span className="font-bold">Active Assignment Grounding:</span> This material provides{" "}
                              <strong>{traceability.usedInAssignment.passagesCount} specific passages</strong> and{" "}
                              <strong>{traceability.usedInAssignment.findingsCount} findings</strong> grounding your assignment analysis.
                            </div>
                            <span className="text-xs px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-mono font-semibold shrink-0">
                              Phase 3 Active
                            </span>
                          </div>

                          {/* Passages Mapped to Sections */}
                          <div className="space-y-2">
                            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1">
                              <Target className="w-3 h-3 text-emerald-500" />
                              <span>Relevant passages from this material</span>
                            </span>

                            <div className="space-y-2">
                              {traceability.usedInAssignment.passages.map((p, pIdx) => (
                                <div
                                  key={pIdx}
                                  className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    {p.targetSection ? (
                                      <span className="text-xs font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                        Section: {p.targetSection}
                                      </span>
                                    ) : <span />}
                                    <span className="text-xs font-mono text-[color:var(--text-muted)]">
                                      📍 {p.location}
                                    </span>
                                  </div>
                                  <p className="font-medium text-[color:var(--text-primary)] text-xs italic">
                                    "{p.text}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Citations Generated for Assignment */}
                          <div className="space-y-2 pt-1">
                            <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)] flex items-center gap-1">
                              <Quote className="w-3 h-3 text-purple-500" />
                              <span>Assignment In-Text & Reference Citations</span>
                            </span>

                            <div className="p-3 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] text-xs space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                                    In-Text Citation Format
                                  </span>
                                  <p className="font-mono text-[color:var(--text-primary)] mt-0.5">
                                    {traceability.inTextCitation}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCitation(doc.id + "-intext", traceability.inTextCitation)}
                                  className="px-2.5 py-1 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedDocId === doc.id + "-intext" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedDocId === doc.id + "-intext" ? "Copied" : "Copy"}</span>
                                </button>
                              </div>

                              <div className="pt-2 border-t border-[color:var(--border-subtle)] flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-xs font-semibold uppercase tracking-wider text-[color:var(--text-muted)]">
                                    Full Reference ({citationStyle})
                                  </span>
                                  <p className="font-serif italic text-[color:var(--text-primary)] mt-0.5">
                                    {doc.citation || traceability.citationsList[0]}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCitation(doc.id, doc.citation || traceability.citationsList[0])}
                                  className="px-2.5 py-1 rounded-lg border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors flex items-center gap-1 cursor-pointer shrink-0"
                                >
                                  {isCopied ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                  <span>{isCopied ? "Copied" : "Copy"}</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        </div>
                      )}

                      {/* Tab 3 Content: Original File Details */}
                      {currentTab === "original" && (
                        <div className="space-y-3">
                          <div className="p-3.5 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-2 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                                  File Name
                                </span>
                                <p className="font-mono text-[color:var(--text-primary)] truncate mt-0.5">
                                  {doc.name}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                                  Format & MIME
                                </span>
                                <p className="font-mono text-[color:var(--text-primary)] mt-0.5">
                                  {(doc.sourceType || "other").toUpperCase()} · {doc.mimeType || "application/octet-stream"}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                                  File Size
                                </span>
                                <p className="font-mono text-[color:var(--text-primary)] mt-0.5">
                                  {formatBytes(doc.fileSize)}
                                </p>
                              </div>
                              <div>
                                <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                                  Uploaded Timestamp
                                </span>
                                <p className="font-mono text-[color:var(--text-primary)] mt-0.5">
                                  {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : "Recently"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1">
                            <span className="text-[color:var(--text-muted)]">
                              Need to remove this course grounding source?
                            </span>
                            <button
                              type="button"
                              onClick={() => onRemove(doc.id)}
                              className="px-3 py-1.5 rounded-xl text-rose-600 dark:text-rose-400 hover:bg-rose-500/10 transition-colors font-medium cursor-pointer flex items-center gap-1.5"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                              <span>Remove from Assignment</span>
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
    </>
  );
}
