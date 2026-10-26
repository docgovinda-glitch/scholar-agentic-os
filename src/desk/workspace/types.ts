/**
 * Research workspace types — shared across all workspace components.
 *
 * Defines the 25-stage research pipeline for Journal Article projects,
 * grouped into 5 logical phases. The stage IDs are stable identifiers used
 * in URLs, state management, and gate mapping.
 */

export type ResearchPhaseId =
  | "foundation"
  | "evidence"
  | "drafting"
  | "review"
  | "publication";

export type ResearchStage =
  | "definition"
  | "literature"
  | "gap_identification"
  | "gap_selection"
  | "title_selection"
  | "title_lock"
  | "vault_sources"
  | "source_approval_vault"
  | "additional_data"
  | "evidence_extraction"
  | "external_research"
  | "source_approval_external"
  | "evidence_analysis"
  | "manual_review"
  | "journal_discovery"
  | "journal_requirements"
  | "draft"
  | "citation_audit"
  | "originality_check"
  | "draft_preview"
  | "peer_review"
  | "revision"
  | "final_editor"
  | "publication_readiness"
  | "export";

export type StageStatus =
  | "completed"
  | "active"
  | "available"
  | "locked"
  | "warning"
  | "stale"
  | "needs_review"
  | "ai_processing"
  | "ai_waiting_approval";

export interface StageDefinition {
  id: ResearchStage;
  number: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: string; // SVG path data for a 24x24 viewBox
}

export interface PhaseDefinition {
  id: ResearchPhaseId;
  label: string;
  description: string;
  stages: StageDefinition[];
}

// Reusable SVG paths
const ICONS = {
  document: "M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z",
  search: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
  target: "M14.017 21L16.4 14.4m-13.798 4.1L21 3 8.9 16.4l-6.3-4.1L21 3",
  checkList: "M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-6 9l2 2 4-4",
  lock: "M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z",
  database: "M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4",
  checkCircle: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
  upload: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12",
  cpu: "M9 3v2m6-2v2M9 19v2m6-2v2M5 9H3m2 6H3m18-6h-2m2 6h-2M7 19h10a2 2 0 002-2V7a2 2 0 00-2-2H7a2 2 0 00-2 2v10a2 2 0 002 2zM9 9h6v6H9V9z",
  globe: "M21 12a9 9 0 01-9 9m9-9a9 9 0 00-9-9m9 9H3m9 9a9 9 0 01-9-9m9 9c1.657 0 3-4.03 3-9s-1.343-9-3-9m0 18c-1.657 0-3-4.03-3-9s1.343-9 3-9m-9 9a9 9 0 019-9",
  chart: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
  user: "M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z",
  compass: "M14.121 14.121L19 9l-5.121-5.121m-7.758 7.758L1 16l5.121 5.121", // Approximated
  book: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
  pen: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
  link: "M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1",
  shield: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
  eye: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
  review: "M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z",
  refresh: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
  wand: "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z",
  export: "M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4",
};

