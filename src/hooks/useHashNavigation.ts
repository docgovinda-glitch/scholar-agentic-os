import { useEffect } from "react";

export type ViewMode = "dashboard" | "workspace";
export type OnboardingStep = string;
export type ActiveTab = string;

/**
 * Encapsulates two-way URL hash <-> React state synchronization for history navigation:
 * - hash -> state (on hashchange / mount): onboarding step, view mode, active tab
 * - state -> hash: reflects onboardingStep / viewMode / activeTab into window.location.hash
 * - browser back/forward handling via the hashchange listener
 *
 * App.tsx retains ownership of the state values and passes them (plus setters) in.
 */
export function useHashNavigation(
  user: string | null,
  onboardingStep: OnboardingStep,
  setOnboardingStep: React.Dispatch<React.SetStateAction<OnboardingStep>>,
  viewMode: ViewMode,
  setViewMode: React.Dispatch<React.SetStateAction<ViewMode>>,
  activeTab: ActiveTab,
  setActiveTab: React.Dispatch<React.SetStateAction<ActiveTab>>
): void {
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
      console.log("[Hash Navigation] Applying hash:", hash);

      if (hash.startsWith("#onboarding/")) {
        const step = hash.replace("#onboarding/", "");
        if (step === "login" || step === "ai-setup" || step === "knowledge-vault" || step === "workshop") {
          setOnboardingStep(step as any);
        }
      } else if (hash === "#dashboard") {
        setOnboardingStep("workshop");
        setViewMode("dashboard");
      } else if (hash.startsWith("#workspace/")) {
        const tab = hash.replace("#workspace/", "");
        setOnboardingStep("workshop");
        setViewMode("workspace");
        if (["workspace", "vault", "agents", "publishing", "citation", "settings", "profile"].includes(tab)) {
          setActiveTab(tab as any);
        }
      }
    };

    parseAndApplyHash();

    window.addEventListener("hashchange", parseAndApplyHash);
    return () => {
      window.removeEventListener("hashchange", parseAndApplyHash);
    };
  }, [user, setOnboardingStep]);

  // State -> Hash synchronization
  useEffect(() => {
    if (!user) return;

    let targetHash = "#dashboard";
    if (onboardingStep !== "workshop") {
      targetHash = `#onboarding/${onboardingStep}`;
    } else if (viewMode === "dashboard") {
      targetHash = "#dashboard";
    } else {
      targetHash = `#workspace/${activeTab}`;
    }

    if (window.location.hash !== targetHash) {
      window.location.hash = targetHash;
    }
  }, [user, onboardingStep, viewMode, activeTab]);
}
