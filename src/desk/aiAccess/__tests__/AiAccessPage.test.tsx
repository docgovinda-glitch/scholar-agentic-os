// @vitest-environment jsdom
//
// The AI Access manager. What matters here is the behaviour the rebuild
// existed to create, so these assert the properties rather than the markup:
// a user can reach many providers, each gets its OWN configuration surface
// (not one shared form), sections are navigable without scrolling through
// everything, and Premium never asks for a key.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";

const status = {
  connections: [] as Array<{ provider_id: string; tier: string; status: string; models_detected: number | null }>,
  entitlement: { status: "none", active: false },
  quota: null,
  creditBalance: null,
};

// Models come live from the provider (src/desk/ai/modelChoices.ts); the page never names one.
vi.mock("../../ai/modelChoices", () => ({
  fetchModelsForKey: vi.fn(async () => ({
    models: [{ id: "live-model-a", provider: "groq", family: "f", tier: "balanced", version: [1], badges: [] }],
  })),
}));

vi.mock("../aiAccessApi", () => ({
  getAiAccessStatus: vi.fn(async () => status),
  addConnection: vi.fn(async () => ({ success: true })),
  removeConnection: vi.fn(async () => ({ success: true })),
  verifyProviderKey: vi.fn(async () => ({ ok: true, modelsDetected: 7 })),
  getPremiumCatalog: vi.fn(async () => ({ active: false, planId: null, resources: [] })),
  getOfferedPlans: vi.fn(async () => []),
  getMyPremiumRequest: vi.fn(async () => null),
  requestPremium: vi.fn(async () => ({ success: true })),
  withdrawPremiumRequest: vi.fn(async () => ({ success: true })),
  // The page now shows the router's live decision per task (no AI is called).
  routeDecision: vi.fn(async (taskType: string) =>
    status.connections.length
      ? { ok: true, choice: { tier: "free", providerId: status.connections[0].provider_id, modelId: taskType === "simple" ? "fast-model" : undefined, reasoning: "" }, fallbacks: status.connections.slice(1).map((c) => ({ tier: c.tier, providerId: c.provider_id, reasoning: "" })) }
      : { ok: false, reasoning: "No AI is connected yet." }
  ),
}));

vi.mock("../../../services/userAiSettings", () => ({
  DEFAULT_AI_SETTINGS: { provider: "gemini", preferences: {} },
  loadUserAiSettings: vi.fn(async () => ({ provider: "gemini", preferences: {} })),
  saveUserAiSettings: vi.fn(async () => ({ success: true })),
  providersWithStoredKey: vi.fn(() => [] as string[]),
  storeProviderKey: vi.fn(async () => {}),
  forgetProviderKey: vi.fn(() => {}),
}));

// Account key sync talks to the server; these tests cover the page, so it is
// stubbed to "nothing changed" (accountKeySync has its own tests).
vi.mock("../accountKeys", () => ({
  syncKeysWithAccount: vi.fn(async () => null),
  saveKeyToAccount: vi.fn(async () => true),
  removeKeyFromAccount: vi.fn(async () => {}),
}));

vi.mock("../../../services/hardwareProfiler", () => ({
  loadHardwareProfile: vi.fn(async () => null),
  detectHardwareProfile: vi.fn(async () => null),
  saveHardwareProfile: vi.fn(async () => {}),
  saveManualHardwareProfile: vi.fn(async () => {}),
  recommendLocalModel: vi.fn(() => ({ sizeClass: "unknown", reasoning: "", warnings: [] })),
}));

import AiAccessPage from "../AiAccessPage";
import { CLOUD_PROVIDERS } from "../../../config/providerCatalog";
import { LOCAL_RUNNERS } from "../../../config/localRunnerCatalog";
import { freeProviders } from "../useAiAccess";

beforeEach(() => {
  cleanup();
  status.connections = [];
  status.entitlement = { status: "none", active: false };
  vi.clearAllMocks();
});

function renderPage() {
  return render(<AiAccessPage onClose={() => {}} />);
}

