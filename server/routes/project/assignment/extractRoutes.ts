import { routedCompletion } from "../../../src/ai/routerBridge.ts";
import { sendAiFailure, UnusableAiResponseError } from "../../../src/ai/aiRouteErrors.ts";
import { assignmentOutlinePrompt, assignmentOutlineUserPrompt, structureFromAi } from "../../../../src/domain/assignment/aiAssignmentOutline.ts";
import { scopeBrief } from "../../../../src/domain/assignment/briefScoping.ts";
import type { AssignmentDraftingSection } from "../../../../src/desk/assignment/types.ts";
import express from "express";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText, resolveRequestAiConfig } from "../../../utils/llm.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
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
  extractTargetFrameworks,
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

// 0. POST /api/projects/:id/assignment/parse-brief (File Upload for Briefs)
router.post(
  "/parse-brief",
  async (req: express.Request<{ id: string }>, res: express.Response, next: express.NextFunction) => {
    const project = await getProjectSafe(req, res);
    if (!project) return;
    next();
  },
  upload.single("file"),
  async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  let text = "";
  try {
    const parsed = await parseDocument({
      data: file.buffer,
      filename: file.originalname,
      mimeType: file.mimetype,
    });
    text = parsed.ok ? parsed.data.text : file.buffer.toString("utf-8");

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
    const wordMatch =
      searchSlice.match(/(?:word\s*count|target|limit|length)\s*(?:is|of|:)?\s*([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,4})/i) ||
      searchSlice.match(/(?:^|[^\d,])([1-9]\d{0,2}(?:,\d{3})+|[1-9]\d{2,4})\s*words\b/i);
    if (wordMatch) {
      const parsed = parseInt((wordMatch[1] || "").replace(/,/g, ""), 10);
      if (parsed >= 200 && parsed <= 50000) {
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
    project.answers["instructions"] = cleanedText;
    project.answers["assignment_question"] =
      extractedQuestions.length > 0 ? extractedQuestions.join("\n\n") : cleanedText;
    project.answers["assignment_brief_text"] = cleanedText;
    project.answers["research_topic"] = cleanedText;
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
      project.answers["targetWordCount"] = String(detectedWordCount);
      project.answers["target_word_count"] = String(detectedWordCount);
      project.answers["word_count"] = String(detectedWordCount);
      project.answers["word_limit"] = String(detectedWordCount);
    }
    if (detectedLevel) {
      project.answers["academicLevel"] = detectedLevel;
      project.answers["academic_level"] = detectedLevel;
    }
    if (detectedCitation) {
      project.answers["citationStyle"] = detectedCitation;
      project.answers["citation_style"] = detectedCitation;
    }
    await getProjectStore().save(project);

    const derivedTitle = await deriveSemanticAcademicTitle(cleanedText, req);
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
  } catch (err: any) {
    console.error("Error parsing brief in assignment router:", err);
    return res.status(500).json({ error: err.message || "Failed to extract text from brief" });
  }
});

