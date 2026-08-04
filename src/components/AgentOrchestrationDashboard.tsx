import React, { useState, useEffect } from "react";
import { PaperProject } from "../types";
import { Sparkles, Play, AlertCircle, CheckCircle2, Clock, Zap, HelpCircle } from "lucide-react";
import { GlassmorphicCard, StatusIndicator, ProgressBar } from "./SciFiComponents";
import { executeAgent } from "../services/agentService";

interface AgentOrchestrationDashboardProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
}

interface AgentInfo {
  id: string;
  name: string;
  description: string;
  capabilities: string[];
  inputRequired: string[];
  outputType: string;
  estimatedDuration: string;
  icon: string;
  status: "available" | "running" | "completed" | "error";
  lastRun?: string;
  errorMessage?: string;
}

const AGENTS_METADATA: AgentInfo[] = [
  {
    id: "research-planner",
    name: "Research Planner Agent",
    description: "Plans structured research with phases, milestones, and risk mitigation",
    capabilities: ["Research planning", "Milestone generation", "Risk assessment"],
    inputRequired: ["title", "objectives", "methodology"],
    outputType: "ResearchPlan",
    estimatedDuration: "30-60s",
    icon: "📋",
    status: "available",
  },
  {
    id: "literature-review",
    name: "Literature Review Agent",
    description: "Identifies themes, evidence maps, and research gaps from literature",
    capabilities: ["Theme identification", "Evidence mapping", "Gap analysis"],
    inputRequired: ["research questions", "discipline"],
    outputType: "LiteratureReview",
    estimatedDuration: "45-90s",
    icon: "📚",
    status: "available",
  },
  {
    id: "knowledge-gap",
    name: "Knowledge Gap Agent",
    description: "Analyzes conceptual gaps between existing research and your objectives",
    capabilities: ["Gap identification", "Novelty assessment"],
    inputRequired: ["literature review", "research plan"],
    outputType: "KnowledgeGapReport",
    estimatedDuration: "20-40s",
    icon: "🔍",
    status: "available",
  },
  {
    id: "research-question",
    name: "Research Question Agent",
    description: "Formulates research questions and hypotheses aligned with your gap",
    capabilities: ["Question formulation", "Hypothesis generation"],
    inputRequired: ["research plan", "knowledge gap"],
    outputType: "ResearchQuestionReport",
    estimatedDuration: "25-45s",
    icon: "❓",
    status: "available",
  },
  {
    id: "methodology-advisor",
    name: "Methodology Advisor Agent",
    description: "Recommends research methods, study design, and sampling strategies",
    capabilities: ["Method selection", "Design planning", "Validity assessment"],
    inputRequired: ["research plan", "research questions"],
    outputType: "MethodologyReport",
    estimatedDuration: "40-60s",
    icon: "🔬",
    status: "available",
  },
  {
    id: "statistical-analysis",
    name: "Statistical Analysis Agent",
    description: "Advises on statistical methods, tests, and analysis approaches",
    capabilities: ["Test selection", "Analysis planning"],
    inputRequired: ["research questions", "methodology"],
    outputType: "StatisticalAnalysisReport",
    estimatedDuration: "30-50s",
    icon: "📊",
    status: "available",
  },
  {
    id: "integrity-reviewer",
    name: "Integrity & Ethics Reviewer Agent",
    description: "Reviews for academic integrity, ethical compliance, and citation accuracy",
    capabilities: ["Integrity audit", "Ethical verification", "Citation checking"],
    inputRequired: ["manuscript", "research plan"],
    outputType: "IntegrityReviewReport",
    estimatedDuration: "60-120s",
    icon: "✓",
    status: "available",
  },
];

