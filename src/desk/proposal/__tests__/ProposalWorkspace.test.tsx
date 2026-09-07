// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import ProposalWorkspace from "../ProposalWorkspace";

describe("ProposalWorkspace", () => {
  it("renders proposal title, funding agency, and Specific Aims page", () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    expect(screen.getByText(/Autonomous Verification of Empirical Scientific Literature/i)).toBeInTheDocument();
    expect(screen.getByText("R01 / CAREER Grant Track")).toBeInTheDocument();
    expect(screen.getByText(/Specific Aims Executive Page/i)).toBeInTheDocument();
    expect(screen.getByText(/Central \/ Overarching Hypothesis/i)).toBeInTheDocument();
  });

  it("switches to Agency & Rubric stage and displays mechanism and budget", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const agencyBtn = screen.getByRole("button", { name: /1\. Agency & Rubric/i });
    fireEvent.click(agencyBtn);

    expect(await screen.findByText(/Funding Agency & Grant Rubric/i)).toBeInTheDocument();
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
    global.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        checks: [
          { name: "Overarching Hypothesis Stated", status: "passed", detail: "Clear central hypothesis." },
          { name: "Aim Independence", status: "passed", detail: "Aims are logically decoupled." },
        ],
      }),
    });

    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const auditBtn = screen.getByRole("button", { name: /Audit Aims Structure/i });
    fireEvent.click(auditBtn);

    expect(await screen.findByText(/Specific Aims Compliance Check/i)).toBeInTheDocument();
    expect(screen.getByText(/Overarching Hypothesis Stated:/i)).toBeInTheDocument();
  });

  it("switches to Study Section review simulator when clicked", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const studySectionBtn = screen.getByRole("button", { name: /7\. Study Section Review/i });
    fireEvent.click(studySectionBtn);

    expect(await screen.findByText(/Federal Grant Study Section Review Panel \(NIH \/ NSF\)/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run Study Section Simulation →/i })).toBeInTheDocument();
  });
});
