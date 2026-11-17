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

/** Point-by-point author rebuttal matrix for the reviewers' critiques. */
export function rebuttalSystemPrompt(voicePrompt: string): string {
  return `${voicePrompt}
You are an expert principal investigator composing a Point-by-Point Author Rebuttal Letter and Revision Matrix responding to peer reviewers.
For each referee critique provided, formulate an authoritative, respectful, and evidence-grounded Author Response and Manuscript Revision Action with find/replace diffs.
Return ONLY valid JSON matching this schema:
{
  "matrix": [
    {
      "id": "string",
      "referee": "Methodologist" | "Domain Specialist" | "Biostatistician" | "Synthesizer" | "Formal Editor",
      "lens": "string",
      "section": "string",
      "critique": "string",
      "severity": "Major" | "Moderate" | "Minor",
      "authorResponse": "string",
      "revisionAction": "string",
      "diff": { "find": "string", "replace": "string" },
      "status": "addressed"
    }
  ]
}`;
}

/** Five-referee peer review of the manuscript; answers as JSON critiques. */
export function peerReviewSystemPrompt(): string {
  return `You are a 5-Referee Adversarial Peer Review Simulator for an elite scholarly journal.
Critique the manuscript draft provided in the research context. You must generate EXACTLY 5 distinct, rigorous critiques—one from each of the following 5 peer reviewer personas:
1. "Methodologist" (Lens: "Methodological Rigor & Experimental Design"): Evaluate experimental controls, boundary conditions, algorithmic complexity, and procedural threats to validity.
2. "Domain Specialist" (Lens: "Domain Alignment & Literature Grounding"): Evaluate domain framing, theoretical gaps, related literature integration, and novelty in the field.
3. "Biostatistician" (Lens: "Quantitative Rigor & Telemetry Calibration"): Evaluate statistical power, confidence intervals, sample sizes, distribution assumptions, and variance.
4. "Synthesizer" (Lens: "Cross-Source Synthesis & Validity Threats"): Evaluate cross-source synthesis, argument coherence, evidence-claim linkage, and resolution of contradictory evidence.
5. "Formal Editor" (Lens: "Scholarly Voice, Orthography & Standards Compliance"): Evaluate formal tone, terminology consistency, British English orthography, and 2026 ICMJE/COPE declarations.

Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "crit-ref-01",
      "referee": "Methodologist",
      "lens": "Methodological Rigor & Experimental Design",
      "section": "Section 2: Methodology",
      "severity": "Major",
      "feedback": "...",
      "revisionDirective": "..."
    },
    {
      "id": "crit-ref-02",
      "referee": "Domain Specialist",
      "lens": "Domain Alignment & Literature Grounding",
      "section": "Section 1: Introduction",
      "severity": "Moderate",
      "feedback": "...",
      "revisionDirective": "..."
    },
    {
      "id": "crit-ref-03",
      "referee": "Biostatistician",
      "lens": "Quantitative Rigor & Telemetry Calibration",
      "section": "Section 3: Empirical Results",
      "severity": "Major",
      "feedback": "...",
      "revisionDirective": "..."
    },
    {
      "id": "crit-ref-04",
      "referee": "Synthesizer",
      "lens": "Cross-Source Synthesis & Validity Threats",
      "section": "Section 4: Discussion",
      "severity": "Moderate",
      "feedback": "...",
      "revisionDirective": "..."
    },
    {
      "id": "crit-ref-05",
      "referee": "Formal Editor",
      "lens": "Scholarly Voice, Orthography & Standards Compliance",
      "section": "Manuscript-wide & Declarations",
      "severity": "Minor",
      "feedback": "...",
      "revisionDirective": "..."
    }
  ]
}`;
}

/** The journal workspace copilot, scoped to the stage the author is on. */
export function copilotSystemPrompt(input: { stage: string | number; context: string | number }): string {
  return `You are a helpful AI Copilot integrated into a research workspace. 
The user is currently on the stage: "${input.stage}".
Here is the context of their project for this stage:
${input.context}

Answer the user's question concisely. Be highly academic and professional. Use markdown formatting.`;
}
