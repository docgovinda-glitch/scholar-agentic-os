// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import LiteratureDiscoveryWorkspace from "../discovery/LiteratureDiscoveryWorkspace";

describe("LiteratureDiscoveryWorkspace", () => {
  const sampleSeeds = [
    {
      id: "paper-1",
      title: "Deep Reinforcement Learning from Human Feedback",
      authors: ["Christiano, P.", "Leike, J."],
      year: 2017,
      journal: "NeurIPS",
      citationCount: 1500,
      doi: "10.48550/arXiv.1706.03741",
      abstract: "Training reward models using human preference pairwise rankings.",
    },
    {
      id: "paper-2",
      title: "Direct Preference Optimization: Your Language Model is Secretly a Reward Model",
      authors: ["Rafailov, R.", "Sharma, A."],
      year: 2023,
      journal: "NeurIPS",
      citationCount: 450,
      doi: "10.48550/arXiv.2305.18290",
      abstract: "Closed-form exact implicit reward optimization without separate RL policy.",
    },
  ];

  it("renders the literature discovery workspace with header, canvas, and nodes", () => {
    render(
      <LiteratureDiscoveryWorkspace
        projectId="test-proj-1"
        seedPapers={sampleSeeds}
      />
    );

    expect(screen.getByText("Literature Discovery Workspace")).toBeInTheDocument();
    expect(screen.getByText(/Layer B · Citation Graph/i)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Filter graph papers...")).toBeInTheDocument();
    expect(screen.getByText("Snowball Selected Node")).toBeInTheDocument();
  });

  it("displays paper details in the side inspector panel", () => {
    render(
      <LiteratureDiscoveryWorkspace
        projectId="test-proj-1"
        seedPapers={sampleSeeds}
      />
    );

    expect(screen.getByText("Deep Reinforcement Learning from Human Feedback")).toBeInTheDocument();
    expect(screen.getByText(/Christiano, P., Leike, J./i)).toBeInTheDocument();
    expect(screen.getByText(/Training reward models using human preference/i)).toBeInTheDocument();
  });

  it("allows selecting papers for evidence synthesis and calls callback", () => {
    const onOpenEvidenceSynthesis = vi.fn();
    render(
      <LiteratureDiscoveryWorkspace
        projectId="test-proj-1"
        seedPapers={sampleSeeds}
        onOpenEvidenceSynthesis={onOpenEvidenceSynthesis}
      />
    );

    // Click "Include in Evidence Synthesis"
    const includeBtn = screen.getByText("Include in Evidence Synthesis");
    fireEvent.click(includeBtn);

    expect(screen.getByText("Included in Evidence Synthesis")).toBeInTheDocument();

    // Click "Synthesize Evidence"
    const synthBtn = screen.getByText(/Synthesize Evidence/i);
    fireEvent.click(synthBtn);

    expect(onOpenEvidenceSynthesis).toHaveBeenCalledTimes(1);
    expect(onOpenEvidenceSynthesis.mock.calls[0][0][0].title).toBe(
      "Deep Reinforcement Learning from Human Feedback"
    );
  });

  it("filters papers via search query input", () => {
    render(
      <LiteratureDiscoveryWorkspace
        projectId="test-proj-1"
        seedPapers={sampleSeeds}
      />
    );

    const searchInput = screen.getByPlaceholderText("Filter graph papers...");
    fireEvent.change(searchInput, { target: { value: "Direct Preference" } });

    expect(searchInput).toHaveValue("Direct Preference");
  });
});
