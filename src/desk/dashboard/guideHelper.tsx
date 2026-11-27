import { claimBefore, claimKey, findSupportingPassage } from "../../domain/ask/passageMatch";
import { normalizeCitationMarkers } from "../../shared/citationMarkers";
import React, { useState, Fragment } from "react";
import { createPortal } from "react-dom";
import { PHONE_SHEET_CLASSES, useIsPhoneSheet } from "../components/usePhoneSheet";
import { Copy, Check, Scale, Info, Network, ExternalLink, ChevronRight as ChevronRightIcon } from "lucide-react";
import type { WebsiteAssistantMessage, WebsiteCitationItem } from "./types";
import {
  formatAskScholarInText,
  stripRawReferencesSection,
} from "../scholarCitationEngine";

export function CodeBlockWithCopy({ lang, code }: { lang: string; code: string }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="my-2.5 rounded-xl bg-neutral-900 dark:bg-ink-900 border border-neutral-800 dark:border-white/10 overflow-hidden shadow-2xs">
      <div className="flex items-center justify-between px-3 py-1.5 bg-white/5 border-b border-white/5 text-xs font-mono text-neutral-400">
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

/**
 * Converts LaTeX math expressions into clean typographic math nodes (KaTeX-compatible DOM).
 */
const LATEX_SYMBOL_MAP: Record<string, string> = {
  "\\alpha": "α",
  "\\beta": "β",
  "\\gamma": "γ",
  "\\Gamma": "Γ",
  "\\delta": "δ",
  "\\Delta": "Δ",
  "\\epsilon": "ε",
  "\\varepsilon": "ε",
  "\\zeta": "ζ",
  "\\eta": "η",
  "\\theta": "θ",
  "\\Theta": "Θ",
  "\\kappa": "κ",
  "\\lambda": "λ",
  "\\Lambda": "Λ",
  "\\mu": "μ",
  "\\nu": "ν",
  "\\xi": "ξ",
  "\\pi": "π",
  "\\Pi": "Π",
  "\\rho": "ρ",
  "\\sigma": "σ",
  "\\Sigma": "Σ",
  "\\tau": "τ",
  "\\phi": "φ",
  "\\Phi": "Φ",
  "\\chi": "χ",
  "\\psi": "ψ",
  "\\Psi": "Ψ",
  "\\omega": "ω",
  "\\Omega": "Ω",
  "\\pm": "±",
  "\\mp": "∓",
  "\\times": "×",
  "\\div": "÷",
  "\\cdot": "·",
  "\\leq": "≤",
  "\\le": "≤",
  "\\geq": "≥",
  "\\ge": "≥",
  "\\neq": "≠",
  "\\ne": "≠",
  "\\approx": "≈",
  "\\equiv": "≡",
  "\\sim": "∼",
  "\\propto": "∝",
  "\\infty": "∞",
  "\\partial": "∂",
  "\\nabla": "∇",
  "\\forall": "∀",
  "\\exists": "∃",
  "\\in": "∈",
  "\\notin": "∉",
  "\\subset": "⊂",
  "\\subseteq": "⊆",
  "\\cup": "∪",
  "\\cap": "∩",
  "\\sum": "∑",
  "\\prod": "∏",
  "\\int": "∫",
  "\\rightarrow": "→",
  "\\to": "→",
  "\\leftarrow": "←",
  "\\Rightarrow": "⇒",
  "\\Leftarrow": "⇐",
  "\\leftrightarrow": "↔",
  "\\Leftrightarrow": "⇔",
};

export function formatLatexMathToText(latex: string): string {
  let out = latex.trim();
  // \text{...} -> ...
  out = out.replace(/\\(?:text|mathrm|mathbf|mathit)\{([^}]*)\}/g, "$1");
  // \frac{a}{b} -> (a)/(b)
  out = out.replace(/\\frac\{([^}]*)\}\{([^}]*)\}/g, "($1)/($2)");
  // \sqrt{a} -> √(a)
  out = out.replace(/\\sqrt\{([^}]*)\}/g, "√($1)");
  // \hat{x} -> x̂, \bar{x} -> x̄
  out = out.replace(/\\hat\{([^}]*)\}/g, "$1\u0302");
  out = out.replace(/\\bar\{([^}]*)\}/g, "$1\u0304");
  for (const [cmd, sym] of Object.entries(LATEX_SYMBOL_MAP)) {
    out = out.split(cmd).join(sym);
  }
  // Clean remaining braces around superscripts/subscripts: ^{2} -> ^2, _{i} -> _i
  out = out.replace(/\^\{([^}]*)\}/g, "^$1");
  out = out.replace(/_\{([^}]*)\}/g, "_$1");
  return out;
}

