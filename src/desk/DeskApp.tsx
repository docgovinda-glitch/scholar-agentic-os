import { useCallback, useEffect, useState, lazy, Suspense } from "react";
import { LiveAiStatusDock } from "./ai/LiveAiStatusDock";
import { Routes, Route, Navigate, Outlet, useNavigate, useLocation, useParams, useOutletContext } from "react-router-dom";
import { RequireAuth, PublicOnly, RequireRecovery, RequireOnboarding } from "./DeskAuthGate";
import {
  LandingRoute,
  SignInRoute,
  SignUpRoute,
  ForgotRoute,
  RecoverRoute,
  RegisteredRoute,
  ResendVerificationRoute,
  VerifyEmailRoute,
  OnboardingRoute,
} from "./auth/AuthFlow";
import type { DeskShellView } from "./DeskShell";
import type { ResearchStage } from "./workspace/types";
import { STAGE_MAP } from "./workspace/types";
import { getProject, UnauthenticatedError, getMigratedDraftRealId, createEphemeralProject } from "./api";
import { useAiSetupStatus } from "./setup/useAiSetupStatus";
import { useVaultSetupStatus } from "./setup/useVaultSetupStatus";
import { useDeskSession } from "./useDeskSession";
import { normalizeOutputTypeId } from "../app/atlas/legacyIds";
import { useDeviceClass } from "../hooks/useDeviceClass";
import type { SectionId } from "./aiAccess/AiAccessPage";
import GlobalLoader from "./components/GlobalLoader";
import SyncToast from "./components/SyncToast";
import { LoadingProvider } from "./context/LoadingContext";

// Lazy loaded heavy screens
const AccountSettingsScreen = lazy(() => import("./account/AccountSettingsScreen"));
const AiAccessPage = lazy(() => import("./aiAccess/AiAccessPage"));
const DeskShell = lazy(() => import("./DeskShell"));
const ResearchWorkspace = lazy(() => import("./workspace/ResearchWorkspace"));
const AssignmentWorkspace = lazy(() => import("./assignment/AssignmentWorkspace"));
const ThesisWorkspace = lazy(() => import("./thesis/ThesisWorkspace"));
const ProposalWorkspace = lazy(() => import("./proposal/ProposalWorkspace"));
const PresentationWorkspace = lazy(() => import("./presentation/PresentationWorkspace"));
const ProjectListScreen = lazy(() => import("./ProjectListScreen"));
const VaultSetupScreen = lazy(() => import("./setup/VaultSetupScreen"));
const VaultScreen = lazy(() => import("./vault/VaultScreen"));

import type { AssignmentStage } from "./assignment/types";
import { ASSIGNMENT_STAGES } from "./assignment/types";

const SECTION_IDS: readonly SectionId[] = ["overview", "providers", "subscription", "preferences"];

function isSectionId(value: string | undefined): value is SectionId {
  return SECTION_IDS.includes(value as SectionId);
}

function normalizeSectionId(sec?: string): SectionId {
  if (!sec) return "overview";
  if (sec === "overview") return "overview";
  if (sec === "providers" || sec === "local" || sec === "free" || sec === "byok") return "providers";
  if (sec === "subscription" || sec === "premium") return "subscription";
  if (sec === "preferences" || sec === "models" || sec === "settings") return "preferences";
  return "overview";
}

const DESK_SHELL_VIEWS: readonly DeskShellView[] = ["definition", "requirements", "document", "evidence", "manuscript", "progress", "submissions"];

function isDeskShellView(value: string | undefined): value is DeskShellView {
  return DESK_SHELL_VIEWS.includes(value as DeskShellView);
}

function isResearchStage(value: string | undefined): value is ResearchStage {
  return !!value && STAGE_MAP.has(value as ResearchStage);
}

