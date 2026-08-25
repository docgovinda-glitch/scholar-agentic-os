import React, { useState } from "react";
import type { PresentationStage, PresentationProjectData, PresentationSlide } from "./types";
import ScholarCoreLogo from "../../components/ScholarCoreLogo";

const PRESENTATION_STAGES: Array<{ id: PresentationStage; label: string; icon: string; desc: string }> = [
  { id: "profiler_constraints", label: "1. Timing & Constraints", icon: "⏱️", desc: "Talk duration (10-45m) & audience depth" },
  { id: "narrative_arc", label: "2. Narrative Arc & Hook", icon: "📖", desc: "Problem → Breakthrough → Empirical Proof" },
  { id: "slide_storyboard", label: "3. Slide Architecture", icon: "📑", desc: "Slide-by-slide visual layout & focus" },
  { id: "speaker_script", label: "4. Speaker Script & Notes", icon: "🎙️", desc: "Word-for-word delivery & transition cues" },
  { id: "visual_deck_preview", label: "5. Visual Slide Preview", icon: "🖥️", desc: "Interactive deck & Marp/PPTX export" },
  { id: "defense_qa_sim", label: "6. Q&A & Defense Simulator", icon: "🛡️", desc: "Referee questions & model rebuttal answers" },
];

export default function PresentationWorkspace({
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
  const [currentStage, setCurrentStage] = useState<PresentationStage>("visual_deck_preview");
  const [deckData, setDeckData] = useState<PresentationProjectData>({
    projectId,
    title: "Autonomous Knowledge Grounding in Multi-Agent Scientific Synthesis",
    durationMinutes: 20,
    targetAudience: "International Conference on Scholarly AI (Senior Academics)",
    narrativeHook: "Why 84% of automated synthesis engines fail basic peer-review citation audits.",
    coreInsight: "Grounded Bayesian evidence ledgers provide verifiable mathematical provenance.",
    slides: [
      {
        slideNumber: 1,
        type: "title",
        title: "Autonomous Knowledge Grounding in Multi-Agent Scientific Synthesis",
        subtitle: "A Triangulated Empirical Protocol for Zero-Hallucination Academic Output",
        visualFocus: "Clean high-contrast title typography with conference and affiliation badges.",
        keyPoints: ["Presenter: Scholar Core Research Group", "Affiliation: Institute for Agentic Systems", "20-Minute Conference Keynote"],
        speakerNotes: "Good morning everyone. Today I'll present our work on deterministic knowledge grounding in multi-agent scholarly synthesis...",
        targetDurationSeconds: 60,
      },
      {
        slideNumber: 2,
        type: "problem",
        title: "The Reproducibility Bottleneck in AI Research",
        subtitle: "Why Synthetic Text Fails In-Depth Empirical Scrutiny",
        visualFocus: "Split comparison chart: Uncontrolled Generation vs Grounded Evidence Ledger.",
        keyPoints: [
          "Hallucinated DOI references contaminate academic archives.",
          "Surface-level plausibility hides factual contradictions.",
          "Lack of cryptographic provenance makes audit impossible.",
        ],
        speakerNotes: "Let us examine the core dilemma: standard language models optimize for superficial fluency, leading to fabricated references...",
        targetDurationSeconds: 150,
      },
      {
        slideNumber: 3,
        type: "architecture",
        title: "Triangulated Multi-Agent Editorial Architecture",
        subtitle: "Emulating Peer Review via Adversarial Verification",
        visualFocus: "Full system diagram showing Universal Vault -> Claim Graph -> Gate Conductor.",
        keyPoints: [
          "Universal Knowledge Vault indexes raw PDF sources with exact spans.",
          "Claim-Evidence Graph maps every assertion to verified citations.",
          "5 Editorial Reviewer Lenses execute automated double-blind audits.",
        ],
        speakerNotes: "To solve this, we architected a tripartite system where generation is strictly gated by verified evidence ledgers...",
        targetDurationSeconds: 240,
      },
      {
        slideNumber: 4,
        type: "results",
        title: "Empirical Performance & Zero-Hallucination Benchmarks",
        subtitle: "Evaluating 1,000 Multi-Domain Academic Manuscripts",
        visualFocus: "Horizontal bar charts showing 100% citation precision and 42% faster synthesis.",
        keyPoints: [
          "100% verified citation accuracy across 5,000 tested references.",
          "4.2x faster turnaround than manual literature synthesis.",
          "Statistically significant reduction in supervisory revision rounds (p < 0.001).",
        ],
        speakerNotes: "The empirical benchmarks confirm our hypothesis: across 1,000 generated manuscripts, citation precision was exactly 100%...",
        targetDurationSeconds: 240,
      },
      {
        slideNumber: 5,
        type: "conclusion",
        title: "Conclusions, Open Tools & Scholarly Future",
        subtitle: "Paving the Path for Verifiable Autonomous Research",
        visualFocus: "Key takeaways matrix with open-source QR code and live demo links.",
        keyPoints: [
          "Deterministic provenance is necessary for trustworthy academic AI.",
          "Modular stage conductors adapt to any academic document format.",
          "Scholar Core open-access benchmark suite is live today.",
        ],
        speakerNotes: "In conclusion, deterministic evidence ledgers restore academic trust in AI synthesis. Thank you, and I look forward to your questions.",
        targetDurationSeconds: 120,
      },
    ],
  });

  const [activeSlideIndex, setActiveSlideIndex] = useState(0);
  const activeSlide = deckData.slides[activeSlideIndex] || deckData.slides[0];

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
                {deckData.title}
              </span>
              <span className="text-[10px] px-2 py-0.5 rounded-full bg-[color:var(--accent-subtle)] text-[color:var(--accent)] font-bold shrink-0">
                {deckData.slides.length} Slides ({deckData.durationMinutes} Min Talk)
              </span>
            </div>
            <p className="text-[10px] text-[color:var(--text-muted)]">
              {deckData.targetAudience}
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
            Presentation Studio
          </div>
          {PRESENTATION_STAGES.map((s) => {
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

        {/* Center Presentation Stage Content */}
        <main className="flex-1 p-6 md:p-8 overflow-y-auto max-w-5xl">
          {currentStage === "visual_deck_preview" && (
            <div className="flex flex-col gap-6">
              <div className="flex items-center justify-between">
                <div>
                  <h2 className="text-xl font-bold text-[color:var(--text-primary)]">
                    Interactive Slide Deck Studio
                  </h2>
                  <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                    Slide {activeSlideIndex + 1} of {deckData.slides.length} · Target Delivery: {activeSlide.targetDurationSeconds}s
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setActiveSlideIndex((prev) => Math.max(0, prev - 1))}
                    disabled={activeSlideIndex === 0}
                    className="px-3 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    ← Prev
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveSlideIndex((prev) => Math.min(deckData.slides.length - 1, prev + 1))}
                    disabled={activeSlideIndex === deckData.slides.length - 1}
                    className="px-3 py-1.5 rounded-lg border border-[color:var(--border-default)] bg-[color:var(--surface-raised)] text-xs font-bold disabled:opacity-40 cursor-pointer"
                  >
                    Next →
                  </button>
                </div>
              </div>

              {/* 16:9 Interactive Slide Canvas */}
              <div className="aspect-video w-full rounded-2xl bg-gradient-to-br from-slate-900 via-slate-800 to-slate-950 text-white p-8 md:p-12 shadow-2xl flex flex-col justify-between border border-slate-700 relative overflow-hidden">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span className="font-bold tracking-wider uppercase text-cyan-400">
                    Scholar Core Conference Deck
                  </span>
                  <span>Slide {activeSlide.slideNumber} / {deckData.slides.length}</span>
                </div>

                <div className="my-auto space-y-4">
                  <h3 className="text-2xl md:text-3xl font-black text-white tracking-tight leading-snug">
                    {activeSlide.title}
                  </h3>
                  {activeSlide.subtitle && (
                    <p className="text-sm md:text-base text-slate-300 font-medium">
                      {activeSlide.subtitle}
                    </p>
                  )}

                  <div className="pt-4 space-y-2">
                    {activeSlide.keyPoints.map((pt, idx) => (
                      <div key={idx} className="flex items-center gap-3 text-xs md:text-sm text-slate-200">
                        <span className="w-2 h-2 rounded-full bg-cyan-400 shrink-0" />
                        <span>{pt}</span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] text-slate-400 pt-4 border-t border-slate-700/60">
                  <span className="truncate max-w-xs">{deckData.title}</span>
                  <span className="text-cyan-400 font-medium">{activeSlide.visualFocus}</span>
                </div>
              </div>

              {/* Speaker Notes Script Box */}
              <div className="p-5 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-[color:var(--accent)]">
                    🎙️ Speaker Notes & Delivery Script
                  </span>
                  <span className="text-[11px] text-[color:var(--text-muted)] font-medium">
                    Timing: ~{activeSlide.targetDurationSeconds} seconds
                  </span>
                </div>
                <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed italic bg-[color:var(--surface-sunken)] p-3.5 rounded-xl border border-[color:var(--border-subtle)]">
                  "{activeSlide.speakerNotes}"
                </p>
              </div>
            </div>
          )}

          {currentStage !== "visual_deck_preview" && (
            <div className="flex flex-col gap-6">
              <div>
                <h2 className="text-xl font-bold text-[color:var(--text-primary)] capitalize">
                  {PRESENTATION_STAGES.find((s) => s.id === currentStage)?.label}
                </h2>
                <p className="text-xs text-[color:var(--text-secondary)] mt-1">
                  {PRESENTATION_STAGES.find((s) => s.id === currentStage)?.desc}
                </p>
              </div>

              <div className="p-6 rounded-2xl border border-[color:var(--border-default)] bg-[color:var(--surface-raised)]">
                <p className="text-xs text-[color:var(--text-secondary)] leading-relaxed mb-4">
                  Visual storyboard is automatically linked to your Knowledge Vault evidence points.
                </p>
                <button
                  type="button"
                  onClick={() => setCurrentStage("visual_deck_preview")}
                  className="px-4 py-2 bg-[color:var(--accent-solid)] text-white text-xs font-bold rounded-xl hover:bg-[color:var(--accent-hover)] transition-all cursor-pointer shadow-xs"
                >
                  View Visual Slide Deck →
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}
