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
 * Canonical Format Labels for Academic Workspaces.
 */
export const DEFAULT_FORMAT_LABELS: Record<string, string> = {
  "OT-01": "Assignment",
  "OT-02": "Essay",
  "OT-06": "Thesis / Dissertation",
  "OT-07": "Thesis / Dissertation",
  "OT-10": "Journal Article",
  "OT-15": "Research Proposal",
  "OT-20": "Dissertation",
  "OT-22": "Presentation",
};

export function getFormatLabel(outputTypeId?: string): string {
  if (!outputTypeId) return "Project";
  return DEFAULT_FORMAT_LABELS[outputTypeId] || outputTypeId;
}

/**
 * Extracts the user-visible title from any project representation.
 */
export function getProjectTitle(p: ProjectTitleItem | null | undefined): string {
  if (!p) return "";
  const raw =
    p.title?.trim() ||
    (typeof p.answers?.title === "string" ? p.answers.title.trim() : "") ||
    (typeof (p.answers as any)?.working_title === "string" ? (p.answers as any).working_title.trim() : "") ||
    (typeof (p.answers as any)?.assignment_title === "string" ? (p.answers as any).assignment_title.trim() : "") ||
    (typeof p.document?.title === "string" ? p.document.title.trim() : "") ||
    "";
  return raw;
}

/**
 * Canonical display heading for a project.
 * Ensures consistent rendering across Vault cards, Recents sidebar, Command Palette,
 * and Workspace headers.
 * If user has entered or kept an explicit heading, returns that.
 * Otherwise, generates a distinct, unique heading placeholder (e.g. "Untitled Assignment 1").
 */
export function getProjectDisplayName(
  p: ProjectTitleItem | null | undefined,
  existingProjects?: ProjectTitleItem[]
): string {
  if (!p) return "Untitled Project";

  // Check explicit title sources
  const titleCandidate =
    p.title?.trim() ||
    (typeof p.answers?.title === "string" ? p.answers.title.trim() : "") ||
    (typeof (p.answers as any)?.working_title === "string" ? (p.answers as any).working_title.trim() : "") ||
    (typeof (p.answers as any)?.assignment_title === "string" ? (p.answers as any).assignment_title.trim() : "") ||
    (typeof p.document?.title === "string" ? p.document.title.trim() : "") ||
    (typeof (p.answers as any)?.researchQuestion === "string" ? (p.answers as any).researchQuestion.trim() : "") ||
    (typeof (p.answers as any)?.research_question === "string" ? (p.answers as any).research_question.trim() : "") ||
    (typeof (p.answers as any)?.topic === "string" ? (p.answers as any).topic.trim() : "") ||
    (typeof (p.answers as any)?.research_topic === "string" ? (p.answers as any).research_topic.trim() : "") ||
    "";

  const formatLabel = getFormatLabel(p.outputTypeId);
  const normalizedCandidate = titleCandidate.toLowerCase();
  const isBareFormatLabel =
    normalizedCandidate === formatLabel.toLowerCase() ||
    normalizedCandidate === (p.outputTypeId || "").toLowerCase() ||
    normalizedCandidate === "essay" ||
    normalizedCandidate === "project";

  const isProvisional = normalizedCandidate === "provisional";

  // If candidate is a valid distinct user title, return it directly
  if (titleCandidate && !isBareFormatLabel && !isProvisional) {
    return titleCandidate;
  }

  // Generate distinct, unique format-aware placeholder heading
  const baseTitle = `Untitled ${formatLabel}`;

  if (!existingProjects || existingProjects.length <= 1) {
    return baseTitle;
  }

  // Disambiguate among multiple projects sharing this format when untitled
  const currentId = getProjectId(p);
  const sameFormatUntitled = existingProjects.filter((item) => {
    const raw =
      item.title?.trim() ||
      (typeof item.answers?.title === "string" ? item.answers.title.trim() : "") ||
      (typeof (item.answers as any)?.working_title === "string" ? (item.answers as any).working_title.trim() : "") ||
      (typeof (item.answers as any)?.assignment_title === "string" ? (item.answers as any).assignment_title.trim() : "");
    const rawLower = raw.toLowerCase();
    const matchesFormat = (item.outputTypeId || "") === (p.outputTypeId || "");
    const isUntitle =
      !raw ||
      rawLower === "provisional" ||
      rawLower === formatLabel.toLowerCase() ||
      rawLower === (item.outputTypeId || "").toLowerCase() ||
      rawLower.startsWith("untitled");
    return matchesFormat && isUntitle;
  });

  if (sameFormatUntitled.length <= 1) {
    return baseTitle;
  }

  // Sort deterministically by id/creation order
  const index = sameFormatUntitled.findIndex((item) => getProjectId(item) === currentId);
  if (index <= 0) {
    return `${baseTitle} 1`;
  }
  return `${baseTitle} ${index + 1}`;
}

/**
 * Returns a placeholder prompt for project heading input.
 */
export function getProjectHeadingPlaceholder(p: ProjectTitleItem | null | undefined): string {
  const formatLabel = getFormatLabel(p?.outputTypeId);
  return `e.g. Untitled ${formatLabel}`;
}

