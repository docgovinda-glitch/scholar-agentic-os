/**
 * Writing History — optional user-owned record of how a document was produced.
 * Spec: docs 32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §8.
 *
 * Rules (§8.4):
 * - Off by default; enabled explicitly
 * - Never transmitted automatically, to anyone, ever
 * - Not visible as a score or grade
 * - Never blocks any action
 * - Deletable at any time, in full
 * - Exportable by the user alone
 * - No institutional access, on any tier
 *
 * Current implementation: in-memory per-session. Phase 5 adds durable storage
 * via services/store once auth is wired end-to-end.
 */

import type { InterventionLevel } from "../../domain/language/types";

export interface WritingHistoryEntry {
  timestamp: Date;
  action: "refine" | "draft" | "submit";
  level?: InterventionLevel;
  passageId?: string;
  changesMade?: number;
  contentChangesMade?: number;
}

export interface WritingHistory {
  enabled: boolean;
  entries: WritingHistoryEntry[];
}

const sessionHistories = new Map<string, WritingHistory>();

export function getWritingHistory(sessionId: string): WritingHistory {
  if (!sessionHistories.has(sessionId)) {
    sessionHistories.set(sessionId, { enabled: false, entries: [] });
  }
  return sessionHistories.get(sessionId)!;
}

export function enableWritingHistory(sessionId: string): void {
  const history = getWritingHistory(sessionId);
  history.enabled = true;
}

export function disableWritingHistory(sessionId: string): void {
  const history = getWritingHistory(sessionId);
  history.enabled = false;
}

export function recordRefinement(
  sessionId: string,
  passageId: string,
  level: InterventionLevel,
  changesMade: number,
  contentChangesMade: number
): void {
  const history = getWritingHistory(sessionId);
  if (!history.enabled) return;

  history.entries.push({
    timestamp: new Date(),
    action: "refine",
    level,
    passageId,
    changesMade,
    contentChangesMade,
  });
}

export function recordSubmission(sessionId: string): void {
  const history = getWritingHistory(sessionId);
  if (!history.enabled) return;

  history.entries.push({
    timestamp: new Date(),
    action: "submit",
  });
}

export function clearWritingHistory(sessionId: string): void {
  const history = getWritingHistory(sessionId);
  history.entries = [];
}

export function summarizeWritingHistory(history: WritingHistory): string {
  if (!history.enabled || history.entries.length === 0) {
    return "";
  }

  const refinements = history.entries.filter((e) => e.action === "refine");
  const levelCounts = new Map<InterventionLevel, number>();

  for (const entry of refinements) {
    if (entry.level) {
      levelCounts.set(entry.level, (levelCounts.get(entry.level) ?? 0) + 1);
    }
  }

  const levels = Array.from(levelCounts.entries())
    .sort(([, a], [, b]) => b - a)
    .map(([level, count]) => `${level} (${count}×)`);

  const firstEntry = history.entries[0];
  const lastEntry = history.entries[history.entries.length - 1];
  const timeRange = `${firstEntry.timestamp.toLocaleDateString()} to ${lastEntry.timestamp.toLocaleDateString()}`;

  return `Writing History: ${refinements.length} refinements (${levels.join(", ")}) from ${timeRange}`;
}
