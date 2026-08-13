import { useEffect, useState } from "react";
import AccountSettingsScreen from "./account/AccountSettingsScreen";
import AiAccessPage from "./aiAccess/AiAccessPage";
import DeskAuthGate from "./DeskAuthGate";
import DeskShell from "./DeskShell";
import ProjectListScreen from "./ProjectListScreen";
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
   * Revisiting Account Settings (profile/account fields — never AI
   * configuration, see AccountSettingsScreen's own header comment). Not
   * URL-addressed like `?project=` — there is nothing here worth bookmarking
   * or reaching with Back, and closing it should return to exactly whatever
   * was already on screen (list or project) rather than navigating anywhere.
   */
  const [accountSettingsOpen, setAccountSettingsOpen] = useState(false);
  /** Same reasoning as accountSettingsOpen — not URL-addressed, returns to exactly what was already on screen. */
  const [vaultOpen, setVaultOpen] = useState(false);
  /**
   * Revisiting AI Access (Section 20) after onboarding — the SAME page the
   * "needed" branch below renders for a first-time user, just in "manage"
   * mode instead of "onboarding" mode. One page, one connection model, two
   * entry points.
   */
  const [aiAccessOpen, setAiAccessOpen] = useState(false);
  /** Which AiAccessPage section to land on next open — "premium" when reached via Account Settings' "Upgrade to Premium" / "Manage Premium Plan" button, "overview" otherwise. */
  const [aiAccessSection, setAiAccessSection] = useState<"overview" | "premium">("overview");
  /**
   * Section 11: true for exactly the one transition out of the Knowledge
   * Vault stage (declined or completed) — Knowledge is always the last
   * onboarding gate before the workspace, so that transition is the single
   * place "onboarding just finished" is really true. A returning user whose
   * onboarding was already done in a past session never sees vaultSetup's
   * "offer" branch at all, so this never fires for them.
   */
  const [justFinishedOnboarding, setJustFinishedOnboarding] = useState(false);

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

  // AI Access sits between signing in and the workspace (docs 25 §1):
  // Login -> AI Access -> Knowledge Vault (optional) -> Workshop. It is
  // skippable: skipping leaves the editor fully usable with the AI features
  // inert, which is a real choice rather than a broken state. This is the
  // SAME AiAccessPage the "AI Access" nav item opens later — "onboarding"
  // mode only changes the header (Skip/Continue instead of Close) and adds
  // the progress strip; the connection data and every section are identical,
  // so there is exactly one AI-configuration surface, not two that could
  // drift apart.
  if (aiSetup.status === "checking") {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)]">
        <p className="text-sm text-[color:var(--text-muted)]">Loading your workspace…</p>
      </div>
    );
  }
  if (aiSetup.status === "needed") {
    return <AiAccessPage mode="onboarding" onContinue={aiSetup.complete} onSkip={aiSetup.skip} />;
  }

  // Knowledge Vault (docs 25 §6) — optional, and offered once. Declining is a
  // peer option, not a lesser one, and is remembered.
  if (vaultSetup.status === "offer") {
    return (
      <VaultSetupScreen
        onDone={() => {
          setJustFinishedOnboarding(true);
          vaultSetup.complete();
        }}
        onSkip={() => {
          setJustFinishedOnboarding(true);
          vaultSetup.skip();
        }}
      />
    );
  }

  // Account Settings (profile/account fields, never AI configuration) —
  // full-screen overlay, same treatment as Vault/AI Access below.
  if (accountSettingsOpen) {
    return (
      <AccountSettingsScreen
        onClose={() => setAccountSettingsOpen(false)}
        onManagePremium={() => {
          setAiAccessSection("premium");
          setAccountSettingsOpen(false);
          setAiAccessOpen(true);
        }}
      />
    );
  }

  // AI Access (Section 20), revisited — "manage" mode (the default): every
  // provider/model/Premium control a user needs, reached from the nav item
  // rather than the onboarding gate above.
  if (aiAccessOpen) {
    return (
      <AiAccessPage
        onClose={() => setAiAccessOpen(false)}
        initialSection={aiAccessSection}
      />
    );
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
        onOpenAccountSettings={() => setAccountSettingsOpen(true)}
        onOpenVault={() => setVaultOpen(true)}
        onOpenAiAccess={() => setAiAccessOpen(true)}
        showWelcome={justFinishedOnboarding}
        onWelcomeSeen={() => setJustFinishedOnboarding(false)}
      />
    );
  }
  return (
    <DeskShell
      projectId={projectId}
      onClose={close}
      onOpenAccountSettings={() => setAccountSettingsOpen(true)}
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