const ASSIGNMENT_STAGE_SET = new Set<string>(ASSIGNMENT_STAGES.map((s) => s.id));
function isAssignmentStage(value: string | undefined): value is AssignmentStage {
  return !!value && ASSIGNMENT_STAGE_SET.has(value);
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
 * Resolves root navigation: signed-in users navigate to /projects, unauthenticated visitors to ProjectsIndexRoute.
 */
function RootOrProjectsRoute() {
  const session = useDeskSession();
  if (session.status === "signed-in") {
    return <Navigate to="/projects" replace />;
  }
  return <ProjectsIndexRoute />;
}

function OnboardingGate() {
  const session = useDeskSession();
  const userId = session.status === "signed-in" ? session.userId : null;
  const aiSetup = useAiSetupStatus(userId);
  // Gated on AI setup being finished so the two stages cannot render at once,
  // and so the Vault query does not run before it is reachable.
  const vaultSetup = useVaultSetupStatus(userId, aiSetup.status === "ready");
  // Tracks the transition when onboarding completes to show initial greeting on the dashboard.
  const [justFinishedOnboarding, setJustFinishedOnboarding] = useState(false);

  if (session.status !== "signed-in") {
    return <Outlet />;
  }

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

  // Knowledge Vault setup step - optional, offered once during onboarding.
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
 * Projects dashboard route: displays project list, search, filter tabs, and creation modal.
 */
function ProjectsIndexRoute() {
  const navigate = useNavigate();
  const session = useDeskSession();
  const device = useDeviceClass();
  const outletCtx = useOutletContext<OnboardingContext | null>();
  const justFinishedOnboarding = outletCtx?.justFinishedOnboarding ?? false;
  const clearJustFinishedOnboarding = outletCtx?.clearJustFinishedOnboarding ?? (() => {});

  const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const effectiveUserId = session.status === "signed-in" ? session.userId : (isLocalhost ? "localhost-dev" : null);
  const effectiveUserEmail = session.status === "signed-in" ? session.email : (isLocalhost ? "localhost@scholar.internal" : null);

  return (
    <ProjectListScreen
      initialView="projects"
      userId={effectiveUserId}
      userEmail={effectiveUserEmail}
      onOpen={(id) => navigate(`/projects/${id}`)}
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
  const { projectId: urlProjectId, view } = useParams<{ projectId: string; view?: string }>();
  const [outputTypeId, setOutputTypeId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Auto-resolve migrated draft IDs to permanent database IDs
  const effectiveProjectId = (urlProjectId && getMigratedDraftRealId(urlProjectId)) || urlProjectId || "";

  // Synchronize route when project is committed to database
  useEffect(() => {
    if (urlProjectId && effectiveProjectId && effectiveProjectId !== urlProjectId) {
      navigate(`/projects/${effectiveProjectId}/${view || ""}`, { replace: true });
    }
  }, [urlProjectId, effectiveProjectId, view, navigate]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const handlePersisted = (e: Event) => {
      const custom = e as CustomEvent<{ draftId: string; realId: string; project: any }>;
      if (custom.detail && (custom.detail.draftId === urlProjectId || custom.detail.draftId === effectiveProjectId)) {
        navigate(`/projects/${custom.detail.realId}/${view || ""}`, { replace: true });
      }
    };
    window.addEventListener("scholar:project-persisted", handlePersisted);
    return () => window.removeEventListener("scholar:project-persisted", handlePersisted);
  }, [urlProjectId, effectiveProjectId, view, navigate]);

  useEffect(() => {
    if (urlProjectId === "new") {
      const search = new URLSearchParams(location.search);
      const format = search.get("format") || "OT-01";
      navigate(`/projects?newFormat=${format}`, { replace: true });
      return;
    }
    let active = true;
    const targetId = effectiveProjectId || urlProjectId;
    if (targetId) {
      getProject(targetId)
        .then((p) => {
          if (active) setOutputTypeId(normalizeOutputTypeId(p.outputTypeId));
        })
        .catch((e) => {
          if (active) {
            setError(
              e instanceof UnauthenticatedError
                ? "Your session has expired. Sign in again to continue."
                : e.message
            );
          }
        });
    }
    return () => {
      active = false;
    };
  }, [effectiveProjectId, urlProjectId, location.search, navigate]);

  const onDeskShellViewChange = useCallback(
    (next: DeskShellView, options?: { replace?: boolean }) => {
      const targetId = getMigratedDraftRealId(effectiveProjectId) || effectiveProjectId;
      navigate(`/projects/${targetId}/${next}`, options);
    },
    [navigate, effectiveProjectId]
  );

  const onResearchStageChange = useCallback(
    (next: ResearchStage, options?: { replace?: boolean }) => {
      const targetId = getMigratedDraftRealId(effectiveProjectId) || effectiveProjectId;
      navigate(`/projects/${targetId}/${next}`, options);
    },
    [navigate, effectiveProjectId]
  );

  const onAssignmentStageChange = useCallback(
    (next: AssignmentStage, options?: { replace?: boolean }) => {
      const targetId = getMigratedDraftRealId(effectiveProjectId) || effectiveProjectId;
      navigate(`/projects/${targetId}/${next}`, options);
    },
    [navigate, effectiveProjectId]
  );

  // Guaranteed by the route pattern (":projectId" only matches with a value)
  if (!urlProjectId && !effectiveProjectId) return <Navigate to="/projects" replace />;

  if (error) {
    const isEphemeralMissing = error.includes("ephemeral memory") || error.includes("Draft project");

    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)] p-6">
        <div className="flex flex-col items-center gap-5 max-w-md text-center p-8 bg-white dark:bg-ink-700 border border-neutral-200 dark:border-white/10 rounded-2xl shadow-sm">
          <div className="w-12 h-12 rounded-full bg-amber-500/10 text-amber-500 flex items-center justify-center">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <div>
            <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
              {isEphemeralMissing ? "Draft Session Expired" : "Unable to Open Project"}
            </h3>
            <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-1.5 leading-relaxed">
              {isEphemeralMissing
                ? "This draft session could not be located in temporary memory. You can start a fresh research assignment or review your saved projects."
                : error}
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center gap-2.5 w-full pt-1">
            {isEphemeralMissing && (
              <button
                type="button"
                onClick={() => {
                  const newDraft = createEphemeralProject("OT-01", "New Academic Assignment");
                  navigate(`/projects/${newDraft.projectId}/understand`, { replace: true });
                }}
                className="w-full sm:flex-1 rounded-xl bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 px-4 py-2.5 text-xs font-semibold hover:opacity-90 transition-opacity cursor-pointer"
              >
                Start New Assignment
              </button>
            )}
            <button
              type="button"
              onClick={() => navigate("/projects")}
              className="w-full sm:flex-1 rounded-xl border border-neutral-200 dark:border-white/10 px-4 py-2.5 text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
            >
              Back to your work
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!outputTypeId) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[color:var(--surface-canvas)]">
        <div className="flex items-center gap-3">
          <div className="spinner" />
          <span className="text-sm text-[color:var(--text-muted)] font-medium">Loading project...</span>
        </div>
      </div>
    );
  }

  const targetProjectId = effectiveProjectId || urlProjectId || "";

  if (outputTypeId === "OT-01" || outputTypeId === "OT-02") {
    return (
      <AssignmentWorkspace
        projectId={targetProjectId}
        initialStage={isAssignmentStage(view) ? view : null}
        onStageChange={onAssignmentStageChange}
        onClose={() => navigate("/projects")}
        onOpenAccountSettings={() => navigate("/settings", { state: { from: location.pathname } })}
        onOpenVault={() => navigate("/vault", { state: { from: location.pathname } })}
        onOpenAiAccess={() => navigate("/ai-access", { state: { from: location.pathname } })}
      />
    );
  }

  if (outputTypeId === "OT-07") {
    return (
      <ThesisWorkspace
        projectId={targetProjectId}
        onClose={() => navigate("/projects")}
        onOpenAccountSettings={() => navigate("/settings", { state: { from: location.pathname } })}
        onOpenVault={() => navigate("/vault", { state: { from: location.pathname } })}
        onOpenAiAccess={() => navigate("/ai-access", { state: { from: location.pathname } })}
      />
    );
  }

  if (outputTypeId === "OT-15") {
    return (
      <ProposalWorkspace
        projectId={targetProjectId}
        onClose={() => navigate("/projects")}
        onOpenAccountSettings={() => navigate("/settings", { state: { from: location.pathname } })}
        onOpenVault={() => navigate("/vault", { state: { from: location.pathname } })}
        onOpenAiAccess={() => navigate("/ai-access", { state: { from: location.pathname } })}
      />
    );
  }

  if (outputTypeId === "OT-22") {
    return (
      <PresentationWorkspace
        projectId={targetProjectId}
        onClose={() => navigate("/projects")}
        onOpenAccountSettings={() => navigate("/settings", { state: { from: location.pathname } })}
        onOpenVault={() => navigate("/vault", { state: { from: location.pathname } })}
        onOpenAiAccess={() => navigate("/ai-access", { state: { from: location.pathname } })}
      />
    );
  }

  if (outputTypeId === "OT-10") {
    return (
      <ResearchWorkspace
        projectId={targetProjectId}
        initialStage={isResearchStage(view) ? view : null}
        onStageChange={onResearchStageChange}
        onClose={() => navigate("/projects")}
        onOpenAccountSettings={() => navigate("/settings", { state: { from: location.pathname } })}
        onOpenVault={() => navigate("/vault", { state: { from: location.pathname } })}
        onOpenAiAccess={() => navigate("/ai-access", { state: { from: location.pathname } })}
      />
    );
  }

  return (
    <DeskShell
      projectId={targetProjectId}
      view={isDeskShellView(view) ? view : null}
      onViewChange={onDeskShellViewChange}
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
      onManagePremium={() => navigate("/ai-access/subscription", { replace: true })}
    />
  );
}

