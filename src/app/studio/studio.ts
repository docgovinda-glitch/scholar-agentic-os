/**
 * app/studio — the Language & Voice Studio orchestrator.
 *
 * Spec: docs/03-workflow/32-LANGUAGE-AND-VOICE-ARCHITECTURE.md §3
 * (the six-stage pipeline) and §13.
 *
 * Pipeline:
 *   1. ANALYSE   — locate quotations to protect (domain/language/quotations)
 *   2. PLAN       — resolve level, register, L1 hints, voice profile
 *   3. REFINE     — deterministic mechanics engine (Level 1) OR a
 *                    platform/gateway call (Levels 2–5), which passes
 *                    through the Warden exactly like every other model call
 *   4. VERIFY     — domain/language/meaningGuard reclassifies claim-strength,
 *                    negation, and numeric changes as "content", surfaced
 *                    first and separately from language changes
 *   5. VOICE CHECK — domain/language/voiceProfile flags drift (report only,
 *                    never blocks)
 *   6. DIFF        — assembled into a RefinementDiff for the client to render
 *
 * This module lives in src/app — the architectural test in
 * src/platform/__tests__/architecture.test.ts asserts it never calls
 * fetch() directly, only through platform/gateway.
 */

import { excludeQuotedRanges } from "../../domain/language/quotations";
import { runMechanicsEngine } from "../../domain/language/mechanics";
import { applyMeaningGuard } from "../../domain/language/meaningGuard";
import { detectVoiceDrift } from "../../domain/language/voiceProfile";
import { isDeterministicLevel } from "../../domain/language/types";
import type { DiffChange, RefinementDiff } from "../../domain/language/types";
import { complete, GatewayDenied } from "../../platform/gateway/gateway";
import { buildSystemPrompt } from "./prompts";
import {
  fallbackDiff,
  structuredChangesToDiff,
  structuredResponseInstruction,
  tryParseStructuredResponse,
} from "./structuredDiff";
import type { StudioRefineInput, StudioRefineResult, StudioRefineUsage } from "./types";

export { GatewayDenied } from "../../platform/gateway/gateway";
export type { StudioRefineInput, StudioRefineResult, StudioRefineUsage } from "./types";

async function refineDeterministic(text: string): Promise<DiffChange[]> {
  const raw = runMechanicsEngine(text);
  return excludeQuotedRanges(text, raw);
}

async function refineWithModel(input: StudioRefineInput): Promise<{ changes: DiffChange[]; usage: StudioRefineUsage }> {
  if (!input.provider || !input.apiKey) {
    throw new Error(
      `Level "${input.level}" requires a model provider and API key. Only "proofread" runs without one.`
    );
  }

  const systemPrompt =
    buildSystemPrompt({
      level: input.level as Exclude<typeof input.level, "proofread">,
      text: input.text,
      discipline: input.discipline,
      l1: input.l1,
      voiceProfile: input.voiceProfile,
    }) +
    "\n\n" +
    structuredResponseInstruction();

  const result = await complete(
    {
      provider: input.provider,
      apiKey: input.apiKey,
      model: input.model,
      taskClass: "refinement",
      scopeId: input.scopeId,
      systemPrompt,
      userPrompt: input.text,
      segments: [{ label: "Your text: selected passage", text: input.text }],
      local: input.local,
    },
    input.policy
  );

  const structured = tryParseStructuredResponse(result.text);
  let changes: DiffChange[];
  if (structured) {
    changes = structuredChangesToDiff(input.text, structured, "language");
    // Any change the model listed but whose snippet we couldn't locate is
    // recovered by diffing the model's own "revised" text as a safety net,
    // so a change is never silently lost even if the model's quoting drifts.
    const recoveredOriginal = applyKnownChangesOriginal(input.text, changes);
    if (recoveredOriginal !== structured.revised) {
      const recovery = fallbackDiff(input.level, recoveredOriginal, structured.revised, "language");
      changes = changes.concat(recovery);
    }
  } else {
    changes = fallbackDiff(input.level, input.text, result.text, "language");
  }

  return {
    changes: excludeQuotedRanges(input.text, changes),
    usage: {
      provider: result.provider,
      model: result.model,
      inputTokensEstimate: result.inputTokensEstimate,
      outputTokensEstimate: result.outputTokensEstimate,
    },
  };
}

/** Reconstruct what the original text would look like with only the *located* structured changes applied. */
function applyKnownChangesOriginal(original: string, changes: DiffChange[]): string {
  const sorted = [...changes].sort((a, b) => a.originalStart - b.originalStart);
  let result = "";
  let cursor = 0;
  for (const c of sorted) {
    result += original.slice(cursor, c.originalStart);
    result += c.replacementText;
    cursor = c.originalEnd;
  }
  result += original.slice(cursor);
  return result;
}

/**
 * Run the full Studio pipeline on one passage. Throws GatewayDenied (from
 * platform/gateway) if the Warden refuses model-backed levels — the caller
 * is responsible for consent flows exactly as with any other gateway call.
 * Level "proofread" never throws GatewayDenied: it makes no outbound call.
 */
export async function refine(input: StudioRefineInput): Promise<StudioRefineResult> {
  let rawChanges: DiffChange[];
  let usage: StudioRefineUsage | undefined;
  if (isDeterministicLevel(input.level)) {
    rawChanges = await refineDeterministic(input.text);
  } else {
    const modelResult = await refineWithModel(input);
    rawChanges = modelResult.changes;
    usage = modelResult.usage;
  }

  const guarded = applyMeaningGuard(rawChanges);

  const voiceDrift = input.voiceProfile
    ? detectVoiceDrift(input.voiceProfile, applyAllChangesForPreview(input.text, guarded))
    : undefined;

  const diff: RefinementDiff = {
    passageId: input.passageId,
    level: input.level,
    originalText: input.text,
    changes: guarded,
    voiceApplied: Boolean(input.voiceProfile) && !isDeterministicLevel(input.level),
  };

  return {
    diff,
    voiceDrift,
    contentChangeCount: guarded.filter((c) => c.category === "content").length,
    languageChangeCount: guarded.filter((c) => c.category === "language").length,
    usage,
  };
}

/** Preview text with every proposed change applied — used only for voice-drift comparison, never returned to the caller as the "accepted" text (acceptance is the user's per-change decision, per domain/language/diff.applyChanges). */
function applyAllChangesForPreview(original: string, changes: DiffChange[]): string {
  const sorted = [...changes].sort((a, b) => a.originalStart - b.originalStart);
  let result = "";
  let cursor = 0;
  for (const c of sorted) {
    result += original.slice(cursor, c.originalStart);
    result += c.replacementText;
    cursor = c.originalEnd;
  }
  result += original.slice(cursor);
  return result;
}
