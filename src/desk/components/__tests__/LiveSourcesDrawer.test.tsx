// @vitest-environment jsdom

import React from "react";
import { describe, it, expect } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import LiveSourcesDrawer from "../LiveSourcesDrawer";
import type { LiveSearchResult } from "../../../services/liveSearchService";

describe("LiveSourcesDrawer UI Component", () => {
  const mockSources: LiveSearchResult[] = [
    {
      title: "Quantum Magnetometry in Living Cells",
      url: "https://doi.org/10.1038/s41586-024-00123-x",
      snippet: "Demonstrated nanoscale field detection using optically detected magnetic resonance.",
      publicationDate: "2024-04-12",
      authors: ["Dr. Jane Doe", "Prof. John Smith"],
      source: "openalex",
    },
    {
      title: "Wikipedia: Quantum Computing",
      url: "https://en.wikipedia.org/wiki/Quantum_computing",
      snippet: "Quantum computing is a rapidly-emerging technology that harnesses the laws of quantum mechanics.",
      authors: ["Wikipedia Contributors"],
      source: "wikipedia",
    },
  ];

  it("renders nothing when sources array is empty or undefined", () => {
    const { container: c1 } = render(<LiveSourcesDrawer sources={[]} />);
    expect(c1.firstChild).toBeNull();

    const { container: c2 } = render(<LiveSourcesDrawer />);
    expect(c2.firstChild).toBeNull();
  });

  it("renders collapsed header by default with source count and aria attributes", () => {
    render(<LiveSourcesDrawer sources={mockSources} />);

    const button = screen.getByRole("button", { name: /Sources \(2\)/i });
    expect(button).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText(/Sources \(2\)/i)).toBeInTheDocument();
    expect(screen.getByText("Show")).toBeInTheDocument();

    // Source cards should not be visible when collapsed
    expect(screen.queryByText("Quantum Magnetometry in Living Cells")).not.toBeInTheDocument();
  });

  it("expands to reveal source cards, URLs, snippets, and authors upon click", () => {
    render(<LiveSourcesDrawer sources={mockSources} />);

    const button = screen.getByRole("button", { name: /Sources \(2\)/i });
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("Hide")).toBeInTheDocument();

    // Verify paper 1
    const link1 = screen.getByRole("link", { name: /Quantum Magnetometry in Living Cells/i });
    expect(link1).toBeInTheDocument();
    expect(link1).toHaveAttribute("href", "https://doi.org/10.1038/s41586-024-00123-x");
    expect(link1).toHaveAttribute("target", "_blank");
    expect(link1).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.getByText(/Demonstrated nanoscale field detection/i)).toBeInTheDocument();
    expect(screen.getByText(/Dr. Jane Doe, Prof. John Smith/i)).toBeInTheDocument();
    expect(screen.getByText("2024-04-12")).toBeInTheDocument();
    expect(screen.getByText("openalex")).toBeInTheDocument();

    // Verify paper 2 (Wikipedia)
    const link2 = screen.getByRole("link", { name: /Wikipedia: Quantum Computing/i });
    expect(link2).toBeInTheDocument();
    expect(link2).toHaveAttribute("href", "https://en.wikipedia.org/wiki/Quantum_computing");
    expect(screen.getByText("wikipedia")).toBeInTheDocument();
  });

  it("numbers each source to match the [n] markers in the answer and shows when it searched", () => {
    render(<LiveSourcesDrawer sources={mockSources} searchedAt="09:40" initialExpanded />);
    expect(screen.getByText("Searched at 09:40")).toBeInTheDocument();
    expect(screen.getByLabelText("Source 1")).toHaveTextContent("[1]");
    expect(screen.getByLabelText("Source 2")).toHaveTextContent("[2]");
  });

  it("toggles back to collapsed state on second click", () => {
    render(<LiveSourcesDrawer sources={mockSources} initialExpanded={true} />);

    expect(screen.getByText("Hide")).toBeInTheDocument();
    expect(screen.getByText("Quantum Magnetometry in Living Cells")).toBeInTheDocument();

    const button = screen.getByRole("button", { name: /Sources \(2\)/i });
    fireEvent.click(button);

    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByText("Show")).toBeInTheDocument();
    expect(screen.queryByText("Quantum Magnetometry in Living Cells")).not.toBeInTheDocument();
  });
});
