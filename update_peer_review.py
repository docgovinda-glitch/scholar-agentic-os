import re

with open("src/desk/workspace/stages/PeerReviewStage.tsx", "r") as f:
    content = f.read()

# Replace saveIntakeAnswers import
content = content.replace(
    'import { authedFetch, saveIntakeAnswers } from "../../api";',
    'import { authedFetch } from "../../api";\nimport { useEffect } from "react";'
)

# Replace the saveIntakeAnswers block in startAgent
save_block = """
      try {
        const newAnswers = {
          ...project.answers,
          peer_review_critique: JSON.stringify(data),
        };
        const updatedProject = await saveIntakeAnswers(projectId, newAnswers as Record<string, string>);
        onSaved(updatedProject);
      } catch (saveErr) {
        console.error("Failed to save peer review critique", saveErr);
      }
"""
content = content.replace(save_block, "      onSaved({ ...project });\n      fetchCritiques();\n")

# Add fetchCritiques and handleWaive before startAgent
fetch_logic = """
  const fetchCritiques = async () => {
    try {
      const response = await authedFetch(`/api/projects/${projectId}/agent/critiques`);
      if (response.ok) {
        const { data } = await response.json();
        setResults(data);
      }
    } catch (e) {
      console.error("Failed to load critiques", e);
    }
  };

  useEffect(() => {
    fetchCritiques();
  }, [projectId]);

  const handleWaive = async (critiqueId: string) => {
    try {
      const response = await authedFetch(`/api/projects/${projectId}/agent/critiques/${critiqueId}/waive`, {
        method: "PUT"
      });
      if (response.ok) {
        fetchCritiques();
      }
    } catch (e) {
      console.error("Failed to waive critique", e);
    }
  };

  const startAgent = async () => {
"""
content = content.replace("  const startAgent = async () => {", fetch_logic)

# Update the results display to show the list of critiques and the waive button
results_display_old = """
        {results && (
          <div className="max-w-4xl mx-auto animate-fade-in p-6 bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl">
             <h3 className="text-xl font-bold text-green-600 mb-4 flex items-center gap-2">
               <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" /></svg>
               Stage Complete
             </h3>
             <pre className="text-sm bg-[color:var(--surface-sunken)] p-4 rounded-lg overflow-x-auto text-[color:var(--text-secondary)] whitespace-pre-wrap font-mono">
               {JSON.stringify(results, null, 2)}
             </pre>
          </div>
        )}
"""

results_display_new = """
        {results && Array.isArray(results) && results.length > 0 && (
          <div className="max-w-4xl mx-auto animate-fade-in space-y-4">
             <h3 className="text-xl font-bold text-[color:var(--text-primary)] mb-4 flex items-center gap-2">
               Peer Review Critiques
             </h3>
             {results.map((c: any) => (
               <div key={c.id || Math.random()} className={`p-6 border rounded-xl flex justify-between items-start gap-4 ${c.waived ? 'bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] opacity-70' : 'bg-[color:var(--surface-raised)] border-[color:var(--accent-border)]'}`}>
                 <div>
                   <h4 className="font-bold text-[color:var(--text-primary)] mb-1">{c.lens}</h4>
                   <p className="text-[color:var(--text-secondary)] text-sm">{c.feedback}</p>
                   {c.waived && <span className="inline-block mt-2 px-2 py-1 bg-[color:var(--state-warning-subtle)] text-[color:var(--state-warning)] text-xs font-bold rounded-full">WAIVED</span>}
                 </div>
                 {!c.waived && c.id && (
                   <button onClick={() => handleWaive(c.id)} className="px-3 py-1 bg-[color:var(--surface-canvas)] text-[color:var(--state-danger)] border border-[color:var(--border-subtle)] hover:bg-[color:var(--state-danger-subtle)] hover:border-[color:var(--state-danger)] transition-all rounded-md text-sm font-semibold cursor-pointer whitespace-nowrap">
                     Waive Feedback
                   </button>
                 )}
               </div>
             ))}
          </div>
        )}
"""
content = content.replace(results_display_old.strip(), results_display_new.strip())

with open("src/desk/workspace/stages/PeerReviewStage.tsx", "w") as f:
    f.write(content)

print("Updated PeerReviewStage.tsx")
