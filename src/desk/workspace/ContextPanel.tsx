import type { ResearchStage } from "./types";

/**
 * ContextPanel — the right column of the research workspace.
 *
 * Dynamically shows contextual AI agent activity, evidence approval queues,
 * and insights based on the current research stage. Collapsible to maximize
 * the center workspace area.
 */
export default function ContextPanel({
  currentStage,
  isOpen,
  onToggle,
}: {
  currentStage: ResearchStage;
  isOpen: boolean;
  onToggle: () => void;
}) {
  if (!isOpen) {
    return (
      <div className="border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)]">
        <button
          type="button"
          onClick={onToggle}
          title="Open AI Assistant"
          className="w-12 h-full flex flex-col items-center justify-start pt-4 gap-3 hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
        >
          <svg className="w-5 h-5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M13 10V3L4 14h7v7l9-11h-7z" />
          </svg>
          <span className="text-[10px] font-bold text-[color:var(--text-muted)] [writing-mode:vertical-lr] rotate-180">
            AI Assistant
          </span>
        </button>
      </div>
    );
  }

  const agentInfo = getAgentForStage(currentStage);

  return (
    <aside className="w-[320px] shrink-0 border-l border-[color:var(--border-subtle)] bg-[color:var(--surface-canvas)] flex flex-col overflow-hidden">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-full bg-[color:var(--accent-subtle)] flex items-center justify-center">
            <svg className="w-3.5 h-3.5 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" />
            </svg>
          </div>
          <div>
            <h3 className="text-sm font-bold text-[color:var(--text-primary)]">{agentInfo.name}</h3>
            <p className="text-[10px] text-[color:var(--text-muted)]">{agentInfo.role}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onToggle}
          className="rounded-[var(--radius-sm)] p-1.5 text-[color:var(--text-muted)] hover:bg-[color:var(--surface-hover)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      </div>

      {/* Agent content area */}
      <div className="flex-1 overflow-y-auto p-4">
        <div className="rounded-[var(--radius-md)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] p-4 text-center">
          <div className="w-12 h-12 mx-auto mb-3 rounded-full bg-[color:var(--accent-subtle)] flex items-center justify-center">
            <svg className="w-6 h-6 text-[color:var(--accent)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={agentInfo.iconPath} />
            </svg>
          </div>
          <h4 className="text-sm font-semibold text-[color:var(--text-primary)] mb-1">{agentInfo.name}</h4>
          <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed">{agentInfo.description}</p>
        </div>

        {/* Quick actions */}
        <div className="mt-4 space-y-2">
          {agentInfo.quickActions.map((action, i) => (
            <button
              key={i}
              type="button"
              className="w-full text-left px-3 py-2.5 rounded-[var(--radius-sm)] border border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] text-xs text-[color:var(--text-secondary)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors cursor-pointer"
            >
              {action}
            </button>
          ))}
        </div>
      </div>

      {/* Chat input (future) */}
      <div className="p-3 border-t border-[color:var(--border-subtle)]">
        <div className="flex items-center gap-2 rounded-[var(--radius-md)] border border-[color:var(--border-control)] bg-[color:var(--surface-raised)] px-3 py-2.5">
          <input
            type="text"
            placeholder="Ask the AI agent..."
            className="flex-1 bg-transparent text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] outline-none border-0 p-0"
          />
          <button
            type="button"
            className="shrink-0 w-7 h-7 rounded-full bg-[color:var(--accent-solid)] text-[color:var(--text-inverse)] flex items-center justify-center hover:bg-[color:var(--accent-hover)] transition-colors cursor-pointer"
          >
            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M14 5l7 7m0 0l-7 7m7-7H3" />
            </svg>
          </button>
        </div>
      </div>
    </aside>
  );
}

interface AgentInfo {
  name: string;
  role: string;
  description: string;
  iconPath: string;
  quickActions: string[];
}

