import express from "express";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText } from "../../utils/llm.ts";
import { rejectClientCredentials } from "../../src/middleware/rejectClientCredentials.ts";

const router = express.Router({ mergeParams: true });
router.use(rejectClientCredentials);

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

// 1. POST /api/projects/:id/assignment/analyze
router.post("/analyze", async (req: express.Request<{ id: string }>, res) => {
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
    const prompt = `You are the Scholar Core Assignment Analysis Agent.
Analyze the following university assignment brief with high academic precision.

Assignment Question / Prompt: "${question}"
Assignment Type: ${assignmentType}
Academic Level: ${academicLevel} (Note: ${academicLevel === "postgraduate" ? "Expect deep critical evaluation, theoretical synthesis, and independent argument" : "Focus on conceptual clarity, rigorous evidence, clear argument, and accurate referencing"})
Target Word Count: ${targetWordCount} words
Citation Style: ${citationStyle}
Assignment Brief / Rubric Details: "${briefText} ${rubricText}"

Analyze this assignment rigorously and extract:
1. Command verbs present (e.g. Critically discuss, Evaluate, Analyse, Compare, Assess, Argue, Describe, Explain) and explain what the examiner specifically demands.
2. A comprehensive summary of what the lecturer is asking.
3. Key conceptual domains and terminology.
4. Clear scope boundaries (what is in scope vs out of scope).
5. Evidence and source requirements.
6. Key marking criteria insights.
7. Word-count allocation implications.
8. Citation and referencing guidance.
9. Academic level specific depth notes.

Return ONLY valid JSON matching this exact structure:
{
  "commandVerbs": [
    {
      "verb": "Critically evaluate",
      "meaning": "Weigh competing theoretical arguments and evidence to judge their validity.",
      "academicExpectation": "You must not merely describe; you must identify weaknesses and justify a conclusion."
    }
  ],
  "summary": "...",
  "keyConcepts": ["...", "..."],
  "scopeBoundaries": {
    "included": ["...", "..."],
    "excluded": ["...", "..."]
  },
  "expectedResponseType": "...",
  "evidenceRequirements": "...",
  "markingCriteriaInsights": ["...", "..."],
  "wordCountImplications": "...",
  "citationGuidance": "...",
  "academicLevelNotes": "...",
  "approvedByUser": false
}`;

    const analysis = await callOpenRouterJSON<any>({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    res.json(analysis);
  } catch (err: any) {
    console.error("Assignment analysis error:", err);
    res.status(500).json({ error: err.message || "Failed to analyze assignment" });
  }
});

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

    const plan = await callOpenRouterJSON<any>({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    res.json(plan);
  } catch (err: any) {
    console.error("Research plan error:", err);
    res.status(500).json({ error: err.message || "Failed to generate research plan" });
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

    const data = await callOpenRouterJSON<any>({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    res.json(data);
  } catch (err: any) {
    console.error("Assignment research error:", err);
    res.status(500).json({ error: err.message || "Failed to discover research sources" });
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

    const data = await callOpenRouterJSON<any>({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    res.json(data);
  } catch (err: any) {
    console.error("Thinking synthesis error:", err);
    res.status(500).json({ error: err.message || "Failed to generate thinking synthesis" });
  }
});

// 5. POST /api/projects/:id/assignment/structure
router.post("/structure", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    assignmentType = project.answers["assignment_type"] || "essay",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    targetWordCount = project.answers["word_count"] || 2000,
    thesis = project.answers["assignment_thinking_map"]?.customThesis || "",
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

    const data = await callOpenRouterJSON<any>({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    res.json(data);
  } catch (err: any) {
    console.error("Structure generation error:", err);
    res.status(500).json({ error: err.message || "Failed to generate outline structure" });
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
  } = req.body || {};

  try {
    const evidenceContext = approvedEvidence.length > 0
      ? `APPROVED EVIDENCE TO USE (DO NOT FABRICATE OTHER SOURCES):\n` +
        approvedEvidence
          .map((e: any, i: number) => `[${i + 1}] Claim: ${e.claim} | Evidence: ${e.evidenceSnippet} | Citation: ${e.citation}`)
          .join("\n")
      : "No external evidence provided. Write conceptually and indicate where citations are needed.";

    const prompt = `You are the Scholar Core Grounded Academic Drafting Agent.
Write the draft for section: "${sectionTitle}".

Section Guidance: ${sectionGuidance}
Target Word Count: Approximately ${targetWordCount} words
Academic Level: ${academicLevel} (${academicLevel === "postgraduate" ? "Write with advanced theoretical synthesis, nuanced evaluation, and sophisticated academic prose." : "Write with clear, coherent argumentation, conceptual accuracy, and formal academic tone."})
Citation Style: ${citationStyle}
Central Thesis: "${thesis}"
Key Points to cover: ${keyPoints.join(", ")}

${evidenceContext}

CRITICAL RULES:
1. ONLY cite from the approved evidence provided above. Do NOT fabricate citations, authors, or statistics.
2. Integrate in-text citations smoothly according to ${citationStyle}.
3. Maintain rigorous paragraph structure (Topic sentence → Evidence & Explanation → Critical Analysis → Transition).
4. Provide ONLY the section draft text.`;

    const draft = await callOpenRouterText({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    res.json({ draft });
  } catch (err: any) {
    console.error("Section drafting error:", err);
    res.status(500).json({ error: err.message || "Failed to draft section" });
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

    const report = await callOpenRouterJSON<any>({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.2,
    });

    res.json(report);
  } catch (err: any) {
    console.error("Assignment review error:", err);
    res.status(500).json({ error: err.message || "Failed to generate review report" });
  }
});

// 8. POST /api/projects/:id/assignment/tutor-chat
router.post("/tutor-chat", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    message,
    stage = "draft",
    academicLevel = "undergraduate",
    assignmentType = "essay",
    question = "",
    targetWordCount = 2000,
    currentWordCount = 0,
    outline = [],
    evidence = [],
    thesis = "",
  } = req.body || {};

  try {
    const prompt = `You are the Scholar Core Academic Writing & Thinking Tutor.
A university student is asking for your advice on their assignment.

Student's Query: "${message}"
Current Phase: ${stage}
Academic Level: ${academicLevel} (${academicLevel === "postgraduate" ? "Provide rigorous theoretical critique, counterarguments, and advanced academic vocabulary" : "Provide clear, supportive explanations, structure guidance, and analytical enhancement"})
Assignment Type: ${assignmentType}
Assignment Question: "${question}"
Central Thesis: "${thesis}"
Target Word Count: ${targetWordCount} (Current: ${currentWordCount})

Respond conversationally, constructively, and academically.
Explain the pedagogical reasoning behind your recommendations.
If suggesting a text rewrite or paragraph improvement, provide a concise, polished sample.

Return ONLY valid JSON:
{
  "reply": "...",
  "suggestion": {
    "type": "rephrase",
    "suggestedText": "..."
  }
}`;

    const data = await callOpenRouterJSON<any>({
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
    });

    res.json(data);
  } catch (err: any) {
    console.error("Tutor chat error:", err);
    res.status(500).json({ error: err.message || "Failed to process tutor query" });
  }
});

export default router;
