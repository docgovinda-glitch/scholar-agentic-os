import React, { lazy } from 'react';
import type { ProjectView } from '../types';
import type { ResearchStage } from './types';

export interface ResearchStageProps {
  stage: ResearchStage;
  projectId: string;
  project?: ProjectView | null;
  onSaved?: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}

// Lazy load all stages with strict typing (Zero-any policy)
export const StageRegistry = {
  definition: lazy(() => import('./stages/DefinitionStage')),
  literature: lazy(() => import('./stages/LiteratureStage')),
  gap_identification: lazy(() => import('./stages/GapIdentificationStage')),
  gap_selection: lazy(() => import('./stages/GapSelectionStage')),
  title_selection: lazy(() => import('./stages/TitleSelectionStage')),
  title_lock: lazy(() => import('./stages/TitleLockStage')),
  vault_sources: lazy(() => import('./stages/VaultSourcesStage')),
  additional_data: lazy(() => import('./stages/AdditionalDataStage')),
  evidence_extraction: lazy(() => import('./stages/EvidenceExtractionStage')),
  external_research: lazy(() => import('./stages/ExternalResearchStage')),
  source_approval_vault: lazy(() => import('./stages/SourceApprovalStage')),
  source_approval_external: lazy(() => import('./stages/SourceApprovalStage')),
  evidence_analysis: lazy(() => import('./stages/EvidenceAnalysisStage')),
  manual_review: lazy(() => import('./stages/ManualReviewStage')),
  journal_discovery: lazy(() => import('./stages/JournalDiscoveryStage')),
  journal_requirements: lazy(() => import('./stages/JournalRequirementsStage')),
  draft: lazy(() => import('./stages/DraftStage')),
  citation_audit: lazy(() => import('./stages/CitationAuditStage')),
  originality_check: lazy(() => import('./stages/OriginalityCheckStage')),
  draft_preview: lazy(() => import('./stages/DraftPreviewStage')),
  peer_review: lazy(() => import('./stages/PeerReviewStage')),
  revision: lazy(() => import('./stages/RevisionStage')),
  final_editor: lazy(() => import('./stages/FinalEditorStage')),
  publication_readiness: lazy(() => import('./stages/PublicationReadinessStage')),
  export: lazy(() => import('./stages/ExportStage'))
};