/** Knowledge Vault route: global cross-project literature repository. */
function VaultRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useDeskSession();
  const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  if (session.status !== "signed-in" && !isLocalhost) return null;
  const userId = session.status === "signed-in" ? session.userId : "localhost-dev";
  const userEmail = session.status === "signed-in" ? session.email : "localhost@scholar.internal";
  return (
    <ProjectListScreen
      initialView="vault"
      userId={userId}
      userEmail={userEmail}
      onOpen={(id) => navigate(`/projects/${id}`)}
      onOpenAccountSettings={() => navigate("/settings", { state: { from: "/vault" } })}
      onOpenVault={() => {}}
      onOpenAiAccess={() => navigate("/ai-access", { state: { from: "/vault" } })}
    />
  );
}

/**
 * AI Access route: provider configuration, BYOK credentials, and local runner discovery.
 */
function AiAccessRoute() {
  const navigate = useNavigate();
  const location = useLocation();
  const session = useDeskSession();
  const { section } = useParams<{ section?: string }>();
  const activeSection = normalizeSectionId(section);
  const isLocalhost = typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1");
  const userId = session.status === "signed-in" ? session.userId : (isLocalhost ? "localhost-dev" : null);
  const userEmail = session.status === "signed-in" ? session.email : (isLocalhost ? "localhost@scholar.internal" : null);
  return (
    <ProjectListScreen
      initialView="ai-access"
      userId={userId}
      userEmail={userEmail}
      aiAccessSection={activeSection}
      onAiAccessSectionChange={(next) => navigate(next === "overview" ? "/ai-access" : `/ai-access/${next}`)}
      onOpen={(id) => navigate(`/projects/${id}`)}
      onOpenAccountSettings={() => navigate("/settings", { state: { from: location.pathname } })}
      onOpenVault={() => navigate("/vault", { state: { from: location.pathname } })}
      onOpenAiAccess={() => {}}
    />
  );
}

