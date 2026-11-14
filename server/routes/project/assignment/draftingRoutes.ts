import express from "express";
import { buildSectionScaffold, type ScaffoldSource } from "../../../src/utils/sectionScaffold.ts";
import { BrowserAiRequiredError, InvalidLlmChallengeError, LocalModelUnreachableError, NoClientAiProviderError } from "../../../src/ai/aiRouteErrors.ts";
import { buildSectionContract } from "../../../src/utils/sectionContract.ts";
import { sectionWordRange, trimToSentenceWithinWords } from "../../../src/utils/sectionBudget.ts";
import { countExactWords } from "../../../src/utils/wordBudgetAllocator.ts";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText, handOffBeforeStream } from "../../../src/services/scholarBrain.ts";
import { requestKeyring } from "../../../src/ai/routerBridge.ts";
import { ensureParagraphBreaks } from "../../../../src/shared/proseParagraphs.ts";
import { chunkPreservingWhitespace, openSseStream, paragraphRange, SSE_HEARTBEAT_MS, streamErrorMessage } from "../../../src/utils/sectionStream.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import { sendAiFailure, UnusableAiResponseError } from "../../../src/ai/aiRouteErrors.ts";
import {
  auditDocumentLineByLine,
  runBriefScannerGraph,
  COMMAND_VERB_MAP,
  type DocumentRequirement,
} from "../../../services/briefScannerGraph.ts";
import type {
  AssignmentAnalysis,
  CommandVerbDetail,
  CoreResearchQuestion,
  RecommendedSearchStrategy,
  ResearchPlan,
  TutorWorkspacePatch,
  DiscoveredSource,
} from "../../../../src/desk/assignment/types.ts";
import {
  cleanAnswerString,
  extractStandardizedInstructions,
  normalizeProjectAnswers,
  getSectionPromptGuidelines,
  structureToInternalSections,
} from "../../../../src/desk/assignment/types.ts";
import {
  generateDynamicAssignmentStructure,
  generateAiEnhancedOutline,
  sanitizeOutlineHeadings,
  assignmentStructureToOutlineTree,
  outlineTreeToAssignmentStructure,
} from "../../../../src/desk/assignment/services/outlineService.ts";
import { sanitizeBrief } from "../../../../src/features/understand/services/briefSanitizer.ts";
import { classifyScopeBoundaries, stripLineTags } from "../../../../src/features/understand/services/scopeClassifier.ts";
import {
  isClassroomLogisticsLine,
  isTutorialOrShortQABrief,
  extractSubstantiveBriefQuestions,
  stripSlideArtifacts,
} from "../../../../src/utils/briefExtractor.ts";
import { discoverMultiPortalSources, type DiscoveredSourceDraft } from "../../../src/discovery/discovery.ts";
import {
  replaceBracketTokensWithDeterministicCitations,
  compileDeterministicBibliographyMarkdown,
  formatAskScholarInText,
  formatAskScholarBibliographyEntry,
  type WebsiteCitationItem,
} from "../../../../src/desk/scholarCitationEngine.ts";
import {
  upload,
  getProjectSafe,
  persistSourcesToSupabase,
  isCorruptedOutlineHeadings,
  healCorruptedProjectStructure,
  safeParseObject,
  extractProjectInstructions,
  deriveHeuristicTitle,
  deriveSemanticAcademicTitle,
  autoUpdateProjectTitleIfUntitled,
  buildDeterministicResearchPlan,
} from "./helpers.ts";

const router = express.Router({ mergeParams: true });

