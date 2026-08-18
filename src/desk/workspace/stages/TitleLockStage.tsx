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
}: {
  stage: ResearchStage;
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
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

      <div className="flex-1 overflow-y-auto p-8 flex flex-col items-center justify-center">
        <div className="max-w-2xl w-full bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-2xl p-10 text-center shadow-lg">
          <div className="w-20 h-20 bg-green-100 text-green-600 rounded-full flex items-center justify-center mx-auto mb-6">
            <svg className="w-10 h-10" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
            </svg>
          </div>
          
          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
              {error}
            </div>
          )}
          
          <div className="mb-6">
            <label className="block text-sm font-semibold text-[color:var(--text-secondary)] mb-2 uppercase tracking-wider text-left">
              Final Working Title
            </label>
            <textarea
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full text-2xl font-bold text-[color:var(--text-primary)] font-serif bg-[color:var(--surface-sunken)] border border-[color:var(--border-control)] rounded-lg p-4 focus:outline-none focus:ring-2 focus:ring-[color:var(--accent)] resize-none"
              rows={3}
              placeholder="Enter your final working title..."
            />
          </div>
          
          {project.answers?.["selected_gap_type"] && (
            <div className="inline-block px-4 py-1.5 rounded-full bg-blue-50 text-blue-700 text-sm font-semibold mb-8 border border-blue-200 uppercase tracking-wide">
              Addressing: {project.answers["selected_gap_type"]} Gap
            </div>
          )}
          
          <p className="text-[color:var(--text-secondary)] mb-8 text-lg">
            You are about to lock this title and gap into the project definition. Once locked, the Phase 2 extraction agents will use this as their absolute ground truth.
          </p>
          
          <button 
            onClick={handleLockTitle}
            disabled={isSaving || !title.trim() || project.answers?.["title_locked"] === "true"}
            className="w-full py-4 rounded-xl bg-[color:var(--text-primary)] text-[color:var(--surface-canvas)] font-bold text-lg hover:bg-black transition-colors shadow-md flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {isSaving ? (
              <span className="flex items-center gap-2">
                <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Locking...
              </span>
            ) : project.answers?.["title_locked"] === "true" ? (
              "Title is Locked"
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Lock Title & Proceed to Phase 2
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
