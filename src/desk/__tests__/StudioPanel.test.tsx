// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import StudioPanel from "../regions/StudioPanel";
import { storeProviderKey } from "../../services/userAiSettings";

const originalFetch = global.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const { status, body } = handler(url, init);
    return Promise.resolve({ ok: status < 400, status, json: async () => body } as Response);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
});

afterEach(() => {
  global.fetch = originalFetch;
  cleanup();
});

/** Auto mode is the default since Task 55 wired Studio to the Scholar AI
 * Engine — these tests exercise the pre-existing Advanced/manual override,
 * so they switch to it first. Auto mode's own behavior is covered by the
 * dedicated tests further down. */
function switchToAdvanced() {
  fireEvent.click(screen.getByText(/Choose manually \(Advanced\)/));
}

describe("Desk — StudioPanel", () => {
  it("Level 1 (proofread) shows no provider/key fields and runs deterministic refinement", async () => {
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
              { id: "c1", category: "mechanics", originalStart: 4, originalEnd: 9, originalText: "datas", replacementText: "data", reason: "Plural agreement" },
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
    expect(screen.getByText(/Plural agreement/)).toBeInTheDocument();
  });

  it("Level 2 (clarity) and above show provider/key fields in Advanced mode, gated until key is entered", async () => {
    render(<StudioPanel sessionId="s1" />);

    const levelSelect = screen.getAllByRole("combobox")[0];
    fireEvent.change(levelSelect, { target: { value: "clarity" } });
    switchToAdvanced();

    expect(await screen.findByPlaceholderText("API key")).toBeInTheDocument();

    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "This is a test." } });
    expect(screen.getByText("Refine").closest("button")).toBeDisabled();

    fireEvent.change(screen.getByPlaceholderText("API key"), { target: { value: "sk-test" } });
    expect(screen.getByText("Refine").closest("button")).not.toBeDisabled();
  });

  it("Level 2+ requires provider and apiKey before refining", async () => {
    mockFetch((url) => {
      if (url === "/api/studio/refine") {
        return {
          status: 200,
          body: {
            diff: { passageId: "desk-studio-passage", level: "clarity", originalText: "x", changes: [], voiceApplied: false },
            contentChangeCount: 0,
            languageChangeCount: 0,
          },
        };
      }
      throw new Error(`Unmocked: ${url}`);
    });

    render(<StudioPanel sessionId="s1" />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
    switchToAdvanced();
    fireEvent.change(screen.getByPlaceholderText("API key"), { target: { value: "sk-test" } });
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to clarify." } });
    fireEvent.click(screen.getByText("Refine"));

    await screen.findByText("No changes suggested.");
  });

  it("shows the provider/key fields for a model-backed level in Advanced mode, and disables Refine until a key is entered", async () => {
    render(<StudioPanel sessionId="s1" />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
    switchToAdvanced();

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
    switchToAdvanced();
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

  it("builds a voice profile from samples and uses it in refinement", async () => {
    mockFetch((url) => {
      if (url === "/api/studio/voice-profile") {
        return {
          status: 200,
          body: {
            sampleWordCount: 2000,
            meanSentenceLength: 18,
            sentenceLengthStdDev: 4.2,
            passiveVoiceRatio: 0.25,
            semicolonRate: 2.1,
            firstPersonRate: 45,
            averageWordLength: 4.8,
          },
        };
      }
      if (url === "/api/studio/refine") {
        return {
          status: 200,
          body: {
            diff: { passageId: "desk-studio-passage", level: "proofread", originalText: "x", changes: [], voiceApplied: false },
            voiceDrift: { drifted: false, notes: [] },
            contentChangeCount: 0,
            languageChangeCount: 0,
          },
        };
      }
      throw new Error(`Unmocked: ${url}`);
    });

    render(<StudioPanel sessionId="s1" />);
    fireEvent.click(screen.getByText(/Voice/));

    const sampleArea = screen.getByPlaceholderText(/samples/);
    fireEvent.change(sampleArea, { target: { value: "Sample 1.\n\nSample 2." } });
    fireEvent.click(screen.getByText("Build Profile"));

    expect(await screen.findByText(/Voice profile active/)).toBeInTheDocument();
  });

  it("selects L1 profile and passes it to refinement", async () => {
    mockFetch((url) => {
      if (url === "/api/studio/refine") {
        return {
          status: 200,
          body: {
            diff: { passageId: "desk-studio-passage", level: "proofread", originalText: "x", changes: [], voiceApplied: false },
            contentChangeCount: 0,
            languageChangeCount: 0,
          },
        };
      }
      throw new Error(`Unmocked: ${url}`);
    });

    render(<StudioPanel sessionId="s1" />);
    const l1Select = screen.getAllByRole("combobox")[1]; // Second combobox after level
    fireEvent.change(l1Select, { target: { value: "turkish" } });

    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Test text." } });
    fireEvent.click(screen.getByText("Refine"));

    expect(await screen.findByText("No changes suggested.")).toBeInTheDocument();
  });

  it("displays voice drift warnings when refinement drifts from profile", async () => {
    mockFetch((url) => {
      if (url === "/api/studio/refine") {
        return {
          status: 200,
          body: {
            diff: { passageId: "desk-studio-passage", level: "proofread", originalText: "x", changes: [], voiceApplied: false },
            voiceDrift: { drifted: true, notes: ["longer sentences", "more passive voice"] },
            contentChangeCount: 0,
            languageChangeCount: 0,
          },
        };
      }
      throw new Error(`Unmocked: ${url}`);
    });

    render(<StudioPanel sessionId="s1" />);
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Test text." } });
    fireEvent.click(screen.getByText("Refine"));

    expect(await screen.findByText(/Voice drift detected/)).toBeInTheDocument();
    expect(screen.getByText(/longer sentences.*passive voice/)).toBeInTheDocument();
  });

  it("surfaces content changes first, before language changes (docs 32 §7)", async () => {
    mockFetch((url) => {
      expect(url).toBe("/api/studio/refine");
      return {
        status: 200,
        body: {
          diff: {
            passageId: "desk-studio-passage",
            level: "clarity",
            originalText: "The results suggest change.",
            changes: [
              { id: "c2", category: "language", originalStart: 12, originalEnd: 19, originalText: "suggest", replacementText: "indicate", reason: "Clarity" },
              { id: "c1", category: "content", originalStart: 12, originalEnd: 19, originalText: "suggest", replacementText: "demonstrate", reason: "Strengthens claim", meaningNote: "Changes claim strength" },
            ],
            voiceApplied: true,
          },
          contentChangeCount: 1,
          languageChangeCount: 1,
        },
      };
    });

    render(<StudioPanel sessionId="s1" />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
    switchToAdvanced();
    fireEvent.change(screen.getByPlaceholderText("API key"), { target: { value: "sk-test" } });
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "The results suggest change." } });
    fireEvent.click(screen.getByText("Refine"));

    const changes = await screen.findAllByRole("listitem");
    expect(changes[0]).toHaveTextContent("demonstrate");
    expect(changes[0]).toHaveTextContent("Content");
    expect(changes[1]).toHaveTextContent("indicate");
    expect(changes[1]).toHaveTextContent("Language");
  });

  // Auto mode (Priority 1/6): Studio calls the Scholar AI Engine's
  // /api/ai-access/route for a live pick instead of a manual dropdown, and
  // shows why that source was chosen — never asking for a key it can
  // already supply itself (Premium), and never silently sending a request
  // it can't actually execute (Local — Studio has no local-runtime path).
  describe("Auto mode (Scholar AI Engine)", () => {
    it("previews the Omni Router's pick for a model-backed level and explains it on request", async () => {
      mockFetch((url) => {
        if (url === "/api/ai-access/route") {
          return {
            status: 200,
            body: { ok: true, choice: { tier: "free", providerId: "gemini", modelId: "gemini-2.0-flash", reasoning: "Using gemini's free tier — no cost to you." }, fallbacks: [] },
          };
        }
        throw new Error(`Unmocked: ${url}`);
      });

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });

      expect(await screen.findByText("Will use: gemini · free")).toBeInTheDocument();
      expect(screen.queryByPlaceholderText("API key")).not.toBeInTheDocument();

      fireEvent.click(screen.getByText("Why this AI?"));
      expect(await screen.findByText(/Using gemini's free tier/)).toBeInTheDocument();
    });

    it("executes with the router's chosen Free/BYOK provider using this device's own stored key, and reports what ran", async () => {
      await storeProviderKey("openrouter", "sk-auto-test");
      let capturedBody: Record<string, unknown> | null = null;
      mockFetch((url, init) => {
        if (url === "/api/ai-access/route") {
          return {
            status: 200,
            body: { ok: true, choice: { tier: "free", providerId: "openrouter", modelId: "some-model", reasoning: "Using openrouter's free tier — no cost to you." }, fallbacks: [] },
          };
        }
        if (url === "/api/studio/refine") {
          capturedBody = JSON.parse((init?.body as string) ?? "{}");
          return {
            status: 200,
            body: {
              diff: { passageId: "desk-studio-passage", level: "clarity", originalText: "x", changes: [], voiceApplied: false },
              contentChangeCount: 0,
              languageChangeCount: 0,
              usage: { provider: "openrouter", model: "some-model", inputTokensEstimate: 10, outputTokensEstimate: 5 },
            },
          };
        }
        throw new Error(`Unmocked: ${url}`);
      });

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
      await screen.findByText("Will use: openrouter · free");

      fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to refine." } });
      fireEvent.click(screen.getByText("Refine"));

      expect(await screen.findByText(/AI used: openrouter \(some-model\) · free/)).toBeInTheDocument();
      await waitFor(() => expect(capturedBody).not.toBeNull());
      expect(capturedBody).toMatchObject({ provider: "openrouter", apiKey: "sk-auto-test", model: "some-model" });
    });

    it("routes to Premium without ever asking for or sending a key", async () => {
      let capturedBody: Record<string, unknown> | null = null;
      mockFetch((url, init) => {
        if (url === "/api/ai-access/route") {
          return {
            status: 200,
            body: { ok: true, choice: { tier: "premium", providerId: "openai", modelId: "gpt-4o-mini", reasoning: "Using Scholar Premium (openai) — this uses your Premium credits." }, fallbacks: [] },
          };
        }
        if (url === "/api/studio/refine") {
          capturedBody = JSON.parse((init?.body as string) ?? "{}");
          return {
            status: 200,
            body: {
              diff: { passageId: "desk-studio-passage", level: "clarity", originalText: "x", changes: [], voiceApplied: false },
              contentChangeCount: 0,
              languageChangeCount: 0,
              aiSource: { tier: "premium", provider: "openai", model: "gpt-4o-mini", creditsUsed: 2 },
            },
          };
        }
        throw new Error(`Unmocked: ${url}`);
      });

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
      await screen.findByText("Will use: openai · premium");
      expect(screen.queryByPlaceholderText("API key")).not.toBeInTheDocument();

      fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to refine." } });
      fireEvent.click(screen.getByText("Refine"));

      expect(await screen.findByText(/AI used: openai \(gpt-4o-mini\) · premium · 2 credits/)).toBeInTheDocument();
      await waitFor(() => expect(capturedBody).not.toBeNull());
      expect(capturedBody).toMatchObject({ useEngine: "premium" });
      expect(capturedBody).not.toHaveProperty("apiKey");
    });

    it("gives a clear message rather than a broken request when only a local runner is connected", async () => {
      mockFetch((url) => {
        if (url === "/api/ai-access/route") {
          return {
            status: 200,
            body: { ok: true, choice: { tier: "local", providerId: "ollama", reasoning: "Using your local ollama — runs on your own computer, nothing leaves your device." }, fallbacks: [] },
          };
        }
        throw new Error(`Unmocked: ${url}`);
      });

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
      await screen.findByText("Will use: ollama · local");

      fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to refine." } });
      fireEvent.click(screen.getByText("Refine"));

      expect(await screen.findByText(/Studio doesn't support local execution yet/)).toBeInTheDocument();
    });

    it("surfaces the router's own reasoning when no AI source is available at all", async () => {
      mockFetch((url) => {
        if (url === "/api/ai-access/route") {
          return { status: 200, body: { ok: false, reasoning: "No AI source is available. Connect a provider in AI Access to continue." } };
        }
        throw new Error(`Unmocked: ${url}`);
      });

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });

      expect(await screen.findByText("No AI source is available. Connect a provider in AI Access to continue.")).toBeInTheDocument();
    });
  });
});
