// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import DeskApp from "../DeskApp";

const originalFetch = global.fetch;

function mockFetchSequence(responses: Array<{ url: RegExp; body: unknown; status?: number }>) {
  global.fetch = vi.fn((input: RequestInfo | URL) => {
    const url = typeof input === "string" ? input : input.toString();
    const match = responses.find((r) => r.url.test(url));
    if (!match) throw new Error(`Unmocked fetch: ${url}`);
    return Promise.resolve({
      ok: (match.status ?? 200) < 400,
      status: match.status ?? 200,
      json: async () => match.body,
    } as Response);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
  window.history.pushState({}, "", "/desk");
});

describe("Desk — end to end with a real (mocked) backend contract", () => {
  it("shows the create-project screen when no ?project= is in the URL, and creates one from a real output type", async () => {
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [{ id: "OT-06", label: "Journal Article", aliases: [], family: "article", academicLevels: [], typicalDisciplines: [] }] } },
      {
        url: /\/api\/projects$/,
        body: { projectId: "proj-1", outputTypeId: "OT-06", answers: {}, intakeCompleteness: 0, hasDocument: false, gates: [{ gate: "G0", name: "Intake", status: "not_started", outstandingBlocking: [] }] },
      },
      { url: /\/api\/projects\/proj-1$/, body: { projectId: "proj-1", outputTypeId: "OT-06", answers: {}, intakeCompleteness: 0, hasDocument: false, gates: [{ gate: "G0", name: "Intake", status: "not_started", outstandingBlocking: [] }] } },
      { url: /\/api\/projects\/proj-1\/rubric$/, body: { error: "no document" }, status: 404 },
    ]);

    render(<DeskApp />);

    expect(await screen.findByText("Journal Article")).toBeInTheDocument();
    fireEvent.click(screen.getByText("Journal Article"));

    // Lands in the Desk shell for the newly created project — the Primary
    // region's empty-state heading is the unambiguous signal (Rail's
    // Outline placeholder uses similar wording).
    expect(await screen.findByRole("heading", { name: "No document submitted yet" })).toBeInTheDocument();
    expect(window.location.search).toContain("project=proj-1");
  });

  it("reads ?project= from the URL and renders the shell for that project directly", async () => {
    window.history.pushState({}, "", "/desk?project=proj-42");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [{ id: "OT-06", label: "Journal Article", aliases: [], family: "article", academicLevels: [], typicalDisciplines: [] }] } },
      {
        url: /\/api\/projects\/proj-42$/,
        body: { projectId: "proj-42", outputTypeId: "OT-06", answers: {}, intakeCompleteness: 0.5, hasDocument: false, gates: [{ gate: "G0", name: "Intake", status: "in_progress", outstandingBlocking: ["Title required"] }] },
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
      { url: /\/api\/atlas\/output-types$/, body: { items: [{ id: "OT-06", label: "Journal Article", aliases: [], family: "article", academicLevels: [], typicalDisciplines: [] }] } },
      {
        url: /\/api\/projects\/proj-7$/,
        body: { projectId: "proj-7", outputTypeId: "OT-06", answers: {}, intakeCompleteness: 0, hasDocument: false, gates: [{ gate: "G6", name: "Rubric", status: "not_started", outstandingBlocking: [] }] },
      },
      { url: /\/api\/projects\/proj-7\/rubric$/, body: {}, status: 404 },
      {
        url: /\/api\/projects\/proj-7\/document$/,
        body: {
          projectId: "proj-7",
          outputTypeId: "OT-06",
          answers: {},
          intakeCompleteness: 0,
          hasDocument: true,
          gates: [{ gate: "G6", name: "Rubric", status: "in_progress", outstandingBlocking: ["Word count too low"] }],
          rubric: {
            findings: [
              { ruleId: "word_count", status: "fail", severity: "blocking", message: "Below the minimum word count.", remedy: "Add more content." },
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

    const textarea = await screen.findByPlaceholderText(/Paste or type a draft/);
    fireEvent.change(textarea, { target: { value: "First paragraph.\n\nSecond paragraph." } });
    fireEvent.click(screen.getByText("Submit document"));

    expect(await screen.findByText("Below the minimum word count.")).toBeInTheDocument();
    expect(screen.getByText("First paragraph.")).toBeInTheDocument();
    expect(screen.getByText("→ Add more content.")).toBeInTheDocument();
  });

  it("shows an honest error, not a crash, when the project fetch fails", async () => {
    window.history.pushState({}, "", "/desk?project=missing");
    mockFetchSequence([
      { url: /\/api\/atlas\/output-types$/, body: { items: [] } },
      { url: /\/api\/projects\/missing\/rubric$/, body: {}, status: 404 },
      { url: /\/api\/projects\/missing$/, body: { error: 'No project "missing".' }, status: 404 },
    ]);

    render(<DeskApp />);

    expect(await screen.findByText('No project "missing".')).toBeInTheDocument();
  });
});
