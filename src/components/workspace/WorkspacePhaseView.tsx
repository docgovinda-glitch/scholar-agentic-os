import React from "react";
import { WORKFLOW_PHASES, PaperProject } from "../../types";
import ErrorBoundary from "../ErrorBoundary";
import ResearchIntakeWizard from "../ResearchIntakeWizard";
import GroundingMapDisplay from "../GroundingMapDisplay";
import DataDiscoveryPanel from "../DataDiscoveryPanel";
import JournalDiscoveryPanel from "../JournalDiscoveryPanel";
import ComplianceChecklistPanel from "../ComplianceChecklistPanel";
import ManuscriptDraftingWorkspace from "../ManuscriptDraftingWorkspace";
import QualityControlSuite from "../QualityControlSuite";
import QCBasedRedraftingSuite from "../QCBasedRedraftingSuite";
import ManuscriptEditorWorkspace from "../ManuscriptEditorWorkspace";
import SubmissionPackagingSuite from "../SubmissionPackagingSuite";

// Subcomponent: Research Workspace Phase View — phase timeline sidebar + current-phase panel rendering.
// Purely presentational: App.tsx owns all state and passes it through props.
export interface WorkspacePhaseViewProps {
  onboardingStep: string;
  viewMode: "dashboard" | "workspace";
  activeTab: string;
  project: PaperProject | null;
  updateProject: (fields: Partial<PaperProject>) => void;
  intakeProgress: number;
  handlePhaseChange: (phase: string) => void;
  setActiveTab: (tab: string) => void;
  navigateNext: () => void;
  navigateBack: () => void;
  isFocusMode: boolean;
  setIsFocusMode: (value: boolean | ((prev: boolean) => boolean)) => void;
}

export default function WorkspacePhaseView({
  onboardingStep,
  viewMode,
  activeTab,
  project,
  updateProject,
  intakeProgress,
  handlePhaseChange,
  setActiveTab,
  navigateNext,
  navigateBack,
  isFocusMode,
  setIsFocusMode
}: WorkspacePhaseViewProps) {
  if (!(onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "workspace")) {
    return null;
  }

  return (
    <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
      {/* Sidebar Phase-Timeline Graph */}
      <div className="w-full lg:w-64 shrink-0 bg-white border border-[#E5E7EB] rounded-2xl p-4 shadow-sm relative overflow-hidden">
        <h3 className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#1A365D] mb-4 select-none pb-2 border-b border-[#E5E7EB]">
          Research Phases
        </h3>
        <div className="relative flex flex-col gap-5 pl-1.5">
          {/* Connecting Track Line */}
          <div className="absolute left-[20px] top-4 bottom-4 w-[2px] bg-slate-100" />
          
          {WORKFLOW_PHASES.map((ph, idx) => {
            const isActive = project.currentPhase === ph.id;
            const isPast = WORKFLOW_PHASES.findIndex((p) => p.id === project.currentPhase) > idx;
            
            return (
              <button
                key={ph.id}
                onClick={() => handlePhaseChange(ph.id)}
                className="flex items-start gap-3 group transition-all text-left relative cursor-pointer z-10"
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-[10px] font-mono font-bold shrink-0 transition-all duration-300 z-10 ${
                    isActive
                      ? "bg-[#1A365D] text-white border-2 border-[#1A365D] ring-4 ring-[#1A365D]/15 shadow-[#1A365D]/30 shadow-md animate-pulse font-bold"
                      : isPast
                      ? "bg-emerald-500 text-white border-2 border-emerald-500 shadow-md shadow-emerald-500/20 font-bold"
                      : "bg-white text-gray-400 border border-[#E5E7EB] hover:bg-gray-50 font-normal"
                  }`}
                >
                  {ph.id}
                </div>
                <div className="flex flex-col">
                  <span
                    className={`text-[11px] font-mono leading-none tracking-wider uppercase font-semibold transition-colors duration-200 ${
                      isActive ? "text-[#1A365D]" : isPast ? "text-emerald-700" : "text-gray-400 group-hover:text-gray-500"
                    }`}
                  >
                    {ph.name}
                  </span>
                  <span className="text-[9px] text-gray-400 mt-0.5 line-clamp-1">{ph.desc}</span>
                </div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Main Panel Content */}
      <div className="flex-grow w-full rounded-3xl p-5 md:p-6 shadow-sm border border-[#E5E7EB] bg-[#FFFFFF] min-h-[500px]">
        <ErrorBoundary>
          {project.currentPhase === "A" && (
            <ResearchIntakeWizard
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              intakeProgress={intakeProgress}
              onOpenVault={() => setActiveTab("vault")}
            />
          )}
          {project.currentPhase === "B" && (
            <GroundingMapDisplay
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              onBack={navigateBack}
            />
          )}
          {project.currentPhase === "C" && (
            <DataDiscoveryPanel
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              onBack={navigateBack}
            />
          )}
          {project.currentPhase === "D" && (
            <JournalDiscoveryPanel
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              onBack={navigateBack}
            />
          )}
          {project.currentPhase === "E" && (
            <ComplianceChecklistPanel
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              onBack={navigateBack}
            />
          )}
          {project.currentPhase === "F" && (
            <ManuscriptDraftingWorkspace
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              onBack={navigateBack}
              isFocusMode={isFocusMode}
              onToggleFocusMode={() => setIsFocusMode((prev) => !prev)}
            />
          )}
          {project.currentPhase === "G" && (
            <QualityControlSuite
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              onBack={navigateBack}
            />
          )}
          {project.currentPhase === "G1" && (
            <QCBasedRedraftingSuite
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              onBack={navigateBack}
            />
          )}
          {project.currentPhase === "G2" && (
            <ManuscriptEditorWorkspace
              project={project}
              updateProject={updateProject}
              onNext={navigateNext}
              onBack={navigateBack}
              isFocusMode={isFocusMode}
              onToggleFocusMode={() => setIsFocusMode((prev) => !prev)}
            />
          )}
          {(project.currentPhase === "H" || project.currentPhase === "I") && (
            <SubmissionPackagingSuite
              project={project}
              updateProject={updateProject}
              onBack={navigateBack}
            />
          )}
        </ErrorBoundary>
      </div>
    </div>
  );
}
