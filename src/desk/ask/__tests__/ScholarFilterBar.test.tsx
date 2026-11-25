// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ScholarFilterBar } from "../ScholarFilterBar";
import { DEFAULT_SCHOLAR_FILTERS } from "../../../domain/ask/scholarFilters";

describe("ScholarFilterBar", () => {
  it("shows a Quick Scholar | Deep Research toggle in the prompt bar", () => {
    const onMode = vi.fn();
    render(<ScholarFilterBar mode="auto" onModeChange={onMode} filters={DEFAULT_SCHOLAR_FILTERS} onFiltersChange={() => undefined} />);
    expect(screen.getByRole("button", { name: "Quick Scholar" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Deep Research" }));
    expect(onMode).toHaveBeenCalledWith("deep_research");
  });
  it("sets year range and source scope filters", () => {
    const onFilters = vi.fn();
    render(<ScholarFilterBar mode="auto" onModeChange={() => undefined} filters={DEFAULT_SCHOLAR_FILTERS} onFiltersChange={onFilters} />);
    fireEvent.click(screen.getByRole("button", { name: "2020–2026" }));
    expect(onFilters).toHaveBeenLastCalledWith({ yearPreset: "2020-2026", scopes: [] });
    fireEvent.click(screen.getByRole("button", { name: "Peer-reviewed only" }));
    expect(onFilters).toHaveBeenLastCalledWith({ yearPreset: "any", scopes: ["peer_reviewed"] });
  });
});

describe("ScholarFilterBar — phone layout", () => {
  it("puts the year and scope chips behind a Filters toggle (hidden until opened below 640px)", () => {
    render(<ScholarFilterBar mode="auto" onModeChange={() => undefined} filters={DEFAULT_SCHOLAR_FILTERS} onFiltersChange={() => undefined} />);
    const toggle = screen.getByTestId("scholar-filters-toggle");
    const options = screen.getByTestId("scholar-filter-options");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    expect(options.className).toMatch(/(^|\s)hidden(\s|$)/);
    expect(options.className).toContain("sm:contents");
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByTestId("scholar-filter-options").className).not.toMatch(/(^|\s)hidden(\s|$)/);
  });

  it("shows how many filters are on", () => {
    render(<ScholarFilterBar mode="auto" onModeChange={() => undefined} filters={{ ...DEFAULT_SCHOLAR_FILTERS, yearPreset: "2020-2026", scopes: ["peer_reviewed"] }} onFiltersChange={() => undefined} />);
    expect(screen.getByTestId("scholar-filters-toggle")).toHaveTextContent("Filters (2)");
  });
});
