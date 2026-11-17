/**
 * Manuscript prompt text: drafting one section (the one section drafter,
 * `scholarBrain.draftSection`, used by the Journal Writing Studio and the
 * desk's manuscript generation job) and polishing text. Routes reach these
 * only through `scholarBrain`; no route writes its own prompt.
 */
import type { ScholarlyDialect } from "../../utils/scholarlyVoiceGuard.ts";

const ORTHOGRAPHY: Record<ScholarlyDialect, string> = {
  "en-GB": "British English (-ise, -our, -re, modelling)",
  "en-US": "American English (-ize, -or, -er, modeling)",
};

export interface SectionDraftPromptInput {
  /** The scholarly voice rules (scholarlyVoiceGuard), already built for the dialect. */
  voicePrompt: string;
  /** The citable sources as a ledger of [CITE:id] tokens. */
  ledgerPrompt: string;
  /** Source passages ranked for this section. */
  evidenceContext: string;
  sectionTitle: string;
  targetWords: number;
}

export function sectionDraftSystemPrompt(input: SectionDraftPromptInput): string {
  return `${input.voicePrompt}

${input.ledgerPrompt}

${input.evidenceContext}

TASK SPECIFICATION:
You are drafting the manuscript section "${input.sectionTitle}".
Target Word Budget: approximately ${input.targetWords} words (stay within about 15% of it).

CRITICAL CITATION RULES:
1. Every factual assertion, quantitative finding, or empirical claim MUST cite evidence using [CITE:source_id] tokens from the ledger above.
2. Cite only ids in the ledger. DO NOT write (Author, Year) strings from memory. If the ledger is empty, write no citations and make no claims that would need one.
3. Eliminate all AI lexical clichés ("delve", "tapestry", "pivotal", etc.).
4. Maintain high syntactic burstiness with complex multi-clause analytical sentences.
5. Write 2-4 paragraphs separated by blank lines. Do not repeat the section title as a heading.`;
}

export interface SectionDraftUserInput {
  sectionTitle: string;
  /** What the article is about: title, research problem and the like (bounded). */
  researchContext: string;
  /** The target journal, when one is chosen. */
  journal?: { name: string; citationStyle?: string };
  /** What this kind of section has to do (shown to the author too). */
  sectionBrief?: string;
  /** What the author typed for this draft. */
  authorGuidance?: string;
  /** Excerpts of sections already written. */
  writtenSections?: string;
  targetWords: number;
}

export function sectionDraftUserPrompt(input: SectionDraftUserInput): string {
  return [
    `Draft the manuscript section "${input.sectionTitle}".`,
    "Research Context:",
    input.researchContext || "(not provided)",
    input.journal ? `Target journal: ${input.journal.name}${input.journal.citationStyle ? ` (citation style: ${input.journal.citationStyle})` : ""}` : "",
    input.sectionBrief ? `What this section has to do: ${input.sectionBrief}` : "",
    input.authorGuidance ? `Author Guidance (follow it): ${input.authorGuidance}` : "",
    input.writtenSections
      ? `\nSections already written. Stay consistent with them, do not repeat them, and do not contradict their methods or results:\n${input.writtenSections}`
      : "",
    `\nTarget Word Budget: ${input.targetWords} words.`,
  ]
    .filter(Boolean)
    .join("\n");
}

export function sectionExpansionPrompt(input: { sectionTitle: string; draft: string; draftWords: number; targetWords: number; citationIds: string[] }): string {
  const deficit = input.targetWords - input.draftWords;
  const cite = input.citationIds.length > 0 ? ` using only these sources: ${input.citationIds.map((id) => `[CITE:${id}]`).join(", ")}` : " without adding citations";
  return `The preceding draft for "${input.sectionTitle}" is ${input.draftWords} words, which is below the target budget of ${input.targetWords} words.
Expand this draft by approximately ${deficit} words with deeper analysis and synthesis${cite}.
Keep every existing citation token unchanged. Ensure the final text lands within ±5% of ${input.targetWords} words without conversational filler or cliché repetitions.
Return the whole expanded section.

Existing Draft:
${input.draft}`;
}

export function polishSystemPrompt(input: { voicePrompt: string; dialect: ScholarlyDialect; scope: "passage" | "manuscript" }): string {
  const what = input.scope === "passage" ? "a passage from a scholarly manuscript" : "a scholarly manuscript";
  return `${input.voicePrompt}
You are an academic copy-editor performing a final editorial pass over ${what}.
CRITICAL MANDATES:
1. STRICT CITATION & DATA LOCK: Never delete, alter, move out of their sentence, or rephrase any citation tokens ([CITE:...], [FIG:...], [TAB:...], [@...], (Author, Year), [1]), DOIs, numerical measurements, statistical values (e.g. p < 0.001, 95% CI: [...]), or technical terms.
2. TERM-LOCKED HUMANIZATION: Eliminate AI lexical clichés ("delve", "tapestry", "testament", "underscores", "pivotal", "it is worth noting").
3. SYNTACTIC BURSTINESS: Alternate concise empirical declaratives with complex, multi-clause analytical sentences.
4. ORTHOGRAPHY & UNICODE: Use ${ORTHOGRAPHY[input.dialect]} and keep every diacritic exactly as written.
5. Keep the paragraph breaks, headings, lists, tables and other markup as they are. Do not add new claims.
Return ONLY the polished text without code block wrappers or commentary.`;
}

export function polishUserPrompt(text: string, scope: "passage" | "manuscript"): string {
  return `Polish this ${scope === "passage" ? "passage" : "scholarly manuscript"}:\n\n${text}`;
}
