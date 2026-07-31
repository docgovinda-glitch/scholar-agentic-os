/**
 * AI mode selector, accordion form.
 *
 * Replaces the grid of five AIModeCards. Each of those cards carried an icon,
 * a badge, a description, three feature bullets, three metadata rows, a
 * button and two collapsible sections — tall even when collapsed. At the `md`
 * breakpoint the grid became a single column, so a phone user scrolled
 * through five full-height cards before reaching anything else on the page.
 *
 * Here only one mode is expanded at a time and everything else is a single
 * compact row, so the whole set fits on one phone screen and the detail for
 * the mode being considered is one tap away.
 *
 * DEVICE RULES
 * ------------
 * Smart Gateway and Local AI both require installing and running a server
 * program on the same machine as the browser, which is not possible on
 * iOS or Android. They are therefore not rendered at all below desktop —
 * not merely hidden with CSS, since a hidden card still mounts, still runs
 * its detection probes, and is still reachable by keyboard. Mobile users get
 * an honest on-device AI entry in their place.
 */

import React, { useState } from "react";
import { ChevronDown, Check, Lock, Smartphone, Monitor, ExternalLink } from "lucide-react";
import { AI_MODES, type AIMode, type AIModeId } from "../../config/aiModes";
import { useDeviceClass } from "../../hooks/useDeviceClass";

/** Modes that depend on a locally running server program. */
const DESKTOP_ONLY_MODES: AIModeId[] = ["omniroute", "local"];

interface AIModeAccordionProps {
  selectedMode?: AIModeId;
  onSelectMode: (mode: AIModeId) => void;
  /** Rendered inside the expanded panel, e.g. the provider picker */
  renderModeDetail?: (mode: AIMode) => React.ReactNode;
}

