// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { ApprovedReferencesShelf } from "../ApprovedReferencesShelf";
import { formatInTextCitation } from "../ReferenceBarItem";
import type { DiscoveredSource } from "../types";

const source = {
  id: "s1", title: "Central Bank Communication and Policy Interest Rate", authors: ["Haryo Kuncoro"], year: "2020",
  type: "journal_article", relevanceScore: 1, mainFinding: "", suggestedUse: "", citation: "", status: "kept",
} as DiscoveredSource;

afterEach(() => cleanup());

describe("Approved references shelf", () => {
  it("copies the shared reference entries (no invented publisher) and says Copied only on success", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<ApprovedReferencesShelf approvedSources={[source]} onToggleApproval={vi.fn()} citationStyle="apa7" />);
    fireEvent.click(screen.getAllByRole("button").find((b) => /approved/i.test(b.textContent || ""))!);
    fireEvent.click(screen.getByRole("button", { name: /copy all/i }));
    await waitFor(() => expect(screen.getByText(/copied/i)).toBeTruthy());
    await waitFor(() => expect(writeText).toHaveBeenCalled());
    const copied = String(writeText.mock.calls[0][0]);
    expect(copied).toContain("Kuncoro, H. (2020)");
    expect(copied).not.toMatch(/Academic Press|Unknown Author/);
  });

  it("in-text citations use the family name from the shared formatter", () => {
    expect(formatInTextCitation(source, "apa7")).toBe("(Kuncoro, 2020)");
    expect(formatInTextCitation(source, "ieee")).toBe("(Kuncoro, 2020)"); // a card has no reference number: Harvard author-date
  });
});
