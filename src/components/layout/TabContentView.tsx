import React from "react";
import { Award, FileSpreadsheet, BookOpenCheck, FileText } from "lucide-react";
import { PaperProject } from "../../types";
import KnowledgeVaultManager from "../KnowledgeVaultManager";
import VedicDatabase from "../VedicDatabase";
import ActiveAgentsPanel from "../agents/ActiveAgentsPanel";
import JournalDiscoveryPanel from "../JournalDiscoveryPanel";
import SubmissionPackagingSuite from "../SubmissionPackagingSuite";
import DataDiscoveryPanel from "../DataDiscoveryPanel";
import ComplianceChecklistPanel from "../ComplianceChecklistPanel";
import AIControlCenter from "../AIControlCenter";
import ProfileSettings from "../ProfileSettings";

// Subcomponent: Tab Content View — purely presentational rendering of workspace tab panels.
// App.tsx retains ownership of all state; this component only renders based on props.
export interface TabContentViewProps {
  onboardingStep: string;
  viewMode: "dashboard" | "workspace";
  activeTab: string;
  user: string | null;
  project: PaperProject | null;
  updateProject: (fields: Partial<PaperProject>) => void;
  setActiveTab: (tab: string) => void;
  loadAllProjects: () => void;
}

export default function TabContentView({
  onboardingStep,
  viewMode,
  activeTab,
  user,
  project,
  updateProject,
  setActiveTab,
  loadAllProjects
}: TabContentViewProps) {
  return (
    <>
      {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "vault" && project && (
        <div className="grid grid-cols-1 gap-6">
          <KnowledgeVaultManager project={project} updateProject={updateProject} />
          <VedicDatabase />
        </div>
      )}

      {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "agents" && (
        <ActiveAgentsPanel project={project} />
      )}

      {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "publishing" && (
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] mb-4 border-b border-[#E5E7EB] pb-2 flex items-center gap-1.5">
              <Award className="w-4 h-4 text-[#C08A3E]" />
              Journal Matching Agent
            </h2>
            <JournalDiscoveryPanel
              project={project}
              updateProject={updateProject}
              onNext={() => {}}
              onBack={() => {}}
            />
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] mb-4 border-b border-[#E5E7EB] pb-2 flex items-center gap-1.5">
              <FileSpreadsheet className="w-4 h-4 text-[#C08A3E]" />
              Submission Packaging Workbench
            </h2>
            <SubmissionPackagingSuite
              project={project}
              updateProject={updateProject}
              onBack={() => {}}
            />
          </div>
        </div>
      )}

      {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "citation" && (
        <div className="grid grid-cols-1 gap-6">
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] mb-4 border-b border-[#E5E7EB] pb-2 flex items-center gap-1.5">
              <BookOpenCheck className="w-4 h-4 text-[#C08A3E]" />
              Citation Discovery & Textual Grounding
            </h2>
            <DataDiscoveryPanel
              project={project}
              updateProject={updateProject}
              onNext={() => {}}
              onBack={() => {}}
            />
          </div>
          <div className="bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm">
            <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] mb-4 border-b border-[#E5E7EB] pb-2 flex items-center gap-1.5">
              <FileText className="w-4 h-4 text-[#C08A3E]" />
              Author Guidelines Parsing & Auditing
            </h2>
            <ComplianceChecklistPanel
              project={project}
              updateProject={updateProject}
              onNext={() => {}}
              onBack={() => {}}
            />
          </div>
        </div>
      )}

      {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "settings" && (
        <AIControlCenter
          project={project}
          updateProject={updateProject}
          onRequireVault={() => {
            setActiveTab("vault");
          }}
        />
      )}

      {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "profile" && (
        <ProfileSettings
          currentUser={user}
          onProfileUpdated={loadAllProjects}
        />
      )}
    </>
  );
}
