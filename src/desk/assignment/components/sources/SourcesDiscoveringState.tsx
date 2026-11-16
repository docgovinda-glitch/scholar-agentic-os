import {
Search
} from "lucide-react";

export function SourcesDiscoveringState() {
  return (
    <>
        <div
          data-testid="sources-discovering-state"
          className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-8 sm:p-12 shadow-xs dark:shadow-none"
        >
          <div className="flex flex-col items-center justify-center space-y-4 py-8">
            <div className="relative">
              <div className="w-12 h-12 rounded-full border-2 border-emerald-500/30 border-t-emerald-500 animate-spin" />
              <Search className="w-5 h-5 text-emerald-500 absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2" />
            </div>
            <h3 className="text-base font-semibold text-[color:var(--text-primary)]">
              Discovering Scholarly Sources
            </h3>
            <p className="text-xs text-[color:var(--text-muted)] text-center max-w-md">
              Searching OpenAlex, CrossRef, DOAJ, DataCite & arXiv for peer-reviewed literature matching your assignment prompt…
            </p>
          </div>
        </div>
    </>
  );
}
