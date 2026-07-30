import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";

describe("supabaseClient", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("VITE_SUPABASE_URL", "");
    vi.stubEnv("VITE_SUPABASE_ANON_KEY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.resetModules();
  });

  it("reports not configured when VITE_SUPABASE_URL/ANON_KEY are unset (current default env)", async () => {
    const { isSupabaseConfigured } = await import("../supabaseClient");
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("throws a clear, actionable error instead of failing deep inside a network call", async () => {
    const { getSupabaseClient } = await import("../supabaseClient");

    expect(() => getSupabaseClient()).toThrow(/VITE_SUPABASE_URL/);
    expect(() => getSupabaseClient()).toThrow(/supabase\.com/);
  });
});