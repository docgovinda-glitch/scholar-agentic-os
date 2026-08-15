// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import JournalRequirementsPanel from "../journal/JournalRequirementsPanel";

const originalFetch = global.fetch;

function mockFetch(handler: (url: string, method: string, body: unknown) => { status: number; body: unknown }) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const method = (init?.method ?? "GET").toUpperCase();
    const body = init?.body ? JSON.parse(init.body as string) : undefined;
    const { status, body: respBody } = handler(url, method, body);
    return Promise.resolve({ ok: status < 400, status, json: async () => respBody } as Response);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
});

const PROJECT_ID = "proj-jr-1";

describe("Desk — JournalRequirementsPanel", () => {
  it("loads with an empty form and a disabled Save when nothing has been captured yet", async () => {
    mockFetch((url) => {
      if (url.includes("/journal-requirements") && !url.includes("extract")) return { status: 404, body: { error: "none yet" } };
      return { status: 500, body: {} };
    });
    render(<JournalRequirementsPanel projectId={PROJECT_ID} />);

    await screen.findByLabelText("Journal name *");
    expect(screen.getByRole("button", { name: "Save requirements" })).toBeDisabled();
  });

  it("prefills the form from an existing capture", async () => {
    mockFetch((url) => {
      if (url.endsWith(`/api/projects/${PROJECT_ID}/journal-requirements`)) {
        return {
          status: 200,
          body: {
            journalName: "Existing Journal",
            source: "manual",
            requiredDeclarations: ["Conflict of interest"],
            capturedAt: new Date().toISOString(),
            capturedBy: "u1",
          },
        };
      }
      return { status: 500, body: {} };
    });
    render(<JournalRequirementsPanel projectId={PROJECT_ID} />);

    const input = (await screen.findByLabelText("Journal name *")) as HTMLInputElement;
    expect(input.value).toBe("Existing Journal");
    expect(screen.getByText(/entered manually/)).toBeInTheDocument();
  });

  it("saves manually entered requirements and calls onSaved with the returned gates", async () => {
    const onSaved = vi.fn();
    mockFetch((url, method) => {
      if (method === "GET") return { status: 404, body: {} };
      if (method === "PUT") {
        return {
          status: 200,
          body: {
            journalRequirements: { journalName: "New Journal", source: "manual", requiredDeclarations: [], capturedAt: "now", capturedBy: "u1" },
            gates: [{ gate: "G1", name: "Requirements", status: "ready", outstandingBlocking: [] }],
          },
        };
      }
      return { status: 500, body: {} };
    });
    render(<JournalRequirementsPanel projectId={PROJECT_ID} onSaved={onSaved} />);

    await screen.findByLabelText("Journal name *");
    fireEvent.change(screen.getByLabelText("Journal name *"), { target: { value: "New Journal" } });
    fireEvent.click(screen.getByRole("button", { name: "Save requirements" }));

    await waitFor(() => expect(onSaved).toHaveBeenCalledWith([{ gate: "G1", name: "Requirements", status: "ready", outstandingBlocking: [] }]));
  });

  it("applies an AI proposal to the form via the Premium tier without ever auto-saving it", async () => {
    mockFetch((url, method) => {
      if (url.endsWith("/api/ai-access/route")) {
        return { status: 200, body: { ok: true, choice: { tier: "premium", providerId: "premium", reasoning: "Premium is available." }, fallbacks: [] } };
      }
      if (url.includes("/journal-requirements/extract")) {
        return {
          status: 200,
          body: {
            proposal: {
              journalName: "AI-Found Journal",
              requiredDeclarations: ["Funding statement"],
              unresolvedFields: ["citationStyle"],
            },
          },
        };
      }
      if (method === "GET") return { status: 404, body: {} };
      return { status: 500, body: {} };
    });
    render(<JournalRequirementsPanel projectId={PROJECT_ID} />);

    await screen.findByLabelText("Journal name *");
    fireEvent.change(screen.getByPlaceholderText("Paste the journal's author guidelines here…"), {
      target: { value: "Some guidelines text about this journal's requirements, long enough to submit." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract with AI" }));

    const input = (await screen.findByLabelText("Journal name *")) as HTMLInputElement;
    await waitFor(() => expect(input.value).toBe("AI-Found Journal"));
    expect(screen.getByText(/didn't state: citationStyle/)).toBeInTheDocument();
    expect(screen.getByText(/Nothing has been saved yet/)).toBeInTheDocument();
  });

  it("shows the AI Access Required state with a working Configure button when no AI source is connected", async () => {
    const onOpenAiAccess = vi.fn();
    mockFetch((url, method) => {
      if (url.endsWith("/api/ai-access/route")) {
        return { status: 200, body: { ok: false, reasoning: "No AI source is connected yet." } };
      }
      if (method === "GET") return { status: 404, body: {} };
      return { status: 500, body: {} };
    });
    render(<JournalRequirementsPanel projectId={PROJECT_ID} onOpenAiAccess={onOpenAiAccess} />);

    await screen.findByLabelText("Journal name *");
    fireEvent.change(screen.getByPlaceholderText("Paste the journal's author guidelines here…"), {
      target: { value: "Some guidelines text about this journal's requirements, long enough to submit." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Extract with AI" }));

    await screen.findByText("Scholar Core needs at least one connected AI model to continue this stage.");
    fireEvent.click(screen.getByRole("button", { name: "Configure AI Access" }));
    expect(onOpenAiAccess).toHaveBeenCalled();
  });
});
