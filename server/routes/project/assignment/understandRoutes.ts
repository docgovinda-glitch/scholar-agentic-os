import express from "express";
import { applyMarksBudget } from "../../../../src/domain/assignment/outlineBudget.ts";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { scopeBrief, structureLens } from "../../../../src/domain/assignment/briefScoping.ts";
import { callOpenRouterJSON, callOpenRouterText, getCandidates, buildAuthorizedPolicy, resolveRequestAiConfig } from "../../../src/services/scholarBrain.ts";
import { completeWithFailover } from "../../../../src/platform/gateway/gateway.ts";
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

router.post("/plan", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const question = extractProjectInstructions(project, req.body);
  const academicLevel =
    req.body?.academicLevel ||
    project.answers["academicLevel"] ||
    project.answers["academic_level"] ||
    "undergraduate";
  const assignmentType =
    req.body?.assignmentType ||
    project.answers["assignmentType"] ||
    project.answers["assignment_type"] ||
    "essay";
  const analysis = req.body?.analysis || project.answers["assignment_analysis"];
  const rawSections = req.body?.sections || project.answers["sections"];
  const parsedSections = safeParseObject(rawSections);

  const sectionGuidanceNotes = parsedSections?.isCustomized
    ? [
        parsedSections.intro?.guidelines ? `Intro: ${parsedSections.intro.guidelines}` : null,
        parsedSections.body?.guidelines ? `Body Paragraphs: ${parsedSections.body.guidelines}` : null,
        parsedSections.conclusion?.guidelines ? `Conclusion: ${parsedSections.conclusion.guidelines}` : null,
      ].filter(Boolean).join(" | ")
    : "";

  try {
    const prompt = `You are the Scholar Core Assignment Research Planning Agent.
Develop an actionable research plan for this university assignment:

Question: "${question}"
Type: ${assignmentType}
Level: ${academicLevel}
Analysis Context: ${typeof analysis === "string" ? analysis : JSON.stringify(analysis || {})}
${sectionGuidanceNotes ? `Student Section-Specific Guidance Notes: ${sectionGuidanceNotes}\n` : ""}

Formulate:
1. 3 to 5 dialectical Core Research Questions (id, question, rationale, category).
2. 4 to 6 Recommended Search Strategies (id, database, searchQuery with Boolean operators, relevanceTarget).
3. Main theoretical and empirical concepts.
4. Key scholarly debates or points of contention.
5. Specific evidence types needed (peer-reviewed articles, institutional data, case studies).
6. Clear out-of-scope topics that the student should NOT spend time researching.

Return ONLY valid JSON matching:
{
  "coreQuestions": [
    {
      "id": "q-1",
      "question": "...",
      "rationale": "...",
      "category": "Theoretical Foundation"
    }
  ],
  "mainConcepts": ["...", "..."],
  "keyDebates": ["...", "..."],
  "evidenceTypesNeeded": ["...", "..."],
  "searchStrategies": [
    {
      "id": "strat-1",
      "database": "Google Scholar",
      "searchQuery": "\\"...\\" AND \\"...\\"",
      "relevanceTarget": "..."
    }
  ],
  "outOfScopeTopics": ["...", "..."],
  "approvedByUser": false
}`;

    let plan: any = null;
    try {
      plan = await callOpenRouterJSON(
        req,
        res,
        "You are the Scholar Core Assignment Research Planning Agent.",
        prompt,
        undefined,
        "planning"
      );
    } catch (e: any) {
      if (e?.message !== "RequireFrontendLLMException") {
        console.warn("LLM research plan generation unavailable, using adaptive planner:", e?.message);
      }
    }

    if (!plan || !plan.coreQuestions || plan.coreQuestions.length === 0) {
      plan = buildDeterministicResearchPlan(question, assignmentType, academicLevel, analysis);
    }

    // Persist to project.answers.assignment_plan & assignment_research_plan
    project.answers = {
      ...project.answers,
      assignment_plan: JSON.stringify(plan),
      assignment_research_plan: JSON.stringify(plan),
    };
    await getProjectStore().save(project);

    res.json(plan);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Research plan error:", err);
    if (!res.headersSent) {
      const fallback = buildDeterministicResearchPlan(question, assignmentType, academicLevel, analysis);
      project.answers = {
        ...project.answers,
        assignment_plan: JSON.stringify(fallback),
        assignment_research_plan: JSON.stringify(fallback),
      };
      await getProjectStore().save(project);
      res.json(fallback);
    }
  }
});


