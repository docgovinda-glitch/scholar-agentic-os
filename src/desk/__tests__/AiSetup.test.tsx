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

// AiSetupScreen now calls the real AI Access routes (verify/add/remove
// connection) on save — mocked here at the module boundary rather than via
// global.fetch, since these are just plain async functions from the same
// codebase, not a network layer worth simulating.
const verifyProviderKey = vi.fn();
const addConnection = vi.fn();
const removeConnection = vi.fn();
const getAiAccessStatus = vi.fn();
vi.mock("../aiAccess/aiAccessApi", () => ({
  verifyProviderKey: (...args: unknown[]) => verifyProviderKey(...args),
  addConnection: (...args: unknown[]) => addConnection(...args),
  removeConnection: (...args: unknown[]) => removeConnection(...args),
  getAiAccessStatus: (...args: unknown[]) => getAiAccessStatus(...args),
}));

const NO_SERVER_SOURCE = { connections: [], entitlement: { status: "none", active: false }, quota: null, creditBalance: null };

// Hardware detection itself (real GPU/storage/local-runtime probing) is
// exercised for real in jsdom by AiSetupScreen's own useEffect regardless —
// mocking the two async entry points here keeps the recommendation's INPUT
// deterministic, while `recommendLocalModel` stays the real, pure function
// (imported via importOriginal) so these tests still exercise the actual
// size-class/reasoning logic AiAccessPage also depends on, not a duplicate.
const loadHardwareProfile = vi.fn();
const detectHardwareProfile = vi.fn();
vi.mock("../../services/hardwareProfiler", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../../services/hardwareProfiler")>();
  return {
    ...actual,
    loadHardwareProfile: (...args: unknown[]) => loadHardwareProfile(...args),
    detectHardwareProfile: (...args: unknown[]) => detectHardwareProfile(...args),
  };
});

const HARDWARE_NO_LOCAL = {
  os: "macOS",
  cpuCores: 8,
  architecture: "arm64",
  ramGb: 16,
  gpuInfo: null,
  vramGb: null,
  storageFreeGb: 200,
  detectedRuntimes: [],
  detectionMethod: "browser-api" as const,
  detectedAt: "2026-01-01T00:00:00.000Z",
};
const HARDWARE_WITH_LOCAL = { ...HARDWARE_NO_LOCAL, detectedRuntimes: [{ id: "ollama", name: "Ollama", models: ["llama3.1:8b"] }] };

const { default: AiSetupScreen } = await import("../setup/AiSetupScreen");
const { useAiSetupStatus } = await import("../setup/useAiSetupStatus");
const { providersWithStoredKey, readProviderKey, storeProviderKey } = await import("../../services/userAiSettings");

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
  verifyProviderKey.mockReset().mockResolvedValue({ ok: true, modelsDetected: 3 });
  addConnection.mockReset().mockResolvedValue({ success: true });
  removeConnection.mockReset().mockResolvedValue({ success: true });
  getAiAccessStatus.mockReset().mockResolvedValue(NO_SERVER_SOURCE);
  loadHardwareProfile.mockReset().mockResolvedValue(null);
  detectHardwareProfile.mockReset().mockResolvedValue(HARDWARE_NO_LOCAL);
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
    expect(await screen.findByText(/never stored on our servers/i)).toBeInTheDocument();
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

    // Onboarding shows the "AI setup complete" summary before handing off.
    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    expect(providersWithStoredKey()).toContain("gemini");
    expect(await readProviderKey("gemini")).toBe("sk-my-secret");

    // The synced row must carry the provider choice and nothing sensitive.
    const upsert = from.mock.results[from.mock.results.length - 1].value.upsert;
    const row = upsert.mock.calls[0][0];
    expect(row.provider).toBe("gemini");
    expect(JSON.stringify(row)).not.toContain("sk-my-secret");
  });

  it("verifies the key with the provider before recording a connection Omni Router can route to", async () => {
    const onDone = vi.fn();
    render(<AiSetupScreen onDone={onDone} />);

    fireEvent.change(await screen.findByLabelText("API key"), { target: { value: "sk-my-secret" } });
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    fireEvent.click(await screen.findByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());

    expect(verifyProviderKey).toHaveBeenCalledWith("gemini", "sk-my-secret");
    expect(addConnection).toHaveBeenCalledWith("gemini", "free", 3);
  });

  it("does not save the key or mark the provider connected when verification is rejected", async () => {
    verifyProviderKey.mockResolvedValue({ ok: false, error: "That key was rejected by the provider." });
    const onDone = vi.fn();
    render(<AiSetupScreen onDone={onDone} />);

    fireEvent.change(await screen.findByLabelText("API key"), { target: { value: "sk-bad-key" } });
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    expect(await screen.findByText(/rejected by the provider/i)).toBeInTheDocument();
    expect(onDone).not.toHaveBeenCalled();
    expect(addConnection).not.toHaveBeenCalled();
    expect(providersWithStoredKey()).not.toContain("gemini");
  });

  it("offers a skip, per docs 25 — every stage after login is optional", async () => {
    const onSkip = vi.fn();
    render(<AiSetupScreen onDone={vi.fn()} onSkip={onSkip} />);

    fireEvent.click(await screen.findByRole("button", { name: /Skip for now/ }));
    expect(onSkip).toHaveBeenCalled();
  });
});

