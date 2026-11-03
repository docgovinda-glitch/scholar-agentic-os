import { useMemo } from "react";
import { Check, HelpCircle, Sparkles } from "lucide-react";
import { DISCIPLINES, disciplineById, scopeBrief, scopingQuestions, type BriefScope, type ScopeQuestion } from "../../../domain/assignment/briefScoping";

const LEVEL: Record<string, string> = { high_school: "High school", undergraduate: "Undergraduate", postgraduate: "Postgraduate", doctoral: "Doctoral" };
const TYPE: Record<string, string> = {
  essay: "Essay",
  critical_essay: "Critical essay",
  argumentative_essay: "Argumentative essay",
  literature_review: "Literature review",
  research_paper: "Research paper",
  case_study: "Case study",
  report: "Report",
  policy_analysis: "Policy analysis",
  business_assignment: "Business assignment",
};
const STYLE: Record<string, string> = { apa7: "APA 7th", mla9: "MLA 9th", chicago: "Chicago", harvard: "Harvard", ieee: "IEEE", vancouver: "Vancouver" };

/**
 * What the brief says, read before anything is built, and at most two quick
 * questions about what it leaves open. Answers and stated details shape the
 * breakdown; everything else stays a default the student can change.
 */
export default function BriefScopePanel({
  brief,
  discipline,
  assignmentType,
  onAnswer,
}: {
  brief: string;
  /** The subject the student chose, if any (overrides what was detected). */
  discipline?: string;
  assignmentType?: string;
  onAnswer: (q: ScopeQuestion["id"], value: string) => void;
}) {
  const scope: BriefScope = useMemo(() => scopeBrief(brief), [brief]);
  const questions = scopingQuestions(scope, { discipline: discipline || undefined, assignmentType: scope.assignmentType ? undefined : assignmentType || undefined });
  const subject = disciplineById(discipline || scope.discipline);

  if (brief.trim().length < 10) return null;

  const found: Array<[string, string, string | undefined]> = [];
  if (scope.discipline) found.push(["Subject", disciplineById(scope.discipline)!.label.split(" (")[0], scope.evidence.discipline]);
  if (scope.assignmentType) found.push(["Task", TYPE[scope.assignmentType], scope.evidence.assignmentType]);
  if (scope.level) found.push(["Level", LEVEL[scope.level], scope.evidence.level]);
  if (scope.wordCount) found.push(["Length", `${scope.wordCount.toLocaleString()} words`, scope.evidence.wordCount]);
  if (scope.citationStyle) found.push(["Referencing", STYLE[scope.citationStyle], scope.evidence.citationStyle]);
  if (scope.hasRubric) found.push(["Marking criteria", "Included in the brief", scope.evidence.rubric]);

  return (
    <section aria-label="What I read in your brief" className="rounded-xl border border-neutral-200/80 dark:border-white/10 bg-neutral-50/70 dark:bg-white/[0.03] p-4 space-y-3" data-testid="brief-scope">
      {found.length > 0 && (
        <div className="space-y-1.5">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-neutral-500 dark:text-neutral-400">From your brief</p>
          <ul className="flex flex-wrap gap-1.5">
            {found.map(([k, v, words]) => (
              <li key={k} className="inline-flex items-center gap-1 px-2 py-1 rounded-lg text-xs bg-white dark:bg-white/5 border border-neutral-200/80 dark:border-white/10" title={words ? `Your brief says: “${words}”` : undefined}>
                <Check className="w-3 h-3 text-emerald-500" aria-hidden="true" />
                <span className="text-neutral-500 dark:text-neutral-400">{k}:</span>
                <span className="font-medium text-neutral-900 dark:text-neutral-100">{v}</span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {questions.map((q) => (
        <div key={q.id} className="space-y-1.5" role="group" aria-label={q.question}>
          <p className="text-xs font-semibold text-neutral-900 dark:text-neutral-100 flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-sky-500" aria-hidden="true" />
            {q.question}
          </p>
          <div className="flex flex-wrap gap-1.5">
            {q.options.map((o) => (
              <button
                key={o.id}
                type="button"
                onClick={() => onAnswer(q.id, o.id)}
                className="px-2.5 py-1 rounded-lg text-xs border border-neutral-200/80 dark:border-white/10 bg-white dark:bg-ink-600 hover:border-neutral-400 dark:hover:border-white/30 text-neutral-800 dark:text-neutral-200 cursor-pointer"
              >
                {o.label}
              </button>
            ))}
            <button
              type="button"
              onClick={() => onAnswer(q.id, q.assume.id)}
              className="px-2.5 py-1 rounded-lg text-xs text-neutral-500 dark:text-neutral-400 underline cursor-pointer"
            >
              Not sure: assume {q.assume.label}
            </button>
          </div>
        </div>
      ))}

      {subject && (
        <p className="text-xs text-neutral-700 dark:text-neutral-300 flex items-start gap-1.5" data-testid="brief-approach">
          <Sparkles className="w-3.5 h-3.5 text-amber-500 shrink-0 mt-0.5" aria-hidden="true" />
          <span>
            The breakdown will follow {subject.approach}. Subject:{" "}
            <label className="inline-flex items-center gap-1 text-neutral-500 dark:text-neutral-400">
              <span className="sr-only">Subject area</span>
              <select
                aria-label="Subject area"
                value={subject.id}
                onChange={(e) => onAnswer("discipline", e.target.value)}
                className="bg-transparent underline cursor-pointer text-xs"
              >
                {DISCIPLINES.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.label.split(" (")[0]}
                  </option>
                ))}
              </select>
            </label>
          </span>
        </p>
      )}
    </section>
  );
}
