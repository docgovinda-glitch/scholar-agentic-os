import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";

export default function AdditionalDataStage({
  stage,
}: {
  stage: ResearchStage;
  projectId: string;
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
          <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-6 text-center">
            Need more evidence? Upload additional sources.
          </h3>
          
          <div className="border-2 border-dashed border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] rounded-2xl p-12 text-center transition-colors cursor-pointer bg-[color:var(--surface-raised)] group">
            <div className="w-20 h-20 bg-[color:var(--surface-sunken)] rounded-full flex items-center justify-center mx-auto mb-4 group-hover:bg-[color:var(--accent-subtle)] transition-colors">
              <svg className="w-10 h-10 text-[color:var(--text-muted)] group-hover:text-[color:var(--accent)] transition-colors" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12" />
              </svg>
            </div>
            <h4 className="text-lg font-bold text-[color:var(--text-primary)] mb-2">
              Drag & drop PDFs or datasets
            </h4>
            <p className="text-[color:var(--text-secondary)] mb-6">
              Or click to browse your computer. These files will be indexed directly into your project evidence matrix.
            </p>
            <button className="px-6 py-2 rounded-lg bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)] font-semibold border border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors">
              Browse Files
            </button>
          </div>
          
          <div className="mt-8 flex justify-center">
            <button className="px-8 py-3 rounded-xl bg-[color:var(--text-primary)] text-[color:var(--surface-canvas)] font-bold shadow-md hover:bg-black transition-colors flex items-center gap-2">
              Skip Upload & Proceed to Extraction
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
