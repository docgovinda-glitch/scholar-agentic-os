import { useCallback, useEffect, useState } from "react";
import { getDocument, getOutputTypeSpec, getProject, getRubric } from "../api";
import { UnauthenticatedError } from "../api";
import { useDeskSession } from "../useDeskSession";
import type { CanonicalDocument, OutputTypeSpec, ProjectView, RubricReport } from "../types";
import type { ResearchStage, StageStatus } from "./types";
import StageNavigation from "./StageNavigation";
import ContextPanel from "./ContextPanel";
import DefinitionStage from "./stages/DefinitionStage";
import PlaceholderStage from "./stages/PlaceholderStage";
import LiteratureStage from "./stages/LiteratureStage";
import GapIdentificationStage from "./stages/GapIdentificationStage";
import GapSelectionStage from "./stages/GapSelectionStage";
import TitleSelectionStage from "./stages/TitleSelectionStage";
import TitleLockStage from "./stages/TitleLockStage";
import VaultSourcesStage from "./stages/VaultSourcesStage";
import AdditionalDataStage from "./stages/AdditionalDataStage";
import EvidenceExtractionStage from "./stages/EvidenceExtractionStage";
import ExternalResearchStage from "./stages/ExternalResearchStage";
import SourceApprovalStage from "./stages/SourceApprovalStage";
import EvidenceAnalysisStage from "./stages/EvidenceAnalysisStage";
import ManualReviewStage from "./stages/ManualReviewStage";
import JournalDiscoveryStage from "./stages/JournalDiscoveryStage";
import JournalRequirementsStage from "./stages/JournalRequirementsStage";
import DraftStage from "./stages/DraftStage";
import CitationAuditStage from "./stages/CitationAuditStage";
import OriginalityCheckStage from "./stages/OriginalityCheckStage";
import DraftPreviewStage from "./stages/DraftPreviewStage";
import PeerReviewStage from "./stages/PeerReviewStage";
import RevisionStage from "./stages/RevisionStage";
import FinalEditorStage from "./stages/FinalEditorStage";
import PublicationReadinessStage from "./stages/PublicationReadinessStage";
import ExportStage from "./stages/ExportStage";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

/**
 * ResearchWorkspace — the top-level shell for Journal Article projects.
 *
 * Replaces DeskShell for OT-10 (Journal Article) projects with a proper
 * 10-stage research pipeline workspace using a 3-zone layout:
 *   Left: StageNavigation (persistent pipeline rail)
 *   Center: Current stage content (forms, editor, evidence queue, etc.)
 *   Right: ContextPanel (dynamic AI agent for the current stage)
 *
 * Non-journal-article projects continue to use DeskShell unchanged.
 */
