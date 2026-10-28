/** @vitest-environment jsdom */
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ThesisWorkspace from "../ThesisWorkspace";

describe("ThesisWorkspace (OT-09 Thesis & Dissertation Studio)", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    vi.spyOn(window, "fetch").mockImplementation(async (input: RequestInfo | URL) => {
      const url = typeof input === "string" ? input : input.toString();

      if (url.includes("/thesis/audit-chapters")) {
        return new Response(
          JSON.stringify({
            projectId: "proj-thesis-1",
            alignmentScore: 95,
            coherenceStatus: "Strong Cross-Chapter Threading",
            crossChapterChecks: [
              {
                check: "Research Question Threading (Ch. 1 → Ch. 5)",
                status: "passed",
                detail: "All 3 Research Questions map cleanly to empirical findings.",
              },
              {
                check: "Methodological Alignment (Ch. 2 → Ch. 3)",
                status: "passed",
                detail: "Theoretical constructs operationalized in research instruments.",
              },
            ],
            auditedAt: new Date().toISOString(),
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }

      if (url.includes("/thesis/simulate-viva")) {
        return new Response(
          JSON.stringify({
            projectId: "proj-thesis-1",
            degreeLevel: "PhD Dissertation",
            examinerPersona: "External Examiner Panel (Chair & Methodological Specialist)",
            examinerRigorScore: "94/100 (Rigorous PhD Defense Standard)",
            questions: [
              {
                id: "viva-q1",
                category: "Theoretical Originality & Epistemology",
                examinerQuestion:
                  "How does your theoretical framework resolve the tension between classical discrete symbolic models and continuous neural field dynamics?",
                assessmentFocus: "Tests conceptual synthesis and defense of core assumptions.",
                suggestedRebuttalStructure: [
                  "Define the scope boundary where classical symbolic models break down.",
                  "Cite Chapter 2 matrix synthesis and empirical validation in Chapter 4.",
                ],
              },
            ],
            generatedAt: new Date().toISOString(),
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

  it("executes Cross-Chapter Alignment Audit in Chapter 5", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    fireEvent.click(screen.getByRole("button", { name: /5\. Discussion & Audit/i }));

    const auditBtn = screen.getByRole("button", { name: /Run Cross-Chapter Audit/i });
    fireEvent.click(auditBtn);

    await waitFor(() => {
      expect(screen.getByText(/95% · Strong Cross-Chapter Threading/i)).toBeInTheDocument();
      expect(
        screen.getByText(/Research Question Threading \(Ch\. 1 → Ch\. 5\)/i)
      ).toBeInTheDocument();
    });
  });

  it("runs Viva Voce Defense Simulator and generates external examiner questions", async () => {
    render(<ThesisWorkspace projectId="proj-thesis-1" />);

    fireEvent.click(screen.getByRole("button", { name: /6\. Viva Voce Simulator/i }));

    const launchBtn = screen.getByRole("button", { name: /Launch Examiner Simulation/i });
    fireEvent.click(launchBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/External Examiner Panel \(Chair & Methodological Specialist\)/i)
      ).toBeInTheDocument();
      expect(
        screen.getByText(/94\/100 \(Rigorous PhD Defense Standard\)/i)
      ).toBeInTheDocument();
    });
  });
});