// 6. POST /api/projects/:id/assignment/draft-section
router.post("/draft-section", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    sectionTitle,
    sectionGuidance,
    targetWordCount = 300,
    academicLevel = "undergraduate",
    citationStyle = "apa7",
    thesis = "",
    approvedEvidence = [],
    keyPoints = [],
    assignmentType = project.answers["assignment_type"] || "essay",
    sections: reqSections,
  } = req.body || {};

  const rawSections = reqSections || project.answers["sections"];
  const parsedSections = safeParseObject(rawSections);

  let userSpecificGuidance = "";
  if (parsedSections) {
    const isIntro = /intro/i.test(sectionTitle || "");
    const isConclusion = /(concl|summary|final)/i.test(sectionTitle || "");
    const sectionKey: "intro" | "body" | "conclusion" = isIntro
      ? "intro"
      : isConclusion
      ? "conclusion"
      : "body";
    userSpecificGuidance = getSectionPromptGuidelines(sectionKey, { sections: parsedSections });
  }

  try {
    const mappedCitationItems: WebsiteCitationItem[] = (
      Array.isArray(approvedEvidence) ? approvedEvidence : []
    ).map((e: unknown, idx: number) => {
      const ev = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      const id = (ev.id as string) || (ev.source_id as string) || (ev.sourceId as string) || `src-${idx + 1}`;
      const title = (ev.title as string) || (ev.claim as string) || "Scholarly Resource";
      const authors = Array.isArray(ev.authors)
        ? (ev.authors as string[])
        : typeof ev.authors === "string"
        ? [ev.authors]
        : typeof ev.author === "string"
        ? [ev.author]
        : ["Author"];
      const year = (ev.year as string | number) || "n.d.";
      const journal = (ev.journal as string) || (ev.venue as string) || undefined;
      const doi = (ev.doi as string) || undefined;
      const url = (ev.url as string) || undefined;
      const citation = (ev.citation as string) || undefined;
      const claim = (ev.claim as string) || undefined;
      const evidenceSnippet = (ev.evidenceSnippet as string) || (ev.mainFinding as string) || undefined;

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
        claim,
        evidenceSnippet,
        mainFinding: evidenceSnippet,
      };
    });

    const evidenceContext = mappedCitationItems.length > 0
      ? `APPROVED EVIDENCE TO USE (DO NOT FABRICATE OTHER SOURCES):\n` +
        mappedCitationItems
          .map((e, i) => `[${i + 1}] (Token ID: [${e.id}]) Claim: ${e.claim || e.title} | Evidence: ${e.evidenceSnippet || e.title} | Citation: ${e.citation || e.title}`)
          .join("\n")
      : "No external evidence provided. Write conceptually and indicate where citations are needed.";

    const genreGuidance =
      scholarBrain.courseworkPrompts.draftSectionGenreGuidance({ assignmentType });

    const briefRaw = [
      project.answers["assignment_brief_text"],
      project.answers["instructions"],
      project.answers["assignment_question"],
      project.answers["research_topic"],
    ].filter(Boolean).join(" ");
    const isShortQA = isTutorialOrShortQABrief(briefRaw, targetWordCount) || targetWordCount <= 200;

    const tutorialOrPeelRules = scholarBrain.courseworkPrompts.draftSectionRules({ isShortQA, mappedCitationItems, citationStyle });

    const prompt = scholarBrain.courseworkPrompts.draftSectionPrompt({ sectionTitle, assignmentType, genreGuidance, sectionGuidance, userSpecificGuidance, targetWordCount, academicLevel, citationStyle, thesis, keyPoints, evidenceContext, tutorialOrPeelRules });

    const scholarlyDirectives = buildScholarlyVoiceSystemPrompt({
      discipline: "Academic Coursework",
      dialect: "en-GB",
      requireVaultEvidence: true,
    });

    let effectiveDraft = "";
    if ((await requestKeyring(req as never)).length > 0) {
      try {
        const brainResult = await scholarBrain.complete({
          req,
          systemPrompt: scholarBrain.courseworkPrompts.streamSectionSystemPrompt({ scholarlyDirectives }),
          userPrompt: prompt,
          taskClass: "drafting",
          dialect: "en-GB",
          stripCliches: true,
        });
        if (brainResult.text) {
          effectiveDraft = brainResult.text;
        }
      } catch (brainErr: any) {
        if (brainErr?.message === "RequireFrontendLLMException") throw brainErr;
        console.warn("scholarBrain.complete error in draft-section, falling back to callOpenRouterText:", brainErr?.message);
      }
    }

    if (!effectiveDraft) {
      const draft = await callOpenRouterText(
        req,
        res,
        scholarBrain.courseworkPrompts.streamSectionSystemPrompt({ scholarlyDirectives }),
        prompt,
        undefined,
        "drafting"
      );
      effectiveDraft = draft?.trim() ? draft.trim() : "";
    }

    // No template text: if the AI produced nothing, say so (P0-20).
    if (!effectiveDraft) {
      return sendAiFailure(res, new UnusableAiResponseError("section draft"), "Section draft");
    }

    // Deterministic Token Interceptor: strictly strips hallucinated references and compiles citations in project style
    effectiveDraft = replaceBracketTokensWithDeterministicCitations(
      effectiveDraft,
      mappedCitationItems,
      citationStyle
    );

    // Apply Discourse-Level Scholarly Voice Guardrails (cliché suppression, British English, NFC Unicode preservation)
    effectiveDraft = sanitizeScholarlyText(effectiveDraft, { dialect: "en-GB", stripCliches: true });
    effectiveDraft = normalizeUnicodeNFC(effectiveDraft);

    res.json({ draft: effectiveDraft });
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    sendAiFailure(res, err, "Section draft");
  }
});

