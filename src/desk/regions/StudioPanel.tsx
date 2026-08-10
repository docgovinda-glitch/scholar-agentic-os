import { useState, useEffect } from "react";
import { grantStudioConsent, refinePassage, StudioConsentRequiredError, StudioDeniedError, StudioNoAiSourceError } from "../api";
import { loadUserAiSettings, readProviderKey } from "../../services/userAiSettings";
import { routeDecision, type RoutingChoice, type RoutingDecision } from "../aiAccess/aiAccessApi";
import { getWritingHistory, enableWritingHistory, disableWritingHistory, clearWritingHistory, summarizeWritingHistory, recordRefinement } from "../../app/studio/writingHistory";
import type { InterventionLevel, StudioRefineResult, VoiceProfile } from "../types";

const LEVELS: { id: InterventionLevel; label: string; needsProvider: boolean; description: string }[] = [
  { id: "proofread", label: "Level 1 · Proofread", needsProvider: false, description: "Mechanics: spelling, punctuation, agreement" },
  { id: "clarity", label: "Level 2 · Clarity", needsProvider: true, description: "Clarity: resolve ambiguity, untangle clauses" },
  { id: "flow", label: "Level 3 · Flow", needsProvider: true, description: "Flow: transitions, paragraph cohesion, rhythm" },
  { id: "register", label: "Level 4 · Register", needsProvider: true, description: "Register: academic conventions for discipline" },
  { id: "rewrite", label: "Level 5 · Rewrite", needsProvider: true, description: "Rewrite: restructure weak passages" },
];

const L1_PROFILES = [
  "Mandarin",
  "Japanese",
  "Korean",
  "Turkish",
  "Finnish",
  "Hungarian",
  "Arabic",
  "Hebrew",
  "Spanish",
  "Portuguese",
  "Italian",
  "French",
  "German",
  "Dutch",
  "Russian",
  "Polish",
  "Czech",
  "Hindi",
  "Bengali",
  "Urdu",
] as const;

// Only the providers platform/gateway can actually serve today (adapters.ts) —
// the same catalog the Studio's complete() call resolves against. Advanced
// mode only — Auto mode routes through the Scholar AI Engine instead and is
// not limited to this list.
const PROVIDERS = ["gemini", "openai", "claude", "cohere"];

// Every model-backed Studio level is language refinement — none are
// multimodal/long-context/code-generation — so a single Omni Router task
// type applies uniformly, matching runPremiumRefine's server-side choice
// (server/routes/studio.ts) so the client's preview and the server's actual
// execution can never disagree about which tier ranks first.
const STUDIO_TASK_TYPE = "reasoning" as const;

/**
 * The first candidate Studio can actually execute. Local is filtered out
 * here, not upstream in the router: Local is a real, valid AI source in
 * general (Omni Router ranks it normally), but Studio's refine() pipeline
 * only ever calls a cloud adapter (src/app/studio/studio.ts requires
 * provider+apiKey) — there is no local-runtime execution path wired into
 * Studio yet, the same honest gap server/routes/studio.ts documents for the
 * Premium path. Skipping it here means a user with only a local runner
 * connected gets a clear "connect a cloud/Premium source" message instead of
 * a request that silently fails against a provider id the server can't
 * resolve.
 */
function executableCandidates(decision: RoutingDecision): RoutingChoice[] {
  if (!decision.ok) return [];
  return [decision.choice, ...decision.fallbacks].filter((c) => c.tier !== "local");
}

const CATEGORY_LABEL = { mechanics: "Mechanics", language: "Language", content: "Content" } as const;
const CATEGORY_COLOR = {
  mechanics: "text-[color:var(--text-secondary)] border-[color:var(--color-border-subtle)]",
  language: "text-[color:var(--color-luminous-blue)] border-[color:var(--color-luminous-blue-dim)]",
  content: "text-amber-400 border-amber-500/30",
} as const;