// 4. POST /api/projects/:id/assignment/think
router.post("/think", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    assignmentType = project.answers["assignment_type"] || "essay",
    sources = project.answers["assignment_sources"] || [],
    evidence = project.answers["assignment_evidence_items"] || [],
  } = req.body || {};

  try {
    const prompt = `You are the Scholar Core Academic Thinking & Critique Agent.
Synthesize the scholarly landscape and help the student construct their critical argument and thesis.

Question: "${question}"
Assignment Type: ${assignmentType}
Academic Level: ${academicLevel}
Approved Sources/Evidence: ${JSON.stringify(evidence)}

Identify:
1. 2-4 distinct scholarly perspectives / schools of thought on this question. For each, identify their core argument, strengths, weaknesses, and underlying assumptions.
2. Key points of consensus and major points of theoretical/empirical disagreement.
3. 3 distinct, academically rigorous Thesis Statement options (from moderate to bold/critical), with explanations of how they defend against counterarguments.

Return ONLY valid JSON matching:
{
  "perspectives": [
    {
      "id": "persp-1",
      "schoolOfThought": "...",
      "keyProponents": ["..."],
      "coreArgument": "...",
      "strengths": ["..."],
      "weaknesses": ["..."],
      "underlyingAssumptions": ["..."]
    }
  ],
  "agreements": ["...", "..."],
  "disagreements": ["...", "..."],
  "contradictions": ["...", "..."],
  "thesisOptions": [
    {
      "id": "thesis-1",
      "statement": "...",
      "rationale": "...",
      "counterargumentHandling": "..."
    }
  ]
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Academic Thinking & Critique Agent.",
      prompt,
      undefined,
      "reasoning"
    );
    if (!data) return;
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Thinking synthesis error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to generate thinking synthesis" });
    }
  }
});

// 5. POST /api/projects/:id/assignment/structure & /generate-outline
const handleStructure = async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  let thinkingThesis = "";
  try {
    const rawThinking = project.answers["assignment_thinking_map"];
    if (rawThinking) {
      const parsed = typeof rawThinking === "string" ? JSON.parse(rawThinking) : rawThinking;
      thinkingThesis = parsed?.customThesis || "";
    }
  } catch (_) {}

  const {
    question = project.answers["assignment_question"] || "",
    assignmentType = project.answers["assignment_type"] || "essay",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    targetWordCount = project.answers["word_count"] || 2000,
    thesis = thinkingThesis,
    sections: reqSections,
  } = req.body || {};

  const rawSections = reqSections || project.answers["sections"];
  const parsedSections = safeParseObject(rawSections);

  const customAllocationPrompt = parsedSections?.isCustomized
    ? `User-Specified Section Word Counts & Custom Guidelines:
- Introduction: ~${parsedSections.intro.targetWords} words${parsedSections.intro.guidelines ? ` (Notes: "${parsedSections.intro.guidelines}")` : ""}
- Body Sections Total: ~${parsedSections.body.targetWords} words${parsedSections.body.guidelines ? ` (Notes: "${parsedSections.body.guidelines}")` : ""}
- Conclusion: ~${parsedSections.conclusion.targetWords} words${parsedSections.conclusion.guidelines ? ` (Notes: "${parsedSections.conclusion.guidelines}")` : ""}

CRITICAL: You MUST divide the target word counts across the sections to strictly adhere to the user's custom section allocations above, and incorporate their specific notes into the section guidance!`
    : `Divide the ${targetWordCount} target words proportionally across the sections (e.g. Introduction ~10%, Body sections ~75%, Conclusion ~15%). The sum of targetWordCounts MUST equal approximately ${targetWordCount}.`;

  // The subject the student chose (or the brief states) shapes the headings,
  // instead of one generic template for every assignment.
  const chosenDiscipline =
    (typeof project.answers["assignment_discipline"] === "string" && project.answers["assignment_discipline"]) ||
    scopeBrief(`${question} ${cleanAnswerString(project.answers["assignment_brief_text"]) || ""}`).discipline;
  const subjectLens = structureLens(chosenDiscipline, String(assignmentType));

  try {
    const briefText = cleanAnswerString(project.answers["assignment_brief_text"]) || question;
    const isCourseworkWorkspace =
      assignmentType === "coursework" ||
      assignmentType === "business_assignment" ||
      assignmentType === "report" ||
      assignmentType === "case_study" ||
      question.toLowerCase().includes("coursework");

    // 1. Conduct deep Ask Scholar literature and inquiry research
    const askScholarResearch = conductAskScholarResearchForOutline({
      question,
      briefText,
      assignmentType,
      academicLevel,
      targetWordCount: Number(targetWordCount) || 2000,
    });

    const sourcesSummary = askScholarResearch.sources
      .slice(0, 6)
      .map(
        (s) =>
          `  - ${s.citation}: "${s.title}" (${s.journalOrPublisher || "Academic Press"}, ${s.year}) [Role: ${s.role}] -> ${s.relevance || s.keyFinding || ""}`
      )
      .join("\n");

    const inquiriesSummary = askScholarResearch.subQuestions
      .map((sq, idx) => `  Inquiry ${idx + 1}: "${sq}"`)
      .join("\n");

    const prompt = `You are the Scholar Core AskScholar Research Architect & Thesis Supervisor.
Your role is to think through the assignment instructions, interrogate the core analytical questions, conduct targeted scholarly research, and build an assignment-specific RESEARCH BLUEPRINT.

CORE ARCHITECTURAL RULES:
1. STRICT BAN ON GENERIC ACADEMIC TEMPLATES: Do NOT generate generic templates like "Introduction -> Literature Review -> Methodology -> Analysis -> Conclusion". Headings must emerge directly from the intellectual problem of the assignment (${askScholarResearch.inquiryType}).
2. EXPLICIT ASSIGNMENT-QUESTION MAPPING: Every major section MUST exist because it is directly required to answer a specific assignment inquiry:
   Assignment Question -> Analytical Objective -> Research Needed -> Key Arguments/Issues -> Relevant Sources -> Proposed Section
3. RESEARCH BLUEPRINT DEPTH:
   For every main section and subsection, provide:
   - title: substantive, content-driven domain title
   - purpose: exact purpose and what this section demonstrates
   - assignmentQuestionAddressed: which specific assignment inquiry it answers
   - analyticalObjective: analytical goal (explain, compare, evaluate, analyse, or argue)
   - keyTheories: analytical models or frameworks applied
   - keyArguments: 3 concrete analytical issues or arguments (also put in keyPoints)
   - evidenceRequired: specific empirical data, observational cases, or literature needed
   - counterarguments: rival schools of thought or competing interpretations
   - expectedContribution: how this section drives towards defending the central thesis
   - scholarlySources: citations from the verified Ask Scholar literature pool below
4. WORKSPACE ADAPTATION:
   ${
     isCourseworkWorkspace
       ? `COURSEWORK WORKSPACE: Align with rubric criteria, module learning outcomes, diagnostic problem decomposition, applied analytical frameworks, empirical evaluation, and actionable strategic recommendations.`
       : `ESSAY WORKSPACE: Formulate an original intellectual architecture specifically tailored to this assignment inquiry (whether comparative, causal, theoretical, policy, or case-driven). Ground every section title directly in the substantive problem and core concepts.`
   }
5. WORD ALLOCATIONS:
   The sum of all subheading targetWordCounts MUST equal approximately ${targetWordCount}.

${subjectLens}

ASSIGNMENT INTAKE:
- Question: "${question}"
- Assignment Type: ${assignmentType}
- Academic Level: ${academicLevel}
- Target Word Count: ${targetWordCount} words
- Central Thesis: "${thesis || askScholarResearch.centralProblem}"
- Central Intellectual Problem: "${askScholarResearch.centralProblem}"
- Core Analytical Inquiries:
${inquiriesSummary}
- Discovered Ask Scholar Literature (Grounding Citations):
${sourcesSummary}
- Core Scholarly Debates: ${askScholarResearch.coreDebates.join(" | ")}

${customAllocationPrompt}

Return ONLY valid JSON matching:
{
  "thesis_statement": "Working thesis answering the prompt",
  "target_frameworks": ["Framework 1", "Framework 2"],
  "structure": {
    "version": 1,
    "isConfirmed": false,
    "targetWordCount": ${targetWordCount},
    "totalAllocated": ${targetWordCount},
    "rationale": "Why this research blueprint addresses the assignment inquiries",
    "headings": [
      {
        "id": "heading-1",
        "number": 1,
        "title": "Substantive Domain H1 Title",
        "purpose": "Purpose of section answering assignment question",
        "assignmentQuestionAddressed": "Assignment inquiry addressed",
        "analyticalObjective": "Analytical objective",
        "keyTheories": ["Theory A"],
        "keyArguments": ["Argument 1", "Argument 2", "Argument 3"],
        "evidenceRequired": "Evidence required",
        "counterarguments": ["Rival perspective"],
        "expectedContribution": "Contribution to thesis",
        "notes": "Guidance notes",
        "targetWordCount": 700,
        "subheadings": [
          {
            "id": "sub-1-1",
            "headingId": "heading-1",
            "numberStr": "1.1",
            "title": "Substantive Analytical H2 Title",
            "purpose": "Purpose of subsection",
            "assignmentQuestionAddressed": "Assignment inquiry addressed",
            "analyticalObjective": "Analytical objective",
            "keyTheories": ["Theory A"],
            "keyArguments": ["Argument 1", "Argument 2", "Argument 3"],
            "evidenceRequired": "Evidence required",
            "counterarguments": ["Rival perspective"],
            "expectedContribution": "Contribution to thesis",
            "targetWordCount": 350,
            "currentWordCount": 0,
            "notes": "",
            "guidance": "Detailed analytical guidance",
            "keyPoints": ["Argument 1", "Argument 2", "Argument 3"],
            "researchStatus": "sufficient"
          }
        ]
      }
    ]
  },
  "sections": [
    {
      "level": "h1",
      "title": "Substantive Domain H1 Title",
      "guidance": "Guidance notes",
      "children": [
        {
          "level": "h2",
          "title": "Substantive Analytical H2 Title",
          "guidance": "Detailed analytical guidance",
          "children": [
            { "level": "h3", "title": "Evidence Descriptor 1" },
            { "level": "h3", "title": "Evidence Descriptor 2" },
            { "level": "h3", "title": "Evidence Descriptor 3" }
          ]
        }
      ]
    }
  ]
}`;

    const data: any = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core AskScholar Research Architect & Thesis Supervisor.",
      prompt,
      undefined,
      "planning"
    );
    if (!data) return;

    let finalStructure: any = null;

    if (data.sections && Array.isArray(data.sections) && (!data.structure || !data.structure.headings)) {
      finalStructure = outlineTreeToAssignmentStructure(
        {
          thesis_statement: data.thesis_statement || data.thesisStatement || thesis,
          target_frameworks: data.target_frameworks || data.targetFrameworks || [],
          sections: data.sections,
          targetWordCount: Number(targetWordCount) || 2000,
        },
        Number(targetWordCount) || 2000
      );
    } else if (data.structure && data.structure.headings && Array.isArray(data.structure.headings)) {
      finalStructure = data.structure;
    }

    if (finalStructure) {
      const topicForCheck = [question, briefText].join(" ");
      if (isCorruptedOutlineHeadings(finalStructure.headings, topicForCheck)) {
        console.warn("[assignment.ts] Leaked or corrupted outline headings detected. Discarding and using dynamic assignment structure generator.");
        finalStructure = null;
      }
    }

    if (finalStructure) {
      finalStructure.headings = sanitizeOutlineHeadings(finalStructure.headings, question, assignmentType);
      // AI-invented word counts are replaced by the marks pipeline (clean multiples, exact sum).
      finalStructure = applyMarksBudget(finalStructure, briefText || question);
      finalStructure.targetFrameworks =
        data.target_frameworks ||
        data.targetFrameworks ||
        finalStructure.targetFrameworks ||
        [];
      finalStructure.thesisStatement =
        data.thesis_statement ||
        data.thesisStatement ||
        finalStructure.thesisStatement ||
        thesis;

      // Backfill Ask Scholar Research Blueprint fields if missing
      finalStructure.researchBlueprintOverview = {
        centralProblem: askScholarResearch.centralProblem,
        analyticalComponents: askScholarResearch.analyticalComponents,
        inquiryType: askScholarResearch.inquiryType,
        coreDebates: askScholarResearch.coreDebates,
        expectedOutcomes: askScholarResearch.expectedOutcomes,
        qualityControlChecklist: askScholarResearch.qualityControlChecklist,
      };
      finalStructure.questionMappingMatrix = askScholarResearch.questionMappingMatrix;

      finalStructure.headings.forEach((h: any, hIdx: number) => {
        const mappingItem =
          askScholarResearch.questionMappingMatrix[hIdx] ||
          askScholarResearch.questionMappingMatrix[hIdx % Math.max(1, askScholarResearch.questionMappingMatrix.length)];
        const headingSources = askScholarResearch.sources.slice(hIdx * 2, hIdx * 2 + 3);

        if (!h.purpose) h.purpose = `Investigate and substantiate ${h.title} to answer: "${mappingItem.assignmentQuestion}".`;
        if (!h.assignmentQuestionAddressed) h.assignmentQuestionAddressed = mappingItem.assignmentQuestion;
        if (!h.analyticalObjective) h.analyticalObjective = mappingItem.analyticalObjective;
        if (!h.keyTheories || h.keyTheories.length === 0) h.keyTheories = finalStructure.targetFrameworks;
        if (!h.evidenceRequired) h.evidenceRequired = mappingItem.researchNeeded;
        if (!h.keyArguments || h.keyArguments.length === 0) h.keyArguments = mappingItem.keyArguments;
        if (!h.counterarguments || h.counterarguments.length === 0) {
          h.counterarguments = [askScholarResearch.coreDebates[hIdx % askScholarResearch.coreDebates.length] || "Alternative interpretations"];
        }
        if (!h.expectedContribution) h.expectedContribution = `Directly answers inquiry dimension ${hIdx + 1} and substantiates the thesis.`;
        if (!h.scholarlySources || h.scholarlySources.length === 0) h.scholarlySources = headingSources;

        if (h.subheadings && Array.isArray(h.subheadings)) {
          h.subheadings.forEach((s: any, sIdx: number) => {
            const subSources = headingSources.slice(sIdx, sIdx + 2);
            if (!s.purpose) s.purpose = s.guidance || `Detailed analysis of ${s.title}.`;
            if (!s.assignmentQuestionAddressed) s.assignmentQuestionAddressed = h.assignmentQuestionAddressed;
            if (!s.analyticalObjective) s.analyticalObjective = h.analyticalObjective;
            if (!s.keyTheories || s.keyTheories.length === 0) s.keyTheories = h.keyTheories;
            if (!s.evidenceRequired) s.evidenceRequired = h.evidenceRequired;
            if (!s.keyArguments || s.keyArguments.length === 0) s.keyArguments = s.keyPoints || h.keyArguments;
            if (!s.counterarguments || s.counterarguments.length === 0) s.counterarguments = h.counterarguments;
            if (!s.expectedContribution) s.expectedContribution = `Contributes focused analysis of ${s.title} towards defending the thesis.`;
            if (!s.scholarlySources || s.scholarlySources.length === 0) s.scholarlySources = subSources;
            s.boundSourceIds = s.scholarlySources.map((src: any) => src.id);
            s.sourcesCount = s.scholarlySources.length;
            s.researchStatus = s.sourcesCount > 0 ? "sufficient" : "not_researched";
          });
        }
      });

      // Persist in project answers
      project.answers.assignment_structure = JSON.stringify(finalStructure);
      project.answers.structure = JSON.stringify(finalStructure);
      if (project.answers.assignment_internal_sections) {
        delete project.answers.assignment_internal_sections;
      }
      if (project.answers.assignment_outline) {
        delete project.answers.assignment_outline;
      }
      await getProjectStore().save(project);

      const storedMarkAlloc = project.answers["mark_allocation"];
      const markAllocation = storedMarkAlloc
        ? safeParseObject(storedMarkAlloc)
        : scholarBrain.allocateWordsByMarks(
            [question],
            Number(targetWordCount) || 2000
          );

      const tree = assignmentStructureToOutlineTree(finalStructure);
      return res.json({
        structure: finalStructure,
        outline: structureToInternalSections(finalStructure),
        sections: tree.sections,
        target_frameworks: finalStructure.targetFrameworks,
        thesis_statement: finalStructure.thesisStatement,
        research_blueprint: finalStructure.researchBlueprintOverview,
        question_mapping: finalStructure.questionMappingMatrix,
        mark_allocation: markAllocation,
      });
    }

    const isTutorial = isTutorialOrShortQABrief(briefText) || isTutorialOrShortQABrief(question);
    const computedTargetWords = Number(targetWordCount) || (isTutorial ? 400 : 2000);
    const fallbackStructure = generateDynamicAssignmentStructure({
      question,
      assignmentType,
      academicLevel,
      targetWordCount: computedTargetWords,
      briefText,
    });
    project.answers.assignment_structure = JSON.stringify(fallbackStructure);
    project.answers.structure = JSON.stringify(fallbackStructure);
    if (project.answers.assignment_internal_sections) {
      delete project.answers.assignment_internal_sections;
    }
    if (project.answers.assignment_outline) {
      delete project.answers.assignment_outline;
    }
    await getProjectStore().save(project);

    const storedMarkAlloc = project.answers["mark_allocation"];
    const markAllocation = storedMarkAlloc
      ? safeParseObject(storedMarkAlloc)
      : scholarBrain.allocateWordsByMarks(
          [question],
          computedTargetWords
        );

    const fallbackTree = assignmentStructureToOutlineTree(fallbackStructure);
    return res.json({
      structure: fallbackStructure,
      outline: structureToInternalSections(fallbackStructure),
      sections: fallbackTree.sections,
      target_frameworks: fallbackStructure.targetFrameworks || [],
      thesis_statement: fallbackStructure.thesisStatement,
      research_blueprint: fallbackStructure.researchBlueprintOverview,
      question_mapping: fallbackStructure.questionMappingMatrix,
      mark_allocation: markAllocation,
    });
  } catch (err: any) {
    const briefText = cleanAnswerString(project.answers["assignment_brief_text"]) || question;
    const isTutorial = isTutorialOrShortQABrief(briefText) || isTutorialOrShortQABrief(question);
    const computedTargetWords = Number(targetWordCount) || (isTutorial ? 400 : 2000);
    const fallbackStructure = generateDynamicAssignmentStructure({
      question,
      assignmentType,
      academicLevel,
      targetWordCount: computedTargetWords,
      briefText,
    });
    const fallbackTree = assignmentStructureToOutlineTree(fallbackStructure);
    const storedMarkAlloc = project.answers["mark_allocation"];
    const markAllocation = storedMarkAlloc
      ? safeParseObject(storedMarkAlloc)
      : scholarBrain.allocateWordsByMarks(
          [question],
          computedTargetWords
        );

    if (err?.message === "RequireFrontendLLMException" || res.headersSent) {
      return;
    }
    console.error("Structure generation error:", err);
    if (!res.headersSent) {
      res.json({
        structure: fallbackStructure,
        outline: structureToInternalSections(fallbackStructure),
        sections: fallbackTree.sections,
        target_frameworks: fallbackStructure.targetFrameworks || [],
        thesis_statement: fallbackStructure.thesisStatement,
        mark_allocation: markAllocation,
      });
    }
  }
};

