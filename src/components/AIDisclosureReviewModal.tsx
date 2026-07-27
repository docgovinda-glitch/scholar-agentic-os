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
      <div className="bg-white rounded-xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-y-auto">
        <div className="flex items-start justify-between p-5 border-b border-gray-200">
          <div className="flex items-start gap-3">
            <AlertCircle className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <h2 className="text-lg font-bold text-[#1A365D]">AI-Use Disclosure — Review Before Export</h2>
              <p className="text-sm text-gray-600 mt-1">
                Most journals now require authors to disclose generative AI use in manuscript preparation. Review and edit the statement below — it will be included in your exported .docx and PDF.
              </p>
            </div>
          </div>
          <button onClick={onCancel} className="text-gray-400 hover:text-gray-600" aria-label="Close">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div className="text-xs text-gray-500">
            <div>
              <span className="font-bold">Sections included:</span> {sectionsIncluded.length > 0 ? sectionsIncluded.join(", ") : "none drafted yet"}
            </div>
            <div>
              <span className="font-bold">Model(s) used:</span> {modelsUsed.length > 0 ? modelsUsed.join(", ") : "none recorded yet"}
            </div>
          </div>

          <div>
            <label className="block text-xs font-bold font-mono text-[#76726A] uppercase tracking-wider mb-1">
              Disclosure Statement (editable)
            </label>
            <textarea
              rows={10}
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="w-full bg-[#FAF9F6] border border-[#E2E8F0] rounded-lg px-3 py-2 text-sm text-[#1A365D] focus:outline-none focus:border-[#C08A3E] font-sans"
            />
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 p-5 border-t border-gray-200">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-semibold text-gray-600 hover:text-gray-800"
          >
            Cancel
          </button>
          <button
            onClick={() => onConfirm(text)}
            disabled={!text.trim()}
            className="px-4 py-2 text-sm font-bold text-white bg-[#1A365D] rounded-lg hover:bg-[#12253f] disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Confirm & Continue to Export
          </button>
        </div>
      </div>
    </div>
  );
}
