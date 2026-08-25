import React, { useState } from "react";

interface LockedTermsManagerProps {
  lockedTerms: string[];
  onAddTerm: (term: string) => void;
  onRemoveTerm: (term: string) => void;
}

export default function LockedTermsManager({
  lockedTerms,
  onAddTerm,
  onRemoveTerm,
}: LockedTermsManagerProps) {
  const [inputValue, setInputValue] = useState("");
  const [isExpanded, setIsExpanded] = useState(false);

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    const trimmed = inputValue.trim();
    if (trimmed && !lockedTerms.includes(trimmed)) {
      onAddTerm(trimmed);
      setInputValue("");
    }
  }

  return (
    <div className="border border-slate-200/80 dark:border-slate-800 rounded-xl p-3 bg-slate-50/50 dark:bg-slate-900/30">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => setIsExpanded(!isExpanded)}
          className="flex items-center gap-2 text-xs font-semibold text-slate-700 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 focus:outline-none"
          aria-expanded={isExpanded}
        >
          <span className="text-amber-500">🔒</span>
          <span>Locked Terminology Memory ({lockedTerms.length})</span>
          <span className="text-[10px] text-slate-400">
            {isExpanded ? "▲ Hide" : "▼ Manage"}
          </span>
        </button>

        {lockedTerms.length > 0 && !isExpanded && (
          <div className="flex flex-wrap gap-1 max-w-[200px] overflow-hidden">
            {lockedTerms.slice(0, 2).map((term) => (
              <span
                key={term}
                className="px-2 py-0.5 text-[10px] font-medium bg-amber-500/10 text-amber-800 dark:text-amber-300 rounded-full border border-amber-500/20"
              >
                {term}
              </span>
            ))}
            {lockedTerms.length > 2 && (
              <span className="text-[10px] text-slate-400">+{lockedTerms.length - 2} more</span>
            )}
          </div>
        )}
      </div>

      {isExpanded && (
        <div className="mt-3 pt-3 border-t border-slate-200/60 dark:border-slate-800/60">
          <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-2 leading-relaxed">
            Specify scholarly or proprietary terminology (e.g. <em>Rajadharma</em>, <em>Vedic Trusteeship</em>) to guarantee verbatim preservation without paraphrasing.
          </p>

          <form onSubmit={handleAdd} className="flex gap-2 mb-3">
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder="e.g. Rajadharma"
              className="flex-1 px-3 py-1.5 text-xs rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:ring-1 focus:ring-indigo-500 focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={!inputValue.trim()}
              className="px-3 py-1.5 text-xs font-semibold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg disabled:opacity-50 transition-colors shadow-sm"
            >
              Add Term
            </button>
          </form>

          {lockedTerms.length === 0 ? (
            <p className="text-[11px] text-slate-400 italic">No locked terms defined yet.</p>
          ) : (
            <div className="flex flex-wrap gap-1.5">
              {lockedTerms.map((term) => (
                <span
                  key={term}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium bg-amber-500/10 text-amber-800 dark:text-amber-200 rounded-lg border border-amber-500/20"
                >
                  <span>{term}</span>
                  <button
                    type="button"
                    onClick={() => onRemoveTerm(term)}
                    className="hover:text-rose-600 dark:hover:text-rose-400 font-bold focus:outline-none"
                    title={`Remove ${term}`}
                    aria-label={`Remove ${term}`}
                  >
                    ×
                  </button>
                </span>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
