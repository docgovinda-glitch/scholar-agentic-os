import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { saveIntakeAnswers } from "../../api";

export default function SourceApprovalStage({
  stage,
  projectId,
  project,
  onSaved,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
}) {
  const def = STAGE_MAP.get(stage);
  const isVault = stage === "source_approval_vault";
  
  const pendingKey = isVault ? "pending_vault_sources" : "pending_external_sources";
  const approvedKey = isVault ? "approved_vault_sources" : "approved_external_sources";

  // Parse pending sources
  let pendingSources: any[] = [];
  try {
    const raw = project.answers?.[pendingKey];
    if (raw) pendingSources = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {}

  // Parse approved sources
  let approvedSources: any[] = [];
  try {
    const raw = project.answers?.[approvedKey];
    if (raw) approvedSources = typeof raw === "string" ? JSON.parse(raw) : raw;
  } catch (e) {}

  // We only want to show sources that are in pending AND NOT in approved/rejected (though for simplicity, we'll just show all pending that aren't approved)
  const [localRejected, setLocalRejected] = useState<Set<string>>(new Set());
  const [isSaving, setIsSaving] = useState(false);

  const pendingToReview = pendingSources.filter(
    (s: any) => !approvedSources.some((a: any) => a.id === s.id) && !localRejected.has(s.id)
  );

  const handleApprove = async (source: any) => {
    setIsSaving(true);
    try {
      const newApproved = [...approvedSources, source];
      const newAnswers = {
        ...project.answers,
        [approvedKey]: JSON.stringify(newApproved),
      };
      const updated = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updated);
    } catch (e) {
      console.error(e);
    } finally {
      setIsSaving(false);
    }
  };

  const handleReject = (sourceId: string) => {
    setLocalRejected(new Set(localRejected).add(sourceId));
  };

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
                Review {isVault ? "Vault" : "External"} Sources
              </h3>
              
              <p className="text-lg text-[color:var(--text-secondary)] mb-8 max-w-xl mx-auto">
                {isVault 
                  ? "The Archivist has identified these primary sources from your vault."
                  : "The Web Crawler has imported new external sources."} 
                You must explicitly approve these sources before they can be used as evidence in your manuscript. 
                <strong className="block mt-2 text-[color:var(--text-primary)]">No fabricated citations will ever enter your draft.</strong>
              </p>
              
              <div className="bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-xl p-6 mb-8 text-left">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[color:var(--border-subtle)]">
                  <div>
                    <h4 className="font-bold text-[color:var(--text-primary)]">Pending Review</h4>
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {pendingToReview.length} {isVault ? "vault" : "external"} sources awaiting your approval.
                    </p>
                  </div>
                </div>
                
                {pendingToReview.length === 0 ? (
                  <div className="text-center p-8 text-[color:var(--text-muted)] italic">
                    {pendingSources.length === 0 
                      ? "No sources have been discovered yet. Go back to the previous stage to scan."
                      : "All sources have been reviewed!"}
                  </div>
                ) : (
                  <div className="space-y-4 max-h-96 overflow-y-auto pr-2">
                    {pendingToReview.map((source: any) => (
                      <div key={source.id} className="flex flex-col gap-3 p-4 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-lg">
                        <div className="flex items-start justify-between">
                          <span className="text-sm font-semibold text-[color:var(--text-primary)] pr-4">
                            {source.title}
                          </span>
                          <span className="text-xs font-bold text-yellow-600 bg-yellow-100 px-2 py-1 rounded shrink-0">
                            Pending Approval
                          </span>
                        </div>
                        <div className="text-xs text-[color:var(--text-secondary)]">
                          {source.author} • {source.year}
                        </div>
                        <div className="flex justify-end gap-2 mt-2">
                          <button 
                            onClick={() => handleReject(source.id)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-md text-xs font-bold bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] text-[color:var(--text-secondary)] hover:text-red-600 hover:border-red-200 transition-colors"
                          >
                            Reject
                          </button>
                          <button 
                            onClick={() => handleApprove(source)}
                            disabled={isSaving}
                            className="px-3 py-1.5 rounded-md text-xs font-bold bg-green-100 text-green-700 hover:bg-green-200 transition-colors"
                          >
                            Approve
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              
              <div className="bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-xl p-6 mb-8 text-left">
                <div className="flex items-center justify-between mb-4 pb-4 border-b border-[color:var(--border-subtle)]">
                  <div>
                    <h4 className="font-bold text-[color:var(--text-primary)]">Approved Library</h4>
                    <p className="text-sm text-[color:var(--text-secondary)]">
                      {approvedSources.length} sources approved for manuscript use.
                    </p>
                  </div>
                </div>
                
                {approvedSources.length > 0 && (
                  <div className="space-y-2">
                    {approvedSources.map((source: any) => (
                      <div key={source.id} className="flex items-center justify-between p-2">
                        <span className="text-sm text-[color:var(--text-primary)] truncate max-w-[80%]">
                          {source.title}
                        </span>
                        <svg className="w-5 h-5 text-green-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
