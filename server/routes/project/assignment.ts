import express from "express";
import multer from "multer";
import * as pdfParseModule from "pdf-parse";
import mammoth from "mammoth";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText } from "../../utils/llm.ts";
import { rejectClientCredentials } from "../../src/middleware/rejectClientCredentials.ts";
import {
  auditDocumentLineByLine,
  runBriefScannerGraph,
  COMMAND_VERB_MAP,
  type DocumentRequirement,
} from "../../services/briefScannerGraph.ts";
import type { AssignmentAnalysis, CommandVerbDetail } from "../../../src/desk/assignment/types.ts";

const router = express.Router({ mergeParams: true });
router.use(rejectClientCredentials);

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 15 * 1024 * 1024, // 15MB limit
  },
});

async function extractTextFromPdf(buffer: Buffer): Promise<{ text: string }> {
  try {
    if (typeof (pdfParseModule as any).PDFParse === "function") {
      const parser = new (pdfParseModule as any).PDFParse({ data: buffer });
      const res = await parser.getText();
      return { text: res.text || "" };
    }
    const fn = (pdfParseModule as any).default || pdfParseModule;
    if (typeof fn === "function") {
      const res = await fn(buffer);
      return { text: res.text || "" };
    }
  } catch (err) {
    console.warn("PDF parser error in assignment router:", err);
  }
  return { text: "" };
}

