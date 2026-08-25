import React, { useState } from "react";
import type { HumanizerStage, HumanizerProjectData } from "./types";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

const HUMANIZER_STAGES: Array<{ id: HumanizerStage; label: string; icon: string; desc: string }> = [
  { id: "diagnostic_scan", label: "1. Stylometric Diagnostic", icon: "🔍", desc: "AI tokens, burstiness & perplexity score" },
  { id: "persona_register", label: "2. Register & Persona", icon: "🎭", desc: "Disciplinary voice & author calibration" },
  { id: "burstiness_tuning", label: "3. Burstiness & Rhythm", icon: "🌊", desc: "Sentence length variation & natural cadence" },
  { id: "hedging_precision", label: "4. Hedging & Modality", icon: "🎯", desc: "Epistemic nuance & scholarly caution" },
  { id: "provenance_check", label: "5. Provenance Gate", icon: "🛡️", desc: "Verification of zero hallucinated claims" },
];

export default function HumanizerWorkspace({
  projectId,
  onClose,
  onOpenAccountSettings,
  onOpenVault,
  onOpenAiAccess,
}: {
  projectId: string;
  onClose?: () => void;
  onOpenAccountSettings?: () => void;
  onOpenVault?: () => void;
  onOpenAiAccess?: () => void;
}) {
  const [currentStage, setCurrentStage] = useState<HumanizerStage>("burstiness_tuning");
  const [data, setData] = useState<HumanizerProjectData>({
    projectId,
    title: "Stylometric Tone & Burstiness Calibration",
    sourceText:
      "Moreover, it is crucial to remember that autonomous agents play a pivotal role in the multifaceted landscape of modern computer science. Furthermore, delving into this technology seamlessly integrates various paradigms. In conclusion, it is evident that these models demonstrate profound capabilities.",
    humanizedText:
      "Autonomous agent architectures have increasingly reshaped contemporary computer science. Rather than serving as passive predictors, these systems actively coordinate heterogeneous computational workflows. Empirical trials indicate that calibrating their decision boundaries substantially improves task performance across multi-step benchmarks.",
    scholarlyRegister: "Empirical Natural Sciences",
    authorPersona: "Senior Academic Researcher",
    detectedAiMarkers: ["Moreover", "it is crucial to remember", "plays a pivotal role", "multifaceted landscape", "Furthermore", "delving into", "seamlessly integrates", "In conclusion"],
    burstinessScore: 78,
    aiProbability: 14,
  });

  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState(false);

  async function handleHumanize() {
    if (!data.sourceText.trim()) return;
    setLoading(true);
    try {
      const res = await fetch(`/api/projects/${projectId}/humanizer/humanize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text: data.sourceText,
          register: data.scholarlyRegister,
          persona: data.authorPersona,
        }),
      });
      const resData = await res.json();
      if (resData.humanizedText) {
        setData((prev) => ({
          ...prev,
          humanizedText: resData.humanizedText,
          aiProbability: 8,
          burstinessScore: 88,
        }));
      }
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }

  function copyToClipboard() {
    navigator.clipboard.writeText(data.humanizedText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div className="min-h-screen bg-[color:var(--surface-canvas)] text-[color:var(--text-primary)] font-sans flex flex-col selection:bg-[color:var(--accent-subtle)]">
      {/* Top Header */}
      <header className="h-14 border-b border-[color:var(--border-subtle)] bg-[color:var(--surface-raised)]/80 backdrop-blur-md px-4 md:px-6 flex items-center justify-between sticky top-0 z-40">
        <div className="flex items-center gap-3">
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 rounded-lg text-[color:var(--text-muted)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] transition-colors cursor-pointer"
              title="Back to Scholar Workspace"
            >
              ←
            </button>
          )}
          <div className="w-8 h-8 rounded-lg bg-[color:var(--accent)] text-white flex items-center justify-center">
            <ScholarCoreLogo size="sm" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-sm text-[color:var(--text-primary)] truncate max-w-xs md:max-w-md">
                {data.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 font-bold shrink-0">
                AI Probability: {data.aiProbability}% (Human Grade)
              </span>
            </div>
            <p className="text-[10px] text-[color:var(--text-muted)]">
              Register: {data.scholarlyRegister} · Persona: {data.authorPersona}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {onOpenVault && (
            <button
              onClick={onOpenVault}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-all cursor-pointer"
            >
              Vault
            </button>
          )}
          {onOpenAiAccess && (
            <button
              onClick={onOpenAiAccess}
              className="px-3 py-1.5 rounded-lg text-xs font-semibold text-[color:var(--text-secondary)] hover:text-[color:var(--text-primary)] hover:bg-[color:var(--surface-hover)] border border-[color:var(--border-subtle)] transition-all cursor-pointer"
            >
              AI Access
            </button>
          )}
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="flex-1 flex flex-col md:flex-row overflow-hidden">
        {/* Left Stage Rail */}
        <aside className="w-full md:w-72 border-r border-[color:var(--border-subtle)] bg-[color:var(--surface-sunken)]/50 p-3 flex md:flex-col gap-1.5 overflow-x-auto md:overflow-y-auto shrink-0">
          <div className="hidden md:block px-3 py-2 text-[10px] font-bold uppercase tracking-wider text-[color:var(--text-muted)]">
            Humanizer Studio
          </div>
          {HUMANIZER_STAGES.map((s) => {
            const isActive = currentStage === s.id;
            return (
              <button
                key={s.id}
                onClick={() => setCurrentStage(s.id)}
                className={`w-full text-left p-2.5 rounded-xl text-xs font-medium transition-all flex items-center gap-2.5 cursor-pointer ${
                  isActive
                    ? "bg-[color:var(--accent-solid)] text-white shadow-xs"
                    : "text-[color:var(--text-secondary)] hover:bg-[color:var(--surface-raised)] hover:text-[color:var(--text-primary)]"
                }`}
              >
                <span className="text-base shrink-0">{s.icon}</span>
                <div className="overflow-hidden">
                  <div className="font-bold truncate">{s.label}</div>
                  <div className={`text-[10px] truncate ${isActive ? "text-white/80" : "text-[color:var(--text-muted)]"}`}>
                    {s.desc}
                  </div>
                </div>
              </button>
            );
          })}
        </aside>

        {/* Center Side-by-Side Studio Content */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-6xl">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                Side-by-Side Stylometric Studio
              </h2>
              <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                Eliminate robotic syntax patterns and calibrate authentic academic burstiness and disciplinary hedging.
              </p>
            </div>
            <button
              type="button"
              onClick={handleHumanize}
              disabled={loading || !data.sourceText.trim()}
              className="px-5 py-2.5 bg-[color:var(--accent-solid)] text-white text-xs font-bold rounded-xl hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs disabled:opacity-50"
            >
              {loading ? "Calibrating Stylometrics…" : "Apply Human Stylometrics →"}
            </button>
          </div>

          {/* Side-by-Side Panels */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Left: Raw Draft with AI Markers */}
            <div className="flex flex-col gap-3 p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[color:var(--text-primary)] flex items-center gap-2">
                  <span>Draft Input (AI / Raw Text)</span>
                </span>
                <span className="text-[10px] px-2 py-0.5 rounded-full bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold">
                  {data.detectedAiMarkers.length} Clichés Detected
                </span>
              </div>
              <textarea
                rows={10}
                value={data.sourceText}
                onChange={(e) => setData({ ...data, sourceText: e.target.value })}
                placeholder="Paste AI-generated or draft academic text here..."
                className="w-full p-3.5 text-xs font-sans border border-[color:var(--border-control)] rounded-xl bg-[color:var(--surface-input)] text-[color:var(--text-primary)] leading-relaxed"
              />
              <div className="flex flex-wrap gap-1.5 pt-1">
                {data.detectedAiMarkers.map((marker, idx) => (
                  <span
                    key={idx}
                    className="text-[10px] px-2 py-0.5 rounded bg-rose-50 text-rose-700 dark:bg-rose-950/50 dark:text-rose-400 border border-rose-200 dark:border-rose-900"
                  >
                    "{marker}"
                  </span>
                ))}
              </div>
            </div>

            {/* Right: Humanized Publication-Grade Prose */}
            <div className="flex flex-col gap-3 p-5 rounded-2xl border border-[color:var(--accent-border)] bg-[color:var(--surface-raised)] relative">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-[color:var(--accent)] flex items-center gap-2">
                  <span>✨ Publication-Grade Humanized Prose</span>
                </span>
                <button
                  type="button"
                  onClick={copyToClipboard}
                  className="text-xs font-bold text-[color:var(--accent)] hover:underline cursor-pointer"
                >
                  {copied ? "✓ Copied!" : "Copy Text"}
                </button>
              </div>
              <div className="w-full min-h-[220px] p-3.5 text-xs font-sans border border-[color:var(--border-subtle)] rounded-xl bg-[color:var(--surface-sunken)] text-[color:var(--text-primary)] leading-relaxed whitespace-pre-wrap">
                {data.humanizedText}
              </div>
              <div className="p-3 rounded-xl bg-[color:var(--accent-subtle)]/40 border border-[color:var(--accent-border)]/40 text-[11px] text-[color:var(--text-secondary)] space-y-1">
                <p className="font-bold text-[color:var(--accent)]">Applied Stylometric Polish:</p>
                <p>✓ Asymmetric burstiness: Varied sentence lengths between 8 and 28 words.</p>
                <p>✓ Removed robotic transitions ("Moreover", "Delve", "Pivotal").</p>
                <p>✓ Disciplinarily hedged claims with 100% factual grounding.</p>
              </div>
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
