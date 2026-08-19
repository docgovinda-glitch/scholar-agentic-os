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
    <div className="flex flex-col bg-gray-950 rounded-xl border border-gray-800 overflow-hidden shadow-2xl h-[360px] w-full font-mono text-[13px] text-gray-300 relative">
      {/* Subtle glowing accent line */}
      <div className="absolute top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent"></div>
      
      {/* Terminal Header */}
      <div className="flex items-center justify-between px-4 py-2.5 bg-gray-900/80 border-b border-gray-800 backdrop-blur-sm">
        <div className="flex items-center gap-3">
          <div className="flex gap-1.5">
            <div className="w-2.5 h-2.5 rounded-full bg-red-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-yellow-500/80" />
            <div className="w-2.5 h-2.5 rounded-full bg-green-500/80" />
          </div>
          <span className="font-bold text-gray-400 tracking-wider text-[10px] uppercase">Scholar_Core / Research_Pipeline / {agentName.replace(/\s+/g, '_')}</span>
        </div>
        <div className="flex items-center gap-2">
          {isProcessing && (
            <span className="flex items-center gap-1.5 text-indigo-400 font-bold text-[10px] uppercase tracking-widest">
              <span className="w-2 h-2 rounded-full bg-indigo-500 animate-pulse" />
              Active
            </span>
          )}
        </div>
      </div>

      {/* Terminal Output */}
      <div 
        ref={scrollRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-4 space-y-1"
      >
        {logs.length === 0 ? (
          <div className="text-gray-600 italic">Awaiting instructions...</div>
        ) : (
          logs.map((log) => (
            <div key={log.id} className="flex gap-3 items-start group">
              <span className="shrink-0 text-gray-600">[{log.timestamp}]</span>
              <span className="shrink-0 select-none">
                {log.level === "info" && <span className="text-indigo-400 font-bold">{">"}</span>}
                {log.level === "action" && <span className="text-blue-400 font-bold">{">"}</span>}
                {log.level === "success" && <span className="text-emerald-400 font-bold">{"✓"}</span>}
                {log.level === "warning" && <span className="text-amber-400 font-bold">{"!"}</span>}
                {log.level === "error" && <span className="text-red-400 font-bold">{"✕"}</span>}
              </span>
              <span className={`break-words ${
                log.level === "action" ? "text-gray-300" :
                log.level === "success" ? "text-emerald-300 font-semibold" :
                log.level === "error" ? "text-red-400 font-semibold" :
                log.level === "warning" ? "text-amber-300" :
                "text-indigo-200"
              }`}>
                {log.message}
              </span>
            </div>
          ))
        )}
        {isProcessing && (
          <div className="flex gap-3 items-center mt-2 opacity-70">
            <span className="shrink-0 text-gray-600 opacity-0">[00:00:00]</span>
            <span className="text-indigo-400 font-bold">{">"}</span>
            <span className="w-2 h-4 bg-indigo-400 animate-pulse" />
          </div>
        )}
      </div>
    </div>
  );
}
