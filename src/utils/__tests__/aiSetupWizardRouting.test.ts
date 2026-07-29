import { describe, it, expect } from "vitest";
import { resolveWizardRoute } from "../aiSetupWizardRouting";

// Navigation overhaul Phase 2 (docs/planning/navigation-scoping.md) —
// AISetupWizard.tsx's internal step/selectedMode/selectedProviders had zero
// hash reflection. This pure resolver decides what a hash segment triple
// (mode, step, providers) honestly resolves to, kept separate from the
// component so the fallback rules are unit-testable without rendering.

describe("resolveWizardRoute — mode segment", () => {
  it("resolves a valid mode id", () => {
    const result = resolveWizardRoute("cloud", undefined, undefined);
    expect(result.mode).toBe("cloud");
  });

  it("falls back to no mode (step 0, mode-selection screen) for an unknown mode id", () => {
    const result = resolveWizardRoute("not-a-real-mode", "2", "gemini");
    expect(result.mode).toBeNull();
    expect(result.step).toBe(0);
  });

  it("falls back to no mode when the segment is missing entirely", () => {
    const result = resolveWizardRoute(undefined, undefined, undefined);
    expect(result.mode).toBeNull();
    expect(result.step).toBe(0);
  });

  it("resolves the coming-soon 'partner' mode id too (still a real, listed mode, just non-selectable in the UI)", () => {
    const result = resolveWizardRoute("partner", undefined, undefined);
    expect(result.mode).toBe("partner");
  });
});

describe("resolveWizardRoute — step segment", () => {
  it("resolves step 0 (mode selection) when no step segment given but mode is valid", () => {
    const result = resolveWizardRoute("cloud", undefined, undefined);
    expect(result.step).toBe(0);
  });

  it("resolves step 1 (provider selection) when requested with a valid mode", () => {
    const result = resolveWizardRoute("cloud", "1", undefined);
    expect(result.step).toBe(1);
  });

  it("resolves step 2 (configure connections) when requested with valid providers for that mode", () => {
    const result = resolveWizardRoute("cloud", "2", "gemini");
    expect(result.step).toBe(2);
    expect(result.providers).toEqual(["gemini"]);
  });

  it("never resolves directly to step 3 (completion) via a deep link — re-running validation with no data would be a broken screen, not a real completed state", () => {
    const result = resolveWizardRoute("cloud", "3", "gemini");
    expect(result.step).toBe(2);
  });

  it("clamps an out-of-range step (e.g. a hand-edited '99') down to a valid one", () => {
    const result = resolveWizardRoute("cloud", "99", "gemini");
    expect(result.step).toBeLessThanOrEqual(2);
  });

  it("falls back step 2 -> step 1 when providers are missing entirely (step 2 needs at least one selected provider)", () => {
    const result = resolveWizardRoute("cloud", "2", undefined);
    expect(result.step).toBe(1);
    expect(result.providers).toEqual([]);
  });
});

describe("resolveWizardRoute — providers segment", () => {
  it("parses a comma-joined provider list and keeps only ids that are real for that mode", () => {
    // "cloud" mode's real provider list includes gemini/groq/etc — "not-real" isn't one.
    const result = resolveWizardRoute("cloud", "2", "gemini,not-real,groq");
    expect(result.providers).toEqual(["gemini", "groq"]);
  });

  it("falls back to step 1 if, after filtering, no requested providers are valid for the mode", () => {
    const result = resolveWizardRoute("cloud", "2", "not-real,also-fake");
    expect(result.step).toBe(1);
    expect(result.providers).toEqual([]);
  });

  it("rejects a provider that's real in general but not part of THIS mode's own list (e.g. a BYOK-only provider requested under 'cloud')", () => {
    // "openai" belongs to the byok mode's provider list, not cloud's.
    const result = resolveWizardRoute("cloud", "2", "gemini,openai");
    expect(result.providers).toEqual(["gemini"]);
  });
});

describe("resolveWizardRoute — the vault gate is structurally independent of this resolver (security property)", () => {
  it("the resolved route never includes a vault-unlocked flag or anything that could bypass the real isVaultUnlocked() check", () => {
    const result = resolveWizardRoute("byok", "2", "openai");
    expect(result).not.toHaveProperty("vaultUnlocked");
    expect(Object.keys(result).sort()).toEqual(["mode", "providers", "step"]);
  });
});
