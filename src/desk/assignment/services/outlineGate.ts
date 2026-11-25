/**
 * A one-shot hand-off between stages: Drafting sends the student to Understand
 * because no outline is approved, and Understand then points at the outline
 * card instead of dropping them on the plain form. Kept in memory only; it
 * means nothing after a reload.
 */
const pending = new Set<string>();

export function requestOutlineFocus(projectId: string): void {
  if (projectId) pending.add(projectId);
}

/** True once for a project that was sent here for its outline. */
export function consumeOutlineFocus(projectId: string): boolean {
  return pending.delete(projectId);
}
