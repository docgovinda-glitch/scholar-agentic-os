/**
 * Invisible Decomposition & Sequential Drafting Engine (Section 3 & Section 7.4)
 * Handles automatic word count decomposition, automated source-to-claim evidence binding,
 * and PEEL-structured sequential section streaming.
 */

import { DEFAULT_CITATION_STYLE } from "../../../domain/assignment/answerKeys";
import type { DiscoveredSource,AssignmentDraftingSection } from "../types";
import { ensureParagraphBreaks } from "../../../shared/proseParagraphs";
import { readSse } from "../../../shared/sseReader";

export interface InternalSectionPlan extends AssignmentDraftingSection {
  sectionType: "intro" | "body" | "conclusion";
  academicFunction: string;
  boundSourceIds: string[];
}

/**
 * Step 3: Sequential Section Streaming Client Contract (Section 7.4)
 * Connects to POST /api/projects/:id/assignment/stream-section with SSE or resilient streaming fallback.
 * Enforces PEEL paragraph framework:
 * - Point: Thematic topic sentence
 * - Evidence: Assigned Phase 2 citations
 * - Explanation: critical analysis of the evidence, more than description
 * - Link: Explicit transition back to prompt
 */
export interface StreamSectionOptions {
  projectId: string;
  section: InternalSectionPlan;
  assignmentTopic: string;
  academicLevel?: string;
  citationStyle?: string;
  approvedSources?: DiscoveredSource[];
  thesis?: string;
  revisionPrompt?: "deepen" | "expand" | "condense" | string;
  /** Serialized evidence pack prompt block (Production Spec §4.1–4.3) */
  evidencePackPrompt?: string;
  onChunk: (chunk: string, aggregatedText: string) => void;
  /** `scaffold` is true when no AI could answer and the text is the labelled offline scaffold. */
  onComplete: (fullText: string, meta?: { scaffold?: boolean }) => void;
  onError?: (err: Error) => void;
  /** Called when the server could not use an AI and sent an offline scaffold instead. */
  onFallback?: (info: { reason: string }) => void;
  /** Where this section sits in the report, for a cohesive, non-repetitive draft. */
  report?: {
    sectionIndex: number;
    sectionCount: number;
    outlineTitles: string[];
    previousTail?: string;
    /** Words the essay may still use: target minus words already in other sections. */
    remainingEssayWords?: number;
  };
  writingStyle?: { preset?: string; customSampleText?: string };
  /** Stops the draft (the server stops the model when the connection closes). */
  signal?: AbortSignal;
  /** Resume: the text a stopped draft reached; the model continues from it. */
  continueFrom?: string;
}

/** A prompt the server could not run, to be run on the user's own model. */
interface HandOff {
  challengeToken: string;
  systemPrompt: string;
  userPrompt: string;
}

/** Text that had arrived before a draft stopped or failed ("" when none). */
export function partialTextOf(err: unknown): string {
  const t = (err as { partialText?: unknown } | null)?.partialText;
  return typeof t === "string" ? t : "";
}

/** The draft was stopped by the student; what had arrived is in `partialText`. */
export class SectionDraftStoppedError extends Error {
  constructor(public readonly partialText: string) {
    super("Drafting stopped.");
    this.name = "SectionDraftStoppedError";
  }
}

/**
 * Drafts one section with the user's own AI. The server either streams the
 * AI's text, or (when the AI runs in the browser) hands the prompt back: as a
 * 426 before the stream opens, which `authedJsonFetch` runs and retries, or as
 * a `requireFrontendLLM` event once it is open (the cloud models failed and the
 * next model in the chain is the user's own). Both are run here on the user's
 * model and sent back, so the section is finished from that answer. Nothing is
 * ever written here without the AI: on failure the caller gets an error, not
 * filler (P0-20).
 */
