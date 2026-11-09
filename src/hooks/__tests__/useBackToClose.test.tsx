// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, act, waitFor } from "@testing-library/react";
import { useBackToClose } from "../useBackToClose";

const flush = () => new Promise((r) => setTimeout(r, 30));

describe("useBackToClose", () => {
  afterEach(() => {
    window.history.replaceState(null, "", "/");
  });

  it("adds one history entry while open and closes on Back", async () => {
    const before = window.history.length;
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }) => useBackToClose(open, onClose), { initialProps: { open: false } });
    expect(window.history.length).toBe(before);
    rerender({ open: true });
    expect(window.history.length).toBe(before + 1);
    await act(async () => {
      window.history.back();
      await flush();
    });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("removes its entry when closed from the UI, without calling onClose", async () => {
    const onClose = vi.fn();
    const { rerender } = renderHook(({ open }) => useBackToClose(open, onClose), { initialProps: { open: true } });
    expect(window.history.state?.scholarOverlay).toBe(true);
    act(() => rerender({ open: false }));
    await waitFor(() => expect(window.history.state?.scholarOverlay).toBeFalsy());
    expect(onClose).not.toHaveBeenCalled();
  });

  it("does nothing when disabled", () => {
    const before = window.history.length;
    renderHook(() => useBackToClose(true, vi.fn(), false));
    expect(window.history.length).toBe(before);
  });
});
