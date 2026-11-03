// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

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
  isEphemeralProject: (id: string) => typeof id === "string" && (id.startsWith("draft-") || id.startsWith("ephemeral-")),
  commitProjectToDatabase: vi.fn().mockImplementation(async (id: string) => ({ projectId: id, answers: {} })),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

const { default: AssignmentWorkspace } = await import("../AssignmentWorkspace");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Extract reads the brief first and asks only what is missing", () => {
  beforeEach(() => {
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });
    saveIntakeAnswers.mockImplementation(async (_id: string, answers: Record<string, unknown>) => ({ projectId: "proj-scope", outputTypeId: "OT-01", answers, gates: [] }));
    getProject.mockResolvedValue({ projectId: "proj-scope", outputTypeId: "OT-01", title: "Academic Assignment", hasDocument: false, answers: {}, gates: [] });
  });

  const lastSaved = () => {
    const merged: Record<string, unknown> = {};
    for (const [, a] of saveIntakeAnswers.mock.calls) Object.assign(merged, a);
    return merged;
  };

  it("fills in what the brief states, shows it, and shapes the approach to the subject without asking", async () => {
    render(<AssignmentWorkspace projectId="proj-scope" initialStage="extract" />);
    const prompt = await screen.findByPlaceholderText(/Paste your assignment prompt/i);
    fireEvent.change(prompt, {
      target: { value: "MSc Marketing. Write a 2,500-word business report on a company's supply chain strategy, using Harvard referencing." },
    });
    const panel = await screen.findByTestId("brief-scope");
    expect(panel).toHaveTextContent("Subject:Business");
    expect(panel).toHaveTextContent("Length:2,500 words");
    expect(panel).toHaveTextContent("Referencing:Harvard");
    // Nothing critical is missing, so no questions are asked.
    expect(screen.queryByText("Which subject is this for?")).toBeNull();
    expect(screen.getByTestId("brief-approach")).toHaveTextContent("case framework");
    await waitFor(() => expect(lastSaved()).toMatchObject({ word_count: 2500, citation_style: "harvard", academic_level: "postgraduate", assignment_type: "report", assignment_discipline: "business" }));
    // The five settings collapse into one line of assumptions.
    expect(screen.getByTestId("assignment-settings")).toHaveTextContent(/Assuming: Postgraduate.*Report.*Harvard.*2,500 words/);
  });

  it("asks one or two quick questions when the brief leaves them open, with a default", async () => {
    render(<AssignmentWorkspace projectId="proj-scope" initialStage="extract" />);
    const prompt = await screen.findByPlaceholderText(/Paste your assignment prompt/i);
    fireEvent.change(prompt, { target: { value: "Climate adaptation in mountain communities." } });
    expect(await screen.findByText("Which subject is this for?")).toBeInTheDocument();
    expect(screen.getByText("What kind of piece is it?")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Not sure: assume Social sciences" }));
    await waitFor(() => expect(lastSaved()).toMatchObject({ assignment_discipline: "social_sciences" }));
    expect(screen.queryByText("Which subject is this for?")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Report" }));
    await waitFor(() => expect(lastSaved()).toMatchObject({ assignment_type: "report" }));
    await waitFor(() => expect(screen.queryByText("What kind of piece is it?")).toBeNull());
  });

  it("shows the same reading of the brief in the Understand stage", async () => {
    render(<AssignmentWorkspace projectId="proj-scope" initialStage="understand" />);
    const prompt = await screen.findByPlaceholderText(/Paste your assignment prompt/i);
    fireEvent.change(prompt, { target: { value: "Advise the defendant on liability in tort and the relevant case law (1,500 words)." } });
    const panel = await screen.findByTestId("brief-scope");
    expect(panel).toHaveTextContent("Subject:Law");
    expect(screen.getByTestId("brief-approach")).toHaveTextContent("issues, the rules that govern them");
  });
});