/**
 * Universal project search matching predicate.
 * Evaluates canonical display name, raw titles, format label, research question, and topic.
 */
export function matchesProjectSearch(
  p: ProjectTitleItem | null | undefined,
  query: string,
  existingProjects?: ProjectTitleItem[]
): boolean {
  if (!p) return false;
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const displayName = getProjectDisplayName(p, existingProjects).toLowerCase();
  if (displayName.includes(q)) return true;

  const rawTitle = (p.title || "").toLowerCase();
  if (rawTitle.includes(q)) return true;

  const answers = (p.answers || {}) as Record<string, unknown>;
  const title = (typeof answers.title === "string" ? answers.title : "").toLowerCase();
  if (title.includes(q)) return true;

  const workingTitle = (typeof answers.working_title === "string" ? answers.working_title : "").toLowerCase();
  if (workingTitle.includes(q)) return true;

  const assignmentTitle = (typeof answers.assignment_title === "string" ? answers.assignment_title : "").toLowerCase();
  if (assignmentTitle.includes(q)) return true;

  const formatLabel = getFormatLabel(p.outputTypeId).toLowerCase();
  if (formatLabel.includes(q)) return true;

  const rq = (
    typeof answers.researchQuestion === "string"
      ? answers.researchQuestion
      : typeof answers.research_question === "string"
      ? answers.research_question
      : ""
  ).toLowerCase();
  if (rq.includes(q)) return true;

  const topic = (
    typeof answers.topic === "string"
      ? answers.topic
      : typeof answers.research_topic === "string"
      ? answers.research_topic
      : ""
  ).toLowerCase();
  if (topic.includes(q)) return true;

  return false;
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
    const existingTitle = (getProjectTitle(p) || getProjectDisplayName(p, existingProjects)).trim().toLowerCase();
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
 * Identifies if an existing "Untitled Project" (or project matching targetTitle) has zero content
 * so it can be reused or focused instead of proliferating empty drafts.
 */
export function findReusableEmptyProject(
  existingProjects: ProjectTitleItem[],
  outputTypeId?: string,
  targetTitle?: string
): ProjectTitleItem | null {
  const normTarget = targetTitle?.trim().toLowerCase();
  return (
    existingProjects.find((p) => {
      const title = getProjectTitle(p).trim().toLowerCase();
      const isUntitled =
        !title ||
        title === "untitled project" ||
        title.startsWith("untitled project") ||
        title === "academic assignment" ||
        title === "synthesized research project";
      const matchesTarget =
        Boolean(normTarget) &&
        (title === normTarget ||
          getProjectDisplayName(p, existingProjects).trim().toLowerCase() === normTarget);
      const hasZeroContent = !p.hasDocument && (p.intakeCompleteness ?? 0) === 0 && isBlankProject(p);
      const typeMatches = !outputTypeId || p.outputTypeId === outputTypeId;
      return (isUntitled || matchesTarget) && hasZeroContent && typeMatches;
    }) ?? null
  );
}

/**
 * Deduplicates a list of project items by unique project ID and normalized display title.
 * 
 * - Ensures no project ID appears more than once.
 * - Ensures no duplicate display title appears in the list (case-insensitive, trimmed).
 * - Strips trailing ellipsis (e.g. "..." or "…") during comparison to unify truncated titles.
 * - Preserves the first (most recently updated) occurrence of each unique title.
 * - If pinnedIds is supplied, a pinned project takes precedence over an unpinned project
 *   sharing the same title.
 * - Preserves format-aware numbered untitled drafts (e.g. "Untitled Assignment 1", "Untitled Assignment 2")
 *   since their display titles are already distinct.
 */
export function deduplicateProjectList<T extends ProjectTitleItem>(
  projectsToFilter: T[],
  contextProjects?: ProjectTitleItem[],
  pinnedIds?: string[]
): T[] {
  if (!projectsToFilter || projectsToFilter.length <= 1) {
    return projectsToFilter ? [...projectsToFilter] : [];
  }

  const allProjects = contextProjects || projectsToFilter;
  const pinnedSet = new Set(pinnedIds || []);

  const seenIds = new Set<string>();
  const seenTitles = new Map<string, number>(); // normalizedTitle -> index in result
  const result: T[] = [];

  for (const p of projectsToFilter) {
    if (!p) continue;
    const id = getProjectId(p);
    if (!id || seenIds.has(id)) continue;

    const title = getProjectDisplayName(p, allProjects);
    const normalizedTitle = title
      .trim()
      .replace(/(?:\.\.\.|…)+$/, "")
      .trim()
      .toLowerCase();

    if (!seenTitles.has(normalizedTitle)) {
      seenIds.add(id);
      seenTitles.set(normalizedTitle, result.length);
      result.push(p);
    } else {
      // Title already seen. If current project is pinned and existing one is not, swap it in.
      const existingIdx = seenTitles.get(normalizedTitle)!;
      const existingProject = result[existingIdx];
      const existingId = getProjectId(existingProject);

      if (pinnedSet.has(id) && !pinnedSet.has(existingId)) {
        seenIds.delete(existingId);
        seenIds.add(id);
        result[existingIdx] = p;
      }
    }
  }

  return result;
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

