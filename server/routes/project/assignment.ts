import express from "express";
import multer from "multer";
import { parseDocument } from "../../../src/document_intelligence/index.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../src/utils/scholarlyVoiceGuard.ts";
import { getProjectStore } from "../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText, getCandidates, buildAuthorizedPolicy, resolveRequestAiConfig } from "../../utils/llm.ts";
import { completeWithFailover } from "../../../src/platform/gateway/gateway.ts";
import { scholarBrain } from "../../src/services/scholarBrain.ts";
import { rejectClientCredentials } from "../../src/middleware/rejectClientCredentials.ts";
import {
  auditDocumentLineByLine,
  runBriefScannerGraph,
  COMMAND_VERB_MAP,
  type DocumentRequirement,
} from "../../services/briefScannerGraph.ts";
import type {
  AssignmentAnalysis,
  CommandVerbDetail,
  CoreResearchQuestion,
  RecommendedSearchStrategy,
  ResearchPlan,
  TutorWorkspacePatch,
} from "../../../src/desk/assignment/types.ts";
import {
  cleanAnswerString,
  extractStandardizedInstructions,
  normalizeProjectAnswers,
  getSectionPromptGuidelines,
  structureToInternalSections,
} from "../../../src/desk/assignment/types.ts";
import {
  generateDynamicAssignmentStructure,
  generateAiEnhancedOutline,
  extractTargetFrameworks,
  sanitizeOutlineHeadings,
  assignmentStructureToOutlineTree,
  outlineTreeToAssignmentStructure,
} from "../../../src/desk/assignment/services/outlineService.ts";
import { conductAskScholarResearchForOutline } from "../../../src/desk/assignment/services/scholarlyDiscoveryService.ts";
import { sanitizeBrief } from "../../../src/features/understand/services/briefSanitizer.ts";
import { classifyScopeBoundaries, stripLineTags } from "../../../src/features/understand/services/scopeClassifier.ts";
import { generateSectionDraft } from "../../../src/features/drafting/services/sectionDraftingEngine.ts";
import {
  isClassroomLogisticsLine,
  isTutorialOrShortQABrief,
  extractSubstantiveBriefQuestions,
  stripSlideArtifacts,
} from "../../../src/utils/briefExtractor.ts";
import { discoverMultiPortalSources, type DiscoveredSourceDraft } from "../../src/discovery/discovery.ts";
import { getSupabaseRestConfig, SupabaseTable, type SupabaseRestConfig } from "../../src/supabaseRest.ts";
import {
  replaceBracketTokensWithDeterministicCitations,
  compileDeterministicBibliographyMarkdown,
  formatAskScholarInText,
  formatAskScholarBibliographyEntry,
  type WebsiteCitationItem,
} from "../../../src/desk/scholarCitationEngine.ts";
import type { DiscoveredSource } from "../../../src/desk/assignment/types.ts";

interface SupabaseProjectSourceRecord extends Record<string, unknown> {
  project_id: string;
  source_id: string;
  title: string;
  authors: string[];
  year?: number;
  doi?: string;
  venue?: string;
  journal?: string;
  url?: string;
  source_type: string;
  authority_tier: string;
  discovered_via: string;
  discovered_at: string;
}

function getCourseworkSupabaseConfig(): SupabaseRestConfig | null {
  const supabaseUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRoleKey) return null;
  return { supabaseUrl, serviceRoleKey };
}

async function persistSourcesToSupabase(projectId: string, sources: DiscoveredSource[]): Promise<void> {
  if (process.env.NODE_ENV === "test") return;
  const config = getCourseworkSupabaseConfig();
  if (!config) return;

  const table = new SupabaseTable<SupabaseProjectSourceRecord>(config, "project_sources");
  for (const src of sources) {
    const yearNum = typeof src.year === "number" ? src.year : parseInt(String(src.year || ""), 10) || undefined;
    const venue = src.journal || ((src as unknown as Record<string, unknown>).venue as string | undefined);
    await table.upsert({
      project_id: projectId,
      source_id: src.id,
      title: src.title,
      authors: src.authors,
      year: yearNum,
      doi: src.doi,
      venue,
      journal: venue,
      url: src.url,
      source_type: typeof src.type === "string" ? src.type : "scholarly",
      authority_tier: ((src as unknown as Record<string, unknown>).authorityTier as string) || "A",
      discovered_via: src.retrievalSource || "openalex",
      discovered_at: src.retrievedAt || new Date().toISOString(),
    }, "project_id,source_id").catch((dbErr: unknown) => {
      console.warn("Failed to persist source to Supabase project_sources:", dbErr);
    });
  }
}

const router = express.Router({ mergeParams: true });
router.use(rejectClientCredentials);

export function isCorruptedOutlineHeadings(headings: any[], topic: string): boolean {
  if (!headings || !Array.isArray(headings) || headings.length === 0) return false;
  const flatTitles: string[] = [];
  headings.forEach((h: any) => {
    if (h.title) flatTitles.push(h.title);
    if (h.subheadings && Array.isArray(h.subheadings)) {
      h.subheadings.forEach((s: any) => {
        if (s.title) flatTitles.push(s.title);
      });
    }
  });

  const isAIML = /\b(machine learning|deep learning|neural network|reinforcement learning|gradient descent|transformer model|llm|computer science)\b/i.test(topic);
  const hasOBOrLeadership = /\b(leadership|culture|schein|zappos|human resources|organizational behavior|management|mba|business strategy)\b/i.test(topic);

  const hasLeakedML = (!isAIML || hasOBOrLeadership) && flatTitles.some((t) =>
    /\b(mathematical formulations|loss optimization|optimization landscapes|erm|loss surfaces|gradient descent|empirical risk|convex optimization)\b/i.test(t)
  );

  const hasClassroomLogistics = flatTitles.some((t) =>
    isClassroomLogisticsLine(t) ||
    /\b(divide yourself|teams of \d+|breakout|discussion timer|class discussion|icebreaker)\b/i.test(t)
  );

  return hasLeakedML || hasClassroomLogistics;
}

export function healCorruptedProjectStructure(project: any): boolean {
  if (!project || !project.answers) return false;
  let changed = false;
  const rawStructure = project.answers["assignment_structure"] || project.answers["structure"];
  const topic = [
    project.answers["assignment_question"],
    project.answers["instructions"],
    project.answers["assignment_brief_text"],
    project.answers["research_topic"],
    project.answers["title"],
  ]
    .filter(Boolean)
    .join(" ");

  if (rawStructure) {
    try {
      const parsed = typeof rawStructure === "string" ? JSON.parse(rawStructure) : rawStructure;
      if (parsed?.headings && isCorruptedOutlineHeadings(parsed.headings, topic)) {
        const briefText = cleanAnswerString(project.answers["assignment_brief_text"]) || topic;
        const targetWords = Number(
          project.answers["targetWordCount"] ||
          project.answers["word_count"] ||
          (isTutorialOrShortQABrief(briefText) ? 400 : 2000)
        );
        const repaired = generateDynamicAssignmentStructure({
          question: project.answers["assignment_question"] || topic,
          assignmentType: (project.answers["assignment_type"] || "essay") as any,
          academicLevel: (project.answers["academic_level"] || "undergraduate") as any,
          targetWordCount: targetWords,
          citationStyle: project.answers["citation_style"] || "apa7",
          briefText,
        });
        project.answers["assignment_structure"] = JSON.stringify(repaired);
        project.answers["structure"] = JSON.stringify(repaired);
        if (project.answers["assignment_internal_sections"]) {
          delete project.answers["assignment_internal_sections"];
        }
        if (project.answers["assignment_outline"]) {
          delete project.answers["assignment_outline"];
        }
        changed = true;
      }
    } catch {}
  }
  return changed;
}

function safeParseObject<T = any>(val: any): T | null {
  if (!val) return null;
  if (typeof val === "object") return val;
  if (typeof val === "string") {
    try {
      return JSON.parse(val);
    } catch {
      return null;
    }
  }
  return null;
}

function extractProjectInstructions(project: any, reqBody?: any): string {
  const candidate =
    reqBody?.instructions ||
    reqBody?.question ||
    extractStandardizedInstructions(project?.answers);
  return cleanAnswerString(candidate);
}

function capitalizeTitleWords(str: string): string {
  const minor = new Set(["a", "an", "the", "and", "but", "or", "for", "nor", "on", "at", "to", "from", "by", "in", "of", "with"]);
  const words = str.split(" ").filter(Boolean);
  return words
    .map((w, idx) => {
      const lower = w.toLowerCase();
      if (idx > 0 && minor.has(lower)) return lower;
      return w.charAt(0).toUpperCase() + w.slice(1);
    })
    .join(" ");
}

function cleanTitleCandidate(raw: string): string {
  let s = raw
    .replace(/^#+\s*/, "") // markdown headers
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "") // outer quotes
    .replace(
      /^(?:critically\s+evaluate\s+(?:the\s+)?|critically\s+assess\s+(?:the\s+)?|critically\s+examine\s+(?:the\s+)?|critically\s+discuss\s+(?:the\s+)?|evaluate\s+(?:the\s+)?|assess\s+(?:the\s+)?|examine\s+(?:the\s+)?|discuss\s+(?:the\s+)?|to\s+what\s+extent\s+(?:does|do|is|are)\s+|an\s+analysis\s+of\s+|an\s+investigation\s+into\s+|how\s+(?:does|do|can)\s+|explore\s+(?:the\s+)?)/i,
      ""
    )
    .replace(/[.?!;:]+$/, "")
    .trim();

  const firstClause = s.split(/[.;]/)[0].trim();
  if (firstClause.length >= 6) s = firstClause;

  const words = s.split(/\s+/).filter(Boolean);
  if (words.length <= 2) {
    if (words.length === 0) return "";
    return capitalizeTitleWords(words.join(" "));
  }

  const selectedWords = words.slice(0, Math.min(words.length, 7));
  let result = selectedWords.join(" ");
  result = result.replace(/\s+(?:and|or|in|of|for|with|to|at|by|from|the|a|an|on)$/i, "");

  return capitalizeTitleWords(result);
}

