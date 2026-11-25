import { AlertTriangle } from "lucide-react";

interface IncompleteAnswerBannerProps {
  onContinue: () => void;
  onRetryAnotherModel: () => void;
}

/** Shown at the end of an answer that stopped mid-sentence (quota, rate limit or dropped stream). */
export function IncompleteAnswerBanner({ onContinue, onRetryAnotherModel }: IncompleteAnswerBannerProps) {
  return (
    <div
      role="alert"
      data-testid="incomplete-answer-banner"
      className="mt-2 flex flex-wrap items-center gap-2 rounded-lg border border-amber-300/60 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-900 dark:border-amber-500/30 dark:bg-amber-950/30 dark:text-amber-200"
    >
      <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
      <span className="mr-auto">This answer stopped before it finished.</span>
      <button type="button" onClick={onContinue} className="cursor-pointer rounded-md border border-amber-400/60 px-2 py-1 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40">
        Continue Generating
      </button>
      <button type="button" onClick={onRetryAnotherModel} className="cursor-pointer rounded-md border border-amber-400/60 px-2 py-1 font-medium hover:bg-amber-100 dark:hover:bg-amber-900/40">
        Retry with Another Model
      </button>
    </div>
  );
}
