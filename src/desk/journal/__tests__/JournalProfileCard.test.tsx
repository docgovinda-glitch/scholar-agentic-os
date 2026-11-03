// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import type { ProjectView } from "../../types";

const api = vi.hoisted(() => ({
  getJournalRequirements: vi.fn(),
  saveJournalRequirements: vi.fn(),
  saveIntakeAnswers: vi.fn(),
  authedJsonFetch: vi.fn(),
}));
vi.mock("../../api", () => api);
let confirmAnswer = true;
vi.mock("../../../components/ui/FeedbackSystem", async (orig) => ({
  ...(await orig<typeof import("../../../components/ui/FeedbackSystem")>()),
  requestAppConfirm: async () => confirmAnswer,
}));

const { default: JournalProfileCard } = await import("../JournalProfileCard");

const project = { projectId: "p1", answers: { target_word_count: "6000" } } as unknown as ProjectView;
const GUIDE = Array.from({ length: 45 }, (_, i) => `word${i}`).join(" ");

describe("JournalProfileCard", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    confirmAnswer = true;
    api.getJournalRequirements.mockResolvedValue(null);
    api.saveJournalRequirements.mockImplementation(async (_id, payload) => ({ journalRequirements: { ...payload, capturedAt: "", capturedBy: "" }, gates: [] }));
    api.saveIntakeAnswers.mockImplementation(async (_id, answers) => ({ ...project, answers: { ...project.answers, ...answers } }));
  });

  it("fills the form from pasted guidelines and marks what they do not state", async () => {
    api.authedJsonFetch.mockResolvedValue(
      new Response(JSON.stringify({ proposal: { journalName: "J Quantum Syst", wordLimit: { max: 4500 }, structureOverride: ["Abstract", "Introduction", "Methods", "Results", "Discussion"], requiredDeclarations: ["Data availability"], unresolvedFields: ["citationStyle"] } }), { status: 200 }),
    );
    render(<JournalProfileCard project={project} onApplied={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText(/Author guidelines/), { target: { value: GUIDE } });
    fireEvent.click(screen.getByRole("button", { name: /Fill from guidelines with AI/ }));
    await waitFor(() => expect((screen.getByLabelText("Journal name *") as HTMLInputElement).value).toBe("J Quantum Syst"));
    expect(api.authedJsonFetch).toHaveBeenCalledWith("/api/projects/p1/agentic/journal-profile/extract", "POST", { guidelinesText: GUIDE });
    expect((screen.getByLabelText("Word limit") as HTMLInputElement).value).toBe("4500");
    // Citation style, spelling and review model are not stated in this text: each is marked.
    expect(screen.getAllByText(/Not stated in the guidelines/)).toHaveLength(3);
  });

  it("reads spelling and review model from the guidelines text itself, and saves them", async () => {
    api.authedJsonFetch.mockResolvedValue(new Response(JSON.stringify({ proposal: { journalName: "Health Policy", requiredDeclarations: [], unresolvedFields: [] } }), { status: 200 }));
    const onApplied = vi.fn();
    render(<JournalProfileCard project={project} onApplied={onApplied} />);
    const text = `${GUIDE} Manuscripts must be written in British English spelling. The journal operates a double-blind peer review process.`;
    fireEvent.change(await screen.findByLabelText(/Author guidelines/), { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: /Fill from guidelines with AI/ }));
    await waitFor(() => expect((screen.getByLabelText("Spelling") as HTMLSelectElement).value).toMatch(/British/));
    expect((screen.getByLabelText("Peer review model") as HTMLInputElement).value).toBe("Double-anonymised peer review");
    expect(screen.queryByText(/Not stated in the guidelines/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Save journal profile" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(api.saveIntakeAnswers.mock.calls[0][1]).toMatchObject({ orthography: "British / Oxford English (-ise/-our/-re)", peer_review_format: "Double-anonymised peer review" });
  });

  it("opens with a journal picked in the matcher and points to its guidelines", async () => {
    api.getJournalRequirements.mockResolvedValue({ journalName: "Old J", requiredDeclarations: [], source: "manual", capturedAt: "", capturedBy: "" });
    render(<JournalProfileCard project={project} onApplied={vi.fn()} suggested={{ journalName: "Health Policy", publisher: "Elsevier", homepage: "https://example.org/hp" }} />);
    expect(((await screen.findByLabelText("Journal name *")) as HTMLInputElement).value).toBe("Health Policy");
    const prompt = screen.getByTestId("journal-guidelines-prompt");
    expect(prompt).toHaveTextContent("not in public indexes");
    expect(screen.getByRole("link", { name: /Open the journal's site/ })).toHaveAttribute("href", "https://example.org/hp");
  });

  it("saving sets the word target, citation style and an outline of the journal's sections", async () => {
    const onApplied = vi.fn();
    render(<JournalProfileCard project={project} onApplied={onApplied} />);
    fireEvent.change(await screen.findByLabelText("Journal name *"), { target: { value: "J Quantum Syst" } });
    fireEvent.change(screen.getByLabelText("Word limit"), { target: { value: "4500" } });
    fireEvent.change(screen.getByLabelText("Citation style"), { target: { value: "IEEE numbered" } });
    fireEvent.change(screen.getByLabelText(/Sections, in order/), { target: { value: "Abstract\nIntroduction\nMethods\nResults\nDiscussion" } });
    fireEvent.click(screen.getByRole("button", { name: "Save journal profile" }));
    await waitFor(() => expect(onApplied).toHaveBeenCalled());
    expect(api.saveJournalRequirements).toHaveBeenCalledWith("p1", expect.objectContaining({ journalName: "J Quantum Syst", wordLimit: { max: 4500 }, structureOverride: ["Abstract", "Introduction", "Methods", "Results", "Discussion"] }));
    const patch = api.saveIntakeAnswers.mock.calls[0][1] as Record<string, string>;
    expect(patch).toMatchObject({ target_word_count: "4500", citation_style: "IEEE", target_journal: "J Quantum Syst" });
    expect(JSON.parse(patch.word_budget_blueprint).sections.map((s: { sectionName: string }) => s.sectionName)).toEqual(["Abstract", "Introduction", "Methods", "Results", "Discussion"]);
    expect(await screen.findByTestId("journal-profile-summary")).toHaveTextContent("4,500 words");
  });

  it("asks before replacing an outline that already has text, and saves nothing when declined", async () => {
    confirmAnswer = false;
    const withText = { ...project, answers: { ...project.answers, manuscript_sections: JSON.stringify({ texts: { "sub-1": "Some words." }, unsorted: "" }) } } as unknown as ProjectView;
    render(<JournalProfileCard project={withText} onApplied={vi.fn()} />);
    fireEvent.change(await screen.findByLabelText("Journal name *"), { target: { value: "J" } });
    fireEvent.change(screen.getByLabelText(/Sections, in order/), { target: { value: "Introduction\nMethods" } });
    fireEvent.click(screen.getByRole("button", { name: "Save journal profile" }));
    await new Promise((r) => setTimeout(r, 20));
    expect(api.saveJournalRequirements).not.toHaveBeenCalled();
  });
});