async function getProjectSafe(req: express.Request<any>, res: express.Response) {
  const projectId = req.params.id;
  if (!projectId) {
    res.status(400).json({ error: "Missing project ID" });
    return null;
  }
  const project = await getProjectStore().get(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  return project;
}

// 0. POST /api/projects/:id/assignment/parse-brief (File Upload for Briefs)
router.post("/parse-brief", upload.single("file"), async (req: express.Request<{ id: string }>, res: express.Response) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const file = req.file;
  if (!file) {
    return res.status(400).json({ error: "No file provided" });
  }

  let text = "";
  try {
    if (file.mimetype === "application/pdf" || file.originalname.toLowerCase().endsWith(".pdf")) {
      const data = await extractTextFromPdf(file.buffer);
      text = data.text;
    } else if (
      file.mimetype === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
      file.originalname.toLowerCase().endsWith(".docx") ||
      file.originalname.toLowerCase().endsWith(".doc")
    ) {
      const result = await mammoth.extractRawText({ buffer: file.buffer });
      text = result.value || "";
    } else {
      text = file.buffer.toString("utf-8");
    }

    // Clean whitespace and normalize line breaks
    text = text.replace(/\r\n/g, "\n").replace(/\r/g, "\n").trim();

    // Detect metadata
    let detectedWordCount: number | undefined;
    const wordMatch =
      text.match(/(?:word\s*count|target|limit|length)\s*(?:is|of|:)?\s*([1-9]\d{2,4})/i) ||
      text.match(/\b([1-9]\d{2,4})\s*words\b/i);
    if (wordMatch) {
      const parsed = parseInt(wordMatch[1], 10);
      if (parsed >= 200 && parsed <= 50000) {
        detectedWordCount = parsed;
      }
    }

    let detectedLevel: "undergraduate" | "postgraduate" | undefined;
    if (/\b(postgraduate|masters|master's|msc|ma|mba|llm|phd|level\s*7)\b/i.test(text)) {
      detectedLevel = "postgraduate";
    } else if (/\b(undergraduate|bachelor|bachelor's|bsc|ba|level\s*[456])\b/i.test(text)) {
      detectedLevel = "undergraduate";
    }

    let detectedCitation: string | undefined;
    if (/\b(apa\s*7|\bapa\b)/i.test(text)) detectedCitation = "apa7";
    else if (/\bharvard\b/i.test(text)) detectedCitation = "harvard";
    else if (/\bieee\b/i.test(text)) detectedCitation = "ieee";
    else if (/\bmla\b/i.test(text)) detectedCitation = "mla9";
    else if (/\bchicago\b/i.test(text)) detectedCitation = "chicago";
    else if (/\boscola\b/i.test(text)) detectedCitation = "oscola";

    const lines = text.split("\n").filter((l) => l.trim().length > 0);

    return res.json({
      success: true,
      text,
      lineCount: lines.length,
      detectedWordCount,
      detectedLevel,
      detectedCitation,
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

  const {
    question = project.answers["assignment_question"] || project.answers["assignment_brief"] || "",
    assignmentType = project.answers["assignment_type"] || "essay",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    targetWordCount = project.answers["word_count"] || 2000,
    citationStyle = project.answers["citation_style"] || "apa7",
    briefText = project.answers["assignment_brief_text"] || "",
    rubricText = project.answers["marking_rubric"] || "",
  } = req.body || {};

  try {
    const combinedContent = [question, briefText, rubricText].filter(Boolean).join("\n\n").trim();
    const ledger: DocumentRequirement[] = await auditDocumentLineByLine(combinedContent);

    // 1. Command Verbs & Examiner Demands (mapped from category === 'prompt')
    const promptItems = ledger.filter((item) => item.category === "prompt");
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

    // 2. Key Conceptual Scope & Boundaries (mapped from category === 'constraint': mustInclude vs excluded)
    const constraintItems = ledger.filter((item) => item.category === "constraint");
    const included: string[] = [];
    const excluded: string[] = [];

    for (const item of constraintItems) {
      if (/(?:do not|must not|avoid|exclude|excluded|out of scope|not acceptable|will not be credited|shall not|never)/i.test(item.verbatimText)) {
        excluded.push(`${item.lineRange} ${item.verbatimText}`);
      } else {
        included.push(`${item.lineRange} ${item.verbatimText}`);
      }
    }

    // Also include prompt requirements if specified
    for (const p of promptItems) {
      if (/^(?:\d+[\.\)]|[a-e][\.\)]|\?)/.test(p.verbatimText) || p.verbatimText.length > 20) {
        const itemTag = `${p.lineRange} ${p.verbatimText}`;
        if (!included.includes(itemTag)) {
          included.push(itemTag);
        }
      }
    }

    if (included.length === 0) {
      included.push(
        `Direct deconstruction and systematic investigation of: "${question.slice(0, 100)}"`,
        `Application of authoritative theoretical frameworks appropriate to ${academicLevel} study`,
        `Substantiation of claims using peer-reviewed scholarly literature formatted in ${citationStyle.toUpperCase()}`,
        "Dialectical evaluation of counterarguments, competing evidence, and disciplinary controversies"
      );
    }

    if (excluded.length === 0) {
      excluded.push(
        "Purely descriptive narrative storytelling or textbook summaries lacking critical evaluation",
        "Unsubstantiated personal opinion pieces or non-academic blogs/wikis",
        "Irrelevant biographical or historical context that does not answer the core question",
        `Content exceeding the target word count (${targetWordCount} words) by more than standard tolerance`
      );
    }

    // 3. Rubric Rules & Grade Bands (mapped from category === 'rubric_band' and category === 'penalty')
    const rubricItems = ledger.filter((item) => item.category === "rubric_band");
    const penaltyItems = ledger.filter((item) => item.category === "penalty");
    const markingCriteriaInsights: string[] = [];

    if (rubricItems.length > 0) {
      markingCriteriaInsights.push(...rubricItems.map((r) => `${r.lineRange} ${r.verbatimText}`).slice(0, 6));
    } else {
      markingCriteriaInsights.push(
        "First Class (70%+): Demands independent critical stance, rigorous theoretical synthesis, and counterargument refutation.",
        "Upper Second (60–69%): Requires sound structure, clear analytical argument, and consistent scholarly evidence.",
        "Lower Second (50–59%): Awarded for descriptive summaries that answer the prompt but lack critical depth.",
        "Third Class (40–49%): Threshold pass; factual knowledge present but marred by structural disorganization."
      );
    }

    if (penaltyItems.length > 0) {
      markingCriteriaInsights.push(
        ...penaltyItems.map((p) => `🚨 Detected Assessment Penalty: ${p.lineRange} ${p.verbatimText}`)
      );
    }

    // 4. Formatting & Word Budget (mapped from category === 'formatting')
    const targetWords = Number(targetWordCount) || 2000;
    const introWords = Math.round(targetWords * 0.1);
    const conclWords = Math.round(targetWords * 0.1);
    const bodyWords = targetWords - introWords - conclWords;

    const formattingRules = ledger
      .filter((item) => item.category === "formatting")
      .map((item) => `${item.lineRange} ${item.verbatimText}`);

    const wordCountImplications = `Target: ${targetWords.toLocaleString()} words (Intro: ~${introWords}w, Body: ~${bodyWords}w, Conclusion: ~${conclWords}w). Standard ±10% penalty threshold applies.${
      formattingRules.length > 0 ? ` Detected Rules: ${formattingRules.join(" | ")}` : ""
    }`;

    const citationGuidance = `Format all in-text citations and reference list strictly according to ${citationStyle.toUpperCase()} conventions.${
      formattingRules.some((r) => new RegExp(citationStyle, "i").test(r)) ? " Confirmed in assignment brief." : ""
    }`;

    // 5. Concepts, Expected Response Type, Evidence Requirements, Summary
    const keyConcepts = [
      "Theoretical Framework",
      "Empirical Evidence",
      "Critical Synthesis",
      "Methodological Rigor",
      "Counterargument Evaluation",
    ];

    const expectedResponseType =
      assignmentType === "case_study"
        ? "Strategic case analysis diagnosing root causes, evaluating alternatives, and proposing an implementation roadmap."
        : assignmentType === "report" || assignmentType === "business_assignment"
        ? "Structured professional report with numbered subheadings, empirical findings, and actionable SMART recommendations."
        : assignmentType === "reflection"
        ? "Critical reflective analysis connecting experiential practice with pedagogical and disciplinary theory (e.g. Gibbs' cycle)."
        : assignmentType === "lab_report"
        ? "Scientific laboratory report following IMRaD structure with empirical hypothesis testing and error analysis."
        : "Dialectical academic essay advancing a central argumentative thesis substantiated by peer-reviewed evidence.";

    const evidenceRequirements =
      academicLevel === "postgraduate"
        ? "High-impact peer-reviewed journal articles, foundational theoretical monographs, and authoritative empirical datasets."
        : "Authoritative academic sources, scholarly peer-reviewed journals, and verified institutional benchmark data.";

    const academicLevelNotes =
      academicLevel === "postgraduate"
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
    project.answers = {
      ...project.answers,
      assignment_question: String(question),
      academic_level: String(academicLevel),
      assignment_type: String(assignmentType),
      word_count: String(targetWords),
      word_limit: String(targetWords),
      citation_style: String(citationStyle),
      assignment_brief_text: String(briefText),
      marking_rubric: String(rubricText),
      assignment_analysis: JSON.stringify(finalAnalysis),
      brief_ledger: JSON.stringify(ledger),
    };
    await getProjectStore().save(project);

    res.json({
      ...finalAnalysis,
      briefLedger: ledger,
    });
  } catch (err: any) {
    console.error("Assignment deconstruction error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to deconstruct assignment brief" });
    }
  }
};

router.post("/analyze", handleDeconstruct);
router.post("/deconstruct", handleDeconstruct);

// 2. POST /api/projects/:id/assignment/plan
router.post("/plan", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    assignmentType = project.answers["assignment_type"] || "essay",
    analysis = project.answers["assignment_analysis"],
  } = req.body || {};

  try {
    const prompt = `You are the Scholar Core Assignment Research Planning Agent.
Develop an actionable research plan for this university assignment:

Question: "${question}"
Type: ${assignmentType}
Level: ${academicLevel}
Analysis Context: ${JSON.stringify(analysis || {})}

Formulate:
1. 3-5 core research questions that must be answered to satisfy the brief.
2. Main theoretical and empirical concepts.
3. Key scholarly debates or points of contention.
4. Specific evidence types needed (peer-reviewed articles, institutional data, case studies).
5. Concrete search queries and strategies.
6. Clear out-of-scope topics that the student should NOT spend time researching.

Return ONLY valid JSON matching:
{
  "coreQuestions": ["...", "..."],
  "mainConcepts": ["...", "..."],
  "keyDebates": ["...", "..."],
  "evidenceTypesNeeded": ["...", "..."],
  "searchStrategies": ["...", "..."],
  "outOfScopeTopics": ["...", "..."],
  "approvedByUser": false
}`;

    const plan = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Assignment Research Planning Agent.",
      prompt,
      "openrouter/auto",
      "planning"
    );
    if (!plan) return;
    res.json(plan);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Research plan error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to generate research plan" });
    }
  }
});

