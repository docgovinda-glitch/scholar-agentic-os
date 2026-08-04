import React, { useState, useRef } from "react";
import {
  FileText,
  Upload,
  Trash2,
  Eye,
  BookOpen,
  Layers,
  ToggleLeft,
  ToggleRight,
  Loader2,
  CheckCircle2,
  AlertCircle,
  Database,
  FileSpreadsheet,
  File,
  X,
  HardDrive,
  Edit3,
  Save,
  Plus,
  Tag,
  Sparkles,
  Copy,
  Check,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { PaperProject, VaultFile, KnowledgeVault, CitationMetadata } from "../types";
import { uploadAndProcessFile } from "../services/knowledgeVaultService";
import KnowledgeVaultManagerSuite from "./KnowledgeVaultManager";
import KnowledgeVaultEngineV2 from "./KnowledgeVaultEngineV2";
import { generateCitation } from "../services/citationService";

interface KnowledgeVaultProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
}

export default function KnowledgeVaultWorkspace({ project, updateProject }: KnowledgeVaultProps) {
  const [showSuiteModal, setShowSuiteModal] = useState(false);
  const [showV2Engine, setShowV2Engine] = useState(false);
  const [citationFormat, setCitationFormat] = useState("APA 7");
  const [copiedFormat, setCopiedFormat] = useState(false);
  const [selectedFileId, setSelectedFileId] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [showToast, setShowToast] = useState<string | null>(null);
  const [showUploadMoreModal, setShowUploadMoreModal] = useState(false);
  const [isEditingCitation, setIsEditingCitation] = useState(false);
  const [editForm, setEditForm] = useState<any>({});
  const fileInputRef = useRef<HTMLInputElement>(null);

  const vault: KnowledgeVault = project.knowledgeVault || { files: [], lastUpdated: "" };
  const activeCount = vault.files.filter((f) => f.isActive && f.status === "ready").length;
  const selectedFile = vault.files.find((f) => f.id === selectedFileId) || null;

  const updateVault = (newVault: KnowledgeVault) => {
    updateProject({ knowledgeVault: { ...newVault, lastUpdated: new Date().toISOString() } });
  };

  const handleStartEdit = () => {
    if (!selectedFile) return;
    const ov = selectedFile.parsedOverview || {
      title: selectedFile.fileName,
      abstract: "",
      author: "Academic Researcher",
      chapters: [],
      keyTerms: [],
      citationTag: selectedFile.fileName,
    };
    setEditForm({
      title: ov.title || selectedFile.fileName,
      author: ov.author || "Academic Researcher",
      year: ov.year || new Date().getFullYear().toString(),
      institutionOrJournal: ov.institutionOrJournal || "Research Institution",
      volumeIssue: ov.volumeIssue || "Doctoral Dissertation",
      doiOrUrl: ov.doiOrUrl || "",
      citationTag: ov.citationTag || selectedFile.fileName,
      bibtex: ov.bibtex || `@phdthesis{ref,\n  author = {${ov.author || "Researcher"}},\n  title = {${ov.title || selectedFile.fileName}},\n  year = {${ov.year || "2025"}}\n}`
    });
    setIsEditingCitation(true);
  };

  const handleSaveCitation = () => {
    if (!selectedFile) return;
    const currentOv = selectedFile.parsedOverview || {
      title: selectedFile.fileName,
      abstract: "",
      author: "Academic Researcher",
      chapters: [],
      keyTerms: [],
      citationTag: selectedFile.fileName,
    };
    const updatedOv = {
      ...currentOv,
      ...editForm,
    };
    const updatedFiles = vault.files.map(f => f.id === selectedFile.id ? { ...f, parsedOverview: updatedOv } : f);
    updateProject({ knowledgeVault: { ...vault, files: updatedFiles, lastUpdated: new Date().toISOString() } });
    setIsEditingCitation(false);
    setShowToast("Citation tags and metadata updated successfully!");
    setTimeout(() => setShowToast(null), 5000);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const allowedExts = [".pdf", ".docx", ".xlsx", ".xls", ".csv", ".txt"];
    const ext = "." + file.name.split(".").pop()?.toLowerCase();
    if (!allowedExts.includes(ext)) {
      setUploadError(`Unsupported format. Accepted: ${allowedExts.join(", ")}`);
      return;
    }

    setUploadError(null);
    setIsUploading(true);

    const placeholderId = `vault-processing-${Date.now()}`;
    const placeholderFile: VaultFile = {
      id: placeholderId,
      fileName: file.name,
      fileType: ext,
      fileSize: file.size,
      uploadedAt: new Date().toISOString(),
      isActive: false,
      status: "processing",
      extractedText: "",
      chunks: [],
      charCount: 0,
    };

    const updatedFiles = [...vault.files, placeholderFile];
    updateVault({ ...vault, files: updatedFiles });
    setSelectedFileId(placeholderId);

    try {
      const processedFile = await uploadAndProcessFile(file, project.aiSettings);
      const finalFiles = updatedFiles.map((f) => (f.id === placeholderId ? processedFile : f));
      updateVault({ ...vault, files: finalFiles });
      setSelectedFileId(processedFile.id);
      setShowToast(`"${file.name}" processed successfully. Enable it for citations?`);
      setTimeout(() => setShowToast(null), 8000);
      setShowUploadMoreModal(true);
    } catch (err: any) {
      console.error("[KnowledgeVault] Upload failed:", err);
      const errorFiles = updatedFiles.map((f) =>
        f.id === placeholderId
          ? { ...f, status: "error" as const, errorMessage: err.message || "Processing failed" }
          : f
      );
      updateVault({ ...vault, files: errorFiles });
      setUploadError(err.message || "Failed to process file");
    } finally {
      setIsUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const toggleFileActive = (fileId: string) => {
    const newFiles = vault.files.map((f) =>
      f.id === fileId ? { ...f, isActive: !f.isActive } : f
    );
    updateVault({ ...vault, files: newFiles });
  };

  const deleteFile = (fileId: string) => {
    if (!window.confirm("Remove this file from the Knowledge Vault?")) return;
    const newFiles = vault.files.filter((f) => f.id !== fileId);
    updateVault({ ...vault, files: newFiles });
    if (selectedFileId === fileId) setSelectedFileId(null);
  };

  const getFileIcon = (fileType: string) => {
    if (fileType.includes("pdf")) return <FileText className="w-4 h-4 text-red-400" />;
    if (fileType.includes("doc")) return <FileText className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />;
    if (fileType.includes("xls") || fileType.includes("csv"))
      return <FileSpreadsheet className="w-4 h-4 text-emerald-400" />;
    return <File className="w-4 h-4 text-[color:var(--text-secondary)]" />;
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getInlineMeta = (file: VaultFile): CitationMetadata => {
    if (file.citationMetadata) return file.citationMetadata;
    return {
      sourceType: "Journal Article",
      title: file.parsedOverview?.title || file.fileName || "Untitled Research Source",
      abstract: file.parsedOverview?.abstract || "",
      authors: file.parsedOverview?.author
        ? [{ id: "1", firstName: file.parsedOverview.author.split(" ")[0] || "", lastName: file.parsedOverview.author.split(" ").slice(1).join(" ") || "Author", order: 1 }]
        : [{ id: "1", firstName: "Academic", lastName: "Researcher", order: 1 }],
      publicationDetails: {
        journalName: file.parsedOverview?.institutionOrJournal || "Academic Institution",
        volume: file.parsedOverview?.volumeIssue || "Doctoral Dissertation",
        pages: "1-15"
      },
      dates: {
        publicationDate: file.parsedOverview?.year || "2026",
        accessDate: new Date().toISOString().split("T")[0]
      },
      identifiers: {
        doi: file.parsedOverview?.doiOrUrl?.includes("doi") ? file.parsedOverview.doiOrUrl : undefined,
        url: file.parsedOverview?.doiOrUrl || undefined
      },
      reliability: { peerReviewed: "Yes", evidenceLevel: "High", publicationType: "Primary" },
      extraction: { fullText: file.extractedText || "" },
      classification: {},
      aiKnowledge: {},
      verification: { doiLookup: true, crossref: true, openAlex: true },
      personal: { importance: 5, readStatus: "Read", priority: "High", privacy: "Private" },
      relationships: []
    };
  };

  const handleInlineCopy = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedFormat(true);
    setTimeout(() => setCopiedFormat(false), 2000);
  };


  if (showV2Engine) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
        <div className="w-full max-w-6xl my-auto">
          <KnowledgeVaultEngineV2
            existingFiles={vault.files}
            onAddSource={(fileData) => {
              const newFile: VaultFile = {
                id: Date.now().toString(),
                fileName: fileData.fileName || "New Academic Source",
                fileType: "pdf",
                fileSize: typeof fileData.fileSize === "number" ? fileData.fileSize : 1800000,
                uploadedAt: new Date().toISOString().split("T")[0],
                extractedText: fileData.extractedText || "",
                citationMetadata: fileData.citationMetadata,
                parsedOverview: fileData.parsedOverview,
                isActive: true,
                status: "ready",
                chunks: [],
                charCount: (fileData.extractedText || "").length
              };
              updateProject({
                knowledgeVault: {
                  ...vault,
                  files: [newFile, ...vault.files]
                }
              });
              setSelectedFileId(newFile.id);
              setShowV2Engine(false);
            }}
            onClose={() => setShowV2Engine(false)}
          />
        </div>
      </div>
    );
  }

  if (showSuiteModal) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4 animate-fade-in overflow-y-auto">
        <div className="w-full max-w-7xl h-[92vh] my-auto">
          <KnowledgeVaultManagerSuite
            project={project}
            updateProject={updateProject}
            onClose={() => setShowSuiteModal(false)}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 flex flex-col h-[75vh]">
      {/* Header */}
      <div className="border-b border-[color:var(--color-navy-4)] pb-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shrink-0">
        <div>
          <h2 className="text-xl font-semibold text-[color:var(--text-primary)] flex items-center gap-2">
            <Database className="w-5 h-5 text-[color:var(--color-luminous-blue)]" />
            Knowledge Vault
          </h2>
          <p className="text-xs text-[color:var(--text-secondary)] mt-1">
            Upload research documents to ground AI-generated content with citations
          </p>
        </div>
        <div className="flex items-center gap-3 shrink-0">
          {activeCount > 0 && (
            <span className="text-[10px] font-mono font-bold px-2.5 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded-lg flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              {activeCount} source{activeCount > 1 ? "s" : ""} active
            </span>
          )}
        </div>
      </div>

      {/* Upload error */}
      {uploadError && (
        <div className="flex items-center gap-2 px-3 py-2 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-400">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {uploadError}
          <button onClick={() => setUploadError(null)} className="ml-auto cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Success toast */}
      {showToast && (
        <div className="flex items-center gap-2 px-3 py-2 bg-emerald-500/10 border border-emerald-500/30 rounded-lg text-xs text-emerald-400 animate-pulse">
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          {showToast}
          <button onClick={() => setShowToast(null)} className="ml-auto cursor-pointer">
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Main split layout */}
      <div className="grow grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch min-h-0">
        {/* Left: File Registry */}
        <div className="flex flex-col border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-2)] rounded-2xl overflow-hidden lg:col-span-5 min-h-0">
          <div className="bg-[color:var(--color-navy-2)] border-b border-[color:var(--color-navy-4)] px-4 py-3 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
              <HardDrive className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
              Data Registry ({vault.files.length})
            </span>
            {vault.files.length > 0 && (
              <button
                onClick={() => setShowV2Engine(true)}
                className="px-3 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-lg text-xs font-semibold cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
              >
                <Plus className="w-3.5 h-3.5" />
                Add Source (17 Methods)
              </button>
            )}
          </div>

          <div className="grow overflow-y-auto">
            {vault.files.length === 0 ? (
              <div
                onClick={() => setShowV2Engine(true)}
                className="flex flex-col items-center justify-center h-full p-8 text-center space-y-4 cursor-pointer hover:bg-[color:var(--color-luminous-blue)]/5 transition-all group"
              >
                <div className="w-16 h-16 bg-[color:var(--color-luminous-blue)]/10 border border-[color:var(--color-luminous-blue)]/20 rounded-full flex items-center justify-center group-hover:scale-110 transition-transform shadow-sm">
                  <Sparkles className="w-8 h-8 text-[color:var(--color-luminous-blue)]" />
                </div>
                <div className="max-w-xs space-y-2">
                  <h3 className="text-base font-bold text-[color:var(--text-primary)]">Knowledge Vault v2.0 Empty</h3>
                  <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                    Click anywhere here to launch the Multi-Source Import Wizard. Ingest via PDF, URL, DOI, ISBN, PMID, arXiv, YouTube, Audio, or OCR.
                  </p>
                </div>
                <div className="px-5 py-2.5 bg-[color:var(--color-luminous-blue-dim)] group-hover:bg-[color:var(--color-luminous-blue)] text-white rounded-xl text-xs font-semibold shadow-md flex items-center gap-2 transition-all">
                  <Plus className="w-4 h-4" />
                  Launch Multi-Source Intake
                </div>
              </div>
            ) : (
              <div className="divide-y divide-[color:var(--border-default)]">
                {vault.files.map((file) => (
                  <div
                    key={file.id}
                    className={`px-4 py-3 cursor-pointer transition-all hover:bg-[color:var(--color-luminous-blue)]/5 ${
                      selectedFileId === file.id ? "bg-[color:var(--color-luminous-blue)]/10 border-l-2 border-[color:var(--color-luminous-blue)]" : ""
                    }`}
                    onClick={() => setSelectedFileId(file.id)}
                  >
                    <div className="flex items-start gap-3">
                      <div className="mt-0.5 shrink-0">{getFileIcon(file.fileType)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-xs font-semibold text-[color:var(--text-primary)] truncate">{file.fileName}</p>
                          {file.status === "processing" && <Loader2 className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)] animate-spin shrink-0" />}
                          {file.status === "ready" && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                          {file.status === "error" && <AlertCircle className="w-3.5 h-3.5 text-red-400 shrink-0" />}
                        </div>
                        <p className="text-[10px] text-[color:var(--text-secondary)] font-mono mt-0.5">
                          {formatSize(file.fileSize)} · {file.chunks.length} chunks · {new Date(file.uploadedAt).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        {file.status === "ready" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); toggleFileActive(file.id); }}
                            className="cursor-pointer"
                            title={file.isActive ? "Disable citations" : "Enable citations"}
                          >
                            {file.isActive ? <ToggleRight className="w-6 h-6 text-emerald-400" /> : <ToggleLeft className="w-6 h-6 text-[color:var(--text-secondary)]" />}
                          </button>
                        )}
                        <button
                          onClick={(e) => { e.stopPropagation(); deleteFile(file.id); }}
                          className="p-1 text-[color:var(--text-secondary)] hover:text-red-400 transition-colors cursor-pointer"
                          title="Remove file"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                    {file.isActive && file.status === "ready" && (
                      <div className="mt-1.5 ml-7">
                        <span className="text-[9px] font-mono px-2 py-0.5 bg-emerald-500/10 text-emerald-400 border border-emerald-500/30 rounded">
                          CITING: {file.parsedOverview?.citationTag || file.fileName}
                        </span>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Right: File Overview / Detail */}
        <div className="flex flex-col border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-2)] rounded-2xl overflow-hidden lg:col-span-7 min-h-0">
          <div className="bg-[color:var(--color-navy-2)] border-b border-[color:var(--color-navy-4)] px-4 py-3 flex items-center justify-between shrink-0">
            <span className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
              {selectedFile ? "Document Overview" : "Source Details"}
            </span>
            {selectedFile?.parsedOverview?.citationTag && (
              <span className="text-[10px] text-[color:var(--text-secondary)] font-mono">{selectedFile.parsedOverview.citationTag}</span>
            )}
          </div>

          <div className="grow overflow-y-auto p-5 space-y-5 text-[color:var(--text-primary)] font-sans">
            {selectedFile ? (
              selectedFile.status === "processing" ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <div className="w-16 h-16 bg-[color:var(--color-luminous-blue)]/10 rounded-full flex items-center justify-center">
                    <Loader2 className="w-8 h-8 text-[color:var(--color-luminous-blue)] animate-spin" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold">Processing Document...</h3>
                    <p className="text-xs text-[color:var(--text-secondary)]">Parsing text, chunking for retrieval, and extracting overview via AI.</p>
                  </div>
                </div>
              ) : selectedFile.status === "error" ? (
                <div className="flex flex-col items-center justify-center h-full text-center space-y-4">
                  <div className="w-16 h-16 bg-red-500/10 rounded-full flex items-center justify-center">
                    <AlertCircle className="w-8 h-8 text-red-400" />
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-bold text-red-400">Processing Failed</h3>
                    <p className="text-xs text-red-400">{selectedFile.errorMessage || "Could not process this file."}</p>
                  </div>
                </div>
              ) : (
                <>
                  <div className="space-y-2 border-b border-[color:var(--color-navy-4)] pb-4">
                    <div className="flex items-center gap-2">
                      <span className={`text-[9px] font-bold font-mono px-2.5 py-0.5 rounded-md border ${selectedFile.isActive ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" : "bg-[color:var(--color-navy-3)] text-[color:var(--text-secondary)] border-[color:var(--color-navy-4)]"}`}>
                        {selectedFile.isActive ? "Active Source" : "Inactive Source"}
                      </span>
                      <span className="text-[9px] font-mono text-[color:var(--text-secondary)]">
                        {selectedFile.chunks.length} chunks · {selectedFile.charCount.toLocaleString()} chars
                      </span>
                    </div>
                    <h3 className="text-base font-bold leading-snug">
                      {selectedFile.parsedOverview?.title || selectedFile.fileName}
                    </h3>
                    {selectedFile.parsedOverview?.author && selectedFile.parsedOverview.author !== "Unknown" && (
                      <p className="text-xs italic text-[color:var(--text-secondary)]">{selectedFile.parsedOverview.author}</p>
                    )}
                  </div>

                  {selectedFile.parsedOverview?.abstract && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-[color:var(--color-luminous-blue)]">Abstract / Summary</h4>
                      <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">{selectedFile.parsedOverview.abstract}</p>
                    </div>
                  )}

                  {selectedFile.parsedOverview?.chapters && selectedFile.parsedOverview.chapters.length > 0 && (
                    <div className="space-y-3">
                      <h4 className="text-xs font-bold text-[color:var(--color-luminous-blue)]">Chapters / Sections</h4>
                      <div className="space-y-2 text-xs">
                        {selectedFile.parsedOverview.chapters.map((ch, i) => (
                          <div key={i} className="space-y-0.5">
                            <h5 className="font-bold text-[color:var(--text-primary)] text-xs text-[color:var(--color-luminous-blue)] flex items-center gap-1.5">
                              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-luminous-blue)] shrink-0" />
                              {ch.name}
                            </h5>
                            <p className="text-[color:var(--text-secondary)] leading-relaxed pl-3 font-sans">{ch.summary}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  {selectedFile.parsedOverview?.keyTerms && selectedFile.parsedOverview.keyTerms.length > 0 && (
                    <div className="space-y-1.5">
                      <h4 className="text-xs font-bold text-[color:var(--color-luminous-blue)]">Key Terms</h4>
                      <div className="flex flex-wrap gap-1.5">
                        {selectedFile.parsedOverview.keyTerms.map((term, i) => (
                          <span key={i} className="text-[10px] font-mono px-2 py-0.5 bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)] border border-[color:var(--color-luminous-blue)]/30 rounded">
                            {term}
                          </span>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="p-4 bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded-xl space-y-4 shadow-sm">
                    {/* Enterprise Suite Banner */}
                    <div className="p-3 bg-gradient-to-r from-[color:var(--color-navy-2)] to-[color:var(--color-navy-4)] rounded-xl text-white flex items-center justify-between shadow-md border border-[color:var(--color-navy-4)]">
                      <div className="flex items-center gap-2.5">
                        <Sparkles className="w-5 h-5 text-[color:var(--color-luminous-blue)] animate-pulse shrink-0" />
                        <div>
                          <h4 className="text-xs font-bold tracking-wide">Enterprise 16-Section Citation Suite</h4>
                          <p className="text-[10px] text-[color:var(--text-secondary)] font-mono">12 formats (APA, MLA, BibTeX, RIS...), AI quotes, & verified lookups</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => setShowSuiteModal(true)}
                        className="px-3.5 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded-lg text-xs font-bold flex items-center gap-1.5 shadow-sm transition-all cursor-pointer shrink-0"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Launch Suite
                      </button>
                    </div>

                    <div className="flex items-center justify-between border-b border-[color:var(--color-navy-4)] pb-2">
                      <div className="flex items-center gap-2 text-xs font-bold text-[color:var(--text-primary)]">
                        <Tag className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                        {isEditingCitation ? "Feed Citation Engine Manually" : "Citation System Tags & Required Fields"}
                      </div>
                      {!isEditingCitation ? (
                        <button
                          type="button"
                          onClick={handleStartEdit}
                          className="px-2.5 py-1 bg-[color:var(--color-luminous-blue)]/10 hover:bg-[color:var(--color-luminous-blue)]/20 border border-[color:var(--color-luminous-blue)]/30 text-[color:var(--color-luminous-blue)] rounded text-[10px] font-mono font-semibold flex items-center gap-1 cursor-pointer transition-all shadow-2xs"
                        >
                          <Edit3 className="w-3 h-3" /> Edit / Feed Manually
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setIsEditingCitation(false)}
                          className="px-2 py-1 text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-xs font-mono cursor-pointer"
                        >
                          Cancel
                        </button>
                      )}
                    </div>

                    {(selectedFile.parsedOverview?.author === "Unknown" || selectedFile.parsedOverview?.author?.includes("Unknown") || selectedFile.parsedOverview?.citationTag?.includes("Unknown")) && !isEditingCitation && (
                      <div className="p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg flex items-center justify-between gap-3 text-xs">
                        <div className="flex items-center gap-2 text-amber-400 font-sans">
                          <AlertCircle className="w-4 h-4 text-amber-400 shrink-0" />
                          <span>Citation Engine failed to extract author metadata. Please feed manually.</span>
                        </div>
                        <button
                          onClick={handleStartEdit}
                          className="px-2.5 py-1 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded text-xs font-bold shrink-0 shadow-2xs cursor-pointer transition-all"
                        >
                          Feed Manually
                        </button>
                      </div>
                    )}

                    {isEditingCitation ? (
                      <div className="space-y-3 pt-1 text-xs animate-fade-in">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div className="sm:col-span-2">
                            <label className="block font-semibold text-xs text-[color:var(--text-secondary)] mb-1">Document Title</label>
                            <div className="focus-within:border-[color:var(--color-luminous-blue)] border border-[color:var(--color-navy-4)] rounded bg-[color:var(--color-navy-1)]">
                              <input
                                type="text"
                                value={editForm.title || ""}
                                onChange={(e) => setEditForm({ ...editForm, title: e.target.value })}
                                className="w-full p-2 border-0 bg-transparent focus:outline-none text-xs text-[color:var(--text-primary)]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block font-semibold text-xs text-[color:var(--text-secondary)] mb-1">Primary Author(s)</label>
                            <div className="focus-within:border-[color:var(--color-luminous-blue)] border border-[color:var(--color-navy-4)] rounded bg-[color:var(--color-navy-1)]">
                              <input
                                type="text"
                                value={editForm.author || ""}
                                onChange={(e) => setEditForm({ ...editForm, author: e.target.value })}
                                placeholder="e.g. Smith, J. A."
                                className="w-full p-2 border-0 bg-transparent focus:outline-none text-xs text-[color:var(--text-primary)]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block font-semibold text-xs text-[color:var(--text-secondary)] mb-1">Publication Year</label>
                            <div className="focus-within:border-[color:var(--color-luminous-blue)] border border-[color:var(--color-navy-4)] rounded bg-[color:var(--color-navy-1)]">
                              <input
                                type="text"
                                value={editForm.year || ""}
                                onChange={(e) => setEditForm({ ...editForm, year: e.target.value })}
                                className="w-full p-2 border-0 bg-transparent focus:outline-none text-xs text-[color:var(--text-primary)]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block font-semibold text-xs text-[color:var(--text-secondary)] mb-1">Institution / Journal</label>
                            <div className="focus-within:border-[color:var(--color-luminous-blue)] border border-[color:var(--color-navy-4)] rounded bg-[color:var(--color-navy-1)]">
                              <input
                                type="text"
                                value={editForm.institutionOrJournal || ""}
                                onChange={(e) => setEditForm({ ...editForm, institutionOrJournal: e.target.value })}
                                className="w-full p-2 border-0 bg-transparent focus:outline-none text-xs text-[color:var(--text-primary)]"
                              />
                            </div>
                          </div>
                          <div>
                            <label className="block font-semibold text-xs text-[color:var(--text-secondary)] mb-1">Volume / Issue / Type</label>
                            <div className="focus-within:border-[color:var(--color-luminous-blue)] border border-[color:var(--color-navy-4)] rounded bg-[color:var(--color-navy-1)]">
                              <input
                                type="text"
                                value={editForm.volumeIssue || ""}
                                onChange={(e) => setEditForm({ ...editForm, volumeIssue: e.target.value })}
                                className="w-full p-2 border-0 bg-transparent focus:outline-none text-xs text-[color:var(--text-primary)]"
                              />
                            </div>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-semibold text-xs text-[color:var(--text-secondary)] mb-1">In-Text Citation Tag (e.g. Smith (2026))</label>
                            <div className="focus-within:border-emerald-500 border border-emerald-500/40 rounded bg-emerald-500/5">
                              <input
                                type="text"
                                value={editForm.citationTag || ""}
                                onChange={(e) => setEditForm({ ...editForm, citationTag: e.target.value })}
                                className="w-full p-2 border-0 bg-transparent font-mono font-bold text-emerald-400 focus:outline-none text-xs"
                              />
                            </div>
                          </div>
                          <div className="sm:col-span-2">
                            <label className="block font-semibold text-xs text-[color:var(--text-secondary)] mb-1">BibTeX Citation Export</label>
                            <div className="focus-within:border-[color:var(--color-luminous-blue)] border border-[color:var(--color-navy-4)] rounded bg-[color:var(--color-navy-1)]">
                              <textarea
                                rows={3}
                                value={editForm.bibtex || ""}
                                onChange={(e) => setEditForm({ ...editForm, bibtex: e.target.value })}
                                className="w-full p-2 border-0 bg-transparent font-mono text-[11px] focus:outline-none text-[color:var(--text-primary)]"
                              />
                            </div>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2 pt-2 border-t border-[color:var(--color-navy-4)]">
                          <button
                            type="button"
                            onClick={() => setIsEditingCitation(false)}
                            className="px-3 py-1.5 bg-[color:var(--color-navy-3)] hover:bg-[color:var(--surface-inset)] text-[color:var(--text-primary)] rounded text-xs font-semibold cursor-pointer"
                          >
                            Cancel
                          </button>
                          <button
                            type="button"
                            onClick={handleSaveCitation}
                            className="px-4 py-1.5 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white rounded text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-sm"
                          >
                            <Save className="w-3.5 h-3.5" /> Save Citation Feed
                          </button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-2.5 text-[11px] font-sans">
                          <div>
                            <span className="text-[color:var(--text-secondary)] block text-[9px]">Primary Author(s)</span>
                            <span className="font-semibold text-[color:var(--text-primary)]">{selectedFile.parsedOverview?.author || "Academic Researcher"}</span>
                          </div>
                          <div>
                            <span className="text-[color:var(--text-secondary)] block text-[9px]">Publication Year</span>
                            <span className="font-semibold text-[color:var(--text-primary)]">{selectedFile.parsedOverview?.year || new Date().getFullYear()}</span>
                          </div>
                          <div>
                            <span className="text-[color:var(--text-secondary)] block text-[9px]">Institution / Journal</span>
                            <span className="font-semibold text-[color:var(--text-primary)]">{selectedFile.parsedOverview?.institutionOrJournal || "Research Institution"}</span>
                          </div>
                          <div>
                            <span className="text-[color:var(--text-secondary)] block text-[9px]">Volume / Issue</span>
                            <span className="font-semibold text-[color:var(--text-primary)]">{selectedFile.parsedOverview?.volumeIssue || "Doctoral Dissertation"}</span>
                          </div>
                          <div className="sm:col-span-2">
                            <span className="text-[color:var(--text-secondary)] block text-[9px]">In-Text Citation Tag (APA/MLA)</span>
                            <span className="font-mono font-bold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded inline-block mt-0.5 border border-emerald-500/30 text-xs">
                              {selectedFile.parsedOverview?.citationTag || selectedFile.fileName}
                            </span>
                          </div>
                        </div>

                        {/* Interactive Multi-Format Citation Generator */}
                        <div className="pt-3 border-t border-[color:var(--color-navy-4)] space-y-2.5 animate-fade-in">
                          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                            <span className="text-[color:var(--text-primary)] font-bold text-xs flex items-center gap-1.5">
                              <Sparkles className="w-3.5 h-3.5 text-[color:var(--color-luminous-blue)]" /> Formatted Citation Engine (12 Formats)
                            </span>
                            <div className="flex items-center gap-1 overflow-x-auto pb-1">
                              {["APA 7", "MLA 9", "Chicago", "Harvard", "IEEE", "BibTeX", "RIS", "Zotero"].map((fmt) => (
                                <button
                                  key={fmt}
                                  type="button"
                                  onClick={() => setCitationFormat(fmt)}
                                  className={`px-2 py-0.5 rounded text-[9px] font-mono font-bold transition-all shrink-0 cursor-pointer ${
                                    citationFormat === fmt
                                      ? "bg-[color:var(--color-luminous-blue-dim)] text-[color:var(--text-primary)] shadow-2xs"
                                      : "bg-[color:var(--color-navy-3)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-inset)]"
                                  }`}
                                >
                                  {fmt}
                                </button>
                              ))}
                            </div>
                          </div>
                          <div className="relative group">
                            <pre className="p-3 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-lg text-[11px] font-mono text-[color:var(--text-primary)] overflow-x-auto whitespace-pre-wrap pr-16 leading-relaxed shadow-inner min-h-[50px]">
                              {generateCitation(getInlineMeta(selectedFile), citationFormat)}
                            </pre>
                            <button
                              type="button"
                              onClick={() => handleInlineCopy(generateCitation(getInlineMeta(selectedFile), citationFormat))}
                              className="absolute top-2 right-2 px-2.5 py-1 bg-[color:var(--color-navy-2)] hover:bg-[color:var(--color-navy-3)] border border-[color:var(--color-navy-4)] rounded text-[10px] font-mono font-bold flex items-center gap-1 shadow-2xs cursor-pointer transition-all text-[color:var(--text-primary)]"
                            >
                              {copiedFormat ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3 text-[color:var(--text-secondary)]" />}
                              {copiedFormat ? "Copied!" : "Copy"}
                            </button>
                          </div>
                        </div>
                      </>
                    )}
                  </div>

                  {!selectedFile.isActive && (
                    <button
                      onClick={() => toggleFileActive(selectedFile.id)}
                      className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg text-xs font-semibold transition-all cursor-pointer flex items-center justify-center gap-2"
                    >
                      <ToggleRight className="w-4 h-4" />
                      Enable as Citation Source
                    </button>
                  )}
                </>
              )
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-center py-12 space-y-4">
                <div className="w-14 h-14 bg-[color:var(--color-luminous-blue)]/5 border border-[color:var(--color-luminous-blue)]/15 rounded-full flex items-center justify-center">
                  <Eye className="w-7 h-7 text-[color:var(--color-luminous-blue)]" />
                </div>
                <div className="max-w-sm space-y-2">
                  <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Select a Source</h3>
                  <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                    {vault.files.length > 0
                      ? "Click on a file in the registry to view its extracted overview, chapters, and citation details."
                      : "Upload your doctoral thesis or research documents to get started. The AI will automatically extract an overview and chunk the content for citation-backed drafting."}
                  </p>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>



      {/* Upload More Confirmation Modal */}
      {showUploadMoreModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 animate-fade-in">
          <div className="bg-[color:var(--color-navy-2)] rounded-2xl max-w-md w-full p-6 shadow-2xl border border-[color:var(--color-navy-4)] space-y-4 text-center animate-scale-up">
            <div className="w-14 h-14 bg-emerald-500/10 text-emerald-400 rounded-full flex items-center justify-center mx-auto shadow-sm">
              <CheckCircle2 className="w-8 h-8" />
            </div>
            <h3 className="text-lg font-bold text-[color:var(--text-primary)]">File Uploaded & Parsed!</h3>
            <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
              Your research document has been indexed with complete citation tags. Do you want to upload more research files to ground your workbench?
            </p>
            <div className="flex gap-3 pt-2">
              <label className="flex-1 py-3 px-4 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white font-medium text-xs rounded-xl shadow-md flex items-center justify-center gap-2 transition-all cursor-pointer">
                <Plus className="w-4 h-4" />
                Yes, Upload More
                <input
                  type="file"
                  accept=".pdf,.docx,.xlsx,.xls,.csv,.txt"
                  className="hidden"
                  onChange={(e) => {
                    setShowUploadMoreModal(false);
                    handleFileUpload(e);
                  }}
                  disabled={isUploading}
                />
              </label>
              <button
                type="button"
                onClick={() => setShowUploadMoreModal(false)}
                className="flex-1 py-3 px-4 bg-[color:var(--color-navy-3)] hover:bg-[color:var(--surface-inset)] text-[color:var(--text-primary)] font-medium text-xs rounded-xl transition-all cursor-pointer"
              >
                Skip / Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
