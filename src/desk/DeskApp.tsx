import { useState } from "react";
import CreateProjectScreen from "./CreateProjectScreen";
import DeskShell from "./DeskShell";

function readProjectIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("project");
}

/**
 * Entry point for the new-architecture client (docs 20/21/22 — Desk).
 * Deliberately separate from src/App.tsx (the legacy client, still what
 * production serves) rather than replacing it — see main.tsx for the
 * pathname-based split. Nothing here touches src/components/,
 * src/services/aiGateway.ts, or the legacy /api/generate path; this talks
 * only to server/routes/project.ts's new-architecture endpoints.
 *
 * No router library: a single ?project=<id> query param is the only
 * "route" this slice has, in keeping with not adding a dependency for one
 * split. A real router is follow-up work once there's more than one screen
 * to navigate between within Desk itself.
 */
export default function DeskApp() {
  const [projectId, setProjectId] = useState<string | null>(readProjectIdFromUrl());

  function handleCreated(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", id);
    window.history.pushState({}, "", url);
    setProjectId(id);
  }

  if (!projectId) {
    return <CreateProjectScreen onCreated={handleCreated} />;
  }
  return <DeskShell projectId={projectId} />;
}
