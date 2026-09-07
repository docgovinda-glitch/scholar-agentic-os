import { useState, useEffect } from "react";
import { grantStudioConsent, refinePassage, authedJsonFetch, StudioConsentRequiredError, StudioDeniedError, StudioNoAiSourceError } from "../api";
import { loadUserAiSettings, readProviderKey } from "../../services/userAiSettings";
import { routeDecision, type RoutingDecision } from "../aiAccess/aiAccessApi";
import { getWritingHistory, enableWritingHistory, disableWritingHistory, clearWritingHistory, summarizeWritingHistory, recordRefinement } from "../../app/studio/writingHistory";
import { getLocalRunner } from "../../config/localRunnerCatalog";
import { CLOUD_PROVIDERS } from "../../config/providerCatalog";
import { refineLocally, GatewayDenied, grantLocalConsent, getLocalPolicy } from "./localStudioExecution";
import { refine } from "../../app/studio/studio";
import { ALL_L1_PROFILES } from "../../domain/language/l1Patterns";
import type { L1Profile } from "../../domain/language/types";
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

// Every provider platform/gateway/adapters.ts can serve — derived from the
// catalog rather than hand-listed. This used to be a hardcoded 4-provider
// array with a comment claiming it was "the providers platform/gateway can
// actually serve today," which was already wrong by the time this comment
// was written: adapters.ts's generic OpenAICompatibleAdapter alone serves
// every "openai-compatible"-apiStyle catalog entry (~30 of 37), not just
// gemini/openai/claude/cohere, so Groq/Mistral/DeepSeek/OpenRouter/etc. were
// silently unreachable from this Advanced-mode dropdown. Advanced mode only
// — Auto mode routes through the Scholar AI Engine instead and is not
// limited to this list.
const PROVIDERS: string[] = CLOUD_PROVIDERS.map((p) => p.id);

// Every model-backed Studio level is language refinement — none are
// multimodal/long-context/code-generation — so a single Omni Router task
// type applies uniformly, matching runPremiumRefine's server-side choice
// (server/routes/studio.ts) so the client's preview and the server's actual
// execution can never disagree about which tier ranks first.
const STUDIO_TASK_TYPE = "reasoning" as const;

/** A local runner's friendly name for display, falling back to the raw provider id for every non-local tier. */
function displayProviderName(providerId: string): string {
  return getLocalRunner(providerId)?.name ?? providerId;
}

