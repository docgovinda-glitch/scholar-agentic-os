/**
 * Cross-Session & Cross-Device Persistence for AskScholar Conversation Threads.
 *
 * Dual-tier storage:
 * 1. Instant local persistence in `localStorage` (a per-account key; guests use the unscoped key).
 * 2. Authenticated server synchronization (`/api/ai/threads`) backed by server store / Supabase
 *    so a researcher's multi-turn literature reviews, CSL-JSON references, excluded sources,
 *    and Deep Research plans follow them across sessions and devices.
 */

import type { WebsiteAssistantMessage } from "../desk/dashboard/types";
import { getSupabaseClient, isSupabaseConfigured } from "./supabaseClient";

export interface AskScholarAttachedFile {
  name: string;
  type: string;
  /** Extracted text, so a follow-up or a workspace hand-off never needs the upload again. */
  text: string;
}

export interface AskScholarConversationThread {
  id: string;
  title: string;
  updatedAt: string;
  updatedAtIso?: string;
  citationStyle?: string;
  messages: WebsiteAssistantMessage[];
  files?: AskScholarAttachedFile[];
}

const BASE_STORAGE_KEY = "scholar_ask_threads_v1";
const MAX_THREADS = 30;

function getScopedKey(userEmail?: string | null): string {
  const clean = (userEmail || "").trim().toLowerCase();
  return clean ? `${BASE_STORAGE_KEY}:${clean}` : BASE_STORAGE_KEY;
}

export function loadLocalAskScholarThreads(
  userEmail?: string | null
): AskScholarConversationThread[] {
  try {
    // Signed in: only this account's own key. The unscoped key belongs to guest use and is never
    // shown to (or written by) a signed-in account, so accounts on one browser cannot see each other.
    const raw = localStorage.getItem(getScopedKey(userEmail));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed.slice(0, MAX_THREADS);
    }
  } catch {
    // ignore storage parse failure
  }
  return [];
}

export function saveLocalAskScholarThreads(
  threads: AskScholarConversationThread[],
  userEmail?: string | null
): void {
  const capped = threads.slice(0, MAX_THREADS);
  try {
    localStorage.setItem(getScopedKey(userEmail), JSON.stringify(capped));
  } catch {
    // ignore quota errors
  }
}

export function mergeAskScholarThreads(
  localThreads: AskScholarConversationThread[],
  remoteThreads: AskScholarConversationThread[]
): AskScholarConversationThread[] {
  const byId = new Map<string, AskScholarConversationThread>();

  for (const t of [...remoteThreads, ...localThreads]) {
    if (!t || !t.id || !Array.isArray(t.messages)) continue;
    const existing = byId.get(t.id);
    if (!existing) {
      byId.set(t.id, t);
      continue;
    }
    // Newest write wins, so a deleted-then-recreated or edited thread is never overwritten by a stale copy.
    if ((t.updatedAtIso || "") > (existing.updatedAtIso || "")) byId.set(t.id, t);
  }

  return Array.from(byId.values())
    .sort((a, b) => (b.updatedAtIso || "").localeCompare(a.updatedAtIso || ""))
    .slice(0, MAX_THREADS);
}

async function buildAuthHeaders(): Promise<Record<string, string>> {
  const headers: Record<string, string> = { "Content-Type": "application/json" };
  if (isSupabaseConfigured()) {
    try {
      const { data } = await getSupabaseClient().auth.getSession();
      const token = data?.session?.access_token?.replace(/[^\x20-\x7E]/g, "").trim();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {
      // ignore
    }
  }
  return headers;
}

export async function fetchAskScholarThreadsFromServer(
  userEmail?: string | null,
  options: { allowInTest?: boolean } = {}
): Promise<AskScholarConversationThread[]> {
  if (!userEmail) return [];
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.MODE === "test" &&
    !options.allowInTest
  ) {
    return [];
  }

  try {
    const headers = await buildAuthHeaders();
    // No session token means the server would answer 401 (a console error and a wasted round trip).
    if (!headers["Authorization"]) return [];
    const res = await fetch("/api/ai/threads", {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(4000),
    });
    if (!res.ok) return [];
    const data = (await res.json()) as { threads?: AskScholarConversationThread[] };
    return Array.isArray(data.threads) ? data.threads.slice(0, MAX_THREADS) : [];
  } catch {
    return [];
  }
}

export async function syncAskScholarThreadsToServer(
  threads: AskScholarConversationThread[],
  userEmail?: string | null,
  options: { allowInTest?: boolean } = {}
): Promise<boolean> {
  if (!userEmail || !Array.isArray(threads) || threads.length === 0) return false; // deletions use deleteAskScholarThreadOnServer
  if (
    typeof import.meta !== "undefined" &&
    import.meta.env?.MODE === "test" &&
    !options.allowInTest
  ) {
    return false;
  }

  try {
    const headers = await buildAuthHeaders();
    if (!headers["Authorization"]) return false;
    const res = await fetch("/api/ai/threads", {
      method: "POST",
      headers,
      body: JSON.stringify({ threads: threads.slice(0, MAX_THREADS) }),
      signal: AbortSignal.timeout(4500),
    });
    return res.ok;
  } catch {
    return false;
  }
}


export async function deleteAskScholarThreadOnServer(
  threadId: string,
  userEmail?: string | null,
  options: { allowInTest?: boolean } = {}
): Promise<boolean> {
  if (!userEmail || !threadId) return false;
  if (typeof import.meta !== "undefined" && import.meta.env?.MODE === "test" && !options.allowInTest) {
    return false;
  }
  try {
    const headers = await buildAuthHeaders();
    if (!headers["Authorization"]) return false;
    const res = await fetch(`/api/ai/threads/${encodeURIComponent(threadId)}`, {
      method: "DELETE",
      headers,
      signal: AbortSignal.timeout(4500),
    });
    return res.ok;
  } catch {
    return false;
  }
}

const MAX_THREAD_FILES = 8;
const MAX_FILE_TEXT = 60_000;

/** Adds newly attached documents to a conversation's files (same name replaces); returns the same array when nothing changed. */
export function mergeThreadFiles(
  current: AskScholarAttachedFile[],
  incoming: Array<{ name: string; text: string; type?: string }>
): AskScholarAttachedFile[] {
  const fresh = incoming.filter((f) => f && f.name && typeof f.text === "string" && f.text.trim());
  if (fresh.length === 0) return current;
  const byName = new Map(current.map((f) => [f.name, f]));
  for (const f of fresh) {
    byName.set(f.name, { name: f.name, type: f.type ?? "", text: f.text.slice(0, MAX_FILE_TEXT) });
  }
  return [...byName.values()].slice(-MAX_THREAD_FILES);
}