export default function AIModeAccordion({
  selectedMode,
  onSelectMode,
  renderModeDetail,
}: AIModeAccordionProps) {
  const { isDesktop, isMobile, canRunLocalAI } = useDeviceClass();
  const [expanded, setExpanded] = useState<AIModeId | null>(selectedMode ?? null);

  const visibleModes = AI_MODES.filter(
    (mode) => canRunLocalAI || !DESKTOP_ONLY_MODES.includes(mode.id)
  );

  const toggle = (id: AIModeId) => setExpanded((current) => (current === id ? null : id));

  return (
    <div className="space-y-2">
      {!canRunLocalAI && (
        <div className="flex items-start gap-2.5 bg-[color:var(--color-navy-2)] border border-[color:var(--color-navy-4)] rounded-xl p-3">
          <Smartphone className="w-4 h-4 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Two options that need a program installed on a computer —{" "}
            <strong className="text-[#E2E8F0]">Smart Gateway</strong> and{" "}
            <strong className="text-[#E2E8F0]">Local AI</strong> — are hidden here because they
            cannot run on a phone or tablet. Open this page on a desktop to use them.
          </p>
        </div>
      )}

      {visibleModes.map((mode) => {
        const isOpen = expanded === mode.id;
        const isSelected = selectedMode === mode.id;
        const isComingSoon = mode.availability === "coming-soon";
        const panelId = `ai-mode-panel-${mode.id}`;

        return (
          <div
            key={mode.id}
            className={`border rounded-xl overflow-hidden transition-colors ${
              isSelected
                ? "border-[color:var(--color-luminous-blue)]/50 bg-[color:var(--color-luminous-blue)]/5"
                : "border-[color:var(--color-navy-4)] bg-[color:var(--color-navy-2)]"
            }`}
          >
            <button
              type="button"
              data-testid={`ai-mode-row-${mode.id}`}
              onClick={() => toggle(mode.id)}
              aria-expanded={isOpen}
              aria-controls={panelId}
              className="w-full flex items-center gap-3 p-3.5 text-left cursor-pointer hover:bg-[color:var(--color-navy-3)]/50 transition-colors"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  {/* A span carrying role=heading rather than a real <h3>: the
                      whole row is the toggle control, and <h3> is flow content
                      that may not legally nest inside <button>. This exposes
                      the same heading semantics to assistive technology, with
                      the mode title alone as its accessible name. */}
                  <span role="heading" aria-level={3} className="text-sm font-bold text-[#E2E8F0]">
                    {mode.title}
                  </span>
                  {isSelected && (
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-[color:var(--color-luminous-blue)]/15 text-[color:var(--color-luminous-blue)]">
                      Active
                    </span>
                  )}
                  {isComingSoon && (
                    <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-[color:var(--color-navy-3)] text-[#94A3B8]">
                      Coming soon
                    </span>
                  )}
                  {DESKTOP_ONLY_MODES.includes(mode.id) && (
                    <span className="text-[10px] font-mono uppercase px-1.5 py-0.5 rounded bg-[color:var(--color-navy-3)] text-[#94A3B8] flex items-center gap-1">
                      <Monitor className="w-2.5 h-2.5" />
                      Desktop
                    </span>
                  )}
                </div>
                {/* One line only when collapsed — the full description is in the panel. */}
                <p className="text-xs text-[#94A3B8] mt-0.5 truncate">
                  {mode.difficulty} · {mode.setupTime}
                </p>
              </div>
              <ChevronDown
                className={`w-4 h-4 text-[#94A3B8] shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`}
              />
            </button>

            {isOpen && (
              <div id={panelId} className="px-3.5 pb-3.5 space-y-3 border-t border-[color:var(--color-navy-4)] pt-3">
                <p className="text-xs text-[#94A3B8] leading-relaxed">{mode.description}</p>

                {mode.features.length > 0 && (
                  <ul className="space-y-1">
                    {mode.features.map((feature) => (
                      <li key={feature} className="flex items-start gap-2 text-xs text-[#94A3B8]">
                        <Check className="w-3 h-3 text-[color:var(--color-luminous-blue)] shrink-0 mt-0.5" />
                        <span>{feature}</span>
                      </li>
                    ))}
                  </ul>
                )}

                {/* Limitations are never collapsed away — a mode's real
                    constraints are the thing a user most needs before
                    committing time to setting it up. */}
                {mode.limitations.length > 0 && (
                  <div className="bg-[color:var(--color-navy-3)]/60 rounded-lg p-2.5">
                    <span className="text-[10px] font-mono font-bold text-[#94A3B8] uppercase tracking-wider">
                      Before you choose
                    </span>
                    <ul className="mt-1 space-y-1">
                      {mode.limitations.map((limitation) => (
                        <li key={limitation} className="text-xs text-[#94A3B8] leading-relaxed">
                          · {limitation}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {isComingSoon ? (
                  <p className="text-xs text-[#94A3B8] italic">{mode.comingSoonNote}</p>
                ) : (
                  <>
                    {renderModeDetail?.(mode)}
                    <button
                      type="button"
                      data-testid={`ai-mode-card-${mode.id}`}
                      onClick={() => onSelectMode(mode.id)}
                      className="w-full sm:w-auto px-4 py-2 bg-[color:var(--color-luminous-blue-dim)] hover:bg-[color:var(--color-luminous-blue)] text-white text-xs font-mono font-semibold uppercase tracking-wider rounded-lg transition-all cursor-pointer"
                    >
                      {mode.ctaLabel}
                    </button>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}

      {isMobile && <MobileOnDeviceAINotice />}
    </div>
  );
}

/**
 * Mobile-only on-device AI entry.
 *
 * This states the real situation rather than offering a button that cannot
 * work. As of this writing a web page has no way to drive a phone's on-device
 * model: Google's AI Edge Gallery is a native Android app with no web-exposed
 * API, Apple's Foundation Models are reachable only from native Swift, and
 * running a model inside the browser via WebGPU needs several hundred MB of
 * download and more memory than most handsets will give a tab. Presenting a
 * non-functional toggle here would be the same honesty failure that got the
 * old simulated "Smart AI" mode removed, so the section explains what exists,
 * what does not, and what to do instead.
 */
function MobileOnDeviceAINotice() {
  const [open, setOpen] = useState(false);

  return (
    <div className="border border-[color:var(--color-navy-4)] rounded-xl bg-[color:var(--color-navy-2)] overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 p-3.5 text-left cursor-pointer hover:bg-[color:var(--color-navy-3)]/50 transition-colors"
      >
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="text-sm font-bold text-[#E2E8F0]">On-device AI</span>
            <span className="text-[10px] font-mono font-bold uppercase px-1.5 py-0.5 rounded bg-[color:var(--color-navy-3)] text-[#94A3B8] flex items-center gap-1">
              <Lock className="w-2.5 h-2.5" />
              Not available in a browser
            </span>
          </div>
          <p className="text-xs text-[#94A3B8] mt-0.5">Why your phone's built-in AI can't be used here</p>
        </div>
        <ChevronDown className={`w-4 h-4 text-[#94A3B8] shrink-0 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3.5 pb-3.5 pt-3 border-t border-[color:var(--color-navy-4)] space-y-2.5">
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            Modern phones do run AI models locally, but none of them expose that to a website:
          </p>
          <ul className="space-y-1.5 text-xs text-[#94A3B8]">
            <li className="leading-relaxed">
              · <strong className="text-[#E2E8F0]">Google AI Edge Gallery</strong> is an Android app.
              It runs models on your phone but offers no way for a web page to send it a request.
            </li>
            <li className="leading-relaxed">
              · <strong className="text-[#E2E8F0]">Apple Intelligence</strong> is reachable only from
              native app code, not from Safari.
            </li>
            <li className="leading-relaxed">
              · Running a model <strong className="text-[#E2E8F0]">inside the browser</strong> is
              technically possible with WebGPU, but needs a download of several hundred megabytes and
              more memory than a phone will usually grant a single tab.
            </li>
          </ul>
          <p className="text-xs text-[#94A3B8] leading-relaxed">
            On a phone, a free cloud provider is both faster and higher quality. Pick{" "}
            <strong className="text-[#E2E8F0]">Cloud AI Providers</strong> above — several need no
            payment details at all.
          </p>
          <a
            href="https://ai.google.dev/edge"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-xs font-mono text-[color:var(--color-luminous-blue)] hover:underline"
          >
            Read about on-device AI
            <ExternalLink className="w-3 h-3" />
          </a>
        </div>
      )}
    </div>
  );
}
