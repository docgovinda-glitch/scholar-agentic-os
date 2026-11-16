import type { SetStateAction } from "react";
import type {
DiscoveredSource
} from "../../types";
import {
CheckCircle2,
Sparkles,
Search,RefreshCw,Star,
SlidersHorizontal,BookOpen,
FolderOpen,
X,Plus
} from "lucide-react";

export interface SourcesFilterBarProps {
  activeFilterCount: number;
  activeTab: "all" | "curated" | "ask_scholar" | "ai_research" | "uploaded" | "approved" | "bookmarked" | "excluded";
  aiResearchCount: number;
  approvedSourceIds: string[];
  askScholarCount: number;
  bookmarkedIds: string[];
  excludedIds: string[];
  handleReCurateForPrompt: () => Promise<void>;
  isFindingMore: boolean;
  mappedUserSources: DiscoveredSource[];
  searchQuery: string;
  setActiveTab: (value: SetStateAction<"all" | "curated" | "ask_scholar" | "ai_research" | "uploaded" | "approved" | "bookmarked" | "excluded">) => void;
  setIsAddingCustom: (value: SetStateAction<boolean>) => void;
  setSearchQuery: (value: SetStateAction<string>) => void;
  setShowAdvancedFilters: (value: SetStateAction<boolean>) => void;
  showAdvancedFilters: boolean;
  totalActiveSources: number;
  totalCuratedCount: number;
}

export function SourcesFilterBar({ activeFilterCount, activeTab, aiResearchCount, approvedSourceIds, askScholarCount, bookmarkedIds, excludedIds, handleReCurateForPrompt, isFindingMore, mappedUserSources, searchQuery, setActiveTab, setIsAddingCustom, setSearchQuery, setShowAdvancedFilters, showAdvancedFilters, totalActiveSources, totalCuratedCount }: SourcesFilterBarProps) {
  return (
    <>
            {/* Filter Navigation Bar & Status Tabs */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-2">
              {/* Status Tabs */}
              <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0 scrollbar-none">
                <button
                  type="button"
                  onClick={() => setActiveTab("all")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === "all"
                      ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] shadow-xs dark:shadow-none"
                      : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  All Sources ({totalActiveSources})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("ask_scholar")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "ask_scholar"
                      ? "bg-purple-600 text-white shadow-xs dark:shadow-none"
                      : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  <BookOpen className="w-3.5 h-3.5" />
                  <span>Ask Scholar</span>
                  <span className="px-1.5 py-0.2 rounded-full text-xs bg-black/15 text-current">
                    {askScholarCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("ai_research")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "ai_research"
                      ? "bg-indigo-600 text-white shadow-xs dark:shadow-none"
                      : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>AI Research</span>
                  <span className="px-1.5 py-0.2 rounded-full text-xs bg-black/15 text-current">
                    {aiResearchCount}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("curated")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                    activeTab === "curated"
                      ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] shadow-xs dark:shadow-none"
                      : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  Curated Literature ({totalCuratedCount})
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("uploaded")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "uploaded"
                      ? "bg-blue-600 text-white shadow-xs dark:shadow-none"
                      : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  <FolderOpen className="w-3.5 h-3.5" />
                  <span>My Uploads</span>
                  <span className="px-1.5 py-0.2 rounded-full text-xs bg-black/15 text-current">
                    {mappedUserSources.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("approved")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "approved"
                      ? "bg-emerald-700 text-white shadow-xs dark:shadow-none"
                      : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Approved</span>
                  <span className="px-1.5 py-0.2 rounded-full text-xs bg-black/15 text-current">
                    {approvedSourceIds.length}
                  </span>
                </button>

                <button
                  type="button"
                  onClick={() => setActiveTab("bookmarked")}
                  className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === "bookmarked"
                      ? "bg-amber-500 text-white shadow-xs dark:shadow-none"
                      : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                  }`}
                >
                  <Star className="w-3.5 h-3.5 fill-current" />
                  <span>Bookmarked</span>
                  <span className="px-1.5 py-0.2 rounded-full text-xs bg-black/15 text-current">
                    {bookmarkedIds.length}
                  </span>
                </button>

                {excludedIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab("excluded")}
                    className={`px-3 py-1.5 rounded-xl text-xs font-semibold transition-colors cursor-pointer flex items-center gap-1.5 whitespace-nowrap ${
                      activeTab === "excluded"
                        ? "bg-neutral-700 text-white shadow-xs dark:shadow-none"
                        : "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
                    }`}
                  >
                    <span>Excluded ({excludedIds.length})</span>
                  </button>
                )}
              </div>

              {/* Search Input, Filters, and Add Custom Reference Action */}
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(true)}
                  className="px-3.5 py-1.5 rounded-xl text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 transition-opacity flex items-center gap-1.5 cursor-pointer shadow-xs whitespace-nowrap"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>+ Add Reference</span>
                </button>

                <div className="relative flex-1 sm:w-60">
                  <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)]" />
                  <input
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Search authors, title, keyword..."
                    aria-label="Search curated literature"
                    className="w-full pl-8 pr-3 py-1.5 rounded-xl text-xs bg-[color:var(--surface-inset)] border border-transparent focus:border-neutral-300 dark:focus:border-white/20 text-[color:var(--text-primary)] placeholder-neutral-400 outline-none transition-colors"
                  />
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery("")}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-[color:var(--text-muted)] hover:text-neutral-600 dark:hover:text-neutral-200"
                    >
                      <X className="w-3 h-3" />
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setShowAdvancedFilters(!showAdvancedFilters)}
                  aria-label="Toggle advanced filters"
                  className={`px-3 py-1.5 rounded-xl text-xs font-medium border flex items-center gap-1.5 transition-colors cursor-pointer ${
                    showAdvancedFilters || activeFilterCount > 0
                      ? "border-[color:var(--accent-solid)] bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] font-semibold"
                      : "border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:border-neutral-300"
                  }`}
                >
                  <SlidersHorizontal className="w-3.5 h-3.5" />
                  <span className="hidden sm:inline">Filters</span>
                  {activeFilterCount > 0 && (
                    <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-xs flex items-center justify-center font-bold">
                      {activeFilterCount}
                    </span>
                  )}
                </button>

                <button
                  type="button"
                  onClick={handleReCurateForPrompt}
                  disabled={isFindingMore}
                  title="Re-curate literature specifically for your active assignment prompt"
                  className="px-2.5 py-1.5 rounded-xl text-xs font-medium border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-[color:var(--text-secondary)] hover:border-neutral-300 flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  <RefreshCw className={`w-3.5 h-3.5 ${isFindingMore ? "animate-spin" : ""}`} />
                  <span className="hidden sm:inline">Re-curate</span>
                </button>
              </div>
            </div>
    </>
  );
}
