// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import React from "react";
import HumanizerWorkspace from "../HumanizerWorkspace";

vi.mock("../../api", () => ({
  authedJsonFetch: vi.fn(),
}));

vi.mock("../../../platform/gateway/gateway", () => ({
  complete: vi.fn(),
  completeWithFailover: vi.fn(),
}));

vi.mock("../../../services/userAiSettings", () => ({
  loadUserAiSettings: vi.fn().mockResolvedValue({ provider: "gemini", preferences: {} }),
  readProviderKey: vi.fn().mockResolvedValue("test-gemini-key"),
  providersWithStoredKey: vi.fn().mockReturnValue(["gemini"]),
}));

import { authedJsonFetch } from "../../api";
import { completeWithFailover } from "../../../platform/gateway/gateway";

describe("HumanizerWorkspace (Production Pipeline & Quality Audit Dashboard)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authedJsonFetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        humanizedText: "Rewritten organic human prose from fallback.",
      }),
    });

    (completeWithFailover as any).mockImplementation(async ({ userPrompt }: any) => {
      // Find unique protected tokens from prompt
      const tokenMatch = Array.from(new Set(userPrompt.match(/⟦PROTECTED_[^⟧]+⟧/g) || []));
      const tokensStr = tokenMatch.join(" ");

      return {
        ok: true,
        value: {
          text: JSON.stringify({
            rewrittenText: `Domesticated across centuries, cows remain vital to agrarian life ${tokensStr}. They supply essential dairy nourishment.`,
            improvements: ["Enhanced scholarly cadence", "Refined sentence rhythm"],
          }),
        },
      };
    });
  });

  it("renders rewrite modes, discipline selector, hedging selector, genre selector, locked terms manager, detector simulation, cadence ribbon, and dual panels", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    expect(screen.getByText(/Text Humanizer/i)).toBeInTheDocument();
    expect(screen.getByText(/Controlled Academic Prose Rewriting Engine/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Conservative$/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Balanced/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Deep/i })).toBeInTheDocument();
    expect(screen.getByText(/Discipline Voice Profile/i)).toBeInTheDocument();
    expect(screen.getByText(/Epistemic Hedging \/ Stance/i)).toBeInTheDocument();
    expect(screen.getByText(/Locked Terminology Memory/i)).toBeInTheDocument();
    expect(screen.getByTestId("detector-simulation-card")).toBeInTheDocument();
    expect(screen.getByTestId("cadence-ribbon-visualizer")).toBeInTheDocument();
    expect(screen.getByText(/Original \/ Input Text/i)).toBeInTheDocument();
    expect(screen.getByText(/Humanized Publication Prose/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Humanize Text/i })).toBeInTheDocument();
  });

  it("allows selecting discipline profile and hedging level", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const disciplineSelect = screen.getByLabelText(/Discipline Voice Profile/i) as HTMLSelectElement;
    expect(disciplineSelect.value).toBe("general");
    fireEvent.change(disciplineSelect, { target: { value: "stem" } });
    expect(disciplineSelect.value).toBe("stem");

    const hedgingSelect = screen.getByLabelText(/Epistemic Hedging \/ Stance/i) as HTMLSelectElement;
    expect(hedgingSelect.value).toBe("balanced");
    fireEvent.change(hedgingSelect, { target: { value: "authoritative" } });
    expect(hedgingSelect.value).toBe("authoritative");
  });

  it("manages locked terminology and sample text", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    // Expand Locked Terms
    const lockedTermsBtn = screen.getByRole("button", { name: /Locked Terminology Memory/i });
    fireEvent.click(lockedTermsBtn);

    const termInput = screen.getByPlaceholderText(/e\.g\. Rajadharma/i);
    const addTermBtn = screen.getByRole("button", { name: /Add Term/i });

    fireEvent.change(termInput, { target: { value: "Epistemic Modality" } });
    fireEvent.click(addTermBtn);

    expect(screen.getByText("Epistemic Modality")).toBeInTheDocument();

    // Clear and reload sample text
    const clearBtn = screen.getByRole("button", { name: /^Clear$/i });
    fireEvent.click(clearBtn);

    const textarea = screen.getByPlaceholderText(/Paste or type academic text/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");

    const loadSampleBtn = screen.getByRole("button", { name: /Load Sample/i });
    fireEvent.click(loadSampleBtn);
    expect(textarea.value).toContain("The cow");
  });

  it("executes production multi-auditor pipeline, renders quality gates, and supports diff/accept", async () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const textarea = screen.getByPlaceholderText(/Paste or type academic text/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: "The cow is a domestic animal in South Asia (Wilson et al., 2022). It provides dairy nutrition.",
      },
    });

    const humanizeBtn = screen.getByRole("button", { name: /Humanize Text/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(completeWithFailover).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Domesticated across centuries, cows remain vital to agrarian life/i)
      ).toBeInTheDocument();
    });

    // Check Quality Audit Card
    expect(screen.getByTestId("audit-summary-card")).toBeInTheDocument();
    expect(screen.getByText(/Safety & Integrity Verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Protected Content/i)).toBeInTheDocument();
    expect(screen.getByText(/Claims & Modality/i)).toBeInTheDocument();

    // Check Diff Toggle
    const diffToggleBtn = screen.getByRole("button", { name: /Show Changes \(Diff\)/i });
    fireEvent.click(diffToggleBtn);
    expect(screen.getByRole("button", { name: /Plain View/i })).toBeInTheDocument();

    // Check Keep Humanized
    const acceptBtn = screen.getByRole("button", { name: /Keep Humanized/i });
    fireEvent.click(acceptBtn);

    expect(textarea.value).toContain("Domesticated across centuries");
  });

  it("safely handles fail-safe fallback when candidate fails audit", async () => {
    // Completer that violates epistemic fidelity
    (completeWithFailover as any).mockImplementation(async () => {
      return {
        ok: true,
        value: {
          text: JSON.stringify({
            rewrittenText: "Evidence proves that compound X causes absolute cure.",
            improvements: [],
          }),
        },
      };
    });

    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const textarea = screen.getByPlaceholderText(/Paste or type academic text/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Evidence suggests that compound X may support recovery." },
    });

    const humanizeBtn = screen.getByRole("button", { name: /Humanize Text/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Safe Rewrite Unavailable — Original Preserved/i)).toBeInTheDocument();
    });

    // Ensure rejected candidate was not exposed by default
    expect(screen.queryByText(/causes absolute cure/i)).not.toBeInTheDocument();

    // User can override the fail-safe using the "Use Humanized Draft Anyway" button
    const useAnywayBtn = screen.getByTestId("use-candidate-anyway-btn");
    expect(useAnywayBtn).toBeInTheDocument();
    fireEvent.click(useAnywayBtn);

    // Humanized draft is now loaded into the editor
    await waitFor(() => {
      expect(screen.getByText(/causes absolute cure/i)).toBeInTheDocument();
    });
  });

  it("gracefully succeeds via server fallback when client providers fail or have no keys", async () => {
    (completeWithFailover as any).mockResolvedValue({
      ok: false,
      error: "No active client API key available",
    });

    (authedJsonFetch as any).mockImplementation(async (url: string) => {
      if (url.includes("/humanize")) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            rewrittenText: "Domesticated across centuries, cows remain vital to agrarian life (Wilson et al., 2022). They supply essential dairy nourishment.",
            improvements: ["Disciplinary vocabulary enrichment", "Cadence optimization"],
          }),
        };
      }
      return { ok: true, json: async () => ({ success: true, data: null }) };
    });

    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const textarea = screen.getByPlaceholderText(/Paste or type academic text/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: {
        value: "The cow is a domestic animal in South Asia (Wilson et al., 2022). It provides dairy nutrition.",
      },
    });

    const humanizeBtn = screen.getByRole("button", { name: /Humanize Text/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(
        screen.getByText(/Domesticated across centuries, cows remain vital to agrarian life/i)
      ).toBeInTheDocument();
    });

    expect(screen.getByText(/Safety & Integrity Verified/i)).toBeInTheDocument();
    expect(screen.getByText(/Protected Content/i)).toBeInTheDocument();
  });

  it("never marks original text fallback as success: true or displays green Keep Humanized button", async () => {
    (completeWithFailover as any).mockResolvedValue({
      ok: false,
      error: "All providers failed",
    });

    (authedJsonFetch as any).mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        success: false,
        error: "Server AI unavailable and algorithmic rewrite produced no changes.",
      }),
    });

    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const textarea = screen.getByPlaceholderText(/Paste or type academic text/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, {
      target: { value: "Original test input that will not be rewritten." },
    });

    const humanizeBtn = screen.getByRole("button", { name: /Humanize Text/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Rewrite Unsuccessful — Original Source Preserved/i)).toBeInTheDocument();
    });

    // Invariant: The UI must NEVER display the green "Keep Humanized" button on emergency fallback
    expect(screen.queryByRole("button", { name: /Keep Humanized/i })).not.toBeInTheDocument();
    expect(screen.queryByText(/Safety & Integrity Verified/i)).not.toBeInTheDocument();
    expect(screen.getByText(/Preserved Source \(Fallback\)/i)).toBeInTheDocument();
  });

  it("clears stale successful output when a subsequent run fails", async () => {
    // Run 1: Succeeds
    (completeWithFailover as any).mockResolvedValueOnce({
      ok: true,
      value: {
        text: JSON.stringify({
          rewrittenText: "First successful rewrite output.",
          improvements: ["Enhanced style"],
        }),
      },
    });

    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const textarea = screen.getByPlaceholderText(/Paste or type academic text/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: "First input text." } });

    const humanizeBtn = screen.getByRole("button", { name: /Humanize Text/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(screen.getByText("First successful rewrite output.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: /Keep Humanized/i })).toBeInTheDocument();
    });

    // Run 2: Fails with 429 rate limit
    (completeWithFailover as any).mockRejectedValueOnce(
      new Error("429 RESOURCE_EXHAUSTED: Rate limit exceeded")
    );
    (authedJsonFetch as any).mockResolvedValueOnce({
      ok: false,
      status: 429,
      json: async () => ({ error: "Rate limit reached" }),
    });

    fireEvent.change(textarea, { target: { value: "Second input text." } });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      // Invariant: Stale rewrite from Run 1 MUST NOT survive Run 2 failure
      expect(screen.queryByText("First successful rewrite output.")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Keep Humanized/i })).not.toBeInTheDocument();
      expect(screen.getByText(/Rewrite Unsuccessful — Original Source Preserved/i)).toBeInTheDocument();
    });
  });

  it("rejects unexpected backend response if backend returns source text with success: true", async () => {
    const identicalInput = "Input text that backend fails to change.";

    // Completer returns identical input inside JSON
    (completeWithFailover as any).mockResolvedValueOnce({
      ok: true,
      value: {
        text: JSON.stringify({
          rewrittenText: identicalInput,
          improvements: [],
        }),
      },
    });

    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const textarea = screen.getByPlaceholderText(/Paste or type academic text/i) as HTMLTextAreaElement;
    fireEvent.change(textarea, { target: { value: identicalInput } });

    const humanizeBtn = screen.getByRole("button", { name: /Humanize Text/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(screen.getByText(/Rewrite Unsuccessful — Original Source Preserved/i)).toBeInTheDocument();
    });

    // Invariant: Even if an AI completer claimed success, identical output is never shown as successful
    expect(screen.queryByRole("button", { name: /Keep Humanized/i })).not.toBeInTheDocument();
    expect(screen.getByText(/Preserved Source \(Fallback\)/i)).toBeInTheDocument();
  });
});
