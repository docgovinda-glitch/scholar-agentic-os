// @vitest-environment jsdom
//
// The canonical first-login journey, end to end, through the REAL DeskApp
// and the REAL useAiSetupStatus/useVaultSetupStatus hooks — unlike
// DeskApp.test.tsx (which stubs both hooks to "already done" so its own
// tests stay about the project list/shell) and AiSetup.test.tsx/
// VaultSetup.test.tsx (which test each screen in isolation), this file is
// about whether the pieces actually gate each other in the right order:
//
//   LOGIN/SIGNUP -> AI SETUP -> KNOWLEDGE (OPTIONAL) -> WORKSHOP
//
// and that a returning user with completed onboarding goes straight to the
// workspace, on any device, because completion is server-trusted rather
// than read only from this browser's own localStorage.
//
// Only the true boundaries are mocked: the Supabase session (useDeskSession,
// fixed signed-in), the Supabase Data API (`from`, a small in-memory table
// keyed by name), the AI Access API, hardware detection, and `/api/*` via
// fetch — the same layer DeskApp.test.tsx already mocks at.

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BrowserRouter } from "react-router-dom";

const USER = { id: "11111111-1111-4111-8111-111111111111", email: "scholar@example.com" };

vi.mock("../useDeskSession", () => ({
  useDeskSession: () => ({ status: "signed-in", userId: USER.id, email: USER.email }),
}));

const getUser = vi.fn();
/** In-memory rows, keyed by table — mutated by upsert() the same way the real Data API would persist them, so a re-mount sees what an earlier mount "saved". */
const db: { user_ai_settings: { provider: string; preferences: Record<string, string> } | null; user_vaults: { label: string; created_at: string } | null } = {
  user_ai_settings: null,
  user_vaults: null,
};

function from(table: string) {
  if (table === "user_ai_settings") {
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.user_ai_settings, error: null }) }) }),
      upsert: vi.fn(async (row: any) => {
        db.user_ai_settings = { provider: row.provider, preferences: row.preferences };
        return { error: null };
      }),
    };
  }
  if (table === "user_vaults") {
    return {
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: db.user_vaults, error: null }) }) }),
      upsert: vi.fn(async (row: any) => {
        db.user_vaults = { label: row.label, created_at: "2026-01-01T00:00:00.000Z" };
        return { error: null };
      }),
    };
  }
  if (table === "profiles") {
    const profileRes = async () => ({ data: { username: "scholar", full_name: "Scholar Student", user_type: "student", education_level: "undergrad", affiliation: "University" }, error: null });
    return {
      select: () => ({ eq: () => ({ single: profileRes, maybeSingle: profileRes }) }),
    };
  }
  throw new Error(`Unmocked table: ${table}`);
}

vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getUser,
      signOut: vi.fn(),
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
    },
    from,
  }),
}));

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

const { default: DeskApp } = await import("../DeskApp");

// DeskApp renders a <Routes> tree — it needs a real Router ancestor, same as
// it gets from main.tsx in production. BrowserRouter, not MemoryRouter: this
// file sets up its starting scene with window.history.pushState() directly
// (e.g. landing mid-onboarding on a project URL), so the router's notion of
// the current URL has to be the same window.location these tests drive.
function renderDeskApp() {
  return render(
    <BrowserRouter>
      <DeskApp />
    </BrowserRouter>
  );
}

const NO_SERVER_SOURCE = { connections: [], entitlement: { status: "none", active: false }, quota: null, creditBalance: null };
const ONE_CONNECTION_SOURCE = {
  connections: [{ provider_id: "groq", tier: "free", status: "connected", models_detected: 5 }],
  entitlement: { status: "none", active: false },
  quota: null,
  creditBalance: null,
};

const originalFetch = global.fetch;

interface MockRoute {
  url: RegExp;
  method?: string;
  body: unknown;
  status?: number;
}

function mockFetchSequence(responses: MockRoute[]) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const match = responses.find((r) => r.url.test(url) && (r.method ?? "GET").toUpperCase() === method);
    if (!match) {
      // Anything unrecognized (chiefly local-runner health probes to
      // localhost) is a "not reachable" 404, not a thrown error — the same
      // shape a real absent local runtime produces, and probeRunner already
      // treats both a non-ok response and a thrown error identically.
      return Promise.resolve({ ok: false, status: 404, json: async () => ({}) } as Response);
    }
    return Promise.resolve({
      ok: (match.status ?? 200) < 400,
      status: match.status ?? 200,
      json: async () => match.body,
    } as Response);
  }) as unknown as typeof fetch;
}

const NO_PROJECTS = { url: /\/api\/projects$/, body: { items: [] } };

beforeEach(() => {
  localStorage.clear();
  db.user_ai_settings = null;
  db.user_vaults = null;
  getUser.mockResolvedValue({ data: { user: USER } });
  verifyProviderKey.mockReset().mockResolvedValue({ ok: true, modelsDetected: 3 });
  addConnection.mockReset().mockResolvedValue({ success: true });
  removeConnection.mockReset().mockResolvedValue({ success: true });
  getAiAccessStatus.mockReset().mockResolvedValue(NO_SERVER_SOURCE);
  loadHardwareProfile.mockReset().mockResolvedValue(null);
  detectHardwareProfile.mockReset().mockResolvedValue(HARDWARE_NO_LOCAL);
  mockFetchSequence([NO_PROJECTS]);
  // Deterministic starting URL for every test, not just a leftover from the
  // previous one's afterEach.
  window.history.pushState({}, "", "/projects");
});

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
  window.history.pushState({}, "", "/projects");
});

