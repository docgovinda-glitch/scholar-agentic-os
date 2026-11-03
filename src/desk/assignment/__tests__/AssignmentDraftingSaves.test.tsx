// @vitest-environment jsdom
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssignmentProvider, useAssignmentWorkspace } from "../AssignmentContext";

const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();
const authedFetch = vi.fn();
const authedJsonFetch = vi.fn();

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  authedFetch: (...a: unknown[]) => authedFetch(...a),
  authedJsonFetch: (...a: unknown[]) => authedJsonFetch(...a),
  isEphemeralProject: (id: string) =>
    typeof id === "string" && (id.startsWith("draft-") || id.startsWith("ephemeral-")),
  commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const sections = [
  { id: "sec-intro", title: "Introduction", targetWordCount: 200, currentWordCount: 0, guidance: "", draftContent: "", status: "pending", sectionType: "intro" },
  { id: "sec-body-1", title: "Argument", targetWordCount: 600, currentWordCount: 0, guidance: "", draftContent: "", status: "pending", sectionType: "body" },
  { id: "sec-conclusion", title: "Conclusion", targetWordCount: 200, currentWordCount: 0, guidance: "", draftContent: "", status: "pending", sectionType: "conclusion" },
];

let api: ReturnType<typeof useAssignmentWorkspace> | null = null;
function Grab() {
  api = useAssignmentWorkspace();
  return null;
}

describe("Drafting saves never overwrite each other", () => {
  beforeEach(() => {
    api = null;
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });
    getProject.mockResolvedValue({
      projectId: "proj-race",
      outputTypeId: "OT-01",
      title: "Race",
      hasDocument: false,
      answers: { assignment_question: "Assess polarisation.", word_count: "1000", assignment_internal_sections: sections },
      gates: [],
    });
  });

  it("keeps both sections when two drafts finish together (as with Draft all, or an AI draft while typing)", async () => {
    // Slow saves, so the second update is made while the first is in flight.
    const sent: Array<Record<string, unknown>> = [];
    saveIntakeAnswers.mockImplementation(async (_id: string, answers: Record<string, unknown>) => {
      sent.push(answers);
      await new Promise((r) => setTimeout(r, 30));
      return { success: true };
    });
    render(
      <AssignmentProvider projectId="proj-race" initialStage="drafting" onStageChangeCallback={vi.fn()}>
        <Grab />
      </AssignmentProvider>
    );
    await waitFor(() => expect(api?.internalSections.length).toBe(3));

    // Both calls start from the same render, as "Draft all" did.
    const update = api!.updateSectionContent;
    await Promise.all([update("sec-intro", "Opening words here."), update("sec-body-1", "The argument in full.")]);

    const last = sent[sent.length - 1].assignment_internal_sections as Array<{ id: string; draftContent: string }>;
    expect(last.find((s) => s.id === "sec-intro")?.draftContent).toBe("Opening words here.");
    expect(last.find((s) => s.id === "sec-body-1")?.draftContent).toBe("The argument in full.");
    // One save at a time: never more than two requests for two changes.
    expect(sent.length).toBeLessThanOrEqual(2);
  });
});
