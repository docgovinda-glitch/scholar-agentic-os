// @vitest-environment jsdom
//
// Navigation overhaul (docs/planning/navigation-scoping.md) — state-loss
// regression tests specifically for "save-then-navigate" under real
// back/forward and rapid consecutive navigation, per this session's task.
// The original stale-closure race (useProjectPersistence.test.ts) is already
// covered for plain rapid updateProject calls; these tests add the
// navigation-specific angle: does a hash-driven navigation happening in the
// same tick as an updateProject call still preserve every field, exactly
// the complianceRules-dropping failure class the app-wide fix targeted.

Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import { useProjectPersistence } from "../useProjectPersistence";
import { useHashNavigation } from "../useHashNavigation";
import { DEFAULT_STATE, PaperProject } from "../../types";

beforeEach(() => {
  localStorage.clear();
  window.location.hash = "";
});

function setupWithNavigation(initialProject: PaperProject) {
  return renderHook(() => {
    const [project, setProject] = useState<PaperProject | null>(initialProject);
    const [allProjects, setAllProjects] = useState<PaperProject[]>([]);
    const [viewMode, setViewMode] = useState<"dashboard" | "workspace">("workspace");
    const [activeTab, setActiveTab] = useState("workspace");
    const [onboardingStep, setOnboardingStep] = useState("workshop");
    const [settingsSubTab, setSettingsSubTab] = useState("mode");
    const persistence = useProjectPersistence("testuser", project, setProject, setAllProjects, allProjects, setViewMode, setActiveTab);

    useHashNavigation({
      user: "testuser",
      onboardingStep,
      setOnboardingStep,
      viewMode,
      setViewMode,
      activeTab,
      setActiveTab,
      currentPhase: project?.currentPhase || "A",
      onRequestPhase: (phase) => persistence.updateProject({ currentPhase: phase as any }),
      settingsSubTab,
      setSettingsSubTab
    });

    return { project, persistence, activeTab };
  });
}

describe("save-then-navigate — a save and a hash-driven navigation in the same tick must not drop either one's fields", () => {
  it("preserves an updateProject call's fields when a tab navigation (setActiveTab) fires in the same tick", () => {
    const initial: PaperProject = { ...DEFAULT_STATE("testuser"), complianceRules: undefined };
    localStorage.setItem("phd_profile_state_testuser", JSON.stringify({ projectState: initial, projects: [initial] }));

    const { result } = setupWithNavigation(initial);

    act(() => {
      // Same tick: a save (the exact complianceRules-dropping shape from the
      // original bug report) immediately followed by a navigation side-effect.
      result.current.persistence.updateProject({ complianceRules: { sectionStructure: ["Intro"] } as any });
      window.location.hash = "#workspace/vault";
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(result.current.project?.complianceRules).toEqual({ sectionStructure: ["Intro"] });
  });

  it("preserves fields across rapid consecutive hash navigations (back, forward, back) without any updateProject call being dropped", () => {
    const initial: PaperProject = { ...DEFAULT_STATE("testuser"), title: "Original Title" };
    localStorage.setItem("phd_profile_state_testuser", JSON.stringify({ projectState: initial, projects: [initial] }));

    const { result } = setupWithNavigation(initial);

    act(() => {
      result.current.persistence.updateProject({ title: "Updated Title" });
    });
    expect(result.current.project?.title).toBe("Updated Title");

    act(() => {
      window.location.hash = "#workspace/vault";
      window.dispatchEvent(new Event("hashchange"));
      window.location.hash = "#workspace/agents";
      window.dispatchEvent(new Event("hashchange"));
      window.location.hash = "#workspace/vault";
      window.dispatchEvent(new Event("hashchange"));
    });

    // Rapid consecutive navigation must not have reset or lost the save.
    expect(result.current.project?.title).toBe("Updated Title");
  });

  it("a phase-change requested via a deep-linked hash still preserves fields from a concurrent save in the same tick", () => {
    const initial: PaperProject = { ...DEFAULT_STATE("testuser"), currentPhase: "A", furthestPhase: "C" as any, keywords: "" };
    localStorage.setItem("phd_profile_state_testuser", JSON.stringify({ projectState: initial, projects: [initial] }));

    const { result } = setupWithNavigation(initial);

    act(() => {
      result.current.persistence.updateProject({ keywords: "ethics, ai governance" });
      window.location.hash = "#workspace/workspace/B";
      window.dispatchEvent(new Event("hashchange"));
    });

    expect(result.current.project?.keywords).toBe("ethics, ai governance");
    expect(result.current.project?.currentPhase).toBe("B");
  });
});
