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
      <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-5 shadow-sm space-y-4 hover-lift">
        <h3 className="text-sm font-bold text-[color:var(--text-primary)] border-b border-[color:var(--color-navy-4)] pb-2 flex items-center gap-2">
          <Sparkles className="w-4 h-4 text-[color:var(--color-luminous-blue)]" />
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
                    ? "bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--text-primary)] border-[color:var(--color-luminous-blue)] shadow-sm"
                    : "bg-[color:var(--color-navy-1)] text-[color:var(--text-primary)] border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-2)] hover:border-[color:var(--color-luminous-blue)]/40"
                }`}
              >
                <div className="flex items-center justify-between w-full">
                  <span className="text-xs font-bold font-sans">{agent.name}</span>
                  <span
                    className={`text-[9px] font-mono font-bold px-1.5 py-0.5 rounded-full flex items-center gap-1 ${
                      isSelected ? "bg-[color:var(--color-luminous-blue)]/20 text-[color:var(--accent)]" : "bg-[color:var(--color-navy-3)] text-[color:var(--text-secondary)]"
                    }`}
                  >
                    <span className={`w-1 h-1 rounded-full ${isSelected ? "bg-[color:var(--color-luminous-blue)] animate-pulse" : "bg-[color:var(--text-secondary)]"}`}></span>
                    {agent.status}
                  </span>
                </div>
                <span className={`text-[10px] ${isSelected ? "text-[color:var(--text-primary)]/80" : "text-[color:var(--text-secondary)]"} leading-normal font-sans`}>{agent.role}</span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Agent Chat Console Card */}
      <div className="lg:col-span-2 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl p-6 shadow-sm flex flex-col justify-between space-y-6 hover-lift">
        <div>
          <div className="border-b border-[color:var(--color-navy-4)] pb-3 mb-4">
            <h3 className="text-sm font-bold text-[color:var(--text-primary)]">Agent Console: {selectedAgent}</h3>
            <p className="text-[11px] text-[color:var(--text-secondary)] font-sans mt-0.5">Consult this co-agent directly regarding scriptural references, methodological design, or structural advice.</p>
          </div>

          {response ? (
            <div className="bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] rounded-xl p-4 text-xs text-[color:var(--text-primary)] leading-relaxed max-h-[300px] overflow-y-auto whitespace-pre-wrap font-sans relative animate-fade-in shadow-inner">
              <div className="flex justify-between items-center mb-2 border-b border-[color:var(--color-navy-4)] pb-1.5">
                <span className="font-bold text-xs text-[color:var(--text-secondary)]">Agent Feedback:</span>
                <button
                  type="button"
                  onClick={handleCopy}
                  className="px-2 py-0.5 border border-[color:var(--color-navy-4)] hover:bg-[color:var(--color-navy-2)] text-[9px] rounded text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] transition-colors cursor-pointer"
                >
                  {copied ? "Copied!" : "Copy Text"}
                </button>
              </div>
              {response}
            </div>
          ) : (
            <div className="h-[200px] border border-dashed border-[color:var(--color-navy-4)] rounded-xl flex flex-col items-center justify-center text-xs text-[color:var(--text-secondary)] font-sans italic p-4 text-center gap-1">
              <span>Send a custom query or select a suggestion below.</span>
              <span className="text-[10px] text-[color:var(--text-secondary)]/70">The agent will return publication-ready academic references and insights.</span>
            </div>
          )}
        </div>

        <form onSubmit={handleConsult} className="space-y-4">
          {/* Suggestions List */}
          <div className="space-y-1.5 pt-1">
            <span className="block text-[9px] text-[color:var(--text-secondary)] font-bold">Suggested Prompts:</span>
            <div className="flex flex-col gap-1.5">
              {(suggestedQueries[selectedAgent] || []).map((suggestion, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => setQuery(suggestion)}
                  className="px-3 py-1.5 bg-[color:var(--color-navy-1)] border border-[color:var(--color-navy-4)] hover:border-[color:var(--color-luminous-blue)]/40 hover:bg-[color:var(--color-navy-2)] text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] text-[10px] rounded-lg transition-all font-sans cursor-pointer text-left block"
                >
                  💡 {suggestion}
                </button>
              ))}
            </div>
          </div>

          {/* index.css's global textarea override forces a white background
              with !important, exempted only by .border-0/.bg-transparent —
              the exact bug found live on the dashboard's inputs. Applying
              both a "border" utility AND "border-0" on the same element
              would conflict (same property, unpredictable which wins), so
              the visual field look moves to this wrapper instead, matching
              the pattern already established and verified on the dashboard. */}
          <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-lg focus-within:border-[color:var(--color-luminous-blue)]">
            <textarea
              required
              rows={3}
              className="border-0 bg-transparent w-full p-3 text-xs text-[color:var(--text-primary)] focus:outline-none"
              placeholder={`Ask the ${selectedAgent} a question about your project...`}
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="px-5 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] disabled:bg-[color:var(--surface-inset)] text-[color:var(--text-primary)] text-xs font-bold rounded-lg cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
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

