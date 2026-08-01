import React from "react";
import {
  Sparkles,
  GraduationCap,
  BookOpen,
  ArrowLeft,
  LayoutDashboard,
  FileText,
  Trash2,
  LogOut,
  Award,
  BookOpenCheck,
  Settings,
  User
} from "lucide-react";
import { PaperProject } from "../../types";

// Subcomponent: Application Header (logo, history nav, dashboard/workspace toggle,
// quick-jump selector, PDF button, reset button, exit/logout button, status bar, tab navigation)
export interface AppHeaderProps {
  onboardingStep: string;
  viewMode: "dashboard" | "workspace";
  activeTab: string;
  user: string | null;
  project: PaperProject | null;
  setViewMode: (mode: "dashboard" | "workspace") => void;
  setActiveTab: (tab: string) => void;
  setIsPdfModalOpen: (open: boolean) => void;
  resetAllProgress: () => void;
  logout: () => void;
  updateProject: (fields: Partial<PaperProject>) => void;
}

export default function AppHeader({
  onboardingStep,
  viewMode,
  activeTab,
  user,
  project,
  setViewMode,
  setActiveTab,
  setIsPdfModalOpen,
  resetAllProgress,
  logout,
  updateProject
}: AppHeaderProps) {
  return (
    <header className="chrome-dark sticky top-0 z-50 border-b shadow-sm shrink-0">
      <div className="px-6 py-4 flex items-center justify-between border-b border-white/5 gap-4 flex-wrap">
        <div className="flex items-center gap-3">
          <div className="chrome-dark-subtle w-10 h-10 rounded-xl border border-white/10 flex items-center justify-center shrink-0 shadow-sm">
            <GraduationCap className="w-6 h-6 chrome-dark-accent" />
          </div>
          <div>
            {/* Sci-fi v3 wordmark: serif reinstated but scoped to this
                lockup only (.wordmark, index.css), gold reserved for the
                second word only per the scoping doc's reversal #2/#3 —
                never general emphasis, never the whole heading. */}
            <h1 className="wordmark text-xl font-bold text-[#E2E8F0] tracking-tight leading-tight">
              🎓 Scholar <span style={{ color: "var(--color-gold-accent)" }}>Agentic OS</span>
            </h1>
            <p className="text-[10px] uppercase tracking-[0.15em] font-bold font-mono" style={{ color: "var(--color-luminous-blue)" }}>
              AI Research Operating System
            </p>
          </div>
        </div>

        {/* Unified Page Navigation & History Controls */}
        <div className="flex items-center gap-2.5">
          {/* Native Browser History Nav mimics */}
          <div className="chrome-dark-subtle flex items-center gap-1 border border-white/10 rounded-lg p-1 shadow-inner shrink-0">
            <button
              onClick={() => window.history.back()}
              className="p-1 hover:bg-white/10 rounded text-[#94A3B8] hover:chrome-dark-accent cursor-pointer transition-colors"
              title="Go Back"
            >
              <ArrowLeft className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={() => window.history.forward()}
              className="p-1 hover:bg-white/10 rounded text-[#94A3B8] hover:chrome-dark-accent cursor-pointer transition-colors"
              title="Go Forward"
            >
              <ArrowLeft className="w-3.5 h-3.5 rotate-180" />
            </button>
          </div>

          {/* Home Button */}
          <button
            onClick={() => { window.location.hash = "#dashboard"; }}
            className="chrome-dark-subtle p-1.5 border border-white/10 hover:bg-white/10 rounded-lg text-[#94A3B8] hover:text-[color:var(--color-luminous-blue)] transition-all cursor-pointer shadow-sm shrink-0 flex items-center justify-center"
            title="Go to Dashboard Home"
          >
            <LayoutDashboard className="w-4 h-4" />
          </button>

          {/* Quick Page Jump Dropdown */}
          <div className="flex items-center gap-1">
            <select
              value={onboardingStep !== "workshop" ? `#onboarding/${onboardingStep}` : (viewMode === "dashboard" ? "#dashboard" : `#workspace/${activeTab}`)}
              onChange={(e) => { window.location.hash = e.target.value; }}
              className="chrome-dark-subtle px-3 py-1.5 border border-white/10 rounded-lg text-xs font-mono font-bold text-[#E2E8F0] focus:ring-1 focus:ring-[color:var(--color-luminous-blue)] focus:outline-none cursor-pointer shadow-sm"
            >
              <optgroup label="Onboarding Steps">
                <option value="#onboarding/ai-setup">Step 2: AI Configuration</option>
                <option value="#onboarding/knowledge-vault">Step 3: Literature Ingestion</option>
              </optgroup>
              <optgroup label="Research Dashboard">
                <option value="#dashboard">Intelligence Dashboard</option>
              </optgroup>
              <optgroup label="Workspace Modules">
                <option value="#workspace/workspace">Main Workspace</option>
                <option value="#workspace/vault">Literature Vault</option>
                <option value="#workspace/agents">Research Agents</option>
                <option value="#workspace/publishing">Publishing Hub</option>
                <option value="#workspace/citation">Citation Center</option>
                <option value="#workspace/settings">AI Settings</option>
                <option value="#workspace/profile">Scholar Profile</option>
              </optgroup>
            </select>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Dashboard / Workspace toggle (only if onboarding is complete) */}
          {onboardingStep === "workshop" && (
            <button
              onClick={() => setViewMode(viewMode === "dashboard" ? "workspace" : "dashboard")}
              className={`px-3.5 py-1.5 border rounded-lg text-xs font-mono tracking-wider flex items-center gap-1.5 cursor-pointer transition-all uppercase font-semibold shadow-sm ${
                viewMode === "dashboard"
                  ? "bg-[color:var(--color-luminous-blue)] text-[#06101F] border-[color:var(--color-luminous-blue)]"
                  : "chrome-dark-subtle text-[#E2E8F0] border-white/10 hover:bg-white/10"
              }`}
              title={viewMode === "dashboard" ? "Open Active Workspace" : "Back to Dashboard"}
            >
              {viewMode === "dashboard" ? (
                <><ArrowLeft className="w-3.5 h-3.5" /><span>Workspace</span></>
              ) : (
                <><LayoutDashboard className="w-3.5 h-3.5" /><span>Dashboard</span></>
              )}
            </button>
          )}
          {onboardingStep === "workshop" && viewMode === "workspace" && (
            <button
              onClick={() => setIsPdfModalOpen(true)}
              className="px-3.5 py-1.5 bg-[color:var(--color-luminous-blue)] text-[#06101F] border border-[color:var(--color-luminous-blue)] hover:bg-[#6BB6FF] rounded-lg text-xs font-mono tracking-wider flex items-center gap-1.5 cursor-pointer transition-all uppercase font-semibold shadow-sm"
              title="View complete compiled manuscript"
            >
              <FileText className="w-3.5 h-3.5" />
              <span>Manuscript PDF</span>
            </button>
          )}
          {onboardingStep === "workshop" && viewMode === "workspace" && (
            <button
              onClick={resetAllProgress}
              className="chrome-dark-subtle p-2 border border-white/10 hover:bg-white/10 rounded-lg text-[#94A3B8] hover:text-red-400 transition-all shrink-0 cursor-pointer"
              title="Reset Sandbox Workspace"
            >
              <Trash2 className="w-4 h-4" />
            </button>
          )}
          <button
            onClick={() => {
              window.location.hash = "";
              logout();
            }}
            className="px-3.5 py-1.5 border border-red-200 hover:border-red-300 bg-red-50 hover:bg-red-100 text-red-700 rounded-lg transition-all duration-150 shrink-0 cursor-pointer flex items-center gap-1.5 text-xs font-mono font-bold uppercase shadow-sm"
            title="Exit Scholar Workspace"
          >
            <LogOut className="w-3.5 h-3.5" />
            <span>Exit</span>
          </button>
        </div>
      </div>

      {/* Tab nav — only shown in workspace view */}
      {viewMode === "workspace" && (
      <div className="chrome-dark-subtle px-6 py-3 border-b border-white/5 flex items-center justify-start gap-3.5 overflow-x-auto scrollbar-none">
        {[
          { id: "workspace", name: "Workspace", icon: GraduationCap },
          { id: "vault", name: "Knowledge Vault", icon: BookOpen },
          { id: "agents", name: "Research Agents", icon: Sparkles },
          { id: "publishing", name: "Publishing Hub", icon: Award },
          { id: "citation", name: "Citation Center", icon: BookOpenCheck },
          { id: "settings", name: "Settings", icon: Settings },
          { id: "profile", name: "Profile", icon: User }
        ].map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id as any)}
              className={`px-4 py-2 text-xs font-mono font-semibold uppercase tracking-wider rounded-xl transition-all duration-200 cursor-pointer shrink-0 flex items-center gap-2 border ${
                isActive
                  ? "bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)] border-[color:var(--color-luminous-blue)]/40"
                  : "text-[#94A3B8] bg-transparent border-white/10 hover:text-[#E2E8F0] hover:bg-white/5 hover:border-white/20"
              }`}
            >
              <Icon className={`w-3.5 h-3.5 ${isActive ? "text-[color:var(--color-luminous-blue)]" : "text-[#64748B]"}`} />
              <span>{tab.name}</span>
              {tab.id === "vault" && project?.knowledgeVault?.files.some((f: any) => f.isActive && f.status === "ready") && (
                <span className="w-2 h-2 rounded-full bg-emerald-500 shrink-0" />
              )}
            </button>
          );
        })}
      </div>
      )}

      {/* Status bar — only in workspace view */}
      {viewMode === "workspace" && project && (
      <div className="chrome-dark px-6 py-2 flex flex-col sm:flex-row sm:items-center justify-between text-xs font-mono text-[#94A3B8] gap-2">
        <div className="flex items-center gap-4 flex-wrap">
          <span className="flex items-center gap-1 text-[#E2E8F0]">
            Active Model:
            <select
              value={project.aiSettings?.provider === "openai" ? (project.aiSettings?.openaiModel || "gpt-4o") : "gemini"}
              onChange={(e) => {
                const val = e.target.value;
                let updatedSettings = { ...project.aiSettings };
                if (val === "gemini") {
                  updatedSettings.provider = "gemini";
                } else {
                  updatedSettings.provider = "openai";
                  updatedSettings.openaiModel = val;
                }
                updateProject({ aiSettings: updatedSettings });
              }}
              className="bg-transparent border-none text-[color:var(--color-luminous-blue)] font-bold focus:outline-none cursor-pointer pl-1 font-mono text-xs select-none"
            >
              <option value="gemini">Gemini 3.5</option>
              <option value="gpt-4o">GPT-4o</option>
              <option value="gpt-4o-mini">GPT-4o-Mini</option>
              <option value="o1-mini">o1-Mini</option>
            </select>
          </span>
          <div className="h-3 w-[1px] bg-white/10"></div>
          <div className="flex items-center gap-1.5">
            <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--color-luminous-blue)] animate-pulse"></div>
            <span className="text-[10px] font-bold text-[color:var(--color-luminous-blue)]">Auto-Fallback ON</span>
          </div>
        </div>
        <div>
          Active Scholar: <span className="text-[#E2E8F0] font-bold">{user}</span>
        </div>
      </div>
      )}
    </header>
  );
}
