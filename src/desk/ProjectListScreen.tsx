import React, { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  createProject,
  listOutputTypes,
  listProjects,
  deleteProject,
  saveIntakeAnswers,
  executeAgenticLLM,
  executeAgenticQuery,
  getAiOperationalStatus,
  parseFileForAgent,
  type AiOperationalStatus,
  type AgenticQueryResponse,
} from "./api";
import {
  isDuplicateProjectTitle,
  getNextUntitledProjectTitle,
  findReusableEmptyProject,
  isBlankProject,
  getProjectDisplayName,
  matchesProjectSearch,
  deduplicateProjectList,
} from "./projectNaming";
import { getSupabaseClient } from "../services/supabaseClient";
import { hasVaultPassphraseOnThisDevice } from "../services/userVault";
import { syncActiveSessionToRegistry } from "../services/auth/multiAccountService";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";
import UserAccountMenu from "./components/UserAccountMenu";
import EmbeddedAuthModal from "./auth/EmbeddedAuthModal";
import VaultScreen from "./vault/VaultScreen";
import KnowledgeVault from "./vault/KnowledgeVault";
import AiAccessPage, { type SectionId } from "./aiAccess/AiAccessPage";
import { CommandPalette } from "./components/CommandPalette";
import {
  Plus,
  ArrowUp,
  ArrowRight,
  X,
  RotateCcw,
  Lightbulb,
  Search,
  Database,
  Sliders,
  MessageSquare,
  MoreVertical,
  Share2,
  Pin,
  Pencil,
  FolderPlus,
  Trash2,
  FileText,
  Sun,
  Moon,
  Paperclip,
  Globe,
  Compass,
  ExternalLink,
  Loader2,
  Sparkles,
  ShieldCheck,
  Copy,
  Check,
  ChevronDown,
  ChevronUp,
  Zap,
  Scale,
  Info,
  BookOpen,
  BookmarkCheck,
  Presentation,
} from "lucide-react";
import { getCloudProvider } from "../config/providerCatalog";
import { loadUserAiSettings } from "../services/userAiSettings";
import { PromptBarActionMenu, type PromptMode } from "./PromptBarActionMenu";
import {
  ASK_SCHOLAR_CITATION_STYLES,
  getCitationStyleInfo,
  formatAskScholarInText,
  formatAskScholarBibliography,
  stripRawReferencesSection,
  type AskCitationStyleId,
} from "./scholarCitationEngine";
import {
  getLiveSearchGroundingEnabled,
  setLiveSearchGroundingEnabled,
  onLiveSearchGroundingChange,
  executeLiveSearch,
  injectLiveGroundingToSystemPrompt,
  type LiveSearchResult,
} from "../services/liveSearchService";
import LiveSourcesDrawer from "./components/LiveSourcesDrawer";

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

/** Curated 4 essential academic formats */
export const FORMAT_TILES = [
  {
    id: "OT-01",
    label: "Coursework & Essays",
    title: "Coursework & Essays",
    guidance: "Guides you through thesis formulation, marking rubric alignment, critical argument synthesis, and citation formatting.",
    specs: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    footer: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    usp: "Marking Rubric Alignment · Argument Synthesis",
    features: "Structured Outline · Rubric Matched · 800 – 4,000 words",
    budget: "Structured Outline · Rubric Matched · 800 – 4,000 words",
  },
  {
    id: "OT-10",
    label: "Journal Article",
    title: "Journal Article",
    guidance: "Structures formal IMRaD manuscripts with deep literature synthesis, methodology validation, and peer-review readiness.",
    specs: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    footer: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    usp: "Peer-Review Standard · IMRaD Methodology",
    features: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
    budget: "IMRaD Architecture · Peer Review · 4,000 – 10,000 words",
  },
  {
    id: "OT-19",
    label: "Research Proposal",
    title: "Research Proposal",
    guidance: "Guides research question definition, literature gap identification, theoretical frameworks, and methodology design.",
    specs: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    footer: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    usp: "Literature Gap Analysis · Ethical Frameworks",
    features: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
    budget: "Gap Analysis · Ethics & Methodology · 3,000 – 15,000 words",
  },
  {
    id: "OT-22",
    label: "Slides & Keynotes",
    title: "Slides & Keynotes",
    guidance: "Converts academic papers into visual presentation slides with scripted speaker notes and executive takeaways.",
    specs: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    footer: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    usp: "Speaker Notes Scripting · Visual Layouts",
    features: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
    budget: "Slide Deck Outline · Scripted Speaker Notes · 10 – 35 slides",
  },
];

