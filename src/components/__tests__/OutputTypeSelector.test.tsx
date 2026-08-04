// @vitest-environment jsdom
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import OutputTypeSelector from "../OutputTypeSelector";
import { listOutputTypes, toLegacyOutputFormat, getOutputType } from "../../services/outputTypeCatalog";

/**
 * The workspace previously offered seven hardcoded formats and branched on
 * "journal-article", so every other deliverable fell through to a generic
 * path. These tests pin that the picker is driven by the Atlas catalog and
 * that choosing a type reports both identifiers — the Atlas id for the real
 * specification, and the legacy format the export/compliance pipeline still
 * reads.
 */
describe("OutputTypeSelector", () => {
  it("offers the whole catalog, not a hardcoded subset", () => {
    render(<OutputTypeSelector onSelect={vi.fn()} />);
    // Deliberately spot-check types that the old seven-format list could not express.
    for (const label of ["Master's Thesis", "Doctoral Dissertation", "Poster", "Grant Proposal", "Policy Brief"]) {
      expect(screen.getByText(label)).toBeInTheDocument();
    }
  });

  it("renders every catalog entry", () => {
    render(<OutputTypeSelector onSelect={vi.fn()} />);
    for (const spec of listOutputTypes()) {
      expect(screen.getAllByText(spec.label).length).toBeGreaterThan(0);
    }
  });

  it("finds a type by alias, not just by its catalog label", () => {
    render(<OutputTypeSelector onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search output types"), { target: { value: "lit review" } });
    expect(screen.getByText("Literature Review")).toBeInTheDocument();
    expect(screen.queryByText("Poster")).not.toBeInTheDocument();
  });

  it("filters by academic level", () => {
    render(<OutputTypeSelector onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Filter by academic level"), { target: { value: "undergraduate" } });
    // A doctoral-only type must drop out.
    expect(screen.queryByText("Doctoral Dissertation")).not.toBeInTheDocument();
    expect(screen.getByText("Assignment")).toBeInTheDocument();
  });

  it("explains the requirements before the user commits", () => {
    render(<OutputTypeSelector onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText("Literature Review"));

    expect(screen.getByText("Recommended structure")).toBeInTheDocument();
    expect(screen.getByText("Citation styles")).toBeInTheDocument();
    // The intake panel's heading carries the required-field count.
    expect(screen.getByText(/What you'll need/)).toBeInTheDocument();

    // Real section titles from the catalog, not placeholders.
    const spec = listOutputTypes().find((s) => s.label === "Literature Review")!;
    expect(screen.getByText(spec.structure.sections[0].title)).toBeInTheDocument();
  });

  it("reports both the legacy format and the Atlas id on confirm", () => {
    const onSelect = vi.fn();
    render(<OutputTypeSelector onSelect={onSelect} />);
    fireEvent.click(screen.getByText("Journal Article"));
    fireEvent.click(screen.getByText(/Start a Journal Article/));

    expect(onSelect).toHaveBeenCalledWith("journal-article", "OT-10");
  });

  it("lets the user back out of the preview to the full list", () => {
    render(<OutputTypeSelector onSelect={vi.fn()} />);
    fireEvent.click(screen.getByText("Poster"));
    expect(screen.getByText("Recommended structure")).toBeInTheDocument();
    fireEvent.click(screen.getByText("All output types"));
    expect(screen.getByText("Master's Thesis")).toBeInTheDocument();
  });

  it("tells the user what to do when a search matches nothing", () => {
    render(<OutputTypeSelector onSelect={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Search output types"), { target: { value: "zzzznomatch" } });
    expect(screen.getByText(/Generic Document/)).toBeInTheDocument();
  });
});

describe("legacy output-format mapping", () => {
  it("maps every catalog type onto a valid legacy format", () => {
    const valid = new Set([
      "journal-article",
      "research-paper",
      "term-paper",
      "newspaper-article",
      "book-chapter",
      "report",
      "research-proposal",
    ]);
    for (const spec of listOutputTypes()) {
      expect(valid.has(toLegacyOutputFormat(spec))).toBe(true);
    }
  });

  it("keeps the journal-article path pointing at the journal-article pipeline", () => {
    // The existing compliance branch keys off this exact value.
    expect(toLegacyOutputFormat(getOutputType("OT-10")!)).toBe("journal-article");
  });
});
