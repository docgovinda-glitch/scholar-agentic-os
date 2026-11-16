import { errorText } from "../../../shared/errorText";
import React,{ useState,useRef } from "react";
import type { UploadedSourceDocument,EvidenceItem } from "../types";
import {
Upload,FileCode,
Globe,
Loader2,Layers,FileUp
} from "lucide-react";
import {
extractProjectEvidence,
parseProjectFile,
parseProjectUrl,type ParsedSourcePayload
} from "../services/sourceEvidenceExtractionService";
import { UploadPasteTextModal } from "./uploads/UploadPasteTextModal";
import { UploadWebLinkModal } from "./uploads/UploadWebLinkModal";
import { UploadedSourcesList } from "./uploads/UploadedSourcesList";

/** The server's upload ceiling (MAX_UPLOAD_MB, at most 10). */
const SOURCE_MAX_UPLOAD_MB = 10;

export interface LectureUploadDropzoneProps {
  uploadedFiles: UploadedSourceDocument[];
  onUpload: (documents: UploadedSourceDocument[], newEvidences?: EvidenceItem[]) => void | Promise<void>;
  onRemove: (documentId: string) => void | Promise<void>;
  assignmentQuestion?: string;
  citationStyle?: string;
  projectId?: string;
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
  const [uploadProblems, setUploadProblems] = useState<string[]>([]);
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

    const problems: string[] = [];
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      // Refuse what cannot be read, with a reason; never save a placeholder as if it were read.
      if (file.size === 0) {
        problems.push(`${file.name}: the file is empty.`);
        continue;
      }
      if (file.size > SOURCE_MAX_UPLOAD_MB * 1024 * 1024) {
        problems.push(`${file.name}: ${(file.size / (1024 * 1024)).toFixed(1)} MB is over the ${SOURCE_MAX_UPLOAD_MB} MB limit.`);
        continue;
      }
      setProcessingStatusText(`Extracting relevant evidence from "${file.name}"...`);

