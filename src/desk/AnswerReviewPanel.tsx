import { AlertTriangle, CheckCircle2, CircleSlash, ShieldCheck } from "lucide-react";
import { buildAnswerTelemetry, type TelemetrySource } from "../domain/ask/answerTelemetry";

export interface VerifiedPeerReviewAudit {
  overallVerdict: string;
  critiques: Array<{ type: string; title: string; explanation: string; severity: "low" | "medium" | "high" }>;
  methodologicalStrengths: string[];
  counterTheories: string[];
}

interface AnswerReviewPanelProps {
  prompt: string;
  answerText: string;
  retrieved: TelemetrySource[];
  cited: TelemetrySource[];
  /** Present only when a real model verification pass ran on this answer and its sources. */
  audit?: VerifiedPeerReviewAudit;
}

const SEVERITY: Record<"low" | "medium" | "high", string> = {
  high: "bg-rose-50 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300",
  medium: "bg-amber-50 dark:bg-amber-950/40 text-amber-700 dark:text-amber-300",
  low: "bg-sky-50 dark:bg-sky-950/40 text-sky-700 dark:text-sky-300",
};

/** Review tab: measured facts about this answer, plus a stress-test only when one really ran. */
export function AnswerReviewPanel({ prompt, answerText, retrieved, cited, audit }: AnswerReviewPanelProps) {
  const t = buildAnswerTelemetry({ prompt, answerText, retrieved, cited });
  const card = "p-3 rounded-xl bg-neutral-50/80 dark:bg-white/[0.03] border border-neutral-200/70 dark:border-white/10";

  return (
    <div className="space-y-3 pt-1" data-testid="answer-review-panel">
      <div className="flex items-center gap-1.5 text-xs font-semibold text-neutral-800 dark:text-neutral-200">
        <ShieldCheck className="w-3.5 h-3.5 text-emerald-500" />
        <span>Answer review: measured from this answer</span>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        {[
          ["Retrieved", t.retrieved],
          ["Cited", t.cited],
          ["Full text", t.fullText],
          ["Abstract only", t.abstractOnly],
        ].map(([label, value]) => (
          <div key={label} className={card}>
            <div className="text-[10px] font-semibold uppercase tracking-wider text-neutral-500">{label}</div>
            <div className="text-sm font-bold text-neutral-900 dark:text-neutral-100">{value}</div>
          </div>
        ))}
      </div>

      {t.looksTruncated && (
        <div className="flex items-start gap-2 text-[11px] text-amber-800 dark:text-amber-300">
          <AlertTriangle className="w-3.5 h-3.5 mt-0.5 shrink-0" />
          <span>This answer ends mid-sentence and may be incomplete.</span>
        </div>
      )}

      <div className={`${card} space-y-2`}>
        <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">Query coverage check</div>
        {t.covered.length === 0 && t.missing.length === 0 ? (
          <p className="text-[11px] text-neutral-500">No distinct topics could be identified in the question.</p>
        ) : (
          <ul className="space-y-1 text-[11px]">
            {t.covered.map((topic) => (
              <li key={`c-${topic}`} className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-500 shrink-0" />
                <span>{topic}</span>
                <span className="text-neutral-400">found in retrieved sources</span>
              </li>
            ))}
            {t.missing.map((topic) => (
              <li key={`m-${topic}`} className="flex items-center gap-1.5 text-neutral-700 dark:text-neutral-300">
                <CircleSlash className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                <span>{topic}</span>
                <span className="text-neutral-400">not found in retrieved sources</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      {audit ? (
        <div className={`${card} space-y-2`}>
          <div className="text-[11px] font-semibold text-neutral-800 dark:text-neutral-200">
            Peer Reviewer 2 stress-test (model-verified): {audit.overallVerdict}
          </div>
          {audit.critiques.map((c, i) => (
            <div key={i} className="p-2.5 rounded-lg bg-white dark:bg-neutral-800/60 border border-neutral-200/60 dark:border-white/5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold text-neutral-900 dark:text-neutral-100">{c.title}</span>
                <span className={`text-[9px] font-semibold px-1.5 py-0.5 rounded ${SEVERITY[c.severity]}`}>{c.severity.toUpperCase()}</span>
              </div>
              <p className="text-[10.5px] text-neutral-600 dark:text-neutral-300 leading-relaxed">{c.explanation}</p>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[10.5px] text-neutral-500">
          No peer-review stress-test has been run on this answer, so none is shown.
        </p>
      )}
    </div>
  );
}
