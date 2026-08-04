import { useEffect, useRef } from "react";

export type ViewMode = "dashboard" | "workspace";
export type OnboardingStep = string;
export type ActiveTab = string;

// Must stay in sync with App.tsx's activeTab union and AppHeader's tab list —
// an unlisted tab is silently dropped by parseAndApplyHash below, so its
// deep link and its quick-jump dropdown entry both become no-ops.
const KNOWN_TABS = ["workspace", "vault", "agents", "publishing", "citation", "settings", "profile", "pocket"];

export interface UseHashNavigationParams {
  user: string | null;
  onboardingStep: OnboardingStep;
  setOnboardingStep: (step: OnboardingStep) => void;
  viewMode: ViewMode;
  setViewMode: (mode: ViewMode) => void;
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  // Navigation overhaul (docs/planning/navigation-scoping.md) — phase workflow
  // (A-I) and the settings sub-tabs previously had zero hash reflection, so
  // deep links / browser back-forward couldn't reach them. onRequestPhase is
  // a request, not a direct setter: App.tsx runs the honest invalid-transition
  // guard (canEnterPhase) before actually changing project.currentPhase, so a
  // crafted/stale deep link can't silently skip ahead.
  currentPhase: string;
  onRequestPhase: (phaseId: string) => void;
  settingsSubTab: string;
  setSettingsSubTab: (tab: string) => void;
}

/**
 * Encapsulates two-way URL hash <-> React state synchronization for history
 * navigation. Previously existed with zero live imports anywhere (App.tsx
 * had its own diverged inline copy) — found and fixed during the navigation
 * overhaul rather than left as a second dead file next to a rewritten inline
 * version. App.tsx retains ownership of every state value and passes it
 * (plus setters/requesters) in here.
 */
export function useHashNavigation(params: UseHashNavigationParams): void {
  const {
    user,
    onboardingStep,
    setOnboardingStep,
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab,
    currentPhase,
    onRequestPhase,
    settingsSubTab,
    setSettingsSubTab
  } = params;

  // Real bug found via a live-verified, recorded gap (docs/planning/navigation-scoping.md
  // progress log item 7) and reproduced directly in useHashNavigation.test.ts:
  // `user` starts null on the very first render of every fresh page load
  // (AuthProvider's own mount effect hasn't hydrated from localStorage yet —
  // this is unavoidable client-render timing, not a bug in AuthProvider), so
  // the old `if (!user) { wipe hash }` guard destroyed EVERY deep link before
  // authentication ever resolved, on every single page load. That's why the
  // phase-gate message never appeared on a deep link: the "D" segment was
  // gone before `onRequestPhase` was ever called with a real project. Fixed
  // by only wiping the hash on an actual logout (a real previous user going
  // to null), tracked via this ref — never on the initial not-yet-hydrated
  // state, which looks identical (`user === null`) but must not be treated
  // the same way.
  const previousUserRef = useRef(user);

  // Set on the render where authentication resolves, consumed by the
  // state -> hash effect below so the initial deep link isn't clobbered.
  const justAuthenticatedRef = useRef(false);
  if (user && !previousUserRef.current) {
    justAuthenticatedRef.current = true;
  }

  // Hash -> State synchronization (and browser back/forward handling)
  useEffect(() => {
    if (!user) {
      const wasLoggedIn = !!previousUserRef.current;
      previousUserRef.current = user;
      if (wasLoggedIn && window.location.hash !== "" && window.location.hash !== "#login") {
        window.location.hash = "";
      }
      return;
    }
    previousUserRef.current = user;

    const parseAndApplyHash = () => {
      const hash = window.location.hash || "#dashboard";

      if (hash.startsWith("#onboarding/")) {
        // Navigation overhaul Phase 2 — only the FIRST segment identifies the
        // onboarding step; anything after it (e.g. AISetupWizard's own
        // #onboarding/ai-setup/<mode>/<step>/<providers> sub-route) is owned
        // and parsed independently by the wizard component itself.
        const step = hash.replace("#onboarding/", "").split("/")[0];
        if (step === "login" || step === "ai-setup" || step === "knowledge-vault" || step === "workshop") {
          setOnboardingStep(step);
        }
      } else if (hash === "#dashboard") {
        setOnboardingStep("workshop");
        setViewMode("dashboard");
      } else if (hash.startsWith("#workspace/")) {
        const rest = hash.replace("#workspace/", "");
        const [tab, ...segments] = rest.split("/");
        if (!KNOWN_TABS.includes(tab)) {
          return;
        }
        setOnboardingStep("workshop");
        setViewMode("workspace");
        setActiveTab(tab);
        if (tab === "workspace" && segments[0]) {
          onRequestPhase(segments[0]);
        } else if (tab === "settings" && segments[0]) {
          setSettingsSubTab(segments[0]);
        }
      }
    };

    parseAndApplyHash();

    window.addEventListener("hashchange", parseAndApplyHash);
    return () => {
      window.removeEventListener("hashchange", parseAndApplyHash);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, setOnboardingStep]);

  // State -> Hash synchronization
  useEffect(() => {
    if (!user) return;

    // Both effects fire in the same commit on the render where `user`
    // hydrates from localStorage. The hash -> state effect above runs first
    // and *queues* setViewMode/setActiveTab, but this effect still closes
    // over the pre-hydration values (viewMode "dashboard", activeTab
    // "workspace"), so it used to immediately overwrite the address bar with
    // "#dashboard" — which then fired a hashchange that reset the state for
    // real. Every deep link into a tab was destroyed on load this way:
    // #workspace/vault, #workspace/publishing and #workspace/pocket all
    // landed on the dashboard, verified in a browser. Skipping this single
    // write lets the incoming hash win; from the next render on, state and
    // hash agree and this effect resumes normally.
    if (justAuthenticatedRef.current) {
      justAuthenticatedRef.current = false;
      return;
    }

    // Navigation overhaul Phase 2 — if we're already on the right onboarding
    // step, don't touch the hash: AISetupWizard.tsx owns any sub-route
    // segments after "#onboarding/ai-setup/" and writes them itself. Only
    // step in here when the onboarding step has genuinely changed (or there
    // are no sub-segments yet at all).
    if (onboardingStep !== "workshop") {
      const currentFirstSegment = window.location.hash.replace(/^#onboarding\//, "").split("/")[0];
      if (currentFirstSegment !== onboardingStep) {
        window.location.hash = `#onboarding/${onboardingStep}`;
      }
      return;
    }

    let targetHash = "#dashboard";
    if (viewMode === "dashboard") {
      targetHash = "#dashboard";
    } else if (activeTab === "workspace") {
      targetHash = `#workspace/workspace/${currentPhase}`;
    } else if (activeTab === "settings") {
      targetHash = `#workspace/settings/${settingsSubTab}`;
    } else {
      targetHash = `#workspace/${activeTab}`;
    }

    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, [user, onboardingStep, viewMode, activeTab, currentPhase, settingsSubTab]);
}
