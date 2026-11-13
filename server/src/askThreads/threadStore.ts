/**
 * Persistence for AskScholar conversation threads.
 *
 * Supabase (`ask_threads`, service role) when configured; otherwise a bounded in-process map so local
 * development still works. Callers pass the authenticated user's id: rows are only ever read or
 * written for that id. Merge rule is last-writer-wins per thread (newest `updatedAtIso`), never a union,
 * so a thread deleted on one device is not resurrected by another.
 */

import { z } from "zod";
import { getSupabaseRestConfig, SupabaseTable } from "../supabaseRest.ts";

export const MAX_THREADS_PER_USER = 30;
const MAX_THREAD_BYTES = 2_500_000;

const attachmentSchema = z.object({
  name: z.string().max(260),
  type: z.string().max(120).default(""),
  text: z.string().max(60_000),
});

export const threadSchema = z.object({
  id: z.string().min(1).max(80),
  title: z.string().max(200).default(""),
  updatedAt: z.string().max(40).default(""),
  updatedAtIso: z.string().max(40).optional(),
  citationStyle: z.string().max(40).optional(),
  messages: z.array(z.record(z.string(), z.unknown())).max(400),
  files: z.array(attachmentSchema).max(8).default([]),
});

export type AskThread = z.infer<typeof threadSchema>;

interface ThreadRow extends Record<string, unknown> {
  user_id: string;
  id: string;
  title: string;
  citation_style: string | null;
  messages: unknown[];
  files: unknown[];
  updated_at: string;
}

const memory = new Map<string, Map<string, AskThread>>();

function table(): SupabaseTable<ThreadRow> | null {
  const config = getSupabaseRestConfig();
  return config ? new SupabaseTable<ThreadRow>(config, "ask_threads") : null;
}

function rowToThread(row: ThreadRow): AskThread {
  return {
    id: row.id,
    title: row.title,
    updatedAt: "",
    updatedAtIso: row.updated_at,
    citationStyle: row.citation_style ?? undefined,
    messages: Array.isArray(row.messages) ? (row.messages as Array<Record<string, unknown>>) : [],
    files: Array.isArray(row.files) ? (row.files as AskThread["files"]) : [],
  };
}

export function parseThreads(input: unknown): { threads: AskThread[]; rejected: number } {
  const list = Array.isArray(input) ? input : [];
  const threads: AskThread[] = [];
  let rejected = 0;
  for (const raw of list) {
    const parsed = threadSchema.safeParse(raw);
    if (!parsed.success || JSON.stringify(parsed.data).length > MAX_THREAD_BYTES) {
      rejected++;
      continue;
    }
    threads.push(parsed.data);
  }
  return { threads, rejected };
}

export async function listThreads(userId: string): Promise<AskThread[]> {
  const t = table();
  if (!t) {
    return [...(memory.get(userId)?.values() ?? [])].sort((a, b) => (b.updatedAtIso ?? "").localeCompare(a.updatedAtIso ?? ""));
  }
  const rows = await t.select(`user_id=eq.${encodeURIComponent(userId)}&order=updated_at.desc&limit=${MAX_THREADS_PER_USER}`);
  return rows.map(rowToThread);
}

/** Saves threads, keeping the stored copy when it is newer than the incoming one. */
export async function saveThreads(userId: string, incoming: AskThread[]): Promise<AskThread[]> {
  const existing = await listThreads(userId);
  const stored = new Map(existing.map((t) => [t.id, t]));
  const toWrite: AskThread[] = [];
  for (const thread of incoming) {
    const prior = stored.get(thread.id);
    const when = thread.updatedAtIso ?? new Date().toISOString();
    if (prior && (prior.updatedAtIso ?? "") > when) continue;
    const next = { ...thread, updatedAtIso: when };
    toWrite.push(next);
    stored.set(thread.id, next);
  }

  const t = table();
  if (!t) {
    const bucket = memory.get(userId) ?? new Map<string, AskThread>();
    for (const thread of toWrite) bucket.set(thread.id, thread);
    const newest = [...bucket.values()].sort((a, b) => (b.updatedAtIso ?? "").localeCompare(a.updatedAtIso ?? "")).slice(0, MAX_THREADS_PER_USER);
    memory.set(userId, new Map(newest.map((x) => [x.id, x])));
  } else if (toWrite.length > 0) {
    await t.upsert(
      toWrite.map((th) => ({
        user_id: userId,
        id: th.id,
        title: th.title,
        citation_style: th.citationStyle ?? null,
        messages: th.messages,
        files: th.files,
        updated_at: th.updatedAtIso,
      })),
      "user_id,id"
    );
    // Keep only the newest MAX_THREADS_PER_USER: drop the oldest beyond the cap.
    const all = await t.select(`user_id=eq.${encodeURIComponent(userId)}&select=id,updated_at&order=updated_at.desc`);
    for (const stale of all.slice(MAX_THREADS_PER_USER)) {
      await t.delete(`user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(stale.id)}`);
    }
  }
  return listThreads(userId);
}

export async function deleteThread(userId: string, threadId: string): Promise<void> {
  const t = table();
  if (!t) {
    memory.get(userId)?.delete(threadId);
    return;
  }
  await t.delete(`user_id=eq.${encodeURIComponent(userId)}&id=eq.${encodeURIComponent(threadId)}`);
}

/** Test helper: clears the in-process fallback store. */
export function __resetThreadMemory(): void {
  memory.clear();
}
