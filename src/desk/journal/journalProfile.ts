/**
 * Turning a confirmed journal profile into the workspace's plan: the outline
 * (the journal's own sections, sized from its word limit), the citation
 * style and the word target. Pure; no React, no I/O.
 */
import type { WordBudgetBlueprint } from "../workspace/types";
import { sectionKind, type SectionKind } from "./manuscriptModel";

/** Relative share of the main text by kind of section (abstract handled separately). */
const SHARE: Record<SectionKind, number> = {
  abstract: 0,
  introduction: 0.16,
  literature: 0.18,
  methods: 0.2,
  results: 0.22,
  discussion: 0.22,
  conclusion: 0.07,
  other: 0.1,
};

const round50 = (n: number) => Math.max(50, Math.round(n / 50) * 50);

/**
 * An outline from the journal's section list, each section one writing unit.
 * The abstract gets 250 words or 4% of the total, whichever is smaller (the
 * journal's own abstract limit, when known, is set by the author); the rest
 * is shared by kind of section.
 */
export function blueprintFromStructure(projectId: string, sections: string[], totalWords: number): WordBudgetBlueprint {
  const names = sections.map((s) => s.trim()).filter(Boolean);
  const total = totalWords > 0 ? totalWords : 6000;
  const kinds = names.map(sectionKind);
  const abstractWords = Math.min(250, Math.round(total * 0.04));
  const abstractCount = kinds.filter((k) => k === "abstract").length;
  const body = total - abstractWords * abstractCount;
  const weight = kinds.reduce((n, k) => n + SHARE[k], 0) || 1;
  const now = new Date().toISOString();
  const out: WordBudgetBlueprint = {
    projectId,
    template: "IMRaD",
    targetTotalWords: total,
    allocatedTotalWords: 0,
    totalSubSections: 0,
    createdAt: now,
    updatedAt: now,
    sections: names.map((name, i) => ({
      id: `jp-${i + 1}-${name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "")}`,
      sectionKey: kinds[i],
      sectionName: name,
      targetWords: kinds[i] === "abstract" ? abstractWords : round50((body * SHARE[kinds[i]]) / weight),
      order: i + 1,
      subSections: [],
    })),
  };
  out.allocatedTotalWords = out.sections.reduce((n, s) => n + s.targetWords, 0);
  return out;
}

/** The workspace's citation style option for what the guidelines name, if it is one we format. */
export function citationStyleOption(raw: string | undefined): string | undefined {
  const s = (raw ?? "").toLowerCase();
  if (!s) return undefined;
  if (/\bapa\b/.test(s)) return "APA 7";
  if (/\bieee\b/.test(s)) return "IEEE";
  if (/vancouver|icmje|nlm/.test(s)) return "Vancouver";
  if (/harvard/.test(s)) return "Harvard";
  if (/chicago/.test(s)) return /note/.test(s) ? "Chicago Notes" : "Chicago Author-Date";
  if (/\bmla\b/.test(s)) return "MLA 9";
  return undefined;
}