export const STAGE_BREAKDOWNS: Record<string, { phases: string[]; highlights: string }> = {
  "OT-01": {
    highlights: "Rigorous coursework workflow with syllabus alignment and citation provenance audit.",
    phases: [
      "Phase I: Assignment Scope & Rubric Analysis",
      "Phase II: Knowledge Vault Evidence Ingestion",
      "Phase III: Grounded Multi-Section Drafting",
      "Phase IV: Citation Auditor & Defense Script",
    ],
  },
  "OT-10": {
    highlights: "Full 25-stage peer-reviewed pipeline for high-impact journal submissions.",
    phases: [
      "Phase I (Stages 1–6): Domain Mapping & Gap Lock",
      "Phase II (Stages 7–14): Evidentiary Matrix & Vault Audit",
      "Phase III (Stages 15–18): Peer-Reviewed Agentic Drafting",
      "Phase IV (Stages 19–21): Academic Voice & Guideline Fit",
      "Phase V (Stages 22–25): LaTeX/PDF Export & Sign-Off",
    ],
  },
  "OT-19": {
    highlights: "Competitive grant and doctoral funding proposal generation pipeline.",
    phases: [
      "Phase I: Specific Aims & Novelty Justification",
      "Phase II: Methodological Feasibility & Data Plan",
      "Phase III: Milestone Timelines & Budget Defense",
    ],
  },
  "OT-22": {
    highlights: "Keynote presentation and conference defense slide deck architecture.",
    phases: [
      "Phase I: Core Thesis & Narrative Arc",
      "Phase II: Slide Progression & Evidence Visuals",
      "Phase III: Speaker Notes & Anticipated Defense Q&A",
    ],
  },
};

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
  {
    question: "How do I set up AI?",
    shortLabel: "How do I set up AI?",
  },
  {
    question: "What is Knowledge Vault?",
    shortLabel: "What is Knowledge Vault?",
  },
  {
    question: "How do I create a research project?",
    shortLabel: "How do I create a research project?",
  },
  {
    question: "What is the Evidence phase?",
    shortLabel: "What is the Evidence phase?",
  },
  {
    question: "How do I add sources?",
    shortLabel: "How do I add sources?",
  },
  {
    question: "Where can I find my projects?",
    shortLabel: "Where can I find my projects?",
  },
  {
    question: "How does the Journal Article workflow work?",
    shortLabel: "Journal Article workflow?",
  },
  {
    question: "What is Scholar AI Engine?",
    shortLabel: "What is Scholar AI Engine?",
  },
  {
    question: "How do I configure an AI provider?",
    shortLabel: "Configure AI provider?",
  },
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
    <div className="my-2 rounded-xl bg-neutral-900 dark:bg-black/80 border border-neutral-800 dark:border-white/10 overflow-hidden shadow-2xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/5 text-[10px] font-mono text-neutral-400">
        <span className="uppercase tracking-wider font-semibold">{lang || "code"}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-white transition-colors cursor-pointer"
          title="Copy code to clipboard"
        >
          {copied ? <Check className="w-3 h-3 text-emerald-400" /> : <Copy className="w-3 h-3" />}
          <span>{copied ? "Copied" : "Copy"}</span>
        </button>
      </div>
      <pre className="p-3 text-xs font-mono text-neutral-200 overflow-x-auto scholar-scrollbar leading-relaxed">
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
  const targetUrl = url || (citation as any)?.doi || citation?.url;
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

      {/* Citation Engine Verified Hover Card Popover */}
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
        // Link: [title](url)
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
        // Numeric Bracket Citation: [1], [2], [1, 2]
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
        // Inline code: `code`
        nodes.push(
          <code
            key={`c-${match.index}`}
            className="px-1.5 py-0.5 rounded text-[11px] font-mono bg-neutral-200/80 dark:bg-white/10 text-neutral-800 dark:text-neutral-200 font-medium"
          >
            {match[4]}
          </code>
        );
      } else if (match[5] !== undefined || match[6] !== undefined) {
        // Bold-italic: ***text*** or ___text___
        nodes.push(
          <strong key={`bi-${match.index}`} className="font-semibold text-neutral-900 dark:text-white">
            <em className="italic">{match[5] || match[6]}</em>
          </strong>
        );
      } else if (match[7] !== undefined || match[8] !== undefined) {
        // Bold: **text** or __text__
        nodes.push(
          <strong key={`b-${match.index}`} className="font-semibold text-neutral-900 dark:text-white">
            {match[7] || match[8]}
          </strong>
        );
      } else if (match[9] !== undefined || match[10] !== undefined) {
        // Italic: *text* or _text_
        nodes.push(
          <em key={`i-${match.index}`} className="italic text-neutral-800 dark:text-neutral-200">
            {match[9] || match[10]}
          </em>
        );
      } else if (match[11] !== undefined) {
        // Strikethrough: ~~text~~
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

  // Block parser
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
      const cells = trimmed.split("|").slice(1, -1).map(c => c.trim());
      const isSeparator = cells.length > 0 && cells.every(c => /^[:\-]+$/.test(c.replace(/\s/g, '')));
      
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

  // Exact matches for FAQ questions or short labels
  if (WEBSITE_ASSISTANT_FAQS.some((f) => f.question.toLowerCase() === q || f.shortLabel.toLowerCase() === q)) {
    return true;
  }

  // Non-academic raw code generation requests in support chat
  if (
    q.includes("generate code") ||
    q.includes("write code") ||
    q.includes("write a script")
  ) {
    return true;
  }

  // Common platform feature keywords
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

  // Guardrail: Decline non-academic raw code generation in navigation chat
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


export type DashboardView = "projects" | "vault" | "ai-access";

/**
 * Desk's entry surface: the signed-in user's own projects — transformed into
 * the SCHOLAR CORE Research Command Center.
 */
export default function ProjectListScreen({
  onOpen,
  userEmail = null,
  userId = null,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
  showWelcome,
  onWelcomeSeen,
  initialView = "projects",
  aiAccessSection,
  onAiAccessSectionChange,
}: {
  onOpen: (projectId: string) => void;
  userEmail: string | null;
  userId?: string | null;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  showWelcome?: boolean;
  onWelcomeSeen?: () => void;
  initialView?: DashboardView;
  aiAccessSection?: SectionId;
  onAiAccessSectionChange?: (next: SectionId) => void;
}) {
  const [activeView, setActiveView] = useState<DashboardView>(() => initialView ?? "projects");
  const [isMounted, setIsMounted] = useState<boolean>(false);

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (initialView) {
      setActiveView(initialView);
    }
  }, [initialView]);

  // Core Workspace State (Initialized at the top of component)
  const [creating, setCreating] = useState(false);
  const [creatingFormatId, setCreatingFormatId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // In-Page Auth Modal State & Handlers
  const location = useLocation();
  const navigate = useNavigate();
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalMode, setAuthModalMode] = useState<"signin" | "signup">("signin");
  const [authModalMessage, setAuthModalMessage] = useState<string | undefined>(undefined);
  const [pendingFormatId, setPendingFormatId] = useState<string | undefined>(undefined);

  const openAuth = useCallback((mode: "signin" | "signup" = "signin", message?: string, formatId?: string) => {
    setAuthModalMode(mode);
    setAuthModalMessage(message);
    setPendingFormatId(formatId);
    setAuthModalOpen(true);
  }, []);

  const closeAuth = useCallback(() => {
    setAuthModalOpen(false);
    setAuthModalMessage(undefined);
    setPendingFormatId(undefined);
    if (location.pathname === "/signin" || location.pathname === "/signup" || location.search.includes("auth=")) {
      navigate("/projects", { replace: true });
    }
  }, [location.pathname, location.search, navigate]);

  const handleCloseCentralView = useCallback(() => {
    if (location.pathname !== "/projects") {
      navigate("/projects");
    }
    setActiveView("projects");
  }, [location.pathname, navigate]);

  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const deletedProjectIdsRef = useRef<Set<string>>(new Set());

  // Initialize from sessionStorage to prevent zombie project resurrection across fast reloads/nav
  useEffect(() => {
    try {
      const stored = sessionStorage.getItem("scholar_deleted_project_ids");
      if (stored) {
        const arr = JSON.parse(stored);
        if (Array.isArray(arr)) {
          arr.forEach((id) => deletedProjectIdsRef.current.add(id));
        }
      }
    } catch {
      // ignore
    }
  }, []);

  const markProjectAsDeleted = useCallback((id: string) => {
    deletedProjectIdsRef.current.add(id);
    try {
      const arr = Array.from(deletedProjectIdsRef.current);
      sessionStorage.setItem("scholar_deleted_project_ids", JSON.stringify(arr));
    } catch {
      // ignore
    }
  }, []);

  const unmarkProjectAsDeleted = useCallback((id: string) => {
    deletedProjectIdsRef.current.delete(id);
    try {
      const arr = Array.from(deletedProjectIdsRef.current);
      sessionStorage.setItem("scholar_deleted_project_ids", JSON.stringify(arr));
    } catch {
      // ignore
    }
  }, []);

  const isCreatingRef = useRef(false);

  const handleCreate = useCallback(async (outputTypeId: string) => {
    if (!userEmail) {
      const tile = FORMAT_TILES.find((t) => t.id === outputTypeId);
      openAuth("signup", `Sign in or create an account to initialize your ${tile?.label || "research"} workspace.`, outputTypeId);
      return;
    }
    if (creating || isCreatingRef.current) return;

    // Check if an existing zero-content draft of this format exists to reuse and prevent project bloat
    const reusable = findReusableEmptyProject(projects || [], outputTypeId);
    if (reusable && reusable.projectId) {
      onOpen(reusable.projectId);
      return;
    }

    // Also check session storage for any untouched empty project stub generated in this session
    try {
      const sessionEmptyId = sessionStorage.getItem("scholar_session_empty_project_id");
      if (sessionEmptyId) {
        const found = projects?.find((p) => p.projectId === sessionEmptyId && (!outputTypeId || p.outputTypeId === outputTypeId));
        if (found && isBlankProject(found)) {
          onOpen(found.projectId);
          return;
        }
      }
    } catch {
      // ignore
    }

    isCreatingRef.current = true;
    setCreating(true);
    setCreatingFormatId(outputTypeId);
    setError(null);
    try {
      const project = await createProject(outputTypeId);
      // Auto-assign unique default project title (Untitled Project, Untitled Project 1, ...)
      const defaultTitle = getNextUntitledProjectTitle(projects || []);
      await Promise.resolve(saveIntakeAnswers(project.projectId, { title: defaultTitle })).catch(() => {});

      if (project.answers) {
        project.answers.title = defaultTitle;
      } else {
        project.answers = { title: defaultTitle };
      }

      try {
        sessionStorage.setItem("scholar_session_empty_project_id", project.projectId);
      } catch {
        // ignore
      }

      onOpen(project.projectId);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
      setCreatingFormatId(null);
    } finally {
      isCreatingRef.current = false;
    }
  }, [userEmail, creating, openAuth, onOpen, projects]);

  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(() => showWelcome ?? false);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);
  const [isAiSidebarOpen, setIsAiSidebarOpen] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  // Command Palette & Resizable Assistant Split-Pane States
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [aiSidebarWidth, setAiSidebarWidth] = useState<number>(450);
  const [isResizingAiSidebar, setIsResizingAiSidebar] = useState<boolean>(false);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const auth = params.get("auth");
    if (location.pathname === "/signin" || auth === "signin" || location.search.includes("login")) {
      openAuth("signin");
    } else if (location.pathname === "/signup" || auth === "signup") {
      openAuth("signup");
    }
  }, [location.pathname, location.search, openAuth]);

  // Dynamic Day/Night mode theme state with instant switching and localStorage persistence
  const [theme, setTheme] = useState<"light" | "dark">(() => {
    if (typeof window !== "undefined") {
      const stored = localStorage.getItem("scholar-theme") || localStorage.getItem("theme");
      if (stored === "light" || stored === "dark") return stored;
      if (document.documentElement.getAttribute("data-theme") === "light") {
        return "light";
      }
      if (document.documentElement.classList.contains("dark") || document.documentElement.getAttribute("data-theme") === "dark") {
        return "dark";
      }
    }
    return "dark";
  });

  const transitionTimeoutRef = useRef<number | null>(null);

  const toggleTheme = useCallback(() => {
    const nextTheme = theme === "dark" ? "light" : "dark";

    const applyThemeToDOM = (t: "light" | "dark") => {
      if (typeof document !== "undefined") {
        document.documentElement.setAttribute("data-theme", t);
        if (t === "dark") {
          document.documentElement.classList.add("dark");
        } else {
          document.documentElement.classList.remove("dark");
        }
      }
      try {
        localStorage.setItem("scholar-theme", t);
        localStorage.setItem("theme", t);
      } catch {}
    };

    if (typeof document !== "undefined") {
      document.documentElement.classList.add("theme-transition");
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
      transitionTimeoutRef.current = window.setTimeout(() => {
        document.documentElement.classList.remove("theme-transition");
        transitionTimeoutRef.current = null;
      }, 200);
    }

    if (
      typeof document !== "undefined" &&
      "startViewTransition" in document &&
      typeof (document as any).startViewTransition === "function" &&
      !window.matchMedia?.("(prefers-reduced-motion: reduce)").matches
    ) {
      (document as any).startViewTransition(() => {
        applyThemeToDOM(nextTheme);
        setTheme(nextTheme);
      });
    } else {
      applyThemeToDOM(nextTheme);
      setTheme(nextTheme);
    }
  }, [theme]);

  useEffect(() => {
    return () => {
      if (transitionTimeoutRef.current !== null) {
        window.clearTimeout(transitionTimeoutRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (typeof document === "undefined") return;
    document.documentElement.setAttribute("data-theme", theme);
    if (theme === "dark") {
      document.documentElement.classList.add("dark");
    } else {
      document.documentElement.classList.remove("dark");
    }
  }, [theme]);

  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
  }, []);

  // Global keyboard shortcut (⌘K / Ctrl+K) to toggle Command Palette
  useEffect(() => {
    function handleGlobalKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    }
    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, []);

  // Split-panel mouse drag resizing for AI assistant drawer
  useEffect(() => {
    if (!isResizingAiSidebar) return;
    const handleMouseMove = (e: MouseEvent) => {
      const newWidth = window.innerWidth - e.clientX;
      if (newWidth >= 360 && newWidth <= 750) {
        setAiSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      setIsResizingAiSidebar(false);
    };
    window.addEventListener("mousemove", handleMouseMove);
    window.addEventListener("mouseup", handleMouseUp);
    return () => {
      window.removeEventListener("mousemove", handleMouseMove);
      window.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isResizingAiSidebar]);

  const [pinnedRecentIds, setPinnedRecentIds] = useState<string[]>([]);

  const recentProjectsList = useMemo(() => {
    if (!userEmail || !projects || projects.length === 0) {
      return [];
    }

    let filtered = projects;
    if (searchQuery.trim()) {
      filtered = projects.filter((p) => matchesProjectSearch(p, searchQuery, projects));
    }

    const uniqueProjects = deduplicateProjectList(filtered, projects, pinnedRecentIds);

    return uniqueProjects.map((p) => {
      const title = getProjectDisplayName(p, projects);
      return {
        id: p.projectId,
        projectId: p.projectId,
        title,
      };
    });
  }, [userEmail, projects, searchQuery, pinnedRecentIds]);

  const [activeProviderLabel, setActiveProviderLabel] = useState<string>("Ready");

  useEffect(() => {
    if (!userEmail) {
      setActiveProviderLabel("Guest");
      return;
    }
    void loadUserAiSettings()
      .then((settings) => {
        const spec = getCloudProvider(settings.provider);
        setActiveProviderLabel(spec?.name || settings.provider || "BYOK");
      })
      .catch(() => {
        setActiveProviderLabel("BYOK");
      });
  }, [userEmail]);

  const load = useCallback(() => {
    setError(null);
    if (!userEmail) {
      setProjects([]);
      return;
    }
    listProjects()
      .then((r) => {
        const deleted = deletedProjectIdsRef.current;
        const seen = new Set<string>();
        const uniqueItems = (r.items || []).filter((p) => {
          if (!p?.projectId || seen.has(p.projectId)) return false;
          seen.add(p.projectId);
          return !deleted.has(p.projectId);
        });
        setProjects(uniqueItems);
      })
      .catch(() => {
        setProjects([]);
      });
  }, [userEmail]);


  useEffect(() => {
    load();
    syncActiveSessionToRegistry();
  }, [load]);

  // Load output types lazily when user clicks New Project
  useEffect(() => {
    if (!choosing || types !== null) return;
    let active = true;
    listOutputTypes()
      .then((r) => {
        if (active) setTypes(r.items);
      })
      .catch(() => {
        if (active) {
          setTypes(
            FORMAT_TILES.map((t) => ({
              id: t.id,
              label: t.label,
              aliases: [],
              family: "publication",
              academicLevels: [],
              typicalDisciplines: [],
              available: true,
            }))
          );
        }
      });
    return () => {
      active = false;
    };
  }, [choosing, types]);

  const typeMap = useMemo(() => {
    const map = new Map<string, OutputTypeSummary>();
    if (types) {
      for (const t of types) {
        map.set(t.id, t);
      }
    }
    return map;
  }, [types]);

  // Main Dashboard Prompt Bar State
  const [mainPromptInput, setMainPromptInput] = useState("");
  const [mainAttachments, setMainAttachments] = useState<AgentAttachmentItem[]>([]);
  const [isMainUploadingAttachment, setIsMainUploadingAttachment] = useState<boolean>(false);
  const [mainAiMode, setMainAiMode] = useState<PromptMode>("auto");
  const [isDragging, setIsDragging] = useState(false);
  const guideTextareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sidebar Chat / Website Assistant State
  const [guideInput, setGuideInput] = useState("");
  const [sidebarAttachments, setSidebarAttachments] = useState<AgentAttachmentItem[]>([]);
  const [isSidebarUploadingAttachment, setIsSidebarUploadingAttachment] = useState<boolean>(false);
  const [sidebarAiMode, setSidebarAiMode] = useState<PromptMode>("auto");
  const [askCitationStyle, setAskCitationStyle] = useState<AskCitationStyleId>(() => {
    try {
      const saved = localStorage.getItem("scholar_ask_citation_style");
      if (saved && ASK_SCHOLAR_CITATION_STYLES.some((s) => s.id === saved)) {
        return saved as AskCitationStyleId;
      }
    } catch {
      // ignore
    }
    return "apa";
  });
  const [guideMessages, setGuideMessages] = useState<WebsiteAssistantMessage[]>([]);
  const [isGuideThinking, setIsGuideThinking] = useState(false);
  const [liveSearchGrounding, setLiveSearchGrounding] = useState<boolean>(() => getLiveSearchGroundingEnabled());

  useEffect(() => {
    return onLiveSearchGroundingChange((enabled) => {
      setLiveSearchGrounding(enabled);
    });
  }, []);
  const isLandingPage = activeView === "projects" && !choosing;
  const hasStartedChatting = guideMessages.some((m) => m.sender === "user") || isGuideThinking;
  const [expandedPlanIds, setExpandedPlanIds] = useState<Record<string, boolean>>({});
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const guideInputRef = useRef<HTMLTextAreaElement | HTMLInputElement | null>(null);
  const sidebarFileInputRef = useRef<HTMLInputElement | null>(null);

  const [aiStatus, setAiStatus] = useState<AiOperationalStatus | null>(null);

  // Sync AI operational status
  useEffect(() => {
    let active = true;
    async function refreshStatus() {
      try {
        const s = await getAiOperationalStatus();
        if (active) setAiStatus(s);
      } catch {
        if (active) {
          setAiStatus({
            connected: false,
            statusText: "AI Disconnected",
            capabilities: { text: false, vision: false, document: false, webSearch: false, deepResearch: false },
            providers: [],
          });
        }
      }
    }
    refreshStatus();
    const interval = setInterval(refreshStatus, 20000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, []);

  async function parseFilesToAttachments(
    files: FileList | File[] | null,
    setUploading: (val: boolean) => void,
    setItems: React.Dispatch<React.SetStateAction<AgentAttachmentItem[]>>
  ) {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      const newItems: AgentAttachmentItem[] = [];
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        try {
          const parsed = await parseFileForAgent(file);
          const previewUrl = parsed.isImage
            ? (typeof URL !== "undefined" && URL.createObjectURL ? URL.createObjectURL(file) : parsed.imageData?.dataUrl)
            : undefined;
          newItems.push({
            id: `att-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            size: file.size,
            isImage: parsed.isImage,
            fileData: parsed.fileData,
            imageData: parsed.imageData,
            previewUrl,
          });
        } catch (parseErr) {
          console.error("Failed to parse file for agent:", file.name, parseErr);
          newItems.push({
            id: `att-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 6)}`,
            name: file.name,
            size: file.size,
            isImage: false,
            fileData: {
              name: file.name,
              text: `[Error reading ${file.name}: ${parseErr instanceof Error ? parseErr.message : String(parseErr)}]`,
              type: file.type || "application/octet-stream",
            },
          });
        }
      }
      setItems((prev) => [...prev, ...newItems]);
    } finally {
      setUploading(false);
    }
  }

  const handleMainFileSelect = (files: FileList | File[] | null) => {
    return parseFilesToAttachments(files, setIsMainUploadingAttachment, setMainAttachments);
  };

  const removeMainAttachment = (id: string) => {
    setMainAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const addMainFiles = (files: File[]) => {
    handleMainFileSelect(files);
  };

  const handleSidebarFileSelect = (files: FileList | File[] | null) => {
    return parseFilesToAttachments(files, setIsSidebarUploadingAttachment, setSidebarAttachments);
  };

  const removeSidebarAttachment = (id: string) => {
    setSidebarAttachments((prev) => prev.filter((a) => a.id !== id));
  };

  const scrollToAssistant = useCallback(() => {
    setMobileMenuOpen(false);
    setIsAiSidebarOpen(true);
    setTimeout(() => {
      guideInputRef.current?.focus();
    }, 250);
  }, []);

  const [copiedMessageId, setCopiedMessageId] = useState<string | null>(null);

  function handleCopyMessage(id: string, text: string) {
    try {
      if (navigator?.clipboard?.writeText) {
        navigator.clipboard.writeText(text);
        setCopiedMessageId(id);
        setTimeout(() => setCopiedMessageId(null), 2000);
      }
    } catch {
      // Ignore clipboard write issues
    }
  }

  const handleCopyResponse = handleCopyMessage;

  function scrollToProjects() {
    const el = document.getElementById("projects-section");
    if (el) el.scrollIntoView({ behavior: "smooth" });
    else window.scrollTo({ top: 400, behavior: "smooth" });
  }

  function handleAssistantAction(action: AssistantAction) {
    if (action.type === "ai" || action.type === "ai-access") {
      onOpenAiAccess?.();
    } else if (action.type === "vault") {
      onOpenVault?.();
    } else if (action.type === "workspaces") {
      window.scrollTo({ top: 0, behavior: "smooth" });
    } else if (action.type === "projects") {
      scrollToProjects();
    } else if (action.type === "auth") {
      openAuth("signin", "Sign in or register to explore AI-powered research inquiries.");
    }
  }

  const handleSendMainPrompt = () => {
    if (!mainPromptInput.trim() && mainAttachments.length === 0) return;
    const text = mainPromptInput;
    const atts = [...mainAttachments];
    const targetMode: "normal" | "search" | "deep-research" =
      mainAiMode === "search"
        ? "search"
        : mainAiMode === "deep_research"
        ? "deep-research"
        : "normal";
    setSidebarAiMode(mainAiMode);
    setIsAiSidebarOpen(true);
    setMainPromptInput("");
    setMainAttachments([]);
    if (guideTextareaRef.current) guideTextareaRef.current.style.height = "auto";
    handleSendGuideMessage(text, atts, targetMode);
    setTimeout(() => guideInputRef.current?.focus(), 250);
  };

  async function handleSendGuideMessage(
    textToSend?: string,
    attachmentsToSend?: AgentAttachmentItem[],
    modeToSend?: "normal" | "search" | "deep-research"
  ) {
    const isSidebarDirect = textToSend === undefined;
    const rawQuery = (textToSend !== undefined ? textToSend : guideInput).trim();
    const currentAttachments = attachmentsToSend !== undefined ? [...attachmentsToSend] : [...sidebarAttachments];
    const targetMode: "normal" | "search" | "deep-research" =
      modeToSend !== undefined
        ? modeToSend
        : sidebarAiMode === "search"
        ? "search"
        : sidebarAiMode === "deep_research"
        ? "deep-research"
        : "normal";

    if (!rawQuery && currentAttachments.length === 0) return;

    const query = rawQuery || (currentAttachments.some((a) => a.isImage) ? "Describe and analyze this image." : "Summarize this document.");

    const userAttachmentsDisplay = currentAttachments.map((a) => ({
      name: a.name,
      isImage: a.isImage,
      previewUrl: a.previewUrl,
    }));

    const userMsg: WebsiteAssistantMessage = {
      id: `user-${Date.now()}`,
      sender: "user",
      text: query,
      timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      attachments: userAttachmentsDisplay.length > 0 ? userAttachmentsDisplay : undefined,
    };

    setGuideMessages((prev) => [...prev, userMsg]);
    if (isSidebarDirect) {
      setGuideInput("");
      setSidebarAttachments([]);
    }
    setIsGuideThinking(true);

    try {
      if (isPlatformQuery(query) && currentAttachments.length === 0) {
        // Fast, deterministic platform answer
        const answer = answerWebsiteQuestion(query);
        const meta = getAssistantActionAndFollowUps(query);
        const assistantMsg: WebsiteAssistantMessage = {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: answer,
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          action: meta.action,
          followUps: meta.followUps,
        };
        setGuideMessages((prev) => [...prev, assistantMsg]);
      } else if (!userEmail && !aiStatus?.connected) {
        // Guest mode with no AI operational
        const assistantMsg: WebsiteAssistantMessage = {
          id: `assistant-${Date.now()}`,
          sender: "assistant",
          text: "Open-ended scholarly inquiries require signing in to Scholar Core. Please log in and configure your AI provider in AI Access to ask general research questions.\n\nWhile browsing as a guest, Ask Scholar can assist with platform guidance, workspace formats, Knowledge Vault provenance, and AI configuration.",
          timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          action: { type: "auth", label: "Sign In / Register to Use AI ↗" },
          followUps: ["How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?"],
        };
        setGuideMessages((prev) => [...prev, assistantMsg]);
      } else {
        // Assemble conversation history for continuous context
        const history = guideMessages
          .filter((m) => m.id !== "init" && m.id !== "reset-assistant" && !m.error)
          .slice(-6)
          .map((m) => ({
            role: m.sender === "user" ? ("user" as const) : ("assistant" as const),
            content: m.text,
          }));

        let agentResponse: (AgenticQueryResponse & { ok?: boolean }) | undefined;
        const styleInfo = getCitationStyleInfo(askCitationStyle);
        const systemPrompt = `You are Scholar Core Research Copilot, an authoritative academic companion. Provide precise, rigorous, intellectually honest answers. Prioritize recently published (2020-2026), peer-reviewed, and credible sources. Format citations and references strictly according to ${styleInfo.name}. Ground all assertions in verified literature without fabricating sources or DOIs.`;

        let liveRetrievedSources: LiveSearchResult[] = [];
        if (liveSearchGrounding || targetMode === "search" || targetMode === "deep-research") {
          try {
            liveRetrievedSources = await executeLiveSearch(query, { limit: 5 });
          } catch {
            // Non-blocking failover
          }
        }

        const effectiveSystemPrompt = liveRetrievedSources.length > 0
          ? injectLiveGroundingToSystemPrompt(systemPrompt, liveRetrievedSources)
          : systemPrompt;

        const isAcademicOrDeliverable =
          targetMode !== "normal" ||
          query.toLowerCase().includes("deep research") ||
          query.toLowerCase().includes("search the web") ||
          /\b(?:essay|paper|coursework|thesis|dissertation|proposal|review|analysis|history|nepal|congress|study|clinical)\b/i.test(query);

        if (currentAttachments.length === 0 && targetMode === "normal" && !isAcademicOrDeliverable) {
          // Standard text generation — calls executeAgenticLLM first (compatible with unit tests and client router)
          try {
            const txt = await executeAgenticLLM(effectiveSystemPrompt, query, "simple");
            agentResponse = { ok: true, text: txt, mode: "chat", citationStyle: askCitationStyle };
          } catch {
            // Server fallback
            agentResponse = await executeAgenticQuery({
              prompt: query,
              systemPrompt: effectiveSystemPrompt,
              mode: targetMode,
              citationStyle: askCitationStyle,
              history,
            });
          }
        } else {
          // Substantive scholarly retrieval query or multimodal
          try {
            agentResponse = await executeAgenticQuery({
              prompt: query,
              systemPrompt: effectiveSystemPrompt,
              mode: targetMode,
              citationStyle: askCitationStyle,
              files: currentAttachments.filter((a) => a.fileData).map((a) => a.fileData!),
              images: currentAttachments.filter((a) => a.imageData).map((a) => a.imageData!),
              history,
            });
          } catch (serverErr) {
            // Direct client-side failover using configured BYOK keys in AI Access if server execution fails
            try {
              const clientTxt = await executeAgenticLLM(effectiveSystemPrompt, query, "reasoning");
              agentResponse = {
                ok: true,
                text: clientTxt,
                mode: targetMode === "deep-research" ? "deep-research" : "chat",
                citationStyle: askCitationStyle,
              };
            } catch {
              throw serverErr;
            }
          }
        }

        if (agentResponse && agentResponse.ok && agentResponse.text) {
          const assistantMsg: WebsiteAssistantMessage = {
            id: `assistant-${Date.now()}`,
            sender: "assistant",
            text: agentResponse.text.trim(),
            timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
            mode: (agentResponse.mode as WebsiteAssistantMessage["mode"]) || (targetMode === "deep-research" ? "deep-research" : "chat"),
            provider: agentResponse.provider,
            model: agentResponse.model,
            plan: agentResponse.plan,
            citationStyle: agentResponse.citationStyle || askCitationStyle,
            citations: agentResponse.citations,
            liveSources: liveRetrievedSources.length > 0 ? liveRetrievedSources : undefined,
            wordCount: agentResponse.wordCount,
            verifiedSourcesCount: agentResponse.verifiedSourcesCount,
            burstinessMetrics: agentResponse.burstinessMetrics,
            recommendedWorkspaceHandoff: agentResponse.recommendedWorkspaceHandoff,
            followUps:
              agentResponse.followUps ||
              (targetMode === "deep-research" || targetMode === "search" || (agentResponse.citations && agentResponse.citations.length > 0)
                ? [
                    "What are the leading methodological counter-arguments?",
                    "Compare contradictory findings in recent literature",
                    "How can I translate this into an academic paper outline?",
                  ]
                : [
                    "How do I create a research project?",
                    "What is Knowledge Vault?",
                    "How do I set up AI?",
                  ]),
          };
          setGuideMessages((prev) => [...prev, assistantMsg]);
        } else {
          throw new Error(agentResponse?.error || "AI generation completed with an empty response.");
        }
      }
    } catch (e: unknown) {
      console.error("Website Assistant error:", e);
      const errorMessage = e instanceof Error ? e.message : "An unexpected error occurred while communicating with the AI service.";
      const assistantMsg: WebsiteAssistantMessage = {
        id: `assistant-${Date.now()}`,
        sender: "assistant",
        text: `⚠️ **AI Execution Error**: ${errorMessage}\n\nPlease check your AI settings in **AI Access** or ensure your API credentials are operational.`,
        timestamp: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
        action: { type: "ai-access", label: "Configure AI Provider in AI Access ↗" },
        followUps: ["How do I set up AI?", "What is Knowledge Vault?", "How do I create a research project?"],
        error: true,
      };
      setGuideMessages((prev) => [...prev, assistantMsg]);
    } finally {
      setIsGuideThinking(false);
    }
  }

  // Boot project workspace directly from assistant research findings
  const handleBootProjectFromResearch = useCallback(
    async (
      researchMessage: WebsiteAssistantMessage,
      formatOverride?: "OT-01" | "OT-10" | "OT-19" | "OT-09" | "OT-22"
    ) => {
      const handoff = researchMessage.recommendedWorkspaceHandoff;
      const targetFormatId = formatOverride || handoff?.targetFormatId || "OT-10";

      if (!userEmail) {
        openAuth("signup", `Sign in or create an account to initialize ${handoff?.formatLabel || "an academic workspace"} from these findings.`, targetFormatId);
        return;
      }
      if (creating) return;

      setCreating(true);
      setCreatingFormatId(targetFormatId);
      setError(null);

      try {
        const currentIdx = guideMessages.findIndex((m) => m.id === researchMessage.id);
        const priorUserMsg =
          currentIdx > 0
            ? guideMessages.slice(0, currentIdx).filter((m) => m.sender === "user").slice(-1)[0]
            : undefined;

        const topic =
          handoff?.topic ||
          priorUserMsg?.text ||
          researchMessage.text.split("\n")[0].replace(/^#+\s*/, "").slice(0, 80) ||
          "Synthesized Research Project";
        const cleanTitle =
          handoff?.suggestedTitle ||
          (topic.length > 60 ? `${topic.slice(0, 57)}...` : topic);

        const project = await createProject(targetFormatId);

        const sourcesToAttach = handoff?.retrievedSources || researchMessage.citations || [];
        const citationNotes =
          sourcesToAttach.length > 0
            ? sourcesToAttach
                .map(
                  (c, i) =>
                    `[${i + 1}] ${c.title || "Scholarly Source"}${c.venue ? ` (${c.venue})` : ""}\nAuthors: ${Array.isArray(c.authors) ? c.authors.join(", ") : ""}\nDOI: ${c.doi || "N/A"}\nURL: ${c.url || "N/A"}`
                )
                .join("\n\n")
            : "";

        const intake = {
          title: cleanTitle,
          researchQuestion: topic,
          targetWordCount: handoff?.wordCountTarget || 1500,
          backgroundNotes: `Executive Scholarly Synthesis & Verified Literature Brief:\n\n${researchMessage.text}`,
          preliminaryEvidence: citationNotes,
        };

        await Promise.resolve(saveIntakeAnswers(project.projectId, intake)).catch(() => {});
        onOpen(project.projectId);
      } catch (err: any) {
        setError(err?.message || "Failed to initialize project from research findings.");
        setCreating(false);
        setCreatingFormatId(null);
      }
    },
    [userEmail, creating, openAuth, guideMessages, onOpen]
  );

  const handledNewFormatRef = useRef<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const newFormat = params.get("newFormat");
    if (newFormat && userEmail && !creating && handledNewFormatRef.current !== newFormat) {
      handledNewFormatRef.current = newFormat;
      handleCreate(newFormat);
      navigate("/projects", { replace: true });
    }
  }, [location.search, userEmail, creating, navigate, handleCreate]);

  const [projectToDelete, setProjectToDelete] = useState<ProjectView | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);

  const [activeRecentMenuId, setActiveRecentMenuId] = useState<string | null>(null);
  const recentMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (recentMenuRef.current && !recentMenuRef.current.contains(e.target as Node)) {
        setActiveRecentMenuId(null);
      }
    }
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setActiveRecentMenuId(null);
      }
    }
    if (activeRecentMenuId) {
      document.addEventListener("mousedown", handleClickOutside);
      document.addEventListener("keydown", handleKeyDown);
      return () => {
        document.removeEventListener("mousedown", handleClickOutside);
        document.removeEventListener("keydown", handleKeyDown);
      };
    }
  }, [activeRecentMenuId]);

  function handleRecentAction(
    action: "share" | "pin" | "rename" | "add-to-project" | "delete",
    item: { id: string; projectId?: string; title: string }
  ) {
    setActiveRecentMenuId(null);

    if (action === "share") {
      const shareUrl = `${window.location.origin}${item.projectId ? `/projects?id=${encodeURIComponent(item.projectId)}` : "/"}`;
      if (navigator.clipboard?.writeText) {
        navigator.clipboard.writeText(shareUrl).catch(() => {});
      }
    } else if (action === "pin") {
      setPinnedRecentIds((prev) =>
        prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]
      );
    } else if (action === "rename") {
      const currentProj = projects?.find((p) => p.projectId === item.projectId);
      const currentDisplayTitle = getProjectDisplayName(currentProj, projects || []);
      const newTitle = window.prompt("Rename research project:", currentDisplayTitle || item.title);
      if (newTitle && newTitle.trim() && newTitle.trim() !== currentDisplayTitle && item.projectId) {
        const trimmed = newTitle.trim();
        // Check for duplicate title against other existing projects (case-insensitive)
        if (isDuplicateProjectTitle(trimmed, item.projectId, projects || [])) {
          alert(`A project with the name "${trimmed}" already exists. Please choose a unique name.`);
          return;
        }
        // Optimistic UI for Recents: update local React state instantly for a snappy UX
        const previousProjects = projects;
        setProjects((curr) =>
          curr
            ? curr.map((p) =>
                p.projectId === item.projectId
                  ? {
                      ...p,
                      title: trimmed,
                      answers: {
                        ...p.answers,
                        title: trimmed,
                        working_title: trimmed,
                        assignment_title: trimmed,
                      },
                    }
                  : p
              )
            : []
        );

        // Handle backend database operations asynchronously in the background
        saveIntakeAnswers(item.projectId, {
          title: trimmed,
          working_title: trimmed,
          assignment_title: trimmed,
        }).catch((err) => {
          console.error("Failed to rename project:", err);
          // Rollback on failure
          setProjects(previousProjects);
          setError((err as Error).message || "Failed to rename project. Please try again.");
        });
      }
    } else if (action === "add-to-project") {
      if (item.projectId) {
        onOpen(item.projectId);
      } else {
        scrollToProjects();
      }
    } else if (action === "delete") {
      if (item.projectId) {
        const found = projects?.find((p) => p.projectId === item.projectId);
        if (found) {
          setProjectToDelete(found);
        } else {
          setProjectToDelete({
            projectId: item.projectId,
            outputTypeId: "OT-01",
            answers: { title: item.title },
            intakeCompleteness: 0,
            hasDocument: false,
          } as unknown as ProjectView);
        }
      }
    }
  }

  const handleProjectRenamed = useCallback((projectId: string, newTitle: string) => {
    setProjects((curr) =>
      curr
        ? curr.map((p) =>
            p.projectId === projectId
              ? {
                  ...p,
                  title: newTitle,
                  answers: {
                    ...p.answers,
                    title: newTitle,
                    working_title: newTitle,
                    assignment_title: newTitle,
                  },
                }
              : p
          )
        : []
    );
  }, []);

  async function handleConfirmDelete() {
    if (!projectToDelete) return;
    const targetId = projectToDelete.projectId;
    const previousProjects = projects;

    const targetTitle = (
      projectToDelete.title ||
      (projectToDelete.answers as any)?.title ||
      getProjectDisplayName(projectToDelete, projects || [])
    ).trim().toLowerCase();

    // Identify any companion duplicate projects sharing the exact same title
    const companionIds = targetTitle
      ? (projects || [])
          .filter((p) => {
            if (!p || p.projectId === targetId) return false;
            const pTitle = (
              p.title ||
              (p.answers as any)?.title ||
              getProjectDisplayName(p, projects || [])
            ).trim().toLowerCase();
            return pTitle === targetTitle;
          })
          .map((p) => p.projectId)
      : [];

    const allIdsToDelete = [targetId, ...companionIds];

    // 1. Instantly close the modal dialog without delay
    setProjectToDelete(null);

    // 2. Mark project(s) as deleted immediately to prevent race conditions & ghost resurrection
    allIdsToDelete.forEach((id) => markProjectAsDeleted(id));

    // 3. Instantly filter the project out of the local state
    setProjects((curr) => (curr ? curr.filter((p) => !allIdsToDelete.includes(p.projectId)) : []));

    // 4. Perform backend deletion
    try {
      if (!targetId.startsWith("demo-")) {
        await deleteProject(targetId);
      }
      for (const compId of companionIds) {
        if (!compId.startsWith("demo-")) {
          deleteProject(compId).catch(() => {});
        }
      }
      // Re-sync project list with server in background, filtering out any deleted IDs
      const res = await listProjects();
      const deleted = deletedProjectIdsRef.current;
      const seen = new Set<string>();
      setProjects(
        res.items.filter((p) => {
          if (!p?.projectId || seen.has(p.projectId)) return false;
          seen.add(p.projectId);
          return !deleted.has(p.projectId);
        })
      );
    } catch (e) {
      console.error("Failed to delete project:", e);
      // Rollback on failure
      allIdsToDelete.forEach((id) => unmarkProjectAsDeleted(id));
      setProjects(previousProjects);
      setError((e as Error).message || "Failed to delete project. Please try again.");
    }
  }


  // Close delete modal on Escape key
  useEffect(() => {
    if (!projectToDelete) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !deletingId) {
        setProjectToDelete(null);
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [projectToDelete, deletingId]);

  function getProjectTitle(p: ProjectView | null): string {
    if (!p) return "Project";
    return (
      p.answers?.title?.trim() ||
      p.answers?.research_question?.trim() ||
      p.answers?.topic?.trim() ||
      typeMap.get(p.outputTypeId)?.label ||
      p.outputTypeId ||
      "Project"
    );
  }

  async function handleSignOut() {
    const confirmed = window.confirm("Sign out of Scholar Core?");
    if (!confirmed) return;
    getSupabaseClient().auth.signOut();
  }

  return (
    <div className="h-screen w-full flex overflow-hidden bg-[#F8F9FA] dark:bg-[#171717] text-neutral-900 dark:text-white font-sans selection:bg-neutral-100 selection:text-[#171717]">
      {/* Mobile Backdrop Overlay */}
      {mobileMenuOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/40 backdrop-blur-xs md:hidden animate-in fade-in duration-150"
          onClick={() => setMobileMenuOpen(false)}
          aria-hidden="true"
        />
      )}

      {/* Left Sidebar (Navigation Pane) */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 md:relative md:z-30 h-full flex flex-col justify-between border-r border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] text-neutral-700 dark:text-neutral-300 flex-shrink-0 select-none transition-all duration-300 ease-in-out ${
          mobileMenuOpen
            ? "translate-x-0 w-[260px] shadow-2xl"
            : "-translate-x-full md:translate-x-0 " + (isSidebarOpen ? "w-[260px]" : "w-0 border-r-0 overflow-hidden")
        }`}
      >
        {/* Top Section */}
        <div className="flex flex-col flex-shrink-0 w-[260px]">
          {/* Logo & Close/Collapse Header */}
          <div className="p-4 pb-3 flex items-center justify-between border-b border-neutral-200 dark:border-white/10">
            <Link
              to="/"
              onClick={() => {
                setMobileMenuOpen(false);
                setChoosing(false);
                setActiveView("projects");
                scrollToProjects();
              }}
              className="flex items-center gap-2.5 min-w-0 cursor-pointer transition-opacity duration-200 hover:opacity-70 text-left"
              title="Scholar Core Home"
              aria-label="Scholar Core Home"
            >
              <div className="w-9 h-9 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex items-center justify-center flex-shrink-0 shadow-xs">
                <ScholarCoreLogo size="md" className="text-white dark:text-neutral-900" />
              </div>
              <div className="flex flex-col min-w-0 justify-center">
                <span className="font-extrabold text-sm tracking-tight text-neutral-900 dark:text-neutral-100 leading-tight truncate font-sans">
                  Scholar Core
                </span>
                <span className="text-[10px] font-medium text-neutral-500 dark:text-neutral-400 mt-0.5 tracking-normal font-sans">
                  Workspace
                </span>
              </div>
            </Link>

            {/* Desktop Collapse Icon */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen(false)}
              className="hidden md:flex p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Collapse sidebar"
              aria-label="Collapse sidebar"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
              </svg>
            </button>

            {/* Mobile Close Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(false)}
              className="md:hidden p-1.5 rounded-lg text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer"
              title="Close navigation"
              aria-label="Close navigation"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Primary + New Project Button & Search Field (Phase 1) */}
          <div className="px-3 pt-3">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setActiveView("projects");
                if (!userEmail) {
                  openAuth("signin", "Sign in or create an account to start a new research project.");
                  return;
                }
                setChoosing(true);
              }}
              className="w-full h-10 px-4 rounded-full text-xs font-semibold bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 active:scale-95 transition-all flex items-center justify-center gap-2 cursor-pointer shadow-sm group font-sans mb-2.5"
            >
              <span className="text-base font-bold leading-none">+</span>
              <span>New Project</span>
            </button>
          </div>
        </div>

        {/* Middle Section: Core Workspace Links & Recents Scrollable List */}
        <div className="flex-1 overflow-hidden px-3 flex flex-col w-[260px] min-h-0 antialiased">
          {/* Phase 2: Core Workspace Links (The Library) */}
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (!userEmail) {
                  openAuth("signin", "Sign in to access your Knowledge Vault references.");
                  return;
                }
                setActiveView("vault");
                onOpenVault?.();
              }}
              aria-label="Knowledge Vault"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${
                activeView === "vault"
                  ? "bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold"
                  : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              <Database className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>Knowledge Vault</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (!userEmail) {
                  openAuth("signin", "Sign in to configure AI provider keys and models.");
                  return;
                }
                setActiveView("ai-access");
                onOpenAiAccess?.();
              }}
              aria-label="Manage AI Access"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${
                activeView === "ai-access"
                  ? "bg-neutral-900/10 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold"
                  : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              <Sliders className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>AI Access</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                if (typeof window !== "undefined") {
                  window.location.href = "/presentation";
                }
              }}
              aria-label="Presentation Studio"
              className="flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
            >
              <Presentation className="h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 flex-shrink-0" />
              <span>Presentation Studio</span>
            </button>

            {/* Phase 1: Ask Scholar toggle button allowing opening and closing on click */}
            <button
              type="button"
              onClick={() => {
                setMobileMenuOpen(false);
                setIsAiSidebarOpen((prev) => {
                  const next = !prev;
                  if (next && typeof window !== "undefined" && window.innerWidth < 1280) {
                    setIsSidebarOpen(false);
                  }
                  return next;
                });
              }}
              aria-label="Ask Scholar"
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] font-medium transition-colors cursor-pointer text-left w-full group font-sans ${
                isAiSidebarOpen
                  ? "bg-sky-500/10 text-sky-600 dark:text-sky-300 font-semibold border border-sky-500/20 shadow-2xs"
                  : "hover:bg-neutral-900/5 dark:hover:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200"
              }`}
            >
              <MessageSquare className={`h-4 w-4 flex-shrink-0 transition-colors ${
                isAiSidebarOpen
                  ? "text-sky-600 dark:text-sky-300"
                  : "text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200"
              }`} />
              <span>Ask Scholar</span>
            </button>
          </div>

          {/* Projects Section: Render only when logged in and active projects exist */}
          {userEmail && projects && projects.length > 0 && (
            <div className="flex-1 overflow-hidden flex flex-col min-h-0">
              <h3 className="text-xs font-semibold tracking-wider text-neutral-500 uppercase mt-8 mb-2 px-3 flex-shrink-0">
                Projects
              </h3>

              {/* Search Projects Box directly below PROJECTS heading */}
              <div className="relative group cursor-text mb-2.5 w-full h-10 flex-shrink-0">
                <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-neutral-400 group-hover:text-neutral-600 dark:group-hover:text-neutral-200 transition-colors pointer-events-none" />
                <input
                  type="text"
                  placeholder="Search projects..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full h-full bg-neutral-900/5 dark:bg-white/5 border border-neutral-200 dark:border-white/10 rounded-full pl-10 pr-11 text-xs focus:outline-none focus:ring-1 focus:ring-neutral-400 dark:focus:ring-white/20 transition-all cursor-text text-neutral-900 dark:text-neutral-200 placeholder-neutral-500 dark:placeholder-neutral-400"
                />
                <button
                  type="button"
                  onClick={() => setIsCommandPaletteOpen(true)}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 px-1.5 py-0.5 rounded bg-neutral-200/60 dark:bg-white/10 hover:bg-neutral-300 dark:hover:bg-white/20 text-[10px] font-mono font-medium text-neutral-500 dark:text-neutral-400 transition-colors cursor-pointer"
                  title="Open Command Palette (⌘K)"
                >
                  ⌘K
                </button>
              </div>

              {/* Projects List (Scrollable Area) */}
              <div className="flex-1 overflow-y-auto space-y-1 pr-2 custom-scrollbar pb-3 min-h-0">
                {isMounted && recentProjectsList.map((item, index) => {
                  const isMenuOpen = activeRecentMenuId === item.id;
                  const isNearBottom = index >= Math.max(recentProjectsList.length - 2, 2);
                  const isPinned = pinnedRecentIds.includes(item.id);

                  return (
                    <div key={item.id} className="relative">
                      <div
                        onClick={() => {
                          setMobileMenuOpen(false);
                          setActiveView("projects");
                          if (item.projectId) {
                            onOpen(item.projectId);
                          } else {
                            scrollToProjects();
                          }
                        }}
                        className="group flex items-center justify-between px-3 py-2 rounded-lg hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors duration-200 cursor-pointer text-[13px] font-medium text-neutral-500 hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white antialiased"
                        title={item.title}
                      >
                        <span className="truncate pr-2 flex items-center gap-2 min-w-0">
                          <FileText className="w-3.5 h-3.5 text-neutral-500 group-hover:text-neutral-300 dark:group-hover:text-neutral-300 transition-colors duration-200 flex-shrink-0" />
                          {isPinned && <Pin className="w-3 h-3 text-amber-500/80 group-hover:text-amber-500 rotate-45 flex-shrink-0 transition-colors duration-200" />}
                          <span className="truncate">{item.title}</span>
                        </span>
                        <div className="flex items-center gap-0.5 flex-shrink-0">
                          <button
                            type="button"
                            aria-label="Trash project"
                            title="Delete project"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              handleRecentAction("delete", item);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-red-500/10 text-neutral-400 hover:text-red-500 flex-shrink-0 cursor-pointer"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            aria-label="More options"
                            onClick={(e) => {
                              e.preventDefault();
                              e.stopPropagation();
                              setActiveRecentMenuId((prev) => (prev === item.id ? null : item.id));
                            }}
                            className={`opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded-md hover:bg-neutral-900/10 dark:hover:bg-white/10 text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 flex-shrink-0 ${
                              isMenuOpen ? "!opacity-100" : ""
                            }`}
                          >
                            <MoreVertical className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      {/* Popover Options Menu */}
                      {isMenuOpen && (
                        <div
                          ref={recentMenuRef}
                          className={`absolute ${
                            isNearBottom ? "bottom-full mb-1" : "top-full mt-1"
                          } right-0 z-50 shadow-xl rounded-xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 p-1 min-w-[180px] animate-in fade-in duration-150 text-neutral-700 dark:text-neutral-300`}
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() => handleRecentAction("share", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left"
                          >
                            <Share2 className="w-4 h-4 flex-shrink-0" />
                            <span>Share</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecentAction("pin", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left"
                          >
                            <Pin className="w-4 h-4 flex-shrink-0" />
                            <span>{isPinned ? "Unpin" : "Pin"}</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecentAction("rename", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left"
                          >
                            <Pencil className="w-4 h-4 flex-shrink-0" />
                            <span>Rename</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecentAction("add-to-project", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-neutral-700 dark:text-neutral-300 hover:bg-neutral-900/5 dark:hover:bg-white/5 hover:text-neutral-900 dark:hover:text-neutral-100 cursor-pointer text-left"
                          >
                            <FolderPlus className="w-4 h-4 flex-shrink-0" />
                            <span>Add to Project</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => handleRecentAction("delete", item)}
                            className="w-full flex items-center gap-3 px-3 py-2 rounded-lg text-[13px] text-red-500 hover:bg-red-500/10 cursor-pointer text-left"
                          >
                            <Trash2 className="w-4 h-4 flex-shrink-0" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Bottom Section */}
        <div className="flex-shrink-0 p-3 border-t border-neutral-200 dark:border-white/10 flex flex-col justify-between gap-2 w-[260px] bg-white dark:bg-[#1C1C1E] h-[114px]">
          {/* Action Row: Settings Navigation Item + Minimal Icon-Only Theme Toggle */}
          <div className="flex items-center justify-between gap-1.5">
            {onOpenAccountSettings && (
              <button
                type="button"
                onClick={() => {
                  setMobileMenuOpen(false);
                  onOpenAccountSettings();
                }}
                aria-label="Settings"
                className="flex-1 flex items-center gap-2.5 px-3 py-2 rounded-xl text-xs font-semibold tracking-tight text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-200 hover:bg-neutral-900/5 dark:hover:bg-white/5 transition-colors cursor-pointer text-left group font-sans"
              >
                <svg className="w-4 h-4 flex-shrink-0 text-neutral-500 dark:text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-200 transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                <span>Settings</span>
              </button>
            )}

            {/* Minimal Icon-Only Theme Toggle */}
            <button
              type="button"
              onClick={toggleTheme}
              className="p-2 rounded-lg hover:bg-neutral-900/5 dark:hover:bg-white/5 cursor-pointer text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white transition-colors border border-neutral-200 dark:border-white/10 flex-shrink-0"
              aria-label="Toggle theme"
              title={`Switch to ${theme === "dark" ? "Day" : "Night"} mode`}
            >
              <div className="relative w-4 h-4 transition-transform duration-200 rotate-0 dark:-rotate-90">
                {theme === "dark" ? (
                  <Sun className="w-4 h-4 text-amber-400" />
                ) : (
                  <Moon className="w-4 h-4 text-neutral-600 dark:text-neutral-400" />
                )}
              </div>
            </button>
          </div>

          {/* Multi-Account User Dropdown */}
          <UserAccountMenu
            userEmail={userEmail}
            onOpenAccountSettings={onOpenAccountSettings}
            onOpenVault={onOpenVault}
            onOpenAiAccess={onOpenAiAccess}
            onOpenAuth={openAuth}
            dropUp={true}
            variant="sidebar"
          />
        </div>
      </aside>

      {/* Main Content Area (Center Pane) */}
      <main className={`${
        isLandingPage && isAiSidebarOpen
          ? "hidden"
          : "flex-1 flex flex-col h-screen w-full bg-[#F8F9FA] dark:bg-[#171717] overflow-hidden text-neutral-900 dark:text-white scholar-scrollbar relative transition-all duration-300 ease-in-out"
      }`}>
        {/* Sticky Top Bar for Sidebar Toggle on Desktop & Mobile */}
        <div className="sticky top-0 z-20 px-6 py-3 flex items-center justify-between bg-[#F8F9FA]/85 dark:bg-[#171717]/85 backdrop-blur-md border-b border-neutral-200 dark:border-white/10 shrink-0">
          <div className="flex items-center gap-3">
            {/* Mobile Drawer Trigger Button */}
            <button
              type="button"
              onClick={() => setMobileMenuOpen(true)}
              className="md:hidden p-2 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer"
              aria-label="Open navigation"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Desktop Sidebar Toggle Icon Button (ChatGPT-style) */}
            <button
              type="button"
              onClick={() => setIsSidebarOpen((prev) => !prev)}
              className="hidden md:flex items-center gap-2 px-2.5 py-1.5 rounded-xl border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 text-xs font-medium cursor-pointer transition-all animate-in fade-in"
              title={isSidebarOpen ? "Collapse sidebar" : "Expand sidebar"}
              aria-label={isSidebarOpen ? "Toggle sidebar" : "Expand sidebar"}
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
                <rect x="3" y="3" width="18" height="18" rx="2" strokeWidth="1.5" />
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 3v18" />
                {isSidebarOpen ? (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M14 9l-3 3 3 3" />
                ) : (
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 15l3-3-3-3" />
                )}
              </svg>
              {!isSidebarOpen && <span>Open Sidebar</span>}
            </button>
          </div>

          {/* Top Bar Right: AI Assistant Toggle & Active Provider Status */}
          <div className="flex items-center gap-2.5">
            {/* Active AI Status Pill */}
            {userEmail ? (
              <button
                type="button"
                onClick={() => {
                  if (onOpenAiAccess) onOpenAiAccess();
                  else setActiveView("ai-access");
                }}
                className={`${
                  isAiSidebarOpen ? "hidden 2xl:inline-flex" : "hidden sm:inline-flex"
                } items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors border border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/20 cursor-pointer shadow-2xs`}
                title="AI Access Settings • Click to configure"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                <span>Active AI: {activeProviderLabel}</span>
                <span className="text-[10px] opacity-70">↗</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={() => openAuth("signin", "Sign in to configure your personal AI provider.")}
                className="hidden sm:inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-[11px] font-medium transition-colors border border-neutral-200 dark:border-white/10 bg-neutral-900/5 dark:bg-white/5 text-neutral-600 dark:text-neutral-300 hover:bg-neutral-900/10 dark:hover:bg-white/10 cursor-pointer shadow-2xs"
                title="Sign in to access AI"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-slate-400" />
                <span>Guest Mode (AI Off)</span>
              </button>
            )}

            {/* AI Assistant Toggle Button (Clean minimalist Lightbulb icon, hidden when sidebar is open) */}
            {!isAiSidebarOpen && (
              <button
                type="button"
                onClick={() => setIsAiSidebarOpen((prev) => !prev)}
                title="Ask Scholar"
                className="w-10 h-10 rounded-full transition-all duration-200 flex items-center justify-center cursor-pointer shadow-xs border bg-neutral-900/5 dark:bg-white/5 hover:bg-neutral-900/10 dark:hover:bg-white/10 border-neutral-200 dark:border-white/10 text-amber-500 dark:text-amber-400 hover:text-amber-600 dark:hover:text-amber-300 animate-in fade-in zoom-in-95 duration-150"
                aria-label="Toggle Scholar Core AI Assistant"
              >
                <Lightbulb className="w-5 h-5 stroke-[1.8]" />
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Central Content (Knowledge Vault, AI Access, or Projects reading column) */}
        {activeView === "vault" ? (
          <div className="flex-1 overflow-y-auto w-full relative">
            <KnowledgeVault
              userId={userId || "local-user"}
              initialTab="projects"
              onClose={handleCloseCentralView}
              onOpenProject={(pId) => onOpen(pId)}
              onProjectRenamed={handleProjectRenamed}
            />
          </div>
        ) : activeView === "ai-access" ? (
          <div className="flex-1 overflow-y-auto w-full relative">
            <AiAccessPage
              onClose={handleCloseCentralView}
              section={aiAccessSection}
              onSectionChange={onAiAccessSectionChange}
            />
          </div>
        ) : choosing ? (
          <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto scholar-scrollbar">
            <div className="w-full max-w-4xl my-auto py-6">
              <ChooseOutputType
                types={types}
                creating={creating}
                onPick={handleCreate}
                onCancel={() => setChoosing(false)}
              />
            </div>
          </div>
        ) : (
          <>
            {/* Scrollable / Flexible Center Area */}
            <div className="flex-1 flex flex-col items-center justify-center px-4 overflow-y-auto scholar-scrollbar">
              <div className="w-full max-w-5xl flex flex-col items-center gap-6 my-auto pb-4">
                {/* Onboarding welcome banner */}
                {welcomeVisible && (
                  <div
                    role="status"
                    className="w-full rounded-2xl border border-neutral-200 dark:border-white/10 bg-white dark:bg-[#1C1C1E] p-5 flex items-start justify-between gap-4 shadow-sm"
                  >
                    <div className="flex items-start gap-4">
                      <div className="w-10 h-10 rounded-xl bg-neutral-100 dark:bg-gray-100 text-neutral-900 dark:text-gray-900 flex items-center justify-center flex-shrink-0 shadow-xs">
                        <ScholarCoreLogo size="sm" className="text-neutral-900 dark:text-gray-900" />
                      </div>
                      <div>
                        <p className="text-sm font-bold text-neutral-900 dark:text-gray-100 font-sans">Welcome to your Scholar Workspace</p>
                        <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1 font-normal leading-relaxed font-sans">
                          Select an academic workspace to begin, or upload reference PDFs to your Vault.
                        </p>
                      </div>
                    </div>
                    <button
                      aria-label="Dismiss"
                      onClick={() => setWelcomeVisible(false)}
                      className="p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-gray-200 hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-colors cursor-pointer"
                    >
                      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </button>
                  </div>
                )}

                {/* Error Alert */}
                {error && (
                  <div className="w-full rounded-xl border border-red-500/20 bg-red-500/10 px-5 py-3.5 text-red-400 text-xs font-medium flex items-center gap-3">
                    <svg className="w-4 h-4 flex-shrink-0 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                    <span className="font-semibold font-sans">{error}</span>
                  </div>
                )}

                {/* Subtle Welcome / Workspace Heading & 4-Card Template Grid (completely hidden once chatting begins) */}
                {!isAiSidebarOpen && !hasStartedChatting ? (
                  <>
                    <div className="text-center mb-2">
                      <h1 className="text-2xl font-semibold text-neutral-900 dark:text-white tracking-tight">
                        Where will your research begin?
                      </h1>
                      <p className="text-[13px] text-neutral-500 mt-1">
                        Select an academic deliverable or paste your assignment guidelines below.
                      </p>
                    </div>

                    <div className="w-full">
                      <div className="grid w-full gap-4 transition-all duration-300 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                        {FORMAT_TILES.map((tile) => {
                          const isBootingThis = creatingFormatId === tile.id;
                          const isOtherBooting = creating && !isBootingThis;
                          const tileTheme = getFormatTileTheme(tile.id);
                          return (
                            <button
                              key={tile.id}
                              type="button"
                              onClick={() => {
                                if (creating) return;
                                if (!userEmail) {
                                  openAuth("signin", `Sign in to boot your ${tile.label} workspace.`, tile.id);
                                  return;
                                }
                                handleCreate(tile.id);
                              }}
                              disabled={isOtherBooting}
                              className={`group bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[16.5rem] h-auto text-left relative ${
                                isOtherBooting
                                  ? "opacity-50 cursor-not-allowed"
                                  : isBootingThis
                                  ? "ring-2 ring-neutral-400 dark:ring-white/20 cursor-wait"
                                  : ""
                              }`}
                            >
                              {/* Top Row: Clean Category Icon Container */}
                              <div className="flex items-center justify-between w-full">
                                <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                                  {isBootingThis ? (
                                    <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                  ) : (
                                    <FormatIcon id={tile.id} className="w-4 h-4" />
                                  )}
                                </div>
                              </div>

                              {/* Middle Content: Title & Actionable Workflow Guidance */}
                              <div className="mt-3.5 mb-2 flex-1 flex flex-col justify-start">
                                <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors leading-snug">
                                  {tile.label}
                                </h3>
                                <p className="text-[12px] leading-relaxed font-normal text-neutral-600 dark:text-neutral-400 mt-2 line-clamp-3">
                                  {tile.guidance}
                                </p>
                              </div>

                              {/* Bottom Row: Divider & Actionable Deliverables Spec */}
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
                  </>
                ) : (
                  <div className="text-center py-8 flex flex-col items-center gap-3 animate-in fade-in duration-200">
                    <div className="w-10 h-10 rounded-2xl bg-sky-500/10 text-sky-500 flex items-center justify-center">
                      <MessageSquare className="w-5 h-5" />
                    </div>
                    <div>
                      <h2 className="text-base font-semibold text-neutral-900 dark:text-white">Ask Scholar Copilot Active</h2>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                        Your research inquiry is active in full screen.
                      </p>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <button
                        type="button"
                        onClick={() => setIsAiSidebarOpen(true)}
                        className="px-3.5 py-1.5 rounded-xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 text-xs font-medium hover:bg-neutral-800 dark:hover:bg-neutral-100 transition-colors shadow-xs cursor-pointer"
                      >
                        Open Full-Screen Chat
                      </button>
                      <button
                        type="button"
                        onClick={() => setGuideMessages([])}
                        className="px-3.5 py-1.5 rounded-xl bg-neutral-100 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 text-xs font-medium hover:bg-neutral-200 dark:hover:bg-white/15 transition-colors cursor-pointer"
                      >
                        Show Deliverables
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Main AI Prompt Bar — Parallel to the line above settings */}
            <div className="sticky bottom-0 z-20 w-full relative pointer-events-none flex flex-col justify-start bg-gradient-to-t from-[#F8F9FA] dark:from-[#171717] via-[#F8F9FA]/95 dark:via-[#171717]/95 to-transparent px-4 pb-3">
              <div className="w-full max-w-4xl mx-auto relative pointer-events-auto flex flex-col items-center">
                {/* Contextual Clarification when Ask Scholar is Open */}
                {isAiSidebarOpen && (
                  <div className="w-full flex items-center justify-between text-[11px] text-neutral-500 dark:text-neutral-400 mb-1.5 px-2 select-none">
                    <span className="font-medium text-neutral-600 dark:text-neutral-300">Draft Assignment Guidelines</span>
                    <button
                      type="button"
                      onClick={() => guideInputRef.current?.focus()}
                      className="text-sky-600 dark:text-sky-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <span>Ask Scholar Copilot Active</span>
                      <span className="text-[10px]">➔</span>
                    </button>
                  </div>
                )}

                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    if (mainPromptInput.trim() || mainAttachments.length > 0) {
                      handleSendMainPrompt();
                    }
                  }}
                  onDragOver={(e) => {
                    e.preventDefault();
                    setIsDragging(true);
                  }}
                  onDragLeave={(e) => {
                    if (e.currentTarget.contains(e.relatedTarget as Node)) return;
                    setIsDragging(false);
                  }}
                  onDrop={(e) => {
                    e.preventDefault();
                    setIsDragging(false);
                    if (e.dataTransfer.files?.length) {
                      addMainFiles(Array.from(e.dataTransfer.files));
                    }
                  }}
                  className={`pointer-events-auto flex flex-col justify-between w-full rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-sm focus-within:border-neutral-400 dark:focus-within:border-white/20 p-3 transition-all duration-200 ${
                    isDragging
                      ? "border-blue-500 ring-2 ring-blue-500/20 bg-blue-50/10 dark:bg-blue-950/20"
                      : ""
                  }`}
                >
                  {/* Pending Attachments Chips */}
                  {mainAttachments.length > 0 && (
                    <div className="flex flex-wrap items-center gap-1.5 pb-1.5 border-b border-neutral-200/50 dark:border-white/5 mb-1.5 overflow-x-auto max-h-16">
                      {mainAttachments.map((att) => (
                        <div
                          key={att.id}
                          className="flex items-center gap-1.5 px-2 py-0.5 rounded-lg bg-neutral-100 dark:bg-neutral-800 border border-neutral-200 dark:border-white/10 text-xs text-neutral-800 dark:text-neutral-200 shadow-2xs"
                        >
                          {att.isImage ? (
                            att.previewUrl ? (
                              <img src={att.previewUrl} alt={att.name} className="w-4 h-4 object-cover rounded" />
                            ) : (
                              <Paperclip className="w-3 h-3 text-blue-500" />
                            )
                          ) : (
                            <FileText className="w-3 h-3 text-amber-500" />
                          )}
                          <span className="truncate max-w-[150px] font-medium text-[11px]">{att.name}</span>
                          <button
                            type="button"
                            onClick={() => removeMainAttachment(att.id)}
                            aria-label={`Remove ${att.name}`}
                            className="p-0.5 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition-colors cursor-pointer"
                          >
                            <X className="w-3 h-3" />
                          </button>
                        </div>
                      ))}
                      {isMainUploadingAttachment && (
                        <span className="text-[11px] text-neutral-400 flex items-center gap-1 animate-pulse">
                          <Loader2 className="w-3 h-3 animate-spin text-blue-500" /> Parsing attachment...
                        </span>
                      )}
                    </div>
                  )}

                  {/* Top: Transparent flexible input */}
                  <div className="w-full flex items-center">
                    <textarea
                      ref={guideTextareaRef}
                      rows={1}
                      value={mainPromptInput}
                      onChange={(e) => {
                        setMainPromptInput(e.target.value);
                        e.target.style.height = "auto";
                        e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && !e.shiftKey) {
                          e.preventDefault();
                          if (mainPromptInput.trim() || mainAttachments.length > 0) {
                            handleSendMainPrompt();
                          }
                        } else if (e.key === "Backspace" && mainPromptInput === "" && mainAttachments.length > 0) {
                          removeMainAttachment(mainAttachments[mainAttachments.length - 1].id);
                        }
                      }}
                      onPaste={(e) => {
                        const items = e.clipboardData?.items;
                        if (!items) return;
                        const newFiles: File[] = [];
                        for (let i = 0; i < items.length; i++) {
                          if (items[i].kind === "file") {
                            const file = items[i].getAsFile();
                            if (file) newFiles.push(file);
                          }
                        }
                        if (newFiles.length > 0) {
                          e.preventDefault();
                          addMainFiles(newFiles);
                        }
                      }}
                      placeholder="Paste text, drop files/images, or draft research instructions..."
                      style={{ border: "none", outline: "none", boxShadow: "none", background: "transparent" }}
                      className="w-full flex-1 bg-transparent text-sm font-normal text-neutral-900 dark:text-neutral-100 placeholder:text-neutral-500 dark:placeholder:text-neutral-400 border-none outline-none focus:outline-none focus:ring-0 min-w-0 shadow-none focus:shadow-none resize-none leading-relaxed prompt-bare-input max-h-28 overflow-y-auto scholar-scrollbar"
                    />
                  </div>

                  {/* Bottom Action Row: Attachments & Mode Selector on left, Submit button on right */}
                  <div className="flex items-center justify-between gap-2 mt-1.5 pt-1 border-t border-neutral-200/40 dark:border-white/5 w-full">
                    <PromptBarActionMenu
                      currentMode={mainAiMode}
                      onSelectMode={setMainAiMode}
                      onAttachFiles={handleMainFileSelect}
                    />

                    <div className="relative group">
                      <button
                        type="submit"
                        title="Send message (Enter)"
                        aria-label="Send message"
                        disabled={(!mainPromptInput.trim() && mainAttachments.length === 0) || isGuideThinking}
                        className="flex-shrink-0 w-7 h-7 flex items-center justify-center rounded-full transition-all duration-200 cursor-pointer bg-neutral-900 text-white hover:bg-neutral-800 dark:bg-white dark:text-neutral-900 dark:hover:bg-neutral-100 shadow-sm disabled:bg-neutral-200 dark:disabled:bg-white/10 disabled:text-neutral-400 dark:disabled:text-neutral-600 disabled:cursor-not-allowed"
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
                        Send message (Enter)
                      </span>
                    </div>
                  </div>
                </form>
              </div>
            </div>
          </>
        )}
      </main>

      {/* Secondary View (Right Panel / Full-Screen Landing Chat): Module 3.2 AI Assistant */}
      <aside
        style={
          isAiSidebarOpen && !isLandingPage
            ? { width: `min(${aiSidebarWidth}px, 100vw)` }
            : undefined
        }
        className={`h-full bg-white dark:bg-[#18181B] text-neutral-800 dark:text-neutral-200 flex flex-col relative transition-all duration-300 ease-in-out ${
          isAiSidebarOpen
            ? isLandingPage
              ? "flex-1 w-full min-w-0 border-none shadow-none z-20 translate-x-0"
              : "shrink-0 shadow-2xl border-l border-neutral-200/80 dark:border-white/10 z-30 w-full max-w-[calc(100vw-1rem)] translate-x-0"
            : "hidden w-0 max-w-0 translate-x-full overflow-hidden border-none pointer-events-none"
        } ${
          isResizingAiSidebar ? "transition-none select-none" : ""
        }`}
        aria-hidden={!isAiSidebarOpen}
      >
        {/* Resizable Split-Pane Drag Divider on Left Edge (hidden on full-screen landing page) */}
        {isAiSidebarOpen && (
          <div
            onMouseDown={(e) => {
              e.preventDefault();
              setIsResizingAiSidebar(true);
            }}
            className={`${isLandingPage ? "hidden" : "hidden sm:flex"} absolute left-0 top-0 bottom-0 w-2.5 -ml-1 cursor-col-resize hover:bg-sky-500/30 active:bg-sky-500/50 transition-colors z-40 items-center justify-center select-none group`}
            title="Drag to resize panel (360px - 750px)"
          >
            <div className="w-0.5 h-8 bg-neutral-300 dark:bg-white/20 rounded-full group-hover:bg-sky-500 transition-colors" />
          </div>
        )}

        {isAiSidebarOpen && (
          <div className="h-full flex flex-col w-full">
            {/* Sidebar Header with glassmorphism & elevated badge */}
            <header className="px-5 py-3.5 border-b border-neutral-200/80 dark:border-white/10 flex items-center justify-between shrink-0 bg-white/95 dark:bg-[#18181B]/95 backdrop-blur-md sticky top-0 z-20">
              <div className="flex items-center gap-3">
                {isLandingPage && (
                  <>
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
                    {!isSidebarOpen && (
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

            {/* Chat Canvas (flex-1 overflow-y-auto) */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4 text-sm scholar-scrollbar">
              {/* On Landing page before chatting begins: render the 4 deliverable cards in full glory */}
              {isLandingPage && !hasStartedChatting && (
                <div className="w-full max-w-5xl mx-auto my-auto py-6 flex flex-col items-center justify-center animate-in fade-in duration-200">
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

                  {/* Heading */}
                  <div className="text-center mb-6">
                    <h1 className="text-2xl sm:text-3xl font-bold text-neutral-900 dark:text-white tracking-tight">
                      Where will your research begin?
                    </h1>
                    <p className="text-[13px] sm:text-sm text-neutral-500 dark:text-neutral-400 mt-2 max-w-lg mx-auto leading-relaxed">
                      Select an academic deliverable or paste your assignment guidelines below.
                    </p>
                  </div>

                  {/* 4 Cards Grid - Responsive full 4-column layout */}
                  <div className="w-full">
                    <div className="grid w-full gap-4 grid-cols-1 sm:grid-cols-2 lg:grid-cols-4">
                      {FORMAT_TILES.map((tile) => {
                        const isBootingThis = creatingFormatId === tile.id;
                        const isOtherBooting = creating && !isBootingThis;
                        const tileTheme = getFormatTileTheme(tile.id);
                        return (
                          <button
                            key={tile.id}
                            type="button"
                            onClick={() => {
                              if (creating) return;
                              if (!userEmail) {
                                openAuth("signin", `Sign in to boot your ${tile.label} workspace.`, tile.id);
                                return;
                              }
                              handleCreate(tile.id);
                            }}
                            disabled={isOtherBooting}
                            className={`group bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5 shadow-[0_1px_3px_rgba(0,0,0,0.05)] hover:shadow-md cursor-pointer flex flex-col justify-between min-h-[16.5rem] h-auto text-left relative ${
                              isOtherBooting
                                ? "opacity-50 cursor-not-allowed"
                                : isBootingThis
                                ? "ring-2 ring-neutral-400 dark:ring-white/20 cursor-wait"
                                : ""
                            }`}
                          >
                            {/* Top Row: Clean Category Icon Container */}
                            <div className="flex items-center justify-between w-full">
                              <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                                {isBootingThis ? (
                                  <span className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
                                ) : (
                                  <FormatIcon id={tile.id} className="w-4 h-4" />
                                )}
                              </div>
                            </div>

                            {/* Middle Content: Title & Actionable Workflow Guidance */}
                            <div className="mt-3.5 mb-2 flex-1 flex flex-col justify-start">
                              <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-white group-hover:text-neutral-700 dark:group-hover:text-neutral-200 transition-colors leading-snug">
                                {tile.label}
                              </h3>
                              <p className="text-[12px] leading-relaxed font-normal text-neutral-600 dark:text-neutral-400 mt-2 line-clamp-3">
                                {tile.guidance}
                              </p>
                            </div>

                            {/* Bottom Row: Divider & Actionable Deliverables Spec */}
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
                </div>
              )}

              {/* Chat Canvas (when hasStartedChatting or in non-landing view): 4 cards are COMPLETELY HIDDEN! */}
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

                    {msg.sender === "assistant" && !msg.error && (
                      <div className="flex items-center gap-2 mb-2 flex-wrap">
                        {((msg.verifiedSourcesCount !== undefined && msg.verifiedSourcesCount > 0) || (msg.citations && msg.citations.length > 0)) && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 border border-emerald-500/20">
                            <ShieldCheck className="w-3 h-3 text-emerald-500" />
                            <span>{msg.verifiedSourcesCount ?? msg.citations?.length ?? 0} Verified Sources</span>
                          </span>
                        )}
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300">
                          <FileText className="w-3 h-3" />
                          <span>{msg.wordCount || msg.text.trim().split(/\s+/).filter(Boolean).length} words</span>
                        </span>
                        {msg.model && (
                          <span className="text-[10px] text-neutral-400 font-mono">
                            {msg.model}
                          </span>
                        )}
                      </div>
                    )}

                    {msg.sender === "assistant" ? renderFormattedGuideText(
                      msg.citations && msg.citations.length > 0 ? stripRawReferencesSection(msg.text) : msg.text,
                      msg.citations,
                      askCitationStyle
                    ) : (
                      <div className="whitespace-pre-wrap text-[13px] leading-relaxed">{msg.text}</div>
                    )}

                    {/* Deep Research Plan — Interactive Collapsible Trajectory Accordion */}
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
                                    <span>Copy All</span>
                                  </>
                                )}
                              </button>
                              <span className="text-[10px] font-medium normal-case px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20 flex items-center gap-1">
                                <ShieldCheck className="w-3 h-3" />
                                <span>Citation Engine</span>
                              </span>
                            </div>
                          </div>

                          <div className="space-y-2 max-h-72 overflow-y-auto pr-1 scholar-scrollbar">
                            {formattedBib.map((entry, bIdx) => {
                              const c = entry.rawCitation;
                              const domain =
                                c.domain ||
                                (entry.url
                                  ? (() => {
                                      try {
                                        return new URL(entry.url).hostname.replace(/^www\./, "");
                                      } catch {
                                        return "source";
                                      }
                                    })()
                                  : "source");
                              const badge = c.authorityBadge || (c.isPrimary ? "Primary Source" : c.venue || "Verified Source");
                              const isGovOrAcademic =
                                badge.toLowerCase().includes("gov") ||
                                badge.toLowerCase().includes("peer-reviewed") ||
                                badge.toLowerCase().includes("academic");

                              return (
                                <div
                                  key={bIdx}
                                  className="flex flex-col p-2.5 rounded-xl bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/80 dark:border-white/10 hover:border-sky-400 dark:hover:border-sky-500/60 hover:shadow-xs transition text-left relative"
                                >
                                  <div className="flex items-start justify-between gap-2 mb-1.5">
                                    <div className="flex items-center gap-1.5 min-w-0">
                                      {styleInfo.isNumbered && (
                                        <span className="flex-shrink-0 text-[10px] font-mono font-semibold px-1 rounded bg-sky-100 dark:bg-sky-900/50 text-sky-700 dark:text-sky-300">
                                          {entry.displayIndex}
                                        </span>
                                      )}
                                      <img
                                        src={`https://www.google.com/s2/favicons?domain=${domain}&sz=32`}
                                        alt=""
                                        className="w-3.5 h-3.5 rounded-xs flex-shrink-0 opacity-80"
                                        onError={(e) => {
                                          (e.target as HTMLElement).style.display = "none";
                                        }}
                                      />
                                      <span className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400 truncate">
                                        {c.publisher || domain}
                                      </span>
                                    </div>
                                    <div className="flex items-center gap-1 shrink-0">
                                      <button
                                        type="button"
                                        onClick={() => {
                                          navigator.clipboard.writeText(entry.formattedText);
                                          setCopiedMessageId(`ref-${msg.id}-${bIdx}`);
                                          setTimeout(() => setCopiedMessageId(null), 2000);
                                        }}
                                        className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 transition cursor-pointer"
                                        title="Copy formatted citation"
                                      >
                                        {copiedMessageId === `ref-${msg.id}-${bIdx}` ? (
                                          <Check className="w-3 h-3 text-emerald-500" />
                                        ) : (
                                          <Copy className="w-3 h-3" />
                                        )}
                                      </button>
                                      {entry.url && (
                                        <a
                                          href={entry.url}
                                          target="_blank"
                                          rel="noopener noreferrer"
                                          className="p-1 rounded hover:bg-neutral-200 dark:hover:bg-white/10 text-neutral-400 hover:text-sky-500 transition cursor-pointer"
                                          title="Open source link or DOI"
                                        >
                                          <ExternalLink className="w-3 h-3" />
                                        </a>
                                      )}
                                    </div>
                                  </div>

                                  <div className="text-xs text-neutral-800 dark:text-neutral-200 leading-relaxed font-serif pl-0.5">
                                    {entry.formattedText}
                                  </div>

                                  <div className="flex items-center justify-between gap-1.5 mt-2 pt-1.5 border-t border-neutral-100 dark:border-white/5 text-[9px]">
                                    <div className="flex items-center gap-1.5">
                                      <span
                                        className={`px-1.5 py-0.2 rounded-full font-medium ${
                                          isGovOrAcademic
                                            ? "bg-emerald-50 dark:bg-emerald-950/40 text-emerald-600 dark:text-emerald-400 border border-emerald-200 dark:border-emerald-800/40"
                                            : "bg-neutral-100 dark:bg-white/10 text-neutral-600 dark:text-neutral-300"
                                        }`}
                                      >
                                        {badge}
                                      </span>
                                      {entry.doi && (
                                        <span className="font-mono text-neutral-400 truncate max-w-[130px]">
                                          DOI: {entry.doi.replace(/^https?:\/\/doi\.org\//, "")}
                                        </span>
                                      )}
                                    </div>
                                    {entry.url && (
                                      <a
                                        href={entry.url}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="text-sky-600 dark:text-sky-400 hover:underline inline-flex items-center gap-0.5 font-medium shrink-0"
                                      >
                                        <span>Visit Source</span>
                                        <span className="text-[10px]">↗</span>
                                      </a>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      );
                    })()}

                    {/* 1-Click Workspace Handoff Banner */}
                    {msg.sender === "assistant" && (msg.recommendedWorkspaceHandoff || (msg.citations && msg.citations.length > 0)) && (
                      <div className="mt-3.5 p-3 rounded-xl bg-emerald-50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800/40 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-3 shadow-2xs">
                        <div className="flex items-start gap-2.5 min-w-0">
                          <div className="p-2 rounded-lg bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 shrink-0">
                            <FolderPlus className="w-4 h-4" />
                          </div>
                          <div className="min-w-0">
                            <div className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5 flex-wrap">
                              <span>
                                {msg.recommendedWorkspaceHandoff
                                  ? `Launch in ${msg.recommendedWorkspaceHandoff.formatLabel}`
                                  : "Scholarly Workspace Handoff"}
                              </span>
                              {(msg.verifiedSourcesCount || msg.citations?.length || 0) > 0 && (
                                <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-emerald-500/20 text-emerald-800 dark:text-emerald-200 font-medium">
                                  {msg.verifiedSourcesCount || msg.citations?.length || 0} Verified Sources Attached
                                </span>
                              )}
                              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-sky-500/10 text-sky-800 dark:text-sky-200 font-mono">
                                {msg.wordCount || msg.text.trim().split(/\s+/).filter(Boolean).length} words
                              </span>
                            </div>
                            <p className="text-[11px] text-neutral-600 dark:text-neutral-300 mt-0.5 line-clamp-2">
                              Transition this research synthesis into a structured coursework essay or formal journal manuscript with evidentiary matrices and quality gates.
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-2 w-full lg:w-auto flex-wrap lg:flex-nowrap shrink-0">
                          <button
                            type="button"
                            onClick={() => handleBootProjectFromResearch(msg, "OT-01")}
                            className="flex-1 lg:flex-initial px-3 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 active:scale-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap"
                          >
                            <span>Launch in 4-Phase Essay Engine (OT-01)</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => handleBootProjectFromResearch(msg, "OT-10")}
                            className="flex-1 lg:flex-initial px-3 py-2 rounded-lg bg-sky-600 hover:bg-sky-700 active:scale-95 text-white text-xs font-semibold flex items-center justify-center gap-1.5 transition-all shadow-xs cursor-pointer whitespace-nowrap"
                          >
                            <span>Launch in Journal Studio (OT-10)</span>
                            <ArrowRight className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    )}

                    {/* Response Utility Action Bar */}
                    {msg.sender === "assistant" && !msg.error && (
                      <div className="flex items-center justify-between pt-2.5 mt-2.5 border-t border-neutral-200/60 dark:border-white/10 text-[11px] text-neutral-500 dark:text-neutral-400">
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => handleCopyResponse(msg.id, msg.text)}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Copy full response to markdown"
                          >
                            {copiedMessageId === msg.id ? (
                              <>
                                <Check className="w-3 h-3 text-emerald-500" />
                                <span className="text-emerald-600 dark:text-emerald-400 font-medium">Copied!</span>
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
                            onClick={() => {
                              if (!userEmail) {
                                openAuth("signin", "Sign in to save research findings to your Knowledge Vault.");
                                return;
                              }
                              onOpenVault?.();
                            }}
                            className="flex items-center gap-1 px-2 py-0.5 rounded-md hover:bg-neutral-200/60 dark:hover:bg-white/10 transition-colors cursor-pointer"
                            title="Open Knowledge Vault to manage citations & evidence"
                          >
                            <Database className="w-3 h-3 text-amber-500" />
                            <span>Vault</span>
                          </button>

                          {/* Boot Project from Research Button */}
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

            {/* Pinned Floating Input Component (Module 3.4) */}
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
                    ref={guideInputRef as any}
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
        )}
      </aside>

      {/* Delete Confirmation Modal Pop-up */}
      {projectToDelete && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="delete-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150"
          onClick={() => !deletingId && setProjectToDelete(null)}
        >
          <div
            className="w-full max-w-md rounded-3xl bg-white dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 p-7 shadow-2xl relative text-left animate-in zoom-in-95 duration-150"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Title */}
            <h3 id="delete-modal-title" className="text-xl font-extrabold text-neutral-900 dark:text-neutral-100 tracking-tight mb-2.5 font-sans">
              Delete Project
            </h3>

            {/* Sub-label */}
            <p className="text-sm text-neutral-600 dark:text-neutral-400 leading-relaxed mb-7 font-normal font-sans">
              Are you sure you want to delete <span className="font-semibold text-neutral-900 dark:text-neutral-100">"{getProjectTitle(projectToDelete)}"</span>? All associated notes, drafts, and evidence will be permanently removed. This action cannot be undone.
            </p>

            {/* Action Buttons */}
            <div className="flex items-center justify-end gap-3 pt-1 font-sans">
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={() => setProjectToDelete(null)}
                className="px-5 py-2.5 rounded-full text-sm font-medium text-neutral-700 dark:text-neutral-300 bg-neutral-100 dark:bg-white/5 hover:bg-neutral-200 dark:hover:bg-white/10 border border-neutral-200 dark:border-white/10 transition-all cursor-pointer disabled:opacity-50 font-sans"
              >
                Cancel
              </button>
              {/* Delete text option in iconic Pinterest Red (#E60023) */}
              <button
                type="button"
                disabled={deletingId !== null}
                onClick={handleConfirmDelete}
                className="px-5 py-2.5 rounded-full text-sm font-bold text-[#E60023] hover:text-[#AD081B] bg-[#E60023]/15 hover:bg-[#E60023]/25 transition-all cursor-pointer disabled:opacity-50 font-sans flex items-center justify-center"
              >
                {deletingId ? (
                  <>
                    <span className="w-3.5 h-3.5 border-2 border-[#E60023] border-t-transparent rounded-full animate-spin mr-2" />
                    <span>Deleting...</span>
                  </>
                ) : (
                  <span>Delete</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Global Universal Command Palette (⌘K / Ctrl+K) */}
      <CommandPalette
        isOpen={isCommandPaletteOpen}
        onClose={() => setIsCommandPaletteOpen(false)}
        projects={projects || []}
        onOpenProject={(id) => {
          setIsCommandPaletteOpen(false);
          onOpen(id);
        }}
        onCreateProject={(formatId) => {
          setIsCommandPaletteOpen(false);
          handleCreate(formatId);
        }}
        onOpenVault={() => {
          setIsCommandPaletteOpen(false);
          if (!userEmail) {
            openAuth("signin", "Sign in to access your Knowledge Vault references.");
            return;
          }
          setActiveView("vault");
          onOpenVault?.();
        }}
        onOpenAiAccess={() => {
          setIsCommandPaletteOpen(false);
          if (onOpenAiAccess) onOpenAiAccess();
          else setActiveView("ai-access");
        }}
        onOpenAskScholar={(initialQuery, mode) => {
          setIsCommandPaletteOpen(false);
          setIsAiSidebarOpen(true);
          if (mode === "deep-research") {
            setSidebarAiMode("deep_research");
          } else if (mode === "search") {
            setSidebarAiMode("search");
          }
          if (initialQuery) {
            handleSendGuideMessage(initialQuery, undefined, mode);
          }
        }}
        theme={theme}
        onToggleTheme={toggleTheme}
      />

      {/* In-Page Authentication Modal */}
      <EmbeddedAuthModal
        isOpen={authModalOpen}
        onClose={closeAuth}
        initialMode={authModalMode}
        initialMessage={authModalMessage}
        selectedFormatId={pendingFormatId}
      />
    </div>
  );
}