// 1. POST /api/projects/:id/assignment/analyze & /deconstruct
const handleDeconstruct = async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const question =
    cleanAnswerString(req.body?.instructions) ||
    cleanAnswerString(req.body?.question) ||
    extractStandardizedInstructions(project.answers);
  const assignmentType =
    req.body?.assignmentType ||
    project.answers["assignmentType"] ||
    project.answers["assignment_type"] ||
    "essay";
  const academicLevel =
    req.body?.academicLevel ||
    project.answers["academicLevel"] ||
    project.answers["academic_level"] ||
    "undergraduate";
  const briefText =
    cleanAnswerString(req.body?.briefText) ||
    cleanAnswerString(project.answers["assignment_brief_text"]) ||
    question;
  const isTutorial = isTutorialOrShortQABrief(briefText) || isTutorialOrShortQABrief(question);
  const targetWordCount = Number(
    req.body?.targetWordCount ||
    project.answers["targetWordCount"] ||
    project.answers["word_count"] ||
    project.answers["word_limit"] ||
    (isTutorial ? 400 : 2000)
  );
  const citationStyle =
    cleanAnswerString(req.body?.citationStyle) ||
    cleanAnswerString(project.answers["citationStyle"]) ||
    cleanAnswerString(project.answers["citation_style"]) ||
    "apa7";
  const rubricText =
    cleanAnswerString(req.body?.rubricText) ||
    cleanAnswerString(project.answers["marking_rubric"]) ||
    "";
  const rawSections = req.body?.sections || project.answers["sections"];
  const parsedSections = safeParseObject(rawSections);

  try {
    const combinedContent = [question, briefText, rubricText].filter(Boolean).join("\n\n").trim();
    const ledger: DocumentRequirement[] = await auditDocumentLineByLine(combinedContent);

    // 1. Command Verbs & Examiner Demands (mapped from category === 'prompt')
    const promptItems = ledger.filter((item) => item.category === "prompt" && !isClassroomLogisticsLine(item.verbatimText));
    const commandVerbs: CommandVerbDetail[] = [];
    const verbSeen = new Set<string>();

    for (const item of promptItems) {
      const lower = item.verbatimText.toLowerCase();
      let matched = false;
      for (const [verbKey, verbVal] of Object.entries(COMMAND_VERB_MAP)) {
        if (new RegExp(`\\b${verbKey}\\b`, "i").test(lower) && !verbSeen.has(verbKey)) {
          verbSeen.add(verbKey);
          matched = true;
          commandVerbs.push({
            verb: verbKey.charAt(0).toUpperCase() + verbKey.slice(1),
            meaning: verbVal.meaning,
            academicExpectation: `${verbVal.expectation} (${item.lineRange})`,
          });
        }
      }
      if (!matched && !verbSeen.has(item.lineRange)) {
        verbSeen.add(item.lineRange);
        commandVerbs.push({
          verb: "Task Directive",
          meaning: "Directly answer the specified task requirement from the brief.",
          academicExpectation: `${item.verbatimText} (${item.lineRange})`,
        });
      }
    }

    if (commandVerbs.length === 0) {
      commandVerbs.push(
        {
          verb: "Critically evaluate",
          meaning: "Weigh competing theoretical arguments and empirical evidence to judge their validity.",
          academicExpectation: "You must not merely describe; synthesize counterarguments and substantiate a justified academic conclusion.",
        },
        {
          verb: "Analyse",
          meaning: "Break down complex issues into component parts to examine relationships and causes.",
          academicExpectation: "Explain 'how' and 'why' with methodological rigor, avoiding superficial summary.",
        }
      );
    }

    // 2. Key Conceptual Scope & Boundaries (Green: What to Focus On vs Orange: What to Avoid)
    const rawQuestions = promptItems.map((p) => p.verbatimText);
    const scope = classifyScopeBoundaries(combinedContent, rawQuestions);
    const included: string[] = [...scope.included];
    const excluded: string[] = [...scope.excluded];

    // 3. Rubric Rules & Grade Bands (mapped from category === 'rubric_band' and category === 'penalty')
    const rubricItems = ledger.filter((item) => item.category === "rubric_band");
    const penaltyItems = ledger.filter((item) => item.category === "penalty");
    const markingCriteriaInsights: string[] = [];

    const substantiveRubricItems = rubricItems.filter((r) => {
      const text = r.verbatimText.trim();
      if (text.length < 15) return false;
      if (/^\(?\d+%\s*[-–]\s*\d+%\)?$/i.test(text)) return false;
      if (/^part\s+\d+/i.test(text)) return false;
      if (/^criteria\s*&\s*weight/i.test(text)) return false;
      return true;
    });

    // Only what the brief states: when it gives no marking criteria, none
    // are invented (generic UK grade bands used to be shown as if they were).
    if (substantiveRubricItems.length > 0) {
      markingCriteriaInsights.push(...substantiveRubricItems.map((r) => `${r.lineRange} ${r.verbatimText}`).slice(0, 6));
    }

    if (penaltyItems.length > 0) {
      markingCriteriaInsights.push(
        ...penaltyItems.map((p) => `🚨 Detected Assessment Penalty: ${p.lineRange} ${p.verbatimText}`)
      );
    }

    // 4. Formatting & Word Budget (mapped from category === 'formatting')
    const targetWords = Number(targetWordCount) || (isTutorial ? 400 : 2000);
    const introWords = parsedSections?.intro?.targetWords ?? Math.round(targetWords * 0.10);
    const conclWords = parsedSections?.conclusion?.targetWords ?? Math.round(targetWords * 0.15);
    const bodyWords = parsedSections?.body?.targetWords ?? Math.max(0, targetWords - introWords - conclWords);

    const formattingRules = ledger
      .filter((item) => item.category === "formatting")
      .map((item) => `${item.lineRange} ${item.verbatimText}`);

    const customSectionNote = parsedSections?.isCustomized ? " Section allocations customized by student." : "";
    const wordCountImplications = `Target: ${targetWords.toLocaleString()} words (Intro: ~${introWords}w, Body: ~${bodyWords}w, Conclusion: ~${conclWords}w). Standard ±10% penalty threshold applies.${customSectionNote}${
      formattingRules.length > 0 ? ` Detected Rules: ${formattingRules.join(" | ")}` : ""
    }`;

    const citationGuidance = `Format all in-text citations and reference list strictly according to ${citationStyle.toUpperCase()} conventions.${
      formattingRules.some((r) => new RegExp(citationStyle, "i").test(r)) ? " Confirmed in assignment brief." : ""
    }`;

    // 5. Concepts, Expected Response Type, Evidence Requirements, Summary
    const isQuantum = /quantum|qubit|superconducting|trapped-ion|shor|grover|qec|surface code|nisq|post-quantum|qkd/i.test(combinedContent);
    const isExamOrQuestionnaire = /examination|questionnaire|question\s*1|part\s*1|marks\b/i.test(combinedContent);

    const keyConcepts = isQuantum
      ? [
          "Superconducting Transmon vs Trapped-Ion Physical Realisations",
          "NISQ Hardware Limits & Error Mitigation (ZNE/PEC/CDR)",
          "Quantum Algorithmic Complexity (BQP, Shor & Grover)",
          "Planar Surface Codes & Fault-Tolerant Threshold Theorem",
          "Quantum Key Distribution (BB84) & Post-Quantum Cryptography (FIPS 203)",
        ]
      : [
          "Theoretical Framework",
          "Empirical Evidence",
          "Critical Synthesis",
          "Methodological Rigor",
          "Counterargument Evaluation",
        ];

    const expectedResponseType = isExamOrQuestionnaire
      ? "Rigorous, structured technical answers solving all examination questions systematically with theoretical frameworks, mathematical rigor, and standard Harvard referencing."
      : assignmentType === "case_study"
      ? "Strategic case analysis diagnosing root causes, evaluating alternatives, and proposing an implementation roadmap."
      : assignmentType === "report" || assignmentType === "business_assignment"
      ? "Structured professional report with numbered subheadings, empirical findings, and actionable SMART recommendations."
      : assignmentType === "reflection"
      ? "Critical reflective analysis connecting experiential practice with pedagogical and disciplinary theory (e.g. Gibbs' cycle)."
      : assignmentType === "lab_report"
      ? "Scientific laboratory report following IMRaD structure with empirical hypothesis testing and error analysis."
      : "Dialectical academic essay advancing a central argumentative thesis substantiated by peer-reviewed evidence.";

    const evidenceRequirements = isQuantum
      ? "Authoritative quantum computing literature (e.g. Preskill 2018, Nielsen & Chuang 2010, Fowler et al. 2012, Shor 1994, Arute et al. 2019, Gidney & Ekerå 2021) adhering to Harvard style."
      : academicLevel === "postgraduate"
      ? "High-impact peer-reviewed journal articles, foundational theoretical monographs, and authoritative empirical datasets."
      : "Authoritative academic sources, scholarly peer-reviewed journals, and verified institutional benchmark data.";

    const academicLevelNotes = isQuantum
      ? "Calibrated for Honours / Postgraduate Quantum Information Systems examination standards. Demands mathematical precision, physical circuit mechanics, and rigorous theoretical grounding."
      : academicLevel === "postgraduate"
      ? "Calibrated for Postgraduate / Masters study: demands high theoretical synthesis, methodological reflexivity, nuanced hedging, and original critical insight."
      : "Calibrated for Undergraduate study: emphasizes conceptual clarity, structured logical flow, accurate evidence deployment, and clear thesis progression.";

    const penaltyNote = penaltyItems.length > 0 ? ` Note: ${penaltyItems.length} specific penalty clause(s) identified.` : "";

    const summary = `The examiner requires a rigorous ${assignmentType.replace(/_/g, " ")} addressing "${question.slice(
      0,
      140
    )}...". The submission must reflect ${academicLevel} standards, deploy ${citationStyle.toUpperCase()} referencing, and deliver disciplined analysis within the ${targetWords}-word budget.${penaltyNote}`;

    const finalAnalysis: AssignmentAnalysis = {
      commandVerbs,
      summary,
      keyConcepts,
      scopeBoundaries: {
        included: included.slice(0, 8),
        excluded: excluded.slice(0, 8),
      },
      expectedResponseType,
      evidenceRequirements,
      markingCriteriaInsights,
      wordCountImplications,
      citationGuidance,
      academicLevelNotes,
      approvedByUser: false,
      briefLedger: ledger,
    };

    // 6. Persist the ledger in the project JSONB answers under assignment_analysis and brief_ledger
    const derivedTitle = await deriveSemanticAcademicTitle(question || briefText, req);
    const updatedTitle = await autoUpdateProjectTitleIfUntitled(project, derivedTitle);

    project.answers = {
      ...project.answers,
      instructions: String(question),
      assignment_question: String(question),
      assignment_brief_text: String(briefText),
      research_topic: String(question),
      assignment_brief: String(question),
      academicLevel: String(academicLevel),
      academic_level: String(academicLevel),
      assignmentType: String(assignmentType),
      assignment_type: String(assignmentType),
      targetWordCount: String(targetWords),
      target_word_count: String(targetWords),
      word_count: String(targetWords),
      word_limit: String(targetWords),
      citationStyle: String(citationStyle),
      citation_style: String(citationStyle),
      marking_rubric: String(rubricText),
      assignment_analysis: JSON.stringify(finalAnalysis),
      brief_ledger: JSON.stringify(ledger),
      ...(parsedSections ? { sections: parsedSections } : {}),
      ...(updatedTitle ? { title: updatedTitle, assignment_title: updatedTitle } : {}),
    };

    // The outline is written by the student's AI from the whole brief. When
    // no AI answers, the offline starter outline is used and marked as such,
    // so the workspace can say it is not from the brief.
    const criteriaLines = substantiveRubricItems.map((r) => r.verbatimText);
    const discipline =
      (typeof project.answers["assignment_discipline"] === "string" && project.answers["assignment_discipline"]) ||
      scopeBrief(`${question} ${briefText}`).discipline;
    let structure = undefined as ReturnType<typeof structureFromAi>;
    let outlineNote: string | undefined;
    try {
      const aiText = await routedCompletion(req, {
        task: "drafting",
        systemPrompt: assignmentOutlinePrompt(),
        userPrompt: assignmentOutlineUserPrompt({
          brief: briefText,
          question,
          assignmentType: String(assignmentType),
          academicLevel: String(academicLevel),
          discipline: discipline || undefined,
          citationStyle,
          targetWords,
          criteria: criteriaLines,
        }),
      });
      structure = structureFromAi(aiText ?? "", targetWords);
      if (!structure) outlineNote = "Your AI's answer had no usable outline, so a starter outline is shown.";
    } catch (llmErr) {
      console.warn("AI outline call failed:", llmErr instanceof Error ? llmErr.message : llmErr);
      outlineNote = "No AI answered, so a starter outline is shown. Connect an AI and rebuild it from your brief.";
    }
    if (!structure) {
      structure = {
        ...generateDynamicAssignmentStructure({ question, assignmentType: assignmentType as any, academicLevel: academicLevel as any, targetWordCount: targetWords, citationStyle, briefText }),
        source: "starter",
      };
    }

    project.answers.assignment_structure = JSON.stringify(structure);
    project.answers.structure = JSON.stringify(structure);
    project.answers.target_frameworks = JSON.stringify(structure.targetFrameworks || []);
    if (project.answers.assignment_internal_sections) {
      delete project.answers.assignment_internal_sections;
    }
    if (project.answers.assignment_outline) {
      delete project.answers.assignment_outline;
    }

    await getProjectStore().save(project);

    res.json({
      ...finalAnalysis,
      briefLedger: ledger,
      updatedTitle: updatedTitle || project.answers?.["title"] || (project as any).title,
      structure,
      outlineSource: structure.source,
      outlineNote,
      targetFrameworks: structure.targetFrameworks || [],
      sections: assignmentStructureToOutlineTree(structure).sections,
    });
  } catch (err: any) {
    console.error("Assignment deconstruction error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to deconstruct assignment brief" });
    }
  }
};

