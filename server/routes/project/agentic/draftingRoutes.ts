import express from "express";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { callOpenRouterText, routedCompletion, scholarBrain } from "../../../src/services/scholarBrain.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  evaluateBurstiness,
  type ScholarlyDialect,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import {
  allocateWordBudget,
  countExactWords,
  type ManuscriptTemplate,
} from "../../../src/utils/wordBudgetAllocator.ts";
import {
  formatCitationLedger,
  scrubCitations,
  type VerifiedSourceItem,
} from "../../../src/utils/citationLockScrubber.ts";
import { chunkAndRerankEvidence } from "../../../src/services/semanticRagEngine.ts";
import { getProjectSafe } from "./helpers.ts";
import { sendAiFailure, UnusableAiResponseError } from "../../../src/ai/aiRouteErrors.ts";
import { draftSubSectionBodySchema } from "./journalStudioSchemas.ts";
import { withCitationTokensMasked } from "../../../src/utils/citationLock.ts";
import { draftingSources, studioEvidence } from "../../../../src/domain/journal/studioEvidence.ts";

export const draftingRoutes = express.Router({ mergeParams: true });

// POST /api/projects/:id/agentic/allocate-budget
draftingRoutes.post("/allocate-budget", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const targetTotalWords =
    typeof req.body?.targetTotalWords === "number" && req.body.targetTotalWords > 0
      ? req.body.targetTotalWords
      : 6000;

  const rawTemplate = req.body?.template;
  const template: ManuscriptTemplate =
    rawTemplate === "Theoretical" || rawTemplate === "SystematicReview"
      ? rawTemplate
      : "IMRaD";

  const blueprint = allocateWordBudget(project.projectId, targetTotalWords, template);

  // Persist wordBudgetBlueprint inside project state
  project.answers = {
    ...project.answers,
    word_budget_blueprint: JSON.stringify(blueprint),
    target_word_count: String(targetTotalWords),
    manuscript_template: template,
  };
  await getProjectStore().save(project);

  res.json({
    ok: true,
    blueprint,
  });
});

// POST /api/projects/:id/agentic/draft-subsection
// Drafts one Writing Studio section. Returns the text for the studio to place;
// the studio owns the manuscript text, so nothing is saved here.
draftingRoutes.post("/draft-subsection", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const parsedBody = draftSubSectionBodySchema.safeParse(req.body ?? {});
  if (!parsedBody.success) {
    return res.status(400).json({ error: parsedBody.error.issues[0]?.message || "Invalid draft request." });
  }
  const body = parsedBody.data;
  const subSectionTitle = body.subSectionTitle;
  const targetWords = body.targetWords ?? 400;
  const targetDialect: ScholarlyDialect = body.dialect === "en-US" ? "en-US" : "en-GB";

  // 1. The sources the draft may cite: exactly the ones the studio sent, or,
  // when none were sent, every source the project can cite (the same list the
  // studio shows: approved literature and the author's own data).
  const assignedSources: VerifiedSourceItem[] = body.assignedSources
    ? body.assignedSources
    : draftingSources(studioEvidence((project.answers ?? {}) as Record<string, unknown>));

  // 2. Format Citation Ledger & Rerank Evidence with Semantic BM25
  const { ledgerPrompt, sourceMap } = formatCitationLedger(assignedSources);
  const ragResult = chunkAndRerankEvidence(subSectionTitle, assignedSources, 2500);

  // 3. Prompts (owned by scholarBrain.journalPrompts)
  const prompts = scholarBrain.journalPrompts;
  const systemPrompt = prompts.sectionDraftSystemPrompt({
    voicePrompt: buildScholarlyVoiceSystemPrompt({ dialect: targetDialect }),
    ledgerPrompt,
    evidenceContext: ragResult.formattedContext,
    sectionTitle: subSectionTitle,
    targetWords,
  });
  const userPrompt = prompts.sectionDraftUserPrompt({
    sectionTitle: subSectionTitle,
    workingTitle: String(project.answers?.["working_title"] || project.answers?.["title"] || "Scholarly Manuscript"),
    coreProblem: String(project.answers?.["core_problem"] || ""),
    sectionBrief: body.sectionBrief,
    authorGuidance: body.authorGuidance,
    writtenSections: body.writtenSections,
    targetWords,
  });

  const wantsStream = req.headers.accept?.includes("text/event-stream") || req.query.stream === "true";
  if (wantsStream) {
    await scholarBrain.stream(req, { systemPrompt, userPrompt, taskClass: "drafting", dialect: targetDialect }, res);
    return;
  }

  // Pass 1 needs a real AI draft. Without one, nothing is written: no template
  // prose (which would put invented findings next to the user's real sources).
  let draftText = "";
  try {
    draftText = await routedCompletion(req, { task: "drafting", systemPrompt, userPrompt });
    if (!draftText.trim()) throw new UnusableAiResponseError("section draft");
  } catch (e) {
    return sendAiFailure(res, e, "Section draft");
  }

  // 4. Pass 2: if the draft is more than 8% short, ask the AI to expand it.
  // If that fails, the shorter real draft is kept; it is never padded with filler.
  const wordCountPass1 = countExactWords(draftText);
  if (wordCountPass1 < targetWords * 0.92) {
    try {
      const expanded = await routedCompletion(req, {
        task: "drafting",
        systemPrompt,
        userPrompt: prompts.sectionExpansionPrompt({
          sectionTitle: subSectionTitle,
          draft: draftText,
          draftWords: wordCountPass1,
          targetWords,
          citationIds: assignedSources.map((s) => s.id),
        }),
      });
      if (countExactWords(expanded) > wordCountPass1) draftText = expanded;
    } catch (e) {
      console.warn("Pass 2 AI expansion failed; keeping the shorter draft", e instanceof Error ? e.message : e);
    }
  }

  // 5. Post-generation scrubber & voice guard: citations outside the ledger are removed.
  // Verified citations stay as [CITE:id] tokens: the studio shows them as chips and formats them in the project's style.
  const scrubResult = scrubCitations(draftText, sourceMap, { dialect: targetDialect, keepTokens: true });
  const sanitized = withCitationTokensMasked(scrubResult.scrubbedText, (t) =>
    sanitizeScholarlyText(t, { dialect: targetDialect, stripCliches: true })
  );
  const burstinessMetrics = evaluateBurstiness(sanitized);
  const actualWords = countExactWords(sanitized);
  const deviationPercentage = Math.round(((actualWords - targetWords) / targetWords) * 100 * 10) / 10;

  res.json({
    ok: true,
    sectionId: body.sectionId,
    subSectionId: body.subSectionId,
    title: subSectionTitle,
    content: sanitized,
    actualWords,
    targetWords,
    deviationPercentage,
    burstinessMetrics,
    warnings: scrubResult.chronologicalWarnings,
    unverifiedClaimsCount: scrubResult.unverifiedClaimsCount,
    resolvedCitationsCount: scrubResult.resolvedCitationsCount,
    strippedCitations: scrubResult.strippedCitations,
    citedSources: scrubResult.citedSources,
  });
});

