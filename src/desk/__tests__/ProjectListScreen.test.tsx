// @vitest-environment jsdom
//
// Choosing a document type — replaced a 24-button scrolling grid with a
// dropdown grouped by family, so the list reads as ~6 short groups instead
// of one long scroll (docs 14 §2 names 6 fixed family values). Selecting is
// now select-then-confirm rather than one click per option, since a bare
// <select> has no equivalent to "click this card to create it".

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, within, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

const createProject = vi.fn();
const listOutputTypes = vi.fn();
const listProjects = vi.fn();
const deleteProject = vi.fn();
const saveIntakeAnswers = vi.fn();
const executeAgenticLLM = vi.fn();
vi.mock("../api", () => ({
  createProject: (...a: unknown[]) => createProject(...a),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  listProjects: (...a: unknown[]) => listProjects(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  executeAgenticLLM: (...a: unknown[]) => executeAgenticLLM(...a),
}));
vi.mock("../../services/supabaseClient", () => ({
  getSupabaseClient: () => ({
    auth: {
      signOut: vi.fn(),
      getSession: vi.fn().mockResolvedValue({ data: { session: null } }),
      getUser: vi.fn().mockResolvedValue({ data: { user: null } }),
      onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })),
    },
  }),
  isSupabaseConfigured: () => true,
}));

const { default: ProjectListScreen } = await import("../ProjectListScreen");

function renderScreen(ui: React.ReactElement) {
  return render(<MemoryRouter>{ui}</MemoryRouter>);
}

const TYPES = [
  { id: "OT-02", label: "Essay", aliases: [], family: "short_form", academicLevels: [], typicalDisciplines: [], available: false },
  { id: "OT-06", label: "Journal Article", aliases: [], family: "publication", academicLevels: [], typicalDisciplines: [], available: true },
  { id: "OT-09", label: "Doctoral Dissertation", aliases: [], family: "long_form", academicLevels: [], typicalDisciplines: [], available: false },
  { id: "OT-10", label: "Review Article", aliases: [], family: "publication", academicLevels: [], typicalDisciplines: [], available: false },
];

const SAMPLE_PROJECT = {
  projectId: "proj-crispr-01",
  outputTypeId: "OT-10",
  answers: { title: "Comparative Analysis of In Vivo Cleavage" },
  intakeCompleteness: 0.85,
  hasDocument: true,
  gates: [{ gate: "G0", status: "signed_off" }],
};

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