export default function ResearchWorkspace({
  projectId,
  initialStage,
  onStageChange,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  projectId: string;
  initialStage: ResearchStage | null;
  onStageChange: (stage: ResearchStage, options?: { replace?: boolean }) => void;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const session = useDeskSession();
  const [project, setProject] = useState<ProjectView | null>(null);
  const [document, setDocument] = useState<CanonicalDocument | null>(null);
  const [rubric, setRubric] = useState<RubricReport | null>(null);
  const [outputType, setOutputType] = useState<OutputTypeSpec | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [contextPanelOpen, setContextPanelOpen] = useState(true);

  const currentStage = initialStage ?? "definition";

  const load = useCallback(async () => {
    try {
      const [proj, rub, doc] = await Promise.all([
        getProject(projectId),
        getRubric(projectId),
        getDocument(projectId),
      ]);
      setProject(proj);
      setDocument(doc);
      setRubric(rub);
      setOutputType(await getOutputTypeSpec(proj.outputTypeId).catch(() => null));

      if (initialStage === null) {
        // Land on the first incomplete stage
        onStageChange("definition", { replace: true });
      }
    } catch (e) {
      setError(
        e instanceof UnauthenticatedError
          ? "Your session has expired. Sign in again to continue."
          : (e as Error).message
      );
    }
  }, [projectId, onStageChange, initialStage]);

  useEffect(() => { load(); }, [load]);

  // Compute stage statuses from project state
  const stageStatuses = computeStageStatuses(project);

  if (error) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center gap-4 bg-[color:var(--surface-canvas)] p-6 text-center">
        <div className="w-16 h-16 rounded-full bg-[color:var(--state-danger-subtle)] flex items-center justify-center mb-2">
          <svg className="w-8 h-8 text-[color:var(--state-danger)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>
        <p role="alert" className="max-w-md text-sm text-[color:var(--state-danger)] font-medium">{error}</p>
        {onClose && (
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-[color:var(--border-control)] px-5 py-2.5 text-sm font-medium text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
          >
            Back to your projects
          </button>
        )}
      </div>
    );
  }

  if (!project) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)]">
        <div className="flex items-center gap-3">
          <div className="spinner" />
          <span className="text-sm text-[color:var(--text-muted)] font-medium">Loading research workspace…</span>
        </div>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      {/* Header */}
      <header className="border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]/80 backdrop-blur-md z-10 shrink-0">
        <div className="flex items-center justify-between px-4 py-3 gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {onClose && (
              <button
                type="button"
                onClick={onClose}
                title="Back to projects"
                className="shrink-0 rounded-[var(--radius-sm)] p-2 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
              </button>
            )}
            <ScholarCoreLogo size="sm" withText className="text-[color:var(--text-primary)]" />
            <div className="w-px h-5 bg-[color:var(--border-subtle)] mx-1" />
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-[color:var(--text-primary)] truncate">
                {project.answers?.["working_title"] || project.answers?.["title"] || outputType?.label || "Journal Article"}
              </h1>
              <p className="text-[10px] text-[color:var(--text-muted)]">
                {outputType?.label ?? project.outputTypeId}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {onOpenVault && (
              <button type="button" onClick={onOpenVault} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer">
                Vault
              </button>
            )}
            {onOpenAiAccess && (
              <button type="button" onClick={onOpenAiAccess} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer">
                AI
              </button>
            )}
            {onOpenAccountSettings && (
              <button type="button" onClick={onOpenAccountSettings} className="shrink-0 rounded-full px-3 py-1.5 text-xs font-medium text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer">
                Settings
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Three-zone workspace */}
      <div className="flex flex-1 min-h-0">
        {/* Left: Stage Navigation */}
        <StageNavigation
          currentStage={currentStage}
          stageStatuses={stageStatuses}
          onStageChange={(stage) => onStageChange(stage)}
        />

        {/* Center: Current Stage Content */}
        <div className="flex-1 flex flex-col min-w-0 bg-[color:var(--surface-canvas)]">
          {renderStage(currentStage, projectId, project, setProject)}
        </div>

        {/* Right: Context Panel */}
        <ContextPanel
          currentStage={currentStage}
          isOpen={contextPanelOpen}
          onToggle={() => setContextPanelOpen(!contextPanelOpen)}
        />
      </div>

      {/* Status bar */}
      <div className="shrink-0 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-4 py-1.5 flex items-center justify-between text-[10px] text-[color:var(--text-muted)]">
        <div className="flex items-center gap-4">
          <span>Stage: <strong className="text-[color:var(--text-secondary)]">{currentStage}</strong></span>
          <span>·</span>
          <span>Gates: {project.gates.filter((g) => g.status === "signed_off").length}/{project.gates.length} passed</span>
        </div>
        <div className="flex items-center gap-4">
          <span>Intake: {Math.round(project.intakeCompleteness * 100)}%</span>
          {project.hasDocument && <span>Draft: ready</span>}
        </div>
      </div>
    </div>
  );
}