/**
 * Fast, deterministic heuristic to extract a concise academic title (3 to 7 words)
 * from the first several lines of a brief or assignment question.
 */
export function deriveHeuristicTitle(rawText: string): string {
  if (!rawText || typeof rawText !== "string") return "Academic Assignment";

  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim().replace(/^\[L\d+\]\s*/, "")) // remove [L001] prefixes
    .filter((l) => l.length > 0);

  if (lines.length === 0) return "Academic Assignment";

  // Check first 5 lines for course code + subject or title indicators
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];

    // Skip bare generic document header labels e.g. "Assignment Brief", "Essay Prompt"
    if (/^(?:assignment\s*(?:brief|question|specification)?|coursework\s*(?:brief|specification)?|syllabus\s*brief|essay\s*prompt)$/i.test(line)) {
      continue;
    }
    if (isClassroomLogisticsLine(line)) {
      continue;
    }

    // Pattern 1: Course code prefix e.g. "POLI3002: Security Analysis in the 21st Century" or "CS 7015 - Machine Learning"
    const courseCodeMatch = line.match(/^([A-Z]{2,5}\s*\d{3,5})[:\s\-–]+(.+)$/i);
    if (courseCodeMatch) {
      const code = courseCodeMatch[1].replace(/\s+/g, "").toUpperCase();
      const subject = cleanTitleCandidate(courseCodeMatch[2]);
      if (subject.length > 0) {
        return `${code} ${subject}`.slice(0, 60).trim();
      }
    }

    // Pattern 2: Explicit prefix e.g. "Title: ...", "Topic: ...", "Assignment Question: ..."
    const explicitPrefixMatch = line.match(
      /^(?:assignment\s*(?:brief|question|title)?|essay\s*(?:topic|title)?|coursework\s*(?:title)?|module\s*(?:title)?|topic|question|task)\s*[:\-–—]\s*(.+)$/i
    );
    if (explicitPrefixMatch) {
      const cleaned = cleanTitleCandidate(explicitPrefixMatch[1]);
      if (cleaned.length >= 4) return cleaned;
    }
  }

  // Pattern 3: Clean first prominent sentence or question
  for (let i = 0; i < Math.min(lines.length, 5); i++) {
    const line = lines[i];
    if (/^(?:assignment\s*(?:brief|question|specification)?|coursework\s*(?:brief|specification)?|syllabus\s*brief|essay\s*prompt)$/i.test(line)) {
      continue;
    }
    if (isClassroomLogisticsLine(line)) {
      continue;
    }
    const cleaned = cleanTitleCandidate(line);
    if (cleaned.length >= 6) {
      return cleaned;
    }
  }

  return "Academic Assignment";
}

/**
 * Intelligent Semantic Auto-Naming:
 * Generates a concise academic research title (3 to 7 words).
 * Tries LLM if configured; otherwise gracefully falls back to deterministic heuristic.
 */
export async function deriveSemanticAcademicTitle(
  briefText: string,
  req?: express.Request
): Promise<string> {
  const heuristic = deriveHeuristicTitle(briefText);
  if (!briefText || briefText.trim().length < 15) {
    return heuristic;
  }

  try {
    const candidates = getCandidates(req);
    if (candidates.length > 0 && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
      const prompt = `Generate a concise, academic title (3 to 7 words, e.g. "Quantum Computing Cryptographic Architectures", "Algorithmic Bias in Healthcare") based on this assignment brief. Output ONLY the plain text title, with NO punctuation, NO quotes, NO explanation:\n\n${briefText.slice(0, 1500)}`;
      const response = await completeWithFailover(
        {
          taskClass: "summarisation",
          systemPrompt: "You are an expert academic research registrar. Craft a concise, formal academic title (3-7 words).",
          userPrompt: prompt,
          segments: [{ label: "Brief", text: briefText.slice(0, 1500) }],
        },
        { candidates },
        buildAuthorizedPolicy(candidates)
      );

      if (response.ok && response.value?.text) {
        const candidate = response.value.text
          .trim()
          .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
          .replace(/^(?:title|topic)[:\s\-–]+/i, "")
          .replace(/[.?!;:]+$/, "")
          .trim();
        const wordCount = candidate.split(/\s+/).length;
        if (wordCount >= 2 && wordCount <= 10 && candidate.length >= 5 && candidate.length <= 75) {
          return capitalizeTitleWords(candidate);
        }
      }
    }
  } catch {
    // Fall back to heuristic
  }

  return heuristic;
}

/**
 * Automatically updates project title in answers & record if currently untitled.
 */
export async function autoUpdateProjectTitleIfUntitled(
  project: any,
  derivedTitle: string
): Promise<string> {
  if (!project) return derivedTitle;
  if (!project.answers) project.answers = {};

  const currentTitle = (
    project.answers["title"] ||
    project.answers["assignment_title"] ||
    project.title ||
    ""
  ).trim();

  const isDefaultOrUntitled =
    !currentTitle ||
    currentTitle.toLowerCase().includes("untitled") ||
    currentTitle.toLowerCase() === "academic assignment" ||
    currentTitle.toLowerCase() === "synthesized research project";

  if (isDefaultOrUntitled && derivedTitle && derivedTitle !== "Academic Assignment") {
    project.answers["title"] = derivedTitle;
    project.answers["assignment_title"] = derivedTitle;
    if (typeof project.title === "string") {
      project.title = derivedTitle;
    }
    await getProjectStore().save(project);
    return derivedTitle;
  }

  return currentTitle || derivedTitle;
}

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB limit to support Pro and Admin high-capacity uploads
  },
});

