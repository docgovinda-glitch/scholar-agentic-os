import { useState } from "react";
import type { ProjectView } from "../../types";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import { saveIntakeAnswers } from "../../api";

export default function ManualReviewStage({
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
  
  const [synthesis, setSynthesis] = useState(project.answers?.["manual_synthesis"] || "");
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    setIsSaving(true);
    setError(null);
    try {
      const newAnswers = {
        ...project.answers,
        manual_synthesis: synthesis,
        phase_3_signed_off: "true"
      };
      const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
      onSaved(updatedProject);
    } catch (err: any) {
      setError(err.message || "Failed to save synthesis.");
    } finally {
      setIsSaving(false);
    }
  };

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      <div className="p-8 pb-4 border-b border-[color:var(--border-subtle)] flex justify-between items-center bg-[color:var(--surface-raised)] z-10 shadow-sm relative">
        <div className="flex items-center gap-4">
          <div className="w-12 h-12 rounded-xl bg-orange-100 border border-orange-200 flex items-center justify-center text-orange-600">
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
          <div className="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-3xl p-12 text-center shadow-xl">
            
            <div className="w-24 h-24 bg-white rounded-full flex items-center justify-center mx-auto mb-6 shadow-md border border-orange-100">
              <svg className="w-12 h-12 text-orange-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z" />
              </svg>
            </div>
            
            <h3 className="text-4xl font-black text-gray-900 mb-4 tracking-tight">
              Phase 3 Sign-Off
            </h3>
            
            <p className="text-xl text-gray-700 mb-8 max-w-2xl mx-auto leading-relaxed">
              You have successfully combined your Knowledge Vault evidence with External Literature to build a rigorous theoretical framework.
            </p>

            <div className="bg-white rounded-2xl p-6 mb-10 text-left border border-orange-100 shadow-sm">
              <h4 className="font-bold text-gray-900 mb-4 text-lg border-b border-gray-100 pb-2">Readiness Checklist</h4>
              <ul className="space-y-4">
                <li className="flex items-start gap-3">
                  <div className="mt-1 text-green-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-bold text-gray-900">External Sources Approved</span>
                    <p className="text-sm text-gray-600">All external web citations have been verified by you.</p>
                  </div>
                </li>
                <li className="flex items-start gap-3">
                  <div className="mt-1 text-green-500">
                    <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </div>
                  <div>
                    <span className="font-bold text-gray-900">Evidence Matrix Synthesized</span>
                    <p className="text-sm text-gray-600">Core arguments logically bridge vault data and external literature.</p>
                  </div>
                </li>
              </ul>
            </div>
            
            {error && (
              <div className="mb-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
                {error}
              </div>
            )}

            <div className="bg-white rounded-2xl p-6 mb-8 text-left border border-orange-100 shadow-sm">
              <h4 className="font-bold text-gray-900 mb-4 text-lg border-b border-gray-100 pb-2">Manual Synthesis (Optional)</h4>
              <p className="text-sm text-gray-600 mb-4">
                Add your own conclusions, overarching themes, or specific instructions that the Drafting AI should keep in mind.
              </p>
              <textarea
                value={synthesis}
                onChange={(e) => setSynthesis(e.target.value)}
                className="w-full h-32 p-4 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-orange-500 resize-none text-gray-800"
                placeholder="E.g., Make sure to emphasize the limitations of the methodology in the discussion section..."
              />
            </div>
            
            <p className="text-sm font-bold text-orange-800 uppercase tracking-widest mb-6">
              Next Phase: Journal Discovery & AI Drafting
            </p>
            
            <button 
              onClick={handleConfirm}
              disabled={isSaving || project.answers?.["phase_3_signed_off"] === "true"}
              className="px-10 py-5 rounded-2xl bg-orange-600 text-white font-black text-xl shadow-lg hover:bg-orange-700 hover:-translate-y-1 hover:shadow-xl transition-all flex items-center justify-center gap-3 w-full max-w-lg mx-auto disabled:opacity-50"
            >
              {isSaving ? "Saving..." : project.answers?.["phase_3_signed_off"] === "true" ? "Framework Confirmed" : "Confirm Framework & Proceed"}
              {!isSaving && project.answers?.["phase_3_signed_off"] !== "true" && (
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" />
                </svg>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
