import { DEFAULT_CITATION_STYLE } from "../../../../src/domain/assignment/answerKeys.ts";
import { errorText } from "../../../../src/shared/errorText.ts";
import { parseBody, StreamSectionBody } from "./schemas.ts";
import express from "express";
import { buildSectionScaffold,type ScaffoldSource } from "../../../src/utils/sectionScaffold.ts";
import { BrowserAiRequiredError,InvalidLlmChallengeError,LocalModelUnreachableError,NoClientAiProviderError } from "../../../src/ai/aiRouteErrors.ts";
import { repeatsDraft,sectionWordRange,trimToSentenceWithinWords } from "../../../src/utils/sectionBudget.ts";
import { countProseWords } from "../../../../src/shared/proseBlocks.ts";
import {
buildScholarlyVoiceSystemPrompt,
sanitizeScholarlyText,
normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { callOpenRouterText,handOffBeforeStream } from "../../../src/services/scholarBrain.ts";
import { ensureParagraphBreaks } from "../../../../src/shared/proseParagraphs.ts";
import { openSseStream,sendEvent,SSE_HEARTBEAT_MS,streamErrorMessage } from "../../../src/utils/sectionStream.ts";
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
    citationStyle = project.answers["citation_style"] || DEFAULT_CITATION_STYLE,
    assignmentTopic = project.answers["assignment_brief"] || "",
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
    continueFrom: continueFromRaw,
  } = body;
  const continueFrom = String(continueFromRaw ?? "").trim();
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
  const abort = new AbortController();
  try {
    // Only sources the citation engine can verify (a title, at least one author
    // and a year; see cslEngine.verifyAndConvertToCSL) are offered to the model. Missing metadata is never filled in
    // ("Author", "Scholarly Resource", "n.d."): such a source cannot be cited.
    const mappedSources: WebsiteCitationItem[] = (Array.isArray(boundSources) ? boundSources : [])
      .map((s: unknown, idx: number): WebsiteCitationItem | null => {
        const src = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
        const id = (src.id as string) || (src.source_id as string) || (src.sourceId as string) || `src-${idx + 1}`;
        const title = typeof src.title === "string" ? src.title.trim() : "";
        const authors = (
          Array.isArray(src.authors) ? (src.authors as unknown[]) : typeof src.authors === "string" ? [src.authors] : typeof src.author === "string" ? [src.author] : []
        )
          .filter((a): a is string => typeof a === "string")
          .map((a) => a.trim())
          .filter(Boolean);
        const yearRaw = src.year as string | number | undefined;
        const year = yearRaw !== undefined && /\d{4}/.test(String(yearRaw)) ? yearRaw : undefined;
        if (!title || authors.length === 0 || year === undefined) return null;
        const journal = (src.journal as string) || (src.venue as string) || undefined;
        return {
          id,
          title,
          authors,
          year,
          journal,
          venue: journal,
          doi: (src.doi as string) || undefined,
          url: (src.url as string) || undefined,
          citation: (src.citation as string) || undefined,
          mainFinding: (src.mainFinding as string) || (src.suggestedUse as string) || undefined,
          suggestedUse: (src.suggestedUse as string) || undefined,
        };
      })
      .filter((x): x is WebsiteCitationItem => x !== null);

    // Tokens of bound sources that cannot be cited (missing metadata) are
    // removed; the rest become in-text citations in the project's style.
    // Trailing whitespace is kept, so streamed text continues on its own line.
    const citableIds = new Set(mappedSources.map((x) => String(x.id)));
    const uncitableIds = (Array.isArray(boundSources) ? boundSources : [])
      .map((x) => String(((x ?? {}) as Record<string, unknown>).id ?? ""))
      .filter((x) => x && !citableIds.has(x));
    const formatCitations = (text: string): string => {
      let t = text;
      for (const id of uncitableIds) t = t.split(`[${id}]`).join("");
      const tail = /\s*$/.exec(text)?.[0] ?? "";
      return replaceBracketTokensWithDeterministicCitations(t, mappedSources, citationStyle).trimEnd() + tail;
    };

    // Use structured evidence pack if provided (Production Spec §4.1–4.3),
    // otherwise fall back to the basic flat evidence list
    const evidenceBlock = evidencePackPrompt
      ? evidencePackPrompt
      : mappedSources
          .map((s, i) => `[${i + 1}] (Token ID: [${s.id}]) Title: ${s.title} | Author(s): ${(s.authors || []).join(", ")} (${s.year}) | Venue: ${s.journal || "not recorded"} | Rationale: ${s.suggestedUse || s.mainFinding || ""}`)
          .join("\n");

    const revisionInstruction = scholarBrain.courseworkPrompts.streamSectionRevisionInstruction({ revisionPrompt });

    const existingBlock = scholarBrain.courseworkPrompts.streamSectionExistingBlock({ existingContent, revisionPrompt });

    const briefRaw = [
      project.answers["assignment_brief"],
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

    const midpoint = Math.round((budgetRange.min + budgetRange.max) / 2);
    const continuePrompt = (draftSoFar: string) =>
      scholarBrain.courseworkPrompts.streamSectionContinuePrompt({ prompt, draft: draftSoFar, missingWords: Math.max(50, midpoint - countProseWords(draftSoFar)) });
    // Resume continues a stopped draft; otherwise the section is written from the prompt.
    const firstPrompt = continueFrom ? continuePrompt(continueFrom) : prompt;

    // No server-side model (or the user's local model goes first): hand off with
    // a 426 now, while a status can still be sent.
    if (await handOffBeforeStream(req, res, systemPrompt, firstPrompt, "drafting")) return;

    // Open the event stream BEFORE the model call, and keep it alive while the
    // model thinks, so proxies (Render, Vite) never drop a silent socket.
    openSseStream(res);
    heartbeat = setInterval(() => {
      if (!res.writableEnded) res.write(": keep-alive\n\n");
    }, SSE_HEARTBEAT_MS);
    // The student closed the page or pressed Stop: stop the model too.
    res.on("close", () => {
      if (heartbeat) clearInterval(heartbeat);
      if (!res.writableEnded) abort.abort();
    });

    // The model's own tokens go to the browser as they arrive. When the router
    // drops a partial answer to switch model, the browser is told to replace
    // what it shows.
    let shown = "";
    // Text the browser shows in place of what it had: citation tokens already
    // formatted (tokens inside streamed chunks are formatted in the final text).
    const showInstead = (text: string) => {
      shown = text;
      sendEvent(res, { replace: formatCitations(text) });
    };
    if (continueFrom) showInstead(`${continueFrom}\n\n`);
    const relay = (prefix: string) => ({
      signal: abort.signal,
      onToken: (t: string) => {
        shown += t;
        sendEvent(res, { chunk: t });
      },
      onReset: () => showInstead(prefix),
    });
    const draft = (await callOpenRouterText(req, res, systemPrompt, firstPrompt, undefined, "drafting", relay(shown)))?.trim() ?? "";
    if (!draft) throw new UnusableAiResponseError("section draft");
    let effectiveDraft = continueFrom ? `${continueFrom}\n\n${draft}` : draft;

    // Short of its budget (the app's own word count): one continuation, streamed
    // visibly as new paragraphs. A continuation that restates the draft is
    // dropped. A revision keeps the student's request as asked; a draft the
    // browser's model wrote (hand-off) is used as returned.
    const fromBrowser = Boolean((req.body as { llmResult?: unknown })?.llmResult);
    const draftWords = countProseWords(effectiveDraft);
    if (!revisionPrompt && !continueFrom && !fromBrowser && draftWords < budgetRange.min) {
      const prefix = `${effectiveDraft}\n\n`;
      showInstead(prefix);
      try {
        const more = (await callOpenRouterText(req, res, systemPrompt, continuePrompt(effectiveDraft), undefined, "drafting", relay(prefix)))?.trim();
        if (more && !repeatsDraft(more, effectiveDraft)) effectiveDraft = `${effectiveDraft}\n\n${more}`;
      } catch (contErr) {
        if (abort.signal.aborted) throw contErr;
        // Keep the draft we have; the final text below replaces what was shown.
      }
    }

    // Citation tokens become in-text citations in the project's style.
    effectiveDraft = formatCitations(effectiveDraft).trim();

    // Apply Discourse-Level Scholarly Voice Guardrails (cliché suppression, British English, NFC Unicode preservation)
    effectiveDraft = sanitizeScholarlyText(effectiveDraft, { dialect: "en-GB", stripCliches: true });
    effectiveDraft = normalizeUnicodeNFC(effectiveDraft);
    // Paragraphs survive every step: blank lines kept, a single wall regrouped.
    effectiveDraft = ensureParagraphBreaks(effectiveDraft);
    // Trim an overrun last: expanding citation tokens and cleaning the prose change the count.
    effectiveDraft = trimToSentenceWithinWords(effectiveDraft, budgetRange.max);

    // The final text (citations expanded, prose cleaned, trimmed to budget)
    // replaces what was streamed.
    sendEvent(res, { fullText: effectiveDraft });
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    // The student stopped it: nothing to report to a closed page.
    if (abort.signal.aborted) {
      if (!res.writableEnded) res.end();
      return;
    }
    const handedOff = errorText(err) === "RequireFrontendLLMException";
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
    if (!res.writableEnded && !keepsOwnStatus && !revisionPrompt && !continueFrom && !String(existingContent || "").trim()) {
      const scaffold = buildSectionScaffold({
        title: String(sectionTitle || ""),
        prompt: String(sectionGuidance || ""),
        assignmentQuestion: String(assignmentTopic || ""),
        keyPoints: Array.isArray(sectionKeyPoints) ? sectionKeyPoints.map(String) : [],
        sources: Array.isArray(boundSources) ? (boundSources as ScaffoldSource[]) : [],
        targetWords: targetWordCount,
      });
      console.warn("[stream-section] AI unavailable, sending offline scaffold:", err instanceof Error ? errorText(err) : err);
      res.write(`data: ${JSON.stringify({ fallback: { mode: "offline_scaffold", reason: "No AI provider could answer right now." } })}\n\n`);
      res.write(`data: ${JSON.stringify({ fullText: scaffold })}\n\n`);
      res.write("data: [DONE]\n\n");
      res.end();
      return;
    }
    console.error("Stream section error:", err instanceof Error ? errorText(err) : err);
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
