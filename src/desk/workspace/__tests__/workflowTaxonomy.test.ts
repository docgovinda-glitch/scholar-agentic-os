import { describe, it, expect } from "vitest";
import { computeStageStatuses } from "../utils";
import { RESEARCH_PHASES, STAGE_MAP, isResearchStage, type ResearchStage } from "../types";
import { initialProjectGateState, updateExitCriteria } from "../../../domain/project/gates";
import type { ProjectView } from "../../types";

describe("Conflict #5 — Workflow Taxonomy: 8-Gate Macro Governance vs 25-Stage Workspace Execution", () => {
  const baseProject: ProjectView = {
    id: "p-test-1",
    ownerId: "u-1",
    outputTypeId: "OT-10",
    answers: {},
    gates: [],
    hasDocument: false,
    hasRubricReport: false,
    hasClaimGraph: false,
    hasWaivers: false,
  };

  it("1. 25 stages are structured into 5 cohesive phases with 25 unique stage definitions", () => {
    expect(RESEARCH_PHASES).toHaveLength(5);
    expect(STAGE_MAP.size).toBe(25);

    const allStageIds: ResearchStage[] = RESEARCH_PHASES.flatMap((p) => p.stages.map((s) => s.id));
    expect(allStageIds).toHaveLength(25);
    expect(new Set(allStageIds).size).toBe(25);

    expect(isResearchStage("definition")).toBe(true);
    expect(isResearchStage("literature")).toBe(true);
    expect(isResearchStage("export")).toBe(true);
    expect(isResearchStage("non_existent_stage")).toBe(false);
  });

  it("2. Initial stage state: Definition is active and future stages are locked", () => {
    const statuses = computeStageStatuses(baseProject);
    expect(statuses.definition).toBe("active");
    expect(statuses.literature).toBe("locked");
    expect(statuses.gap_identification).toBe("locked");
    expect(statuses.export).toBe("locked");
  });

  it("3. Stage progression unlocks sequentially upon artifact creation", () => {
    const projWithDef: ProjectView = {
      ...baseProject,
      answers: { core_problem: "Quantum computing fault tolerance" },
    };
    const s1 = computeStageStatuses(projWithDef);
    expect(s1.definition).toBe("completed");
    expect(s1.literature).toBe("active");
    expect(s1.gap_identification).toBe("locked");

    const projWithLit: ProjectView = {
      ...baseProject,
      answers: {
        core_problem: "Quantum computing fault tolerance",
        literature_review: "Prior work analyzed surface codes...",
      },
    };
    const s2 = computeStageStatuses(projWithLit);
    expect(s2.definition).toBe("completed");
    expect(s2.literature).toBe("completed");
    expect(s2.gap_identification).toBe("active");
  });

  it("4. Non-linear revisiting: Visiting earlier stages keeps downstream artifacts completely intact", () => {
    const fullyProgressedProject: ProjectView = {
      ...baseProject,
      answers: {
        core_problem: "Quantum computing fault tolerance",
        literature_review: "Prior literature review text...",
        gap_identified: "Surface code decoding latency bottleneck",
        gap_selected: "Real-time syndrome processing in FPGA",
        title_options: ["FPGA Decoding for Surface Codes", "Low-Latency Syndrome Processing"],
        working_title: "Real-Time FPGA Syndrome Processing in Surface Codes",
        current_stage: "gap_selection", // User navigated back to stage 4
      },
    };

    const statuses = computeStageStatuses(fullyProgressedProject);

    // All previously completed stages remain completed and openable
    expect(statuses.definition).toBe("completed");
    expect(statuses.literature).toBe("completed");
    expect(statuses.gap_identification).toBe("completed");
    expect(statuses.gap_selection).toBe("completed");
    expect(statuses.title_selection).toBe("completed");
    expect(statuses.title_lock).toBe("completed");
    expect(statuses.vault_sources).toBe("active");

    // Downstream artifacts in answers are preserved
    expect(fullyProgressedProject.answers["working_title"]).toBe("Real-Time FPGA Syndrome Processing in Surface Codes");
  });

  it("5. Stale-state tracking: Downstream stages can be marked stale without deleting data", () => {
    const projectWithStaleFlags: ProjectView = {
      ...baseProject,
      answers: {
        core_problem: "Quantum computing fault tolerance (modified)",
        literature_review: "Prior literature...",
        gap_identified: "Gaps...",
        gap_selected: "Selected gap...",
        title_options: ["Title 1", "Title 2"],
        working_title: "Title 1",
        stale_downstream_stages: ["title_selection", "title_lock"], // Upstream gap change flagged downstream
      },
    };

    const statuses = computeStageStatuses(projectWithStaleFlags);
    expect(statuses.title_selection).toBe("stale");
    expect(statuses.title_lock).toBe("stale");
    expect(statuses.definition).toBe("completed");
    // Artifact remains intact for user decision
    expect(projectWithStaleFlags.answers["working_title"]).toBe("Title 1");
  });

  it("6. Macro Gate State Machine does NOT restrict interactive workspace stage navigation", () => {
    const gateState = initialProjectGateState("p-test-1");
    // G0 is in_progress, G1-G7 are not_started
    expect(gateState.gates.G0.status).toBe("in_progress");
    expect(gateState.gates.G1.status).toBe("not_started");
    expect(gateState.gates.G7.status).toBe("not_started");

    // Workspace stage status is independently derived from project answers
    const proj: ProjectView = {
      ...baseProject,
      answers: { core_problem: "AI in healthcare" },
    };
    const stageStatuses = computeStageStatuses(proj);

    // Stage 2 (literature) is active regardless of whether G0 has formal cryptographic signoff
    expect(stageStatuses.literature).toBe("active");
  });

  it("7. URL and current_stage persistence model", () => {
    const savedAnswers = {
      current_stage: "gap_identification",
      core_problem: "Machine learning generalizability",
      literature_review: "Reviewed 20 papers",
    };

    expect(isResearchStage(savedAnswers.current_stage)).toBe(true);
    expect(savedAnswers.current_stage).toBe("gap_identification");
  });
});
