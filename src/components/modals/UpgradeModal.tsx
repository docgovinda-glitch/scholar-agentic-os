import React, { useEffect } from "react";
import { Sparkles, X, CheckCircle2 } from "lucide-react";

export interface UpgradeModalProps {
  isOpen: boolean;
  onClose: () => void;
  onUpgrade?: () => void;
  title?: string;
  description?: string;
  triggerReason?: "size_limit" | "count_limit" | "feature_gate";
}

export const UpgradeModal: React.FC<UpgradeModalProps> = ({
  isOpen,
  onClose,
  onUpgrade,
  title = "Unlock Unlimited Document Analysis",
  description = "Free accounts are limited to standard brief files. Upgrade to Scholar Pro for unlimited high-capacity document processing and lecture syllabus grounding.",
}) => {
  // Close on Escape key press
  useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when modal is active
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [isOpen]);

  if (!isOpen) return null;

  const handleUpgradeClick = () => {
    if (onUpgrade) {
      onUpgrade();
    } else if (typeof window !== "undefined") {
      window.location.href = "/ai-access";
    }
    onClose();
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="upgrade-modal-title"
      aria-describedby="upgrade-modal-desc"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 dark:bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white dark:bg-ink-750 border border-neutral-200/80 dark:border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl dark:shadow-none max-w-md w-full mx-auto relative animate-in zoom-in-95 duration-150 font-sans"
      >
        {/* Close Button */}
        <button
          type="button"
          onClick={onClose}
          aria-label="Close dialog"
          className="absolute top-4 right-4 sm:top-6 sm:right-6 p-1.5 rounded-full text-neutral-400 hover:text-neutral-700 dark:hover:text-neutral-200 hover:bg-neutral-100 dark:hover:bg-white/5 transition-colors cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Feature Icon Badge */}
        <div className="w-12 h-12 rounded-2xl bg-neutral-100 dark:bg-white/5 border border-neutral-200/60 dark:border-white/10 flex items-center justify-center text-neutral-900 dark:text-white mb-5 shadow-xs">
          <Sparkles className="w-6 h-6 text-neutral-900 dark:text-neutral-100" />
        </div>

        {/* Title & Copy */}
        <h2
          id="upgrade-modal-title"
          className="text-lg font-semibold text-neutral-900 dark:text-neutral-100 tracking-tight"
        >
          {title}
        </h2>
        <p
          id="upgrade-modal-desc"
          className="text-xs text-neutral-500 dark:text-neutral-400 mt-2 leading-relaxed"
        >
          {description}
        </p>

        {/* Pro Benefits Highlights */}
        <div className="mt-5 space-y-2 py-3 border-y border-neutral-100 dark:border-white/5">
          <div className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Process up to 50MB handbook & syllabus files</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Unlimited brief uploads per academic assignment</span>
          </div>
          <div className="flex items-center gap-2 text-xs text-neutral-700 dark:text-neutral-300">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
            <span>Deep rubric criteria and command verb extraction</span>
          </div>
        </div>

        {/* Actions */}
        <div className="mt-6 flex flex-col-reverse sm:flex-row items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            className="w-full sm:w-auto px-4 py-2 text-xs font-medium text-neutral-500 hover:text-neutral-700 dark:hover:text-neutral-300 transition-colors cursor-pointer"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleUpgradeClick}
            className="w-full sm:w-auto px-6 py-2.5 rounded-full text-xs font-semibold bg-neutral-900 text-white dark:bg-white dark:text-neutral-900 hover:opacity-90 transition-all cursor-pointer shadow-xs active:scale-[0.99]"
          >
            Upgrade to Pro
          </button>
        </div>
      </div>
    </div>
  );
};

export default UpgradeModal;
