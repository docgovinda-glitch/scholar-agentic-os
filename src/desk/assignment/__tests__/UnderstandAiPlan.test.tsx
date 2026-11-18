// @vitest-environment jsdom
/**
 * Understand shows what the AI planned, labelled as such: its proposed theses
 * (pick one, or refine your own with AI; nothing saved until accepted), its
 * outline with each section's purpose and the notes on the word budgets, and
 * a way to rewrite one section. With no outline, none is made up.
 */
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { AssignmentProvider } from "../AssignmentContext";
import AssignmentUnderstandStage from "../stages/AssignmentUnderstandStage";

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

const STRUCTURE = {
  version: 1,
  isConfirmed: false,
  targetWordCount: 1500,
  totalAllocated: 1500,
  source: "ai",
  thesisOptions: [
    { statement: "Personalised rewards, not points, drive retention in UK grocery loyalty schemes.", angle: "Personalisation" },
    { statement: "Price matters more than loyalty schemes for retention.", angle: "Price first" },
  ],
  budgetNotes: ["The AI's word targets added up to 1,400; they were scaled to the 1,500-word target, keeping its proportions."],
  headings: [
    { id: "heading-1", number: 1, title: "How loyalty schemes retain shoppers", purpose: "Establish the retention mechanisms the argument tests.", targetWordCount: 900, subheadings: [{ id: "u1", headingId: "heading-1", numberStr: "1.1", title: "Evidence on retention", targetWordCount: 900 }] },
    { id: "heading-2", number: 2, title: "What follows for retailers", purpose: "Draw the implications.", targetWordCount: 600, subheadings: [{ id: "u2", headingId: "heading-2", numberStr: "2.1", title: "Implications", targetWordCount: 600 }] },
  ],
};

function mount(answers: Record<string, unknown>) {
  getProject.mockResolvedValue({ projectId: "proj-plan", outputTypeId: "OT-01", title: "Loyalty", hasDocument: false, answers: { assignment_brief: BRIEF, word_limit: "1500", citation_style: "harvard", ...answers }, gates: [] });
  return render(
    <AssignmentProvider projectId="proj-plan" initialStage="understand" onStageChangeCallback={vi.fn()}>
      <AssignmentUnderstandStage />
    </AssignmentProvider>
  );
}

const savedValue = (key: string) =>
  saveIntakeAnswers.mock.calls.map((c) => c[1] as Record<string, unknown>).filter((p) => key in p).at(-1)?.[key];

beforeEach(() => {
  saveIntakeAnswers.mockResolvedValue({ success: true });
});
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Understand: the AI's plan", () => {
  it("offers the AI's theses as labelled suggestions and saves the one picked", async () => {
    mount({ assignment_structure: JSON.stringify(STRUCTURE), assignment_thesis: "My own thesis about loyalty schemes." });
    const group = await screen.findByRole("group", { name: /Working theses your AI proposed/i });
    expect(group).toHaveTextContent(/AI suggestion · Personalisation/);
    fireEvent.click(screen.getByRole("button", { name: /Price matters more than loyalty schemes/i }));
    await waitFor(() => expect(savedValue("assignment_thesis")).toBe("Price matters more than loyalty schemes for retention."));
  });

  it("refines the student's thesis with AI and saves it only when accepted", async () => {
    mount({ assignment_structure: JSON.stringify(STRUCTURE), assignment_thesis: "Loyalty schemes help supermarkets." });
    authedJsonFetch.mockResolvedValue(new Response(JSON.stringify({ thesis: "UK supermarket loyalty schemes retain shoppers mainly through personalised offers.", note: "Made it specific." }), { status: 200 }));
    fireEvent.click(await screen.findByRole("button", { name: /Refine with AI/i }));
    const suggestion = await screen.findByTestId("thesis-suggestion");
    expect(suggestion).toHaveTextContent(/mainly through personalised offers/);
    expect(authedJsonFetch.mock.calls[0][0]).toMatch(/\/assignment\/thesis\/refine$/);
    expect(authedJsonFetch.mock.calls[0][2]).toEqual({ thesis: "Loyalty schemes help supermarkets." });
    expect(savedValue("assignment_thesis")).toBeUndefined();
    fireEvent.click(screen.getByRole("button", { name: "Use this" }));
    await waitFor(() => expect(savedValue("assignment_thesis")).toBe("UK supermarket loyalty schemes retain shoppers mainly through personalised offers."));
  });

  it("shows each section's purpose and the notes on the word budgets, and rewrites one section on request", async () => {
    mount({ assignment_structure: JSON.stringify(STRUCTURE), assignment_thesis: "x thesis" });
    expect(await screen.findByTestId("heading-purpose-heading-1")).toHaveTextContent("Establish the retention mechanisms");
    expect(screen.getByTestId("outline-budget-notes")).toHaveTextContent(/scaled to the 1,500-word target/);
    authedJsonFetch.mockResolvedValue(new Response(JSON.stringify({ structure: STRUCTURE }), { status: 200 }));
    fireEvent.click(screen.getByRole("button", { name: /Regenerate section 2 with AI/i }));
    await waitFor(() => expect(authedJsonFetch.mock.calls.some((c) => /\/outline\/section$/.test(String(c[0])) && (c[2] as { headingId?: string }).headingId === "heading-2")).toBe(true));
  });

  it("with no outline yet, shows none (no template) and offers the AI or a plain outline", async () => {
    mount({ assignment_extraction: JSON.stringify({ task: "A report", requirements: [], constraints: {}, criteria: [], questions: [], missing: [] }) });
    const empty = await screen.findByTestId("outline-empty");
    expect(empty).toHaveTextContent(/No outline yet/);
    expect(screen.getByRole("button", { name: /Write the outline with AI/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Start from a plain outline \(not AI\)/i })).toBeInTheDocument();
    // No thesis is filled in from a template.
    expect((screen.getByLabelText(/Working thesis/i) as HTMLTextAreaElement).value).toBe("");
  });
});
