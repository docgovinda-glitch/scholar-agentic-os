import { useState } from "react";
import { saveIntakeAnswers } from "../api";
import type { ProjectView } from "../types";
import { Save, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

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
  const [status, setStatus] = useState<{ kind: "saved" | "error"; message: string } | null>(null);

  async function handleSave() {
    setBusy(true);
    setStatus(null);
    try {
      const updated = await saveIntakeAnswers(projectId, { objectives, questions, methodology });
      onSaved(updated);
      setStatus({ kind: "saved", message: "Definition saved." });
    } catch (err) {
      setStatus({
        kind: "error",
        message: err instanceof Error ? err.message : "Could not save your definition. Please try again.",
      });
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
          <label
            htmlFor="research-def-objectives"
            className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans"
          >
            Research Objectives
          </label>
          <textarea
            id="research-def-objectives"
            rows={3}
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            placeholder="What is the primary goal of this research? e.g., To evaluate the efficacy of X in conditions Y."
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>

        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-6 transition-all duration-200">
          <label
            htmlFor="research-def-questions"
            className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans"
          >
            Core Questions
          </label>
          <textarea
            id="research-def-questions"
            rows={3}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            placeholder="1. How does X impact Y?&#10;2. What are the underlying mechanisms?"
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>

        <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] shadow-[var(--shadow-card)] p-6 transition-all duration-200">
          <label
            htmlFor="research-def-methodology"
            className="flex items-center gap-2 text-xs font-bold text-[var(--text-secondary)] mb-3 uppercase tracking-wider font-sans"
          >
            Methodology & Approach
          </label>
          <textarea
            id="research-def-methodology"
            rows={3}
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            placeholder="Describe your intended methodology: Literature review, empirical study, computational modeling, etc."
            className="w-full bg-transparent resize-y border-0 p-0 text-[var(--text-primary)] text-base placeholder-[var(--text-secondary)]/50 focus:ring-0 outline-none leading-relaxed font-sans"
          />
        </div>

        {status && (
          <div
            role={status.kind === "error" ? "alert" : "status"}
            className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-4 shadow-[var(--shadow-card)] flex items-center gap-3 text-sm text-[var(--text-primary)] font-sans"
          >
            {status.kind === "error" ? (
              <AlertCircle className="w-4 h-4 text-[var(--text-primary)] shrink-0" />
            ) : (
              <CheckCircle2 className="w-4 h-4 text-[var(--text-primary)] shrink-0" />
            )}
            <span>{status.message}</span>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-end gap-4 border-t border-[var(--border-subtle)] pt-6">
        <button
          type="button"
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
