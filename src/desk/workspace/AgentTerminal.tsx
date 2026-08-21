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
    <div className="flex flex-col bg-[color:var(--surface-sunken)] rounded-xl border border-[color:var(--border-default)] overflow-hidden shadow-2xl h-[360px] w-full font-mono text-[13px] text-[color:var(--text-primary)] relative">
      {/* Subtle accent border top */}
      <div className="absolute top-0 left-0 right-0 h-[2px] bg-[color:var(--accent)] opacity-80"></div>
      
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-[color:var(--surface-raised)] border-b border-[color:var(--border-subtle)]">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-danger)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-warning)]" />
            <div className="w-2.5 h-2.5 rounded-full bg-[color:var(--state-success)]" />
          </div>
          <span className="font-bold text-[color:var(--text-secondary)] tracking-wider text-[11px] uppercase">
            Scholar_Core / Research_Pipeline / {agentName.replace(/\s+/g, '_')}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <span className="flex items-center gap-1.5 text-[color:var(--accent)] font-bold text-[11px] uppercase tracking-wider">
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
        className="flex-1 overflow-y-auto p-4 space-y-1.5 bg-[color:var(--surface-sunken)] select-text"
      >
        {logs.length === 0 ? (
          <div className="text-[color:var(--text-muted)] italic py-2">Awaiting instructions... Click an action to begin.</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 items-start group">
              <span className="shrink-0 text-[color:var(--text-muted)] select-none font-mono">[{log.timestamp}]</span>
              <span className="shrink-0 select-none">
                {log.level === "info" && <span className="text-[color:var(--state-info)] font-bold">{">"}</span>}
                {log.level === "action" && <span className="text-[color:var(--accent)] font-bold">{">"}</span>}
                {log.level === "success" && <span className="text-[color:var(--state-success)] font-bold">{"✓"}</span>}
                {log.level === "warning" && <span className="text-[color:var(--state-warning)] font-bold">{"!"}</span>}
                {log.level === "error" && <span className="text-[color:var(--state-danger)] font-bold">{"✕"}</span>}
              </span>
              <span className={`break-words font-mono ${
                log.level === "action" ? "text-[color:var(--text-primary)] font-semibold" :
                log.level === "success" ? "text-[color:var(--state-success)] font-semibold" :
                log.level === "error" ? "text-[color:var(--state-danger)] font-bold" :
                log.level === "warning" ? "text-[color:var(--state-warning)] font-semibold" :
                "text-[color:var(--text-primary)]"
              }`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        {isProcessing && (
          <div className="flex gap-3 items-center mt-2 opacity-80">
            <span className="shrink-0 text-[color:var(--text-muted)] opacity-0 select-none">[00:00:00]</span>
            <span className="text-[color:var(--accent)] font-bold">{">"}</span>
            <span className="w-2 h-4 bg-[color:var(--accent)] animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
