import express from "express";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { callOpenRouterText, scholarBrain } from "../../../src/services/scholarBrain.ts";
import type { ScholarlyDialect } from "../../../src/utils/scholarlyVoiceGuard.ts";
import { allocateWordBudget, type ManuscriptTemplate } from "../../../src/utils/wordBudgetAllocator.ts";
import type { VerifiedSourceItem } from "../../../src/utils/citationLockScrubber.ts";
import { getProjectSafe } from "./helpers.ts";
import { sendAiFailure } from "../../../src/ai/aiRouteErrors.ts";
import { requestCompleter } from "../../../src/ai/browserHandoff.ts";
import { draftSubSectionBodySchema } from "./journalStudioSchemas.ts";
import { draftingSources, studioEvidence } from "../../../../src/domain/journal/studioEvidence.ts";

export const draftingRoutes = express.Router({ mergeParams: true });

/** The largest manuscript target the budget allocator is asked for. */
const MAX_TARGET_TOTAL_WORDS = 100_000;

// POST /api/projects/:id/agentic/allocate-budget
draftingRoutes.post("/allocate-budget", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  // A positive, finite target, capped so a typo cannot ask for a million-word budget.
  const requestedWords = req.body?.targetTotalWords;
  const targetTotalWords =
    typeof requestedWords === "number" && Number.isFinite(requestedWords) && requestedWords > 0
      ? Math.min(MAX_TARGET_TOTAL_WORDS, Math.round(requestedWords))
      : 6000;

  const rawTemplate = req.body?.template;
  const template: ManuscriptTemplate =
    rawTemplate === "Theoretical" || rawTemplate === "SystematicReview"
      ? rawTemplate
      : "IMRaD";

  const blueprint = allocateWordBudget(project.projectId, targetTotalWords, template);

  // Only these three keys are written, merged into the stored record: saving the
  // whole project would overwrite manuscript text the studio saved in the meantime.
  await getProjectStore().patchAnswers(project.projectId, {
    word_budget_blueprint: JSON.stringify(blueprint),
    target_word_count: String(targetTotalWords),
    manuscript_template: template,
  });

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

  // What the article is about (bounded; never the whole answer set), and the target journal.
  const answers = (project.answers ?? {}) as Record<string, unknown>;
  const researchContext = scholarBrain.researchContextFromAnswers(answers);
  const journalName = String(answers["target_journal"] || answers["selected_journal_name"] || "").trim();
  const journal = journalName ? { name: journalName, citationStyle: String(answers["citation_style"] || "") || undefined } : undefined;

  // 2. The one section drafter (also used by the desk's generation job).
  let result: Awaited<ReturnType<typeof scholarBrain.draftSection>>;
  try {
    result = await scholarBrain.draftSection(requestCompleter(req), {
      title: subSectionTitle,
      targetWords,
      dialect: targetDialect,
      researchContext,
      journal,
      sectionBrief: body.sectionBrief,
      authorGuidance: body.authorGuidance,
      writtenSections: body.writtenSections,
      sources: assignedSources,
    });
  } catch (e) {
    return sendAiFailure(res, e, "Section draft");
  }

  res.json({
    ok: true,
    sectionId: body.sectionId,
    subSectionId: body.subSectionId,
    title: subSectionTitle,
    content: result.text,
    actualWords: result.wordCount,
    targetWords,
    deviationPercentage: Math.round(((result.wordCount - targetWords) / targetWords) * 1000) / 10,
    burstinessMetrics: result.burstinessMetrics,
    warnings: result.chronologicalWarnings,
    unverifiedClaimsCount: result.unverifiedClaimsCount,
    resolvedCitationsCount: result.resolvedCitationsCount,
    strippedCitations: result.strippedCitations,
    citedSources: assignedSources.filter((s) => result.citedIds.includes(s.id)),
  });
});

// POST /api/projects/:id/agentic/copilot-chat
draftingRoutes.post("/copilot-chat", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const { stage, message: rawMessage, history: rawHistory } = req.body || {};
  const message = typeof rawMessage === "string" ? rawMessage.trim() : "";
  if (!message) {
    return res.status(400).json({ error: "Message is required." });
  }
  // Only well-formed turns reach the prompt: anything else in `history` is dropped.
  const history = (Array.isArray(rawHistory) ? rawHistory : []).filter(
    (m): m is { role: string; content: string } => !!m && typeof m === "object" && typeof (m as { content?: unknown }).content === "string"
  );

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
    const systemPrompt = scholarBrain.journalPrompts.copilotSystemPrompt({ stage, context: JSON.stringify(scopedContext) });

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
    // The 426 hand-off to the browser's model was already sent.
    if (err instanceof Error && err.message === "RequireFrontendLLMException") return;
    sendAiFailure(res, err, "Copilot reply");
  }
});
