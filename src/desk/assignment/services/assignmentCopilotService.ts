/**
 * Scholar Core Academic Assignment Copilot Service
 * Client API service for interacting with phase-grounded personas:
 * - Phase 1 Understand: Advisor
 * - Phase 2 Sources: Librarian
 * - Phase 3 Drafting: Scribe
 * - Phase 4 Submission: Examiner
 */

import { authedJsonFetch } from "../../api";
import type { AssignmentPhaseId, AssignmentProjectState, AssignmentAgentInfo } from "../types";
import { ASSIGNMENT_AGENT_CONFIGS } from "../types";

export { ASSIGNMENT_AGENT_CONFIGS };
export type { AssignmentAgentInfo };

export interface AssignmentCopilotResponse {
  ok: boolean;
  response: string;
  persona?: {
    name: string;
    role: string;
  };
  error?: string;
}

export interface AssignmentCopilotPayload {
  phase: AssignmentPhaseId;
  message: string;
  history?: Array<{ role: "user" | "assistant"; content: string }>;
  projectState?: Partial<AssignmentProjectState>;
}

/**
 * Returns the active agent configuration for a given assignment phase.
 */
export function getAssignmentAgentConfig(phase: AssignmentPhaseId): AssignmentAgentInfo {
  return ASSIGNMENT_AGENT_CONFIGS[phase] || ASSIGNMENT_AGENT_CONFIGS.understand;
}

/**
 * Dispatches a user query or quick action to the phase-grounded Assignment Copilot.
 * Hits POST /api/projects/:id/assignment/copilot-chat
 */
export async function sendAssignmentCopilotMessage(
  projectId: string,
  phase: AssignmentPhaseId,
  message: string,
  history: Array<{ role: "user" | "assistant"; content: string }> = [],
  projectState?: Partial<AssignmentProjectState>
): Promise<AssignmentCopilotResponse> {
  const payload: AssignmentCopilotPayload = {
    phase,
    message,
    history,
    projectState,
  };

  try {
    const res = await authedJsonFetch(
      `/api/projects/${encodeURIComponent(projectId)}/assignment/copilot-chat`,
      "POST",
      payload
    );

    if (!res.ok) {
      const errData = await res.json().catch(() => ({}));
      return {
        ok: false,
        response: "",
        error: (errData as any).error || `Copilot request failed (HTTP ${res.status})`,
      };
    }

    const data = await res.json();
    return {
      ok: true,
      response: data.response || data.reply || "",
      persona: data.persona,
    };
  } catch (err: any) {
    return {
      ok: false,
      response: "",
      error: err.message || "Failed to communicate with Assignment Copilot",
    };
  }
}

/**
 * Dispatches a suggested quick action chip immediately with the full active phase context.
 */
export async function dispatchAssignmentQuickAction(
  projectId: string,
  phase: AssignmentPhaseId,
  action: string,
  projectState?: Partial<AssignmentProjectState>,
  history: Array<{ role: "user" | "assistant"; content: string }> = []
): Promise<AssignmentCopilotResponse> {
  return sendAssignmentCopilotMessage(projectId, phase, action, history, projectState);
}
