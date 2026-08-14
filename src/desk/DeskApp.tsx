import { useCallback, useState } from "react";
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation, useParams, useOutletContext } from "react-router-dom";
import AccountSettingsScreen from "./account/AccountSettingsScreen";
import AiAccessPage, { type SectionId } from "./aiAccess/AiAccessPage";
import { RequireAuth, PublicOnly, RequireRecovery } from "./DeskAuthGate";
import {
  LandingRoute,
  SignInRoute,
  SignUpRoute,
  ForgotRoute,
  RecoverRoute,
  RegisteredRoute,
  ResendVerificationRoute,
  VerifyEmailRoute,
} from "./auth/AuthFlow";
import DeskShell, { type DeskShellView } from "./DeskShell";
import ProjectListScreen from "./ProjectListScreen";
import VaultSetupScreen from "./setup/VaultSetupScreen";
import { useAiSetupStatus } from "./setup/useAiSetupStatus";
import { useVaultSetupStatus } from "./setup/useVaultSetupStatus";
import { useDeskSession } from "./useDeskSession";
import VaultScreen from "./vault/VaultScreen";
import DeskPocketMount from "./pocket/DeskPocketMount";
import { useDeviceClass } from "../hooks/useDeviceClass";

const SECTION_IDS: readonly SectionId[] = ["overview", "local", "free", "byok", "premium", "models", "settings"];

function isSectionId(value: string | undefined): value is SectionId {
  return SECTION_IDS.includes(value as SectionId);
}

const DESK_SHELL_VIEWS: readonly DeskShellView[] = ["intake", "document", "evidence", "progress", "submissions"];

function isDeskShellView(value: string | undefined): value is DeskShellView {
  return DESK_SHELL_VIEWS.includes(value as DeskShellView);
}

/** Where to return to when closing Settings/Vault/AI Access — passed as router state on the way in, since these overlays aren't meant to grow their own history entries. */
interface CameFrom {
  from?: string;
}

function returnTo(location: ReturnType<typeof useLocation>): string {
  return (location.state as CameFrom | null)?.from ?? "/projects";
}

interface OnboardingContext {
  /** True for exactly the render right after onboarding finished — see OnboardingGate's doc comment. */
  justFinishedOnboarding: boolean;
  clearJustFinishedOnboarding: () => void;
}

/**
 * The forced interstitials between sign-in and the workspace (docs 25 §1):
 * Login -> AI Access (if never configured) -> Knowledge Vault (offered once)
 * -> everything else. Deliberately not routes of their own (see the plan's
 * "left as state" list) — whatever URL under RequireAuth the visitor is
 * headed to, these gate it exactly the same way DeskRoutes' early returns
 * used to, before any of /projects, /settings, /vault, /ai-access existed as
 * real destinations.
 */
function OnboardingGate() {
  const session = useDeskSession();
  const userId = session.status === "signed-in" ? session.userId : null;
  const aiSetup = useAiSetupStatus(userId);
  // Gated on AI setup being finished so the two stages cannot render at once,
  // and so the Vault query does not run before it is reachable.
  const vaultSetup = useVaultSetupStatus(userId, aiSetup.status === "ready");
  /**
   * Section 11: true for exactly the one transition out of the Knowledge
   * Vault stage (declined or completed) — Knowledge is always the last
   * onboarding gate before the workspace, so that transition is the single
   * place "onboarding just finished" is really true. A returning user whose
   * onboarding was already done in a past session never sees vaultSetup's
   * "offer" branch at all, so this never fires for them.
   */
  const [justFinishedOnboarding, setJustFinishedOnboarding] = useState(false);

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

  const context: OnboardingContext = {
    justFinishedOnboarding,
    clearJustFinishedOnboarding: () => setJustFinishedOnboarding(false),
  };
  return <Outlet context={context} />;
}

/**
 * Pocket (docs 23) is a deliberately narrower companion — Approve/Read/Ask/
 * Know, not a mobile port of intake forms or the editor — so it replaces the
 * whole mobile experience (list and open project alike) rather than nesting
 * inside DeskShell's desktop layout. Its own project-switching UI
 * (ProjectsTab) stays local state, same as before this migration — only the
 * outer list/project boundary now comes from the URL, the same one Desktop
 * uses, rather than a separately-read source.
 */
function ProjectsIndexRoute() {
  const navigate = useNavigate();
  const session = useDeskSession();
  const device = useDeviceClass();
  const { justFinishedOnboarding, clearJustFinishedOnboarding } = useOutletContext<OnboardingContext>();

  if (device.isMobile) return <DeskPocketMount projectId={null} />;

  return (
    <ProjectListScreen
      onOpen={(id) => navigate(`/projects/${id}`)}
      userEmail={session.status === "signed-in" ? session.email : null}
      onOpenAccountSettings={() => navigate("/settings", { state: { from: "/projects" } })}
      onOpenVault={() => navigate("/vault", { state: { from: "/projects" } })}
      onOpenAiAccess={() => navigate("/ai-access", { state: { from: "/projects" } })}
      showWelcome={justFinishedOnboarding}
      onWelcomeSeen={clearJustFinishedOnboarding}
    />
  );
}

function ProjectRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const device = useDeviceClass();
  const { projectId, view } = useParams<{ projectId: string; view?: string }>();
  // Stable across renders unless projectId itself changes — DeskShell's
  // load() takes a dependency on this, and a fresh identity every render
  // would re-trigger its project fetch on every unrelated re-render.
  const onViewChange = useCallback(
    (next: DeskShellView, options?: { replace?: boolean }) => {
      navigate(`/projects/${projectId}/${next}`, options);
    },
    [navigate, projectId]
  );
  // Guaranteed by the route pattern (":projectId" only matches with a value)
  // — this is TypeScript narrowing, not a real fallback path.
  if (!projectId) return <Navigate to="/projects" replace />;

  if (device.isMobile) return <DeskPocketMount projectId={projectId} />;

  return (
    <DeskShell
      projectId={projectId}
      view={isDeskShellView(view) ? view : null}
      onViewChange={onViewChange}
      onClose={() => navigate("/projects")}
      onOpenAccountSettings={() => navigate("/settings", { state: { from: location.pathname } })}
      onOpenVault={() => navigate("/vault", { state: { from: location.pathname } })}
      onOpenAiAccess={() => navigate("/ai-access", { state: { from: location.pathname } })}
    />
  );
}

/** Profile/account fields — never AI configuration, see AccountSettingsScreen's own header comment. Not URL-addressed like a project — there is nothing here worth bookmarking or reaching with Back on its own, so closing it returns to wherever it was opened from, not to a fixed destination. */
function SettingsRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  return (
    <AccountSettingsScreen
      onClose={() => navigate(returnTo(location))}
      onManagePremium={() => navigate("/ai-access/premium", { replace: true })}
    />
  );
}

/** A Vault is "your long-term library... across future projects" (docs 25 §6.2) — a peer destination to a project, not something folded inside one. */
function VaultRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useDeskSession();
  const userId = session.status === "signed-in" ? session.userId : null;
  // Guaranteed by RequireAuth (this only renders signed-in) — narrowing only.
  if (!userId) return null;
  return <VaultScreen userId={userId} onClose={() => navigate(returnTo(location))} />;
}

/**
 * AI Access (Section 20), revisited — "manage" mode (the default): every
 * provider/model/Premium control a user needs, reached from a nav item
 * rather than the onboarding gate in OnboardingGate. The SAME page that gate
 * renders for a first-time user, just in "manage" instead of "onboarding"
 * mode, so there is exactly one AI-configuration surface, not two that could
 * drift apart.
 */
function AiAccessRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const { section } = useParams<{ section?: string }>();
  const activeSection = isSectionId(section) ? section : "overview";
  return (
    <AiAccessPage
      onClose={() => navigate(returnTo(location))}
      section={activeSection}
      onSectionChange={(next) => navigate(next === "overview" ? "/ai-access" : `/ai-access/${next}`)}
    />
  );
}

/**
 * Root route tree for everything except /admin/* (see main.tsx).
 *
 * Every screen Desk can show now has its own URL — Back/Forward/refresh/
 * direct-link all work the way they would for any other web app. The public
 * auth routes fix the originally reported bug (clicking "Get Started" used
 * to change only in-memory state, invisible to Back/Forward/refresh); the
 * authenticated ones below (project list, an open project, Settings, Vault,
 * AI Access) retire the old `?project=` query param + manual pushState/
 * popstate scheme in favor of real nested routes.
 */
export default function DeskApp() {
  return (
    <Routes>
      <Route path="/" element={<PublicOnly><LandingRoute /></PublicOnly>} />
      <Route path="/signin" element={<PublicOnly><SignInRoute /></PublicOnly>} />
      <Route path="/signup" element={<PublicOnly><SignUpRoute /></PublicOnly>} />
      <Route path="/signup/check-email" element={<PublicOnly><RegisteredRoute /></PublicOnly>} />
      <Route path="/signup/resend" element={<PublicOnly><ResendVerificationRoute /></PublicOnly>} />
      <Route path="/reset-password" element={<PublicOnly><ForgotRoute /></PublicOnly>} />
      <Route
        path="/reset-password/confirm"
        element={
          <RequireRecovery>
            <RecoverRoute />
          </RequireRecovery>
        }
      />
      <Route path="/verify-email" element={<VerifyEmailRoute />} />
      <Route path="/*" element={<RequireAuth />}>
        <Route element={<OnboardingGate />}>
          <Route path="projects" element={<ProjectsIndexRoute />} />
          <Route path="projects/:projectId" element={<ProjectRoute />} />
          <Route path="projects/:projectId/:view" element={<ProjectRoute />} />
          <Route path="settings" element={<SettingsRoute />} />
          <Route path="vault" element={<VaultRoute />} />
          <Route path="ai-access" element={<AiAccessRoute />} />
          <Route path="ai-access/:section" element={<AiAccessRoute />} />
          <Route path="*" element={<Navigate to="/projects" replace />} />
        </Route>
      </Route>
    </Routes>
  );
}
