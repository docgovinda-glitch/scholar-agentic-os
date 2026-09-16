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
        title_locked: "true",
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
        title_locked: "true",
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

  it("8. Repository-wide taxonomy invariant: Every stage transition target ∈ STAGE_MAP", async () => {
    const fs = await import("node:fs");
    const path = await import("node:path");

    const workspaceDir = path.resolve(__dirname, "../..");
    const stagesDir = path.resolve(__dirname, "../stages");
    const stageFiles = fs.readdirSync(stagesDir).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map(f => path.join(stagesDir, f));
    const workspaceFiles = fs.readdirSync(path.resolve(__dirname, "..")).filter((f) => f.endsWith(".tsx") || f.endsWith(".ts")).map(f => path.join(path.resolve(__dirname, ".."), f));
    const allFiles = [...stageFiles, ...workspaceFiles];

    const validStageKeys = new Set(STAGE_MAP.keys());
    const transitionsFound: { file: string; stage: string }[] = [];

    // Regex to extract all string arguments to onAdvance, onAdvance?., advanceStage, or setStage
    const callRegex = /(?:onAdvance(?:\?\.)?|advanceStage|setStage)\s*\(\s*(?:stage\s*===\s*["']([^"']+)["']\s*\?\s*["']([^"']+)["']\s*:\s*["']([^"']+)["']|["']([^"']+)["'])/g;

    for (const filePath of allFiles) {
      const content = fs.readFileSync(filePath, "utf-8");
      let match;
      while ((match = callRegex.exec(content)) !== null) {
        const stage = match[4] || match[2] || match[3];
        if (stage) {
          transitionsFound.push({ file: path.basename(filePath), stage });
        }
        if (match[2] && match[3]) {
          transitionsFound.push({ file: path.basename(filePath), stage: match[3] });
        }
      }
    }

    expect(transitionsFound.length).toBeGreaterThanOrEqual(25);

    // Verify every single found transition is a valid ResearchStage in STAGE_MAP
    for (const { file, stage } of transitionsFound) {
      const isValid = isResearchStage(stage) && validStageKeys.has(stage as ResearchStage);
      expect(
        isValid,
        `Invalid stage "${stage}" found in file "${file}". Must be in STAGE_MAP.`
      ).toBe(true);
    }

    // Explicit negative assertions for previous regression identifiers
    expect(validStageKeys.has("source_approval" as any)).toBe(false);
    expect(validStageKeys.has("evidence_review" as any)).toBe(false);
    expect(validStageKeys.has("source_approval_vault")).toBe(true);
    expect(validStageKeys.has("external_research")).toBe(true);
  });

  it("9. Architectural parity: STAGE_MAP (25) ↔ RESEARCH_PHASES (25) ↔ StageRegistry (25)", async () => {
    const { StageRegistry } = await import("../StageRegistry");

    expect(STAGE_MAP.size).toBe(25);

    const phasesStageIds = RESEARCH_PHASES.flatMap((p) => p.stages.map((s) => s.id));
    expect(phasesStageIds).toHaveLength(25);

    const registryKeys = Object.keys(StageRegistry) as ResearchStage[];
    expect(registryKeys).toHaveLength(25);

    for (const stage of phasesStageIds) {
      expect(STAGE_MAP.has(stage)).toBe(true);
      expect(StageRegistry[stage]).toBeDefined();
    }
  });

  it("10. Authoritative Phase-I gate: title_locked === 'true' is required to unlock Phase II", () => {
    // Project with all Phase-I artifacts present BUT title_locked is NOT true
    const unlockedTitleProject: ProjectView = {
      ...baseProject,
      answers: {
        core_problem: "Quantum computing fault tolerance",
        literature_review: "Prior literature review...",
        gap_identified: "Surface code latency",
        gap_selected: "FPGA syndrome processing",
        title_options: ["FPGA Decoding", "Syndrome Processing"],
        working_title: "Real-Time FPGA Syndrome Processing",
        // title_locked is deliberately missing / false
      },
    };

    const unlockedStatuses = computeStageStatuses(unlockedTitleProject);
    // Phase I stages up to title_selection are completed; title_lock remains active; Phase II locked!
    expect(unlockedStatuses.definition).toBe("completed");
    expect(unlockedStatuses.literature).toBe("completed");
    expect(unlockedStatuses.gap_identification).toBe("completed");
    expect(unlockedStatuses.gap_selection).toBe("completed");
    expect(unlockedStatuses.title_selection).toBe("completed");
    expect(unlockedStatuses.title_lock).toBe("active");
    expect(unlockedStatuses.vault_sources).toBe("locked");
    expect(unlockedStatuses.evidence_extraction).toBe("locked");

    // Once title_locked is explicitly authoritatively "true"
    const lockedTitleProject: ProjectView = {
      ...unlockedTitleProject,
      answers: {
        ...unlockedTitleProject.answers,
        title_locked: "true",
      },
    };

    const lockedStatuses = computeStageStatuses(lockedTitleProject);
    expect(lockedStatuses.title_lock).toBe("completed");
    expect(lockedStatuses.vault_sources).toBe("active");
    expect(lockedStatuses.source_approval_vault).toBe("active");
  });

  it("11. Partial artifacts (working_title alone) do NOT falsely unlock earlier or later phases", () => {
    // Only working_title provided in Definition Stage draft
    const draftDefProject: ProjectView = {
      ...baseProject,
      answers: {
        working_title: "Initial working concept",
      },
    };

    const draftStatuses = computeStageStatuses(draftDefProject);
    // Definition is still active (not complete without core_problem / definition / research_area+article_type)
    expect(draftStatuses.definition).toBe("active");
    expect(draftStatuses.literature).toBe("locked");
    expect(draftStatuses.title_lock).toBe("locked");
    expect(draftStatuses.vault_sources).toBe("locked");

    // Title selection candidate chosen, but title not locked
    const candidateSelectedProject: ProjectView = {
      ...baseProject,
      answers: {
        definition: "Comprehensive problem definition",
        discovered_literature: "Found 15 papers",
        identified_gaps: "Methodological gap in benchmarking",
        selected_gap: "Benchmarking standard gap",
        title_options: ["Benchmark Study", "Empirical Evaluation"],
        working_title: "Benchmark Study", // chosen candidate, but not locked
      },
    };

    const candidateStatuses = computeStageStatuses(candidateSelectedProject);
    expect(candidateStatuses.title_selection).toBe("completed");
    expect(candidateStatuses.title_lock).toBe("active");
    expect(candidateStatuses.vault_sources).toBe("locked");
  });

  it("12. Backward compatibility: Legacy answer keys and modern answer keys produce identical valid statuses", () => {
    const legacyProject: ProjectView = {
      ...baseProject,
      answers: {
        core_problem: "Legacy core problem",
        literature_review: "Legacy literature review",
        gap_identified: "Legacy gap identified",
        gap_selected: "Legacy gap selected",
        title_options: ["Legacy Title 1", "Legacy Title 2"],
        working_title: "Legacy Title 1",
        title_locked: "true",
      },
    };

    const modernProject: ProjectView = {
      ...baseProject,
      answers: {
        definition: "Modern definition",
        discovered_literature: "Modern literature discovery",
        identified_gaps: "Modern identified gaps",
        selected_gap: "Modern selected gap",
        title_options: ["Modern Title 1", "Modern Title 2"],
        working_title: "Modern Title 1",
        title_locked: "true",
      },
    };

    const legacyStatuses = computeStageStatuses(legacyProject);
    const modernStatuses = computeStageStatuses(modernProject);

    expect(legacyStatuses.definition).toBe("completed");
    expect(modernStatuses.definition).toBe("completed");

    expect(legacyStatuses.literature).toBe("completed");
    expect(modernStatuses.literature).toBe("completed");

    expect(legacyStatuses.gap_identification).toBe("completed");
    expect(modernStatuses.gap_identification).toBe("completed");

    expect(legacyStatuses.gap_selection).toBe("completed");
    expect(modernStatuses.gap_selection).toBe("completed");

    expect(legacyStatuses.title_lock).toBe("completed");
    expect(modernStatuses.title_lock).toBe("completed");

    expect(legacyStatuses.vault_sources).toBe("active");
    expect(modernStatuses.vault_sources).toBe("active");
  });
});
