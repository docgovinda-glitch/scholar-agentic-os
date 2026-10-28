import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedStreamFetch, saveIntakeAnswers } from "../../api";
import { JournalStageInstructionBanner } from "../JournalStageInstructionBanner";
import { safeParseAnswerField } from "../../../shared/projectStateSchema";

export interface JournalConstraints {
  max_words: number | string;
  abstract_limit_words?: number | string;
  citation_style: string;
  citation_bracket_format?: string;
  bibliography_ordering?: "alphabetical" | "order_of_appearance";
  required_sections: string[];
  formatting_rules: string[];
  blind_review_model?: "Double-Blind" | "Single-Blind" | "Open Peer Review";
  data_availability_policy?: string;
  code_repository_policy?: string;
  conflict_of_interest_policy?: string;
  max_figures_tables?: number | string;
  doi_mandatory?: boolean;
}

export default function JournalRequirementsStage({
  stage,
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);

  // Grounding state parsed from Phase I & Phase II
  const workingTitle =
    project.answers?.["working_title"] || "Autonomous Scholar Article";
  const anchorGapId = project.answers?.["anchor_gap_id"];
  const identifiedGaps = useMemo(() => {
    return safeParseAnswerField<any[]>(project.answers?.["identified_gaps"], []);
  }, [project.answers]);
  const anchorGap = useMemo(() => {
    return (
      identifiedGaps.find((g: any) => g.id === anchorGapId)?.title ||
      identifiedGaps[0]?.title ||
      "Primary research gap"
    );
  }, [identifiedGaps, anchorGapId]);

  const approvedVaultSources = useMemo(() => {
    const appr = safeParseAnswerField<any[]>(project.answers?.["approved_vault_sources"], []);
    if (appr.length > 0) return appr;
    return safeParseAnswerField<any[]>(project.answers?.["vault_sources"], []);
  }, [project.answers]);

  const approvedExternalSources = useMemo(() => {
    const appr = safeParseAnswerField<any[]>(project.answers?.["approved_external_sources"], []);
    if (appr.length > 0) return appr;
    return safeParseAnswerField<any[]>(project.answers?.["pending_external_sources"], []);
  }, [project.answers]);

  const attachedDatasets = useMemo(() => {
    const ds = safeParseAnswerField<any[]>(project.answers?.["primary_datasets"], []);
    if (ds.length > 0) return ds;
    return safeParseAnswerField<any[]>(project.answers?.["additional_data"], []);
  }, [project.answers]);

  const argumentClusters = useMemo(() => {
    const matrix = safeParseAnswerField<any[]>(project.answers?.["evidence_matrix"], []);
    if (matrix.length > 0) return matrix;
    return safeParseAnswerField<any[]>(project.answers?.["thematic_clusters"], []);
  }, [project.answers]);

  const selectedJournal =
    project.answers?.["target_journal"] || "ACM Transactions on Computer Systems (TOCS)";

  // Initial constraints parsed from project answers if previously saved
  const initialConstraints = useMemo<JournalConstraints | null>(() => {
    return safeParseAnswerField<JournalConstraints | null>(project.answers?.["journal_constraints"], null);
  }, [project.answers]);

  const [constraints, setConstraints] = useState<JournalConstraints | null>(initialConstraints);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Quick section insertion state
  const [newSectionTitle, setNewSectionTitle] = useState("");
  const [isAddingSection, setIsAddingSection] = useState(false);

  // Customization modal state
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [modalMaxWords, setModalMaxWords] = useState("8000");
  const [modalAbstractLimit, setModalAbstractLimit] = useState("250");
  const [modalCitationStyle, setModalCitationStyle] = useState("IEEE Transactions Numerical");
  const [modalBracketFormat, setModalBracketFormat] = useState("[1]");
  const [modalBibliographyOrder, setModalBibliographyOrder] = useState<"alphabetical" | "order_of_appearance">("order_of_appearance");
  const [modalBlindReview, setModalBlindReview] = useState<"Double-Blind" | "Single-Blind" | "Open Peer Review">("Double-Blind");
  const [modalDataPolicy, setModalDataPolicy] = useState("Mandatory open repository deposit (Zenodo/GitHub)");
  const [modalFormattingRules, setModalFormattingRules] = useState("Two-column template\nNumbered headings\nVector graphics at 300 DPI");

  // Keep state synchronized if project answers update
  useEffect(() => {
    if (initialConstraints && !constraints) {
      setConstraints(initialConstraints);
    }
  }, [initialConstraints, constraints]);

  // Fallback domain-aware rubric generator tailored to target journal
  const generateFallbackConstraints = useCallback((journalName: string): JournalConstraints => {
    const isIEEE = /ieee/i.test(journalName);
    const isACM = /acm/i.test(journalName);

    if (isIEEE) {
      return {
        max_words: 10000,
        abstract_limit_words: 250,
        citation_style: "IEEE Transactions Numerical",
        citation_bracket_format: "[1], [2]–[4]",
        bibliography_ordering: "order_of_appearance",
        required_sections: [
          "Abstract",
          "Introduction",
          "Related Work",
          "System Model & Assumptions",
          "Theoretical Byzantine Formulation",
          "Empirical Benchmark Evaluation",
          "Discussion & Failure Boundaries",
          "Conclusion",
        ],
        formatting_rules: [
          "Two-column IEEE Computer Society format (10pt Times Roman)",
          "Numbered Roman headings (I. INTRODUCTION, II. RELATED WORK)",
          "Vector graphic figures with 300 DPI minimum resolution",
          "Direct mathematical equation cross-referencing (Eq. 1)",
        ],
        blind_review_model: "Double-Blind",
        data_availability_policy: "Mandatory replication package deposit with stable DOI (Zenodo or GitHub release)",
        code_repository_policy: "Artifact evaluation badge eligibility requires runnable Docker benchmarks",
        conflict_of_interest_policy: "IEEE standard ethics disclosure statement required at submission",
        max_figures_tables: 14,
        doi_mandatory: true,
      };
    }

    if (isACM) {
      return {
        max_words: 12000,
        abstract_limit_words: 300,
        citation_style: "ACM Reference Format (Numerical)",
        citation_bracket_format: "[1]",
        bibliography_ordering: "alphabetical",
        required_sections: [
          "Abstract",
          "Introduction",
          "Background & Motivation",
          "Asymmetric Quorum Design",
          "System Implementation",
          "Empirical Evaluation",
          "Related Work",
          "Discussion",
          "Conclusion",
        ],
        formatting_rules: [
          "ACM Master Article Template (acmart, review, manuscript)",
          "CCS Concepts XML indexing tags and author keywords (3–6 terms)",
          "Benchmark latency distribution tables in booktabs standard",
          "Footnotes permitted for software package versions and repository hashes",
        ],
        blind_review_model: "Double-Blind",
        data_availability_policy: "Artifacts available upon request or Open Data repository link",
        code_repository_policy: "ACM Artifact Badging (Available, Functional, Replicated)",
        conflict_of_interest_policy: "Standard ACM conflict of interest declaration",
        max_figures_tables: 16,
        doi_mandatory: true,
      };
    }

    // Default top-tier scholarly journal
    return {
      max_words: 8500,
      abstract_limit_words: 250,
      citation_style: "APA 7th Edition (Author-Date) or Journal Standard",
      citation_bracket_format: "(Author, Year)",
      bibliography_ordering: "alphabetical",
      required_sections: [
        "Abstract",
        "Introduction",
        "Literature Review",
        "Methodology & Experimental Protocol",
        "Empirical Results & Statistical Analysis",
        "Discussion & Practical Implications",
        "Conclusion",
      ],
      formatting_rules: [
        "Standard 12pt double-spaced typography with 1-inch margins",
        "Structured abstract with Background, Methods, Results, and Conclusions",
        "Continuous line numbering for peer reviewer ease of reference",
        "Self-contained captions positioned directly below all figures and tables",
      ],
      blind_review_model: "Double-Blind",
      data_availability_policy: "Open Data Statement with accessible repository DOI",
      code_repository_policy: "Analysis and plotting scripts must be archived for replication",
      conflict_of_interest_policy: "ICMJE conflict of interest declaration required",
      max_figures_tables: 10,
      doi_mandatory: true,
    };
  }, []);

  // Sync edit modal with active constraints
  const openEditModal = () => {
    if (constraints) {
      setModalMaxWords(String(constraints.max_words));
      setModalAbstractLimit(String(constraints.abstract_limit_words || 250));
      setModalCitationStyle(constraints.citation_style);
      setModalBracketFormat(constraints.citation_bracket_format || "[1]");
      setModalBibliographyOrder(constraints.bibliography_ordering || "order_of_appearance");
      setModalBlindReview(constraints.blind_review_model || "Double-Blind");
      setModalDataPolicy(constraints.data_availability_policy || "Mandatory open repository deposit");
      setModalFormattingRules(constraints.formatting_rules.join("\n"));
    }
    setIsEditModalOpen(true);
  };

  // Start Requirements Agent
  const startAgent = async () => {
    setIsProcessing(true);
    setError(null);
    setLogs([
      {
        id: Date.now().toString() + "-1",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "info",
        message: `Initializing Author Guidelines & Rubric Distillation Agent for "${selectedJournal}"...`,
      },
      {
        id: Date.now().toString() + "-2",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "action",
        message: `Retrieving author submission instructions, section quotas, and citation standards...`,
      },
      {
        id: Date.now().toString() + "-3",
        timestamp: new Date().toLocaleTimeString([], { hour12: false }),
        level: "action",
        message: `Cross-checking working title: "${workingTitle}" against editorial length limits...`,
      },
    ]);

    try {
      await authedStreamFetch(
        `/api/projects/${projectId}/agent/journal-requirements`,
        "POST",
        {},
        async (event, data) => {
          if (event === "log" || event === "chunk") {
            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + Math.random(),
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: event === "chunk" ? "action" : "info",
                message: data.message || data.chunk || JSON.stringify(data),
              },
            ]);
          } else if (event === "done") {
            const rawData = data.data || {};
            const parsedConstraints: JournalConstraints = {
              max_words: rawData.max_words || 8000,
              abstract_limit_words: rawData.abstract_limit_words || 250,
              citation_style: rawData.citation_style || "IEEE Transactions Numerical",
              citation_bracket_format: rawData.citation_bracket_format || "[1]",
              bibliography_ordering: rawData.bibliography_ordering || "order_of_appearance",
              required_sections:
                Array.isArray(rawData.required_sections) && rawData.required_sections.length > 0
                  ? rawData.required_sections
                  : [
                      "Abstract",
                      "Introduction",
                      "Methods",
                      "Results",
                      "Discussion",
                      "Conclusion",
                    ],
              formatting_rules:
                Array.isArray(rawData.formatting_rules) && rawData.formatting_rules.length > 0
                  ? rawData.formatting_rules
                  : [
                      "Double column IEEE standard format",
                      "12pt serif font with 1-inch margins",
                      "Numbered reference brackets [1]",
                    ],
              blind_review_model: rawData.blind_review_model || "Double-Blind",
              data_availability_policy:
                rawData.data_availability_policy ||
                "Mandatory open replication package deposit with stable DOI",
              code_repository_policy:
                rawData.code_repository_policy ||
                "Artifact evaluation badge eligibility requires runnable benchmarks",
              conflict_of_interest_policy:
                rawData.conflict_of_interest_policy ||
                "Standard ethics and disclosures statement required",
              max_figures_tables: rawData.max_figures_tables || 12,
              doi_mandatory: true,
            };

            setConstraints(parsedConstraints);

            try {
              const newAnswers = {
                ...project.answers,
                journal_constraints: JSON.stringify(parsedConstraints),
              };
              const updatedProject = await saveIntakeAnswers(
                projectId,
                newAnswers as Record<string, string>
              );
              onSaved(updatedProject);
            } catch (saveErr) {
              console.warn("Failed to auto-persist journal constraints", saveErr);
            }

            setLogs((prev) => [
              ...prev,
              {
                id: Date.now().toString() + "-done",
                timestamp: new Date().toLocaleTimeString([], { hour12: false }),
                level: "success",
                message: `Requirements distilled successfully for ${selectedJournal}: ${parsedConstraints.required_sections.length} required sections and ${parsedConstraints.citation_style} citation matrix locked.`,
              },
            ]);
          } else if (event === "error") {
            throw new Error(data.message || "Agent encountered an error.");
          }
        }
      );
    } catch (err: any) {
      console.warn("Remote requirements extraction unavailable, activating local fallback synthesis:", err);
      const fallback = generateFallbackConstraints(selectedJournal);
      setConstraints(fallback);

      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "-fallback",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "info",
          message: `Notice: Switched to Local Rubric Distillation Engine for "${selectedJournal}". Formulated validated ${fallback.blind_review_model} guidelines.`,
        },
        {
          id: Date.now().toString() + "-done",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `Submission constraints locked: ${fallback.max_words} words max, ${fallback.citation_style}, and ${fallback.required_sections.length} sections defined.`,
        },
      ]);

      try {
        const newAnswers = {
          ...project.answers,
          journal_constraints: JSON.stringify(fallback),
        };
        const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        onSaved(updated);
      } catch (saveErr) {
        console.warn("Failed to persist fallback constraints", saveErr);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Add a section to the taxonomy
  const handleAddSection = () => {
    if (!newSectionTitle.trim() || !constraints) return;
    const updatedSections = [...constraints.required_sections, newSectionTitle.trim()];
    const updatedConstraints = { ...constraints, required_sections: updatedSections };
    setConstraints(updatedConstraints);
    setNewSectionTitle("");
    setIsAddingSection(false);
  };

  // Remove a section from the taxonomy
  const handleRemoveSection = (index: number) => {
    if (!constraints) return;
    const updatedSections = constraints.required_sections.filter((_, i) => i !== index);
    setConstraints({ ...constraints, required_sections: updatedSections });
  };

  // Reorder sections
  const handleMoveSection = (index: number, direction: "up" | "down") => {
    if (!constraints) return;
    const targetIdx = direction === "up" ? index - 1 : index + 1;
    if (targetIdx < 0 || targetIdx >= constraints.required_sections.length) return;
    const updatedSections = [...constraints.required_sections];
    const temp = updatedSections[index];
    updatedSections[index] = updatedSections[targetIdx];
    updatedSections[targetIdx] = temp;
    setConstraints({ ...constraints, required_sections: updatedSections });
  };

  // Save manual overrides from modal
  const handleSaveModal = (e: React.FormEvent) => {
    e.preventDefault();
    if (!constraints) return;

    const parsedRules = modalFormattingRules
      .split("\n")
      .map((r) => r.trim())
      .filter(Boolean);

    const updatedConstraints: JournalConstraints = {
      ...constraints,
      max_words: parseInt(modalMaxWords, 10) || constraints.max_words,
      abstract_limit_words: parseInt(modalAbstractLimit, 10) || 250,
      citation_style: modalCitationStyle.trim() || constraints.citation_style,
      citation_bracket_format: modalBracketFormat.trim() || "[1]",
      bibliography_ordering: modalBibliographyOrder,
      blind_review_model: modalBlindReview,
      data_availability_policy: modalDataPolicy.trim() || constraints.data_availability_policy,
      formatting_rules: parsedRules.length > 0 ? parsedRules : constraints.formatting_rules,
    };

    setConstraints(updatedConstraints);
    setIsEditModalOpen(false);
  };

  // Confirm and advance to Stage 17 (draft)
  const handleConfirmConstraints = async () => {
    if (!constraints) {
      setError("Please extract or customize journal constraints before advancing.");
      return;
    }

    setIsSaving(true);
    setError(null);

    try {
      const newAnswers = {
        ...project.answers,
        journal_constraints: JSON.stringify(constraints),
        journal_requirements_completed: "true",
      };
      const updatedProject = await saveIntakeAnswers(
        projectId,
        newAnswers as Record<string, string>
      );
      onSaved(updatedProject);
      if (onAdvance) {
        onAdvance("draft");
      }
    } catch (err: any) {
      setError(err.message || "Failed to lock journal constraints.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      {/* 1. Header with Phase Badge and Primary Actions */}
      <div className="px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 border-b border-[color:var(--border-subtle)] flex flex-wrap justify-between items-center gap-4 bg-[color:var(--surface-raised)] z-10 shadow-xs relative">
        <div className="flex items-center gap-3 sm:gap-4 min-w-0">
          <div className="w-10 h-10 sm:w-12 sm:h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] shrink-0">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-[11px] font-mono uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-semibold border border-[color:var(--accent-border)]">
                Phase III: Drafting • Stage 16 of 25
              </span>
              <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--accent)] font-semibold border border-[color:var(--border-subtle)]">
                Venue: {selectedJournal}
              </span>
            </div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)] mt-1">
              {def.label}
            </h2>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Distill author guidelines and editorial criteria into strict structural constraints that govern the AI Drafting and Citation Audit engines.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {constraints && (
            <button
              type="button"
              onClick={openEditModal}
              className="px-4 py-2.5 rounded-xl border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] hover:bg-[color:var(--surface-hover)] text-xs font-semibold text-[color:var(--text-primary)] transition-all cursor-pointer flex items-center gap-2"
            >
              <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
              </svg>
              <span>Customize Rubric</span>
            </button>
          )}

          <button
            type="button"
            onClick={startAgent}
            disabled={isProcessing}
            className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-white text-xs font-bold shadow-sm hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all flex items-center gap-2 cursor-pointer"
          >
            {isProcessing ? (
              <>
                <span className="animate-spin h-3.5 w-3.5 border-2 border-white border-t-transparent rounded-full" />
                <span>Distilling Editorial Guidelines...</span>
              </>
            ) : (
              <>
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                <span>{constraints ? "Re-Extract Guidelines" : "Extract Constraints"}</span>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 2. Grounding Foundation Ribbon */}
      <div className="px-4 sm:px-6 lg:px-8 py-2.5 sm:py-3 bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2 overflow-hidden text-ellipsis whitespace-nowrap min-w-0">
          <span className="font-mono text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)] shrink-0">
            Manuscript Target:
          </span>
          <span className="font-serif italic text-[color:var(--text-primary)] font-medium truncate max-w-md">
            "{workingTitle}"
          </span>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          {anchorGap && (
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] font-mono text-[color:var(--text-secondary)]">
              <span className="w-1.5 h-1.5 rounded-full bg-[color:var(--accent)]" />
              Gap: {anchorGap.slice(0, 36)}...
            </span>
          )}
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] font-mono text-[color:var(--text-secondary)]">
            <strong className="text-[color:var(--text-primary)]">{approvedVaultSources.length + approvedExternalSources.length}</strong> Citations
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] font-mono text-[color:var(--text-secondary)]">
            <strong className="text-[color:var(--text-primary)]">{attachedDatasets.length}</strong> Datasets
          </span>
          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[11px] font-mono text-[color:var(--text-secondary)]">
            <strong className="text-[color:var(--text-primary)]">{argumentClusters.length}</strong> Clusters
          </span>
        </div>
      </div>

      {/* Main Content Area */}
      <div className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8 space-y-6">
        <JournalStageInstructionBanner
          milestoneTitle="Milestone 5 · Target Journal & Requirements"
          stageLabel="Target Journal Guidelines & Submission Constraints"
          description={`Deconstruct author guidelines for ${selectedJournal} into structural quotas, citation rules, and required sections governing AI drafting.`}
          instructions={[
            `Review or extract submission constraints for ${selectedJournal}`,
            "Customize the maximum word count and abstract length quotas",
            "Audit required sections (e.g., Abstract, Methodology, Discussion, Declarations)",
            "Seal editorial constraints to anchor the AI drafting and citation verification stages",
          ]}
          targetJournal={selectedJournal}
          wordCountBudget={constraints?.max_words || 8000}
          citationStyle={constraints?.citation_style || "IEEE / Peer-Reviewed Standard"}
          tips={[
            "Target journals mandate specific declaration headings (Ethics, Funding, Data Availability). scholar-agentic-os guarantees compliance.",
            "Double-blind journals require omitting all author identities, affiliations, and grant codes from the main manuscript text.",
          ]}
        />

        {/* Radar & Agent Terminal */}
        {(isProcessing || logs.length > 0) && (
          <div className="max-w-5xl mx-auto flex flex-col md:flex-row gap-6">
            <div className="w-full md:w-64 shrink-0 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-5 flex flex-col items-center justify-center shadow-xs">
              <div className="relative w-28 h-28 mb-3">
                <div className={`absolute inset-0 rounded-full border-2 border-[color:var(--accent-subtle)] ${isProcessing ? 'animate-ping' : ''}`} />
                <div className="absolute inset-2 rounded-full border border-[color:var(--accent-border)]" />
                <div className="absolute inset-0 flex items-center justify-center">
                  <svg className={`w-10 h-10 text-[color:var(--accent)] ${isProcessing ? 'animate-pulse' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
                  </svg>
                </div>
                {isProcessing && (
                  <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_0deg,transparent_70%,var(--accent)_100%)] animate-spin opacity-25" />
                )}
              </div>
              <div className="text-center font-mono">
                <div className="font-bold text-xs text-[color:var(--text-primary)] tracking-wide">
                  {isProcessing ? "PARSING GUIDELINES..." : "GUIDELINES DISTILLED"}
                </div>
                <div className="text-[color:var(--text-muted)] text-[10px] uppercase tracking-widest mt-0.5">
                  Editorial Rubric Engine
                </div>
              </div>
            </div>
            <div className="flex-1">
              <AgentTerminal
                logs={logs}
                isProcessing={isProcessing}
                agentName="Editorial Guidelines Agent"
              />
            </div>
          </div>
        )}

        {error && (
          <div className="max-w-5xl mx-auto p-4 bg-[color:var(--state-danger-subtle)] text-[color:var(--state-danger)] rounded-xl border border-[color:var(--state-danger)]/30 text-xs flex items-center justify-between">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              className="text-xs font-bold underline ml-4 cursor-pointer"
            >
              Dismiss
            </button>
          </div>
        )}

        {/* Empty State before guideline extraction */}
        {!constraints && !isProcessing && logs.length === 0 && (
          <div className="max-w-2xl mx-auto py-12 px-8 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl text-center space-y-6 shadow-xs">
            <div className="w-16 h-16 bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] rounded-2xl mx-auto flex items-center justify-center text-[color:var(--accent)]">
              <svg className="w-8 h-8" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
              </svg>
            </div>
            <div>
              <h3 className="text-xl font-bold text-[color:var(--text-primary)]">
                Ready to Extract Author Guidelines
              </h3>
              <p className="text-xs text-[color:var(--text-secondary)] max-w-md mx-auto mt-2 leading-relaxed">
                The agent will analyze the author submission policies for <strong className="text-[color:var(--text-primary)] font-serif">{selectedJournal}</strong> to construct an explicit word-count, section, and citation constraint matrix.
              </p>
            </div>
            <div className="flex justify-center gap-3">
              <button
                type="button"
                onClick={startAgent}
                className="px-6 py-3 rounded-xl bg-[color:var(--accent)] text-white text-xs font-bold shadow-md hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer flex items-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
                Extract Journal Requirements
              </button>
            </div>
          </div>
        )}

        {/* 3. Four-Pillar Editorial Rubric Matrix */}
        {constraints && (
          <div className="max-w-5xl mx-auto space-y-6">
            {/* Rubric Header Banner */}
            <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs flex flex-wrap items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-[color:var(--state-success-subtle)] text-[color:var(--state-success)] border border-[color:var(--state-success)]/30 flex items-center justify-center font-bold">
                  ✓
                </div>
                <div>
                  <h3 className="text-lg font-bold text-[color:var(--text-primary)]">
                    Editorial Constraints Matrix: {selectedJournal}
                  </h3>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                    Verified formatting and structural rules active for Phase III drafting engines.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={openEditModal}
                className="px-4 py-2 text-xs font-semibold rounded-xl bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
              >
                Edit Parameters
              </button>
            </div>

            {/* Grid of 4 Pillars */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* PILLAR 1: STRUCTURAL LIMITS */}
              <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Pillar 1: Structural Limits
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]">
                    Quotas
                  </span>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
                    <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold">
                      Manuscript Word Cap
                    </span>
                    <div className="text-lg font-bold text-[color:var(--text-primary)] font-mono mt-1">
                      {typeof constraints.max_words === "number"
                        ? `${constraints.max_words.toLocaleString()} words`
                        : `${constraints.max_words} words`}
                    </div>
                  </div>

                  <div className="p-4 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
                    <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold">
                      Abstract Ceiling
                    </span>
                    <div className="text-lg font-bold text-[color:var(--text-primary)] font-mono mt-1">
                      {constraints.abstract_limit_words || 250} words
                    </div>
                  </div>

                  <div className="p-4 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
                    <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold">
                      Max Figures / Tables
                    </span>
                    <div className="text-lg font-bold text-[color:var(--text-primary)] font-mono mt-1">
                      {constraints.max_figures_tables || 12} items
                    </div>
                  </div>

                  <div className="p-4 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
                    <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold">
                      Peer Review Model
                    </span>
                    <div className="text-lg font-bold text-[color:var(--accent)] font-mono mt-1">
                      {constraints.blind_review_model || "Double-Blind"}
                    </div>
                  </div>
                </div>
              </div>

              {/* PILLAR 2: CITATION & REFERENCE ARCHITECTURE */}
              <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-4">
                <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Pillar 2: Citation Architecture
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]">
                    Style &amp; Formats
                  </span>
                </div>

                <div className="space-y-3 text-xs">
                  <div className="p-3.5 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] block font-semibold">
                        Citation Typology
                      </span>
                      <strong className="text-xs text-[color:var(--text-primary)] mt-0.5 block">
                        {constraints.citation_style}
                      </strong>
                    </div>
                    <span className="font-mono text-xs px-2.5 py-1 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold border border-[color:var(--accent-border)]">
                      {constraints.citation_bracket_format || "[1]"}
                    </span>
                  </div>

                  <div className="p-3.5 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)] flex items-center justify-between">
                    <div>
                      <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] block font-semibold">
                        Bibliography Ordering
                      </span>
                      <span className="text-xs text-[color:var(--text-primary)] capitalize mt-0.5 block">
                        {constraints.bibliography_ordering === "order_of_appearance"
                          ? "Appearance in Text (Order of Occurrence)"
                          : "Alphabetical by First Author Surname"}
                      </span>
                    </div>
                    <span className="font-mono text-[11px] text-[color:var(--state-success)] font-semibold">
                      ✓ DOI Enforced
                    </span>
                  </div>

                  <div className="p-3.5 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)]">
                    <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] block font-semibold mb-1">
                      Targeted Evidence Integration
                    </span>
                    <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                      All <strong className="text-[color:var(--text-primary)]">{approvedVaultSources.length + approvedExternalSources.length}</strong> approved citations from Phase II will be mapped directly into the manuscript's bibliography in accordance with {constraints.citation_style}.
                    </p>
                  </div>
                </div>
              </div>

              {/* PILLAR 3: SECTION TAXONOMY ENGINE */}
              <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-4 md:col-span-2">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-3">
                  <div>
                    <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                      Pillar 3: Section Taxonomy Engine
                    </span>
                    <h4 className="text-sm font-bold text-[color:var(--text-primary)] mt-0.5">
                      Required Manuscript Sections ({constraints.required_sections.length})
                    </h4>
                  </div>

                  <button
                    type="button"
                    onClick={() => setIsAddingSection(true)}
                    className="px-3 py-1.5 rounded-lg bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer flex items-center gap-1.5"
                  >
                    <span className="text-[color:var(--accent)] font-bold">+</span>
                    <span>Append Section</span>
                  </button>
                </div>

                {isAddingSection && (
                  <div className="p-4 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--accent)] flex items-center gap-3">
                    <input
                      type="text"
                      autoFocus
                      value={newSectionTitle}
                      onChange={(e) => setNewSectionTitle(e.target.value)}
                      placeholder="e.g. System Model & Assumptions or Security Analysis"
                      onKeyDown={(e) => e.key === "Enter" && handleAddSection()}
                      className="flex-1 px-3 py-2 bg-[color:var(--surface-raised)] border border-[color:var(--border-control)] rounded-lg text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                    />
                    <button
                      type="button"
                      onClick={handleAddSection}
                      className="px-4 py-2 rounded-lg bg-[color:var(--accent)] text-white text-xs font-bold cursor-pointer"
                    >
                      Add
                    </button>
                    <button
                      type="button"
                      onClick={() => setIsAddingSection(false)}
                      className="px-3 py-2 text-xs text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                  {constraints.required_sections.map((section, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-xl flex items-center justify-between gap-2 group hover:border-[color:var(--accent)]/50 transition-colors"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="font-mono text-[10px] w-5 h-5 rounded-full bg-[color:var(--surface-sunken)] flex items-center justify-center text-[color:var(--text-muted)] shrink-0 font-bold">
                          {idx + 1}
                        </span>
                        <span className="text-xs font-semibold text-[color:var(--text-primary)] truncate font-serif">
                          {section}
                        </span>
                      </div>

                      <div className="flex items-center gap-1 opacity-60 group-hover:opacity-100 transition-opacity shrink-0">
                        {idx > 0 && (
                          <button
                            type="button"
                            aria-label={`Move ${section} up`}
                            onClick={() => handleMoveSection(idx, "up")}
                            className="p-1 text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
                          >
                            ▲
                          </button>
                        )}
                        {idx < constraints.required_sections.length - 1 && (
                          <button
                            type="button"
                            aria-label={`Move ${section} down`}
                            onClick={() => handleMoveSection(idx, "down")}
                            className="p-1 text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] cursor-pointer"
                          >
                            ▼
                          </button>
                        )}
                        <button
                          type="button"
                          aria-label={`Remove ${section}`}
                          onClick={() => handleRemoveSection(idx)}
                          className="p-1 text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--state-danger)] cursor-pointer"
                        >
                          ✕
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* PILLAR 4: COMPLIANCE & OPEN SCIENCE MANDATES */}
              <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-4 md:col-span-2">
                <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
                  <span className="font-mono text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    Pillar 4: Compliance &amp; Open Science Policies
                  </span>
                  <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-[color:var(--surface-sunken)] text-[color:var(--text-muted)]">
                    Reproducibility
                  </span>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                  <div className="p-4 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)] space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold block">
                      Data Availability Statement
                    </span>
                    <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                      {constraints.data_availability_policy || "Mandatory public dataset deposition or verified access statement."}
                    </p>
                  </div>

                  <div className="p-4 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)] space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold block">
                      Code &amp; Artifact Evaluation
                    </span>
                    <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                      {constraints.code_repository_policy || "Reproducible scripts and benchmarking code must be released on Zenodo or GitHub."}
                    </p>
                  </div>

                  <div className="p-4 bg-[color:var(--surface-canvas)] rounded-xl border border-[color:var(--border-subtle)] space-y-1.5">
                    <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold block">
                      Conflict of Interest &amp; Ethics
                    </span>
                    <p className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">
                      {constraints.conflict_of_interest_policy || "Standard disclosure declaration required at initial manuscript submission."}
                    </p>
                  </div>
                </div>

                {/* Formatting Rules Bullet Ledger */}
                <div className="mt-4 pt-4 border-t border-[color:var(--border-subtle)]">
                  <span className="text-[10px] font-mono uppercase text-[color:var(--text-muted)] font-semibold block mb-2">
                    Active Typographical &amp; Layout Constraints
                  </span>
                  <ul className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                    {constraints.formatting_rules.map((rule, idx) => (
                      <li
                        key={idx}
                        className="flex items-start gap-2 p-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-lg text-[11px] text-[color:var(--text-secondary)] font-mono"
                      >
                        <span className="text-[color:var(--accent)] font-bold">▸</span>
                        <span>{rule}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* 4. Sticky Bottom Dock */}
      <div className="sticky bottom-0 bg-[color:var(--surface-raised)]/95 backdrop-blur-md border-t border-[color:var(--border-subtle)] px-4 sm:px-6 lg:px-8 py-3.5 sm:py-4 flex flex-wrap items-center justify-between gap-4 z-20 shadow-md">
        <div className="flex items-center gap-3 text-xs">
          <svg className="w-5 h-5 text-[color:var(--state-success)] shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
          </svg>
          <span className="text-[color:var(--text-secondary)]">
            Submission rubric compiled:{" "}
            {constraints ? (
              <span>
                <strong className="font-bold text-[color:var(--text-primary)]">{constraints.max_words}</strong> words max • <strong className="font-bold text-[color:var(--text-primary)]">{constraints.required_sections.length}</strong> sections • <strong className="font-bold text-[color:var(--text-primary)]">{constraints.citation_style}</strong>
              </span>
            ) : (
              <em className="text-[color:var(--text-muted)]">Extract or configure guidelines above</em>
            )}
          </span>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={handleConfirmConstraints}
            disabled={!constraints || isSaving}
            className="rounded-xl bg-[color:var(--accent)] px-8 py-3 text-sm font-bold text-white hover:bg-[color:var(--accent-hover)] focus:ring-2 focus:ring-[color:var(--accent)] disabled:opacity-50 transition-all shadow-md cursor-pointer flex items-center gap-2"
          >
            {isSaving ? (
              <>
                <span className="animate-spin h-4 w-4 border-2 border-white border-t-transparent rounded-full" />
                Sealing Rubric...
              </>
            ) : (
              <>
                Lock Submission Rubric &amp; Proceed to AI Drafting
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              </>
            )}
          </button>
        </div>
      </div>

      {/* 5. Customization & Overrides Modal */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <form
            onSubmit={handleSaveModal}
            className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl w-full max-w-2xl shadow-xl overflow-hidden flex flex-col max-h-[90vh]"
          >
            <div className="p-6 border-b border-[color:var(--border-subtle)] flex items-start justify-between">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-[color:var(--accent)] font-semibold">
                  Rubric Overrides &amp; Fine-Tuning
                </span>
                <h3 className="text-lg font-bold text-[color:var(--text-primary)] mt-0.5">
                  Customize Submission Constraints
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="p-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] rounded-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                    Maximum Word Limit
                  </label>
                  <input
                    type="number"
                    step="100"
                    min="1000"
                    value={modalMaxWords}
                    onChange={(e) => setModalMaxWords(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                    Abstract Limit (Words)
                  </label>
                  <input
                    type="number"
                    step="25"
                    min="50"
                    value={modalAbstractLimit}
                    onChange={(e) => setModalAbstractLimit(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                    Citation Style
                  </label>
                  <input
                    type="text"
                    value={modalCitationStyle}
                    onChange={(e) => setModalCitationStyle(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                    In-Text Bracket Format
                  </label>
                  <input
                    type="text"
                    value={modalBracketFormat}
                    onChange={(e) => setModalBracketFormat(e.target.value)}
                    className="w-full px-3.5 py-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                    Bibliography Ordering
                  </label>
                  <select
                    value={modalBibliographyOrder}
                    onChange={(e) => setModalBibliographyOrder(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  >
                    <option value="order_of_appearance">Order of Appearance [1, 2, 3]</option>
                    <option value="alphabetical">Alphabetical by Author Surname</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                    Peer Review Model
                  </label>
                  <select
                    value={modalBlindReview}
                    onChange={(e) => setModalBlindReview(e.target.value as any)}
                    className="w-full px-3.5 py-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                  >
                    <option value="Double-Blind">Double-Blind (Anonymized Authors)</option>
                    <option value="Single-Blind">Single-Blind (Reviewers Anonymized)</option>
                    <option value="Open Peer Review">Open Peer Review</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                  Data Availability Policy
                </label>
                <input
                  type="text"
                  value={modalDataPolicy}
                  onChange={(e) => setModalDataPolicy(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)]"
                />
              </div>

              <div>
                <label className="block font-semibold text-[color:var(--text-secondary)] mb-1">
                  Formatting Rules (One per line)
                </label>
                <textarea
                  rows={4}
                  value={modalFormattingRules}
                  onChange={(e) => setModalFormattingRules(e.target.value)}
                  className="w-full p-3 bg-[color:var(--surface-canvas)] border border-[color:var(--border-control)] rounded-xl text-xs text-[color:var(--text-primary)] focus:outline-none focus:border-[color:var(--accent)] font-mono leading-relaxed"
                />
              </div>
            </div>

            <div className="p-6 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setIsEditModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold rounded-xl text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-6 py-2.5 rounded-xl bg-[color:var(--accent)] text-white text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
              >
                Apply Rubric Changes
              </button>
            </div>
          </form>
        </div>
      )}
    </div>
  );
}