function getFormatTileTheme(id: string) {
  switch (id) {
    case "OT-01":
      return {
        badgeBg: "bg-blue-50/90 text-blue-600 dark:bg-blue-500/10 dark:text-blue-400 border border-blue-100 dark:border-blue-500/20",
        accentText: "text-blue-600 dark:text-blue-400",
        hoverBorder: "hover:border-blue-300 dark:hover:border-blue-500/40",
      };
    case "OT-10":
      return {
        badgeBg: "bg-amber-50/90 text-amber-600 dark:bg-amber-500/10 dark:text-amber-400/90 border border-amber-100 dark:border-amber-500/20",
        accentText: "text-amber-600 dark:text-amber-400/90",
        hoverBorder: "hover:border-amber-300 dark:hover:border-amber-500/40",
      };
    case "OT-19":
      return {
        badgeBg: "bg-indigo-50/90 text-indigo-600 dark:bg-indigo-500/10 dark:text-indigo-400/90 border border-indigo-100 dark:border-indigo-500/20",
        accentText: "text-indigo-600 dark:text-indigo-400/90",
        hoverBorder: "hover:border-indigo-300 dark:hover:border-indigo-500/40",
      };
    case "OT-22":
      return {
        badgeBg: "bg-teal-50/90 text-teal-600 dark:bg-teal-500/10 dark:text-teal-300/90 border border-teal-100 dark:border-teal-500/20",
        accentText: "text-teal-600 dark:text-teal-300/90",
        hoverBorder: "hover:border-teal-300 dark:hover:border-teal-500/40",
      };
    default:
      return {
        badgeBg: "bg-slate-50 dark:bg-neutral-800 text-slate-700 dark:text-slate-200 border border-slate-200 dark:border-white/5",
        accentText: "text-slate-500 dark:text-neutral-400",
        hoverBorder: "hover:border-slate-300 dark:hover:border-neutral-700",
      };
  }
}


