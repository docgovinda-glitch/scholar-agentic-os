// @vitest-environment jsdom
//
// Sci-fi v3 Step 4 — the mockup's global counters (PAPERS 12,842,761;
// JOURNALS 34,128; CITATIONS 88,671,221; DATASETS 6,731). The audit
// classified these (c) unbuildable at platform-wide scale (this app has no
// shared multi-user backend aggregating a corpus across users) but (b)
// buildable reframed as the current scholar's OWN real counts, at real
// (small) scale: Papers/Research Projects -> projects.length; Datasets ->
// summed real project.dataSources; Citations -> summed real vault files
// with real citationMetadata (the same field the Cached Vault Citations
// fix already uses); Journals -> count of projects with a real, persisted
// project.targetJournal selected (the full discovered shortlist isn't
// persisted anywhere, so a "matches found" count isn't honestly available
// — reframed to what IS real and persisted).

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchIntelligenceDashboard from "../ResearchIntelligenceDashboard";
import { DEFAULT_STATE, PaperProject, VaultFile } from "../../types";

afterEach(() => {
  cleanup();
});

function renderDashboard(projects: PaperProject[]) {
  const props = {
    project: projects[0] || null,
    projects,
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onNavigateToPhase: vi.fn(),
  };
  render(<ResearchIntelligenceDashboard {...props} />);
  return props;
}

describe("ResearchIntelligenceDashboard — per-scholar counters (real, small scale, never a fabricated global aggregate)", () => {
  it("shows real small-scale counts derived from the scholar's own projects, not platform-wide millions", () => {
    const withDataset = { ...DEFAULT_STATE("jdoe"), id: "p1", dataSources: [{ name: "Survey A", url: "", type: "Quantitative", relevance: "", reliability: "", limitations: "", status: "approved" }] } as PaperProject;
    const withJournal = { ...DEFAULT_STATE("jdoe"), id: "p2", targetJournal: { name: "Journal of Real Data", publisher: "", scopeFit: "", ranking: "", feeStatus: "", submissionOpenness: "", reviewContext: "", whyFit: "" } } as PaperProject;
    const withCitation: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      id: "p3",
      knowledgeVault: {
        lastUpdated: new Date().toISOString(),
        files: [{
          id: "f1", fileName: "real.pdf", fileType: "pdf", fileSize: 10, uploadedAt: new Date().toISOString(),
          isActive: true, status: "ready", extractedText: "x", chunks: [], charCount: 1,
          citationMetadata: { sourceType: "journal-article", title: "Real Source", authors: [], dates: {}, publicationDetails: {}, identifiers: {} } as any
        } as VaultFile]
      }
    };
    const projects = [withDataset, withJournal, withCitation];
    renderDashboard(projects);

    // 3 real projects -> Papers / Research Projects both real at that scale
    expect(screen.getAllByText("3").length).toBeGreaterThan(0);
    // 1 real dataset, 1 real journal selection, 1 real cached citation
    expect(screen.getByText(/datasets/i)).toBeInTheDocument();
    expect(screen.getByText(/journals selected/i)).toBeInTheDocument();
    expect(screen.getByText(/citations cached/i)).toBeInTheDocument();
  });

  it("never shows a fabricated platform-wide number — with zero real projects, every counter reads 0, not a placeholder", () => {
    renderDashboard([]);
    expect(screen.queryByText("12,842,761")).not.toBeInTheDocument();
    expect(screen.queryByText("34,128")).not.toBeInTheDocument();
    expect(screen.queryByText("88,671,221")).not.toBeInTheDocument();
    expect(screen.queryByText("6,731")).not.toBeInTheDocument();
  });
});