export async function streamSectionGeneration(options: StreamSectionOptions): Promise<string> {
  const {
    projectId,
    section,
    assignmentTopic,
    academicLevel = "undergraduate",
    citationStyle = DEFAULT_CITATION_STYLE,
    approvedSources = [],
    thesis = "",
    revisionPrompt,
    evidencePackPrompt,
    onChunk,
    onComplete,
    onError,
    onFallback,
    report,
    writingStyle,
    signal,
    continueFrom,
  } = options;

  // approvedSources is already the approved set; sources bound to the section go
  // first, and a section with no bound source may use any approved one.
  const bound = approvedSources.filter((s) => section.boundSourceIds?.includes(s.id));
  const relevantSources = bound.length ? bound : approvedSources;

  // Text shown so far, kept for a stop or a dropped connection.
  let shownSoFar = "";
  const attempt = async (browser?: { llmResult: string; challengeToken: string }): Promise<{ finalText: string; scaffold: boolean; handOff?: HandOff }> => {
    let handOff: HandOff | undefined;
    const { authedJsonFetch } = await import("../../api/client");
    const response = await authedJsonFetch(`/api/projects/${projectId}/assignment/stream-section`, "POST", {
      sectionId: section.id,
      sectionTitle: section.title,
      guidance: section.guidance,
      keyPoints: section.keyPoints,
      academicFunction: section.academicFunction,
      targetWordCount: section.targetWordCount,
      allocatedWords: section.targetWordCount,
      ...(report
        ? {
            sectionIndex: report.sectionIndex,
            sectionCount: report.sectionCount,
            outlineTitles: report.outlineTitles,
            previousTail: report.previousTail,
            remainingEssayWords: report.remainingEssayWords,
          }
        : {}),
      ...(writingStyle ? { writingStyle } : {}),
      academicLevel,
      citationStyle,
      assignmentTopic,
      thesis,
      boundSources: relevantSources,
      revisionPrompt,
      existingContent: section.draftContent,
      evidencePackPrompt,
      ...(continueFrom ? { continueFrom } : {}),
      ...(browser ?? {}),
    }, { signal });

    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(
        data?.error ||
          (response.status === 426
            ? "Connect an AI provider in AI Access to draft sections."
            : "The section could not be drafted. Nothing was written. Try again.")
      );
    }

    let aggregatedText = "";
    shownSoFar = "";
    let streamError = "";
    let finalFromServer = false;
    let scaffold = false;

    try {
      await readSse(response.body, (m) => {
        if (!m.json || !m.data || typeof m.data !== "object") return;
        const parsed = m.data as { chunk?: string; replace?: string; fullText?: string; error?: string; recoverable?: boolean; fallback?: { reason?: string }; requireFrontendLLM?: boolean; challengeToken?: string; systemPrompt?: string; userPrompt?: string };
        if (parsed.requireFrontendLLM && parsed.challengeToken) {
          handOff = { challengeToken: parsed.challengeToken, systemPrompt: parsed.systemPrompt ?? "", userPrompt: parsed.userPrompt ?? "" };
        }
        if (parsed.error) streamError = parsed.error;
        if (parsed.fallback) {
          scaffold = true;
          onFallback?.({ reason: parsed.fallback.reason || "No AI provider could answer right now." });
        }
        if (typeof parsed.replace === "string") {
          // The server switched model (or starts a continuation): show this text instead.
          aggregatedText = parsed.replace;
          shownSoFar = aggregatedText;
          onChunk("", aggregatedText);
        }
        if (parsed.chunk) {
          aggregatedText += parsed.chunk;
          shownSoFar = aggregatedText;
          onChunk(parsed.chunk, aggregatedText);
        }
        if (parsed.fullText) {
          aggregatedText = parsed.fullText;
          finalFromServer = true;
        }
      });
    } catch (readErr) {
      if (signal?.aborted) throw new SectionDraftStoppedError(aggregatedText);
      throw readErr;
    }

    // The server needs this prompt run on the user's own model: the caller runs
    // it and attempts again with the answer. Nothing is shown as a failure.
    if (handOff && !finalFromServer) return { finalText: "", scaffold: false, handOff };

    // A failure event (or a stream that ended without its final text) never
    // overwrites the section with a partial answer.
    if (streamError && !finalFromServer) throw new Error(streamError);
    const finalText = ensureParagraphBreaks(aggregatedText.trim());
    if (!finalText) {
      throw new Error(streamError || "The AI returned no text for this section. Nothing was written. Try again.");
    }
    return { finalText, scaffold };
  };

  try {
    let result: { finalText: string; scaffold: boolean; handOff?: HandOff };
    try {
      result = await attempt();
    } catch (first) {
      if (signal?.aborted) throw new SectionDraftStoppedError(shownSoFar);
      // A dropped socket (TypeError: Failed to fetch) before any text arrived is
      // retried once; after text arrived, the student decides (Resume / Try again).
      if (!(first instanceof TypeError) || shownSoFar) throw first;
      result = await attempt();
    }

    // The section has to be written by the model on the user's own computer:
    // it runs here, streaming into the page, and the server finishes the
    // section from that answer (citations, budget, paragraphs) on one more
    // request. The server verifies the signed challenge, so the answer is only
    // accepted for exactly this prompt.
    if (result.handOff) {
      const { executeAgenticLLM } = await import("../../api/client");
      const handOff = result.handOff;
      let local = "";
      const llmResult = await executeAgenticLLM(
        handOff.systemPrompt,
        handOff.userPrompt,
        "reasoning",
        (chunk) => {
          local += chunk;
          shownSoFar = local;
          onChunk(chunk, local);
        },
        signal
      );
      result = await attempt({ llmResult, challengeToken: handOff.challengeToken });
      if (result.handOff) throw new Error("The section could not be drafted on your own AI model. Check AI Access and try again.");
    }
    onComplete(result.finalText, { scaffold: result.scaffold });
    return result.finalText;
  } catch (err) {
    // A dropped connection surfaces as TypeError: Failed to fetch; say what it means.
    const error =
      err instanceof SectionDraftStoppedError
        ? err
        : signal?.aborted
        ? new SectionDraftStoppedError(shownSoFar)
        : err instanceof TypeError
        ? new Error("Could not reach the server. Check your connection and try again.")
        : err instanceof Error
        ? err
        : new Error(String(err));
    // What had arrived is kept, so the student can resume or keep it.
    if (!(error instanceof SectionDraftStoppedError) && shownSoFar) Object.assign(error, { partialText: shownSoFar });
    onError?.(error);
    throw error;
  }
}
