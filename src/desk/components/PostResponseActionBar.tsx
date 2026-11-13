import React, { useState, useRef, useEffect } from "react";
import {
  Copy,
  Check,
  FileText,
  BookMarked,
  RotateCcw,
  Database,
  ArrowRightCircle,
  ChevronDown,
  GraduationCap,
  BookOpen,
  FileSearch,
  Presentation,
} from "lucide-react";
import type { WebsiteAssistantMessage } from "../dashboard/types";
import {
  copyFormattedResponseToClipboard,
  exportResponseToWordDocx,
  exportCitedMessageToBibTeX,
  exportCitedMessageToRIS,
  downloadAndCopyReferenceFile,
} from "../services/askScholarExportService";

export type ContinueWorkspaceId = "OT-01" | "OT-10" | "OT-15" | "OT-22";

export interface ContinueWorkspaceOption {
  id: ContinueWorkspaceId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const CONTINUE_WORKSPACE_OPTIONS: ContinueWorkspaceOption[] = [
  {
    id: "OT-01",
    label: "Coursework & Essays",
    description: "Brief, sub-questions, sources and section-by-section drafting",
    icon: GraduationCap,
  },
  {
    id: "OT-10",
    label: "Journal Article",
    description: "IMRaD manuscript with literature synthesis and peer-review readiness",
    icon: BookOpen,
  },
  {
    id: "OT-15",
    label: "Research Proposal",
    description: "Question, gap analysis, framework and methodology",
    icon: FileSearch,
  },
  {
    id: "OT-22",
    label: "Slides & Keynotes",
    description: "Outline, design, edit and deliver a slide deck",
    icon: Presentation,
  },
];

export interface PostResponseActionBarProps {
  message: WebsiteAssistantMessage;
  citationStyle: string;
  isRegenerating?: boolean;
  isSavedToVault?: boolean;
  onRegenerate: (message: WebsiteAssistantMessage) => void;
  onStoreToVault: (message: WebsiteAssistantMessage) => void;
  onContinueToWorkspace: (
    workspaceId: ContinueWorkspaceId,
    message: WebsiteAssistantMessage
  ) => void;
  onToast?: (text: string, type?: "success" | "info" | "warning") => void;
}

export function PostResponseActionBar({
  message,
  citationStyle,
  isRegenerating = false,
  isSavedToVault = false,
  onRegenerate,
  onStoreToVault,
  onContinueToWorkspace,
  onToast,
}: PostResponseActionBarProps) {
  const [copied, setCopied] = useState(false);
  const [exportingWord, setExportingWord] = useState(false);
  const [bibMenuOpen, setBibMenuOpen] = useState(false);
  const [continueOpen, setContinueOpen] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (barRef.current && !barRef.current.contains(e.target as Node)) {
        setBibMenuOpen(false);
        setContinueOpen(false);
      }
    };
    document.addEventListener("mousedown", handleOutside);
    return () => document.removeEventListener("mousedown", handleOutside);
  }, []);

  const handleCopy = async () => {
    await copyFormattedResponseToClipboard(message, citationStyle);
    setCopied(true);
    onToast?.("Copied formatted response and Reference List to clipboard.", "success");
    setTimeout(() => setCopied(false), 2000);
  };

  const handleExportWord = async () => {
    try {
      setExportingWord(true);
      await exportResponseToWordDocx(message, citationStyle);
      onToast?.("Exported .docx document with headings, tables, and hanging-indent Reference List.", "success");
    } catch {
      onToast?.("Could not generate Word document.", "warning");
    } finally {
      setExportingWord(false);
    }
  };

  const handleExportBibTeX = async () => {
    const bib = exportCitedMessageToBibTeX(message, citationStyle);
    if (!bib) {
      onToast?.("No verified cited sources in this response to export.", "info");
      return;
    }
    await downloadAndCopyReferenceFile(
      bib,
      `ask-scholar-references-${message.id || Date.now()}.bib`,
      "application/x-bibtex;charset=utf-8"
    );
    setBibMenuOpen(false);
    onToast?.("Exported cited sources as BibTeX (.bib) and copied to clipboard.", "success");
  };

  const handleExportRIS = async () => {
    const ris = exportCitedMessageToRIS(message, citationStyle);
    if (!ris) {
      onToast?.("No verified cited sources in this response to export.", "info");
      return;
    }
    await downloadAndCopyReferenceFile(
      ris,
      `ask-scholar-references-${message.id || Date.now()}.ris`,
      "application/x-research-info-systems;charset=utf-8"
    );
    setBibMenuOpen(false);
    onToast?.("Exported cited sources as RIS (.ris) for Zotero, Mendeley, and EndNote.", "success");
  };

  return (
    <div
      ref={barRef}
      data-testid="post-response-action-bar"
      className="relative mt-3"
    >
      {/* Single non-wrapping row of the exact 6 post-response actions (Section 8 & Section 13) */}
      <div className="no-scrollbar -mx-1 flex flex-nowrap items-center gap-0.5 overflow-x-auto whitespace-nowrap">
        {/* 1. Copy */}
        <button
          type="button"
          data-testid="action-copy"
          aria-label="Copy response"
          onClick={handleCopy}
          className="inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 sm:min-w-8"
          title="Copy formatted response and Reference List"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Copy className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">{copied ? "Copied" : "Copy"}</span>
        </button>

        {/* 2. Export to Word */}
        <button
          type="button"
          data-testid="action-export-word"
          aria-label="Export to Word"
          onClick={handleExportWord}
          disabled={exportingWord}
          className="inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 sm:min-w-8"
          title="Export response to Word (.docx) with headings, italics, tables, and hanging indents"
        >
          <FileText className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">{exportingWord ? "Exporting…" : "Export to Word"}</span>
        </button>

        {/* 3. BibTeX (with RIS option) */}
        <div className="relative inline-flex items-center shrink-0">
          <button
            type="button"
            data-testid="action-bibtex"
            aria-label="Export BibTeX"
            onClick={handleExportBibTeX}
            className="inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 sm:min-w-8"
            title="Download & copy cited references as BibTeX (.bib)"
          >
            <BookMarked className="w-3.5 h-3.5" />
            <span className="hidden sm:inline">BibTeX</span>
          </button>
          <button
            type="button"
            data-testid="action-bibtex-menu-toggle"
            aria-label="Reference export formats (BibTeX / RIS)"
            onClick={() => {
              setBibMenuOpen((v) => !v);
              setContinueOpen(false);
            }}
            className="inline-flex min-h-10 shrink-0 cursor-pointer items-center rounded-full px-1 text-neutral-500 transition-colors hover:bg-neutral-100 hover:text-neutral-900 dark:text-neutral-400 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8"
            title="More reference formats (RIS for Zotero, Mendeley, EndNote)"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* 4. Regenerate */}
        <button
          type="button"
          data-testid="action-regenerate"
          aria-label="Regenerate response"
          onClick={() => onRegenerate(message)}
          disabled={isRegenerating}
          className="inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 sm:min-w-8"
          title="Run the pipeline again and write a fresh response"
        >
          <RotateCcw className={`w-3.5 h-3.5 ${isRegenerating ? "animate-spin" : ""}`} />
          <span className="hidden sm:inline">Regenerate</span>
        </button>

        {/* 5. Store to Knowledge Vault */}
        <button
          type="button"
          data-testid="action-store-vault"
          aria-label="Store to Knowledge Vault"
          onClick={() => onStoreToVault(message)}
          className={"inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 sm:min-w-8"}
          title="Save response, sources, CSL-JSON metadata, and citation style to Knowledge Vault"
        >
          {isSavedToVault ? (
            <Check className="w-3.5 h-3.5" />
          ) : (
            <Database className="w-3.5 h-3.5" />
          )}
          <span className="hidden sm:inline">{isSavedToVault ? "Stored in Vault" : "Store to Knowledge Vault"}</span>
        </button>

        {/* 6. Continue */}
        <button
          type="button"
          data-testid="action-continue"
          aria-label="Continue in a workspace"
          onClick={() => {
            setContinueOpen((v) => !v);
            setBibMenuOpen(false);
          }}
          aria-expanded={continueOpen}
          className="inline-flex min-h-10 min-w-10 shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-full px-2.5 text-[12px] font-medium text-neutral-600 transition-colors hover:bg-neutral-100 hover:text-neutral-900 focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-sky-500 disabled:opacity-50 dark:text-neutral-300 dark:hover:bg-white/10 dark:hover:text-white sm:min-h-8 sm:min-w-8"
          title="Continue in a workspace (Coursework & Essays, Journal Article, Research Proposal, or Slides & Keynotes)"
        >
          <ArrowRightCircle className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Continue</span>
          <ChevronDown className="h-3 w-3" aria-hidden="true" />
        </button>
      </div>

      {/* BibTeX / RIS Format Popover */}
      {bibMenuOpen && (
        <div
          role="menu"
          data-testid="bibtex-ris-menu"
          className="absolute left-0 bottom-full mb-1.5 z-40 w-56 max-w-[calc(100vw-2rem)] p-1.5 rounded-xl bg-white dark:bg-ink-800 border border-neutral-200 dark:border-white/15 shadow-xl space-y-1"
        >
          <button
            type="button"
            role="menuitem"
            onClick={handleExportBibTeX}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200 cursor-pointer flex items-center justify-between"
          >
            <span className="font-medium">BibTeX (.bib)</span>
            <span className="text-[10px] text-neutral-400">LaTeX / Overleaf</span>
          </button>
          <button
            type="button"
            role="menuitem"
            onClick={handleExportRIS}
            className="w-full text-left px-2.5 py-1.5 rounded-lg text-xs hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-800 dark:text-neutral-200 cursor-pointer flex items-center justify-between"
          >
            <span className="font-medium">RIS (.ris)</span>
            <span className="text-[10px] text-neutral-400">Zotero / Mendeley / EndNote</span>
          </button>
        </div>
      )}

      {/* Continue 4-Workspace Picker Popover (Section 8 & Section 11) */}
      {continueOpen && (
        <div
          role="menu"
          aria-label="Continue in workspace"
          data-testid="continue-workspace-picker"
          className="absolute right-0 bottom-full mb-1.5 z-40 w-72 max-w-[calc(100vw-2rem)] p-2 rounded-2xl bg-white dark:bg-ink-800 border border-neutral-200 dark:border-white/15 shadow-2xl space-y-1"
        >
          <div className="px-2 py-1 text-[11px] font-medium text-neutral-500">
            Continue in Workspace
          </div>
          {CONTINUE_WORKSPACE_OPTIONS.map((ws) => {
            const Icon = ws.icon;
            return (
              <button
                key={ws.id}
                type="button"
                role="menuitem"
                data-testid={`continue-workspace-${ws.id}`}
                onClick={() => {
                  setContinueOpen(false);
                  onContinueToWorkspace(ws.id, message);
                }}
                className="w-full flex items-start gap-2.5 p-2 rounded-xl text-left hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
              >
                <Icon className="w-4 h-4 text-neutral-500 mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100">
                    {ws.label}
                  </div>
                  <div className="text-[10.5px] text-neutral-500 dark:text-neutral-400 leading-snug">
                    {ws.description}
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}

