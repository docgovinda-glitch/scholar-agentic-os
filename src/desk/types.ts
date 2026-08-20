/**
 * Client-side view types for the Desk shell — mirror server/routes/project.ts's
 * projectView()/rubric response shapes exactly rather than importing
 * server-only modules into the browser bundle.
 */

export type GateStatus = "not_started" | "in_progress" | "ready" | "signed_off" | "invalidated";

export interface GateSummary {
  gate: string;
  name: string;
  status: GateStatus;
  outstandingBlocking: string[];
}

export interface Author {
  id: string;
  title?: string;
  firstName: string;
  middleName?: string;
  surname: string;
  orcid?: string;
  email: string;
  affiliation?: string;
  position?: string;
  isCorresponding: boolean;
  creditRoles: string[];
}

export interface ProjectView {
  projectId: string;
  outputTypeId: string;
  answers: Record<string, string>;
  authors: Author[];
  intakeCompleteness: number;
  hasDocument: boolean;
  hasJournalRequirements: boolean;
  gates: GateSummary[];
}

export type BlockKind = "paragraph" | "heading1" | "heading2" | "heading3" | "quote" | "list-item";

export interface Block {
  id: string;
  kind: BlockKind;
  text: string;
}

export interface CanonicalDocument {
  id: string;
  title: string;
  blocks: Block[];
  metadata?: Record<string, string>;
}

export type FindingStatus = "pass" | "warn" | "fail" | "not_applicable";
export type RuleSeverity = "blocking" | "required" | "advisory";

export interface Finding {
  ruleId: string;
  status: FindingStatus;
  severity: RuleSeverity;
  location?: { sectionKey?: string };
  actual?: string;
  expected?: string;
  message: string;
  remedy?: string;
}

export interface RubricReport {
  findings: Finding[];
  blockingFailures: Finding[];
  requiredFailures: Finding[];
  advisoryFindings: Finding[];
  readyForG6: boolean;
}

export interface OutputTypeSummary {
  id: string;
  label: string;
  aliases: string[];
  family: string;
  academicLevels: string[];
  typicalDisciplines: string[];
  /** Whether this type can actually be created right now — false for everything but Journal Article while that's Scholar Core's active scope. */
  available: boolean;
}

export type InterventionLevel = "proofread" | "clarity" | "flow" | "register" | "rewrite";

export interface VoiceProfile {
  sampleWordCount: number;
  meanSentenceLength: number;
  sentenceLengthStdDev: number;
  passiveVoiceRatio: number;
  semicolonRate: number;
  firstPersonRate: number;
  averageWordLength: number;
}

export type ChangeCategory = "mechanics" | "language" | "content";

export interface DiffChange {
  id: string;
  category: ChangeCategory;
  originalStart: number;
  originalEnd: number;
  originalText: string;
  replacementText: string;
  reason: string;
  meaningNote?: string;
}

export interface RefinementDiff {
  passageId: string;
  level: InterventionLevel;
  originalText: string;
  changes: DiffChange[];
  voiceApplied: boolean;
}

export interface VoiceDriftReport {
  drifted: boolean;
  notes: string[];
}

/** Mirrors src/app/studio/types.ts's StudioRefineUsage — present only when a model-backed level actually called the Gateway. */
export interface StudioRefineUsage {
  provider: string;
  model: string;
  inputTokensEstimate: number;
  outputTokensEstimate: number;
}

/** Mirrors src/app/studio/types.ts's StudioAiSource. */
export interface StudioAiSource {
  tier: "premium";
  provider: string;
  model: string;
  creditsUsed: number;
}

/** Mirrors src/domain/journal/types.ts's JournalRequirements. */
export interface JournalRequirements {
  journalName: string;
  source: "manual" | "ai_extracted";
  wordLimit?: { min?: number; max?: number };
  structureOverride?: string[];
  citationStyle?: string;
  requiredDeclarations: string[];
  articleType?: string;
  notes?: string;
  capturedAt: string;
  capturedBy: string;
}

