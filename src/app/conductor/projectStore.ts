/**
 * Interim in-memory project store.
 *
 * Same honest scope note as src/app/studio/sessionPolicyStore.ts: this is
 * an explicitly-labelled stand-in for what `services/store` should provide
 * once it exists (docs/01-product/13-MODULE-SPECIFICATIONS.md §8.3 —
 * "the largest near-term gap"). It does not survive a process restart and
 * does not scale past one process. server/routes/project.ts is the only
 * caller; nothing in domain/ or app/conductor's pure logic depends on this
 * file existing.
 */

import { initialProjectGateState } from "../../domain/project/gates";
import type { ProjectGateState } from "../../domain/project/gates";
import type { CanonicalDocument } from "../../domain/document/model";
import type { RubricReport } from "../rubric/rubric";
import { emptyGraph } from "../../domain/claim/graph";
import type { ClaimEvidenceGraph } from "../../domain/claim/types";

export interface ProjectRecord {
  projectId: string;
  outputTypeId: string;
  /** Intake answers so far, keyed by IntakeField.key. "provisional" is a valid value (docs 14 §5.2). */
  answers: Record<string, string>;
  gates: ProjectGateState;
  /** The project's document body, once one has been submitted (server/routes/project.ts's PUT .../document). Undefined until then — G6 has nothing to evaluate before this exists. */
  document?: CanonicalDocument;
  /** The most recent Rubric evaluation of `document` against the project's output type — recomputed every time `document` changes. Reused as G6's sign-off snapshot. */
  rubricReport?: RubricReport;
  /** The project's Claim–Evidence Graph (domain/claim). Starts empty at creation, same as an empty gate state — there is always a graph to query, just possibly with nothing in it yet. */
  claimGraph: ClaimEvidenceGraph;
  /** Recorded Rubric waivers, keyed by rule id. Compiling rules from Atlas always produces unwaived rules (fromAtlas.ts has no memory), so this is what lets a waiver survive a document resubmission — see app/rubric/rubric.ts's applyWaivers. */
  waivers: Record<string, { reason: string; at: string }>;
}

const projects = new Map<string, ProjectRecord>();
let counter = 0;

/** Exported for src/services/store/pgProjectStore.ts, which needs the same id shape. */
export function generateProjectId(): string {
  counter += 1;
  return `proj-${Date.now().toString(36)}-${counter}`;
}

export function createProject(outputTypeId: string): ProjectRecord {
  const projectId = generateProjectId();
  const record: ProjectRecord = {
    projectId,
    outputTypeId,
    answers: {},
    gates: initialProjectGateState(projectId),
    claimGraph: emptyGraph(),
    waivers: {},
  };
  projects.set(projectId, record);
  return record;
}

export function getProject(projectId: string): ProjectRecord | undefined {
  return projects.get(projectId);
}

export function saveProject(record: ProjectRecord): ProjectRecord {
  projects.set(record.projectId, record);
  return record;
}

export function __resetProjectStoreForTests(): void {
  projects.clear();
  counter = 0;
}
