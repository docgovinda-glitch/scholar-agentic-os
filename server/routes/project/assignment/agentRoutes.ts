import { z } from "zod";
import { countProseWords } from "../../../../src/shared/proseBlocks.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import express from "express";
import { routedCompletion } from "../../../src/services/scholarBrain.ts";
import { sendAiFailure, UnusableAiResponseError } from "../../../src/ai/aiRouteErrors.ts";
import {
  parseExtraction,
  parseUnderstanding,
  parseSourceAnalysis,
  parseReview,
  parseEvidenceExtraction,
  type EvidenceInput,
  type Extraction,
  type Understanding,
  type SourceForAnalysis,
} from "../../../../src/domain/assignment/assignmentAgent.ts";
import { abortOnClose, getProjectSafe, safeParseObject, saveChangedAnswers } from "./helpers.ts";
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
  return cleanAnswerString(a["assignment_brief"]) || extractStandardizedInstructions(a);
}

function materialsOf(a: Record<string, unknown>): Array<{ name: string; text: string }> {
  const raw = safeParseObject(a["assignment_user_uploaded_sources"]) as Array<{ name?: string; extractedText?: string; abstract?: string }> | null;
  return (Array.isArray(raw) ? raw : [])
    .map((m) => ({ name: String(m.name || "Material"), text: String(m.extractedText || m.abstract || "") }))
    .filter((m) => m.text.trim().length > 20);
}

/** A step that cannot run yet; the route answers 400 with `code`. */
export class StepNotReadyError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = "StepNotReadyError";
  }
}

type Project = NonNullable<Awaited<ReturnType<typeof getProjectSafe>>>;

/**
 * Extract: the student's AI reads the brief (and uploaded materials) and lists
 * what it asks for; only what can be found in the brief is kept. Saves the
 * result and fills settings the student has not set.
 */
export async function extractStep(req: Req, project: Project, clarificationsRaw?: unknown): Promise<Extraction> {
  const a = project.answers;
  const brief = briefOf(a);
  if (!brief || brief.trim().length < 10) throw new StepNotReadyError("missing_brief", "Paste or upload your assignment brief first.");
  const clarifications = typeof clarificationsRaw === "string" ? clarificationsRaw.trim().slice(0, 2000) : String(a["assignment_clarifications"] ?? "");
  const input = { brief, materials: materialsOf(a), clarifications };
  const text = await routedCompletion(req, { signal: abortOnClose(req), task: "reasoning", systemPrompt: scholarBrain.courseworkPrompts.extractPrompt(), userPrompt: scholarBrain.courseworkPrompts.extractUserPrompt(input) });
  const extraction = parseExtraction(text ?? "", input);
  if (!extraction) throw new UnusableAiResponseError("brief extraction");
  project.answers.assignment_extraction = JSON.stringify({ ...extraction, at: now() });
  if (clarifications) project.answers.assignment_clarifications = clarifications;
  // Fill settings the student has not set, from what the brief states.
  if (extraction.constraints.wordCount && !Number(a["word_limit"])) project.answers.word_limit = String(extraction.constraints.wordCount);
  if (extraction.constraints.citationStyle && !a["citation_style"]) project.answers.citation_style = extraction.constraints.citationStyle;
  // Later steps were based on an older reading of the brief.
  delete project.answers.assignment_understanding;
  await saveChangedAnswers(project);
  return extraction;
}

/**
 * Understand: the student's AI works out what to produce and how, then writes
 * the outline (with its proposed theses) from that plan. A thesis is filled in
 * only when the student has none.
 */
