/**
 * Task 1 (2026-07-24 follow-up session) — PaperProject -> ManuscriptWriterAgent
 * input adapter.
 *
 * Same honesty discipline as src/services/integrityReviewAdapter.ts: maps
 * only what's genuinely available on PaperProject, leaving anything without a
 * real source undefined rather than synthesizing a plausible value.
 *
 * CanonicalResearchProject.artifacts (`*Id` string references) has no
 * resolvable content anywhere in this codebase — there is no ID -> report
 * store. Rather than build that (a separate, larger task), this adapter
 * leaves `artifacts` empty and instead resolves the REAL text PaperProject
 * already has directly onto `researchContext` (see ManuscriptResearchContext's
 * comment in src/agents/manuscriptWriter/interfaces.ts) — objectives,
 * researchQuestions, researchGap, and methodology are all real, user/AI-
 * confirmed text fields on PaperProject, not invented here.
 *
 * `existingResultsText`/`existingDiscussionText` are read from
 * PaperProject.sections only if the user has already drafted those sections
 * for real (via the live draftSection() path) — never fabricated, since this
 * system performs no real data collection or analysis of its own.
 *
 * `literatureKeyFindings` is intentionally left undefined here: PaperProject
 * has no structured "key findings" field of its own (only free-text
 * dataSources entries and drafted section text) — callers that already have
 * a real LiteratureReview (e.g. from runResearchPipeline) should pass its
 * real keyFindings through separately rather than this adapter guessing at
 * what counts as a "finding" from unstructured project state.
 */

import type { PaperProject } from "../types";
import type { ManuscriptWriterInput } from "../agents/manuscriptWriter/interfaces";

function findSectionText(sections: Record<string, string>, ...candidateKeys: string[]): string | undefined {
  for (const key of Object.keys(sections)) {
    const lower = key.toLowerCase();
    if (candidateKeys.some((candidate) => lower.includes(candidate)) && sections[key]?.trim()) {
      return sections[key];
    }
  }
  return undefined;
}

export function buildManuscriptWriterInput(project: PaperProject): ManuscriptWriterInput {
  const referenceIds = (project.dataSources || [])
    .filter((s) => s.status === "approved")
    .map((s) => s.url || s.name);

  const sections = project.sections || {};

  return {
    project: {
      identity: {
        id: project.id,
        title: project.title || "Untitled Manuscript",
        description: project.researchGap || project.objectives || "",
        discipline: project.field || "General",
        keywords: project.keywords ? project.keywords.split(",").map((k) => k.trim()).filter(Boolean) : [],
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
      metadata: {
        author: project.authorName || "",
        collaborators: project.coAuthorName ? [project.coAuthorName] : [],
        institution: project.authorAffiliation || "",
        targetJournal: project.targetJournal?.name,
      },
      status: {
        phase: "writing",
        progress: 0,
      },
      artifacts: {},
      knowledge: {
        documentIds: [],
        referenceIds,
      },
      history: { executions: [], versions: [] },
      diagnostics: { errors: [], warnings: [] },
      configuration: { schemaVersion: "1.0.0", preferences: {} },
    },
    researchContext: {
      objectives: project.objectives || undefined,
      researchQuestions: project.researchQuestions || undefined,
      researchGap: project.researchGap || undefined,
      methodology: project.methodology || undefined,
      existingResultsText: findSectionText(sections, "result"),
      existingDiscussionText: findSectionText(sections, "discussion"),
    },
    aiSettings: project.aiSettings,
  };
}
