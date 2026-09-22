// @vitest-environment jsdom
//
// Desk end-to-end against a mocked backend contract.
//
// Two things changed when Desk was promoted to the real client, and both
// show up here: it renders behind DeskAuthGate, and its entry surface is the
// user's project list rather than a bare create form. The session is stubbed
// signed-in so these tests stay about Desk's flow; the gate's own behaviour
// is tested in DeskAuthGate.test.tsx, and the server-side enforcement that
// actually protects the data is in server/routes/__tests__/project.authz.test.ts.

import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import { BrowserRouter } from "react-router-dom";
import DeskApp from "../DeskApp";

// DeskApp renders a <Routes> tree — it needs a real Router ancestor, same as
// it gets from main.tsx in production. BrowserRouter, not MemoryRouter: these
// tests set up their starting scene with window.history.pushState() directly
// (e.g. landing on an already-open project), so the router's notion of the
// current URL has to be the same window.location these tests drive.
function renderDeskApp() {
  return render(
    <BrowserRouter>
      <DeskApp />
    </BrowserRouter>
  );
}

vi.mock("../useDeskSession", () => ({
  useDeskSession: () => ({ status: "signed-in", userId: "user-1", email: "scholar@example.com" }),
}));

// AI setup and the Knowledge Vault offer sit between sign-in and the
// workspace. These tests are about the project list and the shell, so both
// stages are reported already done — their own gating behaviour is covered in
// AiSetup.test.tsx and VaultSetup.test.tsx.
vi.mock("../setup/useAiSetupStatus", () => ({
  useAiSetupStatus: () => ({ status: "ready", skip: vi.fn(), complete: vi.fn(), refresh: vi.fn() }),
}));
vi.mock("../setup/useVaultSetupStatus", () => ({
  useVaultSetupStatus: () => ({ status: "done", skip: vi.fn(), complete: vi.fn() }),
}));

// api.ts asks the Supabase client for an access token on every request.
vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({
    auth: {
      getSession: async () => ({ data: { session: { access_token: "test-token" } } }),
      getUser: async () => ({ data: { user: { id: "user-1" } } }),
      signOut: vi.fn(),
    },
    from: () => ({
      insert: () => ({
        select: () => ({
          single: async () => ({ data: { username: "u", full_name: "Scholar" }, error: null }),
          maybeSingle: async () => ({ data: { username: "u", full_name: "Scholar" }, error: null }),
        }),
      }),
      select: () => ({
        eq: () => ({
          maybeSingle: async () => ({ data: { username: "u", full_name: "Scholar", phone: "", affiliation: "", user_type: "student", education_level: "undergraduate", field_of_study: "Science" }, error: null }),
          // Account Settings' getProfile() — a generic empty profile is fine
          // here since these tests are about the nav/routing shell, not the
          // form's own content (that's AccountSettingsScreen's own coverage).
          single: async () => ({ data: { username: "u", full_name: "Scholar", phone: "", affiliation: "", user_type: "student", education_level: "undergraduate", field_of_study: "Science" }, error: null }),
        }),
      }),
    }),
  }),
}));

const originalFetch = global.fetch;

interface MockRoute {
  url: RegExp;
  /** Defaults to GET. Needed because /api/projects is both the list and the create route. */
  method?: string;
  body: unknown;
  status?: number;
}

function mockFetchSequence(responses: MockRoute[]) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const match = responses.find((r) => r.url.test(url) && (r.method ?? "GET").toUpperCase() === method);
    if (!match) throw new Error(`Unmocked fetch: ${method} ${url}`);
    return Promise.resolve({
      ok: (match.status ?? 200) < 400,
      status: match.status ?? 200,
      json: async () => match.body,
    } as Response);
  }) as unknown as typeof fetch;
}

const OT = {
  id: "OT-06",
  label: "Journal Article",
  aliases: [],
  family: "article",
  academicLevels: [],
  typicalDisciplines: [],
  available: true,
};

const projectView = (projectId: string, over: Record<string, unknown> = {}) => ({
  projectId,
  outputTypeId: "OT-06",
  answers: {},
  intakeCompleteness: 0,
  hasDocument: false,
  gates: [{ gate: "G0", name: "Definition", status: "not_started", outstandingBlocking: [] }],
  ...over,
});

