/**
 * The one renderer for drafted Coursework prose: in-text citations become
 * chips the student can click, and every block kind the editor can write
 * (headings, quotes, lists, tables, alignment) is read through the shared
 * `proseBlocks` parser, so the preview, the full draft and the exports agree.
 */
import React from "react";
import { inlineMarkdownRuns } from "../../../shared/inlineMarkdown";
import { parseProseBlocks } from "../../../shared/proseBlocks";

/**
 * Parses academic prose and highlights in-text citations:
 * Matches Harvard/APA7 style: (Author, 2024), (Author & Author, 2023), (Author et al., 2022)
 * Matches IEEE style: [1], [2], [1, 2]
 */
export function renderAcademicProseWithCitations(
  prose: string,
  onCitationClick?: (citationText: string, event: React.MouseEvent) => void
) {
  if (!prose) return null;

  const citationRegex =
    /(\([A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?(?:;\s*[A-Z][A-Za-z\s&.,'–-]+,\s*(?:19|20)\d{2}[a-z]?)*\)|\[\d+(?:,\s*\d+)*\])/g;

  // Inline text: citation chips plus real bold / italic / underline (never asterisks or tags).
  const inline = (text: string) =>
    text.split(citationRegex).map((part, i) => {
      if (!part) return null;
      if (citationRegex.test(part)) {
        citationRegex.lastIndex = 0; // reset regex state
        return (
          <span
            key={i}
            data-testid="citation-anchor"
            onClick={(e) => onCitationClick?.(part, e)}
            className="inline-flex items-center px-1.5 py-0.5 mx-0.5 rounded text-xs font-mono font-medium bg-blue-50 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300 border border-blue-200/80 dark:border-blue-700/40 transition-all hover:bg-blue-100 dark:hover:bg-blue-900/50 hover:border-blue-400 dark:hover:border-blue-500 cursor-pointer shadow-2xs select-none active:scale-[0.98]"
            title="Verified Grounded Citation — Click to view source metadata"
          >
            {part}
          </span>
        );
      }
      return (
        <span key={i}>
          {inlineMarkdownRuns(part).map((r, j) => {
            let node: React.ReactNode = r.text;
            if (r.underline) node = <u>{node}</u>;
            if (r.italics) node = <em>{node}</em>;
            if (r.bold) node = <strong>{node}</strong>;
            return <React.Fragment key={j}>{node}</React.Fragment>;
          })}
        </span>
      );
    });

  const textClass = "text-[14px] sm:text-[15px] leading-relaxed text-[color:var(--text-primary)]";

  // One element per block; a single long paragraph is regrouped every 3-4 sentences.
  return parseProseBlocks(prose).map((b, idx) => {
    if (b.kind === "heading") {
      return (
        <h4 key={idx} style={b.align ? { textAlign: b.align } : undefined} className="text-sm font-semibold tracking-tight text-[color:var(--text-primary)] mt-5 mb-2">
          {inline(b.text)}
        </h4>
      );
    }
    if (b.kind === "quote") {
      return (
        <blockquote key={idx} className={`${textClass} mb-4 border-l-2 border-[color:var(--border-default)] pl-4 italic`}>
          {b.text.split("\n").map((l, i) => (
            <p key={i}>{inline(l)}</p>
          ))}
        </blockquote>
      );
    }
    if (b.kind === "bullets" || b.kind === "numbered") {
      const List = b.kind === "bullets" ? "ul" : "ol";
      return (
        <List key={idx} className={`${textClass} mb-4 pl-6 ${b.kind === "bullets" ? "list-disc" : "list-decimal"} space-y-1`}>
          {b.items.map((it, i) => (
            <li key={i}>{inline(it)}</li>
          ))}
        </List>
      );
    }
    if (b.kind === "table") {
      return (
        <div key={idx} className="mb-4 overflow-x-auto">
          <table className={`${textClass} w-full border-collapse text-[13px]`}>
            <tbody>
              {b.rows.map((r, ri) => (
                <tr key={ri}>
                  {r.map((c, ci) => {
                    const Cell = b.header && ri === 0 ? "th" : "td";
                    return (
                      <Cell key={ci} className="border border-[color:var(--border-default)] px-2 py-1 text-left align-top">
                        {inline(c)}
                      </Cell>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
    }
    return (
      <p key={idx} style={b.align ? { textAlign: b.align } : undefined} className={`${textClass} mb-4 selection:bg-blue-100 dark:selection:bg-blue-900/40`}>
        {inline(b.text)}
      </p>
    );
  });
}
