// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { RubricComplianceCard } from "../components/RubricComplianceCard";
import { CitationReconciliationCard } from "../components/CitationReconciliationCard";
import { AssignmentSubmissionStage } from "../stages/AssignmentSubmissionStage";
import { AssignmentProvider } from "../context/AssignmentContext";
import * as exportService from "../services/assignmentExportService";
import type { RubricScoreReport, CitationAuditResult } from "../types";

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

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const mockRubricReport: RubricScoreReport = {
  predictedGrade: "First Class (1st)",
  readinessPercentage: 88,
  overallScore: 84,
  bandLabel: "First Class (1st) — 84%",
  summary: "Comprehensive critical analysis backed by empirical literature.",
  criteriaFeedback: {
    "Critical Analysis & Argumentation": "Exceptional dialectical evaluation of competing schools of thought.",
    "Evidence & Scholarly Grounding": "All empirical claims are substantiated with verified peer-reviewed citations.",
  },
  missingRequirements: [],
  criteria: [
    {
      criterion: "Critical Analysis & Argumentation",
      score: 85,
      maxScore: 100,
      feedback: "Exceptional dialectical evaluation of competing schools of thought.",
      weightPercentage: 50,
    },
    {
      criterion: "Evidence & Scholarly Grounding",
      score: 83,
      maxScore: 100,
      feedback: "All empirical claims are substantiated with verified peer-reviewed citations.",
      weightPercentage: 50,
    },
  ],
  strengths: ["Strong critical synthesis", "Rigorous citation grounding"],
  priorityFixes: [],
};

const mockCitationAudit: CitationAuditResult = {
  totalInTextCitations: 4,
  totalBibliographyEntries: 4,
  isReconciled: true,
  unresolvedCitations: [],
  reconciledCitations: ["Smith, 2020", "Johnson, 2021", "Taylor, 2022", "Lee, 2023"],
  verifiedCount: 4,
  flaggedIssues: [],
};

