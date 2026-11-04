/**
 * How the agent's source step changes the workspace: real search results are
 * merged with the student's existing sources, the AI's reading of each
 * abstract is attached, and sources are linked to the outline sections they
 * support. Pure.
 */
import type { SourceAnalysis, SourceForAnalysis } from "../../../domain/assignment/assignmentAgent";
import type { AssignmentDraftingSection, AssignmentStructure, DiscoveredSource } from "../types";

/** A source is the same work if its DOI or its title (ignoring case and punctuation) matches. */
const keys = (s: { doi?: string; title?: string }) =>
  [s.doi ? `doi:${s.doi.toLowerCase()}` : "", `t:${(s.title ?? "").toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()}`].filter((k) => k && k !== "t:");

/** New results added after what the student already has, without duplicates. */
export function mergeDiscovered(existing: DiscoveredSource[], found: DiscoveredSource[], max = 20): DiscoveredSource[] {
  const seen = new Set(existing.flatMap(keys));
  const added: DiscoveredSource[] = [];
  for (const s of found) {
    const ks = keys(s);
    if (!s.title || ks.some((k) => seen.has(k))) continue;
    ks.forEach((k) => seen.add(k));
    added.push(s);
    if (added.length >= max) break;
  }
  return [...existing, ...added];
}

/** What the AI is shown for each source: bibliographic details and abstract only. */
export function forAnalysis(sources: DiscoveredSource[], max = 20): SourceForAnalysis[] {
  return sources
    .filter((s) => s.status !== "removed" && !s.isExcluded)
    .slice(0, max)
    .map((s) => ({
      id: s.id,
      title: s.title,
      authors: s.authors,
      year: s.year,
      venue: s.journal || s.publisher,
      abstract: s.abstract,
      peerReviewed: s.peerReviewed ?? null,
      citationCount: s.citationCount,
    }));
}

/** Sources with the AI's reading attached; evidence keeps the abstract's exact words. */
export function applyAnalyses(sources: DiscoveredSource[], analyses: SourceAnalysis[], sectionTitles: Record<string, string>): DiscoveredSource[] {
  const byId = new Map(analyses.map((a) => [a.id, a]));
  return sources.map((s) => {
    const a = byId.get(s.id);
    if (!a) return s;
    return {
      ...s,
      aiRelevance: a.relevance,
      aiCredibility: a.credibility,
      aiSections: a.sections,
      mainFinding: a.mainPoint || s.mainFinding,
      suggestedUse: a.sections.length ? `Supports ${a.sections.map((id) => sectionTitles[id] || id).join("; ")}` : s.suggestedUse,
      extractedEvidences: a.evidence.length
        ? a.evidence.map((e, i) => ({ id: `${s.id}-ev${i + 1}`, excerpt: e.quote, claim: e.claim, sourceLocation: "Abstract" }))
        : s.extractedEvidences,
    };
  });
}

/** Sources the AI judged high or medium relevance, added to those already approved. */
export function approveRelevant(approved: string[], analyses: SourceAnalysis[]): string[] {
  return Array.from(new Set([...approved, ...analyses.filter((a) => a.relevance !== "low").map((a) => a.id)]));
}

/** Links sources to outline sections (structure and drafting sections), keeping drafts untouched. */
export function bindToSections(
  structure: AssignmentStructure,
  sections: AssignmentDraftingSection[],
  analyses: SourceAnalysis[]
): { structure: AssignmentStructure; sections: AssignmentDraftingSection[] } {
  const bySection = new Map<string, string[]>();
  for (const a of analyses) {
    if (a.relevance === "low") continue;
    for (const id of a.sections) bySection.set(id, [...(bySection.get(id) ?? []), a.id]);
  }
  const add = (ids: string[] | undefined, extra: string[] | undefined) => Array.from(new Set([...(ids ?? []), ...(extra ?? [])]));
  return {
    structure: {
      ...structure,
      headings: structure.headings.map((h) => ({ ...h, subheadings: h.subheadings.map((s) => ({ ...s, boundSourceIds: add(s.boundSourceIds, bySection.get(s.id)), sourcesCount: add(s.boundSourceIds, bySection.get(s.id)).length })) })),
    },
    sections: sections.map((s) => ({ ...s, boundSourceIds: add(s.boundSourceIds, bySection.get(s.id)) })),
  };
}
