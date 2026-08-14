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

export interface ProjectView {
  projectId: string;
  outputTypeId: string;
  answers: Record<string, string>;
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
