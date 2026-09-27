/**
 * AssignmentContextPanelIntegration.test.tsx
 * -------------------------------------------
 * Replaces the obsolete AssignmentAiTutorPanel.test.tsx
 * (which tested the deleted legacy copilot component).
 *
 * Validates the ContextPanel copilot endpoint wiring:
 *   - sendAssignmentCopilotMessage is called with correct project/phase args
 *   - Response handling integrates cleanly with the AssignmentCopilotResponse contract
 *   - Error resilience: network failures do not crash the service
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock authedJsonFetch used internally by the service
vi.mock("../../api", () => ({
  authedJsonFetch: vi.fn(),
}));

import { authedJsonFetch } from "../../api";
import { sendAssignmentCopilotMessage } from "../services/assignmentCopilotService";
import type { AssignmentPhaseId, AssignmentProjectState } from "../types";

const mockAuthedFetch = authedJsonFetch as ReturnType<typeof vi.fn>;

// Minimal project state for testing
const mockState: Partial<AssignmentProjectState> = {
  projectId: "test-proj-123",
  currentPhase: "drafting",
  brief: {
    instructions: "Critically evaluate renewable energy transitions.",
    targetWordCount: 2000,
    academicLevel: "undergraduate",
    assignmentType: "essay",
    citationStyle: "apa7",
    sections: {
      isCustomized: false,
      intro: { targetWords: 200, guidelines: "" },
      body: { targetWords: 1500, guidelines: "" },
      conclusion: { targetWords: 300, guidelines: "" },
    },
    constraints: [],
    rubricCriteria: [],
  },
};

describe("Assignment Copilot Service (ContextPanel wiring)", () => {
  beforeEach(() => {
    mockAuthedFetch.mockReset();
  });

  it("calls the correct copilot API endpoint for the active project and phase", async () => {
    mockAuthedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: "Your argument in Section 3 requires stronger empirical grounding.",
      }),
    });

    const result = await sendAssignmentCopilotMessage(
      "test-proj-123",
      "drafting" as AssignmentPhaseId,
      "How can I improve Section 3?",
      [],
      mockState as AssignmentProjectState
    );

    expect(mockAuthedFetch).toHaveBeenCalledOnce();
    const [url] = mockAuthedFetch.mock.calls[0];
    expect(url).toContain("/api/projects/test-proj-123/assignment/copilot-chat");
    expect(result.ok).toBe(true);
    expect(result.response).toBe("Your argument in Section 3 requires stronger empirical grounding.");
  });

  it("sends phase context and message history in the request body", async () => {
    mockAuthedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ response: "Acknowledged." }),
    });

    const history = [
      { role: "user" as const, content: "What is the rubric?" },
      { role: "assistant" as const, content: "The rubric emphasizes critical thinking." },
    ];

    await sendAssignmentCopilotMessage(
      "test-proj-123",
      "submission" as AssignmentPhaseId,
      "Is my citation list complete?",
      history,
      mockState as AssignmentProjectState
    );

    const [, , body] = mockAuthedFetch.mock.calls[0];
    expect(body.phase).toBe("submission");
    expect(body.message).toBe("Is my citation list complete?");
    expect(body.history).toHaveLength(2);
  });

  it("returns ok:false with an error message when the API returns a non-OK status", async () => {
    mockAuthedFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
      json: async () => ({ error: "Internal server error" }),
    });

    const result = await sendAssignmentCopilotMessage(
      "test-proj-123",
      "sources" as AssignmentPhaseId,
      "Which sources should I prioritise?",
      [],
      mockState as AssignmentProjectState
    );

    expect(result.ok).toBe(false);
    expect(result.error).toBeTruthy();
  });

  it("returns ok:false with an error message when the API call throws a network error", async () => {
    mockAuthedFetch.mockRejectedValueOnce(new Error("Network error"));

    const result = await sendAssignmentCopilotMessage(
      "test-proj-123",
      "understand" as AssignmentPhaseId,
      "Help me understand the rubric.",
      [],
      mockState as AssignmentProjectState
    );

    expect(result.ok).toBe(false);
    expect(result.error).toContain("Network error");
  });

  it("includes persona metadata in a successful response when provided by the server", async () => {
    mockAuthedFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        response: "Here are the key citation issues.",
        persona: { name: "Examiner", role: "Submission Review Specialist" },
      }),
    });

    const result = await sendAssignmentCopilotMessage(
      "test-proj-123",
      "submission" as AssignmentPhaseId,
      "Check my citations.",
      [],
      mockState as AssignmentProjectState
    );

    expect(result.ok).toBe(true);
    expect(result.persona?.name).toBe("Examiner");
    expect(result.persona?.role).toContain("Submission");
  });
});
