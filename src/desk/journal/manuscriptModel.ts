/**
 * Journal manuscript, section by section: the writing units (from the word
 * budget blueprint, or a plain IMRaD outline when there is none), the author's
 * text per unit, the order authors usually write in, and the assembled
 * manuscript the rest of the workspace (Review, Delivery) reads.
 * No React, no I/O.
 */
import type { WordBudgetBlueprint } from "../workspace/types";

export type SectionKind =
  | "abstract"
  | "introduction"
  | "literature"
  | "methods"
  | "results"
  | "discussion"
  | "conclusion"
  | "other";

export interface ManuscriptUnit {
  /** Sub-section id (or the section id when a section has no sub-sections). */
  id: string;
  sectionId: string;
  sectionTitle: string;
  /** Sub-section title; equals sectionTitle when the section is a single unit. */
  title: string;
  /** True when this unit is a whole section with no sub-sections. */
  isWholeSection: boolean;
  targetWords: number;
  kind: SectionKind;
  assignedSourceIds: string[];
}

export interface ManuscriptTexts {
  /** Text per unit id. */
  texts: Record<string, string>;
  /**
   * Text from an earlier single-document draft that sits under no known
   * sub-section heading. Kept so nothing the author wrote is lost.
   */
  unsorted: string;
  /**
   * Closing matter added elsewhere (Declarations from Delivery, a References
   * list, Acknowledgements, Appendices). Kept at the end, as written.
   */
  backMatter?: string;
}

export const EMPTY_TEXTS: ManuscriptTexts = { texts: {}, unsorted: "" };

const BACK_MATTER = /^(declarations?|references|bibliography|acknowledg(e)?ments?|appendi(x|ces)|funding|conflicts? of interest|competing interests|data availability|author contributions?)\b/i;

export function countWords(text: string | undefined): number {
  return (text ?? "").trim().split(/\s+/).filter(Boolean).length;
}

export function sectionKind(title: string): SectionKind {
  const t = title.toLowerCase();
  if (/abstract|summary/.test(t)) return "abstract";
  if (/method|material|design|procedure|protocol|data collection|approach/.test(t)) return "methods";
  if (/result|finding/.test(t)) return "results";
  if (/discussion|implication|interpretation/.test(t)) return "discussion";
  if (/conclu|future work|outlook/.test(t)) return "conclusion";
  if (/literature|related work|prior work|theoretical (framework|background)|state of the art/.test(t)) return "literature";
  if (/introduc|background|problem|research question|context/.test(t)) return "introduction";
  return "other";
}

/**
 * The order many authors write a research article in: methods and results
 * while the work is fresh, then what they mean, then the framing, and the
 * abstract last because it summarises everything else.
 */
const WRITING_RANK: Record<SectionKind, number> = {
  methods: 1,
  results: 2,
  discussion: 3,
  introduction: 4,
  literature: 4,
  conclusion: 5,
  abstract: 6,
  other: 7,
};

export function writingRank(kind: SectionKind): number {
  return WRITING_RANK[kind];
}

/** What each kind of section has to do, shown above the editor. */
export const SECTION_GUIDANCE: Record<SectionKind, string> = {
  abstract:
    "Write this last. Background, aim, methods, key results and the main conclusion, within the journal's abstract limit.",
  introduction:
    "What is known, what is missing (your gap), and the question this article answers. End with what the article contributes.",
  literature:
    "Group prior work by theme and show where it stops: that boundary is your gap. Cite sources from your evidence.",
  methods:
    "A good place to start. Design, data or materials, procedures and analysis, in enough detail for someone to repeat the work.",
  results:
    "What you found, in the order of your methods, with your figures and tables. Report here; interpret in the Discussion.",
  discussion:
    "What the results mean, how they compare with prior work, the limitations, and the implications.",
  conclusion:
    "The answer to your question and why it matters, in a few sentences. No new results.",
  other: "",
};

const DEFAULT_OUTLINE: Array<{ key: string; title: string; share: number }> = [
  { key: "abstract", title: "Abstract", share: 0.04 },
  { key: "introduction", title: "Introduction", share: 0.16 },
  { key: "methods", title: "Methods", share: 0.22 },
  { key: "results", title: "Results", share: 0.24 },
  { key: "discussion", title: "Discussion", share: 0.26 },
  { key: "conclusion", title: "Conclusion", share: 0.08 },
];

