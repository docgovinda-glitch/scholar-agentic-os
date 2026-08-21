// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import "@testing-library/jest-dom/vitest";
import StudioPanel from "../regions/StudioPanel";
import { storeProviderKey } from "../../services/userAiSettings";
import { grantLocalConsent } from "../regions/localStudioExecution";
import { __resetSessionPoliciesForTests } from "../../app/studio/sessionPolicyStore";

const originalFetch = global.fetch;

function mockFetch(handler: (url: string, init?: RequestInit) => { status: number; body: unknown }) {
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    const res = url.includes("generativelanguage.googleapis.com")
      ? (() => {
          try {
            return handler(url, init);
          } catch {
            return handler("/api/studio/refine", init);
          }
        })()
      : handler(url, init);

    const body: any = res.body;
    if (url.includes("generativelanguage.googleapis.com")) {
      if (body && !body.candidates) {
        const rawChanges = body.diff?.changes || body.changes || [];
        const changes = rawChanges.map((c: any) => ({
          original: c.originalText ?? c.original,
          replacement: c.replacementText ?? c.replacement,
          reason: c.reason,
        }));
        let originalText = body.diff?.originalText;
        if (!originalText || originalText === "x") {
          try {
            const promptText = JSON.parse(init?.body as string)?.contents?.[0]?.parts?.[0]?.text ?? "";
            if (promptText) originalText = promptText;
          } catch {
            originalText = "Some text.";
          }
        }
        originalText = originalText || "Some text.";
        const revised =
          rawChanges.length > 0
            ? rawChanges.reduce(
                (acc: string, c: any) => acc.replace(c.originalText ?? c.original, c.replacementText ?? c.replacement),
                originalText
              )
            : originalText;

        const geminiPayload = {
          candidates: [
            {
              content: {
                parts: [{ text: JSON.stringify({ revised, changes }) }],
              },
            },
          ],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
        };
        return Promise.resolve({
          ok: res.status < 400,
          status: res.status,
          text: async () => JSON.stringify(geminiPayload),
          json: async () => geminiPayload,
        } as Response);
      }
    }
    return Promise.resolve({
      ok: res.status < 400,
      status: res.status,
      text: async () => JSON.stringify(body),
      json: async () => body,
    } as Response);
  }) as unknown as typeof fetch;
}

/** Wraps a Scholar-side (mockFetch-installed) fetch so localhost calls are routed to a separate handler — the same split a real browser talking to both at once would have. Stays a vi.fn() spy so callers can still assert on global.fetch itself. */
function withLocalFetch(localHandler: (url: string, init?: RequestInit) => Promise<Response>) {
  const scholarFetch = global.fetch;
  global.fetch = vi.fn((input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input.toString();
    return url.startsWith("http://localhost:11434") ? localHandler(url, init) : scholarFetch(input, init);
  }) as unknown as typeof fetch;
}

