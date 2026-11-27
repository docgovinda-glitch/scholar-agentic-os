import { BookOpen, Loader2, PenLine, Scale, Search } from "lucide-react";

export interface ResearchActivityItem {
  kind: "search" | "read" | "check" | "write";
  text: string;
}

const ICONS = { search: Search, read: BookOpen, check: Scale, write: PenLine } as const;
const VERB = { search: "Searching", read: "Reading", check: "Checking", write: "Writing" } as const;

/**
 * Deep Research's live feed: each search sent, source read, cross-check and the writing step, as the
 * server reports them (SSE `activity` events). Only real steps are listed; nothing is timed or made up.
 * The newest line carries the spinner; older lines fade. Once the report's words stream, the feed folds
 * into one line of counts.
 */
export function ResearchActivityFeed({ items, writing, max = 6 }: { items: ResearchActivityItem[]; writing: boolean; max?: number }) {
  if (items.length === 0) return null;
  const searches = items.filter((i) => i.kind === "search").length;
  const reads = items.filter((i) => i.kind === "read").length;

  if (writing) {
    return (
      <p data-testid="research-activity-summary" className="text-xs text-[color:var(--text-muted)]">
        Researched with {searches} {searches === 1 ? "search" : "searches"} and {reads} {reads === 1 ? "source" : "sources"} read
      </p>
    );
  }

  const shown = items.slice(-max);
  return (
    <ol data-testid="research-activity-feed" aria-label="Research activity" className="space-y-1.5">
      {shown.map((item, i) => {
        const latest = i === shown.length - 1;
        const Icon = latest ? Loader2 : ICONS[item.kind];
        return (
          <li
            key={`${items.length - shown.length + i}-${item.text}`}
            className={`flex min-w-0 items-start gap-2 text-[13px] leading-snug transition-opacity duration-300 animate-in fade-in ${
              latest ? "text-[color:var(--text-primary)]" : "text-[color:var(--text-muted)]"
            }`}
          >
            <Icon className={`mt-0.5 h-3.5 w-3.5 shrink-0 ${latest ? "animate-spin text-[color:var(--research)]" : ""}`} aria-hidden="true" />
            <span className="min-w-0 flex-1 truncate">
              <span className="font-medium">{VERB[item.kind]}</span>{" "}
              {item.kind === "search" ? `“${item.text}”` : item.text}
            </span>
          </li>
        );
      })}
    </ol>
  );
}