export const RESEARCH_PHASES: PhaseDefinition[] = [
  {
    id: "foundation",
    label: "I. Foundation",
    description: "Define boundaries and identify research gaps",
    stages: [
      { id: "definition", number: 1, label: "Research Definition", shortLabel: "Definition", description: "Define objectives and methodology", icon: ICONS.document },
      { id: "literature", number: 2, label: "Literature Discovery", shortLabel: "Literature", description: "Scholarly literature search", icon: ICONS.search },
      { id: "gap_identification", number: 3, label: "Gap Identification", shortLabel: "Identify Gaps", description: "AI identification of knowledge gaps", icon: ICONS.target },
      { id: "gap_selection", number: 4, label: "Gap Selection", shortLabel: "Select Gap", description: "Select specific gap to address", icon: ICONS.checkList },
      { id: "title_selection", number: 5, label: "Title Generation", shortLabel: "Select Title", description: "AI-generated title proposals", icon: ICONS.wand },
      { id: "title_lock", number: 6, label: "Title Lock", shortLabel: "Lock Title", description: "Finalize working title", icon: ICONS.lock },
    ]
  },
  {
    id: "evidence",
    label: "II. Evidence",
    description: "Collect, extract, and analyze data",
    stages: [
      { id: "vault_sources", number: 7, label: "Knowledge Vault", shortLabel: "Vault", description: "Pull sources from personal vault", icon: ICONS.database },
      { id: "source_approval_vault", number: 8, label: "Vault Approval", shortLabel: "Approve Vault", description: "Approve vault sources", icon: ICONS.checkCircle },
      { id: "additional_data", number: 9, label: "Primary Data", shortLabel: "Upload Data", description: "Upload primary data or documents", icon: ICONS.upload },
      { id: "evidence_extraction", number: 10, label: "AI Extraction", shortLabel: "Extract", description: "Extract claims and evidence", icon: ICONS.cpu },
      { id: "external_research", number: 11, label: "External Research", shortLabel: "Web Search", description: "Web/database gap filling", icon: ICONS.globe },
      { id: "source_approval_external", number: 12, label: "External Approval", shortLabel: "Approve Ext.", description: "Approve discovered sources", icon: ICONS.checkCircle },
      { id: "evidence_analysis", number: 13, label: "Evidence Matrix", shortLabel: "Analysis", description: "Build thematic clusters", icon: ICONS.chart },
      { id: "manual_review", number: 14, label: "Researcher Review", shortLabel: "Review", description: "Manual conclusions and synthesis", icon: ICONS.user },
    ]
  },
  {
    id: "drafting",
    label: "III. Drafting",
    description: "Select journal and draft manuscript",
    stages: [
      { id: "journal_discovery", number: 15, label: "Journal Discovery", shortLabel: "Find Journal", description: "Find suitable target journals", icon: ICONS.compass },
      { id: "journal_requirements", number: 16, label: "Journal Rules", shortLabel: "Requirements", description: "Extract submission requirements", icon: ICONS.book },
      { id: "draft", number: 17, label: "AI Draft Generation", shortLabel: "Drafting", description: "Write manuscript sections", icon: ICONS.pen },
      { id: "citation_audit", number: 18, label: "Citation Audit", shortLabel: "Citations", description: "Verify claim-evidence links", icon: ICONS.link },
      { id: "originality_check", number: 19, label: "Originality Check", shortLabel: "Originality", description: "Plagiarism and overlap check", icon: ICONS.shield },
      { id: "draft_preview", number: 20, label: "Draft Preview", shortLabel: "Preview", description: "Preview assembled manuscript", icon: ICONS.eye },
    ]
  },
  {
    id: "review",
    label: "IV. Peer Review",
    description: "AI critique and manuscript revision",
    stages: [
      { id: "peer_review", number: 21, label: "AI Peer Review", shortLabel: "Peer Review", description: "7-lens academic critique", icon: ICONS.review },
      { id: "revision", number: 22, label: "AI Revision", shortLabel: "Revision", description: "Map feedback and revise", icon: ICONS.refresh },
    ]
  },
  {
    id: "publication",
    label: "V. Publication",
    description: "Final polish and export formatting",
    stages: [
      { id: "final_editor", number: 23, label: "Final Editor", shortLabel: "Editor", description: "Manual rich-text touch-ups", icon: ICONS.document },
      { id: "publication_readiness", number: 24, label: "Readiness Check", shortLabel: "Readiness", description: "Final compliance verification", icon: ICONS.shield },
      { id: "export", number: 25, label: "Format & Export", shortLabel: "Export", description: "Word/PDF generation", icon: ICONS.export },
    ]
  }
];

// Helper to quickly look up a stage definition
export const STAGE_MAP = new Map<ResearchStage, StageDefinition>(
  RESEARCH_PHASES.flatMap(phase => phase.stages.map(stage => [stage.id, stage] as const))
);

export function isResearchStage(value: string | undefined): value is ResearchStage {
  if (!value) return false;
  return STAGE_MAP.has(value as ResearchStage);
}

/**
 * 5-Mode Journal Studio Architecture
 *
 * Mode 1: Protocol & Blueprint (Research Question, Literature Gap, Title Lock, Journal Rules, Word Budget Allocator)
 * Mode 2: Literature & Data Matrix (Multi-Portal Scholarly Discovery, Primary User Data Upload, Smart Evidence Matrix)
 * Mode 3: Manuscript Studio (Grounded TipTap 3 Split-Pane Section Drafting)
 * Mode 4: Referee & Rebuttal (5-Referee Academic Peer Review & Patch Matrix)
 * Mode 5: Audit & Submission Export (Gate G7 Pre-Flight Audit & Camera-Ready Exporter)
 */
