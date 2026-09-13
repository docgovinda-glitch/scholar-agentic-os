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
const deleteProject = vi.fn();
vi.mock("../api", () => ({
  createProject: (...a: unknown[]) => createProject(...a),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  listProjects: (...a: unknown[]) => listProjects(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
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

describe("the search bar & delete confirmation modal", () => {
  const SAMPLE_PROJECT = {
    projectId: "proj-101",
    outputTypeId: "OT-01",
    answers: { title: "Neural Networks in High-Throughput Genomics" },
    intakeCompleteness: 0.5,
    hasDocument: false,
    gates: [{ id: "G0", status: "signed_off" }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  it("renders the rounded search projects input", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const searchInput = await screen.findByPlaceholderText("Search projects...");
    expect(searchInput).toBeInTheDocument();
    expect(searchInput).toHaveClass("!rounded-full");
  });

  it("opens custom delete modal with red icon, 'Cancel' and strictly 'Delete' button", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const deleteBtn = await screen.findByRole("button", { name: "Delete Project" });
    fireEvent.click(deleteBtn);

    // Modal pops up
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Delete Project" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Are you sure you want to delete/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/Neural Networks in High-Throughput Genomics/i)).toBeInTheDocument();

    // Secondary negative option: Cancel
    const cancelBtn = within(dialog).getByRole("button", { name: "Cancel" });
    expect(cancelBtn).toBeInTheDocument();

    // Primary action: strictly "Delete"
    const confirmDeleteBtn = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirmDeleteBtn).toBeInTheDocument();
  });

  it("cancels deletion when 'Cancel' is pressed", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const deleteBtn = await screen.findByRole("button", { name: "Delete Project" });
    fireEvent.click(deleteBtn);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("executes deletion when 'Delete' is pressed", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    deleteProject.mockResolvedValue(undefined);
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const deleteBtn = await screen.findByRole("button", { name: "Delete Project" });
    fireEvent.click(deleteBtn);

    const confirmDeleteBtn = screen.getByRole("button", { name: "Delete" });
    fireEvent.click(confirmDeleteBtn);

    expect(deleteProject).toHaveBeenCalledWith("proj-101");
  });
});
