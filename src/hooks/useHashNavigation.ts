import { useEffect } from "react";

export type ViewMode = "dashboard" | "workspace";
export type OnboardingStep = string;
export type ActiveTab = string;

const KNOWN_TABS = ["workspace", "vault", "agents", "publishing", "citation", "settings", "profile"];

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

  // Hash -> State synchronization (and browser back/forward handling)
  useEffect(() => {
    if (!user) {
      if (window.location.hash !== "" && window.location.hash !== "#login") {
        window.location.hash = "";
      }
      return;
    }

    const parseAndApplyHash = () => {
      const hash = window.location.hash || "#dashboard";

      if (hash.startsWith("#onboarding/")) {
        const step = hash.replace("#onboarding/", "");
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

    let targetHash = "#dashboard";
    if (onboardingStep !== "workshop") {
      targetHash = `#onboarding/${onboardingStep}`;
    } else if (viewMode === "dashboard") {
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
