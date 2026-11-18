import { WORD_LIMIT_MAX } from "../../../../src/domain/assignment/wordLimit.ts";
import { errorText } from "../../../../src/shared/errorText.ts";
import { parseBody, OutlineBody, OutlineSectionBody, ThesisRefineBody } from "./schemas.ts";
import { routedCompletion } from "../../../src/services/scholarBrain.ts";
import { sendAiFailure,UnusableAiResponseError } from "../../../src/ai/aiRouteErrors.ts";
import { briefQuestionsForOutline, replaceSectionFromAi, structureFromAi } from "../../../../src/domain/assignment/aiAssignmentOutline.ts";
import { scopeBrief } from "../../../../src/domain/assignment/briefScoping.ts";
import type { AssignmentDraftingSection, AssignmentStructure } from "../../../../src/desk/assignment/types.ts";
import type { ProjectRecord } from "../../../../src/services/store/types.ts";
import express from "express";
import { z } from "zod";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import {
normalizeUnicodeNFC
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import {
cleanAnswerString,
extractStandardizedInstructions
} from "../../../../src/desk/assignment/types.ts";
import { sanitizeBrief } from "../../../../src/features/understand/services/briefSanitizer.ts";
import {
isClassroomLogisticsLine,
isTutorialOrShortQABrief,
extractSubstantiveBriefQuestions,
stripSlideArtifacts,
stripCourseCodes,
} from "../../../../src/utils/briefExtractor.ts";
import {
upload,
abortOnClose,getProjectSafe,safeParseObject,saveChangedAnswers,deriveHeuristicTitle,
autoUpdateProjectTitleIfUntitled
} from "./helpers.ts";

const router = express.Router({ mergeParams: true });

// 0. POST /api/projects/:id/assignment/parse-brief (File Upload for Briefs)
router.post(
  "/parse-brief",
  async (req: express.Request<{ id: string }>, res: express.Response, next: express.NextFunction) => {
    // Ownership is checked before the upload is read; the handler reuses this project.
    const project = await getProjectSafe(req, res);
    if (!project) return;
    res.locals.project = project;
    next();
  },
  upload.single("file"),
  async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = res.locals.project as NonNullable<Awaited<ReturnType<typeof getProjectSafe>>>;

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  // A .pdf / .docx / .pptx whose bytes are not that format (renamed or corrupt)
  // is refused: decoding it as text would put garbage in the brief box.
  const lowerName = (file.originalname || "").toLowerCase();
  const head = file.buffer.subarray(0, 5).toString("latin1");
  const looksPdf = head.startsWith("%PDF");
  const looksZip = head.startsWith("PK");
  if ((/\.pdf$/.test(lowerName) && !looksPdf) || (/\.(docx|pptx)$/.test(lowerName) && !looksZip)) {
    return res.status(422).json({
      error: "This file is not a valid " + lowerName.split(".").pop()!.toUpperCase() + " document. Save it again from your word processor, or paste the brief text.",
      code: "brief_unreadable",
    });
  }
  if (file.size === 0) {
    return res.status(422).json({ error: "This file is empty. Choose another file or paste the brief text.", code: "brief_empty" });
  }

  let text = "";
  try {
    const parsed = await parseDocument({
      data: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
    if (!parsed.ok) {
      // Binary formats must never be decoded as text: that would put garbage in the brief box.
      const lowerName = (file.originalname || "").toLowerCase();
      const isBinaryDoc = /\.(pdf|docx?|pptx?)$/.test(lowerName) || /pdf|word|officedocument/i.test(file.mimetype || "");
      if (isBinaryDoc) {
        const why = (parsed as { error?: { type?: string; message?: string } }).error;
        console.warn("[parse-brief] could not read", file.originalname, why?.type, why?.message);
        return res.status(422).json({
          error:
            why?.type === "ENCRYPTED"
              ? "This file is password-protected. Remove the password and upload it again, or paste the brief text."
              : "We could not read text from this file. If it is a scanned image, paste the brief text instead.",
          code: "brief_unreadable",
        });
      }
    }
    text = parsed.ok ? parsed.data.text : file.buffer.toString("utf-8");
    // Drop page-marker lines such as "-- 1 of 3 --" that PDF extraction inserts.
    text = text.replace(/^\s*--\s*\d+\s+of\s+\d+\s*--\s*$/gim, "");

    // Clean whitespace, normalize line breaks and apply NFC
    text = normalizeUnicodeNFC(text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim());

    // Strip slide artifacts and pedagogical noise
    text = stripSlideArtifacts(text);

    // Sanitize brief: repair hyphenated line breaks, soft breaks, and purge classroom/pedagogical noise
    const sanitizedResult = sanitizeBrief(text);
    const cleanedText = sanitizedResult.cleanedText;
    const rawQuestions =
      sanitizedResult.extractedQuestions.length > 0
        ? sanitizedResult.extractedQuestions
        : extractSubstantiveBriefQuestions(cleanedText);
    const extractedQuestions = rawQuestions.filter((q: string) => !isClassroomLogisticsLine(q));

    // Detect metadata within first 50,000 characters to eliminate regex backtracking on multi-MB documents
    const searchSlice = cleanedText.slice(0, 50000);
    let detectedWordCount: number | undefined;
    // Strip hyphenated course/module codes (QNT-4020) so they are never read as a word count
    const wordSlice = stripCourseCodes(searchSlice);
    const wordMatch =
      wordSlice.match(/(?:word\s*count|target|limit|length)\s*(?:is|of|:)?\s*([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,4})/i) ||
      wordSlice.match(/(?:^|[^\d,])([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,4})\s*words\b/i);
    if (wordMatch) {
      const parsed = parseInt((wordMatch[1] || "").replace(/,/g, ""), 10);
      if (parsed >= 200 && parsed <= WORD_LIMIT_MAX) {
        detectedWordCount = parsed;
      }
    } else if (isTutorialOrShortQABrief(cleanedText)) {
      detectedWordCount = 350;
    }

    let detectedLevel: "undergraduate" | "postgraduate" | undefined;
    if (/\b(postgraduate|masters|master's|msc|ma|mba|llm|phd|level\s*7)\b/i.test(searchSlice)) {
      detectedLevel = "postgraduate";
    } else if (/\b(undergraduate|bachelor|bachelor's|bsc|ba|level\s*[456])\b/i.test(searchSlice)) {
      detectedLevel = "undergraduate";
    }

    let detectedCitation: string | undefined;
    if (/\b(apa\s*7|\bapa\b)/i.test(searchSlice)) detectedCitation = "apa7";
    else if (/\bharvard\b/i.test(searchSlice)) detectedCitation = "harvard";
    else if (/\bieee\b/i.test(searchSlice)) detectedCitation = "ieee";
    else if (/\bmla\b/i.test(searchSlice)) detectedCitation = "mla9";
    else if (/\bchicago\b/i.test(searchSlice)) detectedCitation = "chicago";
    else if (/\boscola\b/i.test(searchSlice)) detectedCitation = "oscola";

    const lines = cleanedText.split("\n").filter((l) => l.trim().length > 0);

    // Guaranteed persistence: commit extracted brief directly into project answers
    if (!project.answers) {
      project.answers = {};
    }
    // One stored name per setting (answerKeys.ts); the questions are kept below.
    project.answers["assignment_brief"] = cleanedText;
    if (extractedQuestions.length > 0) {
      project.answers["extracted_questions"] = JSON.stringify(extractedQuestions);
    }
    const markAllocation = scholarBrain.allocateWordsByMarks(
      extractedQuestions.length > 0 ? extractedQuestions : [cleanedText],
      detectedWordCount || 2000
    );
    project.answers["mark_allocation"] = JSON.stringify(markAllocation);

    if (detectedWordCount) {
      project.answers["word_limit"] = String(detectedWordCount);
    }
    if (detectedLevel) {
      project.answers["academic_level"] = detectedLevel;
    }
    if (detectedCitation) {
      project.answers["citation_style"] = detectedCitation;
    }
    await saveChangedAnswers(project);

    // The title is read from the brief's own wording here; no AI call while uploading.
    const derivedTitle = deriveHeuristicTitle(cleanedText);
    const updatedTitle = await autoUpdateProjectTitleIfUntitled(project, derivedTitle);

    return res.json({
      success: true,
      text: cleanedText,
      extractedQuestions,
      markAllocation,
      omittedPedagogicalNoise: sanitizedResult.omittedPedagogicalNoise,
      repairedLineWrapsCount: sanitizedResult.repairedLineWrapsCount,
      lineCount: lines.length,
      detectedWordCount,
      detectedLevel,
      detectedCitation,
      updatedTitle,
    });
  } catch (err: unknown) {
    console.error("Error parsing brief in assignment router:", err);
    return res.status(500).json({ error: errorText(err) || "Failed to extract text from brief" });
  }
});

/**
 * POST /api/projects/:id/assignment/outline  { instruction? }
 * Writes the outline from the brief with the student's AI, or revises the
 * current one as asked ("add a section on ethics", "make it 3,000 words").
 * Text already written is kept. Saves and returns the new outline.
 */
/**
 * Writes (or revises) the outline with the student's AI and saves it on the
 * project. Text already written is kept. Throws an AI error, or
 * UnusableAiResponseError when the answer had no usable outline.
 */
export async function writeOutlineForProject(
  req: express.Request<{ id: string }>,
  project: ProjectRecord,
  opts: { instruction?: string; plan?: string } = {}
) {
  const a = project.answers;
  const question = cleanAnswerString(a["assignment_brief"]) || extractStandardizedInstructions(a);
  const briefText = cleanAnswerString(a["assignment_brief"]) || question;
  const targetWords = Number(a["word_limit"] || 1500) || 1500;
  const assignmentType = String(a["assignment_type"] || "essay");
  const current = safeParseObject<AssignmentStructure>(a["assignment_structure"]);
  const previous = (safeParseObject(a["assignment_internal_sections"]) as AssignmentDraftingSection[] | undefined) ?? [];
  const ledger = safeParseObject(a["brief_ledger"]) as Array<{ category?: string; verbatimText?: string }> | undefined;
  const extraction = safeParseObject(a["assignment_extraction"]) as { criteria?: Array<{ criterion: string; weight?: number }> } | null;
  const criteria = extraction?.criteria?.length
    ? extraction.criteria.map((c) => `${c.criterion}${c.weight ? ` ${c.weight}%` : ""}`)
    : (Array.isArray(ledger) ? ledger : []).filter((l) => l.category === "rubric_band" && (l.verbatimText ?? "").length >= 15).map((l) => String(l.verbatimText));
  const discipline =
    (typeof a["assignment_discipline"] === "string" && a["assignment_discipline"]) || scopeBrief(`${question} ${briefText}`).discipline;

  const aiText = await routedCompletion(req, { signal: abortOnClose(req),
    task: "drafting",
    systemPrompt: scholarBrain.courseworkPrompts.assignmentOutlinePrompt(),
    userPrompt: scholarBrain.courseworkPrompts.assignmentOutlineUserPrompt({
      brief: briefText,
      question,
      assignmentType,
      academicLevel: String(a["academic_level"] || "undergraduate"),
      discipline: discipline || undefined,
      citationStyle: cleanAnswerString(a["citation_style"]) || undefined,
      targetWords,
      criteria,
      questions: briefQuestionsForOutline(briefText),
      instruction: opts.instruction,
      plan: opts.plan,
      current: current?.headings?.length ? current : null,
      written: Array.isArray(previous) ? previous.filter((p) => (p.draftContent ?? "").trim()).map((p) => p.id) : [],
    }),
    maxOutputTokens: 8_000, // an outline is a few thousand tokens; see the understand step
  });
  const structure = structureFromAi(aiText ?? "", targetWords, { instruction: opts.instruction, previous: Array.isArray(previous) ? previous : [], briefText });
  if (!structure) throw new UnusableAiResponseError("outline");
  structure.version = (Number(current?.version) || 0) + 1;
  project.answers.assignment_structure = JSON.stringify(structure);
  if (structure.targetWordCount !== targetWords) project.answers.word_limit = String(structure.targetWordCount);
  delete project.answers.assignment_internal_sections;
  await saveChangedAnswers(project);
  return structure;
}

router.post("/outline", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  if (!parseBody(OutlineBody, req, res)) return;
  const raw = req.body?.instruction;
  const instruction = typeof raw === "string" ? raw.trim().slice(0, 600) || undefined : undefined;
  const a = project.answers;
  const briefText = cleanAnswerString(a["assignment_brief"]) || extractStandardizedInstructions(a);
  if (!briefText || briefText.trim().length < 10) {
    return res.status(400).json({ error: "Add your assignment brief first, so the outline can be about your assignment.", code: "missing_brief" });
  }
  try {
    const structure = await writeOutlineForProject(req, project, { instruction });
    res.json({ structure });
  } catch (err) {
    sendAiFailure(res, err, "Outline");
  }
});


/**
 * POST /api/projects/:id/assignment/outline/section  { headingId, instruction? }
 * The student's AI rewrites one section of the outline; the section keeps its
 * word budget (so the total does not move) and text already written under
 * sub-sections that survive. Saves and returns the new outline.
 */
router.post("/outline/section", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = parseBody(OutlineSectionBody, req, res);
  if (!body) return;
  const a = project.answers;
  const structure = safeParseObject<AssignmentStructure>(a["assignment_structure"]);
  const target = structure?.headings?.find((h) => h.id === body.headingId);
  if (!structure || !target) {
    return res.status(404).json({ error: "That section is not in your outline any more. Reload and try again.", code: "missing_section" });
  }
  const brief = cleanAnswerString(a["assignment_brief"]) || extractStandardizedInstructions(a);
  try {
    const aiText = await routedCompletion(req, {
      signal: abortOnClose(req),
      task: "drafting",
      systemPrompt: scholarBrain.courseworkPrompts.outlineSectionPrompt(),
      userPrompt: scholarBrain.courseworkPrompts.outlineSectionUserPrompt({
        brief,
        thesis: cleanAnswerString(a["assignment_thesis"]) || undefined,
        outline: structure.headings.map((h) => ({ title: h.title, words: h.targetWordCount, isTarget: h.id === target.id })),
        target: { title: target.title, purpose: target.purpose, words: target.targetWordCount, units: target.subheadings.map((s) => ({ title: s.title, words: s.targetWordCount })) },
        instruction: body.instruction,
      }),
      maxOutputTokens: 4_000, // one section, with its units
    });
    const previous = (safeParseObject(a["assignment_internal_sections"]) as AssignmentDraftingSection[] | null) ?? [];
    const next = replaceSectionFromAi(structure, target.id, aiText ?? "", Array.isArray(previous) ? previous : []);
    if (!next) throw new UnusableAiResponseError("outline section");
    project.answers.assignment_structure = JSON.stringify({ ...next, isConfirmed: false });
    delete project.answers.assignment_internal_sections;
    await saveChangedAnswers(project);
    res.json({ structure: { ...next, isConfirmed: false } });
  } catch (err) {
    sendAiFailure(res, err, "Outline section");
  }
});

const RefinedThesis = z.object({ thesis: z.string().trim().min(5).max(1200), note: z.string().trim().max(400).optional() });

/**
 * POST /api/projects/:id/assignment/thesis/refine  { thesis, instruction? }
 * The student's AI sharpens the thesis they wrote, keeping their position.
 * Saves nothing: the student accepts or ignores the suggestion.
 */
router.post("/thesis/refine", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const body = parseBody(ThesisRefineBody, req, res);
  if (!body) return;
  const a = project.answers;
  const brief = cleanAnswerString(a["assignment_brief"]) || extractStandardizedInstructions(a);
  try {
    const aiText = await routedCompletion(req, {
      signal: abortOnClose(req),
      task: "reasoning",
      systemPrompt: scholarBrain.courseworkPrompts.thesisRefinePrompt(),
      userPrompt: scholarBrain.courseworkPrompts.thesisRefineUserPrompt({ brief, thesis: body.thesis, instruction: body.instruction, level: String(a["academic_level"] || "") }),
      maxOutputTokens: 2_000, // one sentence-level thesis and a short note
    });
    const match = /\{[\s\S]*\}/.exec(aiText ?? "");
    let parsed: z.infer<typeof RefinedThesis> | undefined;
    try {
      const r = RefinedThesis.safeParse(match ? JSON.parse(match[0]) : null);
      parsed = r.success ? r.data : undefined;
    } catch {
      parsed = undefined;
    }
    if (!parsed) throw new UnusableAiResponseError("thesis");
    res.json({ thesis: parsed.thesis, note: parsed.note ?? "" });
  } catch (err) {
    sendAiFailure(res, err, "Thesis");
  }
});

export default router;
