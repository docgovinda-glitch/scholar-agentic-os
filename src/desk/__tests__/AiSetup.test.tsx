// @vitest-environment jsdom
//
// AI setup: the stage between signing in and the workspace.
//
// Two rules from docs 25 §1.1 are load-bearing and easy to get wrong:
// every stage after login is skippable, and a skip is "recorded, re-offered
// contextually, never nagged" — so skipping must survive a reload rather than
// re-prompting on the next visit.
//
// The other assertions are about the promise the UI makes: the API key is
// stored on the device and not sent anywhere.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { renderHook, act } from "@testing-library/react";

const getUser = vi.fn();
const from = vi.fn();
vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ auth: { getUser }, from }),
}));

const { default: AiSetupScreen } = await import("../setup/AiSetupScreen");
const { useAiSetupStatus } = await import("../setup/useAiSetupStatus");
const { providersWithStoredKey, readProviderKey } = await import("../../services/userAiSettings");

const USER = { id: "11111111-1111-4111-8111-111111111111" };

/** No stored row, and a working upsert — the state a brand-new user is in. */
function noSettingsYet() {
  from.mockReturnValue({
    select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
    upsert: vi.fn().mockResolvedValue({ error: null }),
  });
}

beforeEach(() => {
  localStorage.clear();
  getUser.mockResolvedValue({ data: { user: USER } });
  noSettingsYet();
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("AiSetupScreen", () => {
  it("offers providers with their real free-tier terms, not invented copy", async () => {
    render(<AiSetupScreen onDone={vi.fn()} />);

    // Sourced from providerCatalog.ts, which carries an honest line per
    // provider about what the free access actually is.
    expect(await screen.findByRole("radio", { name: /Google Gemini/ })).toBeInTheDocument();
    expect(screen.getByText(/no card required/i)).toBeInTheDocument();
  });

  it("links to the provider's own key page", async () => {
    render(<AiSetupScreen onDone={vi.fn()} />);
    const link = await screen.findByRole("link", { name: /Get a key from Google Gemini/i });
    expect(link).toHaveAttribute("href", "https://aistudio.google.com/app/apikey");
    // Opening a third-party page from an app tab without this leaks
    // window.opener to it.
    expect(link).toHaveAttribute("rel", expect.stringContaining("noopener"));
  });

  it("states where the key is stored, because the user will meet the consequence", async () => {
    render(<AiSetupScreen onDone={vi.fn()} />);
    // They will be asked for it again on another machine; finding that out by
    // surprise is worse than reading one sentence now.
    expect(await screen.findByText(/never sent to our servers/i)).toBeInTheDocument();
  });

  it("cannot be completed without a key", async () => {
    render(<AiSetupScreen onDone={vi.fn()} />);
    expect(await screen.findByRole("button", { name: /Save and continue/ })).toBeDisabled();
  });

  it("stores the key on the device and never uploads it", async () => {
    const onDone = vi.fn();
    render(<AiSetupScreen onDone={onDone} />);

    fireEvent.change(await screen.findByLabelText("API key"), { target: { value: "sk-my-secret" } });
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());

    expect(providersWithStoredKey()).toContain("gemini");
    expect(await readProviderKey("gemini")).toBe("sk-my-secret");

    // The synced row must carry the provider choice and nothing sensitive.
    const upsert = from.mock.results[from.mock.results.length - 1].value.upsert;
    const row = upsert.mock.calls[0][0];
    expect(row.provider).toBe("gemini");
    expect(JSON.stringify(row)).not.toContain("sk-my-secret");
  });

  it("offers a skip, per docs 25 — every stage after login is optional", async () => {
    const onSkip = vi.fn();
    render(<AiSetupScreen onDone={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(await screen.findByRole("button", { name: /Skip for now/ }));
    expect(onSkip).toHaveBeenCalled();
  });
});

describe("useAiSetupStatus", () => {
  it("asks for setup when no provider key exists", async () => {
    const { result } = renderHook(() => useAiSetupStatus(USER.id));
    await waitFor(() => expect(result.current.status).toBe("needed"));
  });

  it("does not ask again once a skip is recorded", async () => {
    const first = renderHook(() => useAiSetupStatus(USER.id));
    await waitFor(() => expect(first.result.current.status).toBe("needed"));

    act(() => first.result.current.skip());
    expect(first.result.current.status).toBe("ready");

    // A fresh mount stands in for a reload. Re-prompting here is the "nagging"
    // docs 25 rules out.
    const second = renderHook(() => useAiSetupStatus(USER.id));
    await waitFor(() => expect(second.result.current.status).toBe("ready"));
  });

  it("keys the skip to the user, so a shared machine does not inherit it", async () => {
    const mine = renderHook(() => useAiSetupStatus(USER.id));
    await waitFor(() => expect(mine.result.current.status).toBe("needed"));
    act(() => mine.result.current.skip());

    const someoneElse = renderHook(() => useAiSetupStatus("22222222-2222-4222-8222-222222222222"));
    await waitFor(() => expect(someoneElse.result.current.status).toBe("needed"));
  });
});