      try {
        let payload: ParsedSourcePayload;
        try {
          payload = await parseProjectFile(projectId, file);
        } catch (parseErr) {
          // Only plain-text files can be read in the browser when the server cannot;
          // binary formats (PDF, Word, slides) are never decoded as text.
          const ext = file.name.split(".").pop()?.toLowerCase() || "";
          if (!["txt", "md", "csv", "tsv"].includes(ext)) throw parseErr;
          payload = {
            title: file.name.replace(/\.[^/.]+$/, "").replace(/[_-]/g, " "),
            sourceType: ["csv", "tsv"].includes(ext) ? "spreadsheet" : "text",
            text: await file.text(),
            fileSize: file.size,
          };
        }
        if (!payload.text || !payload.text.trim()) {
          problems.push(`${file.name}: no readable text was found (a scanned image needs to be pasted as text).`);
          continue;
        }

        const extraction = await extractProjectEvidence(payload, {
          projectId,
          assignmentQuestion,
          citationStyle,
        });

        newDocs.push({
          ...extraction.document,
          id: `doc-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
        });
        allEvidenceItems.push(...extraction.evidenceItems);
      } catch (err) {
        console.error("Error processing file:", err);
        problems.push(`${file.name}: ${err instanceof Error && err.message ? err.message : "could not be read"}`);
      }
    }
    setUploadProblems(problems);

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
    } catch (err: unknown) {
      setModalError(errorText(err) || "Failed to parse URL");
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
    } catch (err: unknown) {
      setModalError(errorText(err) || "Failed to parse text");
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

      {uploadProblems.length > 0 && (
        <div
          role="alert"
          data-testid="source-upload-problems"
          className="flex items-start justify-between gap-3 rounded-xl border border-[color:var(--state-danger)]/30 bg-[color:var(--state-danger-subtle)] p-3 text-xs text-[color:var(--state-danger)]"
        >
          <ul className="space-y-1">
            {uploadProblems.map((p) => (
              <li key={p}>Not added: {p}</li>
            ))}
          </ul>
          <button type="button" onClick={() => setUploadProblems([])} className="shrink-0 font-semibold underline cursor-pointer">
            Dismiss
          </button>
        </div>
      )}

      {/* Initial Empty State Dropzone */}
      {!hasUploadedSources && (
        <div
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
          onClick={() => !isProcessing && fileInputRef.current?.click()}
          data-testid="lecture-upload-dropzone"
          className={`border border-dashed border-[color:var(--border-subtle)] rounded-2xl p-8 text-center bg-[color:var(--surface-inset)]/50 hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer flex flex-col items-center justify-center gap-3 relative overflow-hidden ${
            isDragOver ? "border-neutral-900 bg-[color:var(--surface-inset)]/80 dark:border-white" : ""
          } ${isProcessing ? "pointer-events-none opacity-80" : ""}`}
        >
          {isProcessing ? (
            <div className="flex flex-col items-center gap-3 py-2">
              <Loader2 className="w-7 h-7 text-[color:var(--text-primary)] animate-spin" />
              <div className="space-y-1">
                <p className="text-xs font-semibold text-[color:var(--text-primary)]">
                  Context-Aware Evidence Extraction in Progress
                </p>
                <p className="text-xs text-[color:var(--text-muted)]">
                  {processingStatusText || "Analyzing source contents against your assignment requirements..."}
                </p>
              </div>
            </div>
          ) : (
            <>
              <div className="w-10 h-10 rounded-full bg-[color:var(--surface-inset)] flex items-center justify-center text-[color:var(--text-muted)]">
                <Upload className="w-4 h-4" />
              </div>

              <div className="space-y-1 max-w-md">
                <p className="text-xs text-[color:var(--text-muted)]">
                  Drop lecture slides, syllabus, or readings here, or browse files
                </p>
                <div className="flex items-center gap-2 pt-1 flex-wrap justify-center">
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      fileInputRef.current?.click();
                    }}
                    className="px-3.5 py-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
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
                    className="px-3.5 py-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
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
                    className="px-3.5 py-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5"
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
                ? "border-neutral-900 bg-[color:var(--surface-inset)] dark:border-white"
                : "border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]/60"
            }`}
          >
            <div className="flex items-center gap-2.5 text-xs text-[color:var(--text-secondary)]">
              <div className="w-7 h-7 rounded-lg bg-[color:var(--surface-sunken)]/70 flex items-center justify-center shrink-0">
                <Upload className="w-3.5 h-3.5 text-[color:var(--text-secondary)]" />
              </div>
              <div>
                <span className="font-semibold text-[color:var(--text-primary)]">
                  Add more course material:
                </span>{" "}
                <span className="text-xs text-[color:var(--text-muted)]">
                  Drop lecture slides, PDFs, datasets, or notes here
                </span>
              </div>
            </div>

            <div className="flex items-center gap-2 shrink-0 flex-wrap">
              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                disabled={isProcessing}
                className="px-3.5 py-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs font-semibold text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileUp className="w-3.5 h-3.5" />
                <span>Browse Files</span>
              </button>
              <button
                type="button"
                onClick={() => setShowUrlModal(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <Globe className="w-3.5 h-3.5 text-sky-500" />
                <span>+ Web Link</span>
              </button>
              <button
                type="button"
                onClick={() => setShowTextModal(true)}
                disabled={isProcessing}
                className="px-3 py-1.5 rounded-full border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors shadow-2xs cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
              >
                <FileCode className="w-3.5 h-3.5 text-emerald-500" />
                <span>+ Notes</span>
              </button>
            </div>
          </div>

          {/* Processing Spinner Notification when uploading in background */}
          {isProcessing && (
            <div className="p-3.5 rounded-2xl bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] border border-neutral-700 flex items-center gap-3 animate-in fade-in duration-150">
              <Loader2 className="w-4 h-4 text-emerald-400 animate-spin shrink-0" />
              <div className="text-xs space-y-0.5">
                <p className="font-semibold text-white">Extracting & indexing source evidence...</p>
                <p className="text-xs text-neutral-300">{processingStatusText}</p>
              </div>
            </div>
          )}

          {/* Knowledge Panel Header */}
          <div className="flex items-center justify-between text-xs px-1 pt-1">
            <div className="flex items-center gap-2">
              <span className="font-bold text-[color:var(--text-primary)] uppercase tracking-wider text-xs flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-[color:var(--text-muted)]" />
                <span>Your uploaded materials</span>
              </span>
              <span className="text-xs px-2 py-0.5 rounded-full bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] font-mono">
                {uploadedFiles.length} source{uploadedFiles.length === 1 ? "" : "s"}
              </span>
            </div>

            <span className="text-xs text-[color:var(--text-muted)]">Used as evidence when you draft</span>
          </div>

          <UploadedSourcesList activeInspectTabs={activeInspectTabs} assignmentQuestion={assignmentQuestion} citationStyle={citationStyle} copiedDocId={copiedDocId} expandedDocIds={expandedDocIds} handleCopyCitation={handleCopyCitation} onRemove={onRemove} setInspectTab={setInspectTab} toggleExpand={toggleExpand} uploadedFiles={uploadedFiles} />
        </div>
      )}

      <UploadWebLinkModal handleUrlSubmit={handleUrlSubmit} isProcessing={isProcessing} modalError={modalError} setShowUrlModal={setShowUrlModal} setUrlInput={setUrlInput} showUrlModal={showUrlModal} urlInput={urlInput} />

      <UploadPasteTextModal handleTextSubmit={handleTextSubmit} isProcessing={isProcessing} modalError={modalError} pastedTextContent={pastedTextContent} pastedTextTitle={pastedTextTitle} setPastedTextContent={setPastedTextContent} setPastedTextTitle={setPastedTextTitle} setShowTextModal={setShowTextModal} showTextModal={showTextModal} />
    </div>
  );
};
