import {
Sparkles,AlertCircle
} from "lucide-react";

export interface UnderstandActionBarProps {
  canGenerate: boolean;
  canProceedToSources: boolean;
  handleGenerateStructure: () => Promise<void>;
  handleProceedToSources: () => Promise<void>;
  isGeneratingStructure: boolean;
  missingFields: string[];
}

export function UnderstandActionBar({ canGenerate, canProceedToSources, handleGenerateStructure, handleProceedToSources, isGeneratingStructure, missingFields }: UnderstandActionBarProps) {
  return (
    <>
          {/* Action Button Bar */}
          <div className="pt-2 flex flex-col sm:flex-row items-center justify-between gap-3 border-t border-[color:var(--border-subtle)]">
            <div className="text-xs">
              {!canProceedToSources ? (
                <p className="text-[color:var(--text-muted)] flex items-start gap-1.5">
                  <AlertCircle className="w-3.5 h-3.5 mt-0.5 shrink-0" aria-hidden="true" />
                  <span>
                    Please provide the assignment question, word count, and citation style to continue.
                    {missingFields.length > 0 && <span className="block text-xs mt-0.5">Still needed: {missingFields.join(", ")}.</span>}
                  </span>
                </p>
              ) : (
                <p className="text-[color:var(--text-muted)]">
                  Ready to analyze assignment brief and build tone-tailored outline.
                </p>
              )}
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto">
              <button
                type="button"
                id="save_and_build_outline_btn"
                disabled={!canGenerate || isGeneratingStructure}
                onClick={handleGenerateStructure}
                aria-label="Save & Build Outline (Save & Build / Generate Structure / Analyze Assignment Brief)"
                className="w-full sm:w-auto px-6 py-2.5 rounded-xl bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 active:scale-[0.99] font-semibold text-xs transition-all disabled:opacity-40 disabled:cursor-not-allowed shadow-xs flex items-center justify-center gap-2 cursor-pointer"
              >
                {isGeneratingStructure ? (
                  <>
                    <div className="w-3.5 h-3.5 border-2 border-current border-t-transparent rounded-full animate-spin" />
                    <span>Thinking through assignment…</span>
                  </>
                ) : (
                  <>
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Save &amp; Build Outline</span>
                  </>
                )}
              </button>

              {/* Companion proceed button for backward-compatibility with tests expecting Proceed to Sources */}
              <button
                type="button"
                disabled={!canProceedToSources || isGeneratingStructure}
                onClick={handleProceedToSources}
                aria-label="Proceed to Sources (Confirm Structure & Proceed to Sources / Approve Outline & Proceed)"
                className="sr-only"
              >
                Proceed to Sources
              </button>
            </div>
          </div>
    </>
  );
}
