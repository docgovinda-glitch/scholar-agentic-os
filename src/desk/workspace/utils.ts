import type { ProjectView } from "../types";
import type { ResearchStage, StageStatus } from "./types";

export function computeStageStatuses(project: ProjectView | null): Record<ResearchStage, StageStatus> {
  const allLocked: Record<ResearchStage, StageStatus> = {
    definition: "active",
    literature: "locked", gap_identification: "locked", gap_selection: "locked", title_selection: "locked", title_lock: "locked",
    vault_sources: "locked", source_approval_vault: "locked", additional_data: "locked", evidence_extraction: "locked", external_research: "locked", source_approval_external: "locked", evidence_analysis: "locked", manual_review: "locked",
    journal_discovery: "locked", journal_requirements: "locked", draft: "locked", citation_audit: "locked", originality_check: "locked", draft_preview: "locked",
    peer_review: "locked", revision: "locked",
    final_editor: "locked", publication_readiness: "locked", export: "locked",
  };

  if (!project) return allLocked;

  const a = project.answers || {};

  const defComplete = !!a["core_problem"];
  const litComplete = !!a["literature_review"];
  const gapIdComplete = !!a["gap_identified"];
  const gapSelComplete = !!a["gap_selected"];
  const titleSelComplete = !!a["title_options"] && a["title_options"].length > 0;
  const titleLockComplete = !!a["working_title"] || !!a["title"];
  
  const phase1Complete = defComplete && litComplete && gapIdComplete && gapSelComplete && titleSelComplete && titleLockComplete;

  const res: Record<ResearchStage, StageStatus> = { ...allLocked };

  if (defComplete) {
    res.definition = "completed";
    res.literature = "active";
  }
  if (litComplete) {
    res.literature = "completed";
    res.gap_identification = "active";
  }
  if (gapIdComplete) {
    res.gap_identification = "completed";
    res.gap_selection = "active";
  }
  if (gapSelComplete) {
    res.gap_selection = "completed";
    res.title_selection = "active";
  }
  if (titleSelComplete) {
    res.title_selection = "completed";
    res.title_lock = "active";
  }
  if (titleLockComplete) {
    res.title_lock = "completed";
  }

  if (phase1Complete) {
    res.vault_sources = "active";
    res.source_approval_vault = "active";
    res.additional_data = "active";
    res.evidence_extraction = "active";
    res.external_research = "active";
    res.source_approval_external = "active";
    res.evidence_analysis = "active";
    res.manual_review = "active";

    // Unlocking later stages assuming Phase 2 is mostly manual for now
    res.journal_discovery = "active";
    res.journal_requirements = "active";
    res.draft = "active";
    res.citation_audit = "active";
    res.originality_check = "active";
    res.draft_preview = "active";
    res.peer_review = "active";
    res.revision = "active";
    res.final_editor = "active";
    res.publication_readiness = "active";
    res.export = "active";
  }

  return res;
}
