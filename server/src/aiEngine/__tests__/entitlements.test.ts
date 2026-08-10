import { describe, it, expect } from "vitest";
import { isEntitlementActive, type Entitlement } from "../entitlements";

const NOW = new Date("2026-06-15T00:00:00Z");

function entitlement(overrides: Partial<Entitlement> = {}): Entitlement {
  return { userId: "u1", planId: "premium_basic", status: "active", startDate: "2026-01-01T00:00:00Z", expiry: null, ...overrides };
}

describe("isEntitlementActive", () => {
  it("is false for no entitlement at all", () => {
    expect(isEntitlementActive(null, NOW)).toBe(false);
  });

  it("is false for status 'none'", () => {
    expect(isEntitlementActive(entitlement({ status: "none" }), NOW)).toBe(false);
  });

  it("is false for a revoked entitlement, even with a future expiry", () => {
    expect(isEntitlementActive(entitlement({ status: "revoked", expiry: "2027-01-01T00:00:00Z" }), NOW)).toBe(false);
  });

  it("is true for active with no expiry", () => {
    expect(isEntitlementActive(entitlement({ status: "active", expiry: null }), NOW)).toBe(true);
  });

  it("is true for active with a future expiry", () => {
    expect(isEntitlementActive(entitlement({ status: "active", expiry: "2027-01-01T00:00:00Z" }), NOW)).toBe(true);
  });

  it("is false for active whose expiry has already passed — this is what actually cuts off access, not a separate cron job", () => {
    expect(isEntitlementActive(entitlement({ status: "active", expiry: "2026-01-01T00:00:00Z" }), NOW)).toBe(false);
  });

  it("is false exactly at the expiry instant (boundary is exclusive)", () => {
    expect(isEntitlementActive(entitlement({ status: "active", expiry: NOW.toISOString() }), NOW)).toBe(false);
  });
});
