import { describe, it, expect } from "vitest";
import { isSupabaseConfigured, getSupabaseClient } from "../supabaseClient";

describe("supabaseClient", () => {
  it("reports not configured when VITE_SUPABASE_URL/ANON_KEY are unset (current default env)", () => {
    expect(isSupabaseConfigured()).toBe(false);
  });

  it("throws a clear, actionable error instead of failing deep inside a network call", () => {
    expect(() => getSupabaseClient()).toThrow(/VITE_SUPABASE_URL/);
    expect(() => getSupabaseClient()).toThrow(/supabase\.com/);
  });
});