export function AgentOrchestrationDashboard({
  project,
  updateProject
}: AgentOrchestrationDashboardProps) {
  const [agents, setAgents] = useState<AgentInfo[]>(AGENTS_METADATA);
  const [runningAgents, setRunningAgents] = useState<Set<string>>(new Set());
  const [overallProgress, setOverallProgress] = useState(0);

  const checkInputAvailability = (agent: AgentInfo): boolean => {
    const available = {
      "title": !!project.title,
      "objectives": !!project.objectives,
      "methodology": !!project.methodology,
      "discipline": !!project.field,
      "research questions": !!project.researchQuestions,
      "literature review": !!project.groundingMap,
      "research plan": !!project.sections?.["Research Plan"],
      "knowledge gap": !!project.sections?.["Knowledge Gap"],
      "research questions report": !!project.sections?.["Research Questions"],
      "manuscript": Object.keys(project.sections || {}).length > 0,
    };

    return agent.inputRequired.every((input) =>
      Object.entries(available).some(([key, val]) => input.includes(key) && val)
    );
  };

  const canRun = (agent: AgentInfo): boolean => {
    return checkInputAvailability(agent) && !runningAgents.has(agent.id);
  };

  const handleRunAgent = async (agent: AgentInfo) => {
    setRunningAgents((prev) => new Set([...prev, agent.id]));

    try {
      const input = {
        title: project.title,
        objectives: project.objectives?.split("\n"),
        methodology: project.methodology,
        discipline: project.field,
        researchQuestions: project.researchQuestions?.split("\n"),
        aiSettings: project.aiSettings,
      };

      const result = await executeAgent(agent.id, input);

      if (result.ok) {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === agent.id
              ? {
                  ...a,
                  status: "completed",
                  lastRun: new Date().toLocaleString(),
                  errorMessage: undefined,
                }
              : a
          )
        );
      } else {
        setAgents((prev) =>
          prev.map((a) =>
            a.id === agent.id
              ? {
                  ...a,
                  status: "error",
                  errorMessage: result.error?.message || "Unknown error",
                }
              : a
          )
        );
      }
    } catch (err: any) {
      setAgents((prev) =>
        prev.map((a) =>
          a.id === agent.id
            ? {
                ...a,
                status: "error",
                errorMessage: err.message || "Execution failed",
              }
            : a
        )
      );
    } finally {
      setRunningAgents((prev) => {
        const next = new Set(prev);
        next.delete(agent.id);
        return next;
      });
    }
  };

  const completedCount = agents.filter((a) => a.status === "completed").length;
  const errorCount = agents.filter((a) => a.status === "error").length;
  const totalAgents = agents.length;

  useEffect(() => {
    const progress = Math.round((completedCount / totalAgents) * 100);
    setOverallProgress(progress);
  }, [completedCount, totalAgents]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="border-b border-slate-700 pb-4">
        <h2 className="text-xl font-bold text-slate-100 flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-luminous-blue" />
          Agent Orchestration Dashboard
        </h2>
        <p className="text-sm text-slate-400 mt-2">
          Run specialized research agents to enhance your project with AI-powered analysis.
        </p>
      </div>

      {/* Overall Progress */}
      <GlassmorphicCard className="p-4">
        <div className="space-y-3">
          <div className="flex justify-between items-center">
            <span className="text-sm font-mono text-slate-300">Overall Progress</span>
            <span className="text-sm font-mono font-bold text-luminous-blue">{overallProgress}%</span>
          </div>
          <ProgressBar progress={overallProgress} />
          <div className="flex gap-4 text-xs text-slate-400 font-mono">
            <span>✓ {completedCount} completed</span>
            <span>⚠ {errorCount} errors</span>
            <span>→ {totalAgents - completedCount - errorCount} available</span>
          </div>
        </div>
      </GlassmorphicCard>

      {/* Agents Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {agents.map((agent) => {
          const isRunning = runningAgents.has(agent.id);
          const isAvailable = canRun(agent);

          return (
            <GlassmorphicCard
              key={agent.id}
              className={`p-4 transition-all ${
                agent.status === "completed" ? "border-emerald-500/30" : ""
              }`}
            >
              <div className="space-y-3">
                {/* Header */}
                <div className="flex items-start gap-3">
                  <span className="text-2xl">{agent.icon}</span>
                  <div className="flex-1 min-w-0">
                    <h4 className="font-mono font-bold text-slate-100 text-sm">{agent.name}</h4>
                    <p className="text-xs text-slate-400 mt-1 leading-relaxed">
                      {agent.description}
                    </p>
                  </div>
                </div>

                {/* Status */}
                <div>
                  <StatusIndicator
                    status={
                      isRunning ? "processing" : agent.status === "completed" ? "success" : agent.status === "error" ? "error" : "idle"
                    }
                    label={
                      isRunning
                        ? "Running…"
                        : agent.status === "completed"
                        ? `Completed ${agent.lastRun ? `• ${agent.lastRun}` : ""}`
                        : agent.status === "error"
                        ? `Error: ${agent.errorMessage}`
                        : "Ready"
                    }
                  />
                </div>

                {/* Capabilities */}
                <div className="space-y-1.5">
                  <p className="text-xs text-slate-500">Capabilities</p>
                  <div className="flex flex-wrap gap-1.5">
                    {agent.capabilities.map((cap) => (
                      <span
                        key={cap}
                        className="inline-block text-xs px-2 py-1 bg-navy-3 rounded text-slate-400"
                      >
                        {cap}
                      </span>
                    ))}
                  </div>
                </div>

                {/* Input Requirements */}
                <div className="text-xs text-slate-500 font-mono">
                  <span className="text-amber-400">⏱ {agent.estimatedDuration}</span>
                </div>

                {/* Action Button */}
                <button
                  onClick={() => handleRunAgent(agent)}
                  disabled={!isAvailable || isRunning}
                  title={
                    !isAvailable && !isRunning
                      ? `Requires: ${agent.inputRequired.join(", ")}`
                      : isRunning
                      ? "Running…"
                      : "Run this agent"
                  }
                  className={`w-full py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-2 ${ isRunning ? "bg-blue-500/20 border border-blue-500/40 text-blue-400 cursor-wait" : isAvailable ? "bg-luminous-blue/20 hover:bg-luminous-blue/30 border border-luminous-blue/40 text-luminous-blue cursor-pointer" : "bg-slate-700 border border-slate-600 text-slate-500 cursor-not-allowed opacity-50" }`}
                >
                  {isRunning && <Clock className="w-3 h-3 animate-spin" />}
                  {isRunning ? "Running" : "Run Agent"}
                </button>
              </div>
            </GlassmorphicCard>
          );
        })}
      </div>

      {/* Info */}
      <GlassmorphicCard className="p-4 border-slate-600">
        <div className="flex gap-2">
          <HelpCircle className="w-4 h-4 text-slate-500 flex-shrink-0 mt-0.5" />
          <p className="text-xs text-slate-400 leading-relaxed">
            Each agent requires specific project data to run. Start with <strong>Research Planner</strong> and
            <strong> Literature Review</strong> agents, then proceed through the chain. Completed agents unlock downstream analyses.
          </p>
        </div>
      </GlassmorphicCard>
    </div>
  );
}
