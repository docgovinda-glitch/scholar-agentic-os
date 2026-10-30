import React, { useState, useEffect, useMemo, useCallback } from "react";
import type { ProjectView } from "../types";
import type {
  RefereeRole,
  RefereeCritique,
  RebuttalMatrixItem,
  ManuscriptPatch,
} from "./types";
import { useResearchWorkspace } from "./ResearchContext";
import {
  saveIntakeAnswers,
  simulateFiveRefereeReview,
  generateProjectRebuttalMatrix,
} from "../api";
import { normalizeUnicodeNFC } from "../../document_intelligence/index";
import { safeParseAnswerField } from "../../shared/projectStateSchema";

export const REFEREE_PERSONAS: Array<{
  role: RefereeRole;
  title: string;
  lens: string;
  avatarIcon: string;
  description: string;
}> = [
  {
    role: "Methodologist",
    title: "Prof. H. Vance (Methodologist)",
    lens: "Methodological Rigor & Experimental Design",
    avatarIcon: "🔬",
    description: "Evaluates controls, boundary conditions, algorithmic complexity, and procedural threats to validity.",
  },
  {
    role: "Domain Specialist",
    title: "Dr. A. Thorne (Domain Specialist)",
    lens: "Domain Alignment & Literature Grounding",
    avatarIcon: "📚",
    description: "Evaluates theoretical novelty, state of the art comparison, and landmark citations.",
  },
  {
    role: "Biostatistician",
    title: "Dr. S. Chen (Biostatistician / Quantitative Analyst)",
    lens: "Quantitative Rigor & Telemetry Calibration",
    avatarIcon: "📊",
    description: "Audits statistical power, confidence intervals, sample sizes, and variance distributions.",
  },
  {
    role: "Synthesizer",
    title: "Prof. E. Sterling (Theoretical Synthesizer)",
    lens: "Cross-Source Synthesis & Validity Threats",
    avatarIcon: "🧩",
    description: "Evaluates argument coherence, contradictory evidence resolution, and claim-evidence linkage.",
  },
  {
    role: "Formal Editor",
    title: "Dr. M. Pemberton (Journal Managing Editor)",
    lens: "Scholarly Voice, Orthography & Standards Compliance",
    avatarIcon: "⚖️",
    description: "Enforces British English orthography, terminology precision, and 2026 ICMJE/COPE declarations.",
  },
];