/** Modern wireframe icon for academic formats */
function FormatIcon({ id, className = "w-4 h-4" }: { id: string; className?: string }) {
  switch (id) {
    case "OT-01":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
        </svg>
      );
    case "OT-10":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
        </svg>
      );
    case "OT-09":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 14l9-5-9-5-9 5 9 5zm0 0l6.16-3.422a12.083 12.083 0 01.665 6.479A11.952 11.952 0 0012 20.055a11.952 11.952 0 00-6.824-2.998 12.078 12.078 0 01.665-6.479L12 14zm-4 6v-7.5" />
        </svg>
      );
    case "OT-19":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M9.663 17h4.673M12 3v1m6.364 1.636l-.707.707M21 12h-1M4 12H3m3.343-5.657l-.707-.707m2.828 9.9a5 5 0 117.072 0l-.548.547A3.374 3.374 0 0014 18.469V19a2 2 0 11-4 0v-.531c0-.895-.356-1.754-.988-2.386l-.548-.547z" />
        </svg>
      );
    case "OT-22":
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M7 12l3-3 3 3 4-4M8 21l4-4 4 4M3 4h18M4 4h16v12a1 1 0 01-1 1H5a1 1 0 01-1-1V4z" />
        </svg>
      );
    case "OT-07":
    default:
      return (
        <svg className={className} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="1.5">
          <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h10M4 18h14M16 10l4 4m0-4l-4 4" />
        </svg>
      );
  }
}

