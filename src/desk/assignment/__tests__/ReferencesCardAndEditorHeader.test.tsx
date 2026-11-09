// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { ReferencesCard } from "../components/ReferencesCard";
import { DraftingActiveEditor } from "../components/DraftingActiveEditor";
import type { DiscoveredSource, AssignmentDraftingSection } from "../types";

const src = (id: string, title: string, author: string, year: string): DiscoveredSource => ({
  id, title, authors: [author], year, type: "journal", journal: "Journal of Tests", mainFinding: "", suggestedUse: "", citation: "", status: "kept",
});

afterEach(() => cleanup());

describe("ReferencesCard", () => {
  const sources = [src("2", "Zeta results", "Zimmer, A.", "2020"), src("1", "Alpha results", "Abbott, B.", "2019")];

  it("lists approved sources alphabetically in the project's style", () => {
    render(<ReferencesCard sources={sources} style="harvard" />);
    const card = screen.getByTestId("references-card");
    const items = within(card).getAllByText(/results/);
    expect(items[0].textContent).toMatch(/Abbott/);
    expect(items[1].textContent).toMatch(/Zimmer/);
  });

  it("lets the student edit and save the list", () => {
    const onSave = vi.fn();
    render(<ReferencesCard sources={sources} style="apa7" onSaveEdit={onSave} />);
    fireEvent.click(screen.getByRole("button", { name: /Edit/ }));
    fireEvent.change(screen.getByLabelText("Edit references"), { target: { value: "My edited list" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSave).toHaveBeenCalledWith("My edited list");
  });
});

describe("drafting editor header", () => {
  it("keeps a long prompt out of the heading and shows it as a quiet subtitle", () => {
    const longTitle = "1.0 Compare superconducting transmon and trapped-ion qubits in terms of coherence time and gate fidelity under realistic noise";
    const section = { id: "s1", title: longTitle, targetWordCount: 300, currentWordCount: 0, guidance: "", draftContent: "", status: "pending" } as AssignmentDraftingSection;
    render(<DraftingActiveEditor section={section} onUpdateContent={vi.fn()} />);
    const heading = screen.getByRole("heading", { level: 2, name: /Compare superconducting/ });
    expect(heading.textContent!.split(/\s+/).length).toBeLessThanOrEqual(11);
    expect(screen.getByTestId("section-full-prompt")).toHaveTextContent("realistic noise");
  });
});
