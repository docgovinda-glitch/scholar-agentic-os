// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { AriaLiveAnnouncer, announcePolite } from "../AriaLiveAnnouncer";

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("AriaLiveAnnouncer", () => {
  it("announces a message after a short reset", () => {
    vi.useFakeTimers();
    render(<AriaLiveAnnouncer />);
    act(() => announcePolite("Draft saved"));
    expect(screen.getByTestId("aria-live-announcer")).toHaveTextContent("");
    act(() => vi.advanceTimersByTime(60));
    expect(screen.getByTestId("aria-live-announcer")).toHaveTextContent("Draft saved");
  });

  it("clears a pending announcement on unmount, so no update fires afterwards", () => {
    vi.useFakeTimers();
    const errors = vi.spyOn(console, "error").mockImplementation(() => {});
    const { unmount } = render(<AriaLiveAnnouncer />);
    act(() => announcePolite("Generating"));
    unmount();
    expect(vi.getTimerCount()).toBe(0);
    act(() => vi.advanceTimersByTime(100));
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });
});
