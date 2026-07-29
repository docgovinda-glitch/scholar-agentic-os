// @vitest-environment jsdom
//
// Navigation overhaul (docs/planning/navigation-scoping.md). useHashNavigation.ts
// existed but had zero live imports anywhere — a sixth dead-code instance in
// the same family documented in HANDOVER.md, found while scoping this task.
// App.tsx had its own separate, inline copy of this exact logic instead.
// These tests characterize the hook's pre-existing 4-shape behavior FIRST
// (login/onboarding/dashboard/workspace-tab), then cover the two new
// navigation-overhaul additions: phase-workflow and settings-sub-tab hash
// segments, both previously invisible to the URL entirely.

import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useHashNavigation } from "../useHashNavigation";

function setup(overrides: Partial<Parameters<typeof useHashNavigation>[0]> = {}) {
  const state = {
    user: "jdoe",
    onboardingStep: "workshop",
    setOnboardingStep: vi.fn(),
    viewMode: "workspace" as const,
    setViewMode: vi.fn(),
    activeTab: "workspace",
    setActiveTab: vi.fn(),
    currentPhase: "A",
    onRequestPhase: vi.fn(),
    settingsSubTab: "mode",
    setSettingsSubTab: vi.fn(),
    ...overrides
  };
  const { rerender } = renderHook((props) => useHashNavigation(props), { initialProps: state });
  return { state, rerender };
}

beforeEach(() => {
  window.location.hash = "";
});

describe("useHashNavigation — pre-existing behavior, characterized before extending", () => {
  it("parses #onboarding/<step> and calls setOnboardingStep", () => {
    window.location.hash = "#onboarding/ai-setup";
    const { state } = setup();
    act(() => window.dispatchEvent(new Event("hashchange")));
    expect(state.setOnboardingStep).toHaveBeenCalledWith("ai-setup");
  });

  it("parses #dashboard and sets workshop + dashboard view", () => {
    window.location.hash = "#dashboard";
    const { state } = setup();
    act(() => window.dispatchEvent(new Event("hashchange")));
    expect(state.setOnboardingStep).toHaveBeenCalledWith("workshop");
    expect(state.setViewMode).toHaveBeenCalledWith("dashboard");
  });

  it("parses #workspace/<tab> for a non-workspace, non-settings tab", () => {
    window.location.hash = "#workspace/vault";
    const { state } = setup();
    act(() => window.dispatchEvent(new Event("hashchange")));
    expect(state.setActiveTab).toHaveBeenCalledWith("vault");
  });

  it("writes state back to the hash when state changes, without duplicating an unchanged hash", () => {
    setup({ onboardingStep: "workshop", viewMode: "dashboard" as const });
    expect(window.location.hash).toBe("#dashboard");
  });
});

describe("useHashNavigation — phase-workflow segment (navigation overhaul)", () => {
  it("parses #workspace/workspace/<phaseId> and requests the phase via onRequestPhase, not a direct setter", () => {
    window.location.hash = "#workspace/workspace/C";
    const { state } = setup();
    act(() => window.dispatchEvent(new Event("hashchange")));
    expect(state.onRequestPhase).toHaveBeenCalledWith("C");
    expect(state.setActiveTab).toHaveBeenCalledWith("workspace");
  });

  it("includes the current phase in the written hash while on the workspace tab", () => {
    setup({ viewMode: "workspace" as const, activeTab: "workspace", currentPhase: "D" });
    expect(window.location.hash).toBe("#workspace/workspace/D");
  });
});

describe("useHashNavigation — settings sub-tab segment (navigation overhaul)", () => {
  it("parses #workspace/settings/<subTab> and calls setSettingsSubTab", () => {
    window.location.hash = "#workspace/settings/diagnostics";
    const { state } = setup();
    act(() => window.dispatchEvent(new Event("hashchange")));
    expect(state.setActiveTab).toHaveBeenCalledWith("settings");
    expect(state.setSettingsSubTab).toHaveBeenCalledWith("diagnostics");
  });

  it("includes the settings sub-tab in the written hash while on the settings tab", () => {
    setup({ viewMode: "workspace" as const, activeTab: "settings", settingsSubTab: "keys" });
    expect(window.location.hash).toBe("#workspace/settings/keys");
  });
});