/**
 * Studio panel (docs 22 §2/§3 region D, docs 32 §3–§8). Wired to the real,
 * already-built server/routes/studio.ts — the same pipeline docs 32 describes
 * (deterministic mechanics for Level 1, platform/gateway + Warden for Levels 2-5).
 *
 * Passage selection isn't real yet: there's no click-to-select interaction in
 * Primary's read-only view (docs 22 §5.4's "Select text, ⌘I" needs the real
 * editor). The textarea below is the same kind of honest stopgap as
 * plainTextToDocument.ts — paste a passage rather than select one in place.
 */
export default function StudioPanel({ sessionId }: { sessionId: string }) {
  const [level, setLevel] = useState<InterventionLevel>("proofread");
  /** Auto routes through the Scholar AI Engine (Priority 1); Advanced is the pre-existing manual provider+key override, kept for the case Auto has nothing usable. */
  const [mode, setMode] = useState<"auto" | "advanced">("auto");
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [apiKey, setApiKey] = useState("");
  /** True once the key below came from saved settings rather than being typed here. */
  const [keyFromSettings, setKeyFromSettings] = useState(false);
  /** Auto mode's routing preview — refreshed whenever the level changes, so "Why this AI?" reflects the request about to be sent rather than a stale one. */
  const [routing, setRouting] = useState<RoutingDecision | null>(null);
  const [routingLoading, setRoutingLoading] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  /** What actually served the last completed request — distinct from `routing` (a preview), this is the record shown once a result exists. */
  const [executedSource, setExecutedSource] = useState<{ tier: string; provider: string; model?: string; creditsUsed?: number; reasoning: string } | null>(null);
  const [l1, setL1] = useState<string>("");
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [voiceSamples, setVoiceSamples] = useState("");
  const [buildingVoiceProfile, setBuildingVoiceProfile] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<StudioRefineResult | null>(null);
  const [consentNeeded, setConsentNeeded] = useState<{ provider: string; reason: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showVoiceBuilder, setShowVoiceBuilder] = useState(false);
  const [writingHistoryEnabled, setWritingHistoryEnabled] = useState(false);
  // Prefill from the user's saved AI configuration. Before this existed, the
  // panel asked for an API key on every visit even though setup had already
  // collected one — the settings had nowhere to be read from
  // (see src/services/userAiSettings.ts).
  useEffect(() => {
    let active = true;
    (async () => {
      const settings = await loadUserAiSettings();
      if (!active) return;
      if (PROVIDERS.includes(settings.provider)) setProvider(settings.provider);
      const saved = await readProviderKey(settings.provider);
      if (!active || !saved) return;
      setApiKey(saved);
      setKeyFromSettings(true);
    })().catch(() => {
      // Prefill is a convenience, not a precondition — the panel still works
      // with a manually entered key. Without this catch the rejection is
      // unhandled, which in Node terminates the process and in the browser
      // surfaces as a console error for a failure the user need not see.
    });
    return () => {
      active = false;
    };
  }, []);

  const writingHistory = getWritingHistory(sessionId);
  const historySummary = summarizeWritingHistory(writingHistory);

  const activeLevel = LEVELS.find((l) => l.id === level)!;

  // Preview the Scholar AI Engine's pick whenever a model-backed level is
  // selected in Auto mode, so "Why this AI?" reflects the request about to
  // be sent (Priority 6) rather than being computed only after the fact.
  // run() below re-fetches instead of trusting this stale preview if it's
  // missing, so a slow/failed preview never blocks the actual request.
  useEffect(() => {
    if (mode !== "auto" || !activeLevel.needsProvider) {
      setRouting(null);
      return;
    }
    let active = true;
    setRoutingLoading(true);
    routeDecision(STUDIO_TASK_TYPE)
      .then((d) => active && setRouting(d))
      .catch(() => active && setRouting(null))
      .finally(() => active && setRoutingLoading(false));
    return () => {
      active = false;
    };
  }, [mode, activeLevel.needsProvider]);

  async function buildVoiceProfileFromSamples() {
    if (!voiceSamples.trim()) {
      setError("Please provide writing samples to build a voice profile.");
      return;
    }
    setBuildingVoiceProfile(true);
    setError(null);
    try {
      const response = await fetch("/api/studio/voice-profile", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ samples: voiceSamples.split("\n\n").filter((s) => s.trim()) }),
      });
      if (!response.ok) {
        const err = await response.json();
        throw new Error(err.error || "Failed to build voice profile");
      }
      const profile = await response.json();
      setVoiceProfile(profile);
      setShowVoiceBuilder(false);
      setVoiceSamples("");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBuildingVoiceProfile(false);
    }
  }

  async function run() {
    setBusy(true);
    setError(null);
    setConsentNeeded(null);
    // Populated during Auto selection below so the consent-retry catch below
    // can name the actual provider attempted, not the leftover Advanced-mode
    // dropdown value.
    let chosenProviderId: string | undefined;
    let chosenReasoning = "";
    let chosenTier = "manual";
    try {
      const refineExtra: { provider?: string; apiKey?: string; model?: string; useEngine?: "premium" } = {};

      if (activeLevel.needsProvider) {
        if (mode === "advanced") {
          refineExtra.provider = provider;
          refineExtra.apiKey = apiKey;
          chosenProviderId = provider;
          chosenTier = "manual";
          chosenReasoning = "Manually selected in Advanced mode.";
        } else {
          // Re-fetch rather than trust a stale/failed preview — the request
          // actually sent must match a real, current decision (Priority 1),
          // never a client-side guess.
          const decision = routing ?? (await routeDecision(STUDIO_TASK_TYPE).catch(() => null));
          if (!decision) {
            setError("Could not reach AI Access to choose a provider. Try again, or switch to Advanced.");
            return;
          }
          if (!decision.ok) {
            setError(decision.reasoning);
            return;
          }
          const candidates = executableCandidates(decision);
          if (candidates.length === 0) {
            setError(
              "Only a local runner is connected, and Studio doesn't support local execution yet. Connect a cloud, BYOK, or Premium AI source in AI Access, or switch to Advanced."
            );
            return;
          }
          for (const c of candidates) {
            if (c.tier === "premium") {
              refineExtra.useEngine = "premium";
              chosenProviderId = c.providerId;
              chosenTier = c.tier;
              chosenReasoning = c.reasoning;
              break;
            }
            // Free/BYOK keys live only on this device (never the server) —
            // a provider the router sees as "connected" from another device
            // has no key here, so fall through to the next candidate rather
            // than send a request that can't succeed.
            const key = await readProviderKey(c.providerId);
            if (key) {
              refineExtra.provider = c.providerId;
              refineExtra.apiKey = key;
              refineExtra.model = c.modelId;
              chosenProviderId = c.providerId;
              chosenTier = c.tier;
              chosenReasoning = c.reasoning;
              break;
            }
          }
          if (!chosenProviderId) {
            setError("A connected AI source was found, but its key isn't stored on this device. Open AI Access to reconnect it, or switch to Advanced.");
            return;
          }
        }
      }

      const r = await refinePassage({
        sessionId,
        passageId: "desk-studio-passage",
        text,
        level,
        l1: l1 || undefined,
        voiceProfile: voiceProfile || undefined,
        ...refineExtra,
      });
      setResult(r);
      setExecutedSource(
        r.aiSource
          ? { tier: r.aiSource.tier, provider: r.aiSource.provider, model: r.aiSource.model, creditsUsed: r.aiSource.creditsUsed, reasoning: chosenReasoning }
          : r.usage
            ? { tier: chosenTier, provider: r.usage.provider, model: r.usage.model, reasoning: chosenReasoning }
            : null
      );

      // Record to Writing History if enabled (docs 32 §8)
      if (writingHistoryEnabled) {
        recordRefinement(
          sessionId,
          "desk-studio-passage",
          level,
          r.diff.changes.length,
          r.contentChangeCount
        );
      }
    } catch (e) {
      if (e instanceof StudioConsentRequiredError) {
        setConsentNeeded({ provider: e.provider || chosenProviderId || provider, reason: e.message });
      } else if (e instanceof StudioDeniedError) {
        setError(`Denied by privacy policy: ${e.message}`);
      } else if (e instanceof StudioNoAiSourceError) {
        setError(e.message);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
  }

  function toggleWritingHistory() {
    if (writingHistoryEnabled) {
      disableWritingHistory(sessionId);
    } else {
      enableWritingHistory(sessionId);
    }
    setWritingHistoryEnabled(!writingHistoryEnabled);
  }

  async function acceptConsent() {
    if (!consentNeeded) return;
    setBusy(true);
    try {
      await grantStudioConsent(sessionId, consentNeeded.provider);
      setConsentNeeded(null);
      await run();
    } catch (e) {
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <div className="border-b border-[color:var(--color-border-subtle)]">
      <div className="flex items-center justify-between px-3 py-2 text-xs text-[color:var(--text-secondary)]">
        <span>▤ Studio</span>
        <label className="flex items-center gap-1 cursor-pointer text-[10px] font-normal">
          <input
            type="checkbox"
            checked={writingHistoryEnabled}
            onChange={toggleWritingHistory}
            className="w-3 h-3 cursor-pointer"
          />
          Writing History
        </label>
      </div>
      <div className="px-3 pb-3 flex flex-col gap-2">
        {/* Intervention level selection with description */}
        <div className="rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as InterventionLevel)}
            className="border-0 bg-transparent w-full text-xs text-[color:var(--text-primary)] px-2 py-1 focus:outline-none"
          >
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[10px] text-[color:var(--text-muted)]">{activeLevel.description}</p>

        {/* AI source for model-backed levels: Auto routes through the Scholar
            AI Engine (Priority 1); Advanced is the manual override for when
            Auto has nothing usable, or the user just wants to pick. */}
        {activeLevel.needsProvider && mode === "auto" && (
          <div className="rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)] px-2 py-1.5 text-[11px]">
            {routingLoading && <p className="text-[color:var(--text-muted)]">Choosing an AI source…</p>}
            {!routingLoading && routing && routing.ok && (
              <div className="flex items-center justify-between gap-2">
                <span className="text-[color:var(--text-secondary)]">{`Will use: ${routing.choice.providerId} · ${routing.choice.tier}`}</span>
                <button
                  type="button"
                  onClick={() => setDetailsOpen(!detailsOpen)}
                  className="text-[color:var(--color-luminous-blue-dim)] hover:underline shrink-0"
                >
                  Why this AI?
                </button>
              </div>
            )}
            {!routingLoading && routing && !routing.ok && <p className="text-amber-400">{routing.reasoning}</p>}
            {!routingLoading && !routing && <p className="text-[color:var(--text-muted)]">No AI source available yet — connect one in AI Access.</p>}
            {detailsOpen && routing?.ok && (
              <div className="mt-1.5 border-t border-[color:var(--color-border-subtle)] pt-1.5 text-[10px] text-[color:var(--text-muted)]">
                <p>{routing.choice.reasoning}</p>
                {routing.fallbacks.length > 0 && (
                  <p className="mt-1">Fallback order: {routing.fallbacks.map((f) => `${f.providerId} (${f.tier})`).join(" → ")}</p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => setMode("advanced")}
              className="mt-1.5 text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)] underline"
            >
              Choose manually (Advanced)
            </button>
          </div>
        )}

        {activeLevel.needsProvider && mode === "advanced" && (
          <div className="flex flex-col gap-1.5">
            <div className="flex gap-1.5">
              <div className="rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
                <select
                  value={provider}
                  onChange={(e) => setProvider(e.target.value)}
                  className="border-0 bg-transparent text-xs text-[color:var(--text-primary)] px-2 py-1 focus:outline-none"
                >
                  {PROVIDERS.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex-1 rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
                <input
                  type="password"
                  value={apiKey}
                  onChange={(e) => {
                    setApiKey(e.target.value);
                    setKeyFromSettings(false);
                  }}
                  aria-label="API key"
                  placeholder={keyFromSettings ? "Using your saved key" : "API key"}
                  className="border-0 bg-transparent w-full text-xs text-[color:var(--text-primary)] px-2 py-1 focus:outline-none"
                />
              </div>
            </div>
            <button
              type="button"
              onClick={() => setMode("auto")}
              className="self-start text-[10px] text-[color:var(--text-muted)] hover:text-[color:var(--text-secondary)] underline"
            >
              Use recommended AI (Auto)
            </button>
          </div>
        )}

        {/* L1 and Voice Profile options (docs 32 §5, §6) */}
        <div className="flex gap-1.5 items-end">
          <div className="flex-1 rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
            <select
              value={l1}
              onChange={(e) => setL1(e.target.value)}
              className="border-0 bg-transparent w-full text-xs text-[color:var(--text-primary)] px-2 py-1 focus:outline-none"
            >
              <option value="">No L1 (optional)</option>
              {L1_PROFILES.map((profile) => (
                <option key={profile} value={profile.toLowerCase()}>
                  L1: {profile}
                </option>
              ))}
            </select>
          </div>
          <button
            onClick={() => setShowVoiceBuilder(!showVoiceBuilder)}
            className="px-2 py-1 rounded text-xs text-[color:var(--text-secondary)] border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-luminous-blue-dim)]"
          >
            {voiceProfile ? "✓ Voice" : "Voice"}
          </button>
        </div>

        {/* Voice Profile builder */}
        {showVoiceBuilder && (
          <div className="rounded border border-[color:var(--color-luminous-blue-dim)] bg-[color:var(--color-navy-2)] p-2">
            <p className="text-[10px] text-[color:var(--text-secondary)] mb-1">Paste 1-3 writing samples (separate by blank lines):</p>
            <div className="rounded bg-[color:var(--color-navy-3)] border border-[color:var(--color-border-subtle)] mb-1">
              <textarea
                value={voiceSamples}
                onChange={(e) => setVoiceSamples(e.target.value)}
                rows={3}
                placeholder="Your prior essays, thesis chapters, or writing samples..."
                className="border-0 bg-transparent w-full text-[10px] text-[color:var(--text-primary)] p-1 font-serif focus:outline-none"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={buildVoiceProfileFromSamples}
                disabled={buildingVoiceProfile || !voiceSamples.trim()}
                className="flex-1 px-2 py-1 rounded text-xs bg-[color:var(--color-luminous-blue-dim)] text-white disabled:opacity-40"
              >
                {buildingVoiceProfile ? "Building…" : "Build Profile"}
              </button>
              <button
                onClick={() => setShowVoiceBuilder(false)}
                className="px-2 py-1 rounded text-xs border border-[color:var(--color-border-subtle)]"
              >
                Close
              </button>
            </div>
          </div>
        )}
        {voiceProfile && !showVoiceBuilder && (
          <p className="text-[10px] text-[color:var(--color-luminous-blue-dim)]">✓ Voice profile active (mean sentence: {Math.round(voiceProfile.meanSentenceLength)} words)</p>
        )}

        <div className="rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={4}
            placeholder="Paste a passage to refine — no select-in-editor flow yet."
            className="border-0 bg-transparent w-full text-xs text-[color:var(--text-primary)] p-2 font-serif focus:outline-none"
          />
        </div>

        <button
          onClick={run}
          disabled={busy || text.trim().length === 0 || (activeLevel.needsProvider && mode === "advanced" && apiKey.trim().length === 0)}
          className="px-3 py-1.5 rounded bg-[color:var(--color-luminous-blue-dim)] text-white text-xs disabled:opacity-40"
        >
          {busy ? "Running…" : "Refine"}
        </button>

        {consentNeeded && (
          <div role="alert" className="rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] p-2">
            <p className="mb-2">{consentNeeded.reason}</p>
            <button onClick={acceptConsent} disabled={busy} className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-xs">
              Allow {consentNeeded.provider} and retry
            </button>
          </div>
        )}

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        {result && (
          <div className="flex flex-col gap-2">
            {/* Summary */}
            <div className="rounded border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] px-2 py-1.5">
              <p className="text-[10px] text-[color:var(--text-muted)]">
                {result.diff.changes.length} changes — {result.contentChangeCount} content, {result.languageChangeCount} language
              </p>
              {result.voiceDrift?.drifted && (
                <p className="text-[10px] text-amber-400 mt-1">
                  ⚠ Voice drift detected: {result.voiceDrift.notes.join(" · ")}
                </p>
              )}
              {executedSource && (
                <div className="mt-1.5 pt-1.5 border-t border-[color:var(--color-border-subtle)]">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-[10px] text-[color:var(--text-muted)]">
                      AI used: {executedSource.provider}
                      {executedSource.model ? ` (${executedSource.model})` : ""} · {executedSource.tier}
                      {executedSource.creditsUsed !== undefined ? ` · ${executedSource.creditsUsed} credit${executedSource.creditsUsed === 1 ? "" : "s"}` : ""}
                    </p>
                    {executedSource.reasoning && (
                      <button
                        type="button"
                        onClick={() => setDetailsOpen(!detailsOpen)}
                        className="text-[10px] text-[color:var(--color-luminous-blue-dim)] hover:underline shrink-0"
                      >
                        Why this AI?
                      </button>
                    )}
                  </div>
                  {detailsOpen && executedSource.reasoning && (
                    <p className="mt-1 text-[10px] text-[color:var(--text-muted)]">{executedSource.reasoning}</p>
                  )}
                </div>
              )}
            </div>

            {/* Diff display */}
            {result.diff.changes.length === 0 ? (
              <p className="text-[11px] text-[color:var(--text-muted)]">No changes suggested.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
                {/* Content changes first (docs 32 §7) */}
                {result.diff.changes
                  .filter((c) => c.category === "content")
                  .map((c) => (
                    <li key={c.id} className={`rounded border px-2 py-1.5 text-[11px] ${CATEGORY_COLOR[c.category]}`}>
                      <div className="text-[9px] mb-1">⚠ {CATEGORY_LABEL[c.category]}</div>
                      <div className="line-through opacity-60">{c.originalText}</div>
                      <div className="font-semibold">{c.replacementText}</div>
                      <div className="text-[10px] opacity-90 mt-1">{c.reason}</div>
                      {c.meaningNote && <div className="text-[10px] opacity-75 mt-1 italic">Note: {c.meaningNote}</div>}
                    </li>
                  ))}
                {/* Language changes */}
                {result.diff.changes
                  .filter((c) => c.category !== "content")
                  .map((c) => (
                    <li key={c.id} className={`rounded border px-2 py-1.5 text-[11px] ${CATEGORY_COLOR[c.category]}`}>
                      <div className="text-[9px] mb-1">{CATEGORY_LABEL[c.category]}</div>
                      <div className="line-through opacity-60">{c.originalText}</div>
                      <div>{c.replacementText}</div>
                      <div className="text-[10px] opacity-80 mt-1">{c.reason}</div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}

        {/* Writing History summary (docs 32 §8) */}
        {writingHistoryEnabled && historySummary && (
          <div className="rounded border border-[color:var(--color-luminous-blue-dim)] bg-[color:var(--color-navy-2)] px-2 py-1.5">
            <p className="text-[10px] text-[color:var(--color-luminous-blue)]">{historySummary}</p>
            <button
              onClick={() => clearWritingHistory(sessionId)}
              className="mt-1 text-[10px] text-[color:var(--text-muted)] hover:text-red-400 font-mono"
            >
              Clear history
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
