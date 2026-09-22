// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ProjectView } from "../../types";

const listProjects = vi.fn();
const listOutputTypes = vi.fn();
const deleteProject = vi.fn();
vi.mock("../../api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
}));

vi.mock("../../../services/vault/cloudDriveService", () => ({
  getConnectedCloudDrives: vi.fn().mockResolvedValue([]),
  connectCloudDrive: vi.fn(),
  disconnectCloudDrive: vi.fn(),
  listCloudDriveFiles: vi.fn().mockResolvedValue([]),
}));

vi.mock("../../../services/userVault", () => ({
  loadVault: vi.fn().mockResolvedValue(null),
}));

vi.mock("../SourceLibraryScreen", () => ({
  default: () => <div data-testid="mock-source-library">Source Library View</div>,
}));

vi.mock("../SettingsView", () => ({
  default: () => <div data-testid="mock-settings-view">Settings View</div>,
}));

const { default: KnowledgeVault } = await import("../KnowledgeVault");

const SAMPLE_PROJECTS: ProjectView[] = [
  {
    projectId: "proj-1",
    outputTypeId: "OT-10",
    answers: { title: "Genome Editing in Marine Diatoms" },
    intakeCompleteness: 0.8,
    hasDocument: true,
    gates: [
      { id: "G0", status: "signed_off" },
      { id: "G1", status: "signed_off" },
    ],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
  {
    projectId: "proj-2",
    outputTypeId: "OT-01",
    answers: { title: "Philosophy of Science Essay" },
    intakeCompleteness: 0.4,
    hasDocument: false,
    gates: [{ id: "G0", status: "signed_off" }],
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  },
];

describe("KnowledgeVault component", () => {
  beforeEach(() => {
    listProjects.mockResolvedValue({ items: SAMPLE_PROJECTS });
    listOutputTypes.mockResolvedValue({
      items: [
        { id: "OT-10", label: "Journal Article" },
        { id: "OT-01", label: "Assignment" },
      ],
    });
  });

  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("renders the Knowledge Vault header and Projects tab by default", async () => {
    render(
      <KnowledgeVault
        userId="user-123"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    expect(await screen.findByRole("heading", { name: "Knowledge Vault" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Projects/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sources/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Settings/i })).toBeInTheDocument();

    // Verify progress tracking metrics ribbon
    expect(await screen.findByText("Active Projects")).toBeInTheDocument();
    expect(screen.getByText("Quality Gates")).toBeInTheDocument();
    expect(screen.getByText("Overall Progress Average")).toBeInTheDocument();

    // Verify projects list
    expect(screen.getByText("Genome Editing in Marine Diatoms")).toBeInTheDocument();
    expect(screen.getByText("Philosophy of Science Essay")).toBeInTheDocument();
  });

  it("filters projects by search query in the Vault", async () => {
    render(
      <KnowledgeVault
        userId="user-123"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    await screen.findByText("Genome Editing in Marine Diatoms");
    const searchInput = screen.getByPlaceholderText("Search projects...");
    fireEvent.change(searchInput, { target: { value: "Marine Diatoms" } });

    expect(screen.getByText("Genome Editing in Marine Diatoms")).toBeInTheDocument();
    expect(screen.queryByText("Philosophy of Science Essay")).not.toBeInTheDocument();

    // Clear search
    const clearBtn = screen.getByRole("button", { name: "Clear search" });
    fireEvent.click(clearBtn);
    expect(screen.getByText("Philosophy of Science Essay")).toBeInTheDocument();
  });

  it("filters projects by format pill in the Vault", async () => {
    render(
      <KnowledgeVault
        userId="user-123"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    await screen.findByText("Genome Editing in Marine Diatoms");
    const allFilter = screen.getByRole("button", { name: /^All/i });
    const filterContainer = allFilter.parentElement!;
    const assignmentFilter = within(filterContainer).getByRole("button", { name: /^Assignment/i });
    fireEvent.click(assignmentFilter);

    expect(screen.queryByText("Genome Editing in Marine Diatoms")).not.toBeInTheDocument();
    expect(screen.getByText("Philosophy of Science Essay")).toBeInTheDocument();

    // Switch back to All
    fireEvent.click(allFilter);
    expect(screen.getByText("Genome Editing in Marine Diatoms")).toBeInTheDocument();
  });

  it("opens project workspace when Open Workspace is clicked", async () => {
    const onOpenProject = vi.fn();
    render(
      <KnowledgeVault
        userId="user-123"
        onClose={vi.fn()}
        onOpenProject={onOpenProject}
      />
    );

    const openBtn = (await screen.findAllByText(/Open Workspace/i))[0];
    fireEvent.click(openBtn);
    expect(onOpenProject).toHaveBeenCalledWith("proj-1");
  });

  it("opens custom Pinterest-red delete confirmation dialog and deletes project", async () => {
    deleteProject.mockResolvedValue(undefined);
    render(
      <KnowledgeVault
        userId="user-123"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    await screen.findByText("Genome Editing in Marine Diatoms");
    const deleteBtns = await screen.findAllByRole("button", { name: "Delete Project" });
    fireEvent.click(deleteBtns[0]);

    // Modal pops up
    const dialog = screen.getByRole("dialog");
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole("heading", { name: "Delete Project" })).toBeInTheDocument();
    expect(within(dialog).getByText(/Are you sure you want to delete/i)).toBeInTheDocument();

    // Click confirm delete
    const confirmBtn = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirmBtn).toHaveClass("text-[#E60023]");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith("proj-1");
    });
  });

  it("switches tabs between Projects, Sources, and Settings", async () => {
    render(
      <KnowledgeVault
        userId="user-123"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    await screen.findByText("Genome Editing in Marine Diatoms");

    // Click Sources tab
    const sourcesTab = screen.getByRole("button", { name: /Sources/i });
    fireEvent.click(sourcesTab);
    expect(screen.getByRole("button", { name: /Sources/i })).toHaveClass("bg-white");

    // Click Settings tab
    const settingsTab = screen.getByRole("button", { name: /Settings/i });
    fireEvent.click(settingsTab);
    expect(screen.getByRole("button", { name: /Settings/i })).toHaveClass("bg-white");
  });
});
