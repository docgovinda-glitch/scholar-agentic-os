/**
 * The per-section drafting contract: what this section must answer (every
 * lettered sub-part), which of the brief's references it must cite, where it
 * sits in the report, and whose voice to write in. Pure; built only from the
 * student's brief, outline and choices.
 */
import { extractPrescribedReferences } from "../../../src/utils/briefQuestions.ts";

export interface ContractSource {
  id?: string;
  title?: string;
  authors?: string[] | string;
  year?: string | number;
}

export interface SectionContractInput {
  /** The full question for this section, including "(a) ... (b) ..." parts. */
  prompt?: string;
  sectionIndex?: number;
  sectionCount?: number;
  outlineTitles?: string[];
  /** The end of the previous section, to continue from. */
  previousTail?: string;
  sources: ContractSource[];
  writingStyle?: { preset?: string; customSampleText?: string };
}

const familyOf = (a: string) => (a.includes(",") ? a.split(",")[0] : a.split(/\s+/).pop() || a).trim().toLowerCase();

/** Sources the question itself names, as "[n] Family (Year)" tokens for the prompt. */
export function requiredCitationsFor(prompt: string, sources: ContractSource[]): string[] {
  const named = extractPrescribedReferences(prompt || "");
  const out: string[] = [];
  for (const ref of named) {
    const fam = ref.authors.split(/\s+(?:and|&)\s+|\s+et\s+al/i)[0].trim().toLowerCase();
    const idx = sources.findIndex((s) => {
      const authors = Array.isArray(s.authors) ? s.authors : [String(s.authors ?? "")];
      return String(s.year ?? "").startsWith(String(ref.year)) && authors.some((a) => familyOf(String(a)) === fam);
    });
    if (idx >= 0) out.push(`[${idx + 1}] ${ref.label}`);
  }
  return out;
}

const STYLE_TEXT: Record<string, string> = {
  natural: "Clear, natural academic English: precise, readable sentences without jargon for its own sake.",
  expository: "Simple and direct: short sentences, one idea per sentence, plain words.",
  analytical: "Analytical: break each issue into parts and explain how they connect, with evidence.",
  critical: "Critical: weigh arguments and evidence and reach reasoned judgements.",
  formal_academic: "Formal academic register.",
  persuasive: "Persuasive: build a clear case for a position with evidence.",
  objective: "Objective: neutral, balanced and evidence-led.",
};

export function buildSectionContract(input: SectionContractInput): string {
  const lines: string[] = [];
  const prompt = (input.prompt || "").replace(/^Focus:\s*/i, "").trim();
  if (prompt) {
    lines.push(`QUESTION THIS SECTION ANSWERS (from the student's brief):\n${prompt}`);
    const parts = [...prompt.matchAll(/\(([a-h])\)/g)].map((m) => m[1]);
    if (parts.length) {
      lines.push(
        `Answer EVERY sub-part (${parts.map((p) => `(${p})`).join(", ")}) explicitly and in order, giving each its own paragraph within the word budget. Use direct, plain-English technical prose and do not restate the question.`
      );
    }
  }
  const required = requiredCitationsFor(prompt, input.sources);
  if (required.length) {
    lines.push(`REQUIRED CITATIONS (the brief names these for this question; cite each at least once with its token): ${required.join("; ")}.`);
  }
  if (input.sectionCount && input.sectionCount > 1 && input.sectionIndex !== undefined) {
    const n = input.sectionIndex + 1;
    lines.push(
      `This is section ${n} of ${input.sectionCount} of one report${input.outlineTitles?.length ? ` (${input.outlineTitles.join(" | ")})` : ""}. ${n > 1 ? "Do not write a general introduction to the whole subject; continue the report and link back briefly to the previous section where it helps." : "Open the report briefly, then answer this question."}`
    );
  }
  if (input.previousTail && input.previousTail.trim()) {
    lines.push(`THE PREVIOUS SECTION ENDED: "…${input.previousTail.trim().slice(-400)}"`);
  }
  const preset = input.writingStyle?.preset;
  if (preset === "custom" && input.writingStyle?.customSampleText?.trim()) {
    lines.push(`WRITE IN THE STUDENT'S OWN VOICE. Mirror the sentence length, vocabulary and tone of this sample (do not copy its content):\n"""${input.writingStyle.customSampleText.trim().slice(0, 1500)}"""`);
  } else if (preset && STYLE_TEXT[preset]) {
    lines.push(`WRITING STYLE: ${STYLE_TEXT[preset]}`);
  }
  lines.push("CITATION FORMAT: when two or more sources support one point, cite them together in one bracket, e.g. [1][2], never as separate sentences.");
  return lines.join("\n\n");
}
