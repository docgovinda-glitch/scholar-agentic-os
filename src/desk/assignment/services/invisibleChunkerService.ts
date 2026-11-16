/**
 * Invisible Decomposition & Sequential Drafting Engine (Section 3 & Section 7.4)
 * Handles automatic word count decomposition, automated source-to-claim evidence binding,
 * and PEEL-structured sequential section streaming.
 */

import type { DiscoveredSource,AssignmentDraftingSection } from "../types";
import { ensureParagraphBreaks } from "../../../shared/proseParagraphs";

export interface InternalSectionPlan extends AssignmentDraftingSection {
  sectionType: "intro" | "body" | "conclusion";
  academicFunction: string;
  boundSourceIds: string[];
}

export interface ClaimEvidenceBinding {
  sectionId: string;
  sectionTitle: string;
  academicFunction: string;
  boundSourceIds: string[];
  suggestedClaims: string[];
}

/**
 * Step 3: Sequential Section Streaming Client Contract (Section 7.4)
 * Connects to POST /api/projects/:id/assignment/stream-section with SSE or resilient streaming fallback.
 * Enforces PEEL paragraph framework:
 * - Point: Thematic topic sentence
 * - Evidence: Assigned Phase 2 citations
 * - Explanation: 70% critical analysis / 30% description
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
}

/**
 * Drafts one section with the user's own AI. The server either streams the
 * AI's text, or (when the AI runs in the browser) hands the prompt back via
 * a 426, which `authedJsonFetch` runs and retries. Nothing is ever written
 * here without the AI: on failure the caller gets an error, not filler (P0-20).
 */
export async function streamSectionGeneration(options: StreamSectionOptions): Promise<string> {
  const {
    projectId,
    section,
    assignmentTopic,
    academicLevel = "undergraduate",
    citationStyle = "apa7",
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
  } = options;

  // approvedSources is already the approved set; sources bound to the section go
  // first, and a section with no bound source may use any approved one.
  const bound = approvedSources.filter((s) => section.boundSourceIds?.includes(s.id));
  const relevantSources = bound.length ? bound : approvedSources;

  const attempt = async (): Promise<{ finalText: string; scaffold: boolean }> => {
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
    });

    if (!response.ok || !response.body) {
      const data = (await response.json().catch(() => null)) as { error?: string } | null;
      throw new Error(
        data?.error ||
          (response.status === 426
            ? "Connect an AI provider in AI Access to draft sections."
            : "The section could not be drafted. Nothing was written. Try again.")
      );
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let aggregatedText = "";
    let buffer = "";
    let streamError = "";
    let finalFromServer = false;
    let scaffold = false;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";

      for (const line of lines) {
        if (!line.startsWith("data: ")) continue;
        const rawData = line.slice(6).trim();
        if (!rawData || rawData === "[DONE]") continue;
        try {
          const parsed = JSON.parse(rawData) as { chunk?: string; fullText?: string; error?: string; recoverable?: boolean; fallback?: { reason?: string } };
          if (parsed.error) streamError = parsed.error;
          if (parsed.fallback) {
            scaffold = true;
            onFallback?.({ reason: parsed.fallback.reason || "No AI provider could answer right now." });
          }
          if (parsed.chunk) {
            aggregatedText += parsed.chunk;
            onChunk(parsed.chunk, aggregatedText);
          }
          if (parsed.fullText) {
            aggregatedText = parsed.fullText;
            finalFromServer = true;
          }
        } catch {
          // ignore a malformed line
        }
      }
    }

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
    let result: { finalText: string; scaffold: boolean };
    try {
      result = await attempt();
    } catch (first) {
      // A dropped socket (TypeError: Failed to fetch) is retried once straight away.
      if (!(first instanceof TypeError)) throw first;
      result = await attempt();
    }
    onComplete(result.finalText, { scaffold: result.scaffold });
    return result.finalText;
  } catch (err) {
    // A dropped connection surfaces as TypeError: Failed to fetch; say what it means.
    const error =
      err instanceof TypeError
        ? new Error("Could not reach the server. Check your connection and try again.")
        : err instanceof Error
        ? err
        : new Error(String(err));
    onError?.(error);
    throw error;
  }
}