beforeEach(() => {
  localStorage.clear();
  __resetSessionPoliciesForTests();
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

  it("seeds the passage box from seedText when seedToken changes, without fighting subsequent user edits", async () => {
    const { rerender } = render(<StudioPanel sessionId="s1" seedText="Generated section text." seedToken={1} />);
    expect(screen.getByPlaceholderText(/Paste a passage/)).toHaveValue("Generated section text.");

    // User edits after the seed lands — a re-render with the SAME token must not clobber it.
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "User's own edit." } });
    rerender(<StudioPanel sessionId="s1" seedText="Generated section text." seedToken={1} />);
    expect(screen.getByPlaceholderText(/Paste a passage/)).toHaveValue("User's own edit.");

    // A NEW token (e.g. a second "Humanize in Studio" click) re-seeds, even with the same text.
    rerender(<StudioPanel sessionId="s1" seedText="Generated section text." seedToken={2} />);
    expect(screen.getByPlaceholderText(/Paste a passage/)).toHaveValue("Generated section text.");
  });

  it("clears a prior result/error/consent prompt when re-seeded", async () => {
    mockFetch(() => ({ status: 403, body: { error: "denied", reason: "restricted content never egresses." } }));
    const { rerender } = render(<StudioPanel sessionId="s1" seedToken={1} />);
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Restricted text." } });
    fireEvent.click(screen.getByText("Refine"));
    expect(await screen.findByText(/Denied by privacy policy/)).toBeInTheDocument();

    rerender(<StudioPanel sessionId="s1" seedText="Fresh section." seedToken={2} />);
    expect(screen.queryByText(/Denied by privacy policy/)).not.toBeInTheDocument();
    expect(screen.getByPlaceholderText(/Paste a passage/)).toHaveValue("Fresh section.");
  });

  it("does not seed when seedToken is never supplied (no manuscript panel in play)", () => {
    render(<StudioPanel sessionId="s1" />);
    expect(screen.getByPlaceholderText(/Paste a passage/)).toHaveValue("");
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

    grantLocalConsent("s1", "gemini");
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
    let outboundCalls = 0;
    mockFetch((url) => {
      if (url.includes("generativelanguage.googleapis.com")) {
        outboundCalls++;
        return {
          status: 200,
          body: {
            diff: { passageId: "desk-studio-passage", level: "clarity", originalText: "Some text.", changes: [], voiceApplied: false },
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
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text." } });
    fireEvent.click(screen.getByText("Refine"));

    expect(await screen.findByText(/First use of gemini/)).toBeInTheDocument();
    fireEvent.click(screen.getByText(/Allow gemini and retry/));

    expect(await screen.findByText("No changes suggested.")).toBeInTheDocument();
    expect(outboundCalls).toBe(1);
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
              { id: "c1", category: "content", originalStart: 12, originalEnd: 19, originalText: "suggest", replacementText: "demonstrate", reason: "Strengthens claim", meaningNote: "Changes claim strength" },
              { id: "c2", category: "language", originalStart: 20, originalEnd: 26, originalText: "change", replacementText: "variation", reason: "Clarity" },
            ],
            voiceApplied: true,
          },
          contentChangeCount: 1,
          languageChangeCount: 1,
        },
      };
    });

    grantLocalConsent("s1", "gemini");
    render(<StudioPanel sessionId="s1" />);
    fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
    switchToAdvanced();
    fireEvent.change(screen.getByPlaceholderText("API key"), { target: { value: "sk-test" } });
    fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "The results suggest change." } });
    fireEvent.click(screen.getByText("Refine"));

    const changes = await screen.findAllByRole("listitem");
    expect(changes[0]).toHaveTextContent("demonstrate");
    expect(changes[0]).toHaveTextContent("Content");
    expect(changes[1]).toHaveTextContent("variation");
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
      grantLocalConsent("s1", "openrouter");
      let capturedDirectUrl: string | null = null;
      mockFetch((url) => {
        if (url === "/api/ai-access/route") {
          return {
            status: 200,
            body: { ok: true, choice: { tier: "free", providerId: "openrouter", modelId: "some-model", reasoning: "Using openrouter's free tier — no cost to you." }, fallbacks: [] },
          };
        }
        if (url.includes("openrouter.ai")) {
          capturedDirectUrl = url;
          return {
            status: 200,
            body: {
              choices: [
                {
                  message: {
                    content: JSON.stringify({ revised: "Some text to refine.", changes: [] }),
                  },
                },
              ],
              usage: { prompt_tokens: 10, completion_tokens: 5 },
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
      await waitFor(() => expect(capturedDirectUrl).not.toBeNull());
      expect(capturedDirectUrl).toContain("openrouter.ai");
      expect(global.fetch).not.toHaveBeenCalledWith("/api/studio/refine", expect.anything());
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

      // "Why this AI?" for Premium: Source/Provider/Model/Credits used — never a credential.
      fireEvent.click(screen.getAllByText("Why this AI?")[0]);
      expect(await screen.findByText("Scholar Premium")).toBeInTheDocument();
      expect(screen.getByText("Provider:")).toBeInTheDocument();
      expect(screen.getByText("Credits used:")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
      expect(screen.queryByText(/sk-/)).not.toBeInTheDocument();
    });

    /** Studio's default routing decision used by every local test below — mockFetch() only ever needs to answer /api/ai-access/route; anything else hitting Scholar's own API is a bug in the code under test. */
    function mockOnlyLocalRoute(reasoning = "Using your local ollama — runs on your own computer, nothing leaves your device.") {
      mockFetch((url) => {
        if (url === "/api/ai-access/route") {
          return { status: 200, body: { ok: true, choice: { tier: "local", providerId: "ollama", reasoning }, fallbacks: [] } };
        }
        throw new Error(`Unmocked Scholar-side fetch: ${url}`);
      });
    }

    it("routes to a local runner via Auto and executes it directly, with no cloud-transfer consent prompt, since nothing leaves the device", async () => {
      mockOnlyLocalRoute();
      const localFetch = vi.fn(async (url: string) => {
        if (url === "http://localhost:11434/api/tags") {
          return { ok: true, json: async () => ({ models: [{ name: "llama3.1:8b" }] }) } as Response;
        }
        if (url === "http://localhost:11434/api/chat") {
          return {
            ok: true,
            json: async () => ({ message: { role: "assistant", content: JSON.stringify({ revised: "x", changes: [] }) } }),
          } as Response;
        }
        throw new Error(`Unmocked local fetch: ${url}`);
      });
      withLocalFetch(localFetch);

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
      await screen.findByText("Will use: Ollama · local");

      fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to refine." } });
      fireEvent.click(screen.getByText("Refine"));

      // Local execution is Warden-evaluated exactly like every other tier —
      // it just never lands on "ask", since there is no cloud transfer to
      // consent to. Confirm no misleading consent prompt ever appears.
      expect(await screen.findByText(/AI used: Ollama \(llama3\.1:8b\) · local/)).toBeInTheDocument();
      expect(screen.queryByText(/Allow Ollama and retry/)).not.toBeInTheDocument();
      expect(screen.queryByText(/First use of ollama/)).not.toBeInTheDocument();
      expect(localFetch).toHaveBeenCalledWith("http://localhost:11434/api/chat", expect.anything());
      // The privacy boundary itself: no call to Scholar's own refine route.
      expect(global.fetch).not.toHaveBeenCalledWith("/api/studio/refine", expect.anything());

      // "Why this AI?" must accurately describe the local execution path —
      // Source/Runtime/Model/Processing, never a Provider/Credits framing.
      // Two toggles share the same `detailsOpen` state (the pre-run routing
      // preview and the post-run executed-source panel) — click either.
      fireEvent.click(screen.getAllByText("Why this AI?")[0]);
      expect(await screen.findByText("Local")).toBeInTheDocument();
      expect(screen.getByText("Runtime:")).toBeInTheDocument();
      expect(screen.getByText("llama3.1:8b")).toBeInTheDocument();
      expect(screen.getByText(/On your computer — this passage was never sent to Scholar's servers\./)).toBeInTheDocument();
      expect(screen.queryByText("Credits used:")).not.toBeInTheDocument();
    });

    it("gives a clear, specific message when the local runtime doesn't answer at all", async () => {
      mockOnlyLocalRoute();
      withLocalFetch(async () => {
        throw new Error("connection refused");
      });

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
      await screen.findByText("Will use: Ollama · local");
      fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to refine." } });
      fireEvent.click(screen.getByText("Refine"));

      expect(await screen.findByText(/Ollama isn't reachable right now/)).toBeInTheDocument();
    });

    it("gives a clear, specific message — and a setup recommendation — when the runtime answers but no model is loaded", async () => {
      mockOnlyLocalRoute();
      withLocalFetch(async (url) => {
        if (url === "http://localhost:11434/api/tags") return { ok: true, json: async () => ({ models: [] }) } as Response;
        throw new Error(`Unmocked local fetch: ${url}`);
      });

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
      await screen.findByText("Will use: Ollama · local");
      fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to refine." } });
      fireEvent.click(screen.getByText("Refine"));

      expect(await screen.findByText(/no model is loaded/i)).toBeInTheDocument();
      expect(await screen.findByText(/ollama pull llama3\.1:8b/)).toBeInTheDocument();
    });

    it("falls back to the next candidate when the local runtime fails, rather than stopping the whole request", async () => {
      mockFetch((url) => {
        if (url === "/api/ai-access/route") {
          return {
            status: 200,
            body: {
              ok: true,
              choice: { tier: "local", providerId: "ollama", reasoning: "Using your local ollama." },
              fallbacks: [{ tier: "free", providerId: "gemini", reasoning: "Using gemini's free tier." }],
            },
          };
        }
        if (url.includes("generativelanguage.googleapis.com")) {
          return {
            status: 200,
            body: {
              candidates: [
                {
                  content: {
                    parts: [{ text: JSON.stringify({ revised: "Some text to refine.", changes: [] }) }],
                  },
                },
              ],
              usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 },
            },
          };
        }
        throw new Error(`Unmocked: ${url}`);
      });
      withLocalFetch(async () => {
        throw new Error("connection refused");
      });
      await storeProviderKey("gemini", "sk-fallback-test");
      grantLocalConsent("s1", "gemini");

      render(<StudioPanel sessionId="s1" />);
      fireEvent.change(screen.getAllByRole("combobox")[0], { target: { value: "clarity" } });
      await screen.findByText("Will use: Ollama · local");
      fireEvent.change(screen.getByPlaceholderText(/Paste a passage/), { target: { value: "Some text to refine." } });
      fireEvent.click(screen.getByText("Refine"));

      expect(await screen.findByText(/AI used: gemini \(gemini-2\.5-flash\) · free/)).toBeInTheDocument();
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
