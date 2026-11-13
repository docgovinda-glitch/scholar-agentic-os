// @vitest-environment jsdom
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { describe, it, expect, vi, beforeEach } from "vitest";
import ContextPanel from "../../workspace/ContextPanel";
import WritingStyleSelector, {
  TONE_SUGGESTION_CHIPS,
} from "../components/WritingStyleSelector";
import { ASSIGNMENT_AGENT_CONFIGS } from "../types";

// Workspace chats now search before every answer. These tests are about the
// tone chips, so the search finds nothing and the question goes out as asked.
vi.mock("../../../services/liveSearchService", async (orig) => ({
  ...(await orig<typeof import("../../../services/liveSearchService")>()),
  executeLiveSearch: vi.fn().mockResolvedValue([]),
}));

describe("Tone Assistant Context Synchronization & Dynamic Suggestion Chips", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("ContextPanel displays default quick actions initially, and updates to tone suggestions upon event dispatch", async () => {
    const handleSend = vi.fn().mockResolvedValue({ ok: true, response: "Here is guidance on your tone." });

    render(
      <ContextPanel
        currentStage="understand"
        stageName="Understand & Align"
        isOpen={true}
        agent={ASSIGNMENT_AGENT_CONFIGS.understand}
        onSendMessage={handleSend}
      />
    );

    // Initial state: Advisor default quick actions
    expect(screen.getByText("Suggested Actions")).toBeInTheDocument();
    expect(screen.getByText("Analyze prompt & key command verbs")).toBeInTheDocument();
    expect(screen.getByText("Recommend writing tone for this brief")).toBeInTheDocument();

    // Dispatch tone calibration event (as happens when scrolling to or focusing tone selector)
    window.dispatchEvent(
      new CustomEvent("scholar:copilot-suggested-actions", {
        detail: {
          actions: TONE_SUGGESTION_CHIPS,
          source: "tone-calibration",
        },
      })
    );

    // ContextPanel now displays the 3 tone calibration suggestions
    await waitFor(() => {
      expect(screen.getByText("Tone Calibration Suggestions")).toBeInTheDocument();
      expect(screen.getByText("Which tone best matches my assignment brief?")).toBeInTheDocument();
      expect(screen.getByText("Compare Analytical vs. Argumentative for this topic")).toBeInTheDocument();
      expect(screen.getByText("How can I calibrate custom voice cloning?")).toBeInTheDocument();
    });

    // Clicking Chip 1 automatically injects the query and triggers onSendMessage
    const chip1 = screen.getByText("Which tone best matches my assignment brief?");
    fireEvent.click(chip1);

    await waitFor(() => expect(handleSend).toHaveBeenCalledWith("Which tone best matches my assignment brief?", []));

    // Wait for the response to be rendered in the chat stream
    await waitFor(() => {
      expect(screen.getByText("Here is guidance on your tone.")).toBeInTheDocument();
    });
  });

  it("dispatches tone assistant event when WritingStyleSelector receives focus or selection", () => {
    const handleChange = vi.fn();
    const handleFocus = vi.fn();
    const eventHandler = vi.fn();

    window.addEventListener("scholar:copilot-suggested-actions", eventHandler);

    render(
      <div data-testid="tone-wrapper">
        <WritingStyleSelector
          value={{ preset: "analytical" }}
          onChange={handleChange}
          onFocus={handleFocus}
        />
      </div>
    );

    const select = screen.getByLabelText("Writing Tone");

    // Focus on the select element
    fireEvent.focus(select);

    expect(handleFocus).toHaveBeenCalled();
    expect(eventHandler).toHaveBeenCalled();

    const event = eventHandler.mock.calls[0][0] as CustomEvent;
    expect(event.detail.actions).toEqual(TONE_SUGGESTION_CHIPS);

    window.removeEventListener("scholar:copilot-suggested-actions", eventHandler);
  });

  it("external query dispatch (scholar:copilot-send-query) triggers Advisor response", async () => {
    const handleSend = vi.fn().mockResolvedValue({ ok: true, response: "Analysis of voice cloning complete." });

    render(
      <ContextPanel
        currentStage="understand"
        isOpen={true}
        agent={ASSIGNMENT_AGENT_CONFIGS.understand}
        onSendMessage={handleSend}
      />
    );

    // Simulate external query event dispatch
    window.dispatchEvent(
      new CustomEvent("scholar:copilot-send-query", {
        detail: {
          query: "How can I calibrate custom voice cloning?",
        },
      })
    );

    await waitFor(() => {
      expect(handleSend).toHaveBeenCalledWith("How can I calibrate custom voice cloning?", []);
    });

    await waitFor(() => {
      expect(screen.getByText("Analysis of voice cloning complete.")).toBeInTheDocument();
    });
  });
});
