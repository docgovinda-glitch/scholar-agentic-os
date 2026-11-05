import React, { useState, useMemo } from "react";
import {
  FileCode,
  Download,
  Copy,
  ExternalLink,
  BookOpen,
  Check,
  ChevronRight,
  Folder,
  FileText,
  Table,
  Layers,
  ArrowLeft,
  X,
  Sparkles,
} from "lucide-react";
import {
  type ResearchProjectExportData,
  generateLatexProjectFiles,
  downloadLatexProjectZip,
} from "../../services/export/researchLatexExportService";
import { type EvidenceMatrixItem } from "../../services/evidence/evidenceExtractionService";
import { type CitationGraphNode } from "../../services/discovery/snowballSamplingService";

export interface ResearchExportWorkspaceProps {
  projectId?: string;
  projectTitle?: string;
  inquiryQuery?: string;
  evidenceItems?: EvidenceMatrixItem[];
  literaturePapers?: CitationGraphNode[];
  onOpenEvidenceSynthesis?: () => void;
  onOpenLiteratureDiscovery?: () => void;
  onClose?: () => void;
}

export default function ResearchExportWorkspace({
  projectId,
  projectTitle = "Empirical Research Synthesis & Meta-Analysis",
  inquiryQuery = "",
  evidenceItems = [],
  literaturePapers = [],
  onOpenEvidenceSynthesis,
  onOpenLiteratureDiscovery,
  onClose,
}: ResearchExportWorkspaceProps) {
  const [docClass, setDocClass] = useState<"article" | "IEEEtran" | "elsarticle" | "revtex4-2">("article");
  const [selectedFilePath, setSelectedFilePath] = useState<string>("main.tex");
  const [copiedFile, setCopiedFile] = useState<string | null>(null);
  const [isDownloading, setIsDownloading] = useState(false);

  // Prepare export data object
  const exportData: ResearchProjectExportData = useMemo(() => {
    return {
      title: projectTitle,
      inquiryQuery,
      documentClass: docClass,
      evidenceItems,
      literaturePapers,
      keywords: ["Evidence Synthesis", "Literature Discovery", "Meta-Analysis", "Causal Inference", "Autonomous Research"],
    };
  }, [projectTitle, inquiryQuery, docClass, evidenceItems, literaturePapers]);

  // Generate all project files
  const files: Record<string, string> = useMemo(() => {
    return generateLatexProjectFiles(exportData);
  }, [exportData]);

  // Current file content
  const activeContent = files[selectedFilePath] || "";

  // Copy active file content
  const handleCopyContent = () => {
    navigator.clipboard.writeText(activeContent);
    setCopiedFile(selectedFilePath);
    setTimeout(() => setCopiedFile(null), 3000);
  };

  // 1-Click ZIP Download
  const handleDownloadZip = async () => {
    if (isDownloading) return;
    setIsDownloading(true);
    try {
      await downloadLatexProjectZip(exportData);
    } finally {
      setIsDownloading(false);
    }
  };

  // Categorize files for file tree navigation
  const fileTree = useMemo(() => {
    const rootFiles: string[] = [];
    const sections: string[] = [];
    const tables: string[] = [];

    for (const path of Object.keys(files)) {
      if (path.startsWith("sections/")) sections.push(path);
      else if (path.startsWith("tables/")) tables.push(path);
      else rootFiles.push(path);
    }

    return { rootFiles, sections, tables };
  }, [files]);

  return (
    <div className="flex flex-col h-full bg-[color:var(--surface-canvas,#f8fafc)] dark:bg-[color:var(--surface-canvas,#090d16)] text-neutral-900 dark:text-neutral-100 overflow-hidden font-sans">
      {/* Top Header */}
      <div className="flex items-center justify-between px-5 py-3 border-b border-neutral-200 dark:border-white/10 bg-white/80 dark:bg-neutral-900/80 backdrop-blur-md shrink-0 gap-3">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-xl bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
            <FileCode className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-sm font-bold text-neutral-900 dark:text-white leading-none">
                Research Export & Publishing Workspace
              </h1>
              <span className="px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-300/40">
                Layer D · LaTeX & Overleaf
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400 mt-0.5">
              Multi-Section Modular LaTeX Project, BibTeX Database & Overleaf ZIP
            </p>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-2">
          {onOpenEvidenceSynthesis && (
            <button
              type="button"
              onClick={onOpenEvidenceSynthesis}
              className="px-2.5 py-1.5 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 hover:bg-neutral-100 dark:hover:bg-white/5 flex items-center gap-1.5 transition-colors cursor-pointer"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
              <span>Back to Evidence Synthesis</span>
            </button>
          )}

          {/* 1-Click Overleaf ZIP Download */}
          <button
            type="button"
            disabled={isDownloading}
            onClick={handleDownloadZip}
            className="px-3.5 py-1.5 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white flex items-center gap-1.5 shadow-sm transition-colors cursor-pointer disabled:opacity-60"
          >
            <Download className="w-3.5 h-3.5" />
            <span>{isDownloading ? "Packaging ZIP..." : "Download Overleaf ZIP"}</span>
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

      {/* Sub-Header: Document Class Selector & Instructions */}
      <div className="flex items-center justify-between px-5 py-2.5 border-b border-neutral-200/80 dark:border-white/5 bg-neutral-50/50 dark:bg-white/[0.01] gap-3 text-xs flex-wrap shrink-0">
        <div className="flex items-center gap-2">
          <span className="text-neutral-500 dark:text-neutral-400 font-medium">Document Class:</span>
          <select
            value={docClass}
            onChange={(e) => setDocClass(e.target.value as any)}
            className="px-2 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-800 text-xs font-semibold cursor-pointer"
          >
            <option value="article">article (Standard Academic Article)</option>
            <option value="IEEEtran">IEEEtran (IEEE Transactions)</option>
            <option value="elsarticle">elsarticle (Elsevier Journal Format)</option>
            <option value="revtex4-2">revtex4-2 (APS / Physical Review)</option>
          </select>
        </div>

        <div className="flex items-center gap-3 text-[11px] text-neutral-500 dark:text-neutral-400">
          <span>{Object.keys(files).length} modular project files generated</span>
          <span>·</span>
          <span>{evidenceItems.length} empirical studies synthesized</span>
          <span>·</span>
          <a
            href="https://www.overleaf.com/project"
            target="_blank"
            rel="noopener noreferrer"
            className="text-indigo-600 dark:text-indigo-400 hover:underline flex items-center gap-1 font-medium"
          >
            <span>Open Overleaf</span>
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      </div>

      {/* Main Workspace Body: File Explorer Sidebar + Code Viewer */}
      <div className="flex-1 min-h-0 flex relative overflow-hidden">
        {/* Left Sidebar: File Tree */}
        <div className="w-64 border-r border-neutral-200 dark:border-white/10 bg-white dark:bg-neutral-900/60 p-3 space-y-4 overflow-y-auto scholar-scrollbar shrink-0 text-xs">
          {/* Root Files */}
          <div>
            <div className="text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 mb-1">
              Project Root
            </div>
            <div className="space-y-0.5">
              {fileTree.rootFiles.map((file) => (
                <button
                  key={file}
                  type="button"
                  onClick={() => setSelectedFilePath(file)}
                  className={`w-full text-left px-2.5 py-1.5 rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
                    selectedFilePath === file
                      ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold"
                      : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5"
                  }`}
                >
                  <FileText className="w-3.5 h-3.5 text-neutral-400" />
                  <span className="truncate">{file}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Sections Folder */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 mb-1">
              <Folder className="w-3 h-3 text-amber-500" />
              <span>sections/</span>
            </div>
            <div className="space-y-0.5 pl-2">
              {fileTree.sections.map((file) => {
                const basename = file.replace("sections/", "");
                return (
                  <button
                    key={file}
                    type="button"
                    onClick={() => setSelectedFilePath(file)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
                      selectedFilePath === file
                        ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold"
                        : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <FileText className="w-3 h-3 text-sky-500" />
                    <span className="truncate">{basename}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Tables Folder */}
          <div>
            <div className="flex items-center gap-1.5 text-[10px] font-bold text-neutral-400 uppercase tracking-wider px-2 mb-1">
              <Folder className="w-3 h-3 text-emerald-500" />
              <span>tables/</span>
            </div>
            <div className="space-y-0.5 pl-2">
              {fileTree.tables.map((file) => {
                const basename = file.replace("tables/", "");
                return (
                  <button
                    key={file}
                    type="button"
                    onClick={() => setSelectedFilePath(file)}
                    className={`w-full text-left px-2 py-1.5 rounded-lg flex items-center gap-2 transition-colors cursor-pointer ${
                      selectedFilePath === file
                        ? "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 font-semibold"
                        : "text-neutral-600 dark:text-neutral-400 hover:bg-neutral-100 dark:hover:bg-white/5"
                    }`}
                  >
                    <Table className="w-3 h-3 text-emerald-500" />
                    <span className="truncate">{basename}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right Code Viewer & Action Area */}
        <div className="flex-1 min-w-0 flex flex-col bg-neutral-900 text-neutral-100 overflow-hidden">
          {/* File Header */}
          <div className="flex items-center justify-between px-4 py-2 border-b border-neutral-800 bg-neutral-950/80 text-xs shrink-0">
            <div className="flex items-center gap-2 font-mono text-neutral-300">
              <FileCode className="w-3.5 h-3.5 text-indigo-400" />
              <span>{selectedFilePath}</span>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={handleCopyContent}
                className="px-2.5 py-1 rounded text-xs font-medium bg-neutral-800 hover:bg-neutral-700 text-neutral-200 flex items-center gap-1.5 transition-colors cursor-pointer"
              >
                {copiedFile === selectedFilePath ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>Copied!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-neutral-400" />
                    <span>Copy File</span>
                  </>
                )}
              </button>
            </div>
          </div>

          {/* Code Viewer Body */}
          <div className="flex-1 overflow-auto p-4 font-mono text-xs leading-relaxed scholar-scrollbar select-text bg-neutral-950">
            <pre className="whitespace-pre font-mono text-neutral-200">
              <code>{activeContent}</code>
            </pre>
          </div>
        </div>
      </div>
    </div>
  );
}
