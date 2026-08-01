import { useState, useEffect, useCallback, lazy, Suspense } from "react";
import { PaperProject, WORKFLOW_PHASES } from "./types";
import OutputFormatSelector from "./components/OutputFormatSelector";
import { AuthProvider, useAuth } from "./auth/authContext";
import { useProjectPersistence } from "./hooks/useProjectPersistence";
import { useHashNavigation } from "./hooks/useHashNavigation";
import { useFocusOnNavigate } from "./hooks/useFocusOnNavigate";
import { canEnterPhase, resolveFurthestPhase } from "./utils/phaseGating";
import OnboardingWizard from "./components/OnboardingWizard";
import AppHeader from "./components/layout/AppHeader";
import { AgentOrchestrationDashboard } from "./components/AgentOrchestrationDashboard";
import AppFooter from "./components/layout/AppFooter";
import ErrorBoundary from "./components/ErrorBoundary";

// Bundle-size pass (2026-07-30, Task 2): these are all mutually-exclusive-
// at-a-time views — only one research phase or one tab is ever mounted per
// render — so they're split into their own chunks via React.lazy() instead
// of being parsed eagerly as part of the initial bundle. Each usage site
// below is wrapped in a <Suspense> boundary. OutputFormatSelector,
// OnboardingWizard, AppHeader/AppFooter and ErrorBoundary stay static
// imports: they're small and/or on the critical first-paint path.
const ResearchIntakeWizard = lazy(() => import("./components/ResearchIntakeWizard"));
const GroundingMapDisplay = lazy(() => import("./components/GroundingMapDisplay"));
const DataDiscoveryPanel = lazy(() => import("./components/DataDiscoveryPanel"));
const JournalDiscoveryPanel = lazy(() => import("./components/JournalDiscoveryPanel"));
const ComplianceChecklistPanel = lazy(() => import("./components/ComplianceChecklistPanel"));
const NonJournalRequirementsPanel = lazy(() => import("./components/NonJournalRequirementsPanel"));
const ManuscriptDraftingWorkspace = lazy(() => import("./components/ManuscriptDraftingWorkspace"));
const QualityControlSuite = lazy(() => import("./components/QualityControlSuite"));
const QCBasedRedraftingSuite = lazy(() => import("./components/QCBasedRedraftingSuite"));
const SubmissionPackagingSuite = lazy(() => import("./components/SubmissionPackagingSuite"));
const ManuscriptPDFViewer = lazy(() => import("./components/ManuscriptPDFViewer"));
const ResearchIntelligenceDashboard = lazy(() => import("./components/ResearchIntelligenceDashboard"));
const ManuscriptEditorWorkspace = lazy(() => import("./components/ManuscriptEditorWorkspace"));
const CommandPalette = lazy(() => import("./components/CommandPalette"));
const ActiveAgentsPanel = lazy(() => import("./components/agents/ActiveAgentsPanel"));

// New components
const KnowledgeVaultManager = lazy(() => import("./components/ThesisReader"));
const VedicDatabase = lazy(() => import("./components/VedicDatabase"));
const AIControlCenter = lazy(() => import("./components/AIControlCenter"));
const ProfileSettings = lazy(() => import("./components/ProfileSettings"));
const CoverLetterGenerator = lazy(() => import("./components/CoverLetterGenerator"));
const SubmissionChecklistBuilder = lazy(() => import("./components/SubmissionChecklistBuilder"));

// Icons
// (Sparkles, GraduationCap, BookOpen, Trash2, LogOut, LayoutDashboard, ArrowLeft
// removed — they were only used by the inline header/footer JSX now replaced
// by <AppHeader>/<AppFooter>, which import their own icons directly.)
import {
  FileText,
  Loader2,
  FileSpreadsheet,
  Award,
  BookOpenCheck
} from "lucide-react";

function PanelLoadingFallback() {
  return (
    <div className="flex items-center justify-center py-16 text-[#94A3B8]">
      <Loader2 className="w-5 h-5 animate-spin mr-2" />
      <span className="text-xs font-mono uppercase tracking-wider">Loading…</span>
    </div>
  );
}

