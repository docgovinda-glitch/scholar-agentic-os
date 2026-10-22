// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import ProposalWorkspace from "../ProposalWorkspace";

describe("ProposalWorkspace", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    global.fetch = vi.fn().mockImplementation(async (url: string | URL | Request) => {
      const urlStr = typeof url === "string" ? url : url.toString();
      if (urlStr.includes("/proposal/aims-audit")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            checks: [
              { name: "Overarching Hypothesis Stated", status: "passed", detail: "Clear central hypothesis." },
              { name: "Aim Independence", status: "passed", detail: "Aims are logically decoupled." },
            ],
          }),
        };
      }
      if (urlStr.includes("/proposal/study-section-simulate")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            title: "Next-Generation Autonomous Verification of Empirical Scientific Literature",
            agency: "NSF / NIH Joint Informatics Program",
            overallImpactScore: "18 (Top 4th Percentile)",
            recommendationForFunding: "High Priority for Funding",
            studySectionMembers: [
              { role: "Primary Reviewer", verdict: "Outstanding significance and empirical rigor." },
              { role: "Secondary Reviewer", verdict: "Innovative multi-agent consensus framing." },
            ],
            criteria: [
              {
                criterion: "Significance",
                score: "1.5",
                verdict: "Exceptional",
                critique: "Addresses critical literature reproducibility bottlenecks.",
                recommendation: "Maintain proposed scope and benchmark datasets.",
              },
              {
                criterion: "Investigator",
                score: "1.8",
                verdict: "Outstanding",
                critique: "High track record in autonomous verification systems.",
                recommendation: "Highlight graduate student training plan.",
              },
            ],
          }),
        };
      }
      if (urlStr.includes("/intake")) {
        return {
          ok: true,
          json: async () => ({ success: true, version: 2 }),
        };
      }
      if (urlStr.includes("/api/projects/proj-proposal-1") || urlStr.includes("/api/project/proj-proposal-1")) {
        return {
          ok: true,
          json: async () => ({
            project: {
              id: "proj-proposal-1",
              title: "Next-Generation Autonomous Verification of Empirical Scientific Literature",
              version: 1,
              intakeAnswers: {
                fundingAgency: "NSF / NIH Joint Informatics Program",
                mechanism: "R01 / CAREER Grant Track",
                targetBudgetUSD: 1250000,
                projectDurationMonths: 36,
              },
            },
          }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true }),
      };
    });
  });

  it("renders proposal title, funding agency, and Specific Aims page", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    expect(await screen.findByText(/Autonomous Verification of Empirical Scientific Literature/i)).toBeInTheDocument();
    expect(screen.getByText("R01 / CAREER Grant Track")).toBeInTheDocument();
    expect(screen.getByText(/Specific Aims Executive Page/i)).toBeInTheDocument();
    expect(screen.getByText(/Central \/ Overarching Hypothesis/i)).toBeInTheDocument();
    expect(screen.getByTestId("autosave-status")).toHaveTextContent("All changes saved");
  });

  it("switches to Agency & Rubric stage and displays mechanism and budget", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const agencyBtn = screen.getByRole("button", { name: /1\. Agency & Rubric/i });
    fireEvent.click(agencyBtn);

    expect(await screen.findByText(/1\. Funding Agency & Rubric Alignment/i)).toBeInTheDocument();
    expect(screen.getByText(/Budget Ceiling \(USD\)/i)).toBeInTheDocument();
  });

  it("switches to Budget Justification stage and displays cost allocations", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const budgetBtn = screen.getByRole("button", { name: /6\. Budget & Broader Impacts/i });
    fireEvent.click(budgetBtn);

    expect(await screen.findByText(/Budget Justification & Resource Breakdown/i)).toBeInTheDocument();
    expect(screen.getByText(/Personnel & Postdocs/i)).toBeInTheDocument();
  });

  it("triggers Aims Audit with backend response", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const auditBtn = screen.getByRole("button", { name: /Audit Aims Structure/i });
    fireEvent.click(auditBtn);

    expect(await screen.findByText(/Specific Aims Compliance Check/i)).toBeInTheDocument();
    expect(screen.getByText(/Overarching Hypothesis Stated:/i)).toBeInTheDocument();
  });

  it("switches to Study Section review simulator and runs simulation", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const studySectionBtn = screen.getByRole("button", { name: /7\. Study Section Review/i });
    fireEvent.click(studySectionBtn);

    expect(await screen.findByText(/Federal Grant Study Section Review Panel \(NIH \/ NSF\)/i)).toBeInTheDocument();
    const simBtn = screen.getByRole("button", { name: /Run Study Section Simulation →/i });
    fireEvent.click(simBtn);

    await waitFor(() => {
      expect(screen.getByText(/High Priority for Funding/i)).toBeInTheDocument();
    });
  });
});
