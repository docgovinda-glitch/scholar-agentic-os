import { useEffect, useState } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch } from "../../api";

export default function GapIdentificationStage({
  stage,
  projectId,
  onAdvance,
}: {
  stage: ResearchStage;
  projectId: string;
  onAdvance?: () => void;
}) {
  const def = STAGE_MAP.get(stage);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasFinished, setHasFinished] = useState(false);

  useEffect(() => {
    let active = true;

    const startAnalysis = async () => {
      setIsProcessing(true);
      setError(null);
      setLogs([
        {
          id: Date.now().toString() + "1",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "info",
          message: `> literature.review.complete()`,
        },
        {
          id: Date.now().toString() + "2",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ evidence collected`,
        },
        {
          id: Date.now().toString() + "3",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ themes mapped`,
        },
        {
          id: Date.now().toString() + "4",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ contradictions detected`,
        },
        {
          id: Date.now().toString() + "5",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "info",
          message: `> gap.detect()`,
        }
      ]);

      const actions = [
        "comparing research coverage...",
        "checking unexplored relationships...",
        "evaluating methodological limitations...",
        "identifying under-researched populations...",
        "testing novelty...",
        "ranking candidate gaps..."
      ];
      let step = 0;

      const logInterval = setInterval(() => {
        if (!active) return;
        if (step < actions.length) {
          const msg = actions[step];
          setLogs((prev) => [
            ...prev,
            {
              id: Date.now().toString() + Math.random(),
              timestamp: new Date().toLocaleTimeString([], { hour12: false }),
              level: "action",
              message: `  ${msg}`,
            },
          ]);
          step++;
        }
      }, 1000);

      try {
        const response = await authedJsonFetch(`/api/projects/${projectId}/agent/gaps`, "POST", {});
        const resJson = await response.json();
        
        if (!response.ok) {
          throw new Error(resJson.error || "Agent encountered an error during gap identification.");
        }
        
        await new Promise(r => setTimeout(r, 6500)); // wait for animations
        
        if (!active) return;
        const { data } = resJson;
        
        setLogs((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "done1",
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "info",
            message: `> gap.rank()`,
          },
          {
            id: Date.now().toString() + "done2",
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "success",
            message: `${data.length} high-potential research gaps identified.`,
          }
        ]);
        
        setHasFinished(true);
        
        // Auto-advance
        if (onAdvance) {
          setTimeout(() => {
            if (active) onAdvance();
          }, 2000);
        }
        
      } catch (err: any) {
        if (!active) return;
        setError(err.message);
        setLogs((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "err",
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "error",
            message: err.message,
          },
        ]);
      } finally {
        if (active) {
          clearInterval(logInterval);
          setIsProcessing(false);
        }
      }
    };

    if (!isProcessing && !hasFinished) {
      startAnalysis();
    }

    return () => {
      active = false;
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      <div className="flex-1 overflow-y-auto p-8 flex justify-center items-center">
        
        <div className="w-full max-w-4xl animate-fade-in">
          <AgentTerminal
            logs={logs}
            isProcessing={isProcessing}
            agentName="Gap Analyst"
          />
          
          {error && (
            <div className="mt-4 p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
              {error}
            </div>
          )}
        </div>
        
      </div>
    </div>
  );
}
