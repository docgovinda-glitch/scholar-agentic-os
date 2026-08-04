// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import StudioPanel from "../regions/StudioPanel";

const originalFetch = global.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status, body } = handler(url, init);
    return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
  }) as unknown as typeof fetch;
}

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
});

describe("Desk — StudioPanel", () => {
  it("runs Level 1 (proofread) with no provider/key fields shown, and renders the returned diff", async () => {
    mockFetch((url) => {
      expect(url).toBe("/api/studio/refine");
      return {
        status: 200,
        body: {
          diff: {
            passageId: "desk-studio-passage",
            level: "proofread",
            originalText: "The datas was  wrong.",
            changes: [
              { id: "c1", category: "mechanics", originalStart: 4, originalEnd: 9, originalText: "datas", replacementText: "data", reason: "Subject-verb agreement / plural form." },
            ],
            voiceApplied: false,
          },
          contentChangeCount: 0,
          languageChangeCount: 1,
        },
      };
    });

    render(<StudioPanel sessionId="s1" />);

    expect(screen.queryByPlaceholderText("API key")).not.toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "The datas was  wrong." } });
    fireEvent.click(screen.getByText("Refine"));

    expect(await screen.findByText("data")).toBeInTheDocument();
    expect(screen.getByText(/Subject-verb agreement/)).toBeInTheDocument();
    expect(screen.getByText(/1 changes/)).toBeInTheDocument();
  });

  it("shows the provider/key fields for a model-backed level, and disables Refine until a key is entered", async () => {
    render(<StudioPanel sessionId="s1" />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });

    expect(await screen.findByPlaceholderText("API key")).toBeInTheDocument();
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to refine." } });
    expect(screen.getByText("Refine").closest("button")).toBeDisabled();
  });

  it("shows a consent prompt on 428, and retries after accepting", async () => {
    let refineCalls = 0;
    mockFetch((url) => {
      if (url === "/api/studio/refine") {
        refineCalls++;
        if (refineCalls === 1) {
          return { status: 428, body: { error: "consent_required", reason: "First use of gemini for user_content.", provider: "gemini" } };
        }
        return {
          status: 200,
          body: {
            diff: { passageId: "desk-studio-passage", level: "clarity", originalText: "x", changes: [], voiceApplied: false },
            contentChangeCount: 0,
            languageChangeCount: 0,
          },
        };
      }
      if (url === "/api/studio/consent") return { status: 200, body: { ok: true } };
      throw new Error(`Unmocked: ${url}`);
    });

    render(<StudioPanel sessionId="s1" />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
    fireEvent.change(screen.getByPlaceholderText("API key"), { target: { value: "sk-test" } });
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text." } });
    fireEvent.click(screen.getByText("Refine"));

    expect(await screen.findByText(/First use of gemini/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Allow gemini and retry/));

    expect(await screen.findByText("No changes suggested.")).toBeInTheDocument();
    expect(refineCalls).toBe(2);
  });

  it("shows a denial message on 403, with no retry affordance", async () => {
    mockFetch(() => ({ status: 403, body: { error: "denied", reason: "restricted content never egresses." } }));

    render(<StudioPanel sessionId="s1" />);
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Restricted text." } });
    fireEvent.click(screen.getByText("Refine"));

    expect(await screen.findByText(/Denied by privacy policy/)).toBeInTheDocument();
    expect(screen.queryByText(/Allow/)).not.toBeInTheDocument();
  });
});
