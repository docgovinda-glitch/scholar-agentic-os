import React from "react";
import {
Globe,
Loader2,Sparkles
} from "lucide-react";

export interface UploadWebLinkModalProps {
  handleUrlSubmit: (e: React.FormEvent) => Promise<void>;
  isProcessing: boolean;
  modalError: string | null;
  setShowUrlModal: (value: React.SetStateAction<boolean>) => void;
  setUrlInput: (value: React.SetStateAction<string>) => void;
  showUrlModal: boolean;
  urlInput: string;
}

export function UploadWebLinkModal({ handleUrlSubmit, isProcessing, modalError, setShowUrlModal, setUrlInput, showUrlModal, urlInput }: UploadWebLinkModalProps) {
  return (
    <>
      {/* Web Link Modal */}
      {showUrlModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40 backdrop-blur-xs animate-in fade-in duration-150">
          <div className="w-full max-w-md bg-[color:var(--surface-raised)] rounded-3xl p-6 shadow-2xl border border-[color:var(--border-subtle)] text-left">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4 text-sky-500" />
              <h3 className="text-sm font-bold text-[color:var(--text-primary)]">
                Add Web Link / Academic Article URL
              </h3>
            </div>
            <p className="text-xs text-[color:var(--text-muted)] mb-4 leading-relaxed">
              Enter any accessible article, institutional report, or reading page. We will fetch and extract only the assignment-relevant excerpts with citation references.
            </p>

            <form onSubmit={handleUrlSubmit} className="space-y-4">
              <div>
                <input
                  type="url"
                  placeholder="https://example.edu/article or research report..."
                  value={urlInput}
                  onChange={(e) => setUrlInput(e.target.value)}
                  required
                  autoFocus
                  className="w-full px-3.5 py-2.5 rounded-xl border border-[color:var(--border-subtle)] bg-[color:var(--surface-inset)] text-xs text-[color:var(--text-primary)] placeholder:text-neutral-400 outline-none focus:ring-2 focus:ring-sky-500/20"
                />
              </div>

              {modalError && (
                <p className="text-xs text-rose-500 font-medium">{modalError}</p>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowUrlModal(false)}
                  className="px-4 py-2 rounded-full text-xs font-semibold text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isProcessing || !urlInput.trim()}
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
