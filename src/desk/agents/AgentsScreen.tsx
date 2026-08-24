import React from "react";

export default function AgentsScreen({ onClose }: { onClose: () => void }) {
  const agents = [
    {
      name: "Knowledge Extraction Agent",
      icon: "M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10",
      description: "Scans uploaded PDFs to extract structural information, claims, methodology, and key results to construct your knowledge vault.",
      color: "text-blue-500",
      bg: "bg-blue-500/10",
    },
    {
      name: "Drafting Agent",
      icon: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
      description: "Synthesizes the extracted claims and evidence into structured narrative blocks to draft your manuscript based on journal guidelines.",
      color: "text-emerald-500",
      bg: "bg-emerald-500/10",
    },
    {
      name: "Compliance & Revision Agent",
      icon: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      description: "Reviews drafted content against strict journal submission criteria, checking word counts, citation formats, and stylistic constraints.",
      color: "text-amber-500",
      bg: "bg-amber-500/10",
    }
  ];

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] px-4 py-10">
      <div className="mx-auto w-full max-w-2xl">
        <button
          type="button"
          onClick={onClose}
          className="mb-6 text-sm text-[color:var(--accent)] transition-colors hover:text-[color:var(--accent-hover)] cursor-pointer"
        >
          ← Back
        </button>
        <div className="mb-6">
          <h1 className="text-xl font-semibold tracking-tight text-[color:var(--text-primary)]">Agentic Capabilities</h1>
          <p className="mt-1.5 text-sm text-[color:var(--text-secondary)]">
            Information on the active models in your workspace.
          </p>
        </div>
        <div className="flex flex-col gap-6">
          {agents.map((agent, i) => (
            <div key={i} className="flex gap-5 items-start p-5 rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] hover:border-[color:var(--accent-border)] transition-colors">
              <div className={`w-12 h-12 flex-shrink-0 rounded-xl flex items-center justify-center ${agent.bg} ${agent.color}`}>
                <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={agent.icon} />
                </svg>
              </div>
              <div>
                <h3 className="text-lg font-bold text-[color:var(--text-primary)] mb-1">{agent.name}</h3>
                <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed">{agent.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