export async function understandStep(
  req: Req,
  project: Project
): Promise<{ understanding: Understanding; structure: Awaited<ReturnType<typeof writeOutlineForProject>> | null; outlineError?: string }> {
  const a = project.answers;
  const extraction = safeParseObject(a["assignment_extraction"]) as Extraction | null;
  if (!extraction) throw new StepNotReadyError("missing_extraction", "Run Extract first, so Scholar knows what the brief asks for.");
  const text = await routedCompletion(req, {
    signal: abortOnClose(req),
    task: "reasoning",
    systemPrompt: scholarBrain.courseworkPrompts.understandPrompt(),
    userPrompt: scholarBrain.courseworkPrompts.understandUserPrompt(extraction, briefOf(a), {
      level: String(a["academic_level"] || ""),
      citationStyle: String(a["citation_style"] || ""),
      words: Number(a["word_limit"]) || undefined,
    }),
    // The plan, outline and thesis options are a few thousand tokens; an explicit cap keeps the provider
    // from reserving the 32k default, which fails on low-credit accounts before any text is written.
    maxOutputTokens: 8_000,
  });
  const understanding = parseUnderstanding(text ?? "");
  if (!understanding) throw new UnusableAiResponseError("assignment analysis");
  project.answers.assignment_understanding = JSON.stringify({ ...understanding, at: now() });
  await saveChangedAnswers(project);

  // The outline follows from this understanding.
  const plan = [
    `What to produce: ${understanding.produce}`,
    `Approach: ${understanding.approach}`,
    `Structure: ${understanding.structure}`,
    understanding.criteria.length ? `Criteria: ${understanding.criteria.map((c) => `${c.criterion}: ${c.howToMeet}`).join("; ")}` : "",
  ]
    .filter(Boolean)
    .join("\n");
  let structure: Awaited<ReturnType<typeof writeOutlineForProject>> | null = null;
  let outlineError: string | undefined;
  try {
    structure = await writeOutlineForProject(req, project, { plan });
  } catch (e) {
    if (abortOnClose(req).aborted) throw e;
    outlineError = e instanceof Error ? e.message : "The outline could not be written.";
  }
  // A starting thesis to test, only when the student has not written one: the
  // outline's first proposal, else the plan's line of argument.
  if (!cleanAnswerString(project.answers["assignment_thesis"])) {
    const thesis = structure?.thesisOptions?.[0]?.statement || understanding.thesisDirection;
    if (thesis) {
      project.answers.assignment_thesis = thesis;
      await saveChangedAnswers(project);
    }
  }
  return { understanding, structure, outlineError };
}

function sendStepFailure(res: express.Response, err: unknown, feature: string) {
  if (err instanceof StepNotReadyError) {
    res.status(400).json({ error: err.message, code: err.code });
    return;
  }
  sendAiFailure(res, err, feature);
}

router.post("/agent/extract", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  try {
    const extraction = await extractStep(req, project, req.body?.clarifications);
    res.json({ extraction });
  } catch (err) {
    sendStepFailure(res, err, "Extract");
  }
});

router.post("/agent/understand", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  try {
    res.json(await understandStep(req, project));
  } catch (err) {
    sendStepFailure(res, err, "Understand");
  }
});

