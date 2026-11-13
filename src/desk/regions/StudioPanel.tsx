import { useState, useEffect } from "react";
import { authedJsonFetch } from "../api";
import { getWritingHistory, enableWritingHistory, disableWritingHistory, clearWritingHistory, summarizeWritingHistory, recordRefinement } from "../../app/studio/writingHistory";
import { refine } from "../../app/studio/studio";
import { browserCompleter } from "../ai/completer";
import type { InterventionLevel, StudioRefineResult, VoiceProfile } from "../types";
import type { L1Profile } from "../../domain/language/types";

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

const CATEGORY_LABEL = { mechanics: "Mechanics", language: "Language", content: "Content" } as const;
const CATEGORY_COLOR = {
  mechanics: "text-[color:var(--text-secondary)] border-[color:var(--color-border-subtle)]",
  language: "text-[color:var(--color-luminous-blue)] border-[color:var(--color-luminous-blue-dim)]",
  content: "text-amber-400 border-amber-500/30",
} as const;

/**
 * Studio panel (docs 22 §2/§3 region D, docs 32 §3–§8). Level 1 is deterministic mechanics;
 * Levels 2-5 run on the AI connections set up once in AI Access (browserCompleter).
 *
 * Passage selection FROM THE DOCUMENT EDITOR isn't real yet: there's no
 * click-to-select interaction in the TipTap-backed editor (docs 22 §5.4's
 * "Select text, ⌘I"). Passage selection from freshly AI-GENERATED manuscript
 * sections IS real, via `seedText`/`seedToken` below (ManuscriptGenerationPanel's
 * "Refine in Studio" action) — this is a "make the AI-drafted prose read
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
  /** What answered the last request, from the router. */
  const [answeredBy, setAnsweredBy] = useState<{ provider: string; model: string } | null>(null);
  const [l1, setL1] = useState<string>("");
  const [voiceProfile, setVoiceProfile] = useState<VoiceProfile | null>(null);
  const [voiceSamples, setVoiceSamples] = useState("");
  const [buildingVoiceProfile, setBuildingVoiceProfile] = useState(false);
  const [text, setText] = useState("");
  const [result, setResult] = useState<StudioRefineResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showVoiceBuilder, setShowVoiceBuilder] = useState(false);
  const [writingHistoryEnabled, setWritingHistoryEnabled] = useState(false);
  // Seed the passage box from a freshly generated manuscript section
  // (ManuscriptGenerationPanel's "Refine in Studio"). Reacts to a CHANGE in
  // seedToken, not to seedText alone, so a parent re-render carrying the same
  // token never clobbers text the user is actively editing.
  useEffect(() => {
    if (seedToken === undefined) return;
    setText(seedText ?? "");
    setResult(null);
    setError(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reacts only to seedToken changes, per the comment above.
  }, [seedToken]);

  const writingHistory = getWritingHistory(sessionId);
  const historySummary = summarizeWritingHistory(writingHistory);

  const activeLevel = LEVELS.find((l) => l.id === level)!;

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
    try {
      const r = await refine({
        passageId: "desk-studio-passage",
        text,
        level,
        l1: l1 ? (l1 as L1Profile) : undefined,
        voiceProfile: voiceProfile || undefined,
        complete: browserCompleter,
      });
      setResult(r);
      setAnsweredBy(r.usage ? { provider: r.usage.provider, model: r.usage.model } : null);

      // Record to Writing History if enabled (docs 32 §8)
      if (writingHistoryEnabled) {
        recordRefinement(sessionId, "desk-studio-passage", level, r.diff.changes.length, r.contentChangeCount);
      }
    } catch (e) {
      setError((e as Error).message);
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

        {activeLevel.needsProvider && (
          <p className="text-[10px] text-[color:var(--text-muted)]">
            Runs on the AI you set up in AI Access. Switch models from the AI status indicator.
          </p>
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
          disabled={busy || text.trim().length === 0}
          className="px-3 py-1.5 rounded bg-[color:var(--color-luminous-blue-dim)] text-white text-xs disabled:opacity-40"
        >
          {busy ? "Running…" : "Refine"}
        </button>

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
              {answeredBy && (
                <p className="mt-1.5 pt-1.5 border-t border-[color:var(--color-border-subtle)] text-[10px] text-[color:var(--text-muted)]">
                  AI used: {answeredBy.provider}{answeredBy.model ? ` (${answeredBy.model})` : ""}
                </p>
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
