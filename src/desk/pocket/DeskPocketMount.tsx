import { useEffect, useState } from "react";
import PocketShell from "../../pocket/PocketShell";
import { listProjects } from "../api";
import { toPocketProjects } from "./toPocketProjects";
import type { PocketProject } from "../../pocket/types";

/**
 * Pocket's mount point inside Desk (docs 23-MOBILE-WEB-UX-SPECIFICATION.md).
 *
 * Pocket previously only existed as a tab inside the legacy client
 * (src/App.tsx), fed by src/pocket/adapters.ts's translation from legacy's
 * PaperProject model. With legacy retired, Pocket had nowhere to mount at
 * all — this closes that gap using Desk's own project list directly, no
 * adapter needed since Pocket's PocketProject type already extends Desk's
 * own ProjectView (src/pocket/types.ts).
 *
 * Pocket is deliberately a narrower companion than the desktop DeskShell —
 * "Approve, Read, Ask, Know" (docs 23 §1), not a mobile port of intake forms
 * or the editor — so this replaces the whole mobile experience (both the
 * project list and an open project) rather than nesting inside DeskShell.
 */
export default function DeskPocketMount({ projectId }: { projectId: string | null }) {
  const [projects, setProjects] = useState<PocketProject[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    listProjects()
      .then((r) => {
        if (!cancelled) setProjects(toPocketProjects(r.items));
      })
      .catch((e) => {
        if (!cancelled) setError((e as Error).message);
      });
    return () => {
      cancelled = true;
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
    <div className="flex min-h-screen items-center justify-center bg-[color:var(--surface-canvas)] py-6">
      <PocketShell projectId={projectId ?? undefined} projects={projects} />
    </div>
  );
}
