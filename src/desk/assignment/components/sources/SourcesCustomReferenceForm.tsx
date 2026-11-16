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
              <div className="p-5 rounded-2xl border-2 border-neutral-900 dark:border-white bg-white dark:bg-ink-750 shadow-md space-y-4 animate-in fade-in duration-150">
                <div className="flex items-center justify-between border-b border-neutral-100 dark:border-white/5 pb-3">
                  <div className="flex items-center gap-2">
                    <Plus className="w-4 h-4 text-emerald-600" />
                    <h3 className="text-xs font-bold text-neutral-900 dark:text-white uppercase tracking-wider">
                      Add Custom Academic Reference
                    </h3>
                  </div>
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="p-1 rounded-lg text-neutral-400 hover:text-neutral-600 dark:hover:text-neutral-200 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3 text-xs">
                  <div className="sm:col-span-2 md:col-span-3 space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Source Title *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Quantum Computation and Quantum Information"
                      value={customForm.title}
                      onChange={(e) => setCustomForm({ ...customForm, title: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                      autoFocus
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Authors (separate people with ; or ,)
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Nielsen, M. A., Chuang, I. L."
                      value={customForm.authors}
                      onChange={(e) => setCustomForm({ ...customForm, authors: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Publication Year
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 2010"
                      value={customForm.year}
                      onChange={(e) => setCustomForm({ ...customForm, year: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Source Type
                    </label>
                    <select
                      value={customForm.type}
                      onChange={(e) => setCustomForm({ ...customForm, type: e.target.value as SourceAcademicType })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
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
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Journal / Publisher / Venue
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. Cambridge University Press"
                      value={customForm.journal}
                      onChange={(e) => setCustomForm({ ...customForm, journal: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Volume, Issue, or Pages
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10th Anniversary edn. pp. 124–134"
                      value={customForm.volumeIssue}
                      onChange={(e) => setCustomForm({ ...customForm, volumeIssue: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      DOI or URL
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. 10.1017/CBO9780511976667"
                      value={customForm.doi}
                      onChange={(e) => setCustomForm({ ...customForm, doi: e.target.value })}
                      className="w-full px-2.5 py-1.5 rounded-lg border border-neutral-300 dark:border-white/20 bg-white dark:bg-neutral-800 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500"
                    />
                  </div>

                  <div className="sm:col-span-2 md:col-span-3 space-y-1">
                    <label className="text-[11px] font-semibold text-neutral-700 dark:text-neutral-300">
                      Full Citation String (Harvard Reference Format)
                    </label>
                    <textarea
                      rows={2}
                      placeholder="e.g. Nielsen, M. A. and Chuang, I. L. (2010) Quantum Computation and Quantum Information. 10th Anniversary edn. Cambridge: Cambridge University Press."
                      value={customForm.citation}
                      onChange={(e) => setCustomForm({ ...customForm, citation: e.target.value })}
                      className="w-full text-xs font-serif p-2.5 rounded-xl border border-neutral-300 dark:border-white/20 bg-neutral-50/50 dark:bg-white/5 text-neutral-900 dark:text-white focus:outline-none focus:ring-1 focus:ring-emerald-500 leading-relaxed"
                    />
                  </div>
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-neutral-100 dark:border-white/5">
                  <button
                    type="button"
                    onClick={() => setIsAddingCustom(false)}
                    className="px-4 py-2 rounded-lg text-xs font-medium border border-neutral-200 dark:border-white/10 text-neutral-600 dark:text-neutral-400 hover:bg-neutral-50 dark:hover:bg-white/5 cursor-pointer"
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
