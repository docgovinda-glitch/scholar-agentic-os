// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";

const getProject = vi.fn();
const getDocument = vi.fn();
const getRubric = vi.fn();
const getOutputTypeSpec = vi.fn();
const saveIntakeAnswers = vi.fn();

vi.mock("../../api", () => ({
  getProject: (...a: unknown[]) => getProject(...a),
  getDocument: (...a: unknown[]) => getDocument(...a),
  getRubric: (...a: unknown[]) => getRubric(...a),
  getOutputTypeSpec: (...a: unknown[]) => getOutputTypeSpec(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  isEphemeralProject: () => false,
  commitProjectToDatabase: vi.fn(),
  authedJsonFetch: vi.fn(),
  authedFetch: vi.fn(),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue([
    {
      id: "vault-item-1",
      title: "Foundations of Autonomous Ethics",
      content: "Empirical study on autonomous moral decision architectures.",
      citation: "Smith & Doe (2024)",
      canonicalReference: { authors: [{ family: "Smith", given: "John" }], year: 2024 },
    },
  ]),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
}));

const { default: AssignmentWorkspace } = await import("../AssignmentWorkspace");

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Assignment Workspace Guided Stages & Workflow", () => {
  beforeEach(() => {
    getProject.mockResolvedValue({
      projectId: "proj-456",
      outputTypeId: "OT-01",
      title: "Postgraduate Policy Analysis",
      hasDocument: false,
      answers: {
        assignment_question: "Critically analyse international climate governance frameworks and equity implications.",
        word_count: 3000,
        citation_style: "harvard",
        academic_level: "postgraduate",
        assignment_type: "policy_analysis",
        assignment_deconstruction: {
          commandVerbs: [{ verb: "Critically analyse", meaning: "Deconstruct assumptions", academicExpectation: "Balanced evaluation" }],
          gradeBandDescriptors: [{ band: "1st_class", label: "First Class (70%+)", minScore: 70, criteria: ["Flawless structure"], whatExaminersLookFor: "Original thesis" }],
          subQuestions: { explicit: ["How effective are frameworks?"], implicit: ["What structural inequities persist?"] },
          constraints: ["Word count must adhere to 3000"],
          summary: "In-depth analysis of climate regime compliance.",
          scopeBoundaries: { included: ["UNFCCC", "Paris Agreement"], excluded: ["Local municipal codes"] },
          approvedByUser: true,
        },
        assignment_thesis_budget: {
          selectedThesis: "International climate frameworks systematically entrench historical inequities despite market-mechanism adaptations.",
          thesisRationale: "Challenges neoliberal climate architecture with empirical evidence.",
          totalTargetWords: 3000,
          tolerancePercent: 10,
          sections: [
            { id: "sec-1", title: "Introduction & Theoretical Framing", type: "introduction", targetWordCount: 300, currentWordCount: 0, targetPercent: 10, guidance: "Establish thesis", keyPoints: ["Context"] },
            { id: "sec-2", title: "Theme 1: Regime Compliance Disparities", type: "body_theme", targetWordCount: 1200, currentWordCount: 0, targetPercent: 40, guidance: "Analyze compliance data", keyPoints: ["Compliance"] },
            { id: "sec-3", title: "Theme 2: Equity & Financial Compensation", type: "body_theme", targetWordCount: 1200, currentWordCount: 0, targetPercent: 40, guidance: "Analyze loss and damage", keyPoints: ["Loss and damage"] },
            { id: "sec-4", title: "Conclusion & Policy Rebuttal", type: "conclusion", targetWordCount: 300, currentWordCount: 0, targetPercent: 10, guidance: "Synthesize insights", keyPoints: ["Synthesis"] },
          ],
          approvedByUser: true,
        },
        assignment_peel_matrix: {
          themes: [
            {
              id: "theme-1",
              themeTitle: "Theme 1: Regime Compliance Disparities",
              targetWords: 1200,
              currentWords: 1150,
              point: "Compliance mechanisms exhibit asymmetric enforcement favoring developed carbon emitters.",
              evidence: "UNFCCC Article 6 implementation reports (2023) show persistent funding gaps.",
              explanation: "Market-based credit pricing systematically under-compensates vulnerable nations.",
              counterargument: "Proponents argue market pricing provides optimal global allocative efficiency.",
              rebuttal: "However, market friction prevents capital transfer to mitigation-critical jurisdictions.",
              link: "Hence, institutional restructuring remains necessary to achieve equitable climate stabilization.",
              draftContent: "Compliance mechanisms exhibit asymmetric enforcement favoring developed carbon emitters.",
              status: "complete",
              linkedSourceIds: [],
            },
          ],
          introductionDraft: "International climate governance requires profound theoretical synthesis.",
          conclusionDraft: "Substantive policy recalibration is imperative.",
        },
        assignment_citations: [
          {
            id: "cite-1",
            sourceTitle: "Global Climate Governance Disparities",
            authors: ["Ostrom, E.", "Keohane, R."],
            year: "2023",
            journalOrPublisher: "Global Environmental Politics",
            inTextCitation: "(Ostrom & Keohane, 2023)",
            fullReference: "Ostrom, E., & Keohane, R. (2023). Global Climate Governance Disparities. Global Environmental Politics, 23(1), 45-68.",
            verifiedPeerReviewed: true,
            claim: "Market pricing systematically under-compensates vulnerable nations.",
          },
        ],
        assignment_audit_report: {
          overallScore: 82,
          overallBand: "1st_class",
          bandLabel: "First Class (1st) — 82%",
          estimatedGradeBand: "First Class (1st) — 82%",
          summary: "Outstanding dialectical synthesis with First-Class academic rigor.",
          rubricAlignmentScore: 94,
          wordCountAdherence: {
            actual: 2950,
            target: 3000,
            minAllowed: 2700,
            maxAllowed: 3300,
            status: "compliant",
            deviationPercent: 1.6,
          },
          criteriaResults: [
            { name: "Critical Thinking & Nuance", status: "pass", feedback: "Superb counterargument handling", awardedMarks: 28, maxMarks: 30 },
            { name: "Evidence & Provenance", status: "pass", feedback: "Peer-reviewed citations verified", awardedMarks: 26, maxMarks: 30 },
          ],
          strengths: ["Flawless dialectical PEEL structure", "Strong argumentative thesis"],
          priorityFixes: ["Fine-tune concluding policy synthesis"],
          readyForSubmission: true,
        },
      },
      gates: [],
    });
    getDocument.mockResolvedValue(null);
    getRubric.mockResolvedValue(null);
    getOutputTypeSpec.mockResolvedValue({
      id: "OT-01",
      label: "Assignment",
    });
  });

  it("renders Stage 1 (Deconstruct) with command verbs and grade band descriptors", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="deconstruct"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Stage 01 • Deconstruction/i)).toBeInTheDocument();
    expect(screen.getByText(/Command Verbs & Examiner Demands/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Critically analyse/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/First Class \(70%\+\)/i)).toBeInTheDocument();
  });

  it("renders Stage 2 (Thesis & Budget) with section mathematical word count budget", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="thesis_budget"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Stage 02 • Thesis & Word Budget/i)).toBeInTheDocument();
    expect(screen.getByText(/1. Argumentative Thesis Statement/i)).toBeInTheDocument();
    expect(screen.getByText(/2. Mathematical Section Word Budget/i)).toBeInTheDocument();
    expect(screen.getByText(/Total Word Count Allocation:/i)).toBeInTheDocument();
  });

  it("renders Stage 3 (PEEL Matrix) with dialectical scaffolding and prose draft", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="peel_matrix"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Stage 03 • PEEL Argument Matrix/i)).toBeInTheDocument();
    expect(screen.getByText(/P — Point \(Topic Claim & Thesis Alignment\)/i)).toBeInTheDocument();
    expect(screen.getByText(/E — Evidence \(Empirical Findings & Scholarly Citations\)/i)).toBeInTheDocument();
    expect(screen.getByText(/★ Counter-Argument \(Opposing Scholarly View\)/i)).toBeInTheDocument();
  });

  it("renders Stage 4 (Citations) with verified peer-reviewed sources and in-text citations", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="citations"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Stage 04 • Citation & Grounding/i)).toBeInTheDocument();
    expect(screen.getByText(/Citation Standard & Compliance/i)).toBeInTheDocument();
    expect(screen.getAllByText(/Global Climate Governance Disparities/i).length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/\(Ostrom & Keohane, 2023\)/i)).toBeInTheDocument();
  });

  it("renders Stage 5 (Audit & Export) with rubric compliance audit and export downloads", async () => {
    render(
      <AssignmentWorkspace
        projectId="proj-456"
        initialStage="audit_export"
        onStageChange={vi.fn()}
      />
    );

    expect(await screen.findByText(/Stage 05 • Submission Audit & Export/i)).toBeInTheDocument();
    expect(screen.getByText(/First Class \(1st\) — 82%/i)).toBeInTheDocument();
    expect(screen.getByText(/Microsoft Word \(\.docx\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Academic PDF \(\.pdf\)/i)).toBeInTheDocument();
    expect(screen.getByText(/LaTeX Bundle \(\.tex\)/i)).toBeInTheDocument();
  });
});
