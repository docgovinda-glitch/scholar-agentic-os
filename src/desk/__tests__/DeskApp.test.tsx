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

import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DeskApp from "../DeskApp";

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
      select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
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
};

const projectView = (projectId: string, over: Record<string, unknown> = {}) => ({
  projectId,
  outputTypeId: "OT-06",
  answers: {},
  intakeCompleteness: 0,
  hasDocument: false,
  gates: [{ gate: "G0", name: "Intake", status: "not_started", outstandingBlocking: [] }],
  ...over,
});

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
  window.history.pushState({}, "", "/desk");
});

describe("Desk — project list", () => {
  it("shows the empty state when the user has no projects yet", async () => {
    mockFetchSequence([{ url: /\/api\/projects$/, body: { items: [] } }]);

    render(<DeskApp />);

    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("lists the user's own projects and opens one", async () => {
    mockFetchSequence([
      { url: /\/api\/projects$/, body: { items: [projectView("proj-abc", { intakeCompleteness: 0.5 })] } },
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/projects\/proj-abc$/, body: projectView("proj-abc") },
      { url: /\/api\/projects\/proj-abc\/rubric$/, body: {}, status: 404 },
    ]);

    render(<DeskApp />);

    expect(await screen.findByText(/50% of intake answered/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("OT-06"));

    // The shell opens on Intake while G0 is outstanding — that is the first
    // real task, and it gates every later gate.
    fireEvent.click(await screen.findByRole("button", { name: "Document" }));
    expect(await screen.findByRole("heading", { name: "No document submitted yet" })).toBeInTheDocument();
    expect(window.location.search).toContain("project=proj-abc");
  });

  it("creates a project from a real output type and opens it", async () => {
    mockFetchSequence([
      { url: /\/api\/projects$/, body: { items: [] } },
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/projects$/, method: "POST", body: projectView("proj-new") },
      { url: /\/api\/projects\/proj-new$/, body: projectView("proj-new") },
      { url: /\/api\/projects\/proj-new\/rubric$/, body: {}, status: 404 },
    ]);

    render(<DeskApp />);

    fireEvent.click(await screen.findByText("Start your first project"));
    fireEvent.click(await screen.findByText("Journal Article"));

    fireEvent.click(await screen.findByRole("button", { name: "Document" }));
    expect(await screen.findByRole("heading", { name: "No document submitted yet" })).toBeInTheDocument();
    expect(window.location.search).toContain("project=proj-new");
  });
});

describe("Desk — project shell", () => {
  it("opens on Intake while G0 is outstanding — the first task gates the rest", async () => {
    window.history.pushState({}, "", "/desk?project=proj-42");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types\/OT-06$/, body: { id: "OT-06", label: "Journal Article", family: "article", intakeSchema: { required: [], recommended: [], optional: [] } } },
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/projects\/proj-42$/, body: projectView("proj-42") },
      { url: /\/api\/projects\/proj-42\/rubric$/, body: {}, status: 404 },
    ]);

    render(<DeskApp />);

    expect(await screen.findByText(/About your journal article/i)).toBeInTheDocument();
  });

  it("reads ?project= from the URL and renders that project directly", async () => {
    window.history.pushState({}, "", "/desk?project=proj-42");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      {
        url: /\/api\/projects\/proj-42$/,
        body: projectView("proj-42", {
          intakeCompleteness: 0.5,
          gates: [{ gate: "G0", name: "Intake", status: "in_progress", outstandingBlocking: ["Title required"] }],
        }),
      },
      { url: /\/api\/projects\/proj-42\/rubric$/, body: {}, status: 404 },
    ]);

    render(<DeskApp />);

    expect(await screen.findByText("Journal Article")).toBeInTheDocument();
    expect(screen.getByText(/G0 Intake/)).toBeInTheDocument();
    expect(screen.getByText(/1 blocking/)).toBeInTheDocument();
  });

  it("submits pasted plain text as a document and shows real Compliance findings back", async () => {
    window.history.pushState({}, "", "/desk?project=proj-7");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      {
        url: /\/api\/projects\/proj-7$/,
        body: projectView("proj-7", {
          gates: [{ gate: "G6", name: "Rubric", status: "not_started", outstandingBlocking: [] }],
        }),
      },
      { url: /\/api\/projects\/proj-7\/rubric$/, body: {}, status: 404 },
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

    render(<DeskApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Document" }));
    const textarea = await screen.findByPlaceholderText(/Paste or type a draft/);
    fireEvent.change(textarea, { target: { value: "First paragraph.\n\nSecond paragraph." } });
    fireEvent.click(screen.getByText("Submit document"));

    expect(await screen.findByText("Below the minimum word count.")).toBeInTheDocument();
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("→ Add more content.")).toBeInTheDocument();
  });

  it("shows an honest error with a route back, not a dead end, when the project fetch fails", async () => {
    window.history.pushState({}, "", "/desk?project=missing");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [] } },
      { url: /\/api\/projects\/missing\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/missing$/, body: { error: 'No project "missing".' }, status: 404 },
    ]);

    render(<DeskApp />);

    expect(await screen.findByText('No project "missing".')).toBeInTheDocument();
    // A 404 here is also what another user's project looks like from outside,
    // so the screen must offer a way out rather than stranding the user.
    expect(screen.getByRole("button", { name: "Back to your work" })).toBeInTheDocument();
  });

  it("surfaces an expired session as a session problem, not a project error", async () => {
    window.history.pushState({}, "", "/desk?project=proj-9");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [] } },
      { url: /\/api\/projects\/proj-9\/rubric$/, body: {}, status: 401 },
      { url: /\/api\/projects\/proj-9$/, body: { error: "Invalid or expired token" }, status: 401 },
    ]);

    render(<DeskApp />);

    expect(await screen.findByText(/session has expired/i)).toBeInTheDocument();
  });
});

// Header's "Settings" used to be a labelled dead stub (title="Not yet
// built"). It now opens AiSetupScreen in its "revisit" mode and returns to
// exactly where the user was — from the list, or from inside a project.
describe("Desk — settings", () => {
  it("opens from the project list and returns to it", async () => {
    mockFetchSequence([{ url: /\/api\/projects$/, body: { items: [] } }]);
    render(<DeskApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "AI provider" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(await screen.findByText("Nothing here yet")).toBeInTheDocument();
  });

  it("opens from within a project and returns to it, not to the list", async () => {
    window.history.pushState({}, "", "/desk?project=proj-42");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [OT] } },
      { url: /\/api\/projects\/proj-42$/, body: projectView("proj-42") },
      { url: /\/api\/projects\/proj-42\/rubric$/, body: {}, status: 404 },
    ]);
    render(<DeskApp />);

    fireEvent.click(await screen.findByRole("button", { name: "Settings" }));
    expect(await screen.findByRole("heading", { name: "AI provider" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "← Back" }));
    expect(await screen.findByText("Journal Article")).toBeInTheDocument();
    expect(window.location.search).toContain("project=proj-42");
  });
});
