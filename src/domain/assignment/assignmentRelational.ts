/**
 * Maps a Coursework (OT-01) project's saved answers onto the normalized rows of
 * migration 20261113180000_coursework_relational_state.sql.
 *
 * Pure: no I/O, no React. The server mirror (server/src/assignmentRelational.ts)
 * writes these rows after every save; the project row stays the source the app reads.
 */

import { isSourceApproved } from "./approvedSources";
import { countProseWords } from "../../shared/proseBlocks";
import { normalizeAssignmentAnswers } from "./answerKeys";

export type AssignmentPhase = "extract" | "understand" | "sources" | "drafting" | "submission";

const PHASES: AssignmentPhase[] = ["extract", "understand", "sources", "drafting", "submission"];
const LEGACY_PHASE: Record<string, AssignmentPhase> = {
  // Phase 1: Extract
  extract: "extract",
  extraction: "extract",
  extract_phase: "extract",
  upload: "extract",

  // Phase 2: Understand
  understand: "understand",
  understanding: "understand",
  plan: "understand",
  planning: "understand",
  plan_phase: "understand",
  outline: "understand",
  outline_phase: "understand",
  outline_creation: "understand",
  structure: "understand",

  // Phase 3: Sources
  sources: "sources",
  source_phase: "sources",
  research: "sources",
  research_phase: "sources",
  discovery: "sources",
  literature_discovery: "sources",
  source_discovery: "sources",
  analysis: "sources",
  source_analysis: "sources",

  // Phase 4: Drafting
  drafting: "drafting",
  drafting_phase: "drafting",
  draft: "drafting",
  draft_phase: "drafting",
  write: "drafting",
  writing: "drafting",
  write_phase: "drafting",
  writing_phase: "drafting",
  pre_draft: "drafting",
  predraft: "drafting",

  // Phase 5: Submission
  submission: "submission",
  submission_phase: "submission",
  submit: "submission",
  submit_phase: "submission",
  review: "submission",
  review_phase: "submission",
  export: "submission",
};

export type StageStatus = "not_started" | "in_progress" | "complete";

export interface AssignmentProjectRow {
  project_id: string;
  current_phase: AssignmentPhase;
  title: string | null;
  brief_text: string | null;
  target_word_count: number | null;
  citation_style: string | null;
  writing_style: string | null;
  stage_status: Record<AssignmentPhase, StageStatus>;
  updated_at: string;
}

export interface AssignmentFileRow {
  project_id: string;
  file_id: string;
  role: "brief" | "source";
  file_name: string;
  mime_type: string | null;
  size_bytes: number | null;
  storage_path: string | null;
  parsed_text: string | null;
  processing_status: string | null;
  updated_at: string;
}

export interface AssignmentOutlineRow {
  project_id: string;
  section_id: string;
  parent_section_id: string | null;
  position: number;
  level: 1 | 2;
  title: string;
  guidance: string | null;
  target_word_count: number | null;
  key_points: string[];
  updated_at: string;
}

export interface AssignmentDraftRevisionRow {
  project_id: string;
  section_id: string;
  content_hash: string;
  content: string;
  word_count: number;
  cited_source_ids: string[];
}

export interface AssignmentSubmissionCheckRow {
  project_id: string;
  report_hash: string;
  passed: boolean | null;
  report: Record<string, unknown>;
}

export interface AssignmentSourceOriginRow {
  source_id: string;
  origin: "live" | "vault" | "upload" | "prescribed";
  is_approved: boolean;
}

/** A full public.project_sources row for one Stage 3 source (every channel). */
export interface AssignmentSourceRow extends AssignmentSourceOriginRow {
  project_id: string;
  title: string;
  authors: string[];
  year: number | null;
  doi: string | null;
  venue: string | null;
  url: string | null;
  abstract: string | null;
  source_type: string;
  authority_tier: string;
  discovered_via: string;
  discovered_at: string;
  vault_item_id: string | null;
  relevance_score: number | null;
  updated_at: string;
}

