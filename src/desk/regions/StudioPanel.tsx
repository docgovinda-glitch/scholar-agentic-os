import { useState } from "react";
import { grantStudioConsent, refinePassage, StudioConsentRequiredError, StudioDeniedError } from "../api";
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
// the same catalog the Studio's complete() call resolves against.
const PROVIDERS = ["gemini", "openai", "claude", "cohere"];

const CATEGORY_LABEL = { mechanics: "Mechanics", language: "Language", content: "Content" } as const;
const CATEGORY_COLOR = {
  mechanics: "text-[#94A3B8] border-[color:var(--color-border-subtle)]",
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
  const [provider, setProvider] = useState(PROVIDERS[0]);
  const [apiKey, setApiKey] = useState("");
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

  const activeLevel = LEVELS.find((l) => l.id === level)!;

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
    try {
      const r = await refinePassage({
        sessionId,
        passageId: "desk-studio-passage",
        text,
        level,
        l1: l1 || undefined,
        voiceProfile: voiceProfile || undefined,
        provider: activeLevel.needsProvider ? provider : undefined,
        apiKey: activeLevel.needsProvider ? apiKey : undefined,
      });
      setResult(r);
    } catch (e) {
      if (e instanceof StudioConsentRequiredError) {
        setConsentNeeded({ provider: e.provider || provider, reason: e.message });
      } else if (e instanceof StudioDeniedError) {
        setError(`Denied by privacy policy: ${e.message}`);
      } else {
        setError((e as Error).message);
      }
    } finally {
      setBusy(false);
    }
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
      <div className="px-3 py-2 text-[10px] font-mono uppercase tracking-wide text-[#94A3B8]">▤ Studio</div>
      <div className="px-3 pb-3 flex flex-col gap-2">
        {/* Intervention level selection with description */}
        <div className="rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
          <select
            value={level}
            onChange={(e) => setLevel(e.target.value as InterventionLevel)}
            className="border-0 bg-transparent w-full text-xs text-[#E2E8F0] px-2 py-1 focus:outline-none"
          >
            {LEVELS.map((l) => (
              <option key={l.id} value={l.id}>
                {l.label}
              </option>
            ))}
          </select>
        </div>
        <p className="text-[10px] text-[#64748B]">{activeLevel.description}</p>

        {/* Provider and API key for model-backed levels */}
        {activeLevel.needsProvider && (
          <div className="flex gap-1.5">
            <div className="rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
              <select
                value={provider}
                onChange={(e) => setProvider(e.target.value)}
                className="border-0 bg-transparent text-xs text-[#E2E8F0] px-2 py-1 focus:outline-none"
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
                onChange={(e) => setApiKey(e.target.value)}
                placeholder="API key"
                className="border-0 bg-transparent w-full text-xs text-[#E2E8F0] px-2 py-1 focus:outline-none"
              />
            </div>
          </div>
        )}

        {/* L1 and Voice Profile options (docs 32 §5, §6) */}
        <div className="flex gap-1.5 items-end">
          <div className="flex-1 rounded bg-[color:var(--color-navy-2)] border border-[color:var(--color-border-subtle)]">
            <select
              value={l1}
              onChange={(e) => setL1(e.target.value)}
              className="border-0 bg-transparent w-full text-xs text-[#E2E8F0] px-2 py-1 focus:outline-none"
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
            className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wide text-[#94A3B8] border border-[color:var(--color-border-subtle)] hover:border-[color:var(--color-luminous-blue-dim)]"
          >
            {voiceProfile ? "✓ Voice" : "Voice"}
          </button>
        </div>

        {/* Voice Profile builder */}
        {showVoiceBuilder && (
          <div className="rounded border border-[color:var(--color-luminous-blue-dim)] bg-[color:var(--color-navy-2)] p-2">
            <p className="text-[10px] text-[#94A3B8] mb-1">Paste 1-3 writing samples (separate by blank lines):</p>
            <div className="rounded bg-[color:var(--color-navy-3)] border border-[color:var(--color-border-subtle)] mb-1">
              <textarea
                value={voiceSamples}
                onChange={(e) => setVoiceSamples(e.target.value)}
                rows={3}
                placeholder="Your prior essays, thesis chapters, or writing samples..."
                className="border-0 bg-transparent w-full text-[10px] text-[#E2E8F0] p-1 font-serif focus:outline-none"
              />
            </div>
            <div className="flex gap-1">
              <button
                onClick={buildVoiceProfileFromSamples}
                disabled={buildingVoiceProfile || !voiceSamples.trim()}
                className="flex-1 px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wide bg-[color:var(--color-luminous-blue-dim)] text-white disabled:opacity-40"
              >
                {buildingVoiceProfile ? "Building…" : "Build Profile"}
              </button>
              <button
                onClick={() => setShowVoiceBuilder(false)}
                className="px-2 py-1 rounded text-[10px] font-mono uppercase tracking-wide border border-[color:var(--color-border-subtle)]"
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
            className="border-0 bg-transparent w-full text-xs text-[#E2E8F0] p-2 font-serif focus:outline-none"
          />
        </div>

        <button
          onClick={run}
          disabled={busy || text.trim().length === 0 || (activeLevel.needsProvider && apiKey.trim().length === 0)}
          className="px-3 py-1.5 rounded bg-[color:var(--color-luminous-blue-dim)] text-white text-[11px] font-mono uppercase tracking-wide disabled:opacity-40"
        >
          {busy ? "Running…" : "Refine"}
        </button>

        {consentNeeded && (
          <div role="alert" className="rounded border border-amber-500/30 bg-amber-500/10 text-amber-300 text-[11px] p-2">
            <p className="mb-2">{consentNeeded.reason}</p>
            <button onClick={acceptConsent} disabled={busy} className="px-2 py-1 rounded bg-amber-500/20 hover:bg-amber-500/30 text-[10px] uppercase font-mono">
              Allow {consentNeeded.provider} and retry
            </button>
          </div>
        )}

        {error && <p className="text-[11px] text-red-400">{error}</p>}

        {result && (
          <div className="flex flex-col gap-2">
            {/* Summary */}
            <div className="rounded border border-[color:var(--color-border-subtle)] bg-[color:var(--color-navy-2)] px-2 py-1.5">
              <p className="text-[10px] text-[#64748B]">
                {result.diff.changes.length} changes — {result.contentChangeCount} content, {result.languageChangeCount} language
              </p>
              {result.voiceDrift?.drifted && (
                <p className="text-[10px] text-amber-400 mt-1">
                  ⚠ Voice drift detected: {result.voiceDrift.notes.join(" · ")}
                </p>
              )}
            </div>

            {/* Diff display */}
            {result.diff.changes.length === 0 ? (
              <p className="text-[11px] text-[#64748B]">No changes suggested.</p>
            ) : (
              <ul className="flex flex-col gap-1.5 max-h-80 overflow-y-auto">
                {/* Content changes first (docs 32 §7) */}
                {result.diff.changes
                  .filter((c) => c.category === "content")
                  .map((c) => (
                    <li key={c.id} className={`rounded border px-2 py-1.5 text-[11px] ${CATEGORY_COLOR[c.category]}`}>
                      <div className="font-mono uppercase tracking-wide text-[9px] mb-1">⚠ {CATEGORY_LABEL[c.category]}</div>
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
                      <div className="font-mono uppercase tracking-wide text-[9px] mb-1">{CATEGORY_LABEL[c.category]}</div>
                      <div className="line-through opacity-60">{c.originalText}</div>
                      <div>{c.replacementText}</div>
                      <div className="text-[10px] opacity-80 mt-1">{c.reason}</div>
                    </li>
                  ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
