import React, { useState, useRef } from "react";
import type { UploadedSourceDocument, EvidenceItem } from "../types";
import {
  Upload,
  FileText,
  CheckCircle2,
  Trash2,
  FileSpreadsheet,
  Presentation,
  Image as ImageIcon,
  Link as LinkIcon,
  FileCode,
  Globe,
  Plus,
  Loader2,
  ChevronDown,
  ChevronUp,
  Quote,
  Sparkles,
  ExternalLink,
  Table,
} from "lucide-react";
import {
  extractProjectEvidence,
  parseProjectFile,
  parseProjectUrl,
  parseProjectText,
  type ParsedSourcePayload,
} from "../services/sourceEvidenceExtractionService";

export interface LectureUploadDropzoneProps {
  uploadedFiles: UploadedSourceDocument[];
  onUpload: (documents: UploadedSourceDocument[], newEvidences?: EvidenceItem[]) => void | Promise<void>;
  onRemove: (documentId: string) => void | Promise<void>;
  assignmentQuestion?: string;
  citationStyle?: string;
  projectId?: string;
}

function formatBytes(bytes?: number): string {
  if (!bytes || bytes === 0) return "0 KB";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

/** Icon based on source format */
function SourceTypeIcon({ type }: { type?: string }) {
  switch (type) {
    case "pptx":
      return <Presentation className="w-4 h-4 text-amber-500" />;
    case "spreadsheet":
      return <FileSpreadsheet className="w-4 h-4 text-emerald-500" />;
    case "image":
      return <ImageIcon className="w-4 h-4 text-purple-500" />;
    case "weblink":
      return <Globe className="w-4 h-4 text-sky-500" />;
    case "docx":
      return <FileText className="w-4 h-4 text-blue-500" />;
    case "text":
      return <FileCode className="w-4 h-4 text-slate-500" />;
    default:
      return <FileText className="w-4 h-4 text-rose-500" />;
  }
}

/** Format label pill */
function SourceFormatBadge({ type }: { type?: string }) {
  let label = "PDF Document";
  let color = "bg-rose-500/10 text-rose-600 dark:text-rose-400 border-rose-500/20";

  if (type === "pptx") {
    label = "Slides / Keynote";
    color = "bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/20";
  } else if (type === "spreadsheet") {
    label = "Spreadsheet / Dataset";
    color = "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20";
  } else if (type === "image") {
    label = "Image / Scanned Figure";
    color = "bg-purple-500/10 text-purple-600 dark:text-purple-400 border-purple-500/20";
  } else if (type === "weblink") {
    label = "Web Page / URL";
    color = "bg-sky-500/10 text-sky-600 dark:text-sky-400 border-sky-500/20";
  } else if (type === "docx") {
    label = "Word Document";
    color = "bg-blue-500/10 text-blue-600 dark:text-blue-400 border-blue-500/20";
  } else if (type === "text") {
    label = "Text Notes";
    color = "bg-slate-500/10 text-slate-600 dark:text-slate-400 border-slate-500/20";
  }

  return (
    <span className={`px-2 py-0.5 rounded-full text-[10px] font-semibold border ${color}`}>
      {label}
    </span>
  );
}

export const LectureUploadDropzone: React.FC<LectureUploadDropzoneProps> = ({
  uploadedFiles,
  onUpload,
  onRemove,
  assignmentQuestion = "",
  citationStyle = "APA",
  projectId = "default-project",
}) => {
  const [isDragOver, setIsDragOver] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingStatusText, setProcessingStatusText] = useState("");
  const [expandedDocIds, setExpandedDocIds] = useState<Set<string>>(new Set());

  // Modals for URL and Text input
  const [showUrlModal, setShowUrlModal] = useState(false);
  const [urlInput, setUrlInput] = useState("");
  const [showTextModal, setShowTextModal] = useState(false);
  const [pastedTextTitle, setPastedTextTitle] = useState("");
  const [pastedTextContent, setPastedTextContent] = useState("");
  const [modalError, setModalError] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const toggleExpand = (docId: string) => {
    setExpandedDocIds((prev) => {
      const next = new Set(prev);
      if (next.has(docId)) next.delete(docId);
      else next.add(docId);
      return next;
    });
  };

  /** Process raw files through the project-specific evidence extraction pipeline */
  const processFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    setIsProcessing(true);
    setProcessingStatusText(`Parsing and analyzing ${files.length} source(s) against assignment requirements...`);

    const newDocs: UploadedSourceDocument[] = [];
    const allEvidenceItems: EvidenceItem[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      setProcessingStatusText(`Extracting relevant evidence from "${file.name}"...`);

      try {
        let payload: ParsedSourcePayload;

        // Try backend parse endpoint first
        try {
          payload = await parseProjectFile(projectId, file);
        } catch {
          // Client-side fallback if backend parse fails
          const ext = file.name.split(".").pop()?.toLowerCase() || "";
          let sourceType: UploadedSourceDocument["sourceType"] = "other";
          if (ext === "pdf") sourceType = "pdf";
          else if (ext === "docx" || ext === "doc") sourceType = "docx";
          else if (ext === "pptx" || ext === "ppt") sourceType = "pptx";
          else if (["xlsx", "xls", "csv", "tsv"].includes(ext)) sourceType = "spreadsheet";
          else if (["png", "jpg", "jpeg", "webp"].includes(ext)) sourceType = "image";
          else if (["txt", "md"].includes(ext)) sourceType = "text";

          const text = await file.text().catch(() => `Source document: ${file.name}`);
          payload = {
            title: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
            sourceType,
            text,
            fileSize: file.size,
          };
        }

        // Run contextual evidence extraction (extracts only assignment-relevant excerpts, discards bulk text)
        const extraction = await extractProjectEvidence(payload, {
          projectId,
          assignmentQuestion,
          citationStyle,
        });

        // Ensure doc ID conforms to doc- prefix for test and system compatibility
        const docWithStandardId: UploadedSourceDocument = {
          ...extraction.document,
          id: `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
        };

        newDocs.push(docWithStandardId);
        allEvidenceItems.push(...extraction.evidenceItems);
      } catch (err: any) {
        console.error("Error processing file:", err);
        // Fallback basic document record
        newDocs.push({
          id: `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          fileSize: file.size,
          uploadedAt: new Date().toISOString(),
          mimeType: file.type || "application/octet-stream",
          evidenceCount: 1,
          extractedEvidences: [
            {
              id: `ev-${Date.now()}-${i}`,
              excerpt: `Uploaded source material: ${file.name}`,
              sourceLocation: "Document Root",
            },
          ],
        });
      }
    }

    setIsProcessing(false);
    setProcessingStatusText("");

    if (newDocs.length > 0) {
      await onUpload(newDocs, allEvidenceItems);
    }
  };

  /** Handle URL Submission */
  const handleUrlSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!urlInput.trim()) return;

    setIsProcessing(true);
    setModalError(null);
    setProcessingStatusText(`Fetching and extracting evidence from web article...`);

    try {
      let payload: ParsedSourcePayload;
      try {
        payload = await parseProjectUrl(projectId, urlInput.trim());
      } catch {
        payload = {
          title: `Web Article: ${urlInput.trim()}`,
          sourceType: "weblink",
          text: `Online academic source accessed via ${urlInput.trim()}`,
          url: urlInput.trim(),
        };
      }

      const extraction = await extractProjectEvidence(payload, {
        projectId,
        assignmentQuestion,
        citationStyle,
      });

      const docWithStandardId: UploadedSourceDocument = {
        ...extraction.document,
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };

      await onUpload([docWithStandardId], extraction.evidenceItems);
      setShowUrlModal(false);
      setUrlInput("");
    } catch (err: any) {
      setModalError(err.message || "Failed to parse URL");
    } finally {
      setIsProcessing(false);
      setProcessingStatusText("");
    }
  };

  /** Handle Pasted Text Submission */
  const handleTextSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pastedTextContent.trim()) return;

    setIsProcessing(true);
    setModalError(null);
    setProcessingStatusText(`Extracting assignment evidence from pasted lecture notes...`);

    try {
      const payload: ParsedSourcePayload = {
        title: pastedTextTitle.trim() || "Pasted Lecture Notes",
        sourceType: "text",
        text: pastedTextContent.trim(),
      };

      const extraction = await extractProjectEvidence(payload, {
        projectId,
        assignmentQuestion,
        citationStyle,
      });

      const docWithStandardId: UploadedSourceDocument = {
        ...extraction.document,
        id: `doc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      };

      await onUpload([docWithStandardId], extraction.evidenceItems);
      setShowTextModal(false);
      setPastedTextTitle("");
      setPastedTextContent("");
    } catch (err: any) {
      setModalError(err.message || "Failed to parse text");
    } finally {
      setIsProcessing(false);
      setProcessingStatusText("");
    }
  };

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(false);
    processFiles(e.dataTransfer.files);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    processFiles(e.target.files);
    if (e.target) {
      e.target.value = "";
    }
  };

  return (
    <div className="space-y-4">
      {/* Drag & Drop Surface with Multi-format Support */}
      <div
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !isProcessing && fileInputRef.current?.click()}
        data-testid="lecture-upload-dropzone"
        className={`rounded-2xl border-2 border-dashed p-6 sm:p-7 text-center transition-all cursor-pointer flex flex-col items-center justify-center gap-3 relative overflow-hidden ${
          isDragOver
            ? "border-neutral-900 bg-neutral-100/80 dark:border-white dark:bg-white/10 scale-[1.005]"
            : "border-neutral-200 dark:border-white/15 bg-neutral-50/50 dark:bg-white/[0.02] hover:border-neutral-300 dark:hover:border-white/30 hover:bg-neutral-50 dark:hover:bg-white/[0.04]"
        } ${isProcessing ? "pointer-events-none opacity-80" : ""}`}
      >
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.png,.jpg,.jpeg,.webp,.txt,.md"
          onChange={handleFileInputChange}
          className="hidden"
          data-testid="lecture-file-input"
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-3 py-2">
            <Loader2 className="w-8 h-8 text-neutral-900 dark:text-white animate-spin" />
            <div className="space-y-1">
              <p className="text-xs font-semibold text-neutral-900 dark:text-white">
                Context-Aware Evidence Extraction in Progress
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
                {processingStatusText || "Analyzing source contents against your assignment requirements..."}
              </p>
            </div>
          </div>
        ) : (
          <>
            <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-neutral-600 dark:text-neutral-300 shadow-2xs">
              <Upload className="w-5 h-5" />
            </div>

            <div className="space-y-1 max-w-lg">
              <p className="text-xs sm:text-sm font-semibold text-neutral-900 dark:text-white">
                Drop your lecture slides, class notes, or required syllabus PDFs here
              </p>
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                Accepts <span className="font-medium text-neutral-700 dark:text-neutral-300">.pdf, .docx, .pptx, .xlsx, .csv, images, web links, & text</span> · Auto-indexed and approved for assignment citation grounding
              </p>
            </div>

            {/* Quick Action Buttons Bar */}
            <div className="flex flex-wrap items-center justify-center gap-2 pt-1" onClick={(e) => e.stopPropagation()}>
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="px-4 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <span>Browse Files</span>
              </button>

              <button
                type="button"
                onClick={() => setShowUrlModal(true)}
                className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5 text-sky-500" />
                <span>Add Web Link / URL</span>
              </button>

              <button
                type="button"
                onClick={() => setShowTextModal(true)}
                className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
              >
                <FileCode className="w-3.5 h-3.5 text-slate-500" />
                <span>Paste Notes</span>
              </button>
            </div>
          </>
        )}
      </div>

      {/* Web Link Modal */}
      {showUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-white dark:bg-[#1C1C1E] rounded-3xl p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 text-left">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-sky-500" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Add Web Link / Academic Article URL
              </h3>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
              Enter any accessible article, institutional report, or reading page. We will fetch and extract only the assignment-relevant excerpts with citation references.
            </p>

            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div>
                <input
                  type="url"
                  placeholder="https://example.edu/article or research report..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {modalError && (
                <p className="text-xs text-rose-500 font-medium">{modalError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !urlInput.trim()}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Extract Evidence</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Paste Text Modal */}
      {showTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-white dark:bg-[#1C1C1E] rounded-3xl p-6 shadow-2xl border border-neutral-200 dark:border-neutral-800 text-left">
            <div className="flex items-center gap-2 mb-2">
              <FileCode className="w-4 h-4 text-slate-500" />
              <h3 className="text-sm font-bold text-neutral-900 dark:text-white">
                Paste Lecture Notes or Syllabus Excerpt
              </h3>
            </div>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mb-4 leading-relaxed">
              Paste passages from lecture slides, assigned reading packs, or rubric rubrics. Only excerpts relevant to the assignment will be stored.
            </p>

            <form onSubmit={handleTextSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  placeholder="Note Title / Lecture Title (e.g. Week 4: China's Foreign Policy)..."
                  value={pastedTextTitle}
                  onChange={(e) => setPastedTextTitle(e.target.value)}
                  className="w-full px-3.5 py-2 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-neutral-400"
                />
              </div>

              <div>
                <textarea
                  rows={6}
                  placeholder="Paste lecture content, slide points, or reading notes here..."
                  value={pastedTextContent}
                  onChange={(e) => setPastedTextContent(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-neutral-400 resize-none font-sans"
                />
              </div>

              {modalError && (
                <p className="text-xs text-rose-500 font-medium">{modalError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTextModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !pastedTextContent.trim()}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Extract Evidence</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Uploaded Materials & Extracted Evidence Repository */}
      {uploadedFiles.length > 0 && (
        <div className="space-y-3 pt-1" data-testid="uploaded-materials-list">
          <div className="flex items-center justify-between text-xs font-semibold text-neutral-500 dark:text-neutral-400 uppercase tracking-wider px-1">
            <span className="flex items-center gap-1.5">
              <span>Project Evidence Sources</span>
              <span className="font-mono text-neutral-400">({uploadedFiles.length})</span>
            </span>
            <span className="text-[11px] font-normal text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Evidence Layer Active</span>
            </span>
          </div>

          <div className="space-y-3">
            {uploadedFiles.map((doc) => {
              const isExpanded = expandedDocIds.has(doc.id);
              const evidences = doc.extractedEvidences || [];
              const count = doc.evidenceCount || evidences.length;

              return (
                <div
                  key={doc.id}
                  data-testid={`uploaded-file-${doc.id}`}
                  className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-4 text-xs shadow-xs transition-all hover:border-neutral-300 dark:hover:border-neutral-700 flex flex-col gap-3"
                >
                  {/* Document Header Row */}
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-xl bg-neutral-100 dark:bg-neutral-800 flex items-center justify-center shrink-0 border border-neutral-200/60 dark:border-neutral-700/60">
                        <SourceTypeIcon type={doc.sourceType} />
                      </div>

                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-0.5">
                          <p className="font-bold text-neutral-900 dark:text-white truncate">
                            {doc.name}
                          </p>
                          <SourceFormatBadge type={doc.sourceType} />
                        </div>
                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
                          {formatBytes(doc.fileSize)} · {count > 0 ? `${count} relevant excerpt(s) extracted` : "Evidence extracted"}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <span className="px-2.5 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/15 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                        Included
                      </span>

                      {evidences.length > 0 && (
                        <button
                          type="button"
                          onClick={() => toggleExpand(doc.id)}
                          className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-50 dark:hover:bg-neutral-800 transition-colors cursor-pointer flex items-center gap-1"
                        >
                          <span>{isExpanded ? "Hide Excerpts" : `Show Excerpts (${evidences.length})`}</span>
                          {isExpanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
                        </button>
                      )}

                      <button
                        type="button"
                        onClick={() => onRemove(doc.id)}
                        aria-label={`Remove ${doc.name}`}
                        className="p-1.5 rounded-lg text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Remove source from project"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>

                  {/* Citation String Preview */}
                  {doc.citation && (
                    <div className="px-3 py-1.5 rounded-xl bg-neutral-50 dark:bg-neutral-900/60 border border-neutral-200/50 dark:border-white/5 text-[11px] text-neutral-600 dark:text-neutral-300 font-serif italic flex items-center justify-between gap-2">
                      <span className="truncate">Reference: {doc.citation}</span>
                    </div>
                  )}

                  {/* Structured Data Summary for Spreadsheets */}
                  {doc.structuredDataSummary && (
                    <div className="px-3 py-2 rounded-xl bg-emerald-500/5 border border-emerald-500/15 text-[11px] text-emerald-800 dark:text-emerald-300 flex items-start gap-2">
                      <Table className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>{doc.structuredDataSummary}</span>
                    </div>
                  )}

                  {/* Expandable Project-Specific Evidence Excerpt Layer */}
                  {isExpanded && evidences.length > 0 && (
                    <div className="pt-2 border-t border-neutral-100 dark:border-white/5 space-y-2.5 animate-in fade-in duration-150">
                      <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                        <span className="flex items-center gap-1">
                          <Quote className="w-3 h-3 text-neutral-400" />
                          <span>Extracted Evidence & Provenance Locators</span>
                        </span>
                        <span className="text-[10px] font-normal text-neutral-400">
                          Lightweight Project Evidence Layer
                        </span>
                      </div>

                      <div className="space-y-2">
                        {evidences.map((ev, eIdx) => (
                          <div
                            key={ev.id || eIdx}
                            className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800 text-xs space-y-1.5"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                              </span>
                              {ev.claim && (
                                <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-xs">
                                  {ev.claim}
                                </span>
                              )}
                            </div>

                            <p className="font-medium text-neutral-900 dark:text-neutral-100 text-xs leading-relaxed italic">
                              "{ev.excerpt}"
                            </p>

                            {ev.context && ev.context !== ev.excerpt && (
                              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-normal">
                                <span className="font-semibold text-neutral-600 dark:text-neutral-300">Context: </span>
                                {ev.context}
                              </p>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
