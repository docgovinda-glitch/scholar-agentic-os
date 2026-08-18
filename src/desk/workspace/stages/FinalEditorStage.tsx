import { useState, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { saveIntakeAnswers } from "../../api";

export default function FinalEditorStage({
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
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      const raw = project.answers?.["manuscript_draft"];
      if (raw) {
        const parsed = typeof raw === "string" ? JSON.parse(raw) : raw;
        // In a real app this would reconstruct the sections into a single markdown string
        // For now, we'll just join the sections if it's an array
        if (Array.isArray(parsed)) {
          setContent(parsed.map(s => `## ${s.section}\n\n${s.content}`).join("\n\n"));
        } else {
          setContent(JSON.stringify(parsed, null, 2));
        }
      }
    } catch (e) {
      setContent(project.answers?.["manuscript_draft"] || "");
    }
  }, [project.answers]);

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const newAnswers = {
        ...project.answers,
        manuscript_draft: content,
      };
      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
    } catch (err: any) {
      setError(err.message || "Failed to save final draft.");
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

        <div className="flex-1 flex flex-col h-full">
          {error && (
            <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
              {error}
            </div>
          )}
          
          <div className="bg-white rounded-xl border border-[color:var(--border-subtle)] shadow-sm flex-1 flex flex-col overflow-hidden mb-6">
            <div className="bg-[color:var(--surface-sunken)] p-2 border-b border-[color:var(--border-subtle)] flex items-center gap-2">
              <button className="p-2 hover:bg-gray-200 rounded text-gray-600 font-bold text-sm">B</button>
              <button className="p-2 hover:bg-gray-200 rounded text-gray-600 italic text-sm">I</button>
              <button className="p-2 hover:bg-gray-200 rounded text-gray-600 underline text-sm">U</button>
              <div className="w-px h-4 bg-gray-300 mx-2"></div>
              <button className="p-2 hover:bg-gray-200 rounded text-gray-600 text-sm">H1</button>
              <button className="p-2 hover:bg-gray-200 rounded text-gray-600 text-sm">H2</button>
            </div>
            <textarea
              className="flex-1 p-6 w-full resize-none focus:outline-none focus:ring-0 font-serif text-lg leading-relaxed text-[color:var(--text-primary)]"
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Your manuscript draft will appear here for final editing..."
            />
          </div>

          <div className="flex justify-end mb-8">
            <button 
              onClick={handleSave}
              disabled={isSaving}
              className="px-8 py-4 rounded-xl bg-[color:var(--accent)] text-white font-black text-lg shadow-lg hover:bg-[color:var(--accent-hover)] transition-all flex items-center gap-2 disabled:opacity-50"
            >
              {isSaving ? "Saving Draft..." : "Save Final Draft"}
              {!isSaving && (
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
