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
    fireEvent.click(screen.getByTestId("scholar-year-filter"));
    fireEvent.click(screen.getByRole("button", { name: "2020–2026" }));
    expect(onFilters).toHaveBeenLastCalledWith({ yearPreset: "2020-2026", scopes: [] });
    fireEvent.click(screen.getByTestId("scholar-source-filter"));
    fireEvent.click(screen.getByRole("button", { name: "Peer-reviewed only" }));
    expect(onFilters).toHaveBeenLastCalledWith({ yearPreset: "any", scopes: ["peer_reviewed"] });
  });
});

describe("ScholarFilterBar — filter menus", () => {
  const bar = (filters = DEFAULT_SCHOLAR_FILTERS) =>
    render(<ScholarFilterBar mode="auto" onModeChange={() => undefined} filters={filters} onFiltersChange={() => undefined} />);

  it("keeps the options closed until asked, and closes them with Escape", () => {
    bar();
    const year = screen.getByTestId("scholar-year-filter");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(year);
    expect(year).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByRole("dialog", { name: "Publication years" })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(year).toHaveFocus();
  });

  it("shows the chosen years and how many source filters are on", () => {
    bar({ yearPreset: "2020-2026", scopes: ["peer_reviewed", "vault_only"] });
    expect(screen.getByTestId("scholar-year-filter")).toHaveTextContent("2020–2026");
    expect(screen.getByTestId("scholar-source-filter")).toHaveTextContent("Sources · 2");
  });

  it("offers year boxes for a custom range and flags an inverted one", () => {
    bar({ yearPreset: "custom", yearFrom: 2024, yearTo: 2020, scopes: [] });
    fireEvent.click(screen.getByTestId("scholar-year-filter"));
    fireEvent.blur(screen.getByLabelText("From year"));
    expect(screen.getByRole("alert")).toHaveTextContent("is after");
  });
});
