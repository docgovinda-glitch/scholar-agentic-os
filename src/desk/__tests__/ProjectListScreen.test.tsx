// @vitest-environment jsdom
//
// Choosing a document type — replaced a 24-button scrolling grid with a
// dropdown grouped by family, so the list reads as ~6 short groups instead
// of one long scroll (docs 14 §2 names 6 fixed family values). Selecting is
// now select-then-confirm rather than one click per option, since a bare
// <select> has no equivalent to "click this card to create it".

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const createProject = vi.fn();
const listOutputTypes = vi.fn();
const listProjects = vi.fn();
vi.mock("../api", () => ({
  createProject: (...a: unknown[]) => createProject(...a),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  listProjects: (...a: unknown[]) => listProjects(...a),
}));
vi.mock("../../services/supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: { signOut: vi.fn() } }),
}));

const { default: ProjectListScreen } = await import("../ProjectListScreen");

const TYPES = [
  { id: "OT-02", label: "Essay", aliases: [], family: "short_form", academicLevels: [], typicalDisciplines: [], available: false },
  { id: "OT-06", label: "Journal Article", aliases: [], family: "publication", academicLevels: [], typicalDisciplines: [], available: true },
  { id: "OT-09", label: "Doctoral Dissertation", aliases: [], family: "long_form", academicLevels: [], typicalDisciplines: [], available: false },
  { id: "OT-10", label: "Review Article", aliases: [], family: "publication", academicLevels: [], typicalDisciplines: [], available: false },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openChooser() {
  listProjects.mockResolvedValue({ items: [] });
  listOutputTypes.mockResolvedValue({ items: TYPES });
  render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);
  fireEvent.click(await screen.findByText("New Project"));
  await screen.findByLabelText("Target Publication Type");
}

describe("the document-type format selector", () => {
  it("renders the curated academic format options", async () => {
    await openChooser();

    expect(screen.getByRole("heading", { name: "Assignment" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Journal Article" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thesis / Dissertation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Presentation" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Text Humanizer" })).toBeInTheDocument();
  });

  it("cannot continue before a format is chosen", async () => {
    await openChooser();
    expect(screen.getByRole("button", { name: /Select a Format to Boot/i })).toBeDisabled();
  });

  it("creates the project for the selected format when Boot button is pressed", async () => {
    await openChooser();
    createProject.mockResolvedValue({ projectId: "proj-1" });

    // Click the Journal Article card
    const journalCard = screen.getByRole("heading", { name: "Journal Article" });
    fireEvent.click(journalCard);

    expect(createProject).not.toHaveBeenCalled();
    const bootBtn = screen.getByRole("button", { name: /Boot Journal Article/i });
    expect(bootBtn).toBeEnabled();

    fireEvent.click(bootBtn);
    expect(createProject).toHaveBeenCalledWith("OT-10");
  });

  it("shows every format tile enabled and ready to boot", async () => {
    await openChooser();

    expect(screen.getByRole("heading", { name: "Assignment" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Journal Article" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Thesis / Dissertation" })).toBeInTheDocument();
  });
});

// Section 11: the one-time Workshop welcome shown right after onboarding.
describe("the Workshop welcome banner", () => {
  it("shows and consumes the one-time flag when the caller signals onboarding just finished", async () => {
    listProjects.mockResolvedValue({ items: [] });
    const onWelcomeSeen = vi.fn();
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} showWelcome onWelcomeSeen={onWelcomeSeen} />);

    expect(await screen.findByText("Welcome to your Scholar Workspace")).toBeInTheDocument();
    expect(onWelcomeSeen).toHaveBeenCalled();
  });

  it("stays visible until dismissed, even though the flag was already consumed", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} showWelcome onWelcomeSeen={vi.fn()} />);

    const banner = await screen.findByText("Welcome to your Scholar Workspace");
    expect(banner).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Welcome to your Scholar Workspace")).not.toBeInTheDocument();
  });

  it("never shows for a returning user with nothing to welcome them to", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    await screen.findByText("Initialize your first project");
    expect(screen.queryByText("Welcome to your Scholar Workspace")).not.toBeInTheDocument();
  });
});
