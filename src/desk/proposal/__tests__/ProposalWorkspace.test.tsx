/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProposalWorkspace from "../ProposalWorkspace";

describe("ProposalWorkspace (OT-19 Grant & Research Proposal Engine)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/proposal/audit-aims")) {
        return new Response(
          JSON.stringify({
            projectId: "proj-proposal-1",
            checks: [
              {
                name: "Central Hypothesis Testability",
                status: "passed",
                detail: "Directional hypothesis contains falsifiable empirical outcomes.",
              },
              {
                name: "Aim Independence & Decoupling",
                status: "passed",
                detail: "Specific Aims evaluated for sequential dependency risk.",
              },
            ],
            auditedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/proposal/simulate-review")) {
        return new Response(
          JSON.stringify({
            projectId: "proj-proposal-1",
            agency: "NSF / NIH Joint Informatics Program",
            mechanism: "R01 / CAREER Grant Track",
            overallImpactScore: "18 (2.0 NIH Scale — High Impact / Fundable Tier)",
            recommendationForFunding: "High Priority for Funding (Top 8th Percentile)",
            criteria: [
              {
                criterion: "Significance",
                score: 2,
                verdict: "Outstanding",
                critique: "Addresses an urgent empirical bottleneck in scientific reproducibility.",
                recommendation: "Quantify projected cost savings for large-scale biomedical meta-analyses.",
              },
              {
                criterion: "Approach",
                score: 2,
                verdict: "Strong",
                critique: "Three-aim structure is well-isolated with clear statistical power.",
                recommendation: "Add contingency mitigation if Aim 2 latency exceeds 500ms.",
              },
            ],
            auditedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          project: {
            id: "proj-proposal-1",
            title: "Empirical Grant Architecture Study",
            intakeAnswers: {
              fundingAgency: "NSF / NIH Joint Informatics Program",
              mechanism: "R01 / CAREER Grant Track",
              targetBudgetUSD: 1250000,
              projectDurationMonths: 36,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
  });

  it("renders Specific Aims Executive Page with clean Zero-Ghost onboarding and switches grant stages", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    expect(
      screen.getByRole("heading", { name: /Specific Aims Executive Page/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("apple-studio-header")).toBeInTheDocument();

    const genBtn = screen.getByTestId("generate-structured-blueprint-btn");
    fireEvent.click(genBtn);
    expect(screen.getByText(/3 Aims Formulated/i)).toBeInTheDocument();

    // Switch to Agency & Rubric
    fireEvent.click(screen.getByRole("button", { name: /1\. Agency & Rubric/i }));
    expect(
      screen.getByRole("heading", { name: /1\. Funding Agency & Rubric Alignment/i })
    ).toBeInTheDocument();

    // Switch to Significance & Innovation
    fireEvent.click(screen.getByRole("button", { name: /4\. Significance & Innovation/i }));
    expect(
      screen.getByRole("heading", { name: /Significance & Innovation/i })
    ).toBeInTheDocument();

    // Switch to Budget & Resources
    fireEvent.click(screen.getByRole("button", { name: /6\. Budget & Resources/i }));
    expect(
      screen.getByRole("heading", { name: /Budget Justification & Resource Breakdown/i })
    ).toBeInTheDocument();
  });

  it("executes Specific Aims compliance audit against backend endpoint", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const auditBtn = screen.getByRole("button", { name: /Audit Aims Structure/i });
    fireEvent.click(auditBtn);

    await waitFor(() => {
      expect(screen.getByText(/Specific Aims Compliance Check/i)).toBeInTheDocument();
      expect(screen.getByText(/Central Hypothesis Testability/i)).toBeInTheDocument();
    });
  });

  it("runs Study Section adversarial review simulation and displays impact score", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    fireEvent.click(screen.getByRole("button", { name: /8\. Study Section Scorer/i }));

    const simBtn = screen.getByRole("button", { name: /Run Study Section Simulation/i });
    fireEvent.click(simBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/18 \(2\.0 NIH Scale — High Impact \/ Fundable Tier\)/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/High Priority for Funding \(Top 8th Percentile\)/i)
      ).toBeInTheDocument();
    });
  });
});
