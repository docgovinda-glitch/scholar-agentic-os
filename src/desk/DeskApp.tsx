import { useEffect, useState } from "react";
import DeskAuthGate from "./DeskAuthGate";
import DeskShell from "./DeskShell";
import ProjectListScreen from "./ProjectListScreen";
import AiSetupScreen from "./setup/AiSetupScreen";
import { useAiSetupStatus } from "./setup/useAiSetupStatus";
import { useDeskSession } from "./useDeskSession";

function readProjectIdFromUrl(): string | null {
  return new URLSearchParams(window.location.search).get("project");
}

/**
 * Entry point for Desk — the client the product is consolidating onto
 * (docs 20/21/22).
 *
 * Two things changed when Desk was promoted from an orphaned demo to the
 * client that will replace src/App.tsx:
 *
 *  1. It renders behind DeskAuthGate. It previously mounted outside any auth
 *     provider, against endpoints that required none.
 *  2. Its entry surface is the user's own project list, not a bare create
 *     form. Reaching a project used to mean already knowing its id.
 *
 * Still no router library: Desk has two states — list and project — keyed off
 * one `?project=` param. `popstate` is handled so Back works, which was the
 * real gap; a router earns its place when there is a third destination.
 */
function DeskRoutes() {
  const session = useDeskSession();
  const userId = session.status === "signed-in" ? session.userId : null;
  const aiSetup = useAiSetupStatus(userId);
  const [projectId, setProjectId] = useState<string | null>(readProjectIdFromUrl);

  // Keep component state and the URL in step when the user presses Back or
  // Forward. Without this, going back from a project left the URL on the list
  // while the shell stayed mounted.
  useEffect(() => {
    const onPopState = () => setProjectId(readProjectIdFromUrl());
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  function open(id: string) {
    const url = new URL(window.location.href);
    url.searchParams.set("project", id);
    window.history.pushState({}, "", url);
    setProjectId(id);
  }

  function close() {
    const url = new URL(window.location.href);
    url.searchParams.delete("project");
    window.history.pushState({}, "", url);
    setProjectId(null);
  }

  // AI setup sits between signing in and the workspace (docs 25 §1). It is
  // skippable: skipping leaves the editor fully usable with the AI features
  // inert, which is a real choice rather than a broken state.
  if (aiSetup.status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)]">
        <p className="text-sm text-[color:var(--text-muted)]">Loading your workspace…</p>
      </div>
    );
  }
  if (aiSetup.status === "needed") {
    return <AiSetupScreen onDone={aiSetup.complete} onSkip={aiSetup.skip} />;
  }

  if (!projectId) {
    return (
      <ProjectListScreen onOpen={open} userEmail={session.status === "signed-in" ? session.email : null} />
    );
  }
  return <DeskShell projectId={projectId} onClose={close} />;
}

export default function DeskApp() {
  return (
    <DeskAuthGate>
      <DeskRoutes />
    </DeskAuthGate>
  );
}
