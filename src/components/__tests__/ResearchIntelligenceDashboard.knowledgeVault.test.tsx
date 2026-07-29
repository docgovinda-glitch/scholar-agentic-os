// @vitest-environment jsdom
//
// Sci-fi v3 Step 4 — Knowledge Vault size & utilization. The mockup showed
// "4.2 TB" and "82% Storage utilized" — the audit classified both (c)
// unbuildable at that scale: browser storage (localStorage/IndexedDB)
// cannot realistically reach terabytes for this app's real usage, and no
// meaningful storage quota exists to be a percentage of without a real,
// disclosed source. Real equivalent: the actual summed file size across
// project.knowledgeVault.files (KB/MB, whatever the true value is), and
// utilization ONLY via navigator.storage.estimate() — a real browser API
// — honestly reporting "not available" when the API doesn't exist or
// returns nothing usable, never a fabricated percentage.

import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ResearchIntelligenceDashboard from "../ResearchIntelligenceDashboard";
import { DEFAULT_STATE, PaperProject, VaultFile } from "../../types";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function renderDashboard(project: PaperProject) {
  const props = {
    project,
    projects: [project],
    onSelectProject: vi.fn(),
    onCreateProject: vi.fn(),
    onDeleteProject: vi.fn(),
    onNavigateToPhase: vi.fn(),
  };
  render(<ResearchIntelligenceDashboard {...props} />);
  return props;
}

function makeVaultFile(fileSize: number, overrides: Partial<VaultFile> = {}): VaultFile {
  return {
    id: `f-${fileSize}`, fileName: "doc.pdf", fileType: "pdf", fileSize,
    uploadedAt: new Date().toISOString(), isActive: true, status: "ready",
    extractedText: "", chunks: [], charCount: 0, ...overrides
  };
}

describe("ResearchIntelligenceDashboard — Knowledge Vault size (real file bytes, never a fabricated TB figure)", () => {
  it("shows the real summed byte size of the vault's own files, at a real (small) scale", async () => {
    const project: PaperProject = {
      ...DEFAULT_STATE("jdoe"),
      knowledgeVault: { lastUpdated: new Date().toISOString(), files: [makeVaultFile(500_000), makeVaultFile(1_500_000)] }
    };
    renderDashboard(project);

    expect(await screen.findByText(/knowledge vault/i)).toBeInTheDocument();
    // 2,000,000 bytes total -> should render as a real KB/MB figure, never "4.2 TB"
    expect(screen.queryByText(/TB/)).not.toBeInTheDocument();
    expect(screen.getByText(/1\.9\s*MB|2\.0\s*MB/i)).toBeInTheDocument();
  });

  it("shows an honest zero, not a placeholder, when the vault has no files", async () => {
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), knowledgeVault: { lastUpdated: new Date().toISOString(), files: [] } };
    renderDashboard(project);
    expect(await screen.findByText(/0\s*(B|KB|MB)/i)).toBeInTheDocument();
  });
});

describe("ResearchIntelligenceDashboard — storage utilization (real navigator.storage.estimate() only, never a fabricated percentage)", () => {
  it("shows a real, computed percentage when navigator.storage.estimate() genuinely resolves", async () => {
    vi.stubGlobal("navigator", {
      ...navigator,
      storage: { estimate: vi.fn().mockResolvedValue({ usage: 25_000_000, quota: 100_000_000 }) }
    });
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), knowledgeVault: { lastUpdated: new Date().toISOString(), files: [] } };
    renderDashboard(project);

    await waitFor(() => expect(screen.getByText(/25%/)).toBeInTheDocument());
  });

  it("honestly reports storage estimation as unavailable rather than fabricating a percentage when the API doesn't exist", async () => {
    vi.stubGlobal("navigator", { ...navigator, storage: undefined });
    const project: PaperProject = { ...DEFAULT_STATE("jdoe"), knowledgeVault: { lastUpdated: new Date().toISOString(), files: [] } };
    renderDashboard(project);

    expect(await screen.findByText(/not available/i)).toBeInTheDocument();
    expect(screen.queryByText("82%")).not.toBeInTheDocument();
  });
});