/** Units from the blueprint, or a plain IMRaD outline when there is none. */
export function manuscriptUnits(blueprint: WordBudgetBlueprint | null, targetTotalWords = 6000): ManuscriptUnit[] {
  if (blueprint && Array.isArray(blueprint.sections) && blueprint.sections.length > 0) {
    const units: ManuscriptUnit[] = [];
    for (const sec of [...blueprint.sections].sort((a, b) => a.order - b.order)) {
      const kind = sectionKind(sec.sectionName || sec.sectionKey || "");
      const subs = [...(sec.subSections || [])].sort((a, b) => a.order - b.order);
      if (subs.length === 0) {
        units.push({
          id: sec.id,
          sectionId: sec.id,
          sectionTitle: sec.sectionName,
          title: sec.sectionName,
          isWholeSection: true,
          targetWords: sec.targetWords,
          kind,
          assignedSourceIds: [],
        });
        continue;
      }
      for (const sub of subs) {
        units.push({
          id: sub.id,
          sectionId: sec.id,
          sectionTitle: sec.sectionName,
          title: sub.title,
          isWholeSection: false,
          targetWords: sub.targetWords,
          kind,
          assignedSourceIds: Array.isArray(sub.assignedSourceIds) ? sub.assignedSourceIds : [],
        });
      }
    }
    return units;
  }
  const total = targetTotalWords > 0 ? targetTotalWords : 6000;
  return DEFAULT_OUTLINE.map((s) => ({
    id: `default-${s.key}`,
    sectionId: `default-${s.key}`,
    sectionTitle: s.title,
    title: s.title,
    isWholeSection: true,
    targetWords: s.key === "abstract" ? Math.min(250, Math.round(total * s.share)) : Math.round((total * s.share) / 50) * 50,
    kind: s.key as SectionKind,
    assignedSourceIds: [],
  }));
}

/** Units grouped by section, in manuscript order or in writing order. */
export function groupUnits(units: ManuscriptUnit[], order: "manuscript" | "writing"): Array<{ sectionId: string; sectionTitle: string; kind: SectionKind; units: ManuscriptUnit[] }> {
  const groups: Array<{ sectionId: string; sectionTitle: string; kind: SectionKind; units: ManuscriptUnit[]; index: number }> = [];
  units.forEach((u) => {
    let g = groups.find((x) => x.sectionId === u.sectionId);
    if (!g) {
      g = { sectionId: u.sectionId, sectionTitle: u.sectionTitle, kind: u.kind, units: [], index: groups.length };
      groups.push(g);
    }
    g.units.push(u);
  });
  if (order === "writing") groups.sort((a, b) => writingRank(a.kind) - writingRank(b.kind) || a.index - b.index);
  return groups.map(({ index: _index, ...g }) => g);
}

const norm = (s: string) => s.replace(/^§\s*/, "").replace(/\s+/g, " ").trim().toLowerCase();

/**
 * Reads the stored texts. Projects written before per-section storage have one
 * markdown document; it is split on the `### § Title` headings the old studio
 * wrote, and anything that matches no unit is kept as unsorted text.
 */
export function loadTexts(rawSections: unknown, legacyMarkdown: string | undefined, units: ManuscriptUnit[]): ManuscriptTexts {
  let parsed: unknown = rawSections;
  if (typeof rawSections === "string" && rawSections.trim()) {
    try {
      parsed = JSON.parse(rawSections);
    } catch {
      parsed = null;
    }
  }
  if (parsed && typeof parsed === "object" && "texts" in parsed) {
    const p = parsed as { texts?: unknown; unsorted?: unknown; backMatter?: unknown };
    const texts: Record<string, string> = {};
    if (p.texts && typeof p.texts === "object") {
      for (const [k, v] of Object.entries(p.texts as Record<string, unknown>)) if (typeof v === "string") texts[k] = v;
    }
    const out: ManuscriptTexts = { texts, unsorted: typeof p.unsorted === "string" ? p.unsorted : "" };
    if (typeof p.backMatter === "string" && p.backMatter.trim()) out.backMatter = p.backMatter;
    return out;
  }
  return splitLegacyManuscript(legacyMarkdown ?? "", units);
}

