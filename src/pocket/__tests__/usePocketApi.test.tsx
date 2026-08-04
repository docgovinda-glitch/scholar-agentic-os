// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, waitFor, act } from "@testing-library/react";

/**
 * Every /api/pocket/* route sits behind requireAuth, which 401s any request
 * without `Authorization: Bearer <jwt>`. These hooks originally called bare
 * fetch(), so the entire Pocket feature was unreachable at runtime while
 * looking perfectly wired in the source. These tests pin the header on.
 */

const getSession = vi.fn();

vi.mock("../../services/supabaseClient", () => ({
  isSupabaseConfigured: () => true,
  getSupabaseClient: () => ({ auth: { getSession } }),
}));

import { useApprovalQueue, useDocumentComments } from "../hooks/usePocketApi";

function lastRequestHeaders(): Headers {
  const mock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const [, init] = mock.mock.calls[mock.mock.calls.length - 1];
  return init.headers as Headers;
}

describe("pocket API hooks — authorization", () => {
  beforeEach(() => {
    getSession.mockResolvedValue({ data: { session: { access_token: "test-jwt" } } });
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ stats: { total: 0, approved: 0, rejected: 0, pending: 0 }, comments: [] }),
    }) as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("attaches the supabase bearer token to GET requests", async () => {
    renderHook(() => useApprovalQueue("project-1"));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(lastRequestHeaders().get("Authorization")).toBe("Bearer test-jwt");
  });

  it("attaches the bearer token and content type to POST requests", async () => {
    const { result } = renderHook(() => useApprovalQueue("project-1"));
    await act(async () => {
      await result.current.submitDecision("source-1", "approved");
    });

    const headers = lastRequestHeaders();
    expect(headers.get("Authorization")).toBe("Bearer test-jwt");
    expect(headers.get("Content-Type")).toBe("application/json");
  });

  it("does not fire a request when no project is selected", async () => {
    renderHook(() => useApprovalQueue(""));
    await new Promise((r) => setTimeout(r, 20));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("does not fire a request when no document is selected", async () => {
    renderHook(() => useDocumentComments(""));
    await new Promise((r) => setTimeout(r, 20));
    expect(globalThis.fetch).not.toHaveBeenCalled();
  });

  it("still issues the request when there is no session, so the 401 is visible", async () => {
    getSession.mockResolvedValue({ data: { session: null } });
    renderHook(() => useApprovalQueue("project-1"));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalled());
    expect(lastRequestHeaders().get("Authorization")).toBeNull();
  });
});
