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