// 3. POST /api/projects/:id/assignment/research
router.post("/research", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    citationStyle = project.answers["citation_style"] || "apa7",
    plan = project.answers["assignment_research_plan"],
  } = req.body || {};

  try {
    const prompt = `You are the Scholar Core Assignment Research Agent.
Search and identify 8-12 high-impact, realistic scholarly sources for this assignment:

Question: "${question}"
Academic Level: ${academicLevel}
Citation Style: ${citationStyle}
Research Plan: ${JSON.stringify(plan || {})}

For every source, provide:
- High relevance to the prompt
- Full citation formatted in ${citationStyle}
- Author(s), year, publication type (journal/book/institutional)
- Main finding or argument
- Concrete guidance on how the student should use it in their assignment

Return ONLY valid JSON matching:
{
  "sources": [
    {
      "id": "src-1",
      "title": "...",
      "authors": ["...", "..."],
      "year": "2024",
      "type": "journal",
      "journal": "...",
      "doi": "10.1016/j.sample.2024.01",
      "relevanceScore": 95,
      "mainFinding": "...",
      "suggestedUse": "...",
      "citation": "...",
      "status": "unreviewed"
    }
  ]
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Academic Research Discovery Agent.",
      prompt,
      "openrouter/auto",
      "discovery"
    );
    if (!data) return;
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Assignment research error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to discover research sources" });
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
      "openrouter/auto",
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

// 5. POST /api/projects/:id/assignment/structure
router.post("/structure", async (req: express.Request<{ id: string }>, res) => {
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
  } = req.body || {};

  try {
    const prompt = `You are the Scholar Core Outline & Word Count Planning Agent.
Create an adaptive, university-standard section outline tailored strictly to the assignment format.

Question: "${question}"
Assignment Type: ${assignmentType} (Do NOT force a generic IMRaD format on essays, reflections, or case studies!)
Level: ${academicLevel}
Target Word Count: ${targetWordCount} words
Central Thesis: "${thesis}"

Divide the ${targetWordCount} target words proportionally across the sections (e.g. Introduction ~10%, Body sections ~80%, Conclusion ~10%). The sum of targetWordCounts MUST equal approximately ${targetWordCount}.

Return ONLY valid JSON matching:
{
  "outline": [
    {
      "id": "sec-1",
      "title": "Introduction & Thesis Statement",
      "targetWordCount": 200,
      "currentWordCount": 0,
      "guidance": "Hook the reader, contextualize the question, state thesis, and outline structure.",
      "keyPoints": ["Background context", "Core thesis", "Scope of paper"],
      "linkedEvidenceIds": [],
      "status": "not_started"
    }
  ]
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Outline & Word Count Planning Agent.",
      prompt,
      "openrouter/auto",
      "planning"
    );
    if (!data) return;
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Structure generation error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to generate outline structure" });
    }
  }
});

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
  } = req.body || {};

  try {
    const evidenceContext = approvedEvidence.length > 0
      ? `APPROVED EVIDENCE TO USE (DO NOT FABRICATE OTHER SOURCES):\n` +
        approvedEvidence
          .map((e: any, i: number) => `[${i + 1}] Claim: ${e.claim} | Evidence: ${e.evidenceSnippet} | Citation: ${e.citation}`)
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

    const prompt = `You are the Scholar Core Grounded Academic Drafting Agent.
Write the draft for section: "${sectionTitle}".

Assignment Type: ${assignmentType}
${genreGuidance}

Section Guidance: ${sectionGuidance}
Target Word Count: Approximately ${targetWordCount} words
Academic Level: ${academicLevel} (${academicLevel === "postgraduate" ? "Write with advanced theoretical synthesis, nuanced evaluation, and sophisticated academic prose." : "Write with clear, coherent argumentation, conceptual accuracy, and formal academic tone."})
Citation Style: ${citationStyle}
Central Thesis / Stance: "${thesis}"
Key Points to cover: ${keyPoints.join(", ")}

${evidenceContext}

CRITICAL RULES:
1. ONLY cite from the approved evidence provided above. Do NOT fabricate citations, authors, or statistics.
2. Integrate in-text citations smoothly according to ${citationStyle}.
3. Maintain rigorous paragraph structure and academic tone.
4. Provide ONLY the section draft text.`;

    const draft = await callOpenRouterText(
      req,
      res,
      "You are the Scholar Core Grounded Academic Drafting Agent.",
      prompt,
      "openrouter/auto",
      "drafting"
    );
    if (!draft) return;
    res.json({ draft });
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Section drafting error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to draft section" });
    }
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
      "openrouter/auto",
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
  } = req.body || {};

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

