/**
 * Thesis references: records added from DOIs (with their retraction status),
 * cited in chapter text as [CITE:id] tags, and rendered in the student's
 * chosen style with one reference list for the whole thesis. Uses the same
 * formatter as the journal workspace. Pure; no I/O.
 */
import { renderManuscript, citedIds, type StyleKey } from "../../domain/journal/citationStyles";
import { parseReferenceRecords, type ReferenceRecord } from "../../domain/journal/references";
import type { ThesisChapter } from "./thesisModel";

export const THESIS_STYLES: Array<{ id: StyleKey; label: string }> = [
  { id: "apa", label: "APA 7" },
  { id: "harvard", label: "Harvard" },
  { id: "chicago", label: "Chicago author-date" },
  { id: "mla", label: "MLA 9" },
  { id: "ieee", label: "IEEE" },
  { id: "vancouver", label: "Vancouver" },
];

export function parseThesisStyle(raw: unknown): StyleKey {
  return THESIS_STYLES.some((s) => s.id === raw) ? (raw as StyleKey) : "apa";
}

/** Saved records, validated; anything malformed is dropped. */
export const parseThesisReferences = (raw: unknown): Record<string, ReferenceRecord> => parseReferenceRecords(raw);

export const citeTag = (id: string) => `[CITE:${id}]`;

export interface RenderedThesis {
  /** Chapters with [CITE:id] tags turned into in-text citations. */
  chapters: ThesisChapter[];
  heading: "References" | "Works Cited";
  /** Formatted entries, numbered for IEEE / Vancouver. */
  references: string[];
  /** Tags whose source is not in the list; left in the text as written. */
  missing: string[];
}

// A heading line no student writes: chapters split apart again after
// rendering, and nothing in one chapter can reach into the next.
const BREAK = "\n\n## \u0000CHAPTER\u0000\n\n";
// The journal renderer replaces a "References" section with its own list. In a
// thesis that text is the student's, so such headings are shielded and restored.
const REF_HEADING = /^(#{1,3} +)(References|Bibliography|Works Cited|Reference List)\b/gim;
const SHIELD = "\u0001";

/**
 * Renders citations across the whole thesis so numbering (IEEE, Vancouver)
 * and 2021a/2021b suffixes are consistent between chapters. Only cited
 * sources are listed, as the styles require.
 */
export function renderThesis(chapters: ThesisChapter[], records: Record<string, ReferenceRecord>, style: StyleKey): RenderedThesis {
  const heading = style === "mla" ? "Works Cited" : "References";
  const joined = chapters.map((c) => (c.content ?? "").replace(REF_HEADING, `$1${SHIELD}$2`)).join(BREAK);
  if (citedIds(joined).length === 0) return { chapters, heading, references: [], missing: [] };
  const out = renderManuscript(joined, records, style);
  // renderManuscript appends "## References" + list; keep only the text.
  const text = out.markdown.slice(0, out.markdown.lastIndexOf(`\n\n## ${heading}\n\n`));
  // The renderer trims trailing whitespace, so the last break may lose its newlines.
  const parts = text.split(/\n\n## \u0000CHAPTER\u0000(?:\n\n|\s*$)/).map((p) => p.split(SHIELD).join(""));
  const numbered = style === "ieee" ? out.references.map((e, i) => `[${i + 1}] ${e}`) : style === "vancouver" ? out.references.map((e, i) => `${i + 1}. ${e}`) : out.references;
  return {
    chapters: chapters.map((c, i) => (c.content === undefined ? c : { ...c, content: parts[i] ?? c.content })),
    heading,
    references: numbered,
    missing: out.missing,
  };
}

/** Records in the list that no chapter cites yet. */
export function uncitedRecords(chapters: ThesisChapter[], records: Record<string, ReferenceRecord>): ReferenceRecord[] {
  const cited = new Set(citedIds(chapters.map((c) => c.content ?? "").join("\n")));
  return Object.values(records).filter((r) => !cited.has(r.id));
}
