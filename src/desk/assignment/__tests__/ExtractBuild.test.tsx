// @vitest-environment jsdom
/**
 * Save & Build: one server build (POST /assignment/build) reads the brief and
 * plans it. The workspace moves to Understand as soon as the brief has been
 * read, a second click starts nothing, and a failure is shown with Retry.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssignmentProvider } from "../AssignmentContext";
import AssignmentExtractStage from "../stages/AssignmentExtractStage";

const getProject = vi.fn();
const saveIntakeAnswers = vi.fn();
const authedJsonFetch = vi.fn();

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: vi.fn().mockResolvedValue(null),
  getRubric: vi.fn().mockResolvedValue(null),
  getOutputTypeSpec: vi.fn().mockResolvedValue({ id: "OT-01" }),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  authedFetch: vi.fn(),
  authedJsonFetch: (...a: unknown[]) => authedJsonFetch(...a),
  isEphemeralProject: () => false,
  commitProjectToDatabase: vi.fn(),
}));
vi.mock("../../../services/userVault", () => ({ loadVault: vi.fn().mockResolvedValue([]) }));
vi.mock("../../../services/vault/cloudDriveService", () => ({ getConnectedCloudDrives: vi.fn().mockResolvedValue([]) }));

const BRIEF = "Evaluate how loyalty schemes shape customer retention in UK supermarkets. Write 1,500 words. Use Harvard referencing.";

/** An SSE response that sends `events`, then waits for `release` before the rest. */
function sse(first: object[], rest: object[] = [], hold?: Promise<void>): Response {
  const enc = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(ctl) {
      for (const e of first) ctl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      if (hold) await hold;
      for (const e of rest) ctl.enqueue(enc.encode(`data: ${JSON.stringify(e)}\n\n`));
      ctl.enqueue(enc.encode("data: [DONE]\n\n"));
      ctl.close();
    },
  });
  return new Response(body, { status: 200, headers: { "Content-Type": "text/event-stream" } });
}

function mount(onProceed = vi.fn()) {
  getProject.mockResolvedValue({ projectId: "proj-build-ui", outputTypeId: "OT-01", title: "Loyalty", hasDocument: false, answers: { assignment_brief: BRIEF, word_limit: "1500", citation_style: "harvard", academic_level: "undergraduate", assignment_type: "essay" }, gates: [] });
  render(
    <AssignmentProvider projectId="proj-build-ui" initialStage="extract" onStageChangeCallback={vi.fn()}>
      <AssignmentExtractStage onProceed={onProceed} />
    </AssignmentProvider>
  );
  return onProceed;
}

/** The Save & Build button, once the loaded brief has enabled it. */
async function buildButton() {
  const button = await screen.findByRole("button", { name: /Save & Build/i });
  await waitFor(() => expect(button).not.toBeDisabled());
  return button;
}

const buildCalls = () => authedJsonFetch.mock.calls.filter((c) => /\/assignment\/build$/.test(String(c[0])));

beforeEach(() => {
  saveIntakeAnswers.mockResolvedValue({ success: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Extract: Save & Build", () => {
  it("runs one build and opens Understand once the brief has been read, while the outline is still being written", async () => {
    let release!: () => void;
    const hold = new Promise<void>((r) => (release = r));
    authedJsonFetch.mockResolvedValue(
      sse(
        [
          { step: "extract", status: "running", message: "Reading your brief…" },
          { step: "extract", status: "done", message: "Found 2 requirements." },
          { step: "understand", status: "running", message: "Planning your thesis and outline…" },
        ],
        [{ step: "understand", status: "done", message: "Outline ready." }, { done: true }],
        hold
      )
    );
    const onProceed = mount();
    const button = await buildButton();
    fireEvent.click(button);
    fireEvent.click(button);
    await waitFor(() => expect(onProceed).toHaveBeenCalledTimes(1));
    // Understand opened while the outline is still being planned.
    expect(buildCalls()).toHaveLength(1);
    // The brief and settings were saved under their canonical names first.
    expect(saveIntakeAnswers.mock.calls.some((c) => (c[1] as Record<string, unknown>).assignment_brief === BRIEF)).toBe(true);
    // No template outline was saved on the way.
    expect(saveIntakeAnswers.mock.calls.some((c) => "assignment_structure" in (c[1] as Record<string, unknown>))).toBe(false);
    release();
    // The project is reloaded after the brief was read and again when the build finished.
    await waitFor(() => expect(getProject.mock.calls.length).toBeGreaterThanOrEqual(3));
  });

  it("shows the build's own error with Retry, and stays on Extract", async () => {
    authedJsonFetch.mockResolvedValue(sse([{ step: "extract", status: "running" }, { error: "The model returned an empty answer.", step: "extract", recoverable: true }]));
    const onProceed = mount();
    fireEvent.click(await buildButton());
    expect(await screen.findByText(/empty answer/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Retry" })).toBeInTheDocument();
    expect(onProceed).not.toHaveBeenCalled();
  });

  it("treats no AI connected as an expected state: a calm notice with Connect an AI, not a red Retry", async () => {
    authedJsonFetch.mockResolvedValue(sse([{ step: "extract", status: "running" }, { error: "Connect an AI provider (your own key or a local model) in AI Access to run this.", step: "extract", recoverable: true }]));
    const onProceed = mount();
    fireEvent.click(await buildButton());
    expect(await screen.findByText(/Reading the brief needs an AI\. Your brief and settings are saved\./i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Connect an AI" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Retry" })).not.toBeInTheDocument();
    expect(onProceed).not.toHaveBeenCalled();
  });
});