// POST /api/projects/:id/agentic/copilot-chat
draftingRoutes.post("/copilot-chat", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const { stage, message, history = [] } = req.body || {};
  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }

  // 1. Stage-Scoped Context Engine
  let scopedContext: Record<string, unknown> = {};

  if (stage === "definition" || stage === "literature" || stage === "gap_identification" || stage === "gap_selection" || stage === "title_selection" || stage === "title_lock") {
    // Early stages: only need answers
    scopedContext = {
      core_problem: project.answers["core_problem"],
      literature_review: project.answers["literature_review"],
      gap_identified: project.answers["gap_identified"],
      gap_selected: project.answers["gap_selected"],
      working_title: project.answers["working_title"] || project.answers["title"]
    };
  } else if (stage === "vault_sources" || stage === "source_approval_vault" || stage === "evidence_extraction" || stage === "external_research" || stage === "evidence_analysis" || stage === "manual_review") {
    // Evidence stages: include claim graph, but omit massive document
    scopedContext = {
      working_title: project.answers["working_title"] || project.answers["title"],
      claim_graph: project.claimGraph,
      evidence_ledger: project.evidenceLedger
    };
  } else {
    // Late stages (Drafting, Editing, Publishing): include document structure/abstract, but omit full heavy manuscript body to save tokens
    scopedContext = {
      working_title: project.answers["working_title"] || project.answers["title"],
      document_structure: project.document ? "Blocks count: " + project.document.blocks.length : "None yet",
      rubric_report: project.rubricReport ? { readyForG6: project.rubricReport.readyForG6, summary: "Truncated for context" } : null
    };
  }

  try {
    const systemPrompt = `You are a helpful AI Copilot integrated into a research workspace. 
The user is currently on the stage: "${stage}".
Here is the context of their project for this stage:
${JSON.stringify(scopedContext)}

Answer the user's question concisely. Be highly academic and professional. Use markdown formatting.`;

    // Construct the user prompt including history
    let userPrompt = "";
    if (history.length > 0) {
      userPrompt += "Conversation History:\n";
      for (const msg of history) {
        userPrompt += `${msg.role === "user" ? "User" : "Copilot"}: ${msg.content}\n`;
      }
      userPrompt += "\nNew Message from User:\n";
    }
    userPrompt += message;

    const result = await callOpenRouterText(req, res, systemPrompt, userPrompt);
    if (!result) return;
    res.json({ ok: true, response: result });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    if (message === "RequireFrontendLLMException") return;
    if (!res.headersSent) {
      res.status(500).json({ error: message });
    }
  }
});
