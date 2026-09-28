// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { LectureUploadDropzone } from "../components/LectureUploadDropzone";
import type { UploadedSourceDocument } from "../types";

describe("Evidence & Knowledge Panel Traceability", () => {
  const mockFile: UploadedSourceDocument = {
    id: "doc-test-1",
    name: "Research_Paper.pdf",
    sourceType: "pdf",
    fileSize: 2450000,
    uploadedAt: new Date().toISOString(),
    citation: "Smith, J. (2024). Empirical analysis of autonomous systems. Oxford University Press.",
    abstract: "A comprehensive investigation of algorithmic governance and structural accountability.",
    keyFindings: [
      "Algorithmic decision-making systems require independent forensic audit standards.",
      "Pre-deployment impact assessments reduce institutional disparate impact by 42%.",
    ],
    methodology: "Peer-Reviewed Article / Authoritative Scholarly Text",
    extractedEvidences: [
      {
        id: "ev-1",
        excerpt: "Autonomous auditing mandates ensure procedural due process across automated public agencies.",
        sourceLocation: "Page 4, Paragraph 2",
        claim: "Procedural due process in algorithmic governance",
      },
      {
        id: "ev-2",
        excerpt: "Disparate impact metrics indicate systemic bias when training sets lack historical parity.",
        sourceLocation: "Page 12, Paragraph 1",
        claim: "Systemic bias mitigation in institutional models",
      },
    ],
    usedInAssignment: {
      passagesCount: 3,
      findingsCount: 2,
      citationsCount: 4,
      passages: [
        {
          text: "Autonomous auditing mandates ensure procedural due process across automated public agencies.",
          location: "Page 4, Paragraph 2",
          targetSection: "Literature Review",
        },
        {
          text: "Disparate impact metrics indicate systemic bias when training sets lack historical parity.",
          location: "Page 12, Paragraph 1",
          targetSection: "Empirical Analysis",
        },
      ],
      findings: [
        "Algorithmic decision-making systems require independent forensic audit standards.",
        "Pre-deployment impact assessments reduce institutional disparate impact by 42%.",
      ],
      citations: [
        "Smith, J. (2024). Empirical analysis of autonomous systems. Oxford University Press.",
        "(Smith, 2024)",
      ],
      mappedSections: ["Literature Review", "Empirical Analysis"],
    },
    processingStatus: "extracted",
  };

  it("renders the empty state dropzone when no files are uploaded", () => {
    render(
      <LectureUploadDropzone
        uploadedFiles={[]}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    expect(screen.getByText(/Drop lecture slides, syllabus, or readings here, or browse files/i)).toBeInTheDocument();
    // Single-click-to-browse pattern — split Add Web Link / Paste Notes buttons removed per UX refactor
    expect(screen.getByTestId("lecture-file-input")).toBeInTheDocument();
  });

  it("displays the uploaded item directly in the workspace Evidence Knowledge Panel with 3 distinct layers", () => {
    const onRemove = vi.fn();
    render(
      <LectureUploadDropzone
        uploadedFiles={[mockFile]}
        onUpload={vi.fn()}
        onRemove={onRemove}
        assignmentQuestion="Evaluate the impact of algorithmic governance."
      />
    );

    const panel = screen.getByTestId("uploaded-materials-list");
    expect(panel).toBeInTheDocument();

    // 1. Uploaded Material Layer
    expect(within(panel).getByText(/1. Uploaded Material/i)).toBeInTheDocument();
    expect(within(panel).getAllByText("Research_Paper.pdf").length).toBeGreaterThan(0);
    expect(within(panel).getAllByText(/Processed/i).length).toBeGreaterThan(0);
    expect(within(panel).getByText(/PDF Document/i)).toBeInTheDocument();

    // 2. Engine Extracted Layer
    expect(within(panel).getByText(/2. Engine Extracted/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Abstract:/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Key Findings:/i)).toBeInTheDocument();
    expect(within(panel).getByText(/Methodology:/i)).toBeInTheDocument();

    // 3. Used in Assignment Layer
    expect(within(panel).getByText(/3. Used in Assignment/i)).toBeInTheDocument();
    expect(within(panel).getByText(/3 relevant passages/i)).toBeInTheDocument();
    expect(within(panel).getByText(/2 findings/i)).toBeInTheDocument();
    expect(within(panel).getByText(/4 citations/i)).toBeInTheDocument();
  });

  it("allows clicking to expand and inspect extracted excerpts, locators, and assignment usage", () => {
    render(
      <LectureUploadDropzone
        uploadedFiles={[mockFile]}
        onUpload={vi.fn()}
        onRemove={vi.fn()}
      />
    );

    const inspectBtn = screen.getByRole("button", { name: /Inspect Details/i });
    expect(inspectBtn).toBeInTheDocument();
    fireEvent.click(inspectBtn);

    // Shows extracted details
    expect(screen.getByText(/Abstract & Source Overview/i)).toBeInTheDocument();
    expect(screen.getByText(/A comprehensive investigation of algorithmic governance/i)).toBeInTheDocument();
    expect(screen.getByText(/📍 Page 4, Paragraph 2/i)).toBeInTheDocument();
    expect(screen.getByText(/"Autonomous auditing mandates ensure procedural due process across automated public agencies."/i)).toBeInTheDocument();

    // Switch to "Used in Assignment" sub-tab
    const usedTabBtn = screen.getByRole("button", { name: /Used in Assignment/i });
    fireEvent.click(usedTabBtn);

    expect(screen.getByText(/Passages Mapped into Assignment Sections/i)).toBeInTheDocument();
    expect(screen.getByText(/Section: Literature Review/i)).toBeInTheDocument();
    expect(screen.getByText(/In-Text Citation Format/i)).toBeInTheDocument();
    expect(screen.getByText(/\(Smith, 2024\)/i)).toBeInTheDocument();
  });

  it("triggers onRemove when user clicks remove", () => {
    const onRemove = vi.fn();
    render(
      <LectureUploadDropzone
        uploadedFiles={[mockFile]}
        onUpload={vi.fn()}
        onRemove={onRemove}
      />
    );

    const removeBtn = screen.getByRole("button", { name: /Remove Research_Paper.pdf/i });
    fireEvent.click(removeBtn);
    expect(onRemove).toHaveBeenCalledWith("doc-test-1");
  });
});
