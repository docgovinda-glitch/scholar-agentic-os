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
    const input = screen.getByPlaceholderText("Ask a research question…");
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
    const input = screen.getByPlaceholderText("Ask a research question…");
    fireEvent.change(input, { target: { value: "Synthesize CRISPR off-target cleavage mechanisms" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    // Find and click the 'Continue' post-response action button and choose 'Journal Article' (OT-10)
    const continueBtn = await screen.findByTestId("action-continue");
    expect(continueBtn).toBeInTheDocument();
    fireEvent.click(continueBtn);
    const journalBtn = await screen.findByTestId("continue-workspace-OT-10");
    fireEvent.click(journalBtn);

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

  it("renders Ask Scholar as full-screen chat box on landing page and completely hides the four cards once user starts chatting", async () => {
    executeAgenticLLM.mockResolvedValueOnce(
      "Comprehensive research synthesis on molecular dynamics."
    );

    renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);

    // 1. Open Ask Scholar from navigation
    const askScholarBtn = screen.getByRole("button", { name: /^Ask Scholar$/i });
    fireEvent.click(askScholarBtn);
    await screen.findByRole("heading", { name: "Ask Scholar" });

    // 2. Before user starts chatting: the 4 deliverable cards and heading are visible
    expect(screen.getByText("Where will your research begin?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coursework & Essays" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Journal Article" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Research Proposal" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Slides & Keynotes" })).toBeInTheDocument();

    // 3. User starts chatting by sending a research question
    const input = screen.getByPlaceholderText("Ask a research question…");
    fireEvent.change(input, { target: { value: "Perform molecular dynamics synthesis" } });
    fireEvent.click(screen.getByRole("button", { name: "Send question" }));

    // 4. Once chatting starts, the four cards and heading are COMPLETELY HIDDEN
    expect(screen.queryByText("Where will your research begin?")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Coursework & Essays" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Journal Article" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Research Proposal" })).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Slides & Keynotes" })).not.toBeInTheDocument();

    // Verify chat response renders in full screen
    expect(await screen.findByText(/Comprehensive research synthesis on molecular dynamics/i)).toBeInTheDocument();

    // 5. Clicking 'New Chat' clears the conversation and restores the four cards
    const newChatBtn = screen.getByRole("button", { name: "New Chat" });
    fireEvent.click(newChatBtn);

    expect(await screen.findByText("Where will your research begin?")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Coursework & Essays" })).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Journal Article" })).toBeInTheDocument();
  });

  it("keeps left sidebar minimal without duplicate Slides & Keynotes entry and renders Ask Scholar with Lightbulb icon", () => {
    const { container } = renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);
    const navAside = container.querySelector("aside[aria-label='Workspace navigation']") || container.querySelector("aside")!;

    // Neither Presentation Studio nor Slides & Keynotes is duplicated in the left sidebar (Slides & Keynotes is on the landing page cards)
    expect(screen.queryByRole("button", { name: /^Presentation Studio$/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Slides & Keynotes$/i })).not.toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Slides & Keynotes" })).toBeInTheDocument();

    // Ask Scholar in sidebar uses the recognizable Lightbulb icon in clean neutral style
    const askScholarBtn = screen.getByRole("button", { name: /^Ask Scholar$/i });
    expect(askScholarBtn).toBeInTheDocument();
    expect(navAside.contains(askScholarBtn)).toBe(true);
    expect(askScholarBtn.querySelector(".lucide-lightbulb")).toBeInTheDocument();
  });

  it("closes the mobile navigation drawer when Escape key is pressed", () => {
    const { container } = renderScreen(<ProjectListScreen onOpen={vi.fn()} userEmail="scholar@research.edu" />);
    const openNavBtn = screen.getByRole("button", { name: "Open navigation" });
    fireEvent.click(openNavBtn);

    expect(container.querySelector(".fixed.inset-0.z-40.bg-black\\/40")).toBeInTheDocument();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(container.querySelector(".fixed.inset-0.z-40.bg-black\\/40")).not.toBeInTheDocument();
  });
});
