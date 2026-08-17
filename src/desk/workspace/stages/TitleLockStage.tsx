import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";

export default function TitleLockStage({
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
        <div className="max-w-2xl w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-10 text-center shadow-lg">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          
          <h3 className="text-3xl font-bold text-[color:var(--text-primary)] mb-4 font-serif">
            Beyond the Copilot: A Longitudinal Analysis of Multi-Agent Systems
          </h3>
          
          <div className="inline-block px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold mb-8 border border-blue-200">
            Addressing: Empirical Gap
          </div>
          
          <p className="text-[color:var(--text-secondary)] mb-8 text-lg">
            You are about to lock this title and gap into the project definition. Once locked, the Phase 2 extraction agents will use this as their absolute ground truth.
          </p>
          
          <button className="w-full py-4 rounded-xl bg-[color:var(--text-primary)] text-[color:var(--surface-canvas)] font-bold text-lg hover:bg-black transition-colors shadow-md flex items-center justify-center gap-2">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            </svg>
            Lock Title & Proceed to Phase 2
          </button>
        </div>
      </div>
    </div>
  );
}
