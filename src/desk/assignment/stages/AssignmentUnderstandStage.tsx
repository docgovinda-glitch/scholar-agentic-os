import React, { useState } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch, authedFetch } from "../../api";
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
    project,
    question,
    academicLevel,
    assignmentType,
    targetWordCount,
    citationStyle,
    assignmentBriefText,
    saveAnswers,
    analysis,
    setAnalysis,
    advanceStage,
    ensurePersisted,
  } = useAssignmentWorkspace();

  const courseName = project?.answers?.["course_name"] || "";
  const institutionName = project?.answers?.["institution"] || "";
  const deadlineDate = project?.answers?.["deadline"] || "";
  const markingRubricText = project?.answers?.["marking_rubric"] || "";

  const [localQuestion, setLocalQuestion] = useState(question);
  const [localLevel, setLocalLevel] = useState<AcademicLevel>(academicLevel);
  const [localType, setLocalType] = useState<AssignmentType>(assignmentType);
  const [localWordCount, setLocalWordCount] = useState<number>(targetWordCount);
  const [localCitation, setLocalCitation] = useState<string>(citationStyle);
  const [localBrief, setLocalBrief] = useState(assignmentBriefText);
  const [course, setCourse] = useState(courseName);
  const [institution, setInstitution] = useState(institutionName);
  const [deadline, setDeadline] = useState(deadlineDate);
  const [rubricText, setRubricText] = useState(markingRubricText);
  const [showAdditional, setShowAdditional] = useState(false);

  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadingBrief, setUploadingBrief] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);
  const [userFeedback, setUserFeedback] = useState("");

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

    // Save intake details first
    await saveAnswers({
      research_topic: localQuestion,
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
      const targetProjectId = await ensurePersisted();
      const response = await authedJsonFetch(`/api/projects/${targetProjectId}/assignment/analyze`, "POST", {
        question: localQuestion,
        assignmentType: localType,
        academicLevel: localLevel,
        targetWordCount: localWordCount,
        citationStyle: localCitation,
        briefText: localBrief,
        rubricText,
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
      const targetProjectId = await ensurePersisted();
      const res = await authedFetch(`/api/projects/${targetProjectId}/parse-file`, {
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
    <div className="max-w-4xl mx-auto p-6 space-y-8 text-neutral-200">
      {/* Header Banner */}
      <div className="border-b border-white/5 pb-4">
        <div className="flex items-center gap-2 mb-1">
          <span className="text-xl">🎯</span>
          <h2 className="text-lg font-bold text-neutral-100">
            Phase 1: Understand the Assignment
          </h2>
        </div>
        <p className="text-xs text-neutral-400 leading-relaxed">
          Define the assignment parameters. Word count and citation style are mandatory so Scholar Core can structure your academic journey accurately.
        </p>
      </div>

      {/* Primary Intake Form */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 bg-neutral-900/80 p-5 rounded-xl border border-white/5 shadow-xs">
        {/* Question / Prompt (Spans full width) */}
        <div className="md:col-span-2 space-y-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
              <span>Assignment Question / Instructions</span>
              <span className="text-amber-400">*</span>
            </label>
            <label className="text-[11px] text-neutral-400 hover:text-white cursor-pointer flex items-center gap-1 transition-colors">
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
            className="w-full bg-neutral-800/60 border border-white/10 rounded-lg p-3 text-xs text-neutral-200 placeholder-neutral-500 focus:outline-hidden focus:border-white/20 transition-colors leading-relaxed"
          />
          {uploadingBrief && (
            <p className="text-[11px] text-neutral-300 animate-pulse">
              Extracting brief text from uploaded document…
            </p>
          )}
        </div>

        {/* Academic Level */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
            <span>Academic Level</span>
            <span className="text-amber-400">*</span>
          </label>
          <div className="grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setLocalLevel("undergraduate")}
              className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                localLevel === "undergraduate"
                  ? "bg-white/10 border-white/20 text-neutral-100 font-bold shadow-xs"
                  : "bg-neutral-800/40 border-white/5 text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
              }`}
            >
              <span>🎓</span>
              <span>Undergraduate</span>
            </button>
            <button
              type="button"
              onClick={() => setLocalLevel("postgraduate")}
              className={`py-2 px-3 rounded-lg text-xs font-medium border flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                localLevel === "postgraduate"
                  ? "bg-white/10 border-white/20 text-neutral-100 font-bold shadow-xs"
                  : "bg-neutral-800/40 border-white/5 text-neutral-400 hover:text-neutral-200 hover:bg-white/5"
              }`}
            >
              <span>🏛️</span>
              <span>Postgraduate / Masters</span>
            </button>
          </div>
          <p className="text-[10px] text-neutral-400">
            {localLevel === "postgraduate"
              ? "Postgraduate mode deepens critical synthesis, theoretical engagement, and nuanced counterargument evaluation."
              : "Undergraduate mode prioritizes conceptual clarity, rigorous evidence, clear argument, and accurate structure."}
          </p>
        </div>

        {/* Assignment Type */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
            <span>Assignment Type</span>
            <span className="text-amber-400">*</span>
          </label>
          <select
            value={localType}
            onChange={(e) => setLocalType(e.target.value as AssignmentType)}
            className="w-full bg-neutral-800/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-hidden focus:border-white/20 transition-colors cursor-pointer"
          >
            {Object.entries(ASSIGNMENT_TYPE_LABELS).map(([key, label]) => (
              <option key={key} value={key} className="bg-neutral-900 text-neutral-200">
                {label}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-neutral-400">
            Structure adapts dynamically to your assignment format (e.g. essays, case studies, or reports).
          </p>
        </div>

        {/* Target Word Count (Mandatory) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
            <span>Target Word Count</span>
            <span className="text-amber-400">* (Mandatory)</span>
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
              className="w-full bg-neutral-800/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-hidden focus:border-white/20 transition-colors font-bold"
            />
            <span className="absolute right-3 top-2 text-[11px] text-neutral-400">words</span>
          </div>
          <p className="text-[10px] text-neutral-400">
            Sections will be automatically budgeted against this target word limit.
          </p>
        </div>

        {/* Citation Style (Mandatory) */}
        <div className="space-y-2">
          <label className="text-xs font-bold text-neutral-200 flex items-center gap-1.5">
            <span>Citation & Reference Style</span>
            <span className="text-amber-400">* (Mandatory)</span>
          </label>
          <select
            value={localCitation}
            onChange={(e) => setLocalCitation(e.target.value)}
            className="w-full bg-neutral-800/60 border border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-200 focus:outline-hidden focus:border-white/20 transition-colors cursor-pointer"
          >
            {CITATION_STYLES.map((st) => (
              <option key={st.id} value={st.id} className="bg-neutral-900 text-neutral-200">
                {st.name}
              </option>
            ))}
          </select>
          <p className="text-[10px] text-neutral-400">
            In-text citations and bibliography will be strictly formatted in this convention.
          </p>
        </div>
      </div>

      {/* Additional Context Toggle */}
      <div>
        <button
          type="button"
          onClick={() => setShowAdditional(!showAdditional)}
          className="text-xs font-medium text-neutral-400 hover:text-neutral-200 flex items-center gap-1 cursor-pointer transition-colors"
        >
          <span>{showAdditional ? "▼ Hide Additional Details" : "▶ Add Course, Rubric & Deadline Details (Optional)"}</span>
        </button>

        {showAdditional && (
          <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-white/5 bg-neutral-900/60">
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-neutral-400">Course / Subject</label>
              <input
                type="text"
                value={course}
                onChange={(e) => setCourse(e.target.value)}
                placeholder="e.g. POLI3002 International Security"
                className="w-full bg-neutral-800/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-neutral-400">University / Institution</label>
              <input
                type="text"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                placeholder="e.g. University of Edinburgh"
                className="w-full bg-neutral-800/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200 placeholder-neutral-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-[11px] font-medium text-neutral-400">Submission Deadline</label>
              <input
                type="date"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="w-full bg-neutral-800/60 border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-neutral-200"
              />
            </div>
            <div className="md:col-span-3 space-y-1.5">
              <label className="text-[11px] font-medium text-neutral-400">Marking Rubric / Learning Outcomes</label>
              <textarea
                value={rubricText}
                onChange={(e) => setRubricText(e.target.value)}
                rows={2}
                placeholder="Paste grading criteria or learning outcomes to evaluate against..."
                className="w-full bg-neutral-800/60 border border-white/10 rounded-lg p-2.5 text-xs text-neutral-200 placeholder-neutral-500"
              />
            </div>
          </div>
        )}
      </div>

      {/* Analyze Trigger Button */}
      <div className="flex items-center justify-between pt-2">
        {!canAnalyze ? (
          <p className="text-xs text-amber-400 flex items-center gap-1.5">
            <span>⚠️</span>
            <span>Please provide the assignment question, word count, and citation style to continue.</span>
          </p>
        ) : <div />}

        <button
          type="button"
          disabled={!canAnalyze || isAnalyzing}
          onClick={handleAnalyze}
          className="px-5 py-2.5 bg-white text-black hover:bg-neutral-200 rounded-lg text-xs font-bold transition-all cursor-pointer disabled:opacity-40 shadow-xs flex items-center gap-2"
        >
          {isAnalyzing ? (
            <>
              <div className="w-3.5 h-3.5 border-2 border-black border-t-transparent rounded-full animate-spin" />
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
        <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-xs text-red-400">
          {analysisError}
        </div>
      )}

      {/* Assignment Analysis Agent Results */}
      {analysis && (
        <div className="space-y-6 pt-4 border-t border-white/5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="text-lg">🤖</span>
              <h3 className="text-sm font-bold text-neutral-100">
                Assignment Analysis Agent Breakdown
              </h3>
            </div>
            <span className="text-[11px] font-semibold text-emerald-400 bg-emerald-500/10 px-2.5 py-1 rounded-full border border-emerald-500/20">
              ✓ Analysis Ready
            </span>
          </div>

          {/* Command Verbs Unpacking */}
          {analysis.commandVerbs && analysis.commandVerbs.length > 0 && (
            <div className="space-y-2">
              <h4 className="text-xs font-bold text-neutral-300 uppercase tracking-wider">
                Command Verbs & Examiner Demands
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.commandVerbs.map((cv, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 rounded-xl border border-white/5 bg-neutral-900/80 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-white/10 text-neutral-200 font-bold text-xs">
                        {cv.verb}
                      </span>
                      <span className="text-[11px] text-neutral-400 italic">{cv.meaning}</span>
                    </div>
                    <p className="text-xs text-neutral-300 leading-relaxed font-medium">
                      🎯 <span className="font-bold text-neutral-200">What is required:</span> {cv.academicExpectation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Conceptual Scope & Boundaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
              <h5 className="text-xs font-bold text-emerald-400 flex items-center gap-1.5">
                <span>✓ What Must Be Researched & Included</span>
              </h5>
              <ul className="text-xs text-neutral-300 space-y-1 list-disc list-inside">
                {analysis.scopeBoundaries?.included?.map((inc, i) => (
                  <li key={i}>{inc}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
              <h5 className="text-xs font-bold text-amber-400 flex items-center gap-1.5">
                <span>✕ Out of Scope (Do Not Waste Words On)</span>
              </h5>
              <ul className="text-xs text-neutral-300 space-y-1 list-disc list-inside">
                {analysis.scopeBoundaries?.excluded?.map((exc, i) => (
                  <li key={i}>{exc}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Guidance Overview */}
          <div className="p-4 rounded-xl border border-white/5 bg-neutral-900/80 space-y-3">
            <div>
              <span className="text-[10px] uppercase font-bold text-neutral-400 block">Summary & Expected Response</span>
              <p className="text-xs text-neutral-200 mt-1 leading-relaxed">
                {analysis.summary}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-white/5">
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Evidence Requirements</span>
                <p className="text-xs text-neutral-300 mt-0.5">{analysis.evidenceRequirements}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Word Budget Guidance</span>
                <p className="text-xs text-neutral-300 mt-0.5">{analysis.wordCountImplications}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-bold text-neutral-400 block">Referencing Style</span>
                <p className="text-xs text-neutral-300 mt-0.5">{analysis.citationGuidance}</p>
              </div>
            </div>
          </div>

          {/* Student Approval & Confirmation */}
          <div className="p-5 rounded-xl border border-white/10 bg-neutral-900/90 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-bold text-neutral-100">
                Is my understanding of the assignment correct?
              </h4>
              <p className="text-xs text-neutral-400 mt-0.5">
                Approve to lock this understanding and generate your tailored research plan.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={handleApproveAnalysis}
                className="px-5 py-2 bg-white text-black hover:bg-neutral-200 rounded-lg text-xs font-bold transition-all cursor-pointer shadow-xs"
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

// Export alias for lazy-loading requirement
export { AssignmentUnderstandStage as AssignmentForm };

