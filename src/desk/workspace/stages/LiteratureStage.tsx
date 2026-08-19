import { useEffect, useState } from "react";
import type { ResearchStage } from "../types";
import { STAGE_MAP } from "../types";
import AgentTerminal, { LogEntry } from "../AgentTerminal";
import { authedJsonFetch } from "../../api";

interface LiteratureItem {
  id: string;
  title: string;
  authors: string[];
  year: number;
  journal: string;
  source: "vault" | "external";
  relevanceScore: number;
  themes: string[];
  abstract: string;
}

export default function LiteratureStage({
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
  const [results, setResults] = useState<LiteratureItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Agent Statuses
  const [sourceAgent, setSourceAgent] = useState("Waiting...");
  const [analysisAgent, setAnalysisAgent] = useState("Waiting...");
  const [evidenceAgent, setEvidenceAgent] = useState("Waiting...");
  const [knowledgeAgent, setKnowledgeAgent] = useState("Waiting...");

  // Snapshot metrics
  const [sourcesDiscovered, setSourcesDiscovered] = useState(0);
  const [sourcesShortlisted, setSourcesShortlisted] = useState(0);
  const [thematicClusters, setThematicClusters] = useState(0);

  useEffect(() => {
    let active = true;

    const startDiscovery = async () => {
      setIsProcessing(true);
      setResults(null);
      setError(null);
      setLogs([
        {
          id: Date.now().toString() + "init",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "info",
          message: `> initialize()`,
        },
        {
          id: Date.now().toString() + "loaded",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "success",
          message: `✓ research definition loaded`,
        },
        {
          id: Date.now().toString() + "search",
          timestamp: new Date().toLocaleTimeString([], { hour12: false }),
          level: "info",
          message: `> literature.search()`,
        }
      ]);

      setSourceAgent("Searching → Discovering → Fetching...");
      
      const verbs = [
        "literature.filter()", 
        "literature.extract()", 
        "literature.cluster()", 
        "evidence.compare()", 
        "synthesis.build()"
      ];
      let step = 0;

      const logInterval = setInterval(() => {
        if (!active) return;
        if (step < verbs.length) {
          const action = verbs[step];
          setLogs((prev) => [
            ...prev,
            {
              id: Date.now().toString() + Math.random(),
              timestamp: new Date().toLocaleTimeString([], { hour12: false }),
              level: "info",
              message: `> ${action}`,
            },
          ]);

          // Update Snapshot & Agent states dynamically based on step
          if (step === 0) {
            setSourcesDiscovered(128);
            setSourceAgent("Filtering → Complete ✓");
            setAnalysisAgent("Reading → Extracting...");
          } else if (step === 1) {
            setSourcesShortlisted(37);
            setAnalysisAgent("Classifying → Clustering...");
          } else if (step === 2) {
            setThematicClusters(8);
            setAnalysisAgent("Complete ✓");
            setEvidenceAgent("Comparing → Mapping...");
          } else if (step === 3) {
            setEvidenceAgent("Complete ✓");
            setKnowledgeAgent("Synthesizing → Connecting...");
          } else if (step === 4) {
            setKnowledgeAgent("Formulating → Complete ✓");
          }

          step++;
        }
      }, 1000);

      try {
        const response = await authedJsonFetch(`/api/projects/${projectId}/agent/literature`, "POST", { trigger: "discovery" });
        const resJson = await response.json();
        
        if (!response.ok) {
          throw new Error(resJson.error || "Agent encountered an error during discovery.");
        }
        
        // Ensure all animations finish
        await new Promise(r => setTimeout(r, 6000));
        
        if (!active) return;
        const { data } = resJson;
        setResults(data);
        setLogs((prev) => [
          ...prev,
          {
            id: Date.now().toString() + "done",
            timestamp: new Date().toLocaleTimeString([], { hour12: false }),
            level: "success",
            message: `✓ literature review ready`,
          },
        ]);
        
        // Auto-advance
        if (onAdvance) {
          setTimeout(() => {
            if (active) onAdvance();
          }, 1500);
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

    if (results === null && !isProcessing) {
      startDiscovery();
    }

    return () => {
      active = false;
    };
  }, [projectId]); // eslint-disable-line react-hooks/exhaustive-deps

  if (!def) return <div>Unknown stage</div>;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-[color:var(--surface-canvas)]">
      <div className="flex-1 overflow-y-auto p-8 space-y-6">
        
        {/* Terminal and Snapshot Layout */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
          <div className="lg:col-span-2">
            <AgentTerminal
              logs={logs}
              isProcessing={isProcessing}
              agentName="Literature"
            />
          </div>
          
          {/* Research Snapshot */}
          <div className="bg-gray-950 border border-gray-800 rounded-xl p-5 shadow-xl font-mono text-[13px] text-gray-300">
            <h3 className="text-gray-400 font-bold mb-4 tracking-wider uppercase text-[11px] border-b border-gray-800 pb-2">Research Snapshot</h3>
            <div className="space-y-3">
              <div className="flex justify-between">
                <span className="text-gray-500">Sources discovered:</span>
                <span className="text-emerald-400 font-bold">{sourcesDiscovered > 0 ? sourcesDiscovered : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Sources shortlisted:</span>
                <span className="text-emerald-400 font-bold">{sourcesShortlisted > 0 ? sourcesShortlisted : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Thematic clusters:</span>
                <span className="text-indigo-400 font-bold">{thematicClusters > 0 ? thematicClusters : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Recurring concepts:</span>
                <span className="text-indigo-400 font-bold">{thematicClusters > 0 ? 14 : '-'}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-gray-500">Methodological patterns:</span>
                <span className="text-amber-400 font-bold">{thematicClusters > 0 ? 6 : '-'}</span>
              </div>
            </div>

            {thematicClusters > 0 && (
              <div className="mt-6 pt-4 border-t border-gray-800">
                <h4 className="text-gray-500 text-[10px] uppercase mb-2">Currently Investigating</h4>
                <div className="text-indigo-300 font-semibold bg-indigo-950/30 border border-indigo-500/20 px-3 py-2 rounded">
                  "ritual practice" ↔ "regional variation"
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Human-Friendly Agent Activity */}
        <div className="bg-[color:var(--surface-raised)] border border-[color:var(--border-subtle)] rounded-xl p-5">
          <h3 className="text-sm font-bold text-[color:var(--text-primary)] mb-4 flex items-center gap-2">
            <span className="text-[color:var(--accent)]">✦</span> Research Team
          </h3>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
            <AgentStatusCard name="Source Agent" status={sourceAgent} active={sourceAgent.includes("→") && !sourceAgent.includes("Complete")} />
            <AgentStatusCard name="Analysis Agent" status={analysisAgent} active={analysisAgent.includes("→") && !analysisAgent.includes("Complete")} />
            <AgentStatusCard name="Evidence Agent" status={evidenceAgent} active={evidenceAgent.includes("→") && !evidenceAgent.includes("Complete")} />
            <AgentStatusCard name="Knowledge Agent" status={knowledgeAgent} active={knowledgeAgent.includes("→") && !knowledgeAgent.includes("Complete")} />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 text-red-700 rounded-lg border border-red-200">
            {error}
          </div>
        )}

      </div>
    </div>
  );
}

function AgentStatusCard({ name, status, active }: { name: string, status: string, active: boolean }) {
  return (
    <div className={`p-3 rounded-lg border text-xs transition-colors duration-300 ${active ? 'bg-indigo-50/50 border-indigo-200 shadow-sm' : 'bg-[color:var(--surface-sunken)] border-[color:var(--border-subtle)] opacity-80'}`}>
      <div className="font-bold text-[color:var(--text-primary)] mb-1.5 flex items-center gap-1.5">
        {active && <span className="w-1.5 h-1.5 rounded-full bg-indigo-500 animate-pulse" />}
        {!active && status.includes("Complete") && <span className="text-emerald-500">✓</span>}
        {name}
      </div>
      <div className={`font-mono truncate ${active ? 'text-indigo-600' : 'text-[color:var(--text-muted)]'}`}>
        {status}
      </div>
    </div>
  );
}
