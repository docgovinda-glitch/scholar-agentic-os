import express from "express";
import { routedCompletion } from "../../../src/ai/routerBridge.ts";
import { sendAiFailure, UnusableAiResponseError } from "../../../src/ai/aiRouteErrors.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import {
  extractPrompt,
  extractUserPrompt,
  parseExtraction,
  understandPrompt,
  understandUserPrompt,
  parseUnderstanding,
  sourcesPrompt,
  sourcesUserPrompt,
  parseSourceAnalysis,
  reviewPrompt,
  reviewUserPrompt,
  parseReview,
  type Extraction,
  type Understanding,
  type SourceForAnalysis,
} from "../../../../src/domain/assignment/assignmentAgent.ts";
import { getProjectSafe, safeParseObject } from "./helpers.ts";
import { cleanAnswerString, extractStandardizedInstructions } from "../../../../src/desk/assignment/types.ts";
import { writeOutlineForProject } from "./extractRoutes.ts";

/**
 * The coursework agent: each step runs the student's AI on what earlier
 * steps saved on the project, checks the answer (quotes must be found in
 * the brief, abstracts or draft), saves the result, and returns it.
 *
 *   POST /agent/extract     { clarifications? }
 *   POST /agent/understand  {}            -> understanding + outline
 *   POST /agent/sources     { sources }   -> analysis of real search results
 *   POST /agent/review      {}            -> review of the draft
 */
const router = express.Router({ mergeParams: true });

type Req = express.Request<{ id: string }>;
const now = () => new Date().toISOString();

function briefOf(a: Record<string, unknown>): string {
  return cleanAnswerString(a["assignment_brief_text"]) || cleanAnswerString(a["assignment_question"]) || extractStandardizedInstructions(a);
}

function materialsOf(a: Record<string, unknown>): Array<{ name: string; text: string }> {
  const raw = safeParseObject(a["assignment_user_uploaded_sources"]) as Array<{ name?: string; extractedText?: string; abstract?: string }> | null;
  return (Array.isArray(raw) ? raw : [])
    .map((m) => ({ name: String(m.name || "Material"), text: String(m.extractedText || m.abstract || "") }))
    .filter((m) => m.text.trim().length > 20);
}

router.post("/agent/extract", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const a = project.answers;
  const brief = briefOf(a);
  if (!brief || brief.trim().length < 10) {
    return res.status(400).json({ error: "Paste or upload your assignment brief first.", code: "missing_brief" });
  }
  const raw = req.body?.clarifications;
  const clarifications = typeof raw === "string" ? raw.trim().slice(0, 2000) : String(a["assignment_clarifications"] ?? "");
  const input = { brief, materials: materialsOf(a), clarifications };
  try {
    const text = await routedCompletion(req, { task: "reasoning", systemPrompt: extractPrompt(), userPrompt: extractUserPrompt(input) });
    const extraction = parseExtraction(text ?? "", input);
    if (!extraction) return sendAiFailure(res, new UnusableAiResponseError("brief extraction"), "Extract");
    project.answers.assignment_extraction = JSON.stringify({ ...extraction, at: now() });
    if (clarifications) project.answers.assignment_clarifications = clarifications;
    // Fill settings the student has not set, from what the brief states.
    if (extraction.constraints.wordCount && !Number(a["targetWordCount"] || a["word_count"])) project.answers.targetWordCount = String(extraction.constraints.wordCount);
    if (extraction.constraints.citationStyle && !a["citation_style"] && !a["citationStyle"]) project.answers.citation_style = extraction.constraints.citationStyle;
    // Later steps were based on an older reading of the brief.
    delete project.answers.assignment_understanding;
    await getProjectStore().save(project);
    res.json({ extraction });
  } catch (err) {
    sendAiFailure(res, err, "Extract");
  }
});

