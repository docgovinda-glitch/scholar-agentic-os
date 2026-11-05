// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ScientificConsensusGauge, { computeConsensusFromCitations } from "../ScientificConsensusGauge";

describe("ScientificConsensusGauge & Consensus Meter (Phase 3)", () => {
  afterEach(() => {
    cleanup();
  });

  const CITATIONS = [
    { title: "Study 1", stance: "supporting" as const },
    { title: "Study 2", stance: "supporting" as const },
    { title: "Study 3", stance: "supporting" as const },
    { title: "Study 4", stance: "contradicting" as const },
  ];

  it("computes consensus levels accurately based on empirical citations", () => {
    const metrics = computeConsensusFromCitations(CITATIONS);
    expect(metrics).not.toBeNull();
    expect(metrics?.totalStudies).toBe(4);
    expect(metrics?.supportingCount).toBe(3);
    expect(metrics?.contradictingCount).toBe(1);
    expect(metrics?.agreementScore).toBe(75);
    expect(metrics?.level).toBe("emerging");
  });

  it("identifies strong consensus when >= 80% agreement across studies", () => {
    const strongCitations = [
      { title: "Study 1", stance: "supporting" as const },
      { title: "Study 2", stance: "supporting" as const },
      { title: "Study 3", stance: "supporting" as const },
      { title: "Study 4", stance: "supporting" as const },
    ];
    const metrics = computeConsensusFromCitations(strongCitations);
    expect(metrics?.level).toBe("strong");
    expect(metrics?.agreementScore).toBe(100);
  });

  it("identifies polarized debate when multiple contradictory trials exist", () => {
    const polarizedCitations = [
      { title: "Study 1", stance: "supporting" as const },
      { title: "Study 2", stance: "contradicting" as const },
      { title: "Study 3", stance: "contradicting" as const },
    ];
    const metrics = computeConsensusFromCitations(polarizedCitations);
    expect(metrics?.level).toBe("polarized");
    expect(metrics?.agreementScore).toBeLessThan(70);
  });

  it("renders gauge UI, agreement percentage, and toggles breakdown", () => {
    render(<ScientificConsensusGauge citations={CITATIONS} />);

    expect(screen.getByTestId("scientific-consensus-gauge")).toBeInTheDocument();
    expect(screen.getByText(/Emerging Consensus \(75%\)/i)).toBeInTheDocument();
    expect(screen.getByText(/4 evaluated studies/i)).toBeInTheDocument();

    // Toggle Breakdown
    const toggleBtn = screen.getByText(/Inspect Agreement Breakdown/i);
    fireEvent.click(toggleBtn);

    expect(screen.getByText("3 Supporting")).toBeInTheDocument();
    expect(screen.getByText("1 Divergent")).toBeInTheDocument();
    expect(screen.getByText("Hide Breakdown")).toBeInTheDocument();
  });

  it("renders null when citations are empty", () => {
    const { container } = render(<ScientificConsensusGauge citations={[]} />);
    expect(container.firstChild).toBeNull();
  });
});

