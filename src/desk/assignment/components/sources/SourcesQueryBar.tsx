import type { SetStateAction } from "react";
import {
Sparkles,RefreshCw
} from "lucide-react";

export interface SourcesQueryBarProps {
  aiSearchPrompt: string;
  handleAISearchLiterature: (customQuery?: string) => Promise<void>;
  isAISearching: boolean;
  setAiSearchPrompt: (value: SetStateAction<string>) => void;
}

export function SourcesQueryBar({ aiSearchPrompt, handleAISearchLiterature, isAISearching, setAiSearchPrompt }: SourcesQueryBarProps) {
  return (
    <>
            {/* Targeted database search: the phrase is searched together with the assignment question */}
            <div className="p-3.5 sm:p-4 rounded-2xl bg-gradient-to-r from-purple-500/[0.07] via-indigo-500/[0.04] to-blue-500/[0.07] dark:from-purple-500/10 dark:via-indigo-500/10 dark:to-blue-500/10 border border-purple-500/20 dark:border-purple-500/30 space-y-3 shadow-2xs">
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
                <div className="relative flex-1">
                  <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={aiSearchPrompt}
                    onChange={(e) => setAiSearchPrompt(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        handleAISearchLiterature();
                      }
                    }}
                    aria-label="Search academic databases"
                    placeholder="Search the databases for more (e.g. 'empirical studies', 'criticism of …', 'recent data')"
                    className="w-full pl-10 pr-4 py-2 rounded-xl text-xs bg-[color:var(--surface-raised)] border border-purple-200 dark:border-purple-900/40 focus:border-purple-500 text-[color:var(--text-primary)] placeholder-neutral-400 outline-none shadow-2xs"
                  />
                </div>
                <button
                  type="button"
                  onClick={() => handleAISearchLiterature()}
                  disabled={isAISearching || !aiSearchPrompt.trim()}
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-purple-600 hover:bg-purple-700 text-white transition-colors cursor-pointer flex items-center justify-center gap-1.5 shadow-xs disabled:opacity-50 shrink-0"
                >
                  {isAISearching ? (
                    <>
                      <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                      <span>Searching…</span>
                    </>
                  ) : (
                    <>
                      <Sparkles className="w-3.5 h-3.5" />
                      <span>Search</span>
                    </>
                  )}
                </button>
              </div>

              {/* Quick Discovery Topic Chips */}
              <div className="flex items-center gap-1.5 flex-wrap text-xs">
                <span className="text-[color:var(--text-muted)] font-medium mr-1">Quick searches:</span>
                {[
                  "Theoretical frameworks",
                  `Recent evidence (${new Date().getFullYear() - 3}–${new Date().getFullYear()})`,
                  "Criticism and counter-arguments",
                  "Policy and institutional reports",
                ].map((promptChip) => (
                  <button
                    key={promptChip}
                    type="button"
                    disabled={isAISearching}
                    onClick={() => handleAISearchLiterature(promptChip)}
                    className="px-2.5 py-1 rounded-lg bg-white/90 dark:bg-white/10 hover:bg-purple-100 dark:hover:bg-purple-950/40 text-[color:var(--text-secondary)] border border-[color:var(--border-subtle)] text-xs font-medium transition-colors cursor-pointer disabled:opacity-50"
                  >
                    + {promptChip}
                  </button>
                ))}
              </div>
            </div>
    </>
  );
}
