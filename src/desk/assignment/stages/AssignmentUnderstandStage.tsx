import React, { useState } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch, authedFetch } from "../../api";
import {
  type AcademicLevel,
  type AssignmentType,
  type AssignmentAnalysis,
  ASSIGNMENT_TYPE_LABELS,
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
    <div className="max-w-4xl mx-auto p-6 sm:p-8 space-y-8 text-neutral-900 dark:text-neutral-100">
      {/* Primary Intake Form Card matching Dashboard Template Card Aesthetics */}
      <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-sm space-y-6">
        {/* Header: Clean Typography without Raw Emojis */}
        <div className="border-b border-neutral-100 dark:border-white/5 pb-5">
          <h2 className="text-xl font-semibold text-neutral-900 dark:text-white tracking-tight">
            Phase 1: Understand the Assignment
          </h2>
          <p className="text-[13px] text-neutral-500 dark:text-neutral-400 mt-1 leading-relaxed">
            Define the assignment parameters to tailor your outline, research scope, and rubric alignment.
          </p>
        </div>

        {/* Form Controls Grid */}
        <div className="space-y-5">
          {/* Assignment Instructions / Prompt Box (Full Width) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                <span>Assignment Question / Instructions</span>
                <span className="text-rose-500">*</span>
              </label>
              <label className="text-[11px] font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer flex items-center gap-1.5 transition-colors px-2.5 py-1 rounded-lg hover:bg-neutral-100 dark:hover:bg-white/5">
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18.375 12.739l-7.693 7.693a4.5 4.5 0 01-6.364-6.364l10.94-10.94A3 3 0 1119.5 7.37l-8.647 8.648a1.5 1.5 0 01-2.121-2.121l7.693-7.693" />
                </svg>
                <span>Upload Brief (.pdf, .docx)</span>
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
              className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-xl p-3.5 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-all leading-relaxed resize-y"
            />
            {uploadingBrief && (
              <p className="text-[11px] text-neutral-500 dark:text-neutral-400 animate-pulse flex items-center gap-1.5">
                <span className="w-3 h-3 border-2 border-neutral-400 border-t-transparent rounded-full animate-spin" />
                <span>Extracting brief text from uploaded document…</span>
              </p>
            )}
          </div>

          {/* Academic Level Apple-Style Segmented Control */}
          <div className="space-y-2">
            <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
              <span>Academic Level</span>
              <span className="text-rose-500">*</span>
            </label>
            <div className="bg-neutral-100 dark:bg-white/5 p-1 rounded-xl border border-neutral-200/60 dark:border-white/10 grid grid-cols-2 gap-1">
              <button
                type="button"
                onClick={() => setLocalLevel("undergraduate")}
                className={`py-2 px-3 rounded-lg text-xs transition-all cursor-pointer ${
                  localLevel === "undergraduate"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-medium"
                }`}
              >
                Undergraduate
              </button>
              <button
                type="button"
                onClick={() => setLocalLevel("postgraduate")}
                className={`py-2 px-3 rounded-lg text-xs transition-all cursor-pointer ${
                  localLevel === "postgraduate"
                    ? "bg-white dark:bg-[#2C2C2E] text-neutral-900 dark:text-white shadow-xs font-semibold"
                    : "text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white font-medium"
                }`}
              >
                Postgraduate / Masters
              </button>
            </div>
            <p className="text-[11px] text-neutral-500 dark:text-neutral-400">
              {localLevel === "postgraduate"
                ? "Postgraduate mode deepens critical synthesis, theoretical engagement, and nuanced counterargument evaluation."
                : "Undergraduate mode prioritizes conceptual clarity, rigorous evidence, clear argument, and accurate structure."}
            </p>
          </div>

          {/* 3-Field Grid: Assignment Type, Target Word Count, Citation Style */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {/* Assignment Type Dropdown */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                <span>Assignment Type</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={localType}
                  onChange={(e) => setLocalType(e.target.value as AssignmentType)}
                  className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-all appearance-none cursor-pointer pr-10"
                >
                  {Object.entries(ASSIGNMENT_TYPE_LABELS).map(([key, label]) => (
                    <option key={key} value={key} className="bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-neutral-100">
                      {label}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>

            {/* Target Word Count */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                <span>Target Word Count</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <input
                  type="number"
                  min={200}
                  max={20000}
                  step={100}
                  value={localWordCount || ""}
                  onChange={(e) => setLocalWordCount(Math.max(0, Number(e.target.value)))}
                  placeholder="e.g. 2000"
                  className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-all font-semibold pr-16"
                />
                <span className="absolute right-4 top-1/2 -translate-y-1/2 text-[11px] text-neutral-400 font-medium">words</span>
              </div>
            </div>

            {/* Citation Style Dropdown */}
            <div className="space-y-2">
              <label className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1">
                <span>Citation Style</span>
                <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <select
                  value={localCitation}
                  onChange={(e) => setLocalCitation(e.target.value)}
                  className="w-full bg-neutral-50 dark:bg-white/5 border border-neutral-200/80 dark:border-white/10 rounded-xl px-4 py-2.5 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 transition-all appearance-none cursor-pointer pr-10"
                >
                  {CITATION_STYLES.map((st) => (
                    <option key={st.id} value={st.id} className="bg-white dark:bg-[#1C1C1E] text-neutral-900 dark:text-neutral-100">
                      {st.name}
                    </option>
                  ))}
                </select>
                <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-3 text-neutral-400">
                  <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>
              </div>
            </div>
          </div>

          {/* Optional Details Collapsible Accordion */}
          <div className="pt-2">
            <button
              type="button"
              onClick={() => setShowAdditional(!showAdditional)}
              className="text-xs font-medium text-neutral-500 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer transition-colors"
            >
              <svg className={`w-3.5 h-3.5 transition-transform duration-200 ${showAdditional ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
              </svg>
              <span>{showAdditional ? "Hide Additional Course Details" : "Add Course, Rubric & Deadline Details (Optional)"}</span>
            </button>

            {showAdditional && (
              <div className="mt-3 grid grid-cols-1 md:grid-cols-3 gap-4 p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/5 animate-in fade-in duration-150">
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Course / Subject</label>
                  <input
                    type="text"
                    value={course}
                    onChange={(e) => setCourse(e.target.value)}
                    placeholder="e.g. POLI3002 International Security"
                    className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">University / Institution</label>
                  <input
                    type="text"
                    value={institution}
                    onChange={(e) => setInstitution(e.target.value)}
                    placeholder="e.g. University of Edinburgh"
                    className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                  />
                </div>
                <div className="space-y-1.5">
                  <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Submission Deadline</label>
                  <input
                    type="date"
                    value={deadline}
                    onChange={(e) => setDeadline(e.target.value)}
                    className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg px-3 py-2 text-xs text-neutral-900 dark:text-neutral-100 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20"
                  />
                </div>
                <div className="md:col-span-3 space-y-1.5">
                  <label className="text-[11px] font-medium text-neutral-600 dark:text-neutral-400">Marking Rubric / Learning Outcomes</label>
                  <textarea
                    value={rubricText}
                    onChange={(e) => setRubricText(e.target.value)}
                    rows={2}
                    placeholder="Paste grading criteria or learning outcomes to evaluate against..."
                    className="w-full bg-white dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 rounded-lg p-3 text-xs text-neutral-900 dark:text-neutral-100 placeholder-neutral-400 dark:placeholder-neutral-500 focus:outline-none focus:border-neutral-400 dark:focus:border-white/20 leading-relaxed"
                  />
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Validation Feedback & Action CTA */}
        <div className="pt-4 border-t border-neutral-100 dark:border-white/5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          {!canAnalyze ? (
            <p className="text-xs text-rose-500 dark:text-rose-400 font-medium">
              Please provide the assignment question, word count, and citation style to continue.
            </p>
          ) : <div />}

          <button
            type="button"
            disabled={!canAnalyze || isAnalyzing}
            onClick={handleAnalyze}
            className="bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-all rounded-xl px-6 py-2.5 font-medium text-[13px] disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2 cursor-pointer shrink-0"
          >
            {isAnalyzing ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                <span>Analyzing Assignment Brief…</span>
              </>
            ) : (
              <span>{analysis ? "Re-Analyze Assignment Brief" : "Analyze Assignment Brief"}</span>
            )}
          </button>
        </div>

        {analysisError && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-600 dark:text-red-400">
            {analysisError}
          </div>
        )}
      </div>

      {/* Assignment Analysis Agent Results */}
      {analysis && (
        <div className="rounded-2xl p-6 sm:p-8 bg-white dark:bg-[#1C1C1E] border border-neutral-200/80 dark:border-white/10 shadow-sm space-y-6">
          <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-4">
            <div>
              <h3 className="text-base font-semibold text-neutral-900 dark:text-white">
                Assignment Analysis Breakdown
              </h3>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Target expectations, command verbs, and academic scope boundaries unpacked by the Socratic Agent.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-500/10 px-3 py-1 rounded-full border border-emerald-500/20">
              ✓ Analysis Ready
            </span>
          </div>

          {/* Command Verbs Unpacking */}
          {analysis.commandVerbs && analysis.commandVerbs.length > 0 && (
            <div className="space-y-3">
              <h4 className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 uppercase tracking-wider">
                Command Verbs & Examiner Demands
              </h4>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {analysis.commandVerbs.map((cv, idx) => (
                  <div
                    key={idx}
                    className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/5 space-y-1.5"
                  >
                    <div className="flex items-center gap-2">
                      <span className="px-2 py-0.5 rounded bg-neutral-200 dark:bg-white/10 text-neutral-900 dark:text-neutral-100 font-semibold text-xs">
                        {cv.verb}
                      </span>
                      <span className="text-[11px] text-neutral-500 dark:text-neutral-400 italic">{cv.meaning}</span>
                    </div>
                    <p className="text-xs text-neutral-700 dark:text-neutral-300 leading-relaxed">
                      <span className="font-semibold text-neutral-900 dark:text-neutral-100">Requirement:</span> {cv.academicExpectation}
                    </p>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Key Conceptual Scope & Boundaries */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="p-4 rounded-xl border border-emerald-500/20 bg-emerald-500/5 space-y-2">
              <h5 className="text-xs font-semibold text-emerald-700 dark:text-emerald-400">
                ✓ What Must Be Researched & Included
              </h5>
              <ul className="text-xs text-neutral-700 dark:text-neutral-300 space-y-1 list-disc list-inside">
                {analysis.scopeBoundaries?.included?.map((inc, i) => (
                  <li key={i}>{inc}</li>
                ))}
              </ul>
            </div>

            <div className="p-4 rounded-xl border border-amber-500/20 bg-amber-500/5 space-y-2">
              <h5 className="text-xs font-semibold text-amber-700 dark:text-amber-400">
                ✕ Out of Scope (Do Not Waste Word Budget On)
              </h5>
              <ul className="text-xs text-neutral-700 dark:text-neutral-300 space-y-1 list-disc list-inside">
                {analysis.scopeBoundaries?.excluded?.map((exc, i) => (
                  <li key={i}>{exc}</li>
                ))}
              </ul>
            </div>
          </div>

          {/* Guidance Overview */}
          <div className="p-4 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/5 space-y-3">
            <div>
              <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block tracking-wider">
                Summary & Expected Response
              </span>
              <p className="text-xs text-neutral-800 dark:text-neutral-200 mt-1 leading-relaxed">
                {analysis.summary}
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-3 border-t border-neutral-200/60 dark:border-white/5">
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block tracking-wider">Evidence Requirements</span>
                <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-0.5">{analysis.evidenceRequirements}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block tracking-wider">Word Budget Guidance</span>
                <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-0.5">{analysis.wordCountImplications}</p>
              </div>
              <div>
                <span className="text-[10px] uppercase font-semibold text-neutral-500 dark:text-neutral-400 block tracking-wider">Referencing Style</span>
                <p className="text-xs text-neutral-700 dark:text-neutral-300 mt-0.5">{analysis.citationGuidance}</p>
              </div>
            </div>
          </div>

          {/* Student Approval & Confirmation Banner */}
          <div className="p-5 rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50 dark:bg-white/5 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div>
              <h4 className="text-xs font-semibold text-neutral-900 dark:text-white">
                Is my understanding of the assignment correct?
              </h4>
              <p className="text-xs text-neutral-500 dark:text-neutral-400 mt-0.5">
                Approve to lock this understanding and generate your tailored research plan.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApproveAnalysis}
              className="bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 rounded-xl px-5 py-2.5 text-xs font-semibold transition-all cursor-pointer shadow-xs shrink-0"
            >
              ✓ Approve & Continue to Research Plan →
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

// Export alias for lazy-loading requirement
export { AssignmentUnderstandStage as AssignmentForm };
