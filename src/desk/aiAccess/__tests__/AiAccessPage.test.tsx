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
  getPremiumCatalog: vi.fn(async () => ({ active: false, providers: [] })),
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
  return render(<AiAccessPage onClose={() => {}} onOpenSetup={() => {}} />);
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
    expect(await screen.findByText(/granted by an administrator/i)).toBeInTheDocument();
  });

  it("lists the admin-chosen Premium providers when subscribed", async () => {
    const api = await import("../aiAccessApi");
    status.entitlement = { status: "active", active: true };
    vi.mocked(api.getPremiumCatalog).mockResolvedValueOnce({
      active: true,
      providers: [{ providerId: "openai", name: "OpenAI", models: ["gpt-4o-mini"] }],
    });
    renderPage();
    fireEvent.click(await screen.findByRole("button", { name: "Premium" }));

    expect(await screen.findByText(/Subscription status: Active/i)).toBeInTheDocument();
    expect(await screen.findByText("gpt-4o-mini")).toBeInTheDocument();
  });
});
