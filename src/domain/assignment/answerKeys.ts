/**
 * One stored name per Coursework (OT-01) setting.
 *
 * Older saves wrote each setting under several names (the brief under five,
 * the word target under four), and a writer that updated one name left the
 * others stale. Every OT-01 record now passes through
 * `normalizeAssignmentAnswers` when the project store saves or loads it: the
 * canonical key keeps its value (or takes the first alias that has one) and the
 * aliases are removed, so a record can no longer disagree with itself.
 *
 * Canonical names follow the OT-01 intake spec where it defines one
 * (`assignment_brief`, `word_limit`, read by the G0 gate).
 */

export const ASSIGNMENT_SETTING_ALIASES = {
  assignment_brief: ["assignment_brief_text", "assignment_question", "instructions", "research_topic"],
  word_limit: ["target_word_count", "targetWordCount", "word_count"],
  academic_level: ["academicLevel"],
  assignment_type: ["assignmentType"],
  citation_style: ["citationStyle"],
  writing_style: ["writingStyle"],
  writing_tone: ["writingTone"],
  section_budgets: ["sectionBudgets"],
  title: ["assignment_title", "updatedTitle"],
  approved_source_ids: ["approvedSourceIds"],
  assignment_structure: ["structure"],
  assignment_internal_sections: ["assignment_outline"],
  assignment_current_phase: ["assignment_current_stage"],
} as const;

export type AssignmentSettingKey = keyof typeof ASSIGNMENT_SETTING_ALIASES;

/** alias -> canonical key */
const CANONICAL_OF: Record<string, AssignmentSettingKey> = Object.fromEntries(
  (Object.entries(ASSIGNMENT_SETTING_ALIASES) as Array<[AssignmentSettingKey, readonly string[]]>).flatMap(([canonical, aliases]) =>
    aliases.map((a) => [a, canonical])
  )
);

/** "provisional" is the intake placeholder, not a value. */
function hasValue(v: unknown): boolean {
  if (v === undefined || v === null) return false;
  if (typeof v === "string") return v.trim() !== "" && v.trim().toLowerCase() !== "provisional";
  return true;
}

/**
 * The record with one key per setting: the canonical key keeps a real value,
 * else takes the first alias that has one; aliases are dropped. Keys that are
 * not settings pass through unchanged. Pure; returns a new object.
 */
export function normalizeAssignmentAnswers<T extends Record<string, unknown>>(answers: T | null | undefined): T {
  const src = (answers ?? {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(src)) if (!(k in CANONICAL_OF)) out[k] = v;
  for (const [canonical, aliases] of Object.entries(ASSIGNMENT_SETTING_ALIASES) as Array<[AssignmentSettingKey, readonly string[]]>) {
    const candidates = [canonical, ...aliases].map((k) => src[k]);
    const matches = candidates.filter(hasValue);
    // Log if multiple values found (data quality issue from old saves)
    if (matches.length > 1) {
      console.warn(`[normalizeAssignmentAnswers] Multiple values found for "${canonical}"; keeping first`);
    }
    const value = matches.find(hasValue) ?? src[canonical];
    if (value !== undefined) out[canonical] = value;
    else delete out[canonical];
  }
  return out as T;
}

/**
 * Rename the settings in a partial update to their canonical keys (an update
 * that names a setting twice keeps the canonical spelling's value), so a
 * patch from an older client still lands on the one stored name.
 */
export function canonicalizeAssignmentUpdate<T extends Record<string, unknown>>(update: T): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(update ?? {})) {
    const canonical = CANONICAL_OF[k];
    if (!canonical) out[k] = v;
    else if (!(canonical in (update ?? {})) && !(canonical in out)) out[canonical] = v;
  }
  return out as T;
}
