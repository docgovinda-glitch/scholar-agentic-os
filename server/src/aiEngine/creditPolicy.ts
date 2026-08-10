/**
 * Credit policy — Section 12/Priority 5. The formula that turns token usage
 * into Scholar credits, in one place and documented, per Priority 5's
 * instruction: "Where exact provider cost/token information is unavailable,
 * use the existing configured credit policy and clearly document the
 * calculation."
 *
 * No per-provider cost table exists yet (no admin UI for it was built in
 * this pass — see doc 50 §9's known gaps), so this is a single, flat,
 * token-weighted formula applied to every Premium provider alike. It is
 * intentionally simple rather than falsely precise: token *estimates*
 * (platform/gateway's own `estimateTokens`, chars/4) are already an
 * approximation, so a fine-grained per-provider-per-model cost table built
 * on top of an approximation would be more complexity without more
 * accuracy. Making this admin-configurable per plan/provider is real,
 * scoped future work, not silently done here.
 */

/**
 * 1 credit ≈ 750 "weighted" tokens. Output is weighted 3x input, matching
 * the rough shape of most providers' own per-token pricing (generation is
 * consistently the more expensive side of a completion call). Rounds up,
 * and a real model call always costs at least 1 credit — never free, so a
 * flood of trivially-short requests cannot bypass metering entirely.
 */
export function creditsForUsage(inputTokensEstimate: number, outputTokensEstimate: number): number {
  const weighted = inputTokensEstimate + outputTokensEstimate * 3;
  return Math.max(1, Math.ceil(weighted / 750));
}

/**
 * Conservative WORST-CASE estimate used only for the pre-call per-task-limit
 * check (server/routes/studio.ts), before any provider has been called and
 * before real output-token counts exist. Assumes output could run up to 2x
 * the input's length — generous on purpose, since the only cost of
 * over-estimating here is occasionally declining a request that would
 * actually have fit; under-estimating would let a request through that then
 * has nowhere to charge the real cost against. Never used to actually
 * charge credits — deductCredits() always charges the real, post-call
 * amount from creditsForUsage().
 */
export function estimateMaxCreditsForInput(inputText: string): number {
  const inputTokensEstimate = Math.ceil(inputText.length / 4);
  const worstCaseOutputTokensEstimate = inputTokensEstimate * 2;
  return creditsForUsage(inputTokensEstimate, worstCaseOutputTokensEstimate);
}
