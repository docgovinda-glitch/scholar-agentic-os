// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import "@testing-library/jest-dom/vitest";
import React from "react";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import AuditExportMode from "../AuditExportMode";
import { ResearchProvider } from "../ResearchContext";
import * as api from "../../api";
import type { ProjectView } from "../../types";

vi.mock("../../api", () => ({
  saveIntakeAnswers: vi.fn(),
  getProject: vi.fn(),
  getDocument: vi.fn().mockResolvedValue(null),
  getRubric: vi.fn().mockResolvedValue(null),
  getOutputTypeSpec: vi.fn().mockResolvedValue({ id: "OT-10", label: "Journal Article", structure: { sections: [] } }),
  isSupabaseConfigured: vi.fn().mockReturnValue(false),
  getSupabaseClient: vi.fn(),
  executeAgenticLLM: vi.fn(),
  setGlobalManualModelOverride: vi.fn(),
  downloadProjectExportBlob: vi.fn(),
  downloadRefereeResponseLetterBlob: vi.fn(),
  uploadProjectUserData: vi.fn(),
  updateProjectUserData: vi.fn(),
  authedJsonFetch: vi.fn(),
  saveAuthors: vi.fn(),
}));
vi.mock("../../journal/referenceApi", () => ({ lookupDoi: vi.fn(), checkDois: vi.fn() }));

function projectWith(answers: Record<string, string>): ProjectView {
  return {
    projectId: "proj-authors",
    userId: "u",
    outputTypeId: "OT-10",
    currentStage: "export",
    gates: {},
    answers: { working_title: "Sleep and memory", ...answers },
    authors: [],
    claimGraph: { nodes: [], edges: [] },
    evidenceLedger: { items: [] },
  } as unknown as ProjectView;
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.getProject).mockResolvedValue(projectWith({ manuscript_markdown: "### § Introduction\n\nText." }));
  vi.mocked(api.saveIntakeAnswers).mockImplementation(async (_id, updates) => ({ ...projectWith({}), answers: updates as Record<string, string> }));
  vi.mocked(api.saveAuthors).mockImplementation(async (_id, authors) => ({ ...projectWith({ manuscript_markdown: "### § Introduction\n\nText." }), authors }) as ProjectView);
  window.URL.createObjectURL = vi.fn().mockReturnValue("blob:x");
  window.URL.revokeObjectURL = vi.fn();
});

const mount = () =>
  render(
    <ResearchProvider projectId="proj-authors" initialStage="export" onStageChangeCallback={vi.fn()}>
      <AuditExportMode />
    </ResearchProvider>
  );

const fill = (labelText: string, value: string) => fireEvent.change(screen.getByLabelText(labelText), { target: { value } });

describe("Authors in Delivery", () => {
  it("adds co-authors with CRediT roles, saves them, and writes the contribution statement", async () => {
    mount();
    const editor = await screen.findByRole("region", { name: "Authors" });
    expect(within(editor).getByText("Add at least one author.")).toBeInTheDocument();

    fireEvent.click(within(editor).getByRole("button", { name: "Add author" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Add author" }));
    fill("Author 1 first name", "Ada");
    fill("Author 1 surname", "Lovelace");
    fill("Author 1 affiliation", "UCL");
    fill("Author 1 email", "ada@ucl.ac.uk");
    fill("Author 1 ORCID iD", "https://orcid.org/0000000218250097");
    fireEvent.blur(screen.getByLabelText("Author 1 ORCID iD"));
    fill("Author 2 first name", "Charles");
    fill("Author 2 surname", "Babbage");
    fill("Author 2 affiliation", "Cambridge");

    const roles = (n: number) => within(screen.getByRole("group", { name: `Author ${n} CRediT roles` }));
    fireEvent.click(roles(1).getByRole("button", { name: "Conceptualization" }));
    fireEvent.click(roles(1).getByRole("button", { name: "Writing – original draft" }));
    expect(within(editor).getByText("Charles Babbage: choose at least one CRediT role.")).toBeInTheDocument();
    fireEvent.click(roles(2).getByRole("button", { name: "Software" }));
    expect(within(editor).queryByRole("list", { name: "Author details still needed" })).not.toBeInTheDocument();
    expect((screen.getByLabelText("Author 1 ORCID iD") as HTMLInputElement).value).toBe("0000-0002-1825-0097");

    // Author 2 first, then the byline order is saved as shown.
    fireEvent.click(within(editor).getByRole("button", { name: "Move author 2 up" }));
    fireEvent.click(within(editor).getByRole("button", { name: "Save authors" }));
    await waitFor(() => expect(api.saveAuthors).toHaveBeenCalled());
    const saved = vi.mocked(api.saveAuthors).mock.calls[0][1];
    expect(saved.map((a) => [a.firstName, a.surname, a.isCorresponding, a.creditRoles])).toEqual([
      ["Charles", "Babbage", false, ["Software"]],
      ["Ada", "Lovelace", true, ["Conceptualization", "Writing – original draft"]],
    ]);
    expect(await within(editor).findByText("Authors saved.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Write from the authors' CRediT roles" }));
    expect((screen.getByRole("textbox", { name: "CRediT Statement" }) as HTMLTextAreaElement).value).toBe(
      "C. Babbage: Software. A. Lovelace: Conceptualization, Writing – original draft."
    );

    // Every author reaches the structured exports.
    fireEvent.click(screen.getByRole("button", { name: /JATS XML \(\.xml\)/ }));
    const xml = await (vi.mocked(window.URL.createObjectURL).mock.calls[0][0] as Blob).text();
    expect(xml).toContain("<surname>Babbage</surname>");
    expect(xml).toContain('<contrib-id contrib-id-type="orcid">https://orcid.org/0000-0002-1825-0097</contrib-id><name><surname>Lovelace</surname>');
  });

  it("flags an ORCID iD whose check digit is wrong", async () => {
    mount();
    const editor = await screen.findByRole("region", { name: "Authors" });
    fireEvent.click(within(editor).getByRole("button", { name: "Add author" }));
    fill("Author 1 ORCID iD", "0000-0002-1825-0098");
    expect(screen.getByLabelText("Author 1 ORCID iD")).toHaveAttribute("aria-invalid", "true");
    expect(within(editor).getByText(/check digit doesn't match/)).toBeInTheDocument();
  });
});
