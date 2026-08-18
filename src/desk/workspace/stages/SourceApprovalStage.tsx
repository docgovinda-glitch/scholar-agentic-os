import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";

export default function SourceApprovalStage({
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
        <div className="max-w-3xl w-full">
          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-10 text-center shadow-lg relative overflow-hidden">
            {/* Decorative background pattern */}
            <div className="absolute top-0 left-0 w-full h-full opacity-[0.03] pointer-events-none" style={{ backgroundImage: 'radial-gradient(circle at 2px 2px, currentColor 1px, transparent 0)', backgroundSize: '24px 24px' }}></div>
            
            <div className="relative z-10">
              <div className="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6 shadow-inner">
                <svg className="w-12 h-12 text-green-600" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
                </svg>
              </div>
              
              <h3 className="text-3xl font-black text-[color:var(--text-primary)] mb-4 tracking-tight">
                Review External Sources
              </h3>
              
              <p className="text-lg text-[color:var(--text-secondary)] mb-8 max-w-xl mx-auto">
                The Web Crawler has imported new external sources. You must explicitly approve these sources before they can be used as evidence in your manuscript. 
                <strong className="block mt-2 text-[color:var(--text-primary)]">No fabricated citations will ever enter your draft.</strong>
              </p>
              
              <div className="bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-xl p-6 mb-8 text-left">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[color:var(--border-subtle)]">
                  <div>
                    <h4 className="font-bold text-[color:var(--text-primary)]">Pending Review</h4>
                    <p className="text-sm text-[color:var(--text-secondary)]">2 external sources added to your library.</p>
                  </div>
                  <button className="text-sm font-bold text-[color:var(--accent)] hover:underline">View All</button>
                </div>
                
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[color:var(--text-primary)] truncate max-w-md">Automated Peer Review: A Meta-Analysis of AI Systems</span>
                    <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded">Pending Approval</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[color:var(--text-primary)] truncate max-w-md">Cognitive Load Theory in the Age of Generative Assistants</span>
                    <span className="text-xs font-bold text-green-600 bg-green-100 px-2 py-1 rounded">Pending Approval</span>
                  </div>
                </div>
              </div>
              
              <button className="px-8 py-4 rounded-xl bg-[color:var(--accent)] text-white font-black text-lg shadow-lg hover:bg-[color:var(--accent-hover)] hover:-translate-y-1 transition-all flex items-center justify-center gap-3 w-full max-w-md mx-auto">
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
                Approve & Add to Library
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