describe("AI Access navigation", () => {
  it("offers 4 action-oriented tabs: Overview, Providers, Premium, Preferences", async () => {
    renderPage();
    for (const label of ["Overview", "Providers", "Premium", "Preferences"]) {
      expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
    }
    expect(screen.queryByRole("button", { name: "Local AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Free AI" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Pro / BYOK" })).not.toBeInTheDocument();
  });

  it("lists every local runner in the catalogue under Providers", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Local Runners" }));

    for (const runner of LOCAL_RUNNERS) {
      expect(await screen.findByText(runner.name)).toBeInTheDocument();
    }
    expect(LOCAL_RUNNERS.length).toBeGreaterThanOrEqual(8);
  });

  it("offers at least 30 genuinely free-to-use providers under Providers", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));

    expect(freeProviders().length).toBeGreaterThanOrEqual(30);
    await waitFor(() => expect(screen.getByPlaceholderText(/Search \d+ providers/)).toBeInTheDocument());
  });

  it("lists cloud providers under Providers, including free-tier and pro", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    expect(await screen.findByText("OpenAI")).toBeInTheDocument();
    expect(await screen.findByText("Google Gemini")).toBeInTheDocument();
    expect(CLOUD_PROVIDERS.length).toBeGreaterThanOrEqual(35);
  });
});

describe("Manual hardware entry", () => {
  it("is always available, independent of whether auto-detection found anything", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Local Runners" }));

    expect(await screen.findByText("Not detected yet.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter your hardware manually" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save my hardware" })).toBeDisabled();
  });

  it("saves only the fields the user filled in, and reloads the hardware summary", async () => {
    const hardwareModule = await import("../../../services/hardwareProfiler");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Local Runners" }));

    fireEvent.change(screen.getByLabelText("RAM (GB)"), { target: { value: "32" } });
    const save = screen.getByRole("button", { name: "Save my hardware" });
    expect(save).toBeEnabled();
    fireEvent.click(save);

    await waitFor(() =>
      expect(hardwareModule.saveManualHardwareProfile).toHaveBeenCalledWith(
        expect.objectContaining({ ramGb: 32, os: undefined })
      )
    );
    expect(await screen.findByText(/Saved\./)).toBeInTheDocument();
    // Reloads via loadHardwareProfile so the summary card reflects the save immediately.
    expect(hardwareModule.loadHardwareProfile).toHaveBeenCalled();
  });
});

describe("Local runner configuration", () => {
  it("keeps the free-text model field behind an Advanced toggle before anything is detected, matching the cloud dropdown's opt-in framing", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Local Runners" }));
    fireEvent.click(await screen.findByText("Ollama"));

    expect(await screen.findByText(/Detect models first, or check Advanced/i)).toBeInTheDocument();
    const advancedToggle = screen.getByRole("checkbox", { name: /Advanced: use a custom model ID/i });
    expect(advancedToggle).not.toBeChecked();
    expect(screen.queryByPlaceholderText(/Exact model name/i)).not.toBeInTheDocument();

    fireEvent.click(advancedToggle);
    expect(screen.getByPlaceholderText(/Exact model name/i)).toBeInTheDocument();
  });
});