export default function AppWrapper() {
  return (
    <AuthProvider>
      <App />
    </AuthProvider>
  );
}

function App() {
  const { user, logout, project, setProject, onboardingStep, setOnboardingStep } = useAuth();
  const [activeTab, setActiveTab] = useState<"workspace" | "vault" | "agents" | "publishing" | "citation" | "settings" | "profile">("workspace");
  const [isPdfModalOpen, setIsPdfModalOpen] = useState(false);
  // Multi-project management
  const [viewMode, setViewMode] = useState<"dashboard" | "workspace">("dashboard");
  const [allProjects, setAllProjects] = useState<PaperProject[]>([]);
  const [isCommandPaletteOpen, setIsCommandPaletteOpen] = useState(false);
  const [isFocusMode, setIsFocusMode] = useState(false);

  // Single source of truth for project persistence (localStorage load/save,
  // updateProject, createNewProject, switchToProject, deleteProject,
  // client-side v2 migration, scholar_project_updated event handling).
  // Previously App.tsx had its own ~250-line duplicate of this exact hook
  // inlined instead of using it, which is why a real closure-over-stale-
  // project bug in updateProject (two calls in the same tick silently
  // dropping the first call's fields) went unfixed even after this hook
  // itself was fixed and tested — the hook was never actually wired in.
  const { loadAllProjects, updateProject, createNewProject, switchToProject, deleteProject } = useProjectPersistence(
    user,
    project,
    setProject,
    setAllProjects,
    allProjects,
    setViewMode,
    setActiveTab
  );

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setIsCommandPaletteOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const handleExportLaTeX = () => {
    if (!project) return;
    const sectionsList = project.complianceRules?.sectionStructure || [
      "Title Page",
      "Abstract & Keywords",
      "Introduction",
      "Literature Review / Related Work",
      "Conceptual / Ethical Framework",
      "Methodology / Methods",
      "Results / Analysis",
      "Discussion (including ethical implications and limitations)",
      "Conclusion",
      "Declarations (Funding, Conflicts of Interest, Ethical Approval, Consent, Data Availability)",
      "References",
      "Appendices (if applicable)"
    ];

    let latexContent = `% Generated by Scholar Agentic OS - LaTeX Export\n\\documentclass[12pt]{article}\n\\usepackage[utf8]{inputenc}\n\\usepackage{geometry}\n\\geometry{a4paper, margin=1in}\n\\usepackage{times}\n\\usepackage{setspace}\n\\doublespacing\n\\usepackage{hyperref}\n\n\\title{${project.title || "Untitled Manuscript"}}\n\\author{${project.authorName || project.authorDetails || "Author"}}\n\\date{\\today}\n\n\\begin{document}\n\\maketitle\n\n`;

    sectionsList.forEach(sec => {
      const content = project.sections[sec];
      if (content?.trim()) {
        const cleanSecName = sec.replace(/[&_%$#_{}~^]/g, '\\$&');
        if (sec.toLowerCase().includes("abstract")) {
          latexContent += `\\begin{abstract}\n${content.trim()}\n\\end{abstract}\n\n`;
        } else {
          latexContent += `\\section{${cleanSecName}}\n${content.trim()}\n\n`;
        }
      }
    });

    latexContent += `\\end{document}`;

    const blob = new Blob([latexContent], { type: 'application/x-latex' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${(project.title || "manuscript").toLowerCase().replace(/[^a-z0-9]+/g, "_")}.tex`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // Navigation overhaul (docs/planning/navigation-scoping.md) — this used to
  // be a second, inline copy of exactly what src/hooks/useHashNavigation.ts
  // already implemented, except that hook had zero live imports anywhere
  // (found while scoping navigation work — a sixth dead-code instance in the
  // same family as ActiveAgentsPanel/AppHeader/AppFooter, documented in
  // HANDOVER.md). Fixed and wired in here instead of leaving a second stale
  // copy sitting next to this one.
  const [phaseGateMessage, setPhaseGateMessage] = useState<string | null>(null);
  const [settingsSubTab, setSettingsSubTab] = useState("mode");
  const phaseHeadingRef = useFocusOnNavigate<HTMLHeadingElement>(project?.currentPhase || "A");

  // Real bug caught by live verification, not assumed: this used to pass
  // inline arrow-function wrappers (`(step) => setOnboardingStep(...)`) as
  // setOnboardingStep/setActiveTab straight into useHashNavigation's params
  // object. A NEW function is a new reference every render, and the hook's
  // hash->state effect depends on setOnboardingStep's identity — so it
  // reran on every single render, re-parsed the hash, and (combined with
  // handlePhaseChange previously calling updateProject even for a no-op
  // phase-to-itself change, creating a new `project` object reference every
  // time) fed straight into an infinite render loop, confirmed live via a
  // real "Maximum update depth exceeded" console error. useCallback below
  // keeps these references stable; the no-op guard in handlePhaseChange is
  // the second, defense-in-depth half of the fix.
  const stableSetOnboardingStep = useCallback((step: string) => setOnboardingStep(step as any), [setOnboardingStep]);
  const stableSetActiveTab = useCallback((tab: string) => setActiveTab(tab as any), [setActiveTab]);

  const handlePhaseChange = useCallback((phase: string) => {
    if (!project) return;
    if (phase === project.currentPhase) return;
    if (!WORKFLOW_PHASES.some((p) => p.id === phase)) return;
    const furthest = resolveFurthestPhase(project);
    const gate = canEnterPhase(WORKFLOW_PHASES, project.currentPhase, furthest, phase);
    if (!gate.allowed) {
      setPhaseGateMessage(gate.reason || "That phase isn't reachable yet.");
      return;
    }
    setPhaseGateMessage(null);
    const furthestIndex = WORKFLOW_PHASES.findIndex((p) => p.id === furthest);
    const targetIndex = WORKFLOW_PHASES.findIndex((p) => p.id === phase);
    const nextFurthest = targetIndex > furthestIndex ? phase : furthest;
    updateProject({ currentPhase: phase as PaperProject["currentPhase"], furthestPhase: nextFurthest as PaperProject["furthestPhase"] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project, updateProject]);

  useHashNavigation({
    user,
    onboardingStep,
    setOnboardingStep: stableSetOnboardingStep,
    viewMode,
    setViewMode,
    activeTab,
    setActiveTab: stableSetActiveTab,
    currentPhase: project?.currentPhase || "A",
    onRequestPhase: handlePhaseChange,
    settingsSubTab,
    setSettingsSubTab
  });

  const navigateNext = () => {
    if (!project) return;
    const currentIndex = WORKFLOW_PHASES.findIndex((p) => p.id === project.currentPhase);
    if (currentIndex !== -1 && currentIndex < WORKFLOW_PHASES.length - 1) {
      handlePhaseChange(WORKFLOW_PHASES[currentIndex + 1].id);
    }
  };

  const navigateBack = () => {
    if (!project) return;
    const currentIndex = WORKFLOW_PHASES.findIndex((p) => p.id === project.currentPhase);
    if (currentIndex > 0) {
      handlePhaseChange(WORKFLOW_PHASES[currentIndex - 1].id);
    }
  };

  const resetAllProgress = () => {
    if (!project) return;
    if (window.confirm("Are you sure you want to reset all current publication metadata and compilation progress?")) {
      const resetProject = {
        ...project,
        title: "",
        objectives: "",
        researchQuestions: "",
        researchGap: "",
        methodology: "",
        field: "",
        keywords: "",
        preferredJournalScope: "",
        articleType: "Theoretical/Conceptual",
        outputFormat: "" as const,
        targetReferenceCount: undefined,
        dissertationMaterials: "",
        styleAspiration: "",
        currentPhase: "A" as const,
        sections: {},
        groundingMap: undefined,
        dataSources: undefined,
        targetJournal: undefined,
        complianceRules: undefined,
        qcReport: undefined,
        submissionPack: undefined
      };
      updateProject(resetProject);
    }
  };

  if (!user || !project) {
    // Bug fix (2026-07-31): this was the one major render path with no
    // ErrorBoundary at all — unlike the authenticated workspace view below.
    // A render exception here (or a lazy-loaded chunk failing to load —
    // OnboardingWizard's children are all React.lazy()) had nothing to
    // catch it, so React unmounted the entire tree with zero visible
    // feedback: a silent blank white screen, reported live in production.
    return (
      <ErrorBoundary>
        <OnboardingWizard />
      </ErrorBoundary>
    );
  }

  // Calculate Intake Progress
  const getIntakeProgress = () => {
    let score = 0;
    if (project.title) score += 12;
    if (project.objectives) score += 12;
    if (project.researchQuestions) score += 12;
    if (project.researchGap) score += 12;
    if (project.methodology) score += 12;
    if (project.field) score += 12;
    if (project.targetJournal) score += 14;
    if (project.dataSources && project.dataSources.length > 0) score += 14;
    return score;
  };

  const intakeProgress = getIntakeProgress();

  return (
    <div className="min-h-screen blueprint-canvas text-[#E2E8F0] flex flex-col font-sans selection:bg-[color:var(--color-luminous-blue-dim)] selection:text-white">
      
      <AppHeader
        onboardingStep={onboardingStep}
        viewMode={viewMode}
        activeTab={activeTab}
        user={user}
        project={project}
        setViewMode={setViewMode}
        setActiveTab={setActiveTab as (tab: string) => void}
        setIsPdfModalOpen={setIsPdfModalOpen}
        resetAllProgress={resetAllProgress}
        logout={logout}
        updateProject={updateProject}
      />

      <main className="grow max-w-7xl w-full mx-auto p-4 md:p-6 flex flex-col gap-6 relative z-0 overflow-x-hidden">
        
        {/* ONBOARDING SETUP MODULES */}
        {onboardingStep !== "workshop" && (
          <OnboardingWizard />
        )}

        {/* DASHBOARD VIEW */}
        {onboardingStep === "workshop" && viewMode === "dashboard" && (
          <Suspense fallback={<PanelLoadingFallback />}>
            <ResearchIntelligenceDashboard
              project={project}
              projects={allProjects}
              onSelectProject={switchToProject}
              onCreateProject={createNewProject}
              onDeleteProject={deleteProject}
              onNavigateToPhase={(phaseId) => {
                if (project) {
                  updateProject({ currentPhase: phaseId });
                  setViewMode("workspace");
                  setActiveTab("workspace");
                }
              }}
            />
          </Suspense>
        )}

        {/* WORKSPACE VIEW */}
        {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "workspace" && (
          <div className="flex flex-col lg:flex-row gap-6 w-full items-start">
            {/* Sidebar Phase-Timeline Graph */}
            <div className="w-full lg:w-64 shrink-0 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-4 shadow-sm relative overflow-hidden">
              <h3
                ref={phaseHeadingRef}
                tabIndex={-1}
                className="text-[10px] font-mono font-bold uppercase tracking-wider text-[#E2E8F0] mb-4 select-none pb-2 border-b border-[color:var(--color-navy-4)] focus:outline-none"
              >
                Research Phases — {WORKFLOW_PHASES.find((p) => p.id === project.currentPhase)?.name}
              </h3>
              {phaseGateMessage && (
                <div role="alert" className="mb-4 px-3 py-2 rounded-lg bg-amber-500/10 border border-amber-500/30 text-amber-300 text-xs font-mono">
                  {phaseGateMessage}
                </div>
              )}
              <div className="relative flex flex-col gap-5 pl-1.5">
                {/* Connecting Track Line */}
                <div className="absolute left-[20px] top-4 bottom-4 w-[2px] bg-[color:var(--color-navy-4)]" />
                
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
                            ? "bg-[color:var(--color-luminous-blue-dim)] text-white border-2 border-[color:var(--color-luminous-blue-dim)] ring-4 ring-[color:var(--color-luminous-blue)]/20 shadow-[color:var(--color-luminous-blue)]/30 shadow-md animate-pulse font-bold"
                            : isPast
                            ? "bg-emerald-500 text-white border-2 border-emerald-500 shadow-md shadow-emerald-500/20 font-bold"
                            : "bg-[color:var(--color-navy-3)] text-[#94A3B8] border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-2)] font-normal"
                        }`}
                      >
                        {ph.id}
                      </div>
                      <div className="flex flex-col">
                        <span
                          className={`text-[11px] font-mono leading-none tracking-wider uppercase font-semibold transition-colors duration-200 ${
                            isActive ? "text-[#E2E8F0]" : isPast ? "text-emerald-400" : "text-[#94A3B8] group-hover:text-[#E2E8F0]"
                          }`}
                        >
                          {ph.name}
                        </span>
                        <span className="text-[9px] text-[#94A3B8] mt-0.5 line-clamp-1">{ph.desc}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Main Panel Content */}
            <div className="flex-grow w-full rounded-3xl p-5 md:p-6 shadow-sm border border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-2)] min-h-[500px]">
              <ErrorBoundary>
              <Suspense fallback={<PanelLoadingFallback />}>
                {project.currentPhase === "A" && !project.outputFormat && (
                  <OutputFormatSelector
                    onSelect={(format) => updateProject({ outputFormat: format })}
                  />
                )}
                {project.currentPhase === "A" && project.outputFormat && (
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
                  project.outputFormat === "journal-article" || !project.outputFormat ? (
                    <ComplianceChecklistPanel
                      project={project}
                      updateProject={updateProject}
                      onNext={navigateNext}
                      onBack={navigateBack}
                    />
                  ) : (
                    <NonJournalRequirementsPanel
                      project={project}
                      updateProject={updateProject}
                      onNext={navigateNext}
                      onBack={navigateBack}
                    />
                  )
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
              </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        )}

        {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "vault" && project && (
          <Suspense fallback={<PanelLoadingFallback />}>
            <div className="grid grid-cols-1 gap-6">
              <KnowledgeVaultManager project={project} updateProject={updateProject} />
              <VedicDatabase />
            </div>
          </Suspense>
        )}

        {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "agents" && (
          <Suspense fallback={<PanelLoadingFallback />}>
            <div className="grid grid-cols-1 gap-6">
              <AgentOrchestrationDashboard
                project={project}
                updateProject={updateProject}
              />
              <ActiveAgentsPanel project={project} />
            </div>
          </Suspense>
        )}

        {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "publishing" && (
          <Suspense fallback={<PanelLoadingFallback />}>
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#E2E8F0] mb-4 border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                  Journal Matching Agent
                </h2>
                <JournalDiscoveryPanel
                  project={project}
                  updateProject={updateProject}
                  onNext={() => {}}
                  onBack={() => {}}
                />
              </div>
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#E2E8F0] mb-4 border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-1.5">
                  <FileSpreadsheet className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                  Submission Packaging Workbench
                </h2>
                <SubmissionPackagingSuite
                  project={project}
                  updateProject={updateProject}
                  onBack={() => {}}
                />
              </div>
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#E2E8F0] mb-4 border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                  Cover Letter Generator
                </h2>
                <CoverLetterGenerator
                  project={project}
                  journalName={project.targetJournal?.name || ""}
                  onSave={(content) => {
                    updateProject({
                      submissionPack: {
                        ...(project.submissionPack || {}),
                        coverLetter: content
                      } as any
                    });
                  }}
                />
              </div>
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#E2E8F0] mb-4 border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-1.5">
                  <BookOpenCheck className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                  Submission Checklist
                </h2>
                <SubmissionChecklistBuilder
                  project={project}
                  onUpdate={(checklist) => {
                    updateProject({
                      submissionPack: {
                        ...(project.submissionPack || {}),
                        checklists: checklist
                      } as any
                    });
                  }}
                />
              </div>
            </div>
          </Suspense>
        )}

        {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "citation" && (
          <Suspense fallback={<PanelLoadingFallback />}>
            <div className="grid grid-cols-1 gap-6">
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#E2E8F0] mb-4 border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-1.5">
                  <BookOpenCheck className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
                  Citation Discovery & Textual Grounding
                </h2>
                <DataDiscoveryPanel
                  project={project}
                  updateProject={updateProject}
                  onNext={() => {}}
                  onBack={() => {}}
                />
              </div>
              <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm">
                <h2 className="text-sm font-mono font-bold uppercase tracking-wider text-[#E2E8F0] mb-4 border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-1.5">
                  <FileText className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
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
          </Suspense>
        )}

        {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "settings" && (
          <Suspense fallback={<PanelLoadingFallback />}>
            <AIControlCenter
              project={project}
              updateProject={updateProject}
              onRequireVault={() => {
                setActiveTab("vault");
              }}
              activeSubTab={settingsSubTab as any}
              onSubTabChange={(tab) => setSettingsSubTab(tab)}
            />
          </Suspense>
        )}

        {onboardingStep === "workshop" && viewMode === "workspace" && activeTab === "profile" && (
          <Suspense fallback={<PanelLoadingFallback />}>
            <ProfileSettings
              currentUser={user}
              onProfileUpdated={loadAllProjects}
            />
          </Suspense>
        )}
      </main>

      <AppFooter />

      {isPdfModalOpen && (
        <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
          <div className="w-full max-w-5xl bg-[color:var(--color-navy-2)] rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border border-[color:var(--color-navy-4)]">
            <div className="bg-[color:var(--color-navy-3)] border-b border-[color:var(--color-navy-4)] px-6 py-4 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-[color:var(--color-luminous-blue)]" />
                <h3 className="text-xs font-semibold text-[#E2E8F0] font-mono uppercase tracking-widest">
                  Live Manuscript Compilation Workbench
                </h3>
              </div>
              <button
                onClick={() => setIsPdfModalOpen(false)}
                className="p-1 px-3 bg-red-500/10 border border-red-500/30 hover:bg-red-500/20 text-red-400 rounded text-[11px] font-mono uppercase cursor-pointer transition-all font-semibold"
              >
                Dismiss Preview
              </button>
            </div>
            <div className="overflow-y-auto grow bg-[color:var(--color-navy-1)]">
              <Suspense fallback={<PanelLoadingFallback />}>
                <ManuscriptPDFViewer project={project} />
              </Suspense>
            </div>
          </div>
        </div>
      )}

      {project && (
        <Suspense fallback={null}>
          <CommandPalette
            isOpen={isCommandPaletteOpen}
            onClose={() => setIsCommandPaletteOpen(false)}
            onNavigatePhase={(phaseId) => handlePhaseChange(phaseId as any)}
            onNavigateTab={(tabId) => setActiveTab(tabId)}
            onToggleFocusMode={() => setIsFocusMode((prev) => !prev)}
            onExportLaTeX={handleExportLaTeX}
            onDownloadDocx={() => {
              window.dispatchEvent(new CustomEvent("trigger-download-docx"));
            }}
            onDownloadPdf={() => {
              window.dispatchEvent(new CustomEvent("trigger-download-pdf"));
            }}
            onModelChange={(provider, model) => {
              let updatedSettings = { ...project.aiSettings };
              if (provider === "gemini") {
                updatedSettings.provider = "gemini";
              } else {
                updatedSettings.provider = "openai";
                updatedSettings.openaiModel = model || "gpt-4o";
              }
              updateProject({ aiSettings: updatedSettings });
            }}
            onResetWorkspace={resetAllProgress}
            activeModel={project?.aiSettings?.provider === "openai" ? (project?.aiSettings?.openaiModel || "gpt-4o") : "gemini"}
            isFocusModeActive={isFocusMode}
          />
        </Suspense>
      )}

      {/* Knowledge Vault setup handled by OnboardingWizard */}
    </div>
  );
}


// ActiveAgentsPanel is defined in ./components/agents/ActiveAgentsPanel — see
// the import above. It used to be duplicated verbatim here (dead code:
// TabContentView.tsx imported the extracted version, but TabContentView
// itself is never imported by App.tsx, so this inline copy — not the
// extracted file — was the one actually rendered). Removed during the
// sci-fi redesign (2026-07-28) after live verification showed Step 3's
// edits to the extracted file weren't appearing in the running app.
