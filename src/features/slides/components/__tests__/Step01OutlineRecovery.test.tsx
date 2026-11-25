// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { SlideDeck } from "../../types/slides";

// An AI that never answers until the request is aborted.
vi.mock("../../../../desk/api", () => ({
  authedJsonFetch: (_u: string, _m: string, _b: unknown, opts?: { signal?: AbortSignal }) =>
    new Promise((_res, rej) => opts?.signal?.addEventListener("abort", () => rej(new DOMException("Aborted", "AbortError")))),
}));

import Step01Understand, { OUTLINE_TIMEOUT_MS } from "../Step01Understand";

const emptyDeck = (): SlideDeck => ({ id: "d1", title: "Untitled Presentation", slides: [], activeSlideIndex: 0 });
function Host() {
  const [deck, setDeck] = React.useState<SlideDeck>(emptyDeck());
  return <Step01Understand projectId="p1" deck={deck} onNextStep={vi.fn()} onUpdateDeck={setDeck} />;
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

const start = () => {
  render(<Host />);
  fireEvent.change(screen.getByLabelText("Presentation topic"), { target: { value: "Remote work and research productivity" } });
  fireEvent.click(screen.getByRole("button", { name: /Generate outline/i }));
};

describe("Step 01: outline recovery when the AI does not answer", () => {
  it("Cancel stops the wait and offers an instant outline", async () => {
    start();
    expect(screen.getByRole("button", { name: /Working/ })).toBeInTheDocument();
    await act(async () => fireEvent.click(screen.getByRole("button", { name: "Cancel" })));
    expect(screen.queryByRole("button", { name: /Working/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Build Instant Structured Outline/ }));
    expect(screen.getByTestId("outline-builder")).toBeInTheDocument();
  });

  it("times out on its own and offers the same way out", async () => {
    start();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(OUTLINE_TIMEOUT_MS + 100);
    });
    expect(screen.getByRole("status")).toHaveTextContent(/taking too long/i);
    expect(screen.getByRole("button", { name: /Build Instant Structured Outline/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Write outline manually/ })).toBeInTheDocument();
  });
});
