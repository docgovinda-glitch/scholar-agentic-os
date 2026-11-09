// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within, cleanup, act, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

const device = { isMobile: true };
vi.mock("../../hooks/useDeviceClass", () => ({
  useDeviceClass: () => ({ deviceClass: device.isMobile ? "mobile" : "desktop", isMobile: device.isMobile, isTablet: false, isDesktop: !device.isMobile, isTouchPrimary: device.isMobile, canRunLocalAI: !device.isMobile }),
}));
vi.mock("../api", () => ({
  createProject: vi.fn(),
  listOutputTypes: vi.fn().mockResolvedValue({ items: [] }),
  listProjects: vi.fn().mockResolvedValue({ items: [] }),
  deleteProject: vi.fn(),
  saveIntakeAnswers: vi.fn(),
  executeAgenticLLM: vi.fn(),
  executeAgenticQuery: vi.fn(),
  getAiOperationalStatus: vi.fn().mockResolvedValue({ connected: true, statusText: "Ready", provider: "gemini", providers: [{ id: "gemini", name: "Google Gemini" }] }),
  parseFileForAgent: vi.fn(),
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
const api = await import("../api");

function renderHome(onOpenAiAccess = vi.fn(), onOpenVault = vi.fn(), userEmail = "researcher@university.edu", onOpen = vi.fn()) {
  render(
    <MemoryRouter>
      <ProjectListScreen onOpen={onOpen} userEmail={userEmail} onOpenAiAccess={onOpenAiAccess} onOpenVault={onOpenVault} />
    </MemoryRouter>
  );
}

describe("phone home: Ask Scholar first", () => {
  afterEach(() => {
    cleanup();
    device.isMobile = true;
  });

  it("puts Ask Scholar, with the AI in use and the question box, with accessible academic workspaces", async () => {
    renderHome();
    const ask = screen.getByRole("region", { name: "Ask Scholar" });
    // The question box is pinned to the bottom of the screen, outside the Ask region.
    const promptBar = screen.getByTestId("main-prompt-bar-wrapper");
    expect(within(promptBar).getByRole("textbox", { name: /Research instructions/i })).toBeInTheDocument();
    expect(await within(ask).findByTestId("mobile-ai-status")).toHaveTextContent("AI: Google Gemini");

    const workspacesBtn = screen.getByRole("button", { name: "Academic Workspaces" });
    expect(workspacesBtn).toBeInTheDocument();
    fireEvent.click(workspacesBtn);

    const menu = screen.getByRole("menu", { name: "Workspaces" });
    expect(within(menu).getByRole("menuitem", { name: /Coursework & Essays/ })).toBeInTheDocument();
    expect(within(menu).getByRole("menuitem", { name: /Journal Article/ })).toBeInTheDocument();
  });

  it("has a bottom bar for Ask, Projects, Vault and AI", async () => {
    const onOpenAiAccess = vi.fn();
    const onOpenVault = vi.fn();
    renderHome(onOpenAiAccess, onOpenVault);
    const nav = screen.getByRole("navigation", { name: "Main" });
    expect(within(nav).getAllByRole("button").map((b) => b.textContent)).toEqual(["Ask", "Projects", "Vault", "AI"]);
    fireEvent.click(within(nav).getByRole("button", { name: "AI" }));
    expect(onOpenAiAccess).toHaveBeenCalled();
    fireEvent.click(within(nav).getByRole("button", { name: "Vault" }));
    expect(onOpenVault).toHaveBeenCalled();
  });

  it("keeps the desktop layout on larger screens", () => {
    device.isMobile = false;
    renderHome();
    expect(screen.queryByRole("region", { name: "Ask Scholar" })).toBeNull();
    expect(screen.queryByRole("navigation", { name: "Main" })).toBeNull();
    expect(screen.getByText("Where will your research begin?")).toBeInTheDocument();
  });

  describe("navigation drawer", () => {
    it("is inert while closed, so keyboard and screen readers skip it", () => {
      renderHome();
      const drawer = screen.getByLabelText("Workspace navigation", { selector: "aside" });
      expect(drawer).toHaveAttribute("inert");
      fireEvent.click(screen.getByRole("button", { name: "Open navigation" }));
      expect(drawer).not.toHaveAttribute("inert");
      expect(document.querySelector("main")).toHaveAttribute("inert");
      fireEvent.keyDown(document, { key: "Escape" });
      expect(drawer).toHaveAttribute("inert");
    });
  });

  describe("landing improvements", () => {
    afterEach(() => {
      try { sessionStorage.clear(); } catch { /* ignore */ }
      vi.mocked(api.getAiOperationalStatus).mockResolvedValue({ connected: true, statusText: "Ready", provider: "gemini", providers: [{ id: "gemini", name: "Google Gemini" }] } as never);
      vi.mocked(api.listProjects).mockResolvedValue({ items: [] } as never);
    });

    it("stays uncluttered: no banner, examples or hint, and one suggestions row", () => {
      renderHome();
      expect(screen.queryByTestId("mobile-ai-setup-banner")).toBeNull();
      expect(screen.queryByTestId("mobile-examples")).toBeNull();
      expect(screen.queryByText(/attach a brief/i)).toBeNull();
      expect(screen.getAllByRole("group", { name: "Suggested questions" })).toHaveLength(1);
    });

    it("offers Sign in in the header when signed out", () => {
      renderHome(vi.fn(), vi.fn(), "");
      expect(screen.getAllByRole("button", { name: /Sign in/ }).length).toBeGreaterThan(0);
    });

    it("says what the app does", () => {
      renderHome();
      expect(screen.getByText(/Research, write and cite/i)).toBeInTheDocument();
    });

    it("shows recent projects instead of examples for returning users", async () => {
      vi.mocked(api.listProjects).mockResolvedValue({
        items: [{ projectId: "p1", outputTypeId: "OT-01", title: "Climate essay", answers: {}, authors: [], intakeCompleteness: 0.4, hasDocument: false, hasJournalRequirements: false, gates: [] }],
      } as never);
      const onOpen = vi.fn();
      renderHome(vi.fn(), vi.fn(), "researcher@university.edu", onOpen);
      const section = await screen.findByTestId("mobile-continue");
      fireEvent.click(within(section).getAllByRole("button")[0]);
      expect(onOpen).toHaveBeenCalledWith("p1");
    });

    it("keeps the header uncluttered: theme switch, no duplicate Ask button", () => {
      renderHome();
      expect(screen.getByRole("button", { name: /Switch to (light|dark) mode/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Toggle Scholar Core AI Assistant/i })).toBeNull();
    });

  });

  describe("after the user starts chatting", () => {
    function startChat(text = "What is a literature review?") {
      renderHome();
      const bar = screen.getByTestId("main-prompt-bar-wrapper");
      fireEvent.change(within(bar).getByRole("textbox"), { target: { value: text } });
      fireEvent.submit(within(bar).getByRole("textbox").closest("form")!);
    }

    it("opens a full-screen chat with a title, Back and no crowded header", async () => {
      startChat();
      const header = (await screen.findByRole("heading", { name: "Ask Scholar", level: 2 })).closest("header")!;
      expect(within(header).getByRole("button", { name: "Back" })).toBeInTheDocument();
      expect(within(header).queryByRole("button", { name: "Close Assistant" })).toBeNull();
      // Style and preferences moved next to the box
      expect(within(header).queryByTestId("citation-style-trigger")).toBeNull();
      expect(within(header).queryByTestId("ask-scholar-settings-btn")).toBeNull();
      const box = screen.getByRole("textbox", { name: "Ask Scholar question input" });
      const form = box.closest("form")!;
      expect(within(form).getByTestId("citation-style-trigger")).toBeInTheDocument();
      expect(within(form).getByTestId("ask-scholar-settings-btn")).toBeInTheDocument();
    });

    it("closes the chat on the phone Back button instead of leaving the app", async () => {
      startChat("What is a literature review?");
      await screen.findByRole("button", { name: "Back" });
      await act(async () => {
        window.history.back();
        await new Promise((r) => setTimeout(r, 40));
      });
      expect(await screen.findByTestId("mobile-resume-chat")).toHaveTextContent("What is a literature review?");
    });

    it("New Chat returns to the landing instead of a second, different empty state", async () => {
      startChat("What is a literature review?");
      fireEvent.click(await screen.findByRole("button", { name: "New Chat" }));
      expect(await screen.findByRole("region", { name: "Ask Scholar" })).toBeInTheDocument();
      expect(screen.queryByText("Where will your research begin?")).toBeNull();
    });

    it("keeps the conversation after a reload, even when the reply failed", async () => {
      startChat("What is a literature review?");
      await screen.findByRole("button", { name: "Back" });
      await waitFor(() => expect(localStorage.length).toBeGreaterThan(0));
      cleanup();
      renderHome();
      expect(await screen.findByTestId("mobile-resume-chat")).toHaveTextContent("What is a literature review?");
      fireEvent.click(screen.getByTestId("mobile-resume-chat"));
      expect(await screen.findByRole("button", { name: "Back" })).toBeInTheDocument();
    });

    it("on larger screens, closing the chat shows the normal landing with a Resume row", async () => {
      device.isMobile = false;
      renderHome();
      const box = screen.getAllByRole("textbox", { name: /Research instructions/i })[0];
      fireEvent.change(box, { target: { value: "What is a literature review?" } });
      fireEvent.submit(box.closest("form")!);
      fireEvent.click(await screen.findByRole("button", { name: "Close Assistant" }));
      expect(await screen.findByTestId("mobile-resume-chat")).toHaveTextContent("What is a literature review?");
      expect(screen.getByText("Where will your research begin?")).toBeInTheDocument();
      expect(screen.queryByText("Ask Scholar Copilot Active")).toBeNull();
    });

    it("goes back to the landing, which offers to resume the chat", async () => {
      startChat("What is a literature review?");
      fireEvent.click(await screen.findByRole("button", { name: "Back" }));
      const resume = await screen.findByTestId("mobile-resume-chat");
      expect(resume).toHaveTextContent("What is a literature review?");
      expect(screen.queryByText("Ask Scholar Copilot Active")).toBeNull();
      fireEvent.click(resume);
      expect(await screen.findByRole("button", { name: "Back" })).toBeInTheDocument();
    });
  });
});
