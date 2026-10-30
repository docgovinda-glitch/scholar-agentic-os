# AI call map (B1 g, input to B3 "One Brain")

Snapshot of `main` on 2026-10-29. Every model call ends in **one gateway**: `src/platform/gateway/gateway.ts` (`complete` / `stream` / `completeWithFailover` / `streamWithFailover`). Above it sit four entry layers with overlapping jobs.

## Layers

| Layer | File | Where credentials come from | Extra behaviour |
| :--- | :--- | :--- | :--- |
| Gateway | `src/platform/gateway/gateway.ts` | the `candidates` passed in | provider adapters, failover across candidates, Warden egress policy check |
| Server helpers | `server/utils/llm.ts`: `callOpenRouterJSON`, `callOpenRouterText`, `streamOpenRouterJSON` | `resolveRequestAiConfig` / `getCandidates`: **request headers only** (`x-ai-provider`, `x-ai-model`, `x-ai-api-key`, `x-ai-base-url`) | entitlement check, Warden consent, LLM challenge; with no credentials it answers **426 `requireFrontendLLM`** with the prompts so the browser runs them |
| Server "scholarBrain" | `server/src/services/scholarBrain.ts`: `complete`, `stream` | `extractTransientClientAiConfig`: the **same headers** (a near-duplicate of `resolveRequestAiConfig`) | scholarly voice prompt, `applyScholarGuardrails` (orthography, cliché stripping), JSON repair; throws when no credentials (no 426 path) |
| Browser runner | `src/desk/api/client.ts` `executeAgenticLLM` (+ `authedStreamFetch` 426 handling) | the user's device-local BYOK / local AI config | runs prompts the server returned with 426, or that a stage builds itself |
| Platform / Premium | `server/src/aiEngine/*` (`userRouter.assembleUserCandidates`, `adminRouter.resolvePremiumResources`, `credentialVault`, credit/quota engines, provider health) | admin-managed provider pools (`MASTER_KEY`-wrapped) | entitlement, credits, per-task limits, failover, usage ledger. Reached through the `runPremium*` functions in `server/routes/project/core/projectHelpers.ts` and `runPremiumRefine` in `server/routes/studio.ts` only |

The user's key reaches the server only on AI routes (`routeUsesClientAi`, #93).

## Call sites (server)

| Route file | Layers used |
| :--- | :--- |
| `server/routes/ai.ts` (Ask Scholar, search, deep research) | scholarBrain ×8 |
| `server/routes/drafting.ts` | llm `callOpenRouterText` ×2 |
| `project/agentic/evidenceRoutes.ts` (Journal stages 2–16) | llm `streamOpenRouterJSON` ×9 |
| `project/agentic/reviewRoutes.ts` (citation audit, originality, peer review, revision, final editor) | llm stream ×5, gateway ×3 |
| `project/agentic/draftingRoutes.ts` | llm stream/text ×4, gateway ×3, scholarBrain ×2 |
| `project/assignment/*Routes.ts` (Coursework) | llm JSON/text ×22, gateway ×10, scholarBrain ×13 |
| `project/thesis.ts`, `project/proposal.ts`, `project/presentation.ts` | scholarBrain ×7 / ×6 / ×5 |
| `server/src/research/deepResearchEngine.ts`, `aiEngine/opportunityAgent.ts` | gateway ×2 each |
| `server/routes/project.ts` (journal requirements extraction), `project/core/manuscriptAndGateRoutes.ts` (section generation, coherence, peer review, cover letter, anonymization), `server/routes/studio.ts` (`/api/studio/refine`) | **Premium** (`runPremium*`) or the user's key |

## Call sites (browser)

| File | Layer |
| :--- | :--- |
| Journal stages: `DefinitionStage`, `GapIdentificationStage`, `TitleSelectionStage`, `DraftStage`, `ProtocolBlueprintMode` | `executeAgenticLLM` |
| `ProjectListScreen.tsx` (prompt bar) | `executeAgenticLLM` ×4 |
| `assignment/services/sourceEvidenceExtractionService.ts` | `executeAgenticLLM` ×2 |
| `FinalEditorStage.tsx`, `services/aiDiagnostics.ts` | gateway directly |

## Inconsistencies to remove in B3

1. **Two header parsers** (`resolveRequestAiConfig`, `extractTransientClientAiConfig`) that must stay in sync.
2. **Two failure contracts:** llm helpers return 426 so the browser can run the prompt, while scholarBrain throws. Thesis, Proposal, Presentation and Ask Scholar therefore fail outright when the user's only AI is browser-local, where Journal stages would fall back to the browser. *Mostly addressed:* a deployed server no longer calls a local model (Ollama, LM Studio, …) at its own `localhost`. llm-helper routes hand the prompt to the browser (426). scholarBrain routes opt in with `browserFallback: true` (Thesis, Proposal, Presentation): they answer 426 with a challenge signed for the user and prompt hash, and verify the browser's answer on the retry (`readVerifiedBrowserResult`). Live evidence is cached per query for 20 minutes so the retried prompt is identical. Ask Scholar / search / deep research (`server/routes/ai.ts`) still return 400 `ai_local_model_unreachable`.
3. **Guardrails only on scholarBrain:** orthography, cliché stripping and JSON repair are not applied to llm-helper output.
4. **No usage ledger or credit accounting** on BYOK/local calls (only the Premium engine records usage). Whether BYOK calls should be metered is a product decision: P1, to confirm.
5. **Prompts are inline in route files.** There is no prompt/version registry.
6. **Premium covers only part of the product.** Premium (Scholar Core's server-held keys) works for the manuscript/gate pipeline and Studio refine. The staged workspaces (Coursework, Journal stages, Thesis, Proposal, Presentation, Ask Scholar) accept only the user's own key or browser AI. The AI Access copy "Premium uses Scholar Core's own keys, held server-side" is true for those features but should not imply every workspace. B4 must make the Premium scope visible in the UI.
7. ~~**Six near-identical `runPremium*` functions** (plus `runPremiumRefine`) repeat the entitlement → quota → resource loop → credit deduction sequence.~~ **Done:** all seven are thin wrappers over `server/src/ai/premium.ts` `runPremium`.

## B3 plan (one PR per step)

1. **Done (#95 and the Premium PR).** A single `resolveClientAiCandidates(req)` used by both llm.ts and scholarBrain, and a single `runPremium(userId, task, call)` replacing the seven `runPremium*` copies. **No behaviour change.**
2. One request/response contract in `server/src/ai/brain.ts` (`run({ task, workspace, projectId, input, stream })` → typed errors `no-provider` (426 with prompts), `quota-exceeded`, `consent-required`, `provider-error`, `timeout`). It wraps the gateway, Warden, guardrails, JSON repair and abort-on-disconnect.
3. Migrate route files one workspace at a time: Coursework, then Journal, Proposal, Thesis, Presentation, then Vault/discovery. Each migration is guarded by the E2E suite (#91) and its unit tests. Remove `callOpenRouter*` / `scholarBrain` when the last caller moves.
4. One client hook (`useBrain`) wrapping `authedStreamFetch` + the 426 → `executeAgenticLLM` path, with uniform loading/error/"connect an AI provider" states.