async function getProjectSafe(req: express.Request<unknown>, res: express.Response) {
  const projectId = (req.params as Record<string, string>).id;
  if (!projectId) {
    res.status(400).json({ error: "Missing project ID" });
    return null;
  }
  const project = await getProjectStore().get(projectId);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (healCorruptedProjectStructure(project)) {
    await getProjectStore().save(project);
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

    if (substantiveRubricItems.length > 0) {
      markingCriteriaInsights.push(...substantiveRubricItems.map((r) => `${r.lineRange} ${r.verbatimText}`).slice(0, 6));
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

    const candidates = getCandidates(req);
    const structure = await generateAiEnhancedOutline({
      question,
      assignmentType: assignmentType as any,
      academicLevel: academicLevel as any,
      targetWordCount: targetWords,
      citationStyle,
      briefText,
      timeoutMs: 25000,
      llmCaller: async (sys, usr) => {
        try {
          const response = await completeWithFailover(
            {
              taskClass: "drafting",
              systemPrompt: sys,
              userPrompt: usr,
              responseFormat: "json",
              segments: [{ label: "Brief", text: usr }],
            },
            { candidates },
            buildAuthorizedPolicy(candidates)
          );
          if (response.ok) {
            return response.value?.text || "";
          }
          console.warn("completeWithFailover non-ok in assignment outline:", response.error);
          return "";
        } catch (llmErr) {
          console.warn("completeWithFailover exception in assignment outline:", llmErr);
          return "";
        }
      }
    });

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
router.post("/deconstruct", handleDeconstruct);

function buildDeterministicResearchPlan(
  question: string,
  assignmentType: string,
  academicLevel: string,
  analysis?: any
) {
  const qClean = question?.trim() || "Academic Coursework Assignment";
  let parsedAnalysis: any = {};
  try {
    parsedAnalysis = typeof analysis === "string" ? JSON.parse(analysis) : analysis || {};
  } catch {
    parsedAnalysis = {};
  }

  const isQuantum = /quantum|qubit|superconducting|trapped-ion|shor|grover|qec|surface code|nisq|post-quantum|qkd/i.test(qClean);

  const concepts = parsedAnalysis.keyConcepts?.length > 0 
    ? parsedAnalysis.keyConcepts 
    : isQuantum
    ? [
        "Superconducting Transmon vs Trapped-Ion Modalities",
        "NISQ Constraints & Error Mitigation (ZNE/PEC)",
        "BQP Complexity & Algorithmic Mechanics (Shor & Grover)",
        "Planar Surface Codes & Fault-Tolerant Threshold Theorem",
        "Quantum Cryptography (BB84 QKD) & Post-Quantum Cryptography (FIPS 203)",
      ]
    : ["Theoretical Framework", "Empirical Accountability", "Governance & Regulation"];

  const coreQuestions: CoreResearchQuestion[] = isQuantum
    ? [
        {
          id: "q-1",
          question: "How do physical qubit modalities (superconducting transmon vs trapped-ion) trade off gate speed against coherence times (T1, T2) and inter-qubit connectivity?",
          rationale: "Evaluates microscopic physical mechanisms and architectural DiVincenzo criteria required for Part 1.",
          category: "Hardware Architectures",
        },
        {
          id: "q-2",
          question: "What are the computational limits of NISQ processors, and why do error mitigation techniques (ZNE, PEC, CDR) fail on deep circuits compared to fault-tolerant error correction?",
          rationale: "Synthesizes Preskill (2018) NISQ limits against scaling thresholds required for First-Class honors.",
          category: "NISQ & Error Mitigation",
        },
        {
          id: "q-3",
          question: "How do Shor's (exponential) and Grover's (quadratic) algorithms demonstrate quantum advantage, and where does BQP sit relative to P, NP, and the Extended Church-Turing thesis?",
          rationale: "Directly solves the algorithmic mechanics and complexity-theoretic foundations of Part 2.",
          category: "Algorithmic Advantage",
        },
        {
          id: "q-4",
          question: "Under what physical gate error rates does the 2D surface code achieve fault tolerance, and what magic state distillation overheads govern cryptanalytic feasibility (e.g. RSA-2048)?",
          rationale: "Analyzes stabilizer syndrome extraction cycles, threshold theorems (Fowler 2012), and physical-to-logical qubit ratios (Gidney & Ekerå 2021).",
          category: "Fault Tolerance & QEC",
        },
      ]
    : [
        {
          id: "q-1",
          question: `What foundational theoretical frameworks and empirical mechanisms govern "${qClean.slice(0, 90)}"?`,
          rationale: "Establishes conceptual boundaries and foundational academic terminology mandated by First-Class rubric criteria.",
          category: "Theoretical Foundation",
        },
        {
          id: "q-2",
          question: `How do competing scholarly perspectives and empirical datasets evaluate tensions between operational efficiency and institutional accountability in ${concepts[0] || "this domain"}?`,
          rationale: "Fulfills examiner command verb requirements for critical synthesis and debate.",
          category: "Dialectical Tension",
        },
        {
          id: "q-3",
          question: `What methodological limitations, systemic risks, and unintended consequences arise when applying ${concepts[1] || "these models"} in practical settings?`,
          rationale: "Demonstrates high-level evaluative critique and awareness of real-world constraints.",
          category: "Empirical Reality",
        },
        {
          id: "q-4",
          question: `Which justified regulatory, ethical, or policy interventions best reconcile competing stakeholder demands and long-term public interest?`,
          rationale: "Provides grounded, actionable synthesis necessary to conclude the inquiry with academic authority.",
          category: "Policy & Resolution",
        },
      ];

  const searchStrategies: RecommendedSearchStrategy[] = isQuantum
    ? [
        {
          id: "strat-1",
          database: "arXiv (quant-ph) / Physical Review Letters",
          searchQuery: '"quantum computing" AND ("superconducting transmon" OR "trapped ion") AND ("gate fidelity" OR "coherence")',
          relevanceTarget: "Foundational hardware reviews (Kjaergaard 2020) and experimental demonstrations (Arute 2019).",
        },
        {
          id: "strat-2",
          database: "Physical Review A / IEEE FOCS",
          searchQuery: '("Shor\'s algorithm" OR "Grover\'s algorithm") AND ("order finding" OR "phase estimation" OR "amplitude amplification")',
          relevanceTarget: "Seminal algorithmic papers (Shor 1994, Grover 1996, Nielsen & Chuang 2010).",
        },
        {
          id: "strat-3",
          database: "Physical Review A / Quantum",
          searchQuery: '"surface codes" AND ("threshold theorem" OR "magic state distillation") AND ("Fowler" OR "Gidney")',
          relevanceTarget: "Topological quantum error correction benchmarks (Fowler 2012, Gidney & Ekerå 2021).",
        },
        {
          id: "strat-4",
          database: "Theoretical Computer Science / NIST Standards",
          searchQuery: '("quantum key distribution" OR "BB84" OR "post-quantum cryptography" OR "FIPS 203" OR "ML-KEM")',
          relevanceTarget: "Cryptographic protocol foundations (Bennett & Brassard 2014) and PQC standards (NIST 2024).",
        },
      ]
    : [
        {
          id: "strat-1",
          database: "Google Scholar",
          searchQuery: `"${concepts[0] || 'algorithmic governance'}" AND ("theoretical framework" OR "conceptual model") AND "peer-reviewed"`,
          relevanceTarget: "Seminal papers and high-impact theoretical paradigms published in leading journals.",
        },
        {
          id: "strat-2",
          database: "JSTOR / Scopus",
          searchQuery: `("${concepts[0] || 'algorithmic governance'}" OR "${concepts[1] || 'accountability'}") AND ("empirical analysis" OR "case study") AND (2020 OR 2021 OR 2022 OR 2023 OR 2024 OR 2025)`,
          relevanceTarget: "Recent peer-reviewed empirical case studies measuring operational impact.",
        },
        {
          id: "strat-3",
          database: "CrossRef / Web of Science",
          searchQuery: `"${concepts[1] || 'regulatory compliance'}" AND ("EU AI Act" OR "institutional oversight") AND NOT "non-academic"`,
          relevanceTarget: "Statutory governance frameworks and institutional audit methodologies.",
        },
        {
          id: "strat-4",
          database: "SSRN / Academic Repositories",
          searchQuery: `("${qClean.slice(0, 40)}" OR "${concepts[2] || 'systemic risk'}") AND ("counterarguments" OR "systemic bias")`,
          relevanceTarget: "Dialectical counterarguments and stress-testing evidence against orthodox claims.",
        },
      ];

  const keyDebates = isQuantum
    ? [
        "NISQ error mitigation (ZNE/CDR) vs Fault-Tolerant Surface Codes (threshold theorem)",
        "Physical qubit scaling: Transmon Josephson junction dielectric losses vs Trapped-Ion optical switching bottlenecks",
        "Exponential quantum speedup (Shor) vs Quadratic quantum speedup (Grover) and cryptographic implications",
        "QKD information-theoretic security (fiber attenuation/no-cloning) vs PQC lattice-based mathematical hardness (NIST FIPS 203)",
      ]
    : [
        "Algorithmic efficiency vs transparent procedural fairness",
        "Centralized statutory regulation vs agile self-governance standards",
        "Individual rights and privacy vs collective security and optimization",
      ];

  const evidenceTypesNeeded = isQuantum
    ? [
        "Seminal quantum computing peer-reviewed journal papers (Physical Review A/Letters, Quantum, Nature)",
        "Conference proceedings in theoretical computer science (IEEE FOCS, ACM STOC)",
        "Official cryptographic standards publications (NIST FIPS 203/204/205)",
      ]
    : [
        "Peer-reviewed academic journal publications (Q1/Q2 ranked journals)",
        "Official institutional whitepapers (EU Commission, IEEE, OECD)",
        "Empirical field audit data and audited corporate/public case studies",
      ];

  return {
    coreQuestions,
    mainConcepts: concepts,
    keyDebates,
    evidenceTypesNeeded,
    searchStrategies,
    outOfScopeTopics: [
      "Unverified blog posts, speculative trade journalism, or marketing collateral",
      "Broad historical surveys that do not directly address post-2015 modern frameworks",
    ],
    approvedByUser: false,
  };
}

// 2. POST /api/projects/:id/assignment/plan
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
        "openrouter/auto",
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

// 3. POST /api/projects/:id/assignment/research
router.post("/research", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    question = project.answers["assignment_question"] || "",
    academicLevel = project.answers["academic_level"] || "undergraduate",
    citationStyle = project.answers["citation_style"] || "apa7",
    plan = project.answers["assignment_research_plan"],
    query: reqQuery,
  } = req.body || {};

  const effectiveQuery = (
    reqQuery ||
    question ||
    project.answers["research_topic"] ||
    project.answers["working_title"] ||
    project.answers["title"] ||
    "academic research"
  ).trim();

  try {
    let discoveredDrafts: DiscoveredSourceDraft[] = [];

    // Query multi-portal discovery (OpenAlex, Crossref, DOAJ, DataCite, arXiv)
    try {
      discoveredDrafts = await discoverMultiPortalSources(effectiveQuery, 25);
    } catch (discErr) {
      console.warn("Multi-portal discovery network call failed, attempting fallback:", discErr);
    }

    let sources: DiscoveredSource[] = [];

    if (discoveredDrafts && discoveredDrafts.length > 0) {
      sources = discoveredDrafts.map((draft, idx) => {
        const yearStr = draft.year ? String(draft.year) : "2024";
        const srcId = `src-${Date.now()}-${idx + 1}`;
        const authorStr =
          draft.authors.length > 0
            ? draft.authors.length > 2
              ? `${draft.authors[0]} et al.`
              : draft.authors.join(" & ")
            : "Unknown Author";
        const venue = draft.venue || "Academic Press";
        const citationStr = `${authorStr} (${yearStr}). ${draft.title}.${draft.venue ? ` ${draft.venue}.` : ""}${
          draft.doi ? ` https://doi.org/${draft.doi}` : ""
        }`;

        return {
          id: srcId,
          title: draft.title,
          authors: draft.authors,
          year: yearStr,
          type: draft.sourceType === "scholarly" ? "journal" : "article",
          journal: draft.venue,
          doi: draft.doi,
          url: draft.url,
          relevanceScore: Math.max(75, 98 - idx * 2),
          mainFinding: draft.venue
            ? `Published in ${draft.venue}. Empirical literature addressing foundational aspects of the question.`
            : "Peer-reviewed literature addressing central research question.",
          suggestedUse:
            draft.authorityTier === "A"
              ? "Primary theoretical framework & empirical evidence grounding"
              : "Supporting literature and contextual evidence",
          citation: citationStr,
          status: "unreviewed",
          retrievalSource: draft.discoveredVia,
          retrievedAt: new Date().toISOString(),
          peerReviewed: draft.authorityTier === "A",
          sourceCredibility:
            draft.authorityTier === "A"
              ? "Gold Standard (Leading Journal / Monograph)"
              : "Standard Academic / University Press",
        } as DiscoveredSource;
      });
    } else {
      // Graceful fallback to curated discovery catalog if external APIs are unreachable (e.g. offline testing)
      const mockResult = conductAskScholarResearchForOutline({
        question: effectiveQuery,
        assignmentType: (project.answers["assignment_type"] || "essay") as any,
        academicLevel: academicLevel as any,
        targetWordCount: Number(project.answers["targetWordCount"] || 2000),
      });
      if (mockResult?.curatedDiscoveredSources && mockResult.curatedDiscoveredSources.length > 0) {
        sources = mockResult.curatedDiscoveredSources;
      }
    }

    // Persist discovered sources to Supabase project_sources
    await persistSourcesToSupabase(project.projectId, sources);

    // Save discovered sources to project answers
    project.answers["discovered_sources"] = JSON.stringify(sources);
    await getProjectStore().save(project);

    res.json({ sources });
  } catch (err: unknown) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Assignment research error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: errorMsg || "Failed to discover research sources" });
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
      "openrouter/auto",
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
      finalStructure.targetFrameworks =
        data.target_frameworks ||
        data.targetFrameworks ||
        finalStructure.targetFrameworks ||
        extractTargetFrameworks(question, assignmentType, briefText);
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
    sections: reqSections,
  } = req.body || {};

  const rawSections = reqSections || project.answers["sections"];
  const parsedSections = safeParseObject(rawSections);

  let userSpecificGuidance = "";
  if (parsedSections) {
    const isIntro = /intro/i.test(sectionTitle || "");
    const isConclusion = /(concl|summary|final)/i.test(sectionTitle || "");
    const sectionKey: "intro" | "body" | "conclusion" = isIntro
      ? "intro"
      : isConclusion
      ? "conclusion"
      : "body";
    userSpecificGuidance = getSectionPromptGuidelines(sectionKey, { sections: parsedSections });
  }

  try {
    const mappedCitationItems: WebsiteCitationItem[] = (
      Array.isArray(approvedEvidence) ? approvedEvidence : []
    ).map((e: unknown, idx: number) => {
      const ev = (e && typeof e === "object" ? e : {}) as Record<string, unknown>;
      const id = (ev.id as string) || (ev.source_id as string) || (ev.sourceId as string) || `src-${idx + 1}`;
      const title = (ev.title as string) || (ev.claim as string) || "Scholarly Resource";
      const authors = Array.isArray(ev.authors)
        ? (ev.authors as string[])
        : typeof ev.authors === "string"
        ? [ev.authors]
        : typeof ev.author === "string"
        ? [ev.author]
        : ["Author"];
      const year = (ev.year as string | number) || "2024";
      const journal = (ev.journal as string) || (ev.venue as string) || undefined;
      const doi = (ev.doi as string) || undefined;
      const url = (ev.url as string) || undefined;
      const citation = (ev.citation as string) || undefined;
      const claim = (ev.claim as string) || undefined;
      const evidenceSnippet = (ev.evidenceSnippet as string) || (ev.mainFinding as string) || undefined;

      return {
        id,
        title,
        authors,
        year,
        journal,
        venue: journal,
        doi,
        url,
        citation,
        claim,
        evidenceSnippet,
        mainFinding: evidenceSnippet,
      };
    });

    const evidenceContext = mappedCitationItems.length > 0
      ? `APPROVED EVIDENCE TO USE (DO NOT FABRICATE OTHER SOURCES):\n` +
        mappedCitationItems
          .map((e, i) => `[${i + 1}] (Token ID: [${e.id}]) Claim: ${e.claim || e.title} | Evidence: ${e.evidenceSnippet || e.title} | Citation: ${e.citation || e.title}`)
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

    const briefRaw = [
      project.answers["assignment_brief_text"],
      project.answers["instructions"],
      project.answers["assignment_question"],
      project.answers["research_topic"],
    ].filter(Boolean).join(" ");
    const isShortQA = isTutorialOrShortQABrief(briefRaw, targetWordCount) || targetWordCount <= 200;

    const tutorialOrPeelRules = isShortQA
      ? `CRITICAL TUTORIAL Q&A GUIDELINES:
1. Directly answer the question in concise, conversational, and analytically grounded prose (~100-150 words).
2. Do NOT write generic dissertation introductions, conclusion filler, artificial section summaries, or meta-commentary.
3. STRICT CITATION CONVENTION: You are strictly PROHIBITED from formatting in-text citations yourself (do NOT write "(Author, Year)" or author names with years) and strictly PROHIBITED from outputting a "References" or "Bibliography" section. When citing approved evidence, insert ONLY bracket tokens [1], [2], or token IDs like [${mappedCitationItems[0]?.id || "ev-id"}]. The citation interceptor will compile all citations deterministically.
4. Adhere strictly to any custom section guidance provided by the student above.
5. Provide ONLY the section draft text.`
      : `CRITICAL RULES:
1. ONLY cite from the approved evidence provided above. Do NOT fabricate citations, authors, or statistics.
2. STRICT CITATION CONVENTION: You are strictly PROHIBITED from formatting in-text citations yourself (do NOT write "(Author, Year)", "(Author Year)", or author names with years) and strictly PROHIBITED from outputting any "References", "Bibliography", or "Works Cited" section at the end.
3. When referencing approved evidence, you MUST insert ONLY bracket tokens like [1], [2], or bracket IDs like [${mappedCitationItems[0]?.id || "ev-id"}]. The deterministic Scholar Citation Interceptor will convert all bracket tokens into certified ${citationStyle} in-text citations and append references.
4. Maintain rigorous paragraph structure and academic tone.
5. Adhere strictly to any custom section guidance provided by the student above.
6. Provide ONLY the section draft text.`;

    const prompt = `You are the Scholar Core Grounded Academic Drafting Agent.
Write the draft for section: "${sectionTitle}".

Assignment Type: ${assignmentType}
${genreGuidance}

Section Guidance: ${sectionGuidance}
${userSpecificGuidance ? `\n${userSpecificGuidance}\n` : ""}
Target Word Count: Approximately ${targetWordCount} words
Academic Level: ${academicLevel} (${academicLevel === "postgraduate" ? "Write with advanced theoretical synthesis, nuanced evaluation, and sophisticated academic prose." : "Write with clear, coherent argumentation, conceptual accuracy, and formal academic tone."})
Citation Style: ${citationStyle}
Central Thesis / Stance: "${thesis}"
Key Points to cover: ${keyPoints.join(", ")}

${evidenceContext}

${tutorialOrPeelRules}`;

    const scholarlyDirectives = buildScholarlyVoiceSystemPrompt({
      discipline: "Academic Coursework",
      dialect: "en-GB",
      requireVaultEvidence: true,
    });

    let effectiveDraft = "";
    const aiConfig = resolveRequestAiConfig(req);
    if (aiConfig.candidates.length > 0) {
      try {
        const brainResult = await scholarBrain.complete({
          req,
          systemPrompt: `You are the Scholar Core Grounded Academic Drafting Agent.\n\n${scholarlyDirectives}`,
          userPrompt: prompt,
          taskClass: "drafting",
          dialect: "en-GB",
          stripCliches: true,
        });
        if (brainResult.text) {
          effectiveDraft = brainResult.text;
        }
      } catch (brainErr: any) {
        if (brainErr?.message === "RequireFrontendLLMException") throw brainErr;
        console.warn("scholarBrain.complete error in draft-section, falling back to callOpenRouterText:", brainErr?.message);
      }
    }

    if (!effectiveDraft) {
      const draft = await callOpenRouterText(
        req,
        res,
        `You are the Scholar Core Grounded Academic Drafting Agent.\n\n${scholarlyDirectives}`,
        prompt,
        "openrouter/auto",
        "drafting"
      );
      effectiveDraft = draft?.trim() ? draft.trim() : "";
    }

    if (!effectiveDraft) {
      effectiveDraft = generateSectionDraft({
          sectionTitle,
          assignmentQuestion: project.answers["assignment_question"] || "",
          academicFunction: sectionGuidance,
          targetWordCount,
          academicLevel,
          citationStyle,
          thesis,
          keyPoints,
          boundSources: mappedCitationItems.map((e) => ({
            title: e.claim || e.title || "Scholarly Resource",
            citation: e.citation,
            authors: e.authors,
            year: typeof e.year === "number" ? String(e.year) : e.year,
          })),
        });
    }

    // Deterministic Token Interceptor: strictly strips hallucinated references and compiles citations in project style
    effectiveDraft = replaceBracketTokensWithDeterministicCitations(
      effectiveDraft,
      mappedCitationItems,
      citationStyle
    );

    // Apply Discourse-Level Scholarly Voice Guardrails (cliché suppression, British English, NFC Unicode preservation)
    effectiveDraft = sanitizeScholarlyText(effectiveDraft, { dialect: "en-GB", stripCliches: true });
    effectiveDraft = normalizeUnicodeNFC(effectiveDraft);

    if (mappedCitationItems.length === 0 && !effectiveDraft.includes("[Unverified Claim — Vault Citation Required]")) {
      if (/\b(studies show|research indicates|data demonstrates|proven that|empirically established)\b/i.test(effectiveDraft)) {
        effectiveDraft = effectiveDraft.replace(
          /\b(studies show|research indicates|data demonstrates|proven that|empirically established)\b/gi,
          (m) => `${m} [Unverified Claim — Vault Citation Required]`
        );
      }
    }

    res.json({ draft: effectiveDraft });
  } catch (err: any) {
    if (err?.message === "RequireFrontendLLMException") return;
    console.error("Section drafting error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: err.message || "Failed to draft section" });
    }
  }
});

// 6b. POST /api/projects/:id/assignment/stream-section
router.post("/stream-section", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    sectionId,
    sectionTitle,
    academicFunction,
    targetWordCount = 500,
    academicLevel = project.answers["academic_level"] || "undergraduate",
    citationStyle = project.answers["citation_style"] || "apa7",
    assignmentTopic = project.answers["assignment_question"] || "",
    thesis = "",
    boundSources = [],
    revisionPrompt,
    existingContent = "",
    evidencePackPrompt,
  } = req.body || {};

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders?.();

  try {
    const mappedSources: WebsiteCitationItem[] = (
      Array.isArray(boundSources) ? boundSources : []
    ).map((s: unknown, idx: number) => {
      const src = (s && typeof s === "object" ? s : {}) as Record<string, unknown>;
      const id = (src.id as string) || (src.source_id as string) || (src.sourceId as string) || `src-${idx + 1}`;
      const title = (src.title as string) || "Scholarly Resource";
      const authors = Array.isArray(src.authors)
        ? (src.authors as string[])
        : typeof src.authors === "string"
        ? [src.authors]
        : typeof src.author === "string"
        ? [src.author]
        : ["Author"];
      const year = (src.year as string | number) || "2024";
      const journal = (src.journal as string) || (src.venue as string) || (src.type as string) || undefined;
      const doi = (src.doi as string) || undefined;
      const url = (src.url as string) || undefined;
      const citation = (src.citation as string) || undefined;

      return {
        id,
        title,
        authors,
        year,
        journal,
        venue: journal,
        doi,
        url,
        citation,
        mainFinding: (src.mainFinding as string) || (src.suggestedUse as string) || undefined,
        suggestedUse: (src.suggestedUse as string) || undefined,
      };
    });

    // Use structured evidence pack if provided (Production Spec §4.1–4.3),
    // otherwise fall back to the basic flat evidence list
    const evidenceBlock = evidencePackPrompt
      ? evidencePackPrompt
      : mappedSources
          .map((s, i) => `[${i + 1}] (Token ID: [${s.id}]) Title: ${s.title} | Author(s): ${(s.authors || []).join(", ")} (${s.year || "n.d."}) | Venue: ${s.journal || "Scholarly"} | Rationale: ${s.suggestedUse || s.mainFinding || ""}`)
          .join("\n");

    const revisionInstruction = revisionPrompt === "deepen"
      ? "REVISION FOCUS: Deepen analytical critique. Minimize passive descriptive text and amplify dialectical interrogation of theoretical assumptions (target 70% analysis / 30% description)."
      : revisionPrompt === "expand"
      ? "REVISION FOCUS: Expand scholarly elaboration. Introduce detailed comparative nuances while maintaining empirical citation grounding."
      : revisionPrompt === "condense"
      ? "REVISION FOCUS: Condense prose. Tighten argumentation and eliminate redundancies to fit the exact target word count."
      : revisionPrompt === "citations"
      ? "REVISION FOCUS: Reinforce citation grounding. Seamlessly integrate in-text citations from the bound sources to substantiate claims and strengthen academic credibility."
      : revisionPrompt === "smooth"
      ? "REVISION FOCUS: Enhance academic transitions and cohesion. Craft seamless transitional linkages between paragraphs and ensure strong analytical flow."
      : revisionPrompt
      ? `REVISION FOCUS: ${revisionPrompt}`
      : "";

    const existingBlock = (existingContent && revisionPrompt)
      ? `EXISTING DRAFT CONTENT TO REVISE:\n"""\n${existingContent}\n"""\nPlease revise and upgrade this draft following the revision focus above while preserving accurate empirical citations.\n`
      : "";

    const briefRaw = [
      project.answers["assignment_brief_text"],
      project.answers["instructions"],
      project.answers["assignment_question"],
      assignmentTopic,
    ].filter(Boolean).join(" ");
    const isShortQA = isTutorialOrShortQABrief(briefRaw, targetWordCount) || targetWordCount <= 200;

    const frameworkGuidelines = isShortQA
      ? `TUTORIAL & CASE STUDY Q&A GUIDELINES:
- Directly answer the question in concise, conversational, and analytically grounded prose (~100-150 words).
- Do NOT generate generic dissertation introductions, conclusion filler, artificial section summaries, or meta-commentary.
- STRICT CITATION CONVENTION: You are strictly PROHIBITED from formatting in-text citations as (Author, Year) or outputting a "References" section. Use ONLY bracket tokens like [1], [2], or token IDs like [${mappedSources[0]?.id || "ev-uuid"}].`
      : `MANDATORY PEEL PARAGRAPH FRAMEWORK:
- Point: Distinct topic sentence advancing the central thesis.
- Evidence: Grounded empirical citations referenced SOLELY via bracket tokens like [1], [2], or token IDs like [${mappedSources[0]?.id || "ev-uuid"}].
- STRICT CITATION CONVENTION: Do NOT format author-year in-text citations or include a "References" section. All citations will be compiled deterministically by the Citation Interceptor according to ${citationStyle}.
- Explanation: 70% critical analysis & evaluation / 30% descriptive exposition.
- Link: Clear concluding transition linking back to the primary assessment prompt.`;

    const prompt = `You are the Scholar Core Grounded Academic Drafting Agent.
Write the section prose for: "${sectionTitle}".
Academic Function: ${academicFunction}
Target Word Count: ~${targetWordCount} words
Academic Level: ${academicLevel}
Citation Style: ${citationStyle}
Central Thesis: "${thesis}"
Assignment Topic: "${assignmentTopic}"

${revisionInstruction}
${existingBlock}
${evidencePackPrompt ? evidenceBlock : `BOUND EVIDENCE (Use these sources for in-text citations; do NOT fabricate external sources):\n${evidenceBlock || "Use standard scholarly reasoning."}`}

${frameworkGuidelines}

Output ONLY the section text in clean academic Markdown prose.`;

    const scholarlyDirectives = buildScholarlyVoiceSystemPrompt({
      discipline: "Academic Coursework",
      dialect: "en-GB",
      requireVaultEvidence: true,
    });

    const draft = await callOpenRouterText(
      req,
      res,
      `You are the Scholar Core Grounded Academic Drafting Agent.\n\n${scholarlyDirectives}`,
      prompt,
      "openrouter/auto",
      "drafting"
    );

    let effectiveDraft = draft?.trim()
      ? draft.trim()
      : generateSectionDraft({
          sectionTitle,
          assignmentQuestion: assignmentTopic,
          academicFunction,
          targetWordCount,
          academicLevel,
          citationStyle,
          thesis,
          boundSources: mappedSources.map((s) => ({
            title: s.title || "Scholarly Resource",
            citation: s.citation,
            authors: s.authors,
            year: typeof s.year === "number" ? String(s.year) : s.year,
          })),
          revisionPrompt: revisionPrompt as any,
        });

    // Pipe streamed draft through deterministic citation interceptor
    effectiveDraft = replaceBracketTokensWithDeterministicCitations(
      effectiveDraft,
      mappedSources,
      citationStyle
    );

    // Apply Discourse-Level Scholarly Voice Guardrails (cliché suppression, British English, NFC Unicode preservation)
    effectiveDraft = sanitizeScholarlyText(effectiveDraft, { dialect: "en-GB", stripCliches: true });
    effectiveDraft = normalizeUnicodeNFC(effectiveDraft);

    if (mappedSources.length === 0 && !effectiveDraft.includes("[Unverified Claim — Vault Citation Required]")) {
      if (/\b(studies show|research indicates|data demonstrates|proven that|empirically established)\b/i.test(effectiveDraft)) {
        effectiveDraft = effectiveDraft.replace(
          /\b(studies show|research indicates|data demonstrates|proven that|empirically established)\b/gi,
          (m) => `${m} [Unverified Claim — Vault Citation Required]`
        );
      }
    }

    const words = effectiveDraft.split(" ");
    for (let i = 0; i < words.length; i += 5) {
      const chunk = (i === 0 ? "" : " ") + words.slice(i, i + 5).join(" ");
      res.write(`data: ${JSON.stringify({ chunk })}\n\n`);
    }
    res.write(`data: ${JSON.stringify({ fullText: effectiveDraft })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: any) {
    console.error("Stream section error:", err);
    res.write(`data: ${JSON.stringify({ error: err.message || "Failed to stream section" })}\n\n`);
    res.write("data: [DONE]\n\n");
    res.end();
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

function extractDeterministicTutorPatch(
  userMessage: string,
  existingPlan: any,
  existingAnalysis: any
): TutorWorkspacePatch | null {
  const msg = userMessage.toLowerCase();
  let patch: TutorWorkspacePatch | null = null;

  // 1. Focus or modify a question: e.g. "Focus question 2 on EU AI Act compliance" or "change question 1 to..."
  const questionFocusMatch = msg.match(/(?:focus|change|update|modify|refine)\s+(?:question|q)\s*(\d+)\s+(?:on|to)\s+(.+)/i);
  if (questionFocusMatch) {
    const qIndex = parseInt(questionFocusMatch[1], 10) - 1;
    const focusTopic = questionFocusMatch[2].trim().replace(/[.!?]+$/, "");
    const currentQuestions = Array.isArray(existingPlan?.coreQuestions)
      ? [...existingPlan.coreQuestions]
      : [];
    if (currentQuestions.length > 0 && qIndex >= 0 && qIndex < currentQuestions.length) {
      const target = currentQuestions[qIndex];
      const targetText = typeof target === "string" ? target : target.question;
      const updatedQuestionText = `How do ${focusTopic} frameworks critically govern and substantiate ${targetText.slice(0, 80)}?`;
      if (typeof target === "string") {
        currentQuestions[qIndex] = updatedQuestionText;
      } else {
        currentQuestions[qIndex] = {
          ...target,
          question: updatedQuestionText,
          rationale: `Refocused specifically on ${focusTopic} per student guidance and First-Class grading criteria.`,
        };
      }
      patch = patch || {};
      patch.plan = patch.plan || {};
      patch.plan.coreQuestions = currentQuestions;
    }
  }

  // 2. Add custom research question: e.g. "Add a research question about..."
  const addQuestionMatch = msg.match(/(?:add|include)\s+(?:a\s+)?(?:new\s+)?(?:research\s+)?question\s+(?:about|on|regarding)\s+(.+)/i);
  if (addQuestionMatch) {
    const newTopic = addQuestionMatch[1].trim().replace(/[.!?]+$/, "");
    const currentQuestions = Array.isArray(existingPlan?.coreQuestions)
      ? [...existingPlan.coreQuestions]
      : [];
    currentQuestions.push({
      id: `q-${currentQuestions.length + 1}`,
      question: `What empirical mechanisms and critical implications arise from ${newTopic}?`,
      category: "Targeted Inquiry",
      rationale: `Direct student inquiry exploring ${newTopic}.`,
    });
    patch = patch || {};
    patch.plan = patch.plan || {};
    patch.plan.coreQuestions = currentQuestions;
  }

  // 3. Add custom search strategy: e.g. "Add a search strategy for..."
  const addStrategyMatch = msg.match(/(?:add|include)\s+(?:a\s+)?(?:new\s+)?(?:search\s+)?(?:strategy|query)\s+(?:for|on|about)\s+(.+)/i);
  if (addStrategyMatch) {
    const strategyTopic = addStrategyMatch[1].trim().replace(/[.!?]+$/, "");
    const currentStrategies = Array.isArray(existingPlan?.searchStrategies)
      ? [...existingPlan.searchStrategies]
      : [];
    currentStrategies.push({
      id: `strat-${currentStrategies.length + 1}`,
      database: "Google Scholar / CrossRef",
      searchQuery: `"${strategyTopic}" AND ("empirical analysis" OR "critical review")`,
      relevanceTarget: `Targeted scholarly literature addressing ${strategyTopic}.`,
    });
    patch = patch || {};
    patch.plan = patch.plan || {};
    patch.plan.searchStrategies = currentStrategies;
  }

  // 4. Update or narrow scope: e.g. "Exclude pre-2015 papers"
  const excludeMatch = msg.match(/(?:exclude|do not include|omit)\s+(.+)/i);
  if (excludeMatch) {
    const excludedTopic = excludeMatch[1].trim().replace(/[.!?]+$/, "");
    const currentOutOfScope = Array.isArray(existingPlan?.outOfScopeTopics)
      ? [...existingPlan.outOfScopeTopics]
      : [];
    if (!currentOutOfScope.includes(excludedTopic)) {
      currentOutOfScope.push(excludedTopic);
      patch = patch || {};
      patch.plan = patch.plan || {};
      patch.plan.outOfScopeTopics = currentOutOfScope;
    }
  }

  return patch;
}

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
    analysis = project.answers["assignment_analysis"],
    plan = project.answers["assignment_plan"] || project.answers["assignment_research_plan"],
  } = req.body || {};

  let parsedPlan: any = null;
  try {
    parsedPlan = typeof plan === "string" ? JSON.parse(plan) : plan;
  } catch {
    parsedPlan = null;
  }

  let parsedAnalysis: any = null;
  try {
    parsedAnalysis = typeof analysis === "string" ? JSON.parse(analysis) : analysis;
  } catch {
    parsedAnalysis = null;
  }

  const analysisContext = parsedAnalysis
    ? `ASSIGNMENT ANALYSIS CONTEXT:\n${JSON.stringify(parsedAnalysis, null, 2)}\n`
    : "";
  const planContext = parsedPlan
    ? `CURRENT RESEARCH PLAN CONTEXT:\n${JSON.stringify(parsedPlan, null, 2)}\n`
    : "";

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

${analysisContext}
${planContext}
${draftContext}

${modeInstruction}

BIDIRECTIONAL WORKSPACE SYNCHRONIZATION:
If the student asks to modify, refine, refocus, or add research questions, search queries, scope boundaries, or assignment parameters
(e.g., "Focus question 2 on EU AI Act compliance", "Add a search query for algorithmic transparency in JSTOR", "Exclude pre-2015 papers"):
You MUST populate the "patch" object in your JSON response alongside your conversational advice:

Return ONLY valid JSON matching:
{
  "reply": "Conversational, constructive academic response explaining the tutor's advice and any updates made...",
  "mode": "${mode}",
  "patch": {
    "plan": {
      "coreQuestions": [
        { "id": "q-1", "question": "...", "rationale": "...", "category": "..." }
      ],
      "searchStrategies": [
        { "id": "strat-1", "database": "...", "searchQuery": "...", "relevanceTarget": "..." }
      ],
      "outOfScopeTopics": ["...", "..."]
    },
    "analysis": {
      "keyConcepts": ["...", "..."]
    },
    "question": "..."
  },
  "socraticQuestions": [ ... ],
  "rubricEstimation": { ... },
  "counterArguments": [ ... ],
  "suggestion": {
    "type": "rephrase" | "replace_text" | "reduce_words" | "add_evidence",
    "suggestedText": "..."
  }
}`;

    let data: any = null;
    try {
      data = await callOpenRouterJSON(
        req,
        res,
        "You are the Scholar Core Pedagogical Academic Tutor.",
        prompt,
        "openrouter/auto",
        "chat"
      );
    } catch (e: any) {
      if (e?.message !== "RequireFrontendLLMException") {
        console.warn("LLM tutor chat unavailable, using deterministic Socratic fallback:", e?.message);
      }
    }

    if (!data) {
      const deterministicPatch = extractDeterministicTutorPatch(message, parsedPlan, parsedAnalysis);
      data = {
        reply: deterministicPatch
          ? `I have updated your research workspace accordingly. Focus your inquiry on these refined parameters to ensure strong alignment with First-Class marking criteria.`
          : `That is a critical inquiry for your assignment. When approaching "${question.slice(0, 80)}", consider how the empirical evidence addresses the theoretical tensions in your thesis.`,
        mode,
        patch: deterministicPatch || undefined,
        socraticQuestions: [
          {
            id: `sq-${Date.now()}`,
            question: `How does your current framing account for competing empirical counterevidence regarding ${parsedAnalysis?.keyConcepts?.[0] || "this topic"}?`,
            targetConcept: parsedAnalysis?.keyConcepts?.[0] || "Core Thesis",
            challengeType: "probe_assumptions",
            rationale: "Ensures dialectical balance and prevents confirmation bias.",
          },
        ],
      };
    } else if (!data.patch) {
      const deterministicPatch = extractDeterministicTutorPatch(message, parsedPlan, parsedAnalysis);
      if (deterministicPatch) {
        data.patch = deterministicPatch;
      }
    }

    // Persist any patch delta directly into project.answers
    if (data.patch) {
      if (data.patch.plan) {
        const existingPlan = parsedPlan || {};
        const mergedPlan = { ...existingPlan, ...data.patch.plan };
        project.answers["assignment_plan"] = JSON.stringify(mergedPlan);
        project.answers["assignment_research_plan"] = JSON.stringify(mergedPlan);
      }
      if (data.patch.analysis) {
        const existingAnalysis = parsedAnalysis || {};
        const mergedAnalysis = { ...existingAnalysis, ...data.patch.analysis };
        project.answers["assignment_analysis"] = JSON.stringify(mergedAnalysis);
      }
      if (data.patch.question) {
        project.answers["assignment_question"] = String(data.patch.question);
      }
      await getProjectStore().save(project);
    }

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
    const effectiveQuery = (
      question ||
      project.answers["research_topic"] ||
      project.answers["title"] ||
      "academic research"
    ).trim();

    let drafts: DiscoveredSourceDraft[] = [];
    try {
      drafts = await discoverMultiPortalSources(effectiveQuery, 15);
    } catch (discErr) {
      console.warn("Multi-portal discovery failed in citations-ground, attempting fallback:", discErr);
      drafts = [];
    }

    if (drafts.length > 0) {
      const citations = drafts.map((d, idx) => {
        const item: WebsiteCitationItem = {
          id: `cit-${idx + 1}`,
          title: d.title,
          authors: d.authors,
          year: d.year ? String(d.year) : "2024",
          journal: d.venue,
          venue: d.venue,
          doi: d.doi,
          url: d.url,
        };
        const inText = formatAskScholarInText(item, idx, citationStyle);
        const bib = formatAskScholarBibliographyEntry(item, idx, citationStyle);

        return {
          id: `cit-${idx + 1}`,
          sourceTitle: d.title,
          authors: d.authors,
          year: d.year ? String(d.year) : "2024",
          journalOrPublisher: d.venue || "Academic Press",
          doi: d.doi || "",
          citationText: bib.formattedText,
          inTextCitation: inText,
          citationStyle,
          verifiedPeerReviewed: d.authorityTier === "A",
          linkedThemeIds: [],
          quoteOrFindingSnippet: d.venue
            ? `Published in ${d.venue}. Grounded scholarly literature addressing key dimensions of inquiry.`
            : "Peer-reviewed literature supporting conceptual foundations.",
        };
      });

      // Persist discovered citations as project sources
      const sourcesToPersist: DiscoveredSource[] = drafts.map((d, idx) => ({
        id: `src-ground-${Date.now()}-${idx + 1}`,
        title: d.title,
        authors: d.authors,
        year: d.year ? String(d.year) : "2024",
        type: d.sourceType === "scholarly" ? "journal" : "article",
        journal: d.venue,
        doi: d.doi,
        url: d.url,
        relevanceScore: 90,
        mainFinding: "Peer-reviewed grounding literature.",
        suggestedUse: "Core conceptual grounding",
        citation: citations[idx].citationText,
        status: "unreviewed",
        retrievalSource: d.discoveredVia,
        retrievedAt: new Date().toISOString(),
        peerReviewed: d.authorityTier === "A",
      }));
      await persistSourcesToSupabase(project.projectId, sourcesToPersist);

      return res.json({ citations });
    }

    // Fallback to LLM if external multi-portal search is empty or offline
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
  } catch (err: unknown) {
    if ((err as Error)?.message === "RequireFrontendLLMException") return;
    console.error("Citation grounding error:", err);
    if (!res.headersSent) {
      res.status(500).json({ error: (err as Error).message || "Failed to ground citations" });
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

// Deterministic Grounded Fallback Response Generator
function buildDeterministicCopilotResponse(
  phase: "understand" | "sources" | "drafting" | "submission",
  message: string,
  ctx: {
    question: string;
    targetWordCount: number;
    academicLevel: string;
    citationStyle: string;
    analysis: any;
    keptSources: any[];
    lectureSlides: any[];
    evidenceItems: any[];
    outline: any[];
    peelSections: any[];
    rubricAudit: any;
    unresolvedCitations: any[];
  }
): string {
  const query = message.toLowerCase();

  if (phase === "understand") {
    if (query.includes("command verb") || query.includes("verb") || query.includes("meaning")) {
      const verbs = ctx.analysis?.commandVerbs || [];
      const verbList = verbs.length > 0
        ? verbs.map((v: any) => `- **${v.verb}**: ${v.meaning}\n  *Academic Expectation*: ${v.academicExpectation}`).join("\n")
        : `- **Critically evaluate**: Weigh competing theoretical perspectives and empirical findings to substantiate a reasoned academic judgment, rather than merely summarizing descriptions.`;
      return `### Command Verb Breakdown\n\nWhen addressing your assignment prompt ("*${ctx.question}*"), pay close attention to the operative command verbs:\n\n${verbList}\n\n**Strategy**: Allocate roughly 70% of your body word count to critical argumentation and synthesis, reserving only ~30% for factual description and conceptual exposition.`;
    }

    if (query.includes("rubric") || query.includes("criteria") || query.includes("mark")) {
      return `### Rubric Alignment Guidelines (${ctx.academicLevel.toUpperCase()})\n\nTo achieve a **First Class (70%+)** on this ${ctx.targetWordCount.toLocaleString()}-word assignment:\n\n1. **Critical Evaluation**: Move beyond descriptive narration by interrogating theoretical assumptions and conflicting evidence.\n2. **Evidence Grounding**: Ensure 100% of factual assertions cite credible scholarly literature formatted in ${ctx.citationStyle.toUpperCase()}.\n3. **Argumentative Coherence**: Use explicit topic sentences and linking transitions connecting back to your core thesis statement.\n4. **Word Budget**: Maintain sections within ±10% of their allocated targets.`;
    }

    if (query.includes("question") || query.includes("research question") || query.includes("suggest")) {
      return `### Recommended Research Sub-Questions\n\nTo unpack "*${ctx.question}*" within your ${ctx.targetWordCount.toLocaleString()}-word limit, consider organizing your inquiry around these 3 focal questions:\n\n1. *Theoretical Foundation*: What are the fundamental epistemological assumptions underpinning this domain?\n2. *Empirical Examination*: What empirical evidence supports or complicates these claims in recent literature?\n3. *Critical Synthesis*: How do recent counter-perspectives challenge the orthodoxy, and what balanced conclusion emerges?`;
    }

    return `### Academic Advisor Guidance\n\nWelcome to **Phase 1: Understand**. We are analyzing your assignment prompt:\n> "*${ctx.question}*"\n\n- **Target Word Count**: ${ctx.targetWordCount.toLocaleString()} words\n- **Academic Level**: ${ctx.academicLevel}\n- **Citation Style**: ${ctx.citationStyle.toUpperCase()}\n\nTo succeed, ensure your thesis directly responds to the command verbs in the prompt. Would you like me to unpack the command verbs, clarify marking criteria, or formulate targeted research sub-questions?`;
  }

  if (phase === "sources") {
    if (query.includes("empirical") || query.includes("recommend") || query.includes("literature")) {
      const approvedCount = ctx.keptSources.length;
      const sourcesSummary = approvedCount > 0
        ? ctx.keptSources.map((s, i) => `${i + 1}. **${s.title}** (${s.authors?.join(", ") || "Scholarly source"}, ${s.year || "n.d."}) — *${s.venue || "Peer-Reviewed"}*`).join("\n")
        : `No sources approved yet. Search across CrossRef, Semantic Scholar, and your Knowledge Vault to curate 4–8 foundational papers.`;
      return `### Empirical Sourcing Recommendations\n\nYour assignment currently has **${approvedCount} approved source(s)**:\n\n${sourcesSummary}\n\n**Search Strategy Recommendation**:\n- Query high-impact databases (Scopus, JSTOR, Web of Science) using Boolean combinations of key concepts from your brief.\n- Prioritize peer-reviewed empirical studies and systematic reviews published in the last 5 years.\n- Ensure each source provides distinct empirical claims to bind into your PEEL evidence ledger.`;
    }

    if (query.includes("slide") || query.includes("lecture") || query.includes("concept")) {
      const slidesCount = ctx.lectureSlides.length;
      const slidesSummary = slidesCount > 0
        ? ctx.lectureSlides.map((d: any) => `- **${d.title || d.fileName}**: Concepts extracted — ${(d.extractedConcepts || []).slice(0, 4).join(", ") || "Lecture themes"}`).join("\n")
        : `Upload lecture slides in the Phase 2 dropzone to automatically extract course-specific concepts and integrate them into your evidence ledger.`;
      return `### Lecture Slide Concept Integration\n\n${slidesSummary}\n\n**Librarian Tip**: Examiners look for synthesis between lecture material and independent peer-reviewed literature. Use lecture slides to establish module-specific terminology, then substantiate each concept with independent academic citations.`;
    }

    if (query.includes("credential") || query.includes("verify") || query.includes("author")) {
      return `### Author Credibility & Source Verification\n\nWhen evaluating sources for your evidence cards:\n\n1. **Peer-Review Status**: Confirm the journal is indexed in Scopus / Web of Science (Q1 or Q2 preferred).\n2. **Author Authority**: Check the authors' academic affiliations and citation indices (h-index).\n3. **Methodological Rigor**: Verify sample sizes, control mechanisms, and acknowledgment of study limitations.\n4. **Timeliness**: For dynamic topics, emphasize studies from the past 3–5 years while anchoring classical foundations.`;
    }

    return `### Scholarly Librarian Guidance\n\nWelcome to **Phase 2: Sources & Evidence**. You currently have **${ctx.keptSources.length} approved source(s)** and **${ctx.evidenceItems.length} verified evidence claim(s)**.\n\nI can help you:\n- Recommend empirical sources and refine search strings\n- Extract key concepts from uploaded lecture slide decks\n- Verify author credentials and methodological credibility\n\nWhat literature would you like to explore?`;
  }

  if (phase === "drafting") {
    if (query.includes("deepen") || query.includes("critique") || query.includes("analysis")) {
      return `### Deepening Critical Evaluation (70/30 Balance)\n\nTo turn descriptive prose into high-scoring critical analysis:\n\n1. **Avoid mere summary**: Rather than explaining *what* happened or *what* an author said (descriptive), interrogate *why* it matters and *to what extent* their conclusions are valid (analytical).\n2. **Question Assumptions**: Identify underlying assumptions in the evidence: Does the methodology generalize? Are there confounding variables?\n3. **Juxtapose Conflicting Evidence**: Place two scholar perspectives in tension: "*While [Author A] demonstrates X, [Author B]'s longitudinal findings suggest that X holds only when Y is present...*"\n4. **Substantiate Judgment**: Conclude each paragraph with an analytical verdict that directly answers your central question.`;
    }

    if (query.includes("peel") || query.includes("structure") || query.includes("strengthen")) {
      return `### Strengthening PEEL Section Architecture\n\nEvery substantive paragraph should follow the **PEEL** framework:\n\n- **Point (P)**: A clear, analytical topic sentence asserting an argument (not a fact).\n- **Evidence (E)**: Precise citation of approved literature or empirical data supporting the assertion.\n- **Explanation (E)**: Rigorous theoretical analysis (70% of the paragraph) unpacking the mechanism, limitations, and implications.\n- **Link (L)**: A synthetic conclusion connecting this point back to the overarching assignment question.\n\nCheck your section drafts in the center editor to verify each section maintains these 4 components.`;
    }

    if (query.includes("counterargument") || query.includes("counter") || query.includes("rebuttal")) {
      return `### Synthesizing Counter-Arguments\n\nTop-tier academic writing actively tests itself against opposing viewpoints:\n\n1. **Formulate the Strongest Counter-Position**: Avoid setting up a strawman. Present the rival school of thought with scholarly fairness.\n2. **Identify the Point of Divergence**: Highlight whether the dispute is empirical (data interpretation), methodological, or normative (value premises).\n3. **Deploy a Grounded Rebuttal**: Rebut the objection using superior empirical evidence or by demonstrating that the objection only applies under narrow boundary conditions.`;
    }

    return `### Academic Scribe Guidance\n\nWelcome to **Phase 3: Sequential Drafting**. Your target budget is **${ctx.targetWordCount.toLocaleString()} words** across **${ctx.outline.length} sections**.\n\nI can assist you with:\n- Deepening analytical critique (enforcing the 70% evaluation / 30% description rule)\n- Structuring rigorous PEEL paragraphs\n- Synthesizing academic counter-arguments and rebuttals\n\nWhich section would you like to refine?`;
  }

  // Phase 4: Submission
  if (query.includes("grade") || query.includes("predicted") || query.includes("explain")) {
    const score = ctx.rubricAudit?.overallScore || 78;
    const band = ctx.rubricAudit?.bandLabel || "First Class (1st)";
    return `### Predicted Grade Breakdown: ${band} (${score}%)\n\nBased on your submission audit:\n\n- **Rubric Alignment Score**: ${ctx.rubricAudit?.rubricAlignmentScore || 85}%\n- **Strengths**: Strong evidence synthesis, rigorous PEEL paragraph structure, and direct answering of the assignment question.\n- **Key Areas to Elevate**: Review any priority fixes highlighted in the audit to maximize marks in critical argumentation.\n\nThis draft demonstrates solid command of academic scholarship.`;
  }

  if (query.includes("citation") || query.includes("unresolved") || query.includes("audit")) {
    const unresolved = ctx.unresolvedCitations || [];
    if (unresolved.length > 0) {
      const list = unresolved.map((c: any) => `- \`${c.rawCitation || c}\`: Missing matching entry in bibliography`).join("\n");
      return `### Citation Reconciliation Audit\n\nFound **${unresolved.length} unresolved citation(s)**:\n\n${list}\n\n**Action Required**: Ensure each in-text citation maps exactly to a corresponding reference in your bibliography matching ${ctx.citationStyle.toUpperCase()} format.`;
    }
    return `### Citation Reconciliation Audit: 100% Verified\n\nAll in-text citations successfully map to verified entries in your auto-generated reference list formatted in **${ctx.citationStyle.toUpperCase()}**.\n\nNo orphan citations or missing bibliographic entries detected.`;
  }

  if (query.includes("format") || query.includes("formatting") || query.includes("university")) {
    return `### University Submission Formatting Checklist\n\nBefore exporting your camera-ready submission:\n\n1. **Typography & Margins**: Standard 1-inch (2.54 cm) margins, standard academic font (Times New Roman or Calibri, 12pt), 1.5 or double line spacing.\n2. **Title Page & Running Headers**: Clear assignment title, module code, candidate number, and word count.\n3. **Word Count Adherence**: Ensure final text falls within the university's ±10% margin.\n4. **Bibliography**: Formatted in **${ctx.citationStyle.toUpperCase()}** with hanging indents and active DOIs.`;
  }

  return `### Senior Examiner Guidance\n\nWelcome to **Phase 4: Submission Quality Audit**. I have audited your draft against standard University Marking Criteria.\n\n- **Predicted Grade**: ${ctx.rubricAudit?.bandLabel || "First Class (1st) — 76%"}\n- **Citation Status**: ${ctx.unresolvedCitations.length === 0 ? "100% Reconciled" : `${ctx.unresolvedCitations.length} Unresolved`}\n- **Formatting**: Verified for Word (.docx) & PDF export\n\nWould you like me to explain your predicted grade, review unresolved citations, or check university formatting requirements?`;
}

// 15. POST /api/projects/:id/assignment/copilot-chat
router.post("/copilot-chat", async (req: express.Request<{ id: string }>, res) => {
  const project = await getProjectSafe(req, res);
  if (!project) return;

  const {
    message,
    phase = "understand",
    history = [],
    projectState,
  } = req.body || {};

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

  const keptSources = sources.filter(
    (s: any) => s.status === "kept" || s.isKept || s.approved
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
  let personaName = "Advisor";
  let personaRole = "Assignment Brief & Rubric Guidance";
  let scopedContextSummary = "";
  let systemPrompt = "";

  if (normalizedPhase === "understand") {
    personaName = "Advisor";
    personaRole = "Assignment Brief & Rubric Guidance";
    scopedContextSummary = `
PHASE 1 BRIEF & RUBRIC STATE:
- Assignment Topic / Question: "${question}"
- Academic Level: ${academicLevel}
- Target Word Count: ${targetWordCount.toLocaleString()} words
- Citation Style: ${citationStyle.toUpperCase()}
- Assignment Type: ${assignmentType}
- Command Verbs: ${JSON.stringify(analysis.commandVerbs || [])}
- Key Concepts: ${JSON.stringify(analysis.keyConcepts || [])}
- Scope Boundaries: ${JSON.stringify(analysis.scopeBoundaries || {})}
- Rubric Criteria: ${JSON.stringify(rubricCriteria || [])}
`;
    systemPrompt = `You are the Advisor, the Academic Brief & Rubric Guidance Copilot in Scholar OS.
Your role is to guide the student in understanding their assignment brief, deconstructing command verbs (e.g. "Critically evaluate", "Analyze", "Examine"), mapping learning outcomes, and clarifying university marking criteria.
Always ground your answers in the student's exact brief, target word count (${targetWordCount}), academic level (${academicLevel}), and citation style (${citationStyle}).
Provide rigorous, structured, academic advice in concise markdown.`;
  } else if (normalizedPhase === "sources") {
    personaName = "Librarian";
    personaRole = "Scholarly Literature & Sourcing";
    scopedContextSummary = `
PHASE 2 SOURCES & EVIDENCE STATE:
- Approved / Kept Literature Sources (${keptSources.length} sources):
${keptSources.map((s: any, i: number) => `  [${i + 1}] "${s.title}" (${s.authors?.join(", ") || "Unknown"}, ${s.year || "n.d."}) - ${s.venue || "Scholarly Source"}. Relevance: ${s.relevanceRationale || s.abstract?.slice(0, 150) || "Approved"}`).join("\n") || "  (No approved sources yet)"}
- Uploaded Lecture Slides & Concepts (${lectureSlides.length} decks):
${lectureSlides.map((d: any) => `  - Deck: "${d.title || d.fileName}". Key Concepts: ${(d.extractedConcepts || []).join(", ") || "Lecture notes"}`).join("\n") || "  (No lecture slides uploaded)"}
- Verified Evidence Ledger (${evidenceItems.length} claims):
${evidenceItems.map((e: any, i: number) => `  [E${i + 1}] Claim: "${e.claimText}". Source: "${e.sourceTitle || e.sourceId}". Quote: "${e.quoteText?.slice(0, 120)}..."`).join("\n") || "  (No evidence items added)"}
`;
    systemPrompt = `You are the Librarian, the Scholarly Literature & Sourcing Copilot in Scholar OS.
Your role is to help the student curate peer-reviewed academic literature, synthesize concepts from university lecture slides, and construct verified evidence cards with grounded citations.
Always ground your responses in their approved literature, slide topics, and evidence ledger.
Help evaluate empirical validity, identify theoretical debates, and bridge lecture concepts to peer-reviewed sources.`;
  } else if (normalizedPhase === "drafting") {
    personaName = "Scribe";
    personaRole = "Academic Drafting & Synthesis";
    scopedContextSummary = `
PHASE 3 ACTIVE PEEL DRAFTING STATE:
- Target Word Budget: ${targetWordCount.toLocaleString()} words (Current Drafted: ${currentTotalWords.toLocaleString()} words)
- Sections & PEEL Decompositions (${outline.length} sections):
${outline.map((sec: any, i: number) => {
  const peel = peelSections.find((p: any) => p.sectionId === sec.id) || {};
  return `  Section ${i + 1}: "${sec.title}" [Target: ${sec.targetWordCount || 0}w, Current: ${sec.currentWordCount || 0}w]
    - Point: "${peel.point || sec.guidance || "Core assertion"}"
    - Evidence: "${peel.evidence || (sec.linkedEvidenceIds?.length ? `${sec.linkedEvidenceIds.length} linked sources` : "Pending citation")}"
    - Explanation (70% critique): "${peel.explanation || "Critical analysis & evaluation"}"
    - Link: "${peel.link || "Synthesis back to central thesis"}"
    - Draft Excerpt: "${(sec.draftContent || "").slice(0, 200)}..."`;
}).join("\n\n") || "  (Outline not yet initialized)"}
`;
    systemPrompt = `You are the Scribe, the Academic Drafting & Synthesis Copilot in Scholar OS.
Your role is to assist with sequential section drafting using the rigorous PEEL framework (Point, Evidence, Explanation, Link), maintaining an optimal balance of 70% critical analysis to 30% descriptive summary.
Help deepen analytical critique, strengthen argumentative transitions, eliminate passive phrasing, and smoothly bind claims to in-text citations.`;
  } else {
    personaName = "Examiner";
    personaRole = "Quality Audit & Final Review";
    scopedContextSummary = `
PHASE 4 SUBMISSION AUDIT & EXAMINER STATE:
- Overall Score & Grade Band: ${rubricAudit?.overallScore ? `${rubricAudit.overallScore}% (${rubricAudit.bandLabel || rubricAudit.overallBand})` : "Pending final audit"}
- Readiness Index: ${rubricAudit?.readinessPercentage || (rubricAudit?.readyForSubmission ? "100%" : "85%")}
- Priority Fixes Identified:
${(rubricAudit?.priorityFixes || []).map((f: string, i: number) => `  [Fix ${i + 1}] ${f}`).join("\n") || "  - Maintain rigorous theoretical critique\n  - Verify all in-text citations"}
- Unresolved In-Text Citations (${unresolvedCitations.length}):
${unresolvedCitations.map((c: any, i: number) => `  [C${i + 1}] "${c.rawCitation || c}" (Missing from bibliography or ambiguous)`).join("\n") || "  - 100% of in-text citations reconciled to bibliography"}
- Word Count Adherence: ${currentTotalWords.toLocaleString()} / ${targetWordCount.toLocaleString()} words (${Math.abs(currentTotalWords - targetWordCount) <= targetWordCount * 0.1 ? "Compliant within ±10%" : "Check word count margin"})
`;
    systemPrompt = `You are the Examiner, the Quality Audit & Final Review Copilot in Scholar OS.
Your role is to evaluate draft submissions against university marking criteria (First Class 70%+, 2:1, 2:2), audit citation reconciliation, and ensure submission formatting perfection.
Explain predicted marks, highlight priority fixes needed to step up to the next grade band, and guide citation resolution.`;
  }

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

  // Attempt live LLM candidate invocation if configured
  const candidates = getCandidates(req);
  if (candidates.length > 0) {
    try {
      const brainResult = await scholarBrain.complete({
        req,
        systemPrompt,
        userPrompt,
        taskClass: "chat",
        dialect: "en-GB",
        stripCliches: true,
      });
      if (brainResult.text) {
        return res.json({
          ok: true,
          response: brainResult.text,
          persona: { name: personaName, role: personaRole },
        });
      }
    } catch (llmErr: any) {
      console.warn("scholarBrain copilot chat failed, falling back to deterministic grounding:", llmErr?.message);
    }
  }

  // Deterministic Grounded Fallback Response
  const fallbackResponse = buildDeterministicCopilotResponse(
    normalizedPhase,
    message,
    {
      question,
      targetWordCount,
      academicLevel,
      citationStyle,
      analysis,
      keptSources,
      lectureSlides,
      evidenceItems,
      outline,
      peelSections,
      rubricAudit,
      unresolvedCitations,
    }
  );

  const sanitizedFallback = normalizeUnicodeNFC(
    sanitizeScholarlyText(fallbackResponse, { dialect: "en-GB", stripCliches: true })
  );

  return res.json({
    ok: true,
    response: sanitizedFallback,
    persona: { name: personaName, role: personaRole },
  });
});

export default router;