function renderStage(
  stage: ResearchStage,
  projectId: string,
  project: ProjectView,
  setProject: (p: ProjectView) => void,
) {
  switch (stage) {
    case "definition":
      return (
        <DefinitionStage
          projectId={projectId}
          project={project}
          onSaved={(updated) => setProject(updated)}
        />
      );
    case "literature":
      return <LiteratureStage stage={stage} projectId={projectId} />;
    case "gap_identification":
      return <GapIdentificationStage stage={stage} projectId={projectId} />;
    case "gap_selection":
      return (
        <GapSelectionStage
          stage={stage}
          projectId={projectId}
          project={project}
          onSaved={(updated) => setProject(updated)}
        />
      );
    case "title_selection":
      return <TitleSelectionStage stage={stage} projectId={projectId} />;
    case "title_lock":
      return <TitleLockStage stage={stage} projectId={projectId} />;
    case "vault_sources":
      return <VaultSourcesStage stage={stage} projectId={projectId} />;
    case "additional_data":
      return <AdditionalDataStage stage={stage} projectId={projectId} />;
    case "evidence_extraction":
      return <EvidenceExtractionStage stage={stage} projectId={projectId} />;
    case "external_research":
      return <ExternalResearchStage stage={stage} projectId={projectId} />;
    case "source_approval_external":
      return <SourceApprovalStage stage={stage} projectId={projectId} />;
    case "evidence_analysis":
      return <EvidenceAnalysisStage stage={stage} projectId={projectId} />;
    case "manual_review":
      return <ManualReviewStage stage={stage} projectId={projectId} />;
    case "journal_discovery":
      return <JournalDiscoveryStage stage={stage} projectId={projectId} />;
    case "journal_requirements":
      return <JournalRequirementsStage stage={stage} projectId={projectId} />;
    case "draft":
      return <DraftStage stage={stage} projectId={projectId} />;
    case "citation_audit":
      return <CitationAuditStage stage={stage} projectId={projectId} />;
    case "originality_check":
      return <OriginalityCheckStage stage={stage} projectId={projectId} />;
    case "draft_preview":
      return <DraftPreviewStage stage={stage} projectId={projectId} />;
    case "peer_review":
      return <PeerReviewStage stage={stage} projectId={projectId} />;
    case "revision":
      return <RevisionStage stage={stage} projectId={projectId} />;
    case "final_editor":
      return <FinalEditorStage stage={stage} projectId={projectId} />;
    case "publication_readiness":
      return <PublicationReadinessStage stage={stage} projectId={projectId} />;
    case "export":
      return <ExportStage stage={stage} projectId={projectId} />;
    default:
      return <PlaceholderStage stage={stage} />;
  }
}

function computeStageStatuses(project: ProjectView | null): Record<ResearchStage, StageStatus> {
  const allLocked: Record<ResearchStage, StageStatus> = {
    definition: "active",
    literature: "locked", gap_identification: "locked", gap_selection: "locked", title_selection: "locked", title_lock: "locked",
    vault_sources: "locked", source_approval_vault: "locked", additional_data: "locked", evidence_extraction: "locked", external_research: "locked", source_approval_external: "locked", evidence_analysis: "locked", manual_review: "locked",
    journal_discovery: "locked", journal_requirements: "locked", draft: "locked", citation_audit: "locked", originality_check: "locked", draft_preview: "locked",
    peer_review: "locked", revision: "locked",
    final_editor: "locked", publication_readiness: "locked", export: "locked",
  };

  if (!project) return allLocked;

  const g0Done = project.gates.some((g) => g.gate === "G0" && g.status === "signed_off");
  const g1Done = project.gates.some((g) => g.gate === "G1" && g.status === "signed_off");
  const g2Done = project.gates.some((g) => g.gate === "G2" && g.status === "signed_off");
  const g5Done = project.gates.some((g) => g.gate === "G5" && g.status === "signed_off");
  const g6Done = project.gates.some((g) => g.gate === "G6" && g.status === "signed_off");

  // Phase 1 is always available, progressively unlocked.
  // We'll mark completed stages if the gate is done, else available.
  const p1 = g0Done ? "completed" : "available";
  const p2 = g0Done ? (g2Done ? "completed" : "available") : "locked";
  const p3 = g2Done ? "available" : "locked"; // Need evidence to draft
  const p4 = project.hasDocument ? (g5Done ? "completed" : "available") : "locked";
  const p5 = g5Done ? (g6Done ? "completed" : "available") : "locked";

  return {
    definition: g0Done ? "completed" : "active",
    literature: p1,
    gap_identification: p1,
    gap_selection: p1,
    title_selection: p1,
    title_lock: p1,
    
    vault_sources: p2,
    source_approval_vault: p2,
    additional_data: p2,
    evidence_extraction: p2,
    external_research: p2,
    source_approval_external: p2,
    evidence_analysis: p2,
    manual_review: p2,
    
    journal_discovery: p3,
    journal_requirements: g1Done ? "completed" : p3,
    draft: p3,
    citation_audit: p3,
    originality_check: p3,
    draft_preview: p3,
    
    peer_review: p4,
    revision: p4,
    
    final_editor: p5,
    publication_readiness: g6Done ? "completed" : p5,
    export: g6Done ? "available" : "locked",
  };
}
