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

  // Phase I Artifacts
  const defComplete = !!a["core_problem"];
  const litComplete = !!a["literature_review"] || !!a["literature_sources"];
  const gapIdComplete = !!a["gap_identified"] || !!a["gaps"];
  const gapSelComplete = !!a["gap_selected"];
  const titleSelComplete = !!a["title_options"] && a["title_options"].length > 0;
  const titleLockComplete = !!a["working_title"] || !!a["title"];
  
  const phase1Complete = defComplete && litComplete && gapIdComplete && gapSelComplete && titleSelComplete && titleLockComplete;

  const res: Record<ResearchStage, StageStatus> = { ...allLocked };

  // Phase I Statuses
  res.definition = defComplete ? "completed" : "active";
  res.literature = litComplete ? "completed" : defComplete ? "active" : "locked";
  res.gap_identification = gapIdComplete ? "completed" : litComplete ? "active" : "locked";
  res.gap_selection = gapSelComplete ? "completed" : gapIdComplete ? "active" : "locked";
  res.title_selection = titleSelComplete ? "completed" : gapSelComplete ? "active" : "locked";
  res.title_lock = titleLockComplete ? "completed" : titleSelComplete ? "active" : "locked";

  // Check for stale state in Phase 1 (e.g. if gap changed after title was selected)
  if (a["stale_downstream_stages"] && Array.isArray(a["stale_downstream_stages"])) {
    for (const staleStage of a["stale_downstream_stages"]) {
      if (res[staleStage as ResearchStage] === "completed") {
        res[staleStage as ResearchStage] = "stale";
      }
    }
  }

  // Phase II Statuses
  if (phase1Complete || a["vault_sources"] || a["evidence_ledger"]) {
    res.vault_sources = a["vault_sources"] ? "completed" : "active";
    res.source_approval_vault = a["source_approval_vault"] ? "completed" : "active";
    res.additional_data = a["additional_data"] ? "completed" : "active";
    res.evidence_extraction = a["evidence_extraction"] ? "completed" : "active";
    res.external_research = a["external_research"] ? "completed" : "active";
    res.source_approval_external = a["source_approval_external"] ? "completed" : "active";
    res.evidence_analysis = a["evidence_analysis"] ? "completed" : "active";
    res.manual_review = a["manual_review"] ? "completed" : "active";

    // Phase III Statuses
    res.journal_discovery = a["journal_discovery"] ? "completed" : "active";
    res.journal_requirements = a["journal_requirements"] ? "completed" : "active";
    res.draft = project.hasDocument ? "completed" : "active";
    res.citation_audit = a["citation_audit"] ? "completed" : "active";
    res.originality_check = a["originality_check"] ? "completed" : "active";
    res.draft_preview = a["draft_preview"] ? "completed" : "active";

    // Phase IV Statuses
    res.peer_review = (a["peer_review"] || a["peer_review_history"]) ? "completed" : "active";
    res.revision = a["revision"] ? "completed" : "active";

    // Phase V Statuses
    res.final_editor = a["final_editor"] ? "completed" : "active";
    res.publication_readiness = a["publication_readiness"] ? "completed" : "active";
    res.export = a["export"] ? "completed" : "active";
  }

  return res;
}
