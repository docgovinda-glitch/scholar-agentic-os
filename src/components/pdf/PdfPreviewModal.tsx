import React from "react";
import { FileText } from "lucide-react";
import { PaperProject } from "../../types";
import ManuscriptPDFViewer from "../ManuscriptPDFViewer";

// Subcomponent: Live Manuscript Compilation Workbench (PDF preview modal)
export interface PdfPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  project: PaperProject;
}

export default function PdfPreviewModal({ isOpen, onClose, project }: PdfPreviewModalProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-neutral-900/60 backdrop-blur-sm z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div className="w-full max-w-5xl bg-white rounded-2xl overflow-hidden shadow-2xl flex flex-col max-h-[92vh] border border-[#E5E7EB]">
        <div className="bg-[#FAF8F5] border-b border-[#E5E7EB] px-6 py-4 flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2">
            <FileText className="w-5 h-5 text-[#1A365D]" />
            <h3 className="text-xs font-semibold text-[#1A365D] font-mono uppercase tracking-widest">
              Live Manuscript Compilation Workbench
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1 px-3 bg-red-100/30 border border-red-200 hover:bg-red-100 text-[#9C2E2E] rounded text-[11px] font-mono uppercase cursor-pointer transition-all font-semibold"
          >
            Dismiss Preview
          </button>
        </div>
        <div className="overflow-y-auto grow bg-[#F8FAFC]">
          <ManuscriptPDFViewer project={project} onClose={onClose} />
        </div>
      </div>
    </div>
  );
}