${draftContext}

${modeInstruction}

Return ONLY valid JSON matching:
{
  "reply": "Conversational, constructive academic response explaining the tutor's advice...",
  "mode": "${mode}",
  "socraticQuestions": [ ... ],
  "rubricEstimation": { ... },
  "counterArguments": [ ... ],
  "suggestion": {
    "type": "rephrase" | "replace_text" | "reduce_words" | "add_evidence",
    "suggestedText": "..."
  }
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Pedagogical Academic Tutor.",
      prompt,
      "openrouter/auto",
      "chat"
    );
    if (!data) return;
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Tutor chat error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to process tutor query" });
    }
  }
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
      "openrouter/auto",
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
  } = req.body || {};

  try {
    const totalWords = Number(targetWordCount) || 2000;
    const introWords = Math.round(totalWords * 0.10);
    const conclusionWords = Math.round(totalWords * 0.15);
    const bodyTotal = totalWords - introWords - conclusionWords;
    const theme1Words = Math.round(bodyTotal / 3);
    const theme2Words = Math.round(bodyTotal / 3);
    const theme3Words = bodyTotal - theme1Words - theme2Words;

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
   - Introduction: ${introWords} words (~10%)
   - Body Theme 1: ${theme1Words} words (~25%)
   - Body Theme 2: ${theme2Words} words (~25%)
   - Body Theme 3: ${theme3Words} words (~25%)
   - Conclusion: ${conclusionWords} words (~15%)
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
      "openrouter/auto",
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
      "openrouter/auto",
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

// 12. POST /api/projects/:id/assignment/citations-ground
router.post("/citations-ground", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    citationStyle = project.answers["citation_style"] || "apa7",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    themes = [],
  } = req.body || {};

  try {
    const prompt = `You are the Scholar Core Academic Citation & Grounding Agent.
Identify and format 8-12 realistic, high-impact peer-reviewed scholarly sources to ground this assignment:

Question: "${question}"
Academic Level: ${academicLevel}
Citation Style: ${citationStyle}
Themes: ${JSON.stringify(themes)}

For each source, provide:
- High relevance to the themes
- Verified academic journal or scholarly university press publication
- Full bibliographic citation formatted strictly in ${citationStyle}
- In-text citation format (e.g., "(Smith & Doe, 2024)" for APA/Harvard or "[1]" for IEEE)
- Quote or key empirical finding snippet

Return ONLY valid JSON matching:
{
  "citations": [
    {
      "id": "cit-1",
      "sourceTitle": "...",
      "authors": ["..."],
      "year": "2024",
      "journalOrPublisher": "...",
      "doi": "10.1016/...",
      "citationText": "...",
      "inTextCitation": "...",
      "citationStyle": "${citationStyle}",
      "verifiedPeerReviewed": true,
      "linkedThemeIds": [],
      "quoteOrFindingSnippet": "..."
    }
  ]
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Academic Citation & Grounding Agent.",
      prompt,
      "openrouter/auto",
      "discovery"
    );
    if (!data) return;
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Citation grounding error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to ground citations" });
    }
  }
});

// 13. POST /api/projects/:id/assignment/audit-export
router.post("/audit-export", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    assignmentType = project.answers["assignment_type"] || "essay",
    targetWordCount = Number(project.answers["word_count"]) || 2000,
    citationStyle = project.answers["citation_style"] || "apa7",
    fullDraft = "",
    deconstruction = project.answers["assignment_deconstruction"],
  } = req.body || {};

  try {
    const actualWordCount = fullDraft.trim().split(/\s+/).filter(Boolean).length;
    const minWords = Math.round(targetWordCount * 0.90);
    const maxWords = Math.round(targetWordCount * 1.10);
    const isWordCountCompliant = actualWordCount >= minWords && actualWordCount <= maxWords;

    const prompt = `You are the Scholar Core Senior Examiner & Rubric Audit Agent.
Conduct a rigorous submission check on this assignment against university grading standards:

Question: "${question}"
Type: ${assignmentType}
Level: ${academicLevel}
Target Word Count: ${targetWordCount} words (Actual: ${actualWordCount} words, Allowed: ${minWords} - ${maxWords})
Citation Standard: ${citationStyle}
Deconstruction Context: ${JSON.stringify(deconstruction || {})}

Full Assignment Draft:
"""
${fullDraft.slice(0, 10000)}
"""

Evaluate strictly across 10 academic dimensions:
1. question_addressed (Did the student answer all parts of the question?)
2. argument_logic (Is the central thesis rigorously defended?)
3. peel_matrix_depth (Are body themes structured with clear Point-Evidence-Explanation-Link?)
4. counterargument_critique (Were counterarguments proactively addressed?)
5. evidence_sufficiency (Are claims grounded in peer-reviewed scholarship?)
6. academic_level (Appropriate for ${academicLevel}?)
7. word_count (Within ±10% tolerance?)
8. citation_accuracy (Consistent ${citationStyle} referencing?)
9. structure_coherence (Smooth transitions and clear introduction/conclusion?)
10. originality (Independent analysis vs passive summarisation?)

Assign an overall percentage mark (0-100) and grade band:
- First Class (1st): 70%+
- Upper Second (2:1): 60-69%
- Lower Second (2:2): 50-59%
- Third / Pass: 40-49%

Return ONLY valid JSON matching:
{
  "overallScore": 76,
  "overallBand": "1st_class",
  "bandLabel": "First Class (1st) — 76%",
  "summary": "...",
  "rubricAlignmentScore": 85,
  "wordCountAdherence": {
    "actual": ${actualWordCount},
    "target": ${targetWordCount},
    "minAllowed": ${minWords},
    "maxAllowed": ${maxWords},
    "status": "${isWordCountCompliant ? "compliant" : actualWordCount < minWords ? "under_budget" : "over_budget"}",
    "deviationPercent": ${Math.round(Math.abs(actualWordCount - targetWordCount) / targetWordCount * 100)}
  },
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
  "priorityFixes": ["..."],
  "readyForSubmission": true
}`;

    const data = await callOpenRouterJSON(
      req,
      res,
      "You are the Scholar Core Senior Examiner & Rubric Audit Agent.",
      prompt,
      "openrouter/auto",
      "verification"
    );
    if (!data) return;
    res.json(data);
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Audit export error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to generate submission audit" });
    }
  }
});

export default router;
