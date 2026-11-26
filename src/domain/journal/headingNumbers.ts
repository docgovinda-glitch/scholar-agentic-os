/**
 * Section numbers the way journals print them, for the Word export.
 *   - decimal (Elsevier, Springer Nature, ACM and most others):
 *     "1. Introduction", "1.1. Participants", "1.1.1. Sampling";
 *   - ieee (IEEE Transactions): "I. Introduction", "A. Participants", "1) Sampling";
 *   - none (APA 7, Nature): headings carry no numbers.
 * Back matter (References, Declarations, Acknowledgements, Appendices) and the
 * figures-and-tables list are never numbered. Pure; no I/O.
 */
import { BACK_MATTER } from "./manuscriptModel";
import { headingDepthOf } from "./manuscriptText";

export type HeadingNumbering = "decimal" | "ieee" | "none";

/** The numbering a Word template calls for; decimal when no template is named. */
export function numberingFor(template: string | undefined): HeadingNumbering {
  if (template === "ieee") return "ieee";
  if (template === "apa7" || template === "nature") return "none";
  return "decimal";
}

/**
 * The numbering a journal family uses, from its citation style: IEEE journals
 * number with Roman numerals and letters; Harvard-style journals (Elsevier,
 * Springer, Wiley) number decimally; APA, Vancouver (medical IMRaD), Chicago
 * and MLA journals print unnumbered headings.
 */
export function numberingForStyle(style: "apa" | "harvard" | "chicago" | "mla" | "ieee" | "vancouver"): HeadingNumbering {
  return style === "ieee" ? "ieee" : style === "harvard" ? "decimal" : "none";
}

/** Headings that are not numbered in any style: the abstract, closing matter and the figures-and-tables list. */
export const isUnnumberedHeading = (title: string): boolean => BACK_MATTER.test(title.trim()) || /^(?:abstract|figures and tables)$/i.test(title.trim());

const ROMAN: Array<[number, string]> = [[1000, "M"], [900, "CM"], [500, "D"], [400, "CD"], [100, "C"], [90, "XC"], [50, "L"], [40, "XL"], [10, "X"], [9, "IX"], [5, "V"], [4, "IV"], [1, "I"]];
const roman = (n: number) => ROMAN.reduce((out, [v, s]) => { while (n >= v) { out += s; n -= v; } return out; }, "");
const letter = (n: number) => (n <= 26 ? String.fromCharCode(64 + n) : String(n));

/**
 * Hands out numbers in reading order. `next(depth, title)` is the heading's
 * prefix ("2.1. ", "B. ", or "") for a heading at that depth (0 = section);
 * a deeper heading restarts when its parent changes.
 */
export function createHeadingNumberer(style: HeadingNumbering): (depth: number, title: string) => string {
  const counters: number[] = [];
  return (depth, title) => {
    if (style === "none" || isUnnumberedHeading(title)) return "";
    // Never deeper than one below the headings already numbered.
    const d = Math.max(0, Math.min(depth, counters.length));
    counters.length = d + 1;
    counters[d] = (counters[d] ?? 0) + 1;
    if (style === "ieee") return d === 0 ? `${roman(counters[0])}. ` : d === 1 ? `${letter(counters[1])}. ` : `${counters[d]}) `;
    return `${counters.join(".")}. `;
  };
}

const HEADING_LINE = /^(#{1,6})\s+(?:§\s*)?(.+)$/;
/** A heading the author already numbered by hand ("2. Methods", "2.1 Participants"). */
const HAND_NUMBERED = /^\d+(?:\.\d+)*\.?\s/;

/**
 * The manuscript with its headings numbered for the journal's style, for the
 * formats that carry the numbers as text (Word, PDF, Markdown). The Studio's
 * internal "§" sub-section marker is always removed. Left as written when the
 * author numbered any heading themselves; a title-level "#" is not numbered
 * when the manuscript has deeper headings. Pure; no I/O.
 */
export function numberHeadings(markdown: string, style: HeadingNumbering): string {
  const parts = markdown.split(/(\n{2,})/);
  const isHeading = (block: string) => !block.trim().includes("\n") && HEADING_LINE.test(block.trim());
  const headings = parts.filter(isHeading).map((b) => b.trim().match(HEADING_LINE)!);
  const stripped = parts.map((b) => (isHeading(b) ? b.trim().replace(HEADING_LINE, (_m, h: string, t: string) => `${h} ${t}`) : b));
  if (style === "none" || headings.some((h) => HAND_NUMBERED.test(h[2]))) return stripped.join("");
  const depthOf = headingDepthOf(markdown);
  const hasDeeper = headings.some((h) => h[1].length >= 2);
  const next = createHeadingNumberer(style);
  return parts
    .map((b, i) => {
      if (!isHeading(b)) return b;
      const [, hashes, title] = b.trim().match(HEADING_LINE)!;
      if (hashes.length === 1 && hasDeeper) return stripped[i];
      return `${hashes} ${next(depthOf(hashes.length), title)}${title}`;
    })
    .join("");
}
