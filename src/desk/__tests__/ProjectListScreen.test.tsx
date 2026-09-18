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

describe("conversational AI chatbot & interactive research blueprint launchpad", () => {
  it("renders the flagship chatbot prompt box, starter chips, and controls", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    expect(await screen.findByText("What would you like to write today?")).toBeInTheDocument();
    const textarea = screen.getByPlaceholderText(/Start a literature review, brainstorm an outline, or drop a syllabus here/i);
    expect(textarea).toBeInTheDocument();

    // Starter chips
    expect(screen.getByText("CRISPR Base Editing Review")).toBeInTheDocument();
    expect(screen.getByText("LLM Reasoning Benchmark")).toBeInTheDocument();
    expect(screen.getByText("Clean Energy Microgrid Proposal")).toBeInTheDocument();
    expect(screen.getByText("Clinical Trial Slide Deck")).toBeInTheDocument();

    // Toolbar controls
    expect(screen.getByRole("button", { name: /Attach/i })).toBeInTheDocument();
    expect(screen.getByText("Auto-Detect Format")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Vault Grounding/i })).toBeInTheDocument();
  });

  it("activates chatbot on starter chip click, generates blueprint, and supports project initialization", async () => {
    listProjects.mockResolvedValue({ items: [] });
    createProject.mockResolvedValue({ projectId: "proj-crispr" });
    const onOpen = vi.fn();

    render(<ProjectListScreen onOpen={onOpen} userEmail={null} />);

    // Click CRISPR starter chip
    const chip = await screen.findByText("CRISPR Base Editing Review");
    fireEvent.click(chip);

    // Chatbot window activates
    expect(await screen.findByText("Scholar Core Copilot")).toBeInTheDocument();
    expect(screen.getByText(/Multi-Agent Board Active/i)).toBeInTheDocument();

    // Blueprint card appears after async generation
    expect(await screen.findByText(/Biotechnology & Genome Engineering/i, {}, { timeout: 3000 })).toBeInTheDocument();
    expect(screen.getByText(/High-Fidelity Base Editing and Off-Target Reduction/i)).toBeInTheDocument();

    // Initialize button
    const initBtn = screen.getByRole("button", { name: /Initialize Journal Article/i });
    expect(initBtn).toBeInTheDocument();

    fireEvent.click(initBtn);
    expect(createProject).toHaveBeenCalledWith("OT-10");
  });

  it("supports minimize and resume of ongoing chat session", async () => {
    listProjects.mockResolvedValue({ items: [] });
    render(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const chip = await screen.findByText("Clinical Trial Slide Deck");
    fireEvent.click(chip);

    expect(await screen.findByText("Scholar Core Copilot")).toBeInTheDocument();
    expect(await screen.findByText(/Clinical Oncology & Translational Medicine/i, {}, { timeout: 3000 })).toBeInTheDocument();

    // Click Minimize
    const minBtn = screen.getByRole("button", { name: "Minimize" });
    fireEvent.click(minBtn);

    // Chat minimized, resume banner visible
    expect(screen.queryByText("Scholar Core Copilot")).not.toBeInTheDocument();
    const resumeBtn = screen.getByRole("button", { name: /Resume Active Chat/i });
    expect(resumeBtn).toBeInTheDocument();

    // Click Resume
    fireEvent.click(resumeBtn);
    expect(screen.getByText("Scholar Core Copilot")).toBeInTheDocument();
  });
});

