/**
 * Cover letter generation — a single bounded model call, unlike
 * src/app/manuscript/generate.ts's per-section checkpointed engine, because
 * a cover letter is one short document with no cross-call state to
 * checkpoint. Mirrors src/app/journal/extract.ts's shape: a plain pipeline
 * function taking provider/apiKey/model as opaque input, calling complete()
 * from platform/gateway. BYOK-vs-Premium stays the route layer's job
 * (server/routes/project.ts).
 *
 * taskClass is "drafting" — this generates new prose describing the
 * manuscript, the same content-bearing classification as manuscript
 * section generation (platform/warden/classify.ts), not "verification"
 * (which app/coherence and app/review use, since those only analyse
 * existing content).
 */

import type { Completer } from "../../platform/completion";
import type { CanonicalDocument } from "../../domain/document/model";
import type { JournalRequirements } from "../../domain/journal/types";
import type { CoverLetter } from "../../domain/coverLetter/types";


export interface GenerateCoverLetterInput {
  document: CanonicalDocument;
  journalRequirements: JournalRequirements;
  /** Runs the model; see src/platform/completion.ts. */
  complete: Completer;
}

export interface GenerateCoverLetterUsage {
  provider: string;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

export interface GenerateCoverLetterResult {
  coverLetter: CoverLetter;
  usage: GenerateCoverLetterUsage;
}

function systemPrompt(journalRequirements: JournalRequirements): string {
  return [
    "You are drafting a cover letter to accompany a journal submission, addressed to the editor.",
    `Target journal: ${journalRequirements.journalName}.`,
    "State the manuscript's core contribution in plain terms, explain why it fits this journal's scope and readership, and confirm the work is original and not under review elsewhere.",
    "Write in a professional, concise register — three to five short paragraphs, no more. Do not invent facts about the manuscript, its authors, or its findings beyond what the manuscript text below actually says.",
    "Respond with ONLY the letter body text, no markdown fences, no subject line, no address block, ending with a simple closing line (no signature name).",
  ].join("\n");
}

export async function generateCoverLetter(input: GenerateCoverLetterInput): Promise<GenerateCoverLetterResult> {

  const result = await input.complete(
    {
      taskClass: "drafting",
      systemPrompt: systemPrompt(input.journalRequirements),
      userPrompt: `Draft the cover letter for the manuscript titled "${input.document.title}".`,
    }
  );

  if (result.text.trim().length === 0) {
    throw new Error("The model returned an empty cover letter. Try again.");
  }

  const coverLetter: CoverLetter = {
    text: result.text.trim(),
    journalName: input.journalRequirements.journalName,
    generatedAt: new Date().toISOString(),
  };

  return {
    coverLetter,
    usage: {
      provider: result.provider,
      model: result.model,
      inputTokensEstimate: result.inputTokensEstimate,
      outputTokensEstimate: result.outputTokensEstimate,
    },
  };
}
