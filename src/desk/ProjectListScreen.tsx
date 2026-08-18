import { useCallback, useEffect, useMemo, useState } from "react";
import { createProject, listOutputTypes, listProjects } from "./api";
import { getSupabaseClient } from "../services/supabaseClient";
import type { OutputTypeSummary, ProjectView } from "./types";
import ScholarCoreLogo from "../components/ScholarCoreLogo";

/**
 * Desk's entry surface: the signed-in user's own projects — transformed into
 * the SCHOLAR CORE Research Command Center.
 */
export default function ProjectListScreen({
  onOpen,
  userEmail,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
  showWelcome,
  onWelcomeSeen,
}: {
  onOpen: (projectId: string) => void;
  userEmail: string | null;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
  showWelcome?: boolean;
  onWelcomeSeen?: () => void;
}) {
  const [projects, setProjects] = useState<ProjectView[] | null>(null);
  const [types, setTypes] = useState<OutputTypeSummary[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [creating, setCreating] = useState(false);
  const [welcomeVisible, setWelcomeVisible] = useState(() => showWelcome ?? false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    if (showWelcome) onWelcomeSeen?.();
  }, []);

  useEffect(() => {
    const handleScroll = () => {
      setScrolled(window.scrollY > 10);
    };
    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  const load = useCallback(() => {
    listProjects()
      .then((r) => setProjects(r.items))
      .catch((e) => setError((e as Error).message));
  }, []);

  useEffect(load, [load]);

  useEffect(() => {
    if (!choosing || types) return;
    listOutputTypes()
      .then((r) => setTypes(r.items))
      .catch((e) => setError((e as Error).message));
  }, [choosing, types]);

  async function handleCreate(outputTypeId: string) {
    setCreating(true);
    setError(null);
    try {
      const project = await createProject(outputTypeId);
      onOpen(project.projectId);
    } catch (e) {
      setError((e as Error).message);
      setCreating(false);
    }
  }

  return (
    <div className="min-h-screen bg-[#050505] text-white relative overflow-hidden font-sans selection:bg-indigo-500/30">
      
      {/* Dynamic Background Effects */}
      <div className="absolute top-[-20%] right-[-10%] w-[50%] h-[50%] bg-indigo-600/10 blur-[120px] rounded-full pointer-events-none" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[40%] h-[60%] bg-purple-600/10 blur-[150px] rounded-full pointer-events-none" />
      <div className="absolute inset-0 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMSIgY3k9IjEiIHI9IjEiIGZpbGw9InJnYmEoMjU1LCAyNTUsIDI1NSwgMC4wNSkiLz48L3N2Zz4=')] opacity-30 pointer-events-none" />

      {/* Header */}
      <header className={`fixed top-0 inset-x-0 z-50 transition-all duration-300 ${scrolled ? 'bg-[#0A0A0A]/80 backdrop-blur-xl border-b border-white/10 shadow-2xl py-3' : 'bg-transparent py-6'}`}>
        <div className="mx-auto max-w-7xl px-6 py-2 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="relative flex items-center justify-center w-10 h-10 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 shadow-lg">
              <span className="text-white font-bold text-xl font-serif">S</span>
              <div className="absolute inset-0 rounded-xl ring-1 ring-white/20"></div>
            </div>
            <span className="text-xl font-bold tracking-tight bg-clip-text text-transparent bg-gradient-to-r from-white to-white/70">
              Scholar Core
            </span>
          </div>
          <div className="flex items-center gap-2 sm:gap-4 min-w-0">
            {userEmail && (
              <span className="truncate text-sm text-white/50 hidden sm:block font-medium px-4 py-1.5 rounded-full bg-white/5 border border-white/5">
                {userEmail}
              </span>
            )}
            <div className="flex items-center gap-1 bg-white/5 border border-white/10 rounded-full p-1">
              {onOpenVault && (
                <button onClick={onOpenVault} className="px-4 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all">
                  Knowledge
                </button>
              )}
              {onOpenAiAccess && (
                <button onClick={onOpenAiAccess} className="px-4 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all">
                  Agents
                </button>
              )}
              {onOpenAccountSettings && (
                <button onClick={onOpenAccountSettings} className="px-4 py-1.5 text-sm font-medium text-white/70 hover:text-white hover:bg-white/10 rounded-full transition-all">
                  Settings
                </button>
              )}
            </div>
            <button
              onClick={() => getSupabaseClient().auth.signOut()}
              className="ml-2 rounded-full w-10 h-10 flex items-center justify-center bg-red-500/10 text-red-400 hover:bg-red-500/20 hover:text-red-300 transition-colors border border-red-500/20"
              title="Sign out"
            >
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" /></svg>
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto max-w-7xl px-6 pt-36 pb-24 animate-fade-in">
        {welcomeVisible && (
          <div className="mb-12 flex items-center justify-between gap-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 backdrop-blur-md px-6 py-5 shadow-lg shadow-indigo-500/5">
            <div className="flex items-center gap-4">
              <div className="w-12 h-12 rounded-full bg-indigo-500/20 flex items-center justify-center border border-indigo-500/30">
                 <svg className="w-6 h-6 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 3v4M3 5h4M6 17v4m-2-2h4m5-16l2.286 6.857L21 12l-5.714 2.143L13 21l-2.286-6.857L5 12l5.714-2.143L13 3z" /></svg>
              </div>
              <div>
                <p className="text-lg font-bold text-white">Welcome to your Command Center</p>
                <p className="text-white/60 text-sm mt-1">Initialize a new project or explore your agentic tools.</p>
              </div>
            </div>
            <button
              onClick={() => setWelcomeVisible(false)}
              className="text-white/40 hover:text-white transition-colors"
            >
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        )}

        {error && (
          <div className="mb-12 rounded-2xl border border-red-500/30 bg-red-500/10 backdrop-blur-md px-6 py-5 text-red-400 shadow-lg flex items-center gap-4">
            <svg className="w-6 h-6 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <span className="font-medium">{error}</span>
          </div>
        )}

        {choosing ? (
          <ChooseOutputType
            types={types}
            creating={creating}
            onPick={handleCreate}
            onCancel={() => setChoosing(false)}
          />
        ) : (
          <>
            {/* Command Center Widgets */}
            <section className="mb-20">
              <div className="flex items-end justify-between mb-8">
                <div>
                  <h1 className="text-4xl font-black tracking-tight mb-2 text-transparent bg-clip-text bg-gradient-to-r from-white to-white/70">Workspace Modules</h1>
                  <p className="text-white/50 text-lg">Your agentic tools and active research environments.</p>
                </div>
              </div>
              
              <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
                <CapabilityCard
                  icon="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
                  title="Projects"
                  desc="Active research workflows and manuscripts."
                  action="Scroll to View"
                  color="from-indigo-500/20 to-blue-500/20"
                  iconColor="text-blue-400"
                />
                <CapabilityCard
                  icon="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4"
                  title="Knowledge Vault"
                  desc="Your verified central library of PDFs and evidence."
                  action="Open Vault"
                  onClick={onOpenVault}
                  color="from-emerald-500/20 to-teal-500/20"
                  iconColor="text-emerald-400"
                />
                <CapabilityCard
                  icon="M13 10V3L4 14h7v7l9-11h-7z"
                  title="AI Agents"
                  desc="Configure extraction and synthesis models."
                  action="Manage AI"
                  onClick={onOpenAiAccess}
                  color="from-purple-500/20 to-pink-500/20"
                  iconColor="text-purple-400"
                />
                <CapabilityCard
                  icon="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
                  title="Settings"
                  desc="Account, subscription, and system preferences."
                  action="Configure"
                  onClick={onOpenAccountSettings}
                  color="from-slate-500/20 to-gray-500/20"
                  iconColor="text-slate-400"
                />
              </div>
            </section>

            {/* Projects Section */}
            <div className="mb-8 flex items-center justify-between gap-4 border-b border-white/10 pb-6">
              <h2 className="text-3xl font-bold tracking-tight text-white flex items-center gap-3">
                <div className="w-2 h-8 bg-indigo-500 rounded-full"></div>
                Active Workflows
              </h2>
              <button
                onClick={() => setChoosing(true)}
                className="group relative px-6 py-3 rounded-xl font-bold overflow-hidden shadow-lg"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-indigo-500 to-purple-600 transition-transform group-hover:scale-105"></div>
                <span className="relative flex items-center gap-2 text-white">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
                  Initialize Project
                </span>
              </button>
            </div>

            {projects === null ? (
              <div className="flex justify-center items-center py-32">
                 <div className="w-12 h-12 border-4 border-white/10 border-t-indigo-500 rounded-full animate-spin"></div>
              </div>
            ) : projects.length === 0 ? (
              <EmptyState onStart={() => setChoosing(true)} />
            ) : (
              <div className="grid md:grid-cols-2 gap-6">
                {projects.map((p) => (
                  <ProjectCard key={p.projectId} project={p} onOpen={() => onOpen(p.projectId)} />
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}

function CapabilityCard({
  icon,
  title,
  desc,
  action,
  onClick,
  color,
  iconColor,
}: {
  icon: string;
  title: string;
  desc: string;
  action: string;
  onClick?: () => void;
  color: string;
  iconColor: string;
}) {
  return (
    <div className="group relative p-8 rounded-3xl border border-white/5 bg-[#0A0A0A]/50 backdrop-blur-xl transition-all duration-300 hover:border-white/10 hover:shadow-[0_20px_40px_rgba(0,0,0,0.4)] flex flex-col h-full overflow-hidden">
      <div className={`absolute top-0 left-0 w-full h-full bg-gradient-to-br ${color} opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none`}></div>
      <div className={`w-14 h-14 rounded-2xl bg-white/5 border border-white/5 flex items-center justify-center mb-6 relative z-10 group-hover:bg-white/10 transition-colors`}>
        <svg className={`w-7 h-7 ${iconColor}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={icon} />
        </svg>
      </div>
      <h3 className="font-bold text-2xl mb-3 text-white/90 relative z-10">{title}</h3>
      <p className="text-white/50 mb-8 flex-grow leading-relaxed relative z-10">{desc}</p>
      
      <div className="mt-auto relative z-10 pt-4 border-t border-white/5">
        {onClick ? (
          <button
            onClick={onClick}
            className={`inline-flex items-center justify-between w-full font-bold ${iconColor} hover:text-white transition-colors cursor-pointer`}
          >
            {action}
            <div className="w-8 h-8 rounded-full bg-white/5 flex items-center justify-center group-hover:bg-white/20 group-hover:translate-x-1 transition-all">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
            </div>
          </button>
        ) : (
          <p className="inline-flex items-center text-sm font-medium text-white/30">
            {action}
          </p>
        )}
      </div>
    </div>
  );
}

function ProjectCard({ project, onOpen }: { project: ProjectView; onOpen: () => void }) {
  const percent = Math.round(project.intakeCompleteness * 100);
  const signedOff = project.gates.filter((g) => g.status === "signed_off").length;

  return (
    <button
      onClick={onOpen}
      className="group text-left p-8 rounded-[2rem] border border-white/5 bg-[#0A0A0A]/50 hover:bg-[#111111]/80 backdrop-blur-xl transition-all duration-300 hover:border-indigo-500/30 hover:shadow-[0_10px_30px_rgba(99,102,241,0.1)] relative overflow-hidden flex flex-col"
    >
      <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-500/10 blur-[40px] rounded-full group-hover:bg-indigo-500/20 transition-colors"></div>
      
      <div className="flex items-start justify-between mb-6 relative z-10">
        <div className="w-12 h-12 rounded-xl bg-white/5 border border-white/10 flex items-center justify-center text-white/70 group-hover:text-indigo-400 group-hover:border-indigo-500/30 transition-all">
           <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg>
        </div>
        <span className={`px-3 py-1.5 rounded-full text-xs font-bold ${project.hasDocument ? 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20' : 'bg-white/5 text-white/40 border border-white/10'}`}>
          {project.hasDocument ? "Drafting" : "Extraction"}
        </span>
      </div>

      <h3 className="text-2xl font-bold text-white mb-2 relative z-10 group-hover:text-indigo-100 transition-colors">
        {project.outputTypeId.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ')}
      </h3>
      <p className="text-sm text-white/40 mb-8 relative z-10">
        {signedOff} of {project.gates.length} approval gates passed
      </p>
      
      <div className="mt-auto relative z-10 bg-white/5 p-4 rounded-xl border border-white/5">
        <div className="flex justify-between text-xs font-bold text-white/60 mb-2">
           <span>Pipeline Completeness</span>
           <span className="text-indigo-400">{percent}%</span>
        </div>
        <div className="w-full h-2 rounded-full bg-black/50 overflow-hidden border border-white/5">
          <div className="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-700 ease-out" style={{ width: `${percent}%` }} />
        </div>
      </div>
    </button>
  );
}

function EmptyState({ onStart }: { onStart: () => void }) {
  return (
    <div className="rounded-[2rem] border border-dashed border-white/10 bg-[#0A0A0A]/30 backdrop-blur-sm px-6 py-24 text-center transition-all hover:border-indigo-500/30 hover:bg-[#0A0A0A]/60 flex flex-col items-center">
      <div className="w-20 h-20 rounded-full bg-indigo-500/10 text-indigo-400 flex items-center justify-center mb-8 border border-indigo-500/20">
         <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
           <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
         </svg>
      </div>
      <h3 className="text-3xl font-bold text-white mb-4">Initialize your first project</h3>
      <p className="max-w-md text-lg text-white/40 mb-10 leading-relaxed">
        Start a new thesis, manuscript, or research proposal. The agents are ready to assist.
      </p>
      <button
        onClick={onStart}
        className="rounded-full bg-gradient-to-r from-indigo-600 to-purple-600 px-8 py-4 text-lg font-bold text-white transition-all hover:scale-105 hover:shadow-[0_0_30px_rgba(99,102,241,0.5)] flex items-center gap-3"
      >
        <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M12 4v16m8-8H4" /></svg>
        New Project
      </button>
    </div>
  );
}

const FAMILY_LABEL: Record<string, string> = {
  short_form: "Short-form writing",
  long_form: "Long-form writing",
  publication: "Publications",
  proposal_funding: "Proposals & funding",
  applied_professional: "Applied & professional",
  presentation: "Presentations",
};

function ChooseOutputType({
  types,
  creating,
  onPick,
  onCancel,
}: {
  types: OutputTypeSummary[] | null;
  creating: boolean;
  onPick: (id: string) => void;
  onCancel: () => void;
}) {
  const [selected, setSelected] = useState("");

  const groups = useMemo(() => {
    if (!types) return [];
    const byFamily = new Map<string, OutputTypeSummary[]>();
    for (const t of types) {
      const list = byFamily.get(t.family) ?? [];
      list.push(t);
      byFamily.set(t.family, list);
    }
    return Array.from(byFamily.entries()).sort(([a], [b]) => (FAMILY_LABEL[a] ?? a).localeCompare(FAMILY_LABEL[b] ?? b));
  }, [types]);

  return (
    <div className="max-w-3xl mx-auto py-10 animate-fade-in">
      <button
        onClick={onCancel}
        className="mb-10 inline-flex items-center gap-2 text-sm font-bold text-white/50 hover:text-white transition-colors px-4 py-2 rounded-full bg-white/5 border border-white/5"
      >
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M10 19l-7-7m0 0l7-7m-7 7h18" /></svg>
        Return to Command Center
      </button>
      
      <div className="mb-12">
        <h2 className="text-4xl font-black tracking-tight text-white mb-4">
          Select Output Format
        </h2>
        <p className="text-xl text-white/50">
          This initializes the specific agentic workflow, constraints, and journal requirements for your project.
        </p>
      </div>

      {!types ? (
        <div className="flex items-center justify-center py-20">
          <div className="w-12 h-12 border-4 border-white/10 border-t-indigo-500 rounded-full animate-spin"></div>
        </div>
      ) : (
        <div className="rounded-[2rem] border border-white/10 bg-[#0A0A0A]/80 backdrop-blur-2xl p-10 shadow-[0_20px_40px_rgba(0,0,0,0.6)]">
          <div className="flex flex-col gap-8">
            <div className="flex flex-col gap-4">
              <label htmlFor="output-type" className="text-sm font-bold text-white/70 uppercase tracking-widest">
                Target Publication Type
              </label>
              <div className="relative">
                <select
                  id="output-type"
                  value={selected}
                  onChange={(e) => setSelected(e.target.value)}
                  className="w-full appearance-none rounded-2xl border border-white/10 bg-white/5 px-6 py-5 text-lg font-bold text-white outline-none transition-all focus:border-indigo-500 focus:bg-white/10"
                >
                  <option value="" disabled className="bg-[#050505] text-white/50">
                    Choose a format...
                  </option>
                  {groups.map(([family, items]) => (
                    <optgroup key={family} label={FAMILY_LABEL[family] ?? family} className="bg-[#0A0A0A] text-indigo-400 font-bold p-2">
                      {items.map((t) => (
                        <option key={t.id} value={t.id} disabled={!t.available} className="bg-[#050505] text-white py-2">
                          {t.available ? t.label : `${t.label} (Maintenance)`}
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-6 text-white/50">
                  <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M19 9l-7 7-7-7" /></svg>
                </div>
              </div>
            </div>
            <button
              onClick={() => onPick(selected)}
              disabled={!selected || creating}
              className="w-full sm:w-auto self-end rounded-xl bg-indigo-600 px-10 py-5 text-lg font-bold text-white transition-all hover:bg-indigo-500 hover:shadow-[0_0_20px_rgba(99,102,241,0.6)] disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-3"
            >
              {creating ? (
                <>
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Initializing Agents...
                </>
              ) : (
                <>
                  Boot Workspace
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                </>
              )}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
