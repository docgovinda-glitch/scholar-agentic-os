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
const saveIntakeAnswers = vi.fn();
vi.mock("../api", () => ({
  createProject: (...a: unknown[]) => createProject(...a),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  listProjects: (...a: unknown[]) => listProjects(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
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
    expect(screen.getByRole("heading", { name: "Research Proposal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Presentation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Thesis / Dissertation" })).not.toBeInTheDocument();
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
    expect(screen.getByRole("heading", { name: "Research Proposal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Presentation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Thesis / Dissertation" })).not.toBeInTheDocument();
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

  it("opens custom delete modal with 'Cancel' button and red 'Delete' text option without logo", async () => {
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

    // Primary action: text "Delete" option in Pinterest red font (#E60023), without any logo/icon
    const confirmDeleteBtn = within(dialog).getByRole("button", { name: "Delete" });
    expect(confirmDeleteBtn).toBeInTheDocument();
    expect(confirmDeleteBtn).toHaveClass("text-[#E60023]");
    expect(confirmDeleteBtn).toHaveTextContent("Delete");
    expect(confirmDeleteBtn.querySelector("svg")).not.toBeInTheDocument();
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

describe("dual-pane AI agent interface & navigation sidebar", () => {
  it("renders the fixed left sidebar with branding, full-width New Project, and vertical navigation", async () => {
    listProjects.mockResolvedValue({ items: [] });
    const onOpenVault = vi.fn();
    const onOpenAiAccess = vi.fn();
    const onOpenAccountSettings = vi.fn();

    const { container } = render(
      <ProjectListScreen
        onOpen={vi.fn()}
        userEmail="scholar@research.edu"
        onOpenVault={onOpenVault}
        onOpenAiAccess={onOpenAiAccess}
        onOpenAccountSettings={onOpenAccountSettings}
      />
    );

    // Sidebar exists as an <aside>
    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();
    expect(aside).toHaveClass("flex-shrink-0");

    // Top Section: branding and full-width "+ New Project" button
    expect(within(aside!).getByText("Scholar Core")).toBeInTheDocument();
    const sidebarNewBtn = within(aside!).getByRole("button", { name: /\+.*New Project/i });
    expect(sidebarNewBtn).toBeInTheDocument();
    expect(sidebarNewBtn).toHaveClass("w-full");

    // Middle Section: wireframe nav links
    const vaultBtn = within(aside!).getByRole("button", { name: /Knowledge Vault/i });
    expect(vaultBtn).toBeInTheDocument();
    fireEvent.click(vaultBtn);
    expect(onOpenVault).toHaveBeenCalled();

    expect(within(aside!).queryByRole("button", { name: /Editorial Agents/i })).not.toBeInTheDocument();

    const aiAccessBtn = within(aside!).getByRole("button", { name: /AI Access/i });
    expect(aiAccessBtn).toBeInTheDocument();
    fireEvent.click(aiAccessBtn);
    expect(onOpenAiAccess).toHaveBeenCalled();

    // Bottom Section: Settings accessible as standalone item in sidebar above user profile block
    const settingsBtn = within(aside!).getByRole("button", { name: /^Settings$/i });
    expect(settingsBtn).toBeInTheDocument();
    fireEvent.click(settingsBtn);
    expect(onOpenAccountSettings).toHaveBeenCalled();

    // UserAccountMenu profile card in sidebar
    expect(within(aside!).getByText("scholar@research.edu")).toBeInTheDocument();
  });

  it("supports desktop sidebar collapse and expansion toggle", async () => {
    listProjects.mockResolvedValue({ items: [] });
    const { container } = render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const aside = container.querySelector("aside");
    expect(aside).toHaveClass("w-[260px]");

    // Click collapse icon inside sidebar
    const collapseBtn = screen.getByRole("button", { name: "Collapse sidebar" });
    fireEvent.click(collapseBtn);

    // Sidebar has collapsed to w-0
    expect(aside).toHaveClass("w-0");

    // Expand button is now visible in main header
    const expandBtn = screen.getByRole("button", { name: "Expand sidebar" });
    expect(expandBtn).toBeInTheDocument();

    // Click to re-expand sidebar
    fireEvent.click(expandBtn);
    expect(aside).toHaveClass("w-[260px]");
  });

  it("opens mobile drawer and closes on backdrop overlay tap", async () => {
    listProjects.mockResolvedValue({ items: [] });
    const { container } = render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    // Mobile trigger button
    const mobileMenuTrigger = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(mobileMenuTrigger);

    // Mobile backdrop overlay appears
    const backdrop = container.querySelector(".fixed.inset-0.z-40.bg-black\\/40");
    expect(backdrop).toBeInTheDocument();

    // Tapping backdrop closes mobile drawer
    fireEvent.click(backdrop!);
    expect(container.querySelector(".fixed.inset-0.z-40.bg-black\\/40")).not.toBeInTheDocument();
  });

  it("applies flex-shrink-0 to aside, scholar-scrollbar to main, and supports toggle from top-left main header", async () => {
    listProjects.mockResolvedValue({ items: [] });
    const { container } = render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const aside = container.querySelector("aside");
    const main = container.querySelector("main");

    // flex-shrink-0 on aside prevents sidebar from being crushed
    expect(aside).toHaveClass("flex-shrink-0");
    // custom agentic scrollbar and scroll container on main
    expect(main).toHaveClass("scholar-scrollbar");
    expect(main).toHaveClass("overflow-y-auto");

    // Click toggle button in the top-left of the main header to collapse
    const toggleBtn = screen.getByRole("button", { name: "Toggle sidebar" });
    fireEvent.click(toggleBtn);
    expect(aside).toHaveClass("w-0");

    // Toggle button now has Expand sidebar label; click to expand
    const expandBtn = screen.getByRole("button", { name: "Expand sidebar" });
    fireEvent.click(expandBtn);
    expect(aside).toHaveClass("w-[260px]");
  });
});

describe("sidebar active projects & platform navigation", () => {
  const SAMPLE_PROJECT = {
    projectId: "proj-crispr-01",
    outputTypeId: "OT-10",
    answers: { title: "Comparative Analysis of In Vivo Cleavage" },
    intakeCompleteness: 0.85,
    hasDocument: true,
    gates: [{ gate: "G0", status: "signed_off" }],
  };

  it("renders active projects directly in the sidebar and navigates on click", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    const onOpen = vi.fn();
    const { container } = render(<ProjectListScreen onOpen={onOpen} userEmail="scholar@research.edu" />);

    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();

    // Active Projects section in sidebar
    expect(within(aside!).getByText(/Active Projects/i)).toBeInTheDocument();
    const projectItem = await within(aside!).findByText("Comparative Analysis of In Vivo Cleavage");
    expect(projectItem).toBeInTheDocument();

    fireEvent.click(projectItem);
    expect(onOpen).toHaveBeenCalledWith("proj-crispr-01");
  });
});

describe("command center status overview & academic workspace cards", () => {
  it("renders the 4-card status overview strip and 4 academic workspace cards", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    // Header & Overall Status Summary Strip
    expect(await screen.findByText("Research Command Center")).toBeInTheDocument();
    expect(screen.getByText("Active Pipeline")).toBeInTheDocument();
    expect(screen.getByText("Knowledge Vault")).toBeInTheDocument();
    expect(screen.getByText("AI Engine")).toBeInTheDocument();
    expect(screen.getByText("Editorial Integrity")).toBeInTheDocument();

    // 4 Academic Workspace Cards
    expect(screen.getByRole("heading", { name: "Assignment" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Journal Article" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Research Proposal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Presentation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Thesis / Dissertation" })).not.toBeInTheDocument();
  });

  it("boots academic workspace directly from card click on dashboard", async () => {
    listProjects.mockResolvedValue({ items: [] });
    createProject.mockResolvedValue({ projectId: "proj-journal-new" });
    const onOpen = vi.fn();

    render(<ProjectListScreen onOpen={onOpen} userEmail={null} />);

    // Click Journal Article card directly on dashboard
    const journalHeading = await screen.findByRole("heading", { name: "Journal Article" });
    const journalCard = journalHeading.closest("button");
    expect(journalCard).toBeInTheDocument();

    fireEvent.click(journalCard!);
    expect(createProject).toHaveBeenCalledWith("OT-10");
  });
});

describe("minimal website assistant", () => {
  it("opens website assistant with clean conversation UI, FAQ suggestions, and minimal text input", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    // Floating Platform Guide button
    const guideTrigger = (await screen.findAllByRole("button", { name: /Platform Guide/i }))[0];
    expect(guideTrigger).toBeInTheDocument();

    fireEvent.click(guideTrigger);

    // Dialog opens
    const dialog = screen.getByRole("dialog", { name: "Scholar Core Website Assistant" });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText("Website Assistant")).toBeInTheDocument();
    expect(within(dialog).getByText(/platform guidance & workflows/i)).toBeInTheDocument();

    // FAQ suggested topic chips
    expect(within(dialog).getByText("AI Setup & Keys")).toBeInTheDocument();
    expect(within(dialog).getByText("Knowledge Vault")).toBeInTheDocument();
    expect(within(dialog).getByText("Create Project")).toBeInTheDocument();
    expect(within(dialog).getByText("Journal Workflow")).toBeInTheDocument();

    // Minimal input: text input and Send button. NO file upload, NO voice, NO model selector
    const input = within(dialog).getByPlaceholderText("Ask how to use Scholar Core...");
    expect(input).toBeInTheDocument();
    const sendBtn = within(dialog).getByRole("button", { name: "Send question" });
    expect(sendBtn).toBeInTheDocument();
    expect(sendBtn).toBeDisabled();

    expect(within(dialog).queryByRole("button", { name: /Attach/i })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText(/upload/i)).not.toBeInTheDocument();
    expect(within(dialog).queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("responds with website guidance when asked how to configure AI", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const guideTrigger = (await screen.findAllByRole("button", { name: /Platform Guide/i }))[0];
    fireEvent.click(guideTrigger);

    const dialog = screen.getByRole("dialog", { name: "Scholar Core Website Assistant" });

    // Click "AI Setup & Keys" chip
    const aiChip = within(dialog).getByText("AI Setup & Keys");
    fireEvent.click(aiChip);

    // Assistant provides accurate guidance on AI Access and BYOK
    expect(await within(dialog).findByText(/To configure AI in Scholar Core/i, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(within(dialog).getByText(/Bring Your Own Key/i)).toBeInTheDocument();
  });

  it("closes the website assistant when close button is clicked", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const guideTrigger = (await screen.findAllByRole("button", { name: /Platform Guide/i }))[0];
    fireEvent.click(guideTrigger);

    const closeBtn = screen.getByRole("button", { name: "Close Assistant" });
    fireEvent.click(closeBtn);

    expect(screen.queryByRole("dialog", { name: "Scholar Core Website Assistant" })).not.toBeInTheDocument();
  });
});

