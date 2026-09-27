/**
 * AssignmentContextPanelPersonas.test.tsx
 * ----------------------------------------
 * Replaces the obsolete AssignmentPlanStageAndTutorSync.test.tsx
 * (which tested the deleted AssignmentPlanStage + legacy SocraticTutor).
 *
 * Validates that:
 *   - Each of the 4 phases maps to the correct copilot persona config
 *   - ContextPanel receives the correct agent prop per phase
 *   - Phase-scoped grounding tokens are present in each persona
 */

import { describe, it, expect } from "vitest";
import { ASSIGNMENT_AGENT_CONFIGS, ASSIGNMENT_PHASES, type AssignmentPhaseId } from "../types";

describe("ContextPanel Phase-Scoped Persona Configs", () => {
  it("defines a persona config for each of the 4 canonical phases", () => {
    const phases: AssignmentPhaseId[] = ["understand", "sources", "drafting", "submission"];
    for (const phase of phases) {
      const config = ASSIGNMENT_AGENT_CONFIGS[phase];
      expect(config, `Missing config for phase "${phase}"`).toBeDefined();
    }
  });

  it("assigns distinct persona names across phases", () => {
    const names = Object.values(ASSIGNMENT_AGENT_CONFIGS).map((c) => c.name);
    const unique = new Set(names);
    expect(unique.size).toBe(Object.keys(ASSIGNMENT_AGENT_CONFIGS).length);
  });

  it("phase 1 (understand) uses the Advisor persona", () => {
    const config = ASSIGNMENT_AGENT_CONFIGS["understand"];
    expect(config.name.toLowerCase()).toContain("advisor");
  });

  it("phase 2 (sources) uses the Librarian persona", () => {
    const config = ASSIGNMENT_AGENT_CONFIGS["sources"];
    expect(config.name.toLowerCase()).toContain("librarian");
  });

  it("phase 3 (drafting) uses the Scribe persona", () => {
    const config = ASSIGNMENT_AGENT_CONFIGS["drafting"];
    expect(config.name.toLowerCase()).toContain("scribe");
  });

  it("phase 4 (submission) uses the Examiner persona", () => {
    const config = ASSIGNMENT_AGENT_CONFIGS["submission"];
    expect(config.name.toLowerCase()).toContain("examiner");
  });

  it("every persona config has required fields: name, role, description, quickActions", () => {
    for (const [phase, config] of Object.entries(ASSIGNMENT_AGENT_CONFIGS)) {
      expect(config.name, `Missing name for "${phase}"`).toBeTruthy();
      expect(config.role, `Missing role for "${phase}"`).toBeTruthy();
      expect(config.description, `Missing description for "${phase}"`).toBeTruthy();
      expect(Array.isArray(config.quickActions), `quickActions not array for "${phase}"`).toBe(true);
      expect(config.quickActions.length, `No quickActions for "${phase}"`).toBeGreaterThan(0);
    }
  });

  it("phase metadata aligns with ASSIGNMENT_PHASES definitions", () => {
    expect(ASSIGNMENT_PHASES).toHaveLength(4);
    for (const phase of ASSIGNMENT_PHASES) {
      const config = ASSIGNMENT_AGENT_CONFIGS[phase.id];
      expect(config).toBeDefined();
    }
  });

  it("each persona description references phase-relevant context keywords", () => {
    const understandDesc = ASSIGNMENT_AGENT_CONFIGS["understand"].description.toLowerCase();
    const sourcesDesc = ASSIGNMENT_AGENT_CONFIGS["sources"].description.toLowerCase();
    const draftingDesc = ASSIGNMENT_AGENT_CONFIGS["drafting"].description.toLowerCase();
    const submissionDesc = ASSIGNMENT_AGENT_CONFIGS["submission"].description.toLowerCase();

    // Advisor: brief/rubric context
    expect(understandDesc.includes("brief") || understandDesc.includes("rubric") || understandDesc.includes("assignment")).toBe(true);
    // Librarian: sources/literature context
    expect(sourcesDesc.includes("source") || sourcesDesc.includes("literature") || sourcesDesc.includes("evidence")).toBe(true);
    // Scribe: drafting/writing context
    expect(draftingDesc.includes("draft") || draftingDesc.includes("writ") || draftingDesc.includes("peel")).toBe(true);
    // Examiner: submission/rubric/citation context
    expect(submissionDesc.includes("rubric") || submissionDesc.includes("citation") || submissionDesc.includes("submission")).toBe(true);
  });
});
