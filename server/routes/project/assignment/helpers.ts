import type { ProjectRecord } from "../../../../src/services/store/types.ts";
import express from "express";
import { createUploadInstance } from "../../../src/middleware/uploadGuard.ts";
import { getProjectStore } from "../../../../src/services/store/projectStore.ts";
import { isClassroomLogisticsLine } from "../../../../src/utils/briefExtractor.ts";
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
        // An outline made of old template text is removed, not replaced with
        // another template: the student builds it again from their brief.
        delete project.answers["assignment_structure"];
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

  // Up to 9 words are kept whole, so a phrase is not cut before its last word
  // ("…Undergraduate Medical" for "…Undergraduate Medical Education"); longer lines keep 7.
  const selectedWords = words.length <= 9 ? words : words.slice(0, 7);
  let result = selectedWords.join(" ");
  result = result.replace(/\s+(?:and|or|in|of|for|with|to|at|by|from|the|a|an|on)$/i, "");

  return capitalizeTitleWords(result);
}

/** "MED2041 Assessment 2 (Essay, 1,500 words, APA 7)." / "Coursework 1" / "Task 3 – 40%": a label, not a subject. */
const ASSESSMENT_LABEL_LINE =
  /^(?:[A-Z]{2,5}\s*-?\s*\d{3,5}\s*[:\-–]?\s*)?(?:summative\s+|formative\s+)?(?:assessment|assignment|coursework|essay|task|project|exam(?:ination)?)\s*\d*\s*(?:\([^)]*\))?\s*(?:[-–:]\s*\d+\s*%)?\s*[.:]?$/i;

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

    // A label line ("MED2041 Assessment 2 (Essay, 1,500 words, APA 7)") names the task,
    // not its subject: never a title.
    if (ASSESSMENT_LABEL_LINE.test(line)) {
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
    if (isClassroomLogisticsLine(line) || ASSESSMENT_LABEL_LINE.test(line)) {
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

export { abortOnClose } from "../../../src/utils/abortOnClose.ts";

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
