import React, { useState, useEffect, useRef, useCallback } from "react";
import StudySectionScorer from "./components/StudySectionScorer";
import {
  auditSpecificAims,
  draftProposalSection,
  getProject,
  saveIntakeAnswers,
  simulateStudySectionReview,
  type StudySectionSimulationResponse,
  type ProposalCriterionResult,
} from "../api";
import WorkspaceAutosaveBadge from "../../components/ui/WorkspaceAutosaveBadge";
import AppleStudioHeader, { type AppleStudioPhaseId } from "../../components/ui/AppleStudioShell";
import { useUnsavedChangesGuard } from "../../hooks/useUnsavedChangesGuard";
import { Sparkles, Plus, Trash2, CheckCircle2, Download } from "lucide-react";
import NarrativeSectionEditor from "./components/NarrativeSectionEditor";
import BudgetEditor from "./components/BudgetEditor";
import {
  NARRATIVE_SECTIONS,
  UNTITLED_PROPOSAL,
  aimSlots,
  budgetTotal,
  proposalToMarkdown,
  type BudgetItem,
  type NarrativeKey,
  type ProposalProjectData,
} from "./proposalModel";
import { proposalDocxBlob } from "./proposalExport";
import { downloadBlob } from "../assignment/services/assignmentExportService";
import { thesisFileName } from "../thesis/thesisExport";

export type ProposalStage =
  | "agency_rubric"
  | "specific_aims"
  | "significance_innovation"
  | "approach_workplan"
  | "preliminary_data"
  | "budget_justification"
  | "broader_impacts"
  | "study_section_review";

export type { ProposalProjectData } from "./proposalModel";

const PROPOSAL_STAGES: {
  id: ProposalStage;
  phase: AppleStudioPhaseId;
  label: string;
  icon: string;
  desc: string;
}[] = [
  {
    id: "agency_rubric",
    phase: "blueprint",
    label: "1. Agency & Rubric",
    icon: "🏛️",
    desc: "NOFO / FOA alignment & evaluation weights",
  },
  {
    id: "specific_aims",
    phase: "blueprint",
    label: "2. Specific Aims (1-Page)",
    icon: "🎯",
    desc: "Hook, gap, central hypothesis & 3 concrete aims",
  },
  {
    id: "preliminary_data",
    phase: "evidence",
    label: "3. Preliminary Studies",
    icon: "📊",
    desc: "Feasibility proof & prior empirical grounding",
  },
  {
    id: "significance_innovation",
    phase: "studio",
    label: "4. Significance & Innovation",
    icon: "💡",
    desc: "Why this matters now & how it shifts paradigms",
  },
  {
    id: "approach_workplan",
    phase: "studio",
    label: "5. Research Strategy & Risk",
    icon: "🧭",
    desc: "Work packages, milestones, pitfalls & alternatives",
  },
  {
    id: "budget_justification",
    phase: "studio",
    label: "6. Budget & Resources",
    icon: "💰",
    desc: "Personnel, equipment, travel & facilities",
  },
  {
    id: "broader_impacts",
    phase: "delivery",
    label: "7. Broader Impacts & Data Plan",
    icon: "🌍",
    desc: "Societal benefit, open science & IRB compliance",
  },
  {
    id: "study_section_review",
    phase: "review",
    label: "8. Study Section Scorer",
    icon: "⚖️",
    desc: "NIH 1–9 / NSF panel simulation & critique",
  },
];

const PHASE_TO_DEFAULT_STAGE: Record<AppleStudioPhaseId, ProposalStage> = {
  blueprint: "specific_aims",
  evidence: "preliminary_data",
  studio: "significance_innovation",
  review: "study_section_review",
  delivery: "broader_impacts",
};

function mapStageToPhase(stage: ProposalStage): AppleStudioPhaseId {
  const found = PROPOSAL_STAGES.find((s) => s.id === stage);
  return found ? found.phase : "blueprint";
}

interface ProposalWorkspaceProps {
  projectId: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}

