import React, { useState, useEffect } from "react";
import { AlertCircle, X } from "lucide-react";

/**
 * Stage 9 (target-workflow.md) — AI-use disclosure review screen, shown
 * between Stage 11 (redrafting, G1/G2) and Stage 12 (export). Blocks export
 * until the user has explicitly reviewed and confirmed the disclosure text.
 */
interface AIDisclosureReviewModalProps {
  open: boolean;
  sectionsIncluded: string[];
  modelsUsed: string[];
  initialText: string;
  onConfirm: (finalText: string) => void;
  onCancel: () => void;
}

export default function AIDisclosureReviewModal({
  open,
  sectionsIncluded,
  modelsUsed,
  initialText,
  onConfirm,
  onCancel,
}: AIDisclosureReviewModalProps) {
  const [text, setText] = useState(initialText);

  useEffect(() => {
    if (open) setText(initialText);
  }, [open, initialText]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
      <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between p-5 border-b border-[color:var(--color-navy-4)]">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-400 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-[color:var(--text-primary)]">AI-Use Disclosure — Review Before Export</h2>
              <p className="text-sm text-[color:var(--text-secondary)] mt-1">
                Most journals now require authors to disclose generative AI use in manuscript preparation. Review and edit the statement below — it will be included in your exported .docx and PDF.
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-[color:var(--text-secondary)]">
            <div>
              <span className="font-bold text-[color:var(--text-primary)]">Sections included:</span> {sectionsIncluded.length > 0 ? sectionsIncluded.join(", ") : "none drafted yet"}
            </div>
            <div>
              <span className="font-bold text-[color:var(--text-primary)]">Model(s) used:</span> {modelsUsed.length > 0 ? modelsUsed.join(", ") : "none recorded yet"}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold text-[color:var(--text-secondary)] mb-1">
              Disclosure Statement (editable)
            </label>
            <div className="w-full bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] focus-within:border-[color:var(--color-luminous-blue)] rounded-lg px-3 py-2">
              <textarea
                rows={10}
                value={text}
                onChange={(e) => setText(e.target.value)}
                className="w-full border-0 bg-transparent text-sm text-[color:var(--text-primary)] focus:outline-none font-sans resize-none"
              />
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-[color:var(--color-navy-4)]">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)]"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(text)}
            disabled={!text.trim()}
            className="px-4 py-2 text-sm font-bold text-white bg-[color:var(--color-luminous-blue-dim)] rounded-lg hover:bg-[color:var(--color-luminous-blue)] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm & Continue to Export
          </button>
        </div>
      </div>
    </div>
  );
}
