import { useState } from "react";
import type { ProjectView } from "../types";
import { Sparkles, Save, CheckCircle2, AlertCircle, RefreshCw } from "lucide-react";

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
  const [validating, setValidating] = useState(false);
  const [aiFeedback, setAiFeedback] = useState<string | null>(null);
  
  async function handleSave() {
    setBusy(true);
    try {
      // Stub for actual API call, replacing saveIntakeAnswers
      // In a real implementation this would map to the new normalized schema
      const updated = { ...project, answers: { objectives, questions, methodology } };
      onSaved(updated);
      setAiFeedback(null); // Clear previous feedback on save
    } finally {
      setBusy(false);
    }
  }

  async function handleValidate() {
    if (!objectives || !questions || !methodology) return;
    setValidating(true);
    try {
      // Simulate AI validation delay
      await new Promise(r => setTimeout(r, 1500));
      setAiFeedback(
        "Strong foundation. The objectives align well with the methodology. Consider narrowing the scope of Research Question 2 to be more testable."
      );
    } finally {
      setValidating(false);
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

        {aiFeedback && (
          <div className="rounded-2xl bg-[var(--bg-card)] border border-[var(--border-subtle)] p-5 shadow-[var(--shadow-card)]">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-[var(--text-primary)]/10 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-[var(--text-primary)]" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-[var(--text-primary)] mb-1 font-sans">AI Research Architect</h4>
                <p className="text-sm text-[var(--text-secondary)] leading-relaxed font-sans">{aiFeedback}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-end gap-4 border-t border-[var(--border-subtle)] pt-6">
        <button
          onClick={handleValidate}
          disabled={validating || !objectives || !questions || !methodology}
          className="flex items-center gap-2 px-5 py-2.5 rounded-full bg-[var(--bg-card)] border border-[var(--border-subtle)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--text-primary)] font-medium text-xs shadow-xs transition-colors disabled:opacity-40 disabled:cursor-not-allowed font-sans cursor-pointer"
        >
          {validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-[var(--text-primary)]" />}
          Validate Design
        </button>

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
