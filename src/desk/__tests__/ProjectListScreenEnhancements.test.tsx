// @vitest-environment jsdom
import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor, within } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

const createProject = vi.fn();
const listOutputTypes = vi.fn();
const listProjects = vi.fn();
const deleteProject = vi.fn();
const saveIntakeAnswers = vi.fn();
const executeAgenticLLM = vi.fn();
const executeAgenticQuery = vi.fn();
const getAiOperationalStatus = vi.fn().mockResolvedValue({ connected: true, statusText: "AI Ready" });
const parseFileForAgent = vi.fn().mockResolvedValue({ isImage: false, fileData: { name: "test.pdf", text: "parsed", type: "application/pdf" } });

vi.mock("../api", () => ({
  createProject: (...a: unknown[]) => createProject(...a),
  listOutputTypes: (...a: unknown[]) => listOutputTypes(...a),
  listProjects: (...a: unknown[]) => listProjects(...a),
  deleteProject: (...a: unknown[]) => deleteProject(...a),
  saveIntakeAnswers: (...a: unknown[]) => saveIntakeAnswers(...a),
  executeAgenticLLM: (...a: unknown[]) => executeAgenticLLM(...a),
  executeAgenticQuery: (...a: unknown[]) => executeAgenticQuery(...a),
  getAiOperationalStatus: (...a: unknown[]) => getAiOperationalStatus(...a),
  parseFileForAgent: (...a: unknown[]) => parseFileForAgent(...a),
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

describe("UI/UX Enhancements: Command Palette, Boot Project, Related Inquiries, Resizable Panel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    listProjects.mockResolvedValue({
      items: [
        {
          projectId: "proj-101",
          outputTypeId: "OT-10",
          answers: { title: "CRISPR Epigenetics Study" },
          authors: [],
          intakeCompleteness: 80,
          hasDocument: true,
          hasJournalRequirements: false,
          gates: [],
        },
      ],
    });
  });

  it("toggles the Command Palette on Cmd+K keyboard shortcut and through UI triggers", async () => {
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    // Initially closed
    expect(screen.queryByRole("dialog", { name: "Command Palette" })).not.toBeInTheDocument();

    // Trigger via keyboard shortcut Cmd+K
    fireEvent.keyDown(window, { key: "k", metaKey: true });
    const dialog = await screen.findByRole("dialog", { name: "Command Palette" });
    expect(dialog).toBeInTheDocument();

    // Type query to search existing project
    const input = within(dialog).getByPlaceholderText(/Type a command, search projects/i);
    fireEvent.change(input, { target: { value: "CRISPR" } });

    expect(within(dialog).getByText("CRISPR Epigenetics Study")).toBeInTheDocument();

    // Press Escape to dismiss
    fireEvent.keyDown(window, { key: "Escape" });
    await waitFor(() => {
      expect(screen.queryByRole("dialog", { name: "Command Palette" })).not.toBeInTheDocument();
    });

    // Trigger via ⌘K button in search bar
    const cmdKBtn = screen.getByRole("button", { name: "⌘K" });
    fireEvent.click(cmdKBtn);
    expect(await screen.findByRole("dialog", { name: "Command Palette" })).toBeInTheDocument();
  });

  it("renders resizable drag handle for the Ask Scholar assistant sidebar", async () => {
    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    // Open Ask Scholar
    const askScholarBtn = screen.getByRole("button", { name: /^Ask Scholar$/i });
    fireEvent.click(askScholarBtn);
    await screen.findByRole("heading", { name: "Ask Scholar" });

    // Verify resize handle exists
    const resizeHandle = screen.getByTitle(/Drag to resize panel/i);
    expect(resizeHandle).toBeInTheDocument();
    expect(resizeHandle.className).toContain("cursor-col-resize");
  });

  it("renders Dynamic Follow-Up Questions ('Related Inquiries') and executes inquiry on click", async () => {
    executeAgenticLLM.mockResolvedValueOnce(
      "Neural-symbolic architectures combine neural networks with formal symbolic reasoning."
    );

    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    // Open assistant
    const askScholarBtn = screen.getByRole("button", { name: /^Ask Scholar$/i });
    fireEvent.click(askScholarBtn);
    await screen.findByRole("heading", { name: "Ask Scholar" });

    // Ask a question in assistant drawer
    const input = screen.getByPlaceholderText("Ask anything, search projects, or type a command...");
    fireEvent.change(input, { target: { value: "Explain neural-symbolic systems" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    // Wait for assistant response and Related Inquiries
    expect(await screen.findByText(/Related Inquiries/i)).toBeInTheDocument();

    // Click a related inquiry chip (e.g. What is Knowledge Vault?)
    const inquiryChips = screen.getAllByRole("button", { name: /What is Knowledge Vault\?/i });
    fireEvent.click(inquiryChips[inquiryChips.length - 1]);

    // Verify answer is rendered in the conversation
    expect(await screen.findByText(/The Knowledge Vault is your secure, private academic repository/i)).toBeInTheDocument();
  });

  it("boots an academic project workspace directly from research synthesis", async () => {
    const onOpen = vi.fn();
    createProject.mockResolvedValueOnce({ projectId: "proj-booted-404" });
    saveIntakeAnswers.mockResolvedValueOnce({ success: true });
    executeAgenticLLM.mockResolvedValueOnce(
      "Comprehensive synthesis on CRISPR off-target cleavage mechanics."
    );

    renderScreen(<ProjectListScreen onOpen={onOpen} userEmail="scholar@research.edu" />);

    // Open assistant
    const askScholarBtn = screen.getByRole("button", { name: /^Ask Scholar$/i });
    fireEvent.click(askScholarBtn);
    await screen.findByRole("heading", { name: "Ask Scholar" });

    // Send research query
    const input = screen.getByPlaceholderText("Ask anything, search projects, or type a command...");
    fireEvent.change(input, { target: { value: "Synthesize CRISPR off-target cleavage mechanisms" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    // Find and click the 'Boot Project' action button
    const bootBtn = await screen.findByRole("button", { name: /Boot Project/i });
    expect(bootBtn).toBeInTheDocument();
    fireEvent.click(bootBtn);

    // Verify project initialization and intake saving
    await waitFor(() => {
      expect(createProject).toHaveBeenCalledWith("OT-10");
      expect(saveIntakeAnswers).toHaveBeenCalledWith(
        "proj-booted-404",
        expect.objectContaining({
          researchQuestion: "Synthesize CRISPR off-target cleavage mechanisms",
        })
      );
      expect(onOpen).toHaveBeenCalledWith("proj-booted-404");
    });
  });
});
