import type { ProjectRecord } from "../../../../src/services/store/projectStore.ts";
import type { ScholarlyDialect } from "../../../src/utils/scholarlyVoiceGuard.ts";
import type { VerifiedSourceItem } from "../../../src/utils/citationLockScrubber.ts";

export type RefereeRole =
  | "Methodologist"
  | "Domain Specialist"
  | "Biostatistician"
  | "Synthesizer"
  | "Formal Editor";

export interface AcademicCritiqueItem {
  id: string;
  refereeRole?: RefereeRole;
  referee?: RefereeRole | string;
  critiqueLens?: string;
  lens?: string;
  section: string;
  severity: "Critical" | "Major" | "Moderate" | "Minor";
  critique?: string;
  feedback?: string;
  recommendation?: string;
  revisionDirective?: string;
  authorNote?: string;
  suggestedDiff?: {
    find: string;
    replace: string;
  };
  waived?: boolean;
}

export interface RebuttalMatrixItem {
  id: string;
  referee: string;
  refereeRole?: RefereeRole | string;
  lens: string;
  section: string;
  critique: string;
  severity: "Critical" | "Major" | "Moderate" | "Minor";
  authorResponse: string;
  revisionAction: string;
  diff?: {
    find: string;
    replace: string;
  };
  status: "addressed" | "pending" | "waived" | string;
}

export interface CitationReconciliationReport {
  totalVaultSources?: number;
  totalInlineCitations?: number;
  reconciledCount?: number;
  unanchoredCount?: number;
  orphanedVaultCount?: number;
  fidelityScore?: number;
  unanchoredTokens?: string[];
  orphanedVaultSources?: Array<{ id: string; title: string }>;
  verifiedInlineTokens?: string[];
  reconciliationStatus?: "Reconciled" | "Unreconciled Discrepancies Detected";

  totalInTextCitations: number;
  inTextKeys: string[];
  matchedVaultCitations: number;
  vaultMatchCount: number;
  orphanCitations: string[];
  uncitedVaultSources: string[];
  uncitedVaultItems: string[];
  unverifiedClaimsCount: number;
  pass: boolean;
}

export interface UserDatasetRecord {
  id: string;
  citationToken: string;
  title: string;
  author: string;
  year: number;
  badge: "Primary User Data / Upload";
  sourceType: "quantitative_dataset" | "qualitative_document" | "field_notes" | "raw_text" | string;
  format: string;
  summary: string;
  extractedFindings: string;
  keyMetrics?: string[];
  assignedSectionId?: string;
  epistemicRole: "Primary User Dataset" | "Supporting" | "Methodological Anchor" | "Contrasting / Critical" | string;
  rawContentSample?: string;
  createdAt: string;
}

export interface DraftSubSectionRequestBody {
  sectionId?: string;
  subSectionId?: string;
  subSectionTitle?: string;
  targetWords?: number;
  assignedSources?: VerifiedSourceItem[];
  contextPrompt?: string;
  dialect?: "en-GB" | "en-US";
  thesisStatement?: string;
}
