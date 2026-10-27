import React, { useState } from "react";
import {
  ArrowUp,
  ArrowRight,
  X,
  RotateCcw,
  Lightbulb,
  Search,
  Database,
  Sliders,
  MessageSquare,
  FileText,
  Paperclip,
  Compass,
  Loader2,
  Sparkles,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Scale,
  Info,
  BookOpen,
  FolderPlus,
  Plus,
} from "lucide-react";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { PromptBarActionMenu, type PromptMode } from "../PromptBarActionMenu";
import LiveSourcesDrawer from "../components/LiveSourcesDrawer";
import {
  ASK_SCHOLAR_CITATION_STYLES,
  formatAskScholarInText,
  formatAskScholarBibliography,
  stripRawReferencesSection,
  getCitationStyleInfo,
  type AskCitationStyleId,
} from "../scholarCitationEngine";
import { setLiveSearchGroundingEnabled, type LiveSearchResult } from "../../services/liveSearchService";
import type { AiOperationalStatus } from "../api";
import { FORMAT_TILES, FormatIcon, getFormatTileTheme } from "./ProjectCreateIntakeModal";

export interface Attachment {
  file: File;
  previewUrl?: string;
}

export interface AgentAttachmentItem {
  id: string;
  name: string;
  isImage: boolean;
  size: number;
  fileData?: { name: string; text: string; type: string };
  imageData?: { data: string; dataUrl?: string; mimeType: string; name: string };
  previewUrl?: string;
}

export interface AssistantAction {
  type: "ai" | "ai-access" | "vault" | "workspaces" | "projects" | "auth";
  label: string;
}

export interface WebsiteAssistantMessage {
  id: string;
  sender: "user" | "assistant";
  text: string;
  timestamp: string;
  action?: AssistantAction;
  followUps?: string[];
  mode?: "chat" | "search" | "deep-research" | "deliverable";
  provider?: string;
  model?: string;
  plan?: string[];
  citationStyle?: string;
  citations?: Array<{
    title?: string;
    url?: string;
    snippet?: string;
    domain?: string;
    publisher?: string;
    authorityBadge?: string;
    authorityTier?: string;
    source?: string;
    venue?: string;
    year?: number | string;
    author?: string;
    authors?: string[];
    doi?: string;
    isPrimary?: boolean;
    sourceType?: "official" | "scholarly" | "media" | "web" | "vault";
  }>;
  liveSources?: LiveSearchResult[];
  attachments?: Array<{ name: string; isImage: boolean; previewUrl?: string }>;
  error?: boolean;
  wordCount?: number;
  verifiedSourcesCount?: number;
  burstinessMetrics?: {
    averageLength: number;
    variance: number;
    burstinessScore: number;
    isSufficientlyBurst: boolean;
  };
  recommendedWorkspaceHandoff?: {
    targetFormatId: "OT-01" | "OT-10" | "OT-19" | "OT-09" | "OT-22";
    formatLabel: string;
    topic: string;
    suggestedTitle: string;
    wordCountTarget?: number;
    citationStyle: string;
    retrievedSources: Array<{
      title: string;
      authors: string[];
      year?: number | string;
      doi?: string;
      url?: string;
      venue?: string;
    }>;
  };
}

export function getAssistantActionAndFollowUps(query: string): {
  action?: AssistantAction;
  followUps?: string[];
} {
  const q = query.toLowerCase();
  if (
    q.includes("generate code") ||
    q.includes("write code") ||
    q.includes("write a script")
  ) {
    return {
      action: { type: "workspaces", label: "Browse Academic Workspaces ↑" },
      followUps: ["How do I create a research project?", "What is Knowledge Vault?"],
    };
  }
  if (q.includes("ai") || q.includes("key") || q.includes("provider") || q.includes("configure") || q.includes("byok") || q.includes("engine")) {
    return {
      action: { type: "ai", label: "Open AI Access Settings ↗" },
      followUps: ["What is Scholar AI Engine?", "What is Knowledge Vault?", "How do I create a research project?"],
    };
  }
  if (q.includes("vault") || q.includes("citation") || q.includes("pdf") || q.includes("zotero") || q.includes("reference") || q.includes("evidence") || q.includes("source")) {
    return {
      action: { type: "vault", label: "Open Knowledge Vault ↗" },
      followUps: ["How do I add sources?", "What is the Evidence phase?", "How do I set up AI?"],
    };
  }
  if (q.includes("create") || q.includes("start") || q.includes("new project") || q.includes("how do i create") || q.includes("journal") || q.includes("workflow")) {
    return {
      action: { type: "workspaces", label: "Browse Academic Workspaces ↑" },
      followUps: ["Journal Article workflow?", "How do I set up AI?", "Where can I find my projects?"],
    };
  }
  if (q.includes("find") || q.includes("where") || q.includes("list") || q.includes("access") || q.includes("project")) {
    return {
      action: { type: "projects", label: "Jump to Projects ↓" },
      followUps: ["How do I create a research project?", "What is Knowledge Vault?"],
    };
  }
  return {
    followUps: ["How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?"],
  };
}

export const WEBSITE_ASSISTANT_FAQS = [
  { question: "How do I set up AI?", shortLabel: "How do I set up AI?" },
  { question: "What is Knowledge Vault?", shortLabel: "What is Knowledge Vault?" },
  { question: "How do I create a research project?", shortLabel: "How do I create a research project?" },
  { question: "What is the Evidence phase?", shortLabel: "What is the Evidence phase?" },
  { question: "How do I add sources?", shortLabel: "How do I add sources?" },
  { question: "Where can I find my projects?", shortLabel: "Where can I find my projects?" },
  { question: "How does the Journal Article workflow work?", shortLabel: "Journal Article workflow?" },
  { question: "What is Scholar AI Engine?", shortLabel: "What is Scholar AI Engine?" },
  { question: "How do I configure an AI provider?", shortLabel: "Configure AI provider?" },
];

export function CodeBlockWithCopy({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group/code my-2 rounded-xl overflow-hidden bg-neutral-900 dark:bg-black border border-neutral-800 text-neutral-200">
      <div className="flex items-center justify-between px-3 py-1.5 bg-neutral-800/60 dark:bg-neutral-900 border-b border-neutral-700/50 text-[11px] text-neutral-400">
        <span className="font-mono lowercase">{lang || "text"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-3 text-xs font-mono overflow-x-auto leading-relaxed">
        <code>{code}</code>
      </pre>
    </div>
  );
}

export type WebsiteCitationItem = NonNullable<WebsiteAssistantMessage["citations"]>[number];

export function InlineCitationBadge({
  num,
  url,
  citation,
  label,
}: {
  num: string | number;
  url?: string;
  citation?: WebsiteCitationItem;
  label?: string;
}) {
  const targetUrl = url || (citation as { doi?: string } | undefined)?.doi || citation?.url;
  const displayLabel = label || `[${num}]`;
  const domain =
    citation?.domain ||
    (targetUrl
      ? (() => {
          try {
            return new URL(targetUrl).hostname.replace(/^www\./, "");
          } catch {
            return "source";
          }
        })()
      : undefined);

  return (
    <span className="relative group/cite inline-block align-baseline mx-0.5 select-none">
      <a
        href={targetUrl || "#"}
        target={targetUrl ? "_blank" : undefined}
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!targetUrl) e.preventDefault();
          e.stopPropagation();
        }}
        className="inline-flex items-center justify-center font-mono text-[10px] font-semibold px-1.5 py-0.2 rounded-full bg-blue-50 dark:bg-blue-900/40 text-blue-600 dark:text-blue-300 border border-blue-200/70 dark:border-blue-700/60 hover:bg-blue-600 hover:text-white dark:hover:bg-blue-500 hover:scale-105 active:scale-95 transition-all shadow-2xs cursor-pointer"
        title={targetUrl ? `Verified Citation ${displayLabel} — ${targetUrl}` : `Verified Citation ${displayLabel}`}
      >
        {displayLabel}
      </a>

      {citation && (
        <span className="pointer-events-none opacity-0 group-hover/cite:opacity-100 group-hover/cite:pointer-events-auto transition-all duration-200 ease-out absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-72 p-3 rounded-xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-200 dark:border-white/15 shadow-xl text-left z-50 transform group-hover/cite:translate-y-0 translate-y-1 block">
          <span className="flex items-center justify-between gap-1.5 mb-1.5">
            <span className="flex items-center gap-1.5 min-w-0">
              {domain && (
                <img
                  src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                  alt=""
                  className="w-3.5 h-3.5 rounded-xs shrink-0"
                  onError={(e) => {
                    (e.target as HTMLElement).style.display = "none";
                  }}
                />
              )}
              <span className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200 truncate">
                {citation.publisher || domain || "Verified Source"}
              </span>
            </span>
            {citation.year && (
              <span className="text-[10px] text-neutral-400 font-mono shrink-0">
                {citation.year}
              </span>
            )}
          </span>

          <span className="block text-xs font-medium text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug mb-1">
            {citation.title || "External Scholarly Resource"}
          </span>

          {citation.snippet && (
            <span className="block text-[10px] text-neutral-500 dark:text-neutral-400 line-clamp-2 leading-relaxed mb-2 italic">
              "{citation.snippet}"
            </span>
          )}

          <span className="flex items-center justify-between pt-1.5 border-t border-neutral-100 dark:border-white/10 text-[9px]">
            <span className="px-1.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 font-medium border border-emerald-200 dark:border-emerald-800/40">
              {citation.authorityBadge || "Citation Engine Verified"}
            </span>
            {targetUrl && (
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                className="text-blue-500 hover:underline flex items-center gap-0.5 font-medium"
              >
                <span>Visit Source</span>
                <span className="text-[10px]">↗</span>
              </a>
            )}
          </span>
        </span>
      )}
    </span>
  );
}