function getAgentForStage(stage: ResearchStage): AgentInfo {
  const agents: Record<ResearchStage, AgentInfo> = {
    definition: {
      name: "Research Architect",
      role: "Research Validation Agent",
      description: "I'll validate your research design, check for contradictions, and suggest improvements to your objectives, questions, and methodology.",
      iconPath: "M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z",
      quickActions: [
        "Validate my research design",
        "Suggest theoretical frameworks",
        "Check methodology alignment",
        "Identify missing definitions",
      ],
    },
    literature: {
      name: "Literature Agent",
      role: "Scholarly Literature Discovery",
      description: "I'll search for relevant scholarly literature, identify major authors, theories, and methodological approaches in your research area.",
      iconPath: "M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253",
      quickActions: [
        "Search scholarly literature",
        "Find key authors in this field",
        "Identify competing theories",
        "Show recent developments",
      ],
    },
    gap: {
      name: "Gap Analyst",
      role: "Research Gap Identification",
      description: "I'll analyze the literature to identify knowledge gaps, empirical gaps, theoretical gaps, and under-researched areas relevant to your work.",
      iconPath: "M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z",
      quickActions: [
        "Identify research gaps",
        "Classify gap types",
        "Explain why this gap matters",
        "Suggest research contributions",
      ],
    },
    evidence: {
      name: "Evidence Curator",
      role: "Evidence Collection & Approval",
      description: "I help you collect, extract, and organize evidence from your approved sources. Every piece of evidence must be approved before it can be cited.",
      iconPath: "M9 12l2 2 4-4m5.618-4.016A11.955 11.955 0 0112 2.944a11.955 11.955 0 01-8.618 3.04A12.02 12.02 0 003 9c0 5.591 3.824 10.29 9 11.622 5.176-1.332 9-6.03 9-11.622 0-1.042-.133-2.052-.382-3.016z",
      quickActions: [
        "Search Knowledge Vault",
        "Import new sources",
        "Extract evidence from PDF",
        "Review pending approvals",
      ],
    },
    analysis: {
      name: "Research Analyst",
      role: "Evidence Analysis & Synthesis",
      description: "I'll build an evidence matrix, identify thematic clusters, detect contradictions, and help you synthesize your findings.",
      iconPath: "M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z",
      quickActions: [
        "Build evidence matrix",
        "Find thematic clusters",
        "Detect contradictions",
        "Summarize key findings",
      ],
    },
    journal: {
      name: "Journal Advisor",
      role: "Journal Discovery & Requirements",
      description: "I'll help you find the right journal for your manuscript, compare options, and capture their specific submission requirements.",
      iconPath: "M19 20H5a2 2 0 01-2-2V6a2 2 0 012-2h10a2 2 0 012 2v1m2 13a2 2 0 01-2-2V7m2 13a2 2 0 002-2V9a2 2 0 00-2-2h-2m-4-3H9M7 16h6M7 8h6v4H7V8z",
      quickActions: [
        "Discover suitable journals",
        "Compare journal metrics",
        "Extract author guidelines",
        "Check scope alignment",
      ],
    },
    draft: {
      name: "Writing Assistant",
      role: "Manuscript Drafting Agent",
      description: "I'll draft your manuscript section by section, using only approved evidence and following the selected journal's requirements exactly.",
      iconPath: "M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z",
      quickActions: [
        "Generate next section",
        "Check citation integrity",
        "Improve academic tone",
        "Resolve unsupported claims",
      ],
    },
    review: {
      name: "Peer Reviewer",
      role: "AI Peer Review Agent",
      description: "I'll review your manuscript across seven academic lenses: contribution, literature, methodology, evidence, argument, citation, and journal fit.",
      iconPath: "M15 12a3 3 0 11-6 0 3 3 0 016 0z M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z",
      quickActions: [
        "Run full peer review",
        "Check methodology rigor",
        "Evaluate argument coherence",
        "Assess journal compliance",
      ],
    },
    revision: {
      name: "Revision Agent",
      role: "Guided Manuscript Revision",
      description: "I'll map reviewer comments to specific changes, explain each revision, and help you address every concern systematically.",
      iconPath: "M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15",
      quickActions: [
        "Map reviewer feedback",
        "Apply suggested revisions",
        "Compare with previous draft",
        "Track remaining issues",
      ],
    },
    final: {
      name: "Publication Check",
      role: "Publication Readiness Agent",
      description: "I'll verify your manuscript meets all publication requirements — research integrity, citation completeness, originality, and journal compliance.",
      iconPath: "M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z",
      quickActions: [
        "Run readiness check",
        "Verify citation integrity",
        "Check originality",
        "Export as Word/PDF",
      ],
    },
  };

  return agents[stage];
}