router.post("/agent/understand", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const a = project.answers;
  const extraction = safeParseObject(a["assignment_extraction"]) as Extraction | null;
  if (!extraction) return res.status(400).json({ error: "Run Extract first, so Scholar knows what the brief asks for.", code: "missing_extraction" });
  try {
    const text = await routedCompletion(req, {
      task: "reasoning",
      systemPrompt: understandPrompt(),
      userPrompt: understandUserPrompt(extraction, briefOf(a), {
        level: String(a["academicLevel"] || a["academic_level"] || ""),
        citationStyle: String(a["citationStyle"] || a["citation_style"] || ""),
        words: Number(a["targetWordCount"] || a["word_count"]) || undefined,
      }),
    });
    const understanding = parseUnderstanding(text ?? "");
    if (!understanding) return sendAiFailure(res, new UnusableAiResponseError("assignment analysis"), "Understand");
    project.answers.assignment_understanding = JSON.stringify({ ...understanding, at: now() });
    // A starting thesis to test, only when the student has not written one.
    if (understanding.thesisDirection && !cleanAnswerString(a["assignment_thesis"])) {
      project.answers.assignment_thesis = understanding.thesisDirection;
      project.answers.thesis_statement = understanding.thesisDirection;
    }
    await getProjectStore().save(project);

    // The outline follows from this understanding.
    const plan = [
      `What to produce: ${understanding.produce}`,
      `Approach: ${understanding.approach}`,
      `Structure: ${understanding.structure}`,
      understanding.criteria.length ? `Criteria: ${understanding.criteria.map((c) => `${c.criterion}: ${c.howToMeet}`).join("; ")}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    let structure = null;
    let outlineError: string | undefined;
    try {
      structure = await writeOutlineForProject(req, project, { plan });
    } catch (e) {
      outlineError = e instanceof Error ? e.message : "The outline could not be written.";
    }
    res.json({ understanding, structure, outlineError });
  } catch (err) {
    sendAiFailure(res, err, "Understand");
  }
});

router.post("/agent/sources", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const a = project.answers;
  const body = req.body?.sources;
  const sources: SourceForAnalysis[] = (Array.isArray(body) ? body : [])
    .slice(0, 20)
    .map((s: any) => ({
      id: String(s?.id ?? "").slice(0, 200),
      title: String(s?.title ?? "").slice(0, 400),
      authors: Array.isArray(s?.authors) ? s.authors.map(String).slice(0, 8) : [],
      year: s?.year ? String(s.year).slice(0, 10) : undefined,
      venue: s?.venue ? String(s.venue).slice(0, 200) : undefined,
      abstract: s?.abstract ? String(s.abstract).slice(0, 4000) : undefined,
      peerReviewed: typeof s?.peerReviewed === "boolean" ? s.peerReviewed : null,
      citationCount: Number.isFinite(Number(s?.citationCount)) ? Number(s.citationCount) : undefined,
    }))
    .filter((s) => s.id && s.title);
  if (!sources.length) return res.status(400).json({ error: "No sources to read. Run the search first.", code: "missing_sources" });

  const extraction = safeParseObject(a["assignment_extraction"]) as Extraction | null;
  const understanding = safeParseObject(a["assignment_understanding"]) as Understanding | null;
  const structure = safeParseObject(a["assignment_structure"] || a["structure"]) as { headings?: Array<{ subheadings?: Array<{ id: string; numberStr?: string; title: string }> }> } | null;
  const sections = (structure?.headings ?? []).flatMap((h) => h.subheadings ?? []).map((s) => ({ id: s.id, title: `${s.numberStr ?? ""} ${s.title}`.trim() }));
  const task = understanding?.produce || extraction?.task || briefOf(a).slice(0, 600);
  try {
    const text = await routedCompletion(req, { task: "reasoning", systemPrompt: sourcesPrompt(), userPrompt: sourcesUserPrompt(task, sections, sources) });
    const analyses = parseSourceAnalysis(text ?? "", sources, sections.map((s) => s.id));
    if (!analyses) return sendAiFailure(res, new UnusableAiResponseError("source analysis"), "Sources");
    const prev = (safeParseObject(a["assignment_source_analysis"]) as Record<string, unknown> | null) ?? {};
    project.answers.assignment_source_analysis = JSON.stringify({ ...prev, ...Object.fromEntries(analyses.map((x) => [x.id, { ...x, at: now() }])) });
    await getProjectStore().save(project);
    res.json({ analyses });
  } catch (err) {
    sendAiFailure(res, err, "Sources");
  }
});

router.post("/agent/review", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const a = project.answers;
  const sections = (safeParseObject(a["assignment_internal_sections"]) as Array<{ title: string; draftContent?: string }> | null) ?? [];
  const draft = sections
    .filter((s) => (s.draftContent ?? "").trim())
    .map((s) => `## ${s.title}\n\n${s.draftContent}`)
    .join("\n\n");
  if (draft.trim().split(/\s+/).length < 30) {
    return res.status(400).json({ error: "Write at least part of the draft before the review.", code: "missing_draft" });
  }
  const extraction = safeParseObject(a["assignment_extraction"]) as Extraction | null;
  const input = {
    draft,
    requirements: (extraction?.requirements ?? []).map((r) => ({ text: r.text, kind: r.kind })),
    criteria: (extraction?.criteria ?? []).map((c) => ({ criterion: c.criterion, weight: c.weight })),
    question: extraction?.questions?.[0]?.text || cleanAnswerString(a["assignment_question"]),
    citationStyle: String(a["citationStyle"] || a["citation_style"] || ""),
    targetWords: Number(a["targetWordCount"] || a["word_count"]) || undefined,
  };
  try {
    const text = await routedCompletion(req, { task: "long-context", systemPrompt: reviewPrompt(), userPrompt: reviewUserPrompt(input) });
    const review = parseReview(text ?? "", input);
    if (!review) return sendAiFailure(res, new UnusableAiResponseError("draft review"), "Review");
    project.answers.assignment_ai_review = JSON.stringify({ ...review, at: now(), words: draft.split(/\s+/).length });
    await getProjectStore().save(project);
    res.json({ review });
  } catch (err) {
    sendAiFailure(res, err, "Review");
  }
});

export default router;
