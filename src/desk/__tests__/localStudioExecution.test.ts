/**
 * Direct unit tests for local execution's Warden behavior — cases that
 * aren't reachable through StudioPanel's UI today (no scope-restriction
 * control is wired into Studio yet, docs 41-AI-ARCHITECTURE.md §5.3's
 * restricted-scope feature is exercised elsewhere in the product), but
 * still need coverage: a restricted scope must deny a local request exactly
 * as it denies a cloud one, and that denial must be the real GatewayDenied
 * class StudioPanel.tsx's candidate loop checks for — never swallowed into
 * a generic "this candidate didn't work, try the next one" fallback.
 */
import { describe, it, expect, beforeEach, vi, afterEach } from "vitest";
import { refineLocally, GatewayDenied } from "../regions/localStudioExecution";
import { restrictScope, __resetSessionPoliciesForTests } from "../../app/studio/sessionPolicyStore";

const originalFetch = global.fetch;

beforeEach(() => {
  __resetSessionPoliciesForTests();
  global.fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url === "http://localhost:11434/api/tags") {
      return { ok: true, json: async () => ({ models: [{ name: "llama3.1:8b" }] }) } as Response;
    }
    if (url === "http://localhost:11434/api/chat") {
      return {
        ok: true,
        json: async () => ({ message: { role: "assistant", content: JSON.stringify({ revised: "x", changes: [] }) } }),
      } as Response;
    }
    throw new Error(`Unmocked fetch in localStudioExecution test: ${url}`);
  }) as typeof fetch;
});

afterEach(() => {
  global.fetch = originalFetch;
});

describe("refineLocally: restricted-scope denial", () => {
  it("denies a local request for a scope marked restricted, as a real GatewayDenied with requiresConsent:false", async () => {
    restrictScope("local:session-restricted", "project-secret");

    await expect(
      refineLocally({
        runnerId: "ollama",
        sessionId: "session-restricted",
        passageId: "p1",
        text: "some sensitive passage",
        level: "clarity",
        scopeId: "project-secret",
      })
    ).rejects.toBeInstanceOf(GatewayDenied);
  });

  it("never reaches the local runtime's chat endpoint for a restricted scope — the deny happens before any generation call", async () => {
    restrictScope("local:session-restricted-2", "project-secret");

    await expect(
      refineLocally({
        runnerId: "ollama",
        sessionId: "session-restricted-2",
        passageId: "p1",
        text: "some sensitive passage",
        level: "clarity",
        scopeId: "project-secret",
      })
    ).rejects.toThrow();

    expect(global.fetch).not.toHaveBeenCalledWith("http://localhost:11434/api/chat", expect.anything());
  });

  it("a restricted-scope denial does not carry requiresConsent — it must never be mistaken for a consent prompt to grant", async () => {
    restrictScope("local:session-restricted-3", "project-secret");

    try {
      await refineLocally({
        runnerId: "ollama",
        sessionId: "session-restricted-3",
        passageId: "p1",
        text: "x",
        level: "clarity",
        scopeId: "project-secret",
      });
      throw new Error("expected refineLocally to reject");
    } catch (e) {
      expect(e).toBeInstanceOf(GatewayDenied);
      expect((e as InstanceType<typeof GatewayDenied>).requiresConsent).toBe(false);
    }
  });

  it("an unrestricted scope still succeeds locally, unaffected by another scope's restriction", async () => {
    restrictScope("local:session-mixed", "project-secret");

    const result = await refineLocally({
      runnerId: "ollama",
      sessionId: "session-mixed",
      passageId: "p1",
      text: "x",
      level: "clarity",
      scopeId: "project-public",
    });

    expect(result).toBeDefined();
    expect(global.fetch).toHaveBeenCalledWith("http://localhost:11434/api/chat", expect.anything());
  });
});
