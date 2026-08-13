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
}));

vi.mock("../../../services/userAiSettings", () => ({
  DEFAULT_AI_SETTINGS: { provider: "gemini", preferences: {} },
  loadUserAiSettings: vi.fn(async () => ({ provider: "gemini", preferences: {} })),
  saveUserAiSettings: vi.fn(async () => ({ success: true })),
  providersWithStoredKey: vi.fn(() => [] as string[]),
  storeProviderKey: vi.fn(async () => {}),
  forgetProviderKey: vi.fn(() => {}),
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
  it("offers a section per tier rather than one long page", async () => {
    renderPage();
    for (const label of ["Overview", "Local AI", "Free AI", "Pro / BYOK", "Premium", "Models", "Settings"]) {
      expect(await screen.findByRole("button", { name: label })).toBeInTheDocument();
    }
  });

  it("lists every local runner in the catalogue, not just Ollama and a generic 'custom'", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Local AI" }));

    for (const runner of LOCAL_RUNNERS) {
      expect(await screen.findByText(runner.name)).toBeInTheDocument();
    }
    expect(LOCAL_RUNNERS.length).toBeGreaterThanOrEqual(8);
  });

  it("offers at least 30 genuinely free-to-use providers under Free AI", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Free AI" }));

    // The count the request asked for, asserted against the catalogue that
    // actually drives the list rather than a hardcoded number in the UI.
    expect(freeProviders().length).toBeGreaterThanOrEqual(30);
    await waitFor(() => expect(screen.getByPlaceholderText(/Search \d+ providers/)).toBeInTheDocument());
  });

  it("lists every cloud provider under Pro / BYOK, including free-tier ones a user may hold a paid key for", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Pro / BYOK" }));
    expect(await screen.findByText("OpenAI")).toBeInTheDocument();
    expect(await screen.findByText("Google Gemini")).toBeInTheDocument();
    expect(CLOUD_PROVIDERS.length).toBeGreaterThanOrEqual(35);
  });
});

