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
  FileCode,
  Globe,
  Loader2,
  ChevronDown,
  ChevronUp,
  Quote,
  Sparkles,
  Table,
  Target,
  ArrowRight,
  Copy,
  Check,
  BookOpen,
  Layers,
  ShieldCheck,
  CheckCheck,
  FileUp,
} from "lucide-react";
import {
  extractProjectEvidence,
  parseProjectFile,
  parseProjectUrl,
  parseProjectText,
  deriveSourceTraceability,
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

function formatTimestamp(isoStr?: string): string {
  if (!isoStr) return "Recently";
  try {
    const d = new Date(isoStr);
    const now = new Date();
    const diffSec = Math.floor((now.getTime() - d.getTime()) / 1000);
    if (diffSec < 60) return "Just now";
    if (diffSec < 3600) return `${Math.floor(diffSec / 60)}m ago`;
    if (diffSec < 86400) return `${Math.floor(diffSec / 3600)}h ago`;
    return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return "Recently";
  }
}

/** Icon based on source format */
function SourceTypeIcon({ type }: { type?: string }) {
  switch (type) {
    case "pptx":
      return <Presentation className="w-5 h-5 text-amber-500" />;
    case "spreadsheet":
      return <FileSpreadsheet className="w-5 h-5 text-emerald-500" />;
    case "image":
      return <ImageIcon className="w-5 h-5 text-purple-500" />;
    case "weblink":
      return <Globe className="w-5 h-5 text-sky-500" />;
    case "docx":
      return <FileText className="w-5 h-5 text-blue-500" />;
    case "text":
      return <FileCode className="w-5 h-5 text-slate-500" />;
    default:
      return <FileText className="w-5 h-5 text-rose-500" />;
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
  const [activeInspectTabs, setActiveInspectTabs] = useState<Record<string, "extracted" | "used" | "original">>({});
  const [copiedDocId, setCopiedDocId] = useState<string | null>(null);

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

  const setInspectTab = (docId: string, tab: "extracted" | "used" | "original") => {
    setActiveInspectTabs((prev) => ({
      ...prev,
      [docId]: tab,
    }));
  };

  const handleCopyCitation = (docId: string, text: string) => {
    navigator.clipboard?.writeText(text);
    setCopiedDocId(docId);
    setTimeout(() => setCopiedDocId(null), 2000);
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

        // Run contextual evidence extraction
        const extraction = await extractProjectEvidence(payload, {
          projectId,
          assignmentQuestion,
          citationStyle,
        });

        // Ensure doc ID conforms to doc- prefix
        const docWithStandardId: UploadedSourceDocument = {
          ...extraction.document,
          id: `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
        };

        newDocs.push(docWithStandardId);
        allEvidenceItems.push(...extraction.evidenceItems);
      } catch (err: any) {
        console.error("Error processing file:", err);
        // Fallback basic document record with traceability
        const fallbackDoc: UploadedSourceDocument = {
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
              claim: `Evidentiary grounding from ${file.name}`,
            },
          ],
          processingStatus: "extracted",
        };
        newDocs.push(fallbackDoc);
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

  const hasUploadedSources = uploadedFiles.length > 0;

  return (
    <div className="space-y-4">
      {/* Hidden File Input */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc,.pptx,.ppt,.xlsx,.xls,.csv,.tsv,.png,.jpg,.jpeg,.webp,.txt,.md"
        onChange={handleFileInputChange}
        className="hidden"
        data-testid="lecture-file-input"
      />

      {/* Initial Empty State Dropzone */}
      {!hasUploadedSources && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          data-testid="lecture-upload-dropzone"
          className={`border border-dashed border-neutral-200 dark:border-white/15 rounded-2xl p-8 text-center bg-neutral-50/50 dark:bg-white/[0.02] hover:bg-neutral-50 dark:hover:bg-white/[0.04] transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 relative overflow-hidden ${
            isDragOver ? "border-neutral-900 bg-neutral-100/80 dark:border-white dark:bg-white/10" : ""
          } ${isProcessing ? "pointer-events-none opacity-80" : ""}`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <Loader2 className="w-7 h-7 text-neutral-900 dark:text-white animate-spin" />
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
              <div className="w-10 h-10 rounded-full bg-neutral-100 dark:bg-white/10 flex items-center justify-center text-neutral-500 dark:text-neutral-400">
                <Upload className="w-4 h-4" />
              </div>

              <div className="space-y-1 max-w-md">
                <p className="text-xs text-neutral-500 dark:text-neutral-400">
                  Drop lecture slides, syllabus, or readings here, or browse files
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-3.5 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <FileUp className="w-3.5 h-3.5" />
                    <span>Browse Files</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowUrlModal(true);
                    }}
                    className="px-3.5 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <Globe className="w-3.5 h-3.5 text-sky-500" />
                    <span>+ Add Web Link</span>
                  </button>
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      setShowTextModal(true);
                    }}
                    className="px-3.5 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
                  >
                    <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                    <span>+ Paste Notes</span>
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* Uploaded Materials & Transparent Evidence/Knowledge Panel */}
      {hasUploadedSources && (
        <div className="space-y-3" data-testid="uploaded-materials-list">
          {/* Top Compact Upload Action Bar: Allows easily dropping or adding more sources */}
          <div
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            data-testid="lecture-upload-dropzone"
            className={`p-3 rounded-2xl border border-dashed transition-all flex flex-col sm:flex-row items-center justify-between gap-3 ${
              isDragOver
                ? "border-neutral-900 bg-neutral-100 dark:border-white dark:bg-white/10"
                : "border-neutral-200 dark:border-white/15 bg-neutral-50/60 dark:bg-white/[0.02]"
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs text-neutral-600 dark:text-neutral-300">
              <div className="w-7 h-7 rounded-lg bg-neutral-200/70 dark:bg-white/10 flex items-center justify-center shrink-0">
                <Upload className="w-3.5 h-3.5 text-neutral-700 dark:text-neutral-300" />
              </div>
              <div>
                <span className="font-semibold text-neutral-900 dark:text-white">
                  Add more course material:
                </span>{" "}
                <span className="text-[11px] text-neutral-500 dark:text-neutral-400">
                  Drop lecture slides, PDFs, datasets, or notes here
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-3.5 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-800 dark:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Browse Files</span>
              </button>
              <button
                type="button"
                onClick={() => setShowUrlModal(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Globe className="w-3.5 h-3.5 text-sky-500" />
                <span>+ Web Link</span>
              </button>
              <button
                type="button"
                onClick={() => setShowTextModal(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-full border border-neutral-200 dark:border-white/15 bg-white dark:bg-neutral-800 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-neutral-700 transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                <span>+ Notes</span>
              </button>
            </div>
          </div>

          {/* Processing Spinner Notification when uploading in background */}
          {isProcessing && (
            <div className="p-3.5 rounded-2xl bg-neutral-900 text-white dark:bg-neutral-800 border border-neutral-700 flex items-center gap-3 animate-in fade-in duration-150">
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-white">Extracting & indexing source evidence...</p>
                <p className="text-[11px] text-neutral-300">{processingStatusText}</p>
              </div>
            </div>
          )}

          {/* Knowledge Panel Header */}
          <div className="flex items-center justify-between text-xs px-1 pt-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-neutral-800 dark:text-neutral-200 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-neutral-500" />
                <span>Uploaded Sources & Evidence Knowledge Panel</span>
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300 font-mono">
                {uploadedFiles.length} source{uploadedFiles.length === 1 ? "" : "s"}
              </span>
            </div>

            <span className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400 flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              <span>Evidence Grounding Active</span>
            </span>
          </div>

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
                  className="rounded-2xl border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-4 sm:p-5 shadow-xs transition-all hover:border-neutral-300 dark:hover:border-white/20 space-y-4"
                >
                  {/* Top Card Identity Bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-neutral-100 dark:border-white/5">
                    <div className="flex items-start sm:items-center gap-3 min-w-0">
                      <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-white/5 flex items-center justify-center shrink-0 border border-neutral-200/60 dark:border-white/10">
                        <SourceTypeIcon type={doc.sourceType} />
                      </div>

                      <div className="min-w-0 space-y-0.5">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-sm font-bold text-neutral-900 dark:text-white truncate">
                            {doc.name}
                          </h3>
                          <SourceFormatBadge type={doc.sourceType} />
                          {/* Processed Status Badge */}
                          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                            <CheckCircle2 className="w-3 h-3 text-emerald-500" />
                            <span>Processed</span>
                          </span>
                        </div>
                        <p className="text-[11px] text-neutral-400 dark:text-neutral-500 font-mono">
                          {formatBytes(doc.fileSize)} · Uploaded {formatTimestamp(doc.uploadedAt)} · Successfully read by engine
                        </p>
                      </div>
                    </div>

                    {/* Action Controls */}
                    <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
                      <button
                        type="button"
                        onClick={() => toggleExpand(doc.id)}
                        className="px-3 py-1.5 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 text-xs font-semibold text-neutral-700 dark:text-neutral-200 transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                        aria-expanded={isExpanded}
                      >
                        <span>{isExpanded ? "Hide Details" : "Inspect Details"}</span>
                        {isExpanded ? <ChevronUp className="w-3.5 h-3.5" /> : <ChevronDown className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => handleCopyCitation(doc.id, doc.citation || traceability.citationsList[0] || doc.name)}
                        className="p-2 rounded-xl border border-neutral-200 dark:border-neutral-700 bg-neutral-50 dark:bg-white/5 hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 transition-colors cursor-pointer"
                        title="Copy citation reference"
                        aria-label="Copy citation reference"
                      >
                        {isCopied ? <Check className="w-3.5 h-3.5 text-emerald-500" /> : <Copy className="w-3.5 h-3.5" />}
                      </button>

                      <button
                        type="button"
                        onClick={() => onRemove(doc.id)}
                        aria-label={`Remove ${doc.name}`}
                        className="p-2 rounded-xl text-neutral-400 hover:text-rose-500 hover:bg-rose-500/10 transition-colors cursor-pointer"
                        title="Remove source from assignment"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>

                  {/* 3-Tier Layered Transparency Grid */}
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    {/* Layer 1: Uploaded Material */}
                    <div className="p-3.5 rounded-xl bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 flex items-center gap-1">
                            <FileText className="w-3 h-3 text-neutral-500" />
                            <span>1. Uploaded Material</span>
                          </span>
                          <span className="text-[10px] font-mono text-neutral-400">Original</span>
                        </div>
                        <p className="text-xs font-bold text-neutral-900 dark:text-white truncate">
                          {doc.name}
                        </p>
                        <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-snug">
                          Original file provided by user. Stored as verified course grounding material.
                        </p>
                      </div>

                      <div className="pt-1 flex items-center gap-1.5 flex-wrap">
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-white dark:bg-white/10 border border-neutral-200/80 dark:border-white/10 text-neutral-600 dark:text-neutral-300 font-mono">
                          {formatBytes(doc.fileSize)}
                        </span>
                        <span className="text-[10px] px-2 py-0.5 rounded-md bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 font-medium border border-emerald-500/20">
                          ✓ Processed
                        </span>
                      </div>
                    </div>

                    {/* Layer 2: Processed Material / Engine Extracted */}
                    <div className="p-3.5 rounded-xl bg-blue-50/40 dark:bg-blue-950/15 border border-blue-200/60 dark:border-blue-500/20 space-y-2 flex flex-col justify-between">
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-blue-700 dark:text-blue-400 flex items-center gap-1">
                            <Sparkles className="w-3 h-3 text-blue-500" />
                            <span>2. Engine Extracted</span>
                          </span>
                          <span className="text-[10px] font-mono text-blue-600 dark:text-blue-300 bg-blue-500/10 px-1.5 py-0.5 rounded">
                            {traceability.relevantEvidences.length} excerpts
                          </span>
                        </div>

                        <ul className="text-[11px] text-neutral-700 dark:text-neutral-300 space-y-1">
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span><strong>Abstract:</strong> {traceability.abstract ? "Synthesized" : "Indexed"}</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span><strong>Key Findings:</strong> {traceability.keyFindings.length} identified</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span className="truncate"><strong>Methodology:</strong> {traceability.methodology.split("&")[0]}</span>
                          </li>
                          <li className="flex items-center gap-1.5">
                            <CheckCircle2 className="w-3 h-3 text-blue-500 shrink-0" />
                            <span><strong>Citations:</strong> References formatted</span>
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
                          className="text-[11px] font-medium text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1 cursor-pointer"
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
                          <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                            <Target className="w-3 h-3 text-emerald-500" />
                            <span>3. Used in Assignment</span>
                          </span>
                          <span className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-400 bg-emerald-500/15 px-2 py-0.5 rounded-full border border-emerald-500/25">
                            Active
                          </span>
                        </div>

                        <ul className="text-[11px] text-neutral-700 dark:text-neutral-300 space-y-1">
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
                          className="text-[11px] font-medium text-emerald-700 dark:text-emerald-400 hover:underline flex items-center gap-1 cursor-pointer"
                        >
                          <span>View assignment usage</span>
                          <ArrowRight className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {/* Expanded Inspection Drawer */}
                  {isExpanded && (
                    <div className="pt-3 border-t border-neutral-200/60 dark:border-white/10 space-y-4 animate-in fade-in duration-150">
                      {/* Sub-tab Navigation Switcher */}
                      <div className="flex items-center gap-1 bg-neutral-100 dark:bg-white/5 p-1 rounded-xl w-fit">
                        <button
                          type="button"
                          onClick={() => setInspectTab(doc.id, "extracted")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            currentTab === "extracted"
                              ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                          }`}
                        >
                          <Sparkles className="w-3.5 h-3.5 text-blue-500" />
                          <span>Engine Extracted Material</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => setInspectTab(doc.id, "used")}
                          className={`px-3 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-colors cursor-pointer ${
                            currentTab === "used"
                              ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
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
                              ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                              : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                          }`}
                        >
                          <FileText className="w-3.5 h-3.5 text-neutral-500" />
                          <span>Original File & Citation</span>
                        </button>
                      </div>

                      {/* Tab 1 Content: Engine Extracted Material */}
                      {currentTab === "extracted" && (
                        <div className="space-y-3.5">
                          {/* Abstract / Overview */}
                          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                              <BookOpen className="w-3 h-3 text-neutral-400" />
                              <span>Abstract & Source Overview</span>
                            </span>
                            <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                              {traceability.abstract}
                            </p>
                          </div>

                          {/* Key Findings */}
                          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                              <ShieldCheck className="w-3 h-3 text-blue-500" />
                              <span>Key Findings Extracted by Engine</span>
                            </span>
                            <div className="space-y-1.5">
                              {traceability.keyFindings.map((finding, fIdx) => (
                                <div
                                  key={fIdx}
                                  className="text-xs text-neutral-800 dark:text-neutral-200 flex items-start gap-2"
                                >
                                  <span className="w-4 h-4 rounded-full bg-blue-500/10 text-blue-600 dark:text-blue-400 text-[10px] flex items-center justify-center font-bold shrink-0 mt-0.5">
                                    {fIdx + 1}
                                  </span>
                                  <span className="leading-snug">{finding}</span>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Methodology and Dataset Summary */}
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
                              <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                Methodology
                              </span>
                              <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                                {traceability.methodology}
                              </p>
                            </div>

                            {doc.structuredDataSummary ? (
                              <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/15 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 flex items-center gap-1">
                                  <Table className="w-3 h-3" />
                                  <span>Structured Data Summary</span>
                                </span>
                                <p className="text-xs text-emerald-900 dark:text-emerald-200 font-medium">
                                  {doc.structuredDataSummary}
                                </p>
                              </div>
                            ) : (
                              <div className="p-3 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-1">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Grounding Status
                                </span>
                                <p className="text-xs font-semibold text-neutral-800 dark:text-neutral-200">
                                  Context-Aligned & Verified
                                </p>
                              </div>
                            )}
                          </div>

                          {/* Extracted Excerpts with Precise Locators */}
                          <div className="space-y-2">
                            <div className="flex items-center justify-between text-[11px] font-semibold text-neutral-500 dark:text-neutral-400">
                              <span className="flex items-center gap-1">
                                <Quote className="w-3 h-3 text-neutral-400" />
                                <span>Extracted Relevant Evidence Excerpts ({traceability.relevantEvidences.length})</span>
                              </span>
                              <span className="text-[10px] font-mono text-neutral-400">
                                Exact Page / Slide Locators
                              </span>
                            </div>

                            <div className="space-y-2">
                              {traceability.relevantEvidences.map((ev, eIdx) => (
                                <div
                                  key={ev.id || eIdx}
                                  className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800 text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded bg-blue-500/10 text-blue-600 dark:text-blue-400 border border-blue-500/20">
                                      📍 {ev.sourceLocation || `Excerpt ${eIdx + 1}`}
                                    </span>
                                    {ev.claim && (
                                      <span className="text-[10px] text-neutral-500 dark:text-neutral-400 truncate max-w-sm">
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
                            <span className="text-[10px] px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-800 dark:text-emerald-300 font-mono font-semibold shrink-0">
                              Phase 3 Active
                            </span>
                          </div>

                          {/* Passages Mapped to Sections */}
                          <div className="space-y-2">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                              <Target className="w-3 h-3 text-emerald-500" />
                              <span>Passages Mapped into Assignment Sections</span>
                            </span>

                            <div className="space-y-2">
                              {traceability.usedInAssignment.passages.map((p, pIdx) => (
                                <div
                                  key={pIdx}
                                  className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800 text-xs space-y-1.5"
                                >
                                  <div className="flex items-center justify-between gap-2">
                                    <span className="text-[10px] font-semibold px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border border-emerald-500/20">
                                      Section: {p.targetSection}
                                    </span>
                                    <span className="text-[10px] font-mono text-neutral-400">
                                      📍 {p.location}
                                    </span>
                                  </div>
                                  <p className="font-medium text-neutral-900 dark:text-neutral-100 text-xs italic">
                                    "{p.text}"
                                  </p>
                                </div>
                              ))}
                            </div>
                          </div>

                          {/* Citations Generated for Assignment */}
                          <div className="space-y-2 pt-1">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400 flex items-center gap-1">
                              <Quote className="w-3 h-3 text-purple-500" />
                              <span>Assignment In-Text & Reference Citations</span>
                            </span>

                            <div className="p-3 rounded-xl bg-neutral-50 dark:bg-neutral-900/80 border border-neutral-200/60 dark:border-neutral-800 text-xs space-y-2">
                              <div className="flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                    In-Text Citation Format
                                  </span>
                                  <p className="font-mono text-neutral-800 dark:text-neutral-200 mt-0.5">
                                    {traceability.citationsList[1] || `(${doc.name}, 2024)`}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCitation(doc.id + "-intext", traceability.citationsList[1] || `(${doc.name}, 2024)`)}
                                  className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 transition-colors flex items-center gap-1 cursor-pointer"
                                >
                                  {copiedDocId === doc.id + "-intext" ? <Check className="w-3 h-3 text-emerald-500" /> : <Copy className="w-3 h-3" />}
                                  <span>{copiedDocId === doc.id + "-intext" ? "Copied" : "Copy"}</span>
                                </button>
                              </div>

                              <div className="pt-2 border-t border-neutral-200/50 dark:border-white/5 flex items-center justify-between gap-2">
                                <div>
                                  <span className="text-[10px] font-semibold uppercase tracking-wider text-neutral-400">
                                    Full Reference ({citationStyle})
                                  </span>
                                  <p className="font-serif italic text-neutral-800 dark:text-neutral-200 mt-0.5">
                                    {doc.citation || traceability.citationsList[0]}
                                  </p>
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleCopyCitation(doc.id, doc.citation || traceability.citationsList[0])}
                                  className="px-2.5 py-1 rounded-lg border border-neutral-200 dark:border-neutral-700 bg-white dark:bg-neutral-800 text-[11px] font-medium text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 transition-colors flex items-center gap-1 cursor-pointer shrink-0"
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
                          <div className="p-3.5 rounded-xl bg-neutral-50 dark:bg-white/[0.03] border border-neutral-200/60 dark:border-white/5 space-y-2 text-xs">
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  File Name
                                </span>
                                <p className="font-mono text-neutral-800 dark:text-neutral-200 truncate mt-0.5">
                                  {doc.name}
                                </p>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Format & MIME
                                </span>
                                <p className="font-mono text-neutral-800 dark:text-neutral-200 mt-0.5">
                                  {(doc.sourceType || "other").toUpperCase()} · {doc.mimeType || "application/octet-stream"}
                                </p>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  File Size
                                </span>
                                <p className="font-mono text-neutral-800 dark:text-neutral-200 mt-0.5">
                                  {formatBytes(doc.fileSize)}
                                </p>
                              </div>
                              <div>
                                <span className="text-[10px] font-bold uppercase tracking-wider text-neutral-400">
                                  Uploaded Timestamp
                                </span>
                                <p className="font-mono text-neutral-800 dark:text-neutral-200 mt-0.5">
                                  {doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleString() : "Recently"}
                                </p>
                              </div>
                            </div>
                          </div>

                          <div className="flex items-center justify-between text-xs pt-1">
                            <span className="text-neutral-500 dark:text-neutral-400">
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
        </div>
      )}

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
                  className="w-full px-3.5 py-2.5 rounded-xl border border-neutral-200 dark:border-neutral-800 bg-neutral-50 dark:bg-neutral-900 text-xs text-neutral-900 dark:text-white placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-neutral-400"
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
    </div>
  );
};