export function splitLegacyManuscript(markdown: string, units: ManuscriptUnit[]): ManuscriptTexts {
  const text = (markdown || "").replace(/\r\n/g, "\n");
  if (!text.trim()) return { texts: {}, unsorted: "" };
  const byTitle = new Map(units.map((u) => [norm(u.title), u.id]));
  const sectionTitles = new Set(units.map((u) => norm(u.sectionTitle)));
  const texts: Record<string, string> = {};
  const unsorted: string[] = [];
  // Split before every ## / ### heading, keeping the heading with its block.
  const blocks = text.split(/\n(?=#{2,3}\s)/);
  // Everything from the first closing heading (## Declarations, ## References…) on is back matter.
  const backAt = blocks.findIndex((b) => /^##\s/.test(b) && BACK_MATTER.test(b.replace(/^##\s+/, "")));
  const backMatter = backAt >= 0 ? blocks.splice(backAt).join("\n").trim() : "";
  for (const block of blocks) {
    const m = block.match(/^(#{2,3})\s+(.*)\n?([\s\S]*)$/);
    if (!m) {
      if (block.trim()) unsorted.push(block.trim());
      continue;
    }
    const [, hashes, heading, body] = m;
    const key = norm(heading);
    const unitId = byTitle.get(key);
    if (unitId) {
      const prev = texts[unitId];
      texts[unitId] = prev ? `${prev}\n\n${body.trim()}` : body.trim();
    } else if (hashes === "##" && sectionTitles.has(key)) {
      // A section heading: its own body (before any sub-section) has no unit
      // unless the section is a single unit.
      const whole = units.find((u) => u.isWholeSection && norm(u.sectionTitle) === key);
      if (whole) texts[whole.id] = body.trim();
      else if (body.trim()) unsorted.push(body.trim());
    } else if (block.trim()) {
      unsorted.push(block.trim());
    }
  }
  const out: ManuscriptTexts = { texts, unsorted: unsorted.join("\n\n") };
  if (backMatter) out.backMatter = backMatter;
  return out;
}

/** The whole manuscript as markdown, for Review, Delivery and export. */
export function assembleManuscript(units: ManuscriptUnit[], t: ManuscriptTexts): string {
  const out: string[] = [];
  if (t.unsorted.trim()) out.push(t.unsorted.trim());
  for (const g of groupUnits(units, "manuscript")) {
    const written = g.units.filter((u) => (t.texts[u.id] ?? "").trim());
    if (written.length === 0) continue;
    out.push(`## ${g.sectionTitle}`);
    for (const u of written) {
      if (!u.isWholeSection) out.push(`### § ${u.title}`);
      out.push((t.texts[u.id] ?? "").trim());
    }
  }
  if (t.backMatter?.trim()) out.push(t.backMatter.trim());
  return out.join("\n\n").trim() ? out.join("\n\n").trim() + "\n" : "";
}

export function serializeTexts(t: ManuscriptTexts): string {
  return JSON.stringify({ version: 1, texts: t.texts, unsorted: t.unsorted, ...(t.backMatter?.trim() ? { backMatter: t.backMatter } : {}) });
}

/**
 * What the AI is told about sections already written, so a Discussion,
 * Introduction or Abstract drafted later agrees with them. Excerpts only.
 */
export function writtenContext(units: ManuscriptUnit[], t: ManuscriptTexts, exceptId: string, maxChars = 6000): string {
  const parts: string[] = [];
  let used = 0;
  for (const g of groupUnits(units, "writing")) {
    for (const u of g.units) {
      if (u.id === exceptId) continue;
      const body = (t.texts[u.id] ?? "").trim();
      if (!body) continue;
      const room = maxChars - used;
      if (room < 200) return parts.join("\n\n");
      const excerpt = body.length > Math.min(1500, room) ? `${body.slice(0, Math.min(1500, room)).trimEnd()} …` : body;
      parts.push(`[${u.isWholeSection ? u.title : `${u.sectionTitle} — ${u.title}`}]\n${excerpt}`);
      used += excerpt.length;
    }
  }
  return parts.join("\n\n");
}

export function totalWords(t: ManuscriptTexts): number {
  return Object.values(t.texts).reduce((n, s) => n + countWords(s), 0) + countWords(t.unsorted) + countWords(t.backMatter);
}

/** The next unit to write, following the writing order: the first one not yet near its target. */
export function nextToWrite(units: ManuscriptUnit[], t: ManuscriptTexts): ManuscriptUnit | null {
  for (const g of groupUnits(units, "writing")) {
    for (const u of g.units) {
      if (countWords(t.texts[u.id]) < Math.max(1, Math.round(u.targetWords * 0.5))) return u;
    }
  }
  return null;
}


/**
 * The texts to edit. The assembled markdown is what other parts of the
 * workspace change (a referee patch, an imported draft), so when it no longer
 * matches the stored sections it wins and is split again.
 */
export function resolveTexts(rawSections: unknown, markdown: string | undefined, units: ManuscriptUnit[]): ManuscriptTexts {
  const md = (markdown ?? "").trim();
  const hasStored = typeof rawSections === "string" ? rawSections.trim().length > 0 : Boolean(rawSections);
  const stored = hasStored ? reconcileTexts(loadTexts(rawSections, undefined, units), units) : null;
  if (stored && (!md || assembleManuscript(units, stored).trim() === md)) return stored;
  return splitLegacyManuscript(md, units);
}

/** Text kept under ids no longer in the outline moves to the unsorted text, so nothing is lost. */
export function reconcileTexts(t: ManuscriptTexts, units: ManuscriptUnit[]): ManuscriptTexts {
  const ids = new Set(units.map((u) => u.id));
  const texts: Record<string, string> = {};
  const orphans: string[] = [];
  for (const [id, body] of Object.entries(t.texts)) {
    if (ids.has(id)) texts[id] = body;
    else if (body.trim()) orphans.push(body.trim());
  }
  if (orphans.length === 0) return t;
  return { ...t, texts, unsorted: [t.unsorted.trim(), ...orphans].filter(Boolean).join("\n\n") };
}
