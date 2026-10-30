/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ThesisWorkspace from "../ThesisWorkspace";

describe("ThesisWorkspace (OT-09 Thesis & Dissertation Studio)", () => {
  let failNext = false;
  beforeEach(() => {
    failNext = false;
    vi.restoreAllMocks();
    vi.spyOn(window, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      // Mocks follow the real server routes and response shapes. The old mocks
      // used paths the server never had (/audit-chapters, /simulate-viva), so in
      // production the workspace always fell back to hardcoded results (P0-9).
      if (url.includes("/thesis/chapter-audit")) {
        if (failNext) {
          return new Response(JSON.stringify({ error: "Connect an AI provider (your own key or a local model) in AI Access to run this.", code: "ai_provider_required" }), { status: 400, headers: { "Content-Type": "application/json" } });
        }
        return new Response(
          JSON.stringify({
            success: true,
            audit: {
              totalChapters: 2,
              alignmentScore: 61,
              coherenceStatus: "Findings not yet linked",
              crossChapterChecks: [
                { check: "Research Question Threading (Ch. 1 → Ch. 5)", status: "warn", details: "RQ2 has no findings yet." },
              ],
            },
            chapterSummaries: [],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/thesis/viva-simulate")) {
        if (failNext) {
          return new Response(JSON.stringify({ error: "Viva examiner questions could not be generated: the AI provider failed or returned an unusable answer. Nothing was produced. Try again.", code: "ai_unavailable" }), { status: 502, headers: { "Content-Type": "application/json" } });
        }
        return new Response(
          JSON.stringify({
            success: true,
            title: "Empirical Systems Dissertation",
            examinerPersona: "Senior External Examiner, Computational Neuroscience",
            examinerRigorScore: "High",
            questions: [
              {
                id: "viva-q1",
                category: "Theoretical Originality & Epistemology",
                examinerQuestion:
                  "How does your theoretical framework resolve the tension between symbolic models and neural field dynamics?",
                assessmentFocus: "Tests conceptual synthesis.",
                suggestedRebuttalStructure: ["Define the scope boundary.", "Point to your Chapter 2 synthesis."],
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({
          project: {
            id: "proj-thesis-1",
            title: "Empirical Systems Dissertation",
            intakeAnswers: {
              degreeLevel: "PhD Dissertation",
              fieldOfStudy: "Computational Neuroscience & AI Epistemology",
              targetWordCount: 65000,
            },
          },
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    });
  });

  it("renders Chapter 1 & Theoretical Framing with clean Zero-Ghost onboarding and switches dissertation stages", () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    expect(
      screen.getByRole("heading", { name: /Chapter 1 & Theoretical Framing/i })
    ).toBeInTheDocument();
    expect(screen.getByTestId("apple-studio-header")).toBeInTheDocument();

    const genBtn = screen.getByTestId("generate-structured-blueprint-btn");
    fireEvent.click(genBtn);
    expect(screen.getByText(/5 Chapters Planned/i)).toBeInTheDocument();

    // Switch to Literature Matrix
    fireEvent.click(screen.getByRole("button", { name: /2\. Literature Matrix/i }));
    expect(
      screen.getByRole("heading", { name: /Chapter 2: Thematic Literature Matrix/i })
    ).toBeInTheDocument();

    // Switch to Methodology & Ethics
    fireEvent.click(screen.getByRole("button", { name: /3\. Methodology & Ethics/i }));
    expect(
      screen.getByRole("heading", { name: /Chapter 3: Methodology & Epistemological Design/i })
    ).toBeInTheDocument();

    // Switch to Discussion & Audit
    fireEvent.click(screen.getByRole("button", { name: /5\. Discussion & Audit/i }));
    expect(
      screen.getByRole("heading", {
        name: /Chapter 5: Critical Discussion & Cross-Chapter Audit/i,
      })
    ).toBeInTheDocument();
  });

  it("executes Cross-Chapter Alignment Audit in Chapter 5 against the real route", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    fireEvent.click(screen.getByRole("button", { name: /5\. Discussion & Audit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run Cross-Chapter Audit/i }));

    await waitFor(() => {
      expect(screen.getByText(/61% · Findings not yet linked/i)).toBeInTheDocument();
      expect(screen.getByText(/Research Question Threading \(Ch\. 1 → Ch\. 5\)/i)).toBeInTheDocument();
    });
  });

  it("shows why the audit could not run and no stand-in score", async () => {
    failNext = true;
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    fireEvent.click(screen.getByRole("button", { name: /5\. Discussion & Audit/i }));
    fireEvent.click(screen.getByRole("button", { name: /Run Cross-Chapter Audit/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Connect an AI provider/i);
    expect(screen.queryByText(/Structural Alignment Score/i)).not.toBeInTheDocument();
  });

  it("runs the Viva Voce simulator against the real route and shows the AI's questions", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    fireEvent.click(screen.getByRole("button", { name: /6\. Viva Voce Simulator/i }));
    fireEvent.click(screen.getByRole("button", { name: /Launch Examiner Simulation/i }));

    await waitFor(() => {
      expect(screen.getByText(/Senior External Examiner, Computational Neuroscience/i)).toBeInTheDocument();
      // Shown in the examiner panel and again in the practice room.
      expect(screen.getAllByText(/resolve the tension between symbolic models/i).length).toBeGreaterThanOrEqual(1);
      expect(screen.queryByTestId("viva-practice-empty")).not.toBeInTheDocument();
    });
  });

  it("shows why the viva simulation failed and no stand-in questions", async () => {
    failNext = true;
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    fireEvent.click(screen.getByRole("button", { name: /6\. Viva Voce Simulator/i }));
    fireEvent.click(screen.getByRole("button", { name: /Launch Examiner Simulation/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/Nothing was produced/i);
    expect(screen.queryByText(/Simulated Examiner Persona/i)).not.toBeInTheDocument();
  });
});
