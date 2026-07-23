/**
 * AI-use disclosure (Stage 9, target-workflow.md).
 *
 * Deterministic — no LLM call. Builds an AIUseDisclosure record from real
 * project data only: which sections currently have drafted content, and
 * which provider/model combinations actually appear in usageLogs for
 * drafting-related task types. Never invents a model name or section.
 *
 * Template wording is grounded in current (as-of-2026-07) publisher
 * guidance, researched directly rather than assumed: Elsevier's published
 * "Declaration of generative AI and AI-assisted technologies in the
 * manuscript preparation process" section title and required-statement
 * structure (elsevier.com/about/policies-and-standards/generative-ai-policies-for-journals),
 * plus Springer Nature's requirement that LLM use be documented with which
 * part of the work it assisted (per publisher AI-policy summaries reviewed
 * the same day). This is a generic synthesis of the common requirements
 * shared across major publishers, not a verbatim reproduction of any single
 * journal's copyrighted text — authors should still check their specific
 * target journal's exact required wording before submission.
 */

import { PaperProject } from "../types";

const DRAFTING_TASK_TYPES = ["drafting", "redrafting", "humanize"];

export function getSectionsWithContent(project: PaperProject): string[] {
  const sections = project.sections || {};
  return Object.keys(sections).filter((key) => sections[key]?.trim());
}

export function getModelsUsedForDrafting(project: PaperProject): string[] {
  const logs = project.usageLogs || [];
  const seen = new Set<string>();
  for (const log of logs) {
    if (!DRAFTING_TASK_TYPES.includes(log.taskType)) continue;
    seen.add(`${log.provider} (${log.model})`);
  }
  return Array.from(seen);
}

export function buildDefaultDisclosureText(sectionsIncluded: string[], modelsUsed: string[]): string {
  const toolList = modelsUsed.length > 0 ? modelsUsed.join(", ") : "an AI writing assistant";
  const sectionList = sectionsIncluded.length > 0 ? sectionsIncluded.join(", ") : "the sections listed above";

  return `Declaration of Generative AI and AI-Assisted Technologies in the Manuscript Preparation Process

During the preparation of this work, the author(s) used ${toolList} in order to assist with drafting the following section(s): ${sectionList}. After using this tool, the author(s) reviewed and edited the content as needed and take full responsibility for the content of the published article. No AI tool is credited as an author, and AI was not used to conceive the original research, analyze data, or draw the study's scientific conclusions.`;
}

/** Builds a fresh, unconfirmed disclosure from the project's current state — never overwrites an already-confirmed one. */
export function buildDefaultDisclosure(project: PaperProject): { sectionsIncluded: string[]; modelsUsed: string[]; disclosureText: string } {
  const sectionsIncluded = getSectionsWithContent(project);
  const modelsUsed = getModelsUsedForDrafting(project);
  const disclosureText = buildDefaultDisclosureText(sectionsIncluded, modelsUsed);
  return { sectionsIncluded, modelsUsed, disclosureText };
}
