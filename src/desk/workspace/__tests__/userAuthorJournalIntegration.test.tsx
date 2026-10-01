// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DefinitionStage from "../stages/DefinitionStage.tsx";
import * as api from "../../api.ts";
import { getLocalSavedAuthors, saveAuthorForUser } from "../../userAuthorService.ts";
import type { ProjectView, Author } from "../../types.ts";

vi.mock("../../useDeskSession.ts", () => ({
  useDeskSession: () => ({
    status: "signed-in",
    userId: "user-dr-govinda",
    email: "doc.govinda@gmail.com",
  }),
}));

vi.mock("../../api", () => ({
  getOutputTypeSpec: vi.fn().mockResolvedValue({
    outputTypeId: "OT-06",
    label: "Journal Article",
    sections: [],
  }),
  saveIntakeAnswers: vi.fn().mockImplementation((_id, answers) => Promise.resolve({ projectId: _id, answers })),
  saveAuthors: vi.fn().mockImplementation((_id, authors) => Promise.resolve({ projectId: _id, authors })),
  executeAgenticLLM: vi.fn(),
}));

describe("Journal Article — User-Specific Author Persistence Integration", () => {
  const userEmail = "doc.govinda@gmail.com";

  const initialAuthor: Author = {
    id: "auth-govinda",
    title: "Dr.",
    firstName: "Govinda",
    middleName: "Kumar",
    surname: "Shah",
    email: "doc.govinda@gmail.com",
    orcid: "0000-0002-1825-0097",
    affiliation: "Department of Medicine, Oxford",
    isCorresponding: true,
    creditRoles: ["Conceptualization", "Methodology"],
  };

  const project: any = {
    projectId: "proj-ja-01",
    outputTypeId: "OT-06",
    title: "Clinical Efficacy of Prime Editing in In Vivo Models",
    answers: {
      working_title: "Clinical Efficacy of Prime Editing in In Vivo Models",
      article_type: "Original Research",
    },
    authors: [initialAuthor],
    intakeCompleteness: 1,
    hasDocument: false,
    gates: [],
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it("stores author for the specific user when saved in Journal Article", async () => {
    const onSaved = vi.fn();

    render(
      <DefinitionStage
        projectId="proj-ja-01"
        project={project}
        onSaved={onSaved}
      />
    );

    // Navigate to Authorship & CRediT tab
    fireEvent.click(screen.getByText(/3\. Authorship & CRediT/i));

    // Verify initial author is displayed
    expect(screen.getByDisplayValue("Govinda")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Shah")).toBeInTheDocument();

    // Change affiliation to trigger auto-save
    const affilInput = screen.getByDisplayValue("Department of Medicine, Oxford");
    fireEvent.change(affilInput, { target: { value: "Harvard Medical School" } });

    // Wait for debounced auto-save to run
    await waitFor(() => {
      expect(api.saveAuthors).toHaveBeenCalled();
    }, { timeout: 2000 });

    // Verify author is now stored for that specific user
    const savedAuthors = getLocalSavedAuthors(userEmail);
    expect(savedAuthors.length).toBeGreaterThanOrEqual(1);
    const govinda = savedAuthors.find((a) => a.surname === "Shah");
    expect(govinda).toBeDefined();
    expect(govinda?.firstName).toBe("Govinda");
  });

  it("allows selecting and quick-adding a saved author into the manuscript", async () => {
    // Pre-save a co-author for Dr. Govinda
    saveAuthorForUser(
      {
        id: "auth-coauthor",
        title: "Prof.",
        firstName: "Sarah",
        surname: "Connor",
        email: "sarah.connor@cyberdyne.org",
        affiliation: "Robotics Institute",
        isCorresponding: false,
        creditRoles: ["Investigation", "Software"],
      },
      userEmail
    );

    const onSaved = vi.fn();
    render(
      <DefinitionStage
        projectId="proj-ja-01"
        project={project}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByText(/3\. Authorship & CRediT/i));

    // "Sarah Connor" is not in the manuscript yet, so quick add chip should be visible
    expect(screen.getByText(/Prof\. Sarah Connor/i)).toBeInTheDocument();

    // Click quick add button
    fireEvent.click(screen.getByText(/Prof\. Sarah Connor/i));

    // Author should now be added to the manuscript
    expect(screen.getByDisplayValue("Sarah")).toBeInTheDocument();
    expect(screen.getByDisplayValue("Connor")).toBeInTheDocument();
    expect(screen.getByDisplayValue("sarah.connor@cyberdyne.org")).toBeInTheDocument();
  });

  it("allows removing an author from the manuscript", async () => {
    const onSaved = vi.fn();
    render(
      <DefinitionStage
        projectId="proj-ja-01"
        project={project}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByText(/3\. Authorship & CRediT/i));

    expect(screen.getByDisplayValue("Govinda")).toBeInTheDocument();

    // Click remove author button on author card
    const removeBtn = screen.getByTitle(/Remove Author/i);
    fireEvent.click(removeBtn);

    // Author is removed from manuscript
    expect(screen.queryByDisplayValue("Govinda")).toBeNull();
    expect(screen.getByText(/No authors registered yet/i)).toBeInTheDocument();
  });

  it("allows removing an author from the user's permanent saved roster", async () => {
    saveAuthorForUser(
      {
        id: "auth-to-delete",
        title: "Dr.",
        firstName: "Temporary",
        surname: "Collaborator",
        email: "temp@example.com",
        isCorresponding: false,
        creditRoles: [],
      },
      userEmail
    );

    expect(getLocalSavedAuthors(userEmail).some((a) => a.surname === "Collaborator")).toBe(true);

    const onSaved = vi.fn();
    render(
      <DefinitionStage
        projectId="proj-ja-01"
        project={project}
        onSaved={onSaved}
      />
    );

    fireEvent.click(screen.getByText(/3\. Authorship & CRediT/i));

    // Open Saved Authors modal
    const manageBtn = screen.getByTitle(/View and manage your personal saved author roster/i);
    fireEvent.click(manageBtn);

    expect(screen.getByRole("heading", { name: /My Saved Authors/i })).toBeInTheDocument();
    expect(screen.getAllByText(/Temporary Collaborator/i).length).toBeGreaterThanOrEqual(1);

    // Remove from saved roster
    const deleteSavedBtn = screen.getByLabelText(/Remove Dr\. Temporary Collaborator from saved authors/i);
    fireEvent.click(deleteSavedBtn);

    // Verify deleted from user's roster
    expect(getLocalSavedAuthors(userEmail).some((a) => a.surname === "Collaborator")).toBe(false);
  });
});
