import { AI_RETRY_AFTER_SECONDS } from "../../../src/ai/aiRouteErrors.ts";
import { DEFAULT_CITATION_STYLE } from "../../../../src/domain/assignment/answerKeys.ts";
import { parseBody, CopilotChatBody } from "./schemas.ts";
import express from "express";
import { selectApprovedSources } from "../../../../src/domain/assignment/approvedSources.ts";
import { exportDocument } from "../../../../src/app/export/export.ts";
import {
AssignmentPdfRequestSchema,
buildAssignmentCanonicalDocument,
} from "../../../../src/desk/assignment/services/assignmentDocument.ts";
import {
sanitizeScholarlyText,
normalizeUnicodeNFC
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { callOpenRouterText } from "../../../src/services/scholarBrain.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import {
getProjectSafe,safeParseObject
} from "./helpers.ts";

import type {
CopilotAnalysis, CopilotAudit, CopilotCitation, CopilotDeck, CopilotEvidence, CopilotPeel, CopilotSection, CopilotSource
} from "../../../src/services/prompts/courseworkPrompts.ts";

const router = express.Router({ mergeParams: true });

interface CopilotProjectState {
  brief?: {
    assignmentQuestion?: string;
    targetWordCount?: number | string;
    academicLevel?: string;
    citationStyle?: string;
    assignmentType?: string;
    analysis?: CopilotAnalysis;
    rubricCriteria?: unknown[];
  };
  sources?: CopilotSource[];
  lectureSlides?: CopilotDeck[];
  evidenceItems?: CopilotEvidence[];
  outline?: CopilotSection[];
  peelSections?: CopilotPeel[];
  rubricAudit?: CopilotAudit;
}

/** A saved list, or none when the value is missing or not a list. */
function asArray<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

/**
 * Stage 5 PDF: the submission rendered by the shared export pipeline
 * (same renderer as the other workspaces), returned as a real .pdf file.
 */
router.post("/export-pdf", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const parsed = AssignmentPdfRequestSchema.safeParse(req.body ?? {});
  if (!parsed.success) {
    return res.status(400).json({ error: "Invalid export request", details: parsed.error.issues.slice(0, 5) });
  }
  if (!parsed.data.sections.some((s) => s.draftContent.trim())) {
    return res.status(422).json({ error: "Nothing to export yet: draft at least one section first." });
  }
  try {
    const document = buildAssignmentCanonicalDocument(parsed.data, project.projectId);
    const result = await exportDocument({
      document,
      format: "pdf",
      title: parsed.data.title,
      author: parsed.data.studentName || undefined,
    });
    const safeName = parsed.data.title.replace(/[^a-z0-9]+/gi, "_").replace(/^_+|_+$/g, "").slice(0, 80) || "Assignment";
    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", `attachment; filename="${safeName}_Submission.pdf"`);
    res.setHeader("Cache-Control", "no-store");
    return res.send(result.data);
  } catch (err) {
    console.error("Assignment PDF export failed:", err);
    return res.status(500).json({ error: "PDF export failed. Try the Word export or the print view." });
  }
});


