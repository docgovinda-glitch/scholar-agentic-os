/**
 * Strict Unique Project Naming & Draft Reuse utilities.
 * Enforces case-insensitive duplicate title prevention and auto-incrementing
 * fallback for untitled drafts.
 */

export interface ProjectTitleItem {
  id?: string;
  projectId?: string;
  title?: string;
  answers?: { title?: string; [key: string]: unknown };
  document?: { title?: string; [key: string]: unknown };
  hasDocument?: boolean;
  intakeCompleteness?: number;
  outputTypeId?: string;
  updatedAt?: string;
}

/**
 * Detects whether a project item is completely blank and untouched
 * (e.g. no document, no instructions, no brief, no research question, and zero/default completeness).
 */
export function isBlankProject(p: ProjectTitleItem | null | undefined): boolean {
  if (!p) return true;
  if (p.hasDocument) return false;

  const answers = (p.answers || {}) as Record<string, unknown>;
  const briefText =
    (typeof answers.instructions === "string" ? answers.instructions : "") ||
    (typeof answers.assignment_question === "string" ? answers.assignment_question : "") ||
    (typeof answers.assignment_brief_text === "string" ? answers.assignment_brief_text : "") ||
    (typeof answers.briefText === "string" ? answers.briefText : "") ||
    (typeof answers.prompt === "string" ? answers.prompt : "") ||
    (typeof answers.researchQuestion === "string" ? answers.researchQuestion : "") ||
    (typeof answers.research_topic === "string" ? answers.research_topic : "") ||
    (typeof answers.backgroundNotes === "string" ? answers.backgroundNotes : "");

  const cleanBrief = briefText.trim().replace(/^provisional$/i, "");
  if (cleanBrief.length > 0) return false;

  const wordCount = Number(answers.word_count || answers.targetWordCount || answers.target_word_count || 0);
  if (wordCount > 0 && wordCount !== 2000) return false;

  if (p.document && Object.keys(p.document).length > 0) return false;
  if ((p.intakeCompleteness ?? 0) > 0.1) return false;

  return true;
}

/**
 * Extracts the user-visible title from any project representation.
 */
export function getProjectTitle(p: ProjectTitleItem | null | undefined): string {
  if (!p) return "";
  const raw =
    p.title?.trim() ||
    (typeof p.answers?.title === "string" ? p.answers.title.trim() : "") ||
    (typeof p.document?.title === "string" ? p.document.title.trim() : "") ||
    "";
  return raw;
}

/**
 * Normalizes project identifier across different representations.
 */
export function getProjectId(p: ProjectTitleItem): string {
  return p.projectId || p.id || "";
}

/**
 * Case-insensitive uniqueness check against all existing projects in the workspace.
 * Ignores the project currently being edited/renamed.
 */
export function isDuplicateProjectTitle(
  newTitle: string,
  currentProjectId: string | undefined,
  existingProjects: ProjectTitleItem[]
): boolean {
  const normalizedNew = newTitle.trim().toLowerCase();
  if (!normalizedNew) return false;

  return existingProjects.some((p) => {
    const id = getProjectId(p);
    if (currentProjectId && id && id === currentProjectId) {
      return false;
    }
    const existingTitle = getProjectTitle(p).trim().toLowerCase();
    return existingTitle === normalizedNew;
  });
}

/**
 * Generates the next available untitled project name without collisions.
 * e.g. "Untitled Project" -> "Untitled Project 1" -> "Untitled Project 2", etc.
 */
export function getNextUntitledProjectTitle(
  existingProjects: ProjectTitleItem[],
  basePrefix: string = "Untitled Project"
): string {
  const existingSet = new Set(
    existingProjects.map((p) => getProjectTitle(p).trim().toLowerCase())
  );

  const baseLower = basePrefix.trim().toLowerCase();
  if (!existingSet.has(baseLower)) {
    return basePrefix;
  }

  let counter = 1;
  while (existingSet.has(`${baseLower} ${counter}`)) {
    counter++;
  }
  return `${basePrefix} ${counter}`;
}

/**
 * Identifies if an existing "Untitled Project" has zero content so it can be
 * reused or focused instead of proliferating empty drafts.
 */
export function findReusableEmptyProject(
  existingProjects: ProjectTitleItem[],
  outputTypeId?: string
): ProjectTitleItem | null {
  return (
    existingProjects.find((p) => {
      const title = getProjectTitle(p).trim().toLowerCase();
      const isUntitled =
        !title ||
        title === "untitled project" ||
        title.startsWith("untitled project") ||
        title === "academic assignment" ||
        title === "synthesized research project";
      const hasZeroContent = !p.hasDocument && (p.intakeCompleteness ?? 0) === 0 && isBlankProject(p);
      const typeMatches = !outputTypeId || p.outputTypeId === outputTypeId;
      return isUntitled && hasZeroContent && typeMatches;
    }) ?? null
  );
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
    const cleaned = cleanTitleCandidate(line);
    if (cleaned.length >= 6) {
      return cleaned;
    }
  }

  return "Academic Assignment";
}

