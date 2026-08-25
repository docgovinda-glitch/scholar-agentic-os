import { describe, it, expect } from "vitest";
import {
  ASSIGNMENT_STAGES,
  ASSIGNMENT_TYPE_LABELS,
  COMMON_COMMAND_VERBS,
  type AssignmentStage,
} from "../types";

describe("Assignment Stages & Domain Taxonomy", () => {
  it("defines exactly 8 dedicated academic stages in correct progression", () => {
    expect(ASSIGNMENT_STAGES).toHaveLength(8);
    const stageIds: AssignmentStage[] = ASSIGNMENT_STAGES.map((s) => s.id);
    expect(stageIds).toEqual([
      "understand",
      "plan",
      "research",
      "evidence",
      "think",
      "structure",
      "draft",
      "final",
    ]);
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
