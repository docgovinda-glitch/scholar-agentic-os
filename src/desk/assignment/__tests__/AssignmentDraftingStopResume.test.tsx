// @vitest-environment jsdom
/**
 * Drafting a section: a second click while it is being written starts nothing,
 * Stop ends the request, and the text that had arrived is kept aside (and
 * saved) to Resume from its last full sentence, Keep, or Discard.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssignmentProvider } from "../AssignmentContext";
import AssignmentDraftingStage from "../stages/AssignmentDraftingStage";

const getProject = vi.fn();
const saveIntakeAnswers = vi.fn();
const streamSectionGeneration = vi.fn();

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: vi.fn().mockResolvedValue(null),
  getRubric: vi.fn().mockResolvedValue(null),
  getOutputTypeSpec: vi.fn().mockResolvedValue({ id: "OT-01" }),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  authedFetch: vi.fn(),
  authedJsonFetch: vi.fn(),
  isEphemeralProject: () => false,
  commitProjectToDatabase: vi.fn(),
}));
vi.mock("../../../services/userVault", () => ({ loadVault: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../services/vault/cloudDriveService", () => ({ getConnectedCloudDrives: vi.fn().mockResolvedValue([]) }));
vi.mock("../services/invisibleChunkerService", async (orig) => ({
  ...(await orig<typeof import("../services/invisibleChunkerService")>()),
  streamSectionGeneration: (...a: unknown[]) => streamSectionGeneration(...a),
}));

import { SectionDraftStoppedError } from "../services/invisibleChunkerService";

const sections = [
  { id: "sec-intro", title: "Introduction", targetWordCount: 200, currentWordCount: 0, guidance: "", draftContent: "", status: "pending", sectionType: "intro" },
  { id: "sec-body", title: "Argument", targetWordCount: 600, currentWordCount: 0, guidance: "", draftContent: "", status: "pending", sectionType: "body" },
];

function mount(extra: Record<string, unknown> = {}) {
  getProject.mockResolvedValue({
    projectId: "proj-stop",
    outputTypeId: "OT-01",
    title: "Stop",
    hasDocument: false,
    answers: { assignment_brief: "Assess group decision making in teams.", word_limit: "800", assignment_internal_sections: sections, ...extra },
    gates: [],
  });
  return render(
    <AssignmentProvider projectId="proj-stop" initialStage="drafting" onStageChangeCallback={vi.fn()}>
      <AssignmentDraftingStage />
    </AssignmentProvider>
  );
}

const lastSaved = (key: string) =>
  saveIntakeAnswers.mock.calls.map((c) => c[1] as Record<string, unknown>).filter((p) => key in p).at(-1)?.[key];

beforeEach(() => {
  saveIntakeAnswers.mockResolvedValue({ success: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Drafting: one request at a time, Stop and Resume", () => {
  it("a double click starts one draft, and Stop aborts it and keeps what arrived", async () => {
    let signal: AbortSignal | undefined;
    streamSectionGeneration.mockImplementation(
      (opts: { signal: AbortSignal; onChunk: (c: string, all: string) => void }) =>
        new Promise((_resolve, reject) => {
          signal = opts.signal;
          opts.onChunk("Teams decide. ", "Teams decide. Then the gr");
          opts.signal.addEventListener("abort", () => reject(new SectionDraftStoppedError("Teams decide. Then the gr")), { once: true });
        })
    );
    mount();
    const draft = await screen.findByRole("button", { name: /Draft with AI/i });
    fireEvent.click(draft);
    fireEvent.click(draft);
    await screen.findByTestId("drafting-live");
    expect(streamSectionGeneration).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Stop" }));
    await waitFor(() => expect(signal?.aborted).toBe(true));
    expect(await screen.findByTestId("drafting-partial")).toHaveTextContent(/stopped after 5 words/);
    await waitFor(() => expect(lastSaved("assignment_section_partials")).toEqual({ "sec-intro": "Teams decide. Then the gr" }));
  });

  it("Resume continues from the last full sentence, and the kept text is cleared once the section is written", async () => {
    streamSectionGeneration.mockImplementation(async (opts: { onComplete: (t: string) => Promise<void> | void }) => {
      await opts.onComplete("Teams decide. Then the group reviews the evidence.");
      return "";
    });
    mount({ assignment_section_partials: { "sec-intro": "Teams decide. Then the gr" } });
    fireEvent.click(await screen.findByRole("button", { name: "Resume" }));
    await waitFor(() => expect(streamSectionGeneration).toHaveBeenCalledTimes(1));
    expect(streamSectionGeneration.mock.calls[0][0]).toMatchObject({ continueFrom: "Teams decide." });
    await waitFor(() => expect(lastSaved("assignment_section_partials")).toBeNull());
    await waitFor(() => expect(screen.queryByTestId("drafting-partial")).not.toBeInTheDocument());
  });

  it("Discard drops the kept text without writing the section", async () => {
    mount({ assignment_section_partials: { "sec-intro": "Teams decide." } });
    fireEvent.click(await screen.findByRole("button", { name: "Discard" }));
    await waitFor(() => expect(lastSaved("assignment_section_partials")).toBeNull());
    expect(streamSectionGeneration).not.toHaveBeenCalled();
  });
});