// 6b. POST /api/projects/:id/assignment/stream-section
router.post("/stream-section", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    sectionId,
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
  } = req.body || {};
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

    // Enforce the budget: ask once for a rewrite when far under, trim to a whole sentence when over.
    if (!revisionPrompt && countExactWords(effectiveDraft) < budgetRange.min) {
      try {
        const longer = await callOpenRouterText(
          req,
          res,
          systemPrompt,
          `${prompt}\n\nYOUR PREVIOUS ATTEMPT WAS ${countExactWords(effectiveDraft)} WORDS, BELOW THE BUDGET. Rewrite it fully at ${targetWordCount} words (${budgetRange.min}-${budgetRange.max}) in ${paragraphRange(targetWordCount)} paragraphs separated by blank lines, keeping every citation token.\nPREVIOUS ATTEMPT:\n${effectiveDraft}`,
          undefined,
          "drafting"
        );
        if (longer && countExactWords(longer) > countExactWords(effectiveDraft)) effectiveDraft = longer.trim();
      } catch {
        // Keep the first draft rather than fail the whole section.
      }
    }
    effectiveDraft = trimToSentenceWithinWords(effectiveDraft, budgetRange.max);

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

// 7. POST /api/projects/:id/assignment/review
router.post("/review", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    assignmentType = project.answers["assignment_type"] || "essay",
    targetWordCount = project.answers["word_count"] || 2000,
    citationStyle = project.answers["citation_style"] || "apa7",
    outline = project.answers["assignment_outline"] || [],
  } = req.body || {};

  const fullText = (outline as any[])
    .map((sec) => `## ${sec.title}\n\n${sec.draftContent || "(No draft yet)"}`)
    .join("\n\n");

  try {
    const prompt = scholarBrain.courseworkPrompts.reviewPrompt({ question, assignmentType, academicLevel, targetWordCount, citationStyle, fullText });

    const report = await callOpenRouterJSON(
      req,
      res,
      scholarBrain.courseworkPrompts.ROLES.reviewer,
      prompt,
      undefined,
      "verification"
    );
    if (!report) return;
    res.json(report);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Assignment review error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to generate review report" });
    }
  }
});

