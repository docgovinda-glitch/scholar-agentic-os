import { useEffect, useState, useRef } from "react";

export interface LogEntry {
  id: string;
  timestamp: string;
  level: "info" | "success" | "warning" | "error" | "action";
  message: string;
}

export default function AgentTerminal({
  logs,
  isProcessing = false,
  agentName = "Scholar Agent",
}: {
  logs: LogEntry[];
  isProcessing?: boolean;
  agentName?: string;
}) {
  const scrollRef = useRef<HTMLDivElement>(null);
  const [autoScroll, setAutoScroll] = useState(true);

  // Auto-scroll to bottom on new logs
  useEffect(() => {
    if (autoScroll && scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [logs, autoScroll]);

  const handleScroll = (e: React.UIEvent<HTMLDivElement>) => {
    const target = e.target as HTMLDivElement;
    const isAtBottom = Math.abs(target.scrollHeight - target.scrollTop - target.clientHeight) < 10;
    setAutoScroll(isAtBottom);
  };

  return (
    <div className="flex flex-col bg-[color:var(--surface-sunken)] rounded-[var(--radius-lg)] border border-[color:var(--border-subtle)] overflow-hidden shadow-sm h-[300px] w-full font-mono text-xs text-[color:var(--text-secondary)]">
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)]">
        <div className="flex items-center gap-2">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-error-subtle)] border border-[color:var(--state-error)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-warning-subtle)] border border-[color:var(--state-warning)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-success-subtle)] border border-[color:var(--state-success)]" />
          </div>
          <span className="font-semibold text-[color:var(--text-primary)] ml-2">{agentName} Process Stream</span>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <span className="flex items-center gap-1.5 text-[color:var(--accent)] font-semibold text-[10px] uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-[color:var(--accent)] animate-pulse" />
              Active
            </span>
          )}
        </div>
      </div>

      {/* Terminal Output */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 space-y-1.5"
      >
        {logs.length === 0 ? (
          <div className="text-[color:var(--text-muted)] italic">Awaiting instructions...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 items-start hover:bg-[color:var(--surface-hover)] px-1 -mx-1 rounded">
              <span className="shrink-0 text-[color:var(--text-muted)] opacity-70">[{log.timestamp}]</span>
              <span className="shrink-0 font-bold select-none">
                {log.level === "info" && <span className="text-[color:var(--text-secondary)]">{">"}</span>}
                {log.level === "action" && <span className="text-[color:var(--accent)]">{"$"}</span>}
                {log.level === "success" && <span className="text-[color:var(--state-success)]">{"✓"}</span>}
                {log.level === "warning" && <span className="text-[color:var(--state-warning)]">{"!"}</span>}
                {log.level === "error" && <span className="text-[color:var(--state-error)]">{"✕"}</span>}
              </span>
              <span className={`break-words ${
                log.level === "action" ? "text-[color:var(--text-primary)] font-semibold" :
                log.level === "success" ? "text-[color:var(--state-success)]" :
                log.level === "error" ? "text-[color:var(--state-error)]" :
                log.level === "warning" ? "text-[color:var(--state-warning)]" :
                "text-[color:var(--text-secondary)]"
              }`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        {isProcessing && (
          <div className="flex gap-3 items-center px-1 animate-pulse opacity-70">
            <span className="shrink-0 text-[color:var(--text-muted)] opacity-0">[00:00:00]</span>
            <span className="text-[color:var(--accent)]">{">"}</span>
            <span className="w-1.5 h-3 bg-[color:var(--text-secondary)] animate-bounce" style={{ animationDuration: '800ms' }} />
          </div>
        )}
      </div>
    </div>
  );
}