/** Mirrors src/domain/journal/types.ts's JournalRequirementsProposal — what AI extraction proposes, never itself saved. */
export interface JournalRequirementsProposal {
  journalName?: string;
  wordLimit?: { min?: number; max?: number };
  structureOverride?: string[];
  citationStyle?: string;
  requiredDeclarations: string[];
  articleType?: string;
  notes?: string;
  unresolvedFields: string[];
}

/** Mirrors src/domain/evidence/types.ts. */
export type SourceType = "scholarly" | "official" | "web" | "media" | "user_provided" | "vault";
export type AuthorityTier = "A" | "B" | "C" | "D";
export type DiscoveryMethod = "arxiv" | "web_search" | "openalex" | "user_upload" | "vault" | "manual";

export interface DiscoveredSource {
  id: string;
  title: string;
  authors: string[];
  url?: string;
  doi?: string;
  venue?: string;
  year?: number;
  sourceType: SourceType;
  authorityTier: AuthorityTier;
  discoveredVia: DiscoveryMethod;
  discoveredAt: string;
  vaultItemId?: string;
}

export type EvidenceState = "discovered" | "extracted" | "verified" | "proposed" | "user_approved" | "citable";

export interface EvidenceHistoryEntry {
  state: EvidenceState;
  at: string;
  by?: string;
}

export interface EvidenceLocator {
  page?: number;
  paragraph?: number;
  startOffset?: number;
  endOffset?: number;
}

export interface EvidenceItem {
  id: string;
  sourceId: string;
  state: EvidenceState;
  quote?: string;
  locator?: EvidenceLocator;
  proposedClaimId?: string;
  history: EvidenceHistoryEntry[];
}

export interface EvidenceLedger {
  sources: DiscoveredSource[];
  items: EvidenceItem[];
}

/** Mirrors src/domain/manuscript/types.ts. */
export interface SectionPlan {
  key: string;
  title: string;
  guidance: string;
  targetWords: number;
}

export interface GeneratedSection {
  key: string;
  title: string;
  text: string;
  wordCount: number;
  memory: string;
  citedEvidenceIds: string[];
  generatedAt: string;
  usage?: { provider: string; model: string; inputTokensEstimate: number; outputTokensEstimate: number };
}

export type GenerationJobState = "not_started" | "running" | "paused" | "completed" | "failed";

/** Mirrors src/domain/coherence/types.ts. */
export type CoherenceDimension = "terminology" | "argument_continuity" | "methodology";
export type CoherenceSeverity = "minor" | "moderate" | "major";

export interface CoherenceIssue {
  dimension: CoherenceDimension;
  description: string;
  sectionKeys: string[];
  severity: CoherenceSeverity;
}

export interface CoherenceReport {
  issues: CoherenceIssue[];
  passesRun: CoherenceDimension[];
  passErrors: Partial<Record<CoherenceDimension, string>>;
  checkedAt: string;
}

export interface GenerationJob {
  state: GenerationJobState;
  plan: SectionPlan[];
  sections: GeneratedSection[];
  totalWordTarget: number;
  startedAt?: string;
  updatedAt: string;
  lastError?: string;
  coherenceReport?: CoherenceReport;
}

/** Mirrors src/domain/review/types.ts. */
export type ReviewLens = "contribution" | "literature" | "methodology" | "evidence" | "argument" | "citation" | "journal_fit";
export type FindingSeverity = "minor" | "moderate" | "major" | "critical";

export interface ReviewFinding {
  summary: string;
  detail: string;
  severity: FindingSeverity;
  sectionKeys: string[];
}

export interface LensReview {
  lens: ReviewLens;
  findings: ReviewFinding[];
  overallAssessment: string;
}

export interface ReviewRound {
  roundNumber: number;
  lensReviews: LensReview[];
  lensesRun: ReviewLens[];
  lensErrors: Partial<Record<ReviewLens, string>>;
  createdAt: string;
}

export interface PeerReviewHistory {
  rounds: ReviewRound[];
}

/** Mirrors src/domain/coverLetter/types.ts. */
export interface CoverLetter {
  text: string;
  journalName: string;
  generatedAt: string;
}

export interface StudioRefineResult {
  diff: RefinementDiff;
  voiceDrift?: VoiceDriftReport;
  contentChangeCount: number;
  languageChangeCount: number;
  usage?: StudioRefineUsage;
  aiSource?: StudioAiSource;
}