router.post("/structure", handleStructure);
router.post("/generate-outline", handleStructure);

// 5b. GET /api/projects/:id/assignment/structure
router.get("/structure", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const topic = [
    project.answers["assignment_question"],
    project.answers["assignment_brief_text"],
    project.answers["instructions"],
  ]
    .filter(Boolean)
    .join(" ");

  const raw = project.answers?.["assignment_structure"] || project.answers?.["structure"];
  if (raw) {
    try {
      const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
      if (parsed?.headings && !isCorruptedOutlineHeadings(parsed.headings, topic)) {
        const tree = assignmentStructureToOutlineTree(parsed);
        return res.json({
          structure: parsed,
          outline: structureToInternalSections(parsed),
          sections: tree.sections,
          target_frameworks: parsed.targetFrameworks || [],
          thesis_statement: parsed.thesisStatement || "",
          research_blueprint: parsed.researchBlueprintOverview,
          question_mapping: parsed.questionMappingMatrix,
        });
      }
    } catch {}
  }

  const briefText = cleanAnswerString(project.answers?.["assignment_brief_text"]) || project.answers?.["assignment_question"] || "";
  const isTutorial = isTutorialOrShortQABrief(briefText) || isTutorialOrShortQABrief(project.answers?.["assignment_question"] || "");
  const targetWords = Number(project.answers?.["targetWordCount"] || project.answers?.["word_count"] || (isTutorial ? 400 : 2000));
  const fallback = generateDynamicAssignmentStructure({
    question: project.answers?.["assignment_question"] || briefText,
    assignmentType: (project.answers?.["assignment_type"] || "essay") as any,
    academicLevel: (project.answers?.["academic_level"] || "undergraduate") as any,
    targetWordCount: targetWords,
    citationStyle: project.answers?.["citation_style"] || "apa7",
    briefText,
  });
  project.answers["assignment_structure"] = JSON.stringify(fallback);
  project.answers["structure"] = JSON.stringify(fallback);
  if (project.answers["assignment_internal_sections"]) {
    delete project.answers["assignment_internal_sections"];
  }
  if (project.answers["assignment_outline"]) {
    delete project.answers["assignment_outline"];
  }
  await getProjectStore().save(project);
  const fallbackTree = assignmentStructureToOutlineTree(fallback);
  return res.json({
    structure: fallback,
    outline: structureToInternalSections(fallback),
    sections: fallbackTree.sections,
    target_frameworks: fallback.targetFrameworks || [],
    thesis_statement: fallback.thesisStatement || "",
    research_blueprint: fallback.researchBlueprintOverview,
    question_mapping: fallback.questionMappingMatrix,
  });
});


