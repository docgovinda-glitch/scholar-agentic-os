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
        result: {
          text: JSON.stringify({
            rewrittenText: `Domesticated across centuries, cows remain vital to agrarian life ${tokensStr}. They supply essential dairy nourishment.`,
            improvements: ["Enhanced scholarly cadence", "Refined sentence rhythm"],
          }),
        },
      };
    });
  });

  it("renders rewrite modes, genre selector, locked terms manager, and dual panels", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    expect(screen.getByText(/Text Humanizer/i)).toBeInTheDocument();
    expect(screen.getByText(/Controlled Academic Prose Rewriting Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/^Conservative$/i)).toBeInTheDocument();
    expect(screen.getByText(/^Balanced/i)).toBeInTheDocument();
    expect(screen.getByText(/^Deep/i)).toBeInTheDocument();
    expect(screen.getByText(/Locked Terminology Memory/i)).toBeInTheDocument();
    expect(screen.getByText(/Original \/ Input Text/i)).toBeInTheDocument();
    expect(screen.getByText(/Humanized Publication Prose/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Humanize Text/i })).toBeInTheDocument();
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
        result: {
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

    // Ensure rejected candidate was NOT exposed
    expect(screen.queryByText(/causes absolute cure/i)).not.toBeInTheDocument();
  });
});
