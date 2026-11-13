---
name: single-brain-guardian
description: Pre-change checklist for the Single-Brain Architecture. Run before adding or modifying any AI feature, route, prompt, or workspace service.
---

# Single-Brain Guardian checklist

`server/src/services/scholarBrain.ts` is the only AI brain. Run these steps before and after any AI-related change.

1. **Does the logic belong in `scholarBrain.ts`?** Prompting, framework/theory selection, brief extraction, question parsing, outline generation, style rules and LLM calls all do. If a second workspace could use it, add it as a method on `scholarBrain` and share it. Do not copy it into a workspace.
2. **Zero direct `utils/llm` imports outside `scholarBrain.ts`.**
   ```bash
   grep -rnE "utils/llm" server src --include=*.ts --include=*.tsx | grep -v __tests__
   ```
   Only `server/src/services/scholarBrain.ts` may match. Routes import `callOpenRouterJSON`, `callOpenRouterText`, `streamOpenRouterJSON` and the helper functions from `scholarBrain.ts`.
3. **Zero hardcoded domain/template fallbacks in frontend services.** No `[RegExp, "Framework"]` tables, subject-to-theory lookups, or canned outlines presented as AI output in `src/desk/**` or `src/features/**`. Frameworks come from AI output or the user's own input.
4. **Run the lock:** `npx vitest run src/__tests__/singleBrainGuardian.test.ts`, then `npm run typecheck`.
5. If a check fails, move the logic into `scholarBrain.ts` rather than loosening the test.
