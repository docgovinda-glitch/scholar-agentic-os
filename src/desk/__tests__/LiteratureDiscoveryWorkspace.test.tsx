// @vitest-environment jsdom
import React from "react";
import { describe, it, expect } from "vitest";
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

  it("offers no evidence-synthesis hand-off and never invents a citation count", () => {
    const unscored = { title: sampleSeeds[0].title, authors: sampleSeeds[0].authors, year: sampleSeeds[0].year };
    render(<LiteratureDiscoveryWorkspace projectId="test-proj-1" seedPapers={[unscored]} />);

    expect(screen.queryByText(/Synthesize Evidence/i)).toBeNull();
    expect(screen.queryByText(/Include in Evidence Synthesis/i)).toBeNull();
    // No count from the index: the inspector says so instead of showing a number.
    expect(screen.getByText("Not reported")).toBeInTheDocument();
  });

  it("starts empty rather than with demo papers when no sources are given", () => {
    render(<LiteratureDiscoveryWorkspace projectId="test-proj-1" />);
    expect(screen.queryByText(/Deep Empirical Foundations/i)).toBeNull();
    expect(screen.queryByText(/Causal Inference and Empirical Counterfactual/i)).toBeNull();
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
