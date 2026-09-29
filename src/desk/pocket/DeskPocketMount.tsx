import { useEffect, useState } from "react";
import PocketShell from "../../pocket/PocketShell";
import { listProjects } from "../api";
import { toPocketProjects } from "./toPocketProjects";
import type { PocketProject } from "../../pocket/types";
import { syncManager, type SyncStatus } from "../../services/offline/syncManager";

/**
 * Pocket's mount point for mobile viewports.
 *
 * Pocket serves as a streamlined mobile companion ("Approve, Read, Ask, Know")
 * tailored for on-the-go review, reading lists, and quick Copilot queries.
 */
export default function DeskPocketMount({ projectId }: { projectId: string | null }) {
  const [projects, setProjects] = useState<PocketProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>(syncManager.getStatus());
  const [pendingCount, setPendingCount] = useState<number>(0);

  useEffect(() => {
    const unsubscribe = syncManager.subscribe((status, pending) => {
      setSyncStatus(status);
      setPendingCount(pending);
    });

    let cancelled = false;
    syncManager
      .fetchProjectsWithOfflineFallback(async () => {
        const res = await listProjects();
        return res.items;
      })
      .then(({ items, isOffline }) => {
        if (!cancelled) {
          setProjects(toPocketProjects(items));
          if (isOffline) {
            setSyncStatus("offline");
          }
        }
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });

    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface-canvas)] p-6 text-center">
        <p role="alert" className="text-sm text-[color:var(--state-danger)]">
          {error}
        </p>
      </div>
    );
  }

  if (projects === null) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface-canvas)] text-sm text-[color:var(--text-muted)]">
        Loading your projects…
      </div>
    );
  }

  return (
    <div className="flex flex-col min-h-screen items-center justify-center bg-[color:var(--surface-canvas)] py-6 px-4">
      {syncStatus === "offline" && (
        <div className="w-full max-w-md mb-2 p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-600 dark:text-amber-400 text-xs flex items-center justify-between">
          <div className="flex items-center gap-1.5 font-medium">
            <span>📡</span>
            <span>Offline Mode (Cached Vault Active)</span>
          </div>
          {pendingCount > 0 && (
            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20">
              {pendingCount} Pending Sync
            </span>
          )}
        </div>
      )}

      {syncStatus === "syncing" && (
        <div className="w-full max-w-md mb-2 p-2 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-600 dark:text-sky-400 text-xs flex items-center gap-1.5 font-medium animate-pulse">
          <span>🔄</span>
          <span>Replaying queued offline actions…</span>
        </div>
      )}

      <PocketShell projectId={projectId ?? undefined} projects={projects} />
    </div>
  );
}
