// @vitest-environment jsdom
//
// Fabrication fix, found while implementing the sci-fi v3 dashboard rebuild
// (docs/planning/dashboard-mockup-honest-data-audit.md, Step 4): this
// component's "Scholar Alerts" panel showed 3 hardcoded fake notifications
// ("Vedic Database sync complete...", "Gemini 3.5 latency spike
// detected...") UNCONDITIONALLY, regardless of the real project's actual
// state — and its "Cached Vault Citations" sidebar showed 3 entirely
// fabricated references that were never uploaded by the user. Neither was
// named in the mockup audit (they predate the mockup), but both are the
// exact class of problem this project's fabrication discipline exists to
// catch, discovered directly while working on this file. Fixed here:
// alerts are now derived from real signals (vault file processing errors,
// real recent activity), honestly empty when there's nothing real to show;
// cached citations are now real vault files with real citationMetadata,
// formatted via the already-shipped generateCitation() service.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchIntelligenceDashboard from "../ResearchIntelligenceDashboard";
import { DEFAULT_STATE, PaperProject, VaultFile } from "../../types";

afterEach(() => {
  cleanup();
});

function makeProject(overrides: Partial<PaperProject> = {}): PaperProject {
  return { ...DEFAULT_STATE("jdoe"), title: "Test Dissertation", field: "Philosophy", ...overrides };
}

function renderDashboard(overrides: Partial<React.ComponentProps<typeof ResearchIntelligenceDashboard>> = {}) {
  const project = makeProject();
  const props = {
    project,
    projects: [project],
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onNavigateToPhase: vi.fn(),
    ...overrides
  };
  render(<ResearchIntelligenceDashboard {...props} />);
  return props;
}

describe("ResearchIntelligenceDashboard — Scholar Alerts must never show fabricated content", () => {
  it("shows an honest empty state, not the old hardcoded notifications, when there is no real recent activity", () => {
    renderDashboard();
    expect(screen.queryByText(/Vedic Database sync complete/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Gemini 3.5 latency spike detected/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Draft check: 'Literature Review'/i)).not.toBeInTheDocument();
    expect(screen.getByText(/no alerts yet/i)).toBeInTheDocument();
  });

  it("surfaces a real alert when a vault file genuinely failed to process", () => {
    const vaultFile: VaultFile = {
      id: "f1",
      fileName: "corrupted-scan.pdf",
      fileType: "pdf",
      fileSize: 1024,
      uploadedAt: new Date().toISOString(),
      isActive: true,
      status: "error",
      extractedText: "",
      errorMessage: "Could not parse PDF text layer",
      chunks: [],
      charCount: 0
    };
    const project = makeProject({ knowledgeVault: { files: [vaultFile], lastUpdated: new Date().toISOString() } });
    renderDashboard({ project, projects: [project] });

    expect(screen.getByText(/corrupted-scan\.pdf/i)).toBeInTheDocument();
    expect(screen.queryByText(/no alerts yet/i)).not.toBeInTheDocument();
  });
});

describe("ResearchIntelligenceDashboard — Cached Vault Citations must reflect real uploaded documents", () => {
  it("shows an honest empty state, not the 3 fabricated references, when no vault files have real citation metadata", () => {
    renderDashboard();
    fireEvent.click(screen.getByText("Citations Vault"));

    expect(screen.queryByText(/Smith, J\. A\., & Doe, R\. B\./)).not.toBeInTheDocument();
    expect(screen.queryByText(/Vedic Construct Mapping Consortium/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Johnson, K\. L\./)).not.toBeInTheDocument();
    expect(screen.getByText(/no cached citations yet/i)).toBeInTheDocument();
  });

  it("renders a real formatted citation for a vault file that genuinely has citation metadata", () => {
    const vaultFile: VaultFile = {
      id: "f2",
      fileName: "real-source.pdf",
      fileType: "pdf",
      fileSize: 2048,
      uploadedAt: new Date().toISOString(),
      isActive: true,
      status: "ready",
      extractedText: "some text",
      chunks: [],
      charCount: 9,
      citationMetadata: {
        sourceType: "journal-article",
        title: "A Genuinely Uploaded Source",
        authors: [{ firstName: "Ada", lastName: "Lovelace" }],
        dates: { publicationDate: "2024-01-01" },
        publicationDetails: { journalName: "Journal of Real Data" },
        identifiers: {}
      } as any
    };
    const project = makeProject({ knowledgeVault: { files: [vaultFile], lastUpdated: new Date().toISOString() } });
    renderDashboard({ project, projects: [project] });
    fireEvent.click(screen.getByText("Citations Vault"));

    expect(screen.getByText(/A Genuinely Uploaded Source/)).toBeInTheDocument();
    expect(screen.getAllByText(/Lovelace/).length).toBeGreaterThan(0);
  });
});