describe("Per-provider configuration", () => {
  it("opens a configuration surface for the chosen provider, naming that provider — not a shared generic form", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByText("Groq"));

    // Provider-specific: its own steps, its own key page, its own name.
    expect(await screen.findByRole("heading", { name: "Groq" })).toBeInTheDocument();
    expect(await screen.findByText(/Get a key from Groq/i)).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: /Open Groq's API key page/i });
    expect(link).toHaveAttribute("href", "https://console.groq.com/keys");
  });

  it("states cost, key, account and limit facts for the provider", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByText("Groq"));

    expect(await screen.findByText("Free tier")).toBeInTheDocument();
    expect(await screen.findByText("API key required")).toBeInTheDocument();
    expect(await screen.findByText("Account required")).toBeInTheDocument();
  });



  it("lists the models the provider reports for the key, with Advanced as an opt-in escape hatch", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByText("Groq"));
    const key = screen.getByPlaceholderText(/Paste your key/i);
    fireEvent.change(key, { target: { value: "gsk_test_key" } });
    fireEvent.blur(key);

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    expect(Array.from(select.options).map((o) => o.value)).toContain("live-model-a");
    const advanced = screen.getByRole("checkbox", { name: /Advanced: use a custom model ID/i });
    expect(advanced).not.toBeChecked();
    fireEvent.click(advanced);
    expect((screen.getByPlaceholderText(/Exact model id/i) as HTMLInputElement).value).toBe("live-model-a");
  });


  it("verifies a key before saving it, and records the connection", async () => {
    const api = await import("../aiAccessApi");
    const store = await import("../../../services/userAiSettings");
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByText("Groq"));
    const keyInput = screen.getByPlaceholderText(/Paste your key/i);
    fireEvent.change(keyInput, { target: { value: "gsk_test_key" } });
    fireEvent.blur(keyInput);
    await screen.findByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: /Test and connect/i }));

    await waitFor(() => expect(api.verifyProviderKey).toHaveBeenCalled());
    expect(vi.mocked(api.verifyProviderKey).mock.calls[0].slice(0, 2)).toEqual(["groq", "gsk_test_key"]);
    // The key is stored on this device and saved (encrypted) to the account
    // so it works on the person's other devices; the connection is recorded.
    const account = await import("../accountKeys");
    expect(store.storeProviderKey).toHaveBeenCalledWith("groq", "gsk_test_key");
    expect(account.saveKeyToAccount).toHaveBeenCalledWith("groq", "gsk_test_key");
    expect(api.addConnection).toHaveBeenCalledWith("groq", "byok", 7);
  });

  it("does not save anything when verification fails", async () => {
    const api = await import("../aiAccessApi");
    const store = await import("../../../services/userAiSettings");
    vi.mocked(api.verifyProviderKey).mockResolvedValueOnce({ ok: false, error: "That key was rejected by the provider." });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByText("Groq"));
    const badKey = screen.getByPlaceholderText(/Paste your key/i);
    fireEvent.change(badKey, { target: { value: "bad" } });
    fireEvent.blur(badKey);
    await screen.findByRole("combobox");
    fireEvent.click(screen.getByRole("button", { name: /Test and connect/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/rejected by the provider/i);
    expect(store.storeProviderKey).not.toHaveBeenCalled();
    expect(api.addConnection).not.toHaveBeenCalled();
    const account = await import("../accountKeys");
    expect(account.saveKeyToAccount).not.toHaveBeenCalled();
  });
});

describe("Multiple simultaneous connections", () => {
  it("shows every connected provider at once, across tiers", async () => {
    status.connections = [
      { provider_id: "ollama", tier: "local", status: "connected", models_detected: 2 },
      { provider_id: "groq", tier: "byok", status: "connected", models_detected: 9 },
      { provider_id: "openai", tier: "byok", status: "connected", models_detected: 30 },
    ];
    renderPage();

    // The old page could only ever say "Not configured" four times; the point
    // of the rebuild is that these coexist.
    expect(await screen.findByText("Ollama")).toBeInTheDocument();
    expect(await screen.findByText("Groq")).toBeInTheDocument();
    expect(await screen.findByText("OpenAI")).toBeInTheDocument();
  });
});


describe("Error handling", () => {
  it("surfaces the HTTP failure when an error response has no object body", async () => {
    // The client's api() helper read `body.error` on a body that could be
    // null, throwing a TypeError that replaced the real failure with an
    // unrelated crash. GET /premium-request genuinely returns bare `null`, so
    // this shape is not hypothetical.
    const api = await import("../aiAccessApi");
    vi.mocked(api.getAiAccessStatus).mockRejectedValueOnce(new Error("Request failed (503)"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Request failed \(503\)/);
    // The page still renders its catalogue rather than blanking.
    expect(await screen.findByRole("button", { name: "Providers" })).toBeInTheDocument();
  });

  it("allows retrying live status when an error occurs", async () => {
    const api = await import("../aiAccessApi");
    vi.mocked(api.getAiAccessStatus).mockRejectedValueOnce(new Error("Request failed (429)"));
    renderPage();

    expect(await screen.findByRole("alert")).toHaveTextContent(/Request failed \(429\)/);
    const retryBtn = screen.getByRole("button", { name: "Retry" });
    expect(retryBtn).toBeInTheDocument();

    vi.mocked(api.getAiAccessStatus).mockResolvedValueOnce(status);
    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(api.getAiAccessStatus).toHaveBeenCalledTimes(2);
      expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    });
  });
});

