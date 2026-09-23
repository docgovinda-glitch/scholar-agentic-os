// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { AssignmentProvider } from "../AssignmentContext";
import AssignmentAiTutorPanel from "../components/AssignmentAiTutorPanel";

const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();

vi.mock("../../api", async (importOriginal) => {
  const actual = await importOriginal<Record<string, unknown>>();
  return {
    ...actual,
    getProject: (...a: unknown[]) => getProject(...a),
    getDocument: (...a: unknown[]) => getDocument(...a),
    getRubric: (...a: unknown[]) => getRubric(...a),
    getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
    saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  };
});

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

describe("Live Socratic AI Tutor & Rubric Grading Estimator Panel", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-tutor-test",
      outputTypeId: "OT-01",
      title: "Philosophy of Science Essay",
      hasDocument: false,
      answers: {
        assignment_question: "Critically evaluate Popper's falsificationism versus Kuhn's paradigm shifts.",
        word_count: 2000,
        citation_style: "apa7",
        academic_level: "undergraduate",
        assignment_type: "critical_essay",
        assignment_outline: [
          {
            id: "sec-1",
            title: "Introduction & Demarcation Problem",
            targetWordCount: 300,
            currentWordCount: 250,
            draftContent: "Karl Popper proposed falsificationism as the criterion of scientific demarcation...",
            guidance: "Introduce demarcation criteria.",
            keyPoints: ["Popper vs Positivists"],
            linkedEvidenceIds: [],
            status: "drafting",
          },
        ],
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({ id: "OT-01", label: "Assignment" });

    // Mock global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders tutor modes (Socratic, Rubric, Counter-Args, Polish) and initial greeting", async () => {
    render(
      <AssignmentProvider
        projectId="proj-tutor-test"
        initialStage="draft"
        onStageChangeCallback={vi.fn()}
      >
        <AssignmentAiTutorPanel />
      </AssignmentProvider>
    );

    expect(await screen.findByText(/Socratic Inquiry/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Socratic/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Rubric/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Counter-Args/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Polish/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Socratic Academic Tutor & Rubric Estimator/i)).toBeInTheDocument();
    expect(screen.queryByText(/Academic Thinking & Writing Tutor/i)).not.toBeInTheDocument();
  });

  it("switches modes and updates prompt chips", async () => {
    render(
      <AssignmentProvider
        projectId="proj-tutor-test"
        initialStage="draft"
        onStageChangeCallback={vi.fn()}
      >
        <AssignmentAiTutorPanel />
      </AssignmentProvider>
    );

    expect(await screen.findByText(/Challenge the core assumption of my thesis/i)).toBeInTheDocument();

    // Click Rubric mode
    const rubricTab = screen.getByRole("button", { name: /Rubric/i });
    fireEvent.click(rubricTab);

    expect(await screen.findByText(/Estimate my draft's grade band & mark/i)).toBeInTheDocument();
    expect(screen.getByText(/Live Marking Audit/i)).toBeInTheDocument();

    // Click Counter-Args mode
    const counterTab = screen.getByRole("button", { name: /Counter-Args/i });
    fireEvent.click(counterTab);

    expect(await screen.findByText(/What would rival theoretical schools object to\?/i)).toBeInTheDocument();
  });

  it("sends Socratic message and renders structured Socratic questions", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes("/tutor-chat")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            reply: "To deepen your critique of Popper, consider how Kuhn views scientific anomalies.",
            mode: "socratic",
            socraticQuestions: [
              {
                id: "sq-1",
                question: "Does Popper's falsificationism account for the tenacity of scientists defending established theories?",
                targetConcept: "Falsification vs Normal Science",
                challengeType: "probe_assumptions",
                rationale: "Examines whether negative evidence immediately leads to theoretical abandonment in real history.",
              },
            ],
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <AssignmentProvider
        projectId="proj-tutor-test"
        initialStage="draft"
        onStageChangeCallback={vi.fn()}
      >
        <AssignmentAiTutorPanel />
      </AssignmentProvider>
    );

    const input = await screen.findByPlaceholderText(/Ask your Socratic Tutor/i);
    fireEvent.change(input, { target: { value: "How do I critique Popper?" } });
    const askBtn = screen.getByRole("button", { name: /^Ask$/i });
    await waitFor(() => expect(askBtn).not.toBeDisabled());
    fireEvent.click(askBtn);

    expect(await screen.findByText(/To deepen your critique of Popper/i)).toBeInTheDocument();
    expect(screen.getByText(/Socratic Probes to Deepen Your Thinking/i)).toBeInTheDocument();
    expect(screen.getByText(/PROBE ASSUMPTIONS/i)).toBeInTheDocument();
    expect(screen.getByText(/Does Popper's falsificationism account for the tenacity/i)).toBeInTheDocument();
  });

  it("triggers live rubric grade audit and displays detailed criteria scores and roadmap", async () => {
    (global.fetch as any).mockImplementation((url: string) => {
      if (url.includes("/estimate-rubric")) {
        return Promise.resolve({
          ok: true,
          json: async () => ({
            overallScore: 74,
            overallBand: "1st_class",
            bandLabel: "First Class (1st) — 74%",
            summary: "Strong critical synthesis with grounded literature engagement.",
            criteria: [
              {
                id: "crit-1",
                criterion: "Critical Argumentation & Thesis Depth",
                currentBand: "1st_class",
                score: 75,
                maxScore: 100,
                critique: "Excellent synthesis of competing paradigms.",
                howToReachNextBand: "Include Lakatos's research programmes to deepen demarcation critique.",
              },
            ],
            keyStrengths: ["Clear thesis", "Grounded citations"],
            keyRecommendations: ["Synthesize edge cases"],
            targetBandRoadmap: {
              targetBand: "High First Class (80%+)",
              actionableSteps: [
                "Incorporate Lakatosian methodology",
                "Tighten analytical paragraph transitions",
              ],
            },
          }),
        });
      }
      return Promise.resolve({ ok: true, json: async () => ({}) });
    });

    render(
      <AssignmentProvider
        projectId="proj-tutor-test"
        initialStage="draft"
        onStageChangeCallback={vi.fn()}
      >
        <AssignmentAiTutorPanel />
      </AssignmentProvider>
    );

    // Switch to Rubric mode
    const rubricTab = await screen.findByRole("button", { name: /Rubric/i });
    fireEvent.click(rubricTab);

    // Wait for Estimate Grade button to be enabled (word count >= 50 loaded)
    const estimateBtn = await screen.findByRole("button", { name: /Estimate Grade/i });
    await waitFor(() => expect(estimateBtn).not.toBeDisabled());
    fireEvent.click(estimateBtn);

    expect(await screen.findByText(/Critical Argumentation & Thesis Depth/i)).toBeInTheDocument();
    expect(screen.getByText(/75 \/ 100/i)).toBeInTheDocument();
    expect(screen.getByText(/Roadmap to High First Class \(80%\+\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Incorporate Lakatosian methodology/i)).toBeInTheDocument();
  });
});