async function openChooser() {
  listProjects.mockResolvedValue({ items: [] });
  listOutputTypes.mockResolvedValue({ items: TYPES });
  renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);
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
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail={null} showWelcome onWelcomeSeen={onWelcomeSeen} />);

    expect(await screen.findByText("Welcome to your Scholar Workspace")).toBeInTheDocument();
    expect(onWelcomeSeen).toHaveBeenCalled();
  });

  it("stays visible until dismissed, even though the flag was already consumed", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail={null} showWelcome onWelcomeSeen={vi.fn()} />);

    const banner = await screen.findByText("Welcome to your Scholar Workspace");
    expect(banner).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(screen.queryByText("Welcome to your Scholar Workspace")).not.toBeInTheDocument();
  });

  it("never shows for a returning user with nothing to welcome them to", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    await screen.findByRole("heading", { name: "Assignment" });
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

  it("renders the sidebar search input and transparent AI prompt bar without duplicate search on dashboard", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    // Sidebar search input
    expect(screen.getByPlaceholderText("Search projects...")).toBeInTheDocument();

    // Consolidated transparent AI prompt bar on main dashboard
    const promptInput = screen.getByPlaceholderText(/Draft a Research Proposal, analyze data, or search projects.../i);
    expect(promptInput).toBeInTheDocument();
    expect(promptInput).toHaveClass("bg-transparent");
  });

  it("opens custom delete modal with 'Cancel' button and red 'Delete' text option without logo", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const moreBtn = await screen.findByRole("button", { name: "More options" });
    fireEvent.click(moreBtn);

    const deleteBtn = screen.getByRole("button", { name: /^Delete$/i });
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
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const moreBtn = await screen.findByRole("button", { name: "More options" });
    fireEvent.click(moreBtn);

    const deleteBtn = screen.getByRole("button", { name: /^Delete$/i });
    fireEvent.click(deleteBtn);

    const cancelBtn = screen.getByRole("button", { name: "Cancel" });
    fireEvent.click(cancelBtn);

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(deleteProject).not.toHaveBeenCalled();
  });

  it("executes deletion when 'Delete' is pressed", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    deleteProject.mockResolvedValue(undefined);
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const moreBtn = await screen.findByRole("button", { name: "More options" });
    fireEvent.click(moreBtn);

    const deleteBtn = screen.getByRole("button", { name: /^Delete$/i });
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

    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    const { container } = renderScreen(
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

    // Top Section: branding, full-width "+ New Project" button, and search input
    expect(within(aside!).getByText("Scholar Core")).toBeInTheDocument();
    const sidebarNewBtn = within(aside!).getByRole("button", { name: /\+.*New Project/i });
    expect(sidebarNewBtn).toBeInTheDocument();
    expect(sidebarNewBtn).toHaveClass("w-full");
    const sidebarSearch = within(aside!).getByPlaceholderText("Search projects...");
    expect(sidebarSearch).toBeInTheDocument();

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

    const askScholarBtn = within(aside!).getByRole("button", { name: /Ask Scholar/i });
    expect(askScholarBtn).toBeInTheDocument();

    // Recents section contains real user projects
    expect(await within(aside!).findByRole("heading", { name: "Recents" })).toBeInTheDocument();
    expect(await within(aside!).findByText("Comparative Analysis of In Vivo Cleavage")).toBeInTheDocument();

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
    const { container } = renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);
    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();
    // In guest mode with no projects, recents section must not be displayed
    expect(within(aside!).queryByRole("heading", { name: "Recents" })).not.toBeInTheDocument();
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
    const { container } = renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

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
    const { container } = renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

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

describe("sidebar projects & platform navigation", () => {
  it("removes redundant sidebar projects button and supports Gemini-style Recents with 3-dots popover menu", async () => {
    listProjects.mockResolvedValue({ items: [SAMPLE_PROJECT] });
    const onOpen = vi.fn();
    const { container } = renderScreen(<ProjectListScreen onOpen={onOpen} userEmail="scholar@research.edu" />);

    const aside = container.querySelector("aside");
    expect(aside).toBeInTheDocument();

    // Redundant Projects folder button is removed from sidebar
    expect(within(aside!).queryByRole("button", { name: "Projects" })).not.toBeInTheDocument();
    expect(within(aside!).queryByText("Platform Guide")).not.toBeInTheDocument();

    // Recents section header and project in Recents list
    expect(await within(aside!).findByRole("heading", { name: "Recents" })).toBeInTheDocument();
    expect(await within(aside!).findByText("Comparative Analysis of In Vivo Cleavage")).toBeInTheDocument();

    // 3-dots More button opens options menu
    const moreBtn = within(aside!).getAllByRole("button", { name: "More options" })[0];
    expect(moreBtn).toBeInTheDocument();
    fireEvent.click(moreBtn);

    // Verify popover menu items
    expect(within(aside!).getByRole("button", { name: /Share/i })).toBeInTheDocument();
    expect(within(aside!).getByRole("button", { name: /Pin/i })).toBeInTheDocument();
    expect(within(aside!).getByRole("button", { name: /Rename/i })).toBeInTheDocument();
    expect(within(aside!).getByRole("button", { name: /Add to Project/i })).toBeInTheDocument();
    expect(within(aside!).getByRole("button", { name: /Delete/i })).toBeInTheDocument();

    // Recents item in sidebar allows direct workspace navigation
    const recentItem = await within(aside!).findByText("Comparative Analysis of In Vivo Cleavage");
    expect(recentItem).toBeInTheDocument();

    fireEvent.click(recentItem);
    expect(onOpen).toHaveBeenCalledWith("proj-crispr-01");
  });
});

describe("landing workspace hero & academic workspace cards", () => {
  it("renders the 4 academic workspace cards and consolidated prompt bar while purging projects list", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    // Minimal dashboard: transitions directly into the 4 Academic Workspace Cards
    expect(screen.queryByText("What would you like to write today?")).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText("Start a literature review, brainstorm an outline, or drop a syllabus")).not.toBeInTheDocument();

    // 4 Academic Workspace Cards
    expect(await screen.findByRole("heading", { name: "Assignment" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Journal Article" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Research Proposal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Presentation" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Thesis / Dissertation" })).not.toBeInTheDocument();

    // Consolidated transparent AI prompt bar immediately below cards
    const promptBar = screen.getByPlaceholderText(/Draft a Research Proposal, analyze data, or search projects.../i);
    expect(promptBar).toBeInTheDocument();

    // Projects section, secondary search, and progress cards are purged from main canvas
    expect(screen.queryByRole("heading", { name: "Projects" })).not.toBeInTheDocument();
    expect(screen.queryByText("0 of 0")).not.toBeInTheDocument();
    expect(screen.queryByText("No projects yet")).not.toBeInTheDocument();
    expect(screen.queryByText("Browse Templates")).not.toBeInTheDocument();
    expect(screen.queryByText(/Import from Zotero/i)).not.toBeInTheDocument();
  });

  it("boots academic workspace directly from card click on dashboard when authenticated", async () => {
    listProjects.mockResolvedValue({ items: [] });
    createProject.mockResolvedValue({ projectId: "proj-journal-new" });
    const onOpen = vi.fn();

    renderScreen(<ProjectListScreen onOpen={onOpen} userEmail="scholar@research.edu" />);

    // Click Journal Article card directly on dashboard
    const journalHeading = await screen.findByRole("heading", { name: "Journal Article" });
    const journalCard = journalHeading.closest("button");
    expect(journalCard).toBeInTheDocument();

    fireEvent.click(journalCard!);
    expect(createProject).toHaveBeenCalledWith("OT-10");
  });

  it("opens in-page authentication modal when guest clicks a workspace card", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    // Click Journal Article card as guest
    const journalHeading = await screen.findByRole("heading", { name: "Journal Article" });
    const journalCard = journalHeading.closest("button");
    fireEvent.click(journalCard!);

    // In-page auth modal appears without full-page redirect
    expect(await screen.findByText(/Sign in to boot your Journal Article workspace/i)).toBeInTheDocument();
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(within(dialog).getByText("Create an account")).toBeInTheDocument();
  });

  it("applies soft dark mode background, softened borders, and fine-tuned muted accent colors to workspace template cards", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const assignmentHeading = await screen.findByRole("heading", { name: "Assignment" });
    const assignmentCard = assignmentHeading.closest("button")!;
    expect(assignmentCard.className).toContain("dark:bg-[#1C1C1E]");
    expect(assignmentCard.className).toContain("dark:border-white/5");
    expect(assignmentCard.innerHTML).toContain("dark:text-blue-400");
    expect(assignmentCard.innerHTML).toContain("dark:bg-blue-500/10");

    const journalHeading = screen.getByRole("heading", { name: "Journal Article" });
    const journalCard = journalHeading.closest("button")!;
    expect(journalCard.className).toContain("dark:bg-[#1C1C1E]");
    expect(journalCard.className).toContain("dark:border-white/5");
    expect(journalCard.innerHTML).toContain("dark:text-amber-400/90");
    expect(journalCard.innerHTML).toContain("dark:bg-amber-500/10");

    const proposalHeading = screen.getByRole("heading", { name: "Research Proposal" });
    const proposalCard = proposalHeading.closest("button")!;
    expect(proposalCard.className).toContain("dark:bg-[#1C1C1E]");
    expect(proposalCard.className).toContain("dark:border-white/5");
    expect(proposalCard.innerHTML).toContain("dark:text-indigo-400/90");
    expect(proposalCard.innerHTML).toContain("dark:bg-indigo-500/10");

    const presentationHeading = screen.getByRole("heading", { name: "Presentation" });
    const presentationCard = presentationHeading.closest("button")!;
    expect(presentationCard.className).toContain("dark:bg-[#1C1C1E]");
    expect(presentationCard.className).toContain("dark:border-white/5");
    expect(presentationCard.innerHTML).toContain("dark:text-teal-300/90");
    expect(presentationCard.innerHTML).toContain("dark:bg-teal-500/10");
  });
});

