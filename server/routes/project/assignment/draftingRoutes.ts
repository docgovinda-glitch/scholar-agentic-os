import { parseBody, StreamSectionBody } from "./schemas.ts";
import express from "express";
import { buildSectionScaffold,type ScaffoldSource } from "../../../src/utils/sectionScaffold.ts";
import { BrowserAiRequiredError,InvalidLlmChallengeError,LocalModelUnreachableError,NoClientAiProviderError } from "../../../src/ai/aiRouteErrors.ts";
import { fitDraftToBudget,sectionWordRange,trimToSentenceWithinWords } from "../../../src/utils/sectionBudget.ts";
import {
buildScholarlyVoiceSystemPrompt,
sanitizeScholarlyText,
normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { callOpenRouterText,handOffBeforeStream } from "../../../src/services/scholarBrain.ts";
import { ensureParagraphBreaks } from "../../../../src/shared/proseParagraphs.ts";
import { chunkPreservingWhitespace,openSseStream,SSE_HEARTBEAT_MS,streamErrorMessage } from "../../../src/utils/sectionStream.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import { sendAiFailure,UnusableAiResponseError } from "../../../src/ai/aiRouteErrors.ts";
import {
isTutorialOrShortQABrief
} from "../../../../src/utils/briefExtractor.ts";
import {
replaceBracketTokensWithDeterministicCitations,type WebsiteCitationItem
} from "../../../../src/desk/scholarCitationEngine.ts";
import {
getProjectSafe,safeParseObject
} from "./helpers.ts";

const router = express.Router({ mergeParams: true });


// 6b. POST /api/projects/:id/assignment/stream-section
router.post("/stream-section", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = parseBody(StreamSectionBody, req, res);
  if (!body) return;

  const {
    sectionTitle,
    academicFunction,
    targetWordCount: requestedTarget = 500,
    allocatedWords,
    academicLevel = project.answers["academic_level"] || "undergraduate",
    citationStyle = project.answers["citation_style"] || "apa7",
    assignmentTopic = project.answers["assignment_question"] || "",
    thesis = "",
    boundSources = [],
    revisionPrompt,
    existingContent = "",
    evidencePackPrompt,
    guidance: sectionGuidance = "",
    keyPoints: sectionKeyPoints = [],
    remainingEssayWords,
    sectionIndex,
    sectionCount,
    outlineTitles,
    previousTail,
    writingStyle,
  } = body;
  // The section's exact budget from the outline (±5%), never more than what the
  // whole essay still has left, so a 1,000-word paper cannot reach 1,450.
  const allocated = Math.round(Number(allocatedWords ?? requestedTarget) || 500);
  const remaining = Number(remainingEssayWords);
  const capped = Number.isFinite(remaining) && remaining > 0 ? Math.min(allocated, remaining) : allocated;
  const targetWordCount = Math.min(3000, Math.max(50, capped));
  const budgetRange = sectionWordRange(targetWordCount);

  // A missing AI is still a 426 hand-off (checked before the stream opens);
  // once the stream is open, failures are SSE events (P0-20).
  let heartbeat: ReturnType<typeof setInterval> | undefined;
  try {
    const mappedSources: WebsiteCitationItem[] = (
      Array.isArray(boundSources) ? boundSources : []
    ).map((s: unknown, idx: number) => {
      const src = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const id = (src.id as string) || (src.source_id as string) || (src.sourceId as string) || `src-${idx + 1}`;
      const title = (src.title as string) || "Scholarly Resource";
      const authors = Array.isArray(src.authors)
        ? (src.authors as string[])
        : typeof src.authors === "string"
        ? [src.authors]
        : typeof src.author === "string"
        ? [src.author]
        : ["Author"];
      const year = (src.year as string | number) || "n.d.";
      const journal = (src.journal as string) || (src.venue as string) || (src.type as string) || undefined;
      const doi = (src.doi as string) || undefined;
      const url = (src.url as string) || undefined;
      const citation = (src.citation as string) || undefined;

      return {
        id,
        title,
        authors,
        year,
        journal,
        venue: journal,
        doi,
        url,
        citation,
        mainFinding: (src.mainFinding as string) || (src.suggestedUse as string) || undefined,
        suggestedUse: (src.suggestedUse as string) || undefined,
      };
    });

    // Use structured evidence pack if provided (Production Spec §4.1–4.3),
    // otherwise fall back to the basic flat evidence list
    const evidenceBlock = evidencePackPrompt
      ? evidencePackPrompt
      : mappedSources
          .map((s, i) => `[${i + 1}] (Token ID: [${s.id}]) Title: ${s.title} | Author(s): ${(s.authors || []).join(", ")} (${s.year || "n.d."}) | Venue: ${s.journal || "Scholarly"} | Rationale: ${s.suggestedUse || s.mainFinding || ""}`)
          .join("\n");

    const revisionInstruction = scholarBrain.courseworkPrompts.streamSectionRevisionInstruction({ revisionPrompt });

    const existingBlock = (existingContent && revisionPrompt)
      ? `EXISTING DRAFT CONTENT TO REVISE:\n"""\n${existingContent}\n"""\nPlease revise and upgrade this draft following the revision focus above while preserving accurate empirical citations.\n`
      : "";

    const briefRaw = [
      project.answers["assignment_brief_text"],
      project.answers["instructions"],
      project.answers["assignment_question"],
      assignmentTopic,
    ].filter(Boolean).join(" ");
    const isShortQA = isTutorialOrShortQABrief(briefRaw, targetWordCount) || targetWordCount <= 200;

    const frameworkGuidelines = scholarBrain.courseworkPrompts.streamSectionFrameworkGuidelines({ isShortQA, mappedSources, citationStyle });

    // What the agent learned in earlier stages: the plan, the brief's
    // requirements, and evidence quoted from each linked source's abstract.
    const agentUnderstanding = safeParseObject(project.answers["assignment_understanding"]) as { produce?: string; approach?: string; thesisDirection?: string } | null;
    const agentExtraction = safeParseObject(project.answers["assignment_extraction"]) as { requirements?: Array<{ text: string; kind?: string }> } | null;
    const agentAnalysis = (safeParseObject(project.answers["assignment_source_analysis"]) as Record<string, { evidence?: Array<{ claim: string; quote: string }> }> | null) ?? {};
    const agentEvidence = mappedSources
      .map((src, i) => {
        const ev = agentAnalysis[String(src.id)]?.evidence ?? [];
        return ev.length ? `[${i + 1}] ${ev.map((e) => `"${e.quote}" (supports: ${e.claim})`).join("; ")}` : "";
      })
      .filter(Boolean)
      .join("\n");
    const agentBlock = [
      agentUnderstanding?.produce ? `WHAT THE PIECE MUST BE: ${agentUnderstanding.produce}` : "",
      agentUnderstanding?.approach ? `APPROACH: ${agentUnderstanding.approach}` : "",
      agentExtraction?.requirements?.length ? `REQUIREMENTS FROM THE BRIEF (keep to those relevant to this section):\n- ${agentExtraction.requirements.slice(0, 12).map((r) => r.text).join("\n- ")}` : "",
      agentEvidence ? `EVIDENCE QUOTED FROM THE SOURCES' ABSTRACTS (quote only these words; never invent quotations or page numbers):\n${agentEvidence}` : "",
    ]
      .filter(Boolean)
      .join("\n\n");

    const prompt = scholarBrain.courseworkPrompts.streamSectionPrompt({ sectionTitle, academicFunction, targetWordCount, budgetRange, academicLevel, citationStyle, thesis, project, assignmentTopic, revisionInstruction, existingBlock, evidencePackPrompt, evidenceBlock, agentBlock, sectionGuidance, sectionIndex, sectionCount, outlineTitles, previousTail, mappedSources, writingStyle, frameworkGuidelines, isShortQA });

    const scholarlyDirectives = buildScholarlyVoiceSystemPrompt({
      discipline: "Academic Coursework",
      dialect: "en-GB",
      requireVaultEvidence: true,
    });
    const systemPrompt = scholarBrain.courseworkPrompts.streamSectionSystemPrompt({ scholarlyDirectives });

    // No server-side model (or the user's local model goes first): hand off with
    // a 426 now, while a status can still be sent.
    if (await handOffBeforeStream(req, res, systemPrompt, prompt, "drafting")) return;

    // Open the event stream BEFORE the model call, and keep it alive while the
    // model thinks, so proxies (Render, Vite) never drop a silent socket.
    openSseStream(res);
    heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keep-alive\n\n");
    }, SSE_HEARTBEAT_MS);
    res.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
    });

    const draft = await callOpenRouterText(req, res, systemPrompt, prompt, undefined, "drafting");

    let effectiveDraft = draft?.trim() ?? "";
    if (!effectiveDraft) throw new UnusableAiResponseError("section draft");

    // Enforce the budget with the app's own word count: when short, one full
    // rewrite and then one continuation (a revision keeps the student's request).
    if (!revisionPrompt) {
      effectiveDraft = await fitDraftToBudget(effectiveDraft, budgetRange, {
        rewriteLonger: (current, words) =>
          callOpenRouterText(req, res, systemPrompt, scholarBrain.courseworkPrompts.streamSectionLongerPrompt({ prompt, draft: current, draftWords: words, targetWordCount, budgetRange }), undefined, "drafting"),
        continueDraft: (current, missingWords) =>
          callOpenRouterText(req, res, systemPrompt, scholarBrain.courseworkPrompts.streamSectionContinuePrompt({ prompt, draft: current, missingWords }), undefined, "drafting"),
      });
    }


    // Pipe streamed draft through deterministic citation interceptor
    effectiveDraft = replaceBracketTokensWithDeterministicCitations(
      effectiveDraft,
      mappedSources,
      citationStyle
    );

    // Apply Discourse-Level Scholarly Voice Guardrails (cliché suppression, British English, NFC Unicode preservation)
    effectiveDraft = sanitizeScholarlyText(effectiveDraft, { dialect: "en-GB", stripCliches: true });
    effectiveDraft = normalizeUnicodeNFC(effectiveDraft);
    // Paragraphs survive every step: blank lines kept, a single wall regrouped.
    effectiveDraft = ensureParagraphBreaks(effectiveDraft);
    // Trim an overrun last: expanding citation tokens and cleaning the prose change the count.
    effectiveDraft = trimToSentenceWithinWords(effectiveDraft, budgetRange.max);

    for (const chunk of chunkPreservingWhitespace(effectiveDraft, 5)) {
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ fullText: effectiveDraft })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    const handedOff = err?.message === "RequireFrontendLLMException";
    if (handedOff && !res.headersSent) return;
    if (!res.headersSent) return sendAiFailure(res, err, "Section draft");
    // The stream is open: every failure becomes an event, never a dropped socket.
    // Configuration errors keep their own message; any other AI failure
    // (credit/quota exhausted on every provider, 5xx, timeout) on a first draft
    // gets a clearly labelled offline scaffold.
    const keepsOwnStatus =
      handedOff ||
      err instanceof BrowserAiRequiredError ||
      err instanceof InvalidLlmChallengeError ||
      err instanceof LocalModelUnreachableError ||
      err instanceof NoClientAiProviderError ||
      err instanceof UnusableAiResponseError;
    if (!res.writableEnded && !keepsOwnStatus && !revisionPrompt && !String(existingContent || "").trim()) {
      const scaffold = buildSectionScaffold({
        title: String(sectionTitle || ""),
        prompt: String(sectionGuidance || ""),
        assignmentQuestion: String(assignmentTopic || ""),
        keyPoints: Array.isArray(sectionKeyPoints) ? sectionKeyPoints.map(String) : [],
        sources: Array.isArray(boundSources) ? (boundSources as ScaffoldSource[]) : [],
        targetWords: targetWordCount,
      });
      console.warn("[stream-section] AI unavailable, sending offline scaffold:", err instanceof Error ? err.message : err);
      res.write(`data: ${JSON.stringify({ fallback: { mode: "offline_scaffold", reason: "No AI provider could answer right now." } })}\n\n`);
      res.write(`data: ${JSON.stringify({ fullText: scaffold })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    console.error("Stream section error:", err instanceof Error ? err.message : err);
    if (!res.writableEnded) {
      res.write(`data: ${JSON.stringify({ error: streamErrorMessage(err, handedOff), recoverable: true })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
    }
  } finally {
    if (heartbeat) clearInterval(heartbeat);
  }
});


export default router;
