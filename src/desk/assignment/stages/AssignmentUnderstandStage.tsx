import React, { useState } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import {
  type AcademicLevel,
  type AssignmentType,
  type AssignmentAnalysis,
  ASSIGNMENT_TYPE_LABELS,
  COMMON_COMMAND_VERBS,
} from "../types";

const CITATION_STYLES = [
  { id: "apa7", name: "APA 7th Edition (Author, Year)" },
  { id: "harvard", name: "Harvard Referencing (Author, Year)" },
  { id: "mla9", name: "MLA 9th Edition (Author, Page)" },
  { id: "chicago", name: "Chicago Manual of Style (Notes & Bibliography)" },
  { id: "ieee", name: "IEEE (Numbered [1])" },
  { id: "vancouver", name: "Vancouver (Numbered in-text)" },
];

export default function AssignmentUnderstandStage() {
  const {
    projectId,
    question,
    academicLevel,
    assignmentType,
    targetWordCount,
    citationStyle,
    assignmentBriefText,
    analysis,
    setAnalysis,
    saveAnswers,
    advanceStage,
    project,
  } = useAssignmentWorkspace();

  const [localQuestion, setLocalQuestion] = useState(question);
  const [localLevel, setLocalLevel] = useState<AcademicLevel>(academicLevel);
  const [localType, setLocalType] = useState<AssignmentType>(assignmentType);
  const [localWordCount, setLocalWordCount] = useState(targetWordCount || 2000);
  const [localCitation, setLocalCitation] = useState(citationStyle || "apa7");
  const [localBrief, setLocalBrief] = useState(assignmentBriefText);
  const [course, setCourse] = useState(project?.answers["course_name"] || "");
  const [institution, setInstitution] = useState(project?.answers["institution"] || "");
  const [deadline, setDeadline] = useState(project?.answers["deadline"] || "");
  const [rubricText, setRubricText] = useState(project?.answers["marking_rubric"] || "");
  const [showAdditional, setShowAdditional] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingBrief, setUploadingBrief] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [userFeedback, setUserFeedback] = useState("");

  // Validation
  const canAnalyze =
    localQuestion.trim().length >= 10 &&
    localWordCount > 0 &&
    Boolean(localCitation) &&
    Boolean(localLevel) &&
    Boolean(localType);

  const handleAnalyze = async () => {
    if (!canAnalyze || isAnalyzing) return;
    setIsAnalyzing(true);
    setAnalysisError(null);

    // Save inputs first
    await saveAnswers({
      assignment_question: localQuestion,
      academic_level: localLevel,
      assignment_type: localType,
      word_count: localWordCount,
      word_limit: localWordCount,
      citation_style: localCitation,
      assignment_brief_text: localBrief,
      course_name: course,
      institution,
      deadline,
      marking_rubric: rubricText,
    });

    try {
      const response = await fetch(`/api/projects/${projectId}/assignment/analyze`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          question: localQuestion,
          assignmentType: localType,
          academicLevel: localLevel,
          targetWordCount: localWordCount,
          citationStyle: localCitation,
          briefText: localBrief,
          rubricText,
        }),
      });

      if (!response.ok) throw new Error("Failed to analyze assignment");
      const data: AssignmentAnalysis = await response.json();
      await setAnalysis(data);
    } catch (err: any) {
      setAnalysisError(err.message || "Analysis failed");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleApproveAnalysis = async () => {
    if (!analysis) return;
    const updated: AssignmentAnalysis = {
      ...analysis,
      approvedByUser: true,
      userFeedback: userFeedback.trim() || undefined,
    };
    await setAnalysis(updated);
    advanceStage("plan");
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingBrief(true);
    setAnalysisError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const res = await fetch(`/api/projects/${projectId}/parse-file`, {
        method: "POST",
        body: formData,
      });
      if (!res.ok) throw new Error("Failed to parse brief file");
      const data = await res.json();
      const extractedText = data.text || "";
      setLocalBrief((prev) => (prev ? `${prev}\n\n${extractedText}` : extractedText));
      if (!localQuestion && extractedText.length > 20) {
        setLocalQuestion(extractedText.slice(0, 300));
      }
    } catch (err: any) {
      setAnalysisError(err.message || "Failed to parse brief file");
    } finally {
      setUploadingBrief(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-8">
      {/* Header Banner */}
      <div className="border-b border-[color:var(--border-subtle)] pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🎯</span>
          <h2 className="text-lg font-bold text-[color:var(--text-primary)]">
            Phase 1: Understand the Assignment
          </h2>
        </div>
        <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">
          Define the assignment parameters. Word count and citation style are mandatory so Scholar Core can structure your academic journey accurately.
        </p>
      </div>

      {/* Primary Intake Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-[color:var(--surface-inset)] p-5 rounded-[var(--radius-lg)] border border-[color:var(--border-default)]">
        {/* Question / Prompt (Spans full width) */}
        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
              <span>Assignment Question / Instructions</span>
              <span className="text-amber-500">*</span>
            </label>
            <label className="text-[11px] text-[color:var(--accent)] hover:underline cursor-pointer flex items-center gap-1">
              <span>📎 Upload Brief (PDF/Word)</span>
              <input
                type="file"
                accept=".pdf,.docx,.doc,.txt"
                onChange={handleFileUpload}
                disabled={uploadingBrief}
                className="hidden"
              />
            </label>
          </div>
          <textarea
            value={localQuestion}
            onChange={(e) => setLocalQuestion(e.target.value)}
            rows={4}
            placeholder="Paste your assignment prompt, essay question, or case study instructions here..."
            className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] p-3 text-xs text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-hidden focus:border-[color:var(--accent)] transition-colors leading-relaxed"
          />
          {uploadingBrief && (
            <p className="text-[11px] text-[color:var(--accent)] animate-pulse">
              Extracting brief text from uploaded document…
            </p>
          )}
        </div>

        {/* Academic Level */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
            <span>Academic Level</span>
            <span className="text-amber-500">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLocalLevel("undergraduate")}
              className={`py-2 px-3 rounded-[var(--radius-md)] text-xs font-medium border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                localLevel === "undergraduate"
                  ? "bg-[color:var(--accent-subtle)] border-[color:var(--accent)] text-[color:var(--accent)] font-bold shadow-xs"
                  : "bg-[color:var(--surface-raised)] border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-control)]"
              }`}
            >
              <span>🎓</span>
              <span>Undergraduate</span>
            </button>
            <button
              type="button"
              onClick={() => setLocalLevel("postgraduate")}
              className={`py-2 px-3 rounded-[var(--radius-md)] text-xs font-medium border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                localLevel === "postgraduate"
                  ? "bg-[color:var(--accent-subtle)] border-[color:var(--accent)] text-[color:var(--accent)] font-bold shadow-xs"
                  : "bg-[color:var(--surface-raised)] border-[color:var(--border-default)] text-[color:var(--text-secondary)] hover:border-[color:var(--border-control)]"
              }`}
            >
              <span>🏛️</span>
              <span>Postgraduate / Masters</span>
            </button>
          </div>
          <p className="text-[10px] text-[color:var(--text-muted)]">
            {localLevel === "postgraduate"
              ? "Postgraduate mode deepens critical synthesis, theoretical engagement, and nuanced counterargument evaluation."
              : "Undergraduate mode prioritizes conceptual clarity, rigorous evidence, clear argument, and accurate structure."}
          </p>
        </div>

        {/* Assignment Type */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
            <span>Assignment Type</span>
            <span className="text-amber-500">*</span>
          </label>
          <select
            value={localType}
            onChange={(e) => setLocalType(e.target.value as AssignmentType)}
            className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)] transition-colors cursor-pointer"
          >
            {Object.entries(ASSIGNMENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-[color:var(--text-muted)]">
            Structure adapts dynamically to your assignment format (e.g. essays, case studies, or reports).
          </p>
        </div>

        {/* Target Word Count (Mandatory) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
            <span>Target Word Count</span>
            <span className="text-amber-500">* (Mandatory)</span>
          </label>
          <div className="relative">
            <input
              type="number"
              min={200}
              max={20000}
              step={100}
              value={localWordCount}
              onChange={(e) => setLocalWordCount(Math.max(100, Number(e.target.value)))}
              placeholder="e.g. 2000"
              className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)] transition-colors font-bold"
            />
            <span className="absolute right-3 top-2 text-[11px] text-[color:var(--text-muted)]">words</span>
          </div>
          <p className="text-[10px] text-[color:var(--text-muted)]">
            Sections will be automatically budgeted against this target word limit.
          </p>
        </div>

        {/* Citation Style (Mandatory) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-1.5">
            <span>Citation & Reference Style</span>
            <span className="text-amber-500">* (Mandatory)</span>
          </label>
          <select
            value={localCitation}
            onChange={(e) => setLocalCitation(e.target.value)}
            className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-md)] px-3 py-2 text-xs text-[color:var(--text-primary)] focus:outline-hidden focus:border-[color:var(--accent)] transition-colors cursor-pointer"
          >
            {CITATION_STYLES.map((st) => (
              <option key={st.id} value={st.id}>
                {st.name}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-[color:var(--text-muted)]">
            In-text citations and bibliography will be strictly formatted in this convention.
          </p>
        </div>
      </div>

      {/* Additional Context Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdditional(!showAdditional)}
          className="text-xs font-semibold text-[color:var(--accent)] hover:underline flex items-center gap-1 cursor-pointer"
        >
          <span>{showAdditional ? "▼ Hide Additional Details" : "▶ Add Course, Rubric & Deadline Details (Optional)"}</span>
        </button>

        {showAdditional && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)]">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[color:var(--text-secondary)]">Course / Subject</label>
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g. POLI3002 International Security"
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-[color:var(--text-primary)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[color:var(--text-secondary)]">University / Institution</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. University of Edinburgh"
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-[color:var(--text-primary)]"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-[color:var(--text-secondary)]">Submission Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] px-2.5 py-1.5 text-xs text-[color:var(--text-primary)]"
              />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-[11px] font-medium text-[color:var(--text-secondary)]">Marking Rubric / Learning Outcomes</label>
              <textarea
                value={rubricText}
                onChange={(e) => setRubricText(e.target.value)}
                rows={2}
                placeholder="Paste grading criteria or learning outcomes to evaluate against..."
                className="w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-default)] rounded-[var(--radius-sm)] p-2.5 text-xs text-[color:var(--text-primary)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Analyze Trigger Button */}
      <div className="flex items-center justify-between pt-2">
        {!canAnalyze ? (
          <p className="text-xs text-amber-500 flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Please provide the assignment question, word count, and citation style to continue.</span>
          </p>
        ) : <div />}

        <button
          type="button"
          disabled={!canAnalyze || isAnalyzing}
          onClick={handleAnalyze}
          className="px-5 py-2.5 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer disabled:opacity-50 shadow-xs flex items-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin" />
              <span>Assignment Analysis Agent Unpacking Prompt…</span>
            </>
          ) : (
            <>
              <span>⚡</span>
              <span>{analysis ? "Re-Analyze Assignment Brief" : "Analyze Assignment Brief with AI"}</span>
            </>
          )}
        </button>
      </div>

      {analysisError && (
        <div className="p-3 bg-red-500/10 border border-red-500/30 rounded-lg text-xs text-red-600 dark:text-red-400">
          {analysisError}
        </div>
      )}

      {/* Assignment Analysis Agent Results */}
      {analysis && (
        <div className="space-y-6 pt-4 border-t border-[color:var(--border-subtle)]">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                Assignment Analysis Agent Breakdown
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full">
              ✓ Analysis Ready
            </span>
          </div>

          {/* Command Verbs Unpacking */}
          {analysis.commandVerbs && analysis.commandVerbs.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                Command Verbs & Examiner Demands
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.commandVerbs.map((cv, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold text-xs">
                        {cv.verb}
                      </span>
                      <span className="text-[11px] text-[color:var(--text-secondary)] italic">{cv.meaning}</span>
                    </div>
                    <p className="text-xs text-[color:var(--text-primary)] leading-relaxed font-medium">
                      🎯 <span className="font-bold">What is required:</span> {cv.academicExpectation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Conceptual Scope & Boundaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-[var(--radius-md)] border border-emerald-500/20 bg-emerald-500/5 space-y-2">
              <h5 className="text-xs font-bold text-emerald-700 dark:text-emerald-400 flex items-center gap-1.5">
                <span>✓ What Must Be Researched & Included</span>
              </h5>
              <ul className="text-xs text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
                {analysis.scopeBoundaries?.included?.map((inc, i) => (
                  <li key={i}>{inc}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-[var(--radius-md)] border border-amber-500/20 bg-amber-500/5 space-y-2">
              <h5 className="text-xs font-bold text-amber-700 dark:text-amber-400 flex items-center gap-1.5">
                <span>✕ Out of Scope (Do Not Waste Words On)</span>
              </h5>
              <ul className="text-xs text-[color:var(--text-secondary)] space-y-1 list-disc list-inside">
                {analysis.scopeBoundaries?.excluded?.map((exc, i) => (
                  <li key={i}>{exc}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Guidance Overview */}
          <div className="p-4 rounded-[var(--radius-md)] border border-[color:var(--border-default)] bg-[color:var(--surface-inset)] space-y-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Summary & Expected Response</span>
              <p className="text-xs text-[color:var(--text-primary)] mt-1 leading-relaxed">
                {analysis.summary}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-[color:var(--border-subtle)]">
              <div>
                <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Evidence Requirements</span>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">{analysis.evidenceRequirements}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Word Budget Guidance</span>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">{analysis.wordCountImplications}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-[color:var(--text-muted)] block">Referencing Style</span>
                <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">{analysis.citationGuidance}</p>
              </div>
            </div>
          </div>

          {/* Student Approval & Confirmation */}
          <div className="p-5 rounded-[var(--radius-lg)] border border-[color:var(--accent-border)] bg-[color:var(--accent-subtle)] flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-[color:var(--accent)]">
                Is my understanding of the assignment correct?
              </h4>
              <p className="text-xs text-[color:var(--text-secondary)] mt-0.5">
                Approve to lock this understanding and generate your tailored research plan.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleApproveAnalysis}
                className="px-5 py-2 bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] rounded-[var(--radius-md)] text-xs font-bold hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
              >
                ✓ Approve & Continue to Research Plan →
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