// Section 4/5 of the first-login journey: the four AI access tiers explained
// honestly, and a hardware-aware recommendation reusing the same profiler
// AiAccessPage already depends on.
describe("AiSetupScreen — tier explanation and hardware recommendation", () => {
  it("explains all four tiers, including that free tiers are not unlimited", async () => {
    render(<AiSetupScreen onDone={vi.fn()} />);

    expect(await screen.findByText("Local — runs on your computer")).toBeInTheDocument();
    expect(screen.getByText(/free tiers are not unlimited/i)).toBeInTheDocument();
    expect(screen.getByText("Pro / BYOK — your own paid account")).toBeInTheDocument();
    expect(screen.getByText("Premium — provided by Scholar")).toBeInTheDocument();
    // Section 6: Omni Router never named as something to configure.
    expect(screen.queryByText(/omni router/i)).not.toBeInTheDocument();
  });

  it("recommends a free provider when no local runtime is detected", async () => {
    detectHardwareProfile.mockResolvedValue(HARDWARE_NO_LOCAL);
    render(<AiSetupScreen onDone={vi.fn()} />);

    expect(await screen.findByText(/we recommend starting with a Free provider like Google Gemini/)).toBeInTheDocument();
  });

  it("recommends Local AI, with the reason stated, when a runtime is detected and hardware supports it", async () => {
    detectHardwareProfile.mockResolvedValue(HARDWARE_WITH_LOCAL);
    render(<AiSetupScreen onDone={vi.fn()} />);

    expect(await screen.findByText(/we recommend starting with Local AI \(Ollama, 7B–8B quantized models\)/)).toBeInTheDocument();
    // "Why we recommend this" — the reasoning, not just a bare verdict.
    expect(screen.getByText(/16 GB reported RAM gives a good balance/)).toBeInTheDocument();
  });

  it("never promises a specific performance number", async () => {
    detectHardwareProfile.mockResolvedValue(HARDWARE_WITH_LOCAL);
    render(<AiSetupScreen onDone={vi.fn()} />);

    await screen.findByText(/we recommend starting with Local AI/);
    expect(screen.queryByText(/words\/sec|tokens\/sec/i)).not.toBeInTheDocument();
  });

  it("tells the user Premium is already active, rather than asking them to configure it, when their account is entitled", async () => {
    getAiAccessStatus.mockResolvedValue({
      connections: [],
      entitlement: { status: "active", active: true, planId: "premium_basic" },
      quota: { monthlyCredits: 5000, dailyCredits: 200, perTaskMaxCredits: 50, concurrencyLimit: 2 },
      creditBalance: { balance: 500, daily_used: 0, monthly_used: 0 },
    });
    render(<AiSetupScreen onDone={vi.fn()} />);

    expect(await screen.findByText(/Scholar Premium is already active on your account/)).toBeInTheDocument();
  });
});

