/**
 * Mirrors Coursework (OT-01) project saves into the normalized tables of
 * migration 20261113180000_coursework_relational_state.sql.
 *
 * Runs after the project row has been saved (the route already checked
 * ownership), with the service role. It never blocks or fails a save: a mirror
 * error is logged and the next save writes the full state again. Saves for the
 * same project are serialized so an older snapshot never lands after a newer one.
 */

import { getSupabaseRestConfig, SupabaseTable, type SupabaseRestConfig } from "./supabaseRest.ts";
import { buildAssignmentRelationalSnapshot } from "../../src/domain/assignment/assignmentRelational.ts";
import type { ProjectRecord } from "../../src/services/store/types.ts";

type Row = Record<string, unknown>;

/** PostgREST `in.(...)` list with each value double-quoted (ids may hold commas or dots). */
export function postgrestInList(values: string[]): string {
  return `(${values.map((v) => `"${v.replace(/\\/g, "\\\\").replace(/"/g, '\\"')}"`).join(",")})`;
}

export async function writeAssignmentSnapshot(
  config: SupabaseRestConfig,
  record: Pick<ProjectRecord, "projectId" | "answers">
): Promise<void> {
  const projectId = record.projectId;
  const snap = buildAssignmentRelationalSnapshot(projectId, (record.answers ?? {}) as Record<string, unknown>);
  const pid = `project_id=eq.${encodeURIComponent(projectId)}`;
  const table = (name: string) => new SupabaseTable<Row>(config, name);

  await table("assignment_projects").upsert(snap.project as unknown as Row, "project_id");

  const files = table("assignment_files");
  if (snap.files.length) await files.upsert(snap.files as unknown as Row[], "project_id,file_id");
  await files.delete(
    snap.files.length
      ? `${pid}&file_id=not.in.${encodeURIComponent(postgrestInList(snap.files.map((f) => f.file_id)))}`
      : pid
  );

  const outline = table("assignment_outline_sections");
  if (snap.outline.length) await outline.upsert(snap.outline as unknown as Row[], "project_id,section_id");
  await outline.delete(
    snap.outline.length
      ? `${pid}&section_id=not.in.${encodeURIComponent(postgrestInList(snap.outline.map((o) => o.section_id)))}`
      : pid
  );

  // Revisions are append-only: an unchanged section maps to the same hash and is a no-op.
  if (snap.drafts.length) {
    await table("assignment_draft_revisions").upsert(snap.drafts as unknown as Row[], "project_id,section_id,content_hash");
  }
  if (snap.submission) {
    await table("assignment_submission_checks").upsert(snap.submission as unknown as Row, "project_id,report_hash");
  }

  // Source rows themselves are written by persistSourcesToSupabase; here only their channel and approval.
  const sources = table("project_sources");
  for (const s of snap.sourceOrigins) {
    await sources.update(`${pid}&source_id=eq.${encodeURIComponent(s.source_id)}`, {
      origin: s.origin,
      is_approved: s.is_approved,
    });
  }
}

const chains = new Map<string, Promise<void>>();

/** Fire-and-forget mirror of one saved Coursework project. */
export function mirrorAssignmentProject(record: ProjectRecord): void {
  if (process.env.NODE_ENV === "test") return;
  if (record.outputTypeId !== "OT-01") return;
  const config = getSupabaseRestConfig();
  if (!config) return;
  const prev = chains.get(record.projectId) ?? Promise.resolve();
  const next = prev
    .then(() => writeAssignmentSnapshot(config, record))
    .catch((err: unknown) => {
      console.warn(`Coursework relational mirror failed for ${record.projectId}:`, err instanceof Error ? err.message : err);
    });
  chains.set(record.projectId, next);
  void next.finally(() => {
    if (chains.get(record.projectId) === next) chains.delete(record.projectId);
  });
}