export interface AssignmentRelationalSnapshot {
  project: AssignmentProjectRow;
  files: AssignmentFileRow[];
  outline: AssignmentOutlineRow[];
  drafts: AssignmentDraftRevisionRow[];
  submission: AssignmentSubmissionCheckRow | null;
  sourceOrigins: AssignmentSourceOriginRow[];
  /** Every source in the project's list, for public.project_sources (upserted by project_id, source_id). */
  sources: AssignmentSourceRow[];
}

const MAX_PARSED_TEXT = 1_000_000;

/** Answers may hold JSON strings or objects (both shapes exist in saved projects). */
export function readJson<T>(value: unknown, fallback: T): T {
  if (value === undefined || value === null || value === "") return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value) as T;
    } catch {
      return fallback;
    }
  }
  return value as T;
}

function str(value: unknown): string | null {
  if (typeof value === "string") return value.trim() || null;
  if (value && typeof value === "object") {
    const o = value as Record<string, unknown>;
    const v = o.preset ?? o.label ?? o.id;
    return typeof v === "string" ? v : null;
  }
  return null;
}

function num(value: unknown): number | null {
  const n = typeof value === "number" ? value : parseInt(String(value ?? ""), 10);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : null;
}

/** Stable, browser-safe 53-bit string hash (cyrb53), hex-encoded. */
export function contentHash(text: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < text.length; i++) {
    const ch = text.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function normalizePhase(value: unknown): AssignmentPhase {
  const key = typeof value === "string" ? value.trim().toLowerCase() : "";
  return LEGACY_PHASE[key] ?? "extract";
}

interface SectionLike {
  id?: string;
  title?: string;
  guidance?: string;
  notes?: string;
  targetWordCount?: number;
  draftContent?: string;
  keyPoints?: string[];
  boundSourceIds?: string[];
  subheadings?: SectionLike[];
}

interface SourceLike {
  id?: string;
  title?: string;
  authors?: unknown;
  year?: unknown;
  doi?: string;
  url?: string;
  journal?: string;
  venue?: string;
  abstract?: string;
  type?: string;
  authorityTier?: string;
  peerReviewed?: boolean;
  retrievedAt?: string;
  relevanceScore?: unknown;
  status?: string;
  isExcluded?: boolean;
  prescribedInBrief?: boolean;
  isUserUploaded?: boolean;
  vaultItemId?: string;
  retrievalSource?: string;
}

interface UploadLike {
  id?: string;
  name?: string;
  mimeType?: string;
  fileSize?: number;
  fileUrl?: string;
  extractedText?: string;
  processingStatus?: string;
}

function outlineRows(projectId: string, answers: Record<string, unknown>, at: string): AssignmentOutlineRow[] {
  const structure = readJson<{ headings?: SectionLike[] } | null>(answers["assignment_structure"], null);
  const rows: AssignmentOutlineRow[] = [];
  const headings = Array.isArray(structure?.headings) ? structure!.headings! : [];
  headings.forEach((h, hIdx) => {
    const hid = String(h.id || `heading-${hIdx + 1}`);
    rows.push({
      project_id: projectId,
      section_id: hid,
      parent_section_id: null,
      position: rows.length,
      level: 1,
      title: String(h.title || ""),
      guidance: h.notes || h.guidance || null,
      target_word_count: num(h.targetWordCount),
      key_points: Array.isArray(h.keyPoints) ? h.keyPoints.map(String) : [],
      updated_at: at,
    });
    (Array.isArray(h.subheadings) ? h.subheadings : []).forEach((s, sIdx) => {
      rows.push({
        project_id: projectId,
        section_id: String(s.id || `${hid}-sub-${sIdx + 1}`),
        parent_section_id: hid,
        position: rows.length,
        level: 2,
        title: String(s.title || ""),
        guidance: s.guidance || s.notes || null,
        target_word_count: num(s.targetWordCount),
        key_points: Array.isArray(s.keyPoints) ? s.keyPoints.map(String) : [],
        updated_at: at,
      });
    });
  });
  if (rows.length > 0) return rows;
  // No confirmed structure yet: fall back to the drafting sections (same order).
  const sections = readJson<SectionLike[]>(answers["assignment_internal_sections"], []);
  return (Array.isArray(sections) ? sections : []).map((s, idx) => ({
    project_id: projectId,
    section_id: String(s.id || `section-${idx + 1}`),
    parent_section_id: null,
    position: idx,
    level: 1 as const,
    title: String(s.title || ""),
    guidance: s.guidance || null,
    target_word_count: num(s.targetWordCount),
    key_points: Array.isArray(s.keyPoints) ? s.keyPoints.map(String) : [],
    updated_at: at,
  }));
}

function stageStatus(snapshot: {
  phase: AssignmentPhase;
  briefText: string | null;
  outline: AssignmentOutlineRow[];
  approvedSources: number;
  draftedWords: number;
  targetWords: number | null;
  hasSubmissionReport: boolean;
}): Record<AssignmentPhase, StageStatus> {
  const reached = PHASES.indexOf(snapshot.phase);
  const done: Record<AssignmentPhase, boolean> = {
    extract: Boolean(snapshot.briefText),
    understand: snapshot.outline.length > 0,
    sources: snapshot.approvedSources > 0,
    drafting: snapshot.targetWords ? snapshot.draftedWords >= snapshot.targetWords * 0.9 : snapshot.draftedWords > 0,
    submission: snapshot.hasSubmissionReport,
  };
  const out = {} as Record<AssignmentPhase, StageStatus>;
  PHASES.forEach((p, idx) => {
    out[p] = done[p] ? "complete" : idx <= reached ? "in_progress" : "not_started";
  });
  return out;
}

export function sourceOrigin(s: SourceLike): AssignmentSourceOriginRow["origin"] {
  if (s.prescribedInBrief) return "prescribed";
  if (s.isUserUploaded) return "upload";
  if (s.vaultItemId || s.retrievalSource === "vault") return "vault";
  return "live";
}

/** Build every normalized row for one Coursework project. */
export function buildAssignmentRelationalSnapshot(
  projectId: string,
  rawAnswers: Record<string, unknown>,
  now: Date = new Date()
): AssignmentRelationalSnapshot {
  // Saved records are already normalized; a raw one (older save, test) is read the same way.
  const answers = normalizeAssignmentAnswers(rawAnswers);
  const at = now.toISOString();
  const briefText = str(answers["assignment_brief"]);
  const targetWords = num(answers["word_limit"]);
  const phase = normalizePhase(answers["assignment_current_phase"]);

  const files: AssignmentFileRow[] = [];
  const briefFile = str(answers["assignment_brief_file"]);
  if (briefFile) {
    files.push({
      project_id: projectId,
      file_id: "brief",
      role: "brief",
      file_name: briefFile.slice(0, 500),
      mime_type: null,
      size_bytes: null,
      storage_path: null,
      parsed_text: briefText ? briefText.slice(0, MAX_PARSED_TEXT) : null,
      processing_status: "extracted",
      updated_at: at,
    });
  }
  const uploads = readJson<UploadLike[]>(answers["assignment_user_uploaded_sources"], []);
  for (const u of Array.isArray(uploads) ? uploads : []) {
    if (!u?.id) continue;
    files.push({
      project_id: projectId,
      file_id: `source:${u.id}`.slice(0, 200),
      role: "source",
      file_name: String(u.name || "").slice(0, 500),
      mime_type: u.mimeType || null,
      size_bytes: num(u.fileSize),
      storage_path: u.fileUrl || null,
      parsed_text: u.extractedText ? u.extractedText.slice(0, MAX_PARSED_TEXT) : null,
      processing_status: u.processingStatus || null,
      updated_at: at,
    });
  }

  const outline = outlineRows(projectId, answers, at);

  const sources = readJson<SourceLike[]>(answers["assignment_sources"], []);
  const approvedRaw = readJson<string[] | null>(answers["approved_source_ids"], null);
  // Before any decision only the brief's prescribed references count (see approvedSources.ts).
  const approvedIds = Array.isArray(approvedRaw)
    ? new Set(approvedRaw.map(String))
    : new Set((Array.isArray(sources) ? sources : []).filter((s) => s?.prescribedInBrief && typeof s.id === "string").map((s) => s.id as string));
  const sourceOrigins: AssignmentSourceOriginRow[] = (Array.isArray(sources) ? sources : [])
    .filter((s): s is SourceLike & { id: string } => typeof s?.id === "string")
    .map((s) => ({
      source_id: s.id,
      origin: sourceOrigin(s),
      is_approved: isSourceApproved(s, approvedIds),
    }));

  const sourceRows: AssignmentSourceRow[] = (Array.isArray(sources) ? sources : [])
    .filter((s): s is SourceLike & { id: string } => typeof s?.id === "string" && s.id.length > 0)
    .map((s, i) => {
      const year = parseInt(String(s.year ?? ""), 10);
      const score = Number(s.relevanceScore);
      return {
        project_id: projectId,
        ...sourceOrigins[i],
        // A malformed index record (a whole abstract as its title) is clamped, not dropped.
        title: (str(s.title) ?? "Untitled source").slice(0, 2000),
        authors: (Array.isArray(s.authors) ? s.authors : []).map((a) => String(a).slice(0, 300)).slice(0, 200),
        year: Number.isFinite(year) && year > 0 && year < 3000 ? year : null,
        doi: str(s.doi) ?? null,
        venue: str(s.journal) ?? str(s.venue) ?? null,
        url: str(s.url) ?? null,
        abstract: str(s.abstract) ? s.abstract!.slice(0, 20_000) : null,
        source_type: str(s.type) ?? "scholarly",
        authority_tier: str(s.authorityTier) ?? (s.peerReviewed ? "A" : "B"),
        discovered_via: str(s.retrievalSource) ?? sourceOrigins[i].origin,
        discovered_at: str(s.retrievedAt) ?? at,
        vault_item_id: str(s.vaultItemId) ?? null,
        relevance_score: Number.isFinite(score) ? Math.round(score <= 1 ? score * 100 : score) : null,
        updated_at: at,
      };
    });

  const sections = readJson<SectionLike[]>(answers["assignment_internal_sections"], []);
  const drafts: AssignmentDraftRevisionRow[] = (Array.isArray(sections) ? sections : [])
    .filter((s) => typeof s?.draftContent === "string" && s.draftContent.trim().length > 0 && s.id)
    .map((s) => ({
      project_id: projectId,
      section_id: String(s.id),
      content_hash: contentHash(s.draftContent!),
      content: s.draftContent!,
      word_count: countProseWords(s.draftContent!),
      cited_source_ids: Array.isArray(s.boundSourceIds) ? s.boundSourceIds.map(String) : [],
    }));

  const report = readJson<Record<string, unknown> | null>(answers["assignment_submission_report"], null);
  const submission: AssignmentSubmissionCheckRow | null =
    report && typeof report === "object"
      ? {
          project_id: projectId,
          report_hash: contentHash(JSON.stringify(report)),
          passed: typeof report.passed === "boolean" ? report.passed : typeof report.readyToSubmit === "boolean" ? (report.readyToSubmit as boolean) : null,
          report,
        }
      : null;

  return {
    project: {
      project_id: projectId,
      current_phase: phase,
      title: str(answers["title"]),
      brief_text: briefText ? briefText.slice(0, MAX_PARSED_TEXT) : null,
      target_word_count: targetWords,
      citation_style: str(answers["citation_style"]),
      writing_style: str(answers["writing_style"]) ?? str(answers["writing_tone"]),
      stage_status: stageStatus({
        phase,
        briefText,
        outline,
        approvedSources: sourceOrigins.filter((s) => s.is_approved).length,
        draftedWords: drafts.reduce((n, d) => n + d.word_count, 0),
        targetWords,
        hasSubmissionReport: Boolean(submission),
      }),
      updated_at: at,
    },
    files,
    outline,
    drafts,
    submission,
    sourceOrigins,
    sources: sourceRows,
  };
}