export default function ProposalWorkspace({
  projectId,
  onClose,
  onOpenVault,
  onOpenAiAccess,
}: ProposalWorkspaceProps) {
  const [currentStage, setCurrentStage] = useState<ProposalStage>("specific_aims");
  const [zenMode, setZenMode] = useState(false);
  const [inspectorOpen, setInspectorOpen] = useState(false);

  // Zero-Ghost Clean Empty Initial State (no pre-populated demo strings)
  const [proposalData, setProposalData] = useState<ProposalProjectData>({
    id: projectId,
    title: UNTITLED_PROPOSAL,
    fundingAgency: "",
    mechanism: "",
    targetBudgetUSD: 0,
    durationMonths: 36,
    overarchingHypothesis: "",
    specificAims: [],
    significanceStatement: "",
    innovationStatement: "",
    approachStrategy: "",
    broaderImpacts: "",
    preliminaryStudiesSummary: "",
    budgetItems: [],
    budgetJustification: "",
  });

  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "offline">("saved");
  const [lastSavedTime, setLastSavedTime] = useState<string | null>(null);
  const [projectVersion, setProjectVersion] = useState<number>(1);
  useUnsavedChangesGuard(saveStatus === "saving");

  // Interactive backend states
  const [auditLoading, setAuditLoading] = useState(false);
  const [aimsAuditChecks, setAimsAuditChecks] = useState<
    Array<{ name: string; status: "passed" | "warn" | "fail"; detail: string }> | null
  >(null);
  const [aimsAuditError, setAimsAuditError] = useState<string | null>(null);

  const [reviewLoading, setReviewLoading] = useState(false);
  const [reviewResults, setReviewResults] = useState<StudySectionSimulationResponse | null>(null);
  const [reviewError, setReviewError] = useState<string | null>(null);

  const isFirstMount = useRef(true);
  // Fields edited before the saved project finished loading: loading never overwrites them.
  const touchedRef = useRef<Set<keyof ProposalProjectData>>(new Set());
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Hydrate from backend project intake answers on mount
  useEffect(() => {
    let cancelled = false;
    async function hydrate() {
      try {
        const rawProject = await getProject(projectId);
        if (cancelled || !rawProject) return;
        const projectObj = (rawProject as unknown as { project?: Record<string, unknown> })?.project
          ? ((rawProject as unknown as { project: Record<string, unknown> }).project)
          : (rawProject as unknown as Record<string, unknown>);

        const a = ((projectObj.answers || projectObj.intakeAnswers || {}) as Record<string, unknown>);
        const hydratedTitle =
          (a["proposalTitle"] as string) ||
          (a["title"] as string) ||
          (projectObj.title as string) ||
          UNTITLED_PROPOSAL;

        setProposalData((prev) => keepTouched(prev, touchedRef.current, {
          ...prev,
          title: hydratedTitle,
          fundingAgency: (a["fundingAgency"] as string) ?? prev.fundingAgency,
          mechanism: (a["mechanism"] as string) ?? prev.mechanism,
          targetBudgetUSD:
            typeof a["targetBudgetUSD"] === "number"
              ? (a["targetBudgetUSD"] as number)
              : typeof a["targetBudgetUSD"] === "string"
              ? parseInt(a["targetBudgetUSD"] as string, 10) || prev.targetBudgetUSD
              : prev.targetBudgetUSD,
          durationMonths:
            typeof a["durationMonths"] === "number"
              ? (a["durationMonths"] as number)
              : typeof a["projectDurationMonths"] === "number"
              ? (a["projectDurationMonths"] as number)
              : typeof a["durationMonths"] === "string"
              ? parseInt(a["durationMonths"] as string, 10) || prev.durationMonths
              : prev.durationMonths,
          overarchingHypothesis: (a["overarchingHypothesis"] as string) ?? prev.overarchingHypothesis,
          specificAims: Array.isArray(a["specificAims"])
            ? (a["specificAims"] as string[])
            : prev.specificAims,
          significanceStatement: (a["significanceStatement"] as string) ?? prev.significanceStatement,
          innovationStatement: (a["innovationStatement"] as string) ?? prev.innovationStatement,
          broaderImpacts: (a["broaderImpacts"] as string) ?? prev.broaderImpacts,
          preliminaryStudiesSummary:
            (a["preliminaryStudiesSummary"] as string) ?? prev.preliminaryStudiesSummary,
          approachStrategy: (a["approachStrategy"] as string) ?? prev.approachStrategy,
          budgetItems: Array.isArray(a["budgetItems"]) ? (a["budgetItems"] as BudgetItem[]) : prev.budgetItems,
          budgetJustification: (a["budgetJustification"] as string) ?? prev.budgetJustification,
        }));
        if (typeof projectObj.version === "number") {
          setProjectVersion(projectObj.version);
        }
      } catch {
        // Offline fallback
      }
    }
    hydrate();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  const persistChanges = useCallback(
    (nextData: ProposalProjectData) => {
      if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
      setSaveStatus("saving");
      saveTimerRef.current = setTimeout(async () => {
        try {
          const updated = await saveIntakeAnswers(projectId, {
            proposalTitle: nextData.title,
            fundingAgency: nextData.fundingAgency,
            mechanism: nextData.mechanism,
            targetBudgetUSD: nextData.targetBudgetUSD,
            durationMonths: nextData.durationMonths,
            overarchingHypothesis: nextData.overarchingHypothesis,
            specificAims: nextData.specificAims,
            significanceStatement: nextData.significanceStatement,
            innovationStatement: nextData.innovationStatement,
            broaderImpacts: nextData.broaderImpacts,
            preliminaryStudiesSummary: nextData.preliminaryStudiesSummary,
            approachStrategy: nextData.approachStrategy,
            budgetItems: nextData.budgetItems,
            budgetJustification: nextData.budgetJustification,
          });
          if (updated && updated.version) {
            setProjectVersion(updated.version);
          }
          setSaveStatus("saved");
          setLastSavedTime(
            new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit", second: "2-digit" })
          );
        } catch {
          setSaveStatus("offline");
        }
      }, 600);
    },
    [projectId]
  );

  function updateProposalField<K extends keyof ProposalProjectData>(
    key: K,
    val: ProposalProjectData[K]
  ) {
    touchedRef.current.add(key);
    setProposalData((prev) => {
      const next = { ...prev, [key]: val };
      if (!isFirstMount.current) {
        persistChanges(next);
      }
      return next;
    });
    isFirstMount.current = false;
  }

  /** Three empty aim slots to fill in. The proposal's wording is always the applicant's own. */
  function handleGenerateBlueprintFromTopic() {
    if (proposalData.specificAims.length > 0) return;
    updateProposalField("specificAims", aimSlots(proposalData.specificAims));
  }

  const draftBlocker =
    !proposalData.title.trim() || proposalData.title === UNTITLED_PROPOSAL ? "Add your proposal title in Agency & Rubric first." : undefined;

  async function draftSection(key: NarrativeKey, guidance: string): Promise<string> {
    const meta = NARRATIVE_SECTIONS[key];
    const result = await draftProposalSection(projectId, { sectionTitle: meta.title, targetWords: meta.targetWords, prompt: guidance.trim() || undefined });
    return result.content;
  }

  const narrative = (key: NarrativeKey, rows = 10) => (
    <NarrativeSectionEditor
      key={key}
      id={`proposal-${key}`}
      title={NARRATIVE_SECTIONS[key].title}
      hint={NARRATIVE_SECTIONS[key].hint}
      targetWords={NARRATIVE_SECTIONS[key].targetWords}
      value={proposalData[key]}
      onChange={(next) => updateProposalField(key, next)}
      onDraft={(g) => draftSection(key, g)}
      canDraft={!draftBlocker}
      draftBlocker={draftBlocker}
      rows={rows}
    />
  );

  async function handleExportDocx() {
    downloadBlob(await proposalDocxBlob(proposalData), thesisFileName(proposalData.title, "docx", "proposal"));
  }

  function handleExportMarkdown() {
    downloadBlob(new Blob([proposalToMarkdown(proposalData)], { type: "text/markdown;charset=utf-8" }), thesisFileName(proposalData.title, "md", "proposal"));
  }


  async function handleAuditAims() {
    setAuditLoading(true);
    setAimsAuditError(null);
    try {
      const aimsText = [proposalData.overarchingHypothesis, ...proposalData.specificAims]
        .map((t) => t.trim())
        .filter(Boolean)
        .join("\n");
      setAimsAuditChecks(await auditSpecificAims(projectId, aimsText));
    } catch (err) {
      // Never show stand-in checks: the user sees that nothing was audited.
      setAimsAuditChecks(null);
      setAimsAuditError(err instanceof Error ? err.message : "The aims audit could not be run.");
    } finally {
      setAuditLoading(false);
    }
  }

  async function handleSimulateStudySection() {
    setReviewLoading(true);
    setReviewError(null);
    try {
      const data = await simulateStudySectionReview(projectId, {
        title: proposalData.title,
        agency: proposalData.fundingAgency,
        mechanism: proposalData.mechanism,
        specificAims: proposalData.specificAims,
        significance: [
          proposalData.overarchingHypothesis,
          proposalData.significanceStatement,
          proposalData.innovationStatement,
        ]
          .map((t) => t.trim())
          .filter(Boolean)
          .join("\n\n"),
      });
      setReviewResults(data);
    } catch (err) {
      // Never show a stand-in review panel.
      setReviewResults(null);
      setReviewError(err instanceof Error ? err.message : "The study section review could not be run.");
    } finally {
      setReviewLoading(false);
    }
  }


  const isBlankProposal =
    proposalData.specificAims.length === 0 &&
    !proposalData.overarchingHypothesis.trim() &&
    !proposalData.significanceStatement.trim();

  const activePhase = mapStageToPhase(currentStage);

  return (
    <div className="min-h-screen bg-background text-primary font-sans flex flex-col selection:bg-accent/15">
      {/* Unified Apple-Grade Top Workspace Bar */}
      <AppleStudioHeader
        deliverableCode="OT-19"
        deliverableLabel="Grant Proposal"
        projectTitle={proposalData.title}
        onProjectTitleChange={(nextTitle) => updateProposalField("title", nextTitle)}
        activePhase={activePhase}
        onPhaseSelect={(phase) => setCurrentStage(PHASE_TO_DEFAULT_STAGE[phase])}
        onBack={() => {
          if (onClose) onClose();
          else if (typeof window !== "undefined") window.location.href = "/projects";
        }}
        metricLabel={
          proposalData.targetBudgetUSD > 0
            ? `$${budgetTotal(proposalData.budgetItems).toLocaleString("en-US")} / $${proposalData.targetBudgetUSD.toLocaleString("en-US")} · ${proposalData.durationMonths}mo`
            : `${proposalData.specificAims.filter((a) => a.trim()).length} Aims`
        }
        aiModelLabel="Grant Panel AI"
        onOpenAiAccess={onOpenAiAccess}
        aiWorkspace="proposal"
        autosaveStatus={saveStatus}
        projectVersion={projectVersion}
        lastSavedTime={lastSavedTime}
        zenMode={zenMode}
        onToggleZenMode={() => setZenMode((z) => !z)}
        inspectorOpen={inspectorOpen}
        onToggleInspector={() => setInspectorOpen((o) => !o)}
      />

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Collapsible Left Stage Rail */}
        {!zenMode && (
          <aside
            aria-label="Grant Pipeline Stages"
            className="w-full md:w-64 border-r border-border/70 bg-surface-hover/40 p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto shrink-0 transition-all duration-200 ease-out"
          >
            <div className="hidden md:block px-3 py-1.5 text-[10px] font-bold uppercase tracking-wider text-tertiary">
              Grant Pipeline
            </div>
            {PROPOSAL_STAGES.map((s) => {
              const isActive = currentStage === s.id;
              return (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => setCurrentStage(s.id)}
                  className={`shrink-0 md:w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all duration-200 ease-out flex items-center gap-2.5 cursor-pointer ${
                    isActive
                      ? "bg-primary text-surface shadow-xs"
                      : "text-secondary hover:bg-surface hover:text-primary"
                  }`}
                >
                  <span className="text-base shrink-0">{s.icon}</span>
                  <div className="md:overflow-hidden">
                    <div className="font-bold whitespace-nowrap md:truncate">{s.label}</div>
                    <div className={`hidden md:block text-[10px] truncate ${isActive ? "opacity-80" : "text-tertiary"}`}>
                      {s.desc}
                    </div>
                  </div>
                </button>
              );
            })}
          </aside>
        )}

        {/* Center Studio Sheet Canvas */}
        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="apple-sheet p-6 sm:p-10 space-y-6">
            {/* Serene Apple-Style Empty-State Onboarding Card when project has no aims/blueprint yet */}
            {isBlankProposal && (
              <div
                data-testid="proposal-empty-onboarding"
                className="apple-card p-6 border border-accent/30 bg-surface-hover/40 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4"
              >
                <div className="space-y-1">
                  <div className="inline-flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-accent">
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Start your proposal</span>
                  </div>
                  <h3 className="text-sm font-bold text-primary">
                    {proposalData.title === UNTITLED_PROPOSAL ? "Ready to structure your proposal" : `Ready to structure "${proposalData.title}"`}
                  </h3>
                  <p className="text-xs text-secondary max-w-xl leading-relaxed">
                    Enter your funder and mechanism in Agency &amp; Rubric, then write your central hypothesis and aims. Set up three empty aims to fill in, or add your own.
                  </p>
                </div>
                <button
                  type="button"
                  data-testid="generate-structured-blueprint-btn"
                  onClick={handleGenerateBlueprintFromTopic}
                  className="px-4 py-2.5 rounded-xl bg-primary text-surface text-xs font-semibold hover:opacity-90 transition-all shadow-xs shrink-0 flex items-center gap-1.5 cursor-pointer"
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>Set up 3 aims to fill in</span>
                </button>
              </div>
            )}

            {currentStage === "agency_rubric" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-primary">
                    1. Funding Agency & Rubric Alignment
                  </h2>
                  <p className="text-xs text-secondary mt-1">
                    Calibrate grant mechanism constraints, total direct cost ceilings, and review panel expectations.
                  </p>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div className="apple-card p-4 md:col-span-2">
                    <label htmlFor="proposal-title" className="text-xs font-bold text-primary block mb-1.5">
                      Proposal Title
                    </label>
                    <input
                      id="proposal-title"
                      type="text"
                      placeholder="Your working title"
                      value={proposalData.title === UNTITLED_PROPOSAL ? "" : proposalData.title}
                      onChange={(e) => updateProposalField("title", e.target.value || UNTITLED_PROPOSAL)}
                      className="w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    />
                  </div>

                  <div className="apple-card p-4">
                    <label className="text-xs font-bold text-primary block mb-1.5">
                      Funding Agency
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., NSF, NIH, ERC, Horizon Europe, UKRI"
                      value={proposalData.fundingAgency}
                      onChange={(e) => updateProposalField("fundingAgency", e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    />
                  </div>

                  <div className="apple-card p-4">
                    <label className="text-xs font-bold text-primary block mb-1.5">
                      Grant Mechanism / Opportunity Track
                    </label>
                    <input
                      type="text"
                      placeholder="e.g., R01, CAREER, Starting Grant"
                      value={proposalData.mechanism}
                      onChange={(e) => updateProposalField("mechanism", e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    />
                  </div>

                  <div className="apple-card p-4">
                    <label className="text-xs font-bold text-primary block mb-1.5">
                      Budget Ceiling (USD)
                    </label>
                    <input
                      type="number"
                      value={proposalData.targetBudgetUSD}
                      onChange={(e) =>
                        updateProposalField("targetBudgetUSD", parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    />
                  </div>

                  <div className="apple-card p-4">
                    <label className="text-xs font-bold text-primary block mb-1.5">
                      Project Duration (Months)
                    </label>
                    <input
                      type="number"
                      value={proposalData.durationMonths}
                      onChange={(e) =>
                        updateProposalField("durationMonths", parseInt(e.target.value, 10) || 0)
                      }
                      className="w-full px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary"
                    />
                  </div>
                </div>
              </div>
            )}

            {currentStage === "specific_aims" && (
              <div className="flex flex-col gap-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-primary">
                      Specific Aims Executive Page
                    </h2>
                    <p className="text-xs text-secondary mt-1">
                      The anchor page of your grant application: central hypothesis and concrete milestone deliverables.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleAuditAims}
                    disabled={auditLoading}
                    className="px-3.5 py-1.5 rounded-xl border border-border bg-surface hover:bg-surface-hover text-xs font-bold transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {auditLoading ? "Auditing Aims…" : "Audit Aims Structure"}
                  </button>
                </div>

                {aimsAuditError && (
                  <p role="alert" className="text-xs text-[color:var(--state-danger)]">
                    {aimsAuditError}
                  </p>
                )}

                {aimsAuditChecks && (
                  <div className="apple-card p-4 space-y-2">
                    <span className="text-xs font-bold uppercase tracking-wider text-accent block mb-1">
                      Specific Aims Compliance Check
                    </span>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {aimsAuditChecks.map((chk, idx) => (
                        <div
                          key={idx}
                          className="flex items-center gap-2 p-2.5 rounded-lg bg-surface-hover text-xs"
                        >
                          <span
                            className={`font-bold ${
                              chk.status === "passed"
                                ? "text-emerald-700 dark:text-emerald-300"
                                : chk.status === "warn"
                                ? "text-amber-700 dark:text-amber-300"
                                : "text-red-700 dark:text-red-300"
                            }`}
                          >
                            {chk.status === "passed" ? "✓" : chk.status === "warn" ? "!" : "✕"}
                          </span>
                          <div>
                            <strong className="text-primary">{chk.name}: </strong>
                            <span className="text-secondary">{chk.detail}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="apple-card p-5">
                  <label className="text-xs font-bold text-primary block mb-1.5">
                    Central / Overarching Hypothesis
                  </label>
                  <textarea
                    rows={3}
                    placeholder="State your falsifiable overarching hypothesis and primary empirical objective..."
                    value={proposalData.overarchingHypothesis}
                    onChange={(e) => updateProposalField("overarchingHypothesis", e.target.value)}
                    className="w-full p-3 text-xs border border-border rounded-xl bg-background text-primary apple-prose-measure"
                  />
                </div>

                <div className="apple-card p-5 space-y-4">
                  <div className="flex items-center justify-between">
                    <h3 className="text-xs font-bold uppercase tracking-wider text-accent">
                      Specific Aims (Milestone Deliverables)
                    </h3>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold">
                        {proposalData.specificAims.filter((a) => a.trim()).length} of {proposalData.specificAims.length} aims written
                      </span>
                      <button
                        type="button"
                        onClick={() =>
                          updateProposalField("specificAims", [
                            ...proposalData.specificAims,
                            "",
                          ])
                        }
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg text-xs font-semibold bg-surface-hover hover:bg-border/40 text-primary transition-colors cursor-pointer"
                      >
                        <Plus className="w-3 h-3" />
                        <span>Add Aim</span>
                      </button>
                    </div>
                  </div>

                  {proposalData.specificAims.length === 0 ? (
                    <p className="text-xs text-tertiary italic py-2">
                      No aims yet. Use "Add Aim", or "Set up 3 aims to fill in" above.
                    </p>
                  ) : (
                    proposalData.specificAims.map((aim, idx) => (
                      <div key={idx} className="flex gap-3 items-start">
                        <span className="w-6 h-6 rounded-full bg-primary text-surface text-xs font-bold flex items-center justify-center shrink-0">
                          {idx + 1}
                        </span>
                        <textarea
                          rows={2}
                          aria-label={`Aim ${idx + 1}`}
                          placeholder="What will this aim establish, and how?"
                          value={aim}
                          onChange={(e) => {
                            const next = [...proposalData.specificAims];
                            next[idx] = e.target.value;
                            updateProposalField("specificAims", next);
                          }}
                          className="flex-1 px-3 py-2 text-xs border border-border rounded-xl bg-background text-primary resize-y"
                        />
                        <button
                          type="button"
                          aria-label={`Remove Aim ${idx + 1}`}
                          onClick={() => {
                            const next = proposalData.specificAims.filter((_, i) => i !== idx);
                            updateProposalField("specificAims", next);
                          }}
                          className="p-1.5 text-tertiary hover:text-red-600 rounded-lg transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {currentStage === "significance_innovation" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-primary">
                    Significance & Innovation
                  </h2>
                  <p className="text-xs text-secondary mt-1">
                    Articulate the critical deficit in current literature and the paradigm shift introduced by your proposed research.
                  </p>
                </div>

                {narrative("significanceStatement")}
                {narrative("innovationStatement", 7)}
              </div>
            )}

            {currentStage === "budget_justification" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-primary">
                    Budget Justification & Resource Breakdown
                  </h2>
                  <p className="text-xs text-secondary mt-1">
                    Enter each cost as your funder's rules require. The total is checked against your budget ceiling ({proposalData.targetBudgetUSD > 0 ? `$${proposalData.targetBudgetUSD.toLocaleString("en-US")}` : "set it in Agency & Rubric"}).
                  </p>
                </div>
                <BudgetEditor
                  items={proposalData.budgetItems}
                  targetBudgetUSD={proposalData.targetBudgetUSD}
                  onChange={(next) => updateProposalField("budgetItems", next)}
                />
                {narrative("budgetJustification", 8)}
              </div>
            )}

            {currentStage === "study_section_review" && (
              <div className="flex flex-col gap-6">
                <StudySectionScorer
                  proposalTitle={proposalData.title}
                  fundingAgency={proposalData.fundingAgency}
                  mechanism={proposalData.mechanism}
                />

                <div className="flex items-start justify-between pt-4 border-t border-border/70">
                  <div>
                    <h3 className="text-sm font-bold text-primary">
                      Adversarial Grant Review Simulation
                    </h3>
                    <p className="text-xs text-secondary mt-0.5">
                      Generate live reviewer critiques and fundability verdict.
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={handleSimulateStudySection}
                    disabled={reviewLoading}
                    className="px-4 py-2 bg-primary text-surface rounded-xl text-xs font-bold hover:opacity-90 transition-all cursor-pointer shadow-xs disabled:opacity-50"
                  >
                    {reviewLoading ? "Convening Review Panel…" : "Run Study Section Simulation →"}
                  </button>
                </div>

                {reviewError && (
                  <p role="alert" className="text-xs text-[color:var(--state-danger)]">
                    {reviewError}
                  </p>
                )}

                {reviewResults && (
                  <div className="flex flex-col gap-4">
                    <div className="apple-card p-4 flex items-center justify-between">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-accent">
                          Overall Impact Verdict
                        </span>
                        <h4 className="text-base font-bold text-primary mt-0.5">
                          {reviewResults.overallImpactScore}
                        </h4>
                        <p className="text-xs font-semibold text-emerald-700 dark:text-emerald-300">
                          {reviewResults.recommendationForFunding}
                        </p>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {reviewResults.criteria.map((c: ProposalCriterionResult, idx: number) => (
                        <div key={idx} className="apple-card p-5">
                          <div className="flex items-center justify-between mb-2">
                            <span className="text-xs font-bold text-primary">{c.criterion}</span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-surface-hover text-accent">
                              Score: {c.score} ({c.verdict})
                            </span>
                          </div>
                          <p className="text-xs text-secondary mb-3 leading-relaxed">{c.critique}</p>
                          <div className="bg-surface-hover p-2.5 rounded-xl border border-border/60 text-[11px] text-secondary">
                            <strong className="text-primary">Recommendation: </strong>
                            {c.recommendation}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}

            {currentStage === "preliminary_data" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-primary">Preliminary Studies</h2>
                  <p className="text-xs text-secondary mt-1">Your own prior results that show the aims are feasible.</p>
                </div>
                {narrative("preliminaryStudiesSummary")}
              </div>
            )}

            {currentStage === "approach_workplan" && (
              <div className="flex flex-col gap-6">
                <div>
                  <h2 className="text-xl font-bold tracking-tight text-primary">Research Strategy & Risk</h2>
                  <p className="text-xs text-secondary mt-1">For each aim: design, methods, analysis, expected outcomes, pitfalls and alternatives, and timeline.</p>
                </div>
                {narrative("approachStrategy", 16)}
              </div>
            )}

            {currentStage === "broader_impacts" && (
              <div className="flex flex-col gap-6">
                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold tracking-tight text-primary">Broader Impacts & Data Plan</h2>
                    <p className="text-xs text-secondary mt-1">Benefit beyond the field, dissemination, data sharing and ethics. Then export the full proposal.</p>
                  </div>
                  <ExportButtons onDocx={handleExportDocx} onMarkdown={handleExportMarkdown} />
                </div>
                {narrative("broaderImpacts")}
              </div>
            )}
          </div>
        </main>

        {/* Collapsible Right Inspector Drawer */}
        {inspectorOpen && !zenMode && (
          <aside
            data-testid="proposal-inspector-drawer"
            aria-label="Grant Compliance Inspector"
            className="w-full md:w-72 border-l border-border/70 bg-surface p-4 space-y-4 overflow-y-auto shrink-0 transition-all duration-200 ease-out"
          >
            <div className="flex items-center justify-between">
              <span className="text-xs font-bold uppercase tracking-wider text-primary">
                Grant Inspector
              </span>
              <WorkspaceAutosaveBadge
                status={saveStatus}
                lastSavedTime={lastSavedTime || undefined}
                version={projectVersion}
              />
            </div>

            <div className="apple-card p-3.5 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="text-secondary">Agency</span>
                <span className="font-semibold text-primary">
                  {proposalData.fundingAgency || "Unset"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">Mechanism</span>
                <span className="font-semibold text-primary">
                  {proposalData.mechanism || "Unset"}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">Specific Aims</span>
                <span className="font-semibold text-primary">
                  {proposalData.specificAims.length}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-secondary">Direct Budget</span>
                <span className="font-mono font-semibold text-primary">
                  ${proposalData.targetBudgetUSD.toLocaleString()}
                </span>
              </div>
            </div>

            <ExportButtons onDocx={handleExportDocx} onMarkdown={handleExportMarkdown} stacked />

            <div className="space-y-2">
              {onOpenVault && (
                <button
                  type="button"
                  onClick={onOpenVault}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-primary bg-surface-hover border border-border/60 transition-colors cursor-pointer text-left flex items-center justify-between"
                >
                  <span>Open Knowledge Vault</span>
                  <CheckCircle2 className="w-3.5 h-3.5 text-accent" />
                </button>
              )}
              {onOpenAiAccess && (
                <button
                  type="button"
                  onClick={onOpenAiAccess}
                  className="w-full px-3 py-2 rounded-xl text-xs font-semibold text-secondary hover:text-primary bg-surface-hover border border-border/60 transition-colors cursor-pointer text-left"
                >
                  Configure AI Model Routing
                </button>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

/** Applies loaded data except for fields the applicant already edited in this session. */
function keepTouched(prev: ProposalProjectData, touched: Set<keyof ProposalProjectData>, loaded: ProposalProjectData): ProposalProjectData {
  if (touched.size === 0) return loaded;
  const out = { ...loaded } as Record<keyof ProposalProjectData, unknown>;
  for (const k of touched) out[k] = prev[k];
  return out as ProposalProjectData;
}

function ExportButtons({ onDocx, onMarkdown, stacked = false }: { onDocx: () => void | Promise<void>; onMarkdown: () => void; stacked?: boolean }) {
  const cls = "inline-flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border border-border/60 bg-surface hover:bg-surface-hover text-primary cursor-pointer";
  return (
    <div className={stacked ? "grid grid-cols-2 gap-2" : "flex gap-2 shrink-0"}>
      <button type="button" onClick={() => void onDocx()} className={cls}>
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Word (.docx)
      </button>
      <button type="button" onClick={onMarkdown} className={cls}>
        <Download className="w-3.5 h-3.5" aria-hidden="true" />
        Markdown
      </button>
    </div>
  );
}