// 9. POST /api/projects/:id/assignment/estimate-rubric
router.post("/estimate-rubric", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    assignmentType = project.answers["assignment_type"] || "essay",
    targetWordCount = project.answers["word_count"] || 2000,
    outline = project.answers["assignment_outline"] || [],
    selectedSectionId,
  } = req.body || {};

  const fullText = (outline as any[])
    .map((sec) => `## ${sec.title}\n\n${sec.draftContent || "(No draft yet)"}`)
    .join("\n\n");

  const targetText = selectedSectionId
    ? (outline as any[]).find((s) => s.id === selectedSectionId)?.draftContent || fullText
    : fullText;

  try {
    const prompt = `You are the Scholar Core Senior Examiner & Rubric Grading Estimator.
Grade and estimate marks for this university submission draft based on rigorous UK / International university grading standards:
- First Class (1st): 70-100%
- Upper Second Class (2:1): 60-69%
- Lower Second Class (2:2): 50-59%
- Third Class (3rd): 40-49%
- Fail: <40%

Assignment Details:
Question: "${question}"
Type: ${assignmentType}
Level: ${academicLevel}
Target Word Count: ${targetWordCount}

Draft Content:
${targetText}

Assess all 4 primary dimensions:
1. Critical Argumentation & Thesis Depth
2. Evidence Grounding & Source Synthesis
3. Structure, Academic Style & Coherence
4. Command of Theoretical Frameworks & Originality

Return ONLY valid JSON matching:
{
  "overallScore": 72,
  "overallBand": "1st_class",
  "bandLabel": "First Class (1st) — 72%",
  "summary": "...",
  "criteria": [
    {
      "id": "crit-1",
      "criterion": "Critical Argumentation & Thesis Depth",
      "weightPercent": 30,
      "currentBand": "1st_class",
      "score": 72,
      "maxScore": 100,
      "critique": "...",
      "howToReachNextBand": "..."
    },
    {
      "id": "crit-2",
      "criterion": "Evidence Grounding & Source Synthesis",
      "weightPercent": 30,
      "currentBand": "2_1_upper_second",
      "score": 68,
      "maxScore": 100,
      "critique": "...",
      "howToReachNextBand": "..."
    },
    {
      "id": "crit-3",
      "criterion": "Structure, Academic Style & Coherence",
      "weightPercent": 20,
      "currentBand": "1st_class",
      "score": 74,
      "maxScore": 100,
      "critique": "...",
      "howToReachNextBand": "..."
    },
    {
      "id": "crit-4",
      "criterion": "Theoretical Rigour & Academic Level",
      "weightPercent": 20,
      "currentBand": "1st_class",
      "score": 70,
      "maxScore": 100,
      "critique": "...",
      "howToReachNextBand": "..."
    }
  ],
  "keyStrengths": ["...", "..."],
  "keyRecommendations": ["...", "..."],
  "targetBandRoadmap": {
    "targetBand": "High First Class (80%+)",
    "actionableSteps": ["...", "..."]
  }
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Senior Examiner & Rubric Grading Estimator.",
      prompt,
      undefined,
      "verification"
    );
    if (!data) return;
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Rubric estimation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to estimate rubric grade" });
    }
  }
});

// 10. POST /api/projects/:id/assignment/thesis-budget
router.post("/thesis-budget", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    assignmentType = project.answers["assignment_type"] || "essay",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    targetWordCount = Number(project.answers["word_count"]) || 2000,
    deconstruction = project.answers["assignment_deconstruction"],
    sections: reqSections,
  } = req.body || {};

  try {
    const rawSections = reqSections || project.answers["sections"];
    const parsedSections = safeParseObject(rawSections);

    const totalWords = Number(targetWordCount) || 2000;
    const introWords = parsedSections?.intro?.targetWords ?? Math.round(totalWords * 0.10);
    const conclusionWords = parsedSections?.conclusion?.targetWords ?? Math.round(totalWords * 0.15);
    const bodyTotal = parsedSections?.body?.targetWords ?? (totalWords - introWords - conclusionWords);
    const theme1Words = Math.round(bodyTotal / 3);
    const theme2Words = Math.round(bodyTotal / 3);
    const theme3Words = Math.max(0, bodyTotal - theme1Words - theme2Words);

    const prompt = `You are the Scholar Core Thesis Formulation & Word Budgeting Agent.
For this academic assignment:
Question: "${question}"
Type: ${assignmentType}
Academic Level: ${academicLevel} (${academicLevel === "postgraduate" ? "Demonstrate high theoretical sophistication, critical synthesis, and defensible stance" : "Ensure clarity, logical structure, and strong evidence"})
Target Word Count: ${totalWords} words
Deconstruction Context: ${JSON.stringify(deconstruction || {})}

TASKS:
1. Formulate 3 distinct argumentative, defensible thesis statements:
   - Stance A (Dialectical Synthesis): Bridges and synthesizes opposing theories/evidence.
   - Stance B (Critical Challenge): Directly challenges common assumptions or mainstream discourse.
   - Stance C (Nuanced Contextual / Empirical): Emphasizes situational constraints, empirical boundary conditions, or structural determinants.
   For each, provide a clear academic rationale and explain how it defends against major counterarguments.

2. Propose 3 focused, dialectical body themes that systematically prove this thesis.

3. Allocate word budget mathematically:
   - Introduction: ${introWords} words
   - Body Theme 1: ${theme1Words} words
   - Body Theme 2: ${theme2Words} words
   - Body Theme 3: ${theme3Words} words
   - Conclusion: ${conclusionWords} words
   Sum: ${totalWords} words (Tolerance: ±10%).

Return ONLY valid JSON matching:
{
  "selectedThesis": "...",
  "thesisRationale": "...",
  "counterargumentHandling": "...",
  "alternativeTheses": [
    {
      "id": "thesis-synthesis",
      "statement": "...",
      "stance": "Dialectical Synthesis",
      "rationale": "..."
    },
    {
      "id": "thesis-challenge",
      "statement": "...",
      "stance": "Critical Challenge",
      "rationale": "..."
    },
    {
      "id": "thesis-empirical",
      "statement": "...",
      "stance": "Nuanced Empirical",
      "rationale": "..."
    }
  ],
  "totalTargetWords": ${totalWords},
  "tolerancePercent": 10,
  "sections": [
    {
      "id": "sec-intro",
      "title": "Introduction & Thesis Statement",
      "type": "introduction",
      "targetWordCount": ${introWords},
      "currentWordCount": 0,
      "targetPercent": 10,
      "guidance": "Hook the reader, provide contextual background, articulate central thesis, and define scope.",
      "keyPoints": ["Historical/theoretical context", "Explicit thesis statement", "Scope and roadmap"]
    },
    {
      "id": "sec-theme-1",
      "title": "Theme 1: ...",
      "type": "body_theme",
      "targetWordCount": ${theme1Words},
      "currentWordCount": 0,
      "targetPercent": 25,
      "guidance": "Examine foundational theoretical premises and initial empirical evidence.",
      "keyPoints": ["...", "..."]
    },
    {
      "id": "sec-theme-2",
      "title": "Theme 2: ...",
      "type": "body_theme",
      "targetWordCount": ${theme2Words},
      "currentWordCount": 0,
      "targetPercent": 25,
      "guidance": "Evaluate core empirical mechanisms, contradictions, and dialectical tensions.",
      "keyPoints": ["...", "..."]
    },
    {
      "id": "sec-theme-3",
      "title": "Theme 3: ...",
      "type": "body_theme",
      "targetWordCount": ${theme3Words},
      "currentWordCount": 0,
      "targetPercent": 25,
      "guidance": "Analyze systemic counterarguments, policy/practical implications, and syntheses.",
      "keyPoints": ["...", "..."]
    },
    {
      "id": "sec-conclusion",
      "title": "Conclusion & Synthesis",
      "type": "conclusion",
      "targetWordCount": ${conclusionWords},
      "currentWordCount": 0,
      "targetPercent": 15,
      "guidance": "Synthesize body findings, reaffirm thesis without mere repetition, state broader scholarly implications.",
      "keyPoints": ["Synthesis of findings", "Reaffirmation of thesis", "Broader scholarly implications"]
    }
  ],
  "approvedByUser": false
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Thesis Formulation & Word Budgeting Agent.",
      prompt,
      undefined,
      "reasoning"
    );
    if (!data) return;
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Thesis budget error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to generate thesis and word budget" });
    }
  }
});


export default router;
