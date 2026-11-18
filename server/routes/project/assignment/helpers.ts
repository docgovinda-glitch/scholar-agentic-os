import { DEFAULT_CITATION_STYLE } from "../../../../src/domain/assignment/answerKeys.ts";
import { routedCompletion } from "../../../src/services/scholarBrain.ts";
import type { ProjectRecord } from "../../../../src/services/store/types.ts";
import express from "express";
import { createUploadInstance } from "../../../src/middleware/uploadGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { scholarBrain } from "../../../src/services/scholarBrain.ts";
import {
cleanAnswerString
} from "../../../../src/desk/assignment/types.ts";
import type { AcademicLevel, AssignmentType } from "../../../../src/desk/assignment/types.ts";
import { generateDynamicAssignmentStructure } from "../../../../src/desk/assignment/services/dynamicStructure.ts";
import { isClassroomLogisticsLine, isTutorialOrShortQABrief } from "../../../../src/utils/briefExtractor.ts";
import { hasLeakedTemplateHeadings } from "../../../../src/domain/assignment/legacyPurge.ts";

type HeadingLike = { title?: string; subheadings?: Array<{ title?: string }> };

/** Saved headings that carry old template text (see hasLeakedTemplateHeadings). */
export function isCorruptedOutlineHeadings(headings: HeadingLike[], topic: string): boolean {
  if (!Array.isArray(headings) || headings.length === 0) return false;
  const titles = headings.flatMap((h) => [h.title, ...(Array.isArray(h.subheadings) ? h.subheadings.map((s) => s.title) : [])]);
  return hasLeakedTemplateHeadings(titles, topic);
}

export function healCorruptedProjectStructure(project: { answers?: Record<string, string>; title?: string } | null | undefined): boolean {
  if (!project || !project.answers) return false;
  let changed = false;
  const rawStructure = project.answers["assignment_structure"];
  const topic = [
    project.answers["assignment_brief"],
    project.answers["title"],
  ]
    .filter(Boolean)
    .join(" ");

  if (rawStructure) {
    try {
      const parsed = typeof rawStructure === "string" ? JSON.parse(rawStructure) : rawStructure;
      if (parsed?.headings && isCorruptedOutlineHeadings(parsed.headings, topic)) {
        const briefText = cleanAnswerString(project.answers["assignment_brief"]) || topic;
        const targetWords = Number(
          project.answers["word_limit"] ||
          (isTutorialOrShortQABrief(briefText) ? 400 : 2000)
        );
        const repaired = generateDynamicAssignmentStructure({
          question: project.answers["assignment_brief"] || topic,
          assignmentType: (project.answers["assignment_type"] || "essay") as AssignmentType,
          academicLevel: (project.answers["academic_level"] || "undergraduate") as AcademicLevel,
          targetWordCount: targetWords,
          citationStyle: project.answers["citation_style"] || DEFAULT_CITATION_STYLE,
          briefText,
        });
        project.answers["assignment_structure"] = JSON.stringify(repaired);
        if (project.answers["assignment_internal_sections"]) {
          delete project.answers["assignment_internal_sections"];
        }
        changed = true;
      }
    } catch {
      // A saved structure that is not valid JSON is left for the stage to rebuild; nothing to heal here.
    }
  }
  return changed;
}

/** A saved answer that may be stored as JSON text or already parsed; null when unreadable. */
export function safeParseObject<T = unknown>(val: unknown): T | null {
  if (!val) return null;
  if (typeof val === "object") return val as T;
  if (typeof val === "string") {
    try {
      return JSON.parse(val) as T;
    } catch {
      return null;
    }
  }
  return null;
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
      const prompt = scholarBrain.courseworkPrompts.academicTitlePrompt({ briefText });
      const text = await routedCompletion(req, {
        signal: abortOnClose(req),
        task: "fast",
        systemPrompt: scholarBrain.courseworkPrompts.ROLES.titleRegistrar,
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
    if (typeof project.title === "string") {
      project.title = derivedTitle;
    }
    await saveChangedAnswers(project);
    return derivedTitle;
  }

  return currentTitle || derivedTitle;
}

export const upload = createUploadInstance({ enforceHeavyParseLimit: true });

const requestSignals = new WeakMap<object, AbortSignal>();

/**
 * Aborted when the client goes away before the response is sent (the student
 * left, or the browser gave up waiting), so the AI call stops instead of
 * running on, spending the student's credit, for nobody.
 */
export function abortOnClose(req: express.Request<unknown>): AbortSignal {
  const known = requestSignals.get(req);
  if (known) return known;
  const ctl = new AbortController();
  const res = req.res;
  res?.on("close", () => {
    if (!res.writableEnded) ctl.abort();
  });
  requestSignals.set(req, ctl.signal);
  return ctl.signal;
}

/** Answers as they were when each project was loaded by getProjectSafe. */
const answersAtLoad = new WeakMap<object, Record<string, unknown>>();

const sameValue = (a: unknown, b: unknown) => a === b || JSON.stringify(a) === JSON.stringify(b);

/** The keys this request changed since it loaded the project; removed keys are null. */
export function changedAnswers(before: Record<string, unknown>, after: Record<string, unknown>): Record<string, unknown> {
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(after)) {
    if (after[k] === undefined) {
      if (k in before && before[k] !== undefined) patch[k] = null;
    } else if (!sameValue(before[k], after[k])) {
      patch[k] = after[k];
    }
  }
  for (const k of Object.keys(before)) {
    if (!(k in after) && before[k] !== undefined) patch[k] = null;
  }
  return patch;
}

/**
 * Saves only the answer keys this request changed, merged atomically into the
 * stored record. A route waits on the AI for a long time; saving the whole
 * record it loaded would overwrite whatever the student saved meanwhile.
 * The in-memory project then reflects the merged, stored answers.
 */
export async function saveChangedAnswers(project: ProjectRecord): Promise<void> {
  const after = (project.answers ?? {}) as Record<string, unknown>;
  const before = answersAtLoad.get(project) ?? {};
  const patch = changedAnswers(before, after);
  if (Object.keys(patch).length === 0) return;
  const stored = await getProjectStore().patchAnswers(project.projectId, patch);
  if (stored) {
    project.answers = { ...stored.answers };
    project.version = stored.version;
  }
  answersAtLoad.set(project, { ...(project.answers as Record<string, unknown>) });
}

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
  answersAtLoad.set(project, { ...(project.answers as Record<string, unknown>) });
  if (healCorruptedProjectStructure(project)) {
    await saveChangedAnswers(project);
  }
  return project;
}


// 2. POST /api/projects/:id/assignment/plan
