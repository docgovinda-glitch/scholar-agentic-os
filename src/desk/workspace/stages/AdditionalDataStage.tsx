import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";

export default function AdditionalDataStage({
  stage,
  projectId,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  onAdvance?: (stage: string) => void;
}) {
  const def = STAGE_MAP.get(stage);

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      <div className="p-8 pb-4 border-b border-[color:var(--border-subtle)] flex justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label}
            </h2>
            <p className="text-[color:var(--text-secondary)] mt-1">
              {def.description}
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-10 shadow-lg relative overflow-hidden">
            {/* Decorative background pattern */}
            <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10">
              <div className="text-center mb-8">
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4 shadow-inner">
                  <svg className="w-8 h-8 text-blue-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
                  </svg>
                </div>
                <h3 className="text-2xl font-black text-[color:var(--text-primary)] mb-2 tracking-tight">
                  Data Ingestion Engine
                </h3>
                <p className="text-[color:var(--text-secondary)]">
                  Upload supplementary PDFs, datasets, or notes to index them directly into your project's evidence matrix.
                </p>
              </div>
              
              <div className="border-2 border-dashed border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)] hover:border-[color:var(--accent)] hover:bg-[color:var(--accent-subtle)] rounded-xl p-10 text-center transition-all cursor-pointer group">
                <div className="w-12 h-12 bg-[color:var(--surface-canvas)] rounded-lg flex items-center justify-center mx-auto mb-3 border border-[color:var(--border-subtle)] group-hover:border-[color:var(--accent)] transition-colors">
                  <svg className="w-6 h-6 text-[color:var(--text-muted)] group-hover:text-[color:var(--accent)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 13h6m-3-3v6m5 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                  </svg>
                </div>
                <h4 className="text-sm font-bold text-[color:var(--text-primary)] mb-1">
                  Select files to upload
                </h4>
                <p className="text-xs text-[color:var(--text-muted)] font-mono">
                  Ready for parsing...
                </p>
              </div>
            </div>
          </div>
          
          <div className="mt-8 flex justify-center">
            <button 
              onClick={() => onAdvance?.("evidence_extraction")}
              className="px-8 py-3 rounded-xl bg-[color:var(--accent)] text-white font-bold shadow-md hover:bg-[color:var(--accent-hover)] transition-colors flex items-center gap-2"
            >
              Submit & Proceed to Extraction
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
              </svg>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
