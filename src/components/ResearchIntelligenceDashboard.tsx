import React, { useState, useEffect } from "react";
import { PaperProject, WORKFLOW_PHASES, HealthStatus } from "../types";
import { generateCitation } from "../services/citationService";
import { listAgents } from "../services/agentService";
import AIGateway, { AI_PROVIDERS } from "../services/aiGateway";
import { AI_MODES, getModeForProvider } from "../config/aiModes";
import { 
  Folder, Play, Search, Bell, Activity, PlusCircle, CheckCircle, 
  Clock, TrendingUp, AlertCircle, DollarSign, Cpu, FileText, 
  ArrowRight, ShieldCheck, HelpCircle, Star, Trash2, BookOpen, Copy, ChevronRight, X
} from "lucide-react";

interface ResearchIntelligenceDashboardProps {
  project: PaperProject | null;
  projects: PaperProject[];
  onSelectProject: (projectId: string) => void;
  onCreateProject: () => void;
  onDeleteProject: (projectId: string) => void;
  onNavigateToPhase: (phaseId: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "G2" | "H" | "I") => void;
}

export default function ResearchIntelligenceDashboard({
  project,
  projects,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onNavigateToPhase,
}: ResearchIntelligenceDashboardProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [citationSearch, setCitationSearch] = useState("");

  // Sci-fi v3 Step 4 — storage utilization, real navigator.storage.estimate()
  // only (docs/planning/dashboard-mockup-honest-data-audit.md: the mockup's
  // "82% Storage utilized" has no real, disclosed quota behind it at all).
  // Honestly null (not 0, not a placeholder) until/unless the real API
  // resolves — the render below must distinguish "not checked yet" from
  // "checked and unavailable" from "checked and here's the real number".
  const [storageEstimate, setStorageEstimate] = useState<{ usage: number; quota: number } | null>(null);
  const [storageEstimateUnavailable, setStorageEstimateUnavailable] = useState(false);

  // Sci-fi v3 Step 4 — "AI Gateway" panel (mockup: "AI KERNEL — ONLINE",
  // unconditionally). Real equivalent: the currently-configured provider's
  // genuine live health check, via the SAME AIGateway.healthCheckProvider
  // function AIControlCenter.tsx already calls — reused here, not
  // reimplemented or duplicated. Re-runs whenever the configured provider
  // changes (e.g. the user switches AI mode in Settings), same dependency
  // pattern AIControlCenter's own effect already uses.
  const currentProviderId = project?.aiSettings?.provider;
  const [gatewayStatus, setGatewayStatus] = useState<HealthStatus | null>(null);
  const [checkingGateway, setCheckingGateway] = useState(false);

  useEffect(() => {
    if (!currentProviderId || currentProviderId === "auto") {
      setGatewayStatus(null);
      return;
    }
    let cancelled = false;
    setCheckingGateway(true);
    AIGateway.healthCheckProvider(currentProviderId, project?.aiSettings || { provider: currentProviderId as any })
      .then((result) => { if (!cancelled) setGatewayStatus(result); })
      .catch(() => { if (!cancelled) setGatewayStatus({ provider: currentProviderId, status: "offline", error: "Check failed" }); })
      .finally(() => { if (!cancelled) setCheckingGateway(false); });
    return () => { cancelled = true; };
  }, [currentProviderId, project?.aiSettings]);

  const currentModeId = currentProviderId ? getModeForProvider(currentProviderId) : undefined;
  const currentMode = currentModeId ? AI_MODES.find(m => m.id === currentModeId) : undefined;
  const currentProviderInfo = AI_PROVIDERS.find(p => p.id === currentProviderId);
  const fallbackCount = (project?.aiSettings?.fallbackOrder || []).filter(p => p !== currentProviderId).length;

  useEffect(() => {
    let cancelled = false;
    if (typeof navigator === "undefined" || !navigator.storage || typeof navigator.storage.estimate !== "function") {
      setStorageEstimateUnavailable(true);
      return;
    }
    navigator.storage.estimate()
      .then((est) => {
        if (cancelled) return;
        if (typeof est.usage === "number" && typeof est.quota === "number" && est.quota > 0) {
          setStorageEstimate({ usage: est.usage, quota: est.quota });
        } else {
          setStorageEstimateUnavailable(true);
        }
      })
      .catch(() => {
        if (!cancelled) setStorageEstimateUnavailable(true);
      });
    return () => { cancelled = true; };
  }, []);

  // Real, human-readable byte formatting — never a fabricated TB figure for
  // an app whose actual vault files realistically top out at KB/MB scale.
  const formatBytes = (bytes: number): string => {
    if (bytes === 0) return "0 B";
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };
  const vaultByteSize = (project?.knowledgeVault?.files || []).reduce((sum, f) => sum + (f.fileSize || 0), 0);

  // Statistics calculation
  const totalProjects = projects.length;
  const activeProjects = projects.filter(p => p.currentPhase !== "I" && p.status !== "Accepted").length;
  const completedProjects = projects.filter(p => p.status === "Accepted" || p.currentPhase === "I").length;

  const draftArticles = projects.filter(p => p.status === "Draft" || !p.status).length;
  const submittedArticles = projects.filter(p => p.status === "Submitted").length;
  const acceptedArticles = projects.filter(p => p.status === "Accepted").length;
  const rejectedArticles = projects.filter(p => p.status === "Rejected").length;

  // AI Usage calculations
  let totalCost = 0;
  let totalCalls = 0;
  let totalWords = 0;
  const providerStats: Record<string, number> = {};

  projects.forEach(p => {
    totalCost += p.costMetrics?.totalCost || 0;
    totalCalls += p.costMetrics?.totalCalls || 0;
    
    // Sum words in sections
    if (p.sections) {
      Object.values(p.sections).forEach(txt => {
        totalWords += (txt || "").split(/\s+/).filter(Boolean).length;
      });
    }

    if (p.usageLogs) {
      p.usageLogs.forEach(log => {
        providerStats[log.provider] = (providerStats[log.provider] || 0) + 1;
      });
    }
  });

  const filteredProjects = projects.filter(p => 
    p.title.toLowerCase().includes(searchQuery.toLowerCase()) || 
    p.field.toLowerCase().includes(searchQuery.toLowerCase())
  );

  const getCompletionPercentage = (p: PaperProject) => {
    let score = 0;
    if (p.title) score += 10;
    if (p.objectives) score += 10;
    if (p.researchQuestions) score += 10;
    if (p.researchGap) score += 10;
    if (p.methodology) score += 10;
    if (p.groundingMap) score += 15;
    if (p.dataSources && p.dataSources.length > 0) score += 10;
    if (p.targetJournal) score += 10;
    if (p.sections && Object.keys(p.sections).length > 0) score += 15;
    return score;
  };

  const getPhaseName = (phaseId: string) => {
    return WORKFLOW_PHASES.find(p => p.id === phaseId)?.name || phaseId;
  };

  // Compile a simple recent activity timeline
  const activityTimeline: Array<{ title: string; desc: string; time: string; projectTitle: string }> = [];
  projects.forEach(p => {
    if (p.lastActivity) {
      activityTimeline.push({
        title: `Workspace updated`,
        desc: `Phase ${p.currentPhase} active. Word count: ${Object.values(p.sections || {}).join(" ").split(/\s+/).filter(Boolean).length} words.`,
        time: new Date(p.lastActivity).toLocaleDateString() + " " + new Date(p.lastActivity).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        projectTitle: p.title || "Untitled Project"
      });
    }
    if (p.usageLogs) {
      p.usageLogs.slice(-2).forEach(log => {
        activityTimeline.push({
          title: `AI Generation: ${log.taskType}`,
          desc: `Model ${log.model} (${log.provider}) generated ${log.outputWords} words.`,
          time: new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
          projectTitle: p.title || "Untitled Project"
        });
      });
    }
  });
  const sortedActivity = activityTimeline.sort((a, b) => b.time.localeCompare(a.time)).slice(0, 5);

  // Sci-fi v3 Step 4 — "AI Agents" panel (mockup: "12 Active"). The audit
  // classified a live concurrency count as (c) unbuildable: no background
  // job queue/concurrent-execution model exists, agents run synchronously
  // per user action. Real equivalent: the actual, static number of
  // registered agent types — listAgents() is the same real registry every
  // agent invocation in this app goes through, not a number invented for
  // this panel.
  const registeredAgentCount = listAgents().length;

  // Sci-fi v3 Step 4 — per-scholar counters (mockup: PAPERS 12,842,761;
  // JOURNALS 34,128; CITATIONS 88,671,221; DATASETS 6,731 — platform-wide
  // aggregates this app has no backend to support). Real equivalent: the
  // current scholar's own counts, at real small scale, never invented.
  const scholarDatasetCount = projects.reduce((sum, p) => sum + (p.dataSources?.length || 0), 0);
  const scholarCitationCount = projects.reduce(
    (sum, p) => sum + (p.knowledgeVault?.files || []).filter(f => f.citationMetadata).length,
    0
  );
  const scholarJournalSelectedCount = projects.filter(p => !!p.targetJournal).length;

  // Sci-fi v3 Step 4 — "Today's Research" (mockup: "28 New papers found" +
  // sparkline, implying a live discovery feed). No background crawler
  // exists in this app — real equivalent: a real count of today's
  // timestamped usageLogs entries across all of the scholar's projects,
  // honestly 0 with no fabricated trend when there's nothing real yet.
  const todayKey = new Date().toDateString();
  const todaysActionCount = projects.reduce(
    (sum, p) => sum + (p.usageLogs || []).filter(log => new Date(log.timestamp).toDateString() === todayKey).length,
    0
  );

  // Honest-data fix (docs/planning/dashboard-mockup-honest-data-audit.md's
  // discipline, applied here): this panel used to be 3 hardcoded fake
  // notifications, shown unconditionally regardless of the real project's
  // state. Real alerts only, derived from genuinely available signals —
  // vault files that actually failed to process (a real, actionable
  // problem), and the same real recent-activity data already computed
  // above. Honestly empty when neither exists, never a fabricated filler.
  type Alert = { id: string; text: string; time: string; type: "success" | "info" | "warning" };
  const alerts: Alert[] = [];
  projects.forEach(p => {
    (p.knowledgeVault?.files || []).forEach(f => {
      if (f.status === "error") {
        alerts.push({
          id: `vault-error-${f.id}`,
          text: `"${f.fileName}" failed to process${f.errorMessage ? `: ${f.errorMessage}` : "."}`,
          time: new Date(f.uploadedAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
          type: "warning"
        });
      }
    });
  });
  sortedActivity.slice(0, 3).forEach((act, i) => {
    alerts.push({ id: `activity-${i}`, text: `${act.title} — ${act.projectTitle}`, time: act.time, type: "info" });
  });

  // Honest-data fix — this sidebar used to show 3 entirely fabricated
  // references unconditionally, never anything the user actually uploaded.
  // Real vault files with real citationMetadata only, formatted via the
  // already-shipped generateCitation() service — never invented content.
  const cachedCitations = (project?.knowledgeVault?.files || [])
    .filter(f => f.citationMetadata)
    .map(f => {
      const meta = f.citationMetadata!;
      const lastNames = (meta.authors || []).map(a => a.lastName).filter(Boolean);
      const year = meta.dates?.publicationDate ? meta.dates.publicationDate.substring(0, 4) : "n.d.";
      const inText = lastNames.length > 0 ? `(${lastNames.join(" & ")}, ${year})` : `(${year})`;
      return {
        id: f.id,
        type: meta.sourceType || "Source",
        ref: generateCitation(meta, "APA"),
        inText
      };
    });

  return (
    <div className="space-y-6">
      {/* Top Header Panel */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold font-serif text-[#1A365D]">Research Intelligence Dashboard</h2>
          <p className="text-xs text-gray-500 font-mono uppercase tracking-wider">
            Overview of your doctoral publications workspace
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-4 h-4 text-gray-400 absolute left-3 top-2.5" />
            <input 
              type="text" 
              placeholder="Search projects..." 
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="pl-9 pr-4 py-2 border border-[#E2E8F0] rounded-xl text-xs w-[240px] focus:outline-none focus:border-[#C08A3E] font-sans"
            />
          </div>
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className={`px-3 py-2 border rounded-xl text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer transition-all ${
              sidebarOpen ? "bg-[#C08A3E] text-white border-[#C08A3E]" : "bg-white border-[#E2E8F0] text-[#1A365D] hover:bg-gray-50"
            }`}
          >
            <BookOpen className="w-4 h-4" />
            {sidebarOpen ? "Close Vault" : "Citations Vault"}
          </button>
          <button 
            onClick={onCreateProject}
            className="px-4 py-2 bg-[#1A365D] hover:bg-[#122847] text-white border border-[#1A365D] rounded-xl text-xs font-mono font-semibold uppercase tracking-wider flex items-center gap-1.5 cursor-pointer shadow-sm transition-all"
          >
            <PlusCircle className="w-4 h-4 text-[#C08A3E]" />
            New Project
          </button>
        </div>
      </div>

      {/* Main Split-Pane Container */}
      <div className="flex gap-6 items-start">
        <div className="flex-1 space-y-6 min-w-0 transition-all duration-300">
          {/* Grid of Key Analytical Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-6 gap-4">
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-mono font-bold text-[#76726A] uppercase block">Total Papers</span>
          <span className="text-2xl font-serif font-bold text-[#1A365D] block mt-1">{totalProjects}</span>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-mono font-bold text-[#76726A] uppercase block">Active Projects</span>
          <span className="text-2xl font-serif font-bold text-[#1A365D] block mt-1 text-emerald-600">{activeProjects}</span>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-mono font-bold text-[#76726A] uppercase block">Completed</span>
          <span className="text-2xl font-serif font-bold text-[#1A365D] block mt-1 text-blue-600">{completedProjects}</span>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-mono font-bold text-[#76726A] uppercase block">Draft / In Review</span>
          <span className="text-2xl font-serif font-bold text-[#1A365D] block mt-1 text-yellow-600">{draftArticles}</span>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-mono font-bold text-[#76726A] uppercase block">Submitted</span>
          <span className="text-2xl font-serif font-bold text-[#1A365D] block mt-1 text-[#946A30]">{submittedArticles}</span>
        </div>
        <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm">
          <span className="text-[10px] font-mono font-bold text-[#76726A] uppercase block">Accepted (Q1/Q2)</span>
          <span className="text-2xl font-serif font-bold text-[#1A365D] block mt-1 text-indigo-600">{acceptedArticles}</span>
        </div>
      </div>

      {/* Main Split Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Projects & Active Cards (Col-span 2) */}
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
            <div className="flex items-center justify-between border-b border-[#F1F5F9] pb-3">
              <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] flex items-center gap-1.5">
                <Folder className="w-4 h-4 text-[#C08A3E]" />
                Manuscript Workspaces
              </h3>
              {project && (
                <button
                  onClick={() => onSelectProject(project.id)}
                  className="px-2.5 py-1.5 bg-[#1A365D]/10 hover:bg-[#1A365D]/20 text-[#1A365D] rounded-lg text-[10px] font-mono font-bold uppercase tracking-wider flex items-center gap-1 cursor-pointer transition-all"
                >
                  <Play className="w-3 h-3 text-[#C08A3E]" />
                  Continue Active Work
                </button>
              )}
            </div>

            {filteredProjects.length === 0 ? (
              <div className="text-center py-10 text-gray-400 text-xs">
                No research projects found. Click "New Project" to start.
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {filteredProjects.map((p) => {
                  const isCurrent = project?.id === p.id;
                  const completion = getCompletionPercentage(p);
                  return (
                    <div 
                      key={p.id}
                      onClick={() => onSelectProject(p.id)}
                      className={`border rounded-xl p-4 cursor-pointer hover-lift relative overflow-hidden flex flex-col justify-between min-h-[170px] ${
                        isCurrent 
                          ? "border-[#C08A3E] bg-[#FAF8F5] shadow-md shadow-[#C08A3E]/5" 
                          : "border-[#E2E8F0] bg-white"
                      }`}
                    >
                      <div className="space-y-1.5">
                        <div className="flex items-center justify-between">
                          <span className="text-[9px] font-mono bg-[#1A365D]/10 text-[#1A365D] px-2 py-0.5 rounded-full font-bold uppercase">
                            {p.field.split(" ")[0] || "General"}
                          </span>
                        <div className="flex items-center gap-2">
                          <span className="text-[9px] font-mono text-gray-400">
                            ID: {p.id.substring(0, 8)}
                          </span>
                          <button
                            onClick={(e) => { e.stopPropagation(); onDeleteProject(p.id); }}
                            className="p-1 rounded-md hover:bg-red-50 text-gray-300 hover:text-red-500 transition-all cursor-pointer"
                            title="Delete workspace"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        </div>
                        <h4 className="text-xs font-bold text-[#1A365D] line-clamp-2 font-display">{p.title || "Untitled Dissertation Project"}</h4>
                        <div className="text-[10px] text-gray-500 flex items-center gap-2">
                          <Clock className="w-3 h-3 text-gray-400" />
                          <span>Phase {p.currentPhase}: {getPhaseName(p.currentPhase)}</span>
                        </div>
                      </div>

                      <div className="space-y-2 mt-4 pt-3 border-t border-[#F1F5F9]">
                        <div className="flex items-center justify-between text-[10px]">
                          <span className="font-mono text-gray-400">Completion:</span>
                          <span className="font-bold text-[#1A365D]">{completion}%</span>
                        </div>
                        <div className="w-full bg-[#E2E8F0] h-1.5 rounded-full overflow-hidden">
                          <div 
                            className="bg-[#C08A3E] h-full rounded-full transition-all duration-300"
                            style={{ width: `${completion}%` }}
                          />
                        </div>
                        <div className="flex items-center justify-between text-[9px] text-gray-400 font-mono pt-1">
                          <span>AI: <span className="text-[#0E7490] font-bold">{p.aiSettings?.provider?.toUpperCase() || "AUTO"}</span></span>
                          <span className="uppercase font-semibold text-emerald-600">{p.status || "Draft"}</span>
                        </div>
                      </div>

                      {isCurrent && (
                        <div className="absolute top-0 right-0 w-2.5 h-2.5 bg-[#C08A3E] rounded-bl-full" />
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Productivity Analytics Panel */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] border-b border-[#F1F5F9] pb-3 flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-[#C08A3E]" />
              Research Productivity & AI Analytics
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {/* Metric 1 */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold text-gray-400 uppercase flex items-center gap-1">
                  <FileText className="w-3.5 h-3.5 text-[#1A365D]" /> 
                  Words Compiled
                </span>
                <span className="text-2xl font-bold font-serif text-[#1A365D] block">{totalWords.toLocaleString()}</span>
                <p className="text-[9px] text-gray-400 leading-normal">Total words generated across active co-writing sections.</p>
              </div>

              {/* Metric 2 */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold text-gray-400 uppercase flex items-center gap-1">
                  <Cpu className="w-3.5 h-3.5 text-[color:var(--color-cyan-accent-dim)]" />
                  AI Call Counts
                </span>
                <span className="text-2xl font-bold font-serif text-[#1A365D] block">{totalCalls}</span>
                <p className="text-[9px] text-gray-400 leading-normal">Total agent requests dispatched to AI providers.</p>
              </div>

              {/* Metric 3 */}
              <div className="space-y-1">
                <span className="text-[10px] font-mono font-bold text-gray-400 uppercase flex items-center gap-1">
                  <DollarSign className="w-3.5 h-3.5 text-emerald-600" />
                  Estimated Expenditures
                </span>
                <span className="text-2xl font-bold font-serif text-emerald-600 block">${totalCost.toFixed(4)}</span>
                <p className="text-[9px] text-gray-400 leading-normal">Aggregated cloud costs based on input/output pricing tokens.</p>
              </div>
            </div>

            {/* Popular Providers bar chart simulation */}
            {Object.keys(providerStats).length > 0 && (
              <div className="space-y-2 pt-2 border-t border-[#F1F5F9]">
                <span className="text-[9px] font-mono font-bold text-gray-400 uppercase block mb-2">Engine Dispatch Frequency</span>
                <div className="space-y-2">
                  {Object.entries(providerStats).map(([prov, cnt]) => {
                    const pct = Math.round((cnt / totalCalls) * 100);
                    return (
                      <div key={prov} className="space-y-1">
                        <div className="flex justify-between items-center text-[9px] font-mono">
                          <span className="uppercase text-gray-600">{prov}</span>
                          <span className="text-gray-400">{cnt} calls ({pct}%)</span>
                        </div>
                        <div className="w-full bg-[#F1F5F9] h-1.5 rounded-full overflow-hidden">
                          <div
                            className="bg-[color:var(--color-cyan-accent-dim)] h-full rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Column: Timeline & Side Panels (Col-span 1) */}
        <div className="space-y-6">
          
          {/* Notifications Panel */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] border-b border-[#F1F5F9] pb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Bell className="w-4 h-4 text-[#C08A3E]" />
                Scholar Alerts
              </span>
              {alerts.length > 0 && <span className="w-2.5 h-2.5 bg-[#C08A3E] rounded-full animate-ping" />}
            </h3>
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <p className="text-[11px] text-gray-400 text-center py-4">No alerts yet.</p>
              ) : (
                alerts.map((n) => (
                  <div key={n.id} className="flex gap-2.5 items-start p-2.5 rounded-xl hover:bg-[#FAF8F5] transition-all">
                    <div className={`w-2 h-2 rounded-full mt-1.5 shrink-0 ${
                      n.type === "success" ? "bg-emerald-500" :
                      n.type === "warning" ? "bg-amber-500" : "bg-blue-500"
                    }`} />
                    <div className="space-y-0.5">
                      <p className="text-xs text-[#1E293B] leading-normal font-sans">{n.text}</p>
                      <span className="text-[9px] text-gray-400 font-mono block">{n.time}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* AI Gateway panel — real current mode/provider/fallback state,
              real live health check (reused AIGateway.healthCheckProvider,
              same function AIControlCenter.tsx already calls). Never an
              unconditional "ONLINE" (docs/planning/
              dashboard-mockup-honest-data-audit.md). */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] border-b border-[#F1F5F9] pb-3 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Cpu className="w-4 h-4 text-[#C08A3E]" />
                AI Gateway
              </span>
              <span className={`text-[10px] font-mono font-bold uppercase px-2 py-0.5 rounded-full flex items-center gap-1 ${
                checkingGateway ? "bg-gray-100 text-gray-500" :
                gatewayStatus?.status === "online" ? "bg-emerald-50 text-emerald-700 border border-emerald-200" :
                gatewayStatus?.status === "offline" || gatewayStatus?.status === "degraded" ? "bg-red-50 text-red-700 border border-red-200" :
                "bg-gray-100 text-gray-500 border border-gray-200"
              }`}>
                {checkingGateway ? "Checking..." : (gatewayStatus?.status || "unchecked")}
              </span>
            </h3>
            {currentMode && currentProviderInfo ? (
              <>
                <div>
                  <span className="text-sm font-bold text-[#1A365D] block">{currentMode.title}</span>
                  <span className="text-xs text-gray-500">{currentProviderInfo.name}</span>
                </div>
                <div className="text-[10px] font-mono text-gray-400 uppercase">
                  {fallbackCount > 0 ? `${fallbackCount} fallback provider(s) configured` : "No fallback configured"}
                </div>
              </>
            ) : (
              <p className="text-[11px] text-gray-400">Not configured yet.</p>
            )}
          </div>

          {/* AI Agents panel — real, static registered-agent-type count.
              Never "N Active"/"N Running": no live concurrency model
              exists (docs/planning/dashboard-mockup-honest-data-audit.md). */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1A365D]/5 border border-[#1A365D]/10 flex items-center justify-center shrink-0">
              <Cpu className="w-5 h-5 text-[#1A365D]" />
            </div>
            <div>
              <span className="text-2xl font-serif font-bold text-[#1A365D] block leading-none">{registeredAgentCount}</span>
              <span className="text-[10px] font-mono font-bold text-[#76726A] uppercase tracking-wider">Agent types available</span>
            </div>
          </div>

          {/* Scholar Research Snapshot — real per-scholar counters, never a
              fabricated platform-wide aggregate (see derivation above). */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] border-b border-[#F1F5F9] pb-3 flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#C08A3E]" />
              Research Snapshot
            </h3>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <span className="text-lg font-serif font-bold text-[#1A365D] block leading-none">{totalProjects}</span>
                <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">Research Projects</span>
              </div>
              <div>
                <span className="text-lg font-serif font-bold text-[#1A365D] block leading-none">{scholarDatasetCount}</span>
                <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">Datasets</span>
              </div>
              <div>
                <span className="text-lg font-serif font-bold text-[#1A365D] block leading-none">{scholarCitationCount}</span>
                <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">Citations cached</span>
              </div>
              <div>
                <span className="text-lg font-serif font-bold text-[#1A365D] block leading-none">{scholarJournalSelectedCount}</span>
                <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">Journals selected</span>
              </div>
            </div>
          </div>

          {/* Knowledge Vault panel — real summed file bytes, never a
              fabricated TB figure; utilization only via the real
              navigator.storage.estimate() API, honestly "not available"
              when it doesn't resolve, never a fabricated percentage. */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] border-b border-[#F1F5F9] pb-3 flex items-center gap-1.5">
              <HelpCircle className="w-4 h-4 text-[#C08A3E]" />
              Knowledge Vault
            </h3>
            <div className="flex items-center justify-between">
              <div>
                <span className="text-lg font-serif font-bold text-[#1A365D] block leading-none">{formatBytes(vaultByteSize)}</span>
                <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">{(project?.knowledgeVault?.files || []).length} file(s) stored</span>
              </div>
              <div className="text-right">
                {storageEstimate ? (
                  <>
                    <span className="text-lg font-serif font-bold text-[#1A365D] block leading-none">
                      {Math.round((storageEstimate.usage / storageEstimate.quota) * 100)}%
                    </span>
                    <span className="text-[9px] font-mono font-bold text-gray-400 uppercase">Browser storage used</span>
                  </>
                ) : (
                  <span className="text-[10px] text-gray-400 italic">Storage estimate not available</span>
                )}
              </div>
            </div>
          </div>

          {/* Today's Research — real, timestamped usageLogs activity only.
              Never a fabricated discovery-feed count: no background
              crawler exists in this app (docs/planning/
              dashboard-mockup-honest-data-audit.md). */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-4 shadow-sm flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-[#1A365D]/5 border border-[#1A365D]/10 flex items-center justify-center shrink-0">
              <TrendingUp className="w-5 h-5 text-[#1A365D]" />
            </div>
            <div>
              <span className="text-2xl font-serif font-bold text-[#1A365D] block leading-none">{todaysActionCount}</span>
              <span className="text-[10px] font-mono font-bold text-[#76726A] uppercase tracking-wider">Today's Research — AI actions today</span>
            </div>
          </div>

          {/* Quick Actions Panel */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-3">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] border-b border-[#F1F5F9] pb-3 flex items-center gap-1.5">
              <Activity className="w-4 h-4 text-[#C08A3E]" />
              Quick Command Panel
            </h3>
            <div className="grid grid-cols-1 gap-2">
              <button 
                onClick={() => onNavigateToPhase("B")}
                className="w-full text-left p-2.5 hover:bg-[#FAF8F5] border border-transparent hover:border-[#E2E8F0] rounded-xl flex items-center justify-between group cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2">
                  <Star className="w-4 h-4 text-[#C08A3E]" />
                  <span className="text-xs text-gray-700">Anchor to Dissertation</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:translate-x-1 transition-all" />
              </button>
              <button 
                onClick={() => onNavigateToPhase("D")}
                className="w-full text-left p-2.5 hover:bg-[#FAF8F5] border border-transparent hover:border-[#E2E8F0] rounded-xl flex items-center justify-between group cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2">
                  <FileText className="w-4 h-4 text-[#1A365D]" />
                  <span className="text-xs text-gray-700">Find Target Journal</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:translate-x-1 transition-all" />
              </button>
              <button 
                onClick={() => onNavigateToPhase("G")}
                className="w-full text-left p-2.5 hover:bg-[#FAF8F5] border border-transparent hover:border-[#E2E8F0] rounded-xl flex items-center justify-between group cursor-pointer transition-all"
              >
                <div className="flex items-center gap-2">
                  <ShieldCheck className="w-4 h-4 text-emerald-600" />
                  <span className="text-xs text-gray-700">Run Compliance Audit</span>
                </div>
                <ArrowRight className="w-3.5 h-3.5 text-gray-400 group-hover:translate-x-1 transition-all" />
              </button>
            </div>
          </div>

          {/* Activity Log Panel */}
          <div className="bg-white border border-[#E2E8F0] rounded-2xl p-5 shadow-sm space-y-4">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] border-b border-[#F1F5F9] pb-3 flex items-center gap-1.5">
              <Clock className="w-4 h-4 text-[#C08A3E]" />
              Recent Activity
            </h3>
            {sortedActivity.length === 0 ? (
              <p className="text-[11px] text-gray-400 text-center py-4">No recent activity logged.</p>
            ) : (
              <div className="space-y-4 relative before:absolute before:left-3 before:top-2 before:bottom-2 before:w-[1px] before:bg-gray-100">
                {sortedActivity.map((act, index) => (
                  <div key={index} className="flex gap-4 items-start relative pl-1">
                    <div className="w-4 h-4 rounded-full bg-white border-2 border-[#C08A3E] flex items-center justify-center shrink-0 z-10">
                      <div className="w-1.5 h-1.5 rounded-full bg-[#1A365D]" />
                    </div>
                    <div className="space-y-0.5">
                      <span className="text-[10px] font-bold text-[#1D4ED8] block font-mono">{act.title}</span>
                      <span className="text-[9px] text-[#946A30] font-medium block uppercase tracking-wider">{act.projectTitle}</span>
                      <p className="text-[11px] text-gray-600 leading-normal">{act.desc}</p>
                      <span className="text-[9px] text-gray-400 font-mono block pt-0.5">{act.time}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
      </div>

      {/* Right Split-Pane: Live Citation & Construct Vault */}
      {sidebarOpen && (
        <div className="w-[360px] border border-[#E2E8F0] bg-[#FAF9F6] rounded-2xl flex flex-col shrink-0 shadow-sm overflow-hidden sticky top-6 max-h-[calc(100vh-120px)] animate-fade-in">
          <div className="p-4 border-b border-[#E2E8F0] bg-white flex items-center justify-between">
            <span className="text-xs font-mono font-bold uppercase text-[#1A365D] tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4 text-[#C08A3E]" />
              Cached Vault Citations
            </span>
            <button
              onClick={() => setSidebarOpen(false)}
              className="text-gray-400 hover:text-[#1A365D] cursor-pointer p-1"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-3 border-b border-[#E2E8F0] bg-white/50">
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-3 top-2.5 text-gray-400" />
              <input
                type="text"
                placeholder="Filter cached bibtex / authors..."
                value={citationSearch}
                onChange={(e) => setCitationSearch(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 bg-white border border-[#CBD5E1] rounded-lg text-xs focus:outline-none focus:border-[#C08A3E] font-sans"
              />
            </div>
          </div>

          <div className="flex-1 overflow-y-auto p-4 space-y-3.5">
            {(() => {
              const filtered = cachedCitations.filter(item =>
                item.ref.toLowerCase().includes(citationSearch.toLowerCase()) || item.type.toLowerCase().includes(citationSearch.toLowerCase())
              );
              if (cachedCitations.length === 0) {
                return <p className="text-[11px] text-gray-400 text-center py-6">No cached citations yet — upload a source in the Knowledge Vault to see it here.</p>;
              }
              if (filtered.length === 0) {
                return <p className="text-[11px] text-gray-400 text-center py-6">No cached citations match your search.</p>;
              }
              return filtered.map((item) => (
                <div key={item.id} className="bg-white p-3.5 rounded-xl border border-[#E2E8F0] shadow-2xs space-y-2 hover:border-[#C08A3E]/40 transition-all group">
                  <div className="flex justify-between items-start">
                    <span className="text-[10px] font-mono font-bold text-[#946A30] bg-[#C08A3E]/10 px-2 py-0.5 rounded">
                      {item.type}
                    </span>
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(item.inText);
                        alert(`Copied parenthetical citation: ${item.inText}`);
                      }}
                      title="Copy Parenthetical Citation"
                      className="text-gray-400 hover:text-[#1A365D] cursor-pointer group-hover:text-[#C08A3E] transition-colors"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <p className="text-xs font-serif text-[#1A365D] leading-snug">
                    {item.ref}
                  </p>
                  <div className="bg-[#F8FAFC] p-2 rounded border border-[#F1F5F9] font-mono text-[10px] text-gray-600 flex justify-between items-center">
                    <span>{item.inText}</span>
                    <span className="text-[9px] text-gray-400 uppercase">APA 7th</span>
                  </div>
                </div>
              ));
            })()}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