// POST /api/projects/:id/assignment/copilot-chat
router.post("/copilot-chat", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = parseBody(CopilotChatBody, req, res);
  if (!body) return;

  const {
    message,
    phase = "understand",
    history = [],
    projectState,
  } = body;

  if (!message || typeof message !== "string") {
    return res.status(400).json({ error: "Message is required." });
  }

  const normalizedPhase: "understand" | "sources" | "drafting" | "submission" =
    phase === "sources" || phase === "drafting" || phase === "submission"
      ? phase
      : "understand";

  const answers = project.answers || {};
  // The browser's view of the project (optional); saved answers fill any gap.
  const state = (projectState ?? {}) as CopilotProjectState;

  // Phase 1 Grounding: Brief requirements & rubric
  const question =
    state.brief?.assignmentQuestion ||
    answers["assignment_brief"] ||
    project.answers?.["title"] ||
    "Academic Assignment";

  const targetWordCount =
    Number(state.brief?.targetWordCount || answers["word_limit"] || 2000);

  const academicLevel =
    state.brief?.academicLevel ||
    answers["academic_level"] ||
    "undergraduate";

  const citationStyle =
    state.brief?.citationStyle ||
    answers["citation_style"] ||
    DEFAULT_CITATION_STYLE;

  const assignmentType =
    state.brief?.assignmentType ||
    answers["assignment_type"] ||
    "critical_essay";

  const analysis: CopilotAnalysis =
    state.brief?.analysis ||
    safeParseObject<CopilotAnalysis>(answers["assignment_analysis"]) ||
    {};

  const rubricCriteria: unknown[] =
    state.brief?.rubricCriteria ||
    analysis.markingRubric ||
    [];

  // Phase 2 Grounding: Approved literature & lecture slides
  const sources: CopilotSource[] = asArray<CopilotSource>(
    state.sources || safeParseObject(answers["assignment_sources"])
  ).map((s) => ({ ...s, id: String(s?.id ?? "") }));

  const approvedIds: string[] | null = (() => {
    const raw = safeParseObject(answers["approved_source_ids"]);
    return Array.isArray(raw) ? raw.map(String) : null;
  })();
  // Only what the student approved (before any decision: the brief's prescribed references).
  const keptSources = selectApprovedSources(
    sources,
    approvedIds ?? sources.filter((s) => s.prescribedInBrief).map((s) => s.id)
  );

  const lectureSlides = asArray<CopilotDeck>(
    state.lectureSlides || safeParseObject(answers["lecture_slides"])
  );

  const evidenceItems = asArray<CopilotEvidence>(
    state.evidenceItems || safeParseObject(answers["assignment_evidence"])
  );

  // Phase 3 Grounding: Active PEEL section drafts & word budget progress
  const outline = asArray<CopilotSection>(
    state.outline ||
    safeParseObject(answers["assignment_internal_sections"]) ||
    safeParseObject(answers["sections"])
  );

  const peelSections = asArray<CopilotPeel>(
    state.peelSections || safeParseObject(answers["assignment_peel_sections"])
  );

  const currentTotalWords = outline.reduce(
    (acc, sec) => acc + (Number(sec?.currentWordCount) || 0),
    0
  );

  // Phase 4 Grounding: Rubric scores & unresolved citations
  const rubricAudit: CopilotAudit | null =
    state.rubricAudit ||
    safeParseObject<CopilotAudit>(answers["submission_audit"]) ||
    safeParseObject<CopilotAudit>(answers["rubric_evaluation"]) ||
    null;

  const unresolvedCitations = asArray<CopilotCitation>(
    rubricAudit?.unresolvedCitations || safeParseObject(answers["unresolved_citations"])
  );

  // Configure persona and prompt
  const { personaName, personaRole, scopedContextSummary, systemPrompt } = scholarBrain.courseworkPrompts.copilotPersona({ normalizedPhase, question, academicLevel, targetWordCount, citationStyle, assignmentType, analysis, rubricCriteria, keptSources, lectureSlides, evidenceItems, currentTotalWords, outline, peelSections, rubricAudit, unresolvedCitations });

  // Construct prompt
  let userPrompt = `${scopedContextSummary}\n`;
  if (history && history.length > 0) {
    userPrompt += `CONVERSATION HISTORY:\n`;
    for (const msg of history.slice(-6)) {
      userPrompt += `${msg.role === "user" ? "Student" : personaName}: ${msg.content}\n`;
    }
    userPrompt += `\n`;
  }
  userPrompt += `CURRENT STUDENT QUERY / ACTION:\n"${message}"\n\nRespond as ${personaName} (${personaRole}). Provide concise, highly actionable, academically rigorous markdown advice.`;

  // The student's own AI answers (server-side, or in the browser through the
  // 426 hand-off). There is no canned fallback: a failure is reported as one.
  try {
    const text = (await callOpenRouterText(req, res, systemPrompt, userPrompt, undefined, "chat"))?.trim();
    if (!text) throw new Error("empty");
    return res.json({
      ok: true,
      response: normalizeUnicodeNFC(sanitizeScholarlyText(text, { dialect: "en-GB", stripCliches: true })),
      persona: { name: personaName, role: personaRole },
    });
  } catch (err: unknown) {
    if ((err as Error)?.message === "RequireFrontendLLMException") return;
    console.warn("Coursework copilot: the AI did not answer:", (err as Error)?.message);
    if (!res.headersSent) {
      return res.status(503).set("Retry-After", AI_RETRY_AFTER_SECONDS).json({
        error: "Your AI did not answer, so the Copilot has no reply. Nothing was changed. Try again, or check AI Access.",
        code: "ai_unavailable",
      });
    }
  }
});

export default router;