// Deterministic starting URL for every test, not just a leftover from the
// previous one's afterEach — the first test in the file would otherwise start
// at jsdom's default "/", which "/" now matches as an explicit PublicOnly
// route and redirects away from before landing on the project list.
beforeEach(() => {
  window.history.pushState({}, "", "/projects");
});

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
  window.history.pushState({}, "", "/projects");
});

describe("Desk — project list", () => {
  it("shows the empty state when the user has no projects yet", async () => {
    mockFetchSequence([
      { url: /\/api\/projects$/, body: { items: [] } },
      { url: /\/api\/atlas\/output-types$/, body: { items: [] } },
    ]);

    renderDeskApp();

    // The main canvas is purged of project lists; accessing Knowledge Vault from sidebar shows empty state
    fireEvent.click(await screen.findByRole("button", { name: /Knowledge Vault/i }));
    expect(await screen.findByText("No projects yet")).toBeInTheDocument();
  });

  it("lists the user's own projects and opens one", async () => {
    mockFetchSequence([
      { url: /\/api\/projects$/, body: { items: [projectView("proj-abc", { intakeCompleteness: 0.5 })] } },
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/projects\/proj-abc$/, body: projectView("proj-abc") },
      { url: /\/api\/projects\/proj-abc\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/proj-abc\/document$/, body: {}, status: 404 },
    ]);

    renderDeskApp();

    // Access project management via Knowledge Vault in the left sidebar
    fireEvent.click(await screen.findByRole("button", { name: /Knowledge Vault/i }));

    expect(await screen.findByText(/Workflow Completion/)).toBeInTheDocument();
    expect((await screen.findAllByText("50%"))[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Open Workspace" }));

    // The shell opens on Intake while G0 is outstanding — that is the first
    // real task, and it gates every later gate.
    fireEvent.click(await screen.findByRole("button", { name: "Document" }));
    expect(await screen.findByRole("heading", { name: "Draft your Manuscript" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/projects/proj-abc/document");
  });

  it("creates a project from a real output type and opens it", async () => {
    mockFetchSequence([
      { url: /\/api\/projects$/, body: { items: [] } },
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/projects$/, method: "POST", body: projectView("proj-new") },
      { url: /\/api\/projects\/proj-new$/, body: projectView("proj-new") },
      { url: /\/api\/projects\/proj-new\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/proj-new\/document$/, body: {}, status: 404 },
    ]);

    renderDeskApp();

    fireEvent.click(await screen.findByText("New Project"));
    fireEvent.change(await screen.findByLabelText("Target Publication Type"), { target: { value: "OT-06" } });
    fireEvent.click(screen.getByRole("button", { name: "Boot Workspace" }));

    fireEvent.click(await screen.findByRole("button", { name: "Document" }));
    expect(await screen.findByRole("heading", { name: "Draft your Manuscript" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/projects/proj-new/document");
  });
});

describe("Desk — project shell", () => {
  it("opens on Intake while G0 is outstanding — the first task gates the rest", async () => {
    window.history.pushState({}, "", "/projects/proj-42");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types\/OT-06$/, body: { id: "OT-06", label: "Journal Article", family: "article", intakeSchema: { required: [], recommended: [], optional: [] } } },
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/projects\/proj-42$/, body: projectView("proj-42") },
      { url: /\/api\/projects\/proj-42\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/proj-42\/document$/, body: {}, status: 404 },
    ]);

    renderDeskApp();

    expect(await screen.findByText("Research Definition")).toBeInTheDocument();
  });

  it("gives each tab its own URL, so Back steps back through tabs and refresh keeps you on the one you had open", async () => {
    window.history.pushState({}, "", "/projects/proj-42");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/projects\/proj-42$/, body: projectView("proj-42") },
      { url: /\/api\/projects\/proj-42\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/proj-42\/document$/, body: {}, status: 404 },
    ]);

    renderDeskApp();

    // G0 isn't signed off in this fixture, so the shell auto-decides Definition
    // and replaces the bare /projects/proj-42 URL with it — not a real
    // navigation the user took, so it must not be a Back-able entry itself.
    await waitFor(() => expect(window.location.pathname).toBe("/projects/proj-42/definition"));

    fireEvent.click(await screen.findByRole("button", { name: "Document" }));
    expect(await screen.findByRole("heading", { name: "Draft your Manuscript" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/projects/proj-42/document");

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe("/projects/proj-42/definition"));

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe("/projects"));
  });

  it("reads the project id from the URL and renders that project directly", async () => {
    window.history.pushState({}, "", "/projects/proj-42");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/atlas\/output-types\/OT-06$/, body: { id: "OT-06", label: "Journal Article", family: "article", intakeSchema: { required: [], recommended: [], optional: [] } } },
      {
        url: /\/api\/projects\/proj-42$/,
        body: projectView("proj-42", {
          intakeCompleteness: 0.5,
          gates: [{ gate: "G0", name: "Definition", status: "in_progress", outstandingBlocking: ["Title required"] }],
        }),
      },
      { url: /\/api\/projects\/proj-42\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/proj-42\/document$/, body: {}, status: 404 },
    ]);

    renderDeskApp();

    expect(await screen.findByText("Journal Article")).toBeInTheDocument();
    expect(screen.getByText(/G0 Definition/)).toBeInTheDocument();
    expect(screen.getByText(/1 blocking/)).toBeInTheDocument();
  });

  it("submits pasted plain text as a document and shows real Compliance findings back", async () => {
    window.history.pushState({}, "", "/projects/proj-7");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      {
        url: /\/api\/projects\/proj-7$/,
        body: projectView("proj-7", {
          gates: [{ gate: "G6", name: "Rubric", status: "not_started", outstandingBlocking: [] }],
        }),
      },
      { url: /\/api\/projects\/proj-7\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/proj-7\/document$/, body: {}, status: 404 },
      {
        url: /\/api\/projects\/proj-7\/document$/,
        method: "PUT",
        body: {
          ...projectView("proj-7", {
            hasDocument: true,
            gates: [{ gate: "G6", name: "Rubric", status: "in_progress", outstandingBlocking: ["Word count too low"] }],
          }),
          rubric: {
            findings: [
              {
                ruleId: "word_count",
                status: "fail",
                severity: "blocking",
                message: "Below the minimum word count.",
                remedy: "Add more content.",
              },
            ],
            blockingFailures: [],
            requiredFailures: [],
            advisoryFindings: [],
            readyForG6: false,
          },
        },
      },
    ]);

    renderDeskApp();

    fireEvent.click(await screen.findByRole("button", { name: "Document" }));
    const textarea = await screen.findByPlaceholderText(/Paste or type a draft/);
    fireEvent.change(textarea, { target: { value: "First paragraph.\n\nSecond paragraph." } });
    fireEvent.click(screen.getByText("Initialize Manuscript"));

    expect(await screen.findByText("Below the minimum word count.")).toBeInTheDocument();
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("→ Add more content.")).toBeInTheDocument();
  });

  it("shows an honest error with a route back, not a dead end, when the project fetch fails", async () => {
    window.history.pushState({}, "", "/projects/missing");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [] } },
      { url: /\/api\/projects\/missing\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/missing\/document$/, body: {}, status: 404 },
      { url: /\/api\/projects\/missing$/, body: { error: 'No project "missing".' }, status: 404 },
    ]);

    renderDeskApp();

    expect(await screen.findByText('No project "missing".')).toBeInTheDocument();
    // A 404 here is also what another user's project looks like from outside,
    // so the screen must offer a way out rather than stranding the user.
    expect(screen.getByRole("button", { name: "Back to your work" })).toBeInTheDocument();
  });

  it("surfaces an expired session as a session problem, not a project error", async () => {
    window.history.pushState({}, "", "/projects/proj-9");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [] } },
      { url: /\/api\/projects\/proj-9\/rubric$/, body: {}, status: 401 },
      { url: /\/api\/projects\/proj-9\/document$/, body: {}, status: 401 },
      { url: /\/api\/projects\/proj-9$/, body: { error: "Invalid or expired token" }, status: 401 },
    ]);

    renderDeskApp();

    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
  });
});

