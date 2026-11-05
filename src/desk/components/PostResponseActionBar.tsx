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

export type ContinueWorkspaceId = "OT-01" | "OT-10" | "OT-19" | "OT-22";

export interface ContinueWorkspaceOption {
  id: ContinueWorkspaceId;
  label: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
}

export const CONTINUE_WORKSPACE_OPTIONS: ContinueWorkspaceOption[] = [
  {
    id: "OT-01",
    label: "Assignment",
    description: "Essays, literature reviews, case studies & problem sets",
    icon: GraduationCap,
  },
  {
    id: "OT-10",
    label: "Journal Article",
    description: "IMRaD empirical & theoretical manuscripts with peer review",
    icon: BookOpen,
  },
  {
    id: "OT-19",
    label: "Research Proposal",
    description: "Grant proposals, thesis proposals & methodology protocols",
    icon: FileSearch,
  },
  {
    id: "OT-22",
    label: "Presentation",
    description: "Academic slide decks with speaker notes & cited slides",
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
      className="relative mt-3 pt-2.5 border-t border-neutral-200/70 dark:border-white/10"
    >
      {/* Single non-wrapping row of the exact 6 post-response actions (Section 8 & Section 13) */}
      <div className="flex items-center flex-nowrap overflow-x-auto whitespace-nowrap gap-1.5 pb-0.5 scholar-scrollbar">
        {/* 1. Copy */}
        <button
          type="button"
          data-testid="action-copy"
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium bg-neutral-100/90 dark:bg-white/5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/80 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer shrink-0"
          title="Copy formatted response and Reference List"
        >
          {copied ? (
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Copy className="w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400" />
          )}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>

        {/* 2. Export to Word */}
        <button
          type="button"
          data-testid="action-export-word"
          onClick={handleExportWord}
          disabled={exportingWord}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium bg-neutral-100/90 dark:bg-white/5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/80 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          title="Export response to Word (.docx) with headings, italics, tables, and hanging indents"
        >
          <FileText className="w-3.5 h-3.5 text-blue-600 dark:text-blue-400" />
          <span>{exportingWord ? "Exporting…" : "Export to Word"}</span>
        </button>

        {/* 3. BibTeX (with RIS option) */}
        <div className="relative inline-flex items-center shrink-0">
          <button
            type="button"
            data-testid="action-bibtex"
            onClick={handleExportBibTeX}
            className="inline-flex items-center gap-1.5 pl-2.5 pr-1.5 py-1.5 rounded-l-lg text-[11.5px] font-medium bg-neutral-100/90 dark:bg-white/5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/80 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer"
            title="Download & copy cited references as BibTeX (.bib)"
          >
            <BookMarked className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
            <span>BibTeX</span>
          </button>
          <button
            type="button"
            data-testid="action-bibtex-menu-toggle"
            aria-label="Reference export formats (BibTeX / RIS)"
            onClick={() => {
              setBibMenuOpen((v) => !v);
              setContinueOpen(false);
            }}
            className="inline-flex items-center px-1.5 py-1.5 rounded-r-lg text-[11.5px] font-medium bg-neutral-100/90 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-200/80 dark:hover:bg-white/10 border-y border-r border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer"
            title="More reference formats (RIS for Zotero, Mendeley, EndNote)"
          >
            <ChevronDown className="w-3 h-3" />
          </button>
        </div>

        {/* 4. Regenerate */}
        <button
          type="button"
          data-testid="action-regenerate"
          onClick={() => onRegenerate(message)}
          disabled={isRegenerating}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium bg-neutral-100/90 dark:bg-white/5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/80 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer shrink-0 disabled:opacity-50"
          title="Run the pipeline again and write a fresh response"
        >
          <RotateCcw className={`w-3.5 h-3.5 text-neutral-500 dark:text-neutral-400 ${isRegenerating ? "animate-spin" : ""}`} />
          <span>Regenerate</span>
        </button>

        {/* 5. Store to Knowledge Vault */}
        <button
          type="button"
          data-testid="action-store-vault"
          onClick={() => onStoreToVault(message)}
          className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-medium border transition-colors cursor-pointer shrink-0 ${
            isSavedToVault
              ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800/50"
              : "bg-neutral-100/90 dark:bg-white/5 text-neutral-700 dark:text-neutral-200 hover:bg-neutral-200/80 dark:hover:bg-white/10 border-neutral-200/80 dark:border-white/10"
          }`}
          title="Save response, sources, CSL-JSON metadata, and citation style to Knowledge Vault"
        >
          {isSavedToVault ? (
            <Check className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          ) : (
            <Database className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400" />
          )}
          <span>{isSavedToVault ? "Stored in Vault" : "Store to Knowledge Vault"}</span>
        </button>

        {/* 6. Continue */}
        <button
          type="button"
          data-testid="action-continue"
          onClick={() => {
            setContinueOpen((v) => !v);
            setBibMenuOpen(false);
          }}
          aria-expanded={continueOpen}
          className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11.5px] font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-xs transition-colors cursor-pointer shrink-0"
          title="Continue in an academic workspace (Assignment, Journal Article, Research Proposal, or Presentation)"
        >
          <ArrowRightCircle className="w-3.5 h-3.5" />
          <span>Continue</span>
          <ChevronDown className="w-3 h-3" />
        </button>
      </div>

      {/* BibTeX / RIS Format Popover */}
      {bibMenuOpen && (
        <div
          role="menu"
          data-testid="bibtex-ris-menu"
          className="absolute left-28 bottom-full mb-1.5 z-40 w-56 p-1.5 rounded-xl bg-white dark:bg-ink-800 border border-neutral-200 dark:border-white/15 shadow-xl space-y-1"
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
          className="absolute right-0 bottom-full mb-1.5 z-40 w-72 p-2 rounded-2xl bg-white dark:bg-ink-800 border border-neutral-200 dark:border-white/15 shadow-2xl space-y-1"
        >
          <div className="px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-neutral-400">
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
                <Icon className="w-4 h-4 text-indigo-600 dark:text-indigo-400 mt-0.5 shrink-0" />
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

