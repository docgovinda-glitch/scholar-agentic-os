// @vitest-environment jsdom
//
// useProjectPersistence.ts's updateProject() closed over the current
// render's `project` value. Two calls in the same tick (no render between
// them — e.g. ManuscriptDraftingWorkspace.tsx's draftSection(): saveVersion()
// calls updateProject({ versions }), then updateProject({ sections }) runs
// immediately after) silently dropped the first call's fields, because the
// second call rebuilt `{ ...project, ...newFields }` from the pre-first-call
// project. Confirmed as a real, currently-occurring bug, not hypothetical —
// every real AI-drafted section in that workflow was losing its own
// version-history checkpoint the moment it was saved.

import { describe, it, expect, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useState } from "react";
import { useProjectPersistence } from "../useProjectPersistence";
import { DEFAULT_STATE, PaperProject } from "../../types";

// jsdom's window.localStorage isn't aliased onto globalThis by default in
// this jsdom/vitest combination — same quirk already worked around in
// AIControlCenter.test.tsx.
Object.defineProperty(globalThis, "localStorage", {
  value: (globalThis as any).jsdom.window.localStorage,
  configurable: true,
});

function setup(initialProject: PaperProject) {
  return renderHook(() => {
    const [project, setProject] = useState<PaperProject | null>(initialProject);
    const [allProjects, setAllProjects] = useState<PaperProject[]>([]);
    const [viewMode, setViewMode] = useState<"dashboard" | "workspace">("workspace");
    const [activeTab, setActiveTab] = useState("workspace");
    const persistence = useProjectPersistence("testuser", project, setProject, setAllProjects, allProjects, setViewMode, setActiveTab);
    return { project, persistence };
  });
}

beforeEach(() => {
  localStorage.clear();
});

describe("useProjectPersistence — updateProject race (characterization, now fixed)", () => {
  it("keeps fields from BOTH calls when updateProject is invoked twice synchronously in the same tick, with no render in between", () => {
    const initial: PaperProject = { ...DEFAULT_STATE("testuser"), versions: [] };
    localStorage.setItem(
      "phd_profile_state_testuser",
      JSON.stringify({ username: "testuser", projectState: initial, projects: [initial] })
    );

    const { result } = setup(initial);

    act(() => {
      result.current.persistence.updateProject({ versions: [{ id: "v1", timestamp: "t", phase: "F", data: {}, description: "d" }] });
      result.current.persistence.updateProject({ sections: { Introduction: "Real text." } });
    });

    // Both fields must survive — the second call must not have overwritten
    // the first call's field using a stale pre-first-call project snapshot.
    expect(result.current.project?.versions).toHaveLength(1);
    expect(result.current.project?.sections).toEqual({ Introduction: "Real text." });

    // The localStorage write (not just React state) must reflect both too.
    const saved = JSON.parse(localStorage.getItem("phd_profile_state_testuser")!);
    expect(saved.projectState.versions).toHaveLength(1);
    expect(saved.projectState.sections).toEqual({ Introduction: "Real text." });
  });

  it("keeps fields from THREE rapid calls in the same tick, in call order", () => {
    const initial: PaperProject = { ...DEFAULT_STATE("testuser") };
    localStorage.setItem(
      "phd_profile_state_testuser",
      JSON.stringify({ username: "testuser", projectState: initial, projects: [initial] })
    );

    const { result } = setup(initial);

    act(() => {
      result.current.persistence.updateProject({ title: "Title A" });
      result.current.persistence.updateProject({ field: "Field B" });
      result.current.persistence.updateProject({ methodology: "Methodology C" });
    });

    expect(result.current.project?.title).toBe("Title A");
    expect(result.current.project?.field).toBe("Field B");
    expect(result.current.project?.methodology).toBe("Methodology C");
  });

  it("still merges correctly for the normal case of one updateProject call per render (no regression)", () => {
    const initial: PaperProject = { ...DEFAULT_STATE("testuser"), title: "Original" };
    localStorage.setItem(
      "phd_profile_state_testuser",
      JSON.stringify({ username: "testuser", projectState: initial, projects: [initial] })
    );

    const { result } = setup(initial);

    act(() => {
      result.current.persistence.updateProject({ field: "New Field" });
    });

    expect(result.current.project?.title).toBe("Original");
    expect(result.current.project?.field).toBe("New Field");
  });
});
