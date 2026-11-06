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

function renderHome(onOpenAiAccess = vi.fn(), onOpenVault = vi.fn()) {
  render(
    <MemoryRouter>
      <ProjectListScreen onOpen={vi.fn()} userEmail="researcher@university.edu" onOpenAiAccess={onOpenAiAccess} onOpenVault={onOpenVault} />
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
    expect(within(ask).getByRole("textbox", { name: /Research instructions/i })).toBeInTheDocument();
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
});
