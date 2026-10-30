/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProposalWorkspace from "../ProposalWorkspace";

describe("ProposalWorkspace (OT-19 Grant & Research Proposal Engine)", () => {
  let failNext = false;
  beforeEach(() => {
    failNext = false;
    vi.restoreAllMocks();
    vi.spyOn(window, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      // Mocks follow the real server routes and response shapes. The old mocks
      // used paths the server never had (/audit-aims, /simulate-review), so in
      // production the workspace always fell back to hardcoded results (P0-9).
      if (url.includes("/proposal/aims-audit")) {
        if (failNext) {
          return new Response(JSON.stringify({ error: "Specific aims audit could not be generated: the AI provider failed or returned an unusable answer. Nothing was produced. Try again.", code: "ai_unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
        }
        return new Response(
          JSON.stringify({
            success: true,
            checks: [
              { name: "Central Hypothesis Testability", status: "warn", detail: "The hypothesis is descriptive." },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/proposal/study-section-simulate")) {
        if (failNext) {
          return new Response(JSON.stringify({ error: "Connect an AI provider (your own key or a local model) in AI Access to run this.", code: "ai_provider_required" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        return new Response(
          JSON.stringify({
            success: true,
            title: "Empirical Grant Architecture Study",
            agency: "NSF / NIH Joint Informatics Program",
            mechanism: "R01 / CAREER Grant Track",
            overallImpactScore: "3.4",
            recommendationForFunding: "Revise and resubmit",
            studySectionMembers: [],
            criteria: [
              { criterion: "Significance", score: 3, verdict: "Good", critique: "Clear gap.", recommendation: "Quantify impact." },
            ],
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

  it("executes Specific Aims compliance audit against the real route", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Audit Aims Structure/i }));

    await waitFor(() => {
      expect(screen.getByText(/Specific Aims Compliance Check/i)).toBeInTheDocument();
      expect(screen.getByText(/The hypothesis is descriptive/i)).toBeInTheDocument();
    });
  });

  it("shows why the aims audit failed and no stand-in checks", async () => {
    failNext = true;
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    fireEvent.click(screen.getByRole("button", { name: /Audit Aims Structure/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nothing was produced/i);
    expect(screen.queryByText(/Specific Aims Compliance Check/i)).not.toBeInTheDocument();
  });

  it("runs the study section review against the real route and shows the AI's score", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    fireEvent.click(screen.getByRole("button", { name: /8\. Study Section Scorer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run Study Section Simulation/i }));

    await waitFor(() => {
      expect(screen.getByText("3.4")).toBeInTheDocument();
      expect(screen.getByText(/Revise and resubmit/i)).toBeInTheDocument();
    });
  });

  it("shows why the review could not run and no stand-in panel", async () => {
    failNext = true;
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    fireEvent.click(screen.getByRole("button", { name: /8\. Study Section Scorer/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run Study Section Simulation/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Connect an AI provider/i);
    expect(screen.queryByText(/Top 8th Percentile/i)).not.toBeInTheDocument();
  });
});
