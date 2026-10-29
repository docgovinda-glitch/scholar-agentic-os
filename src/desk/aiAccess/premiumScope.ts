/**
 * Features that can run on Premium (Scholar Core's server-held keys).
 * Keep in sync with the server's runPremium* call sites
 * (server/routes/project.ts, project/core/manuscriptAndGateRoutes.ts,
 * server/routes/studio.ts) — see docs/AI-CALL-MAP.md. Everything else
 * runs on the user's own key or local AI.
 */
export const PREMIUM_FEATURES: readonly string[] = [
  "journal requirements extraction",
  "manuscript section generation",
  "coherence check",
  "peer review",
  "cover letter",
  "anonymisation",
  "Studio refine",
];

export const PREMIUM_SCOPE_SENTENCE = `Premium covers ${PREMIUM_FEATURES.slice(0, -1).join(", ")} and ${PREMIUM_FEATURES[PREMIUM_FEATURES.length - 1]}. Other workspaces use your own key or local AI.`;
