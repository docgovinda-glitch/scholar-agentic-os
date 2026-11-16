import {
Sparkles,RefreshCw
} from "lucide-react";

export interface SourcesFindMoreProps {
  handleFindMoreLiterature: () => Promise<void>;
  isFindingMore: boolean;
}

export function SourcesFindMore({ handleFindMoreLiterature, isFindingMore }: SourcesFindMoreProps) {
  return (
    <>
            {/* Find More Literature Action Section */}
            <div className="pt-4 flex flex-col items-center justify-center gap-2 border-t border-neutral-100 dark:border-white/5">
              <button
                type="button"
                onClick={handleFindMoreLiterature}
                disabled={isFindingMore}
                data-testid="find-more-literature-btn"
                className="px-6 py-3 rounded-full text-xs font-semibold border border-neutral-300 dark:border-white/20 bg-white dark:bg-ink-750 text-neutral-800 dark:text-white hover:bg-neutral-50 dark:hover:bg-white/5 hover:border-neutral-400 transition-all cursor-pointer flex items-center gap-2 shadow-xs dark:shadow-none disabled:opacity-50"
              >
                {isFindingMore ? (
                  <>
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                    <span>Querying scholarly indices & cross-referencing citations...</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-neutral-500" />
                    <span>Find More Literature (+10 Sources)</span>
                  </>
                )}
              </button>
              <p className="text-[11px] text-neutral-400 dark:text-neutral-500">
                Progressively discovers additional peer-reviewed articles, books, and reports without duplicating existing sources.
              </p>
            </div>
    </>
  );
}
