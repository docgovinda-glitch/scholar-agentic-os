import { useState } from "react";
import type { ProjectView } from "../types";
import { saveIntakeAnswers } from "../api";
import { Save, AlertCircle, RefreshCw } from "lucide-react";

interface ResearchDefinitionPanelProps {
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
}

export default function ResearchDefinitionPanel({ projectId, project, onSaved }: ResearchDefinitionPanelProps) {
  const [objectives, setObjectives] = useState(project.answers?.["objectives"] || "");
  const [questions, setQuestions] = useState(project.answers?.["questions"] || "");
  const [methodology, setMethodology] = useState(project.answers?.["methodology"] || "");

  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSave() {
    setBusy(true);
    setError(null);
    try {
      // The server merges this patch into the project's other intake answers.
      const updated = await saveIntakeAnswers(projectId, { objectives, questions, methodology });
      onSaved(updated);
    } catch (err) {
      setError(err instanceof Error && err.message ? `Could not save: ${err.message}` : "Could not save the research definition.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="w-full max-w-4xl mx-auto px-6 py-8 font-sans">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight text-[var(--text-primary)] mb-2 font-sans">
          Research Definition
        </h2>
        <p className="text-[var(--text-secondary)] text-base font-sans">
          Define the boundaries and goals of your journal article. These parameters will guide the autonomous research and manuscript generation phases.
        </p>
      </header>

      <div className="grid gap-6">
        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-6 transition-all duration-200">
          <label htmlFor="rd-objectives" className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans">
            Research Objectives
          </label>
          <textarea
            id="rd-objectives"
            rows={3}
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            placeholder="What is the primary goal of this research? e.g., To evaluate the efficacy of X in conditions Y."
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>

        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-6 transition-all duration-200">
          <label htmlFor="rd-questions" className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans">
            Core Questions
          </label>
          <textarea
            id="rd-questions"
            rows={3}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            placeholder="1. How does X impact Y?&#10;2. What are the underlying mechanisms?"
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>

        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-6 transition-all duration-200">
          <label htmlFor="rd-methodology" className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans">
            Methodology & Approach
          </label>
          <textarea
            id="rd-methodology"
            rows={3}
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            placeholder="Describe your intended methodology: Literature review, empirical study, computational modeling, etc."
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end gap-4 border-t border-[var(--border-subtle)] pt-6">
        {error && (
          <p role="alert" className="mr-auto flex items-center gap-2 text-xs text-[color:var(--state-danger)] font-sans">
            <AlertCircle className="w-4 h-4 shrink-0" />
            {error}
          </p>
        )}
        <button
          onClick={handleSave}
          disabled={busy}
          className="flex items-center gap-2 px-6 py-2.5 rounded-full bg-[var(--bg-button-primary)] text-[var(--text-button)] hover:opacity-90 font-medium text-xs shadow-sm transition-transform active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed font-sans cursor-pointer"
        >
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Definition
        </button>
      </div>
    </div>
  );
}