export function renderFormattedGuideText(
  text: string,
  citations?: WebsiteAssistantMessage["citations"],
  citationStyle: string = "apa"
) {
  if (!text) return null;

  const inlineRegex =
    /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\[(\d+(?:\s*,\s*\d+)*)\]|`([^`]+)`|\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+?)\*|\b_([^_]+)_\b|~~([^~]+)~~/g;

  const parseInline = (str: string): React.ReactNode[] => {
    const nodes: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    inlineRegex.lastIndex = 0;

    while ((match = inlineRegex.exec(str)) !== null) {
      if (match.index > lastIdx) {
        nodes.push(str.slice(lastIdx, match.index));
      }

      if (match[1] !== undefined) {
        const linkTitle = match[1];
        const linkUrl = match[2];
        const isNumeric = /^\d+$/.test(linkTitle.trim());

        if (isNumeric) {
          const num = parseInt(linkTitle.trim(), 10);
          const matchedCite =
            citations && num > 0 && num <= citations.length ? citations[num - 1] : undefined;
          const formattedLabel = matchedCite
            ? formatAskScholarInText(matchedCite, num - 1, citationStyle)
            : `[${linkTitle}]`;

          nodes.push(
            <InlineCitationBadge
              key={`cite-num-${match.index}`}
              num={linkTitle}
              label={formattedLabel}
              url={linkUrl}
              citation={matchedCite}
            />
          );
        } else {
          nodes.push(
            <a
              key={`l-${match.index}`}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium inline-flex items-center gap-0.5 mx-0.5 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{linkTitle}</span>
              <span className="text-[10px]">↗</span>
            </a>
          );
        }
      } else if (match[3] !== undefined) {
        const citeNums = match[3];
        const mIdx = match.index;
        const nums = citeNums.split(",").map((n) => n.trim());

        nodes.push(
          <React.Fragment key={`cite-group-${mIdx}`}>
            {nums.map((numStr, nIdx) => {
              const num = parseInt(numStr, 10);
              const matchedCite =
                citations && num > 0 && num <= citations.length ? citations[num - 1] : undefined;
              const formattedLabel = matchedCite
                ? formatAskScholarInText(matchedCite, num - 1, citationStyle)
                : `[${numStr}]`;
              return (
                <InlineCitationBadge
                  key={`cite-${mIdx}-${nIdx}`}
                  num={numStr}
                  label={formattedLabel}
                  url={matchedCite?.url}
                  citation={matchedCite}
                />
              );
            })}
          </React.Fragment>
        );
      } else if (match[4] !== undefined) {
        nodes.push(
          <code
            key={`c-${match.index}`}
            className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-neutral-200/80 dark:bg-white/10 text-neutral-800 dark:text-neutral-200 font-medium"
          >
            {match[4]}
          </code>
        );
      } else if (match[5] !== undefined || match[6] !== undefined) {
        nodes.push(
          <strong key={`bi-${match.index}`} className="font-semibold text-neutral-900 dark:text-white">
            <em className="italic">{match[5] || match[6]}</em>
          </strong>
        );
      } else if (match[7] !== undefined || match[8] !== undefined) {
        nodes.push(
          <strong key={`b-${match.index}`} className="font-semibold text-neutral-900 dark:text-white">
            {match[7] || match[8]}
          </strong>
        );
      } else if (match[9] !== undefined || match[10] !== undefined) {
        nodes.push(
          <em key={`i-${match.index}`} className="italic text-neutral-800 dark:text-neutral-200">
            {match[9] || match[10]}
          </em>
        );
      } else if (match[11] !== undefined) {
        nodes.push(
          <del key={`d-${match.index}`} className="line-through opacity-70">
            {match[11]}
          </del>
        );
      }

      lastIdx = inlineRegex.lastIndex;
    }

    if (lastIdx < str.length) {
      nodes.push(str.slice(lastIdx));
    }

    return nodes;
  };

  const lines = text.split("\n");
  type Block =
    | { type: "empty" }
    | { type: "hr" }
    | { type: "heading"; level: number; content: string }
    | { type: "bullet"; content: string }
    | { type: "ordered"; num: string; content: string }
    | { type: "blockquote"; content: string }
    | { type: "code_block"; lang: string; code: string }
    | { type: "table"; header: string[]; rows: string[][] }
    | { type: "paragraph"; content: string };

  const blocks: Block[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const rawLine = lines[i];
    const trimmed = rawLine.trim();

    if (trimmed.startsWith("```")) {
      if (inCodeBlock) {
        blocks.push({ type: "code_block", lang: codeBlockLang, code: codeBlockLines.join("\n") });
        inCodeBlock = false;
        codeBlockLang = "";
        codeBlockLines = [];
      } else {
        inCodeBlock = true;
        codeBlockLang = trimmed.slice(3).trim();
        codeBlockLines = [];
      }
      continue;
    }

    if (inCodeBlock) {
      codeBlockLines.push(rawLine);
      continue;
    }

    if (!trimmed) {
      blocks.push({ type: "empty" });
      continue;
    }

    if (trimmed.startsWith("|") && trimmed.endsWith("|")) {
      const cells = trimmed.split("|").slice(1, -1).map((c) => c.trim());
      const isSeparator = cells.length > 0 && cells.every((c) => /^[:\-]+$/.test(c.replace(/\s/g, "")));
      
      const lastBlock = blocks[blocks.length - 1];
      if (lastBlock?.type === "table") {
        if (!isSeparator) {
          lastBlock.rows.push(cells);
        }
      } else {
        if (!isSeparator) {
          blocks.push({ type: "table", header: cells, rows: [] });
        }
      }
      continue;
    }

    if (/^(---|___|\*\*\*)$/.test(trimmed)) {
      blocks.push({ type: "hr" });
      continue;
    }

    const headingMatch = trimmed.match(/^(#{2,6})\s*(.*)$|^(#)\s+(.*)$/);
    if (headingMatch) {
      const hashes = headingMatch[1] || headingMatch[3];
      const headingContent = headingMatch[2] !== undefined ? headingMatch[2] : headingMatch[4];
      blocks.push({
        type: "heading",
        level: hashes.length,
        content: headingContent,
      });
      continue;
    }

    if (trimmed.startsWith(">")) {
      blocks.push({ type: "blockquote", content: trimmed.replace(/^>\s*/, "") });
      continue;
    }

    if (trimmed.startsWith("• ") || trimmed.startsWith("- ") || (trimmed.startsWith("* ") && !trimmed.startsWith("***"))) {
      blocks.push({ type: "bullet", content: trimmed.replace(/^(?:•|-|\*)\s+/, "") });
      continue;
    }

    const orderedMatch = trimmed.match(/^(\d+)[\.\)]\s+(.*)$/);
    if (orderedMatch) {
      blocks.push({ type: "ordered", num: orderedMatch[1], content: orderedMatch[2] });
      continue;
    }

    blocks.push({ type: "paragraph", content: trimmed });
  }

  if (inCodeBlock && codeBlockLines.length > 0) {
    blocks.push({ type: "code_block", lang: codeBlockLang, code: codeBlockLines.join("\n") });
  }

  return (
    <div className="space-y-1.5 text-[13px] leading-relaxed text-inherit">
      {blocks.map((block, idx) => {
        if (block.type === "empty") {
          return <div key={idx} className="h-1.5" />;
        }

        if (block.type === "hr") {
          return <hr key={idx} className="border-neutral-200 dark:border-white/10 my-2.5" />;
        }

        if (block.type === "heading") {
          const lower = block.content.toLowerCase();
          const isConflict =
            lower.includes("conflict") ||
            lower.includes("discrepanc") ||
            lower.includes("cross-verification");
          const isLimitation =
            lower.includes("limitation") ||
            lower.includes("uncertaint") ||
            lower.includes("caveat");

          if (isConflict) {
            return (
              <div
                key={idx}
                className="mt-3 mb-1.5 p-2.5 rounded-xl bg-amber-500/10 dark:bg-amber-500/15 border border-amber-500/30 text-amber-900 dark:text-amber-200"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider mb-1">
                  <Scale className="w-3.5 h-3.5 text-amber-600 dark:text-amber-400" />
                  <span>{parseInline(block.content)}</span>
                </div>
              </div>
            );
          }

          if (isLimitation) {
            return (
              <div
                key={idx}
                className="mt-3 mb-1.5 p-2.5 rounded-xl bg-indigo-500/10 dark:bg-indigo-500/15 border border-indigo-500/30 text-indigo-900 dark:text-indigo-200"
              >
                <div className="flex items-center gap-1.5 font-bold text-xs uppercase tracking-wider mb-1">
                  <Info className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400" />
                  <span>{parseInline(block.content)}</span>
                </div>
              </div>
            );
          }

          if (block.level === 1) {
            return (
              <h3 key={idx} className="font-bold text-sm sm:text-base text-neutral-900 dark:text-neutral-100 pt-2.5 pb-0.5 border-b border-neutral-200/60 dark:border-white/10 tracking-tight">
                {parseInline(block.content)}
              </h3>
            );
          }
          if (block.level === 2) {
            return (
              <h4 key={idx} className="font-bold text-sm text-neutral-900 dark:text-neutral-100 pt-2 pb-0.5 tracking-tight">
                {parseInline(block.content)}
              </h4>
            );
          }
          if (block.level === 3) {
            return (
              <h5 key={idx} className="font-semibold text-[13px] sm:text-sm text-neutral-900 dark:text-neutral-100 pt-1.5 pb-0.5 tracking-tight">
                {parseInline(block.content)}
              </h5>
            );
          }
          return (
            <h6 key={idx} className="font-semibold text-xs text-neutral-800 dark:text-neutral-300 uppercase tracking-wider pt-1 pb-0.5">
              {parseInline(block.content)}
            </h6>
          );
        }

        if (block.type === "bullet") {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-0.5">
              <span className="text-neutral-400 dark:text-neutral-500 font-bold shrink-0 leading-relaxed">•</span>
              <div className="flex-1 min-w-0 leading-relaxed">{parseInline(block.content)}</div>
            </div>
          );
        }

        if (block.type === "ordered") {
          return (
            <div key={idx} className="flex items-start gap-2 pl-1 my-0.5">
              <span className="text-neutral-500 dark:text-neutral-400 font-medium shrink-0 text-xs leading-relaxed min-w-[16px]">{block.num}.</span>
              <div className="flex-1 min-w-0 leading-relaxed">{parseInline(block.content)}</div>
            </div>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote key={idx} className="border-l-2 border-neutral-300 dark:border-neutral-600 pl-3 py-1 my-1.5 italic text-neutral-700 dark:text-neutral-300 text-xs sm:text-[13px]">
              {parseInline(block.content)}
            </blockquote>
          );
        }

        if (block.type === "code_block") {
          return <CodeBlockWithCopy key={idx} lang={block.lang} code={block.code} />;
        }

        if (block.type === "table") {
          return (
            <div key={idx} className="overflow-x-auto my-2 rounded-md border border-neutral-200 dark:border-white/10 shadow-sm scrollbar-hide">
              <table className="w-full text-left text-sm text-neutral-600 dark:text-neutral-300">
                <thead className="bg-neutral-50 dark:bg-white/5 border-b border-neutral-200 dark:border-white/10">
                  <tr>
                    {block.header.map((h, i) => (
                      <th key={i} className="px-3 py-2 font-semibold text-neutral-900 dark:text-neutral-100 uppercase text-xs tracking-wider">
                        {parseInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-200 dark:divide-white/5">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx} className="hover:bg-neutral-50/50 dark:hover:bg-white/[0.02] transition-colors">
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className="px-3 py-2 leading-relaxed">
                          {parseInline(cell)}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }

        const isHeaderLike = block.content.endsWith(":") || block.content.startsWith("👉");

        return (
          <p
            key={idx}
            className={isHeaderLike ? "font-medium text-neutral-900 dark:text-neutral-100 pt-0.5 leading-relaxed" : "leading-relaxed text-inherit"}
          >
            {parseInline(block.content)}
          </p>
        );
      })}
    </div>
  );
}

export function isPlatformQuery(query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return false;

  if (WEBSITE_ASSISTANT_FAQS.some((f) => f.question.toLowerCase() === q || f.shortLabel.toLowerCase() === q)) {
    return true;
  }

  if (
    q.includes("generate code") ||
    q.includes("write code") ||
    q.includes("write a script")
  ) {
    return true;
  }

  const keywords = [
    "how do i set up ai",
    "configure ai",
    "ai provider",
    "byok",
    "bring your own key",
    "knowledge vault",
    "how do i create a research project",
    "create project",
    "new project",
    "evidence phase",
    "add source",
    "adding sources",
    "where can i find my projects",
    "find my projects",
    "journal article workflow",
    "what is scholar ai engine",
    "scholar ai engine",
    "scholar core",
    "what does this feature do",
    "quality gate",
    "citation auditor",
    "academic workspace",
    "academic workspaces",
    "ot-01",
    "ot-10",
    "ot-19",
    "ot-22",
  ];

  return keywords.some((kw) => q.includes(kw));
}

export function answerWebsiteQuestion(query: string): string {
  const q = query.toLowerCase();

  if (
    q.includes("generate code") ||
    q.includes("write code") ||
    q.includes("write a script")
  ) {
    return `I am the Scholar Core Website Assistant, designed strictly to help you understand and navigate the Scholar Core platform, its workflows, and features.

I cannot perform raw software programming or script generation in this navigation guide. To research, outline, and draft academic papers and scholarly projects, submit your inquiry directly to Ask Scholar.`;
  }

  if (q.includes("engine") || q.includes("scholar ai engine")) {
    return `The Scholar AI Engine is the platform's multi-tier orchestration intelligence:
• Autonomous Agent Coordination: Routes tasks to specialized agents (Extraction, Peer Review, Editorial Board, Citation Auditor).
• Dynamic Multi-Tier Routing: Automatically selects the optimal model tier for the task (e.g., deep reasoning for review, speed for citations).
• Zero-Leakage Privacy: Your personal API keys are encrypted strictly on your device and are never exposed or shared.`;
  }

  if (q.includes("ai") || q.includes("key") || q.includes("provider") || q.includes("configure") || q.includes("byok")) {
    return `To configure AI in Scholar Core:
1. Open "AI Access" from the Platform menu in the left sidebar.
2. Select your preferred provider tier:
   • BYOK (Bring Your Own Key): Securely connect Claude, OpenAI, DeepSeek, or Gemini keys directly on your device.
   • Free Tiers: Use free community model allocations.
   • Local Studio: Connect local models via Ollama for 100% offline privacy.
Once connected, the Multi-Agent Editorial Board automatically routes tasks to your active models.`;
  }

  if (q.includes("vault") || q.includes("citation") || q.includes("pdf") || q.includes("zotero") || q.includes("reference")) {
    return `The Knowledge Vault is your secure, private academic repository:
• Open it via "Platform → Knowledge Vault" in the left sidebar.
• Ingest your PDF papers, Zotero libraries, syllabi, or datasets.
• All uploaded literature is semantically indexed on-device or in your private storage.
• Every claim made during project drafting is audited by the Citation Auditor against Vault sources to guarantee 100% provenance.`;
  }

  if (q.includes("create") || q.includes("start") || q.includes("new project") || q.includes("how do i create")) {
    return `To create a research project:
1. Click the "+ New Project" button in the left sidebar, or click any card under "Academic Workspaces" on this dashboard.
2. Choose one of the 4 verified academic formats:
   • Assignment (OT-01): Course essays, structured thinking, and literature synthesis.
   • Journal Article (OT-10): 25-stage empirical research pipeline with peer review.
   • Research Proposal (OT-19): Competitive funding and grant applications.
   • Presentation (OT-22): Conference slides, defense scripts, and keynote summaries.
3. Your workspace launches immediately with interactive gates and milestones.`;
  }

  if (q.includes("evidence") || q.includes("source") || q.includes("data") || q.includes("add source") || q.includes("grounding")) {
    return `The Evidence Phase & Adding Sources (Stages 7–14 in Journal Article workspaces):
• Source Approval: Review candidate literature pulled from your Knowledge Vault, PubMed, or Crossref.
• Evidentiary Locking: Approved sources form an immutable evidence base for drafting.
• Data Extraction: The extraction agent isolates key metrics, sample sizes, and empirical findings.
• You can add sources at any time directly through the Knowledge Vault in the sidebar or within the project workspace by clicking "Add Source".`;
  }

  if (q.includes("journal") || q.includes("25") || q.includes("article") || q.includes("workflow") || q.includes("ot-10")) {
    return `The Journal Article workflow (OT-10) is a rigorous 25-stage publication pipeline:
• Phase I (Stages 1–6): Research domain definition, literature matrix, candidate gap identification, title taxonomy, and title lock.
• Phase II (Stages 7–14): Evidentiary sourcing, source approvals, evidence analysis, and 4-pillar manual review.
• Phase III (Stages 15–18): Peer-reviewed drafting, originality checks, and citation provenance audit.
• Phase IV (Stages 19–21): Multi-agent revision, voice/tone architecture, and author guideline compliance.
• Phase V (Stages 22–25): Final manuscript editing, export to LaTeX/Word/PDF, and submission packaging.`;
  }

  if (q.includes("find") || q.includes("where") || q.includes("list") || q.includes("access") || q.includes("project")) {
    return `You can easily access all your projects in two places:
1. Left Sidebar: Click "Projects" in the left sidebar to jump directly to your projects workspace.
2. Main Dashboard: The "Projects" workspace below gives you search filtering, format tags, and project management controls.`;
  }

  if (q.includes("feature") || q.includes("what does this feature do") || q.includes("gate") || q.includes("rubric")) {
    return `Scholar Core features:
• Quality Gates (G0–G4): Formal sign-offs that ensure research definition, evidence locking, drafting, review, and final export are completed systematically.
• Citation Auditor: Verifies every sentence and claim against approved evidence items to eliminate hallucinations.
• Format Specialization: Dedicated environments for Assignments, Journal Articles, Research Proposals, and Presentations.
• Multi-Account & Theme: Toggle Day/Night modes and switch accounts seamlessly in the sidebar.`;
  }

  return `Scholar Core is an agentic operating system designed for academic and scientific research:
• Workspaces: Boot publication-ready pipelines for Assignments, Journal Articles, Research Proposals, or Presentations.
• Knowledge Vault: Connect your reference papers with zero-hallucination provenance audits.
• AI Access: Bring your own model keys (Claude, OpenAI, Gemini, Local) with multi-tier routing.
• Navigation: Use the left sidebar to access your Projects, Knowledge Vault, and Settings.
Click any suggestion above or ask a specific question about our features!`;
}

export interface AskScholarWorkspacePanelProps {
  isLandingPage: boolean;
  hasStartedChatting: boolean;
  guideMessages: WebsiteAssistantMessage[];
  setGuideMessages: React.Dispatch<React.SetStateAction<WebsiteAssistantMessage[]>>;
  askCitationStyle: AskCitationStyleId;
  setAskCitationStyle: (style: AskCitationStyleId) => void;
  expandedPlanIds: Record<string, boolean>;
  setExpandedPlanIds: React.Dispatch<React.SetStateAction<Record<string, boolean>>>;
  copiedMessageId: string | null;
  setCopiedMessageId: (id: string | null) => void;
  handleBootProjectFromResearch: (msg: WebsiteAssistantMessage) => void;
  handleSendGuideMessage: (
    text?: string,
    attachments?: AgentAttachmentItem[],
    modeOverride?: "normal" | "search" | "deep-research"
  ) => void;
  handleAssistantAction: (action: AssistantAction) => void;
  isGuideThinking: boolean;
  sidebarAiMode: PromptMode;
  setSidebarAiMode: (mode: PromptMode) => void;
  aiStatus: AiOperationalStatus | null;
  onOpenAiAccess?: () => void;
  sidebarAttachments: AgentAttachmentItem[];
  removeSidebarAttachment: (id: string) => void;
  isSidebarUploadingAttachment: boolean;
  guideInput: string;
  setGuideInput: (val: string) => void;
  guideInputRef: React.RefObject<HTMLTextAreaElement | null>;
  handleSidebarFileSelect: (files: FileList | File[]) => void;
  liveSearchGrounding: boolean;
  setLiveSearchGrounding: (val: boolean) => void;
  messagesEndRef: React.RefObject<HTMLDivElement | null>;
  openAuth?: (mode: "signin" | "signup", msg?: string, formatId?: string) => void;
  userEmail?: string | null;
  handleCreate?: (outputTypeId: string) => void;
  creatingFormatId?: string | null;
  creating?: boolean;
  setIsAiSidebarOpen: (open: boolean) => void;
  isSidebarOpen?: boolean;
  setIsSidebarOpen?: React.Dispatch<React.SetStateAction<boolean>>;
  setMobileMenuOpen?: (open: boolean) => void;
}

export function AskScholarWorkspacePanel({
  isLandingPage,
  hasStartedChatting,
  guideMessages,
  setGuideMessages,
  askCitationStyle,
  setAskCitationStyle,
  expandedPlanIds,
  setExpandedPlanIds,
  copiedMessageId,
  setCopiedMessageId,
  handleBootProjectFromResearch,
  handleSendGuideMessage,
  handleAssistantAction,
  isGuideThinking,
  sidebarAiMode,
  setSidebarAiMode,
  aiStatus,
  onOpenAiAccess,
  sidebarAttachments,
  removeSidebarAttachment,
  isSidebarUploadingAttachment,
  guideInput,
  setGuideInput,
  guideInputRef,
  handleSidebarFileSelect,
  liveSearchGrounding,
  setLiveSearchGrounding,
  messagesEndRef,
  openAuth,
  userEmail,
  handleCreate,
  creatingFormatId,
  creating,
  setIsAiSidebarOpen,
  isSidebarOpen,
  setIsSidebarOpen,
  setMobileMenuOpen,
}: AskScholarWorkspacePanelProps) {
  return (
    <div className="h-full flex flex-col w-full">
      {/* Sidebar Header with glassmorphism & elevated badge */}
      <header className="px-5 py-3.5 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md sticky top-0 z-20">
        <div className="flex items-center gap-3">
          {isLandingPage && (
            <>
              {setMobileMenuOpen && (
                <button
                  type="button"
                  onClick={() => setMobileMenuOpen(true)}
                  className="md:hidden p-1.5 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer"
                  aria-label="Open navigation"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
                  </svg>
                </button>
              )}
              {!isSidebarOpen && setIsSidebarOpen && (
                <button
                  type="button"
                  onClick={() => setIsSidebarOpen(true)}
                  className="hidden md:flex items-center gap-1.5 px-2 py-1 rounded-lg border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 text-xs font-medium cursor-pointer transition-all"
                  title="Expand sidebar"
                  aria-label="Expand sidebar"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                    <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18" />
                    <path strokeLinecap="round" strokeLinejoin="round" d="M13 15l3-3-3-3" />
                  </svg>
                  <span>Open Sidebar</span>
                </button>
              )}
            </>
          )}
          <div className="relative flex items-center justify-center">
            <div className="w-8 h-8 rounded-xl bg-gradient-to-tr from-sky-500/10 via-indigo-500/10 to-purple-500/10 dark:from-sky-500/20 dark:via-indigo-500/20 dark:to-purple-500/20 border border-sky-500/20 dark:border-white/10 flex items-center justify-center shadow-2xs">
              <ScholarCoreLogo size="sm" withText={false} className="scale-85" />
            </div>
            <span className="absolute -bottom-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-emerald-500 border-2 border-white dark:border-[#18181B]" title="AI Online" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-bold text-neutral-900 dark:text-neutral-100 tracking-tight">
                Ask Scholar
              </h2>
              <span className="text-[10px] bg-sky-50 dark:bg-sky-950/60 text-sky-600 dark:text-sky-300 px-2 py-0.5 rounded-full font-medium border border-sky-200 dark:border-sky-800/40">
                Research Copilot
              </span>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              How can I help you with your research today?
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <div className="hidden sm:flex items-center gap-1.5 px-2 py-1 rounded-lg bg-neutral-100 dark:bg-white/[0.06] border border-neutral-200/80 dark:border-white/10 text-xs">
            <BookOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" />
            <label htmlFor="ask-scholar-header-citation-style" className="sr-only">
              Referencing Style
            </label>
            <select
              id="ask-scholar-header-citation-style"
              aria-label="Preferred Referencing Style"
              value={askCitationStyle}
              onChange={(e) => {
                const newStyle = e.target.value as AskCitationStyleId;
                setAskCitationStyle(newStyle);
                try {
                  localStorage.setItem("scholar_ask_citation_style", newStyle);
                } catch {
                  // ignore
                }
              }}
              className="bg-transparent text-[11px] font-medium text-neutral-700 dark:text-neutral-300 focus:outline-none cursor-pointer pr-1"
              title="Select referencing style (APA, MLA, Chicago, Harvard, IEEE, Vancouver)"
            >
              {ASK_SCHOLAR_CITATION_STYLES.map((s) => (
                <option key={s.id} value={s.id} className="bg-white dark:bg-neutral-900 text-neutral-900 dark:text-neutral-100">
                  {s.shortLabel}
                </option>
              ))}
            </select>
          </div>

          <button
            type="button"
            onClick={() => {
              const next = !liveSearchGrounding;
              setLiveSearchGrounding(next);
              setLiveSearchGroundingEnabled(next);
            }}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg text-xs font-medium border transition-colors cursor-pointer select-none ${
              liveSearchGrounding
                ? "bg-sky-50 dark:bg-sky-950/60 text-sky-700 dark:text-sky-300 border-sky-300 dark:border-sky-800/60 shadow-2xs"
                : "bg-neutral-100 dark:bg-white/[0.06] text-neutral-600 dark:text-neutral-400 border-neutral-200/80 dark:border-white/10 hover:text-neutral-900 dark:hover:text-white"
            }`}
            title="Toggle Live Web & Scholarly Search Grounding for real-time sources"
            aria-pressed={liveSearchGrounding}
            data-testid="ask-scholar-live-grounding-toggle"
          >
            <span aria-hidden="true">🌐</span>
            <span className="hidden sm:inline">Live Grounding</span>
          </button>

          {hasStartedChatting && (
            <button
              type="button"
              onClick={() => {
                setGuideMessages([]);
              }}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-medium text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white bg-neutral-100 dark:bg-white/[0.06] hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200/80 dark:border-white/10 transition-colors cursor-pointer"
              title="Start a new chat and show deliverable workspaces"
              aria-label="New Chat"
            >
              <Plus className="w-3.5 h-3.5" />
              <span className="hidden sm:inline">New Chat</span>
            </button>
          )}

          <button
            type="button"
            onClick={() => setIsAiSidebarOpen(false)}
            className="p-1.5 text-neutral-400 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/10 transition cursor-pointer"
            title="Close Assistant"
            aria-label="Close Assistant"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Horizontally Scrolling Suggested Questions (Module 3.3) */}
      <div className="relative border-b border-neutral-200/80 dark:border-white/10 shrink-0 bg-neutral-50/70 dark:bg-[#151518]/70">
        <div className={`overflow-x-auto scrollbar-hide flex items-center gap-2 px-4 py-2.5 ${isLandingPage ? "max-w-4xl mx-auto" : ""}`}>
          {WEBSITE_ASSISTANT_FAQS.map((faq, idx) => (
            <button
              key={idx}
              type="button"
              onClick={() => handleSendGuideMessage(faq.question)}
              className="group inline-flex items-center gap-1.5 rounded-full bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white px-3 py-1.5 text-[11px] font-medium whitespace-nowrap cursor-pointer hover:bg-neutral-50 dark:hover:bg-white/10 hover:border-neutral-300 dark:hover:border-white/20 transition-all shadow-2xs shrink-0 active:scale-95"
            >
              <Sparkles className="w-3 h-3 text-neutral-400 group-hover:text-amber-500 transition-colors" />
              <span>{faq.shortLabel}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Scrollable Chat Area */}
      <div className="flex-1 overflow-y-auto px-4 py-4 space-y-4 text-sm scholar-scrollbar">
        {/* Landing Format Tiles if not yet started chatting */}
        {isLandingPage && !hasStartedChatting && (
          <div className="max-w-4xl mx-auto py-6">
            {/* Any assistant greeting messages (e.g. from Reset Chat) */}
            {guideMessages.map((msg) => (
              <div key={msg.id} className="w-full max-w-2xl mx-auto mb-6">
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-neutral-500">
                  <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                    <ScholarCoreLogo size="sm" withText={false} className="scale-75 origin-center" />
                  </div>
                  <span className="font-semibold text-neutral-700 dark:text-neutral-300">Scholar Core</span>
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>
                <div className="rounded-2xl px-4 py-3 bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-neutral-100 rounded-tl-xs shadow-2xs text-[13px] leading-relaxed">
                  {renderFormattedGuideText(msg.text, msg.citations, askCitationStyle)}
                </div>
              </div>
            ))}

            <div className="text-center mb-6">
              <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
                Where will your research begin?
              </h1>
              <p className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-lg mx-auto leading-relaxed">
                Select an academic deliverable or paste your assignment guidelines below.
              </p>
            </div>

            <div className="grid w-full gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
              {FORMAT_TILES.map((tile) => {
                const isBootingThis = creatingFormatId === tile.id;
                const isOtherBooting = Boolean(creating && !isBootingThis);
                const tileTheme = getFormatTileTheme(tile.id);
                return (
                  <button
                    key={tile.id}
                    type="button"
                    onClick={() => {
                      if (creating || !handleCreate) return;
                      if (!userEmail && openAuth) {
                        openAuth("signin", `Sign in to boot your ${tile.label} workspace.`, tile.id);
                        return;
                      }
                      handleCreate(tile.id);
                    }}
                    disabled={isOtherBooting}
                    className={`group bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5 shadow-xs hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[16.5rem] h-auto text-left relative ${
                      isOtherBooting
                        ? "opacity-50 cursor-not-allowed"
                        : isBootingThis
                        ? "ring-2 ring-neutral-400 dark:ring-white/20 cursor-wait"
                        : ""
                    }`}
                  >
                    <div className="flex items-center justify-between w-full">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                        {isBootingThis ? (
                          <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                        ) : (
                          <FormatIcon id={tile.id} className="w-4 h-4" />
                        )}
                      </div>
                    </div>

                    <div className="mt-3.5 mb-2 flex-1 flex flex-col justify-start">
                      <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors leading-snug">
                        {tile.label}
                      </h3>
                      <p className="text-[12px] leading-relaxed font-normal text-neutral-600 dark:text-neutral-400 mt-2 line-clamp-3">
                        {tile.guidance}
                      </p>
                    </div>

                    <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] sm:text-[11.5px] text-neutral-500 dark:text-neutral-500 font-sans leading-tight">
                      {((tile.specs || tile.footer).split(" · ")).map((part, idx) => (
                        <React.Fragment key={idx}>
                          {idx > 0 && <span className="text-neutral-400 dark:text-neutral-500 opacity-60 font-bold">·</span>}
                          <span className="font-medium whitespace-nowrap">{part}</span>
                        </React.Fragment>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Messages Stream */}
        {(!isLandingPage || hasStartedChatting) && (
          <div className={isLandingPage ? "w-full max-w-4xl mx-auto space-y-4 py-2" : "space-y-4"}>
            {guideMessages.map((msg) => (
              <div
                key={msg.id}
                className={`flex flex-col ${msg.sender === "user" ? "items-end" : "items-start"}`}
              >
                <div className="flex items-center gap-1.5 mb-1 px-1 text-[11px] text-neutral-500">
                  {msg.sender === "assistant" ? (
                    <>
                      <div className="w-4 h-4 rounded-full overflow-hidden flex items-center justify-center flex-shrink-0">
                        <ScholarCoreLogo size="sm" withText={false} className="scale-75 origin-center" />
                      </div>
                      <span className="font-semibold text-neutral-700 dark:text-neutral-300">Scholar Core</span>
                      {msg.mode === "deep-research" && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-purple-500/10 text-purple-600 dark:text-purple-300 border border-purple-500/20 font-medium">
                          🔬 Deep Research
                        </span>
                      )}
                      {msg.mode === "search" && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-blue-500/10 text-blue-600 dark:text-blue-300 border border-blue-500/20 font-medium">
                          🔍 Perplexity-Grade Research
                        </span>
                      )}
                      {msg.citations && msg.citations.length > 0 && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20 font-medium">
                          ✓ {msg.citations.length} Verified {msg.citations.length === 1 ? "Source" : "Sources"}
                        </span>
                      )}
                      <span className="px-1.5 py-0.5 rounded text-[9px] bg-sky-500/10 text-sky-700 dark:text-sky-300 border border-sky-500/20 font-mono font-medium">
                        ⚡ {msg.wordCount || msg.text.trim().split(/\s+/).filter(Boolean).length} words
                      </span>
                      {msg.burstinessMetrics && (
                        <span
                          title={`Syntactic burstiness: mean=${msg.burstinessMetrics.averageLength.toFixed(1)} words/sent, variance=${msg.burstinessMetrics.variance.toFixed(1)}`}
                          className="hidden sm:inline-flex px-1.5 py-0.5 rounded text-[9px] bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border border-indigo-500/20 font-mono font-medium"
                        >
                          Burstiness: σ={Math.sqrt(msg.burstinessMetrics.variance).toFixed(1)}
                        </span>
                      )}
                      {msg.provider && (
                        <span className="px-1.5 py-0.5 rounded text-[9px] bg-neutral-500/10 text-neutral-700 dark:text-neutral-300 font-medium">
                          ⚡ {msg.provider}
                        </span>
                      )}
                    </>
                  ) : (
                    <span>You</span>
                  )}
                  <span>•</span>
                  <span>{msg.timestamp}</span>
                </div>

                <div
                  className={`rounded-2xl px-4 py-3 max-w-[88%] leading-relaxed ${
                    msg.sender === "user"
                      ? "bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 shadow-sm rounded-tr-xs"
                      : msg.error
                      ? "bg-red-50 dark:bg-red-950/20 border border-red-200 dark:border-red-900/40 text-neutral-900 dark:text-neutral-200 rounded-tl-xs shadow-2xs"
                      : "bg-white dark:bg-white/[0.04] border border-neutral-200/80 dark:border-white/10 text-neutral-900 dark:text-neutral-100 rounded-tl-xs shadow-2xs"
                  }`}
                >
                  {/* User Attachments Display */}
                  {msg.attachments && msg.attachments.length > 0 && (
                    <div className="flex flex-wrap gap-1.5 mb-2">
                      {msg.attachments.map((att, aIdx) => (
                        <div
                          key={aIdx}
                          className="flex items-center gap-1.5 px-2 py-1 rounded-lg bg-black/20 dark:bg-white/20 text-xs text-white"
                        >
                          {att.isImage ? (
                            att.previewUrl ? (
                              <img src={att.previewUrl} alt={att.name} className="w-5 h-5 object-cover rounded" />
                            ) : (
                              <Paperclip className="w-3.5 h-3.5" />
                            )
                          ) : (
                            <FileText className="w-3.5 h-3.5" />
                          )}
                          <span className="truncate max-w-[150px] font-medium text-[11px]">{att.name}</span>
                        </div>
                      ))}
                    </div>
                  )}

                  {msg.sender === "assistant" ? (
                    renderFormattedGuideText(
                      msg.citations && msg.citations.length > 0 ? stripRawReferencesSection(msg.text) : msg.text,
                      msg.citations,
                      askCitationStyle
                    )
                  ) : (
                    <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.text}</div>
                  )}

                  {/* Deep Research Plan Accordion */}
                  {msg.plan && msg.plan.length > 0 && (
                    <div className="mt-3 rounded-xl bg-purple-500/5 dark:bg-purple-950/20 border border-purple-200/60 dark:border-purple-800/30 text-xs overflow-hidden">
                      <button
                        type="button"
                        onClick={() => setExpandedPlanIds((prev) => ({ ...prev, [msg.id]: !prev[msg.id] }))}
                        className="w-full flex items-center justify-between p-2.5 hover:bg-purple-500/10 dark:hover:bg-purple-900/20 transition-colors cursor-pointer text-left"
                      >
                        <div className="font-semibold text-neutral-800 dark:text-neutral-200 flex items-center gap-1.5">
                          <Compass className="w-3.5 h-3.5 text-purple-500" />
                          <span>Research Trajectory ({msg.plan.length} Steps)</span>
                        </div>
                        <span className="text-neutral-400">
                          {expandedPlanIds[msg.id] !== false ? (
                            <ChevronUp className="w-3.5 h-3.5" />
                          ) : (
                            <ChevronDown className="w-3.5 h-3.5" />
                          )}
                        </span>
                      </button>
                      {expandedPlanIds[msg.id] !== false && (
                        <div className="px-2.5 pb-2.5 pt-0.5 border-t border-purple-200/40 dark:border-purple-800/20">
                          <ul className="space-y-1.5 text-neutral-600 dark:text-neutral-400 text-[11px] pt-1.5">
                            {msg.plan.map((step, sIdx) => (
                              <li key={sIdx} className="flex items-start gap-1.5">
                                <span className="text-purple-500 font-bold shrink-0">✓</span>
                                <span>{step}</span>
                              </li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}

                  {/* Retrieved Live Sources Drawer */}
                  {msg.liveSources && msg.liveSources.length > 0 && (
                    <LiveSourcesDrawer sources={msg.liveSources} />
                  )}

                  {/* Citation Engine References & Bibliography */}
                  {msg.citations && msg.citations.length > 0 && (() => {
                    const styleInfo = getCitationStyleInfo(askCitationStyle);
                    const formattedBib = formatAskScholarBibliography(msg.citations, askCitationStyle);

                    return (
                      <div className="mt-3.5 pt-3 border-t border-neutral-200/80 dark:border-white/10">
                        <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400 mb-2.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            <BookOpen className="w-3.5 h-3.5 text-sky-500 shrink-0" />
                            <span className="truncate">
                              References & Bibliography ({styleInfo.shortLabel})
                            </span>
                          </div>
                          <div className="flex items-center gap-1.5 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                const allBibText = formattedBib
                                  .map((b) => `${b.formattedText}${b.url ? ` ${b.url}` : ""}`)
                                  .join("\n\n");
                                navigator.clipboard.writeText(allBibText);
                                setCopiedMessageId(`bib-${msg.id}`);
                                setTimeout(() => setCopiedMessageId(null), 2000);
                              }}
                              className="text-[10px] normal-case px-2 py-0.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/10 text-neutral-600 dark:text-neutral-300 border border-neutral-200/80 dark:border-white/10 flex items-center gap-1 cursor-pointer transition-colors"
                              title={`Copy all references in ${styleInfo.shortLabel} format`}
                            >
                              {copiedMessageId === `bib-${msg.id}` ? (
                                <>
                                  <Check className="w-3 h-3 text-emerald-500" />
                                  <span className="text-emerald-600 dark:text-emerald-400">Copied!</span>
                                </>
                              ) : (
                                <>
                                  <Copy className="w-3 h-3" />
                                  <span>Copy Bibliography</span>
                                </>
                              )}
                            </button>
                          </div>
                        </div>

                        <div className="space-y-2 text-[11.5px] leading-relaxed text-neutral-700 dark:text-neutral-300 font-sans">
                          {formattedBib.map((entry, bIdx) => (
                            <div key={bIdx} className="pl-3 border-l-2 border-sky-400/50 dark:border-sky-500/40">
                              <span className="font-mono text-[10px] text-sky-600 dark:text-sky-400 font-semibold mr-1.5">
                                [{bIdx + 1}]
                              </span>
                              <span>{entry.formattedText}</span>
                              {entry.url && (
                                <a
                                  href={entry.url}
                                  target="_blank"
                                  rel="noopener noreferrer"
                                  className="ml-1 text-blue-500 hover:underline inline-flex items-center gap-0.5 text-[10px] font-mono"
                                >
                                  <span>link</span>
                                  <span className="text-[9px]">↗</span>
                                </a>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })()}

                  {/* 1-Click Workspace Handoff Banner */}
                  {msg.sender === "assistant" && msg.recommendedWorkspaceHandoff && (
                    <div className="mt-3.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shadow-2xs">
                      <div className="flex items-start gap-2.5 min-w-0">
                        <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0">
                          <FolderPlus className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 flex-wrap">
                            <span>
                              Launch in {msg.recommendedWorkspaceHandoff.formatLabel} ({msg.recommendedWorkspaceHandoff.targetFormatId})
                            </span>
                            {msg.recommendedWorkspaceHandoff.retrievedSources.length > 0 && (
                              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-medium">
                                {msg.recommendedWorkspaceHandoff.retrievedSources.length} Verified Sources Attached
                              </span>
                            )}
                          </div>
                          <p className="text-[11px] text-neutral-600 dark:text-neutral-400 mt-0.5 line-clamp-2">
                            Transition this executive brief into a full-length, structured{" "}
                            {msg.recommendedWorkspaceHandoff.formatLabel} with evidentiary matrices and quality gates.
                          </p>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleBootProjectFromResearch(msg)}
                        className="w-full sm:w-auto px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>
                          Launch in 4-Phase Essay Engine ({msg.recommendedWorkspaceHandoff.targetFormatId}) with Verified Sources
                        </span>
                        <ArrowRight className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  )}

                  {/* Action Bar for Assistant Messages */}
                  {msg.sender === "assistant" && (
                    <div className="mt-3 pt-2 border-t border-neutral-200/60 dark:border-white/10 flex items-center justify-between text-xs text-neutral-500">
                      <div className="flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            navigator.clipboard.writeText(msg.text);
                            setCopiedMessageId(msg.id);
                            setTimeout(() => setCopiedMessageId(null), 2000);
                          }}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                          title="Copy text"
                        >
                          {copiedMessageId === msg.id ? (
                            <>
                              <Check className="w-3 h-3 text-emerald-500" />
                              <span className="text-emerald-600 dark:text-emerald-400">Copied</span>
                            </>
                          ) : (
                            <>
                              <Copy className="w-3 h-3" />
                              <span>Copy</span>
                            </>
                          )}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleBootProjectFromResearch(msg)}
                          className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-emerald-50 dark:hover:bg-emerald-950/30 text-emerald-600 dark:text-emerald-400 transition-colors cursor-pointer font-medium"
                          title="Initialize a new academic project workspace populated with this research"
                        >
                          <FolderPlus className="w-3 h-3 text-emerald-500" />
                          <span>Boot Project</span>
                        </button>

                        {msg.mode !== "deep-research" && (
                          <button
                            type="button"
                            onClick={() => {
                              setSidebarAiMode("deep_research");
                              const lastUserMsg = guideMessages.filter((m) => m.sender === "user").slice(-1)[0];
                              if (lastUserMsg) {
                                handleSendGuideMessage(lastUserMsg.text, undefined, "deep-research");
                              }
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-purple-50 dark:hover:bg-purple-950/30 text-purple-600 dark:text-purple-400 transition-colors cursor-pointer"
                            title="Conduct comprehensive deep research on this topic"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>Deep Research</span>
                          </button>
                        )}
                      </div>

                      {msg.model && (
                        <span className="text-[10px] text-neutral-400 font-mono truncate max-w-[120px]">
                          {msg.model}
                        </span>
                      )}
                    </div>
                  )}

                  {/* Quick Action Deep-Links */}
                  {msg.action && (
                    <div className="mt-3 pt-2.5 border-t border-neutral-200 dark:border-white/10">
                      <button
                        type="button"
                        onClick={() => handleAssistantAction(msg.action!)}
                        className="inline-flex items-center gap-1 text-[11px] bg-blue-50 dark:bg-white/10 text-blue-600 dark:text-blue-300 border border-blue-200 dark:border-blue-500/30 px-2.5 py-1 rounded-md hover:bg-blue-100 dark:hover:bg-white/15 transition font-medium cursor-pointer"
                      >
                        <span>{msg.action.label}</span>
                      </button>
                    </div>
                  )}

                  {/* Dynamic Follow-Up Questions ("Related Inquiries") */}
                  {msg.sender === "assistant" && msg.followUps && msg.followUps.length > 0 && (
                    <div className="mt-3 pt-2.5 border-t border-neutral-200/60 dark:border-white/10 space-y-1.5">
                      <div className="flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">
                        <Lightbulb className="w-3 h-3 text-amber-500" />
                        <span>Related Inquiries</span>
                      </div>
                      <div className="flex flex-wrap gap-1.5">
                        {msg.followUps.map((fu, fuIdx) => (
                          <button
                            key={fuIdx}
                            type="button"
                            onClick={() =>
                              handleSendGuideMessage(
                                fu,
                                undefined,
                                msg.mode === "deep-research" ? "deep-research" : msg.mode === "search" ? "search" : "normal"
                              )
                            }
                            className="text-[11px] text-left px-2.5 py-1 rounded-lg bg-neutral-100 dark:bg-white/[0.06] hover:bg-sky-50 dark:hover:bg-sky-950/40 hover:border-sky-300 dark:hover:border-sky-500/30 border border-neutral-200/60 dark:border-white/10 text-neutral-700 dark:text-neutral-300 hover:text-sky-600 dark:hover:text-sky-400 transition-colors cursor-pointer inline-flex items-center gap-1 group"
                          >
                            <span>{fu}</span>
                            <ArrowRight className="w-2.5 h-2.5 opacity-0 group-hover:opacity-100 transition-opacity text-sky-500 shrink-0" />
                          </button>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ))}

            {isGuideThinking && (
              <div className="flex items-start gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-sky-500/5 via-purple-500/5 to-transparent dark:from-sky-500/10 dark:via-purple-500/10 dark:to-transparent border border-sky-200/60 dark:border-white/10 shadow-xs animate-in fade-in">
                <div className="relative flex items-center justify-center shrink-0 mt-0.5">
                  <div className="w-6 h-6 rounded-full bg-white dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 flex items-center justify-center shadow-xs">
                    <ScholarCoreLogo size="sm" withText={false} className="scale-75 animate-spin" />
                  </div>
                  <span className="absolute -top-0.5 -right-0.5 w-2.5 h-2.5 rounded-full bg-sky-500 animate-ping" />
                </div>
                <div className="flex flex-col gap-1 min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-xs text-neutral-900 dark:text-neutral-100">
                      {sidebarAiMode === "deep_research"
                        ? "Scholarly Deep Research in Progress"
                        : sidebarAiMode === "search"
                        ? "Live Multi-Vector Search & Verification"
                        : "Scholar Core Reasoning"}
                    </span>
                    <span className="text-[10px] font-mono text-purple-600 dark:text-purple-400 bg-purple-50 dark:bg-purple-950/40 px-1.5 py-0.2 rounded-full border border-purple-200 dark:border-purple-800/40 animate-pulse">
                      Active
                    </span>
                  </div>
                  <p className="text-[11px] text-neutral-500 dark:text-neutral-400 leading-relaxed">
                    {sidebarAiMode === "deep_research"
                      ? "Formulating multi-angle inquiries, querying academic repositories, and validating citation authenticity..."
                      : sidebarAiMode === "search"
                      ? "Searching authoritative sources and cross-checking evidence..."
                      : "Analyzing research context and synthesizing findings..."}
                  </p>
                  <div className="w-full h-1 bg-neutral-200/60 dark:bg-white/10 rounded-full overflow-hidden mt-1">
                    <div className="h-full bg-gradient-to-r from-sky-500 via-purple-500 to-indigo-500 w-1/2 rounded-full animate-[pulse_1.5s_ease-in-out_infinite]" />
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        )}
      </div>

      {/* Floating Input Component */}
      <div className="p-3.5 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md border-t border-neutral-200/80 dark:border-white/10 shrink-0">
        <div className={isLandingPage ? "w-full max-w-4xl mx-auto" : "w-full"}>
          {/* Status & Reset Bar */}
          <div className="flex items-center justify-between px-1 mb-2">
            <div className="flex items-center gap-1.5 text-[11px] text-neutral-500 dark:text-neutral-400">
              <ScholarCoreLogo size="sm" withText={false} className="scale-75" />
              <span className="font-medium text-neutral-700 dark:text-neutral-300">Ask Scholar</span>
              {aiStatus ? (
                aiStatus.connected ? (
                  <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400 font-semibold" title={`Operational provider: ${aiStatus.provider || "Operational"}`}>
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                    <span>{aiStatus.statusText}</span>
                  </span>
                ) : (
                  <button
                    type="button"
                    onClick={onOpenAiAccess}
                    className="text-amber-600 dark:text-amber-400 font-medium hover:underline cursor-pointer flex items-center gap-1"
                    title="No operational AI providers. Click to configure AI Access."
                  >
                    <span className="w-1.5 h-1.5 rounded-full bg-amber-500" />
                    <span>AI Disconnected</span>
                    <span className="text-[9px] underline">Configure ↗</span>
                  </button>
                )
              ) : (
                <span className="text-neutral-400 text-[10px] animate-pulse">• Checking AI...</span>
              )}
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                aria-label="Reset Chat"
                onClick={() =>
                  setGuideMessages([
                    {
                      id: "reset-assistant",
                      sender: "assistant",
                      text: "Hello! I am your Scholar Core Website Assistant. Ask me anything about how to navigate the platform, configure AI, manage your Knowledge Vault, or create research projects.",
                      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
                    },
                  ])
                }
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-neutral-100 hover:bg-neutral-100 dark:hover:bg-white/10 transition-colors cursor-pointer"
                title="Reset conversation"
              >
                <RotateCcw className="w-3 h-3" />
                <span>Reset</span>
              </button>
            </div>
          </div>

          {/* Pending Attachments Chips in Sidebar */}
          {sidebarAttachments.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 mb-2 px-1">
              {sidebarAttachments.map((att) => (
                <div
                  key={att.id}
                  className="flex items-center gap-1.5 px-2 py-0.5 rounded-xl bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 text-xs text-neutral-800 dark:text-neutral-200 shadow-2xs animate-in fade-in"
                >
                  {att.isImage ? (
                    att.previewUrl ? (
                      <img src={att.previewUrl} alt={att.name} className="w-4 h-4 object-cover rounded" />
                    ) : (
                      <Paperclip className="w-3.5 h-3.5 text-blue-500" />
                    )
                  ) : (
                    <FileText className="w-3.5 h-3.5 text-amber-500" />
                  )}
                  <span className="truncate max-w-[140px] font-medium text-[11px]">{att.name}</span>
                  <button
                    type="button"
                    onClick={() => removeSidebarAttachment(att.id)}
                    className="text-neutral-400 hover:text-red-500 p-0.5 rounded-full hover:bg-neutral-200 dark:hover:bg-white/10 cursor-pointer transition-colors"
                    title="Remove attachment"
                    aria-label="Remove attachment"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              ))}
              {isSidebarUploadingAttachment && (
                <span className="text-[11px] text-neutral-400 flex items-center gap-1.5 animate-pulse">
                  <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> Parsing attachment...
                </span>
              )}
            </div>
          )}

          {/* Input Wrapper Pill */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              handleSendGuideMessage();
            }}
            className="relative flex flex-col rounded-2xl bg-neutral-100/90 dark:bg-white/[0.06] p-2.5 shadow-xs border border-neutral-200 dark:border-white/10 focus-within:border-neutral-400 dark:focus-within:border-white/25 focus-within:bg-white dark:focus-within:bg-[#1E1E20] focus-within:shadow-md transition-all"
          >
            <div className="w-full px-1">
              <textarea
                ref={guideInputRef}
                rows={1}
                value={guideInput}
                onChange={(e) => {
                  setGuideInput(e.target.value);
                  e.target.style.height = "auto";
                  e.target.style.height = `${Math.min(e.target.scrollHeight, 130)}px`;
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    if (guideInput.trim() || sidebarAttachments.length > 0) {
                      handleSendGuideMessage();
                    }
                  } else if (e.key === "Backspace" && guideInput === "" && sidebarAttachments.length > 0) {
                    removeSidebarAttachment(sidebarAttachments[sidebarAttachments.length - 1].id);
                  }
                }}
                placeholder="Ask anything, search projects, or type a command..."
                style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent" }}
                className="w-full bg-transparent border-none outline-none focus:outline-none focus:ring-0 text-[13px] text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 shadow-none focus:shadow-none resize-none prompt-bare-input max-h-32 min-h-[36px] overflow-y-auto scholar-scrollbar leading-relaxed"
              />
            </div>

            <div className="flex items-center justify-between pt-1.5 mt-1 border-t border-neutral-200/50 dark:border-white/5">
              <div className="flex items-center gap-2">
                <PromptBarActionMenu
                  currentMode={sidebarAiMode}
                  onSelectMode={setSidebarAiMode}
                  onAttachFiles={handleSidebarFileSelect}
                />
                <label
                  htmlFor="ask-scholar-input-live-toggle"
                  className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[11px] font-medium text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white cursor-pointer select-none transition-colors border border-neutral-200/60 dark:border-white/10 bg-neutral-50 dark:bg-white/5"
                  title="Ground responses in fresh web & scholarly data"
                >
                  <input
                    id="ask-scholar-input-live-toggle"
                    data-testid="ask-scholar-live-grounding-toggle"
                    type="checkbox"
                    checked={liveSearchGrounding}
                    onChange={(e) => {
                      const next = e.target.checked;
                      setLiveSearchGrounding(next);
                      setLiveSearchGroundingEnabled(next);
                    }}
                    className="rounded border-neutral-300 dark:border-neutral-700 text-sky-600 focus:ring-sky-500 cursor-pointer w-3.5 h-3.5"
                  />
                  <span>🌐 Live Grounding</span>
                </label>
              </div>

              <div className="relative group">
                <button
                  type="submit"
                  disabled={(!guideInput.trim() && sidebarAttachments.length === 0) || isGuideThinking}
                  className={`h-7 px-2.5 rounded-full flex items-center justify-center gap-1 transition-all duration-200 cursor-pointer ${
                    (guideInput.trim() || sidebarAttachments.length > 0) && !isGuideThinking
                      ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 shadow-xs active:scale-95"
                      : "bg-neutral-200 dark:bg-white/10 text-neutral-400 dark:text-neutral-500 cursor-not-allowed"
                  }`}
                  title="Send question (Enter)"
                  aria-label="Send question"
                >
                  {isGuideThinking ? (
                    <span className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <>
                      <ArrowUp className="w-3.5 h-3.5 stroke-[2.5]" />
                      <span className="text-[10px] font-mono opacity-60">↵</span>
                    </>
                  )}
                </button>
                <span className="hidden group-hover:block absolute bottom-full mb-2 right-0 px-2 py-1 text-[11px] bg-neutral-900 text-white dark:bg-neutral-800 rounded shadow-md whitespace-nowrap pointer-events-none z-30">
                  Send question (Enter)
                </span>
              </div>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

export default AskScholarWorkspacePanel;