router.post("/agent/sources", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const a = project.answers;
  const body = req.body?.sources;
  const sources: SourceForAnalysis[] = (Array.isArray(body) ? body : [])
    .slice(0, 20)
    .map((raw: unknown) => (raw && typeof raw === "object" ? raw : {}) as Record<string, unknown>)
    .map((s) => ({
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
  const structure = safeParseObject(a["assignment_structure"]) as { headings?: Array<{ purpose?: string; subheadings?: Array<{ id: string; numberStr?: string; title: string; purpose?: string }> }> } | null;
  // Each unit with its purpose (the section's when the unit has none), so mapping follows the plan.
  const sections = (structure?.headings ?? []).flatMap((h) =>
    (h.subheadings ?? []).map((s) => ({ id: s.id, title: `${s.numberStr ?? ""} ${s.title}`.trim(), purpose: s.purpose || h.purpose }))
  );
  const thesis = cleanAnswerString(a["assignment_thesis"]) || undefined;
  const task = understanding?.produce || extraction?.task || briefOf(a).slice(0, 600);
  try {
    const text = await routedCompletion(req, { signal: abortOnClose(req), task: "reasoning", systemPrompt: scholarBrain.courseworkPrompts.sourcesPrompt(), userPrompt: scholarBrain.courseworkPrompts.sourcesUserPrompt(task, sections, sources, thesis) });
    const analyses = parseSourceAnalysis(text ?? "", sources, sections.map((s) => s.id));
    if (!analyses) return sendAiFailure(res, new UnusableAiResponseError("source analysis"), "Sources");
    const prev = (safeParseObject(a["assignment_source_analysis"]) as Record<string, unknown> | null) ?? {};
    project.answers.assignment_source_analysis = JSON.stringify({ ...prev, ...Object.fromEntries(analyses.map((x) => [x.id, { ...x, at: now() }])) });
    await saveChangedAnswers(project);
    res.json({ analyses });
  } catch (err) {
    sendAiFailure(res, err, "Sources");
  }
});

/**
 * POST /agent/evidence  { title, sourceType, passages: [{ location, text }] }
 * Reads passages of a document the student uploaded and returns the excerpts
 * that bear on the brief. Only excerpts found word for word in the passages are
 * kept; nothing is saved here (the upload itself is saved by the client).
 */
const EvidenceBody = z.object({
  title: z.string().trim().min(1).max(300),
  sourceType: z.string().trim().max(40).default("text"),
  passages: z
    .array(z.object({ location: z.string().trim().max(120).default(""), text: z.string().max(4000) }))
    .min(1)
    .max(4),
});

router.post("/agent/evidence", async (req: Req, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = EvidenceBody.safeParse(req.body ?? {});
  if (!body.success) return res.status(400).json({ error: "Send the document's title and up to four passages.", code: "invalid_body" });
  const a = project.answers;
  const question = cleanAnswerString(a["assignment_brief"]) || extractStandardizedInstructions(a);
  if (!question || question.trim().length < 10) {
    return res.status(400).json({ error: "Add your assignment brief first.", code: "missing_brief" });
  }
  const input: EvidenceInput = { question, ...body.data };
  try {
    const text = await routedCompletion(req, { signal: abortOnClose(req),
      task: "reasoning",
      systemPrompt: scholarBrain.courseworkPrompts.evidencePrompt(),
      userPrompt: scholarBrain.courseworkPrompts.evidenceUserPrompt(input),
    });
    const evidence = parseEvidenceExtraction(text ?? "", input);
    if (!evidence) return sendAiFailure(res, new UnusableAiResponseError("document evidence"), "Evidence");
    res.json({ evidence });
  } catch (err) {
    sendAiFailure(res, err, "Evidence");
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
  if (countProseWords(draft) < 30) {
    return res.status(400).json({ error: "Write at least part of the draft before the review.", code: "missing_draft" });
  }
  const extraction = safeParseObject(a["assignment_extraction"]) as Extraction | null;
  const input = {
    draft,
    requirements: (extraction?.requirements ?? []).map((r) => ({ text: r.text, kind: r.kind })),
    criteria: (extraction?.criteria ?? []).map((c) => ({ criterion: c.criterion, weight: c.weight })),
    question: extraction?.questions?.[0]?.text || cleanAnswerString(a["assignment_brief"]),
    citationStyle: String(a["citation_style"] || ""),
    targetWords: Number(a["word_limit"]) || undefined,
  };
  try {
    const text = await routedCompletion(req, { signal: abortOnClose(req), task: "long-context", systemPrompt: scholarBrain.courseworkPrompts.reviewPrompt(), userPrompt: scholarBrain.courseworkPrompts.reviewUserPrompt(input) });
    const review = parseReview(text ?? "", input);
    if (!review) return sendAiFailure(res, new UnusableAiResponseError("draft review"), "Review");
    project.answers.assignment_ai_review = JSON.stringify({ ...review, at: now(), words: countProseWords(draft) });
    await saveChangedAnswers(project);
    res.json({ review });
  } catch (err) {
    sendAiFailure(res, err, "Review");
  }
});

export default router;
