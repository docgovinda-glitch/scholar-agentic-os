/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ProposalWorkspace from "../ProposalWorkspace";

const draftBodies: Array<Record<string, unknown>> = [];

describe("ProposalWorkspace (OT-15 Grant & Research Proposal Engine)", () => {
  let failNext = false;
  beforeEach(() => {
    failNext = false;
    vi.restoreAllMocks();
    draftBodies.length = 0;
    vi.spyOn(window, "fetch").mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = typeof input === "string" ? input : input.toString();
      if (url.includes("/proposal/draft-section")) {
        draftBodies.push(JSON.parse(String(init?.body)));
        return new Response(JSON.stringify({ success: true, content: "We will run a stepped-wedge trial.", bibliography: "", wordCount: 6 }), { status: 200, headers: { "Content-Type": "application/json" } });
      }

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
    // Three empty aims to fill in; none written for the applicant.
    expect(screen.getByText(/0 of 3 aims written/i)).toBeInTheDocument();
    expect(screen.getAllByRole("textbox", { name: /^Aim \d$/ }).map((el) => (el as HTMLInputElement).value)).toEqual(["", "", ""]);

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

  it("the blueprint starter never fills in a funder, mechanism or budget (P1-9)", async () => {
    vi.spyOn(window, "fetch").mockImplementation(async () =>
      new Response(JSON.stringify({ project: { id: "proj-proposal-2", title: "", intakeAnswers: {} } }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      })
    );
    render(<ProposalWorkspace projectId="proj-proposal-2" />);
    fireEvent.click(screen.getByTestId("generate-structured-blueprint-btn"));
    expect(screen.getByText(/0 of 3 aims written/i)).toBeInTheDocument();
    expect(screen.queryByText(/\$500,000|500,000/)).not.toBeInTheDocument();
    // Nor a hypothesis or aim wording.
    expect(document.body.textContent).not.toMatch(/We hypothesize|Establish the theoretical and empirical baseline/);
    expect(screen.queryByText(/Standard Investigator Grant Track/i)).not.toBeInTheDocument();
  });

  it("Research Strategy and Preliminary Studies keep their own text", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);
    await screen.findByDisplayValue("NSF / NIH Joint Informatics Program").catch(() => undefined);
    fireEvent.click(screen.getByRole("button", { name: /3\. Preliminary Studies/i }));
    fireEvent.change(screen.getByRole("textbox", { name: "Preliminary Studies" }), { target: { value: "Pilot at one clinic." } });
    fireEvent.click(screen.getByRole("button", { name: /5\. Research Strategy & Risk/i }));
    expect((screen.getByRole("textbox", { name: "Research Strategy and Approach" }) as HTMLTextAreaElement).value).toBe("");
    fireEvent.change(screen.getByRole("textbox", { name: "Research Strategy and Approach" }), { target: { value: "Stepped-wedge design." } });
    fireEvent.click(screen.getByRole("button", { name: /3\. Preliminary Studies/i }));
    expect((screen.getByRole("textbox", { name: "Preliminary Studies" }) as HTMLTextAreaElement).value).toBe("Pilot at one clinic.");
  });

  it("the budget is the applicant's own items, totalled against the ceiling", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);
    await waitFor(() => expect(screen.getByRole("button", { name: /6\. Budget & Resources/i })).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: /6\. Budget & Resources/i }));
    // No invented allocation before the applicant enters anything.
    expect(screen.queryByText(/Personnel & Postdocs \(60%\)/)).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Add item/i }));
    fireEvent.change(screen.getByLabelText("Description of budget item 1"), { target: { value: "Study nurse" } });
    fireEvent.change(screen.getByLabelText("Amount of budget item 1 in USD"), { target: { value: "250000" } });
    await waitFor(() => expect(screen.getByText("$250,000")).toBeInTheDocument());
    expect(screen.getByText(/left of your target of \$1,250,000/)).toBeInTheDocument();
  });

  it("drafts a section with the user's AI once there is a title", async () => {
    render(<ProposalWorkspace projectId="proj-proposal-1" />);
    await waitFor(() => expect(screen.getAllByText(/Empirical Grant Architecture Study/).length).toBeGreaterThan(0));
    fireEvent.click(screen.getByRole("button", { name: /5\. Research Strategy & Risk/i }));
    fireEvent.click(screen.getByRole("button", { name: /Draft Research Strategy and Approach with AI/i }));
    await waitFor(() => expect((screen.getByRole("textbox", { name: "Research Strategy and Approach" }) as HTMLTextAreaElement).value).toBe("We will run a stepped-wedge trial."));
    expect(draftBodies[0]).toMatchObject({ sectionTitle: "Research Strategy and Approach", targetWords: 1500 });
  });
});
