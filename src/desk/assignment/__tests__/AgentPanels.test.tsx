// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const ctx: any = {};
vi.mock("../AssignmentContext", () => ({ useAssignmentWorkspace: () => ctx }));
const { ExtractAgentPanel, UnderstandAgentPanel, ReviewAgentPanel } = await import("../components/AgentPanels");

const idle = { status: "idle" as const };
function agent(over: Record<string, unknown> = {}) {
  return {
    steps: { extract: idle, understand: idle, sources: idle, review: idle },
    extraction: null,
    understanding: null,
    sourceAnalysis: {},
    review: null,
    running: false,
    runExtract: vi.fn(async () => true),
    runUnderstand: vi.fn(async () => true),
    runSources: vi.fn(async () => true),
    runReview: vi.fn(async () => true),
    runThrough: vi.fn(async () => {}),
    stop: vi.fn(),
    ...over,
  };
}

describe("coursework agent panels", () => {
  afterEach(() => cleanup());

  it("runs the stages from Extract, saving the typed brief first", async () => {
    Object.assign(ctx, { agent: agent(), question: "" });
    const saveBrief = vi.fn(async () => {});
    render(<ExtractAgentPanel brief="Write a 2,500-word report on a UK retailer's social media." saveBrief={saveBrief} />);
    fireEvent.click(screen.getByRole("button", { name: /Run Extract → Understand → Sources/ }));
    await vi.waitFor(() => expect(ctx.agent.runThrough).toHaveBeenCalled());
    expect(saveBrief).toHaveBeenCalled();
  });

  it("cannot run without a brief, and shows quoted requirements and missing information", () => {
    Object.assign(ctx, {
      question: "Write a report",
      agent: agent({
        extraction: { task: "A report", questions: [], requirements: [{ text: "Harvard referencing", quote: "Use Harvard referencing", kind: "referencing" }], objectives: [], constraints: { wordCount: 2500 }, criteria: [], materials: [], missing: [{ question: "Which retailer?", why: "Open in the brief." }] },
      }),
    });
    render(<ExtractAgentPanel brief="" />);
    expect(screen.getByRole("button", { name: /Run Extract → Understand → Sources/ })).toBeDisabled();
    expect(screen.getByText("“Use Harvard referencing”")).toBeInTheDocument();
    expect(screen.getByTestId("agent-missing")).toHaveTextContent("Which retailer?");
    expect(screen.getByRole("button", { name: "Read again with my answers" })).toBeDisabled();
  });

  it("shows a step's real status and offers Try again after an error", () => {
    Object.assign(ctx, { agent: agent({ extraction: { task: "t", questions: [], requirements: [], objectives: [], constraints: {}, criteria: [], materials: [], missing: [] }, steps: { extract: idle, understand: { status: "error", message: "No AI is connected." }, sources: idle, review: idle } }) });
    render(<UnderstandAgentPanel />);
    expect(screen.getByRole("alert")).toHaveTextContent("No AI is connected.");
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    expect(ctx.agent.runUnderstand).toHaveBeenCalled();
  });

  it("Understand waits for Extract; Review waits for a draft and marks a stale review", () => {
    Object.assign(ctx, { agent: agent(), currentWordCount: 0 });
    render(<UnderstandAgentPanel />);
    expect(screen.getByRole("button", { name: "Plan the assignment" })).toBeDisabled();
    cleanup();
    Object.assign(ctx, { currentWordCount: 900, agent: agent({ review: { summary: "Fine.", requirements: [{ index: 1, requirement: "Use 8 sources", status: "missing", fix: "Add sources." }], unsupportedClaims: [], argument: [], structure: [], language: [], words: 400 } }) });
    render(<ReviewAgentPanel />);
    expect(screen.getByText(/The draft has changed since this review/)).toBeInTheDocument();
    expect(screen.getByText("Missing")).toBeInTheDocument();
    expect(screen.getByText("Fix: Add sources.")).toBeInTheDocument();
  });
});