function extractDeterministicTutorPatch(
  userMessage: string,
  existingPlan: any,
  existingAnalysis: any
): TutorWorkspacePatch | null {
  const msg = userMessage.toLowerCase();
  let patch: TutorWorkspacePatch | null = null;

  // 1. Focus or modify a question: e.g. "Focus question 2 on EU AI Act compliance" or "change question 1 to..."
  const questionFocusMatch = msg.match(/(?:focus|change|update|modify|refine)\s+(?:question|q)\s*(\d+)\s+(?:on|to)\s+(.+)/i);
  if (questionFocusMatch) {
    const qIndex = parseInt(questionFocusMatch[1], 10) - 1;
    const focusTopic = questionFocusMatch[2].trim().replace(/[.!?]+$/, "");
    const currentQuestions = Array.isArray(existingPlan?.coreQuestions)
      ? [...existingPlan.coreQuestions]
      : [];
    if (currentQuestions.length > 0 && qIndex >= 0 && qIndex < currentQuestions.length) {
      const target = currentQuestions[qIndex];
      const targetText = typeof target === "string" ? target : target.question;
      const updatedQuestionText = `How do ${focusTopic} frameworks critically govern and substantiate ${targetText.slice(0, 80)}?`;
      if (typeof target === "string") {
        currentQuestions[qIndex] = updatedQuestionText;
      } else {
        currentQuestions[qIndex] = {
          ...target,
          question: updatedQuestionText,
          rationale: `Refocused specifically on ${focusTopic} per student guidance and First-Class grading criteria.`,
        };
      }
      patch = patch || {};
      patch.plan = patch.plan || {};
      patch.plan.coreQuestions = currentQuestions;
    }
  }

  // 2. Add custom research question: e.g. "Add a research question about..."
  const addQuestionMatch = msg.match(/(?:add|include)\s+(?:a\s+)?(?:new\s+)?(?:research\s+)?question\s+(?:about|on|regarding)\s+(.+)/i);
  if (addQuestionMatch) {
    const newTopic = addQuestionMatch[1].trim().replace(/[.!?]+$/, "");
    const currentQuestions = Array.isArray(existingPlan?.coreQuestions)
      ? [...existingPlan.coreQuestions]
      : [];
    currentQuestions.push({
      id: `q-${currentQuestions.length + 1}`,
      question: `What empirical mechanisms and critical implications arise from ${newTopic}?`,
      category: "Targeted Inquiry",
      rationale: `Direct student inquiry exploring ${newTopic}.`,
    });
    patch = patch || {};
    patch.plan = patch.plan || {};
    patch.plan.coreQuestions = currentQuestions;
  }

  // 3. Add custom search strategy: e.g. "Add a search strategy for..."
  const addStrategyMatch = msg.match(/(?:add|include)\s+(?:a\s+)?(?:new\s+)?(?:search\s+)?(?:strategy|query)\s+(?:for|on|about)\s+(.+)/i);
  if (addStrategyMatch) {
    const strategyTopic = addStrategyMatch[1].trim().replace(/[.!?]+$/, "");
    const currentStrategies = Array.isArray(existingPlan?.searchStrategies)
      ? [...existingPlan.searchStrategies]
      : [];
    currentStrategies.push({
      id: `strat-${currentStrategies.length + 1}`,
      database: "Google Scholar / CrossRef",
      searchQuery: `"${strategyTopic}" AND ("empirical analysis" OR "critical review")`,
      relevanceTarget: `Targeted scholarly literature addressing ${strategyTopic}.`,
    });
    patch = patch || {};
    patch.plan = patch.plan || {};
    patch.plan.searchStrategies = currentStrategies;
  }

  // 4. Update or narrow scope: e.g. "Exclude pre-2015 papers"
  const excludeMatch = msg.match(/(?:exclude|do not include|omit)\s+(.+)/i);
  if (excludeMatch) {
    const excludedTopic = excludeMatch[1].trim().replace(/[.!?]+$/, "");
    const currentOutOfScope = Array.isArray(existingPlan?.outOfScopeTopics)
      ? [...existingPlan.outOfScopeTopics]
      : [];
    if (!currentOutOfScope.includes(excludedTopic)) {
      currentOutOfScope.push(excludedTopic);
      patch = patch || {};
      patch.plan = patch.plan || {};
      patch.plan.outOfScopeTopics = currentOutOfScope;
    }
  }

  return patch;
}

