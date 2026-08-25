// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
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

  it("switches to Study Section review simulator when clicked", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);

    const studySectionBtn = screen.getByRole("button", { name: /7\. Study Section Review/i });
    fireEvent.click(studySectionBtn);

    expect(await screen.findByText(/Study Section Review Simulator/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Run Study Section Simulation →/i })).toBeInTheDocument();
  });
});
