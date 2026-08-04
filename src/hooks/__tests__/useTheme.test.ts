// @vitest-environment jsdom
//
// Theme control (docs/06-decisions/60-DESIGN-DIRECTION.md §3.2) — dark became
// a first-class mode here rather than the only mode, so the rules that keep it
// correct are worth pinning:
//
//   * "system" must stay a live subscription, not a value snapshotted at load
//   * an explicit choice must survive a reload, and must win over the OS
//   * returning to "system" must hand control back to the media query, which
//     means REMOVING data-theme rather than writing the resolved value into it
//
// The last one is the subtle one: pinning data-theme="light" when the user
// picks "system" looks identical on screen at that moment and is wrong the
// next time the OS flips.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useTheme, resolveTheme } from "../useTheme";

/** Minimal MediaQueryList stand-in whose `matches` can be flipped at will. */
function installMatchMedia(matchesDark: boolean) {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  const mql = {
    matches: matchesDark,
    media: "(prefers-color-scheme: dark)",
    addEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeEventListener: (_: string, cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    addListener: (cb: (e: MediaQueryListEvent) => void) => listeners.add(cb),
    removeListener: (cb: (e: MediaQueryListEvent) => void) => listeners.delete(cb),
    dispatchEvent: () => true,
    onchange: null,
  };
  vi.stubGlobal("matchMedia", vi.fn().mockReturnValue(mql));
  return {
    /** Simulate the OS theme changing while the app is open. */
    flipTo(dark: boolean) {
      mql.matches = dark;
      listeners.forEach((cb) => cb({ matches: dark } as MediaQueryListEvent));
    },
    listenerCount: () => listeners.size,
  };
}

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("resolveTheme", () => {
  it("follows the OS when the preference is 'system'", () => {
    installMatchMedia(true);
    expect(resolveTheme("system")).toBe("dark");
    installMatchMedia(false);
    expect(resolveTheme("system")).toBe("light");
  });

  it("ignores the OS when the preference is explicit", () => {
    installMatchMedia(true);
    expect(resolveTheme("light")).toBe("light");
    installMatchMedia(false);
    expect(resolveTheme("dark")).toBe("dark");
  });
});

describe("useTheme", () => {
  it("defaults to 'system' with no data-theme attribute set", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe("system");
    // Absent, not "light" — the media query must remain in control.
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });

  it("pins data-theme when an explicit theme is chosen, and persists it", () => {
    installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setPreference("dark"));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(localStorage.getItem("scholar-theme")).toBe("dark");
    expect(result.current.resolved).toBe("dark");
  });

  it("restores a stored preference on mount, overriding the OS setting", () => {
    localStorage.setItem("scholar-theme", "light");
    installMatchMedia(true); // OS says dark; the stored choice must win.

    const { result } = renderHook(() => useTheme());

    expect(result.current.preference).toBe("light");
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("clears both storage and the attribute when returning to 'system'", () => {
    installMatchMedia(true);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setPreference("light"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    act(() => result.current.setPreference("system"));

    // Both must go. Leaving data-theme="light" behind would look right now
    // and be wrong the next time the OS switches.
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
    expect(localStorage.getItem("scholar-theme")).toBeNull();
    expect(result.current.resolved).toBe("dark"); // back under OS control
  });

  it("tracks OS changes live while the preference is 'system'", () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    expect(result.current.resolved).toBe("light");

    act(() => media.flipTo(true));

    expect(result.current.resolved).toBe("dark");
  });

  it("stops tracking the OS once an explicit theme is chosen", () => {
    const media = installMatchMedia(false);
    const { result } = renderHook(() => useTheme());

    act(() => result.current.setPreference("light"));
    act(() => media.flipTo(true));

    // The OS went dark; the explicit choice must hold.
    expect(result.current.resolved).toBe("light");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("unsubscribes from the media query on unmount", () => {
    const media = installMatchMedia(false);
    const { unmount } = renderHook(() => useTheme());

    expect(media.listenerCount()).toBe(1);
    unmount();
    expect(media.listenerCount()).toBe(0);
  });

  it("still applies a theme when localStorage is unavailable", () => {
    installMatchMedia(false);
    const getItem = vi
      .spyOn(Storage.prototype, "getItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: Safari private mode");
      });
    const setItem = vi
      .spyOn(Storage.prototype, "setItem")
      .mockImplementation(() => {
        throw new Error("SecurityError: Safari private mode");
      });

    const { result } = renderHook(() => useTheme());
    expect(result.current.preference).toBe("system");

    // The choice must still take effect for this session even though it
    // cannot be written down.
    act(() => result.current.setPreference("dark"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(result.current.resolved).toBe("dark");

    getItem.mockRestore();
    setItem.mockRestore();
  });
});
