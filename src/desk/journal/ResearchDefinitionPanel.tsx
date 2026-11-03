import { useState } from "react";
import type { ProjectView } from "../types";
import { saveIntakeAnswers } from "../api";
import { Save, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

interface ResearchDefinitionPanelProps {
  projectId: string;
  project: ProjectView;
  onSaved: (updated: ProjectView) => void;
}

function answerText(project: ProjectView, key: string): string {
  const value = project.answers?.[key];
  return typeof value === "string" ? value : "";
}

export default function ResearchDefinitionPanel({ projectId, project, onSaved }: ResearchDefinitionPanelProps) {
  const [objectives, setObjectives] = useState(() => answerText(project, "objectives"));
  const [questions, setQuestions] = useState(() => answerText(project, "questions"));
  const [methodology, setMethodology] = useState(() => answerText(project, "methodology"));

  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "ok" | "error"; text: string } | null>(null);

  async function handleSave() {
    setBusy(true);
    setStatus(null);
    try {
      // The server merges this patch into the project's existing answers.
      const updated = await saveIntakeAnswers(projectId, { objectives, questions, methodology });
      onSaved(updated);
      setStatus({ tone: "ok", text: "Saved." });
    } catch (e) {
      setStatus({ tone: "error", text: e instanceof Error ? e.message : "The research definition could not be saved." });
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
          Record the objectives, core questions and methodology of your journal article. They are saved with your project.
        </p>
      </header>

      <div className="grid gap-6">
        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-6 transition-all duration-200">
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans">
            Research Objectives
          </label>
          <textarea
            rows={3}
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            placeholder="What is the primary goal of this research? e.g., To evaluate the efficacy of X in conditions Y."
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>

        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-6 transition-all duration-200">
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans">
            Core Questions
          </label>
          <textarea
            rows={3}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            placeholder="1. How does X impact Y?&#10;2. What are the underlying mechanisms?"
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>

        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-6 transition-all duration-200">
          <label className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans">
            Methodology & Approach
          </label>
          <textarea
            rows={3}
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            placeholder="Describe your intended methodology: Literature review, empirical study, computational modeling, etc."
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>
      </div>

      <div className="mt-8 flex items-center justify-end gap-4 border-t border-[var(--border-subtle)] pt-6">
        {status && (
          <p
            role={status.tone === "error" ? "alert" : "status"}
            className={`flex items-center gap-2 text-xs font-sans ${status.tone === "error" ? "text-[color:var(--state-danger)]" : "text-[var(--text-secondary)]"}`}
          >
            {status.tone === "error" ? <AlertCircle className="w-4 h-4" /> : <CheckCircle2 className="w-4 h-4" />}
            {status.text}
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