export type JournalStudioMode =
  | "protocol"
  | "evidence"
  | "studio"
  | "referee"
  | "audit_export"
  | "audit";

export interface StudioModeDefinition {
  id: JournalStudioMode;
  number: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  primaryStage: ResearchStage;
  stages: ResearchStage[];
}

export const JOURNAL_STUDIO_MODES: StudioModeDefinition[] = [
  {
    id: "protocol",
    number: 1,
    label: "Mode 1 · Protocol & Blueprint",
    shortLabel: "Protocol & Blueprint",
    description: "Thesis, Gaps, Journal Rules & Word Budget Blueprint",
    icon: ICONS.document,
    primaryStage: "definition",
    stages: [
      "definition",
      "literature",
      "gap_identification",
      "gap_selection",
      "title_selection",
      "title_lock",
      "journal_discovery",
      "journal_requirements",
    ],
  },
  {
    id: "evidence",
    number: 2,
    label: "Mode 2 · Literature & Data Matrix",
    shortLabel: "Literature & Data Matrix",
    description: "Live Scholarly Search, User Data Upload & Evidence Matrix",
    icon: ICONS.database,
    primaryStage: "vault_sources",
    stages: [
      "vault_sources",
      "source_approval_vault",
      "additional_data",
      "evidence_extraction",
      "external_research",
      "source_approval_external",
      "evidence_analysis",
      "manual_review",
    ],
  },
  {
    id: "studio",
    number: 3,
    label: "Mode 3 · Manuscript Studio",
    shortLabel: "Manuscript Studio",
    description: "Grounded Section-by-Section TipTap Drafting Studio",
    icon: ICONS.pen,
    primaryStage: "draft",
    stages: ["draft", "draft_preview"],
  },
  {
    id: "referee",
    number: 4,
    label: "Mode 4 · Referee & Rebuttal",
    shortLabel: "Referee & Rebuttal",
    description: "5-Referee Peer Review & Interactive Patch Matrix",
    icon: ICONS.review,
    primaryStage: "peer_review",
    stages: ["peer_review", "revision"],
  },
  {
    id: "audit_export",
    number: 5,
    label: "Mode 5 · Audit & Submission Export",
    shortLabel: "Audit & Submission Export",
    description: "Gate G7 Pre-Flight Verification & Camera-Ready Exporter",
    icon: ICONS.export,
    primaryStage: "export",
    stages: [
      "citation_audit",
      "originality_check",
      "final_editor",
      "publication_readiness",
      "export",
    ],
  },
];

export function getStudioModeForStage(stage: ResearchStage): StudioModeDefinition {
  return JOURNAL_STUDIO_MODES.find(m => m.stages.includes(stage)) || JOURNAL_STUDIO_MODES[0];
}

export function isStudioMode(value: string | undefined): value is JournalStudioMode {
  return JOURNAL_STUDIO_MODES.some(m => m.id === value);
}

export interface UserDatasetItem {
  id: string;
  citationToken: string;
  title: string;
  author: string;
  year: number;
  badge: "Primary User Data / Upload";
  sourceType: "quantitative_dataset" | "qualitative_document" | "field_notes" | "raw_text";
  format: string;
  summary: string;
  extractedFindings: string;
  keyMetrics?: string[];
  assignedSectionId?: string;
  epistemicRole: "Primary User Dataset" | "Supporting" | "Methodological Anchor" | "Contrasting / Critical";
  rawContentSample?: string;
  createdAt: string;
}

export interface SmartEvidenceRow {
  id: string;
  citationToken: string;
  title: string;
  authors: string[];
  year: number;
  doi?: string;
  portal?: string;
  badge: string;
  isUserData: boolean;
  epistemicRole: "Supporting" | "Contrasting / Critical" | "Methodological Anchor" | "Primary User Dataset";
  extractedFindings: string;
  assignedSectionId: string;
}

export type ManuscriptTemplate = "IMRaD" | "Theoretical" | "SystematicReview";

