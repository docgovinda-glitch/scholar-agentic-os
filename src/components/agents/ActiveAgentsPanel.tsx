import React, { useState } from "react";
import { Sparkles, Loader2, Send } from "lucide-react";
import { PaperProject } from "../../types";
import { draftSection } from "../../services/aiService";

// Subcomponent: Interactive OS Active Agents Panel
export interface ActiveAgentsPanelProps {
  project: PaperProject;
}

export default function ActiveAgentsPanel({ project }: ActiveAgentsPanelProps) {
  const [selectedAgent, setSelectedAgent] = useState("Literature Review Agent");
  const [query, setQuery] = useState("");
  const [response, setResponse] = useState("");
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  const agents = [
    { name: "Literature Review Agent", role: "Critical literature hermeneutics, source grounding", status: "Online" },
    { name: "Citation Agent", role: "Sanskrit scriptural citation verification, indexing", status: "Online" },
    { name: "Methodology Agent", role: "Epistemological rigor audit, method modeling", status: "Online" },
    { name: "Journal Matching Agent", role: "Elsevier / Springer Scopus WoS index matching", status: "Online" },
    { name: "Ethics & Integrity Agent", role: "Plagiarism audit, Vedic moral alignment checks", status: "Online" },
    { name: "Manuscript Structuring Agent", role: "Structural outlines, wordcount balancing", status: "Online" }
  ];

  const suggestedQueries: Record<string, string[]> = {
    "Literature Review Agent": [
      "What are the primary Kautilyan statecraft constructs for corporate stewardship?",
      "How do Upanishadic notions of trusteeship challenge shareholder-primacy?"
    ],
    "Citation Agent": [
      "Provide Rigveda Sanskrit verses on collective sharing of assets.",
      "Show Sanskrit verse citation and translation for Isavasya Upanishad Verse 1."
    ],
    "Methodology Agent": [
      "How do I justify integrating classical Sanskrit hermeneutics into a conceptual CSR study?",
      "What are the research limitations of Kautilyan text comparisons?"
    ],
    "Journal Matching Agent": [
      "What Scopus indexed business ethics journals are best suited for Eastern philosophy studies?",
      "Suggest double-blind peer-reviewed journals with low/zero publishing charges (APC)."
    ],
    "Ethics & Integrity Agent": [
      "Draft a statement of academic integrity for Vedic-grounded corporate responsibility study.",
      "Check for potential biases when comparing Eastern cosmic-moral models with Western CSR."
    ],
    "Manuscript Structuring Agent": [
      "What is the standard outline for a conceptual academic article in business philosophy?",
      "How do I balance word count between scriptural hermeneutics and ESG framework comparisons?"
    ]
  };

  const activeAgentInfo = agents.find(a => a.name === selectedAgent) || agents[0];

  const handleConsult = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!query.trim()) return;
    setLoading(true);
    setResponse("");
    try {
      const result = await draftSection({
        sectionName: `Agent Consultation: ${selectedAgent}`,
        sectionOutline: `Query: ${query}`,
        userStyleSample: project.styleAspiration || "Academic, rigorous",
        includeScriptures: true,
        draftInstruction: `Act as the ${selectedAgent}. Role: ${activeAgentInfo.role}. Answer the scholar's query: "${query}" in the context of their research: Title: "${project.title || "Untitled"}", Objectives: "${project.objectives || "Not specified"}". Provide rigorous, publication-grade academic feedback.`,
        projectState: project
      });
      setResponse(result.draftText ?? "");
    } catch (err: any) {
      setResponse(`Consultation failed: ${err.message || "Please check your AI Settings and API keys."}`);
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(response);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-fade-in">
      {/* Agents Selection Card */}
      <div className="bg-white border border-[#E5E7EB] rounded-2xl p-5 shadow-sm space-y-4 hover-lift">
        <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D] border-b border-[#E5E7EB] pb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[#C08A3E]" />
          OS Active Agents
        </h3>
        <div className="flex flex-col gap-2">
          {agents.map((agent) => {
            const isSelected = selectedAgent === agent.name;
            return (
              <button
                key={agent.name}
                onClick={() => {
                  setSelectedAgent(agent.name);
                  setResponse("");
                }}
                className={`w-full text-left p-3 border rounded-xl transition-all duration-200 cursor-pointer flex flex-col gap-1 ${
                  isSelected
                    ? "bg-[#1A365D] text-white border-[#1A365D] shadow-sm"
                    : "bg-[#FAF8F5] text-[#1A365D] border-[#E5E7EB] hover:bg-neutral-50 hover:border-[#C08A3E]/20"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold font-sans">{agent.name}</span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${
                      isSelected ? "bg-white/20 text-white" : "bg-emerald-100 text-emerald-800"
                    }`}
                  >
                    <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-white" : "bg-emerald-500"} animate-pulse`}></span>
                    {agent.status}
                  </span>
                </div>
                <span className={`text-[10px] ${isSelected ? "text-white/80" : "text-[#6B665E]"} leading-normal font-sans`}>{agent.role}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agent Chat Console Card */}
      <div className="lg:col-span-2 bg-white border border-[#E5E7EB] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6 hover-lift">
        <div>
          <div className="border-b border-[#E5E7EB] pb-3 mb-4">
            <h3 className="text-sm font-mono font-bold uppercase tracking-wider text-[#1A365D]">Agent Console: {selectedAgent}</h3>
            <p className="text-[11px] text-[#6B665E] font-sans mt-0.5">Consult this co-agent directly regarding scriptural references, methodological design, or structural advice.</p>
          </div>

          {response ? (
            <div className="bg-[#FAF8F5] border border-[#E5E7EB] rounded-xl p-4 text-xs text-[#1A365D] leading-relaxed max-h-[300px] overflow-y-auto whitespace-pre-wrap font-sans relative animate-fade-in shadow-inner">
              <div className="flex justify-between items-center mb-2 border-b border-[#E5E7EB] pb-1.5">
                <span className="font-bold text-[10px] font-mono text-[#946A30] uppercase tracking-wider">Agent Feedback:</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2 py-0.5 border border-[#E5E7EB] hover:bg-white text-[9px] font-mono uppercase rounded text-gray-500 hover:text-[#1A365D] transition-colors cursor-pointer"
                >
                  {copied ? "Copied!" : "Copy Text"}
                </button>
              </div>
              {response}
            </div>
          ) : (
            <div className="h-[200px] border border-dashed border-[#E5E7EB] rounded-xl flex flex-col items-center justify-center text-xs text-gray-400 font-sans italic p-4 text-center gap-1">
              <span>Send a custom query or select a suggestion below.</span>
              <span className="text-[10px] text-gray-300">The agent will return publication-ready academic references and insights.</span>
            </div>
          )}
        </div>

        <form onSubmit={handleConsult} className="space-y-4">
          {/* Suggestions List */}
          <div className="space-y-1.5 pt-1">
            <span className="block text-[9px] font-mono text-[#76726A] uppercase tracking-wider font-bold">Suggested Prompts:</span>
            <div className="flex flex-col gap-1.5">
              {(suggestedQueries[selectedAgent] || []).map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setQuery(suggestion)}
                  className="px-3 py-1.5 bg-[#FAF8F5] border border-[#E2E8F0] hover:border-[#C08A3E]/45 hover:bg-white text-[#6B665E] hover:text-[#1A365D] text-[10px] rounded-lg transition-all font-sans cursor-pointer text-left block"
                >
                  💡 {suggestion}
                </button>
              ))}
            </div>
          </div>

          <textarea
            required
            rows={3}
            className="w-full p-3 text-xs bg-white border border-[#E5E7EB] rounded-lg focus:outline-none text-[#1A365D]"
            placeholder={`Ask the ${selectedAgent} a question about your project...`}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[#1A365D] hover:bg-[#1A365D]/90 disabled:bg-gray-300 text-white text-xs font-mono font-bold uppercase tracking-widest rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
            >
              {loading ? (
                <>
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                  <span>Analyzing...</span>
                </>
              ) : (
                <>
                  <Send className="w-3.5 h-3.5" />
                  <span>Consult Agent</span>
                </>
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