describe("Assignment Phase 4: Submission Audit & Export Flow", () => {
  beforeEach(() => {
    window.URL.createObjectURL = vi.fn().mockReturnValue("blob:mock-url");
    window.URL.revokeObjectURL = vi.fn();
    window.open = vi.fn().mockReturnValue({
      document: {
        open: vi.fn(),
        write: vi.fn(),
        close: vi.fn(),
      },
    });
    window.print = vi.fn();
  });

  describe("RubricComplianceCard Component", () => {
    it("renders predicted grade badge, readiness index, and criteria feedback", () => {
      render(<RubricComplianceCard report={mockRubricReport} />);

      expect(screen.getByTestId("predicted-grade-badge")).toHaveTextContent("First Class (1st)");
      expect(screen.getByText("88% Ready")).toBeInTheDocument();
      expect(screen.getByText("Critical Analysis & Argumentation")).toBeInTheDocument();
      expect(screen.getByText("Evidence & Scholarly Grounding")).toBeInTheDocument();
      expect(screen.getByText(/Exceptional dialectical evaluation/)).toBeInTheDocument();
    });

    it("displays missing requirements alert box when issues are present", () => {
      const reportWithMissing: RubricScoreReport = {
        ...mockRubricReport,
        predictedGrade: "Lower Second (2:2)",
        readinessPercentage: 55,
        missingRequirements: ["Draft length is below target budget.", "Address counter-arguments."],
      };

      render(<RubricComplianceCard report={reportWithMissing} />);

      expect(screen.getByTestId("missing-requirements-box")).toBeInTheDocument();
      expect(screen.getByText("Draft length is below target budget.")).toBeInTheDocument();
      expect(screen.getByText("Address counter-arguments.")).toBeInTheDocument();
    });
  });

  describe("CitationReconciliationCard Component", () => {
    it("renders 100% reconciled status when all citations match", () => {
      render(<CitationReconciliationCard audit={mockCitationAudit} />);

      expect(screen.getByTestId("citation-reconciled-pill")).toHaveTextContent("100% Reconciled");
      expect(screen.getAllByText("4").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Verified In-Text Citations (4)")).toBeInTheDocument();
      expect(screen.getByText("Smith, 2020")).toBeInTheDocument();
    });

    it("displays unresolved citation anchors and enables dismissal action", () => {
      const auditWithUnresolved: CitationAuditResult = {
        totalInTextCitations: 3,
        totalBibliographyEntries: 2,
        isReconciled: false,
        unresolvedCitations: ["(Unknown, 2020)"],
        reconciledCitations: ["Smith, 2020"],
        flaggedIssues: [],
      };

      const onDismiss = vi.fn();
      render(
        <CitationReconciliationCard
          audit={auditWithUnresolved}
          onDismissCitation={onDismiss}
        />
      );

      expect(screen.getByTestId("citation-reconciled-pill")).toHaveTextContent("Unresolved Citations Detected");
      expect(screen.getByTestId("unresolved-citations-box")).toBeInTheDocument();
      expect(screen.getByText("(Unknown, 2020)")).toBeInTheDocument();

      const dismissBtn = screen.getByText("Dismiss");
      fireEvent.click(dismissBtn);
      expect(onDismiss).toHaveBeenCalledWith("(Unknown, 2020)");
    });
  });

  describe("AssignmentSubmissionStage Workspace Integration", () => {
    const mockProjectData = {
      projectId: "proj-submission-test",
      answers: {
        assignment_title: "Ethical Dimensions of Autonomous Systems",
        instructions: "Critically evaluate AI ethics in autonomous systems.",
        targetWordCount: 2000,
        academic_level: "undergraduate",
        citation_style: "harvard",
        current_phase: "submission",
        assignment_submission_report: mockRubricReport,
        assignment_citation_audit: mockCitationAudit,
        assignment_sources: [
          {
            id: "src-1",
            title: "Autonomous Agents",
            authors: ["Alice Smith"],
            year: "2020",
            type: "journal",
            status: "kept",
            citation: "Smith, A. (2020). Autonomous Agents. AI Journal, 1, 1-10.",
          },
        ],
        assignment_internal_sections: [
          {
            id: "sec-1",
            title: "1. Introduction",
            targetWordCount: 500,
            currentWordCount: 450,
            guidance: "Introductory context",
            draftContent: "Autonomous systems present profound ethical challenges (Smith, 2020).",
            status: "completed",
          },
          {
            id: "sec-2",
            title: "2. Dialectical Analysis",
            targetWordCount: 1500,
            currentWordCount: 1400,
            guidance: "Critical debate",
            draftContent: "Critical perspectives emphasize transparency and accountability in deep models.",
            status: "completed",
          },
        ],
      },
    };

    it("renders stage header, predicted grade, readiness, and export controls", async () => {
      getProject.mockResolvedValue(mockProjectData);
      getDocument.mockResolvedValue({ id: "doc-1", title: "Doc", blocks: [] });
      getRubric.mockResolvedValue(null);
      getOutputTypeSpec.mockResolvedValue(null);

      render(
        <AssignmentProvider
          projectId="proj-submission-test"
          initialStage="final"
          onStageChangeCallback={vi.fn()}
        >
          <AssignmentSubmissionStage onBack={vi.fn()} />
        </AssignmentProvider>
      );

      // Verify header and predicted grade
      expect(await screen.findByText("Submission Quality Audit & Camera-Ready Export")).toBeInTheDocument();
      expect(screen.getAllByText("First Class (1st)").length).toBeGreaterThan(0);
      expect(screen.getByText("88%")).toBeInTheDocument();

      // Verify export buttons
      expect(screen.getByTestId("export-docx-button")).toBeInTheDocument();
      expect(screen.getByTestId("export-pdf-button")).toBeInTheDocument();
      expect(screen.getByText("Copy Full Markdown")).toBeInTheDocument();
    });

    it("triggers .docx export without throwing exceptions", async () => {
      getProject.mockResolvedValue(mockProjectData);
      getDocument.mockResolvedValue({ id: "doc-1", title: "Doc", blocks: [] });
      getRubric.mockResolvedValue(null);
      getOutputTypeSpec.mockResolvedValue(null);

      const exportDocxSpy = vi.spyOn(exportService, "exportAssignmentToDocx").mockResolvedValue(undefined);

      render(
        <AssignmentProvider
          projectId="proj-submission-test"
          initialStage="final"
          onStageChangeCallback={vi.fn()}
        >
          <AssignmentSubmissionStage onBack={vi.fn()} />
        </AssignmentProvider>
      );

      const exportBtn = await screen.findByTestId("export-docx-button");
      fireEvent.click(exportBtn);

      await waitFor(() => {
        expect(exportDocxSpy).toHaveBeenCalledTimes(1);
      });
    });

    it("triggers PDF export and back navigation", async () => {
      getProject.mockResolvedValue(mockProjectData);
      getDocument.mockResolvedValue({ id: "doc-1", title: "Doc", blocks: [] });
      getRubric.mockResolvedValue(null);
      getOutputTypeSpec.mockResolvedValue(null);

      const exportPdfSpy = vi.spyOn(exportService, "exportAssignmentToPdf").mockImplementation(() => {});
      const onBack = vi.fn();

      render(
        <AssignmentProvider
          projectId="proj-submission-test"
          initialStage="final"
          onStageChangeCallback={vi.fn()}
        >
          <AssignmentSubmissionStage onBack={onBack} />
        </AssignmentProvider>
      );

      const pdfBtn = await screen.findByTestId("export-pdf-button");
      fireEvent.click(pdfBtn);
      expect(exportPdfSpy).toHaveBeenCalledTimes(1);

      const backBtn = screen.getByText("Back to Drafting");
      fireEvent.click(backBtn);
      expect(onBack).toHaveBeenCalledTimes(1);
    });
  });
});
