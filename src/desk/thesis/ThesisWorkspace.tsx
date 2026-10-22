import React, { useState, useEffect, useRef, useCallback } from "react";
import type { ThesisStage, ThesisProjectData } from "./types";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";
import { authedJsonFetch, getProject, saveIntakeAnswers } from "../api";
import VivaVoceSimulator from "./components/VivaVoceSimulator";
import type {
  VivaSimulationResponse,
  VivaQuestion,
  ChapterAuditResult,
  CrossChapterCheck,
} from "../../../server/routes/project/thesis";

const THESIS_STAGES: Array<{ id: ThesisStage; label: string; icon: string; desc: string }> = [
  { id: "proposal_framing", label: "1. Proposal & Framing", icon: "🏛️", desc: "Theoretical framework & research questions" },
  { id: "literature_matrix", label: "2. Literature Matrix", icon: "📚", desc: "Thematic synthesis & competing paradigms" },
  { id: "methodology_design", label: "3. Methodology & IRB", icon: "🔬", desc: "Epistemology, instruments & ethics clearance" },
  { id: "empirical_findings", label: "4. Empirical Findings", icon: "📊", desc: "Data analysis, statistical outputs & themes" },
  { id: "discussion_contributions", label: "5. Critical Discussion", icon: "💡", desc: "Theoretical implications & contributions" },
  { id: "conclusion_directions", label: "6. Conclusion & Trajectory", icon: "🎯", desc: "Synthesis & future scholarly agenda" },
  { id: "viva_defense", label: "7. Viva / Defense Simulator", icon: "🎓", desc: "External examiner simulation & defense prep" },
];

export interface ThesisWorkspaceProps {
  projectId: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}