// Section 7: several ways to finish, an honest summary, and never a false
// "configured" claim.
describe("AiSetupScreen — AI setup complete", () => {
  it("summarizes the freshly-connected provider and the recommendation before handing off", async () => {
    const onDone = vi.fn();
    render(<AiSetupScreen onDone={onDone} />);

    fireEvent.change(await screen.findByLabelText("API key"), { target: { value: "sk-my-secret" } });
    fireEvent.click(screen.getByRole("button", { name: /Save and continue/ }));

    expect(await screen.findByRole("heading", { name: "AI setup complete" })).toBeInTheDocument();
    expect(screen.getByText(/Available:/).closest("p")).toHaveTextContent("Google Gemini");
    expect(screen.getByText(/Recommended:/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("offers to continue with an AI source already connected from another device, without requiring a new key", async () => {
    getAiAccessStatus.mockResolvedValue({
      connections: [{ provider_id: "groq", tier: "free", status: "connected", models_detected: 5 }],
      entitlement: { status: "none", active: false },
      quota: null,
      creditBalance: null,
    });
    const onDone = vi.fn();
    render(<AiSetupScreen onDone={onDone} />);

    const continueButton = await screen.findByRole("button", { name: /Continue with your existing AI setup/ });
    fireEvent.click(continueButton);

    expect(await screen.findByRole("heading", { name: "AI setup complete" })).toBeInTheDocument();
    expect(screen.getByText(/Available:/).closest("p")).toHaveTextContent("1 free provider");
    // Nothing new was submitted — no verification or connection call for a key that was never entered.
    expect(verifyProviderKey).not.toHaveBeenCalled();
    expect(addConnection).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("does not offer 'continue with existing' when the account genuinely has no AI source yet", async () => {
    render(<AiSetupScreen onDone={vi.fn()} />);
    await screen.findByRole("radio", { name: /Google Gemini/ });

    expect(screen.queryByRole("button", { name: /Continue with your existing AI setup/ })).not.toBeInTheDocument();
  });
});

// Revisiting settings after the one-time setup stage is done — Header's
// "Settings" control used to be a labelled dead stub with nowhere to go.
// This reuses the same form (same storage functions, same validation), so
// these tests are about what changes for the mode, not the form itself.
describe("AiSetupScreen — revisit", () => {
  it("has no skip — there is nothing to skip past once already set up", async () => {
    render(<AiSetupScreen onDone={vi.fn()} onCancel={vi.fn()} variant="revisit" />);
    await screen.findByRole("radio", { name: /Google Gemini/ });
    expect(screen.queryByRole("button", { name: /Skip for now/ })).not.toBeInTheDocument();
  });

  it("offers a plain close instead", async () => {
    const onCancel = vi.fn();
    render(<AiSetupScreen onDone={vi.fn()} onCancel={onCancel} variant="revisit" />);
    await screen.findByRole("radio", { name: /Google Gemini/ });

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onCancel).toHaveBeenCalled();
  });

  it("loads the provider already on file, not the default", async () => {
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { provider: "openrouter", preferences: {} }, error: null }) }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    render(<AiSetupScreen onDone={vi.fn()} onCancel={vi.fn()} variant="revisit" />);

    expect(await screen.findByRole("radio", { name: /OpenRouter/ })).toBeChecked();
  });

  it("can change the provider and save without retyping a key already on this device", async () => {
    await storeProviderKey("openrouter", "sk-existing");
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { provider: "gemini", preferences: {} }, error: null }) }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    const onDone = vi.fn();
    render(<AiSetupScreen onDone={onDone} onCancel={vi.fn()} variant="revisit" />);

    fireEvent.click(await screen.findByRole("radio", { name: /OpenRouter/ }));
    expect(screen.getByRole("button", { name: "Save changes" })).toBeEnabled();
    fireEvent.click(screen.getByRole("button", { name: "Save changes" }));

    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });

  it("removes the connection when a saved key is forgotten, so it drops out of the routing pool", async () => {
    await storeProviderKey("gemini", "sk-existing");
    from.mockReturnValue({
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { provider: "gemini", preferences: {} }, error: null }) }) }),
      upsert: vi.fn().mockResolvedValue({ error: null }),
    });
    render(<AiSetupScreen onDone={vi.fn()} onCancel={vi.fn()} variant="revisit" />);

    fireEvent.click(await screen.findByRole("button", { name: /Remove the saved key for Google Gemini/ }));

    expect(providersWithStoredKey()).not.toContain("gemini");
    await waitFor(() => expect(removeConnection).toHaveBeenCalledWith("gemini"));
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

  // Priority: AI setup completion must be resumable across devices, not only
  // trusted from this device's localStorage — a user who connected a
  // provider on their laptop must not be asked to set up AI again on a
  // desktop that has never stored a key.
  it("is ready on a device with no local key when the account already has a connected provider", async () => {
    getAiAccessStatus.mockResolvedValue({
      connections: [{ provider_id: "groq", tier: "free", status: "connected", models_detected: 2 }],
      entitlement: { status: "none", active: false },
      quota: null,
      creditBalance: null,
    });

    const { result } = renderHook(() => useAiSetupStatus(USER.id));
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("is ready on a device with no local key when the account has an active Premium entitlement", async () => {
    getAiAccessStatus.mockResolvedValue({
      connections: [],
      entitlement: { status: "active", active: true, planId: "premium_basic" },
      quota: { monthlyCredits: 5000, dailyCredits: 200, perTaskMaxCredits: 50, concurrencyLimit: 2 },
      creditBalance: { balance: 500, daily_used: 0, monthly_used: 0 },
    });

    const { result } = renderHook(() => useAiSetupStatus(USER.id));
    await waitFor(() => expect(result.current.status).toBe("ready"));
  });

  it("falls back to 'needed' rather than blocking when the server check fails", async () => {
    getAiAccessStatus.mockRejectedValue(new Error("network down"));

    const { result } = renderHook(() => useAiSetupStatus(USER.id));
    await waitFor(() => expect(result.current.status).toBe("needed"));
  });
});
