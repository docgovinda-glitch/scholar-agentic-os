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

const router = express.Router({ mergeParams: true });

// 13. POST /api/projects/:id/assignment/audit-export
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


// Deterministic Grounded Fallback Response Generator

// 15. POST /api/projects/:id/assignment/copilot-chat
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

  // Phase 1 Grounding: Brief requirements & rubric
  const question =
    projectState?.brief?.assignmentQuestion ||
    answers["assignment_question"] ||
    answers["research_topic"] ||
    answers["instructions"] ||
    (project as any).title ||
    "Academic Assignment";

  const targetWordCount =
    Number(projectState?.brief?.targetWordCount || answers["target_word_count"] || answers["word_count"] || 2000);

  const academicLevel =
    projectState?.brief?.academicLevel ||
    answers["academic_level"] ||
    answers["academicLevel"] ||
    "undergraduate";

  const citationStyle =
    projectState?.brief?.citationStyle ||
    answers["citation_style"] ||
    answers["citationStyle"] ||
    "apa7";

  const assignmentType =
    projectState?.brief?.assignmentType ||
    answers["assignment_type"] ||
    answers["assignmentType"] ||
    "critical_essay";

  const analysis =
    projectState?.brief?.analysis ||
    safeParseObject(answers["assignment_analysis"]) ||
    {};

  const rubricCriteria =
    projectState?.brief?.rubricCriteria ||
    analysis.markingRubric ||
    [];

  // Phase 2 Grounding: Approved literature & lecture slides
  const sources: any[] =
    projectState?.sources ||
    safeParseObject(answers["assignment_sources"]) ||
    [];

  const approvedIds: string[] | null = (() => {
    const raw = safeParseObject(answers["approved_source_ids"]);
    return Array.isArray(raw) ? raw.map(String) : null;
  })();
  // Only what the student approved (before any decision: the brief's prescribed references).
  const keptSources = selectApprovedSources(
    sources,
    approvedIds ?? sources.filter((s: any) => s?.prescribedInBrief).map((s: any) => String(s.id))
  );

  const lectureSlides: any[] =
    projectState?.lectureSlides ||
    safeParseObject(answers["lecture_slides"]) ||
    [];

  const evidenceItems: any[] =
    projectState?.evidenceItems ||
    safeParseObject(answers["assignment_evidence"]) ||
    [];

  // Phase 3 Grounding: Active PEEL section drafts & word budget progress
  const outline: any[] =
    projectState?.outline ||
    safeParseObject(answers["assignment_outline"]) ||
    safeParseObject(answers["sections"]) ||
    [];

  const peelSections: any[] =
    projectState?.peelSections ||
    safeParseObject(answers["assignment_peel_sections"]) ||
    [];

  const currentTotalWords = outline.reduce(
    (acc: number, sec: any) => acc + (sec.currentWordCount || 0),
    0
  );

  // Phase 4 Grounding: Rubric scores & unresolved citations
  const rubricAudit =
    projectState?.rubricAudit ||
    safeParseObject(answers["submission_audit"]) ||
    safeParseObject(answers["rubric_evaluation"]) ||
    null;

  const unresolvedCitations =
    rubricAudit?.unresolvedCitations ||
    safeParseObject(answers["unresolved_citations"]) ||
    [];

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
      return res.status(502).json({
        error: "Your AI did not answer, so the Copilot has no reply. Nothing was changed. Try again, or check AI Access.",
        code: "ai_unavailable",
      });
    }
  }
});

export default router;