router.post("/analyze", handleDeconstruct);

/**
 * POST /api/projects/:id/assignment/outline  { instruction? }
 * Writes the outline from the brief with the student's AI, or revises the
 * current one as asked ("add a section on ethics", "make it 3,000 words").
 * Text already written is kept. Saves and returns the new outline.
 */
router.post("/outline", async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;
  const raw = req.body?.instruction;
  const instruction = typeof raw === "string" ? raw.trim().slice(0, 600) || undefined : undefined;
  const a = project.answers;
  const question = cleanAnswerString(a["assignment_question"]) || extractStandardizedInstructions(a);
  const briefText = cleanAnswerString(a["assignment_brief_text"]) || question;
  if (!briefText || briefText.trim().length < 10) {
    return res.status(400).json({ error: "Add your assignment brief first, so the outline can be about your assignment.", code: "missing_brief" });
  }
  const targetWords = Number(a["targetWordCount"] || a["word_count"] || a["word_limit"] || 1500) || 1500;
  const assignmentType = String(a["assignmentType"] || a["assignment_type"] || "essay");
  const current = safeParseObject(a["assignment_structure"] || a["structure"]) as any;
  const previous = (safeParseObject(a["assignment_internal_sections"]) as AssignmentDraftingSection[] | undefined) ?? [];
  const ledger = safeParseObject(a["brief_ledger"]) as Array<{ category?: string; verbatimText?: string }> | undefined;
  const criteria = (Array.isArray(ledger) ? ledger : []).filter((l) => l.category === "rubric_band" && (l.verbatimText ?? "").length >= 15).map((l) => String(l.verbatimText));
  const discipline =
    (typeof a["assignment_discipline"] === "string" && a["assignment_discipline"]) || scopeBrief(`${question} ${briefText}`).discipline;

  try {
    const aiText = await routedCompletion(req, {
      task: "drafting",
      systemPrompt: assignmentOutlinePrompt(),
      userPrompt: assignmentOutlineUserPrompt({
        brief: briefText,
        question,
        assignmentType,
        academicLevel: String(a["academicLevel"] || a["academic_level"] || "undergraduate"),
        discipline: discipline || undefined,
        citationStyle: cleanAnswerString(a["citationStyle"] || a["citation_style"]) || undefined,
        targetWords,
        criteria,
        instruction,
        current: current?.headings?.length ? current : null,
        written: Array.isArray(previous) ? previous.filter((p) => (p.draftContent ?? "").trim()).map((p) => p.id) : [],
      }),
    });
    const structure = structureFromAi(aiText ?? "", targetWords, { instruction, previous: Array.isArray(previous) ? previous : [] });
    if (!structure) return sendAiFailure(res, new UnusableAiResponseError("outline"), "Outline");
    structure.version = (Number(current?.version) || 0) + 1;
    project.answers.assignment_structure = JSON.stringify(structure);
    project.answers.structure = JSON.stringify(structure);
    if (structure.targetWordCount !== targetWords) project.answers.targetWordCount = String(structure.targetWordCount);
    delete project.answers.assignment_internal_sections;
    delete project.answers.assignment_outline;
    await getProjectStore().save(project);
    res.json({ structure });
  } catch (err) {
    sendAiFailure(res, err, "Outline");
  }
});
router.post("/deconstruct", handleDeconstruct);

export default router;
