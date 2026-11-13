import { routedCompletion } from "../../../src/ai/routerBridge.ts";
import type { ProjectRecord } from "../../../../src/services/store/types.ts";
import express from "express";
import { createUploadInstance } from "../../../src/middleware/uploadGuard.ts";
import { parseDocument } from "../../../../src/document_intelligence/index.ts";
import {
  buildScholarlyVoiceSystemPrompt,
  sanitizeScholarlyText,
  normalizeUnicodeNFC,
} from "../../../src/utils/scholarlyVoiceGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { callOpenRouterJSON, callOpenRouterText } from "../../../src/services/scholarBrain.ts";
import { requestKeyring } from "../../../src/ai/routerBridge.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import { rejectClientCredentials } from "../../../src/middleware/rejectClientCredentials.ts";
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
  extractBriefInquiriesAndConcepts,
  sanitizeOutlineHeadings,
  assignmentStructureToOutlineTree,
  outlineTreeToAssignmentStructure,
} from "../../../../src/desk/assignment/services/outlineService.ts";
import { parseBriefQuestions } from "../../../../src/utils/briefQuestions.ts";
import { buildSourceSearchQueries } from "../../../../src/utils/briefSourceQueries.ts";
import { sanitizeBrief } from "../../../../src/features/understand/services/briefSanitizer.ts";
import { classifyScopeBoundaries, stripLineTags } from "../../../../src/features/understand/services/scopeClassifier.ts";
import {
  isClassroomLogisticsLine,
  isTutorialOrShortQABrief,
  extractSubstantiveBriefQuestions,
  stripSlideArtifacts,
} from "../../../../src/utils/briefExtractor.ts";
import { discoverMultiPortalSources, type DiscoveredSourceDraft } from "../../../src/discovery/discovery.ts";
import { getSupabaseRestConfig, SupabaseTable, type SupabaseRestConfig } from "../../../src/supabaseRest.ts";
import {
  replaceBracketTokensWithDeterministicCitations,
  compileDeterministicBibliographyMarkdown,
  formatAskScholarInText,
  formatAskScholarBibliographyEntry,
  type WebsiteCitationItem,
} from "../../../../src/desk/scholarCitationEngine.ts";
import type { DiscoveredSource } from "../../../../src/desk/assignment/types.ts";

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

export async function persistSourcesToSupabase(projectId: string, sources: DiscoveredSource[]): Promise<void> {
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
  const hasOBOrLeadership = /\b(leadership|culture|schein|human resources|organizational behavior|management|mba|business strategy)\b/i.test(topic);

  const hasLeakedML = (!isAIML || hasOBOrLeadership) && flatTitles.some((t) =>
    /\b(mathematical formulations|loss optimization|optimization landscapes|erm|loss surfaces|gradient descent|empirical risk|convex optimization)\b/i.test(t)
  );

  const hasClassroomLogistics = flatTitles.some((t) =>
    isClassroomLogisticsLine(t) ||
    /\b(divide yourself|teams of \d+|breakout|discussion timer|class discussion|icebreaker)\b/i.test(t)
  );

  return hasLeakedML || hasClassroomLogistics;
}

export function healCorruptedProjectStructure(project: { answers?: Record<string, string>; title?: string } | null | undefined): boolean {
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

export function safeParseObject<T = any>(val: any): T | null {
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

export function extractProjectInstructions(project: any, reqBody?: any): string {
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
    if (req && process.env.NODE_ENV !== "test" && !process.env.VITEST) {
      const prompt = `Generate a concise, academic title (3 to 7 words, e.g. "Quantum Computing Cryptographic Architectures", "Algorithmic Bias in Healthcare") based on this assignment brief. Output ONLY the plain text title, with NO punctuation, NO quotes, NO explanation:\n\n${briefText.slice(0, 1500)}`;
      const text = await routedCompletion(req, {
        task: "fast",
        systemPrompt: "You are an expert academic research registrar. Craft a concise, formal academic title (3-7 words).",
        userPrompt: prompt,
        maxOutputTokens: 64,
      });

      if (text) {
        const candidate = text
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
  project: (ProjectRecord & { title?: string }) | null | undefined,
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

export const upload = createUploadInstance({ enforceHeavyParseLimit: true });

export async function getProjectSafe(req: express.Request<unknown>, res: express.Response) {
  const projectId = (req.params as Record<string, string>).id;
  if (!projectId) {
    res.status(400).json({ error: "Missing project ID" });
    return null;
  }
  const callerId = (req as express.Request & { user?: { id: string } }).user?.id;
  const project = await getProjectStore().get(projectId);
  if (!project || !callerId || project.ownerId !== callerId) {
    res.status(404).json({ error: "Project not found" });
    return null;
  }
  if (healCorruptedProjectStructure(project)) {
    await getProjectStore().save(project);
  }
  return project;
}


export function buildDeterministicResearchPlan(
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

  // Everything below is derived from the brief itself; no subject lookup.
  const briefQuestions = parseBriefQuestions(qClean);
  const inquiries = extractBriefInquiriesAndConcepts(qClean);
  const questionTexts: Array<{ text: string; label: string; marks?: number }> =
    briefQuestions.length > 0
      ? briefQuestions.slice(0, 6).map((q) => ({ text: q.text, label: q.label, marks: q.marks }))
      : [...inquiries.extractedTasks, ...inquiries.subQuestions].slice(0, 6).map((t, i) => ({ text: t, label: `Q${i + 1}` }));
  if (questionTexts.length === 0) questionTexts.push({ text: qClean.slice(0, 200), label: "Q1" });

  const concepts: string[] =
    parsedAnalysis.keyConcepts?.length > 0 ? parsedAnalysis.keyConcepts : inquiries.keyConcepts.slice(0, 5);

  const coreQuestions: CoreResearchQuestion[] = questionTexts.map((q, i) => ({
    id: `q-${i + 1}`,
    question: q.text,
    rationale: q.marks ? `Asked directly in the brief (${q.marks} marks).` : "Asked directly in the brief.",
    category: q.label,
  }));

  const phrases = buildSourceSearchQueries(qClean, 4);
  const searchStrategies: RecommendedSearchStrategy[] = phrases.map((phrase, i) => ({
    id: `strat-${i + 1}`,
    database: "OpenAlex / Crossref / Semantic Scholar",
    searchQuery: phrase,
    relevanceTarget: questionTexts[i] ? `Evidence for ${questionTexts[i].label}: ${questionTexts[i].text.slice(0, 90)}` : "Evidence for the brief's questions",
  }));

  const keyDebates: string[] = [];

  const evidenceTypesNeeded = [
    "Peer-reviewed academic journal publications",
    "Authoritative institutional or standards publications relevant to the brief",
    "Primary data or case evidence named in the brief",
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