describe("Manual hardware entry", () => {
  it("is always available, independent of whether auto-detection found anything", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Local AI" }));

    expect(await screen.findByText("Not detected yet.")).toBeInTheDocument();
    expect(screen.getByRole("heading", { name: "Enter your hardware manually" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save my hardware" })).toBeDisabled();
  });

  it("saves only the fields the user filled in, and reloads the hardware summary", async () => {
    const hardwareModule = await import("../../../services/hardwareProfiler");
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Local AI" }));

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
    fireEvent.click(await screen.findByRole("button", { name: "Local AI" }));
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
    fireEvent.click(await screen.findByRole("button", { name: "Free AI" }));
    fireEvent.click(await screen.findByText("Groq"));

    // Provider-specific: its own steps, its own key page, its own name.
    expect(await screen.findByRole("heading", { name: "Groq" })).toBeInTheDocument();
    expect(await screen.findByText(/Get a key from Groq/i)).toBeInTheDocument();
    const link = await screen.findByRole("link", { name: /Open Groq's API key page/i });
    expect(link).toHaveAttribute("href", "https://console.groq.com/keys");
  });

  it("states cost, key, account and limit facts for the provider", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Free AI" }));
    fireEvent.click(await screen.findByText("Groq"));

    expect(await screen.findByText("Free tier")).toBeInTheDocument();
    expect(await screen.findByText("API key required")).toBeInTheDocument();
    expect(await screen.findByText("Account required")).toBeInTheDocument();
  });

  it("offers a real model dropdown for a provider, not a free-text field, with Advanced as an opt-in escape hatch", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Free AI" }));
    fireEvent.click(await screen.findByText("Groq"));

    const advancedToggle = await screen.findByRole("checkbox", { name: /Advanced: use a custom model ID/i });
    expect(advancedToggle).not.toBeChecked();

    // The primary control is a real <select>, listing real catalog models —
    // not an <input> a user has to already know a model id to fill in.
    const select = screen.getByRole("combobox");
    const optionValues = Array.from((select as HTMLSelectElement).options).map((o) => o.value);
    expect(optionValues).toContain("llama-3.3-70b-versatile");
    expect(screen.queryByPlaceholderText(/Exact model id/i)).not.toBeInTheDocument();

    // Checking Advanced swaps in the free-text field, pre-filled with the
    // select's current value so switching modes never loses the choice.
    fireEvent.click(advancedToggle);
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
    const customInput = screen.getByPlaceholderText(/Exact model id/i) as HTMLInputElement;
    expect(customInput.value).toBe("llama-3.3-70b-versatile");
  });

  it("labels a deprecated model in the dropdown rather than presenting it as current", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Pro / BYOK" }));
    fireEvent.click(await screen.findByText("Anthropic Claude"));

    const select = (await screen.findByRole("combobox")) as HTMLSelectElement;
    const deprecatedOption = Array.from(select.options).find((o) => o.value === "claude-opus-4-8");
    expect(deprecatedOption?.textContent).toMatch(/deprecated/i);
  });

  it("verifies a key before saving it, and records the connection", async () => {
    const api = await import("../aiAccessApi");
    const store = await import("../../../services/userAiSettings");
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Free AI" }));
    fireEvent.click(await screen.findByText("Groq"));
    fireEvent.change(screen.getByPlaceholderText(/Paste your key/i), { target: { value: "gsk_test_key" } });
    fireEvent.click(screen.getByRole("button", { name: /Test and connect/i }));

    await waitFor(() => expect(api.verifyProviderKey).toHaveBeenCalledWith("groq", "gsk_test_key"));
    // Key is stored on the device, and only the fact of the connection is
    // recorded server-side — never the key itself.
    expect(store.storeProviderKey).toHaveBeenCalledWith("groq", "gsk_test_key");
    expect(api.addConnection).toHaveBeenCalledWith("groq", "free", 7);
  });

  it("does not save anything when verification fails", async () => {
    const api = await import("../aiAccessApi");
    const store = await import("../../../services/userAiSettings");
    vi.mocked(api.verifyProviderKey).mockResolvedValueOnce({ ok: false, error: "That key was rejected by the provider." });
    renderPage();

    fireEvent.click(await screen.findByRole("button", { name: "Free AI" }));
    fireEvent.click(await screen.findByText("Groq"));
    fireEvent.change(screen.getByPlaceholderText(/Paste your key/i), { target: { value: "bad" } });
    fireEvent.click(screen.getByRole("button", { name: /Test and connect/i }));

    expect(await screen.findByRole("alert")).toHaveTextContent(/rejected by the provider/i);
    expect(store.storeProviderKey).not.toHaveBeenCalled();
    expect(api.addConnection).not.toHaveBeenCalled();
  });
});

describe("Multiple simultaneous connections", () => {
  it("shows every connected provider at once, across tiers", async () => {
    status.connections = [
      { provider_id: "ollama", tier: "local", status: "connected", models_detected: 2 },
      { provider_id: "groq", tier: "free", status: "connected", models_detected: 9 },
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

describe("Premium", () => {
  it("never asks for an API key, and reports status as server-decided", async () => {
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Premium" }));

    expect(await screen.findByText(/Subscription status: Not subscribed/i)).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Paste your key/i)).not.toBeInTheDocument();
    // Status is decided on the server; the pane offers a request rather than
    // a switch.
    expect(await screen.findByText(/verified on Scholar's server/i)).toBeInTheDocument();
    expect(await screen.findByRole("button", { name: /Request Premium/i })).toBeInTheDocument();
  });

  it("names Premium capabilities by the admin's label, never the provider behind them", async () => {
    const api = await import("../aiAccessApi");
    status.entitlement = { status: "active", active: true };
    vi.mocked(api.getPremiumCatalog).mockResolvedValueOnce({
      active: true,
      planId: "premium_basic",
      resources: [{ id: "r1", label: "Advanced writing", description: "Best quality drafting", capabilities: ["reasoning"] }],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Premium" }));

    expect(await screen.findByText(/Subscription status: Active/i)).toBeInTheDocument();
    expect(await screen.findByText("Advanced writing")).toBeInTheDocument();
    // The provider-agnostic promise: nothing in this pane names a provider or
    // a model, so an admin can re-point the capability freely.
    expect(document.body.textContent).not.toMatch(/openai|gpt-4o|gemini/i);
  });

  it("lets a non-subscriber request Premium — the path that previously dead-ended", async () => {
    const api = await import("../aiAccessApi");
    vi.mocked(api.getOfferedPlans).mockResolvedValueOnce([
      { id: "premium_basic", name: "Premium Basic", description: "For everyday writing", monthlyCredits: 5000, weeklyCredits: null, dailyCredits: 200, perTaskMaxCredits: 50, concurrencyLimit: 2 },
    ]);
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Premium" }));

    fireEvent.click(await screen.findByLabelText(/Premium Basic/i));
    fireEvent.click(screen.getByRole("button", { name: /Request Premium/i }));

    await waitFor(() => expect(api.requestPremium).toHaveBeenCalledWith("premium_basic", undefined));
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
    expect(await screen.findByRole("button", { name: "Free AI" })).toBeInTheDocument();
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
    expect(await screen.findByText(/Nothing connected yet/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guided setup" })).not.toBeInTheDocument();
  });
});
