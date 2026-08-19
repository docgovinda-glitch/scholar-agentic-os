import { useState, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { saveIntakeAnswers } from "../../api";

export default function TitleLockStage({
  stage,
  projectId,
  project,
  onSaved,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
  onAdvance?: () => void;
}) {
  const def = STAGE_MAP.get(stage);
  
  const initialTitle = project.answers?.["working_title"] || "";
  const [title, setTitle] = useState(initialTitle);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync if it changes externally
  useEffect(() => {
    setTitle(project.answers?.["working_title"] || "");
  }, [project.answers?.["working_title"]]);

  const handleLockTitle = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const newAnswers = {
        ...project.answers,
        working_title: title,
        title_locked: "true",
      };
      
      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
      if (onAdvance) {
        onAdvance();
      }
    } catch (err: any) {
      setError(err.message || "Failed to lock title.");
    } finally {
      setIsSaving(false);
    }
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

      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center">
        <div className="w-full max-w-4xl space-y-6">
          {error && (
            <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
              {error}
            </div>
          )}

          <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl overflow-hidden shadow-xl">
            <div className="bg-[color:var(--surface-sunken)] border-b border-[color:var(--border-subtle)] p-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-3 h-3 rounded-full bg-red-500"></span>
                <span className="w-3 h-3 rounded-full bg-yellow-500"></span>
                <span className="w-3 h-3 rounded-full bg-green-500"></span>
              </div>
              <div className="text-xs font-mono text-[color:var(--text-muted)] font-bold uppercase tracking-wider">
                Research Snapshot Dossier
              </div>
            </div>
            
            <div className="p-8 space-y-8 font-mono text-sm">
              <div>
                <h3 className="text-[color:var(--text-muted)] mb-2 uppercase tracking-wider text-xs border-b border-[color:var(--border-subtle)] pb-1">I. Core Definition</h3>
                <p className="text-[color:var(--text-primary)] text-base">{project.answers?.["definition"] || "Not defined"}</p>
              </div>

              <div>
                <h3 className="text-[color:var(--text-muted)] mb-2 uppercase tracking-wider text-xs border-b border-[color:var(--border-subtle)] pb-1">II. Selected Gap</h3>
                <div className="flex items-center gap-2 mb-1">
                  <span className="inline-block px-2 py-0.5 bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold uppercase text-xs rounded border border-[color:var(--accent-border)]">
                    {project.answers?.["selected_gap_type"] || "Unknown"}
                  </span>
                </div>
                <p className="text-[color:var(--text-primary)] text-base">{project.answers?.["selected_gap_description"] || "Not defined"}</p>
              </div>

              <div>
                <h3 className="text-[color:var(--text-muted)] mb-2 uppercase tracking-wider text-xs border-b border-[color:var(--border-subtle)] pb-1">III. Final Title</h3>
                <p className="text-[color:var(--accent)] text-xl font-bold font-serif">{title}</p>
                {project.answers?.["title_rationale"] && (
                  <p className="text-[color:var(--text-secondary)] italic mt-2 text-sm font-sans">"{project.answers?.["title_rationale"]}"</p>
                )}
              </div>
            </div>
            
            <div className="bg-[color:var(--surface-sunken)] border-t border-[color:var(--border-subtle)] p-6 flex flex-col sm:flex-row gap-4 items-center justify-between">
              <p className="text-[color:var(--text-secondary)] text-sm max-w-lg">
                Locking this snapshot will establish the absolute ground truth for Phase 2 extraction agents.
              </p>
              <button 
                onClick={handleLockTitle}
                disabled={isSaving || !title.trim() || project.answers?.["title_locked"] === "true"}
                className={`shrink-0 px-8 py-3 rounded-lg font-bold text-white shadow-md flex items-center justify-center gap-2 disabled:opacity-50 transition-colors ${
                  project.answers?.["title_locked"] === "true" ? "bg-green-600" : "bg-[color:var(--accent)] hover:bg-[color:var(--accent-hover)]"
                }`}
              >
                {isSaving ? (
                  <>
                    <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Locking...
                  </>
                ) : project.answers?.["title_locked"] === "true" ? (
                  "✓ Dossier Locked"
                ) : (
                  <>
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                    </svg>
                    Lock Snapshot & Proceed
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
