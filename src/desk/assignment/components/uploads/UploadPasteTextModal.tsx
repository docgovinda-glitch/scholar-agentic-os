import React from "react";
import {
FileCode,Loader2,Sparkles
} from "lucide-react";

export interface UploadPasteTextModalProps {
  handleTextSubmit: (e: React.FormEvent) => Promise<void>;
  isProcessing: boolean;
  modalError: string | null;
  pastedTextContent: string;
  pastedTextTitle: string;
  setPastedTextContent: (value: React.SetStateAction<string>) => void;
  setPastedTextTitle: (value: React.SetStateAction<string>) => void;
  setShowTextModal: (value: React.SetStateAction<boolean>) => void;
  showTextModal: boolean;
}

export function UploadPasteTextModal({ handleTextSubmit, isProcessing, modalError, pastedTextContent, pastedTextTitle, setPastedTextContent, setPastedTextTitle, setShowTextModal, showTextModal }: UploadPasteTextModalProps) {
  return (
    <>
      {/* Paste Text Modal */}
      {showTextModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-lg bg-[color:var(--surface-raised)] rounded-3xl p-6 shadow-2xl border border-[color:var(--border-subtle)] text-left">
            <div className="flex items-center gap-2 mb-2">
              <FileCode className="w-4 h-4 text-[color:var(--text-muted)]" />
              <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                Paste Lecture Notes or Syllabus Excerpt
              </h3>
            </div>
            <p className="text-xs text-[color:var(--text-muted)] mb-4 leading-relaxed">
              Paste passages from lecture slides, assigned reading packs, or rubric rubrics. Only excerpts relevant to the assignment will be stored.
            </p>

            <form onSubmit={handleTextSubmit} className="space-y-3">
              <div>
                <input
                  type="text"
                  placeholder="Note Title / Lecture Title (e.g. Week 4: China's Foreign Policy)..."
                  value={pastedTextTitle}
                  onChange={(e) => setPastedTextTitle(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] text-xs text-[color:var(--text-primary)] placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-neutral-400"
                />
              </div>

              <div>
                <textarea
                  rows={6}
                  placeholder="Paste lecture content, slide points, or reading notes here..."
                  value={pastedTextContent}
                  onChange={(e) => setPastedTextContent(e.target.value)}
                  required
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] text-xs text-[color:var(--text-primary)] placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-neutral-400 resize-none font-sans"
                />
              </div>

              {modalError && (
                <p className="text-xs text-rose-500 font-medium">{modalError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowTextModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !pastedTextContent.trim()}
                  className="px-4 py-2 rounded-full text-xs font-semibold bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] hover:opacity-90 transition-opacity cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                >
                  {isProcessing ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Sparkles className="w-3.5 h-3.5" />}
                  <span>Extract Evidence</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
