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
}));

vi.mock("../../../services/userAiSettings", () => ({
  loadUserAiSettings: vi.fn().mockResolvedValue({ provider: "gemini", preferences: {} }),
  readProviderKey: vi.fn().mockResolvedValue("test-gemini-key"),
}));

import { authedJsonFetch } from "../../api";
import { complete } from "../../../platform/gateway/gateway";

describe("HumanizerWorkspace (Simplified 2-Box Interface)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (authedJsonFetch as any).mockResolvedValue({
      ok: true,
      json: async () => ({
        success: true,
        humanizedText: "Rewritten organic human prose from fallback.",
      }),
    });
    (complete as any).mockResolvedValue({
      text: "Rewritten organic human prose produced by Google Gemini AI with high burstiness and zero clichés.",
    });
  });

  it("renders simple 2-box interface without complex side rails", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    expect(screen.getByText(/Text Humanizer/i)).toBeInTheDocument();
    expect(screen.getByText(/Original \/ AI-Generated Text/i)).toBeInTheDocument();
    expect(screen.getByText(/Humanized Publication Prose/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Humanize Text/i })).toBeInTheDocument();
  });

  it("allows selecting tone and clearing/loading sample text", () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const naturalToneBtn = screen.getByRole("button", { name: /Natural & Clear/i });
    fireEvent.click(naturalToneBtn);

    const clearBtn = screen.getByRole("button", { name: /^Clear$/i });
    fireEvent.click(clearBtn);

    const textarea = screen.getByPlaceholderText(/Paste your AI-generated text/i) as HTMLTextAreaElement;
    expect(textarea.value).toBe("");

    const loadSampleBtn = screen.getByRole("button", { name: /Load Sample/i });
    fireEvent.click(loadSampleBtn);
    expect(textarea.value).toContain("The cow");
  });

  it("executes humanize with connected Gemini key and populates right box", async () => {
    render(<HumanizerWorkspace projectId="proj-hum-1" />);

    const humanizeBtn = screen.getByRole("button", { name: /Humanize Text/i });
    fireEvent.click(humanizeBtn);

    await waitFor(() => {
      expect(complete).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: "gemini",
          apiKey: "test-gemini-key",
          userPrompt: expect.stringContaining("The cow"),
          taskClass: "refinement",
        })
      );
    });

    await waitFor(() => {
      expect(
        screen.getByText(/Rewritten organic human prose produced by Google Gemini AI/i)
      ).toBeInTheDocument();
    });
  });
});
