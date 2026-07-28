// @vitest-environment jsdom
//
// Sci-fi redesign, Step 3 (ActiveAgentsPanel.tsx) — characterization tests
// written BEFORE the visual redesign, per this project's standing TDD
// discipline. Locks in agent selection, suggested-prompt fill, and
// consult-submission behavior so the redesign (cyan "online"/pulse status,
// restrained motion) only ever changes classNames, never these behaviors.

import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ActiveAgentsPanel from "../agents/ActiveAgentsPanel";
import { DEFAULT_STATE } from "../../types";

vi.mock("../../services/aiService", () => ({
  draftSection: vi.fn().mockResolvedValue({ draftText: "Mock agent response" })
}));

afterEach(() => {
  cleanup();
});

describe("ActiveAgentsPanel — behavior preserved across the redesign", () => {
  it("renders all six agents with Online status", () => {
    render(<ActiveAgentsPanel project={DEFAULT_STATE("jdoe")} />);
    expect(screen.getByText("Literature Review Agent")).toBeInTheDocument();
    expect(screen.getByText("Citation Agent")).toBeInTheDocument();
    expect(screen.getAllByText("Online")).toHaveLength(6);
  });

  it("clicking an agent switches the console header to that agent", () => {
    render(<ActiveAgentsPanel project={DEFAULT_STATE("jdoe")} />);
    fireEvent.click(screen.getByText("Citation Agent"));
    expect(screen.getByText("Agent Console: Citation Agent")).toBeInTheDocument();
  });

  it("clicking a suggested prompt fills the query textarea", () => {
    render(<ActiveAgentsPanel project={DEFAULT_STATE("jdoe")} />);
    const suggestion = screen.getByText(/Kautilyan statecraft constructs/);
    fireEvent.click(suggestion);
    const textarea = screen.getByPlaceholderText(/Ask the Literature Review Agent/) as HTMLTextAreaElement;
    expect(textarea.value).toMatch(/Kautilyan statecraft constructs/);
  });

  it("submitting a query renders the agent's response", async () => {
    render(<ActiveAgentsPanel project={DEFAULT_STATE("jdoe")} />);
    const textarea = screen.getByPlaceholderText(/Ask the Literature Review Agent/);
    fireEvent.change(textarea, { target: { value: "Test query" } });
    fireEvent.click(screen.getByText("Consult Agent"));
    await waitFor(() => expect(screen.getByText("Mock agent response")).toBeInTheDocument());
  });
});
