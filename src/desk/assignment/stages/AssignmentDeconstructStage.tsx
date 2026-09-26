import React, { useState } from "react";
import { useAssignmentWorkspace } from "../AssignmentContext";
import { authedJsonFetch, authedFetch } from "../../api";
import {
  type AcademicLevel,
  type AssignmentType,
  type AssignmentDeconstruction,
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

export default function AssignmentDeconstructStage() {
  const {
    project,
    question,
    academicLevel,
    assignmentType,
    targetWordCount,
    citationStyle,
    assignmentBriefText,
    saveAnswers,
    deconstruction,
    setDeconstruction,
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
  const [activeGradeTab, setActiveGradeTab] = useState<string>("1st_class");

  const canAnalyze =
    localQuestion.trim().length >= 10 &&
    localWordCount > 0 &&
    Boolean(localCitation) &&
    Boolean(localLevel) &&
    Boolean(localType);

  const handleDeconstruct = async () => {
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
      // Commits ephemeral project to database on brief analysis trigger
      const targetProjectId = await ensurePersisted();
      const response = await authedJsonFetch(`/api/projects/${targetProjectId}/assignment/deconstruct`, "POST", {
        question: localQuestion,
        assignmentType: localType,
        academicLevel: localLevel,
        targetWordCount: localWordCount,
        citationStyle: localCitation,
        briefText: localBrief,
        rubricText,
      });

      if (!response.ok) throw new Error("Failed to deconstruct assignment brief");
      const data: AssignmentDeconstruction = await response.json();
      await setDeconstruction(data);
    } catch (err: any) {
      setAnalysisError(err.message || "Failed to deconstruct assignment brief. Please check your network connection.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingBrief(true);
    try {
      const targetProjectId = await ensurePersisted();
      const formData = new FormData();
      formData.append("file", file);

      const res = await authedFetch(`/api/projects/${targetProjectId}/vault/upload`, {
        method: "POST",
        body: formData,
      });

      if (!res.ok) throw new Error("Failed to upload brief document");
      const data = await res.json();
      if (data.extractedText) {
        setLocalBrief((prev) => (prev ? `${prev}\n\n${data.extractedText}` : data.extractedText));
      }
    } catch (err: any) {
      setAnalysisError(`Failed to parse brief file: ${err.message}`);
    } finally {
      setUploadingBrief(false);
    }
  };

  const handleApprove = async () => {
    if (!deconstruction) return;
    await setDeconstruction({
      ...deconstruction,
      approvedByUser: true,
    });
    advanceStage("thesis_budget");
  };

  return (
    <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 text-neutral-900 dark:text-neutral-100">
      {/* Stage Header */}
      <div>
        <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wider bg-neutral-200/80 dark:bg-white/10 text-neutral-700 dark:text-neutral-300 mb-2">
          <span>Stage 01 • Deconstruction</span>
        </div>
        <h1 className="text-2xl sm:text-3xl font-bold tracking-tight">
          Rubric & Assignment Brief Deconstruction
        </h1>
        <p className="text-sm sm:text-base text-neutral-600 dark:text-neutral-400 mt-1">
          Dissect the raw assignment brief, identify command verbs, explicit/implicit questions, and unpack First-Class criteria.
        </p>
      </div>

      {/* Primary Intake Form Card */}
      <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-6">
        <h2 className="text-base font-semibold border-b border-neutral-100 dark:border-white/10 pb-3 flex items-center justify-between">
          <span>Assignment Parameters & Prompt</span>
          <span className="text-xs font-normal text-neutral-500 dark:text-neutral-400">All fields required for First-Class targeting</span>
        </h2>

        {/* Assignment Question / Prompt */}
        <div className="space-y-2">
          <label htmlFor="assignment-prompt" className="block text-xs font-semibold uppercase tracking-wider text-neutral-600 dark:text-neutral-300">
            Assignment Question / Prompt <span className="text-emerald-500">*</span>
          </label>
          <textarea
            id="assignment-prompt"
            value={localQuestion}
            onChange={(e) => setLocalQuestion(e.target.value)}
            rows={3}
            placeholder='e.g., "Critically evaluate the role of state intervention in mitigating financial contagion during sovereign debt crises. To what extent do neo-classical models fail to anticipate structural spillovers?"'
            className="w-full text-sm p-3.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:border-neutral-400 dark:focus:border-white/30 focus:outline-none transition-all placeholder:text-neutral-400 dark:placeholder:text-neutral-500"
          />
        </div>

        {/* 4 Column Spec Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* Academic Level */}
          <div className="space-y-1.5">
            <label htmlFor="academic-level" className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Academic Level
            </label>
            <select
              id="academic-level"
              value={localLevel}
              onChange={(e) => setLocalLevel(e.target.value as AcademicLevel)}
              className="w-full text-xs font-medium p-2.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:outline-none cursor-pointer"
            >
              <option value="undergraduate">Undergraduate (BSc / BA)</option>
              <option value="postgraduate">Postgraduate (MSc / MA / MBA)</option>
            </select>
          </div>

          {/* Assignment Type */}
          <div className="space-y-1.5">
            <label htmlFor="assignment-type" className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Assignment Type
            </label>
            <select
              id="assignment-type"
              value={localType}
              onChange={(e) => setLocalType(e.target.value as AssignmentType)}
              className="w-full text-xs font-medium p-2.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:outline-none cursor-pointer"
            >
              {Object.entries(ASSIGNMENT_TYPE_LABELS).map(([val, label]) => (
                <option key={val} value={val}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Word Count */}
          <div className="space-y-1.5">
            <label htmlFor="target-word-count" className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Target Word Count
            </label>
            <div className="relative">
              <input
                id="target-word-count"
                type="number"
                min={250}
                max={25000}
                step={250}
                value={localWordCount}
                onChange={(e) => setLocalWordCount(Number(e.target.value))}
                className="w-full text-xs font-medium p-2.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:outline-none pr-12 tabular-nums"
              />
              <span className="absolute right-3 top-2.5 text-[11px] text-neutral-400">words</span>
            </div>
          </div>

          {/* Citation Style */}
          <div className="space-y-1.5">
            <label htmlFor="citation-style" className="block text-xs font-medium text-neutral-600 dark:text-neutral-300">
              Citation Standard
            </label>
            <select
              id="citation-style"
              value={localCitation}
              onChange={(e) => setLocalCitation(e.target.value)}
              className="w-full text-xs font-medium p-2.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 focus:outline-none cursor-pointer truncate"
            >
              {CITATION_STYLES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Optional Brief Document Upload / Text */}
        <div className="space-y-3 pt-2 border-t border-neutral-100 dark:border-white/5">
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setShowAdditional(!showAdditional)}
              className="text-xs font-semibold text-neutral-700 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-white flex items-center gap-1.5 cursor-pointer"
            >
              <span>{showAdditional ? "▼ Hide" : "▶ Add"} Assignment Brief, Rubric & Course Metadata</span>
            </button>
            <label className="text-xs text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white cursor-pointer flex items-center gap-1">
              <span>📎 Upload brief file (.pdf/.docx/.txt)</span>
              <input
                type="file"
                accept=".pdf,.docx,.txt"
                onChange={handleFileUpload}
                disabled={uploadingBrief}
                className="hidden"
              />
            </label>
          </div>

          {uploadingBrief && (
            <div className="text-xs text-neutral-500 animate-pulse flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500 animate-ping" />
              Extracting text from uploaded brief...
            </div>
          )}

          {showAdditional && (
            <div className="space-y-4 pt-2">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <input
                  type="text"
                  placeholder="Module / Course Name"
                  value={course}
                  onChange={(e) => setCourse(e.target.value)}
                  className="text-xs p-2.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10"
                />
                <input
                  type="text"
                  placeholder="University / Institution"
                  value={institution}
                  onChange={(e) => setInstitution(e.target.value)}
                  className="text-xs p-2.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10"
                />
                <input
                  type="date"
                  placeholder="Deadline"
                  value={deadline}
                  onChange={(e) => setDeadline(e.target.value)}
                  className="text-xs p-2.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10"
                />
              </div>
              <textarea
                value={localBrief}
                onChange={(e) => setLocalBrief(e.target.value)}
                rows={4}
                placeholder="Paste full assignment specification, teacher guidance notes, or institutional rubric..."
                className="w-full text-xs p-3 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200 dark:border-white/10 placeholder:text-neutral-400"
              />
            </div>
          )}
        </div>

        {/* Action Trigger */}
        <div className="pt-2 flex items-center justify-between border-t border-neutral-100 dark:border-white/5">
          <div className="text-xs text-neutral-500 dark:text-neutral-400">
            {canAnalyze
              ? "Ready for AI Deconstruction & Rubric Extraction"
              : "Enter prompt (10+ chars) to run analysis"}
          </div>

          <button
            type="button"
            onClick={handleDeconstruct}
            disabled={!canAnalyze || isAnalyzing}
            className="px-6 py-2.5 rounded-xl font-semibold text-xs sm:text-sm bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 hover:bg-neutral-800 dark:hover:bg-neutral-100 disabled:opacity-40 disabled:cursor-not-allowed transition-all cursor-pointer shadow-sm flex items-center gap-2"
          >
            {isAnalyzing ? (
              <>
                <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                <span>Deconstructing Assignment...</span>
              </>
            ) : (
              <>
                <span>Deconstruct Assignment Brief</span>
                <span>→</span>
              </>
            )}
          </button>
        </div>

        {analysisError && (
          <div className="p-3 rounded-xl bg-red-500/10 border border-red-500/20 text-xs text-red-600 dark:text-red-400">
            {analysisError}
          </div>
        )}
      </div>

      {/* Deconstruction Results Display */}
      {deconstruction && (
        <div className="space-y-6 animate-fade-in">
          {/* Executive Brief Summary */}
          <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-emerald-500" />
              <span>Deconstruction Intelligence & Examiner Expectations</span>
            </h2>
            <p className="text-sm text-neutral-700 dark:text-neutral-300 leading-relaxed">
              {deconstruction.summary}
            </p>

            {/* Key Command Verbs */}
            {deconstruction.commandVerbs?.length > 0 && (
              <div className="space-y-3 pt-3 border-t border-neutral-100 dark:border-white/5">
                <h3 className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                  Command Verbs & Examiner Demands
                </h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {deconstruction.commandVerbs.map((cv, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 rounded-xl bg-[#F8F9FA] dark:bg-[#2C2C2E] border border-neutral-200/80 dark:border-white/10 space-y-1.5"
                    >
                      <div className="flex items-center gap-2">
                        <span className="px-2 py-0.5 rounded-md text-[11px] font-bold uppercase bg-neutral-900 text-white dark:bg-white dark:text-neutral-900">
                          {cv.verb}
                        </span>
                        <span className="text-xs text-neutral-600 dark:text-neutral-300">{cv.meaning}</span>
                      </div>
                      <p className="text-xs text-neutral-500 dark:text-neutral-400 italic">
                        Expectation: {cv.academicExpectation}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Grade Band Descriptors (First Class Criteria Focus) */}
          {deconstruction.gradeBandDescriptors?.length > 0 && (
            <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-neutral-100 dark:border-white/10 pb-4">
                <div>
                  <h2 className="text-base font-semibold">Marking Criteria & Grade Band Descriptors</h2>
                  <p className="text-xs text-neutral-500 dark:text-neutral-400">
                    Engineered to satisfy First-Class (70%+ / Grade A) standards
                  </p>
                </div>
                <div className="flex items-center gap-1.5 overflow-x-auto">
                  {deconstruction.gradeBandDescriptors.map((gb) => (
                    <button
                      key={gb.band}
                      type="button"
                      onClick={() => setActiveGradeTab(gb.band)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-medium cursor-pointer transition-all ${
                        activeGradeTab === gb.band
                          ? "bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 font-semibold shadow-xs"
                          : "bg-neutral-100 dark:bg-white/5 text-neutral-600 dark:text-neutral-400 hover:text-neutral-900 dark:hover:text-white"
                      }`}
                    >
                      {gb.label.split("(")[0].trim()}
                    </button>
                  ))}
                </div>
              </div>

              {(() => {
                const selectedBand =
                  deconstruction.gradeBandDescriptors.find((g) => g.band === activeGradeTab) ||
                  deconstruction.gradeBandDescriptors[0];
                return (
                  <div className="space-y-4 pt-1">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-bold">{selectedBand.label}</span>
                      <span className="text-xs font-mono text-emerald-600 dark:text-emerald-400 font-semibold">
                        Threshold: {selectedBand.minScore}%+
                      </span>
                    </div>

                    <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-xs text-emerald-900 dark:text-emerald-200 font-medium">
                      🎯 <strong>What Examiners Look For:</strong> {selectedBand.whatExaminersLookFor}
                    </div>

                    <div className="space-y-2">
                      <span className="text-xs font-semibold uppercase tracking-wider text-neutral-500">
                        Criteria Checklist
                      </span>
                      <ul className="space-y-1.5">
                        {selectedBand.criteria.map((crit, idx) => (
                          <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-2">
                            <span className="text-emerald-500 font-bold shrink-0">✓</span>
                            <span>{crit}</span>
                          </li>
                        ))}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </div>
          )}

          {/* Sub-Questions Matrix & Constraints */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Sub-Questions */}
            <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
              <h2 className="text-sm font-semibold flex items-center gap-2">
                <span>Explicit vs Implicit Sub-Questions</span>
              </h2>

              <div className="space-y-3">
                <div>
                  <h3 className="text-xs font-medium text-neutral-500 mb-1.5">Explicit Sub-Questions:</h3>
                  <ul className="space-y-1">
                    {(deconstruction.subQuestions?.explicit || []).map((q, idx) => (
                      <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-2">
                        <span className="text-neutral-400 font-mono">0{idx + 1}.</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 border-t border-neutral-100 dark:border-white/5">
                  <h3 className="text-xs font-medium text-amber-600 dark:text-amber-400 mb-1.5">
                    Implicit / Unstated Examiner Demands:
                  </h3>
                  <ul className="space-y-1">
                    {(deconstruction.subQuestions?.implicit || []).map((q, idx) => (
                      <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-2">
                        <span className="text-amber-500 font-bold shrink-0">★</span>
                        <span>{q}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>

            {/* Scope Boundaries & Constraints */}
            <div className="p-6 rounded-2xl bg-white dark:bg-[#1C1C1E] border border-neutral-200/90 dark:border-white/10 shadow-[0_1px_3px_rgba(0,0,0,0.05)] space-y-4">
              <h2 className="text-sm font-semibold">Scope Boundaries & Traps</h2>

              <div className="space-y-3">
                <div>
                  <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                    Mandatory Scope (Must Include):
                  </span>
                  <ul className="mt-1 space-y-1">
                    {(deconstruction.scopeBoundaries?.included || []).map((item, idx) => (
                      <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-1.5">
                        <span className="text-emerald-500">✓</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="pt-2 border-t border-neutral-100 dark:border-white/5">
                  <span className="text-xs font-medium text-red-500 dark:text-red-400">
                    Out of Scope / Common Traps (Avoid):
                  </span>
                  <ul className="mt-1 space-y-1">
                    {(deconstruction.scopeBoundaries?.excluded || []).map((item, idx) => (
                      <li key={idx} className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-1.5">
                        <span className="text-red-400">✕</span>
                        <span>{item}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </div>
          </div>

          {/* Approval & Stage Transition Action */}
          <div className="p-6 rounded-2xl bg-neutral-900 dark:bg-white text-white dark:text-neutral-900 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-sm">
            <div>
              <h2 className="text-base font-bold">Approve Brief Deconstruction</h2>
              <p className="text-xs text-neutral-300 dark:text-neutral-600 mt-0.5">
                Lock in requirements and proceed to thesis formulation & mathematical word budgeting.
              </p>
            </div>
            <button
              type="button"
              onClick={handleApprove}
              className="px-6 py-2.5 rounded-xl font-bold text-xs sm:text-sm bg-white dark:bg-neutral-900 text-neutral-900 dark:text-white hover:bg-neutral-100 dark:hover:bg-neutral-800 transition-all cursor-pointer shrink-0 shadow-xs flex items-center gap-2"
            >
              <span>Approve & Continue to Stage 2</span>
              <span>→</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