/**
 * Root route tree for Desk application components.
 */
export default function DeskApp() {
  return (
    <div className="min-h-screen w-full bg-ink-850 text-neutral-200">
      <LoadingProvider>
        <Suspense fallback={<GlobalLoader />}>
          <Routes>
            <Route path="/" element={<RootOrProjectsRoute />} />
            <Route path="/signin" element={<RootOrProjectsRoute />} />
            <Route path="/signup" element={<RootOrProjectsRoute />} />
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
            <Route
              path="/presentation"
              element={
                <PresentationWorkspace
                  projectId="demo-presentation"
                  initialStep="understand"
                  onClose={() => {
                    if (typeof window !== "undefined") window.location.href = "/projects";
                  }}
                />
              }
            />
            <Route path="/*" element={<RequireAuth />}>
              <Route path="onboarding" element={<OnboardingRoute />} />
              <Route element={<RequireOnboarding />}>
                <Route element={<OnboardingGate />}>
                  <Route
                    path="presentation"
                    element={
                      <PresentationWorkspace
                        projectId="demo-presentation"
                        initialStep="understand"
                        onClose={() => {
                          if (typeof window !== "undefined") window.location.href = "/projects";
                        }}
                      />
                    }
                  />
                  <Route path="projects" element={<ProjectsIndexRoute />} />
                  <Route path="projects/:projectId" element={<ProjectRoute />} />
                  <Route path="projects/:projectId/:view" element={<ProjectRoute />} />
                  <Route path="settings" element={<SettingsRoute />} />
                  <Route path="vault" element={<VaultRoute />} />
                  <Route path="ai-access" element={<AiAccessRoute />} />
                  <Route path="ai-access/:section" element={<AiAccessRoute />} />
                  <Route path="agents" element={<Navigate to="/projects" replace />} />
                  <Route path="*" element={<Navigate to="/projects" replace />} />
                </Route>
              </Route>
            </Route>
          </Routes>
          <SyncToast />
          <LiveAiStatusDock />
        </Suspense>
      </LoadingProvider>
    </div>
  );
}
