import { useState, useEffect } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";

export default function PlaceholderStage({ stage }: { stage: ResearchStage }) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);

  // Simulate an agent processing when the stage is opened
  useEffect(() => {
    setLogs([]);
    setIsProcessing(true);
    
    let timer1: NodeJS.Timeout;
    let timer2: NodeJS.Timeout;
    let timer3: NodeJS.Timeout;

    // A tiny simulation of agent activity
    timer1 = setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "1",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "info",
          message: `Initializing agent context for stage: ${def?.label}`,
        },
      ]);
    }, 1000);

    timer2 = setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "2",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "action",
          message: `Fetching relevant documents from knowledge vault...`,
        },
      ]);
    }, 2500);

    timer3 = setTimeout(() => {
      setLogs((prev) => [
        ...prev,
        {
          id: Date.now().toString() + "3",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "warning",
          message: `This stage is not fully implemented in the backend yet. Awaiting developer integration.`,
        },
      ]);
      setIsProcessing(false);
    }, 4000);

    return () => {
      clearTimeout(timer1);
      clearTimeout(timer2);
      clearTimeout(timer3);
    };
  }, [stage, def?.label]);

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-8 pb-4">
        <div className="flex items-center gap-3 mb-2">
          <div className="w-10 h-10 rounded-[var(--radius-lg)] bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] flex items-center justify-center text-[color:var(--text-muted)]">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={def.icon} />
            </svg>
          </div>
          <div>
            <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
              {def.number}. {def.label}
            </h2>
            <p className="text-sm text-[color:var(--text-secondary)]">
              {def.description}
            </p>
          </div>
        </div>
      </div>

      <div className="px-8 pb-8 flex-1 overflow-y-auto space-y-6">
        <AgentTerminal 
          logs={logs} 
          isProcessing={isProcessing} 
          agentName={`${def.shortLabel} Agent`}
        />

        <div className="bg-[color:var(--surface-sunken)] border border-[color:var(--border-subtle)] rounded-[var(--radius-lg)] p-6 text-center">
          <svg className="w-12 h-12 text-[color:var(--text-muted)] mx-auto mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M19.428 15.428a2 2 0 00-1.022-.547l-2.387-.477a6 6 0 00-3.86.517l-.318.158a6 6 0 01-3.86.517L6.05 15.21a2 2 0 00-1.806.547M8 4h8l-1 1v5.172a2 2 0 00.586 1.414l5 5c1.26 1.26.367 3.414-1.415 3.414H4.828c-1.782 0-2.674-2.154-1.414-3.414l5-5A2 2 0 009 10.172V5L8 4z" />
          </svg>
          <h3 className="text-lg font-semibold text-[color:var(--text-primary)] mb-2">Stage Under Construction</h3>
          <p className="text-sm text-[color:var(--text-secondary)] max-w-md mx-auto mb-6">
            The 25-stage agentic pipeline UI is now mapped. This specific component is awaiting its specialized AI integration and form elements.
          </p>
        </div>
      </div>
    </div>
  );
}
