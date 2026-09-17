import React, { useEffect, useState, useRef, useCallback } from "react";
import { getOutputTypeSpec, saveIntakeAnswers, saveAuthors, executeAgenticLLM } from "../../api";
import type { OutputTypeSpec, ProjectView, Author } from "../../types";
import { STAGE_MAP } from "../types";
import {
  STUDY_DESIGN_GUIDELINES,
  buildFinerDiagnosticPrompts,
  buildPicoSynthesisPrompts,
  type FinerDiagnosticResult,
  type PicoSynthesisResult,
} from "../agentPrompts/definitionPrompts";
import { parseJsonFromLlm } from "../../../utils/jsonParser";
import { AllAiResourcesExhaustedModal } from "../../aiAccess/AllAiResourcesExhaustedModal";

const ARTICLE_TYPES = [
  "Original Research",
  "Review Article",
  "Systematic Review",
  "Meta-analysis",
  "Scoping Review",
  "Methodology / Methods",
  "Case Report",
  "Perspective / Opinion",
  "Brief Report",
  "Short Communication",
  "Protocol",
  "Commentary",
  "Other",
];

const STUDY_DESIGN_TYPES = [
  "Experimental",
  "Randomized Controlled Trial",
  "Observational",
  "Cohort",
  "Case-control",
  "Cross-sectional",
  "Longitudinal",
  "Qualitative",
  "Quantitative",
  "Mixed Methods",
  "Systematic Review",
  "Scoping Review",
  "Meta-analysis",
  "Case Study",
  "Methodological / Methods Research",
  "Computational / Simulation",
  "Secondary Data Analysis",
  "Theoretical / Conceptual",
  "Protocol",
  "Other",
];

const CREDIT_ROLES = [
  "Conceptualization",
  "Data curation",
  "Formal analysis",
  "Funding acquisition",
  "Investigation",
  "Methodology",
  "Project administration",
  "Resources",
  "Software",
  "Supervision",
  "Validation",
  "Visualization",
  "Writing – original draft",
  "Writing – review & editing",
];

type DefinitionTab = "inquiry" | "methodology" | "authors" | "governance";

