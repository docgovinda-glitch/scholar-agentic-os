import express from "express";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText, getCandidates, buildAuthorizedPolicy, resolveRequestAiConfig } from "../../../src/services/scholarBrain.ts";
import { completeWithFailover } from "../../../../src/platform/gateway/gateway.ts";
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
import { conductAskScholarResearchForOutline } from "../../../../src/desk/assignment/services/scholarlyDiscoveryService.ts";
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
      assignmentType === "reflection"
        ? "Format: Reflective academic analysis. First-person reflective voice is appropriate where recounting personal or professional experience, tightly integrated with third-person analytical frameworks and literature (e.g. Gibbs' Reflective Cycle)."
        : assignmentType === "case_study"
        ? "Format: Strategic case study analysis. Use clear analytical headings, direct evaluation of organizational problems, and evidence-grounded strategic recommendations."
        : assignmentType === "report" || assignmentType === "business_assignment"
        ? "Format: Formal report prose. Use structured numbered subheadings, concise analytical paragraphs, and evidence-based recommendations."
        : assignmentType === "lab_report"
        ? "Format: Scientific laboratory report. Use objective, empirical scientific terminology with precision."
        : assignmentType === "policy_analysis"
        ? "Format: Policy analysis briefing paper. Frame policy options with criteria-based evaluation (feasibility, cost, equity) and concrete recommendations."
        : "Format: Academic essay. Maintain rigorous paragraph structure (Topic sentence → Evidence & Explanation → Critical Analysis → Transition).";

    const briefRaw = [
      project.answers["assignment_brief_text"],
      project.answers["instructions"],
      project.answers["assignment_question"],
      project.answers["research_topic"],
    ].filter(Boolean).join(" ");
    const isShortQA = isTutorialOrShortQABrief(briefRaw, targetWordCount) || targetWordCount <= 200;

    const tutorialOrPeelRules = isShortQA
      ? `CRITICAL TUTORIAL Q&A GUIDELINES:
1. Directly answer the question in concise, conversational, and analytically grounded prose (~100-150 words).
2. Do NOT write generic dissertation introductions, conclusion filler, artificial section summaries, or meta-commentary.
3. STRICT CITATION CONVENTION: You are strictly PROHIBITED from formatting in-text citations yourself (do NOT write "(Author, Year)" or author names with years) and strictly PROHIBITED from outputting a "References" or "Bibliography" section. When citing approved evidence, insert ONLY bracket tokens [1], [2], or token IDs like [${mappedCitationItems[0]?.id || "ev-id"}]. The citation interceptor will compile all citations deterministically.
4. Adhere strictly to any custom section guidance provided by the student above.
5. Provide ONLY the section draft text.`
      : `CRITICAL RULES:
1. ONLY cite from the approved evidence provided above. Do NOT fabricate citations, authors, or statistics.
2. STRICT CITATION CONVENTION: You are strictly PROHIBITED from formatting in-text citations yourself (do NOT write "(Author, Year)", "(Author Year)", or author names with years) and strictly PROHIBITED from outputting any "References", "Bibliography", or "Works Cited" section at the end.
3. When referencing approved evidence, you MUST insert ONLY bracket tokens like [1], [2], or bracket IDs like [${mappedCitationItems[0]?.id || "ev-id"}]. The deterministic Scholar Citation Interceptor will convert all bracket tokens into certified ${citationStyle} in-text citations and append references.
4. Maintain rigorous paragraph structure and academic tone.
5. Adhere strictly to any custom section guidance provided by the student above.
6. Provide ONLY the section draft text.`;

    const prompt = `You are the Scholar Core Grounded Academic Drafting Agent.
Write the draft for section: "${sectionTitle}".

Assignment Type: ${assignmentType}
${genreGuidance}

Section Guidance: ${sectionGuidance}
${userSpecificGuidance ? `\n${userSpecificGuidance}\n` : ""}
Target Word Count: Approximately ${targetWordCount} words
Academic Level: ${academicLevel} (${academicLevel === "postgraduate" ? "Write with advanced theoretical synthesis, nuanced evaluation, and sophisticated academic prose." : "Write with clear, coherent argumentation, conceptual accuracy, and formal academic tone."})
Citation Style: ${citationStyle}
Central Thesis / Stance: "${thesis}"
Key Points to cover: ${keyPoints.join(", ")}

${evidenceContext}

${tutorialOrPeelRules}`;

    const scholarlyDirectives = buildScholarlyVoiceSystemPrompt({
      discipline: "Academic Coursework",
      dialect: "en-GB",
      requireVaultEvidence: true,
    });

    let effectiveDraft = "";
    const aiConfig = resolveRequestAiConfig(req);
    if (aiConfig.candidates.length > 0) {
      try {
        const brainResult = await scholarBrain.complete({
          req,
          systemPrompt: `You are the Scholar Core Grounded Academic Drafting Agent.\n\n${scholarlyDirectives}`,
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
        `You are the Scholar Core Grounded Academic Drafting Agent.\n\n${scholarlyDirectives}`,
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

    if (mappedCitationItems.length === 0 && !effectiveDraft.includes("[Unverified Claim — Vault Citation Required]")) {
      if (/\b(studies show|research indicates|data demonstrates|proven that|empirically established)\b/i.test(effectiveDraft)) {
        effectiveDraft = effectiveDraft.replace(
          /\b(studies show|research indicates|data demonstrates|proven that|empirically established)\b/gi,
          (m) => `${m} [Unverified Claim — Vault Citation Required]`
        );
      }
    }

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
    targetWordCount = 500,
    academicLevel = project.answers["academic_level"] || "undergraduate",
    citationStyle = project.answers["citation_style"] || "apa7",
    assignmentTopic = project.answers["assignment_question"] || "",
    thesis = "",
    boundSources = [],
    revisionPrompt,
    existingContent = "",
    evidencePackPrompt,
  } = req.body || {};

  // The event stream starts only once the AI has answered, so a missing AI
  // can still be reported as a 426 hand-off or an error status (P0-20).
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

    const revisionInstruction = revisionPrompt === "deepen"
      ? "REVISION FOCUS: Deepen analytical critique. Minimize passive descriptive text and amplify dialectical interrogation of theoretical assumptions (target 70% analysis / 30% description)."
      : revisionPrompt === "expand"
      ? "REVISION FOCUS: Expand scholarly elaboration. Introduce detailed comparative nuances while maintaining empirical citation grounding."
      : revisionPrompt === "condense"
      ? "REVISION FOCUS: Condense prose. Tighten argumentation and eliminate redundancies to fit the exact target word count."
      : revisionPrompt === "citations"
      ? "REVISION FOCUS: Reinforce citation grounding. Seamlessly integrate in-text citations from the bound sources to substantiate claims and strengthen academic credibility."
      : revisionPrompt === "smooth"
      ? "REVISION FOCUS: Enhance academic transitions and cohesion. Craft seamless transitional linkages between paragraphs and ensure strong analytical flow."
      : revisionPrompt
      ? `REVISION FOCUS: ${revisionPrompt}`
      : "";

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

    const frameworkGuidelines = isShortQA
      ? `TUTORIAL & CASE STUDY Q&A GUIDELINES:
- Directly answer the question in concise, conversational, and analytically grounded prose (~100-150 words).
- Do NOT generate generic dissertation introductions, conclusion filler, artificial section summaries, or meta-commentary.
- STRICT CITATION CONVENTION: You are strictly PROHIBITED from formatting in-text citations as (Author, Year) or outputting a "References" section. Use ONLY bracket tokens like [1], [2], or token IDs like [${mappedSources[0]?.id || "ev-uuid"}].`
      : `MANDATORY PEEL PARAGRAPH FRAMEWORK:
- Point: Distinct topic sentence advancing the central thesis.
- Evidence: Grounded empirical citations referenced SOLELY via bracket tokens like [1], [2], or token IDs like [${mappedSources[0]?.id || "ev-uuid"}].
- STRICT CITATION CONVENTION: Do NOT format author-year in-text citations or include a "References" section. All citations will be compiled deterministically by the Citation Interceptor according to ${citationStyle}.
- Explanation: 70% critical analysis & evaluation / 30% descriptive exposition.
- Link: Clear concluding transition linking back to the primary assessment prompt.`;

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

    const prompt = `You are the Scholar Core Grounded Academic Drafting Agent.
Write the section prose for: "${sectionTitle}".
Academic Function: ${academicFunction}
Target Word Count: ~${targetWordCount} words
Academic Level: ${academicLevel}
Citation Style: ${citationStyle}
Central Thesis: "${thesis || String(project.answers["assignment_thesis"] || project.answers["thesis_statement"] || "")}"
Assignment Topic: "${assignmentTopic}"

${revisionInstruction}
${existingBlock}
${evidencePackPrompt ? evidenceBlock : `BOUND EVIDENCE (Use these sources for in-text citations; do NOT fabricate external sources):\n${evidenceBlock || "Use standard scholarly reasoning."}`}
${agentBlock}

${frameworkGuidelines}

Output ONLY the section text in clean academic Markdown prose.`;

    const scholarlyDirectives = buildScholarlyVoiceSystemPrompt({
      discipline: "Academic Coursework",
      dialect: "en-GB",
      requireVaultEvidence: true,
    });

    const draft = await callOpenRouterText(
      req,
      res,
      `You are the Scholar Core Grounded Academic Drafting Agent.\n\n${scholarlyDirectives}`,
      prompt,
      undefined,
      "drafting"
    );

    let effectiveDraft = draft?.trim() ?? "";
    if (!effectiveDraft) {
      return sendAiFailure(res, new UnusableAiResponseError("section draft"), "Section draft");
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

    if (mappedSources.length === 0 && !effectiveDraft.includes("[Unverified Claim — Vault Citation Required]")) {
      if (/\b(studies show|research indicates|data demonstrates|proven that|empirically established)\b/i.test(effectiveDraft)) {
        effectiveDraft = effectiveDraft.replace(
          /\b(studies show|research indicates|data demonstrates|proven that|empirically established)\b/gi,
          (m) => `${m} [Unverified Claim — Vault Citation Required]`
        );
      }
    }

    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders?.();

    const words = effectiveDraft.split(" ");
    for (let i = 0; i < words.length; i += 5) {
      const chunk = (i === 0 ? "" : " ") + words.slice(i, i + 5).join(" ");
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ fullText: effectiveDraft })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    if (!res.headersSent) return sendAiFailure(res, err, "Section draft");
    console.error("Stream section error:", err);
    res.write(`data: ${JSON.stringify({ error: "The section draft stopped before it finished. Try again." })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
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
    const prompt = `You are the Scholar Core Senior Academic Reviewer.
Conduct a rigorous submission check on this assignment draft across the 10 university assessment dimensions:

Question: "${question}"
Type: ${assignmentType}
Level: ${academicLevel}
Target Word Count: ${targetWordCount} words
Citation Style: ${citationStyle}

Draft Document:
${fullText}

Evaluate each of the 10 criteria strictly:
1. question_addressed (Does it fully answer the prompt?)
2. argument_logic (Is there a clear, reasoned response?)
3. evidence_sufficiency (Are claims substantiated?)
4. critical_thinking (Does it analyse rather than merely describe?)
5. structure_coherence (Does every section contribute?)
6. rubric_alignment (Satisfies university expectations?)
7. academic_level (Depth appropriate for ${academicLevel}?)
8. word_count (Within required limit?)
9. citation_accuracy (Consistent in ${citationStyle}?)
10. originality (Academic integrity & authentic argumentation?)

Return ONLY valid JSON matching:
{
  "overallScore": 88,
  "readyForSubmission": true,
  "criteriaResults": [
    {
      "category": "question_addressed",
      "label": "Question Addressed",
      "status": "pass",
      "summary": "...",
      "feedback": "..."
    }
  ],
  "strengths": ["...", "..."],
  "priorityFixes": ["..."]
}`;

    const report = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Senior Academic Reviewer.",
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

    let modeInstruction = "";
    if (mode === "socratic") {
      modeInstruction = `
ROLE & SOCRATIC METHOD:
- You are a Classical Socratic Academic Advisor.
- Do NOT simply provide finished answers or write the essay for the student.
- Instead, formulate 2-3 deep, dialectical, thought-provoking questions that challenge underlying premises, identify logical gaps, prompt synthesis across theoretical traditions, or expose unexamined assumptions.
- Provide "socraticQuestions" array where each object has: { id, question, targetConcept, challengeType ("probe_assumptions" | "request_evidence" | "explore_implications" | "counter_perspective" | "clarify_concepts"), rationale }.`;
    } else if (mode === "rubric") {
      modeInstruction = `
ROLE & RUBRIC GRADING ESTIMATOR:
- Evaluate the student's current work against standard University Marking Criteria (First Class 70%+, 2:1 Upper Second 60-69%, 2:2 Lower Second 50-59%, 3rd 40-49%, Fail <40%).
- Provide a rigorous, realistic assessment.
- Populate "rubricEstimation" with:
  {
    "overallScore": number (0-100),
    "overallBand": "1st_class" | "2_1_upper_second" | "2_2_lower_second" | "3rd_class" | "fail",
    "bandLabel": "First Class (1st) — 74%" (or appropriate),
    "summary": "...",
    "criteria": [
      {
        "id": "crit-1",
        "criterion": "Critical Argumentation & Thesis",
        "weightPercent": 30,
        "currentBand": "2_1_upper_second",
        "score": 67,
        "maxScore": 100,
        "critique": "...",
        "howToReachNextBand": "..."
      },
      {
        "id": "crit-2",
        "criterion": "Evidence Grounding & Source Synthesis",
        "weightPercent": 30,
        "currentBand": "1st_class",
        "score": 75,
        "maxScore": 100,
        "critique": "...",
        "howToReachNextBand": "..."
      },
      {
        "id": "crit-3",
        "criterion": "Structure, Academic Style & Clarity",
        "weightPercent": 20,
        "currentBand": "2_1_upper_second",
        "score": 68,
        "maxScore": 100,
        "critique": "...",
        "howToReachNextBand": "..."
      },
      {
        "id": "crit-4",
        "criterion": "Command of Theoretical Frameworks",
        "weightPercent": 20,
        "currentBand": "2_1_upper_second",
        "score": 64,
        "maxScore": 100,
        "critique": "...",
        "howToReachNextBand": "..."
      }
    ],
    "keyStrengths": ["...", "..."],
    "keyRecommendations": ["...", "..."],
    "targetBandRoadmap": {
      "targetBand": "First Class (1st)",
      "actionableSteps": ["...", "..."]
    }
  }`;
    } else if (mode === "counterargument") {
      modeInstruction = `
ROLE & COUNTERARGUMENT GENERATOR:
- Formulate 2-3 rigorous scholarly counterarguments and objections from competing schools of thought or empirical findings.
- Populate "counterArguments" array with:
  [
    {
      "id": "ca-1",
      "opposingViewpoint": "...",
      "theoreticalGrounding": "...",
      "keyScholarsOrSchools": ["...", "..."],
      "suggestedRebuttalStrategy": "..."
    }
  ]`;
    } else {
      modeInstruction = `
ROLE & ACADEMIC POLISH:
- Refine prose for formal academic tone, clarity, and conciseness.
- If applicable, populate "suggestion" with: { "type": "rephrase", "suggestedText": "..." }`;
    }

    const prompt = `You are the Scholar Core Live Academic Tutor & Rubric Estimator.
Student's Query: "${message}"
Active Mode: ${mode}
Current Phase: ${stage}
Academic Level: ${academicLevel} (${academicLevel === "postgraduate" ? "Expect deep theoretical critique, counterarguments, and advanced academic vocabulary" : "Focus on conceptual clarity, rigorous evidence, clear argument, and accurate referencing"})
Assignment Type: ${assignmentType}
Assignment Question: "${question}"
Central Thesis: "${thesis}"
Target Word Count: ${targetWordCount} (Current: ${currentWordCount})

${analysisContext}
${planContext}
${draftContext}

${modeInstruction}

BIDIRECTIONAL WORKSPACE SYNCHRONIZATION:
If the student asks to modify, refine, refocus, or add research questions, search queries, scope boundaries, or assignment parameters
(e.g., "Focus question 2 on EU AI Act compliance", "Add a search query for algorithmic transparency in JSTOR", "Exclude pre-2015 papers"):
You MUST populate the "patch" object in your JSON response alongside your conversational advice:

Return ONLY valid JSON matching:
{
  "reply": "Conversational, constructive academic response explaining the tutor's advice and any updates made...",
  "mode": "${mode}",
  "patch": {
    "plan": {
      "coreQuestions": [
        { "id": "q-1", "question": "...", "rationale": "...", "category": "..." }
      ],
      "searchStrategies": [
        { "id": "strat-1", "database": "...", "searchQuery": "...", "relevanceTarget": "..." }
      ],
      "outOfScopeTopics": ["...", "..."]
    },
    "analysis": {
      "keyConcepts": ["...", "..."]
    },
    "question": "..."
  },
  "socraticQuestions": [ ... ],
  "rubricEstimation": { ... },
  "counterArguments": [ ... ],
  "suggestion": {
    "type": "rephrase" | "replace_text" | "reduce_words" | "add_evidence",
    "suggestedText": "..."
  }
}`;

    let data: any = null;
    try {
      data = await callOpenRouterJSON(
        req,
        res,
        "You are the Scholar Core Pedagogical Academic Tutor.",
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
    const prompt = `You are the Scholar Core PEEL Argument Matrix Agent.
Construct an academically rigorous, dialectical body theme using the Point-Evidence-Explanation-Link structure:

Theme Title: "${themeTitle}"
Central Thesis Defended: "${thesis}"
Target Word Count: ${targetWords} words
Academic Level: ${academicLevel} (${academicLevel === "postgraduate" ? "Write with advanced theoretical synthesis, nuanced critique, and seamless scholarly integration." : "Ensure clear logical claims, substantiated evidence, critical evaluation, and clear prose."})
Citation Style: ${citationStyle}
Key Points to Cover: ${JSON.stringify(keyPoints)}

STRUCTURE TO GENERATE:
1. P (Point): A precise, declarative topic sentence that directly advances and defends the central thesis.
2. E (Evidence): Academic grounding, empirical research, or theoretical models (cite realistic peer-reviewed literature in ${citationStyle}).
3. E (Explanation & Dialectical Critique):
   - Critical mechanism: Explain why and how this evidence proves the point.
   - Counterargument: What would a critical scholar, competing school, or opposing framework object?
   - Rebuttal: How does the argument answer or assimilate that counterargument without weakening the thesis?
4. L (Link): A synthesising sentence that connects the analysis back to the overall thesis and creates a transition.
5. Draft Content: The complete, publication-ready academic paragraph (~${targetWords} words) combining these elements with flawless academic prose.

Return ONLY valid JSON matching:
{
  "themeTitle": "${themeTitle}",
  "targetWords": ${targetWords},
  "currentWords": 0,
  "point": "Clear topic sentence claim...",
  "evidence": "Empirical study / theoretical grounding in ${citationStyle}...",
  "explanation": "Critical mechanism analysis...",
  "counterargument": "Opposing viewpoint or limitation...",
  "rebuttal": "Substantiated defense answering the objection...",
  "link": "Synthesising sentence connecting to thesis...",
  "draftContent": "Full polished academic prose for this section...",
  "status": "complete",
  "linkedSourceIds": []
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core PEEL Argument Matrix Agent.",
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
