// @vitest-environment jsdom
/**
 * The whole assignment, read and edited in the submission stage: every written
 * section in order with its reference list, and a last fix saved through the
 * same path Drafting uses. Nothing is shown here that the export would not
 * contain, and nothing is saved that the student did not type.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, waitFor, within, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { afterEach } from "vitest";
import { FullDraftReview } from "../components/FullDraftReview";
import type { AssignmentDraftingSection, DiscoveredSource } from "../types";

const sections = [
  { id: "s1", title: "1.0 Introduction", targetWordCount: 250, draftContent: "Western theory claims universality [src-1].", status: "complete" },
  { id: "s2", title: "2.0 Foundational Concepts", targetWordCount: 500, draftContent: "Dharma orders the political world.", status: "complete" },
  { id: "s3", title: "3.0 Not written yet", targetWordCount: 650, draftContent: "", status: "pending" },
] as unknown as AssignmentDraftingSection[];

const sources = [
  { id: "src-1", title: "Hindu Political Thought", authors: ["Brahmacari, A."], year: 2024, journal: "Journal of Ideas" },
] as unknown as DiscoveredSource[];

const renderReview = (onUpdateSection = vi.fn().mockResolvedValue(undefined)) => {
  render(
    <FullDraftReview
      title="Hindu Theories of International Relations"
      sections={sections}
      approvedSources={sources}
      citationStyle="apa7"
      wordCount={11}
      targetWordCount={2000}
      onUpdateSection={onUpdateSection}
    />
  );
  return onUpdateSection;
};

afterEach(() => cleanup());

describe("FullDraftReview", () => {
  it("shows the whole paper: its title, the written sections and the reference list", async () => {
    renderReview();
    expect(screen.getByText("Hindu Theories of International Relations")).toBeInTheDocument();
    expect(screen.getByText("1.0 Introduction")).toBeInTheDocument();
    expect(screen.getByText("2.0 Foundational Concepts")).toBeInTheDocument();
    expect(screen.getByText("References")).toBeInTheDocument();
    expect(screen.getByText(/Hindu Political Thought/)).toBeInTheDocument();
  });

  it("leaves an unwritten section out of the reading view, so the student reads what they would submit", () => {
    renderReview();
    expect(screen.queryByText("3.0 Not written yet")).toBeNull();
  });

  it("counts the words against the brief's limit", () => {
    renderReview();
    expect(screen.getByTestId("full-draft-word-count")).toHaveTextContent("/ 2,000 words");
  });

  it("saves an edit through the same path Drafting uses, once typing stops", async () => {
    const onUpdateSection = renderReview();
    fireEvent.click(screen.getByTestId("full-draft-edit"));

    // Every section is editable here, the empty one included: this is where a gap gets filled.
    const editors = await screen.findAllByRole("textbox");
    expect(editors.length).toBe(sections.length);

    fireEvent.input(editors[0], { target: { textContent: "A sharper opening." } });
    await waitFor(() => expect(onUpdateSection).toHaveBeenCalledWith("s1", expect.any(String)), { timeout: 2500 });
  });

  it("nothing is saved while the student is only reading", async () => {
    const onUpdateSection = renderReview();
    await new Promise((r) => setTimeout(r, 50));
    expect(onUpdateSection).not.toHaveBeenCalled();
  });

  it("opens full screen as a dialog and closes again", () => {
    renderReview();
    fireEvent.click(screen.getByTestId("full-draft-expand"));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Your assignment")).toBeInTheDocument();

    fireEvent.keyDown(window, { key: "Escape" });
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("says so plainly when no section has text", () => {
    render(
      <FullDraftReview
        title="Empty paper"
        sections={[{ id: "s1", title: "1.0 Intro", targetWordCount: 100, draftContent: "", status: "pending" }] as unknown as AssignmentDraftingSection[]}
        approvedSources={[]}
        citationStyle="apa7"
        wordCount={0}
        targetWordCount={2000}
        onUpdateSection={vi.fn()}
      />
    );
    expect(screen.getByText(/No section has text yet/)).toBeInTheDocument();
  });
});