export default function DefinitionStage({
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  stage?: string;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const [spec, setSpec] = useState<OutputTypeSpec | null>(null);
  const [answers, setAnswers] = useState<Record<string, string>>(project.answers ?? {});
  const [authors, setAuthors] = useState<Author[]>(project.authors ?? []);
  const [activeTab, setActiveTab] = useState<DefinitionTab>("inquiry");
  
  // Save status & Debounced Auto-save
  const [saveStatus, setSaveStatus] = useState<"saved" | "saving" | "unsaved" | "error">("saved");
  const [lastSavedTime, setLastSavedTime] = useState<Date | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isFlushing, setIsFlushing] = useState(false);

  // AI Architect & FINER diagnostic
  const [finerModalOpen, setFinerModalOpen] = useState(false);
  const [isAnalyzingFiner, setIsAnalyzingFiner] = useState(false);
  const [finerStreamStatus, setFinerStreamStatus] = useState("");
  const [finerResult, setFinerResult] = useState<FinerDiagnosticResult | null>(null);

  // PICO Assistant
  const [picoModalOpen, setPicoModalOpen] = useState(false);
  const [isSynthesizingPico, setIsSynthesizingPico] = useState(false);
  const [picoInputs, setPicoInputs] = useState({
    population: "",
    intervention: "",
    comparison: "",
    outcome: "",
    studyDesign: "",
  });

  // Resource Exhausted Modal
  const [showExhaustedModal, setShowExhaustedModal] = useState(false);
  const [exhaustedReason, setExhaustedReason] = useState<string | null>(null);

  const def = STAGE_MAP.get("definition");
  const answersRef = useRef(answers);
  const authorsRef = useRef(authors);
  const debounceTimerRef = useRef<NodeJS.Timeout | null>(null);
  const isDirtyRef = useRef(false);

  answersRef.current = answers;
  authorsRef.current = authors;

  // Load output type spec
  useEffect(() => {
    let active = true;
    getOutputTypeSpec(project.outputTypeId)
      .then((s) => active && setSpec(s))
      .catch((e) => active && setError((e as Error).message));
    return () => {
      active = false;
    };
  }, [project.outputTypeId]);

  // Core saving function
  const flushSave = useCallback(async (): Promise<boolean> => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = null;
    }
    setSaveStatus("saving");
    setError(null);

    try {
      const updatedAnswers = await saveIntakeAnswers(projectId, answersRef.current);
      const updatedAuthors = await saveAuthors(projectId, authorsRef.current);
      const merged: ProjectView = {
        ...updatedAnswers,
        authors: updatedAuthors.authors,
      };
      onSaved(merged);
      setSaveStatus("saved");
      setLastSavedTime(new Date());
      isDirtyRef.current = false;
      return true;
    } catch (e) {
      setSaveStatus("error");
      setError((e as Error).message);
      return false;
    }
  }, [projectId, onSaved]);

  // Debounced auto-save scheduler
  const scheduleAutoSave = useCallback(() => {
    isDirtyRef.current = true;
    setSaveStatus("unsaved");
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    debounceTimerRef.current = setTimeout(() => {
      flushSave();
    }, 800);
  }, [flushSave]);

  // Cleanup pending auto-save on unmount
  useEffect(() => {
    return () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
      }
      if (isDirtyRef.current) {
        saveIntakeAnswers(projectId, answersRef.current).catch(() => {});
        saveAuthors(projectId, authorsRef.current).catch(() => {});
      }
    };
  }, [projectId]);

  // Answer updater
  function updateAnswer(key: string, value: string) {
    setAnswers((prev) => {
      const next = { ...prev, [key]: value };
      answersRef.current = next;
      return next;
    });
    scheduleAutoSave();
  }

  // Author management
  function updateAuthor(id: string, updates: Partial<Author>) {
    setAuthors((prev) => {
      const next = prev.map((a) => (a.id === id ? { ...a, ...updates } : a));
      authorsRef.current = next;
      return next;
    });
    scheduleAutoSave();
  }

  function addAuthor() {
    const newAuthor: Author = {
      id: "auth-" + Date.now() + "-" + Math.random().toString(36).slice(2, 7),
      firstName: "",
      surname: "",
      email: "",
      isCorresponding: authors.length === 0,
      creditRoles: [],
    };
    setAuthors((prev) => {
      const next = [...prev, newAuthor];
      authorsRef.current = next;
      return next;
    });
    scheduleAutoSave();
  }

  function removeAuthor(id: string) {
    setAuthors((prev) => {
      const next = prev.filter((a) => a.id !== id);
      authorsRef.current = next;
      return next;
    });
    scheduleAutoSave();
  }

  function moveAuthor(index: number, direction: -1 | 1) {
    if (index + direction < 0 || index + direction >= authors.length) return;
    setAuthors((prev) => {
      const copy = [...prev];
      const temp = copy[index];
      copy[index] = copy[index + direction];
      copy[index + direction] = temp;
      authorsRef.current = copy;
      return copy;
    });
    scheduleAutoSave();
  }

  function applyCreditPreset(authorId: string, preset: "solo" | "lead" | "pi" | "analyst" | "clear") {
    let roles: string[] = [];
    if (preset === "solo") {
      roles = [...CREDIT_ROLES];
    } else if (preset === "lead") {
      roles = ["Conceptualization", "Investigation", "Formal analysis", "Methodology", "Writing – original draft"];
    } else if (preset === "pi") {
      roles = ["Conceptualization", "Funding acquisition", "Project administration", "Resources", "Supervision", "Writing – review & editing"];
    } else if (preset === "analyst") {
      roles = ["Data curation", "Formal analysis", "Software", "Validation", "Visualization"];
    }
    updateAuthor(authorId, { creditRoles: roles });
  }

  // Synchronize dynamic reporting guideline whenever study_design changes
  useEffect(() => {
    const studyDesign = answers.study_design;
    if (studyDesign && STUDY_DESIGN_GUIDELINES[studyDesign] && !answers.reporting_guidelines) {
      updateAnswer("reporting_guidelines", STUDY_DESIGN_GUIDELINES[studyDesign].name);
    }
  }, [answers.study_design]);

  // Readiness Calculation
  const hasTitle = Boolean(answers.working_title?.trim());
  const hasArea = Boolean(answers.research_area?.trim());
  const hasArticleType = Boolean(answers.article_type?.trim());
  const hasStudyDesign = Boolean(answers.study_design?.trim());
  const hasPrq = Boolean(answers.primary_research_question?.trim());
  const hasExpectedContribution = Boolean(answers.expected_contribution?.trim());
  const hasAuthors = authors.length > 0 && authors.some((a) => a.firstName.trim() && a.surname.trim() && a.email.trim());
  const hasGovernance = Boolean(answers.human_subjects?.trim());
  const ethicsOk = !answers.human_subjects?.toLowerCase().includes("yes") || Boolean(answers.ethical_approval?.trim() && answers.consent_requirements?.trim());

  let readinessScore = 0;
  if (hasTitle) readinessScore += 20;
  if (hasArea) readinessScore += 15;
  if (hasArticleType) readinessScore += 15;
  if (hasAuthors) readinessScore += 20;
  if (hasGovernance && ethicsOk) readinessScore += 10;
  if (hasPrq) readinessScore += 10;
  if (hasStudyDesign) readinessScore += 5;
  if (hasExpectedContribution) readinessScore += 5;

  const isReadyToAdvance = hasTitle && hasArea && hasArticleType && hasAuthors && ethicsOk;

  // Manual save & advance
  async function handleAdvance() {
    setIsFlushing(true);
    setError(null);

    // Validate required fields
    if (!hasTitle) {
      setError("Please specify a Working Title before proceeding.");
      setActiveTab("inquiry");
      setIsFlushing(false);
      return;
    }
    if (!hasArea) {
      setError("Please specify a Research Domain / Area before proceeding.");
      setActiveTab("inquiry");
      setIsFlushing(false);
      return;
    }
    if (!hasArticleType) {
      setError("Please select an Article Type.");
      setActiveTab("methodology");
      setIsFlushing(false);
      return;
    }
    if (!hasAuthors) {
      setError("Please provide at least one author with a First Name, Surname, and Email.");
      setActiveTab("authors");
      setIsFlushing(false);
      return;
    }
    if (answers.human_subjects?.toLowerCase().includes("yes") && !ethicsOk) {
      setError("Human or animal subjects are flagged; please enter Ethical Approval & Consent details.");
      setActiveTab("governance");
      setIsFlushing(false);
      return;
    }

    const saved = await flushSave();
    setIsFlushing(false);
    if (saved && onAdvance) {
      onAdvance("literature");
    }
  }

  // Trigger FINER AI Diagnostic
  async function runFinerDiagnostic() {
    if (!answers.working_title && !answers.primary_research_question) {
      setError("Please provide at least a Working Title or Primary Research Question for the AI Architect to analyze.");
      return;
    }

    setIsAnalyzingFiner(true);
    setFinerStreamStatus("Evaluating scope & feasibility against FINER criteria...");
    setFinerModalOpen(true);
    setError(null);

    try {
      const { systemPrompt, userPrompt } = buildFinerDiagnosticPrompts({
        workingTitle: answers.working_title,
        researchArea: answers.research_area,
        primaryResearchQuestion: answers.primary_research_question,
        studyDesign: answers.study_design,
        articleType: answers.article_type,
        expectedContribution: answers.expected_contribution,
        theoreticalFramework: answers.theoretical_framework,
        targetPopulation: answers.target_population,
      });

      const raw = await executeAgenticLLM(
        systemPrompt,
        userPrompt,
        "reasoning",
        (chunk) => {
          setFinerStreamStatus("Synthesizing editorial appraisal and publication proposals...");
        },
        (failover) => {
          if (failover.userMessage) {
            setFinerStreamStatus(`Notice: ${failover.userMessage}`);
          }
        }
      );

      const parsed: FinerDiagnosticResult = parseJsonFromLlm(raw);
      if (!parsed || !parsed.overallScore) {
        throw new Error("Unable to parse FINER evaluation from AI model. Please try again.");
      }
      setFinerResult(parsed);
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.toLowerCase().includes("exhausted") || msg.toLowerCase().includes("no provider")) {
        setExhaustedReason(msg);
        setShowExhaustedModal(true);
      } else {
        setError(`AI Architect Error: ${msg}`);
      }
    } finally {
      setIsAnalyzingFiner(false);
      setFinerStreamStatus("");
    }
  }

  // Trigger PICO AI Synthesis
  async function runPicoSynthesis() {
    if (!picoInputs.population || !picoInputs.intervention || !picoInputs.outcome) {
      setError("Please fill in at least Population, Intervention, and Outcome.");
      return;
    }

    setIsSynthesizingPico(true);
    setError(null);

    try {
      const { systemPrompt, userPrompt } = buildPicoSynthesisPrompts({
        population: picoInputs.population,
        intervention: picoInputs.intervention,
        comparison: picoInputs.comparison,
        outcome: picoInputs.outcome,
        studyDesign: picoInputs.studyDesign || answers.study_design,
      });

      const raw = await executeAgenticLLM(systemPrompt, userPrompt, "reasoning");
      const parsed: PicoSynthesisResult = parseJsonFromLlm(raw);

      if (parsed && parsed.researchQuestion) {
        updateAnswer("primary_research_question", parsed.researchQuestion);
        if (parsed.workingTitle && (!answers.working_title || answers.working_title.trim() === "")) {
          updateAnswer("working_title", parsed.workingTitle);
        }
        setPicoModalOpen(false);
      } else {
        throw new Error("Could not synthesize research question from PICO parameters.");
      }
    } catch (e: any) {
      const msg = e.message || String(e);
      if (msg.toLowerCase().includes("exhausted") || msg.toLowerCase().includes("no provider")) {
        setExhaustedReason(msg);
        setShowExhaustedModal(true);
      } else {
        setError(`PICO Assistant Error: ${msg}`);
      }
    } finally {
      setIsSynthesizingPico(false);
    }
  }

  // Active guideline definition
  const currentGuideline = answers.study_design ? STUDY_DESIGN_GUIDELINES[answers.study_design] : null;

  if (!def) return <div className="p-8 text-[color:var(--text-muted)]">Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)]">
      {/* 1. Header & Stage Control Bar */}
      <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-8 py-5 shadow-xs z-10">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          {/* Stage Metadata */}
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-primary)] shadow-xs">
              <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.75} d={def.icon} />
              </svg>
            </div>
            <div>
              <div className="flex items-center gap-3">
                <h2 className="text-xl font-bold tracking-tight text-[color:var(--text-primary)]">
                  {def.number}. {def.label}
                </h2>
                <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)]">
                  Phase I: Foundation
                </span>
              </div>
              <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                Establish primary inquiry, methodological architecture, authorship taxonomies, and governance standards.
              </p>
            </div>
          </div>

          {/* Right Controls: Auto-Save Status, AI Architect Trigger & Proceed CTA */}
          <div className="flex items-center gap-3 self-end lg:self-auto flex-wrap">
            {/* Auto-Save Indicator */}
            <div className="flex items-center gap-1.5 text-xs text-[color:var(--text-muted)] bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] px-3 py-1.5 rounded-full">
              {saveStatus === "saving" && (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Saving changes...</span>
                </>
              )}
              {saveStatus === "saved" && (
                <>
                  <svg className="w-3.5 h-3.5 text-[color:var(--state-success)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                  </svg>
                  <span>{lastSavedTime ? `Saved ${lastSavedTime.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}` : "All changes saved"}</span>
                </>
              )}
              {saveStatus === "unsaved" && (
                <>
                  <span className="w-2 h-2 rounded-full bg-[color:var(--state-warning)] animate-pulse" />
                  <span>Unsaved edits</span>
                </>
              )}
              {saveStatus === "error" && (
                <>
                  <span className="w-2 h-2 rounded-full bg-[color:var(--state-danger)]" />
                  <span className="text-[color:var(--state-danger)]">Save failed</span>
                </>
              )}
            </div>

            {/* AI Architect Trigger */}
            <button
              type="button"
              onClick={runFinerDiagnostic}
              disabled={isAnalyzingFiner}
              className="px-3.5 py-1.5 text-xs font-bold rounded-full border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-all flex items-center gap-1.5 shadow-2xs cursor-pointer"
            >
              <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
              </svg>
              <span>AI Architect & FINER</span>
            </button>

            {/* Proceed CTA */}
            <button
              type="button"
              onClick={handleAdvance}
              disabled={isFlushing}
              className={`px-5 py-2 text-xs font-bold rounded-full transition-all flex items-center gap-2 cursor-pointer shadow-sm ${
                isReadyToAdvance
                  ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)]"
                  : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] border border-[color:var(--border-control)] hover:border-[color:var(--border-strong)]"
              }`}
            >
              {isFlushing ? (
                <>
                  <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                  </svg>
                  <span>Saving...</span>
                </>
              ) : (
                <>
                  <span>Proceed to Literature Discovery</span>
                  <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M9 5l7 7-7 7" />
                  </svg>
                </>
              )}
            </button>
          </div>
        </div>

        {/* Readiness Meter Strip */}
        <div className="mt-4 pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 flex-1 max-w-xl">
            <span className="text-[11px] font-semibold text-[color:var(--text-secondary)] shrink-0">
              Readiness: {readinessScore}%
            </span>
            <div className="w-full bg-[color:var(--surface-inset)] h-1.5 rounded-full overflow-hidden border border-[color:var(--border-subtle)]">
              <div
                className="h-full bg-[color:var(--accent)] transition-all duration-300 rounded-full"
                style={{ width: `${readinessScore}%` }}
              />
            </div>
          </div>

          <div className="flex items-center gap-2 text-[11px] text-[color:var(--text-muted)]">
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${hasTitle && hasArea ? "bg-[color:var(--state-success)]" : "bg-[color:var(--border-control)]"}`} />
              Inquiry
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${hasArticleType ? "bg-[color:var(--state-success)]" : "bg-[color:var(--border-control)]"}`} />
              Methodology
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${hasAuthors ? "bg-[color:var(--state-success)]" : "bg-[color:var(--border-control)]"}`} />
              Authors
            </span>
            <span>•</span>
            <span className="flex items-center gap-1">
              <span className={`w-1.5 h-1.5 rounded-full ${ethicsOk ? "bg-[color:var(--state-success)]" : "bg-[color:var(--border-control)]"}`} />
              Governance
            </span>
          </div>
        </div>
      </div>

      {/* 2. Segmented Navigation Tabs */}
      <div className="bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)] px-8 flex items-center gap-2 overflow-x-auto">
        <button
          type="button"
          onClick={() => setActiveTab("inquiry")}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === "inquiry"
              ? "border-[color:var(--accent)] text-[color:var(--text-primary)]"
              : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span>1. Inquiry & Scope</span>
          {hasTitle && hasArea && (
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--state-success)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("methodology")}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === "methodology"
              ? "border-[color:var(--accent)] text-[color:var(--text-primary)]"
              : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <span>2. Methodological Architecture</span>
          {hasArticleType && (
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--state-success)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("authors")}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === "authors"
              ? "border-[color:var(--accent)] text-[color:var(--text-primary)]"
              : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z" />
          </svg>
          <span>3. Authorship & CRediT</span>
          {hasAuthors && (
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--state-success)]" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setActiveTab("governance")}
          className={`py-3 px-4 text-xs font-bold border-b-2 transition-all flex items-center gap-2 cursor-pointer shrink-0 ${
            activeTab === "governance"
              ? "border-[color:var(--accent)] text-[color:var(--text-primary)]"
              : "border-transparent text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          }`}
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span>4. Governance & Integrity</span>
          {ethicsOk && (
            <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--state-success)]" />
          )}
        </button>
      </div>

      {/* 3. Main Stage Content Area */}
      <div className="flex-1 overflow-y-auto p-8 relative">
        <div className="max-w-4xl mx-auto space-y-8 pb-20">
          {error && (
            <div className="p-4 rounded-xl bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] border border-[color:var(--state-danger)] text-sm flex items-start gap-3">
              <svg className="w-5 h-5 shrink-0 mt-0.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
              </svg>
              <div className="flex-1">{error}</div>
            </div>
          )}

          {/* TAB 1: INQUIRY & SCOPE */}
          {activeTab === "inquiry" && (
            <div className="space-y-6">
              {/* Working Title Card */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="working_title" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                    Working Title
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)]">Required</span>
                  </label>
                  <div className="flex items-center gap-2">
                    <span className="text-xs text-[color:var(--text-muted)]">
                      {(answers.working_title || "").length} characters
                    </span>
                    <button
                      type="button"
                      onClick={runFinerDiagnostic}
                      className="text-xs font-semibold text-[color:var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
                    >
                      <span>✨ Polish with AI</span>
                    </button>
                  </div>
                </div>
                <input
                  id="working_title"
                  type="text"
                  value={answers.working_title || ""}
                  onChange={(e) => updateAnswer("working_title", e.target.value)}
                  placeholder="e.g. Scalable Multi-Agent Orchestration for Verifiable Autonomous Scientific Discovery..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-3 text-base text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all"
                />
                <p className="text-xs text-[color:var(--text-muted)]">
                  The working title anchors your manuscript. It can be further generated and locked in Stages 5 & 6.
                </p>
              </div>

              {/* Primary Research Question Card */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="primary_research_question" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                    Primary Research Question (PRQ)
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">Recommended</span>
                  </label>
                  <button
                    type="button"
                    onClick={() => setPicoModalOpen(true)}
                    className="text-xs font-bold text-[color:var(--accent)] bg-[color:var(--accent-subtle)] px-2.5 py-1 rounded-full hover:bg-[color:var(--surface-hover)] transition-all flex items-center gap-1 cursor-pointer"
                  >
                    <span>🎯 PICO Assistant</span>
                  </button>
                </div>
                <textarea
                  id="primary_research_question"
                  rows={3}
                  value={answers.primary_research_question || ""}
                  onChange={(e) => updateAnswer("primary_research_question", e.target.value)}
                  placeholder="e.g. To what extent does active claim-evidence grounding mitigate hallucination rates in multi-pass academic draft synthesis?"
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all resize-y"
                />
                <p className="text-xs text-[color:var(--text-muted)]">
                  The central scientific question driving literature retrieval, evidence extraction, and thesis argumentation.
                </p>
              </div>

              {/* Research Domain / Area */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <label htmlFor="research_area" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                  Research Domain / Scientific Discipline
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)]">Required</span>
                </label>
                <input
                  id="research_area"
                  type="text"
                  value={answers.research_area || ""}
                  onChange={(e) => updateAnswer("research_area", e.target.value)}
                  placeholder="e.g. Artificial Intelligence, Computational Linguistics, Health Informatics..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all"
                />
                <p className="text-xs text-[color:var(--text-muted)]">
                  Determines academic ontology, indexing keywords, and journal taxonomy routing.
                </p>
              </div>

              {/* Expected Contribution & Significance */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <label htmlFor="expected_contribution" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                  Expected Contribution & Scholarly Significance
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">Recommended</span>
                </label>
                <textarea
                  id="expected_contribution"
                  rows={3}
                  value={answers.expected_contribution || ""}
                  onChange={(e) => updateAnswer("expected_contribution", e.target.value)}
                  placeholder="Describe the empirical, theoretical, or methodological advancement this paper introduces to the canon..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all resize-y"
                />
              </div>

              {/* Theoretical / Conceptual Framework */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <label htmlFor="theoretical_framework" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                  Theoretical / Conceptual Framework (Optional)
                </label>
                <textarea
                  id="theoretical_framework"
                  rows={2}
                  value={answers.theoretical_framework || ""}
                  onChange={(e) => updateAnswer("theoretical_framework", e.target.value)}
                  placeholder="e.g. Activity Theory, Grounded Theory, Dual-Coding Theory, Socio-Technical Systems..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all resize-y"
                />
              </div>

              {/* Target Publication Venue */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-2">
                  <div>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)]">
                      Target Publication Venue (Optional)
                    </h4>
                    <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                      Specify your intended academic journal to automatically align word count budgets and citation styles in Stage 16.
                    </p>
                  </div>
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label htmlFor="target_journal" className="block text-xs font-semibold text-[color:var(--text-secondary)] mb-1">
                      Target Journal Name
                    </label>
                    <input
                      id="target_journal"
                      type="text"
                      value={answers.target_journal || ""}
                      onChange={(e) => updateAnswer("target_journal", e.target.value)}
                      placeholder="e.g. Nature Machine Intelligence, Water Research (Elsevier)..."
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label htmlFor="author_guidelines" className="block text-xs font-semibold text-[color:var(--text-secondary)] mb-1">
                      Author Guidelines URL / Notes
                    </label>
                    <input
                      id="author_guidelines"
                      type="text"
                      value={answers.author_guidelines || ""}
                      onChange={(e) => updateAnswer("author_guidelines", e.target.value)}
                      placeholder="e.g. https://www.nature.com/natmachintell/for-authors or 5,000 words max..."
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>

              {/* Custom spec intake fields if defined on output type */}
              {spec && (
                <>
                  {[...spec.intakeSchema.required, ...spec.intakeSchema.recommended]
                    .filter(
                      (f) =>
                        ![
                          "working_title",
                          "primary_research_question",
                          "research_area",
                          "expected_contribution",
                          "theoretical_framework",
                          "target_journal",
                          "author_guidelines",
                          "article_type",
                          "study_design",
                          "reporting_guidelines",
                          "target_population",
                          "hypothesis_h1",
                          "hypothesis_h0",
                          "independent_variables",
                          "dependent_variables",
                          "human_subjects",
                          "ethical_approval",
                          "consent_requirements",
                          "funding",
                          "conflicts_of_interest",
                          "data_availability",
                        ].includes(f.key)
                    )
                    .map((field) => (
                      <div
                        key={field.key}
                        className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3"
                      >
                        <label htmlFor={field.key} className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                          {field.label}
                          {field.tier === "required" && (
                            <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)]">
                              Required
                            </span>
                          )}
                        </label>
                        <textarea
                          id={field.key}
                          rows={2}
                          value={answers[field.key] || ""}
                          onChange={(e) => updateAnswer(field.key, e.target.value)}
                          placeholder={field.guidance?.example || ""}
                          className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all resize-y"
                        />
                      </div>
                    ))}
                </>
              )}
            </div>
          )}

          {/* TAB 2: METHODOLOGICAL ARCHITECTURE */}
          {activeTab === "methodology" && (
            <div className="space-y-6">
              {/* Article Type & Study Design Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                {/* Article Type */}
                <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                  <label htmlFor="article_type" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                    Article Type
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)]">Required</span>
                  </label>
                  <select
                    id="article_type"
                    value={ARTICLE_TYPES.includes(answers.article_type) ? answers.article_type : answers.article_type ? "Other" : ""}
                    onChange={(e) => updateAnswer("article_type", e.target.value === "Other" ? "" : e.target.value)}
                    className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-3 py-2.5 text-sm text-[color:var(--text-primary)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all"
                  >
                    <option value="" disabled>Select article type...</option>
                    {ARTICLE_TYPES.map((type) => (
                      <option key={type} value={type}>{type}</option>
                    ))}
                    <option value="Other">Other (Specify)</option>
                  </select>
                  {(!ARTICLE_TYPES.includes(answers.article_type) && answers.article_type !== undefined) && (
                    <input
                      type="text"
                      value={answers.article_type || ""}
                      onChange={(e) => updateAnswer("article_type", e.target.value)}
                      placeholder="Specify custom article type"
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-none"
                    />
                  )}
                </div>

                {/* Study Design */}
                <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                  <label htmlFor="study_design" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                    Study Design / Methodological Model
                    <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">Recommended</span>
                  </label>
                  <select
                    id="study_design"
                    value={STUDY_DESIGN_TYPES.includes(answers.study_design) ? answers.study_design : answers.study_design ? "Other" : ""}
                    onChange={(e) => updateAnswer("study_design", e.target.value === "Other" ? "" : e.target.value)}
                    className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-3 py-2.5 text-sm text-[color:var(--text-primary)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all"
                  >
                    <option value="" disabled>Select study design...</option>
                    {STUDY_DESIGN_TYPES.map((design) => (
                      <option key={design} value={design}>{design}</option>
                    ))}
                    <option value="Other">Other (Specify)</option>
                  </select>
                  {(!STUDY_DESIGN_TYPES.includes(answers.study_design) && answers.study_design !== undefined) && (
                    <input
                      type="text"
                      value={answers.study_design || ""}
                      onChange={(e) => updateAnswer("study_design", e.target.value)}
                      placeholder="Specify custom study design"
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-3 py-2 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-none"
                    />
                  )}
                </div>
              </div>

              {/* Dynamic Reporting Guideline Card */}
              {currentGuideline && (
                <div className="rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] p-5 shadow-2xs flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
                  <div className="flex items-start gap-3.5">
                    <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-subtle)] text-[color:var(--accent)] flex items-center justify-center shrink-0 border border-[color:var(--border-subtle)]">
                      <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
                      </svg>
                    </div>
                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="text-xs font-black uppercase tracking-wider text-[color:var(--text-primary)]">
                          Recommended Reporting Standard:
                        </span>
                        <span className="px-2 py-0.5 rounded-full text-xs font-black bg-[color:var(--accent)] text-[color:var(--text-inverse)]">
                          {currentGuideline.name}
                        </span>
                        <span className="text-[11px] text-[color:var(--state-success)] font-medium">
                          ✓ Tagged to Blueprint
                        </span>
                      </div>
                      <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                        {currentGuideline.fullName} — {currentGuideline.scope}.
                      </p>
                    </div>
                  </div>
                  <a
                    href={currentGuideline.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-xs font-bold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] underline shrink-0 inline-flex items-center gap-1"
                  >
                    <span>Checklist Specs</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              )}

              {/* Target Population / Dataset / Sample */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <label htmlFor="target_population" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                  Target Population / Dataset / Sample Scope
                  <span className="text-[10px] font-bold px-1.5 py-0.5 rounded bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)]">Optional</span>
                </label>
                <textarea
                  id="target_population"
                  rows={2}
                  value={answers.target_population || ""}
                  onChange={(e) => updateAnswer("target_population", e.target.value)}
                  placeholder="Define the unit of analysis, cohort eligibility, dataset provenance, or sample demographics..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-3 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--border-strong)] focus:outline-none transition-all resize-y"
                />
              </div>

              {/* Hypotheses & Variables Formulation */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-4">
                <div className="border-b border-[color:var(--border-subtle)] pb-2 flex items-center justify-between">
                  <h4 className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                    <svg className="w-4 h-4 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
                    Hypotheses & Variable Decomposition (Optional)
                  </h4>
                  <span className="text-xs text-[color:var(--text-muted)]">Informs Evidence Matrix</span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--text-secondary)] mb-1">
                      Alternative Hypothesis (H₁)
                    </label>
                    <input
                      type="text"
                      value={answers.hypothesis_h1 || ""}
                      onChange={(e) => updateAnswer("hypothesis_h1", e.target.value)}
                      placeholder="e.g. Exposure to X significantly improves outcome Y..."
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--text-secondary)] mb-1">
                      Null Hypothesis (H₀)
                    </label>
                    <input
                      type="text"
                      value={answers.hypothesis_h0 || ""}
                      onChange={(e) => updateAnswer("hypothesis_h0", e.target.value)}
                      placeholder="e.g. Exposure to X yields no detectable difference in outcome Y..."
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--text-secondary)] mb-1">
                      Independent / Exposure Variables
                    </label>
                    <input
                      type="text"
                      value={answers.independent_variables || ""}
                      onChange={(e) => updateAnswer("independent_variables", e.target.value)}
                      placeholder="e.g. Dosage, Treatment condition, Model architecture..."
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[color:var(--text-secondary)] mb-1">
                      Dependent / Outcome Metrics
                    </label>
                    <input
                      type="text"
                      value={answers.dependent_variables || ""}
                      onChange={(e) => updateAnswer("dependent_variables", e.target.value)}
                      placeholder="e.g. Citation latency, Accuracy, Retention rate..."
                      className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                    />
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: AUTHORSHIP & CREDIT */}
          {activeTab === "authors" && (
            <div className="space-y-6">
              <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-4">
                <div>
                  <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                    Author Roster & CRediT Taxonomies
                  </h3>
                  <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                    Define formal manuscript authorship and granular contributor roles according to the standard CRediT taxonomy.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={addAuthor}
                  className="px-4 py-2 text-xs font-bold text-[color:var(--accent)] bg-[color:var(--accent-subtle)] rounded-full hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-colors flex items-center gap-1.5 cursor-pointer shadow-2xs"
                >
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                  </svg>
                  <span>Add Author</span>
                </button>
              </div>

              {authors.length === 0 ? (
                <div className="p-12 text-center border-2 border-dashed border-[color:var(--border-subtle)] rounded-2xl bg-[color:var(--surface-raised)]">
                  <p className="text-sm font-semibold text-[color:var(--text-secondary)]">No authors registered yet.</p>
                  <p className="text-xs text-[color:var(--text-muted)] mt-1 mb-4">Every journal article requires at least one primary author.</p>
                  <button
                    type="button"
                    onClick={addAuthor}
                    className="px-4 py-2 text-xs font-bold text-white bg-[color:var(--accent)] rounded-full cursor-pointer hover:bg-[color:var(--accent-hover)]"
                  >
                    Add Lead Author
                  </button>
                </div>
              ) : (
                authors.map((author, index) => (
                  <div
                    key={author.id}
                    className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs relative space-y-4"
                  >
                    {/* Header bar of Author Card */}
                    <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
                      <div className="flex items-center gap-2">
                        <span className="w-6 h-6 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] text-xs font-bold flex items-center justify-center">
                          {index + 1}
                        </span>
                        <span className="text-sm font-bold text-[color:var(--text-primary)]">
                          {author.firstName || author.surname
                            ? `${author.title ? author.title + " " : ""}${author.firstName} ${author.surname}`
                            : "New Author"}
                        </span>
                        {author.isCorresponding && (
                          <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)]">
                            Corresponding
                          </span>
                        )}
                      </div>

                      {/* Reordering and removal controls */}
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => moveAuthor(index, -1)}
                          disabled={index === 0}
                          title="Move Up"
                          className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-20 cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => moveAuthor(index, 1)}
                          disabled={index === authors.length - 1}
                          title="Move Down"
                          className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] disabled:opacity-20 cursor-pointer"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          onClick={() => removeAuthor(author.id)}
                          title="Remove Author"
                          className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] hover:bg-[color:var(--surface-hover)] cursor-pointer ml-1"
                        >
                          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Metadata Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-secondary)] mb-1">Title</label>
                        <input
                          type="text"
                          value={author.title || ""}
                          onChange={(e) => updateAuthor(author.id, { title: e.target.value })}
                          placeholder="Dr., Prof."
                          className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-secondary)] mb-1">First Name *</label>
                        <input
                          type="text"
                          value={author.firstName}
                          onChange={(e) => updateAuthor(author.id, { firstName: e.target.value })}
                          placeholder="Jane"
                          className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-secondary)] mb-1">Middle Name</label>
                        <input
                          type="text"
                          value={author.middleName || ""}
                          onChange={(e) => updateAuthor(author.id, { middleName: e.target.value })}
                          placeholder="A."
                          className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-secondary)] mb-1">Surname *</label>
                        <input
                          type="text"
                          value={author.surname}
                          onChange={(e) => updateAuthor(author.id, { surname: e.target.value })}
                          placeholder="Smith"
                          className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                      <div>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-secondary)] mb-1">Email *</label>
                        <input
                          type="email"
                          value={author.email}
                          onChange={(e) => updateAuthor(author.id, { email: e.target.value })}
                          placeholder="jane.smith@institution.edu"
                          className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-secondary)] mb-1">ORCID iD</label>
                        <input
                          type="text"
                          value={author.orcid || ""}
                          onChange={(e) => updateAuthor(author.id, { orcid: e.target.value })}
                          placeholder="0000-0002-1825-0097"
                          className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none font-mono"
                        />
                      </div>
                      <div>
                        <label className="block text-[11px] font-semibold text-[color:var(--text-secondary)] mb-1">Academic Affiliation</label>
                        <input
                          type="text"
                          value={author.affiliation || ""}
                          onChange={(e) => updateAuthor(author.id, { affiliation: e.target.value })}
                          placeholder="Department of Medicine, Oxford"
                          className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                        />
                      </div>
                    </div>

                    {/* Corresponding Author Toggle */}
                    <div className="flex items-center gap-2 pt-1">
                      <input
                        type="checkbox"
                        id={`corr-${author.id}`}
                        checked={author.isCorresponding}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          if (checked) {
                            setAuthors((prev) =>
                              prev.map((a) => (a.id === author.id ? { ...a, isCorresponding: true } : { ...a, isCorresponding: false }))
                            );
                          } else {
                            updateAuthor(author.id, { isCorresponding: false });
                          }
                        }}
                        className="rounded border-[color:var(--border-default)] text-[color:var(--accent)] focus:ring-[color:var(--accent)] cursor-pointer"
                      />
                      <label htmlFor={`corr-${author.id}`} className="text-xs font-semibold text-[color:var(--text-primary)] cursor-pointer">
                        Designate as Primary Corresponding Author for journal submission
                      </label>
                    </div>

                    {/* CRediT Presets Toolbar */}
                    <div className="pt-2 border-t border-[color:var(--border-subtle)] space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="text-[11px] font-bold text-[color:var(--text-secondary)]">
                          CRediT Contributor Roles ({author.creditRoles?.length || 0}/14 assigned)
                        </label>
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="text-[10px] text-[color:var(--text-muted)] font-medium">Quick Presets:</span>
                          <button
                            type="button"
                            onClick={() => applyCreditPreset(author.id, "solo")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer"
                          >
                            🎓 Solo Author
                          </button>
                          <button
                            type="button"
                            onClick={() => applyCreditPreset(author.id, "lead")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer"
                          >
                            🔬 Lead Author
                          </button>
                          <button
                            type="button"
                            onClick={() => applyCreditPreset(author.id, "pi")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer"
                          >
                            🏛️ PI / Senior
                          </button>
                          <button
                            type="button"
                            onClick={() => applyCreditPreset(author.id, "analyst")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] cursor-pointer"
                          >
                            📊 Methodologist
                          </button>
                          <button
                            type="button"
                            onClick={() => applyCreditPreset(author.id, "clear")}
                            className="px-2 py-0.5 rounded text-[10px] font-bold text-[color:var(--state-danger)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                          >
                            Clear
                          </button>
                        </div>
                      </div>

                      {/* CRediT Role Badges */}
                      <div className="flex flex-wrap gap-1.5">
                        {CREDIT_ROLES.map((role) => {
                          const active = author.creditRoles?.includes(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => {
                                const nextRoles = active
                                  ? author.creditRoles.filter((r) => r !== role)
                                  : [...(author.creditRoles || []), role];
                                updateAuthor(author.id, { creditRoles: nextRoles });
                              }}
                              className={`px-2.5 py-1 text-[11px] rounded-full border transition-all cursor-pointer ${
                                active
                                  ? "bg-[color:var(--accent-subtle)] border-[color:var(--border-strong)] text-[color:var(--text-primary)] font-bold shadow-2xs"
                                  : "bg-[color:var(--surface-base)] border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-default)]"
                              }`}
                            >
                              {role}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                ))
              )}
            </div>
          )}

          {/* TAB 4: GOVERNANCE & INTEGRITY */}
          {activeTab === "governance" && (
            <div className="space-y-6">
              {/* Human / Animal Subjects Section */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <label className="text-sm font-bold text-[color:var(--text-primary)] block">
                      Does this research involve Human Participants or Animal Subjects?
                    </label>
                    <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                      Required for international medical, behavioral, and clinical ethics compliance.
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => updateAnswer("human_subjects", "No")}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                        answers.human_subjects?.toLowerCase() === "no"
                          ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)] border-[color:var(--accent)]"
                          : "bg-[color:var(--surface-base)] text-[color:var(--text-secondary)] border-[color:var(--border-default)]"
                      }`}
                    >
                      No
                    </button>
                    <button
                      type="button"
                      onClick={() => updateAnswer("human_subjects", "Yes")}
                      className={`px-4 py-1.5 rounded-full text-xs font-bold border transition-all cursor-pointer ${
                        answers.human_subjects?.toLowerCase().includes("yes")
                          ? "bg-[color:var(--accent)] text-[color:var(--text-inverse)] border-[color:var(--accent)]"
                          : "bg-[color:var(--surface-base)] text-[color:var(--text-secondary)] border-[color:var(--border-default)]"
                      }`}
                    >
                      Yes
                    </button>
                  </div>
                </div>

                {answers.human_subjects?.toLowerCase().includes("yes") && (
                  <div className="pt-4 border-t border-[color:var(--border-subtle)] space-y-4 animate-in fade-in duration-200">
                    <div>
                      <label htmlFor="ethical_approval" className="block text-xs font-bold text-[color:var(--text-primary)] mb-1">
                        Ethics Committee / Institutional Review Board (IRB) Protocol ID *
                      </label>
                      <input
                        id="ethical_approval"
                        type="text"
                        value={answers.ethical_approval || ""}
                        onChange={(e) => updateAnswer("ethical_approval", e.target.value)}
                        placeholder="e.g. IRB-2025-0842; Approved by National Health Research Council..."
                        className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-2.5 text-xs text-[color:var(--text-primary)] focus:outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor="consent_requirements" className="block text-xs font-bold text-[color:var(--text-primary)] mb-1">
                        Informed Consent Procedures *
                      </label>
                      <textarea
                        id="consent_requirements"
                        rows={2}
                        value={answers.consent_requirements || ""}
                        onChange={(e) => updateAnswer("consent_requirements", e.target.value)}
                        placeholder="e.g. Written informed consent obtained from all participants prior to enrollment; anonymized de-identification protocol applied..."
                        className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-2.5 text-xs text-[color:var(--text-primary)] focus:outline-none resize-y"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Funding Sources */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="funding" className="text-sm font-bold text-[color:var(--text-primary)]">
                    Funding Sources & Grant Numbers
                  </label>
                  <button
                    type="button"
                    onClick={() => updateAnswer("funding", "No external funding was received for this study.")}
                    className="text-xs text-[color:var(--accent)] hover:underline cursor-pointer"
                  >
                    Set "No external funding"
                  </button>
                </div>
                <input
                  id="funding"
                  type="text"
                  value={answers.funding || ""}
                  onChange={(e) => updateAnswer("funding", e.target.value)}
                  placeholder="e.g. National Science Foundation grant IIS-2384912, or 'No external funding'"
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-2.5 text-xs text-[color:var(--text-primary)] focus:outline-none"
                />
              </div>

              {/* Conflicts of Interest */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <label htmlFor="conflicts_of_interest" className="text-sm font-bold text-[color:var(--text-primary)]">
                    Conflicts of Interest Statement
                  </label>
                  <button
                    type="button"
                    onClick={() => updateAnswer("conflicts_of_interest", "The authors declare no competing financial or non-financial interests.")}
                    className="text-xs text-[color:var(--accent)] hover:underline cursor-pointer"
                  >
                    Set "None declared"
                  </button>
                </div>
                <textarea
                  id="conflicts_of_interest"
                  rows={2}
                  value={answers.conflicts_of_interest || ""}
                  onChange={(e) => updateAnswer("conflicts_of_interest", e.target.value)}
                  placeholder="Declare financial holdings, consultancies, patent royalties, or 'The authors declare no competing interests'..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-2.5 text-xs text-[color:var(--text-primary)] focus:outline-none resize-y"
                />
              </div>

              {/* Data Availability Statement */}
              <div className="rounded-2xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-6 shadow-2xs space-y-3">
                <label htmlFor="data_availability" className="text-sm font-bold text-[color:var(--text-primary)] block">
                  Data Availability / Open Science Statement
                </label>
                <div className="flex items-center gap-2 flex-wrap text-xs">
                  <span className="text-[color:var(--text-muted)]">Templates:</span>
                  <button
                    type="button"
                    onClick={() => updateAnswer("data_availability", "The data that support the findings of this study are openly available in Zenodo at [DOI].")}
                    className="px-2 py-0.5 rounded bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] text-[10px] font-medium cursor-pointer"
                  >
                    Public Repository
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAnswer("data_availability", "The data that support the findings of this study are available from the corresponding author upon reasonable request.")}
                    className="px-2 py-0.5 rounded bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] text-[10px] font-medium cursor-pointer"
                  >
                    Upon Request
                  </button>
                  <button
                    type="button"
                    onClick={() => updateAnswer("data_availability", "All data generated or analyzed during this study are included in this published article (and its supplementary information files).")}
                    className="px-2 py-0.5 rounded bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] text-[color:var(--text-secondary)] text-[10px] font-medium cursor-pointer"
                  >
                    Included in Article
                  </button>
                </div>
                <textarea
                  id="data_availability"
                  rows={2}
                  value={answers.data_availability || ""}
                  onChange={(e) => updateAnswer("data_availability", e.target.value)}
                  placeholder="Specify repository URLs, access restrictions, or compliance statements..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-xl px-4 py-2.5 text-xs text-[color:var(--text-primary)] focus:outline-none resize-y"
                />
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 4. FINER Framework AI Diagnostic Modal */}
      {finerModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-2xl max-h-[85vh] overflow-y-auto rounded-2xl bg-[color:var(--surface-raised)] p-6 shadow-2xl border border-[color:var(--border-default)] space-y-6">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)] flex items-center justify-center font-black">
                  ✨
                </div>
                <div>
                  <h3 className="text-base font-bold text-[color:var(--text-primary)]">
                    AI Architect — FINER Framework Evaluation
                  </h3>
                  <p className="text-xs text-[color:var(--text-muted)]">
                    Rigorous appraisal across Feasibility, Interest, Novelty, Ethics, and Relevance.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setFinerModalOpen(false)}
                className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 rounded-lg cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {isAnalyzingFiner && (
              <div className="py-12 flex flex-col items-center justify-center gap-3 text-center">
                <svg className="w-8 h-8 animate-spin text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <p className="text-sm font-semibold text-[color:var(--text-primary)]">
                  {finerStreamStatus || "AI Architect evaluating research inquiry..."}
                </p>
                <p className="text-xs text-[color:var(--text-muted)] max-w-sm">
                  Benchmarking against Q1 journal editorial acceptance standards.
                </p>
              </div>
            )}

            {!isAnalyzingFiner && finerResult && (
              <div className="space-y-6">
                {/* Overall Score Badge */}
                <div className="p-4 rounded-xl bg-[color:var(--surface-base)] border border-[color:var(--border-subtle)] flex items-center justify-between">
                  <div>
                    <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
                      Composite FINER Score
                    </span>
                    <p className="text-xs text-[color:var(--text-muted)] mt-0.5">
                      Peer-review readiness & scope integrity
                    </p>
                  </div>
                  <div className="flex items-baseline gap-1">
                    <span className="text-3xl font-black text-[color:var(--text-primary)]">
                      {finerResult.overallScore}
                    </span>
                    <span className="text-xs font-semibold text-[color:var(--text-muted)]">/100</span>
                  </div>
                </div>

                {/* 5 Criteria Mini-Cards */}
                <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
                  {Object.entries(finerResult.criteria || {}).map(([key, item]) => (
                    <div key={key} className="p-3 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-center space-y-1">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
                        {key}
                      </span>
                      <div className="text-base font-black text-[color:var(--text-primary)]">
                        {item.score}%
                      </div>
                      <p className="text-[10px] text-[color:var(--text-secondary)] line-clamp-2 text-left">
                        {item.comment}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Editorial Critique */}
                <div className="p-4 rounded-xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-1">
                  <span className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    Editorial Appraisal:
                  </span>
                  <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
                    {finerResult.critique}
                  </p>
                </div>

                {/* 3 Proposals with 1-click adoption */}
                <div className="space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-[color:var(--text-secondary)]">
                    Publication-Grade Refinement Proposals
                  </h4>
                  {finerResult.proposals?.map((prop, idx) => (
                    <div
                      key={prop.id || idx}
                      className="p-4 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-base)] hover:border-[color:var(--border-default)] transition-all space-y-2"
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--text-primary)]">
                            Option {idx + 1}
                          </span>
                          <h5 className="text-sm font-bold text-[color:var(--text-primary)] mt-1">
                            {prop.title}
                          </h5>
                        </div>
                        <button
                          type="button"
                          onClick={() => {
                            updateAnswer("working_title", prop.title);
                            if (prop.question) {
                              updateAnswer("primary_research_question", prop.question);
                            }
                            setFinerModalOpen(false);
                          }}
                          className="px-3 py-1.5 rounded-full text-xs font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-all shrink-0 cursor-pointer shadow-2xs"
                        >
                          Adopt Both
                        </button>
                      </div>
                      {prop.question && (
                        <p className="text-xs text-[color:var(--text-secondary)] font-medium italic">
                          "{prop.question}"
                        </p>
                      )}
                      <p className="text-[11px] text-[color:var(--text-muted)]">
                        {prop.rationale}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 5. PICO / SPIDER Assistant Modal */}
      {picoModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 backdrop-blur-xs animate-in fade-in duration-200">
          <div className="relative w-full max-w-lg rounded-2xl bg-[color:var(--surface-raised)] p-6 shadow-2xl border border-[color:var(--border-default)] space-y-4">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
              <div className="flex items-center gap-2">
                <span className="text-base font-bold text-[color:var(--text-primary)]">
                  🎯 PICO Formulation Assistant
                </span>
              </div>
              <button
                type="button"
                onClick={() => setPicoModalOpen(false)}
                className="text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 rounded-lg cursor-pointer"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <p className="text-xs text-[color:var(--text-muted)]">
              Specify your study elements and let the AI Assistant synthesize an operational Primary Research Question & Title.
            </p>

            <div className="space-y-3">
              <div>
                <label className="block text-[11px] font-bold text-[color:var(--text-secondary)] mb-1">
                  Population / Problem (P) *
                </label>
                <input
                  type="text"
                  value={picoInputs.population}
                  onChange={(e) => setPicoInputs({ ...picoInputs, population: e.target.value })}
                  placeholder="e.g. Adult ICU patients with acute respiratory distress..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[color:var(--text-secondary)] mb-1">
                  Intervention / Exposure (I) *
                </label>
                <input
                  type="text"
                  value={picoInputs.intervention}
                  onChange={(e) => setPicoInputs({ ...picoInputs, intervention: e.target.value })}
                  placeholder="e.g. Early prone positioning protocol..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[color:var(--text-secondary)] mb-1">
                  Comparison / Control (C)
                </label>
                <input
                  type="text"
                  value={picoInputs.comparison}
                  onChange={(e) => setPicoInputs({ ...picoInputs, comparison: e.target.value })}
                  placeholder="e.g. Standard supine positioning / usual care..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[color:var(--text-secondary)] mb-1">
                  Outcome / Primary Metric (O) *
                </label>
                <input
                  type="text"
                  value={picoInputs.outcome}
                  onChange={(e) => setPicoInputs({ ...picoInputs, outcome: e.target.value })}
                  placeholder="e.g. 28-day all-cause mortality and oxygenation index..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-[11px] font-bold text-[color:var(--text-secondary)] mb-1">
                  Study Design / Timeframe (S)
                </label>
                <input
                  type="text"
                  value={picoInputs.studyDesign}
                  onChange={(e) => setPicoInputs({ ...picoInputs, studyDesign: e.target.value })}
                  placeholder="e.g. Randomized controlled trial, multicenter prospective..."
                  className="w-full bg-[color:var(--surface-base)] border border-[color:var(--border-default)] rounded-lg px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-none"
                />
              </div>
            </div>

            <div className="pt-3 border-t border-[color:var(--border-subtle)] flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setPicoModalOpen(false)}
                className="px-3.5 py-1.5 text-xs text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={runPicoSynthesis}
                disabled={isSynthesizingPico || !picoInputs.population || !picoInputs.intervention || !picoInputs.outcome}
                className="px-4 py-2 text-xs font-bold rounded-full bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                {isSynthesizingPico ? (
                  <>
                    <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span>Synthesizing...</span>
                  </>
                ) : (
                  <>
                    <span>Compile Question & Title</span>
                    <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 6. AI Resources Exhausted Modal */}
      {showExhaustedModal && (
        <AllAiResourcesExhaustedModal
          isOpen={showExhaustedModal}
          onClose={() => setShowExhaustedModal(false)}
          onOpenAiSettings={() => {
            setShowExhaustedModal(false);
          }}
          reason={exhaustedReason || "All configured AI model endpoints are currently exhausted or unavailable."}
        />
      )}
    </div>
  );
}
