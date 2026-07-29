import { AI_MODES, AIModeId } from "../config/aiModes";

export interface ResolvedWizardRoute {
  mode: AIModeId | null;
  step: number;
  providers: string[];
}

/**
 * Navigation overhaul Phase 2 (docs/planning/navigation-scoping.md) — pure
 * resolver for AISetupWizard.tsx's hash sub-route
 * (#onboarding/ai-setup/<mode>/<step>/<providers>). Kept separate from the
 * component so every fallback rule is unit-testable without rendering.
 *
 * Deliberately NEVER resolves to step 3 (the completion screen) via a deep
 * link — that screen reflects a real validation run's results
 * (healthResults), and a raw deep link has none; showing it anyway would be
 * a broken half-screen, not an honest completed state. Falls back to step 2
 * instead.
 *
 * Deliberately has NOTHING to do with the vault-unlock gate: whether a
 * user's key vault is unlocked is a real, stateless fact (isVaultUnlocked()
 * in vaultPassphrase.ts) checked fresh by the component's own render, not a
 * value this resolver could report or restore — a crafted hash cannot mark
 * itself "unlocked".
 */
export function resolveWizardRoute(
  modeSegment: string | undefined,
  stepSegment: string | undefined,
  providersSegment: string | undefined
): ResolvedWizardRoute {
  const modeConfig = modeSegment ? AI_MODES.find((m) => m.id === modeSegment) : undefined;

  if (!modeConfig) {
    return { mode: null, step: 0, providers: [] };
  }

  const validProviderIds = new Set(modeConfig.providers.map((p) => p.id));
  const requestedProviders = (providersSegment || "").split(",").map((p) => p.trim()).filter(Boolean);
  const providers = requestedProviders.filter((p) => validProviderIds.has(p));

  let step = Number.parseInt(stepSegment || "0", 10);
  if (!Number.isFinite(step) || step < 0) {
    step = 0;
  }
  // Never deep-link straight to the completion screen (3) — it has no real
  // validation data to show. Clamp anything at or above it down to 2.
  if (step >= 3) {
    step = 2;
  }
  // Step 2 (configure connections) needs at least one real selected
  // provider; without one, the honest destination is step 1.
  if (step >= 2 && providers.length === 0) {
    step = 1;
  }

  return { mode: modeConfig.id, step, providers };
}
