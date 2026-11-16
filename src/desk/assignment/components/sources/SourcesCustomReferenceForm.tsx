import type { SetStateAction } from "react";
import type {
SourceAcademicType
} from "../../types";
import {
X,Plus
} from "lucide-react";

export interface SourcesCustomReferenceFormProps {
  customForm: { title: string; authors: string; year: string; type: SourceAcademicType; journal: string; volumeIssue: string; doi: string; citation: string; roleInAssignment: string; };
  handleAddCustomSource: () => Promise<void>;
  isAddingCustom: boolean;
  setCustomForm: (value: SetStateAction<{ title: string; authors: string; year: string; type: SourceAcademicType; journal: string; volumeIssue: string; doi: string; citation: string; roleInAssignment: string; }>) => void;
  setIsAddingCustom: (value: SetStateAction<boolean>) => void;
}

export function SourcesCustomReferenceForm({ customForm, handleAddCustomSource, isAddingCustom, setCustomForm, setIsAddingCustom }: SourcesCustomReferenceFormProps) {
  return (
    <>
            {/* Expandable Custom Reference Creation Form */}
            {isAddingCustom && (
              <div className="p-5 rounded-2xl border-2 border-neutral-900 dark:border-white bg-[color:var(--surface-raised)] shadow-md space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-[color:var(--border-subtle)] pb-3">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold text-[color:var(--text-primary)] uppercase tracking-wider">
                      Add Custom Academic Reference
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="p-1 rounded-lg text-[color:var(--text-muted)] hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2 md:col-span-3 space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Source Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Quantum Computation and Quantum Information"
                      value={customForm.title}
                      onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Authors (separate people with ; or ,)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Nielsen, M. A., Chuang, I. L."
                      value={customForm.authors}
                      onChange={(e) => setCustomForm({ ...customForm, authors: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Publication Year
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2010"
                      value={customForm.year}
                      onChange={(e) => setCustomForm({ ...customForm, year: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Source Type
                    </label>
                    <select
                      value={customForm.type}
                      onChange={(e) => setCustomForm({ ...customForm, type: e.target.value as SourceAcademicType })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    >
                      <option value="journal">Peer-Reviewed Journal</option>
                      <option value="book">Academic Book / University Press</option>
                      <option value="conference">Conference Proceedings</option>
                      <option value="institutional">Institutional / Government Report</option>
                      <option value="report">Policy Report / Working Paper</option>
                      <option value="web">Academic Web Resource / Dataset</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Journal / Publisher / Venue
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cambridge University Press"
                      value={customForm.journal}
                      onChange={(e) => setCustomForm({ ...customForm, journal: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Volume, Issue, or Pages
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10th Anniversary edn. pp. 124–134"
                      value={customForm.volumeIssue}
                      onChange={(e) => setCustomForm({ ...customForm, volumeIssue: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      DOI or URL
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10.1017/CBO9780511976667"
                      value={customForm.doi}
                      onChange={(e) => setCustomForm({ ...customForm, doi: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3 space-y-1">
                    <label className="text-xs font-semibold text-[color:var(--text-secondary)]">
                      Full Citation String (Harvard Reference Format)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Nielsen, M. A. and Chuang, I. L. (2010) Quantum Computation and Quantum Information. 10th Anniversary edn. Cambridge: Cambridge University Press."
                      value={customForm.citation}
                      onChange={(e) => setCustomForm({ ...customForm, citation: e.target.value })}
                      className="w-full text-xs font-serif p-2.5 rounded-xl border border-[color:var(--border-default)] bg-[color:var(--surface-inset)]/50 text-[color:var(--text-primary)] focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-[color:var(--border-subtle)]">
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] cursor-pointer"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleAddCustomSource}
                    disabled={!customForm.title.trim()}
                    className="px-5 py-2 rounded-lg text-xs font-semibold bg-emerald-600 hover:bg-emerald-700 text-white cursor-pointer transition-colors shadow-xs disabled:opacity-40"
                  >
                    Add & Approve Reference
                  </button>
                </div>
              </div>
            )}
    </>
  );
}