describe("Onboarding mode — AI Access as the first destination after login", () => {
  it("in manage mode (default), shows Close and never Skip/Continue", async () => {
    renderPage();
    expect(await screen.findByRole("button", { name: "Close" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();
  });

  it("in onboarding mode, shows Skip/Continue instead of Close, and the progress strip", async () => {
    render(<AiAccessPage mode="onboarding" onContinue={() => {}} onSkip={() => {}} />);
    expect(await screen.findByRole("button", { name: "Skip for now" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Continue" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Close" })).not.toBeInTheDocument();
    // Onboarding progress: this stage current, Knowledge and Workshop ahead.
    expect(screen.getByRole("list", { name: "Onboarding progress" })).toBeInTheDocument();
  });

  it("Skip calls onSkip, not onContinue", async () => {
    const onContinue = vi.fn();
    const onSkip = vi.fn();
    render(<AiAccessPage mode="onboarding" onContinue={onContinue} onSkip={onSkip} />);

    fireEvent.click(await screen.findByRole("button", { name: "Skip for now" }));
    expect(onSkip).toHaveBeenCalled();
    expect(onContinue).not.toHaveBeenCalled();
  });

  it("Continue calls onContinue and is available even with nothing connected — every stage stays skippable", async () => {
    const onContinue = vi.fn();
    render(<AiAccessPage mode="onboarding" onContinue={onContinue} onSkip={() => {}} />);

    const continueButton = await screen.findByRole("button", { name: "Continue" });
    expect(continueButton).toBeEnabled();
    fireEvent.click(continueButton);
    expect(onContinue).toHaveBeenCalled();
  });

  it("has no 'Guided setup' handoff — every section is already its own guided flow", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Overview" }));
    // The empty state is now a quick start with three ways in (was "Nothing connected yet").
    expect(await screen.findByText(/Connect an AI to get started/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guided setup" })).not.toBeInTheDocument();
  });
});

describe("AI Access upgrade: honest status, quick start, live routing", () => {
  it("starts a newcomer with three concrete options, not a bare list of 46", async () => {
    status.connections = [];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Overview" }));
    const start = await screen.findByRole("region", { name: "Get started" });
    expect(start).toHaveTextContent("Recommended: Google Gemini");
    expect(start).toHaveTextContent("Groq");
    expect(start).toHaveTextContent("Ollama");
    expect(screen.getAllByRole("link", { name: /Get a key/ })[0]).toHaveAttribute("href", "https://aistudio.google.com/app/apikey");
    // A preferred provider with nothing connected is not shown as if it were set up.
    expect(screen.getByRole("button", { name: /Preferences\s*Not set/ })).toBeInTheDocument();
  });

  it("shows which AI each task would use now, with fallbacks, from the live router", async () => {
    status.connections = [
      { provider_id: "groq", tier: "byok", status: "connected", models_detected: 9 },
      { provider_id: "ollama", tier: "local", status: "connected", models_detected: 2 },
    ];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Overview" }));
    const routing = await screen.findByRole("region", { name: "How tasks are routed now" });
    await waitFor(() => expect(routing).toHaveTextContent("Research, drafting and reviews"));
    await waitFor(() => expect(routing).toHaveTextContent("Then Ollama if it is unavailable"));
    expect(routing).toHaveTextContent("Groq · fast-model");
    // No fixed, made-up routes remain anywhere on the page.
    for (const made of ["DeepSeek-R1 / Claude", "Groq / Flash / Local", "Gemini Embeddings / Local Vector"]) {
      expect(screen.queryByText(new RegExp(made.replace(/[/]/g, "\\/")))).toBeNull();
    }
  });

  it("filters providers to free-to-start and connected ones", async () => {
    status.connections = [{ provider_id: "groq", tier: "byok", status: "connected", models_detected: 9 }];
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByRole("button", { name: "Connected (1)" }));
    expect(await screen.findByText("Groq")).toBeInTheDocument();
    expect(screen.queryByText("Ollama")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Free to start" }));
    expect(await screen.findByText("Ollama")).toBeInTheDocument();
  });
});

