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
    <div className="w-full max-w-4xl mx-auto px-6 py-8 animate-in fade-in slide-in-from-bottom-4 duration-700">
      <header className="mb-8">
        <h2 className="text-3xl font-extrabold tracking-tight text-transparent bg-clip-text bg-gradient-to-br from-indigo-600 to-purple-600 dark:from-indigo-400 dark:to-purple-400 mb-2">
          Research Definition
        </h2>
        <p className="text-gray-600 dark:text-gray-400 text-lg">
          Define the boundaries and goals of your journal article. These parameters will guide the autonomous research and manuscript generation phases.
        </p>
      </header>

      <div className="grid gap-6">
        <div className="group rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-indigo-100/50 dark:border-indigo-900/50 shadow-xl shadow-indigo-900/5 p-6 transition-all duration-300 hover:shadow-indigo-900/10 hover:border-indigo-300/50">
          <label className="flex items-center gap-2 text-sm font-semibold text-indigo-900 dark:text-indigo-300 mb-3 uppercase tracking-wider">
            Research Objectives
          </label>
          <textarea
            rows={3}
            value={objectives}
            onChange={(e) => setObjectives(e.target.value)}
            placeholder="What is the primary goal of this research? e.g., To evaluate the efficacy of X in conditions Y."
            className="w-full bg-transparent resize-y border-0 p-0 text-gray-900 dark:text-gray-100 text-base placeholder-gray-400 focus:ring-0 outline-none leading-relaxed"
          />
        </div>

        <div className="group rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-fuchsia-100/50 dark:border-fuchsia-900/50 shadow-xl shadow-fuchsia-900/5 p-6 transition-all duration-300 hover:shadow-fuchsia-900/10 hover:border-fuchsia-300/50">
          <label className="flex items-center gap-2 text-sm font-semibold text-fuchsia-900 dark:text-fuchsia-300 mb-3 uppercase tracking-wider">
            Core Questions
          </label>
          <textarea
            rows={3}
            value={questions}
            onChange={(e) => setQuestions(e.target.value)}
            placeholder="1. How does X impact Y?&#10;2. What are the underlying mechanisms?"
            className="w-full bg-transparent resize-y border-0 p-0 text-gray-900 dark:text-gray-100 text-base placeholder-gray-400 focus:ring-0 outline-none leading-relaxed font-serif"
          />
        </div>

        <div className="group rounded-2xl bg-white/60 dark:bg-slate-900/60 backdrop-blur-md border border-emerald-100/50 dark:border-emerald-900/50 shadow-xl shadow-emerald-900/5 p-6 transition-all duration-300 hover:shadow-emerald-900/10 hover:border-emerald-300/50">
          <label className="flex items-center gap-2 text-sm font-semibold text-emerald-900 dark:text-emerald-300 mb-3 uppercase tracking-wider">
            Methodology & Approach
          </label>
          <textarea
            rows={3}
            value={methodology}
            onChange={(e) => setMethodology(e.target.value)}
            placeholder="Describe your intended methodology: Literature review, empirical study, computational modeling, etc."
            className="w-full bg-transparent resize-y border-0 p-0 text-gray-900 dark:text-gray-100 text-base placeholder-gray-400 focus:ring-0 outline-none leading-relaxed"
          />
        </div>

        {aiFeedback && (
          <div className="rounded-xl bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-950/40 dark:to-indigo-950/40 border border-blue-200 dark:border-blue-800 p-5 shadow-sm animate-in zoom-in-95 duration-300">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900 flex items-center justify-center shrink-0">
                <Sparkles className="w-4 h-4 text-blue-600 dark:text-blue-400" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-blue-900 dark:text-blue-300 mb-1">AI Research Architect</h4>
                <p className="text-sm text-blue-800 dark:text-blue-200 leading-relaxed">{aiFeedback}</p>
              </div>
            </div>
          </div>
        )}
      </div>

      <div className="mt-8 flex items-center justify-end gap-4 border-t border-gray-200 dark:border-gray-800 pt-6">
        <button
          onClick={handleValidate}
          disabled={validating || !objectives || !questions || !methodology}
          className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-white dark:bg-slate-800 border border-gray-200 dark:border-gray-700 text-gray-700 dark:text-gray-200 font-medium text-sm shadow-sm hover:bg-gray-50 dark:hover:bg-slate-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {validating ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4 text-amber-500" />}
          Validate Design
        </button>

        <button
          onClick={handleSave}
          disabled={busy}
          className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white font-medium text-sm shadow-lg shadow-indigo-500/25 transition-all active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {busy ? <RefreshCw className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
          Save Definition
        </button>
      </div>
    </div>
  );
}
