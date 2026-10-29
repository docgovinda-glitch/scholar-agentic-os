// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import Step01Scaffolding from "../Step01Scaffolding";
import type { SlideDeck } from "../../types/slides";

const mockDeck: SlideDeck = {
  id: "deck-1",
  title: "Autonomous Knowledge Synthesis",
  topic: "Autonomous Knowledge Grounding",
  slides: [
    {
      id: "s1",
      order: 1,
      universalBeat: "hook",
      layoutType: "metric-focus",
      actionHeadline: "Cryptographic Provenance Eliminates 99.8% of Agent Hallucinations",
      subtitle: "Empirical baseline verification across 10,000 papers",
      speakerNotes: "Welcome everyone. Today we examine how deterministic consensus removes stochastic drift.",
      blocks: [
        {
          type: "metric-callout",
          value: "99.8%",
          label: "Zero-Hallucination Threshold",
        },
      ],
      cognitiveLoadScore: 2,
    },
    {
      id: "s2",
      order: 2,
      universalBeat: "tension",
      layoutType: "bullets",
      actionHeadline: "Stochastic Multi-Agent Systems Degrade Exponentially Without Grounding",
      subtitle: "Current failure modes in recursive reasoning loops",
      speakerNotes: "Before introducing our protocol, consider the failure cascade of unanchored LLM swarms.",
      blocks: [
        {
          type: "bullet-list",
          items: [
            "Compounding drift across recursive hops",
            "Latent attribution errors",
            "Zero formal verification guarantees",
          ],
        },
      ],
      cognitiveLoadScore: 3,
    },
  ],
};

describe("Step01Scaffolding (Document Upload & Coursework Intake)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it("renders the 2 clean intake modes: Enter Topic or Question and Upload Document", () => {
    render(
      <Step01Scaffolding
        deck={mockDeck}
        onUpdateDeck={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    expect(screen.getByRole("button", { name: /Enter Topic or Question/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Upload Document \(/i })).toBeInTheDocument();
  });

  it("renders Coursework-style drag-and-drop dropzone when Upload Document tab is selected", () => {
    render(
      <Step01Scaffolding
        deck={mockDeck}
        onUpdateDeck={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    // Switch to Upload tab
    const uploadTab = screen.getByRole("button", { name: /Upload Document \(/i });
    fireEvent.click(uploadTab);

    expect(
      screen.getByText(/Upload your coursework brief, paper, or research draft/i)
    ).toBeInTheDocument();
    expect(screen.getByText(/Drag and drop your file here/i)).toBeInTheDocument();
    expect(screen.getByText("PDF")).toBeInTheDocument();
    expect(screen.getByText("DOCX")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Select Document File/i })).toBeInTheDocument();
  });

  it("processes uploaded text/markdown file, derives topic, and builds cards from its sections", async () => {
    const handleUpdate = vi.fn();
    render(
      <Step01Scaffolding
        deck={mockDeck}
        onUpdateDeck={handleUpdate}
        onNextStep={vi.fn()}
      />
    );

    // Switch to Upload tab
    fireEvent.click(screen.getByRole("button", { name: /Upload Document \(/i }));

    const fileContent = `# Neural Quantum Cryptography\n\n## Abstract\nQuantum key distribution achieves 99.8% resilience against Shor attacks.`;
    const file = new File([fileContent], "quantum_cryptography.md", { type: "text/markdown" });

    // Mock file.text()
    file.text = vi.fn().mockResolvedValue(fileContent);

    const input = screen.getByTestId("presentation-file-input");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalled();
    });

    const updatedDeck = handleUpdate.mock.calls[0][0];
    // One card per section of the document plus a title card; no filler slides.
    expect(updatedDeck.slides.length).toBe(2);
    expect(updatedDeck.slides[0].layoutType).toBe("title");
    // The figure on the stat card is the one in the document.
    expect(JSON.stringify(updatedDeck.slides[1].content.stats)).toContain("99.8%");
    expect(screen.getByText("quantum_cryptography.md")).toBeInTheDocument();
    expect(screen.getByText(/words extracted/i)).toBeInTheDocument();
  });

  it("supports document removal and clearing uploaded file state", async () => {
    render(
      <Step01Scaffolding
        deck={mockDeck}
        onUpdateDeck={vi.fn()}
        onNextStep={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Upload Document \(/i }));

    const fileContent = "Brief text describing corporate restructuring under monetary shocks.";
    const file = new File([fileContent], "brief.txt", { type: "text/plain" });
    file.text = vi.fn().mockResolvedValue(fileContent);

    const input = screen.getByTestId("presentation-file-input");
    fireEvent.change(input, { target: { files: [file] } });

    await waitFor(() => {
      expect(screen.getByText("brief.txt")).toBeInTheDocument();
    });

    // Click remove button
    const removeBtn = screen.getByTitle("Remove file");
    fireEvent.click(removeBtn);

    expect(screen.queryByText("brief.txt")).not.toBeInTheDocument();
    expect(screen.getByText(/Upload your coursework brief, paper, or research draft/i)).toBeInTheDocument();
  });

  it("invokes backend /api/presentations/parse-document when a PDF file is uploaded", async () => {
    const handleUpdate = vi.fn();
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        text: "Extracted PDF content regarding Biomedical Ethics in Gene Editing with 42% faster trials.",
        detectedTitle: "Biomedical Ethics in Autonomous Gene Editing",
        wordCount: 1450,
        fileName: "ethics_paper.pdf",
      }),
    });

    render(
      <Step01Scaffolding
        deck={mockDeck}
        onUpdateDeck={handleUpdate}
        onNextStep={vi.fn()}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: /Upload Document \(/i }));

    const pdfFile = new File(["dummy binary"], "ethics_paper.pdf", { type: "application/pdf" });
    const input = screen.getByTestId("presentation-file-input");
    fireEvent.change(input, { target: { files: [pdfFile] } });

    await waitFor(() => {
      expect(global.fetch).toHaveBeenCalledWith(
        "/api/presentations/parse-document",
        expect.objectContaining({ method: "POST" })
      );
    });

    await waitFor(() => {
      expect(handleUpdate).toHaveBeenCalled();
      expect(screen.getByText("ethics_paper.pdf")).toBeInTheDocument();
    });
  });
});
