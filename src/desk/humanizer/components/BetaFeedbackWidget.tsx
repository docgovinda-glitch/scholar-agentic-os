import React, { useState } from "react";
import { recordBetaFeedback, mapUiIssueToTaxonomy } from "../../../domain/humanizer/telemetry/betaTelemetryService";

interface BetaFeedbackWidgetProps {
  projectId: string;
  mode: string;
  hasOutput: boolean;
  provider?: string;
  model?: string;
  genre?: string;
  auditDecision?: string;
}

export default function BetaFeedbackWidget({
  projectId,
  mode,
  hasOutput,
  provider = "gemini",
  model = "gemini-2.5-flash",
  genre = "Academic Journal",
  auditDecision = "SAFE",
}: BetaFeedbackWidgetProps) {
  const [submitted, setSubmitted] = useState(false);
  const [meaningPreserved, setMeaningPreserved] = useState<"YES" | "NO" | "NOT_SURE" | null>(null);
  const [rewriteUseful, setRewriteUseful] = useState<"YES" | "NO" | "NOT_SURE" | null>(null);
  const [selectedIssues, setSelectedIssues] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);

  if (!hasOutput || submitted) {
    if (submitted) {
      return (
        <div className="mt-3 p-2.5 rounded-xl bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-[11px] text-slate-500 dark:text-slate-400 text-center">
          ✓ Thank you for your feedback! Your evaluation directly calibrates our safety gates.
        </div>
      );
    }
    return null;
  }

  function toggleIssue(tag: string) {
    if (selectedIssues.includes(tag)) {
      setSelectedIssues(selectedIssues.filter((t) => t !== tag));
    } else {
      setSelectedIssues([...selectedIssues, tag]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!meaningPreserved) return;

    setIsSubmitting(true);
    try {
      const taxonomyIssues = selectedIssues.map(mapUiIssueToTaxonomy);
      recordBetaFeedback({
        projectId,
        pipelineVersion: "humanizer-v1.0.0-beta",
        provider,
        model,
        rewriteMode: mode,
        genre,
        auditDecision,
        meaningPreserved,
        rewriteUseful: rewriteUseful || "YES",
        reportedIssues: taxonomyIssues,
      });
      setSubmitted(true);
    } catch (_) {
      setSubmitted(true);
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mt-3 p-3 rounded-xl bg-slate-50 dark:bg-slate-900/60 border border-slate-200 dark:border-slate-800 text-xs">
      <div className="flex flex-col gap-2.5">
        {/* Question 1: Meaning Preservation */}
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5">
            <span className="text-indigo-600 dark:text-indigo-400">✨</span>
            <span>Beta Check: Was meaning & evidence preserved?</span>
          </span>

          <div className="flex items-center gap-1.5">
            {(["YES", "NO", "NOT_SURE"] as const).map((choice) => (
              <button
                key={choice}
                type="button"
                onClick={() => setMeaningPreserved(choice)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold transition-all cursor-pointer ${
                  meaningPreserved === choice
                    ? choice === "YES"
                      ? "bg-emerald-600 text-white"
                      : choice === "NO"
                      ? "bg-rose-600 text-white"
                      : "bg-amber-600 text-white"
                    : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                }`}
              >
                {choice === "YES" ? "👍 Yes" : choice === "NO" ? "👎 No" : "🤔 Not Sure"}
              </button>
            ))}
          </div>
        </div>

        {/* Question 2: Usefulness */}
        {meaningPreserved && (
          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-200/60 dark:border-slate-800/60">
            <span className="text-slate-600 dark:text-slate-400 text-[11px]">
              Was this rewrite helpful for your draft?
            </span>
            <div className="flex items-center gap-1.5">
              {(["YES", "NO", "NOT_SURE"] as const).map((choice) => (
                <button
                  key={choice}
                  type="button"
                  onClick={() => setRewriteUseful(choice)}
                  className={`px-2 py-0.5 rounded-md text-[10px] font-semibold transition-all cursor-pointer ${
                    rewriteUseful === choice
                      ? "bg-indigo-600 text-white"
                      : "bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100"
                  }`}
                >
                  {choice === "YES" ? "Yes" : choice === "NO" ? "No" : "Unsure"}
                </button>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Expanded Failure Reason Checklist */}
      {(meaningPreserved === "NO" || meaningPreserved === "NOT_SURE") && (
        <form onSubmit={handleSubmit} className="mt-2.5 pt-2 border-t border-slate-200 dark:border-slate-800 flex flex-col gap-2">
          <span className="text-[11px] text-slate-500 dark:text-slate-400">
            What was affected? (Select all that apply)
          </span>

          <div className="flex flex-wrap gap-1.5">
            {[
              "Meaning / Claim Shift",
              "Citation / Number Modified",
              "Terminology Altered",
              "Grammar / Coherence",
              "Style / Register Issue",
              "Author Voice Discrepancy",
            ].map((tag) => (
              <button
                key={tag}
                type="button"
                onClick={() => toggleIssue(tag)}
                className={`px-2 py-0.5 rounded-md text-[10px] font-medium border transition-all cursor-pointer ${
                  selectedIssues.includes(tag)
                    ? "bg-indigo-50 dark:bg-indigo-950/50 border-indigo-500 text-indigo-700 dark:text-indigo-300"
                    : "bg-white dark:bg-slate-800 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400"
                }`}
              >
                {selectedIssues.includes(tag) ? `✓ ${tag}` : `+ ${tag}`}
              </button>
            ))}
          </div>

          <div className="flex justify-end mt-1">
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
            >
              {isSubmitting ? "Submitting..." : "Submit Feedback"}
            </button>
          </div>
        </form>
      )}

      {meaningPreserved === "YES" && !submitted && (
        <div className="flex justify-end mt-2">
          <button
            type="button"
            onClick={handleSubmit}
            disabled={isSubmitting}
            className="px-3 py-1 text-[11px] font-semibold text-white bg-indigo-600 hover:bg-indigo-700 dark:bg-indigo-500 rounded-lg shadow-xs disabled:opacity-50 cursor-pointer"
          >
            {isSubmitting ? "Submitting..." : "Submit Feedback"}
          </button>
        </div>
      )}
    </div>
  );
}
