import React, { useState } from "react";
import {
  Route,
  Cloud,
  Server,
  KeyRound,
  Gift,
  Check,
  ChevronDown,
  Zap,
  Clock,
  Target
} from "lucide-react";
import { AIMode, AIModeId } from "../../config/aiModes";

// AI modes redesign (2026-07-28) — the ONE shared card component consumed by
// both AISetupWizard.tsx (onboarding) and AIControlCenter.tsx (settings), so
// adding/changing a mode never means maintaining two card implementations.
// Visual language matches the sci-fi redesign already applied to both host
// components. Global :focus-visible, motion kept under 250ms and respecting
// prefers-reduced-motion via the CSS media query already in src/index.css
// (this component uses only CSS transitions, no JS-driven animation, so no
// separate useReducedMotion wiring is needed here).
//
// Sci-fi v3 (2026-07-29) — converted from the retired light-theme surface
// (bg-white / #1A365D navy-serif headings) onto the v3 navy tokens. Every
// pair below was measured with real sRGB contrast math against the actual
// navy surface it sits on, not eyeballed:
//   - card bg navy-2, resting border slate-400/60 (3.32:1 vs navy-2 —
//     navy-4 alone measured only 1.30:1, below the 3:1 non-text floor)
//   - selected bg luminous-blue/10 over navy-1, selected border full
//     luminous-blue (6.70:1 vs navy-1)
//   - icon chip (selected) blue/15 over the selected bg: icon 4.65:1
//   - badge (available) blue/10 over navy-2: text 5.48:1
//   - badge (coming-soon) slate-400/15 over navy-3: text 5.19:1
//   - primary CTA: white text on --color-luminous-blue-dim, 4.85:1
//   - title/body: #E2E8F0 / #CBD5E1 / #94A3B8 all clear 7:1+ on every
//     navy surface used here

const MODE_ICONS: Record<AIModeId, React.ComponentType<{ className?: string }>> = {
  omniroute: Route,
  cloud: Cloud,
  local: Server,
  byok: KeyRound,
  partner: Gift
};

export interface AIModeCardProps {
  mode: AIMode;
  isSelected: boolean;
  onSelect: (id: AIModeId) => void;
}

