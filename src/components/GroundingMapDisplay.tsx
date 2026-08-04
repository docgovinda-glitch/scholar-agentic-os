import React, { useState } from "react";
import { PaperProject } from "../types";
import { Sparkles, BrainCircuit, Anchor, CheckCircle, RefreshCcw } from "lucide-react";
import { generateDissertationGrounding } from "../services/aiService";

interface GroundingMapDisplayProps {
  project: PaperProject;
  updateProject: (fields: Partial<PaperProject>) => void;
  onNext: () => void;
  onBack: () => void;
}

export default function GroundingMapDisplay({
  project,
  updateProject,
  onNext,
  onBack,
}: GroundingMapDisplayProps) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadStandardGroundingMap = () => {
    const hasVaultFiles = project.knowledgeVault?.files.some((f: any) => f.isActive && f.status === "ready");
    const vaultReference = hasVaultFiles 
      ? "Substantially grounding all concepts in the primary documents uploaded to the Knowledge Vault."
      : "Grounding conceptual arguments in relevant academic literature and primary domain references.";

    const standardMap = {
      conceptualFramework: `Theoretical framework grounded in ${project.title || "the core study topic"}. ${vaultReference}`,
      keyConstructs: [
        "Core Construct 1: Foundational theoretical concept defining the primary unit of analysis.",
        "Core Construct 2: Secondary mechanism explaining relational or causal interactions.",
        "Domain Anchor: Operational concept linking theory to empirical or conceptual application."
      ],
      theoreticalAssumptions: [
        "Primary variables or constructs operate within a structured, identifiable academic paradigm.",
        "Analytical frameworks must maintain logical coherence across theoretical and operational levels."
      ],
      reusableArguments: [
        "Existing standard models exhibit critical conceptual gaps when addressing complex systemic dynamics.",
        "Integrating domain-specific grounding provides a more robust, publishable explanatory framework."
      ],
      relevantCitations: [
        "Primary Uploaded Manuscript / Thesis (Knowledge Vault Reference)",
        "Key Domain Reference A (To be verified in Citation Center)",
        "Key Domain Reference B (To be verified in Citation Center)"
      ],
      consistentTerminology: [
        "Core Theoretical Term",
        "Primary Analytical Construct",
        "Methodological Framework",
        "Domain-Specific Indicator"
      ],
      philosophicalAnchors: `Rigorous academic framework aligned with target publication standards. ${vaultReference}`,
      academicVoiceAdjustment: "Adopts precise, publication-ready academic terminology tailored to the specific discipline and target journal."
    };

    updateProject({ groundingMap: standardMap });
  };

  const generateGroundingMap = async () => {
    setLoading(true);
    setError(null);
    try {
      const mapData = await generateDissertationGrounding(project);
      updateProject({ groundingMap: mapData });
    } catch (err: any) {
      console.error(err);
      setError(err.message || "An error occurred while running the Grounding expert agent. Check your API settings.");
    } finally {
      setLoading(false);
    }
  };

  const map = project.groundingMap;

  return (
    <div id="grounding-map" className="space-y-6">
      <div className="flex items-center justify-between border-b border-[color:var(--border-default)] pb-4">
        <div>
          <h2 className="text-xl font-semibold text-white font-display flex items-center gap-2">
            <BrainCircuit className="w-5 h-5 text-brand-400" />
            Phase B: Dissertation Grounding & Construct Alignment
          </h2>
          <p className="text-sm text-gray-400">
            Ensure complete intellectual alignment between the target journal article and your dissertation's empirical & theoretical foundations.
          </p>
        </div>
      </div>

      {error && (
        <div className="p-4 bg-red-950/40 border border-red-500/30 rounded-lg text-red-300 text-sm space-y-3">
          <p className="font-semibold">⚠️ Compilation Issue: {error}</p>
          <div className="flex gap-3">
            <button
              onClick={generateGroundingMap}
              className="px-3 py-1.5 bg-red-900/60 hover:bg-red-800 border border-red-500/40 rounded text-xs text-white font-mono transition-colors cursor-pointer"
            >
              🔄 Retry Extraction
            </button>
            <button
              onClick={loadStandardGroundingMap}
              className="px-3 py-1.5 bg-brand-500/30 hover:bg-brand-500/40 border border-brand-400/40 rounded text-xs text-brand-200 font-mono transition-colors cursor-pointer"
            >
              📄 Load Standard Grounding Map
            </button>
          </div>
        </div>
      )}

      {!map && !loading ? (
        <div className="p-8 text-center bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl shadow-sm space-y-4">
          <div className="w-12 h-12 bg-brand-900/40 border border-brand-500/30 rounded-full flex items-center justify-center mx-auto">
            <Anchor className="w-6 h-6 text-brand-400" />
          </div>
          <div className="max-w-md mx-auto space-y-2">
            <h3 className="text-lg font-medium text-white font-display">Analyze Dissertation Backbone</h3>
            <p className="text-sm text-gray-400">
              The AI Co-Grounding Agent will parse your Phase A inputs and dissertation excerpts to map precise constructs, arguments, and terminologies to maintain scholarly consistency.
            </p>
          </div>
          <div className="flex flex-wrap justify-center gap-3">
            <button
              onClick={generateGroundingMap}
              className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 font-medium text-white text-sm rounded-lg transition-all duration-200 shadow-lg shadow-brand-500/20 inline-flex items-center gap-2 cursor-pointer font-semibold"
            >
              <Sparkles className="w-4 h-4" />
              Establish Dissertation Grounding Map
            </button>
            <button
              onClick={loadStandardGroundingMap}
              className="px-5 py-2.5 bg-[color:var(--surface-inset)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-default)] font-medium text-gray-200 text-sm rounded-lg transition-all duration-200 inline-flex items-center gap-2 cursor-pointer text-xs"
            >
              <Sparkles className="w-4 h-4 text-brand-400" />
              Skip & Load Standard Grounding
            </button>
          </div>
        </div>
      ) : loading ? (
        <div className="p-12 text-center bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-2xl shadow-sm space-y-4">
          <div className="inline-block relative">
            <div className="w-12 h-12 border-4 border-brand-500/20 border-t-brand-400 rounded-full animate-spin"></div>
            <Sparkles className="w-4 h-4 text-yellow-400 absolute top-1 right-1 animate-pulse" />
          </div>
          <p className="text-sm text-gray-300 font-mono animate-pulse">
            Analyzing dissertation chapters & theoretical frames...
          </p>
          <p className="text-xs text-gray-500 max-w-sm mx-auto">
            Extracting core constructs and aligning academic tone registers for publication-standard rigor.
          </p>
        </div>
      ) : (
        map && (
          <div className="space-y-6">
            <div className="flex justify-between items-center bg-brand-950/40 border border-brand-500/20 rounded-xl p-4">
              <div className="flex items-start gap-3">
                <CheckCircle className="w-5 h-5 text-green-400 shrink-0 mt-0.5" />
                <div>
                  <h4 className="text-sm font-medium text-white">Dissertation Grounding Map Successfully Established</h4>
                  <p className="text-xs text-gray-400">
                    The co-drafting wizard is now locked onto your theoretical paradigms and structural voice.
                  </p>
                </div>
              </div>
              <button
                onClick={generateGroundingMap}
                className="p-2 bg-brand-900/30 hover:bg-brand-900/60 border border-[color:var(--border-default)] rounded-lg text-gray-400 hover:text-[color:var(--text-primary)] transition-all duration-150 cursor-pointer"
                title="Recalibrate anchors"
              >
                <RefreshCcw className="w-3.5 h-3.5" />
              </button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {/* Left Column */}
              <div className="space-y-6">
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-medium text-brand-300 flex items-center gap-2 border-b border-[color:var(--border-subtle)] pb-2">
                    Conceptual Framework Alignment
                  </h3>
                  <p className="text-sm text-gray-300 leading-relaxed italic">
                    "{map.conceptualFramework}"
                  </p>
                </div>

                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-medium text-brand-300 flex items-center gap-2 border-b border-[color:var(--border-subtle)] pb-2">
                    Key Thesis Constructs
                  </h3>
                  <div className="flex flex-col gap-2">
                    {map.keyConstructs.map((construct, i) => (
                      <div key={i} className="flex gap-2.5 items-start">
                        <span className="text-xs font-bold font-mono text-brand-500 bg-brand-900/20 px-2 py-0.5 rounded shrink-0">
                          {i + 1}
                        </span>
                        <p className="text-sm text-gray-300">{construct}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-medium text-brand-300 flex items-center gap-2 border-b border-[color:var(--border-subtle)] pb-2">
                    Consistent Terminology Standard
                  </h3>
                  <div className="flex flex-wrap gap-2">
                    {map.consistentTerminology.map((term, i) => (
                      <span key={i} className="text-xs font-mono bg-brand-900/30 text-brand-200 border border-brand-500/10 px-2.5 py-1 rounded-md">
                        {term}
                      </span>
                    ))}
                  </div>
                </div>
              </div>

              {/* Right Column */}
              <div className="space-y-6">
                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-medium text-brand-300 flex items-center gap-2 border-b border-[color:var(--border-subtle)] pb-2">
                    Philosophical Anchors
                  </h3>
                  <p className="text-sm text-gray-300 leading-relaxed">
                    {map.philosophicalAnchors}
                  </p>
                </div>

                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-medium text-brand-300 flex items-center gap-2 border-b border-[color:var(--border-subtle)] pb-2">
                    Reusable Arguments
                  </h3>
                  <ul className="space-y-2 text-sm text-gray-300 list-disc list-inside">
                    {map.reusableArguments.map((arg, i) => (
                      <li key={i}>{arg}</li>
                    ))}
                  </ul>
                </div>

                <div className="bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-5 shadow-sm space-y-3">
                  <h3 className="text-sm font-medium text-brand-300 flex items-center gap-2 border-b border-[color:var(--border-subtle)] pb-2">
                    Voice & Academic Register
                  </h3>
                  <p className="text-sm text-gray-300 whitespace-pre-line leading-relaxed">
                    {map.academicVoiceAdjustment}
                  </p>
                </div>
              </div>
            </div>

            <div className="flex justify-between items-center pt-4 border-t border-[color:var(--border-default)]">
              <button
                onClick={onBack}
                className="px-4 py-2 border border-[color:var(--border-default)] hover:bg-[color:var(--surface-hover)] text-gray-300 text-sm rounded-lg transition-all duration-150 cursor-pointer"
              >
                Back to Intake
              </button>
              <button
                onClick={onNext}
                className="px-6 py-2 bg-brand-500 hover:bg-brand-600 font-medium text-white text-sm rounded-lg transition-all duration-200 shadow-lg shadow-brand-500/20 cursor-pointer"
              >
                Proceed to Data Discovery
              </button>
            </div>
          </div>
        )
      )}
    </div>
  );
}
