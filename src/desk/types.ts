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