/** Thrown-shaped, not a real Error — matches the 428/403 bodies studio.ts sends. */
export interface StudioConsentRequired {
  kind: "consent_required";
  reason: string;
  provider?: string;
}
export interface StudioDenied {
  kind: "denied";
  reason: string;
}

/** Intake field tier — drives UI treatment (docs 14 §5). */
export type IntakeTier = "required" | "recommended" | "optional";

/**
 * One intake question, mirroring src/app/atlas/types.ts's IntakeField.
 *
 * `guidance` is a four-part contract the Atlas catalog validates as mandatory
 * on every field (app/atlas/validate.ts). It is what makes it possible to ask
 * a first-time writer for a "research question" without assuming they already
 * know what one is — so the UI must actually show it, not just carry it.
 */
export interface IntakeField {
  key: string;
  label: string;
  tier: IntakeTier;
  guidance: {
    whatItIs: string;
    whyItMatters: string;
    example: string;
    defaultWithRationale: string;
  };
  /** Pre-fillable value — "never an empty required field" (docs 14 §5.2). */
  defaultValue?: string;
  /** Whether "I'm not sure yet" is an accepted answer for now. */
  allowsProvisional: boolean;
}

/**
 * One section of an output type's expected structure (docs 14 §2), mirroring
 * src/app/atlas/types.ts's SectionSpec. `children` is only populated for
 * chapter_based types (e.g. a doctoral dissertation's chapters).
 */
export interface SectionSpec {
  key: string;
  title: string;
  required: boolean;
  guidance: string;
  children?: SectionSpec[];
}

export interface StructureSpec {
  variant: string;
  sections: SectionSpec[];
}

/** The parts of an Atlas output-type spec the intake form and the Rail's planned-structure preview need. */
export interface OutputTypeSpec {
  id: string;
  label: string;
  family: string;
  workflowVariant?: string;
  intakeSchema: {
    required: IntakeField[];
    recommended: IntakeField[];
    optional: IntakeField[];
  };
  structure: StructureSpec;
}

/**
 * Claim–Evidence Graph types, mirroring src/domain/claim/types.ts. There is
 * no source registry yet (the Knowledge Vault only tracks that a vault
 * exists, not its contents — docs 25), so `sourceId` is free text the user
 * types themselves, not a picker over an approved-source list.
 */
export interface EvidenceSpan {
  sourceId: string;
  locator: {
    page?: number;
    paragraph?: number;
    startOffset?: number;
    endOffset?: number;
  };
  quote: string;
}

export interface Claim {
  id: string;
  text: string;
  draftSpanId?: string;
  /** Mirrors src/domain/claim/types.ts's Claim.explicitlyUnsupported. */
  explicitlyUnsupported?: { reason: string; markedBy: string; at: string };
}

export type SupportStrength = "strong" | "moderate" | "weak" | "contradicts";

export interface ClaimEvidenceBinding {
  id: string;
  claimId: string;
  evidence: EvidenceSpan[];
  strength: SupportStrength;
  rationale: string;
}

export interface EvidenceConflict {
  claimId: string;
  bindingIds: string[];
  description: string;
}

export interface ClaimEvidenceGraph {
  claims: Claim[];
  bindings: ClaimEvidenceBinding[];
}

/**
 * Post-G6 submission tracking, mirroring src/domain/submission/types.ts.
 * Orthogonal to the gates above — a project can carry any number of
 * submission attempts against different journals regardless of gate state.
 */
export type SubmissionStatus =
  | "draft"
  | "submitted"
  | "under_review"
  | "minor_revisions"
  | "major_revisions"
  | "accepted"
  | "rejected"
  | "desk_rejected";

export const SUBMISSION_STATUSES: SubmissionStatus[] = [
  "draft",
  "submitted",
  "under_review",
  "minor_revisions",
  "major_revisions",
  "accepted",
  "rejected",
  "desk_rejected",
];

export interface SubmissionRecord {
  id: string;
  journalName: string;
  journalUrl?: string;
  submittedAt: string;
  status: SubmissionStatus;
  journalSubmissionId?: string;
  notes?: string;
  statusUpdatedAt: string;
}