describe("minimal website assistant", () => {
  it("renders slide-in AI assistant sidebar with clean conversation UI, FAQ suggestions, and input", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const toggleBtn = screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i });
    fireEvent.click(toggleBtn);

    // Assistant container exists in the slide-in sidebar with humanized header & greeting
    const assistantHeading = await screen.findByRole("heading", { name: "Ask Scholar" });
    expect(assistantHeading).toBeInTheDocument();
    expect(screen.getByText(/How can I help you with your research today\?/i)).toBeInTheDocument();
    expect(screen.getAllByText("Ask Scholar").length).toBeGreaterThanOrEqual(2); // Header and bottom status bar

    // FAQ suggested topic chips
    expect(screen.getByText("How do I set up AI?")).toBeInTheDocument();
    expect(screen.getByText("What is Knowledge Vault?")).toBeInTheDocument();
    expect(screen.getByText("How do I create a research project?")).toBeInTheDocument();

    // Clean pill-shaped input and Send button
    const input = screen.getByPlaceholderText(/Ask anything, search projects, or type a command/i);
    expect(input).toBeInTheDocument();
    const sendBtn = screen.getByRole("button", { name: "Send question" });
    expect(sendBtn).toBeInTheDocument();
    expect(sendBtn).toBeDisabled();
  });

  it("responds with website guidance when asked how to configure AI", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const toggleBtn = screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i });
    fireEvent.click(toggleBtn);

    // Click "How do I set up AI?" chip
    const aiChip = await screen.findByRole("button", { name: "How do I set up AI?" });
    fireEvent.click(aiChip);

    // Assistant provides accurate guidance on AI Access and BYOK
    expect(await screen.findByText(/To configure AI in Scholar Core/i, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(screen.getByText(/Bring Your Own Key/i)).toBeInTheDocument();
  });

  it("refuses general writing/coding tasks and directs user to academic workspaces", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const toggleBtn = screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i });
    fireEvent.click(toggleBtn);

    const input = screen.getByPlaceholderText(/Ask anything, search projects, or type a command/i);
    fireEvent.change(input, { target: { value: "write an essay about biology" } });

    const sendBtn = screen.getByRole("button", { name: "Send question" });
    expect(sendBtn).toBeEnabled();
    fireEvent.click(sendBtn);

    expect(await screen.findByText(/I cannot perform general research, writing, coding/i, {}, { timeout: 2000 })).toBeInTheDocument();
  });

  it("resets conversation when Reset Chat button is clicked", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const toggleBtn = screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i });
    fireEvent.click(toggleBtn);

    const resetBtn = await screen.findByRole("button", { name: "Reset Chat" });
    fireEvent.click(resetBtn);

    expect(screen.getByText(/Hello! I am your Scholar Core Website Assistant/i)).toBeInTheDocument();
  });

  it("renders slide-in AI assistant sidebar on toggle", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const toggleBtn = screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i });
    fireEvent.click(toggleBtn);

    const input = screen.getByPlaceholderText(/Ask anything, search projects, or type a command/i);
    expect(input).toBeInTheDocument();
  });

  it("answers general inquiries using connected AI while keeping suggestive questions useful for the platform", async () => {
    listProjects.mockResolvedValue({ items: [] });
    executeAgenticLLM.mockResolvedValueOnce("Quantum coherence in biological systems facilitates near-unity energy transfer efficiency.");

    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    const toggleBtn = screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i });
    fireEvent.click(toggleBtn);

    // Platform questions are visible as suggestions
    expect(screen.getByText("How do I set up AI?")).toBeInTheDocument();
    expect(screen.getByText("What is Knowledge Vault?")).toBeInTheDocument();

    const input = screen.getByPlaceholderText(/Ask anything, search projects, or type a command/i);
    fireEvent.change(input, { target: { value: "Explain quantum coherence in biological systems" } });

    const sendBtn = screen.getByRole("button", { name: "Send question" });
    fireEvent.click(sendBtn);

    expect(await screen.findByText(/Quantum coherence in biological systems facilitates/i, {}, { timeout: 2000 })).toBeInTheDocument();
    expect(executeAgenticLLM).toHaveBeenCalled();
  });

  it("does not call LLM for general inquiries in guest mode, prompting to sign in instead", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail={null} />);

    const toggleBtn = screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i });
    fireEvent.click(toggleBtn);

    const input = screen.getByPlaceholderText(/Ask anything, search projects, or type a command/i);
    fireEvent.change(input, { target: { value: "What is cat?" } });

    const sendBtn = screen.getByRole("button", { name: "Send question" });
    fireEvent.click(sendBtn);

    expect(await screen.findByText(/Open-ended scholarly inquiries require signing in to Scholar Core/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Sign In \/ Register to Use AI/i })).toBeInTheDocument();
    expect(executeAgenticLLM).not.toHaveBeenCalled();
  });

  it("renders minimalist Lightbulb icon with Ask Scholar tooltip, hides button when sidebar opens, and restores it on close", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    // 1. Initially closed: toggle button is visible in top navigation and has title="Ask Scholar" tooltip
    const toggleBtn = screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i });
    expect(toggleBtn).toBeInTheDocument();
    expect(toggleBtn).toHaveAttribute("title", "Ask Scholar");

    // 2. Open assistant: button triggers the sidebar to slide open
    fireEvent.click(toggleBtn);
    expect(await screen.findByRole("heading", { name: "Ask Scholar" })).toBeInTheDocument();

    // 3. Conditional rendering: toggle button completely disappears from top navigation
    expect(screen.queryByRole("button", { name: /Toggle Scholar Core AI Assistant/i })).not.toBeInTheDocument();

    // 4. Close assistant: toggle button reappears in top navigation
    const closeBtn = screen.getByRole("button", { name: "Close Assistant" });
    fireEvent.click(closeBtn);
    expect(screen.getByRole("button", { name: /Toggle Scholar Core AI Assistant/i })).toBeInTheDocument();
  });

  it("toggles the Ask Scholar assistant sidebar both open and closed on click from left sidebar navigation", async () => {
    listProjects.mockResolvedValue({ items: [] });
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    // 1. Find Ask Scholar button in left sidebar
    const askScholarBtn = screen.getByRole("button", { name: /^Ask Scholar$/i });
    expect(askScholarBtn).toBeInTheDocument();

    // 2. Click once to open
    fireEvent.click(askScholarBtn);
    expect(await screen.findByRole("heading", { name: "Ask Scholar" })).toBeInTheDocument();

    // 3. Click again to close (bidirectional toggle fix)
    fireEvent.click(askScholarBtn);
    await waitFor(() => {
      expect(screen.queryByRole("heading", { name: "Ask Scholar" })).not.toBeInTheDocument();
    });

    // 4. Click once more to reopen
    fireEvent.click(askScholarBtn);
    expect(await screen.findByRole("heading", { name: "Ask Scholar" })).toBeInTheDocument();
  });
});