// 8. POST /api/projects/:id/assignment/tutor-chat
router.post("/tutor-chat", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    message,
    mode = "socratic",
    stage = "draft",
    academicLevel = "undergraduate",
    assignmentType = "essay",
    question = "",
    targetWordCount = 2000,
    currentWordCount = 0,
    outline = [],
    evidence = [],
    thesis = "",
    activeDraftText = "",
    analysis = project.answers["assignment_analysis"],
    plan = project.answers["assignment_plan"] || project.answers["assignment_research_plan"],
  } = req.body || {};

  let parsedPlan: any = null;
  try {
    parsedPlan = typeof plan === "string" ? JSON.parse(plan) : plan;
  } catch {
    parsedPlan = null;
  }

  let parsedAnalysis: any = null;
  try {
    parsedAnalysis = typeof analysis === "string" ? JSON.parse(analysis) : analysis;
  } catch {
    parsedAnalysis = null;
  }

  const analysisContext = parsedAnalysis
    ? `ASSIGNMENT ANALYSIS CONTEXT:\n${JSON.stringify(parsedAnalysis, null, 2)}\n`
    : "";
  const planContext = parsedPlan
    ? `CURRENT RESEARCH PLAN CONTEXT:\n${JSON.stringify(parsedPlan, null, 2)}\n`
    : "";

  try {
    const draftContext = activeDraftText
      ? `ACTIVE DRAFT EXCERPT:\n"""${activeDraftText.slice(0, 3000)}"""\n`
      : outline.length > 0
      ? `OUTLINE & DRAFTS OVERVIEW:\n` +
        (outline as any[])
          .map((s) => `[${s.title} (${s.currentWordCount || 0}w)] ${s.draftContent?.slice(0, 300) || "(No draft yet)"}`)
          .join("\n")
      : "";

    const modeInstruction = scholarBrain.courseworkPrompts.tutorModeInstruction({ mode });

    const prompt = scholarBrain.courseworkPrompts.tutorChatPrompt({ message, mode, stage, academicLevel, assignmentType, question, thesis, targetWordCount, currentWordCount, analysisContext, planContext, draftContext, modeInstruction });

    let data: any = null;
    try {
      data = await callOpenRouterJSON(
        req,
        res,
        scholarBrain.courseworkPrompts.ROLES.tutor,
        prompt,
        undefined,
        "chat"
      );
    } catch (e: any) {
      if (e?.message !== "RequireFrontendLLMException") {
        console.warn("LLM tutor chat unavailable, using deterministic Socratic fallback:", e?.message);
      }
    }

    if (!data) {
      const deterministicPatch = extractDeterministicTutorPatch(message, parsedPlan, parsedAnalysis);
      data = {
        reply: deterministicPatch
          ? `I have updated your research workspace accordingly. Focus your inquiry on these refined parameters to ensure strong alignment with First-Class marking criteria.`
          : `That is a critical inquiry for your assignment. When approaching "${question.slice(0, 80)}", consider how the empirical evidence addresses the theoretical tensions in your thesis.`,
        mode,
        patch: deterministicPatch || undefined,
        socraticQuestions: [
          {
            id: `sq-${Date.now()}`,
            question: `How does your current framing account for competing empirical counterevidence regarding ${parsedAnalysis?.keyConcepts?.[0] || "this topic"}?`,
            targetConcept: parsedAnalysis?.keyConcepts?.[0] || "Core Thesis",
            challengeType: "probe_assumptions",
            rationale: "Ensures dialectical balance and prevents confirmation bias.",
          },
        ],
      };
    } else if (!data.patch) {
      const deterministicPatch = extractDeterministicTutorPatch(message, parsedPlan, parsedAnalysis);
      if (deterministicPatch) {
        data.patch = deterministicPatch;
      }
    }

    // Persist any patch delta directly into project.answers
    if (data.patch) {
      if (data.patch.plan) {
        const existingPlan = parsedPlan || {};
        const mergedPlan = { ...existingPlan, ...data.patch.plan };
        project.answers["assignment_plan"] = JSON.stringify(mergedPlan);
        project.answers["assignment_research_plan"] = JSON.stringify(mergedPlan);
      }
      if (data.patch.analysis) {
        const existingAnalysis = parsedAnalysis || {};
        const mergedAnalysis = { ...existingAnalysis, ...data.patch.analysis };
        project.answers["assignment_analysis"] = JSON.stringify(mergedAnalysis);
      }
      if (data.patch.question) {
        project.answers["assignment_question"] = String(data.patch.question);
      }
      await getProjectStore().save(project);
    }

    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Tutor chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to process tutor query" });
    }
  }
});


// 11. POST /api/projects/:id/assignment/peel-matrix
router.post("/peel-matrix", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    themeTitle = "Critical Analysis of Theoretical Foundations",
    thesis = project.answers["assignment_thesis"] || "",
    targetWords = 500,
    academicLevel = project.answers["academic_level"] || "undergraduate",
    citationStyle = project.answers["citation_style"] || "apa7",
    keyPoints = [],
  } = req.body || {};

  try {
    const prompt = scholarBrain.courseworkPrompts.peelMatrixPrompt({ themeTitle, thesis, targetWords, academicLevel, citationStyle, keyPoints });

    const data = await callOpenRouterJSON(
      req,
      res,
      scholarBrain.courseworkPrompts.ROLES.peelMatrix,
      prompt,
      undefined,
      "drafting"
    );
    if (!data) return;
    if (data && data.draftContent) {
      data.currentWords = data.draftContent.trim().split(/\s+/).filter(Boolean).length;
    }
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("PEEL matrix generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to generate PEEL matrix" });
    }
  }
});


export default router;