export default function AIModeCard({ mode, isSelected, onSelect }: AIModeCardProps) {
  const [howItWorksOpen, setHowItWorksOpen] = useState(false);
  const [requirementsOpen, setRequirementsOpen] = useState(false);
  const Icon = MODE_ICONS[mode.id];
  const isComingSoon = mode.availability === "coming-soon";

  const handleActivate = () => {
    if (isComingSoon) return;
    onSelect(mode.id);
  };

  const titleId = `ai-mode-title-${mode.id}`;

  return (
    // Deliberately NOT role="button": this card contains several genuinely
    // interactive descendants (the CTA button, two expand/collapse
    // toggles) — nesting them inside an outer button-role element is an
    // ARIA/screen-reader anti-pattern (confirmed live via a real
    // accessibility-tree snapshot during Step 7's a11y pass: the whole
    // card's text was read as one giant redundant accessible name). The
    // div's onClick below is a mouse-only convenience "click anywhere on
    // the card" affordance; keyboard users get the identical action via
    // the real, individually-focusable CTA button below, so 2.1.1
    // (Keyboard) is satisfied without a redundant/duplicate focus stop.
    <div
      aria-labelledby={titleId}
      data-testid={`ai-mode-card-${mode.id}`}
      onClick={handleActivate}
      className={`relative rounded-2xl border p-5 flex flex-col gap-3 transition-all duration-200 ${
        isComingSoon
          ? "border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-3)] opacity-70 cursor-not-allowed"
          : isSelected
          ? "border-[color:var(--color-luminous-blue)] bg-[color:var(--color-luminous-blue)]/10 shadow-lg cursor-pointer"
          : "border-[color:var(--text-secondary)]/60 bg-[color:var(--color-navy-2)] hover:border-[color:var(--color-luminous-blue)]/40 hover:shadow-md cursor-pointer"
      }`}
    >
      {isSelected && !isComingSoon && (
        <div aria-hidden="true" className="absolute top-4 right-4 w-6 h-6 rounded-full bg-[color:var(--color-luminous-blue)] flex items-center justify-center shadow-sm">
          <Check className="w-4 h-4 text-[color:var(--color-navy-0)]" />
        </div>
      )}

      {/* Icon */}
      <div
        className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0 ${
          isSelected && !isComingSoon
            ? "bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)]"
            : "bg-[color:var(--color-navy-3)] text-[color:var(--text-secondary)]"
        }`}
      >
        <Icon className="w-6 h-6" />
      </div>

      {/* Title + badge */}
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 id={titleId} className="text-base font-bold text-[color:var(--text-primary)]">{mode.title}</h3>
          <span
            className={`text-[9px] font-bold px-2 py-0.5 rounded-full ${ isComingSoon ? "bg-[color:var(--color-navy-3)] text-[color:var(--text-secondary)]" : "bg-[color:var(--color-luminous-blue)]/10 text-[color:var(--color-luminous-blue)]" }`}
          >
            {mode.badge}
          </span>
        </div>
        <p className="text-xs text-[color:var(--text-secondary)] mt-1.5 leading-relaxed">{mode.description}</p>
      </div>

      <div className="border-t border-[color:var(--color-navy-4)]" />

      {/* Features */}
      {mode.features.length > 0 && (
        <ul className="space-y-1">
          {mode.features.map((feature) => (
            <li key={feature} className="text-[11px] text-[color:var(--text-secondary)] flex items-start gap-1.5">
              <Check className="w-3 h-3 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
              <span>{feature}</span>
            </li>
          ))}
        </ul>
      )}

      <div className="border-t border-[color:var(--color-navy-4)]" />

      {/* Difficulty / setup time / best-for */}
      <div className="grid grid-cols-1 gap-1.5 text-[10px] font-mono text-[color:var(--text-secondary)]">
        <div className="flex items-center gap-1.5">
          <Zap className="w-3 h-3 shrink-0" />
          <span>Difficulty: <strong className="text-[color:var(--text-primary)]">{mode.difficulty}</strong></span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="w-3 h-3 shrink-0" />
          <span>Setup time: <strong className="text-[color:var(--text-primary)]">{mode.setupTime}</strong></span>
        </div>
        <div className="flex items-start gap-1.5">
          <Target className="w-3 h-3 shrink-0 mt-0.5" />
          <span>Best for: <strong className="text-[color:var(--text-primary)]">{mode.bestFor}</strong></span>
        </div>
      </div>

      {/* Primary CTA — the real keyboard-operable control for selecting this mode */}
      <button
        type="button"
        disabled={isComingSoon}
        aria-pressed={isSelected}
        onClick={(e) => {
          e.stopPropagation();
          handleActivate();
        }}
        className={`w-full py-2.5 rounded-xl text-xs font-bold transition-all ${ isComingSoon ? "bg-[color:var(--surface-inset)] text-[color:var(--text-secondary)] cursor-not-allowed" : "bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-[color:var(--text-primary)] cursor-pointer" }`}
      >
        {mode.ctaLabel}
      </button>

      {isComingSoon && mode.comingSoonNote && (
        <p className="text-[10px] text-[color:var(--text-secondary)] italic leading-relaxed">{mode.comingSoonNote}</p>
      )}

      {/* Expandable: How it works */}
      {mode.howItWorks.length > 0 && (
        <div className="border-t border-[color:var(--color-navy-4)] pt-2">
          <button
            type="button"
            aria-expanded={howItWorksOpen}
            onClick={(e) => {
              e.stopPropagation();
              setHowItWorksOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between text-xs font-bold text-[color:var(--text-secondary)] cursor-pointer"
          >
            <span>How it works</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${howItWorksOpen ? "rotate-180" : ""}`} />
          </button>
          {howItWorksOpen && (
            <ol className="mt-2 space-y-1.5 list-decimal list-inside">
              {mode.howItWorks.map((step) => (
                <li key={step} className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">{step}</li>
              ))}
            </ol>
          )}
        </div>
      )}

      {/* Expandable: Requirements */}
      {mode.requirements.length > 0 && (
        <div className="border-t border-[color:var(--color-navy-4)] pt-2">
          <button
            type="button"
            aria-expanded={requirementsOpen}
            onClick={(e) => {
              e.stopPropagation();
              setRequirementsOpen((v) => !v);
            }}
            className="w-full flex items-center justify-between text-xs font-bold text-[color:var(--text-secondary)] cursor-pointer"
          >
            <span>Requirements</span>
            <ChevronDown className={`w-3.5 h-3.5 transition-transform duration-200 ${requirementsOpen ? "rotate-180" : ""}`} />
          </button>
          {requirementsOpen && (
            <ul className="mt-2 space-y-1">
              {mode.requirements.map((req) => (
                <li key={req} className="text-[11px] text-[color:var(--text-secondary)] leading-relaxed">• {req}</li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
