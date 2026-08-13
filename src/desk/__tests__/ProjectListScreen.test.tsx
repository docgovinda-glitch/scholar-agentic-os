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
  { id: "OT-02", label: "Essay", aliases: [], family: "short_form", academicLevels: [], typicalDisciplines: [] },
  { id: "OT-06", label: "Journal Article", aliases: [], family: "publication", academicLevels: [], typicalDisciplines: [] },
  { id: "OT-09", label: "Doctoral Dissertation", aliases: [], family: "long_form", academicLevels: [], typicalDisciplines: [] },
  { id: "OT-10", label: "Review Article", aliases: [], family: "publication", academicLevels: [], typicalDisciplines: [] },
];

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openChooser() {
  listProjects.mockResolvedValue({ items: [] });
  listOutputTypes.mockResolvedValue({ items: TYPES });
  render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);
  fireEvent.click(await screen.findByText("Create your first project"));
  await screen.findByLabelText("Document type");
}

describe("the document-type dropdown", () => {
  it("groups options by family instead of listing all 24 flat", async () => {
    await openChooser();

    const select = screen.getByLabelText("Document type") as HTMLSelectElement;
    const groupLabels = Array.from(select.querySelectorAll("optgroup")).map((g) => g.getAttribute("label"));

    // Two Publications-family entries collapse into one group, not two.
    expect(groupLabels.filter((l) => l === "Publications")).toHaveLength(1);
    expect(within(select).getByRole("option", { name: "Journal Article" })).toBeInTheDocument();
    expect(within(select).getByRole("option", { name: "Review Article" })).toBeInTheDocument();
  });

  it("cannot continue before a type is chosen", async () => {
    await openChooser();
    expect(screen.getByRole("button", { name: "Continue" })).toBeDisabled();
  });

  it("creates the project for the selected type only after Continue is pressed, not on selection alone", async () => {
    await openChooser();
    createProject.mockResolvedValue({ projectId: "proj-1" });

    fireEvent.change(screen.getByLabelText("Document type"), { target: { value: "OT-09" } });
    expect(createProject).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Continue" })).toBeEnabled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    expect(createProject).toHaveBeenCalledWith("OT-09");
  });
});

// Section 11: the one-time Workshop welcome shown right after onboarding.
describe("the Workshop welcome banner", () => {
  it("shows and consumes the one-time flag when the caller signals onboarding just finished", async () => {
    listProjects.mockResolvedValue({ items: [] });
    const onWelcomeSeen = vi.fn();
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} showWelcome onWelcomeSeen={onWelcomeSeen} />);

    expect(await screen.findByText("Welcome to Scholar Core")).toBeInTheDocument();
    expect(onWelcomeSeen).toHaveBeenCalled();
  });

  it("stays visible until dismissed, even though the flag was already consumed", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} showWelcome onWelcomeSeen={vi.fn()} />);

    const banner = await screen.findByText("Welcome to Scholar Core");
    expect(banner).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Welcome to Scholar Core")).not.toBeInTheDocument();
  });

  it("never shows for a returning user with nothing to welcome them to", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    await screen.findByText("No projects yet");
    expect(screen.queryByText("Welcome to Scholar Core")).not.toBeInTheDocument();
  });
});
