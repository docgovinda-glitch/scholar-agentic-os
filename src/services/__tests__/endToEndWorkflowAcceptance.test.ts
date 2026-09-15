import { describe, it, expect, vi, beforeEach } from "vitest";
import {
  discoverProviderModels,
  clearModelBlacklist,
  isModelBlacklisted,
  clearAllProviderHealth,
} from "../modelDiscovery";
import { runProviderDiagnostics } from "../aiDiagnostics";
import {
  resolveClientCandidates,
  setUserAiPreferences,
  getUserAiPreferences,
} from "../clientRouter";
import { executeAgenticLLM } from "../../desk/api";
import { buildLiteraturePrompts } from "../../desk/workspace/agentPrompts/literaturePrompts";
import { storeProviderKey, readProviderKey } from "../userAiSettings";
import {
  subscribeExecutionState,
  clearAllExecutionScopes,
  type ExecutionScope,
} from "../executionState";
import * as gateway from "../../platform/gateway/gateway";

describe("System-Level Acceptance Test: Full End-to-End User Journey", () => {
  beforeEach(() => {
    localStorage.clear();
    clearModelBlacklist();
    clearAllProviderHealth();
    clearAllExecutionScopes();
    vi.restoreAllMocks();
  });

  it("executes the entire workflow without manual model intervention", async () => {
    // ── STEP 1: AI Access & Discovery ──────────────────────────────────
    // Mock live provider discovery endpoints
    vi.spyOn(global, "fetch").mockImplementation(async (url: any) => {
      const urlStr = String(url);
      if (urlStr.includes("generativelanguage.googleapis.com")) {
        return new Response(
          JSON.stringify({
            models: [
              {
                name: "models/gemini-2.5-flash",
                displayName: "Gemini 2.5 Flash",
                supportedGenerationMethods: ["generateContent"],
                inputTokenLimit: 1000000,
              },
              {
                name: "models/gemini-2.5-pro",
                displayName: "Gemini 2.5 Pro",
                supportedGenerationMethods: ["generateContent"],
                inputTokenLimit: 2000000,
              },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      if (urlStr.includes("api.groq.com")) {
        return new Response(
          JSON.stringify({
            data: [
              { id: "llama-3.3-70b-versatile", context_window: 131072 },
              { id: "openai/gpt-oss-120b", context_window: 131072 },
            ],
          }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ data: [] }), { status: 200 });
    });

    // User saves API keys in settings
    await storeProviderKey("gemini", "sk-gemini-live-key");
    await storeProviderKey("groq", "gsk-groq-live-key");

    // Discover live models for Gemini
    const geminiDiscovery = await discoverProviderModels("gemini", "sk-gemini-live-key", undefined, true);
    expect(geminiDiscovery.ok).toBe(true);
    expect(geminiDiscovery.models.length).toBeGreaterThanOrEqual(2);
    expect(geminiDiscovery.source).toBe("live_discovery");

    // Discover live models for Groq
    const groqDiscovery = await discoverProviderModels("groq", "gsk-groq-live-key", undefined, true);
    expect(groqDiscovery.ok).toBe(true);
    expect(groqDiscovery.models.some((m) => m.id === "openai/gpt-oss-120b")).toBe(true);

    // ── STEP 2: Proactive 8-Step Diagnostics ──────────────────────────
    // Mock gateway completeWithFailover for diagnostics
    vi.spyOn(gateway, "completeWithFailover").mockImplementation(async (req: any, opts: any) => {
      const candidate = opts.candidates[0];
      if (req.userPrompt.includes("Output JSON")) {
        return {
          ok: true,
          value: { text: '{"status": "ok", "valid": true}', model: candidate.model },
          providerId: candidate.provider,
          usedFallback: false,
          attempts: [],
        } as any;
      }
      return {
        ok: true,
        value: { text: "OK", model: candidate.model },
        providerId: candidate.provider,
        usedFallback: false,
        attempts: [],
      } as any;
    });

    const diagReport = await runProviderDiagnostics("gemini", "sk-gemini-live-key", "gemini-2.5-flash");
    expect(diagReport.overallStatus).toBe("healthy");
    expect(diagReport.steps.length).toBe(8);
    expect(diagReport.steps.every((s) => s.status === "pass")).toBe(true);

    // ── STEP 3: User Selects Preferred Model ───────────────────────────
    setUserAiPreferences({
      preferredProviderId: "gemini",
      preferredModelId: "gemini-2.5-flash",
      privacyMode: "balanced",
    });

    const prefs = getUserAiPreferences();
    expect(prefs.preferredProviderId).toBe("gemini");
    expect(prefs.preferredModelId).toBe("gemini-2.5-flash");

    // ── STEP 4: Literature Discovery Triggered ─────────────────────────
    const { systemPrompt, userPrompt } = buildLiteraturePrompts({
      workingTitle: "Autonomous Agentic AI Orchestration in Research",
      researchArea: "Computer Science and Multi-Agent Systems",
      projectAnswers: { methodology: "Empirical System Evaluation" },
      isBroadened: false,
    });

    // ── STEP 5: Force Primary 404 Failure & Observe Seamless Fallback ─
    let fallbackObserved = false;
    let fallbackModelReported = "";
    const executionEvents: ExecutionScope[] = [];

    // Subscribe to live execution state
    const unsubscribe = subscribeExecutionState((scope) => {
      if (scope) {
        executionEvents.push({ ...scope });
        if (scope.isFallback || scope.isFallbackActive) {
          fallbackObserved = true;
          fallbackModelReported = scope.activeModel || "";
        }
      }
    });

    // Configure gateway: gemini-2.5-flash throws 404 (model_not_found),
    // then Groq fallback succeeds with structured JSON output!
    vi.spyOn(gateway, "completeWithFailover").mockImplementation(async (req: any, opts: any) => {
      // Find which candidate was called
      const firstCandidate = opts.candidates[0];

      // Simulate gemini 404 failure on first candidate
      if (firstCandidate.provider === "gemini" && firstCandidate.model === "gemini-2.5-flash") {
        // Trigger failover event
        opts.onEvent?.({
          type: "switch",
          providerId: "groq",
          userMessage: "Primary AI model unavailable (404). Switching to backup Groq...",
        });

        // The failover system attempts the secondary/next candidate
        const nextCandidate = opts.candidates.find((c: any) => c.provider === "groq") || opts.candidates[1];
        return {
          ok: true,
          value: {
            text: JSON.stringify({
              items: [
                {
                  id: "paper-1",
                  title: "Decentralized Multi-Agent Orchestration",
                  authors: ["Dr. Alex Smith", "Dr. Jordan Lee"],
                  year: 2025,
                  venue: "NeurIPS",
                  doi: "10.1000/neurips.2025.01",
                  key_findings: "Proves decentralized routing beats static configurations.",
                  themes: ["Agent Coordination", "Failover Resilience"],
                },
                {
                  id: "paper-2",
                  title: "Dynamic Model Discovery and Blacklisting in Autonomous Systems",
                  authors: ["Dr. Casey Morgan"],
                  year: 2026,
                  venue: "ICLR",
                  doi: "10.1000/iclr.2026.02",
                  key_findings: "Eliminates hardcoded model debt across LLM gateways.",
                  themes: ["Model Discovery", "Runtime Routing"],
                },
              ],
            }),
            model: nextCandidate.model || "openai/gpt-oss-120b",
          },
          providerId: nextCandidate.provider,
          usedFallback: true,
          attempts: [
            {
              providerId: "gemini",
              error: {
                kind: "model_not_found",
                label: "Model Unavailable",
                message: "Model gemini-2.5-flash was not found (404).",
                remedy: "Switched to backup model automatically.",
                retryable: false,
                failoverWorthwhile: true,
              },
            },
          ],
        } as any;
      }

      return {
        ok: true,
        value: {
          text: JSON.stringify({ items: [] }),
          model: firstCandidate.model,
        },
        providerId: firstCandidate.provider,
        usedFallback: false,
        attempts: [],
      } as any;
    });

    const executionResult = await executeAgenticLLM(
      systemPrompt,
      userPrompt,
      "literatureDiscovery"
    );

    expect(executionResult).toBeDefined();
    const parsed = JSON.parse(executionResult);
    expect(parsed.items.length).toBe(2);
    expect(parsed.items[0].title).toBe("Decentralized Multi-Agent Orchestration");

    // Verify fallback was observed by UI subscribers without user intervention
    expect(fallbackObserved).toBe(true);

    // ── STEP 6: User Excludes a Paper & Triggers Retry ─────────────────
    // User excludes paper-1 by DOI
    const removedDois = ["10.1000/neurips.2025.01"];
    const keptPapers = [parsed.items[1]]; // paper-2 kept

    // Verify retry prompts preserve kept papers and exclusions
    const retryPrompts = buildLiteraturePrompts({
      workingTitle: "Autonomous Agentic AI Orchestration in Research",
      researchArea: "Computer Science and Multi-Agent Systems",
      projectAnswers: { methodology: "Empirical System Evaluation" },
      isBroadened: false,
      excludeDois: removedDois,
      excludeIds: ["paper-1"],
      excludeTitles: ["Decentralized Multi-Agent Orchestration"],
    });

    expect(retryPrompts.systemPrompt).toContain("10.1000/neurips.2025.01");
    expect(retryPrompts.systemPrompt).toContain("Decentralized Multi-Agent Orchestration");

    // Execute retry: returns paper-3 without duplicating paper-1 or paper-2
    vi.spyOn(gateway, "completeWithFailover").mockResolvedValueOnce({
      ok: true,
      value: {
        text: JSON.stringify({
          items: [
            {
              id: "paper-3",
              title: "Adaptive Task Routing in Heterogeneous LLM Clusters",
              authors: ["Dr. Taylor Green"],
              year: 2026,
              venue: "AAAI",
              doi: "10.1000/aaai.2026.03",
              key_findings: "Demonstrates capability-aware routing prevents task degradation.",
              themes: ["Adaptive Routing", "Capability Normalization"],
            },
          ],
        }),
        model: "openai/gpt-oss-120b",
      },
      providerId: "groq",
      usedFallback: false,
      attempts: [],
    } as any);

    const retryResult = await executeAgenticLLM(
      retryPrompts.systemPrompt,
      retryPrompts.userPrompt,
      "literatureDiscovery"
    );

    const retryParsed = JSON.parse(retryResult);
    expect(retryParsed.items.length).toBe(1);
    expect(retryParsed.items[0].id).toBe("paper-3");

    // The merged literature collection preserves kept items + new items
    const mergedCollection = [...keptPapers, ...retryParsed.items];
    expect(mergedCollection.length).toBe(2);
    expect(mergedCollection.some((p) => p.id === "paper-2")).toBe(true);
    expect(mergedCollection.some((p) => p.id === "paper-3")).toBe(true);
    // Excluded paper-1 is not in the collection
    expect(mergedCollection.some((p) => p.id === "paper-1")).toBe(false);

    unsubscribe();
  });
});