export interface SubSectionBudget {
  id: string;
  sectionId: string;
  title: string;
  targetWords: number;
  order: number;
  assignedSourceIds: string[];
  content?: string;
  actualWords?: number;
  draftedAt?: string;
}

export interface SectionBudget {
  id: string;
  sectionKey: string;
  sectionName: string;
  targetWords: number;
  order: number;
  subSections: SubSectionBudget[];
}

export interface WordBudgetBlueprint {
  projectId: string;
  template: ManuscriptTemplate;
  targetTotalWords: number;
  allocatedTotalWords: number;
  sections: SectionBudget[];
  totalSubSections: number;
  createdAt: string;
  updatedAt: string;
}

export type RefereeRole = "Methodologist" | "Domain Specialist" | "Biostatistician" | "Synthesizer" | "Formal Editor";

export interface RefereeCritique {
  id: string;
  referee: RefereeRole;
  lens: string;
  section: string;
  severity: "Major" | "Moderate" | "Minor";
  feedback: string;
  revisionDirective: string;
  verdict?: "Accept" | "Minor Revision" | "Major Revision" | "Reject";
  score?: number;
}

export interface RebuttalMatrixItem {
  id: string;
  referee: RefereeRole;
  lens: string;
  section: string;
  critique: string;
  severity: "Major" | "Moderate" | "Minor";
  authorResponse: string;
  revisionAction: string;
  diff?: {
    find: string;
    replace: string;
  };
  status: "addressed" | "Accepted & Revised" | "Rebutted with Evidence" | "Clarified in Text";
}

export interface ManuscriptPatch {
  id: string;
  section: string;
  critiqueLens?: string;
  severity?: string;
  find: string;
  replace: string;
  explanation: string;
  accepted: boolean;
  appliedAt?: string;
}

export interface BibliographyEntry {
  id: string;
  token: string;
  author: string;
  year: number | string;
  title: string;
  formattedCitation: string;
  isUserData: boolean;
}

export interface PreFlightGateScorecard {
  overallStatus: "CERTIFIED_READY" | "CONDITIONAL_APPROVAL" | "ACTION_REQUIRED";
  score: number;
  wordBudgetMatch: {
    targetWords: number;
    actualWords: number;
    deltaPercent: number;
    passed: boolean;
    tolerancePercent: number;
  };
  citationReconciliation: {
    totalInTextCitations: number;
    reconciledCount: number;
    orphanCitations: string[];
    uncitedVaultSources: string[];
    unverifiedClaimsCount: number;
    anachronismsCount: number;
    passed: boolean;
  };
  voiceTelemetry: {
    burstinessScore: number;
    sentenceStdDev: number;
    bannedTokensFound: string[];
    britishSpellingConsistency: number;
    isHighBurstiness: boolean;
  };
  declarationsCompliance: {
    hasDataAvailability: boolean;
    hasCompetingInterests: boolean;
    hasCreditStatement: boolean;
    hasAiDisclosure: boolean;
    passed: boolean;
  };
  certifiedAt: string;
}

export interface EthicalDeclarationsState {
  dataAvailability: string;
  competingInterests: string;
  funding: string;
  creditStatement: string;
  aiDisclosure: string;
  enabled: {
    dataAvailability: boolean;
    competingInterests: boolean;
    creditStatement: boolean;
    aiDisclosure: boolean;
  };
}

/**
 * Streamlined 9-Milestone Academic Pipeline
 *
 * Consolidates the 25 underlying execution stages into 9 cohesive,
 * minimal milestones, reducing cognitive load and visual clutter
 * without sacrificing provenance, validation gates, or data integrity.
 */
export interface ResearchMilestone {
  id: string;
  number: number;
  label: string;
  shortLabel: string;
  description: string;
  icon: string;
  primaryStage: ResearchStage;
  subStages: ResearchStage[];
  phaseId: ResearchPhaseId;
}

