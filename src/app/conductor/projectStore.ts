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
import type { SubmissionRecord } from "../../domain/submission/types";
import type { JournalRequirements } from "../../domain/journal/types";
import { emptyLedger } from "../../domain/evidence/types";
import type { EvidenceLedger } from "../../domain/evidence/types";
import type { GenerationJob } from "../../domain/manuscript/types";
import { emptyPeerReviewHistory } from "../../domain/review/types";
import type { PeerReviewHistory } from "../../domain/review/types";
import type { CoverLetter } from "../../domain/coverLetter/types";
import type { AnonymizationReport } from "../../domain/anonymization/types";

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

export interface ProjectRecord {
  projectId: string;
  /**
   * Supabase user id of the project's owner.
   *
   * Required, not optional, and deliberately so: a project with no owner
   * cannot be authorised against, and an optional field would let one be
   * created by omission — which is exactly how this store previously allowed
   * every project to be readable and writable by anyone who could name its
   * id. Every construction path must state an owner.
   */
  ownerId: string;
  outputTypeId: string;
  /** Intake answers so far, keyed by IntakeField.key. "provisional" is a valid value (docs 14 §5.2). */
  answers: Record<string, string>;
  authors: Author[];
  gates: ProjectGateState;
  /** The project's document body, once one has been submitted (server/routes/project.ts's PUT .../document). Undefined until then — G6 has nothing to evaluate before this exists. */
  document?: CanonicalDocument;
  /** The most recent Rubric evaluation of `document` against the project's output type — recomputed every time `document` changes. Reused as G6's sign-off snapshot. */
  rubricReport?: RubricReport;
  /** The project's Claim–Evidence Graph (domain/claim). Starts empty at creation, same as an empty gate state — there is always a graph to query, just possibly with nothing in it yet. */
  claimGraph: ClaimEvidenceGraph;
  /** Recorded Rubric waivers, keyed by rule id. Compiling rules from Atlas always produces unwaived rules (fromAtlas.ts has no memory), so this is what lets a waiver survive a document resubmission — see app/rubric/rubric.ts's applyWaivers. */
  waivers: Record<string, { reason: string; at: string }>;
  /** Post-G6 submission attempts against journals — see domain/submission/types.ts. Starts empty, same as claimGraph: always present, possibly with nothing in it yet. */
  submissions: SubmissionRecord[];
  /** The target journal's captured structural/citation/declaration requirements (docs 30 §10, G1). Undefined until PUT .../journal-requirements — a real, distinct "not yet captured" state, not defaulted to an empty object, same as `document`. */
  journalRequirements?: JournalRequirements;
  /** Discovered sources and their evidence-provenance state (domain/evidence). Starts empty, same as claimGraph: always present, possibly with nothing in it yet. */
  evidenceLedger: EvidenceLedger;
  /** The long-form generation engine's durable checkpoint (domain/manuscript). Undefined until POST .../manuscript/start — a real, distinct "never started" state, same as journalRequirements. */
  generationJob?: GenerationJob;
  /** Every multi-lens peer review round run so far (domain/review) — versioned, never overwritten. Starts empty, same as claimGraph/evidenceLedger: always present, possibly with nothing in it yet. */
  peerReviewHistory: PeerReviewHistory;
  /** The most recently generated cover letter (domain/coverLetter). Undefined until POST .../cover-letter — overwritten wholesale on each regeneration, same "not yet captured" distinctness as journalRequirements. */
  coverLetter?: CoverLetter;
  /** The most recent anonymization PROPOSAL report (domain/anonymization) — never auto-applied. Undefined until POST .../anonymization/propose. */
  anonymizationReport?: AnonymizationReport;
  /** The anonymized document produced by applying a human-accepted subset of anonymizationReport's proposals (POST .../anonymization/apply). A separate document from `document`, never overwrites it. */
  anonymizedDocument?: CanonicalDocument;
  /** Recorded explicit acceptance of a smaller-than-typical source corpus (docs 30 §3 G2 "Exit"'s escape hatch) — undefined until POST .../gates/G2/accept-smaller-corpus, mirroring waivers' "reason required" discipline. */
  sourceCountOverride?: { reason: string; acceptedBy: string; at: string };
}

const projects = new Map<string, ProjectRecord>();

/**
 * Exported for src/services/store/pgProjectStore.ts, which needs the same id shape.
 *
 * Was `proj-${Date.now().toString(36)}-${counter}` with a module-level
 * counter. Two problems, both real once these ids address authorised data:
 * the counter made ids sequential, so knowing one id told you its
 * neighbours', and the timestamp narrowed the rest of the search space to
 * whatever was created in the same millisecond. Enumeration was arithmetic,
 * not guessing.
 *
 * Ownership checks are the actual access control (see ProjectRecord.ownerId)
 * — an unguessable id is not authorisation. But ids leak: into URLs, logs,
 * screenshots, and shared links. Making them opaque means a leaked id
 * discloses one project rather than a range of them.
 *
 * `randomUUID` is available on Node 19+ and in every browser that ships
 * `crypto.subtle`; the fallback covers non-secure contexts, where
 * `crypto.randomUUID` is undefined but `getRandomValues` is not.
 */
export function generateProjectId(): string {
  const c = globalThis.crypto;
  if (typeof c?.randomUUID === "function") return `proj-${c.randomUUID()}`;
  const bytes = c.getRandomValues(new Uint8Array(16));
  return `proj-${Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("")}`;
}

export function createProject(outputTypeId: string, ownerId: string): ProjectRecord {
  const projectId = generateProjectId();
  const record: ProjectRecord = {
    projectId,
    ownerId,
    outputTypeId,
    answers: {},
    authors: [],
    gates: initialProjectGateState(projectId),
    claimGraph: emptyGraph(),
    waivers: {},
    submissions: [],
    evidenceLedger: emptyLedger(),
    peerReviewHistory: emptyPeerReviewHistory(),
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

export function deleteProject(projectId: string): void {
  projects.delete(projectId);
}

/** Owner-scoped listing. Filtering here rather than at the call site keeps
 *  "which projects exist for this user" a single question the store answers,
 *  so no caller can accidentally enumerate the whole map. */
export function listProjectsByOwner(ownerId: string): ProjectRecord[] {
  return Array.from(projects.values()).filter((p) => p.ownerId === ownerId);
}

export function __resetProjectStoreForTests(): void {
  projects.clear();
}