export function LatexMathBlock({
  latex,
  displayMode = false,
}: {
  latex: string;
  displayMode?: boolean;
}) {
  const rendered = formatLatexMathToText(latex);
  if (displayMode) {
    return (
      <div
        data-testid="katex-display-math"
        className="katex-display my-2.5 py-2 px-3 rounded-xl bg-neutral-50 dark:bg-white/5 border border-neutral-200/70 dark:border-white/10 text-center font-serif text-sm text-neutral-900 dark:text-neutral-100 overflow-x-auto"
      >
        <span className="font-serif italic">{rendered}</span>
      </div>
    );
  }
  return (
    <span
      data-testid="katex-inline-math"
      className="katex-inline font-serif italic px-1 py-0.5 rounded bg-neutral-100/70 dark:bg-white/5 text-neutral-900 dark:text-neutral-100"
    >
      {rendered}
    </span>
  );
}

/**
 * Scrolls to and briefly highlights the matching Reference List entry when an in-text citation chip is clicked (Section 10).
 */
export function scrollToReferenceEntry(num: string | number, messageId?: string) {
  if (typeof document === "undefined") return;
  const candidateIds = [
    messageId ? `ref-entry-${messageId}-${num}` : "",
    `ref-entry-${num}`,
  ].filter(Boolean);

  let targetEl: HTMLElement | null = null;
  for (const id of candidateIds) {
    const el = document.getElementById(id);
    if (el) {
      targetEl = el;
      break;
    }
  }
  if (!targetEl) {
    targetEl = document.querySelector(`[data-ref-num="${num}"]`) as HTMLElement | null;
  }

  if (targetEl) {
    if (typeof targetEl.scrollIntoView === "function") {
      targetEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
    targetEl.classList.add("ring-2", "ring-blue-500", "bg-blue-50/60", "dark:bg-blue-950/40");
    const elRef = targetEl;
    setTimeout(() => {
      elRef.classList.remove("ring-2", "ring-blue-500", "bg-blue-50/60", "dark:bg-blue-950/40");
    }, 2200);
  }
}

/** Marks the words of a passage that the claim shares. */
function highlightMatched(passage: string, matched: string[]): React.ReactNode[] {
  if (matched.length === 0) return [passage];
  const re = new RegExp(`\\b(${matched.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})\\b`, "gi");
  return passage.split(re).map((part, i) =>
    i % 2 === 1 ? (
      <mark key={i} className="bg-emerald-200/70 dark:bg-emerald-700/40 text-inherit rounded-sm px-0.5">
        {part}
      </mark>
    ) : (
      part
    )
  );
}

export function InlineCitationBadge({
  num,
  url,
  citation,
  label,
  messageId,
  onFocusInGraph,
  claim,
}: {
  num: string | number;
  url?: string;
  citation?: WebsiteCitationItem;
  label?: string;
  messageId?: string;
  onFocusInGraph?: (citation: WebsiteCitationItem) => void;
  /** The sentence this citation supports; the hover card shows the passage that backs it. */
  claim?: string;
}) {
  const doiStr = (citation as Record<string, unknown> | undefined)?.doi as string | undefined;
  const targetUrl =
    url ||
    (doiStr ? (doiStr.startsWith("http") ? doiStr : `https://doi.org/${doiStr}`) : undefined) ||
    citation?.url;
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
  const authorStr =
    citation?.authors && citation.authors.length > 0
      ? citation.authors.length > 2
        ? `${citation.authors[0]} et al.`
        : citation.authors.join(", ")
      : citation?.author;

  const sourceTypeBadge =
    citation?.csl?.sourceTypeLabel ||
    (citation?.sourceType === "scholarly"
      ? "peer-reviewed article"
      : citation?.sourceType === "official"
        ? "government / institutional report"
        : citation?.sourceType || "verified source");

  const isPreprint =
    sourceTypeBadge.includes("preprint") ||
    citation?.credibilityLevel === "preprint - not peer-reviewed" ||
    Boolean(targetUrl && /arxiv\.org|biorxiv\.org|medrxiv\.org/i.test(targetUrl));

  // Only what the record says: a news item about a paper in a journal named "Nature" is not itself peer reviewed.
  const isPeerReviewed =
    !isPreprint &&
    (citation?.sourceType === "scholarly" || (citation?.authorityBadge || "").toLowerCase().includes("peer"));

  const isOpenAccess =
    Boolean(citation?.openAccessUrl) ||
    Boolean(targetUrl && /arxiv\.org|biorxiv\.org|openalex|europepmc|doi\.org\/10\.48550/i.test(targetUrl)) ||
    citation?.authorityTier === "open_access" ||
    citation?.sourceType === "scholarly";

  const snippet = citation?.evidenceSnippet || citation?.snippet || citation?.mainFinding;
  // Deep Research traces each cited claim on the server against the source's fuller text; that answer wins.
  // Otherwise the claim is matched against the excerpt the answer was written from.
  const traced = claim ? citation?.claimPassages?.find((p) => p.key === claimKey(claim)) : undefined;
  const supporting = traced
    ? traced.passage
      ? { passage: traced.passage, matched: findSupportingPassage(claim!, traced.passage, 1)?.matched ?? [], score: 0 }
      : null
    : claim && snippet
      ? findSupportingPassage(claim, snippet)
      : null;
  const noMatch = Boolean(claim) && !supporting && (Boolean(traced) || Boolean(snippet));

  // Phones have no hover: a tap opens the card as a sheet (the passage behind the claim), a second tap on its link opens the source.
  const [sheetOpen, setSheetOpen] = useState(false);
  const isPhone = useIsPhoneSheet();

  const cardBody = citation ? (
    <>
          {/* Top Venue & Source Type Row */}
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
              <span className="text-xs font-bold text-neutral-800 dark:text-neutral-200 truncate">
                {venue}
              </span>
            </span>
            <span className="flex items-center gap-1 shrink-0 text-xs">
              {citation.year && (
                <span className="font-mono text-neutral-500 dark:text-neutral-400">
                  {citation.year}
                </span>
              )}
              <span
                className={`px-1.5 py-0.5 rounded-full font-semibold text-xs border ${isPreprint
                    ? "bg-amber-50 dark:bg-amber-950/60 text-amber-700 dark:text-amber-300 border-amber-200/60 dark:border-amber-800/40"
                    : "bg-indigo-50 dark:bg-indigo-950/60 text-indigo-700 dark:text-indigo-300 border-indigo-200/50 dark:border-indigo-800/40"
                  }`}
              >
                {isPreprint ? "Preprint (Not Peer-Reviewed)" : isPeerReviewed ? "Peer Reviewed" : sourceTypeBadge}
              </span>
              {citation.fullTextRead && (
                <span data-testid="citation-full-text" className="px-1.5 py-0.5 rounded-full font-semibold bg-sky-50 dark:bg-sky-950/60 text-sky-800 dark:text-sky-300 border border-sky-200/50 dark:border-sky-800/40 text-xs">
                  Full text read
                </span>
              )}
              {isOpenAccess && !citation.fullTextRead && (
                <span className="px-1.5 py-0.5 rounded-full font-semibold bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-300 border border-emerald-200/50 dark:border-emerald-800/40 text-xs">
                  Open Access
                </span>
              )}
            </span>
          </span>

          {/* Paper Title */}
          <span className="block text-xs font-semibold text-neutral-900 dark:text-neutral-100 line-clamp-2 leading-snug mb-1">
            {citation.title}
          </span>

          {/* Authors */}
          {authorStr && (
            <span className="block text-[10.5px] text-neutral-600 dark:text-neutral-400 truncate mb-1.5">
              {authorStr}
            </span>
          )}

          {/* The passage behind the claim this citation is attached to */}
          {supporting && (
            <span data-testid="citation-supporting-passage" className="block mb-2.5">
              <span className="block text-[9.5px] font-semibold uppercase tracking-wider text-emerald-700 dark:text-emerald-400 mb-0.5">
                {/* Word overlap finds the closest sentence, not agreement: the label says only that. */}
                Closest passage in the source
              </span>
              <span className="block text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed italic bg-emerald-50/70 dark:bg-emerald-950/20 p-1.5 rounded-lg border border-emerald-100 dark:border-emerald-900/40">
                "{highlightMatched(supporting.passage, supporting.matched)}"
              </span>
            </span>
          )}
          {!supporting && (snippet || traced) && (
            <span className="block mb-2.5">
              {noMatch && (
                <span data-testid="citation-no-passage" className="block text-[9.5px] text-amber-700 dark:text-amber-400 mb-0.5">
                  {traced
                    ? `No sentence in this source's text clearly matches this claim.${snippet ? " Excerpt:" : ""}`
                    : "No sentence in the retrieved text clearly matches this claim. Excerpt:"}
                </span>
              )}
              {snippet && (
                <span className="block text-xs text-neutral-600 dark:text-neutral-400 line-clamp-2 leading-relaxed italic bg-neutral-50 dark:bg-neutral-800/60 p-1.5 rounded-lg border border-neutral-100 dark:border-white/5">
                  "{snippet}"
                </span>
              )}
            </span>
          )}

          {/* Micro-Card Action Buttons Row */}
          <span className="flex items-center justify-between pt-2 border-t border-neutral-100 dark:border-white/10 gap-1.5 text-xs">
            <span className="flex items-center gap-1">
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

    </>
  ) : null;

  // No side margin: the text already carries the space before a citation, and punctuation follows it directly.
  return (
    <span className="relative group/cite inline align-baseline">
      <a
        href={targetUrl || `#ref-entry-${num}`}
        target={targetUrl ? "_blank" : undefined}
        rel={targetUrl ? "noopener noreferrer" : undefined}
        data-testid={`citation-chip-${num}`}
        onClick={(e) => {
          if (isPhone && citation) {
            e.preventDefault();
            e.stopPropagation();
            setSheetOpen(true);
            return;
          }
          const refMounted =
            typeof document !== "undefined" &&
            Boolean(
              (messageId && document.getElementById(`ref-entry-${messageId}-${num}`)) ||
              document.getElementById(`ref-entry-${num}`) ||
              document.querySelector(`[data-ref-num="${num}"]`)
            );
          if (refMounted) {
            e.preventDefault();
          }
          e.stopPropagation();
          scrollToReferenceEntry(num, messageId);
        }}
        className="cursor-pointer font-medium text-[0.92em] text-blue-700 no-underline decoration-blue-300 underline-offset-2 transition-colors hover:underline dark:text-blue-300"
        title={
          citation?.title
            ? `Source ${displayLabel}: ${citation.title}`
            : `Source ${displayLabel}`
        }
      >
        {displayLabel}
      </a>

      {/* Citation Preview Card on Hover (Section 10) */}
      {citation && !isPhone && (
        <span
          data-testid="citation-micro-card"
          className="pointer-events-none opacity-0 group-hover/cite:opacity-100 group-hover/cite:pointer-events-auto transition-all duration-200 ease-out absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-80 p-3.5 rounded-2xl bg-white/95 dark:bg-neutral-900/95 backdrop-blur-md border border-neutral-200 dark:border-white/15 shadow-2xl text-left z-50 transform group-hover/cite:translate-y-0 translate-y-1 block select-text font-sans"
        >
          {cardBody}
        </span>
      )}
      {citation && isPhone && sheetOpen && typeof document !== "undefined" &&
        createPortal(
          <div className="fixed inset-0 z-[80]" onClick={() => setSheetOpen(false)}>
            <div className="absolute inset-0 bg-neutral-900/30" aria-hidden="true" />
            <div
              role="dialog"
              aria-label={`Source ${displayLabel}`}
              data-testid="citation-sheet"
              onClick={(e) => e.stopPropagation()}
              className={`${PHONE_SHEET_CLASSES} block rounded-2xl border border-neutral-200 bg-white p-4 text-left font-sans dark:border-white/15 dark:bg-neutral-900`}
            >
              <span className="mb-2 flex items-center justify-between">
                <span className="text-xs font-semibold text-neutral-500 dark:text-neutral-400">Source {displayLabel}</span>
                <button
                  type="button"
                  onClick={() => setSheetOpen(false)}
                  className="min-h-9 cursor-pointer rounded-full px-3 text-xs font-medium text-neutral-600 hover:bg-neutral-100 dark:text-neutral-300 dark:hover:bg-white/10"
                >
                  Close
                </button>
              </span>
              {cardBody}
            </div>
          </div>,
          document.body
        )}
    </span>
  );
}

/**
 * Sanitizes trailing half-streamed Markdown tokens so raw `#`, `**`, or `|` never flash during streaming.
 */
export function sanitizeStreamingMarkdown(rawText: string): string {
  if (!rawText) return "";
  let cleaned = stripRawReferencesSection(normalizeCitationMarkers(rawText));
  // Balance unclosed bold `**` at the very end of a streaming chunk
  const boldCount = (cleaned.match(/\*\*/g) || []).length;
  if (boldCount % 2 === 1) {
    cleaned = cleaned.replace(/\*\*([^*\n]*)$/, "$1");
  }
  // Remove a lone trailing `#` heading prefix with no text yet
  cleaned = cleaned.replace(/\n#{1,6}\s*$/, "");
  return cleaned;
}

/**
 * Extracts the primary author surname from a citation item for matching in-text author-date citations.
 */
function extractPrimarySurname(cit: WebsiteCitationItem): string {
  const cslFirst = cit.csl?.author?.[0];
  if (cslFirst?.family) return cslFirst.family.trim();
  if (cslFirst?.literal) return cslFirst.literal.trim();

  const raw = (cit.authors && cit.authors[0]) || cit.author || "";
  const trimmed = raw.trim();
  if (!trimmed) return "";
  if (trimmed.includes(",")) {
    return trimmed.split(",")[0].trim();
  }
  const parts = trimmed.split(/\s+/);
  return parts[parts.length - 1].trim();
}

/**
 * Dynamically normalizes inline author-date, MLA author-page, or Vancouver parenthetical citations
 * back to canonical `[n]` markers so switching citation styles re-formats existing responses in-place (Fix 6.2).
 */
export function normalizeAuthorDateCitationsInProse(
  text: string,
  citations?: WebsiteAssistantMessage["citations"]
): string {
  if (!text || !citations || citations.length === 0) return text;

  const sourceMatchers = citations.map((cit, idx) => ({
    num: idx + 1,
    surname: extractPrimarySurname(cit),
    year: cit.year ? String(cit.year).match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1] || "" : "",
  }));

  // Replace parenthetical author-date / MLA / grouped citations: e.g. (Vaswani et al., 2017) or (Smith & Lee, 2023; Zhang, 2022)
  return text.replace(/\(([^()\n]{2,140})\)/g, (fullMatch, inner: string) => {
    const trimmedInner = inner.trim();

    // Check Vancouver numeric parenthetical: e.g. "(1)" or "(1, 2)"
    if (/^\d+(?:\s*,\s*\d+)*$/.test(trimmedInner)) {
      const nums = trimmedInner
        .split(",")
        .map((n) => parseInt(n.trim(), 10))
        .filter((n) => !isNaN(n) && n >= 1 && n <= citations.length);
      if (nums.length > 0) {
        return `[${nums.join(", ")}]`;
      }
    }

    const segments = trimmedInner.split(";").map((s) => s.trim()).filter(Boolean);
    if (segments.length === 0) return fullMatch;

    const matchedNums: number[] = [];
    for (const seg of segments) {
      const segYear = seg.match(/\b(1[89]\d{2}|20\d{2})\b/)?.[1];
      const found = sourceMatchers.find((m) => {
        if (!m.surname || m.surname.length < 2) return false;
        const escapedSurname = m.surname.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
        const hasSurname = new RegExp(`^${escapedSurname}\\b`, "i").test(seg);
        if (!hasSurname) return false;
        if (segYear && m.year) {
          return segYear === m.year;
        }
        // MLA 9 author-only or author-page pattern: e.g. "Vaswani et al." or "Smith and Lee 42"
        return new RegExp(
          `^${escapedSurname}(?:\\s+(?:&|and)\\s+[A-Z][a-zA-Z'\\-]+|\\s+et\\s+al\\.?)?(?:[,\\s]+(?:pp?\\.?\\s*)?\\d+(?:[-–]\\d+)?)?$`,
          "i"
        ).test(seg);
      });
      if (!found) {
        return fullMatch;
      }
      if (!matchedNums.includes(found.num)) {
        matchedNums.push(found.num);
      }
    }

    return matchedNums.length > 0 ? `[${matchedNums.join(", ")}]` : fullMatch;
  });
}

export function renderFormattedGuideText(
  text: string,
  citations?: WebsiteAssistantMessage["citations"],
  citationStyle: string = "apa",
  onFocusInGraph?: (citation: WebsiteCitationItem) => void,
  messageId?: string
) {
  if (!text) return null;

  const sanitizedText = normalizeAuthorDateCitationsInProse(
    sanitizeStreamingMarkdown(text),
    citations
  );

  const inlineRegex =
    /\\\(([\s\S]+?)\\\)|\$([^$\n]+?)\$|\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)|\[(\d+(?:\s*,\s*\d+)*)\]|`([^`]+)`|\*\*\*([^*]+)\*\*\*|___([^_]+)___|\*\*([^*]+)\*\*|__([^_]+)__|\*([^*\n]+?)\*|\b_([^_]+)_\b|~~([^~]+)~~/g;

  const parseInline = (str: string): React.ReactNode[] => {
    // Strip any stray leftover `**` or `## ` prefixes that didn't close
    const cleanStr = str.replace(/^#{1,6}\s+/, "");
    const nodes: React.ReactNode[] = [];
    let lastIdx = 0;
    let match: RegExpExecArray | null;
    inlineRegex.lastIndex = 0;

    while ((match = inlineRegex.exec(cleanStr)) !== null) {
      if (match.index > lastIdx) {
        nodes.push(cleanStr.slice(lastIdx, match.index).replace(/\*\*/g, ""));
      }

      if (match[1] !== undefined || match[2] !== undefined) {
        // Inline LaTeX math: \(...\) or $...$
        const latexExpr = match[1] ?? match[2];
        nodes.push(<LatexMathBlock key={`math-${match.index}`} latex={latexExpr} displayMode={false} />);
      } else if (match[3] !== undefined) {
        // Link: [title](url)
        const linkTitle = match[3];
        const linkUrl = match[4];
        const isNumeric = /^\d+$/.test(linkTitle.trim());

        if (isNumeric) {
          const num = parseInt(linkTitle.trim(), 10);
          const matchedCite =
            citations && num > 0 && num <= citations.length ? citations[num - 1] : undefined;
          const formattedLabel = matchedCite
            ? formatAskScholarInText(matchedCite, num - 1, citationStyle, citations) || `[${linkTitle}]`
            : `[${linkTitle}]`;

          nodes.push(
            <InlineCitationBadge
              key={`cite-num-${match.index}`}
              num={linkTitle}
              label={formattedLabel}
              url={linkUrl}
              citation={matchedCite}
              messageId={messageId}
              onFocusInGraph={onFocusInGraph}
              claim={claimBefore(cleanStr, match.index)}
            />
          );
        } else {
          nodes.push(
            <a
              key={`l-${match.index}`}
              href={linkUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-blue-600 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300 underline font-medium inline-flex items-center gap-0.5 mx-0.5 transition-colors"
              onClick={(e) => e.stopPropagation()}
            >
              <span>{linkTitle}</span>
              <span className="text-xs">↗</span>
            </a>
          );
        }
      } else if (match[5] !== undefined) {
        // Numeric Bracket Citation: [1], [2], [1, 2]
        const citeNums = match[5];
        const mIdx = match.index;
        const nums = citeNums.split(",").map((n) => n.trim());

        nodes.push(
          <Fragment key={`cite-group-${mIdx}`}>
            {nums.map((numStr, nIdx) => {
              const num = parseInt(numStr, 10);
              const matchedCite =
                citations && num > 0 && num <= citations.length ? citations[num - 1] : undefined;
              const formattedLabel = matchedCite
                ? formatAskScholarInText(matchedCite, num - 1, citationStyle, citations) || `[${numStr}]`
                : `[${numStr}]`;
              return (
                <InlineCitationBadge
                  key={`cite-${mIdx}-${nIdx}`}
                  num={numStr}
                  label={formattedLabel}
                  url={matchedCite?.url}
                  citation={matchedCite}
                  messageId={messageId}
                      onFocusInGraph={onFocusInGraph}
                  claim={claimBefore(cleanStr, mIdx)}
                />
              );
            })}
          </Fragment>
        );
      } else if (match[6] !== undefined) {
        // Inline code: `code`
        nodes.push(
          <code
            key={`c-${match.index}`}
            className="px-1.5 py-0.5 rounded text-xs font-mono bg-neutral-200/80 dark:bg-white/10 text-neutral-800 dark:text-neutral-200 font-medium"
          >
            {match[6]}
          </code>
        );
      } else if (match[7] !== undefined || match[8] !== undefined) {
        // Bold-italic: ***text*** or ___text___
        nodes.push(
          <strong key={`bi-${match.index}`} className="font-semibold text-neutral-900 dark:text-white">
            <em className="italic">{match[7] || match[8]}</em>
          </strong>
        );
      } else if (match[9] !== undefined || match[10] !== undefined) {
        // Bold: **text** or __text__
        nodes.push(
          <strong key={`b-${match.index}`} className="font-semibold text-neutral-900 dark:text-white">
            {match[9] || match[10]}
          </strong>
        );
      } else if (match[11] !== undefined || match[12] !== undefined) {
        // Italic: *text* or _text_
        nodes.push(
          <em key={`i-${match.index}`} className="italic text-neutral-800 dark:text-neutral-200">
            {match[11] || match[12]}
          </em>
        );
      } else if (match[13] !== undefined) {
        // Strikethrough: ~~text~~
        nodes.push(
          <del key={`d-${match.index}`} className="line-through opacity-70">
            {match[13]}
          </del>
        );
      }

      lastIdx = inlineRegex.lastIndex;
    }

    if (lastIdx < cleanStr.length) {
      nodes.push(cleanStr.slice(lastIdx).replace(/\*\*/g, ""));
    }

    return nodes;
  };

  // Block parser
  const lines = sanitizedText.split("\n");
  type Block =
    | { type: "empty" }
    | { type: "hr" }
    | { type: "heading"; level: number; content: string; id: string }
    | { type: "bullet"; content: string }
    | { type: "ordered"; num: string; content: string }
    | { type: "blockquote"; content: string }
    | { type: "code_block"; lang: string; code: string }
    | { type: "math_block"; latex: string }
    | { type: "table"; header: string[]; rows: string[][] }
    | { type: "paragraph"; content: string }
    | { type: "callout"; title: string; blocks: Block[] };

  const blocks: Block[] = [];
  let inCodeBlock = false;
  let codeBlockLang = "";
  let codeBlockLines: string[] = [];
  let inMathBlock = false;
  let mathBlockLines: string[] = [];
  let headingCounter = 0;

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

    // Display math block: $$...$$ or \[...\]
    if (trimmed.startsWith("$$") || trimmed.startsWith("\\[")) {
      const isSingleLineDollar = trimmed.startsWith("$$") && trimmed.endsWith("$$") && trimmed.length > 4;
      const isSingleLineBracket = trimmed.startsWith("\\[") && trimmed.endsWith("\\]") && trimmed.length > 4;
      if (isSingleLineDollar || isSingleLineBracket) {
        blocks.push({ type: "math_block", latex: trimmed.slice(2, -2).trim() });
        continue;
      }
      if (inMathBlock) {
        blocks.push({ type: "math_block", latex: mathBlockLines.join("\n") });
        inMathBlock = false;
        mathBlockLines = [];
      } else {
        inMathBlock = true;
        mathBlockLines = [];
      }
      continue;
    }

    if (inMathBlock) {
      if (trimmed.endsWith("$$") || trimmed.endsWith("\\]")) {
        const lastPart = trimmed.slice(0, -2).trim();
        if (lastPart) mathBlockLines.push(lastPart);
        blocks.push({ type: "math_block", latex: mathBlockLines.join("\n") });
        inMathBlock = false;
        mathBlockLines = [];
      } else {
        mathBlockLines.push(rawLine);
      }
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

    const headingMatch = trimmed.match(/^(#{1,6})\s+(.*)$/);
    if (headingMatch) {
      const hashes = headingMatch[1];
      const headingContent = headingMatch[2].replace(/\*\*/g, "").trim();
      headingCounter++;
      blocks.push({
        type: "heading",
        level: hashes.length,
        content: headingContent,
        id: `heading-${messageId || "msg"}-${headingCounter}`,
      });
      continue;
    }

    if (trimmed.startsWith(">")) {
      blocks.push({ type: "blockquote", content: trimmed.replace(/^>\s*/, "") });
      continue;
    }

    if (
      trimmed.startsWith("• ") ||
      trimmed.startsWith("- ") ||
      (trimmed.startsWith("* ") && !trimmed.startsWith("***"))
    ) {
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

  // A report's "In short:" (a bold line, a heading, or a bold lead-in on the paragraph itself) and what follows it,
  // up to the next heading or rule, become one callout: the answer, set apart at the top of the report.
  const IN_SHORT = /^(?:\*\*|__)?\s*in short\s*:?\s*(?:\*\*|__)?\s*:?\s*/i;
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    const marker =
      (b.type === "paragraph" && IN_SHORT.test(b.content)) || (b.type === "heading" && /^in short\s*:?$/i.test(b.content.trim()));
    if (!marker) continue;
    const inner: Block[] = [];
    const rest = b.type === "paragraph" ? b.content.replace(IN_SHORT, "").trim() : "";
    if (rest) inner.push({ type: "paragraph", content: rest });
    let j = i + 1;
    for (; j < blocks.length; j++) {
      const next = blocks[j];
      if (next.type === "heading" || next.type === "hr") break;
      if (next.type === "empty" && inner.length > 0 && blocks[j + 1]?.type === "empty") break;
      if (next.type !== "empty") inner.push(next);
    }
    if (inner.length === 0) continue;
    blocks.splice(i, j - i, { type: "callout", title: "In short", blocks: inner });
    break;
  }

  const headingBlocks = blocks.filter(
    (b): b is Extract<Block, { type: "heading" }> => b.type === "heading"
  );

  return (
    <div className="max-w-[72ch] space-y-3 text-[16px] leading-[1.65] text-inherit sm:text-[15px] sm:leading-[1.7]">
      {/* Automatic Table of Contents for answers with 3 or more headings (Section 10) */}
      {headingBlocks.length >= 3 && (
        <nav aria-label="Table of contents" data-testid="response-toc" className="mb-3">
          <details className="group">
            <summary className="flex cursor-pointer list-none items-center gap-1 text-xs font-medium text-neutral-500 transition-colors hover:text-neutral-900 dark:text-neutral-400 dark:hover:text-white [&::-webkit-details-marker]:hidden">
              <ChevronRightIcon className="h-3 w-3 transition-transform group-open:rotate-90" aria-hidden="true" />
              <span>Contents</span>
            </summary>
            <ol className="mt-1.5 space-y-1 border-l border-neutral-200 pl-3 text-[13px] dark:border-white/10">
              {headingBlocks.map((h, hIdx) => (
                <li key={h.id} className={h.level >= 3 ? "pl-3" : ""}>
                  <a
                    href={`#${h.id}`}
                    onClick={(e) => {
                      e.preventDefault();
                      const target = document.getElementById(h.id);
                      if (target && typeof target.scrollIntoView === "function") {
                        target.scrollIntoView({ behavior: "smooth", block: "start" });
                      }
                    }}
                    className="inline-flex min-h-8 items-center gap-1.5 text-neutral-700 transition-colors hover:text-neutral-950 dark:text-neutral-300 dark:hover:text-white"
                  >
                    <span className="text-xs tabular-nums text-neutral-400">{hIdx + 1}</span>
                    <span>{h.content}</span>
                  </a>
                </li>
              ))}
            </ol>
          </details>
        </nav>
      )}

      {blocks.map(function renderBlock(block: Block, idx: number): React.ReactNode {
        if (block.type === "callout") {
          return (
            <section
              key={idx}
              aria-label={block.title}
              data-testid="report-in-short"
              className="my-1 rounded-2xl border border-[color:var(--research-border)] bg-[color:var(--research-subtle)] px-4 py-3.5 text-[color:var(--text-primary)]"
            >
              <div className="mb-1.5 text-xs font-semibold text-[color:var(--research)]">{block.title}</div>
              <div className="space-y-2">{block.blocks.map((inner, i) => renderBlock(inner, i))}</div>
            </section>
          );
        }

        if (block.type === "empty") {
          return <div key={idx} className="h-1.5" />;
        }

        if (block.type === "hr") {
          return <hr key={idx} className="my-4 border-[color:var(--border-subtle)]" />;
        }

        if (block.type === "math_block") {
          return <LatexMathBlock key={idx} latex={block.latex} displayMode={true} />;
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

          // Disagreement and uncertainty sections keep a small marker; the heading itself stays a heading.
          if (isConflict || isLimitation) {
            const Icon = isConflict ? Scale : Info;
            return (
              <h4
                key={idx}
                id={block.id}
                className="flex items-center gap-2 pt-4 text-[18px] font-semibold tracking-tight text-[color:var(--text-primary)] sm:text-[17px]"
              >
                <Icon className={`h-4 w-4 shrink-0 ${isConflict ? "text-[color:var(--state-warning)]" : "text-[color:var(--text-muted)]"}`} aria-hidden="true" />
                <span>{parseInline(block.content)}</span>
              </h4>
            );
          }

          if (block.level === 1) {
            return (
              <h3
                key={idx}
                id={block.id}
                className="pt-1 text-[22px] font-semibold leading-tight tracking-tight text-[color:var(--text-primary)] sm:text-[24px]"
              >
                {parseInline(block.content)}
              </h3>
            );
          }

          if (block.level === 2) {
            return (
              <h4
                key={idx}
                id={block.id}
                className="pt-4 text-[18px] font-semibold tracking-tight text-[color:var(--text-primary)] sm:text-[17px]"
              >
                {parseInline(block.content)}
              </h4>
            );
          }
          if (block.level === 3) {
            return (
              <h5
                key={idx}
                id={block.id}
                className="font-semibold text-[16px] sm:text-[15px] text-neutral-900 dark:text-neutral-100 pt-2 tracking-tight"
              >
                {parseInline(block.content)}
              </h5>
            );
          }
          return (
            <h6
              key={idx}
              id={block.id}
              className="font-semibold text-xs text-neutral-800 dark:text-neutral-300 uppercase tracking-wider pt-1.5 pb-0.5"
            >
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
              <span className="text-neutral-500 dark:text-neutral-400 font-medium shrink-0 text-xs leading-relaxed min-w-[16px]">
                {block.num}.
              </span>
              <div className="flex-1 min-w-0 leading-relaxed">{parseInline(block.content)}</div>
            </div>
          );
        }

        if (block.type === "blockquote") {
          return (
            <blockquote
              key={idx}
              className="border-l-2 border-neutral-300 dark:border-neutral-600 pl-3 py-1 my-1.5 italic text-neutral-700 dark:text-neutral-300 text-xs sm:text-[13px]"
            >
              {parseInline(block.content)}
            </blockquote>
          );
        }

        if (block.type === "code_block") {
          return <CodeBlockWithCopy key={idx} lang={block.lang} code={block.code} />;
        }

        if (block.type === "table") {
          // Cells keep a readable width: on a phone the table scrolls sideways instead of squeezing every column.
          return (
            <div key={idx} className="scholar-scrollbar my-3 overflow-x-auto rounded-xl border border-[color:var(--border-subtle)]">
              <table className="min-w-full border-collapse text-left text-[14px] leading-snug text-[color:var(--text-primary)]">
                <thead className="bg-[color:var(--surface-inset)]">
                  <tr>
                    {block.header.map((h, i) => (
                      <th key={i} scope="col" className="min-w-[8.5rem] px-3 py-2 align-bottom text-xs font-semibold text-[color:var(--text-secondary)]">
                        {parseInline(h)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[color:var(--border-subtle)]">
                  {block.rows.map((row, rIdx) => (
                    <tr key={rIdx}>
                      {row.map((cell, cIdx) => (
                        <td key={cIdx} className={`max-w-[22rem] px-3 py-2.5 align-top ${cIdx === 0 ? "font-medium" : "text-[color:var(--text-secondary)]"}`}>
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
            className={
              isHeaderLike
                ? "font-medium text-neutral-900 dark:text-neutral-100 pt-0.5 leading-[1.68]"
                : "leading-[1.68] text-inherit"
            }
          >
            {parseInline(block.content)}
          </p>
        );
      })}
    </div>
  );
}
