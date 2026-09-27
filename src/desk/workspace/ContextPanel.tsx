import React, { useState, useRef, useEffect } from "react";
import type { ResearchStage } from "./types";
import { STAGE_MAP } from "./types";
import { useOptionalResearchWorkspace } from "./ResearchContext";
import { sendCopilotMessage } from "../api";

export interface AgentInfo {
  name: string;
  role: string;
  description: string;
  iconPath: string;
  quickActions: string[];
}

// A base AI icon to default to if no specific icon is needed
const AI_ICON = "M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z";

export const AGENT_CONFIGS: Record<ResearchStage, AgentInfo> = {
  definition: {
    name: "Architect",
    role: "Research Definition Assistant",
    description: "I'll help you refine your research question, methodology, and scope to ensure a strong foundation.",
    iconPath: AI_ICON,
    quickActions: ["Suggest methodologies", "Refine research question", "Identify potential constraints"],
  },
  literature: {
    name: "Librarian",
    role: "Scholarly Literature Discovery",
    description: "I'll search for relevant scholarly literature, identify major authors, and theoretical approaches.",
    iconPath: AI_ICON,
    quickActions: ["Search literature", "Find key authors", "Identify theories"],
  },
  gap_identification: {
    name: "Gap Analyst",
    role: "Research Gap Identification",
    description: "I'll analyze the literature to identify knowledge, empirical, and theoretical gaps.",
    iconPath: AI_ICON,
    quickActions: ["Identify gaps", "Classify gap types", "Explain gap importance"],
  },
  gap_selection: {
    name: "Strategist",
    role: "Gap Selection",
    description: "I'll help you choose the most impactful gap to focus on based on your parameters.",
    iconPath: AI_ICON,
    quickActions: ["Compare gaps", "Assess impact", "Evaluate feasibility"],
  },
  title_selection: {
    name: "Wordsmith",
    role: "Title Generation",
    description: "I'll propose compelling, academically appropriate titles based on your selected gap.",
    iconPath: AI_ICON,
    quickActions: ["Generate titles", "Refine title keywords", "A/B test title options"],
  },
  title_lock: {
    name: "Coordinator",
    role: "Title Lock",
    description: "I'll finalize your working title and update the project context.",
    iconPath: AI_ICON,
    quickActions: ["Confirm title", "Review title implications"],
  },
  vault_sources: {
    name: "Vault Archivist",
    role: "Knowledge Vault Management",
    description: "I'll pull relevant sources from your personal vault.",
    iconPath: AI_ICON,
    quickActions: ["Scan vault", "Match concepts", "Retrieve sources"],
  },
  source_approval_vault: {
    name: "Curator",
    role: "Vault Approval",
    description: "I'll help you review and approve the sources retrieved from your vault.",
    iconPath: AI_ICON,
    quickActions: ["Summarize source", "Check relevance", "Approve batch"],
  },
  additional_data: {
    name: "Data Ingest",
    role: "Primary Data Upload",
    description: "I'll process your uploaded datasets or supplementary PDFs.",
    iconPath: AI_ICON,
    quickActions: ["Parse data", "Extract tables", "Verify integrity"],
  },
  evidence_extraction: {
    name: "Extractor",
    role: "AI Extraction",
    description: "I'll extract key claims, methodologies, and data points from your approved sources.",
    iconPath: AI_ICON,
    quickActions: ["Extract claims", "Find statistics", "Map methodology"],
  },
  external_research: {
    name: "Web Researcher",
    role: "External Research",
    description: "I'll perform web and database searches to fill remaining evidence gaps.",
    iconPath: AI_ICON,
    quickActions: ["Search missing claims", "Find recent papers", "Verify facts"],
  },
  source_approval_external: {
    name: "Curator",
    role: "External Approval",
    description: "I'll help you review and approve the externally discovered sources.",
    iconPath: AI_ICON,
    quickActions: ["Assess credibility", "Summarize findings", "Approve batch"],
  },
  evidence_analysis: {
    name: "Synthesizer",
    role: "Evidence Matrix",
    description: "I'll build thematic clusters from your extracted evidence.",
    iconPath: AI_ICON,
    quickActions: ["Cluster evidence", "Find contradictions", "Synthesize themes"],
  },
  manual_review: {
    name: "Collaborator",
    role: "Researcher Review",
    description: "I'll assist you as you add manual conclusions and synthesize the analysis.",
    iconPath: AI_ICON,
    quickActions: ["Review synthesis", "Suggest conclusions", "Identify weak points"],
  },
  journal_discovery: {
    name: "Matchmaker",
    role: "Journal Discovery",
    description: "I'll find suitable target journals for your manuscript.",
    iconPath: AI_ICON,
    quickActions: ["Find journals", "Compare impact factors", "Check aim & scope"],
  },
  journal_requirements: {
    name: "Compliance Agent",
    role: "Journal Rules",
    description: "I'll extract and format your project to the target journal's submission rules.",
    iconPath: AI_ICON,
    quickActions: ["Extract guidelines", "Check word limits", "Identify required sections"],
  },
  draft: {
    name: "Author",
    role: "AI Draft Generation",
    description: "I'll draft your manuscript section by section based on your evidence matrix.",
    iconPath: AI_ICON,
    quickActions: ["Draft introduction", "Draft methodology", "Draft conclusion"],
  },
  citation_audit: {
    name: "Auditor",
    role: "Citation Audit",
    description: "I'll verify that every generated claim links back accurately to approved evidence.",
    iconPath: AI_ICON,
    quickActions: ["Audit citations", "Find missing references", "Format bibliography"],
  },
  originality_check: {
    name: "Shield",
    role: "Originality Check",
    description: "I'll perform a plagiarism and overlap check on the drafted text.",
    iconPath: AI_ICON,
    quickActions: ["Run originality scan", "Highlight overlaps", "Rewrite flagged text"],
  },
  draft_preview: {
    name: "Presenter",
    role: "Draft Preview",
    description: "I'll present the assembled manuscript for your review.",
    iconPath: AI_ICON,
    quickActions: ["Generate preview", "Check flow", "Read aloud"],
  },
  peer_review: {
    name: "Reviewer Panel",
    role: "AI Peer Review",
    description: "I will provide a 7-lens academic critique of your manuscript.",
    iconPath: AI_ICON,
    quickActions: ["Run full review", "Critique methodology", "Check argument strength"],
  },
  revision: {
    name: "Editor",
    role: "AI Revision",
    description: "I will map peer review feedback to specific revisions and apply them.",
    iconPath: AI_ICON,
    quickActions: ["Apply revisions", "Address major concerns", "Rewrite weak sections"],
  },
  final_editor: {
    name: "Polisher",
    role: "Final Editor",
    description: "I'll assist with manual rich-text touch-ups and final polishing.",
    iconPath: AI_ICON,
    quickActions: ["Fix formatting", "Suggest stylistic edits", "Check grammar"],
  },
  publication_readiness: {
    name: "Compliance Agent",
    role: "Readiness Check",
    description: "I'll perform a final compliance verification against the journal's rules.",
    iconPath: AI_ICON,
    quickActions: ["Run final check", "Verify all sections", "Check word count"],
  },
  export: {
    name: "Publisher",
    role: "Format & Export",
    description: "I'll generate the final formatted Word/PDF documents.",
    iconPath: AI_ICON,
    quickActions: ["Export to Word", "Export to PDF", "Generate submission package"],
  },
};