describe("useHashNavigation — deep-link race: user starts null, then loads on a later render (root cause of the recorded gate-message gap)", () => {
  it("does NOT wipe an over-reaching deep link's hash while user is still null on the first render, and correctly re-parses it once user loads", () => {
    window.location.hash = "#workspace/workspace/D";
    const onRequestPhase = vi.fn();
    const { rerender } = renderHook(
      (props: Parameters<typeof useHashNavigation>[0]) => useHashNavigation(props),
      {
        initialProps: {
          user: null,
          onboardingStep: "workshop",
          setOnboardingStep: vi.fn(),
          viewMode: "workspace" as const,
          setViewMode: vi.fn(),
          activeTab: "workspace",
          setActiveTab: vi.fn(),
          currentPhase: "A",
          onRequestPhase,
          settingsSubTab: "mode",
          setSettingsSubTab: vi.fn()
        }
      }
    );

    // Real app lifecycle: user is null on the very first render (auth context
    // hasn't hydrated from localStorage yet), then becomes available on a
    // later render — this must not have already destroyed the deep link.
    expect(window.location.hash).toBe("#workspace/workspace/D");

    rerender({
      user: "jdoe",
      onboardingStep: "workshop",
      setOnboardingStep: vi.fn(),
      viewMode: "workspace" as const,
      setViewMode: vi.fn(),
      activeTab: "workspace",
      setActiveTab: vi.fn(),
      currentPhase: "B",
      onRequestPhase,
      settingsSubTab: "mode",
      setSettingsSubTab: vi.fn()
    });

    expect(onRequestPhase).toHaveBeenCalledWith("D");
  });

  it("still wipes the hash on an ACTUAL logout (real user -> null), unlike the not-yet-hydrated initial state", () => {
    window.location.hash = "#workspace/workspace/B";
    const { rerender } = setup({ user: "jdoe" });
    expect(window.location.hash).not.toBe("");

    rerender({
      user: null,
      onboardingStep: "workshop",
      setOnboardingStep: vi.fn(),
      viewMode: "workspace" as const,
      setViewMode: vi.fn(),
      activeTab: "workspace",
      setActiveTab: vi.fn(),
      currentPhase: "B",
      onRequestPhase: vi.fn(),
      settingsSubTab: "mode",
      setSettingsSubTab: vi.fn()
    });

    expect(window.location.hash).toBe("");
  });
});

describe("useHashNavigation — onboarding sub-segments (navigation overhaul Phase 2)", () => {
  it("still dispatches setOnboardingStep('ai-setup') when the hash has wizard sub-segments after it", () => {
    window.location.hash = "#onboarding/ai-setup/cloud/2/gemini";
    const { state } = setup();
    act(() => window.dispatchEvent(new Event("hashchange")));
    expect(state.setOnboardingStep).toHaveBeenCalledWith("ai-setup");
  });

  it("does NOT overwrite an already-correct onboarding hash that has wizard sub-segments — the wizard component owns anything after the first segment", () => {
    window.location.hash = "#onboarding/ai-setup/cloud/2/gemini";
    setup({ onboardingStep: "ai-setup" });
    expect(window.location.hash).toBe("#onboarding/ai-setup/cloud/2/gemini");
  });

  it("still writes the plain #onboarding/<step> hash when there ARE no sub-segments yet (e.g. moving from workshop into onboarding)", () => {
    window.location.hash = "#dashboard";
    setup({ onboardingStep: "ai-setup" });
    expect(window.location.hash).toBe("#onboarding/ai-setup");
  });

  it("corrects the hash when the onboarding step itself actually changes, even if the old hash had sub-segments", () => {
    window.location.hash = "#onboarding/ai-setup/cloud/2/gemini";
    setup({ onboardingStep: "knowledge-vault" });
    expect(window.location.hash).toBe("#onboarding/knowledge-vault");
  });
});
