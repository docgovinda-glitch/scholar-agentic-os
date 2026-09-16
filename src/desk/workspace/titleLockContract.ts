import type { ProjectView } from "../types";
import type { ResearchStage } from "./types";
import { saveIntakeAnswers } from "../api";

export interface ExecuteTitleLockParams {
  projectId: string;
  title: string;
  existingAnswers?: Record<string, any>;
  onSaved: (updated: ProjectView) => void;
  onAdvance?: (stage: ResearchStage) => Promise<void> | void;
}

/**
 * Authoritative single transition contract for locking a research title
 * and advancing to the evidence phase (vault_sources).
 *
 * Ensures:
 * 1. Title is validated as non-empty.
 * 2. title_locked: "true" is authoritatively set.
 * 3. working_title is persisted.
 * 4. current_stage is set to "vault_sources" in the SAME atomic payload.
 * 5. Local project state is updated with server response.
 * 6. Navigation proceeds deterministically to vault_sources.
 */
export async function executeTitleLockAndProceed({
  projectId,
  title,
  existingAnswers = {},
  onSaved,
  onAdvance,
}: ExecuteTitleLockParams): Promise<ProjectView> {
  const cleanTitle = title.trim();
  if (!cleanTitle) {
    throw new Error("Please select or enter a valid title before locking.");
  }

  const newAnswers: Record<string, string> = {
    ...existingAnswers,
    working_title: cleanTitle,
    title_locked: "true",
    current_stage: "vault_sources",
  };

  const updatedProject = await saveIntakeAnswers(projectId, newAnswers);
  onSaved(updatedProject);

  if (onAdvance) {
    await onAdvance("vault_sources");
  }

  return updatedProject;
}
