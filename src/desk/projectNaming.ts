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
