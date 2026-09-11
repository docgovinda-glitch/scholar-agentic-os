// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import LiteratureMatrixModal from "../LiteratureMatrixModal";
import type { VaultItem } from "../../../services/vaultContents";

describe("LiteratureMatrixModal", () => {
  const mockItems: VaultItem[] = [
    {
      id: "item-1",
      title: "Neural Scaling Laws for Agent Reasoning",
      content: "This paper measures compute vs accuracy trade-offs.",
      authors: ["Sarah Connor", "John Reese"],
      year: "2024",
      journal: "AI Journal",
      sourceType: "file",
      citation: "Connor, S., & Reese, J. (2024). Neural Scaling Laws.",
      tags: ["Scaling", "Agents"],
      metadata: {
        keyPoints: ["Model performance scales logarithmically with test-time compute."],
        notes: { whySaved: "Core hypothesis reference" },
      },
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    {
      id: "item-2",
      title: "Empirical Limits of Test-Time Search",
      content: "An empirical evaluation of beam search and MCTS in LLM reasoning.",
      authors: ["Miles Dyson"],
      year: "2023",
      sourceType: "file",
      citation: "Dyson, M. (2023). Empirical Limits of Test-Time Search.",
      tags: ["Search", "Limits"],
      metadata: {
        keyPoints: ["Search benefits diminish beyond depth 6."],
        notes: { whySaved: "Counter-argument to naive scaling" },
      },
      createdAt: "2026-01-02T00:00:00.000Z",
    },
  ];

  beforeEach(() => {
    Object.assign(navigator, {
      clipboard: {
        writeText: vi.fn().mockResolvedValue(undefined),
      },
    });
  });

  it("renders matrix with sources count and comparative table", () => {
    render(<LiteratureMatrixModal items={mockItems} activeProject="AI-Safety" onClose={vi.fn()} />);

    expect(screen.getByText("Literature Review Synthesis Matrix")).toBeInTheDocument();
    expect(screen.getByText(/2\s+Sources/)).toBeInTheDocument();
    expect(screen.getByText("📁 AI-Safety")).toBeInTheDocument();

    // Table rows
    expect(screen.getByText("Connor & Reese (2024)")).toBeInTheDocument();
    expect(screen.getByText("Dyson (2023)")).toBeInTheDocument();
    expect(screen.getByText(/Model performance scales logarithmically/)).toBeInTheDocument();
  });

  it("switches to Thematic Synthesis Narrative tab and copies narrative", async () => {
    render(<LiteratureMatrixModal items={mockItems} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Thematic Synthesis Narrative/ }));

    expect(screen.getByText("Publication-Ready Thematic Overview")).toBeInTheDocument();
    expect(screen.getByText(/Thematic Synthesis & Literature Overview/)).toBeInTheDocument();

    const copyBtn = screen.getByRole("button", { name: /Copy Literature Review Text/ });
    fireEvent.click(copyBtn);

    expect(navigator.clipboard.writeText).toHaveBeenCalled();
    await screen.findByText("✓ Copied to Clipboard");
  });

  it("switches to Ask Selected Sources tab and synthesizes answer with attribution", async () => {
    render(<LiteratureMatrixModal items={mockItems} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("button", { name: /Ask Selected Sources/ }));

    expect(screen.getByText("⚡ Quick Analytical Presets:")).toBeInTheDocument();

    // Click preset
    fireEvent.click(screen.getByRole("button", { name: /Compare Methodologies/ }));

    await waitFor(() => {
      expect(screen.getByText(/Grounded Synthesis for/)).toBeInTheDocument();
    });

    expect(screen.getAllByText(/Connor & Reese \(2024\)/).length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText(/Dyson \(2023\)/).length).toBeGreaterThanOrEqual(1);
  });

  it("triggers onClose when close button clicked", () => {
    const onClose = vi.fn();
    render(<LiteratureMatrixModal items={mockItems} onClose={onClose} />);

    fireEvent.click(screen.getAllByRole("button", { name: /Close/i })[0]);
    expect(onClose).toHaveBeenCalled();
  });
});
