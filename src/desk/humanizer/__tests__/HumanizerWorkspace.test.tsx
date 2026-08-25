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

describe("HumanizerWorkspace (2-Pass Stylometrics & Citations Guardian)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authedJsonFetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        humanizedText: "Rewritten organic human prose from fallback.",
      }),
    });

    (completeWithFailover as any).mockImplementation(async ({ systemPrompt, userPrompt }: any) => {
      if (systemPrompt.includes("cadence")) {
        return { result: { text: "Pass 1: " + userPrompt } };
      }
      // Pass 2 keeps citations intact
      return {
        result: {
          text: `Pass 2: Organic publication-grade prose with ${
            userPrompt.includes("⟦CITATION_3⟧") ? "⟦CITATION_3⟧" : "(Wilson et al., 2022)"
          } and zero AI clichés.`,
        },
      };
    });
  });

  it("renders 2-box layout with field presets and detection metrics", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    expect(screen.getByText(/Text Humanizer/i)).toBeInTheDocument();
    expect(screen.getByText(/2-Pass Stylometric Engine/i)).toBeInTheDocument();
    expect(screen.getByText(/Academic Journal/i)).toBeInTheDocument();
    expect(screen.getByText(/Grant & Proposal/i)).toBeInTheDocument();
    expect(screen.getByText(/Original \/ AI-Generated Text/i)).toBeInTheDocument();
    expect(screen.getByText(/Humanized Publication Prose/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Humanize Text/i })).toBeInTheDocument();
  });

  it("switches field presets and sample text", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const grantPresetBtn = screen.getByRole("button", { name: /Grant & Proposal/i });
    fireEvent.click(grantPresetBtn);

    const clearBtn = screen.getByRole("button", { name: /^Clear$/i });
    fireEvent.click(clearBtn);

    const textarea = screen.getByPlaceholderText(/Paste your AI-generated text/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");

    const loadSampleBtn = screen.getByRole("button", { name: /Load Sample/i });
    fireEvent.click(loadSampleBtn);
    expect(textarea.value).toContain("The cow");
  });

  it("runs 2-pass stylometrics, protects citations and enables diff view", async () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const humanizeBtn = screen.getByRole("button", { name: /Humanize Text/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(completeWithFailover).toHaveBeenCalled();
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Organic publication-grade prose with \(Wilson et al\., 2022\) and zero AI clichés\./i)
      ).toBeInTheDocument();
    });

    // Test Diff toggle
    const diffToggleBtn = screen.getByRole("button", { name: /Show Changes \(Diff\)/i });
    fireEvent.click(diffToggleBtn);
    expect(screen.getByRole("button", { name: /Plain View/i })).toBeInTheDocument();

    // Test Send to Manuscript
    const sendBtn = screen.getByRole("button", { name: /Send to Manuscript/i });
    fireEvent.click(sendBtn);
    await waitFor(() => {
      expect(screen.getByText(/Sent to Manuscript/i)).toBeInTheDocument();
    });
  });
});