// Header's "Settings" used to be a labelled dead stub (title="Not yet
// built"), then opened AiSetupScreen in its "revisit" mode. AI configuration
// now lives entirely in AI Access (its own nav item, tested below); this nav
// item is "Account Settings" — profile/account fields only — and still
// returns to exactly where the user was, from the list or from inside a
// project.
describe("Desk — account settings", () => {
  it("opens from the project list and returns to it", async () => {
    mockFetchSequence([{ url: /\/api\/projects$/, body: { items: [] } }]);
    renderDeskApp();

    // Click standalone Settings button in sidebar
    const settingsBtn = await screen.findByRole("button", { name: /^Settings$/i });
    fireEvent.click(settingsBtn);
    expect(await screen.findByRole("heading", { name: "Account Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("heading", { name: "Journal Article" })).toBeInTheDocument();
  });

  it("opens from within a project and returns to it, not to the list", async () => {
    window.history.pushState({}, "", "/projects/proj-42");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/atlas\/output-types\/OT-06$/, body: { id: "OT-06", label: "Journal Article", family: "article", intakeSchema: { required: [], recommended: [], optional: [] } } },
      { url: /\/api\/projects\/proj-42$/, body: projectView("proj-42") },
      { url: /\/api\/projects\/proj-42\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/proj-42\/document$/, body: {}, status: 404 },
    ]);
    renderDeskApp();

    // Click Account Settings in Header
    fireEvent.click(await screen.findByRole("button", { name: /Account Settings|Settings/i }));
    expect(await screen.findByRole("heading", { name: "Account Settings" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByText("Journal Article")).toBeInTheDocument();
    // Not just the project — the exact tab it was opened from (Definition, here:
    // G0 isn't signed off in this fixture, so that's the auto-decided tab).
    expect(window.location.pathname).toBe("/projects/proj-42/definition");
  });
});

// AI configuration's single source of truth (Header/ProjectListScreen's "AI
// Access" nav item) — the same page the onboarding gate renders, in "manage"
// mode. There is no separate AI Settings entry point left anywhere.
describe("Desk — AI Access", () => {
  it("has no separate AI Settings nav item — AI Access is the only one", async () => {
    mockFetchSequence([{ url: /\/api\/projects$/, body: { items: [] } }]);
    renderDeskApp();
    await screen.findByRole("button", { name: /AI Access|AI Models|Manage AI/i });
    expect(screen.queryByRole("button", { name: /^AI Settings$/ })).not.toBeInTheDocument();
  });

  it("opens from the project list, in manage mode (no onboarding Skip/Continue), and returns to it", async () => {
    mockFetchSequence([{ url: /\/api\/projects$/, body: { items: [] } }]);
    renderDeskApp();

    fireEvent.click(await screen.findByRole("button", { name: /AI Access|AI Models|Manage AI/i }));
    expect(await screen.findByRole("heading", { name: "AI Access" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Skip for now" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Continue" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(await screen.findByRole("heading", { name: "Journal Article" })).toBeInTheDocument();
  });

  it("reflects the active section in the URL, so Back steps back through sections instead of leaving AI Access entirely", async () => {
    mockFetchSequence([{ url: /\/api\/projects$/, body: { items: [] } }]);
    renderDeskApp();

    fireEvent.click(await screen.findByRole("button", { name: /AI Access|AI Models|Manage AI/i }));
    await screen.findByRole("heading", { name: "AI Access" });
    expect(window.location.pathname).toBe("/ai-access");

    fireEvent.click(screen.getByRole("button", { name: "Providers" }));
    expect(await screen.findByRole("heading", { name: "Providers" })).toBeInTheDocument();
    expect(window.location.pathname).toBe("/ai-access/providers");

    window.history.back();
    await waitFor(() => expect(window.location.pathname).toBe("/ai-access"));
    expect(await screen.findByRole("heading", { name: "AI Access" })).toBeInTheDocument();
  });
});
