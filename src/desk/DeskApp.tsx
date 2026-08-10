import { useEffect, useState } from "react";
import AiAccessPage from "./aiAccess/AiAccessPage";
import DeskAuthGate from "./DeskAuthGate";
import DeskShell from "./DeskShell";
import ProjectListScreen from "./ProjectListScreen";
import AiSetupScreen from "./setup/AiSetupScreen";
import VaultSetupScreen from "./setup/VaultSetupScreen";
import { useAiSetupStatus } from "./setup/useAiSetupStatus";
import { useVaultSetupStatus } from "./setup/useVaultSetupStatus";
import { useDeskSession } from "./useDeskSession";
import VaultScreen from "./vault/VaultScreen";
import DeskPocketMount from "./pocket/DeskPocketMount";
import { useDeviceClass } from "../hooks/useDeviceClass";

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
  const device = useDeviceClass();
  const aiSetup = useAiSetupStatus(userId);
  // Gated on AI setup being finished so the two stages cannot render at once,
  // and so the Vault query does not run before it is reachable.
  const vaultSetup = useVaultSetupStatus(userId, aiSetup.status === "ready");
  const [projectId, setProjectId] = useState<string | null>(readProjectIdFromUrl);
  /**
   * Revisiting AI settings after setup. Not URL-addressed like `?project=` —
   * there is nothing here worth bookmarking or reaching with Back, and
   * closing it should return to exactly whatever was already on screen
   * (list or project) rather than navigating anywhere.
   */
  const [settingsOpen, setSettingsOpen] = useState(false);
  /** Same reasoning as settingsOpen — not URL-addressed, returns to exactly what was already on screen. */
  const [vaultOpen, setVaultOpen] = useState(false);
  /** Same reasoning as settingsOpen/vaultOpen. */
  const [aiAccessOpen, setAiAccessOpen] = useState(false);

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

  // Knowledge Vault (docs 25 §6) — optional, and offered once. Declining is a
  // peer option, not a lesser one, and is remembered.
  if (vaultSetup.status === "offer") {
    return <VaultSetupScreen onDone={vaultSetup.complete} onSkip={vaultSetup.skip} />;
  }

  // Revisiting settings takes over the whole screen, same as the one-time
  // setup stages above, rather than opening as a panel over whatever was
  // showing — reusing AiSetupScreen's own full-screen shell rather than
  // building a second layout for the same form.
  if (settingsOpen) {
    return <AiSetupScreen variant="revisit" onDone={() => setSettingsOpen(false)} onCancel={() => setSettingsOpen(false)} />;
  }

  // AI Access (Section 20) — status view for Local/Free/BYOK/Premium. Same
  // full-screen-overlay treatment as settings/vault above.
  if (aiAccessOpen) {
    return <AiAccessPage onClose={() => setAiAccessOpen(false)} onOpenSetup={() => setSettingsOpen(true)} />;
  }

  // A Vault is "your long-term library... across future projects" (docs 25
  // §6.2) — a peer destination to a project, not something folded inside
  // one, the same reasoning that already moved AI settings off PaperProject.
  if (vaultOpen && userId) {
    return <VaultScreen userId={userId} onClose={() => setVaultOpen(false)} />;
  }

  // Pocket (docs 23) is a deliberately narrower companion — Approve/Read/Ask/
  // Know, not a mobile port of intake forms or the editor — so it replaces
  // the whole mobile experience (list and open project alike) rather than
  // nesting inside DeskShell's desktop layout.
  if (device.isMobile) {
    return <DeskPocketMount projectId={projectId} />;
  }

  if (!projectId) {
    return (
      <ProjectListScreen
        onOpen={open}
        userEmail={session.status === "signed-in" ? session.email : null}
        onOpenSettings={() => setSettingsOpen(true)}
        onOpenVault={() => setVaultOpen(true)}
        onOpenAiAccess={() => setAiAccessOpen(true)}
      />
    );
  }
  return (
    <DeskShell
      projectId={projectId}
      onClose={close}
      onOpenSettings={() => setSettingsOpen(true)}
      onOpenVault={() => setVaultOpen(true)}
      onOpenAiAccess={() => setAiAccessOpen(true)}
    />
  );
}

export default function DeskApp() {
  return (
    <DeskAuthGate>
      <DeskRoutes />
    </DeskAuthGate>
  );
}
