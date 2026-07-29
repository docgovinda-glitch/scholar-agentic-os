// @vitest-environment jsdom
//
// Navigation overhaul (docs/planning/navigation-scoping.md) — on navigation,
// focus must land on the destination screen's heading, never get lost to
// <body>. Verified here against a real DOM element's actual focus state,
// not just that .focus() was called.

import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { useFocusOnNavigate } from "../useFocusOnNavigate";

describe("useFocusOnNavigate", () => {
  it("does NOT steal focus on initial mount", () => {
    const { result } = renderHook(({ key }) => useFocusOnNavigate<HTMLHeadingElement>(key), {
      initialProps: { key: "A" }
    });
    const el = document.createElement("h2");
    document.body.appendChild(el);
    (result.current as any).current = el;

    expect(document.activeElement).not.toBe(el);
    document.body.removeChild(el);
  });

  it("moves focus to the attached element when the navigation key changes", () => {
    const el = document.createElement("h2");
    el.tabIndex = -1;
    document.body.appendChild(el);

    const { result, rerender } = renderHook(({ key }) => useFocusOnNavigate<HTMLHeadingElement>(key), {
      initialProps: { key: "A" }
    });
    (result.current as any).current = el;

    rerender({ key: "B" });

    expect(document.activeElement).toBe(el);
    document.body.removeChild(el);
  });

  it("does not move focus again if the navigation key is unchanged", () => {
    const el = document.createElement("h2");
    el.tabIndex = -1;
    document.body.appendChild(el);
    const other = document.createElement("button");
    document.body.appendChild(other);

    const { result, rerender } = renderHook(({ key }) => useFocusOnNavigate<HTMLHeadingElement>(key), {
      initialProps: { key: "A" }
    });
    (result.current as any).current = el;
    rerender({ key: "B" });
    expect(document.activeElement).toBe(el);

    other.focus();
    rerender({ key: "B" });
    expect(document.activeElement).toBe(other);

    document.body.removeChild(el);
    document.body.removeChild(other);
  });
});