export default function ThesisWorkspace({
  projectId,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: ThesisWorkspaceProps) {
  const [currentStage, setCurrentStage] = useState<ThesisStage>("proposal_framing");
  const [thesisData, setThesisData] = useState<ThesisProjectData>({
    projectId,
    title: "Quantum Cognitive Paradigms in Autonomous Agent Systems",
    degreeLevel: "PhD Dissertation",
    fieldOfStudy: "Computational Cognitive Science",
    targetWordCount: 50000,
    currentWordCount: 14200,
    theoreticalFramework: "Dynamic Neural Field Theory & Bayesian Decision Semantics",
    researchQuestions: [
      "How do non-Markovian memory models alter autonomous error-correction latency?",
      "To what extent does epistemic uncertainty calibration reduce synthetic hallucination?",
    ],
    methodologicalDesign: "Triangulated Mixed-Methods: Quantitative Empirical Benchmarking + Qualitative Trace Coding",
    supervisorNotes: "Focus on formalizing the boundary conditions in Chapter 3 before the mid-candidature milestone.",
    chapters: [
      { chapterNumber: 1, title: "Introduction & Research Context", wordCount: 3800, targetWordCount: 6000, status: "drafting" },
      { chapterNumber: 2, title: "Theoretical Foundations & Literature Matrix", wordCount: 6200, targetWordCount: 12000, status: "drafting" },
      { chapterNumber: 3, title: "Methodology & Epistemological Design", wordCount: 4200, targetWordCount: 8000, status: "reviewed" },
      { chapterNumber: 4, title: "Empirical Results & Quantitative Findings", wordCount: 0, targetWordCount: 12000, status: "not_started" },
      { chapterNumber: 5, title: "Critical Discussion & Contributions to Knowledge", wordCount: 0, targetWordCount: 8000, status: "not_started" },
      { chapterNumber: 6, title: "Conclusion, Policy & Future Scholarly Agenda", wordCount: 0, targetWordCount: 4000, status: "not_started" },
    ],
  });

  // Hydration & Autosave State
  const [isHydrated, setIsHydrated] = useState(false);
  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [projectVersion, setProjectVersion] = useState<number>(1);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Viva Simulator State
  const [vivaLoading, setVivaLoading] = useState(false);
  const [vivaResults, setVivaResults] = useState<VivaSimulationResponse | null>(null);

  // Chapter audit state
  const [auditLoading, setAuditLoading] = useState(false);
  const [chapterAuditResults, setChapterAuditResults] = useState<ChapterAuditResult | null>(null);

  // Hydrate from getProject(projectId) on mount
  useEffect(() => {
    let mounted = true;

    async function hydrate() {
      try {
        const project = await getProject(projectId);
        if (!mounted || !project) return;

        setProjectVersion(project.version ?? 1);
        const a = project.answers || {};

        let parsedRQs: string[] = [
          "How do non-Markovian memory models alter autonomous error-correction latency?",
          "To what extent does epistemic uncertainty calibration reduce synthetic hallucination?",
        ];
        if (a["researchQuestions"]) {
          try {
            const raw = a["researchQuestions"];
            if (Array.isArray(raw)) parsedRQs = raw;
            else if (typeof raw === "string") parsedRQs = JSON.parse(raw);
          } catch {
            // retain fallback
          }
        }

        let parsedChapters = thesisData.chapters;
        if (a["chapters"]) {
          try {
            const raw = a["chapters"];
            if (Array.isArray(raw) && raw.length > 0) parsedChapters = raw;
            else if (typeof raw === "string") parsedChapters = JSON.parse(raw);
          } catch {
            // retain fallback
          }
        }

        const computedCurrentWords = parsedChapters.reduce((acc, c) => acc + (c.wordCount || 0), 0);

        setThesisData((prev) => ({
          ...prev,
          title: a["title"] || project.title || prev.title,
          degreeLevel: (a["degreeLevel"] as ThesisProjectData["degreeLevel"]) || prev.degreeLevel,
          fieldOfStudy: a["fieldOfStudy"] || prev.fieldOfStudy,
          targetWordCount: Number(a["targetWordCount"]) || prev.targetWordCount,
          currentWordCount: computedCurrentWords || prev.currentWordCount,
          theoreticalFramework: a["theoreticalFramework"] || prev.theoreticalFramework,
          researchQuestions: parsedRQs,
          methodologicalDesign: a["methodologicalDesign"] || prev.methodologicalDesign,
          supervisorNotes: a["supervisorNotes"] || prev.supervisorNotes,
          chapters: parsedChapters,
        }));
      } catch (err) {
        console.warn("[ThesisWorkspace] Hydration fallback to initial state:", err);
      } finally {
        if (mounted) setIsHydrated(true);
      }
    }

    hydrate();
    return () => {
      mounted = false;
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [projectId]);

  // Debounced auto-save to project record
  const triggerDebouncedAutosave = useCallback(
    (updated: ThesisProjectData) => {
      setSaveStatus("saving");
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }

      debounceTimerRef.current = setTimeout(async () => {
        try {
          const payload = {
            title: updated.title,
            degreeLevel: updated.degreeLevel,
            fieldOfStudy: updated.fieldOfStudy,
            targetWordCount: String(updated.targetWordCount),
            currentWordCount: String(updated.currentWordCount),
            theoreticalFramework: updated.theoreticalFramework,
            researchQuestions: JSON.stringify(updated.researchQuestions),
            methodologicalDesign: updated.methodologicalDesign,
            supervisorNotes: updated.supervisorNotes,
            chapters: JSON.stringify(updated.chapters),
          };

          const res = await saveIntakeAnswers(projectId, payload);
          if (res && res.version) {
            setProjectVersion(res.version);
          }
          setSaveStatus("saved");
          setLastSavedTime(
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          );
        } catch (err) {
          console.warn("[ThesisWorkspace] Autosave error, holding offline backup:", err);
          setSaveStatus("error");
        }
      }, 500);
    },
    [projectId]
  );

  const updateThesisField = <K extends keyof ThesisProjectData>(field: K, value: ThesisProjectData[K]) => {
    setThesisData((prev) => {
      const updated = { ...prev, [field]: value };
      if (field === "chapters") {
        const total = (value as ThesisProjectData["chapters"]).reduce((acc, c) => acc + (c.wordCount || 0), 0);
        updated.currentWordCount = total;
      }
      triggerDebouncedAutosave(updated);
      return updated;
    });
  };

  async function handleSimulateViva() {
    setVivaLoading(true);
    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/thesis/viva-simulate`, "POST", {
        title: thesisData.title,
        degreeLevel: thesisData.degreeLevel,
        researchQuestions: thesisData.researchQuestions,
        theoreticalFramework: thesisData.theoreticalFramework,
        methodology: thesisData.methodologicalDesign,
      });
      const data: VivaSimulationResponse = await res.json();
      setVivaResults(data);
    } catch (e) {
      console.error("[ThesisWorkspace] Viva simulation failure:", e);
    } finally {
      setVivaLoading(false);
    }
  }

  async function handleRunChapterAudit() {
    setAuditLoading(true);
    try {
      const res = await authedJsonFetch(`/api/projects/${projectId}/thesis/chapter-audit`, "POST", {
        chapters: thesisData.chapters,
      });
      const data: { success: boolean; audit?: ChapterAuditResult } = await res.json();
      if (data.audit) {
        setChapterAuditResults(data.audit);
      }
    } catch (e) {
      console.error("[ThesisWorkspace] Chapter audit failure:", e);
    } finally {
      setAuditLoading(false);
    }
  }

  const progressPercent = Math.min(
    100,
    Math.round((thesisData.currentWordCount / (thesisData.targetWordCount || 1)) * 100)
  );

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-sans flex flex-col selection:bg-[color:var(--accent-subtle)]">
      {/* Top Navigation Bar */}
      <header className="h-14 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              title="Back to Scholar Workspace"
            >
              ←
            </button>
          )}
          <div
            onClick={() => {
              if (onClose) onClose();
              else if (typeof window !== "undefined") window.location.href = "/";
            }}
            className="w-8 h-8 rounded-lg bg-[color:var(--accent)] text-white flex items-center justify-center cursor-pointer transition-opacity duration-200 hover:opacity-70"
            title="Scholar Core Home"
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.preventDefault();
                if (onClose) onClose();
                else if (typeof window !== "undefined") window.location.href = "/";
              }
            }}
          >
            <ScholarCoreLogo size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[color:var(--text-primary)] truncate max-w-xs md:max-w-md">
                {thesisData.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold shrink-0">
                {thesisData.degreeLevel}
              </span>
              {/* Save Status Badge */}
              <span
                data-testid="autosave-status"
                className={`text-[10px] font-semibold px-2 py-0.5 rounded-full transition-colors ${
                  saveStatus === "saving"
                    ? "bg-amber-100 text-amber-900 dark:bg-amber-950/60 dark:text-amber-200"
                    : saveStatus === "error"
                    ? "bg-red-100 text-red-900 dark:bg-red-950/60 dark:text-red-200"
                    : "bg-emerald-100 text-emerald-900 dark:bg-emerald-950/60 dark:text-emerald-200"
                }`}
              >
                {saveStatus === "saving"
                  ? "Saving changes…"
                  : saveStatus === "error"
                  ? "Offline Backup"
                  : `All changes saved${lastSavedTime ? ` · ${lastSavedTime}` : ""}`}
              </span>
            </div>
            <p className="text-[10px] text-[color:var(--text-muted)]">
              {thesisData.fieldOfStudy} · Milestone Progression · v{projectVersion}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Progress gauge */}
          <div className="hidden md:flex items-center gap-2 bg-[color:var(--surface-sunken)] px-3 py-1 rounded-full border border-[color:var(--border-subtle)]">
            <span className="text-[11px] font-semibold text-[color:var(--text-secondary)]">
              {thesisData.currentWordCount.toLocaleString()} / {thesisData.targetWordCount.toLocaleString()} words
            </span>
            <div className="w-16 h-1.5 bg-[color:var(--border-subtle)] rounded-full overflow-hidden">
              <div className="h-full bg-[color:var(--accent)] rounded-full" style={{ width: `${progressPercent}%` }} />
            </div>
            <span className="text-[10px] font-bold text-[color:var(--accent)]">{progressPercent}%</span>
          </div>

          {onOpenVault && (
            <button
              onClick={onOpenVault}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-all cursor-pointer"
            >
              Vault
            </button>
          )}
          {onOpenAiAccess && (
            <button
              onClick={onOpenAiAccess}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-all cursor-pointer"
            >
              AI Access
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Stage Rail */}
        <aside className="w-full md:w-72 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/50 p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto shrink-0">
          <div className="hidden md:block px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
            Dissertation Milestones
          </div>
          {THESIS_STAGES.map((s) => {
            const isActive = currentStage === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStage(s.id)}
                className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 cursor-pointer ${
                  isActive
                    ? "bg-[color:var(--accent-solid)] text-white shadow-xs"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-raised)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <span className="text-base shrink-0">{s.icon}</span>
                <div className="overflow-hidden">
                  <div className="font-bold truncate">{s.label}</div>
                  <div className={`text-[10px] truncate ${isActive ? "text-white/80" : "text-[color:var(--text-muted)]"}`}>
                    {s.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Center Stage Workspace */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl">
          {currentStage === "proposal_framing" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                  Chapter 1 & Theoretical Framing
                </h2>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  Establish the core research questions, epistemological foundation, and supervisory agreements.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <label className="text-xs font-bold text-[color:var(--text-primary)] block mb-1">
                    Dissertation Title
                  </label>
                  <input
                    type="text"
                    value={thesisData.title}
                    onChange={(e) => updateThesisField("title", e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
                  />
                </div>

                <div className="p-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <label className="text-xs font-bold text-[color:var(--text-primary)] block mb-1">
                    Theoretical & Conceptual Framework
                  </label>
                  <input
                    type="text"
                    value={thesisData.theoreticalFramework}
                    onChange={(e) => updateThesisField("theoreticalFramework", e.target.value)}
                    className="w-full px-3 py-2 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
                  />
                </div>

                <div className="p-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <label className="text-xs font-bold text-[color:var(--text-primary)] block mb-1">
                    Degree Level
                  </label>
                  <select
                    value={thesisData.degreeLevel}
                    onChange={(e) => updateThesisField("degreeLevel", e.target.value as ThesisProjectData["degreeLevel"])}
                    className="w-full px-3 py-2 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
                  >
                    <option value="Undergraduate Capstone">Undergraduate Capstone</option>
                    <option value="Master's Thesis">Master's Thesis</option>
                    <option value="PhD Dissertation">PhD Dissertation</option>
                  </select>
                </div>

                <div className="p-4 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <label className="text-xs font-bold text-[color:var(--text-primary)] block mb-1">
                    Target Word Budget
                  </label>
                  <input
                    type="number"
                    value={thesisData.targetWordCount}
                    onChange={(e) => updateThesisField("targetWordCount", parseInt(e.target.value, 10) || 0)}
                    className="w-full px-3 py-2 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
                  />
                </div>
              </div>

              {/* Multi-Chapter Progress Matrix with interactive status */}
              <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Multi-Chapter Progress Matrix
                  </h3>
                  <span className="text-[10px] font-semibold text-[color:var(--text-muted)]">
                    {thesisData.chapters.length} Chapters Planned
                  </span>
                </div>
                <div className="space-y-3">
                  {thesisData.chapters.map((ch, idx) => (
                    <div
                      key={ch.chapterNumber}
                      className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-xl bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] gap-2"
                    >
                      <div className="flex items-center gap-3">
                        <span className="w-6 h-6 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold text-xs flex items-center justify-center shrink-0">
                          {ch.chapterNumber}
                        </span>
                        <div>
                          <p className="text-xs font-bold text-[color:var(--text-primary)]">{ch.title}</p>
                          <p className="text-[10px] text-[color:var(--text-muted)]">
                            {ch.wordCount.toLocaleString()} / {ch.targetWordCount.toLocaleString()} words
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        <select
                          value={ch.status}
                          onChange={(e) => {
                            const next = [...thesisData.chapters];
                            next[idx] = { ...ch, status: e.target.value as any };
                            updateThesisField("chapters", next);
                          }}
                          className={`text-[10px] px-2.5 py-1 rounded-full font-bold uppercase border border-[color:var(--border-subtle)] cursor-pointer ${
                            ch.status === "reviewed"
                              ? "bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300"
                              : ch.status === "drafting"
                              ? "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300"
                              : ch.status === "completed"
                              ? "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-300"
                              : "bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400"
                          }`}
                        >
                          <option value="not_started">Not Started</option>
                          <option value="drafting">Drafting</option>
                          <option value="reviewed">Reviewed</option>
                          <option value="completed">Completed</option>
                        </select>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {currentStage === "literature_matrix" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                  Chapter 2: Thematic Literature Matrix
                </h2>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  Synthesize competing theoretical paradigms, identify empirical fractures, and link literature clusters directly to your Knowledge Vault.
                </p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Paradigm 1: Classical Computationalism
                  </span>
                  <h4 className="text-xs font-bold text-[color:var(--text-primary)] mt-1">
                    Symbolic & Discrete Logic
                  </h4>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-2 leading-relaxed">
                    Assumes cognition operates over formal syntactic token manipulations with discrete state transitions.
                  </p>
                  <div className="mt-3 text-[11px] text-[color:var(--text-muted)]">
                    Vault Links: 14 Indexed Papers
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Paradigm 2: Dynamic Neural Field Theory
                  </span>
                  <h4 className="text-xs font-bold text-[color:var(--text-primary)] mt-1">
                    Continuous Activation Fields
                  </h4>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-2 leading-relaxed">
                    Models spatial-temporal continuity and attractor stabilization in high-dimensional agent state spaces.
                  </p>
                  <div className="mt-3 text-[11px] text-[color:var(--text-muted)]">
                    Vault Links: 22 Indexed Papers
                  </div>
                </div>

                <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    The Scholarly Tension (Gap)
                  </span>
                  <h4 className="text-xs font-bold text-[color:var(--text-primary)] mt-1">
                    Epistemic Uncertainty Calibration
                  </h4>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-2 leading-relaxed">
                    Neither paradigm adequately predicts non-Markovian memory drift in autonomous multi-agent consensus protocols.
                  </p>
                  <div className="mt-3 text-[11px] font-bold text-emerald-600 dark:text-emerald-400">
                    Target of Dissertation Contribution
                  </div>
                </div>
              </div>
            </div>
          )}

          {currentStage === "methodology_design" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                  Chapter 3: Methodology & Epistemological Design
                </h2>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  Specify research instruments, sampling protocols, and IRB ethical clearance boundaries.
                </p>
              </div>

              <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                <label className="text-xs font-bold text-[color:var(--text-primary)] block mb-1">
                  Methodological Architecture
                </label>
                <textarea
                  rows={3}
                  value={thesisData.methodologicalDesign}
                  onChange={(e) => updateThesisField("methodologicalDesign", e.target.value)}
                  className="w-full p-3 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
                />
              </div>

              <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                <label className="text-xs font-bold text-[color:var(--text-primary)] block mb-1">
                  Supervisory Directives & Milestone Notes
                </label>
                <textarea
                  rows={3}
                  value={thesisData.supervisorNotes}
                  onChange={(e) => updateThesisField("supervisorNotes", e.target.value)}
                  className="w-full p-3 text-xs border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)]"
                />
              </div>
            </div>
          )}

          {currentStage === "discussion_contributions" && (
            <div className="flex flex-col gap-6">
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                    Chapter 5: Critical Discussion & Cross-Chapter Audit
                  </h2>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                    Audit thematic consistency and research question resolution across your complete dissertation.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleRunChapterAudit}
                  disabled={auditLoading}
                  className="px-4 py-2 bg-[color:var(--accent-solid)] text-white rounded-xl text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {auditLoading ? "Auditing Chapters…" : "Run Cross-Chapter Audit →"}
                </button>
              </div>

              {chapterAuditResults && (
                <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] space-y-4 animate-fadeIn">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                        Structural Alignment Score
                      </span>
                      <h4 className="text-xl font-black text-[color:var(--text-primary)] mt-0.5">
                        {chapterAuditResults.alignmentScore}% · {chapterAuditResults.coherenceStatus}
                      </h4>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {chapterAuditResults.crossChapterChecks.map((chk, idx) => (
                      <div key={idx} className="flex items-start gap-2.5 p-3 rounded-xl bg-[color:var(--surface-sunken)] text-xs">
                        <span
                          className={`font-bold mt-0.5 ${
                            chk.status === "passed"
                              ? "text-emerald-500"
                              : chk.status === "warn"
                              ? "text-amber-500"
                              : "text-red-500"
                          }`}
                        >
                          {chk.status === "passed" ? "✓" : chk.status === "warn" ? "!" : "✕"}
                        </span>
                        <div>
                          <strong className="text-[color:var(--text-primary)]">{chk.check}: </strong>
                          <span className="text-[color:var(--text-secondary)]">{chk.details}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStage === "viva_defense" && (
            <div className="flex flex-col gap-6">
              <VivaVoceSimulator thesisData={thesisData} />

              <div className="flex items-start justify-between pt-4 border-t border-[color:var(--border-subtle)]">
                <div>
                  <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                    External Examiner Panel Synthesis
                  </h3>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                    Generate dynamic multi-examiner adversarial questioning.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleSimulateViva}
                  disabled={vivaLoading}
                  className="px-4 py-2 bg-[color:var(--accent-solid)] text-white rounded-xl text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
                >
                  {vivaLoading ? "Generating Examiner Panel…" : "Launch Examiner Simulation →"}
                </button>
              </div>

              {vivaResults && (
                <div className="flex flex-col gap-4 animate-fadeIn">
                  <div className="p-4 rounded-2xl border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)]/40">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--accent)]">
                      Simulated Examiner Persona
                    </span>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)] mt-1">
                      {vivaResults.examinerPersona}
                    </h4>
                    <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                      Rigor Level: {vivaResults.examinerRigorScore}
                    </p>
                  </div>

                  <div className="space-y-4">
                    {vivaResults.questions.map((q) => (
                      <div
                        key={q.id}
                        className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]"
                      >
                        <div className="flex items-center gap-2 mb-2">
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-[color:var(--surface-sunken)] text-[color:var(--accent)]">
                            {q.category}
                          </span>
                        </div>
                        <h4 className="text-sm font-bold text-[color:var(--text-primary)] mb-2">
                          "{q.examinerQuestion}"
                        </h4>
                        <p className="text-xs text-[color:var(--text-secondary)] mb-3 italic">
                          Examiner Intent: {q.assessmentFocus}
                        </p>
                        <div className="bg-[color:var(--surface-sunken)] p-3 rounded-xl border border-[color:var(--border-subtle)]">
                          <span className="text-[11px] font-bold text-[color:var(--text-primary)] block mb-1.5">
                            Recommended Defense Strategy:
                          </span>
                          <ul className="list-disc list-inside text-xs text-[color:var(--text-secondary)] space-y-1">
                            {q.suggestedRebuttalStructure.map((pt, idx) => (
                              <li key={idx}>{pt}</li>
                            ))}
                          </ul>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {currentStage !== "proposal_framing" &&
            currentStage !== "literature_matrix" &&
            currentStage !== "methodology_design" &&
            currentStage !== "discussion_contributions" &&
            currentStage !== "viva_defense" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-xl font-bold text-[color:var(--text-primary)] capitalize">
                    {THESIS_STAGES.find((s) => s.id === currentStage)?.label}
                  </h2>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                    {THESIS_STAGES.find((s) => s.id === currentStage)?.desc}
                  </p>
                </div>

                <div className="p-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                  <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed mb-4">
                    Milestone tracking and synthesis matrix for {thesisData.degreeLevel} progress.
                  </p>
                  <button
                    type="button"
                    onClick={() => setCurrentStage("viva_defense")}
                    className="px-4 py-2 bg-[color:var(--accent-solid)] text-white text-xs font-bold rounded-xl hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
                  >
                    Proceed to Viva Defense Simulator →
                  </button>
                </div>
              </div>
            )}
        </main>
      </div>
    </div>
  );
}
