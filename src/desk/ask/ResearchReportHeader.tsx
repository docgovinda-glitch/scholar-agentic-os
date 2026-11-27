import { Compass } from "lucide-react";

export interface ResearchReportFacts {
  /** Sources the run found and read (before choosing which to cite). */
  found?: number;
  /** Sources read in full, not only their abstract. */
  readInFull?: number;
  /** Sources the report cites. */
  cited?: number;
}

/**
 * The line above a Deep Research report: what it is and what it rests on, in counts the run recorded
 * (nothing estimated). A count that is unknown or zero is left out.
 */
export function ResearchReportHeader({ found, readInFull, cited }: ResearchReportFacts) {
  const facts = [
    typeof found === "number" && found > 0 ? `${found} sources found` : null,
    typeof readInFull === "number" && readInFull > 0 ? `${readInFull} read in full` : null,
    typeof cited === "number" && cited > 0 ? `${cited} cited` : null,
  ].filter((f): f is string => Boolean(f));
  return (
    <div data-testid="research-report-header" className="mb-3 flex flex-wrap items-center gap-x-2.5 gap-y-1">
      <span className="inline-flex items-center gap-1.5 rounded-full bg-[color:var(--research-subtle)] px-2.5 py-1 text-xs font-semibold text-[color:var(--research)]">
        <Compass className="h-3.5 w-3.5" aria-hidden="true" />
        Deep Research
      </span>
      {facts.length > 0 && <span className="text-xs text-[color:var(--text-muted)]">{facts.join(" · ")}</span>}
    </div>
  );
}
