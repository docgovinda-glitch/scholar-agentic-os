/**
 * Bridge between the Atlas output-type catalog (src/app/atlas) and the React
 * workspace.
 *
 * Atlas has always held the real answer to "what does this deliverable
 * require?" — 24 output types, each with a section structure, word budget,
 * citation styles, source expectations, and a tiered intake schema whose
 * fields each carry what-it-is / why-it-matters / example / default guidance.
 * No UI file imported it. The workspace instead offered seven hardcoded
 * formats from src/config/outputFormats.ts, which is why the intake screen
 * only ever adapted for a journal article.
 *
 * This module is deliberately thin: it exposes Atlas to components and maps
 * an Atlas type onto the legacy `OutputFormat` union. The legacy field still
 * drives the export templates, compliance branching and phase pipeline, so
 * replacing it outright would be a wide, risky change for no user-visible
 * gain. Setting both lets the richer catalog surface immediately while the
 * existing pipeline keeps working unchanged.
 */

import { catalog } from "../app/atlas/atlas";
import type { OutputTypeSpec } from "../app/atlas/types";
// AcademicLevel/OutputFamily are owned by the domain layer; atlas/types.ts
// only re-imports them, so take them from the source of truth.
import type { AcademicLevel, OutputFamily } from "../domain/project/types";
import type { OutputFormat } from "../types";

export type { OutputTypeSpec, AcademicLevel, OutputFamily };

/** Display order and labels for the catalog's families. */
export const FAMILY_LABELS: Record<OutputFamily, string> = {
  short_form: "Coursework & Short Form",
  long_form: "Theses & Long Form",
  publication: "Publication",
  proposal_funding: "Proposals & Funding",
  applied_professional: "Applied & Professional",
  presentation: "Presentation",
};

export const FAMILY_ORDER: OutputFamily[] = [
  "short_form",
  "long_form",
  "publication",
  "proposal_funding",
  "applied_professional",
  "presentation",
];

export const ACADEMIC_LEVEL_LABELS: Record<AcademicLevel, string> = {
  undergraduate: "Undergraduate",
  masters: "Master's",
  doctoral: "Doctoral",
  postdoc: "Postdoctoral",
  faculty: "Faculty",
  professional: "Professional",
};

export function listOutputTypes(): OutputTypeSpec[] {
  return catalog.list();
}

export function getOutputType(id: string): OutputTypeSpec | undefined {
  return catalog.get(id);
}

/**
 * Free-text lookup across labels and aliases, so a user who types
 * "Hausarbeit", "lit review" or "capstone" lands on the right type without
 * knowing the catalog's own naming.
 */
export function searchOutputTypes(query: string): OutputTypeSpec[] {
  const q = query.trim();
  return q ? catalog.search(q) : catalog.list();
}

export function filterByLevel(types: OutputTypeSpec[], level: AcademicLevel | "all"): OutputTypeSpec[] {
  return level === "all" ? types : types.filter((t) => t.academicLevels.includes(level));
}

export function groupByFamily(types: OutputTypeSpec[]): { family: OutputFamily; types: OutputTypeSpec[] }[] {
  return FAMILY_ORDER.map((family) => ({
    family,
    types: types.filter((t) => t.family === family),
  })).filter((g) => g.types.length > 0);
}

/**
 * Nearest legacy OutputFormat for an Atlas type.
 *
 * The legacy union predates the catalog and is coarser, so this is genuinely
 * lossy — several Atlas types collapse onto one legacy value. That is
 * acceptable precisely because the legacy field now only selects an export
 * template and a compliance branch; the Atlas id is what carries the real
 * structure, budget and intake schema from here on.
 */
export function toLegacyOutputFormat(spec: OutputTypeSpec): OutputFormat {
  const byId: Record<string, OutputFormat> = {
    "OT-03": "report",
    "OT-09": "book-chapter",
    "OT-10": "journal-article",
    "OT-12": "journal-article",
    "OT-14": "book-chapter",
    "OT-15": "research-proposal",
    "OT-16": "research-proposal",
    "OT-20": "report",
    "OT-21": "report",
  };
  if (byId[spec.id]) return byId[spec.id];

  switch (spec.family) {
    case "publication":
      return "journal-article";
    case "proposal_funding":
      return "research-proposal";
    case "applied_professional":
      return "report";
    case "long_form":
      return "research-paper";
    case "short_form":
      return "term-paper";
    default:
      return "research-paper";
  }
}

/**
 * Human-readable names for the catalog's citation-style identifiers. The raw
 * ids ("apa7", "chicago-author-date") are storage keys, not something to show
 * a student who is being asked to choose between them.
 */
const CITATION_STYLE_LABELS: Record<string, string> = {
  apa7: "APA 7th",
  harvard: "Harvard",
  mla9: "MLA 9th",
  ieee: "IEEE",
  vancouver: "Vancouver",
  "chicago-author-date": "Chicago (author–date)",
  "chicago-notes-bibliography": "Chicago (notes & bibliography)",
};

export function citationStyleLabel(id: string): string {
  return CITATION_STYLE_LABELS[id] ?? id;
}

/** Total word range as a display string, e.g. "3,000–5,000 words". */
export function formatWordBudget(spec: OutputTypeSpec): string {
  const { min, max } = spec.budget.totalWords;
  if (!min && !max) return "No fixed target";
  const n = (v: number) => v.toLocaleString();
  if (min && max) return `${n(min)}–${n(max)} words`;
  return min ? `From ${n(min)} words` : `Up to ${n(max)} words`;
}
