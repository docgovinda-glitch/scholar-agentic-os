// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import StudioPanel from "../regions/StudioPanel";

const completer = vi.fn();
vi.mock("../ai/completer", () => ({ browserCompleter: (...args: unknown[]) => completer(...args) }));
vi.mock("../ai/AiModelSwitcher", () => ({ AiModelSwitcher: () => null }));

afterEach(() => {
  cleanup();
  completer.mockReset();
});

function runLevel(level: string, text: string) {
  render(<StudioPanel sessionId="s1" />);
  fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: level } });
  fireEvent.change(screen.getByPlaceholderText(/Paste a passage/i), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Refine" }));
}

describe("Desk — StudioPanel", () => {
  it("runs Level 1 (proofread) on the device without asking any AI", async () => {
    runLevel("proofread", "The the cat sat.");
    await waitFor(() => expect(screen.getByText(/changes —/)).toBeInTheDocument());
    expect(completer).not.toHaveBeenCalled();
  });

  it("runs a model-backed level over the central AI connections and says which model answered", async () => {
    completer.mockResolvedValue({
      text: JSON.stringify({ revised: "The sample comprised 240 participants.", changes: [] }),
      provider: "openai",
      model: "answering-model",
      inputTokensEstimate: 10,
      outputTokensEstimate: 10,
    });
    runLevel("clarity", "The sample comprised 240 participants.");
    await waitFor(() => expect(screen.getByText(/AI used: openai \(answering-model\)/)).toBeInTheDocument());
    expect(completer).toHaveBeenCalledTimes(1);
  });

  it("shows the failure instead of a result when no AI answers", async () => {
    completer.mockRejectedValue(new Error("Your key has run out of quota."));
    runLevel("clarity", "Some passage to refine.");
    expect(await screen.findByText("Your key has run out of quota.")).toBeInTheDocument();
    expect(screen.queryByText(/AI used:/)).not.toBeInTheDocument();
  });
});
