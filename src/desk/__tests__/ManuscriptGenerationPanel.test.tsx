// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import ManuscriptGenerationPanel from "../manuscript/ManuscriptGenerationPanel";

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

const PROJECT_ID = "proj-gen-1";

describe("Desk — ManuscriptGenerationPanel", () => {
  it("offers to plan and start when no job exists yet", async () => {
    mockFetch((url) => (url.includes("/manuscript/job") ? { status: 404, body: {} } : { status: 500, body: {} }));
    render(<ManuscriptGenerationPanel projectId={PROJECT_ID} />);
    await screen.findByRole("button", { name: "Plan and start" });
  });

  it("starts a job and shows the planned sections' progress", async () => {
    mockFetch((url, method) => {
      if (url.includes("/manuscript/job")) return { status: 404, body: {} };
      if (url.includes("/manuscript/start")) {
        return {
          status: 201,
          body: { state: "running", plan: [{ key: "introduction", title: "Introduction", guidance: "g", targetWords: 500 }], sections: [], totalWordTarget: 3000, updatedAt: "now" },
        };
      }
      return { status: 500, body: {} };
    });
    render(<ManuscriptGenerationPanel projectId={PROJECT_ID} />);
    fireEvent.click(await screen.findByRole("button", { name: "Plan and start" }));
    await screen.findByText(/0 of 1 sections/);
    expect(screen.getByRole("button", { name: /Generate "Introduction"/ })).toBeInTheDocument();
  });

  it("generates the next section via the Premium tier and shows it checkpointed", async () => {
    mockFetch((url, method) => {
      if (url.endsWith("/api/ai-access/route")) {
        return { status: 200, body: { ok: true, choice: { tier: "premium", providerId: "premium", reasoning: "Premium is available." }, fallbacks: [] } };
      }
      if (url.includes("/manuscript/next-section")) {
        return {
          status: 200,
          body: {
            generationJob: {
              state: "running",
              plan: [
                { key: "introduction", title: "Introduction", guidance: "g", targetWords: 500 },
                { key: "methods", title: "Methods", guidance: "g", targetWords: 700 },
              ],
              sections: [{ key: "introduction", title: "Introduction", text: "Generated intro text.", wordCount: 3, memory: "Sets up the gap.", citedEvidenceIds: [], generatedAt: "now" }],
              totalWordTarget: 3000,
              updatedAt: "now",
            },
          },
        };
      }
      if (url.includes("/manuscript/job")) {
        return {
          status: 200,
          body: {
            state: "running",
            plan: [
              { key: "introduction", title: "Introduction", guidance: "g", targetWords: 500 },
              { key: "methods", title: "Methods", guidance: "g", targetWords: 700 },
            ],
            sections: [],
            totalWordTarget: 3000,
            updatedAt: "now",
          },
        };
      }
      return { status: 500, body: {} };
    });
    render(<ManuscriptGenerationPanel projectId={PROJECT_ID} />);

    await screen.findByText(/0 of 2 sections/);
    fireEvent.click(screen.getByRole("button", { name: /Generate "Introduction"/ }));

    await screen.findByText(/1 of 2 sections/);
    expect(screen.getByText("Introduction")).toBeInTheDocument();
    expect(screen.getByText("Sets up the gap.")).toBeInTheDocument();
  });

  it("shows the AI Access Required state with a working Configure button when nothing is connected", async () => {
    const onOpenAiAccess = vi.fn();
    mockFetch((url) => {
      if (url.endsWith("/api/ai-access/route")) return { status: 200, body: { ok: false, reasoning: "No AI source is connected yet." } };
      if (url.includes("/manuscript/job")) {
        return { status: 200, body: { state: "running", plan: [{ key: "introduction", title: "Introduction", guidance: "g", targetWords: 500 }], sections: [], totalWordTarget: 3000, updatedAt: "now" } };
      }
      return { status: 500, body: {} };
    });
    render(<ManuscriptGenerationPanel projectId={PROJECT_ID} onOpenAiAccess={onOpenAiAccess} />);

    fireEvent.click(await screen.findByRole("button", { name: /Generate "Introduction"/ }));
    await screen.findByText("Scholar Core needs at least one connected AI model to continue this stage.");
    fireEvent.click(screen.getByRole("button", { name: "Configure AI Access" }));
    expect(onOpenAiAccess).toHaveBeenCalled();
  });

  it("shows Insert into document once the job completes, and calls onInsertIntoDocument", async () => {
    const onInsert = vi.fn();
    mockFetch((url) => {
      if (url.includes("/manuscript/job")) {
        return {
          status: 200,
          body: {
            state: "completed",
            plan: [{ key: "introduction", title: "Introduction", guidance: "g", targetWords: 500 }],
            sections: [{ key: "introduction", title: "Introduction", text: "Text.", wordCount: 1, memory: "m", citedEvidenceIds: [], generatedAt: "now" }],
            totalWordTarget: 3000,
            updatedAt: "now",
          },
        };
      }
      return { status: 500, body: {} };
    });
    render(<ManuscriptGenerationPanel projectId={PROJECT_ID} onInsertIntoDocument={onInsert} />);

    fireEvent.click(await screen.findByRole("button", { name: "Insert every section into the document" }));
    expect(onInsert).toHaveBeenCalledWith([{ key: "introduction", title: "Introduction", text: "Text.", wordCount: 1, memory: "m", citedEvidenceIds: [], generatedAt: "now" }]);
  });

  it("runs a coherence check via the Premium tier and displays the resulting issues", async () => {
    const completedJob = {
      state: "completed",
      plan: [
        { key: "introduction", title: "Introduction", guidance: "g", targetWords: 500 },
        { key: "methods", title: "Methods", guidance: "g", targetWords: 700 },
      ],
      sections: [
        { key: "introduction", title: "Introduction", text: "Text.", wordCount: 1, memory: "m", citedEvidenceIds: [], generatedAt: "now" },
        { key: "methods", title: "Methods", text: "Text.", wordCount: 1, memory: "m", citedEvidenceIds: [], generatedAt: "now" },
      ],
      totalWordTarget: 3000,
      updatedAt: "now",
    };
    mockFetch((url) => {
      if (url.endsWith("/api/ai-access/route")) {
        return { status: 200, body: { ok: true, choice: { tier: "premium", providerId: "premium", reasoning: "Premium is available." }, fallbacks: [] } };
      }
      if (url.includes("/manuscript/coherence-check")) {
        return {
          status: 200,
          body: {
            generationJob: {
              ...completedJob,
              coherenceReport: {
                issues: [{ dimension: "terminology", description: "Inconsistent headcount terms.", sectionKeys: ["introduction", "methods"], severity: "moderate" }],
                passesRun: ["terminology", "argument_continuity", "methodology"],
                passErrors: {},
                checkedAt: "2026-01-01T00:00:00.000Z",
              },
            },
          },
        };
      }
      if (url.includes("/manuscript/job")) return { status: 200, body: completedJob };
      return { status: 500, body: {} };
    });
    render(<ManuscriptGenerationPanel projectId={PROJECT_ID} />);

    fireEvent.click(await screen.findByRole("button", { name: "Run coherence check" }));

    expect(await screen.findByText("Inconsistent headcount terms.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Re-run coherence check" })).toBeInTheDocument();
  });
});