describe("the canonical first-login journey", () => {
  it("1. a brand-new user is taken to AI Access, not straight to the workspace", async () => {
    renderDeskApp();
    // AI Access's own h1, in onboarding mode — the same page the "AI Access"
    // nav item opens later, distinguished from a plain revisit by the
    // Skip/Continue header (asserted in test 3/4 below) rather than a
    // separate screen.
    expect(await screen.findByRole("heading", { name: "AI Access" })).toBeInTheDocument();
    expect(screen.queryByText("Initialize your first project")).not.toBeInTheDocument();
  });

  it("2. a returning user whose account already has a connected provider and a Vault goes straight to the workspace", async () => {
    getAiAccessStatus.mockResolvedValue(ONE_CONNECTION_SOURCE);
    db.user_vaults = { label: "My Knowledge Vault", created_at: "2026-01-01T00:00:00.000Z" };

    renderDeskApp();
    expect(await screen.findByText("Initialize your first project")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "AI Access" })).not.toBeInTheDocument();
    expect(screen.queryByText(/long-term library/i)).not.toBeInTheDocument();
  });

  it("3. completing AI Access moves to Knowledge Setup next, not straight to the workspace", async () => {
    renderDeskApp();
    await screen.findByRole("heading", { name: "AI Access" });

    // Configure a provider — the same per-provider flow AiAccessPage.test.tsx
    // covers in isolation — then advance via the onboarding header's Continue.
    fireEvent.click(await screen.findByRole("button", { name: "Providers" }));
    fireEvent.click(await screen.findByText("Groq"));
    fireEvent.change(await screen.findByPlaceholderText(/Paste your key/i), { target: { value: "sk-my-secret" } });
    fireEvent.click(screen.getByRole("button", { name: /Test and connect/i }));
    await waitFor(() => expect(addConnection).toHaveBeenCalledWith("groq", "free", 3));

    fireEvent.click(screen.getByRole("button", { name: "Continue" }));

    expect(await screen.findByText(/long-term library/i)).toBeInTheDocument();
  });

  it("4. skipping Knowledge moves to the workspace", async () => {
    renderDeskApp();
    fireEvent.click(await screen.findByRole("button", { name: /Skip for now/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Next →/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Not now" }));

    expect(await screen.findByText("Initialize your first project")).toBeInTheDocument();
    expect(await screen.findByText("Welcome to your Scholar Workspace")).toBeInTheDocument();
  });

  it("5. completing Knowledge moves to the workspace, with a one-time welcome", async () => {
    renderDeskApp();
    fireEvent.click(await screen.findByRole("button", { name: /Skip for now/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Next →/ }));
    fireEvent.click(await screen.findByRole("button", { name: /Create a Secure Vault/ }));
    fireEvent.change(await screen.findByLabelText("Vault passphrase"), { target: { value: "correct horse" } });
    fireEvent.change(screen.getByLabelText("Confirm passphrase"), { target: { value: "correct horse" } });
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText(/Save your recovery code/i);
    fireEvent.click(screen.getByRole("checkbox"));
    fireEvent.click(screen.getByRole("button", { name: "Continue" }));
    await screen.findByText("Your Vault is ready");
    fireEvent.click(screen.getByRole("button", { name: "Go to your work" }));

    expect(await screen.findByText("Initialize your first project")).toBeInTheDocument();
    expect(await screen.findByText("Welcome to your Scholar Workspace")).toBeInTheDocument();
  });

  it("6. a user who finished AI Setup but not Knowledge resumes at Knowledge on a fresh mount, not back at AI Setup", async () => {
    // AI Setup's own completion signal: a provider recorded server-side already.
    getAiAccessStatus.mockResolvedValue(ONE_CONNECTION_SOURCE);
    // Knowledge genuinely undecided: no Vault, and no skip recorded.

    renderDeskApp();
    expect(await screen.findByText(/long-term library/i)).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Connect an AI provider" })).not.toBeInTheDocument();
  });

  it("9. a direct project URL mid-onboarding still shows AI Access first, never the project underneath it", async () => {
    window.history.pushState({}, "", "/projects/some-project");
    renderDeskApp();
    expect(await screen.findByRole("heading", { name: "AI Access" })).toBeInTheDocument();
  });

  it("10. once onboarding is complete, a fresh mount does not loop back into it", async () => {
    getAiAccessStatus.mockResolvedValue(ONE_CONNECTION_SOURCE);
    db.user_vaults = { label: "My Knowledge Vault", created_at: "2026-01-01T00:00:00.000Z" };

    const { unmount } = renderDeskApp();
    await screen.findByText("Initialize your first project");
    unmount();

    renderDeskApp();
    expect(await screen.findByText("Initialize your first project")).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "AI Access" })).not.toBeInTheDocument();
    expect(screen.queryByText(/long-term library/i)).not.toBeInTheDocument();
  });
});