export const STREAMLINED_MILESTONES: ResearchMilestone[] = [
  {
    id: "scope_definition",
    number: 1,
    label: "Scope & Literature Discovery",
    shortLabel: "Scope & Literature",
    description: "Define research questions, methodology, and discover literature",
    icon: ICONS.document,
    primaryStage: "definition",
    subStages: ["definition", "literature"],
    phaseId: "foundation",
  },
  {
    id: "gap_and_title",
    number: 2,
    label: "Gap Analysis & Title Lock",
    shortLabel: "Gaps & Title Lock",
    description: "Identify knowledge gaps, select anchor gap, and seal working title",
    icon: ICONS.lock,
    primaryStage: "gap_identification",
    subStages: ["gap_identification", "gap_selection", "title_selection", "title_lock"],
    phaseId: "foundation",
  },
  {
    id: "evidence_desk",
    number: 3,
    label: "Evidence Desk & Sources",
    shortLabel: "Evidence Desk",
    description: "Ingest vault sources, approve literature, and upload primary data",
    icon: ICONS.database,
    primaryStage: "vault_sources",
    subStages: ["vault_sources", "source_approval_vault", "additional_data"],
    phaseId: "evidence",
  },
  {
    id: "claim_synthesis",
    number: 4,
    label: "Claim Extraction & Synthesis",
    shortLabel: "Claim Synthesis",
    description: "Extract empirical claims, search external sources, and build thematic matrix",
    icon: ICONS.chart,
    primaryStage: "evidence_extraction",
    subStages: ["evidence_extraction", "external_research", "source_approval_external", "evidence_analysis", "manual_review"],
    phaseId: "evidence",
  },
  {
    id: "target_journal",
    number: 5,
    label: "Target Journal & Requirements",
    shortLabel: "Target Journal",
    description: "Select target venue and inspect submission limits and citation style",
    icon: ICONS.compass,
    primaryStage: "journal_discovery",
    subStages: ["journal_discovery", "journal_requirements"],
    phaseId: "drafting",
  },
  {
    id: "manuscript_draft",
    number: 6,
    label: "Manuscript Studio & AI Drafting",
    shortLabel: "Drafting Studio",
    description: "Section-by-section academic prose drafting with word count budgets",
    icon: ICONS.pen,
    primaryStage: "draft",
    subStages: ["draft"],
    phaseId: "drafting",
  },
  {
    id: "preflight_audit",
    number: 7,
    label: "Integrity & Pre-Flight Audit",
    shortLabel: "Integrity Audit",
    description: "Audit claim citations, check semantic originality, and review preprint view",
    icon: ICONS.shield,
    primaryStage: "citation_audit",
    subStages: ["citation_audit", "originality_check", "draft_preview"],
    phaseId: "drafting",
  },
  {
    id: "peer_review_workbench",
    number: 8,
    label: "Peer Review & Live Revision",
    shortLabel: "Peer Review",
    description: "7-Lens academic peer critique and interactive before/after revision patcher",
    icon: ICONS.review,
    primaryStage: "peer_review",
    subStages: ["peer_review", "revision"],
    phaseId: "review",
  },
  {
    id: "camera_ready_export",
    number: 9,
    label: "Camera-Ready Typesetting & Export",
    shortLabel: "Typeset & Export",
    description: "Final editorial polish, compliance check, and multi-profile camera-ready export",
    icon: ICONS.export,
    primaryStage: "final_editor",
    subStages: ["final_editor", "publication_readiness", "export"],
    phaseId: "publication",
  },
];

export function getMilestoneForStage(stage: ResearchStage): ResearchMilestone | undefined {
  return STREAMLINED_MILESTONES.find(m => m.subStages.includes(stage));
}

export function computeMilestoneStatus(
  milestone: ResearchMilestone,
  stageStatuses: Record<ResearchStage, StageStatus>
): { status: StageStatus; completedCount: number; totalCount: number } {
  const statuses = milestone.subStages.map(s => stageStatuses[s] || "locked");
  const completedCount = statuses.filter(s => s === "completed").length;
  const totalCount = milestone.subStages.length;

  if (completedCount === totalCount) {
    return { status: "completed", completedCount, totalCount };
  }
  if (statuses.some(s => s === "ai_processing")) {
    return { status: "ai_processing", completedCount, totalCount };
  }
  if (statuses.some(s => s === "active")) {
    return { status: "active", completedCount, totalCount };
  }
  if (statuses.some(s => s === "available" || s === "needs_review" || s === "warning")) {
    return { status: "available", completedCount, totalCount };
  }
  return { status: "locked", completedCount, totalCount };
}

