// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { MemoryRouter } from "react-router-dom";

vi.mock("../api", () => ({
  listProjects: vi.fn().mockResolvedValue({ items: [] }),
  listOutputTypes: vi.fn().mockResolvedValue({ items: [] }),
  getAiOperationalStatus: vi.fn().mockResolvedValue({ connected: false, providers: [] }),
  fetchAskSearchPlan: () => Promise.resolve(null),
}));
vi.mock("../../services/supabaseClient", () => ({
  getSupabaseClient: () => ({ auth: { getSession: vi.fn().mockResolvedValue({ data: { session: null } }), getUser: vi.fn().mockResolvedValue({ data: { user: null } }), onAuthStateChange: vi.fn(() => ({ data: { subscription: { unsubscribe: vi.fn() } } })) } }),
  isSupabaseConfigured: () => true,
}));

const { default: ProjectListScreen } = await import("../ProjectListScreen");

describe("Ask Scholar history after a reload", () => {
  afterEach(() => {
    cleanup();
    localStorage.clear();
  });

  it("appears once the signed-in email arrives, even though the first render had none", async () => {
    localStorage.setItem(
      "scholar_ask_threads_v1:late@example.test",
      JSON.stringify([{ id: "t1", title: "Saved question", updatedAt: "10:00", messages: [{ id: "u", sender: "user", text: "Saved question", timestamp: "10:00" }] }])
    );
    const screenFor = (email: string | null) => (
      <MemoryRouter>
        <ProjectListScreen onOpen={vi.fn()} userEmail={email} />
      </MemoryRouter>
    );
    const view = render(screenFor(null));
    expect(screen.queryByTestId("mobile-resume-chat")).not.toBeInTheDocument();
    view.rerender(screenFor("late@example.test"));
    expect(await screen.findByTestId("mobile-resume-chat")).toHaveTextContent("Saved question");
  });
});
