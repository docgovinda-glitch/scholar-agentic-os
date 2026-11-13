/**
 * Language & Voice Studio API route.
 *
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md,
 *       docs/04-architecture/48-API-ARCHITECTURE.md.
 *
 * This is the first server route built on the new architecture (Warden ->
 * Gateway -> Studio) rather than the legacy direct-provider-call pattern in
 * server/routes/ai.ts. See src/app/studio/sessionPolicyStore.ts for the
 * scope note on session-policy persistence.
 */

import express from "express";
import { requestCompleter } from "../src/ai/browserHandoff.ts";
import { sendAiFailure } from "../src/ai/aiRouteErrors.ts";
import { refine } from "../../src/app/studio/studio.ts";
import { INTERVENTION_LEVELS, MIN_VOICE_PROFILE_WORDS } from "../../src/domain/language/types.ts";
import { ALL_L1_PROFILES } from "../../src/domain/language/l1Patterns.ts";
import { buildVoiceProfile } from "../../src/domain/language/voiceProfile.ts";
import type { InterventionLevel, VoiceProfile } from "../../src/domain/language/types.ts";
import { requireAuth, type AuthenticatedUser } from "../src/middleware/auth.ts";

function isValidLevel(level: unknown): level is InterventionLevel {
  return typeof level === "string" && (INTERVENTION_LEVELS as string[]).includes(level);
}

const VOICE_PROFILE_NUMERIC_FIELDS = [
  "sampleWordCount",
  "meanSentenceLength",
  "sentenceLengthStdDev",
  "passiveVoiceRatio",
  "semicolonRate",
  "firstPersonRate",
  "averageWordLength",
] as const;

function isValidVoiceProfile(value: unknown): value is VoiceProfile {
  if (typeof value !== "object" || value === null) return false;
  const v = value as Record<string, unknown>;
  return VOICE_PROFILE_NUMERIC_FIELDS.every((key) => typeof v[key] === "number");
}

export function registerStudioRoutes(app: express.Express, studioLimit: express.RequestHandler): void {
  // Studio drives model-backed refinement — it spends provider budget and
  // sends user prose to third parties. It previously required no
  // authentication at all; every endpoint below now does.
  app.use("/api/studio", requireAuth);

  /**
   * Build a Voice Profile from the user's own writing samples (docs
   * 32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §5: "derived statistics, not
   * stored text... deletable at any time" — this endpoint computes and
   * returns the profile; nothing is persisted server-side). Body:
   * { samples: string[] }. 400s if the combined samples fall below
   * MIN_VOICE_PROFILE_WORDS — voice matching must not be fitted to noise.
   */
  app.post("/api/studio/voice-profile", studioLimit, (req, res) => {
    const { samples } = req.body ?? {};
    if (!Array.isArray(samples) || samples.length === 0 || !samples.every((s) => typeof s === "string")) {
      return res.status(400).json({ error: "Missing required field: samples (non-empty string[])" });
    }
    const profile = buildVoiceProfile(samples);
    if (!profile) {
      return res.status(400).json({
        error: `Combined samples are too short to build a reliable Voice Profile (need at least ${MIN_VOICE_PROFILE_WORDS} words).`,
      });
    }
    res.json(profile);
  });

  /**
   * Run the Studio pipeline on a passage.
   * Body: { sessionId, passageId, text, level, discipline?, l1?, voiceProfile? }
   * `voiceProfile` (from POST .../voice-profile) enables post-refinement
   * drift detection; the result's `voiceDrift` is present only when one was supplied.
   *
   * Model-backed levels run on the caller's AI Access connections, sent as the
   * `x-ai-keyring` header (src/platform/router). Keys never travel in the body.
   */
  app.post("/api/studio/refine", studioLimit, async (req, res) => {
    // Explicitly reject any client-submitted API keys to maintain the client-only credential boundary.
    if (
      (req.body && "apiKey" in req.body && req.body.apiKey) ||
      (req.body && "api_key" in req.body && req.body.api_key) ||
      (req.body && "providerKey" in req.body && req.body.providerKey) ||
      (req.body && "secret" in req.body && req.body.secret)
    ) {
      return res.status(400).json({
        error: "User BYOK API keys are client-held and cannot be submitted to the server. Execute BYOK operations directly on the client.",
      });
    }

    const { sessionId, passageId, text, level, discipline, l1, voiceProfile, provider, model, scopeId } = req.body ?? {};

    if (typeof sessionId !== "string" || sessionId.length === 0) {
      return res.status(400).json({ error: "Missing required field: sessionId" });
    }
    if (typeof passageId !== "string" || passageId.length === 0) {
      return res.status(400).json({ error: "Missing required field: passageId" });
    }
    if (typeof text !== "string" || text.length === 0) {
      return res.status(400).json({ error: "Missing required field: text" });
    }
    if (!isValidLevel(level)) {
      return res.status(400).json({
        error: `Invalid level. Must be one of: ${INTERVENTION_LEVELS.join(", ")}`,
      });
    }
    if (l1 !== undefined && !(ALL_L1_PROFILES as string[]).includes(l1)) {
      return res.status(400).json({ error: `Unknown L1 profile: ${l1}` });
    }
    if (voiceProfile !== undefined && !isValidVoiceProfile(voiceProfile)) {
      return res.status(400).json({ error: "Malformed voiceProfile — use the object returned by POST /api/studio/voice-profile." });
    }

    const baseInput = {
      passageId,
      text,
      level,
      discipline: typeof discipline === "string" ? discipline : undefined,
      l1,
      voiceProfile,
    };



    try {
      const result = await refine({
        ...baseInput,
        complete: requestCompleter(req),
      });
      return res.json(result);
    } catch (err) {
      return sendAiFailure(res, err, "Studio refine");
    }
  });
}