function ChooseOutputType({
  types,
  creating,
  onPick,
  onCancel,
}: {
  types: OutputTypeSummary[] | null;
  creating: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState("");

  const selectedSummary = useMemo(() => {
    if (!types || !selected) return null;
    return types.find((t) => t.id === selected) ?? null;
  }, [types, selected]);

  return (
    <div className="max-w-6xl mx-auto py-6 animate-fade-in font-sans">
      <button
        onClick={onCancel}
        className="mb-8 inline-flex items-center gap-2 text-xs font-medium text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-neutral-100 transition-all px-4 py-2 rounded-full bg-neutral-100 dark:bg-[#1C1C1E] border border-neutral-200 dark:border-white/10 shadow-sm cursor-pointer font-sans"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth="2">
          <path strokeLinecap="round" strokeLinejoin="round" d="M10 19l-7-7m0 0l7-7m-7 7h18" />
        </svg>
        <span>Return to Command Center</span>
      </button>

      <div className="mb-8">
        <h2 className="text-2xl sm:text-3xl font-bold tracking-tight text-neutral-900 dark:text-neutral-100 font-sans mb-1.5">
          Select Output Format
        </h2>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20 border border-neutral-200 dark:border-white/10 bg-neutral-50 dark:bg-[#1C1C1E] rounded-2xl shadow-sm">
          <div className="w-8 h-8 border-2 border-neutral-400 dark:border-white/40 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="space-y-6">
          {/* Accessible hidden select to ensure test & screen reader compatibility */}
          <select
            id="output-type"
            aria-label="Target Publication Type"
            value={selected}
            onChange={(e) => setSelected(e.target.value)}
            className="sr-only"
          >
            <option value="" disabled>Choose a format...</option>
            {FORMAT_TILES.map((tile) => (
              <option key={tile.id} value={tile.id}>
                {tile.label}
              </option>
            ))}
            {/* Preserve any extra test types */}
            {types
              .filter((t) => t.id !== "OT-09" && !FORMAT_TILES.some((f) => f.id === t.id))
              .map((t) => (
                <option key={t.id} value={t.id}>
                  {t.label}
                </option>
              ))}
          </select>

          {/* Interactive Format Tiles Grid */}
          <div className="grid w-full grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            {FORMAT_TILES.map((tile) => {
              const isSelected = selected === tile.id;
              const tileTheme = getFormatTileTheme(tile.id);
              const uspParts = tile.usp ? tile.usp.split(" · ") : [];

              return (
                <div
                  key={tile.id}
                  onClick={() => setSelected(tile.id)}
                  onDoubleClick={() => onPick(tile.id)}
                  className={`group bg-neutral-50/80 dark:bg-white/5 border border-neutral-200 dark:border-white/10 hover:border-neutral-300 dark:hover:border-white/20 ${tileTheme.hoverBorder} rounded-2xl p-5 transition-all duration-150 hover:-translate-y-0.5 shadow-xs hover:shadow cursor-pointer flex flex-col justify-between h-56 text-left relative ${
                    isSelected
                      ? "ring-2 ring-neutral-400 dark:ring-white/30 border-neutral-400 dark:border-white/30"
                      : ""
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between w-full mb-3">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 transition-transform duration-200 group-hover:scale-105 shadow-2xs ${tileTheme.badgeBg}`}>
                        <FormatIcon id={tile.id} className="w-4 h-4" />
                      </div>
                      <div className="w-6 h-6 rounded-full flex items-center justify-center text-neutral-400 group-hover:text-neutral-900 dark:group-hover:text-neutral-100 transition-colors">
                        <svg className="w-3.5 h-3.5 transition-transform duration-200 group-hover:translate-x-0.5 group-hover:-translate-y-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M7 17L17 7M17 7H7M17 7V17" />
                        </svg>
                      </div>
                    </div>
                    <h3 className="text-[15px] font-semibold tracking-tight text-neutral-900 dark:text-neutral-100 leading-snug">
                      {tile.label}
                    </h3>
                    <p className="text-[12px] leading-relaxed font-normal text-neutral-500 dark:text-neutral-400 mt-1.5 line-clamp-2">
                      {tile.guidance || tile.usp}
                    </p>
                  </div>
                  <div className="pt-3 border-t border-neutral-100 dark:border-white/5 flex items-center justify-between gap-2 text-[12px] text-neutral-500 dark:text-neutral-400 font-sans">
                    <span className="font-medium text-neutral-500 dark:text-neutral-400 truncate">
                      {((tile.specs || tile.footer).split(" · ")).map((part, idx) => (
                        <Fragment key={idx}>
                          {idx > 0 && <span className="mx-1 text-neutral-400 dark:text-neutral-500 opacity-60">·</span>}
                          <span>{part}</span>
                        </Fragment>
                      ))}
                    </span>
                    <span className="font-semibold text-neutral-700 dark:text-neutral-300">Select</span>
                  </div>
                </div>
              );
            })}
          </div>

          {/* Action Bar */}
          <div className="pt-4 border-t border-neutral-200 dark:border-white/10 flex items-center justify-end font-sans">
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto rounded-full bg-neutral-900 dark:bg-white px-6 py-2.5 text-xs font-semibold text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-200 disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2 cursor-pointer shadow-sm transition-transform active:scale-95 font-sans"
            >
              {creating ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                  <span>Initializing Workspace...</span>
                </>
              ) : (
                <>
                  <span>{selected ? `Boot ${FORMAT_TILES.find((t) => t.id === selected)?.label || "Workspace"}` : "Select a Format to Boot"}</span>
                  <span aria-hidden="true" className="text-sm font-bold">→</span>
                </>
              )}
            </button>
          </div>
        </div>
      )}

      {/* Footer info banner */}
      <footer className="mt-12 py-4 px-4 text-center text-xs text-neutral-500 dark:text-neutral-400 border-t border-neutral-200 dark:border-white/10 font-sans">
        <div className="flex flex-col sm:flex-row items-center justify-center gap-2 sm:gap-6 font-normal">
          <span className="flex items-center gap-1.5">
            <strong className="font-semibold text-gray-900 dark:text-gray-100">Projects</strong>
            <span>— synced to account</span>
          </span>
          <span aria-hidden="true" className="hidden sm:inline text-gray-300 dark:text-neutral-700">·</span>
          <span className="flex items-center gap-1.5">
            <strong className="font-semibold text-gray-900 dark:text-gray-100">Private Vault</strong>
            <span>— client-side encrypted</span>
          </span>
        </div>
      </footer>
    </div>
  );
}
