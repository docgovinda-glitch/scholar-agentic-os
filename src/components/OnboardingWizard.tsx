import React, { useState } from "react";
import { useAuth } from "../auth/authContext";
import { PaperProject, OnboardingStep } from "../types";
import { useProjectPersistence } from "../hooks/useProjectPersistence";
import UserProfileGate from "./UserProfileGate";
import AISetupWizard from "./AISetupWizard";
import KnowledgeVaultWizard from "./KnowledgeVaultWizard";
import {
  CheckCircle2,
  ChevronRight,
  GraduationCap,
  Key,
  BookOpen,
  Sparkles
} from "lucide-react";

const STEPS: { id: OnboardingStep; label: string; icon: React.ElementType }[] = [
  { id: "login", label: "Login / User Setup", icon: GraduationCap },
  { id: "ai-setup", label: "AI API Configuration", icon: Key },
  { id: "knowledge-vault", label: "Knowledge Vault", icon: BookOpen },
  { id: "workshop", label: "Launch Workshop", icon: Sparkles }
];

export default function OnboardingWizard() {
  const { user, project, onboardingStep, setOnboardingStep, logout, setProject, loginDirectly } = useAuth();

  const currentStepIndex = STEPS.findIndex(s => s.id === onboardingStep);

  // Navigation overhaul (docs/planning/navigation-scoping.md) — this used to
  // be its own separate, inline updateProject, entirely independent from
  // useProjectPersistence.ts's projectRef-based fix for the same-tick
  // stale-closure race that once silently dropped complianceRules. Two
  // updateProject calls in the same tick during onboarding could still hit
  // that exact bug through this parallel path even after the app-wide fix
  // shipped. Migrated onto the shared hook instead of duplicating the fix.
  // setViewMode/setActiveTab/allProjects/setAllProjects are no-ops/empty
  // here — onboarding has no view/tab/multi-project concept of its own, and
  // none of updateProject's own code path touches them.
  const [noopAllProjects, setNoopAllProjects] = useState<PaperProject[]>([]);
  const { updateProject } = useProjectPersistence(
    user,
    project,
    setProject,
    setNoopAllProjects,
    noopAllProjects,
    () => {},
    () => {}
  );

  const handleLoginSuccess = (username: string, projectState: PaperProject) => {
    loginDirectly(username, projectState);
    // After login, always go to ai-setup (loginDirectly resolves from stored profile;
    // for fresh users this will be "ai-setup", for returning users "workshop")
  };

  // Unified layout selection based on current onboardingStep
  let activeContent = null;
  if (onboardingStep === "login" || !user) {
    activeContent = <UserProfileGate onProfileActive={handleLoginSuccess} />;
  } else if (onboardingStep === "ai-setup") {
    activeContent = (
      <AISetupWizard
        project={project!}
        updateProject={updateProject}
        onComplete={(readiness) => {
          updateProject({
            currentPhase: "A",
            aiSettings: { ...(project!.aiSettings || {}), aiReadiness: readiness } as any
          });
          setOnboardingStep("knowledge-vault");
        }}
        onBack={() => {
          logout();
        }}
      />
    );
  } else if (onboardingStep === "knowledge-vault") {
    activeContent = (
      <KnowledgeVaultWizard
        project={project!}
        updateProject={updateProject}
        onComplete={() => {
          setOnboardingStep("workshop");
        }}
        onBack={() => {
          setOnboardingStep("ai-setup");
        }}
      />
    );
  } else {
    return null;
  }

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 blueprint-canvas relative">
      {/* Progress bar */}
      <OnboardingProgressBar currentIndex={currentStepIndex >= 0 ? currentStepIndex : 0} />
      <div className="grow flex items-center justify-center p-6 sm:p-12 z-10">
        <div className="w-full max-w-4xl">
          {activeContent}
        </div>
      </div>
    </div>
  );
}

function OnboardingProgressBar({ currentIndex }: { currentIndex: number }) {
  return (
    <div className="bg-white/90 backdrop-blur-md border-b border-gray-150 px-6 py-4 shrink-0 shadow-xs sticky top-0 z-50">
      <div className="max-w-4xl mx-auto">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <GraduationCap className="w-5 h-5 text-[#1A365D]" />
            <span className="text-sm font-serif font-bold text-[#1A365D]">Scholar Agentic OS — Setup Wizard</span>
          </div>
          <span className="text-[10px] font-mono text-[#946A30] font-bold uppercase tracking-wider">
            Step {currentIndex + 1} of {STEPS.length}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {STEPS.map((step, idx) => {
            const Icon = step.icon;
            const isPast = idx < currentIndex;
            const isCurrent = idx === currentIndex;
            return (
              <React.Fragment key={step.id}>
                <div className="flex items-center gap-1.5">
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-mono font-bold transition-all duration-350 ${
                    isCurrent
                      ? "bg-[#1A365D] text-white ring-4 ring-[#1A365D]/10"
                      : isPast
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : "bg-gray-50 text-gray-400 border border-gray-200"
                  }`}>
                    {isPast ? <CheckCircle2 className="w-3.5 h-3.5" /> : idx + 1}
                  </div>
                  <span className={`text-[10px] font-mono font-bold uppercase tracking-wider hidden sm:inline ${
                    isCurrent ? "text-[#1A365D]" : isPast ? "text-emerald-700" : "text-gray-400"
                  }`}>
                    {step.label.split(" / ")[0]}
                  </span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div className={`grow h-[2px] rounded transition-colors duration-350 ${isPast ? "bg-emerald-500" : "bg-gray-250/50"}`} />
                )}
              </React.Fragment>
            );
          })}
        </div>
      </div>
    </div>
  );
}
