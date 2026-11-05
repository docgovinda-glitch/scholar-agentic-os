import React, { useState, Fragment } from "react";
import { Copy, Check, Scale, Info, BarChart3, Network, ExternalLink } from "lucide-react";
import type { WebsiteAssistantMessage, WebsiteCitationItem, AssistantAction } from "./types";
import { WEBSITE_ASSISTANT_FAQS } from "./constants";
import { formatAskScholarInText } from "../scholarCitationEngine";

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

export function InlineCitationBadge({
  num,
  url,
  citation,
  label,
  onAddToEvidence,
  onFocusInGraph,
}: {
  num: string | number;
  url?: string;
  citation?: WebsiteCitationItem;
  label?: string;
  onAddToEvidence?: (citation: WebsiteCitationItem) => void;
  onFocusInGraph?: (citation: WebsiteCitationItem) => void;
}) {
  const targetUrl = url || (citation as Record<string, unknown> | undefined)?.doi as string | undefined || citation?.url;
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

  const venue = citation?.venue || citation?.journal || citation?.publisher || domain || "Academic Source";
  const authorStr = citation?.authors && citation.authors.length > 0
    ? citation.authors.length > 2
      ? `${citation.authors[0]} et al.`
      : citation.authors.join(", ")
    : citation?.author;

  const isPeerReviewed =
    citation?.sourceType === "scholarly" ||
    /nature|science|ieee|acm|neurips|icml|lancet|cell|springer|elsevier|wiley|pnas|oxford|cambridge/i.test(venue);

  const isOpenAccess =
    Boolean(targetUrl && /arxiv\.org|biorxiv\.org|openalex|doi\.org\/10\.48550/i.test(targetUrl)) ||
    citation?.authorityTier === "open_access" ||
    citation?.sourceType === "scholarly";

  const snippet = citation?.evidenceSnippet || citation?.snippet || citation?.mainFinding;

  return (
    <span className="relative group/cite inline align-baseline">
      <a
        href={targetUrl || "#"}
        target={targetUrl ? "_blank" : undefined}
        rel="noopener noreferrer"
        onClick={(e) => {
          if (!targetUrl) e.preventDefault();
          e.stopPropagation();
        }}
        className="font-medium text-[0.95em] text-blue-700 dark:text-blue-300 underline decoration-blue-300/60 dark:decoration-blue-500/50 underline-offset-2 hover:decoration-current cursor-pointer"
        title={citation?.title ? `Source ${displayLabel}: ${citation.title}` : targetUrl ? `Source ${displayLabel}: ${targetUrl}` : `Source ${displayLabel}`}
      >
        {displayLabel}
      </a>

      {/* Citation Engine Verified Micro-Card Hover Popover */}
      {citation && (
        <span
          data-testid="citation-micro-card"
          className="pointer-events-none opacity-0 group-hover/cite:opacity-100 group-hover/cite:pointer-events-auto transition-all duration-200 ease-out absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3.5 rounded-2xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-200 dark:border-white/15 shadow-2xl text-left z-50 transform group-hover/cite:translate-y-0 translate-y-1 block select-text font-sans"
        >
          {/* Top Venue & Tags Row */}
          <span className="flex items-center justify-between gap-1.5 mb-2">
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
              <span className="text-[11px] font-bold text-neutral-800 dark:text-neutral-200 truncate">
                {venue}
              </span>
            </span>
            <span className="flex items-center gap-1 shrink-0 text-[10px]">
              {citation.year && (
                <span className="font-mono text-neutral-500 dark:text-neutral-400">
                  {citation.year}
                </span>
              )}
              {isPeerReviewed && (
                <span className="px-1.5 py-0.5 rounded-full font-semibold bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border border-indigo-200/50 dark:border-indigo-800/40 text-[9px]">
                  Peer Reviewed
                </span>
              )}
              {isOpenAccess && (
                <span className="px-1.5 py-0.5 rounded-full font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40 text-[9px]">
                  Open Access
                </span>
              )}
            </span>
          </span>

          {/* Paper Title */}
          <span className="block text-xs font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug mb-1">
            {citation.title || "External Scholarly Resource"}
          </span>

          {/* Authors */}
          {authorStr && (
            <span className="block text-[10.5px] text-neutral-600 dark:text-neutral-400 truncate mb-1.5">
              {authorStr}
            </span>
          )}

          {/* Empirical Snippet / Excerpt */}
          {snippet && (
            <span className="block text-[10px] text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed mb-2.5 italic bg-neutral-50 dark:bg-neutral-800/60 p-1.5 rounded-lg border border-neutral-100 dark:border-white/5">
              "{snippet}"
            </span>
          )}

          {/* Micro-Card Action Buttons Row */}
          <span className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-white/10 gap-1.5 text-[10px]">
            <span className="flex items-center gap-1">
              {onAddToEvidence && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onAddToEvidence(citation);
                  }}
                  className="px-2 py-0.5 rounded-md font-semibold bg-emerald-500/10 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-500/20 border border-emerald-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Extract & add empirical findings to Evidence Matrix"
                >
                  <BarChart3 className="w-3 h-3 text-emerald-600 dark:text-emerald-400" />
                  <span>+ Matrix</span>
                </button>
              )}

              {onFocusInGraph && (
                <button
                  type="button"
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    onFocusInGraph(citation);
                  }}
                  className="px-2 py-0.5 rounded-md font-semibold bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 hover:bg-indigo-500/20 border border-indigo-500/30 transition-colors flex items-center gap-1 cursor-pointer"
                  title="Explore paper in Literature Discovery citation graph"
                >
                  <Network className="w-3 h-3 text-indigo-600 dark:text-indigo-400" />
                  <span>Graph ↗</span>
                </button>
              )}
            </span>

            {targetUrl && (
              <a
                href={targetUrl}
                target="_blank"
                rel="noopener noreferrer"
                onClick={(e) => e.stopPropagation()}
                className="text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-0.5 font-medium ml-auto"
              >
                <span>Read DOI</span>
                <ExternalLink className="w-2.5 h-2.5" />
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
  citationStyle: string = "apa",
  onAddToEvidence?: (citation: WebsiteCitationItem) => void,
  onFocusInGraph?: (citation: WebsiteCitationItem) => void
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
              onAddToEvidence={onAddToEvidence}
              onFocusInGraph={onFocusInGraph}
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
          <Fragment key={`cite-group-${mIdx}`}>
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
                  onAddToEvidence={onAddToEvidence}
                  onFocusInGraph={onFocusInGraph}
                />
              );
            })}
          </Fragment>
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
