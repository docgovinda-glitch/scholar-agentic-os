// @vitest-environment jsdom

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import type { ProjectView } from "../../types";

const listProjects = vi.fn();
const listOutputTypes = vi.fn();
const deleteProject = vi.fn();
const saveIntakeAnswers = vi.fn();
vi.mock("../../api", () => ({
  listProjects: (...a: unknown[]) => listProjects(...a),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
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
    sessionStorage.clear();
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

  it("renders the Knowledge Vault header and Sources tab by default", async () => {
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

    // Verify Sources tab is default
    expect(await screen.findByTestId("mock-source-library")).toBeInTheDocument();
  });

  it("a failed project load shows the error with a retry, not an empty vault (B7)", async () => {
    listProjects.mockReset();
    listProjects.mockRejectedValueOnce(new Error("network down")).mockResolvedValueOnce({ items: SAMPLE_PROJECTS });
    render(<KnowledgeVault userId="user-123" initialTab="projects" onClose={vi.fn()} onOpenProject={vi.fn()} />);

    expect(await screen.findByText("Failed to load projects")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry Connection" }));
    expect(await screen.findByText("Genome Editing in Marine Diatoms")).toBeInTheDocument();
  });

  it("filters projects by search query in the Vault", async () => {
    render(
      <KnowledgeVault
        userId="user-123"
        initialTab="projects"
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
        initialTab="projects"
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
        initialTab="projects"
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
        initialTab="projects"
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
    expect(confirmBtn).toHaveClass("text-danger");
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(deleteProject).toHaveBeenCalledWith("proj-1");
    });
  });

  it("switches tabs between Projects, Sources, and Settings", async () => {
    render(
      <KnowledgeVault
        userId="user-123"
        initialTab="projects"
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

  it("displays distinct format-aware placeholder heading for untitled projects", async () => {
    const untitledProjects: ProjectView[] = [
      {
        projectId: "proj-untitled-assign",
        outputTypeId: "OT-01",
        answers: {},
        intakeCompleteness: 0,
        hasDocument: false,
        gates: [],
      },
      {
        projectId: "proj-untitled-pres",
        outputTypeId: "OT-22",
        answers: {},
        intakeCompleteness: 0,
        hasDocument: false,
        gates: [],
      },
    ];

    listProjects.mockResolvedValue({ items: untitledProjects });

    render(
      <KnowledgeVault
        userId="user-123"
        initialTab="projects"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    expect(await screen.findByText("Untitled Assignment")).toBeInTheDocument();
    expect(await screen.findByText("Untitled Presentation")).toBeInTheDocument();
  });

  it("allows inline editing of project heading directly on Vault card and saves via saveIntakeAnswers", async () => {
    saveIntakeAnswers.mockResolvedValue({ success: true });
    const onProjectRenamed = vi.fn();

    render(
      <KnowledgeVault
        userId="user-123"
        initialTab="projects"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
        onProjectRenamed={onProjectRenamed}
      />
    );

    // Initial heading is rendered
    const titleEl = await screen.findByText("Philosophy of Science Essay");
    expect(titleEl).toBeInTheDocument();

    // Click the Edit project heading pencil button
    const editBtns = screen.getAllByRole("button", { name: "Edit project heading" });
    fireEvent.click(editBtns[1]); // second project "Philosophy of Science Essay"

    // Input field should now appear with the current title
    const input = screen.getByDisplayValue("Philosophy of Science Essay");
    expect(input).toBeInTheDocument();

    // Type a new heading
    fireEvent.change(input, { target: { value: "Epistemology and Scientific Realism" } });

    // Click the Save button (checkmark)
    const saveBtn = screen.getByRole("button", { name: "Save heading" });
    fireEvent.click(saveBtn);

    // Assert that the title optimistically updates in UI
    expect(await screen.findByText("Epistemology and Scientific Realism")).toBeInTheDocument();

    // Assert saveIntakeAnswers and onProjectRenamed were called with new heading
    expect(saveIntakeAnswers).toHaveBeenCalledWith("proj-2", {
      title: "Epistemology and Scientific Realism",
      working_title: "Epistemology and Scientific Realism",
      assignment_title: "Epistemology and Scientific Realism",
    });
    expect(onProjectRenamed).toHaveBeenCalledWith("proj-2", "Epistemology and Scientific Realism");
  });

  it("prevents saving duplicate project headings with an inline error message", async () => {
    render(
      <KnowledgeVault
        userId="user-123"
        initialTab="projects"
        onClose={vi.fn()}
        onOpenProject={vi.fn()}
      />
    );

    await screen.findByText("Philosophy of Science Essay");

    // Click edit on the second project
    const editBtns = screen.getAllByRole("button", { name: "Edit project heading" });
    fireEvent.click(editBtns[1]);

    const input = screen.getByDisplayValue("Philosophy of Science Essay");

    // Change title to match the first project's title ("Genome Editing in Marine Diatoms")
    fireEvent.change(input, { target: { value: "genome editing in marine diatoms" } });

    const saveBtn = screen.getByRole("button", { name: "Save heading" });
    fireEvent.click(saveBtn);

    // Duplicate error message should appear
    expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    // saveIntakeAnswers should NOT have been called
    expect(saveIntakeAnswers).not.toHaveBeenCalled();
  });

  describe("Project View Options (List vs Card View)", () => {
    beforeEach(() => {
      window.localStorage.clear();
    });

    it("renders the view toggle switcher with Card and List buttons", async () => {
      render(
        <KnowledgeVault
          userId="user-123"
          initialTab="projects"
          onClose={vi.fn()}
          onOpenProject={vi.fn()}
        />
      );

      await screen.findByText("Genome Editing in Marine Diatoms");

      const cardBtn = screen.getByTestId("project-view-card-btn");
      const listBtn = screen.getByTestId("project-view-list-btn");
      expect(cardBtn).toBeInTheDocument();
      expect(listBtn).toBeInTheDocument();

      // Card view is default
      expect(screen.getByTestId("project-card-grid")).toBeInTheDocument();
      expect(screen.queryByTestId("project-list-view")).not.toBeInTheDocument();
    });

    it("switches to List View upon toggle click and persists to localStorage", async () => {
      render(
        <KnowledgeVault
          userId="user-123"
          initialTab="projects"
          onClose={vi.fn()}
          onOpenProject={vi.fn()}
        />
      );

      await screen.findByText("Genome Editing in Marine Diatoms");

      const listBtn = screen.getByTestId("project-view-list-btn");
      fireEvent.click(listBtn);

      // Verify list view is rendered and card grid is removed
      expect(screen.getByTestId("project-list-view")).toBeInTheDocument();
      expect(screen.queryByTestId("project-card-grid")).not.toBeInTheDocument();
      expect(window.localStorage.getItem("scholar_vault_project_view_mode")).toBe("list");

      // Verify both projects are rendered as list items
      expect(screen.getByTestId("project-list-item-proj-1")).toBeInTheDocument();
      expect(screen.getByTestId("project-list-item-proj-2")).toBeInTheDocument();

      // Switch back to Card View
      const cardBtn = screen.getByTestId("project-view-card-btn");
      fireEvent.click(cardBtn);

      expect(screen.getByTestId("project-card-grid")).toBeInTheDocument();
      expect(screen.queryByTestId("project-list-view")).not.toBeInTheDocument();
      expect(window.localStorage.getItem("scholar_vault_project_view_mode")).toBe("card");
    });

    it("restores List View from localStorage on mount", async () => {
      window.localStorage.setItem("scholar_vault_project_view_mode", "list");

      render(
        <KnowledgeVault
          userId="user-123"
          initialTab="projects"
          onClose={vi.fn()}
          onOpenProject={vi.fn()}
        />
      );

      await screen.findByText("Genome Editing in Marine Diatoms");

      expect(screen.getByTestId("project-list-view")).toBeInTheDocument();
      expect(screen.queryByTestId("project-card-grid")).not.toBeInTheDocument();
    });

    it("supports opening workspace from List View via button, icon, and title", async () => {
      window.localStorage.setItem("scholar_vault_project_view_mode", "list");
      const onOpenProject = vi.fn();

      render(
        <KnowledgeVault
          userId="user-123"
          initialTab="projects"
          onClose={vi.fn()}
          onOpenProject={onOpenProject}
        />
      );

      await screen.findByText("Genome Editing in Marine Diatoms");

      const listItem = screen.getByTestId("project-list-item-proj-1");
      const openBtn = within(listItem).getByRole("button", { name: /Open Workspace/i });
      fireEvent.click(openBtn);

      expect(onOpenProject).toHaveBeenCalledWith("proj-1");

      // Clicking title also triggers open
      const title = within(listItem).getByText("Genome Editing in Marine Diatoms");
      fireEvent.click(title);
      expect(onOpenProject).toHaveBeenCalledWith("proj-1");
    });

    it("supports inline rename and delete in List View", async () => {
      window.localStorage.setItem("scholar_vault_project_view_mode", "list");
      saveIntakeAnswers.mockResolvedValue({ success: true });
      deleteProject.mockResolvedValue({ success: true });
      const onProjectRenamed = vi.fn();

      render(
        <KnowledgeVault
          userId="user-123"
          initialTab="projects"
          onClose={vi.fn()}
          onOpenProject={vi.fn()}
          onProjectRenamed={onProjectRenamed}
        />
      );

      await screen.findByText("Philosophy of Science Essay");

      const listItem = screen.getByTestId("project-list-item-proj-2");

      // Test inline rename
      const editBtn = within(listItem).getByRole("button", { name: "Edit project heading" });
      fireEvent.click(editBtn);

      const input = screen.getByDisplayValue("Philosophy of Science Essay");
      fireEvent.change(input, { target: { value: "Karl Popper and Falsification" } });
      const saveBtn = screen.getByRole("button", { name: "Save heading" });
      fireEvent.click(saveBtn);

      expect(await screen.findByText("Karl Popper and Falsification")).toBeInTheDocument();
      expect(saveIntakeAnswers).toHaveBeenCalledWith("proj-2", expect.objectContaining({
        title: "Karl Popper and Falsification",
      }));

      // Test delete modal trigger from List View
      const deleteBtn = within(listItem).getByRole("button", { name: "Delete Project" });
      fireEvent.click(deleteBtn);

      // Confirmation modal should be visible
      const modal = await screen.findByRole("dialog");
      expect(within(modal).getByRole("heading", { name: "Delete Project" })).toBeInTheDocument();

      const confirmDeleteBtn = within(modal).getByRole("button", { name: "Delete" });
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(deleteProject).toHaveBeenCalledWith("proj-2");
      });
    });
  });
});
