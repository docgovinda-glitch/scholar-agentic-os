import { useState, useEffect } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { authedFetch } from "../../api";

export default function FinalEditorStage({
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
  const [content, setContent] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [wordCount, setWordCount] = useState(0);

  useEffect(() => {
    let isMounted = true;
    const fetchDraft = async () => {
      try {
        const response = await authedFetch(`/api/projects/${projectId}/agent/manuscript`);
        if (response.ok) {
          const { data } = await response.json();
          if (isMounted && data && Array.isArray(data)) {
            const compiled = data.map((s: any) => `## ${s.section_name}\n\n${s.content}`).join("\n\n");
            setContent(compiled);
            setWordCount(compiled.split(/\s+/).filter(Boolean).length);
          }
        }
      } catch (e) {
        console.error("Failed to load manuscript", e);
      }
    };
    fetchDraft();
    return () => { isMounted = false; };
  }, [projectId]);

  const handleContentChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newContent = e.target.value;
    setContent(newContent);
    setWordCount(newContent.split(/\s+/).filter(Boolean).length);
  };

  const handleSave = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const response = await authedFetch(`/api/projects/${projectId}/agent/manuscript`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          section_name: "Full Manuscript",
          content: content,
          status: "Edited"
        })
      });
      if (!response.ok) throw new Error("Failed to save changes to database");
      onSaved({ ...project });
      if (onAdvance) {
        onAdvance();
      }
    } catch (err: any) {
      setError(err.message || "Failed to save final draft.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)] font-mono relative">
      {/* Header */}
      <div className="p-8 pb-4 border-b border-[color:var(--border-subtle)] flex justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)]">
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={def.icon} />
            </svg>
          </div>
          <div>
            <h2 className="text-2xl font-bold text-[color:var(--text-primary)] tracking-tight">
              {def.number}. {def.label}
            </h2>
            <p className="text-[color:var(--text-secondary)] mt-1 font-sans">
              Polishing Dossier
            </p>
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-8 relative flex flex-col items-center pb-32">
        {/* Background decorative grid */}
        <div className="absolute inset-0 pointer-events-none" style={{ backgroundImage: 'radial-gradient(var(--border-subtle) 1px, transparent 0)', backgroundSize: '40px 40px', opacity: 0.2 }}></div>

        <div className="max-w-5xl w-full z-10 flex-1 flex flex-col relative h-full">
          
          {error && (
            <div className="mb-6 p-4 bg-red-900/20 text-red-400 rounded-lg border border-red-900/50 font-sans shadow-lg backdrop-blur-md flex items-center gap-3">
              <svg className="w-5 h-5 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" /></svg>
              {error}
            </div>
          )}
          
          <div className="bg-[color:var(--surface-raised)] rounded-2xl border border-[color:var(--border-subtle)] shadow-xl flex-1 flex flex-col overflow-hidden">
            <div className="bg-[color:var(--surface-sunken)] p-3 border-b border-[color:var(--border-subtle)] flex items-center justify-between">
              <div className="flex items-center gap-1">
                <button className="w-8 h-8 flex items-center justify-center hover:bg-[color:var(--surface-canvas)] rounded text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors font-serif font-bold">B</button>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-[color:var(--surface-canvas)] rounded text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors font-serif italic">I</button>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-[color:var(--surface-canvas)] rounded text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors font-serif underline">U</button>
                <div className="w-px h-5 bg-[color:var(--border-subtle)] mx-2"></div>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-[color:var(--surface-canvas)] rounded text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors font-sans text-xs font-bold">H1</button>
                <button className="w-8 h-8 flex items-center justify-center hover:bg-[color:var(--surface-canvas)] rounded text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors font-sans text-xs font-bold">H2</button>
              </div>
              <div className="text-[color:var(--text-muted)] text-xs uppercase tracking-widest font-bold">
                {wordCount} Words
              </div>
            </div>
            <textarea
              className="flex-1 p-8 w-full resize-none focus:outline-none focus:ring-0 font-serif text-lg leading-loose text-[color:var(--text-primary)] bg-transparent"
              value={content}
              onChange={handleContentChange}
              placeholder="Your manuscript draft will appear here for final editing..."
            />
          </div>

        </div>
      </div>

      {/* Sticky Bottom Action Bar */}
      <div className="absolute bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-[color:var(--surface-canvas)] via-[color:var(--surface-canvas)] to-transparent z-20 flex justify-center">
        <button 
          onClick={handleSave}
          disabled={isSaving}
          className="px-8 py-4 rounded-full bg-[color:var(--accent)] text-white font-bold shadow-lg hover:bg-[color:var(--accent-hover)] transition-transform hover:-translate-y-1 flex items-center gap-3 font-sans cursor-pointer disabled:opacity-50 disabled:hover:translate-y-0"
        >
          {isSaving ? (
            <>
              <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              Saving Changes...
            </>
          ) : (
            <>
              Finalize & Advance to Publication
              <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
              </svg>
            </>
          )}
        </button>
      </div>
    </div>
  );
}