/** "Why this AI?" Source field per tier — the label a user actually recognizes, not the internal tier string. */
function sourceLabel(tier: string): string {
  switch (tier) {
    case "local":
      return "Local";
    case "premium":
      return "Scholar Premium";
    case "free":
      return "Free";
    case "byok":
      return "BYOK";
    case "manual":
      return "Manual (Advanced mode)";
    default:
      return tier;
  }
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
 * Passage selection FROM THE DOCUMENT EDITOR isn't real yet: there's no
 * click-to-select interaction in the TipTap-backed editor (docs 22 §5.4's
 * "Select text, ⌘I"). Passage selection from freshly AI-GENERATED manuscript
 * sections IS real, via `seedText`/`seedToken` below (ManuscriptGenerationPanel's
 * "Humanize in Studio" action) — this is a "make the AI-drafted prose read
 * naturally in the author's voice" pass, not AI-detection-evasion tooling.
 * Absent a seed, the textarea remains the same honest stopgap as
 * plainTextToDocument.ts — paste a passage rather than select one in place.
 */
export default function StudioPanel({
  sessionId,
  seedText,
  seedToken,
}: {
  sessionId: string;
  /** Text to load into the passage box — e.g. a just-generated manuscript section. */
  seedText?: string;
  /** Bump this (e.g. a counter) to re-seed with the same text again; the panel only reacts to a CHANGE in this value, not to `seedText` alone, so typing in the box afterward isn't fought on every parent re-render. */
  seedToken?: number;
}) {
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
  /** `local: true` when this is local execution's OWN client-side consent gate (localStudioExecution.ts) rather than the server-mediated one every other tier uses. */
  const [consentNeeded, setConsentNeeded] = useState<{ provider: string; reason: string; local: boolean } | null>(null);
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

  // Seed the passage box from a freshly generated manuscript section
  // (ManuscriptGenerationPanel's "Humanize in Studio"). Reacts to a CHANGE in
  // seedToken, not to seedText alone, so a parent re-render carrying the same
  // token never clobbers text the user is actively editing.
  useEffect(() => {
    if (seedToken === undefined) return;
    setText(seedText ?? "");
    setResult(null);
    setError(null);
    setConsentNeeded(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts only to seedToken changes, per the comment above.
  }, [seedToken]);

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
      const response = await authedJsonFetch("/api/studio/voice-profile", "POST", {
        samples: voiceSamples.split("\n\n").filter((s) => s.trim()),
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
      // Set directly by the local branch below, since local execution never
      // goes through refinePassage()'s HTTP round trip — everything else
      // still falls through to the refinePassage() call after this block.
      let r: StudioRefineResult | undefined;
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
          const candidates = [decision.choice, ...decision.fallbacks];
          // Names the most recent local-unavailability reason so the final
          // "nothing worked" message is specific rather than generic, when
          // local was tried and every other candidate also came up empty.
          let localUnavailableNote: string | null = null;

          for (const c of candidates) {
            if (c.tier === "premium") {
              refineExtra.useEngine = "premium";
              chosenProviderId = c.providerId;
              chosenTier = c.tier;
              chosenReasoning = c.reasoning;
              break;
            }
            if (c.tier === "local") {
              // Executed inline, not just selected: a connection record
              // ("this device — or another one — set this runner up once")
              // is not proof it is reachable right now, the way a Premium
              // credential or a device-local key already is. Availability
              // can only be known by actually trying, so a runtime/model
              // problem here falls through to the NEXT candidate — Part 1's
              // "local fallback to cloud where policy permits" — rather than
              // stopping the whole request. A privacy-restricted candidate
              // list (no-cloud) naturally has no cloud candidate to fall
              // back to, so this never overrides that preference.
              // Set before the attempt, not after: a GatewayDenied (consent
              // required) thrown from inside refineLocally() must still be
              // attributable to THIS candidate when the outer catch below
              // builds the consent prompt, not fall back to a stale default.
              chosenProviderId = c.providerId;
              chosenTier = c.tier;
              chosenReasoning = c.reasoning;
              try {
                r = await refineLocally({
                  runnerId: c.providerId,
                  sessionId,
                  passageId: "desk-studio-passage",
                  text,
                  level,
                  l1: l1 || undefined,
                  voiceProfile: voiceProfile || undefined,
                });
                break;
              } catch (localErr) {
                // Anything except a consent decision — unreachable runtime,
                // no model loaded, a timeout, or the runtime returning an
                // error mid-generation — is treated the same way: this
                // candidate didn't work, so try the next one (Part 1's
                // "local fallback to cloud where policy permits"). The real
                // message is kept (not replaced with a generic one) so that
                // if every candidate fails, the last thing actually said is
                // still visible rather than papered over.
                if (!(localErr instanceof GatewayDenied)) {
                  localUnavailableNote = localErr instanceof Error ? localErr.message : String(localErr);
                  // This candidate did not pan out — clear it so the
                  // post-loop "did anything actually work" check isn't
                  // fooled by a failed attempt's leftover id.
                  chosenProviderId = undefined;
                  chosenTier = "manual";
                  chosenReasoning = "";
                  continue;
                }
                throw localErr; // GatewayDenied (consent) — surfaced, never swallowed.
              }
            }
            // Free/BYOK keys live only on this device (never the server) —
            // execute directly on the client rather than sending the key to the server.
            const key = await readProviderKey(c.providerId);
            if (key) {
              chosenProviderId = c.providerId;
              chosenTier = c.tier;
              try {
                const l1Profile: L1Profile | undefined = l1 && (ALL_L1_PROFILES as readonly string[]).includes(l1) ? (l1 as L1Profile) : undefined;
                r = await refine({
                  passageId: "desk-studio-passage",
                  text,
                  level,
                  discipline: undefined,
                  l1: l1Profile,
                  voiceProfile: voiceProfile || undefined,
                  provider: c.providerId,
                  apiKey: key,
                  model: c.modelId,
                  policy: getLocalPolicy(sessionId),
                });
                break;
              } catch (clientErr) {
                if (clientErr instanceof GatewayDenied) {
                  throw clientErr;
                }
                localUnavailableNote = clientErr instanceof Error ? clientErr.message : String(clientErr);
                chosenProviderId = undefined;
                chosenTier = "manual";
                chosenReasoning = "";
                continue;
              }
            }
          }
          if (!chosenProviderId && !r) {
            setError(
              localUnavailableNote
                ? `${localUnavailableNote} No other AI source is currently usable. Open AI Access to reconnect one, or switch to Advanced.`
                : "A connected AI source was found, but its key isn't stored on this device. Open AI Access to reconnect it, or switch to Advanced."
            );
            return;
          }
        }
      }

      if (!r) {
        if (mode === "advanced" && apiKey) {
          const l1Profile: L1Profile | undefined = l1 && (ALL_L1_PROFILES as readonly string[]).includes(l1) ? (l1 as L1Profile) : undefined;
          r = await refine({
            passageId: "desk-studio-passage",
            text,
            level,
            discipline: undefined,
            l1: l1Profile,
            voiceProfile: voiceProfile || undefined,
            provider,
            apiKey,
            policy: getLocalPolicy(sessionId),
          });
        } else {
          r = await refinePassage({
            sessionId,
            passageId: "desk-studio-passage",
            text,
            level,
            l1: l1 || undefined,
            voiceProfile: voiceProfile || undefined,
            provider: refineExtra.provider,
            model: refineExtra.model,
            useEngine: refineExtra.useEngine,
          });
        }
      }
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
        setConsentNeeded({ provider: e.provider || chosenProviderId || provider, reason: e.message, local: false });
      } else if (e instanceof GatewayDenied) {
        // Local execution's own Warden gate (localStudioExecution.ts) — the
        // real error class, thrown directly, since local never round-trips
        // through the server the way every other tier's 428 does.
        if (e.requiresConsent) {
          setConsentNeeded({ provider: chosenProviderId || provider, reason: e.message, local: true });
        } else {
          setError(`Denied by privacy policy: ${e.message}`);
        }
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
      if (consentNeeded.local) {
        // Purely in-memory, in this browser tab — see localStudioExecution.ts
        // for why local consent has no server round trip to make.
        grantLocalConsent(sessionId, consentNeeded.provider);
      } else {
        await grantStudioConsent(sessionId, consentNeeded.provider);
      }
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
                <span className="text-[color:var(--text-secondary)]">{`Will use: ${displayProviderName(routing.choice.providerId)} · ${routing.choice.tier}`}</span>
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
              Allow {displayProviderName(consentNeeded.provider)} and retry
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
                      AI used: {displayProviderName(executedSource.provider)}
                      {executedSource.model ? ` (${executedSource.model})` : ""} · {executedSource.tier}
                      {executedSource.creditsUsed !== undefined ? ` · ${executedSource.creditsUsed} credit${executedSource.creditsUsed === 1 ? "" : "s"}` : ""}
                    </p>
                    <button
                      type="button"
                      onClick={() => setDetailsOpen(!detailsOpen)}
                      className="text-[10px] text-[color:var(--color-luminous-blue-dim)] hover:underline shrink-0"
                    >
                      Why this AI?
                    </button>
                  </div>
                  {/* Field-by-field breakdown: exactly what actually served this
                      request, phrased so it can never be mistaken for a claim
                      about a different tier. Local shows Runtime/Processing
                      instead of Provider/Credits since no provider was billed
                      and nothing left this device; Premium is the only tier
                      that shows a credits figure, since it's the only one that
                      spends any. Never includes a credential or key. */}
                  {detailsOpen && (
                    <dl className="mt-1 flex flex-col gap-0.5 text-[10px] text-[color:var(--text-muted)]">
                      <div className="flex gap-1">
                        <dt className="font-medium">Source:</dt>
                        <dd>{sourceLabel(executedSource.tier)}</dd>
                      </div>
                      <div className="flex gap-1">
                        <dt className="font-medium">{executedSource.tier === "local" ? "Runtime:" : "Provider:"}</dt>
                        <dd>{displayProviderName(executedSource.provider)}</dd>
                      </div>
                      {executedSource.model && (
                        <div className="flex gap-1">
                          <dt className="font-medium">Model:</dt>
                          <dd>{executedSource.model}</dd>
                        </div>
                      )}
                      {executedSource.tier === "local" ? (
                        <div className="flex gap-1">
                          <dt className="font-medium">Processing:</dt>
                          <dd>On your computer — this passage was never sent to Scholar's servers.</dd>
                        </div>
                      ) : (
                        executedSource.creditsUsed !== undefined && (
                          <div className="flex gap-1">
                            <dt className="font-medium">Credits used:</dt>
                            <dd>{executedSource.creditsUsed}</dd>
                          </div>
                        )
                      )}
                      {executedSource.reasoning && <p className="mt-0.5">{executedSource.reasoning}</p>}
                    </dl>
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
