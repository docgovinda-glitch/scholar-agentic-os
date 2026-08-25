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

describe("the document-type dropdown", () => {
  it("groups options by curated academic formats", async () => {
    await openChooser();

    const select = screen.getByLabelText("Target Publication Type") as HTMLSelectElement;
    const groupLabels = Array.from(select.querySelectorAll("optgroup")).map((g) => g.getAttribute("label"));

    expect(groupLabels.filter((l) => l === "Journal Article")).toHaveLength(1);
    expect(within(select).getByRole("option", { name: "Assignment" })).toBeInTheDocument();
    expect(within(select).getAllByRole("option", { name: "Journal Article" })[0]).toBeInTheDocument();
  });

  it("cannot continue before a type is chosen", async () => {
    await openChooser();
    expect(screen.getByRole("button", { name: "Boot Workspace" })).toBeDisabled();
  });

  it("creates the project for the selected type only after Continue is pressed, not on selection alone", async () => {
    await openChooser();
    createProject.mockResolvedValue({ projectId: "proj-1" });

    fireEvent.change(screen.getByLabelText("Target Publication Type"), { target: { value: "OT-06" } });
    expect(createProject).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Boot Workspace" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Boot Workspace" }));
    expect(createProject).toHaveBeenCalledWith("OT-06");
  });

  it("shows every type enabled and ready to boot without maintenance restrictions", async () => {
    await openChooser();

    const select = screen.getByLabelText("Target Publication Type") as HTMLSelectElement;
    const assignment = within(select).getByRole("option", { name: "Assignment" }) as HTMLOptionElement;
    expect(assignment.disabled).toBe(false);

    const journalArticle = within(select).getAllByRole("option", { name: "Journal Article" })[0] as HTMLOptionElement;
    expect(journalArticle.disabled).toBe(false);
  });
});

// Section 11: the one-time Workshop welcome shown right after onboarding.
describe("the Workshop welcome banner", () => {
  it("shows and consumes the one-time flag when the caller signals onboarding just finished", async () => {
    listProjects.mockResolvedValue({ items: [] });
    const onWelcomeSeen = vi.fn();
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} showWelcome onWelcomeSeen={onWelcomeSeen} />);

    expect(await screen.findByText("Welcome to your Command Center")).toBeInTheDocument();
    expect(onWelcomeSeen).toHaveBeenCalled();
  });

  it("stays visible until dismissed, even though the flag was already consumed", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} showWelcome onWelcomeSeen={vi.fn()} />);

    const banner = await screen.findByText("Welcome to your Command Center");
    expect(banner).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Welcome to your Command Center")).not.toBeInTheDocument();
  });

  it("never shows for a returning user with nothing to welcome them to", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    await screen.findByText("Initialize your first project");
    expect(screen.queryByText("Welcome to your Command Center")).not.toBeInTheDocument();
  });
});
