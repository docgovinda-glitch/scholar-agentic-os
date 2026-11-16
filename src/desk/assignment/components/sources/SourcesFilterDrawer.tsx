import type { SourceSort } from "../../services/sourceFilters";
import type { SetStateAction } from "react";
import {
Unlock,
RotateCcw
} from "lucide-react";

export interface SourcesFilterDrawerProps {
  activeFilterCount: number;
  minRelevance: number;
  openAccessOnly: boolean;
  resetAllFilters: () => void;
  selectedMethodology: string;
  selectedRole: string;
  selectedType: string;
  selectedYearRange: string;
  setMinRelevance: (value: SetStateAction<number>) => void;
  setOpenAccessOnly: (value: SetStateAction<boolean>) => void;
  setSelectedMethodology: (value: SetStateAction<string>) => void;
  setSelectedRole: (value: SetStateAction<string>) => void;
  setSelectedType: (value: SetStateAction<string>) => void;
  setSelectedYearRange: (value: SetStateAction<string>) => void;
  setSortBy: (value: SetStateAction<"relevance" | "citations" | "year" | "title" | "role">) => void;
  showAdvancedFilters: boolean;
  sortBy: "relevance" | "citations" | "year" | "title" | "role";
}

export function SourcesFilterDrawer({ activeFilterCount, minRelevance, openAccessOnly, resetAllFilters, selectedMethodology, selectedRole, selectedType, selectedYearRange, setMinRelevance, setOpenAccessOnly, setSelectedMethodology, setSelectedRole, setSelectedType, setSelectedYearRange, setSortBy, showAdvancedFilters, sortBy }: SourcesFilterDrawerProps) {
  return (
    <>
            {/* Expandable Advanced Filtering Drawer */}
            {showAdvancedFilters && (
              <div className="p-4 rounded-2xl bg-[color:var(--surface-inset)] border border-[color:var(--border-subtle)] space-y-3 animate-in fade-in duration-150">
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3 text-xs">
                  {/* Filter 1: Source Type */}
                  <div className="space-y-1">
                    <label htmlFor="filter-source-type" className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Source Type
                    </label>
                    <select
                      id="filter-source-type"
                      aria-label="Source Type"
                      value={selectedType}
                      onChange={(e) => setSelectedType(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value="all">All Source Types</option>
                      <option value="journal">Peer-Reviewed Journals</option>
                      <option value="book">Academic Books & Presses</option>
                      <option value="conference">Conference Proceedings</option>
                      <option value="institutional">Institutional Research</option>
                      <option value="report">Policy & Intergov Reports</option>
                    </select>
                  </div>

                  {/* Filter 2: Role in Assignment */}
                  <div className="space-y-1">
                    <label htmlFor="filter-assignment-role" className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Role in Assignment
                    </label>
                    <select
                      id="filter-assignment-role"
                      aria-label="Role in Assignment"
                      value={selectedRole}
                      onChange={(e) => setSelectedRole(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value="all">All Assignment Roles</option>
                      <option value="Empirical evidence">Empirical Evidence</option>
                      <option value="Theoretical framework">Theoretical Framework</option>
                      <option value="Comparative evidence">Comparative Evidence</option>
                      <option value="Core theory">Core Theory (Seminal)</option>
                      <option value="Methodological framework">Methodological Framework</option>
                      <option value="Contextual evidence">Contextual Evidence</option>
                    </select>
                  </div>

                  {/* Filter 3: Research Methodology */}
                  <div className="space-y-1">
                    <label htmlFor="filter-methodology" className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Research Methodology
                    </label>
                    <select
                      id="filter-methodology"
                      aria-label="Research Methodology"
                      value={selectedMethodology}
                      onChange={(e) => setSelectedMethodology(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value="all">All Methodologies</option>
                      <option value="Empirical Study">Empirical Study</option>
                      <option value="Quantitative Meta-Analysis">Quantitative Meta-Analysis</option>
                      <option value="Qualitative Case Study">Qualitative Case Study</option>
                      <option value="Systematic Review">Systematic Review</option>
                      <option value="Theoretical Framework">Theoretical Framework</option>
                      <option value="Doctrinal Analysis">Doctrinal Analysis</option>
                      <option value="Comparative Analysis">Comparative Analysis</option>
                      <option value="Mixed-Methods">Mixed-Methods</option>
                    </select>
                  </div>

                  {/* Filter 4: Publication Year */}
                  <div className="space-y-1">
                    <label htmlFor="filter-publication-year" className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Publication Year
                    </label>
                    <select
                      id="filter-publication-year"
                      aria-label="Publication Year"
                      value={selectedYearRange}
                      onChange={(e) => setSelectedYearRange(e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value="all">All Publication Years</option>
                      <option value="2026">Latest (2026)</option>
                      <option value="recent">Recent (2024–2026)</option>
                      <option value="2020-2023">Contemporary (2020–2023)</option>
                      <option value="seminal">Foundational (&lt; 2020)</option>
                    </select>
                  </div>

                  {/* Filter 5: Sort Order */}
                  <div className="space-y-1">
                    <label htmlFor="filter-sort-order" className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Sort Order
                    </label>
                    <select
                      id="filter-sort-order"
                      aria-label="Sort Order"
                      value={sortBy}
                      onChange={(e) => setSortBy(e.target.value as SourceSort)}
                      className="w-full px-2.5 py-1.5 rounded-xl bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] text-[color:var(--text-primary)] outline-none cursor-pointer"
                    >
                      <option value="relevance">Question Alignment & Recency (Default)</option>
                      <option value="year">Newest First (2026 First)</option>
                      <option value="citations">Most Cited (Citation Impact)</option>
                      <option value="role">Role in Assignment</option>
                      <option value="title">Title (Alphabetical)</option>
                    </select>
                  </div>
                </div>

                {/* Row 2: Toggles and Reset */}
                <div className="flex items-center justify-between gap-4 pt-2 border-t border-[color:var(--border-subtle)] flex-wrap">
                  <div className="flex items-center gap-4 flex-wrap">
                    <label className="flex items-center gap-2 cursor-pointer text-xs text-[color:var(--text-secondary)]">
                      <input
                        type="checkbox"
                        checked={openAccessOnly}
                        onChange={(e) => setOpenAccessOnly(e.target.checked)}
                        className="w-4 h-4 rounded text-[color:var(--text-primary)] focus:ring-0 cursor-pointer"
                      />
                      <span className="flex items-center gap-1 font-medium">
                        <Unlock className="w-3 h-3 text-amber-500" />
                        <span>Open-Access Sources Only</span>
                      </span>
                    </label>

                    <div className="flex items-center gap-1.5 text-xs text-[color:var(--text-secondary)]">
                      <span>Min Relevance:</span>
                      {[0, 85, 90, 95].map((thresh) => (
                        <button
                          key={thresh}
                          type="button"
                          onClick={() => setMinRelevance(thresh)}
                          className={`px-2 py-0.5 rounded text-xs font-mono cursor-pointer transition-colors ${
                            minRelevance === thresh
                              ? "bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] font-bold"
                              : "bg-[color:var(--surface-sunken)]/60 text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)]"
                          }`}
                        >
                          {thresh === 0 ? "Any" : `${thresh}%+`}
                        </button>
                      ))}
                    </div>
                  </div>

                  {activeFilterCount > 0 && (
                    <button
                      type="button"
                      onClick={resetAllFilters}
                      className="text-xs text-red-600 dark:text-red-400 hover:underline flex items-center gap-1 cursor-pointer font-medium"
                    >
                      <RotateCcw className="w-3 h-3" />
                      <span>Reset all filters</span>
                    </button>
                  )}
                </div>
              </div>
            )}
    </>
  );
}
