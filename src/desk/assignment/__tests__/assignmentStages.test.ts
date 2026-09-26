import { describe, it, expect } from "vitest";
import {
  ASSIGNMENT_STAGES,
  LEGACY_ASSIGNMENT_STAGES,
  ASSIGNMENT_TYPE_LABELS,
  COMMON_COMMAND_VERBS,
  normalizeAssignmentStage,
  type AssignmentStage,
} from "../types";

describe("Assignment Stages & Domain Taxonomy", () => {
  it("defines exactly 5 guided academic stages in correct progression", () => {
    expect(ASSIGNMENT_STAGES).toHaveLength(5);
    const stageIds: AssignmentStage[] = ASSIGNMENT_STAGES.map((s) => s.id);
    expect(stageIds).toEqual([
      "deconstruct",
      "thesis_budget",
      "peel_matrix",
      "citations",
      "audit_export",
    ]);
  });

  it("maintains backward-compatible legacy stages and normalizer", () => {
    expect(LEGACY_ASSIGNMENT_STAGES).toHaveLength(8);
    expect(normalizeAssignmentStage("understand")).toBe("deconstruct");
    expect(normalizeAssignmentStage("plan")).toBe("thesis_budget");
    expect(normalizeAssignmentStage("structure")).toBe("thesis_budget");
    expect(normalizeAssignmentStage("think")).toBe("peel_matrix");
    expect(normalizeAssignmentStage("draft")).toBe("peel_matrix");
    expect(normalizeAssignmentStage("research")).toBe("citations");
    expect(normalizeAssignmentStage("evidence")).toBe("citations");
    expect(normalizeAssignmentStage("final")).toBe("audit_export");
    expect(normalizeAssignmentStage("deconstruct")).toBe("deconstruct");
  });

  it("provides comprehensive command verb mappings for academic prompts", () => {
    expect(COMMON_COMMAND_VERBS["critically discuss"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["evaluate"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["analyse"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["compare"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["assess"]).toBeDefined();
    expect(COMMON_COMMAND_VERBS["argue"]).toBeDefined();

    expect(COMMON_COMMAND_VERBS["critically discuss"].definition).toContain("balanced");
    expect(COMMON_COMMAND_VERBS["evaluate"].keyAction).toContain("Judge strengths");
  });

  it("supports diverse assignment formats beyond standard journal templates", () => {
    expect(ASSIGNMENT_TYPE_LABELS.essay).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.report).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.case_study).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.literature_review).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.annotated_bibliography).toBeDefined();
    expect(ASSIGNMENT_TYPE_LABELS.reflection).toBeDefined();
  });
});
