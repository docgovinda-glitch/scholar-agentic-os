// @vitest-environment jsdom
//
// The theme control is icon-only, which is exactly the shape that tends to
// ship with no accessible name and no grouping — three anonymous "button"
// announcements with no indication of which one is active. These assertions
// pin the semantics that prevent that.

import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
// Registered per file, matching this suite's convention — testSetup.ts
// deliberately keeps vitest globals off, so the matchers are not ambient.
import "@testing-library/jest-dom/vitest";
import ThemeToggle from "../ThemeToggle";

beforeEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches: false,
      media: "(prefers-color-scheme: dark)",
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      addListener: vi.fn(),
      removeListener: vi.fn(),
      dispatchEvent: () => true,
      onchange: null,
    })
  );
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe("ThemeToggle", () => {
  it("exposes a labelled radiogroup of all three theme choices", () => {
    render(<ThemeToggle />);

    expect(screen.getByRole("radiogroup", { name: /colour theme/i })).toBeInTheDocument();
    // "System" is a first-class option, not the absence of a choice.
    expect(screen.getByRole("radio", { name: "Light" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Dark" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "System" })).toBeInTheDocument();
  });

  it("marks exactly one option as checked, defaulting to System", () => {
    render(<ThemeToggle />);

    const checked = screen
      .getAllByRole("radio")
      .filter((r) => r.getAttribute("aria-checked") === "true");

    expect(checked).toHaveLength(1);
    expect(checked[0]).toHaveAccessibleName("System");
  });

  it("applies the theme and moves the checked state on selection", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("radio", { name: "Dark" }));

    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(screen.getByRole("radio", { name: "Dark" })).toHaveAttribute("aria-checked", "true");
    expect(screen.getByRole("radio", { name: "System" })).toHaveAttribute("aria-checked", "false");
  });

  it("hands control back to the OS when System is reselected", () => {
    render(<ThemeToggle />);

    fireEvent.click(screen.getByRole("radio", { name: "Light" }));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");

    fireEvent.click(screen.getByRole("radio", { name: "System" }));
    expect(document.documentElement.hasAttribute("data-theme")).toBe(false);
  });
});
