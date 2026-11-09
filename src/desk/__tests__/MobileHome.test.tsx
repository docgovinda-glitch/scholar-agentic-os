// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, screen, fireEvent, within, cleanup } from "@testing-library/react";
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

  describe("landing improvements", () => {
    afterEach(() => {
      try { sessionStorage.clear(); } catch { /* ignore */ }
      vi.mocked(api.getAiOperationalStatus).mockResolvedValue({ connected: true, statusText: "Ready", provider: "gemini", providers: [{ id: "gemini", name: "Google Gemini" }] } as never);
      vi.mocked(api.listProjects).mockResolvedValue({ items: [] } as never);
    });

    it("says what the app does", () => {
      renderHome();
      expect(screen.getByText(/Research, write and cite/i)).toBeInTheDocument();
    });

    it("does not nag about AI setup while an AI is connected", async () => {
      renderHome();
      expect(await screen.findByTestId("mobile-ai-status")).toHaveTextContent("AI: Google Gemini");
      expect(screen.queryByTestId("mobile-ai-setup-banner")).toBeNull();
    });

    it("offers a dismissible setup banner when no AI is connected", async () => {
      vi.mocked(api.getAiOperationalStatus).mockResolvedValue({ connected: false, statusText: "AI Disconnected", providers: [] } as never);
      const onOpenAiAccess = vi.fn();
      renderHome(onOpenAiAccess);
      const banner = await screen.findByTestId("mobile-ai-setup-banner");
      fireEvent.click(within(banner).getByRole("button", { name: "Set up" }));
      expect(onOpenAiAccess).toHaveBeenCalled();
      fireEvent.click(within(banner).getByRole("button", { name: "Dismiss" }));
      expect(screen.queryByTestId("mobile-ai-setup-banner")).toBeNull();
    });

    it("asks signed-out visitors to sign in, from the banner and the header", () => {
      renderHome(vi.fn(), vi.fn(), ""); // signed out
      const banner = screen.getByTestId("mobile-ai-setup-banner");
      expect(within(banner).getByRole("button", { name: "Sign in" })).toBeInTheDocument();
      expect(screen.getAllByRole("button", { name: /Sign in/ }).length).toBeGreaterThanOrEqual(2);
    });

    it("fills the question box from an example prompt", () => {
      renderHome();
      const examples = screen.getByTestId("mobile-examples");
      const first = within(examples).getAllByRole("button")[0];
      fireEvent.click(first);
      const box = within(screen.getByTestId("main-prompt-bar-wrapper")).getByRole("textbox") as HTMLTextAreaElement;
      expect(box.value).toBe(first.textContent);
    });

    it("shows recent projects instead of examples for returning users", async () => {
      vi.mocked(api.listProjects).mockResolvedValue({
        items: [{ projectId: "p1", outputTypeId: "OT-01", title: "Climate essay", answers: {}, authors: [], intakeCompleteness: 0.4, hasDocument: false, hasJournalRequirements: false, gates: [] }],
      } as never);
      const onOpen = vi.fn();
      renderHome(vi.fn(), vi.fn(), "researcher@university.edu", onOpen);
      const section = await screen.findByTestId("mobile-continue");
      expect(screen.queryByTestId("mobile-examples")).toBeNull();
      fireEvent.click(within(section).getAllByRole("button")[0]);
      expect(onOpen).toHaveBeenCalledWith("p1");
    });

    it("keeps the header uncluttered: theme switch, no duplicate Ask button", () => {
      renderHome();
      expect(screen.getByRole("button", { name: /Switch to (light|dark) mode/ })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Toggle Scholar Core AI Assistant/i })).toBeNull();
    });

    it("hints how to attach a brief, and hides the hint once typing starts", () => {
      renderHome();
      const bar = screen.getByTestId("main-prompt-bar-wrapper");
      expect(within(bar).getByText(/attach a brief/i)).toBeInTheDocument();
      fireEvent.change(within(bar).getByRole("textbox"), { target: { value: "hello" } });
      expect(within(bar).queryByText(/attach a brief/i)).toBeNull();
    });
  });
});