export default function RefereeRebuttalMode() {
  const { project, projectId, setProject, setMode } = useResearchWorkspace();
  const effectiveProjectId = project?.projectId || projectId;
  const answers = useMemo(() => project?.answers || {}, [project?.answers]);

  const workingTitle = answers["working_title"] || answers["title"] || "Grounded Manuscript";
  const manuscriptText = answers["manuscript_markdown"] || answers["assembled_draft"] || "";

  // State: Critiques from the 5 Referees
  const [critiques, setCritiques] = useState<RefereeCritique[]>(() => {
    try {
      const raw = answers["peer_review_critiques"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  // State: Rebuttal Matrix Items
  const [rebuttalMatrix, setRebuttalMatrix] = useState<RebuttalMatrixItem[]>(() => {
    try {
      const raw = answers["rebuttal_matrix"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch {}
    return [];
  });

  // State: Applied Patches Set
  const [appliedPatchIds, setAppliedPatchIds] = useState<Set<string>>(() => {
    try {
      const raw = answers["applied_patch_ids"];
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed);
      }
    } catch {}
    return new Set();
  });

  // State: Running Simulation
  const [isSimulatingReview, setIsSimulatingReview] = useState(false);
  const [simulationError, setSimulationError] = useState<string | null>(null);

  // Filter state for critique lens
  const [selectedRefereeRole, setSelectedRefereeRole] = useState<string>("all");
  const [exportModalOpen, setExportModalOpen] = useState(false);
  const [copiedLetter, setCopiedLetter] = useState(false);

  // Sync state if project changes remotely
  useEffect(() => {
    if (answers["peer_review_critiques"] && critiques.length === 0) {
      const parsed = safeParseAnswerField<RefereeCritique[]>(answers["peer_review_critiques"], []);
      if (Array.isArray(parsed) && parsed.length > 0) setCritiques(parsed);
    }
    if (answers["rebuttal_matrix"] && rebuttalMatrix.length === 0) {
      const parsed = safeParseAnswerField<RebuttalMatrixItem[]>(answers["rebuttal_matrix"], []);
      if (Array.isArray(parsed) && parsed.length > 0) setRebuttalMatrix(parsed);
    }
    if (answers["applied_patch_ids"] && appliedPatchIds.size === 0) {
      const parsed = safeParseAnswerField<string[]>(answers["applied_patch_ids"], []);
      if (Array.isArray(parsed) && parsed.length > 0) setAppliedPatchIds(new Set(parsed));
    }
  }, [answers, critiques.length, rebuttalMatrix.length, appliedPatchIds.size]);

  // Run 5-Referee Simulation
  const handleSimulateReview = async () => {
    if (!effectiveProjectId) return;
    setIsSimulatingReview(true);
    setSimulationError(null);

    try {
      const res = await simulateFiveRefereeReview(effectiveProjectId);
      if (res.data && Array.isArray(res.data) && res.data.length > 0) {
        setCritiques(res.data);

        // Generate matching rebuttal matrix
        const matrixRes = await generateProjectRebuttalMatrix(effectiveProjectId, res.data);
        if (matrixRes.matrix && Array.isArray(matrixRes.matrix)) {
          setRebuttalMatrix(matrixRes.matrix);

          const nextAnswers = {
            ...answers,
            peer_review_critiques: JSON.stringify(res.data),
            rebuttal_matrix: JSON.stringify(matrixRes.matrix),
          };
          const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
          setProject(saved);
        }
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      setSimulationError(msg);
    } finally {
      setIsSimulatingReview(false);
    }
  };

  // Accept & Apply Surgical Patch directly to manuscript
  const handleAcceptAndApplyPatch = async (item: RebuttalMatrixItem) => {
    if (!effectiveProjectId || !item.diff?.find || !item.diff?.replace) return;

    const findStr = item.diff.find;
    const replaceStr = item.diff.replace;

    let updatedManuscript = manuscriptText;
    if (updatedManuscript.includes(findStr)) {
      updatedManuscript = updatedManuscript.replace(findStr, replaceStr);
    } else {
      // If exact string not found, append surgical revision note
      updatedManuscript += `\n\n<!-- Surgical Revision (§ ${item.section}): ${replaceStr} -->\n`;
    }

    updatedManuscript = normalizeUnicodeNFC(updatedManuscript);

    // Update rebuttal item status
    const updatedMatrix = rebuttalMatrix.map((m) =>
      m.id === item.id ? { ...m, status: "Accepted & Revised" as const } : m
    );
    setRebuttalMatrix(updatedMatrix);

    const nextApplied = new Set(appliedPatchIds);
    nextApplied.add(item.id);
    setAppliedPatchIds(nextApplied);

    try {
      const nextAnswers = {
        ...answers,
        manuscript_markdown: updatedManuscript,
        assembled_draft: updatedManuscript,
        full_text_markdown: updatedManuscript,
        rebuttal_matrix: JSON.stringify(updatedMatrix),
        applied_patch_ids: JSON.stringify(Array.from(nextApplied)),
      };
      const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
      setProject(saved);
    } catch (err) {
      console.warn("Failed to apply patch:", err);
    }
  };

  // Update Author Response text
  const handleUpdateAuthorResponse = (itemId: string, newResponse: string) => {
    const updated = rebuttalMatrix.map((m) =>
      m.id === itemId ? { ...m, authorResponse: newResponse } : m
    );
    setRebuttalMatrix(updated);
  };

  // Save edited rebuttal matrix
  const handlePersistRebuttal = async () => {
    if (!effectiveProjectId) return;
    try {
      const nextAnswers = {
        ...answers,
        rebuttal_matrix: JSON.stringify(rebuttalMatrix),
      };
      const saved = await saveIntakeAnswers(effectiveProjectId, nextAnswers);
      setProject(saved);
    } catch (err) {}
  };

  // Count resolved critiques
  const resolvedCount = rebuttalMatrix.filter(
    (m) => m.status === "Accepted & Revised" || appliedPatchIds.has(m.id)
  ).length;
  const totalCritiques = rebuttalMatrix.length;
  const resolutionPercentage =
    totalCritiques > 0 ? Math.round((resolvedCount / totalCritiques) * 100) : 0;

  // Filtered matrix items
  const filteredMatrix = useMemo(() => {
    if (selectedRefereeRole === "all") return rebuttalMatrix;
    return rebuttalMatrix.filter((m) => m.referee === selectedRefereeRole);
  }, [rebuttalMatrix, selectedRefereeRole]);

  // Formatted Rebuttal Letter Text for Export
  const formattedRebuttalLetter = useMemo(() => {
    let letter = `# Point-by-Point Author Response & Rebuttal Letter\n\n`;
    letter += `**Manuscript Title:** ${workingTitle}\n`;
    letter += `**Date:** ${new Date().toLocaleDateString()}\n\n`;
    letter += `Dear Editors and Reviewers,\n\nWe express our sincere gratitude to the Editorial Board and the five peer reviewers for their constructive, rigorous evaluations. Below, we address each critique point-by-point, detailing our methodological, theoretical, and textual revisions.\n\n---\n\n`;

    rebuttalMatrix.forEach((m, idx) => {
      letter += `### Reviewer Comment ${idx + 1} (${m.referee} — ${m.lens})\n`;
      letter += `**Target Section:** ${m.section}\n`;
      letter += `**Critique:** "${m.critique}"\n\n`;
      letter += `**Author Response:** ${m.authorResponse || "We concur with the reviewer's observation and have updated the manuscript accordingly."}\n\n`;
      if (m.diff?.replace) {
        letter += `**Manuscript Revision:**\n> "${m.diff.replace}"\n\n`;
      }
      letter += `**Status:** ${m.status || "Accepted & Revised"}\n\n---\n\n`;
    });

    return letter;
  }, [workingTitle, rebuttalMatrix]);

  const handleCopyRebuttalLetter = () => {
    if (typeof navigator !== "undefined" && navigator.clipboard) {
      navigator.clipboard.writeText(formattedRebuttalLetter);
      setCopiedLetter(true);
      setTimeout(() => setCopiedLetter(false), 2000);
    }
  };

  return (
    <div className="h-full flex flex-col bg-[color:var(--surface-canvas)] overflow-hidden">
      {/* MODE HEADER */}
      <div className="shrink-0 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] px-6 py-4 z-10">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="px-2 py-0.5 rounded text-[10px] font-bold uppercase tracking-wider bg-rose-600 text-white">
                Mode 4
              </span>
              <span className="text-xs font-semibold text-[color:var(--text-muted)]">
                Adversarial 5-Referee Peer Review & Surgical Rebuttal Workbench
              </span>
            </div>
            <h1 className="text-lg font-bold text-[color:var(--text-primary)]">
              Referee & Rebuttal Workbench
            </h1>
            <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
              Simulate rigorous critiques from 5 specialist academic reviewer personas. Formulate point-by-point author responses and apply surgical find/replace diffs directly to the manuscript.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            {/* Rebuttal Letter Export */}
            <button
              type="button"
              disabled={rebuttalMatrix.length === 0}
              onClick={() => setExportModalOpen(true)}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
            >
              <span>📄 Rebuttal Letter</span>
            </button>

            {/* Back to Mode 3 */}
            <button
              type="button"
              onClick={() => setMode("studio")}
              className="px-3.5 py-1.5 rounded-xl text-xs font-bold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] transition-all cursor-pointer"
            >
              ← Mode 3: Manuscript
            </button>

            {/* Proceed to Mode 5 */}
            <button
              type="button"
              onClick={() => setMode("audit_export")}
              className="px-4 py-1.5 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-all shadow-sm flex items-center gap-1.5 cursor-pointer"
            >
              <span>Proceed to Mode 5: Audit</span>
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>

      {/* WORKBENCH BODY: 2 COLUMN SPLIT */}
      <div className="flex-1 overflow-y-auto p-6 max-w-7xl mx-auto w-full space-y-8">
        {/* TOP SECTION: 5-REFEREE PANEL SIMULATOR */}
        <section
          aria-labelledby="referee-panel-heading"
          className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-4">
            <div>
              <h2 id="referee-panel-heading" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-rose-500" />
                A. 5-Referee Adversarial Peer Review Panel Simulator
              </h2>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Evaluates internal validity, quantitative power, literature novelty, synthesis coherence, and editorial standards.
              </p>
            </div>

            <button
              type="button"
              disabled={isSimulatingReview}
              onClick={handleSimulateReview}
              className="px-4 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] text-[color:var(--text-inverse)] hover:bg-[color:var(--accent-hover)] transition-all flex items-center gap-2 cursor-pointer disabled:opacity-50 shrink-0 shadow-sm"
            >
              {isSimulatingReview ? (
                <>
                  <div className="spinner w-3.5 h-3.5" />
                  <span>Simulating 5 Referees…</span>
                </>
              ) : (
                <>
                  <span>⚡ Simulate 5-Referee Adversarial Review</span>
                </>
              )}
            </button>
          </div>

          {simulationError && (
            <p className="text-xs text-rose-500 font-medium">{simulationError}</p>
          )}

          {/* 5 Persona Cards */}
          <div className="grid grid-cols-1 md:grid-cols-5 gap-3">
            {REFEREE_PERSONAS.map((p) => {
              const matchedCritique = critiques.find((c) => c.referee === p.role);
              const isSelected = selectedRefereeRole === p.role;

              return (
                <div
                  key={p.role}
                  role="button"
                  tabIndex={0}
                  onClick={() => setSelectedRefereeRole(isSelected ? "all" : p.role)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      setSelectedRefereeRole(isSelected ? "all" : p.role);
                    }
                  }}
                  className={`p-3.5 rounded-xl border text-left transition-all cursor-pointer flex flex-col justify-between ${
                    isSelected
                      ? "bg-[color:var(--surface-raised)] border-[color:var(--accent)] ring-1 ring-[color:var(--accent)]/40 shadow-xs"
                      : "bg-[color:var(--surface-sunken)]/60 border-[color:var(--border-subtle)] hover:border-[color:var(--border-control)]"
                  }`}
                >
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between">
                      <span className="text-lg">{p.avatarIcon}</span>
                      {matchedCritique ? (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 rounded uppercase tracking-wider ${
                            matchedCritique.severity === "Major"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {matchedCritique.severity}
                        </span>
                      ) : (
                        <span className="text-[9px] text-[color:var(--text-muted)] font-mono">
                          Ready
                        </span>
                      )}
                    </div>

                    <h4 className="text-xs font-bold text-[color:var(--text-primary)]">
                      {p.role}
                    </h4>
                    <p className="text-[10px] text-[color:var(--text-secondary)] font-medium line-clamp-2">
                      {p.lens}
                    </p>
                  </div>

                  <p className="text-[9px] text-[color:var(--text-muted)] mt-2 line-clamp-2">
                    {p.description}
                  </p>
                </div>
              );
            })}
          </div>
        </section>

        {/* BOTTOM SECTION: SURGICAL PATCH DIFF & POINT-BY-POINT REBUTTAL MATRIX */}
        <section
          aria-labelledby="rebuttal-matrix-heading"
          className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl p-6 shadow-xs space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-[color:var(--border-subtle)] pb-4">
            <div>
              <h2 id="rebuttal-matrix-heading" className="text-sm font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-emerald-500" />
                B. Surgical Patch Diff & Point-by-Point Rebuttal Matrix
              </h2>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Review referee concerns, formulate evidence-grounded author responses, and apply find/replace diffs directly to the manuscript.
              </p>
            </div>

            {/* Resolution Telemetry */}
            <div className="flex items-center gap-3">
              <span className="text-xs font-mono font-bold text-[color:var(--text-secondary)]">
                {resolvedCount} / {totalCritiques} Resolved ({resolutionPercentage}%)
              </span>
              <div className="w-24 h-2 bg-[color:var(--surface-sunken)] rounded-full overflow-hidden">
                <div
                  className="h-full bg-emerald-500 transition-all duration-300"
                  style={{ width: `${resolutionPercentage}%` }}
                />
              </div>
            </div>
          </div>

          {/* Filter Bar */}
          <div className="flex items-center gap-2 text-xs">
            <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider">
              Filter by Reviewer:
            </span>
            <div className="flex flex-wrap items-center gap-1">
              <button
                type="button"
                onClick={() => setSelectedRefereeRole("all")}
                className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                  selectedRefereeRole === "all"
                    ? "bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)]"
                    : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                All Personas ({rebuttalMatrix.length})
              </button>
              {REFEREE_PERSONAS.map((p) => (
                <button
                  key={p.role}
                  type="button"
                  onClick={() => setSelectedRefereeRole(p.role)}
                  className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider transition-colors cursor-pointer ${
                    selectedRefereeRole === p.role
                      ? "bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] text-[color:var(--text-primary)]"
                      : "text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  {p.role}
                </button>
              ))}
            </div>
          </div>

          {/* Rebuttal Matrix Items List */}
          {filteredMatrix.length === 0 ? (
            <div className="p-12 text-center text-xs text-[color:var(--text-muted)] border border-dashed border-[color:var(--border-control)] rounded-2xl space-y-3">
              <p>No peer critiques simulated yet. Click above to run the 5-Referee Adversarial Panel.</p>
            </div>
          ) : (
            <div className="space-y-6">
              {filteredMatrix.map((item, idx) => {
                const isResolved =
                  item.status === "Accepted & Revised" || appliedPatchIds.has(item.id);

                return (
                  <div
                    key={item.id}
                    className={`rounded-2xl border p-5 space-y-4 transition-all ${
                      isResolved
                        ? "bg-emerald-500/[0.02] border-emerald-500/30 shadow-xs"
                        : "bg-[color:var(--surface-canvas)] border-[color:var(--border-subtle)]"
                    }`}
                  >
                    {/* Item Header */}
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[color:var(--border-subtle)] pb-3">
                      <div className="flex items-center gap-2.5">
                        <span className="font-mono text-xs font-bold text-[color:var(--accent)]">
                          #{idx + 1}
                        </span>
                        <span className="text-xs font-bold text-[color:var(--text-primary)]">
                          {item.referee}
                        </span>
                        <span className="text-[10px] font-semibold text-[color:var(--text-muted)]">
                          · {item.lens}
                        </span>
                        <span className="text-[10px] font-mono text-[color:var(--text-secondary)] bg-[color:var(--surface-sunken)] px-2 py-0.5 rounded border border-[color:var(--border-subtle)]">
                          § {item.section}
                        </span>
                      </div>

                      <div className="flex items-center gap-2">
                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            item.severity === "Major"
                              ? "bg-rose-500/10 text-rose-600 dark:text-rose-400 border border-rose-500/30"
                              : "bg-amber-500/10 text-amber-600 dark:text-amber-400 border border-amber-500/30"
                          }`}
                        >
                          {item.severity}
                        </span>

                        <span
                          className={`text-[9px] font-bold px-2 py-0.5 rounded uppercase tracking-wider ${
                            isResolved
                              ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30"
                              : "bg-[color:var(--surface-sunken)] text-[color:var(--text-secondary)] border border-[color:var(--border-control)]"
                          }`}
                        >
                          {isResolved ? "✓ Resolved" : "Pending Revision"}
                        </span>
                      </div>
                    </div>

                    {/* Critique Content */}
                    <div className="p-3.5 rounded-xl bg-[color:var(--surface-sunken)]/60 border border-[color:var(--border-subtle)] space-y-1">
                      <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block">
                        Referee Critique:
                      </span>
                      <p className="text-xs text-[color:var(--text-primary)] leading-relaxed italic">
                        "{item.critique}"
                      </p>
                    </div>

                    {/* Editable Author Response */}
                    <div className="space-y-1.5">
                      <label
                        htmlFor={`author-response-${item.id}`}
                        className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block"
                      >
                        Author Response & Rebuttal Rationale:
                      </label>
                      <textarea
                        id={`author-response-${item.id}`}
                        rows={2}
                        value={item.authorResponse}
                        onChange={(e) => handleUpdateAuthorResponse(item.id, e.target.value)}
                        onBlur={handlePersistRebuttal}
                        className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl p-3 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] outline-none resize-none transition-colors"
                        placeholder="State your evidence-backed author response to this reviewer's comment..."
                      />
                    </div>

                    {/* Surgical Find/Replace Diff Patch */}
                    {item.diff && (
                      <div className="space-y-2 pt-1">
                        <span className="text-[10px] font-bold text-[color:var(--text-muted)] uppercase tracking-wider block">
                          Proposed Manuscript Surgical Patch:
                        </span>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono">
                          <div className="p-3 rounded-xl bg-rose-500/5 border border-rose-500/20 space-y-1">
                            <span className="text-[9px] font-bold text-rose-500 uppercase tracking-wider block">
                              Find (Current):
                            </span>
                            <p className="text-[color:var(--text-secondary)] whitespace-pre-wrap">
                              {item.diff.find}
                            </p>
                          </div>

                          <div className="p-3 rounded-xl bg-emerald-500/5 border border-emerald-500/20 space-y-1">
                            <span className="text-[9px] font-bold text-emerald-500 uppercase tracking-wider block">
                              Replace (Revised):
                            </span>
                            <p className="text-[color:var(--text-primary)] whitespace-pre-wrap font-semibold">
                              {item.diff.replace}
                            </p>
                          </div>
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center justify-between pt-2">
                          <span className="text-[10px] text-[color:var(--text-muted)]">
                            {item.revisionAction}
                          </span>

                          <button
                            type="button"
                            disabled={isResolved}
                            onClick={() => handleAcceptAndApplyPatch(item)}
                            className={`px-4 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs ${
                              isResolved
                                ? "bg-emerald-600/20 text-emerald-600 dark:text-emerald-400 border border-emerald-500/30 cursor-default"
                                : "bg-emerald-600 hover:bg-emerald-700 text-white"
                            }`}
                          >
                            {isResolved ? "✓ Patch Applied to Manuscript" : "Accept & Apply Patch"}
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      {/* EXPORT REBUTTAL LETTER MODAL */}
      {exportModalOpen && (
        <div className="fixed inset-0 z-50 bg-black/60 flex items-center justify-center p-4 animate-fade-in">
          <div className="bg-[color:var(--surface-canvas)] border border-[color:var(--border-subtle)] rounded-2xl max-w-3xl w-full p-6 shadow-2xl space-y-4 max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
              <div>
                <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                  Export Point-by-Point Author Rebuttal Letter
                </h3>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                  Formatted for formal journal resubmission with peer review comment mapping
                </p>
              </div>
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="text-xs font-bold text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] p-1 cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="flex-1 overflow-y-auto">
              <textarea
                readOnly
                aria-label="Formatted Author Rebuttal Letter"
                value={formattedRebuttalLetter}
                className="w-full h-80 bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-xl p-4 text-xs font-mono leading-relaxed text-[color:var(--text-primary)] outline-none resize-none"
              />
            </div>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-[color:var(--border-subtle)]">
              <button
                type="button"
                onClick={() => setExportModalOpen(false)}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-[color:var(--surface-sunken)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-control)] text-[color:var(--text-primary)] cursor-pointer"
              >
                Close
              </button>
              <button
                type="button"
                onClick={handleCopyRebuttalLetter}
                className="px-5 py-2 rounded-xl text-xs font-bold bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)] text-[color:var(--text-inverse)] cursor-pointer shadow-sm flex items-center gap-1.5"
              >
                <span>{copiedLetter ? "✓ Copied to Clipboard!" : "Copy Rebuttal Letter"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