export interface ContextPanelProps {
  currentStage?: ResearchStage | string;
  isOpen: boolean;
  onToggle?: () => void;
  agent?: AgentInfo;
  projectId?: string;
  stageName?: string;
  onSendMessage?: (
    text: string,
    history: Array<{ role: "user" | "assistant"; content: string }>
  ) => Promise<{ ok: boolean; response: string; error?: string }>;
}

export default function ContextPanel({
  currentStage,
  isOpen,
  onToggle,
  agent: propAgent,
  projectId: propProjectId,
  stageName: propStageName,
  onSendMessage,
}: ContextPanelProps) {
  const researchWorkspace = useOptionalResearchWorkspace();
  const effectiveProjectId = propProjectId || researchWorkspace?.projectId || "";
  const effectiveStage = currentStage || researchWorkspace?.currentStage || "definition";
  const agent: AgentInfo =
    propAgent ||
    (typeof effectiveStage === "string" && effectiveStage in AGENT_CONFIGS
      ? AGENT_CONFIGS[effectiveStage as ResearchStage]
      : {
          name: "Copilot",
          role: "Academic Assistant",
          description: "I'll assist you with your academic work.",
          iconPath: AI_ICON,
          quickActions: [],
        });
  const stageDef = typeof effectiveStage === "string" ? STAGE_MAP.get(effectiveStage as ResearchStage) : null;

  const [history, setHistory] = useState<Array<{ role: "user" | "assistant"; content: string }>>([]);
  const [inputValue, setInputValue] = useState("");
  const [isTyping, setIsTyping] = useState(false);
  const endOfMessagesRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof endOfMessagesRef.current?.scrollIntoView === "function") {
      endOfMessagesRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [history, isTyping]);

  const handleSend = async (messageText?: string) => {
    const text = messageText || inputValue;
    if (!text.trim() || isTyping) return;

    setInputValue("");
    const newHistory = [...history, { role: "user" as const, content: text }];
    setHistory(newHistory);
    setIsTyping(true);

    try {
      if (onSendMessage) {
        const res = await onSendMessage(text, history);
        if (res.ok) {
          setHistory([...newHistory, { role: "assistant", content: res.response }]);
        } else {
          throw new Error(res.error || "Received an error response from the AI provider.");
        }
      } else {
        const res = await sendCopilotMessage(effectiveProjectId, effectiveStage as ResearchStage, text, history);
        if (res.ok) {
          setHistory([...newHistory, { role: "assistant", content: res.response }]);
        } else {
          throw new Error((res as any).error || "Received an error response from the AI provider.");
        }
      }
    } catch (err: any) {
      setHistory([...newHistory, { role: "assistant", content: `**Error**: ${err.message || "Failed to connect to Assistant."}` }]);
    } finally {
      setIsTyping(false);
    }
  };

  return (
      <aside
        className={`h-full w-full bg-[color:var(--surface-canvas)] flex flex-col ${
          isOpen ? "" : "hidden"
        }`}
      >
        <div className="p-6 pb-4 border-b border-[color:var(--border-subtle)]">
          <div className="flex items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-[color:var(--accent-subtle)] border border-[color:var(--accent-border)] flex items-center justify-center text-[color:var(--accent)] shrink-0">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d={agent.iconPath} />
                </svg>
              </div>
              <div>
                <h3 className="font-bold text-[color:var(--text-primary)]">{agent.name}</h3>
                <p className="text-[10px] uppercase tracking-wider text-[color:var(--text-muted)] font-bold">
                  {agent.role}
                </p>
              </div>
            </div>
            {onToggle && (
              <button
                type="button"
                onClick={onToggle}
                className="p-1 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-raised)] transition-colors cursor-pointer"
                title="Close panel"
                aria-label="Close copilot panel"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            )}
          </div>
          <p className="text-sm text-[color:var(--text-secondary)] leading-relaxed">
            {agent.description}
          </p>
        </div>

        <div className="flex-1 overflow-y-auto p-6 flex flex-col gap-6">
          {history.length === 0 ? (
            <>
              {/* Quick Actions */}
              <div>
                <h4 className="text-xs font-bold text-[color:var(--text-muted)] uppercase tracking-wider mb-3">
                  Suggested Actions
                </h4>
                <div className="space-y-2">
                  {agent.quickActions.map((action, idx) => (
                    <button
                      key={idx}
                      onClick={() => handleSend(action)}
                      className="w-full flex items-center justify-between p-3 rounded-[var(--radius-md)] bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] hover:border-[color:var(--accent)] hover:text-[color:var(--accent)] transition-colors text-left group cursor-pointer"
                    >
                      <span className="text-sm font-medium">{action}</span>
                      <svg className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                      </svg>
                    </button>
                  ))}
                </div>
              </div>

              {/* Current Stage Context Info */}
              <div className="bg-[color:var(--surface-raised)] rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] p-4 text-sm">
                <div className="flex items-center gap-2 mb-2 text-[color:var(--text-primary)] font-semibold">
                  <svg className="w-4 h-4 text-[color:var(--text-muted)]" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                  </svg>
                  Stage Context
                </div>
                <p className="text-[color:var(--text-secondary)]">
                  You are currently working in <strong className="text-[color:var(--text-primary)]">{propStageName || stageDef?.label || agent.role}</strong>. Any documents or data you upload here will be scoped to this stage's processing parameters.
                </p>
              </div>
            </>
          ) : (
            <div className="flex flex-col gap-4">
              {history.map((msg, idx) => (
                <div key={idx} className={`flex flex-col ${msg.role === "user" ? "items-end" : "items-start"}`}>
                  <div className={`text-[10px] uppercase font-bold tracking-wider mb-1 text-[color:var(--text-muted)]`}>
                    {msg.role === "user" ? "You" : agent.name}
                  </div>
                  <div className={`text-sm p-3 rounded-lg max-w-[90%] whitespace-pre-wrap leading-relaxed ${
                    msg.role === "user" 
                      ? "bg-[color:var(--accent)] text-white rounded-tr-none" 
                      : "bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-tl-none text-[color:var(--text-primary)]"
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              {isTyping && (
                <div className="flex flex-col items-start">
                  <div className="text-[10px] uppercase font-bold tracking-wider mb-1 text-[color:var(--text-muted)]">
                    {agent.name}
                  </div>
                  <div className="bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-lg rounded-tl-none p-3 flex gap-1">
                    <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--text-muted)] animate-bounce" style={{animationDelay: "0ms"}}></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--text-muted)] animate-bounce" style={{animationDelay: "150ms"}}></div>
                    <div className="w-1.5 h-1.5 rounded-full bg-[color:var(--text-muted)] animate-bounce" style={{animationDelay: "300ms"}}></div>
                  </div>
                </div>
              )}
              <div ref={endOfMessagesRef} />
            </div>
          )}
        </div>

        {/* Chat Input */}
        <div className="p-4 border-t border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)] shrink-0">
          <form 
            onSubmit={(e) => { e.preventDefault(); handleSend(); }}
            className="relative"
          >
            <input
              type="text"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={isTyping}
              placeholder={`Ask ${agent.name} a question...`}
              className="w-full bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-full pl-4 pr-10 py-2 text-sm text-[color:var(--text-primary)] placeholder-[color:var(--text-muted)] focus:outline-none focus:border-[color:var(--accent)] focus:ring-1 focus:ring-[color:var(--accent)] transition-shadow disabled:opacity-50"
            />
            <button 
              type="submit"
              disabled={!inputValue.trim() || isTyping}
              className="absolute right-2 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-[color:var(--accent)] text-white flex items-center justify-center hover:bg-[color:var(--accent-hover)] disabled:opacity-50 transition-colors cursor-pointer"
            >
              <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 12h14M12 5l7 7-7 7" />
              </svg>
            </button>
          </form>
        </div>
      </aside>
  );
}
