# HANDOVER.md — Scholar Agentic Operating System Developer Handover

## RESUME HERE TOMORROW (as of 2026-07-30, codebase-wide fabrication audit — 6 real instances found and removed across 5 files — supersedes the section below)

**Follow-up to the Stage 5 fabrication fix below**: that fix (removing `handleAutoFillBlueprint`'s hardcoded fake-blueprint fallback) turned out to be one instance of a systemic pattern, not a one-off. Audited every component consuming `aiService.ts` for the same shape of bug — a "skip the real AI call" button that fabricates specific, invented content and presents it as genuinely generated or verified. Commit `c239889`.

**Found and removed 6 instances**, in increasing severity:
- `ResearchIntakeWizard.tsx` — 3 more instances in the same file (`handleSuggestObjectives`, `handleCheckRQs`, `handleRecommendMethodology`), same keyword-matched fake content pattern.
- `DataDiscoveryPanel.tsx` — fabricated fake **data sources** (invented archive names) labeled "Load Verified Offline Directories," feeding the same `status: "pending"` approval pipeline as genuinely-retrieved sources.
- `JournalDiscoveryPanel.tsx` — invented **bibliometric facts** (fake Scopus rankings, APC status, turnaround times) about real, specifically-named journals, labeled "Load Verified Springer Index" — included a leftover hardcoded personal name ("Matches Dr. Govinda's...") confirming this was dev/demo content that leaked into production. Also silently auto-selected a fake journal as `project.targetJournal`.
- `QualityControlSuite.tsx` — **the most severe**: `loadStandardQCReport` fabricated an always-passing peer-review report (96%/95%/98% scores, a false "zero plagiarism" claim, a false "ethics declarations exist" claim) labeled "Load Verified Editorial Audit Report." A student could trust this before submitting real work, believing a real integrity check had run.
- `SubmissionPackagingSuite.tsx` — hardcoded fake "Peer Reviewer Feedback Logs" about an unrelated topic, shown regardless of the real project's content; a false "verified"/"aligned" claim in a cover-letter template.

**Explicitly left alone** (already honest, not the same bug): `ComplianceChecklistPanel.tsx`, `GroundingMapDisplay.tsx`, `ManuscriptDraftingWorkspace.tsx` each have a similar "skip AI, load a standard template" button, but all three use openly generic placeholder text (no invented specific facts, several explicitly say "to be verified") and are honestly labeled — the differentiator from the 6 removed instances is inventing *specific, checkable false claims* vs. providing an honestly-generic starting template.

- `tsc --noEmit` clean (2 now-orphaned type imports removed), full suite 1075/1075 unchanged (no test had ever asserted on the removed fabricated behavior), `npm run build` clean. Live-verified in a real browser across Phase C/D/G — each fabricated button confirmed gone, console clean.

---

## RESUME HERE TOMORROW (as of 2026-07-30, Stage 9 + Stage 5 both closed out — superseded by the section above)

**Both stages closed via investigation-first, not blind rebuilding** — same discipline as the production-readiness pass below. Full detail in `docs/planning/target-workflow.md`'s Stage 5/Stage 9 sections.

**Stage 9 (drafting/humanize/AI-use disclosure)** — all 3 previously-documented gaps turned out to be already resolved or non-issues: the flagged dead `draftSectionStream` function no longer exists at all (removed in a forgotten session), the detection-evasion prompt language was already fixed (confirmed via its own passing regression test), and the title-only path's interaction with the disclosure gate is safe by inspection (`aiDisclosureService.ts` already defaults empty state gracefully). No source-code behavior changed, docs updated to stop claiming open gaps that don't exist. Commit `005e587`.

**Stage 5 (research input)** — the guided-path field-gating claim ("not verified end-to-end") checked out safe on inspection (every downstream consumer of the 4 conditionally-gated fields already defaults defensively). The title-only alternative path surfaced a **real, serious fabrication bug**: `handleAutoFillBlueprint` (the "Auto-Fill Blueprint" AI button) fell back to ~90 lines of hardcoded, keyword-matched fake blueprints when the real AI call failed — specific invented content presented as freshly generated, with fabricated confidence scores. Removed entirely; "Start With Title Only" now genuinely invokes the (fixed) auto-fill before proceeding, matching the spec's actual "agents populate the rest" requirement instead of being a pure skip button. Live-verified: typed a title, watched a real AI call attempt and fail honestly (no key configured), no fabricated content appeared, flow still proceeded. Commit `775f4ec`.

- `tsc --noEmit` clean, full suite 1075/1075 throughout both stages' work (up from 1074, net +1 test from the Stage 5 rewiring).

---

## RESUME HERE TOMORROW (as of 2026-07-30, production-readiness pass — security headers, dead-code removal, critical auth bug fixed, test coverage added — superseded by the section above)

**User asked for a broad autonomous production-readiness pass** ("resolve all outstanding issues... until no meaningful implementation gaps remain"). Given the realistic scope of that ask against a codebase this size, this session triaged and executed the highest-leverage, lowest-ambiguity items directly and via 2 background agents, rather than attempting to touch everything — see the final report given to the user for the honest completeness assessment. Concrete outcomes:

**Security**: `server.ts` had zero security-header middleware across 15 API routes despite already having real rate limiting (T006). Added `helmet` (`b953563`), with CSP explicitly disabled in dev only (Vite's HMR middleware-mode needs inline scripts/eval/websocket that a strict default CSP blocks) — full default policy including CSP applies in production.

**Critical bug found and fixed via test-writing, not by chance**: `src/utils/crypto.ts`'s `hashPassword()`/`verifyPassword()` (PBKDF2 branch) called `crypto.subtle.deriveKey(..., extractable=false, ...)` then immediately `crypto.subtle.exportKey("raw", key)` on that same non-extractable key — WebCrypto throws `InvalidAccessError` for that exact combination. Since these functions are used for real user passcode hashing in `src/auth/authContext.tsx`, **password-based signup/login was completely broken** in this environment before this fix. Found by a background agent while adding test coverage (not previously known/flagged), independently reproduced by the orchestrating session (reverted the fix, re-ran the new test, watched it fail with the exact error, then restored it) before merging — not taken on faith. Fixed minimally: `extractable` argument changed `false`→`true` in both call sites, matching the pattern already used correctly elsewhere in the same file.

**Dead code removed** (3 commits, each independently verified via full import-chain tracing, not just filename grep): `src/knowledge_vault/{index.ts,service.ts}` (a same-concept-different-file duplicate of the live `src/services/knowledgeVaultService.ts`), 7 files under `src/core/` (`manuscript/` pipeline unrelated to the live `agents/manuscriptWriter` chain, plus `eventBus.ts`/`config.ts`/`storage.ts`/`result.ts`/the barrel `index.ts`), and `src/auth/LoginScreen.tsx` (superseded by the live `UserProfileGate.tsx`, same pattern as every prior dead-component finding in this project's history).

**Explicitly NOT deleted, despite technically matching the "unimported + untested" dead-code signal**: `KnowledgeKernel.ts`/`WritingKernel.ts`/`PublicationKernel.ts`/`WorkspaceKernel.ts`/`CollaborationKernel.ts` (each imported only by its own barrel, zero tests) and `src/lifecycle/ResearchLifecycleEngine.ts`. `CLAUDE.md`'s own mission statement and §3 explicitly frame these as a deliberate architectural placeholder for this project's stated long-term vision ("AI-native operating system for research"), not abandoned scrap — deleting them would be a strategic product decision, not routine cleanup, so the dead-code agent was corrected mid-task to leave them alone. `src/ai/local/*` also left alone — zero live imports but exercised by its own `local-ai.test.ts`, so "unwired but tested," a different bucket from genuinely dead.

**Test coverage added** for 4 previously zero-coverage files (`src/utils/crypto.ts`, `src/services/aiService.ts`, `src/services/citationService.ts`, `src/services/knowledgeVaultService.ts`) — 123 new tests, focused on pure logic plus narrowly-mocked network boundaries (AI Gateway calls, `fetch`), not broad module mocking. Baseline went from 951 to 1074 passing, 0 failures.

**Investigated and confirmed NOT a gap**: the "Stage 8 `formattingRules` free-text parsing" item flagged in earlier sessions' gap-maps turns out to be a **deliberate, principled non-implementation** — `documentExportService.ts`'s own header comment explains that parsing free-text formatting rules via AI would risk the exact "invented from unstructured text" fabrication pattern this project has fought against elsewhere (the same discipline behind the real Crossref/OpenAlex/PubMed retrieval replacing simulated lookups, and the semantic-peer-review "do not attempt" list). `layoutOverrides` (the structured alternative) already exists and is already wired into `documentExportService.ts`, sourced only from known-good values (hardcoded journal templates or direct user input), never from free text. Not touched this session — re-scoping this would require a product decision on how strict an AI-extraction approach should be, not a routine engineering call.

**Bundle size**: confirmed `pdfmake`/`docx` are already dynamically imported and correctly code-split into their own chunks (visible as separate files in the build output) — the remaining oversized chunk is the core app bundle itself (1.45MB/361KB gzipped), which would need route/component-level `React.lazy` splitting across many components to reduce further. Not attempted this session — flagged as a legitimate but non-trivial future optimization, not a bug.

**Not audited this pass** (repo is large; triaged for highest leverage, not exhaustive): `src/ai/`, `src/orchestrator/`, `src/citation_compliance/`, `src/document_intelligence/` were confirmed live/reachable at the top level and spot-checked internally, but not exhaustively swept symbol-by-symbol for internal dead code. `src/document_intelligence/`, `src/citation_compliance/`, and most `src/services/*.ts` files still have partial or no direct unit tests beyond what this session added.

- `tsc --noEmit` clean, `npm run build` clean (same documented `import.meta`/CJS warning as always), full suite steady at 1074/1074 (up from the 949/951-then-951/951 baseline) throughout every commit this session.

---

## RESUME HERE TOMORROW (as of 2026-07-29, sci-fi v3 component sweep — ALL 30 components done, 5 global CSS bugs found and fixed — superseded by the section above)

**The "~28 never-touched components" leftover is now fully closed.** All 30 components in `src/components/` (every `.tsx` file except `ManuscriptPDFViewer.tsx`, which deliberately renders a white printed-paper preview and is correct as-is) are converted to the sci-fi v3 navy/luminous-blue system, plus `App.tsx` itself (never in scope for any prior pass). Full detail in the section directly below this one (9/21 progress snapshot, superseded by this line) — this entry records the close-out.

**3 more global CSS bugs found and fixed while live-verifying the final 12 files** (`eda5777`, plus a companion wordmark fix `bd1bfcd`), on top of the 2 already documented below — same failure class each time: an `!important` rule in `index.css` silently force-applying a light-theme color regardless of a component's own Tailwind class:
4. `button:disabled` forced a pale cream background app-wide — recolored to the navy-4/#94A3B8 disabled pair.
5. `button.border-white/10`/`button[class*="border-white/10"]` forced a light cream secondary-button look, hitting `CommandPalette.tsx`/`AppHeader.tsx` (pre-dating this redesign) and 3 files converted this session — recolored to navy-2/navy-4/#94A3B8.
6. `.hover-lift:hover`'s border was a gold tint applied to any card using the class (`ResearchIntelligenceDashboard.tsx`, `ActiveAgentsPanel.tsx`, `UserProfileGate.tsx`) — violated the "gold is CTA+wordmark only" rule. Swapped to luminous-blue.
- **`UserProfileGate.tsx`'s wordmark** used a navy-to-gold `.text-gradient` that faded to near-invisible at its start against the new navy card — replaced with the same white-"Scholar"+gold-"Agentic OS" pattern already used in `AppHeader.tsx`.
- **Removed now-dead CSS**: `.os-card`, `.glass-effect` (base + its ~100-line nested-override block), and `.text-gradient` — all confirmed zero-referenced by any component after the conversion sweep, via grep across every `.tsx` file. Consistent with this project's own dead-code-removal discipline (see "Dead-component audit" section further down this file).

**Second and third background-agent batches** (18 more files beyond the first batch's 8): `NonJournalRequirementsPanel.tsx`, `QCBasedRedraftingSuite.tsx`, `ComplianceChecklistPanel.tsx`, `QualityControlSuite.tsx`, `DataDiscoveryPanel.tsx`, `KnowledgeVaultEngineV2.tsx`, `ThesisReader.tsx`, `KnowledgeVaultManager.tsx`, `ProfileSettings.tsx`, `ResearchIntakeWizard.tsx`, `KnowledgeVaultWizard.tsx`, `UserProfileGate.tsx`. Unlike the first batch, these agents **did** do live-browser verification per file as instructed, and found their own real bugs along the way (missing worktree `.env` crashing `UserProfileGate` on load, a recurring `#1A365D`→`#E2E8F0` bulk-replace mistake landing on CTA backgrounds instead of text, several white form controls with no `bg-white` in their own JSX at all — only white via the global override, invisible to grep).

**Known, deliberately out-of-scope residue, not a bug**: `GroundingMapDisplay.tsx`/`JournalDiscoveryPanel.tsx`/`SubmissionPackagingSuite.tsx` still contain `bg-white/5`, `text-gray-300/400`, `bg-brand-*` etc. — this is a *different*, already-dark theme that pre-dates this redesign (translucent glass overlays on a dark backdrop), not a light-mode leftover; only their `.glass-effect` usage and a couple of genuinely-white form controls needed fixing, which the first batch did. Similarly `AISetupWizard.tsx`/`ResearchIntelligenceDashboard.tsx` (converted in earlier sessions) still use `font-serif` on some headings and `text-gray-400` instead of the `#94A3B8` token — cosmetic token-consistency debt, not a contrast bug (verified: `text-[#E2E8F0]` is still correctly applied alongside `font-serif`, gray-400 still reads fine on navy). Not touched this session — out of scope for "the ~28 never-touched components," since these two files were already touched.

- `tsc --noEmit` clean and full suite steady at 949/951 (same 2 pre-existing unrelated `supabaseClient.test.ts` failures) across every commit in this whole multi-agent effort. One test run showed a 3rd flaky failure in the same file, non-reproducible on immediate rerun — observed independently by both background agents and the main session, not a real regression.

---

## RESUME HERE TOMORROW (as of 2026-07-29, converting the ~28 never-touched components — 9/21 done, 2 severe global CSS bugs found and fixed — superseded by the section above)

**Follow-up to Step 5's "closed" declaration below**: the user asked to actually complete the ~28-component leftover named at Step 5's close. A background agent (isolated worktree) converted 8 of ~20 files, then I (main session) merged its branch, live-verified its work (a gap the agent itself flagged skipping), and found two severe pre-existing bugs while doing so — worth reading in full before continuing this list.

**Two global CSS bugs found and fixed, affecting every sci-fi-converted component in the app, not just this session's work** (`9351ef7`):
1. `h2, h3, h4, .font-display { color: #1A365D !important; }` in `index.css` — added during the sci-fi v2 token step with a code comment explicitly deferring the color to "the navy remap step," which never happened. An `!important` element-selector rule always beats a class-selector rule regardless of specificity, so this silently force-overrode **every** `<h2>/<h3>/<h4>` heading's color to old navy across the **entire app**, no matter what Tailwind class the heading itself carried — including every component converted in every prior sci-fi session. Measured: `#1A365D` against any `navy-0..4` surface is 1.14-1.65:1, nowhere near the 4.5:1 text floor. Every converted component's heading has been silently near-invisible dark-navy-on-dark-navy this whole time. Found via `getComputedStyle` showing `rgb(26,54,93)` on a heading whose own JSX explicitly set `#E2E8F0`. Fixed by removing just the `color` declaration (font-family/weight kept).
2. `.blueprint-canvas` (App.tsx's root `<div>`, wrapping literally every phase view A-I) still set the old light `#F8FAFC` page background + a light-tinted grid. Only 2 call sites in the whole codebase (App.tsx, OnboardingWizard.tsx — both now fully navy), so recoloring the shared class directly was safe, unlike `.os-card`/`.glass-effect` which several still-unconverted components genuinely depend on.

**`App.tsx` itself converted** (`37b1ac2`) — never in scope for any prior sci-fi pass. Its "Main Panel Content" wrapper div (`bg-white`/`#E5E7EB`) wraps every single phase-A-through-I component regardless of whether that component was already converted — this was the actual root cause of what live-verification first showed as "a white frame behind every phase view." Also converted: the phase-timeline sidebar + phase-dot states, the Publishing/Citation tab wrapper cards, the phase-gate warning banner, and the manuscript-PDF preview modal's chrome (its inner `ManuscriptPDFViewer` content stays deliberately light — real printed-paper preview, not app chrome, do not touch).

**8 of ~20 remaining components converted and live-verified**: `OutputFormatSelector.tsx` (`6360450`), `ErrorBoundary.tsx` (`b7ede01`), `AIDisclosureReviewModal.tsx` (`c94a101`), `OnboardingWizard.tsx` (`63875a0`), `GroundingMapDisplay.tsx` (`8ade590`, fixed `.glass-effect` white-card bug), `VedicDatabase.tsx` (`65e5b65`), `JournalDiscoveryPanel.tsx` (`257d0e4`, fixed `.glass-effect`), `SubmissionPackagingSuite.tsx` (`172b5a2`, fixed `.glass-effect` + a forced-white `<select>`/`<input type="date">` missing `border-0`/`bg-transparent`). All live-verified in a real browser this session (screenshots + console checks), confirming both the components' own conversions AND the two global fixes above work together correctly.

**Still not done — 12 files remain** (largest first, in case budget runs out again): `UserProfileGate.tsx` (1575 lines — confirmed still fully light-mode live, e.g. the login/signup form), `KnowledgeVaultWizard.tsx` (1450), `ResearchIntakeWizard.tsx` (1219), `ProfileSettings.tsx` (970), `KnowledgeVaultManager.tsx` (908 — confusing naming alert: `App.tsx` imports its `KnowledgeVaultManager` symbol from `./components/ThesisReader.tsx`, NOT from `KnowledgeVaultManager.tsx`; the real `KnowledgeVaultManager.tsx` file is imported by both `KnowledgeVaultWizard.tsx` (as `KnowledgeVaultManager`) and by `ThesisReader.tsx` itself (as `KnowledgeVaultManagerSuite`) — all three files are live, none are dead code, just verify which literal file you're editing by its actual path, not by the variable name a caller happens to import it as), `ThesisReader.tsx` (793, exported/consumed as `KnowledgeVaultManager` by `App.tsx` per the above — this is the file that renders when you navigate to the "Knowledge Vault" tab, alongside `VedicDatabase.tsx`), `KnowledgeVaultEngineV2.tsx` (650), `DataDiscoveryPanel.tsx` (608), `QualityControlSuite.tsx` (506, uses `.glass-effect`), `ComplianceChecklistPanel.tsx` (504, uses `.glass-effect`), `QCBasedRedraftingSuite.tsx` (446, uses `.glass-effect`), `NonJournalRequirementsPanel.tsx` (331). `ManuscriptPDFViewer.tsx` deliberately excluded — real printed-paper preview, correct as-is.

**Important note for whoever continues this**: do NOT re-touch `.os-card`/`.glass-effect` in `index.css` itself — only fix each file's own usage of those classNames, scoped to that file. Several of the 12 remaining files use `.glass-effect`. Also: **live-browser-verify every file this time** — the first background agent skipped this entirely for its 8 files ("due to time"), and it turned out two of the highest-impact bugs in this whole redesign (the global heading-color override, the App.tsx white wrapper) were only found because the main session did the live-verification pass the agent skipped. Do not repeat that gap.

- `tsc --noEmit` clean, full suite 949/951 throughout (same 2 pre-existing unrelated `supabaseClient.test.ts` failures) across all 11 commits this session (8 components + 2 global-bug fixes + App.tsx).

---

## RESUME HERE TOMORROW (as of 2026-07-29, sci-fi v3 — Steps 1-5 ALL DONE — superseded by the section above)

**Sci-fi v3 redesign (`docs/planning/sci-fi-redesign-scoping.md`) — Step 5 (final step) fully complete.** This session's first job was verifying and committing three components left uncommitted by a prior Cowork session that lacked test/browser tooling, then finishing the remaining Step 5 component restyling.

**Step 0 — verified and committed the inherited work** (all confirmed genuine fixes, not rubber-stamped):
- **`ResearchIntelligenceDashboard.tsx`** (`a71e326`) — fixed 2 real leftover light-mode bugs from the earlier "fully done" restyle claim (`446cb11`): a non-current project card still `bg-white`, and the AI Gateway/Active Models "checking"/"unchecked" status pills still light-mode.
- **`CommandPalette.tsx`** (`23da30a`) — migrated the stale `cyan-accent`/`-dim` references to `luminous-blue`/`-dim`; independently re-verified the inherited selected-item border fix (`/30`→`/70` opacity) via alpha-compositing math against the palette's real background — confirmed a genuine, already-fixed contrast failure (1.65:1 → 3.84:1).
- **`ai/AIModeCard.tsx`** (`6d2705d`) — full light→dark conversion, independently re-verified all 6 of the component's own claimed contrast values via the Python sRGB script (all matched exactly). **This became the reference template for every subsequent Step 5 component.**

**Step 1 — finished all 5 remaining Step 5 components**, each restyled onto the v3 navy/luminous-blue tokens using AIModeCard.tsx's exact verified token combinations, live-verified in a real browser, one commit each:
1. **`agents/ActiveAgentsPanel.tsx`** (`6835eac`) — smallest; found and fixed 2 missed gold-hex borders a blanket replace didn't catch, and proactively fixed a textarea hit by `index.css`'s global white-background override.
2. **`AISetupWizard.tsx`** (`cac54ab`) — 4 form fields hit by the same global-override bug (vault passphrase, API-key field with its show/hide toggle, endpoint field, model select), all fixed via the established border-0/bg-transparent + styled-wrapper-div pattern.
3. **`ManuscriptEditorWorkspace.tsx`** (`8938558`) — live-verified via a UserProfile-shaped `localStorage` seed (the phase-gated route isn't reachable without walking the full A→G1 workflow) — dual-pane focus mode, all 3 intelligence-drawer tabs, section edit textarea.
4. **`ManuscriptDraftingWorkspace.tsx`** (`8aea3f9`) — introduced the "colored card" panels (error/diff/scriptural-support/humanize/locked-banner) not present in the sibling file; reused the dashboard's existing translucent semantic-badge convention (`bg-{color}-500/10 text-{color}-400 border-{color}-500/30`) rather than inventing a new one.
5. **`AIControlCenter.tsx`** (`0d4d714`) — largest (1435 lines, 7 sub-tabs), ~20 individual white form fields fixed via the wrapper-div pattern. **Found a real structural bug invisible to grep**: the component's root wrapper still carried the legacy `os-card`/`.glass-effect` global CSS classes (`index.css` forces `background-color: #FFFFFF`/`rgba(255,255,255,0.88) !important` respectively), silently keeping the *entire* component on a white card regardless of how many inner Tailwind classes were converted — caught only by live browser verification. Fixed by replacing those two classes with the file's own navy-2/navy-4 treatment; `.os-card`/`.glass-effect` themselves were deliberately left untouched in `index.css` since 6 other still-unconverted components (`GroundingMapDisplay.tsx`, `ComplianceChecklistPanel.tsx`, `JournalDiscoveryPanel.tsx`, `SubmissionPackagingSuite.tsx`, `QCBasedRedraftingSuite.tsx`, `QualityControlSuite.tsx`) depend on the current light-mode definition and are out of scope.

- `tsc --noEmit` clean, full suite 949/951 throughout every commit (same 2 pre-existing unrelated `supabaseClient.test.ts` failures — zero regressions from any of the 8 pure-style commits this session), every component live-verified in a real browser (screenshots, console checked clean, real contrast computed via the Python sRGB/alpha-compositing script for every new color pairing rather than eyeballed or assumed from precedent).

**What's NOT done**: the ~28 components never touched by any sci-fi pass (including the 6 named above that still use `.os-card`/`.glass-effect` as-is) remain fully light-mode. Sci-fi v3's own 5-step sequence (`docs/planning/sci-fi-redesign-scoping.md`) is now complete as scoped — any further component conversions would be a new, separate piece of work, not a continuation of an open step.

**Updated gap map**: sci-fi v3 is now 5/5 steps fully done. Navigation overhaul (further below) remains fully closed.

---

## RESUME HERE TOMORROW (as of 2026-07-28, sci-fi v3 — Steps 1-4 ALL DONE — superseded by the section above)

**Sci-fi v3 redesign (`docs/planning/sci-fi-redesign-scoping.md`) — Steps 1-4 fully complete.** This session finished Step 4 by closing out the last 2 buildable panels and the full dashboard restyle:

5. **AI Gateway** (`d21784e`) — real current mode/provider/fallback state, reusing `AIGateway.healthCheckProvider()` — the exact same function `AIControlCenter.tsx`'s own status card already calls, not duplicated. Never an unconditional "ONLINE" — real live status only.
6. **Active Models** (`7ec9a33`) — lists only genuinely configured providers (current + real `fallbackOrder`), never a fixed list. The active provider's status *reuses* the AI Gateway panel's own check (test-verified: exactly one `healthCheckProvider` call total across both panels, no duplicate network request). Fallback providers are deliberately not auto-checked — shown honestly as "Untested," never guessed "Offline." Live-verified by adding a real fallback provider and confirming the dashboard updated on reload.
7. **Full dashboard navy restyle** (`446cb11`) — single commit, pure styling, confirmed via the full test suite passing unchanged. **Real contrast failures caught by computing against the new navy surface**: `blue-600` (3.47:1) and `indigo-600` (2.85:1) both genuinely failed 4.5:1 — fixed to `sky-400`/`indigo-300`. **A real bug caught by live verification**: the dashboard's two search/filter inputs stayed white after their className was updated, because `index.css`'s global `input[type="text"]` rule forces white with `!important`, exempted only by `.border-0`/`.bg-transparent` — fixed and re-verified live, including typing into the real field to confirm search still works. Gold demoted from general decorative icon color to *only* the dashboard's one genuine primary CTA ("New Project"), per the scoping doc's reversal #2.

- `tsc --noEmit` clean, full suite 949/951 throughout (same 2 pre-existing unrelated `supabaseClient.test.ts` failures — zero regressions from the pure style pass), every panel and the restyle live-verified in a real browser (console checked clean throughout).

**What's NOT done**: Step 5 (remaining component restyling — `CommandPalette.tsx`, `AIControlCenter.tsx`/`AISetupWizard.tsx` reworked onto navy tokens, and the ~28 components never touched by any sci-fi pass) remains genuinely open, explicitly lower-priority per the original sequence ("if budget remains"), not started.

**Updated gap map**: sci-fi v3 is now 4/5 steps fully done (Steps 1-4 complete and live-verified); only Step 5's optional remaining-component restyling is open. Navigation overhaul (further below) remains fully closed.

---

## RESUME HERE TOMORROW (as of 2026-07-28, sci-fi v3 Step 4 — 4/7 buildable panels done — superseded by the section above)

**Continuing sci-fi v3 (`docs/planning/sci-fi-redesign-scoping.md`) Step 4** — the 7 remaining buildable panels from `docs/planning/dashboard-mockup-honest-data-audit.md`, plus the full dashboard navy restyle. This session built 4 of the 7 panels, each test-first, live-verified, its own commit:

1. **AI Agents** (`0799fff`) — real, static `listAgents().length` (8 registered agent types, `src/services/agentService.ts`), never a fabricated "N Active" concurrency claim.
2. **Research Snapshot** (`507d47e`) — real per-scholar counters (Research Projects, Datasets, Citations cached, Journals selected) reframed from the mockup's platform-wide millions down to real small-scale counts. Also satisfies "Journal suggestions": the full discovered-journal shortlist isn't persisted anywhere (re-confirmed), so "Journals selected" (from the real, persisted `project.targetJournal`) is the honest substitute.
3. **Knowledge Vault** (`a692e7f`) — real summed vault-file bytes (B/KB/MB, never a fabricated TB figure), utilization ONLY via the real `navigator.storage.estimate()` browser API (first use in this codebase) — honestly "not available" when it doesn't resolve.
4. **Today's Research** (`aa8e691`) — real count of today's timestamped `usageLogs` entries, honestly 0 with no fabricated trend when there's no real activity.

**Still open**: AI Gateway/Kernel status and Active Models (both need live async health-check plumbing reused from `AIControlCenter.tsx`'s `AIGateway.healthCheckProvider` — more involved than the 4 panels above, not yet started), and the full navy/luminous-blue restyle of `ResearchIntelligenceDashboard.tsx`'s still-light surfaces (a separate, large uniform style pass, explicitly deferred until all 7 panels render correctly per the task's own sequencing). Stopped at this clean 4-panel boundary per this session's own instruction to pause after 3-4 panels rather than rush the rest.

- `tsc --noEmit` clean, full suite 940/942 throughout (same 2 pre-existing unrelated `supabaseClient.test.ts` failures), every panel live-verified in a real browser (screenshots, console checked clean, `navigator.storage.estimate()` confirmed genuinely resolving live, not mocked).

**Updated gap map**: sci-fi v3 Step 4 is 4/7 new panels done (plus the 2-fabrication bonus fix from the prior session). Steps 1-3 remain fully closed (unaffected). Navigation overhaul (further below) remains fully closed.

---

## RESUME HERE TOMORROW (as of 2026-07-28, sci-fi v3 direction reversal — Steps 1-3 done, Step 4 in progress — superseded by the section above)

**A new supplied mockup reversed the sci-fi redesign's direction again — see `docs/planning/sci-fi-redesign-scoping.md`'s v3 section.** Deep-navy space aesthetic, luminous blue as primary accent, gold reinstated but scoped narrowly to primary CTA + wordmark only, serif permitted in the wordmark only. v2's grey-surface scale and "no gold" rule are both cancelled — recorded as explicit reversals with rationale, not silently overwritten. `docs/planning/dashboard-mockup-honest-data-audit.md` classifies every panel in the new mockup as real/buildable/unbuildable before any of it got built.

**Steps 1-3 of the v3 implementation sequence are done, Step 4 is in progress:**

- **Step 1 (tokens)** — navy elevation scale (`--color-navy-0..4`, reusing the pre-sci-fi `--color-brand-500/900/950` lineage), `--color-luminous-blue`, `--color-gold-accent` (scoped to CTA/wordmark), `--color-border-luminous`. **Real bug caught by live verification, not the docs' own pre-implementation estimate**: the first version of `--color-border-luminous` reused `--color-luminous-blue-dim`, which the scoping doc's own visual estimate had called passing — but a real `getComputedStyle`-driven contrast check (run only after the tokens existed) showed it fails against `--color-navy-4` (2.85:1, below 3:1). Fixed by using the full (non-dim) blue instead (4.86:1 worst case). v2's grey/cyan tokens are NOT deleted — still consumed live by 8 other components, retired component-by-component as each is migrated, never a blind sweep.
- **Step 2 (global chrome)** — `AppHeader.tsx`/`AppFooter.tsx` reworked onto the navy tokens, with a real luminous border between elevation layers (navy's own luminance step there is only ~1.06:1, confirmed by Step 1's own live measurement — the border is what actually communicates elevation, not the surface color). Wordmark now splits "Scholar" (white/serif) + "Agentic OS" (gold) — the narrowed `.wordmark` CSS class replaces the old blanket `h1, .font-serif` rule, confirmed safe since all 3 real `<h1>` elements already carried their own explicit `.font-serif` className.
- **Step 3 (remove 5 unbuildable panels)** — confirmed via exhaustive grep and a direct read of `App.tsx` that none of the five (SYSTEM STATUS hardware panel, COLLABORATORS, RUNNING AGENTS, PROMPT STUDIO/MARKETPLACE nav) exist anywhere in the live app — they're mockup-only, never built. Nothing to remove; recorded honestly rather than fabricating a deletion commit.
- **Step 4 (rebuild 8 buildable panels), in progress** — while reading `ResearchIntelligenceDashboard.tsx` to plan the rebuild, **found and fixed two real, currently-shipping fabrications not named in the mockup audit** (they predate the new mockup entirely): hardcoded fake "Scholar Alerts" notifications and a hardcoded fake "Cached Vault Citations" list, both shown unconditionally regardless of real project state. Fixed test-first with real derived data (vault-file processing errors, real recent activity, real `citationMetadata` formatted via the already-shipped `generateCitation()` service). **Still open**: the mockup's own new panels (AI Gateway/Kernel status, Active Models, AI Agents count, Knowledge Vault size, storage utilization, per-scholar Journals/Citations/Datasets counters, journal suggestions) and the navy/luminous-blue restyle of this component's still-light surfaces.
- `tsc --noEmit` clean, full suite 929/931 throughout (same 2 pre-existing unrelated `supabaseClient.test.ts` failures), every step live-verified in a real browser (screenshots, real in-browser contrast computation via `getComputedStyle`, console checked clean).

**What's NOT done**: the bulk of Step 4 (new mockup panels, dashboard restyle) and all of Step 5 (remaining component restyling). Stopped at this clean, fully-verified boundary rather than rushing the remaining large scope.

**Updated gap map**: sci-fi v3 direction is 3/5 steps done, Step 4 genuinely started (not just planned) with one real bonus fix landed. Navigation overhaul (previous section, still fully closed) is unaffected by this work.

---

## RESUME HERE TOMORROW (as of 2026-07-28, navigation overhaul fully done — both phases — superseded by the section above)

**Navigation overhaul (`docs/planning/navigation-scoping.md`) — 🟢 both phases done.** This session closed out everything Phase 1 had left open.

**Task 1 — closed the recorded deep-link gate-message gap.** Root cause found by writing a failing test first, not assumed: `user` is `null` on the very first render of every fresh page load (before `AuthProvider`'s mount effect hydrates from `localStorage`) — the old `if (!user) { wipe the hash }` guard fired on that render, destroying any deep link before authentication ever resolved. Fixed by only wiping the hash on an actual logout (tracked via a ref), never on the initial not-yet-hydrated state. Live-verified: `#workspace/workspace/D` now shows the real "Complete X first" message on page load, not just a silent fallback.

**Task 2 — Navigation Phase 2 (AI setup wizard per-mode step deep-linking) — built.** New pure resolver `src/utils/aiSetupWizardRouting.ts` (14 tests) decides what a hash segment triple (mode/step/providers) honestly resolves to — unknown mode → mode-selection, providers filtered to only what's real for that specific mode, step clamped to `[0,2]` (**never** deep-links straight to the completion screen, since it has no real validation data). New hash sub-route `#onboarding/ai-setup/<mode>/<step>/<providers>`.

- The concern raised when Phase 2 was scoped — that `selectedProviders` "can't be reconstructed from a URL" — turned out solvable: a comma-joined list in the hash works fine.
- **Non-negotiable security property, regression-tested**: the vault gate (`isVaultUnlocked()`) is structurally independent of the hash-restore path. The resolver's output can never carry a vault-unlocked flag (asserted by test), and a genuine deep link straight to a key-requiring step still renders the real unlock prompt — verified by both a component test and live in a real browser.
- **Two real bugs caught by failing tests, not assumed**: (1) `useHashNavigation.ts`'s onboarding-step parsing did an exact-string match against the whole hash tail, breaking the moment wizard sub-segments were appended — fixed to compare only the first segment. (2) The wizard's own hash parser only recognized the trailing-slash `"#onboarding/ai-setup/..."` shape; the *bare* `"#onboarding/ai-setup"` hash a real browser-back produces didn't match, silently leaving the wizard stuck — found via a failing back/forward test.
- `tsc --noEmit` clean, full suite 925/927 (same 2 pre-existing unrelated `supabaseClient.test.ts` failures). Live-verified end-to-end across Cloud AI Providers, Local AI, OmniRoute/Smart Gateway, and BYOK: forward flow, browser back/forward, deep links (including the vault-gate one), keyboard-only activation with focus verified via `document.activeElement`, console checked at every step.

**What's NOT done**: nothing from the navigation scoping doc remains open — both phases and the recorded gap are closed. Sci-fi v2 redesign steps 3-5 (navy remap, gold remap, remaining components) remain untouched — out of scope for this session by explicit instruction, still queued for a future session.

**Updated gap map**: navigation overhaul is fully closed, genuinely verified. Sci-fi v2 redesign remains at 2/6 steps (unchanged, not touched this session).

---

## RESUME HERE TOMORROW (as of 2026-07-28, dead-component audit done + navigation overhaul Phase 1 done — superseded by the section above)

**Task 1 (dead-component audit) — 🟢 done.** Full findings in the "Dead-component audit" section directly below this one (kept as its own section since it's a standing reference, not a dated status update). Five confirmed-unreachable code paths deleted (`ExpertCitationEngine.tsx`, `TabContentView.tsx`, `PdfPreviewModal.tsx`, `WorkspacePhaseView.tsx`, and a ~470-line dead `SettingsTabContent` function inline in `App.tsx`) — none needed wiring in, all were genuinely superseded by App.tsx's own more-evolved live implementations. `tsc --noEmit` clean, full suite 869/871 (same 2 pre-existing unrelated failures), live-verified in a real browser.

**Task 2 (navigation overhaul) — 🟡 Phase 1 of 2 done.** Full record in `docs/planning/navigation-scoping.md`. **A sixth dead-code instance was found while scoping this task**: `src/hooks/useHashNavigation.ts` had zero live imports — `App.tsx` had its own diverged inline copy of the exact same hash-sync logic. Fixed and wired in rather than left dead.

- Extended the hash scheme to cover the phase workflow (`#workspace/workspace/<phaseId>`) and settings sub-tabs (`#workspace/settings/<subTab>`) — both previously invisible to the URL, meaning no deep links and no meaningful browser back/forward for either.
- Added an honest invalid-transition guard for the phase workflow (`project.furthestPhase` + `src/utils/phaseGating.ts`'s `canEnterPhase`) — jumping ahead of what's been reached shows a real inline message naming the phase to complete first, never a silent redirect.
- Added focus management (`useFocusOnNavigate.ts`) so focus lands on the destination heading/container on every hash-driven navigation, never lost to `<body>` — verified against the real accessibility tree.
- Found and fixed a **second unfixed copy of the stale-closure race** the app-wide fix was supposed to have closed: `OnboardingWizard.tsx` had its own separate, inline `updateProject` that never got the `useProjectPersistence.ts` `projectRef` fix. Migrated onto the shared hook.
- **A real infinite-render-loop bug was introduced and caught live during this session's own implementation** (inline arrow-function wrappers as unstable effect-dependency references, compounded by `handlePhaseChange` calling `updateProject` even for a same-phase no-op) — confirmed via the browser's own `Maximum update depth exceeded` console error, not inferred from code. Fixed with `useCallback` + an explicit no-op guard. Worth remembering: **always check the browser console during live verification**, not just screenshots — this bug produced a visually-normal-looking screenshot the first time.
- **Known, recorded gap, not silently omitted**: the phase-gate message doesn't display on the deep-link-overreach path specifically (it does on the equivalent in-app click) — the fallback itself is still honest (renders the nearest valid phase, never broken), only the explanation text is missing there. `navigation-scoping.md` progress log, item 7.
- `tsc --noEmit` clean, full suite 895/897 (same 2 pre-existing unrelated `supabaseClient.test.ts` failures — zero new regressions). Live-verified end-to-end: forward/backward through the phase workflow, browser back/forward, two deep links (settings sub-tab and an over-reaching phase), keyboard-driven sub-tab switch with focus verified via `document.activeElement`.

**What's NOT done**: Phase 2 (AI setup wizard per-mode step deep-linking, `AISetupWizard.tsx`'s internal `step`/`selectedMode`/`selectedProviders`) — scoped in `navigation-scoping.md`, not started, a comparable amount of work to everything above and deliberately left for its own session. Steps 3-5 of the sci-fi v2 redesign (navy remap, gold remap, remaining components) also remain untouched — this session's instruction was explicitly to do the audit + navigation only, not resume the redesign.

**Updated gap map**: dead-component audit is closed. Navigation is 1 of 2 phases done, genuinely verified, not assumed. Sci-fi v2 redesign remains at 2/6 steps (unchanged from before this session — out of this session's scope by explicit instruction).

---

## Dead-component audit (2026-07-28) — read this before touching any component, so this stops recurring

The "redesigned/extracted component nobody actually renders" bug has now
been found **three times** across two sessions: `ActiveAgentsPanel`
(earlier sci-fi session), `AppHeader.tsx`/`AppFooter.tsx` (sci-fi v2 Step
2), and a from-scratch audit this session found two more classes of it —
five total dead code paths, all deleted, none left in limbo:

- `src/components/ExpertCitationEngine.tsx` — zero references anywhere.
  Citation Center's real, live tab renders `DataDiscoveryPanel` +
  `ComplianceChecklistPanel` instead. **Deleted** (genuinely superseded,
  not a withheld implementation).
- `src/components/layout/TabContentView.tsx` — zero live imports. `App.tsx`
  has its own, more-evolved inline tab-content JSX. **Deleted**.
- `src/components/pdf/PdfPreviewModal.tsx` — zero live imports. `App.tsx`
  renders `ManuscriptPDFViewer` directly via its own inline
  `isPdfModalOpen`-gated JSX. **Deleted**.
- `src/components/workspace/WorkspacePhaseView.tsx` — zero live imports,
  same pattern as `TabContentView.tsx`. `App.tsx`'s own inline
  `WORKFLOW_PHASES`-driven phase view (phases A-F) is what's live.
  **Deleted**.
- `SettingsTabContent` — a ~470-line function component defined **inline
  inside `App.tsx` itself** (not a separate file), never once referenced
  as JSX. A new finding, distinct from the other four: a dead-on-arrival
  definition sitting right next to the Settings tab's real implementation
  (`AIControlCenter`), not an unwired extraction attempt. **Deleted**.

**The pattern to watch for going forward**: this codebase has repeatedly
accumulated components/functions that were written, sometimes styled or
even redesigned, and never actually wired into the render tree App.tsx
walks. Before assuming any component is live — especially before spending
redesign effort on one — grep for its live imports AND confirm the actual
JSX render call, not just the import line (an import can exist in a file
that's itself dead, as `TabContentView.tsx`'s import of `AIControlCenter`
demonstrated). `tsc --noEmit` will NOT catch any of this — unused
imports/functions aren't a TypeScript error in this project's config, so
these five sat there clean through every previous `tsc` check across
multiple sessions.

---

## RESUME HERE TOMORROW (as of 2026-07-28, sci-fi redesign v2 — Steps 1-2 of 6 done, loop paused before Navigation — supersedes the section below)

**Sci-fi redesign v2 execution (`docs/planning/sci-fi-redesign-scoping.md`'s revised direction) — 🟡 in progress, Steps 1-2 done of 6, loop deliberately paused before Step 2.5 (Navigation).** Full step-by-step record in the scoping doc's own new "Progress log (v2 execution)" section. This session ran the doc's ordered sequence as a loop (implement → `tsc --noEmit` + full suite → live-verify in a real browser → commit → tick off → next step), per this session's explicit instruction, stopping cleanly after Step 2 rather than rushing the Navigation overhaul (Step 2.5) without the verification rigor it needs — not a failure, a scope/time boundary.

- **Step 1 (tokens)**: added `--color-surface-0..3` layered-grey scale, `--color-border-subtle`, `--color-warning-accent`/`--color-error-accent` semantic states, `--motion-duration-*`/`--motion-ease`, swapped `--font-display` to Rajdhani. **Real bug caught live**: Tailwind v4's `@theme` block silently drops unrecognized-namespace custom properties — `--motion-*` resolved to empty string until moved outside `@theme` into a plain `:root` block. Also fixed the `h2/h3/h4/.font-display` rule, previously hardcoded to `var(--font-sans)` so `--font-display` had never actually done anything.
- **Step 2 (global chrome)**: **found a second dead-code bug, same class as the previously-documented `ActiveAgentsPanel` one** — `AppHeader.tsx`/`AppFooter.tsx` (the dark/cyan chrome from the prior sci-fi session) had zero live imports anywhere; `App.tsx` rendered its own diverged inline `<header>`/`<footer>` instead, so the entire "global chrome" redesign had no visible effect for real users until this session wired it in. Confirmed full behavioral parity before swapping (nothing dropped), migrated `.chrome-dark`/`.chrome-dark-subtle` onto the new surface tokens, removed 7 now-dead icon imports.
- **Worth checking early in the next session**: given two components in a row turned out to be unwired dead code, grep for live imports of `CommandPalette.tsx`, `AIControlCenter.tsx`, `AISetupWizard.tsx`, `ResearchIntelligenceDashboard.tsx` before assuming Step 5's starting point is genuinely live.
- `tsc --noEmit` clean, full suite 869/871 throughout both steps (same 2 pre-existing unrelated `supabaseClient.test.ts` failures — zero new regressions), each step live-verified in a real browser (screenshots, computed-style contrast checks, keyboard-focus checks) and committed separately (`59702c8`, `cde1e06`).

**What's NOT done, explicitly**: Step 2.5 (Navigation — real browser-history entries per screen, deep-link resolution, state-loss regression tests for the `useProjectPersistence.ts` stale-closure failure class under rapid back/forward, honest invalid-transition guards, full keyboard/focus verification across the phase workflow/AI setup wizard/settings sub-tabs), Step 3 (navy remap, 632 occurrences/29 files), Step 4 (gold remap), and Step 5 (CommandPalette → ActiveAgentsPanel → ResearchIntelligenceDashboard → remaining components). Each is its own step in the scoping doc's progress log, none started.

**Updated gap map**: sci-fi v2 is 2/6 steps done and genuinely verified; the remaining 4 steps (Navigation, navy remap, gold remap, component sweep) are real, scoped, open work — not started, not assumed done.

---

## RESUME HERE TOMORROW (as of 2026-07-28, Option 1 corrected: Pollinations → OmniRoute — superseded by the section above)

**Follow-up correction — 🟢 done, Tasks 1-5 all complete.** Full record in `docs/planning/ai-modes-reconciliation.md`'s new "Follow-up correction" section. The AI modes redesign below (Steps 0-8) shipped Option 1 ("Smart AI") backed by Pollinations, which turned out to only simulate success in some paths rather than reliably deliver — it was removed, not patched. Option 1 is now **OmniRoute ("Smart Gateway")**: a self-hosted local router (`npm install -g omniroute`) that itself proxies to real cloud providers with automatic fallback. Important distinction from the old copy: this is explicitly **not** zero-install — it needs `~5 min setup, one-time`, and its `howItWorks` copy states plainly that inference happens in the cloud (only the routing step is local). Any future reference to "Smart AI" or "Pollinations" in this codebase is stale.

- **`AIModeId`** is now `"omniroute" | "cloud" | "local" | "byok" | "partner"` (was `"smart" | ...`) — check this before assuming old code samples/tests referencing `"smart"` still apply.
- **Recommendation banner re-resolved**: no longer points at Option 1 (that only made sense when it was zero-setup). Now recommends **Cloud AI Providers** as the default starting point, with **Bring Your Own AI** as the alternative for users who already pay for a provider — the "RECOMMENDED FOR REGULAR USE" badge moved to the Cloud AI Providers card.
- **Jargon-banned-word list** (`aiModes.test.ts`) had `inference` deliberately removed — banning it would recreate the vagueness this correction exists to fix, since OmniRoute's copy must honestly say inference happens in the cloud. `router` stayed banned (OmniRoute copy says "gateway" instead).
- **Live-verified in a real browser**: OmniRoute was deliberately not installed in this shared sandbox (739MB unpacked, same judgment call as Step 0 below) — instead verified the full UI flow against a genuinely absent local instance (real `OFFLINE` results with different latencies each check, a direct in-browser `fetch` independently corroborating connection failure) and confirmed Options 2-5 (Cloud AI Providers, Local AI, Bring Your Own AI, Partner Subscription) still render/select/gate correctly, including a true-positive "Detected running" badge against this sandbox's own real, pre-existing Ollama instance.
- `tsc --noEmit` clean, full suite 869/871 (same 2 pre-existing unrelated `supabaseClient.test.ts` failures as every session before this one — zero new regressions).

**Updated gap map**: this correction is closed out as complete. Nothing from Tasks 1-5 is left open.

---

## RESUME HERE TOMORROW (as of 2026-07-28, AI modes IA/UX redesign complete — superseded by the section above; "Smart AI"/Pollinations references below are historical, since replaced by OmniRoute above)

**AI Setup/Settings redesign around 5 user-facing AI Modes — 🟢 done, Steps 0-8 all complete.** Full step-by-step record in `docs/planning/ai-modes-reconciliation.md`. This was an information-architecture redesign of `AISetupWizard.tsx` (onboarding) and `AIControlCenter.tsx` (settings), not a visual refresh — users are now asked "How would you like your AI assistant to work?" and choose among 5 plain-language modes (Smart AI, Cloud AI Providers, Local AI, Bring Your Own AI, Partner Subscription), never an implementation detail. Every step: real live verification (not code-read-only), `tsc --noEmit` + full suite clean throughout (baseline: 864/866, same 2 pre-existing unrelated `supabaseClient.test.ts` failures — zero new regressions across 9 commits), one commit per step.

- **Step 0 (blocking pre-flight verification)** confirmed Pollinations is genuinely keyless/CORS-open (real curl + browser-preflight check) and OmniRoute needs no CORS workaround (verified from its actual shipped npm source, not docs) — both real findings that shaped the build, not assumptions. Mapped all 5 modes onto `ai-gateway.md`'s existing 5-tier model.
- **`src/config/aiModes.ts`** is now the single source of truth for the 5 modes (title, badge, features, difficulty, real provider-dashboard links, real per-backend install guidance, coming-soon handling) — a jargon test fails the build if internal framing ("Tier N", "backend", "endpoint") ever leaks into user-facing copy.
- **3 new provider adapters** (Pollinations, Groq, Together AI) plus a 4th (OpenRouter) added mid-sequence once Step 3's exact Cloud-AI-Providers list didn't match the initial split — `src/services/aiGateway.ts` + matching `server.ts` routes.
- **`src/components/ai/AIModeCard.tsx`** is the one shared card both surfaces consume. Its initial `role="button"` wrapping nested interactive children was a real ARIA violation, caught by an actual accessibility-tree snapshot during the Step 7 a11y pass (not assumed) — fixed to a plain labelled container with the CTA button as the real keyboard control.
- **`AIControlCenter.tsx`** restructured to 7 settings tabs (AI Mode / Current Status / Providers / Local Models / API Keys / Advanced / Diagnostics) — no working functionality deleted, the old Analytics/Provider-Matrix content moved into Diagnostics/Advanced. Local Models and API Keys are genuinely new (multi-backend real detection; masked, vault-gated key management). Diagnostics reads only real tracked telemetry — honest "None configured"/"No requests recorded yet" states where genuinely empty, never a fabricated placeholder.
- **Vault-gate preservation** (the pre-existing "Unlock Your Key Vault" gate) is now regression-tested with `it.each` parametrized over every real `(mode, provider)` pair in the config — a future provider is covered automatically, no hand-written test needed per provider.
- A real, live-verification-driven finding worth knowing: a genuine Cloudflare Turnstile 403 appeared when testing Smart AI with the automation tool — traced to the tool's own `HeadlessChrome` User-Agent (a standard bot signal) via a controlled curl comparison, not a real limitation for actual end users. Recorded rather than either ignored or over-reacted to.

**Updated gap map**: the AI modes redesign is closed out as complete. Nothing from this task is left open.

---

## RESUME HERE TOMORROW (as of 2026-07-28, sci-fi redesign implemented — superseded by the section above)

**Redesign executed, `docs/planning/sci-fi-redesign-scoping.md`'s full step sequence — 🟢 done.** Full step-by-step record in `docs/planning/sci-fi-redesign-progress.md`. Every step: characterization tests before the change, `tsc --noEmit` clean, full suite clean (baseline throughout: 797/799, same 2 pre-existing unrelated `supabaseClient.test.ts` failures — no regressions introduced by any step), live-verified in a real browser via `agent-browser` (screenshots, real Tab-key `:focus-visible` checks, emulated `prefers-reduced-motion` checks), one commit per step.

- **New token**: `--color-cyan-accent` (`#22D3EE`, verified 10.55:1 contrast on `--color-brand-900`) for system/AI/machine state, kept distinct from the existing gold accent (citations/scholarship). `--color-cyan-accent-dim` (`#0E7490`) added for text/icon use against light backgrounds.
- **Global chrome** (`src/index.css` + `AppHeader.tsx`/`AppFooter.tsx`): header/footer moved to the dark `brand-900` surface via a new `.chrome-dark` utility, scoped to global chrome only — the rest of the app intentionally stays on its existing light surface (see below). Built this codebase's first-ever `:focus-visible` rule and `prefers-reduced-motion` handling (neither existed anywhere before this).
- **CommandPalette.tsx**: dark surface, cyan selected-command state, `useReducedMotion` wired (CSS media queries don't reach `motion`'s WAAPI-driven transforms — this needed the JS hook).
- **ActiveAgentsPanel.tsx**: cyan pulse for agent "Online"/selected status. **Also fixed a real pre-existing bug this step's live-verification caught**: `App.tsx` had a byte-identical inline duplicate of this component (the one actually rendered, via `App.tsx:665`), while the extracted file this doc names was dead code only reachable through `TabContentView.tsx` — itself never imported anywhere. Deleted the duplicate, wired `App.tsx` to import the extracted (now-redesigned) component. **Worth a broader dead-code sweep** before assuming any other `TabContentView.tsx`-adjacent file is live.
- **AIControlCenter.tsx / AISetupWizard.tsx**: cyan for AI/system connectivity signals (Ollama online/offline, active provider badge, selected-provider highlighting, connection health badges, internal step tracker). An early attempt at converting the whole container to the dark surface was reverted after realizing it would leave ~900 lines of light-theme-assuming inner text illegible — kept the incremental-adoption pattern instead (cyan accents on a still-light surface), consistent with the other four components.
- **ResearchIntelligenceDashboard.tsx**: cyan for the per-project "AI: PROVIDER" label, AI Call Counts icon, and Engine Dispatch Frequency bar chart — verified live against a real usage log, not a mock.
- **`#1A365D` navy replacement — deliberately NOT a mechanical 632-occurrence pass.** Sampled usage across all 25 remaining files: the overwhelming majority is either the app's standard heading/body text color on light backgrounds or generic primary-CTA button styling — neither is a "system/AI state" signal, and recoloring either would break contrast or misapply the accent's meaning. Classified and changed only the two genuine matches (the `isActive` drawer-tab nav in `ManuscriptDraftingWorkspace.tsx`/`ManuscriptEditorWorkspace.tsx`'s Focus Mode). Two other candidates were considered and deliberately left alone (`ThesisReader.tsx`'s citation-format toggle — gold's domain; `UserProfileGate.tsx`'s login/signup switch — not an AI/system signal). **The remaining ~630 navy occurrences are correctly navy** and out of scope for this redesign — this was a real, load-bearing scoping decision, not deferred work.
- **Everything else** (29 non-test components not named above): intentionally untouched. Per the scoping doc's own closing guidance, these adopt the new system incrementally as touched by other work, not as a batch migration — this is the doc's Step 7 by definition, not a task that gets "finished."

**Updated gap map**: the sci-fi redesign is closed out as complete against its own scoping doc. Nothing about the redesign is left as an open task — the incremental adoption of untouched components is ongoing practice, not a tracked TODO.

---

## RESUME HERE TOMORROW (as of 2026-07-27, sci-fi redesign scoped — superseded by the section above)

**Scoped, not started** — `docs/planning/sci-fi-redesign-scoping.md`. Re-verified (not just trusted) the existing 2026-07-20 design proposal (`docs/planning/2026-07-20-session-notes.md` §1) against current code, since a lot changed in between:

- Direction still sound ("Ancient Knowledge, Future Interface" — dark-first palette, new phosphor-cyan accent for system/AI state kept distinct from the existing gold accent reserved for scholarship/citations, serif for manuscript content vs. mono for chrome, state-driven motion only). Theme tokens for the serif/mono fonts and a brand-900/950 dark scale already exist in `src/index.css` — unused as a real surface color today, just present inside `.glass-effect` dark selectors.
- **Corrected one stale claim**: the original proposal said `font-mono` was "unused for chrome" — it's actually used 861 times across current `.tsx` files, just not with a deliberate content-vs-chrome distinction yet.
- **Quantified the real scale before estimating anything**: this session's `#8C887F`/`#C08A3E` contrast fix (25 files, 207 occurrences) was the *easy* end of a palette change. The other brand color, `#1A365D` navy, alone is 632 occurrences across 29 files — 2.5–3x that. Several other hardcoded neutrals/borders (`#E5E7EB`, `#E2E8F0`, `#D1CEC7`, etc., 50-200 occurrences each) aren't yet classified text-vs-decorative the way this session did for gold/neutral.
- A11y debt is real but improved: real `aria-*`/`role`/`tabIndex` usage is now 6 of 34 non-test components (up from the original proposal's near-zero), still under 20% coverage. **No `:focus-visible` style and no `prefers-reduced-motion` handling exist anywhere** — both must be built into this redesign from day one, not retrofitted, since glow/pulse effects make both gaps worse by default.
- Reproduced the original proposal's ordered, impact-to-risk-ranked component list (re-verified current line counts): `index.css`+`AppHeader`/`AppFooter` → `CommandPalette.tsx` → `ActiveAgentsPanel.tsx` → `AIControlCenter.tsx`/`AISetupWizard.tsx` → `ResearchIntelligenceDashboard.tsx`, everything else adopted incrementally as touched rather than as a batch migration.

**Updated gap map**: this is now the one item left on the project, and it's scoped (not just flagged) for the first time. No color values are finalized and no component has been touched — that's deliberate, per this project's own standing discipline of scoping before touching a systemic change.

---

## RESUME HERE TOMORROW (as of 2026-07-24 [latest+1], #8C887F/#C08A3E contrast fix)

**Contrast fix — 🟢 done** (`8ac63e9`), following `docs/planning/color-contrast-scoping.md`'s step sequence exactly rather than a global find/replace. Classified every occurrence mechanically (lowercase HTML tag = real text, needs fixing; PascalCase component = lucide-react icon coloring an SVG stroke, not text — left alone; `border-[#...]`/`bg-[#...]` also left alone). Computed real replacement shades preserving hue/saturation, reducing lightness until 4.5:1 clears against every background actually used in the app (not just white): `#8C887F` → `#76726A`, `#C08A3E` → `#946A30`. Applied to 207 real text occurrences across 25 files; left ~100 icon/border/background occurrences on the original brand hex untouched. `ComplianceChecklistPanel.tsx`'s dark-theme surface (flagged as needing separate checking) confirmed to never use either hex at all — nothing there needed touching. tsc clean, full suite 770/772 unchanged (same 2 pre-existing unrelated failures). Live-verified with real `getComputedStyle` checks against the actual rendered page background (not a static code check): both fixed colors render correctly and clear 4.5:1 against the real page background (4.58:1 and 4.60:1 respectively).

**Updated gap map**: production-readiness is now **fully closed** — every item from the original audit is either done or was never actually in scope. The sci-fi UI redesign is the only work remaining on this project, and it hasn't been scoped yet.

---

## RESUME HERE TOMORROW (as of 2026-07-24 [latest], bundle code-splitting)

**Bundle code-splitting — 🟢 done** (`d05eca9`). The one item scoped-not-fixed in the prior session (`docs/planning/color-contrast-scoping.md`'s companion note on bundle size, referenced from item 3 below). Converted `docx`/`pdfmake`/its standard-font containers in `documentExportService.ts` from static top-level imports to dynamic `import()` inside `exportToDocx`/`exportToPdf` only (`buildExportDocumentModel`, the pure model builder, needs neither library). Confirmed `xlsx` — also flagged — is a dependency but never actually imported anywhere; nothing to fix there. Real, measured result: main bundle **3,255.65 kB (915.69 kB gzip) → 1,346.98 kB (350.18 kB gzip)** — pdfmake (1,010.76 kB) and the two font containers (540 kB combined) now load as separate on-demand chunks. All 20 existing `documentExportService.test.ts` tests pass unchanged (`vi.mock()` intercepts dynamic imports the same as static ones). Live-verified against the actual production build (`vite preview` serving `dist/`, not the dev server) — a real project's Download .DOCX and Download .PDF both completed with no error, confirming the lazily-loaded chunks genuinely work.

**Updated gap map**: production-readiness now has exactly one deliberately-deferred item left — `#8C887F`/`#C08A3E` contrast (`docs/planning/color-contrast-scoping.md`, systemic, needs a palette decision) — plus the sci-fi UI redesign, which was never started and isn't even scoped yet. Everything else in the production-readiness space is closed.

---

## RESUME HERE TOMORROW (as of 2026-07-24 [even later], production-readiness pass finished)

**Worked through every item the prior session logged as open, in order. Production-readiness is now closed except for two explicitly-scoped, deliberately-deferred items (bundle splitting, sci-fi redesign) — no more small isolated fixes remain in this space.**

1. **`ComplianceChecklistPanel.tsx`'s journal-path sample-doc-learning wiring — 🟢 done** (`df2e78a`). Was read-only (a static chip list); restructured to be editable first (`Edit Structure` toggle + textarea + Save, matching `NonJournalRequirementsPanel.tsx`'s exact shape), then wired to the same real `learnStructureFromSampleDocument()` service — no new pattern invented. Live-verified: a real uploaded `.txt` sample's 4 real headings extracted correctly, shown in the editable textarea, persisted on save.
2. **A11y — unlabeled form fields — 🟢 done** (`7ee5b42`). Fixed all 19 flagged fields across `ManuscriptDraftingWorkspace.tsx` (9) and `NonJournalRequirementsPanel.tsx` (10) — real `id`/`htmlFor` pairs where a visible `<label>` already existed (preferred over `aria-label`, avoids duplicate accessible-name sources), `aria-label`/`aria-labelledby` where none did. Includes the two checkboxes (scripture/humanize toggles) and one icon-only send button that had no accessible name at all. Live-verified in the real browser accessibility tree (not just code) across Phase E, Phase F default view, and the AI Chat Refiner tab — every field now reports a real accessible name.
3. **A11y — `#8C887F`/`#C08A3E` contrast — scoped, not fixed** (`0c14d0e`, `docs/planning/color-contrast-scoping.md`). Quantified first: 189 + 270 occurrences across 28 files — genuinely systemic, not "a few isolated fixes," per this task's own stop-and-scope rule. Not every occurrence is even a violation (borders/backgrounds/icons vs. actual small text), and `#C08A3E` is the app's real brand accent color — changing the hex is a visual-identity decision needing sign-off, not a mechanical patch. Scoping doc lays out the real step sequence (classify text-vs-non-text occurrences, pick a replacement shade, apply only to the violating bucket, check dark-theme surfaces separately).
4. **Deploy — `ENCRYPTION_KEY`/`.env.example`/keyboard nav** — already fixed in the prior session, not revisited.
5. **Deploy — `skills/registry.ts` mixed import warning — 🟢 done** (`c215cc0`). Confirmed the dynamic `import()` in `executor.ts` achieved nothing real (`agentService.ts` already imports it statically, pulling it into the main chunk regardless) — made it static too. Warning confirmed gone from a rebuild.
6. **Deploy — CJS production-server crash — 🟢 found and fixed** (`c215cc0`), the most consequential finding this session: `npm start` (`node dist/server.cjs` — confirmed via `package.json`, distinct from `npm run dev`'s `tsx server.ts`) **crashed immediately on startup** — `fileURLToPath(import.meta.url)` throws when `import.meta.url` is empty under esbuild's CJS format. This was flagged only as a build *warning* before; actually running the built artifact (`node dist/server.cjs`) confirmed a real, currently-live deploy blocker, not a cosmetic one. Fixed by computing the dirname from `import.meta.url` only when genuinely present (the ESM dev path), falling back to Node's ambient CJS `__dirname` otherwise. Re-ran the rebuilt bundle to confirm `/api/health` now responds correctly.
7. **Deploy — bundle code-splitting (3.25MB, no `manualChunks`) — scoped, not fixed.** Real initial-load reduction needs `docx`/`pdfmake`/`xlsx` converted to dynamic `import()` at their actual usage sites in `documentExportService.ts` (only loaded when a user actually exports), not just a `manualChunks` config (which alone wouldn't meaningfully shrink what a single-page app loads upfront) — a genuinely bigger, riskier change touching the real, well-tested export pipeline, not attempted here per the same stop-and-scope discipline as item 3.

**Updated gap map**: production-readiness is now closed except for the two items above that were deliberately scoped rather than fixed (bundle splitting; `#8C887F`/`#C08A3E` contrast) — both documented with a concrete next-step sequence, not just flagged. The sci-fi UI redesign remains the only other explicitly-parked item, separate and larger, per every session's instruction not to start it here.

---

## RESUME HERE TOMORROW (as of 2026-07-24 [later], Stage 7 sample-doc-learning + auth-route retirement + production-readiness session)

**Three tasks this session, all landed clean:**

1. **Stage 7 sample-document structure learning — 🟢 done** (`ac5da89`). Last open Stage 7 piece. Scoped in `docs/planning/sample-doc-learning-scoping.md`: user uploads a real sample paper, the app extracts only observable section headings/order (new `src/document_intelligence/parser/headingDetection.ts`, deterministic, no AI call) via the existing `/api/parse-file` endpoint, and offers it as a replacement for `complianceRules.sectionStructure` — "sample wins" per target-workflow.md, never merged with the template. Found and left a pre-existing gap alone rather than scope-creeping: `DOCXParser` already computed heading classification internally but discarded it — the new shared detector is applied to final extracted text instead, a smaller fix. Wired into `NonJournalRequirementsPanel.tsx` as an additive "Learn From Sample Document" upload button (provenance badge, clears on manual edit). Explicitly not attempted: style inference, citation-style detection, margin/font extraction (not recoverable from plain text, or too fabrication-prone per the doc). `ComplianceChecklistPanel.tsx`'s journal-path is read-only (not an editable textarea) — left for a future pass. Live-verified end-to-end: real 5-section structure extracted from a real uploaded file, persisted, reflected in the Manuscript Editor's section count, and a real .docx export completed using it.
2. **Retired the old server.ts auth/user/admin routes — 🟢 done** (`d61a69b`). Exhaustively grepped `src/` first — confirmed zero remaining references anywhere in the live frontend (only historical comments in test files); every route has a real, already-wired Supabase replacement (`supabaseAuthService.ts` + Edge Functions). Removed all 10 routes, their 4 dedicated rate limiters, and 2 now-unused helpers (`writeUsersDb`, `encryptServerKey`) — net **1102 lines removed** from `server.ts`. Kept `readUsersDb`/`findUserByUsername`/`decryptServerKey`/`resolveApiKey`/`UserRecord`/`USERS_DB_PATH` — still load-bearing for `/api/generate`/`/api/stream-generate`'s server-stored-API-key fallback (confirmed via grep before touching anything). Live-verified: server boots clean, all 10 old routes now genuinely 404 on POST (not just the SPA's GET fallback), real login/register UI unaffected.
3. **Production-readiness pass — started, not completed** (`1df90b5`), per explicit task scope ("start," not finish). Full a11y + deploy-readiness audit run (see commit message / prior turn for full findings: inconsistent form labeling, two WCAG-AA-failing muted text colors, a 3.25MB unsplit main bundle, an `import.meta.url`/CJS build warning). Fixed the three concrete, safely-scoped items found: (a) 3 keyboard-inaccessible clickable `<div>`s in `AISetupWizard.tsx` (tier card + both provider-card lists) — added `role="button"`/`tabIndex`/Enter-Space `onKeyDown`, live-verified with a real dispatched keydown; (b) `server.ts`'s `ENCRYPTION_KEY` hardcoded-fallback vulnerability (same class already fixed for the BYOK vault passphrase two sessions ago) — no fallback now, logs a startup warning instead of silently using a guessable key; (c) `.env.example` was stale, missing 5 real env vars — updated with accurate defaults/fallback notes.

**Still open, explicitly deferred (not oversights — scoped out or budget-bounded)**:
- `ComplianceChecklistPanel.tsx`'s journal-path sample-doc-learning wiring (read-only section list, needs restructuring to be editable first).
- A11y: unlabeled form fields in `ManuscriptDraftingWorkspace.tsx`/`NonJournalRequirementsPanel.tsx`; `#8C887F`/`#C08A3E` text colors failing WCAG AA contrast at small sizes (widespread usage — needs a deliberate palette decision, not a reflexive global find/replace).
- Deploy: main bundle code-splitting (3.25MB, no `manualChunks`), the `skills/registry.ts` mixed static/dynamic import warning, the `import.meta.url`-under-CJS build warning (worth confirming doesn't break `__dirname`/`__filename` on the actual deployed server).
- The sci-fi UI redesign — separate, larger, explicitly out of scope for this pass per task instruction.

---

## RESUME HERE TOMORROW (as of 2026-07-24, semantic peer review build session)

**Task 1 (the only task, per instruction — substantial enough to be the whole session): semantic peer review built — 🟢 done** (`1b5a319`), following `docs/planning/semantic-peer-review-scoping.md`'s step sequence exactly.

- New, additive `comparableSourceAnalysis: ComparableSourceAnalysis | null` on `IntegrityReviewReport` (`src/agents/integrityReviewer.ts`) — `structuralCompleteness` and everything else on the existing report is untouched.
- Retrieval-first (`integrityReviewerSkill.ts`'s new `buildComparableSourceAnalysis`): derives a real query from real `title`/`keywords` (new, honest fields on `IntegrityReviewerInput`), falling back to `literatureReview.recommendedSearchTerms` if present; calls the same real `literatureRetrievalService.discoverLiterature()` `discoverDataSources()` already uses — no new retrieval logic invented.
- AI layer only runs once real comparable papers are in hand, restricted to comparative citation-engagement questions ("does the manuscript engage with paper N") — the system instruction explicitly forbids commenting on scientific quality/rigor/novelty/publishability or claiming to detect plagiarism/data fabrication, per the scoping doc's "do not attempt" list.
- Every finding's `citedPaper` is looked up by the skill from the real retrieved-papers array by index — the model only ever supplies an integer index in its JSON output, never a title/url we'd have to trust — so a finding can never cite a paper that wasn't actually retrieved.
- Honest fallbacks throughout: `null` when there's nothing to search with; a disclosed `note` when retrieval fails or finds nothing; empty `findings` (never fabricated) when the AI call or JSON parsing fails.
- `integrityReviewerSkill.ts` is now `aiEnhanced: true` / `offlineCapable: false` (accurately — this addition makes real network+AI calls); the structural scan remains fully deterministic on its own, and `executiveSummary` keeps both layers legible as separate, per the scoping doc's step 6.
- `integrityReviewAdapter.ts` and `pipeline.ts`'s integrity call site both now supply real `title`/`keywords`/`aiSettings` — meaning the existing "Run Integrity & Ethics Review" button in `QualityControlSuite.tsx` now also runs this comparison whenever a project has a real title set, additive to its prior structural-scan-only behavior. `QualityControlSuite.tsx` renders findings with links to their real cited papers, or the honest note when nothing was available to compare.
- Live-verified with real API calls: real Crossref/PubMed papers retrieved for a real project (some topically noisy — e.g. "Otosclerosis," "Acute Tonsillitis" — an honest reflection of real-world keyword-based retrieval limits, not a bug), correct citation-engagement findings for both an irrelevant real paper (no engagement) and a genuinely relevant real paper (real engagement correctly identified — "Ancient Wisdom for Modern Finance: Integrating Indian Knowledge Systems..."), every finding linked to a real, resolvable DOI URL (confirmed by following the link).

**Updated gap map**: Stage 10 (Publication Preparation / integrity review) now has both halves live — the deterministic structural/completeness scan (prior sessions) AND a genuinely literature-grounded semantic comparison layer (this session), the last item on the fabrication-audit-adjacent side of this project. Nothing scoped in `docs/planning/semantic-peer-review-scoping.md` remains unbuilt from its recommended step sequence. Remaining known gaps going forward: `ManuscriptWriterAgent`'s AES-GCM-equivalent cipher work is done; the "do not attempt" list (plagiarism detection, accept/reject verdicts, data-authenticity claims) remains intentionally, permanently out of scope — not a future task, a hard boundary.

---

## RESUME HERE TOMORROW (as of 2026-07-24, ManuscriptWriter-real + AES-GCM session)

**Two substantial tasks landed this session; stopped before Task 3 (semantic peer review build) to avoid rushing it — see docs/planning/semantic-peer-review-scoping.md for that plan, still fully open.**

1. **ManuscriptWriterSkill made real — 🟢 done** (`6f68a9b`). Was `aiEnhanced: false` with every section a static template and `qualityScore`/`confidence` hardcoded to 0.85/0.9 regardless of input. Now each section (`src/agents/manuscriptWriter/sections/index.ts`) is AI-generated via the real AI Gateway only when real grounding text exists in the new `ManuscriptResearchContext`; otherwise it falls back to the exact same honest placeholder as before. Results/Discussion are a firm exception — never AI-generated from scratch, only from real already-drafted text. `qualityScore`/`confidence` are now a real, computed `sectionsGrounded/sections.length` ratio. New `src/services/manuscriptWriterAdapter.ts` (honest-mapping precedent from `integrityReviewAdapter.ts`) maps `PaperProject`'s real fields onto this shape — `CanonicalResearchProject.artifacts`' `*Id` references have no resolvable content anywhere in this codebase, so `artifacts` stays empty rather than fabricating unresolvable references. Wired into `ManuscriptDraftingWorkspace.tsx` as a new "Generate Full Draft (Agent)" button, additive alongside the untouched live `draftSection()` path — fills only currently-empty sections, never overwrites drafted/edited content. Live-verified with real API calls: real, topic-specific Introduction/Methodology text, Literature Review/Results correctly stayed the honest placeholder (4/8 sections grounded).
2. **AES-GCM upgrade for the key vault — 🟢 done** (`0b7f189`). `getApiKey` is now async across all 8 provider adapters in `aiGateway.ts` — `decryptDataAsync` (Web Crypto AES-GCM, `"v2:"`-prefixed ciphertext) replaces the legacy synchronous XOR cipher. Confirmed the entire call-site list is self-contained to `aiGateway.ts` (no external callers anywhere). Each `getApiKey` wraps its decrypt in try/catch — a decrypt failure (wrong passphrase, or old pre-AES-GCM ciphertext) is treated as "no key configured," not a crash. `AISetupWizard.tsx`/`AIControlCenter.tsx` migrated their own key storage to the async ciphers. Breaking ciphertext-format change (same accepted tradeoff as the vault-passphrase migration two sessions ago) — keys saved under the old cipher must be re-entered once. Live-verified: real key's persisted ciphertext carries the `v2:` prefix, decrypts to the exact key with the correct vault passphrase, and **throws** (not silently garbles) with the wrong one — a stronger guarantee than the cipher it replaced.

**Updated gap map**: `ManuscriptWriterAgent` is no longer "correctly not wired because it fabricates" — it's real and additively wired. The BYOK key vault now has both correct secret custody (prior session) AND a modern cipher (this session). Semantic peer review (Stage 10) remains scoped but entirely unbuilt — the next concrete piece of work, per `docs/planning/semantic-peer-review-scoping.md`'s step sequence (retrieval-first via `literatureRetrievalService`, additive fields on `IntegrityReviewReport`, mandatory per-finding citation, respecting the "do not attempt" list).

---

## RESUME HERE TOMORROW (as of 2026-07-24, executor-fix + BYOK-vault + semantic-review-scoping session)

**All four tasks landed this session** (three shipped as code/decisions, one scoped as a plan):

1. **`AgentExecutor.execute()` silent `ok:true`-on-failure bug — 🟢 fixed** (`0b1dffd`). The try branch returned `{ ok: true, data: result.data }` unconditionally, even when the wrapped agent resolved `{ ok: false, error }` without throwing. Now checks `result.ok`, propagating the real failure. `src/agents/pipeline.ts`'s prior-session workaround (bypassing `AgentExecutor` entirely) removed now that it's unnecessary — every pipeline stage routes through the real, fixed executor with `maxRetries: 1` pinned per stage (deliberate — see commit for why the default retry-with-delay behavior wasn't adopted wholesale). Live-verified end-to-end with real API calls, zero errors across all 7 stages.
2. **`ManuscriptWriterAgent` — deliberately NOT wired in** (`d2dd227`). Investigated first, per instruction. Found `ManuscriptWriterSkill` is `aiEnhanced: false` — pure static-template placeholder text with hardcoded `qualityScore`/`confidence` constants, not real AI-generated content, unlike `draftSection` (the live path). Also requires an unbuilt `CanonicalResearchProject` adapter. Wiring it in, even additively, would present fabricated-looking output as a real draft. No code touched in `ManuscriptDraftingWorkspace.tsx`.
3. **BYOK vault-passphrase encryption — 🟢 built** (`16f447e`). Found the real vulnerability behind the "keys stored plainly" framing: provider keys were encrypted using the login `passcodeHash` — which is the raw, unhashed login password (`UserProfileGate.tsx`), stored in the SAME localStorage blob as the ciphertext, plus a hardcoded fallback secret in `AIControlCenter.tsx` on top. New `src/services/vaultPassphrase.ts` holds a separate passphrase in memory only, never persisted; `aiGateway.ts`/`AISetupWizard.tsx`/`AIControlCenter.tsx` all migrated onto it, gated behind a new "Unlock Your Key Vault" screen. Live-verified: entered a real key through the onboarding flow, confirmed it decrypts correctly only with the new vault passphrase (garbage with the old login password), and confirmed the passphrase itself never appears in persisted state.
4. **Stage 10 semantic peer review — scoped, not built**, per explicit task instruction. Full plan: `docs/planning/semantic-peer-review-scoping.md`. Key framing: ground any semantic review in real retrieved comparable papers (`literatureRetrievalService.discoverLiterature()`, already built) and restrict the model to citation-engagement comparisons against those specific real sources — never unaided judgments like "is this methodology rigorous" or "is this publishable," which would repeat the exact fabrication pattern already fixed elsewhere in this project. `IntegrityReviewReport`'s existing structural-scan fields stay untouched; semantic review would be a new, additive, separately-labeled section.

**Updated gap map**: the `AgentExecutor` bug (a real correctness issue affecting every agent caller, not just the pipeline) is closed. BYOK key storage is now genuinely encrypted at rest with a real custody boundary, not cosmetically. `ManuscriptWriterAgent` remains unwired, now with a clear, evidenced reason (not an oversight) and a concrete list of what's needed before it's viable. Semantic peer review (Stage 10) has a scoping doc but is still 🔴 not started — structural/completeness scanning (Stage 10's existing piece) remains the only integrity-review capability live today.

---

## RESUME HERE TOMORROW (as of 2026-07-24, executor-fix + follow-up session)

**Task 1 done**: `AgentExecutor.execute()`'s silent `ok:true`-on-failure bug fixed (`0b1dffd`) — see commit and characterization test (`src/agents/__tests__/executor.test.ts`) for detail. `src/agents/pipeline.ts`'s workaround (bypassing `AgentExecutor` entirely) removed now that it's unnecessary; every pipeline stage routes through the real, fixed executor with `maxRetries: 1` pinned per stage (deliberate — see commit message for why the default retry behavior wasn't adopted wholesale).

**Task 2 decision: `ManuscriptWriterAgent` NOT wired in, after investigation — this is a considered "don't," not an oversight.**

Scoped before writing any code (per this session's own instruction to check what the agent actually does differently from `draftSection` first). Findings:
- `ManuscriptWriterAgent` (`src/agents/manuscriptWriter/writer.ts`) is a thin dispatcher to `context.runSkill("manuscript-writing", ...)` — real wiring, but only as capable as the skill underneath.
- `ManuscriptWriterSkill` (`src/skills/manuscriptWriterSkill.ts:40`) is explicitly `aiEnhanced: false` — it makes no AI call at all. Its section builders (`src/skills/manuscriptWriter/sections/index.ts`) return static template strings ("This study addresses the research questions outlined in the project," "Results will be presented here after data collection...", etc.), and `qualityScore: 0.85` / `confidence: 0.9` are hardcoded constants, not computed from anything.
- `draftSection` (`aiService.ts:854-983`), the real live path `ManuscriptDraftingWorkspace.tsx` uses today, is a genuine AI-drafting pipeline: grounding-map context, Knowledge Vault integration, verified-bibliography reuse, locked-section continuity, an actual AI Gateway call, optional humanize pass.
- `ManuscriptWriterInput.project` also requires a `CanonicalResearchProject` (`src/core/project/projectModel.ts`) — a different domain model from `PaperProject` — with no existing adapter between them.

Wiring this into the live UI as-is, even as an additive button (the pattern used for `QualityControlSuite.tsx`'s "Run Full Pipeline" last session), would present static placeholder prose and fabricated confidence numbers as if they were a real AI-generated draft — directly against this project's own anti-fabrication principle, the same class of problem the fabrication audit spent multiple sessions fixing elsewhere. Unlike the QC suite precedent (where the additive path added genuinely working logic), this would be a regression dressed up as a feature.

**Not done, deliberately, and flagged for whoever picks this up next**: no code touched in `ManuscriptDraftingWorkspace.tsx` (zero blast radius) or `manuscriptWriterSkill.ts`. Before any future wiring attempt: (1) `ManuscriptWriterSkill` needs real AI-backed section generation (`aiEnhanced: true`, an actual `AIGateway` call per section, mirroring `draftSection`'s grounding assembly) instead of static templates, or at minimum the agent needs to be honestly relabeled as a skeleton/outline generator with `qualityScore`/`confidence` removed rather than fabricated; and (2) a real `PaperProject → CanonicalResearchProject` adapter needs to be built and tested, the same honest-mapping discipline used for `integrityReviewAdapter.ts`.

---

## RESUME HERE TOMORROW (as of 2026-07-24, agent-UI adapter build session)

**Four tasks this session, all landed**: Stage 8 formattingRules gap fix, the full 3-step agent-UI adapter build (2a/2b/2c), and the `draftSectionStream` dead-code decision.

1. **Stage 8 formattingRules gap — 🟢 fixed** (`8744650`). `documentExportService.ts` never read `complianceRules.formattingRules` (deliberately, to avoid parsing free text). Added a separate, structured `complianceRules.layoutOverrides` field (marginInches/fontSizePt/lineSpacing/fontFamily), populated from the same known-good constants already backing each journal preset's formatting prose (`ComplianceChecklistPanel.tsx`) or direct user input (`NonJournalRequirementsPanel.tsx`'s new Page Layout section). `documentExportService.resolveLayout()` now actually applies it.
2. **Agent-UI adapter, Step 2a — 🟢 fixed** (`0291a86`). `LiteratureReviewAgent.fetchWebStudies()` was a stub returning `[]`; now calls the real `literatureRetrievalService.discoverLiterature()`. Live-verified against real Crossref/OpenAlex/PubMed/Semantic Scholar APIs (10 real results, real DOIs).
3. **Agent-UI adapter, Step 2b — 🟢 built** (`508644c`). New `src/agents/pipeline.ts` (`runResearchPipeline`) — UI-agnostic orchestrator chaining all 7 research agents in their verified dependency order, degrading gracefully on any stage failure. Deliberately not built on the unused `src/orchestrator/*` framework; deliberately bypasses `AgentExecutor.execute()` (flagged bug there: silently reports `ok:true` even when the wrapped agent resolved `ok:false` without throwing — not fixed, out of scope). Also fixed a real crash this pipeline's first live run surfaced: `integrityReviewerSkill.ts`'s `reviewLiteratureReview` assumed `ResearchGap.evidenceSupport` was always an array (it's optional and the real `literatureReviewSkill.ts` never sets it). Live-verified end-to-end with zero errors across all 7 stages, real network calls throughout.
4. **Agent-UI adapter, Step 2c — 🟢 built** (`ac5394b`). `QualityControlSuite.tsx` gained a "Run Full Pipeline (Deep Review)" button, additive to the existing single-agent "Run Integrity & Ethics Review" — calls `runResearchPipeline()` so the same integrity reviewer now runs against a real upstream chain (literature/gap/questions/methodology/statistics) instead of leaving those `IntegrityReviewerInput` fields undefined. Live-verified in a real browser with real API calls.
5. **`draftSectionStream` — deleted, not wired in.** Confirmed zero live call sites (only its own now-removed test). The new agent pipeline does research planning/review, not manuscript drafting — no conceptual overlap. The correct future target for streaming drafting, if ever built, is `ManuscriptWriterAgent` (`src/agents/manuscriptWriter/`, already registered in `agentService.ts` but not wired to any panel or to `runResearchPipeline`) — not this orphaned, pre-agent-era function, to avoid two parallel drafting stacks. `ManuscriptDraftingWorkspace.tsx` still uses the non-streaming `draftSection()` only, unchanged.

**Updated gap map**: Stage 8's formatting-layout gap is closed. The agent pipeline (literatureReview → researchPlanner → knowledgeGap → researchQuestion → methodologyAdvisor → statisticalAnalysis → integrityReviewer) is now for the first time reachable from a real panel (`QualityControlSuite.tsx`'s deep-review button), not just library code — `src/agents/*` is no longer purely "standalone, not wired in" (CLAUDE.md §3's caveat should be read as partially superseded: the 7 research agents ARE now reachable via `runResearchPipeline`, though `ManuscriptWriterAgent` specifically remains unwired). `src/orchestrator/*` remains entirely unused, untouched, and not recommended as a base for future agent-chaining work (see Step 2b's rationale above).

---

## RESUME HERE TOMORROW (as of 2026-07-24, four-task session: race fix + Stage 2 + Stage 5 + agent-adapter scoping)

**All four assigned tasks completed this session, three shipped as code, one scoped as a plan.**

1. **`updateProject` race, fixed app-wide** (commit in the section directly below this one, same day). See that section for detail — bigger than expected: the hook was dead code, `App.tsx` had its own unfixed duplicate.
2. **Stage 2 — AI configuration UI (5-tier BYOK gateway) — 🟢 built** (commit `80bc177`). `AISetupWizard.tsx` now gates provider selection behind a tier-selection screen (Local Router / Free-Tier BYOK / Heavy BYOK, plus an inert "Affiliate — Coming Soon" card for the non-technical Tier 4) per `docs/planning/ai-gateway.md`'s tier model, filtering `AI_PROVIDERS` by existing `type`/`pricingTier` fields. Vault-passphrase encryption deliberately out of scope, per task instruction — existing `encryptData()` key storage untouched. Live-verified in a real browser: all 3 tiers filter correctly, back-navigation works, Affiliate card is inert.
3. **Stage 5 — title-only intake path — 🟢 built** (commit `63f061f`). `ResearchIntakeWizard.tsx` gained a "Start With Title Only" button bypassing the guided path's per-format `isFormValid()` gate, requiring only a title. Downstream (Stage 6+) fields were already read defensively (`|| ""` fallbacks) — confirmed via grep, no changes needed there. Live-verified: a project with only a title set navigated past Stage 5 into the main workspace with all other fields still empty (no fabricated content).
4. **Agent-UI adapter — scoped, not built**, per explicit task instruction (scoping only). Full plan: `docs/planning/agent-ui-adapter-scoping.md`. Key finding: `LiteratureReviewAgent.fetchWebStudies()` (`src/agents/literatureReview.ts:185-191`) is still a stub returning `[]` — wiring the agent pipeline into the UI today would regress the real retrieval paths from the fabrication-audit fixes. No runtime orchestrator exists today that chains agent outputs (`knowledgeGap → researchQuestion → methodologyAdvisor → statisticalAnalysis → integrityReviewer`) — only optional input-field types declare the dependency, nothing populates them. Recommended sequencing for a future session: (1) fix the `fetchWebStudies` stub first, in isolation; (2) build the missing orchestrator; (3) only then build the panel-facing adapter, one panel at a time with regression tests against the direct-service behavior it would replace.

**Updated 12-stage gap map** (target-workflow.md numbering, as of this session): Stage 2 moves 🔴 → 🟢 (tier-selection UI built); Stage 5 moves 🟡 → 🟢 for its title-only alternative path specifically (the format-based conditional-field gating was already 🟢 from a prior session — both halves of Stage 5 are now done). Agent-pipeline wiring remains 🔴 (scoped only, not built, deliberately).

---

## RESUME HERE TOMORROW (as of 2026-07-24, updateProject race-condition fix session)

**Today's finding, bigger than expected**: fixing `useProjectPersistence.ts`'s flagged `updateProject()` closure-over-stale-`project` race turned up something more significant than a one-file bug — **the hook was never actually wired into the app at all.** `App.tsx` had its own ~250-line byte-for-byte duplicate of the entire hook (`updateProject`, `createNewProject`, `switchToProject`, `deleteProject`, `loadAllProjects`, the migration effect, the `scholar_project_updated` listener) inlined directly, with the exact same unfixed race. A prior session's fix to `useProjectPersistence.ts` alone was therefore fixing dead code — confirmed by live-testing against the real running app: the fix showed no effect, and adding debug logging inside the hook never fired at all when clicking through the real UI.

**Real fix**: added a `projectRef` (synchronously updated, both by an effect for external `project` changes and directly inside `updateProject` for same-tick calls) so a second `updateProject` call in the same tick sees the first call's result immediately, without waiting for a React re-render. Then — the actual fix that matters — **deleted App.tsx's entire duplicate implementation and wired up the real hook** (`useProjectPersistence(user, project, setProject, setAllProjects, allProjects, setViewMode, setActiveTab)`), eliminating the duplication (per CLAUDE.md's no-duplication rule) and making the fix real instead of applied to unused code.

**Live-verified against the exact real vulnerable path**: `ManuscriptDraftingWorkspace.tsx`'s `loadStandardDraftSegment()` calls `saveVersion("...")` (→ `updateProject({ versions })`) immediately followed by `updateProject({ sections })` — a genuine, currently-occurring instance, not hypothetical: every real "pre-compiled draft loaded" / AI-drafted section action in this app was silently losing its own version-history checkpoint. After the fix: clicking "Skip & Pre-Compile Offline" now correctly persists both `versions: [{ description: "[Title Page] Pre-compiled standard draft loaded" }]` and the new `sections` content in the same save — previously `versions` came back empty.

tsc clean, 648/650 passing (2 pre-existing unrelated `supabaseClient` failures). Characterization test (`src/hooks/__tests__/useProjectPersistence.test.ts`) reproduces the original two-calls-in-one-tick race directly against the hook, confirmed failing before the fix and passing after.

---

## RESUME HERE TOMORROW (as of 2026-07-23, Stage 7/8 + fabrication-audit-closure session)

**Today so far**: Committed the pending Stage 7 (per-format document templates) + Stage 8 (non-journal requirements capture) work as one logical unit (`4f69b3e`) — 639/641 passing, live-verified. Flagged, not fixed: `useProjectPersistence.ts`'s `updateProject()` closes over the current render's `project` value, so two calls in the same tick silently drop the first call's fields — confirmed live (a save-then-navigate flow lost `complianceRules` until worked around locally in `NonJournalRequirementsPanel.tsx` by folding both changes into one `updateProject` call). **This is a real, app-wide bug, only patched in one place — needs its own dedicated fix**, since any other component calling `updateProject` twice in a row (save-then-navigate, or similar) can hit the same silent data loss.

Then fixed both remaining open fabrication-audit instances, closing the audit entirely:
- `extractRequirements` (`aiService.ts`, commit `9fc3b50`) — new `src/services/journalGuidelinesService.ts` discovers a journal's real instructions-for-authors page (OpenAlex homepage lookup + the existing Tavily search-proxy, scoped to that domain) instead of asking the model to invent guidelines from memory. Live-verified against a real journal (PLOS ONE) — real domain resolved, real (if short) content found, model honestly reported it as insufficient rather than fabricating plausible rules.
- `recommendedDatasets` (`researchQuestionSkill.ts`) — new `src/services/datasetRetrievalService.ts` queries DataCite's real, directly browser-callable dataset-registry API using the primary generated research question's text; honest `[]` when nothing real is found. `offlineCapable: false` now (real network call). Live-verified: a real query returned 5 real, DOI-verifiable datasets; a full agent round-trip also returned genuine (if topically noisy, for a vague synthetic test question) DOI-backed results.

**Fabrication audit status: 7 found, 7 fixed, 0 open.** See `target-workflow.md` §10 "Audit closed" for the full, final tally — no LLM-invented real-world entities remain anywhere in the 8 agents/skills or `aiService.ts`.

~~**Unrelated, still-open item carried over from earlier today**: `useProjectPersistence.ts`'s `updateProject()` closure-over-stale-`project` bug (see below) is real and app-wide — still only patched locally in `NonJournalRequirementsPanel.tsx`, not fixed.~~ **Fixed 2026-07-24** — see the section above. Turned out to be bigger than a one-file bug: the hook was never wired into the app at all (App.tsx had its own unfixed duplicate). Now consolidated onto one real, tested implementation.

**Environment note, not a bug, now resolved**: mid-session, `/Users/pobpkf/Documents` was briefly renamed to `/Users/pobpkf/Documents/Documents - PO's iMac` (an apparent macOS/iCloud Drive sync-conflict rename) — not caused by any command run this session. The repo and all commits stayed intact throughout; nothing was lost. The path has since reverted back to the original `/Users/pobpkf/Documents/scholar-agentic-os` — confirmed working tree clean and full commit history present there as of this note.

---

## RESUME HERE TOMORROW (as of 2026-07-23, Stage 6/10 completion + IntegrityReviewer fix session)

**Today in one paragraph**: Stage 6 retrieval is now fully complete — `arxiv-proxy`, `who-proxy`, and `imf-proxy` Edge Functions (same stateless-exception pattern as `search-proxy`) all deployed and wired into `discoverDataSources`, closing the three sources deferred from the earlier Stage 6 pass. Also this session: removed the detection-evasion language flagged last session from `draftSectionBasedOnQCStream`'s system prompt (commit `3558a26`); connected `IntegrityReviewerAgent` to `QualityControlSuite.tsx`'s live UI via a new, honest `PaperProject` → agent-input adapter (commit `9faaa51`) — additive to, not replacing, the existing `runQualityControl` flow; and, having surfaced a real fabrication the moment that wiring went live, fixed it the same day (commit `64da658`): `integrityReviewerSkill.ts`'s `evaluateReportingCompliance()` now runs a real 9-item heading/keyword scan against `manuscriptText` instead of returning a hardcoded constant, plus 5 new pattern checks (placeholder text, missing ethics/data-availability/COI disclosures, absent citations) — all deterministic, no LLM call. `publicationReadiness: boolean` (always `true`) replaced with `structuralCompleteness: number`, and `executiveSummary` now explicitly discloses this is a structural scan, not semantic peer-review judgment. Full commit sequence: `3558a26` (detection-evasion fix) → `b44805a` (arXiv proxy) → `5cb1f10` (WHO/IMF proxies) → `9faaa51` (IntegrityReviewerAgent wiring) → `64da658` (IntegrityReviewer fabrication fix) → docs.

**Flags from this session:**

1. ~~`IntegrityReviewerAgent` always reports 0 issues and `publicationReadiness: true`...~~ **Resolved same day (commit `64da658`).** No longer an open integrity gap — see the paragraph above and `target-workflow.md` §Stage 10 / §10 (fabrication audit) for full detail. Live-verified: a real project with placeholder text and no citations now produces "4 issues detected, 1 blocking... Structural completeness: 11%."
2. **Stage 6 (data/literature retrieval) is now fully complete** — Crossref/OpenAlex/PubMed/Semantic Scholar (direct), World Bank/OECD (catalog + client-side scoring, direct), arXiv/WHO/IMF (proxied, built this session), Tavily domain-restricted web search (proxied). See `target-workflow.md` §Stage 6, updated in the same commit as this note. Nothing left deferred in this stage.
3. **Fabrication audit (target-workflow.md §10) status as of today**: 7 confirmed instances found across both audit passes (2026-07-22 and the 2026-07-23 native-skills rollout) — 5 now fixed (`enrichCitationMetadata`, `recommendJournals`, `KnowledgeGapAgent`'s journals, `simulateLookup`, and today's `evaluateReportingCompliance`), 2 still open (`extractRequirements` — blocked on a proxy/vendor decision; `recommendedDatasets` — needs a not-yet-built dataset-retrieval service, real new feature work).

---

## RESUME HERE TOMORROW (as of 2026-07-23, Stage 9 session)

**Today in one paragraph**: Stage 9's two missing pieces shipped — a humanize skill (`src/skills/humanizeSkill.ts`, registered in the Skills Framework) and an AI-use disclosure gate (`src/services/aiDisclosureService.ts` + `AIDisclosureReviewModal.tsx`) blocking export until the user reviews and confirms it, with the confirmed text included in both `.docx` and PDF output. The disclosure template is grounded in Elsevier's actual published declaration structure, researched live this session (WebSearch + WebFetch of elsevier.com's policy page), not assumed from training data. Live verification: a real drafted section triggered the humanize skill through the actual Skills Framework (`[SkillExecutor] [humanize-prose] Humanizing drafted text`), and a real exported `.docx` was inspected to confirm the disclosure section renders correctly, right before References. Committed as `509f5af` (code) and a following docs commit. `target-workflow.md` §Stage 9 updated to 🟡 Partial.

**Two things flagged this session, not fixed — read before touching Stage 9 or drafting again:**
1. **`draftSectionStream` has zero live call sites anywhere in the app** (confirmed by grep this session, both before and after adding humanize wiring to it). The humanize `boolean` param was still added there for completeness per the task's instruction, but it's unreachable from any component today — this was already true before this session (dead code), so it's a known gap, not a regression introduced by this work. If a future task ever wires up a real caller for `draftSectionStream`, its humanize toggle will already work; nothing further needed there.
2. **`draftSectionBasedOnQCStream`'s existing system prompt contains real detection-evasion language**: "Your target is to bypass common AI detectors (GPTZero, Turnitin-AI)." This is the *redraft* path (`aiService.ts`, used by `QCBasedRedraftingSuite.tsx`), separate from the two drafting functions touched this session. It directly conflicts with the humanize skill's honest, prose-quality-only framing and with this project's stated academic-integrity philosophy. Deliberately left untouched this session (out of scope for a "build two missing pieces" task) — **should be removed in its own dedicated pass**, not bundled into unrelated work, since rewriting a live, working system prompt deserves its own characterization tests and review.

---

## RESUME HERE TOMORROW (as of 2026-07-23, Stage 12 session)

**Today in one paragraph**: Stage 12 (final document export) shipped — `src/services/documentExportService.ts` generates real `.docx` (via `docx@9.7.1`) and real, selectable-text PDF (via `pdfmake@0.3.11`, declarative layout, not jsPDF+html2canvas), wired into `ManuscriptEditorWorkspace.tsx`'s existing Download buttons, replacing what turned out to be fake pre-existing implementations (an HTML file renamed `.doc`, and a `window.print()` dialog for "PDF"). Live verification (real project, one approved + one pending source, one drafted section) confirmed both files are genuine, readable, and correctly gate references to `status === "approved"` only. One real bug was found and fixed mid-build: pdfmake 0.3.x's `getBlob()`/`getBuffer()` are `async` Promise-returning methods, not the callback-style API assumed from initial research — the first implementation silently hung forever. Committed as `7d9f6a4`. `docs/planning/target-workflow.md` §Stage 12 updated to 🟢 Done with this detail.

**Full 12-stage gap map (target-workflow.md's stage numbering), as of this session:**
- 🟢 **Done**: Stage 1 (Research Intake), Stage 3 (Research Planning field-mapping), Stage 4 (Output-format selection, `outputFormats.ts`), Stage 6 (scholarly literature + statistical data retrieval, research-proposal data-skip gate, agent-found-source approval gate, Tavily search-proxy wiring), Stage 11 (Redrafting — `QCBasedRedraftingSuite.tsx` chat-driven + `ManuscriptEditorWorkspace.tsx` manual editing, though manual editing is plain `<textarea>`, not rich-text), Stage 12 (Final export — this session).
- 🟡 **Partial**: Stage 5 (conditional field gating — done for the format selector, not verified end-to-end against every downstream form), Stage 8 (Compliance/requirements — `complianceRules.sectionStructure` is real structured data; `formattingRules` remains free text, so exact margins/fonts/journal-specific layout still can't drive Stage 12's output — flagged as a known gap in `target-workflow.md` §Stage 12).
- 🔴 **Not started / open**: Stage 2 (Literature Review depth beyond basic retrieval), Stage 7 (Manuscript Refinement template system — explicitly untouched this session per instruction), Stage 9 (Publication Preparation / AI-use disclosure — "does not exist anywhere," placement proposed but unbuilt), Stage 10 (Publication Submission), arXiv-proxy retrieval (deferred, not blocked on any decision — separate task from the rest of Stage 6), WHO-direct/IMF-direct retrieval (same — deferred, not blocked).

**Open threads, not yet started:**
- `extractRequirements` fabrication fix — still needs a vendor/proxy decision before it can proceed.
- arXiv proxy (Stage 6 remainder) — deferred, not blocked, separate task.
- Stage 8 structured-requirements parsing (margins/fonts/section structure from real journal guidelines) — needed before Stage 12 can move past hardcoded academic defaults.
- Removal of the dead `request-password-reset`/`approve-password-reset` Edge Functions and `pending_password_resets` table — still deliberately deferred until a custom domain is verified with Resend.

**Nothing is broken right now.** Every item above is a deliberate deferral or a known, explicitly-scoped-out gap — not a bug needing urgent attention.

**Suggestion for next session, not a decision already made**: Stage 8's structured-requirements parsing looks like the natural next piece, since it directly unblocks Stage 12 producing journal-accurate layout instead of fixed defaults — but confirm before starting.

---

## RESUME HERE TOMORROW (as of 2026-07-22)

**Today in one paragraph**: the Supabase auth cutover finished completely — `UserProfileGate.tsx`, `ProfileSettings.tsx`, and `AIControlCenter.tsx` all now talk to Supabase directly instead of the old `/api/*` Express routes, with a real Edge Function CORS bug found and fixed along the way. Separately, all 4 known LLM-fabrication instances in `aiService.ts`/`citationService.ts` (`discoverDataSources`, `discoverJournals`, `enrichCitationMetadata`, `simulateLookup`) were replaced with real Crossref/OpenAlex/PubMed/Semantic Scholar/DOAJ retrieval. The password-reset switch, blocked since yesterday on a `500 unexpected_failure` from `/auth/v1/recover`, got root-caused today: it's Resend's shared sandbox sender only accepting deliveries to the Resend account's own registered address, not a Supabase or code problem — confirmed by a direct test, code is done. On the planning side, `target-workflow.md` picked up empirical CORS test results that settled the client-side-vs-proxy architecture question (a narrow fetch/search proxy exception, formally scoped), dropped Google Scholar from retrieval scope, added an authoritative-web-search design section, and a Terms & Conditions mandatory-acceptance-gate spec plus a first (explicitly not-legal-advice) draft.

**Open threads, not yet started:**
- ~~Native-skills agent-wiring rollout — 1 of 8 agents...~~ **Superseded (2026-07-23): COMPLETE.** All 8 agents now wired to `src/skills/` — see the dedicated section below for the full rundown (3 fabrication fixes, 3 flagged-not-fixed findings).
- `extractRequirements` fabrication fix — needs a vendor/proxy decision before it can proceed (flagged during the fabrication audit, not yet actioned).
- ~~Three known-but-unfixed UI bugs...~~ **Superseded (2026-07-23): all three fixed.** `27b56ef` (admin approve/reject success message no longer overwritten by `loadProfileData()`), `cc2b24a` (shows "User profile not found." instead of a permanent spinner), `9993438` (phone number no longer doubles the country code when typed into the number field — root-caused to `ProfileSettings.tsx`'s `handleRequestUpdate`, not `UserProfileGate.tsx` as originally suspected; the reported string's leading `+` only matches that file's construction). Each: characterization test first (two already existed and had locked in the bugs; the phone one was new), minimal fix, `tsc`+full suite clean, one commit per bug.
- Removal of the now-dead `request-password-reset`/`approve-password-reset` Edge Functions and the `pending_password_resets` table — deliberately deferred until a custom domain is verified with Resend (not urgent, not a bug).

**Nothing is broken right now.** Every item above is a deliberate deferral — either waiting on an external decision (vendor, domain, legal review) or intentionally out of scope for the pass that found it — not a bug needing urgent attention.

**Suggestion for tomorrow, not a decision already made**: the fetch/search proxy architecture is now settled and the fabrication audit is fully closed out, so the authoritative-web-search work in `target-workflow.md` §7 (Brave/Tavily/Exa/SerpApi/Bing/Google-PSE, government/international-body sources) looks like the most natural next buildable piece — but that's a suggestion, worth confirming before starting rather than assumed.

## Standing Instruction — Contradicting Docs (read this before using any doc below)

**If two planning/architecture docs contradict each other on anything material to the task at hand: STOP and ask the user. Do not resolve it silently, and do not assume the newer document is automatically correct** — "newer" is a tiebreaker of last resort for genuinely unrelated stale content, not a license to skip asking when the contradiction actually matters to the work in front of you. The ranking below exists to tell you which doc to *read* first and which claims are already known-stale; it is not permission to auto-resolve a live conflict without flagging it.

## Standing Blocker — Legal Review Required Before Live Deployment (added 2026-07-22)

**Live deployment of this product is blocked on legal review of the Terms & Conditions, separate from and in addition to any technical blocker recorded elsewhere in this file.** `docs/planning/terms-of-service-draft.md` is an AI-written first draft — explicitly marked not legal advice, not ready to deploy — covering AI/agent-sourced-content disclaimers, data-loss and account-compromise liability, service-availability disclaimers, and a billing-terms placeholder. It must be reviewed, corrected, and completed by a qualified lawyer before publication. Do not treat the mechanism spec (`target-workflow.md` §9 — versioned acceptance, Supabase acceptance record, blocking re-acceptance gate) as blocked by this — the *mechanism* can be built and tested against placeholder/draft text; only *publishing real terms and going live* is blocked on the legal review.

## Standing Boundary Rule — Fetch/Search Proxy Scope (added 2026-07-22)

**Decision recorded**: the project owner has accepted a thin, stateless fetch/search proxy as **one deliberate, narrowly-scoped exception** to the client-side-by-default architecture. Everything else stands: agents, skills, AI calls, and drafting all still run locally in the browser; users still bring their own keys; there is still no per-user server cost. This is a **stopgap**, explicitly — the project owner may buy a shared server later, at which point this proxy folds into that real hosting rather than persisting as a separate architectural fork.

**The bright line — what the proxy may do, and only this:**
- Fetch an outbound resource (a query to a search/retrieval API, or a target page/document's content) and return the response to the caller, unmodified.
- Nothing else.

**What the proxy must never do — and what would need to come back as a fresh decision, not be silently absorbed as "a natural extension":**
- **Never stores data.** No database, no cache that persists beyond the single request/response it's handling.
- **Never authenticates end users.** No session, no cookie-as-identity, no login of any kind.
- **Never holds session state.** Every invocation is independent; nothing about one call may affect another.
- If a future task looks like it would require any of the above — e.g., caching results to save on API costs, rate-limiting per logged-in user, or (a concrete, anticipated example) routing AI-provider calls like OpenAI's through this same proxy if its CORS access ever turns out to be blocked (`ai-gateway.md`'s still-unresolved OpenAI question) — **stop and ask the project owner.** Don't reason "the proxy already exists, so extending it a bit is a small step" — that reasoning is exactly what this rule exists to prevent.

**Precedent, not a new pattern**: `/api/parse-external-link` in the current (still-live) `server.ts` already does exactly this kind of server-side fetch-and-return today. This decision formalizes and extends that existing pattern — to arXiv (confirmed CORS-blocked, `target-workflow.md` §5), and to generic authoritative-web-search plus full-text page fetching (`target-workflow.md` §7) — it does not introduce a new category of server-side logic into this project.

**Search-vendor decision, recorded 2026-07-23 (full reasoning in `target-workflow.md` §7)**: the generic-authoritative-web-search vendor behind this proxy is **Tavily** — stable no-card-required free tier, predictable 1-credit-per-basic-search billing, and first-class `include_domains`/`exclude_domains` support documented against exactly the `.edu`/`.gov` restriction this project needs. **Mandatory constraint on the proxy implementation, same weight as the three bright-line rules above**: it must only ever call Tavily's **basic search (1 credit)** or **advanced search with content extraction (2 credits)** — **never Tavily's Research endpoint**, whose cost is open-ended (4–250 credits, depth-dependent) and would defeat the reason Tavily was chosen over Exa in the first place. Tavily was acquired by Nebius ($275M, Feb 2026) — a funding-stability signal, not a concern, but worth a periodic check for post-acquisition pricing/ToS changes.

## Document Authority Order (as of 2026-07-22)

Newest-decision-wins ranking of every planning/architecture doc referenced by this project, for when two of them disagree. Each entry states what it's still authoritative *for* and what in it is superseded.

1. **This file's Standing Boundary Rule, Standing Blocker (both above), and top section (below), dated 2026-07-21/22** — the "Next Session — READ THIS FIRST" and "Correction" notes just below this section, plus the two Standing sections just above it. Authoritative for: current, as-of-now implementation/commit status of the Supabase auth cutover, the password-reset switch, and the agent/Skills wiring; the **exact, bright-line scope of the accepted fetch/search proxy exception**; and the fact that **live deployment is blocked on legal review of the T&C**, independent of technical status. These are the single authoritative statements of each, not any paraphrase elsewhere. Wins over every doc below on these specific topics.
2. **`docs/planning/target-workflow.md`** (2026-07-22) — authoritative for: the target 12-stage workflow spec, the 5 resolved design ambiguities (§4), the **empirical, browser-tested** CORS results for the five scholarly-literature retrieval APIs (§5, all now resolved — 4 of 5 direct, only arXiv needs the accepted proxy), the **decided** exclusion of Google Scholar (§6), the now-resolved-architecture/still-open-vendor-choice research on authoritative web search against government/international bodies (§7), the not-decided authoritative-source-filtering design question (§8), and the **T&C mandatory-acceptance mechanism spec** (§9 — versioning, Supabase acceptance record, blocking re-acceptance gate; not the legal text itself). Newest planning doc; supersedes anything below that touches workflow stages, scholarly-API/web-search retrieval, or the T&C mechanism.
3. **`docs/planning/terms-of-service-draft.md`** (2026-07-22) — authoritative for: the current draft legal text referenced by `target-workflow.md` §9. **Explicitly not legal advice and not ready to deploy** — see the Standing Blocker above. Supersedes nothing (this is a new document with no prior version), but any future T&C draft revision should update this file in place, not create a second one.
4. **`docs/planning/competitive-analysis.md`** (2026-07-22, same day as above) — authoritative for: the competitor landscape and the separately-labeled "My Recommendations" opinions. Narrower scope than target-workflow.md; no ranking conflict with it.
5. **`docs/planning/2026-07-20-session-notes.md`** (2026-07-20) — authoritative for: the still-undecided UI aesthetic proposal ("Ancient Knowledge, Future Interface") and the agent-roster-redesign proposal (blocked on ARCH-3, still blocked). **Not** authoritative for its "Native Agent Skills" section's implementation-status line — that claim is now stale; see the contradiction list below.
6. **`docs/planning/sponsored-placements.md`** (2026-07-21) — authoritative for: the unified placement-categories design (conferences/admissions/publishers/Tier-4 affiliate as one mechanism). Still fully unimplemented; no contradictions found against it. Depends on the Supabase pick in `hosting-and-topology.md` §3, which stands.
7. **`docs/planning/ai-gateway.md`** (2026-07-21) — authoritative for: the 5-tier AI Gateway model and proposed tier sequencing. Its CORS open-questions (direct-browser access to OpenAI/Anthropic/Gemini/OpenRouter) are a **different, still fully unresolved** question from target-workflow.md §5's now-resolved scholarly-literature-API CORS results — see the contradiction list below for why these must not be conflated.
8. **`docs/planning/hosting-and-topology.md`** (2026-07-21, amended 2026-07-22) — authoritative for: the client-side-by-default architecture pivot itself (still `PENDING ARCHITECTURE DECISION — NOT APPROVED` as a whole), the Supabase-vs-Firebase pick (Supabase, stands), and the `server.ts` route-by-route breakdown (§4). **Not** authoritative for: (a) the admin-approval-gated password-reset design described in its §3 schema-mapping table and §4's route list — superseded by the confirmed switch to Supabase's self-service `resetPasswordForEmail`; (b) its "no backend server, ever" / "no self-managed backend server" framing (§1, §2) — amended by the 2026-07-22 fetch/search proxy decision (see the Standing Boundary Rule above, which is the actual authoritative scope). All three affected spots in this doc now carry an inline pointer to the current source.
9. **"The original production-readiness plan"** — flagged, not ranked, **and explicitly NOT a file that exists anywhere in this repo.** Do not search for `production-readiness-plan.md`, `production_readiness.md`, or any similarly-named file — none exists; this was checked directly (`grep`, not assumed) and there is no such standalone document to find. **The only surviving artifact that preserves any of its content is `hosting-and-topology.md` §6** ("Cross-Reference: Existing Production-Readiness Plan"), which reconstructs its backlog IDs (`ARCH-1`–`ARCH-7`, `SEC-1`–`SEC-7`, `DEPLOY-1`–`DEPLOY-5`, `QUAL-1`–`QUAL-4`, `TEST-1`–`TEST-5`, `PERF-1`–`PERF-3`, `UX-1`–`UX-3`, `DX-1`–`DX-5`) and re-prioritizes each against the hosting pivot from memory of that earlier session, not from a file. Older docs with their own, different ID schemes exist (`docs/project_baseline.md`, `docs/epic_roadmap.md`, `docs/implementation_plan.md` — `T00x`/`P0`–`P2`/`E01`–`E03` IDs, dated 2026-07-14/17) but were not verified to be the same document this backlog was drawn from — treat `hosting-and-topology.md` §6 as the only authoritative surviving record of that plan's content and status, and stop looking for anything else.
10. **This file, everywhere below the top section** (§1 onward) — authoritative for the moment-in-time status snapshots it records, but the file is chronological/append-only rather than re-ordered on every edit: later-dated notes near the top win over older material further down wherever the two overlap. This Document Authority Order section, being the newest addition, wins over all of it.

### Known contradictions between planning docs (audited 2026-07-22)

Only actual, verified conflicting statements — not assumed ones.

1. **Password-reset design: admin-approval-gated vs. self-service.**
   - **Stale**: `hosting-and-topology.md` §3 (the "Existing `users.json` shape" row, which names `tempPasscodeHash`/`resetApproved` fields "used by the password-reset flow," and the "Bottom line" paragraph's "admin-approval-by-email-link" framing) and §4 (the "Moves to the BaaS" section, which lists `/api/request-password-reset`/`/api/approve-reset` as mapping straight to Supabase equivalents).
   - **Current**: this file's own confirmed decision (2026-07-21) and its actual implementation (commit `5a59eef`) — Supabase's built-in `resetPasswordForEmail`/`updateUser` self-service flow, with no admin-approval step at all. `supabase/functions/request-password-reset`, `approve-password-reset`, and the `pending_password_resets` table are now dead code, pending removal once live-verification finishes (see this file's §"Next session's actual first task").
   - Both stale sections in `hosting-and-topology.md` now carry an inline superseded-header pointing here.

2. **Native Agent/Skills wiring: location and status.**
   - **Stale**: `2026-07-20-session-notes.md` §2's status line — *"No `SkillResult` field has been added, no agent has been rewired to `src/skills/`, and `createAgentContext()` in `server.ts` is unchanged."*
   - **Current**: this file's top "Correction" section — `ResearchPlannerAgent` **is** now wired to `src/skills/` (1 of 8 agents), and `createAgentContext()` was briefly added to `server.ts` then **removed from it entirely** — the wiring lives client-side in `src/services/agentService.ts` instead, consistent with `hosting-and-topology.md` §4's own instruction that this logic "should move client-side cleanly." The other 7 agents remain unwired, matching the original proposal's scope.
   - The stale section in `2026-07-20-session-notes.md` now carries an inline superseded-header pointing here.

3. **Resolved, not a contradiction, but worth closing the loop on**: `hosting-and-topology.md` §4 flagged `/api/lookup-doi`'s (Crossref) direct-browser CORS support as "plausible... but not confirmed here." `target-workflow.md` §5 now confirms this empirically — Crossref is directly callable, no proxy needed. An inline resolved-note was added at the original flag.

4. **Amendment, not a contradiction, but material to every doc that assumed the old constraint**: `hosting-and-topology.md` §1/§2 and `ai-gateway.md`'s status line both state the architecture has **zero** server-side component beyond the BaaS ("no backend server to run or pay for, ever" / "no self-managed backend server in this topology"). **This is now amended, not stale-and-wrong** — the project owner made a deliberate decision (2026-07-22) to accept one narrowly-scoped exception (see the Standing Boundary Rule above). Both docs carry inline pointers at the affected lines. Anything built against the old "literally zero server-side, full stop" reading should be re-checked against the Standing Boundary Rule's exact scope before assuming it's still accurate.

5. **Explicitly NOT a contradiction — flagged only to prevent conflation**: `ai-gateway.md` and `hosting-and-topology.md` §4 both raise an open, unresolved CORS question about **AI-provider APIs** (OpenAI especially, also Anthropic/Gemini/OpenRouter) for the AI Gateway tiers. `target-workflow.md` §5's newly-completed empirical CORS test covers a **different set of APIs entirely** — scholarly-literature retrieval (Crossref/OpenAlex/Semantic Scholar/PubMed/arXiv). Resolving one does not resolve the other; the AI-provider CORS question remains fully open and untested. **Also note**: the fetch/search proxy accepted in item 4 above was scoped to retrieval, not to this AI-provider question — the two remain separate even after that decision.

---

## Correction: Agent/Skills Framework re-homed client-side (was briefly wired into server.ts by mistake)

The `ResearchPlannerAgent`-to-Skills-Framework wiring (committed as `2e5e9fb`) was initially wired into `server.ts`, registering `AgentRegistry`/`SkillRegistry` and exposing `/api/agents` + `/api/agents/execute` there. This contradicted `docs/planning/hosting-and-topology.md` §4, already on record: the Agent/Skills stack is pure in-memory JS/TS logic with no Node-only dependency (re-verified here: every runtime import across all 8 agents, both registries, both executors is either type-only or `src/core/logger.ts`, which is plain `console.*`) — it belongs client-side, not behind an HTTP hop to a server this whole engagement has been trying to stop needing. This was in fact the *original* reason the wiring work was paused before Phase 1 — re-homing it was already anticipated, just not re-checked before committing this time.

**Fixed**: moved to `src/services/agentService.ts` (`listAgents()`, `executeAgent(id, input)` — no HTTP layer at all now, direct in-process calls). Removed from `server.ts` entirely: the `AgentRegistry`/`AgentExecutor`/`SkillRegistry` registration, `createAgentContext()`, and the `/api/agents`+`/api/agents/execute` routes. Confirmed via grep before removing: no frontend code called those routes yet, so there was no live behavior to preserve across the move. New test file `src/services/__tests__/agentService.test.ts` (3 tests). `tsc --noEmit` clean; full suite 375/377 (same 2 pre-existing, unrelated failures as elsewhere in this file).

**Lesson for next time this kind of "pick up paused work" request comes in**: re-check `docs/planning/hosting-and-topology.md` and this file's own notes for *why* something was paused before resuming it, not just that it was — the reason is often the constraint that still applies.

## Next Session — READ THIS FIRST

**Phase 1 of `docs/planning/hosting-and-topology.md` (static hosting + Supabase migration) is built and unit-tested, but NOT live-verified and NOT cut over — read this before touching auth, hosting, or AI-gateway work.** As of 2026-07-21:

**What's done and verified** (`npx tsc --noEmit` clean, `npx vitest run` — 21 files / 347 tests passing):
- `supabase/schema.sql` — `profiles`, `api_credentials`, `pending_password_resets` tables, RLS policies, an auto-profile-creation trigger, and two security-definer RPCs (`email_for_username`, `is_username_approved`) needed because the app logs in by username but Supabase Auth is email-based.
- `src/services/supabaseClient.ts` + `src/services/supabaseAuthService.ts` — full client-side replacement for `server.ts`'s auth/user/admin routes (signUp, signIn, checkApproval, saveModelPreferences, saveApiKeys, requestPasswordReset, requestProfileUpdate), unit-tested against a mocked Supabase client.
- `supabase/functions/` — 5 Edge Functions (Deno) covering the admin-approval-by-email workflows that need the service_role key: `send-approval-email`, `approve-registration`, `request-password-reset`, `approve-password-reset`, `request-profile-update`. **Not type-checked or tested by this project's `tsc`/`vitest`** — that's a structural limitation (different runtime), not skipped effort; `tsconfig.json` now explicitly excludes `supabase/functions`.
- `scripts/migrate-users-to-supabase.ts` — one-off `users.json` → Supabase migration script (`npm run migrate:users-to-supabase`).
- `DEPLOYMENT_README.md` and `render.yaml` rewritten for the new split: Supabase (auth/user data) + static hosting (frontend) + a slimmed-down interim `server.ts` (still needed — see below).

**Update: the live Supabase project is now provisioned and fully verified** (see the closed-out walkthrough below) — item 1 below is historical, kept for context on what this phase originally shipped without live verification.

**What's explicitly NOT done, and why:**
1. ~~No live Supabase project exists.~~ **Superseded** — live project `scholarAgent` (`gfjhsijrwodjvkisouzw`, `ap-south-1`) now exists, schema is applied, all 5 Edge Functions are deployed and verified working end-to-end (see below). What's still true from this point: the frontend isn't yet pointed at any of it (item 2 below).
2. ~~**The actual UI is NOT cut over.** `UserProfileGate.tsx` (1,782 lines), `ProfileSettings.tsx`, and `AIControlCenter.tsx` still call the old `/api/*` Express routes.~~ **Superseded (2026-07-22) — all three are now cut over.** See "Auth/profile Supabase cutover — COMPLETE" below for the full status, including two pre-existing UI bugs found (not fixed, out of scope) and an Edge Function CORS bug found and fixed along the way.
3. **`server.ts`'s old ~1,050 auth/user/admin lines are untouched, deliberately** — per the "don't delete until the replacement is verified working" instruction. They're still what actually runs today; nothing currently points at the new Supabase code.
4. **Two design questions from the previous pass are now CONFIRMED, not open — do not re-litigate, implement per this when the relevant code is touched:**
   - **Password reset**: switch to Supabase Auth's built-in `resetPasswordForEmail` self-service flow, dropping the custom admin-approval gate currently built (`pending_password_resets` table in `supabase/schema.sql`, and the `request-password-reset`/`approve-password-reset` Edge Functions). Reasoning: the old flow's admin-approval step wasn't adding security on top of an already-verified mechanism — `server.ts`'s `/api/request-password-reset` never checked that the submitted email matched the account on file, so anyone who knew a username could stage a reset with an arbitrary email; the admin clicking approve was the *only* thing preventing takeover. Supabase's built-in reset closes that gap directly (the link only ever goes to the real email on `auth.users`), at the cost of losing the admin's visibility into every reset event — an accepted tradeoff. **Not implemented yet.** This happens as part of the Step 2 UI cutover (`UserProfileGate.tsx`'s `handleForgotPasswordSubmit`), not in isolation — when that happens, `supabase/functions/request-password-reset`, `approve-password-reset`, and the `pending_password_resets` table become dead code to remove.
   - **BYOK key encryption**: confirmed direction is a client-side, app-level encryption layer using the already-built `src/utils/crypto.ts` (`encryptDataAsync`/`decryptDataAsync` — AES-GCM + PBKDF2, already throws on an empty secret, no hardcoded fallback to reintroduce). The secret is a **separate vault passphrase**, distinct from the account's login password, entered once per session and held only in memory — never persisted to localStorage/disk. If it's missing (e.g., a page refresh cleared in-memory state), the UI must explicitly prompt to re-enter it before decrypting/re-encrypting anything — never silently fall back to an empty or default secret. **Not implemented yet** — `supabaseAuthService.ts`'s `saveApiKeys` deliberately still stores keys unencrypted; this is deferred until Supabase is live and the encryption round-trip can be tested for real, not built blind.

**Supabase go-live walkthrough — CLOSED OUT, fully verified.** Live project: `scholarAgent`, ref `gfjhsijrwodjvkisouzw`, region `ap-south-1`.
- **Step 1**: Project URL + anon (Publishable) key located and distinguished from the Secret (service_role) key; `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` set in the local, gitignored `.env`. Secret key was shown in chat once but never written to any file.
- **Step 2**: `supabase/schema.sql` run against the live project via the SQL Editor. Verified: `profiles`, `api_credentials`, `pending_password_resets` tables exist; RLS enabled on all three; exactly the three expected policies present.
- **Step 3**: the hardcoded admin notification email (`"doc.govinda@gmail.com"`, previously duplicated across `server.ts`, the unwired `server/routes/auth.ts` duplicate, and 3 of the 5 Edge Functions) is now a configurable `ADMIN_EMAIL` (committed — see git log). Supabase CLI installed via `npx supabase@2.109.1` (Homebrew's own `curl` couldn't verify GitHub's release-asset CDN cert on this machine — an unresolved local Homebrew/curl issue, unrelated to Supabase; `npx` sidesteps it using Node's own CA store). Project linked (`supabase/.temp/linked-project.json` confirms `gfjhsijrwodjvkisouzw` — note this CLI version doesn't use `supabase/config.toml`, it's `.temp/`-based, now gitignored). All 5 Edge Functions deployed with `--use-api` (no Docker on this machine) and `--no-verify-jwt` on `approve-registration`/`approve-password-reset` (verified: both return `400`, not `401`). `RESEND_API_KEY` and `ADMIN_EMAIL` secrets set (`supabase secrets list` confirms both registered, distinct from the auto-injected `SUPABASE_*` platform secrets). **Full end-to-end send path verified**: 3 test emails confirmed landed in the `ADMIN_EMAIL` inbox.
- **Two secret-handling mishaps during this walkthrough, both resolved, worth knowing about if repeating similar steps**: (a) the Resend key was twice set to instructional placeholder text instead of a real value (`re_your_actual_key_here` literally, then a Render API key — prefix `rnd_` — pasted by mistake instead of a Resend key, prefix `re_`) — resolved by testing the key directly against `https://api.resend.com/emails` first to isolate "is the key itself valid" from "did it get set correctly," before touching Supabase secrets. (b) The Render `rnd_` key was briefly shown in full in a screenshot in chat — flagged to the user as exposed, same handling as the Supabase Secret Key earlier; revoking it is the user's call, not blocking.

**`UserProfileGate.tsx` cutover — DONE, mid-manual-verification.** Explicitly scoped narrow this pass: a like-for-like data-layer swap only — password-reset logic and BYOK/API-key encryption were **deliberately excluded** from this pass (confirmed explicitly: "those are separate, later efforts," superseding the older plan below that said to bundle them in). What actually happened:
1. **15 characterization tests** written first (`src/components/__tests__/UserProfileGate.test.tsx`), confirmed passing against the OLD `/api/*`-backed code as a locked-in baseline, *then* updated to mock `supabaseAuthService.ts` and re-confirmed passing against the NEW code — same assertions where the interaction genuinely didn't change, updated assertions where it did (see below). Required adding `@testing-library/react`, `@testing-library/jest-dom`, `jsdom` as new devDependencies and a `vitest.config.ts` (jsdom needs a real `url` to enable `localStorage`, which vitest's default jsdom environment setup doesn't proxy correctly onto `global` on Node 26+ — worked around via `global.jsdom.window.localStorage`, documented in the test file).
2. **Registration, login, forgot-password** now call `signUp`/`signIn`/`requestPasswordReset` in `supabaseAuthService.ts` instead of `fetch('/api/*')`. Three things could **not** be a pure swap and required explicit decisions (all confirmed by the user before implementing):
   - **OTP email pre-check**: no Supabase equivalent exists (Supabase's own "Confirm email" is meant to be disabled — see below — since `is_approved` replaces it). Now a client-side-only step: the 6-digit code is generated and shown via the same sandbox-bypass message the old code used whenever Resend wasn't configured, but nothing is ever actually dispatched. `formsubmit.co` fallback removed as a result (unreachable now).
   - **Activation**: the old "enter an activation key" flow has no Supabase equivalent (approval is the admin flipping `is_approved` directly; there's no key issued). Replaced with a "Check Approval Status" button on the same pending screen, which just attempts `signIn()` with the already-collected signup credentials.
   - **Wrong-password path**: as a side effect of `signIn()`'s cleaner interface, a wrong password now correctly hits the real error branch directly, rather than accidentally-correctly falling back to a local check because the old server returned `400` (which the old client code misread as "network/offline"). Net behavior visible to the user is the same message; the old escape hatch that auto-approved logins for usernames unknown to the server (see `server.ts`'s `/api/verify-and-sync-profile`, "avoid locking out existing dev profiles") has **no equivalent** and was not reproduced — a real, minor, accepted-as-fine behavior narrowing, not a bug.
3. `tsc --noEmit` clean, full suite: 360/362 passing (the pre-existing 2 `supabaseClient.test.ts` failures noted above, unrelated).
4. **Manual live verification — DONE, confirmed working end-to-end.** signup → registration (`signUp`) → admin approval → login (`signIn`) all confirmed through the real app against the live Supabase project; login success correctly proceeds to the app's "Initialize AI Intelligence" onboarding step. Two things surfaced along the way, both understood, neither a code bug:
   - Supabase's own "Confirm email" setting is still **enabled** on the live project, so `signUp()` currently triggers *two* separate emails (Supabase's own confirmation email, and this app's own `send-approval-email` admin-notification) — still recommend disabling "Confirm email" in Supabase (Dashboard → Authentication → Providers → Email) per `DEPLOYMENT_README.md` §1 step 5 (documented there, not yet actually done) to avoid the redundant step for future signups.
   - The actual test registration's admin-approval email never arrived (cause not fully root-caused — a `send-approval-email` diagnostic call with placeholder data sent and delivered successfully immediately after, confirming the Edge Function/secret/inbox all work correctly in general). Worked around by manually toggling `is_approved = true` for the test row directly in Table Editor rather than via the email link — equivalent effect, since that's all the "Approve Scholar" link does server-side. This directly motivated the bug fix in the follow-up pass below (item 1).

**Follow-up pass — DONE, verified live: email-status bug fix + countryCode fix + dead-code removal.** Same characterization-test-first discipline as the cutover above (tests locked in current behavior, including the bugs, before any fix landed; updated only where behavior intentionally changed).
1. **Silent email-failure bug — fixed** in `signUp()`, `requestPasswordReset()`, `requestProfileUpdate()` (`supabaseAuthService.ts`): all three previously only checked `supabase.functions.invoke()`'s transport-level `error`, never the Edge Function's own returned body — a function that ran but failed to actually send via Resend internally reported blanket success with no warning. Now checks `data.emailSent === false` too and returns `{success: true, error: "..."}` (still not a hard failure — the underlying action, e.g. account creation or reset-staging, did succeed) with an honest caveat message. `UserProfileGate.tsx`'s `handleForgotPasswordSubmit` updated to surface `result.error` on success (mirrors the pattern `handleVerifyDualOtp` already had for `signUp`). `requestProfileUpdate`'s fix has no visible UI effect yet since its caller (`ProfileSettings.tsx`) isn't cut over — still fixed for correctness.
2. **countryCode dropdown bug — fixed**: the phone number sent to `signUp()` previously ignored the selected country-code dropdown entirely (`phone.trim()` alone). `handleVerifyDualOtp` now builds it as `` `${countryCode}${phone.trim()}` `` before stripping formatting characters. Verified live: a non-default country code now shows up correctly in the stored `profiles.phone` value.
3. **Dead code removed** (approved list, nothing more): `socialModal`/`customGoogleEmail`/`customGoogleName`/`showCustomGoogleForm` (unused state), `comparePhoneNumbers`/`cleanPhoneNumber` (unused helpers), the `rememberDevice` checkbox (bound but never read), and **all** Facebook + Twilio + WhatsApp code — `triggerFacebookSignIn`, the `window.FB` SDK calls, the `"facebook"` branch of `handleSocialSignIn` (now Google-only, signature simplified), the Facebook/Twilio config-prompt-modal branches, and the corresponding fields in `App.tsx`'s separate developer-settings panel (`facebookId`, `twilioSid`/`twilioToken`/`twilioFrom` state, their input fields, and the description copy mentioning them). Google OAuth fully untouched and confirmed still working live. `promptKeyType`'s type narrowed from `"google" | "facebook" | null` to `"google" | null`.
4. Characterization suite: 4 new tests added (countryCode behavior, forgot-password error-surfacing, 2 Google OAuth tests) plus 3 new `supabaseAuthService.test.ts` tests (one per fixed function) — all written against CURRENT behavior first (including the bugs), confirmed passing, then updated to the fixed expectations after implementing. `tsc --noEmit` clean; full suite 367/369 passing (same 2 pre-existing, unrelated `supabaseClient.test.ts` failures as before).
5. **Manual live verification — DONE**: signup with a deliberately-broken `RESEND_API_KEY` (confirmed the new honest failure banner appears instead of silent success, then the real key was restored), a normal successful signup, a signup with a non-default country code (confirmed via `profiles.phone` in the database), and a real Google OAuth login (confirmed untouched, still works).

**"Clear Saved API Keys" / "Remove All Users" — resolved by removal, not gating.** Both buttons (and their handlers) deleted entirely from `UserProfileGate.tsx` — no unauthenticated user can trigger either action anymore. Considered building an actual admin-gated surface to house them instead, but there is no admin-auth infrastructure anywhere in this app today (no `is_admin` flag check, no admin route) — building that was explicitly declined as out of scope for a quick fix; confirmed "remove only, for now" instead. If admin-side equivalents of these actions are wanted later, that's a new, separately-scoped feature, not a relocation.

**Wording fix — DONE**: "for Doctoral Scholars" → "for Scholars" in `UserProfileGate.tsx`.

**Password-reset switch to Supabase's `resetPasswordForEmail` — CODE DONE, UNIT-TESTED, CONFIRMED WORKING for the sandbox's allowed recipient; full verification pending Resend custom-domain setup (root cause identified, not a code problem — see item 11).** Replaces the custom admin-approval-gated reset per the long-confirmed design decision.
1. `supabaseAuthService.ts`: `requestPasswordReset` removed, replaced with `sendPasswordResetEmail(email)` (calls `supabase.auth.resetPasswordForEmail`) and `updatePassword(newPassword)` (calls `supabase.auth.updateUser`), plus `onPasswordRecovery(callback)` (wraps `supabase.auth.onAuthStateChange`, fires on the `PASSWORD_RECOVERY` event).
2. `UserProfileGate.tsx`: forgot-password form simplified to email-only (no more username/new-password fields — Supabase enforces the link only reaches the real account email, closing the old arbitrary-email gap directly). New "Set New Password" screen added, shown via the `PASSWORD_RECOVERY` listener.
3. **Real bug found and fixed during live testing**: Supabase's recovery redirect lands with `#access_token=...&type=recovery` in the URL — the *same* hash shape as the pre-existing Google OAuth callback handler expects. That handler grabbed any `access_token` unconditionally and stripped the hash via `history.replaceState` before Supabase's own client library could read it, silently breaking recovery (user landed back on the plain login screen with no error). Fixed by checking `type=recovery` to disambiguate; only handles the hash as Google's callback when it isn't a Supabase recovery redirect. Regression test added (`UserProfileGate.test.tsx`, simulates the colliding hash, asserts the Google-callback fetch never fires).
4. Tests: 22 component tests (`UserProfileGate.test.tsx`) + 18 service tests (`supabaseAuthService.test.ts`) passing. `tsc --noEmit` clean. Full suite 372/374 (same 2 pre-existing, unrelated `supabaseClient.test.ts` failures as always).
5. ~~**Live verification status**: ... testing hit Supabase's built-in email rate limit before that could happen.~~ **Superseded (2026-07-22)** — see item 9 below: the rate limit is no longer the blocker (SMTP is now configured), but live verification is **still incomplete**, now blocked on a different, new issue.
6. ~~**Custom SMTP (Resend) — explicitly deferred**...~~ **Superseded (2026-07-22)**: SMTP is now configured and saved in Supabase (Dashboard → Authentication → Providers → Email → SMTP settings). See item 9 for what this did and didn't unblock.
7. **Dead code from the old flow, not yet removed**: `supabase/functions/request-password-reset`, `approve-password-reset`, and the `pending_password_resets` table are now genuinely unused — safe to remove once the new flow is fully live-verified, not before. **Still not removed** — item 11 confirms the root cause is a Resend sandbox restriction, not a code bug, but full verification (any recipient, not just the Resend account's own address) is still pending custom-domain setup, so removal stays deferred until then.
8. **Nothing from this password-reset work is committed yet** — sitting alongside the still-paused, untouched native-skills work (`server.ts`, `researchPlanner.ts`, `skills/types.ts`, `researchPlanningSkill.ts`).
9. **Retried 2026-07-22, after SMTP setup — rate limit is gone, but a new, different blocker surfaced.** Real click-through attempt for `cutovertest1`: "Forgot Password?" → submit real email → **`POST /auth/v1/recover` returned HTTP 500** (`{"code":500,"error_code":"unexpected_failure","msg":"Error sending recovery email"}`), confirmed via direct curl against the same live endpoint, not just the browser. This is **not** the rate limit (that error had different text and a different HTTP status) and **not** a code problem in `sendPasswordResetEmail()` — that function just calls `supabase.auth.resetPasswordForEmail()` directly; the 500 is Supabase's own GoTrue auth service failing server-side to actually dispatch the email through whatever SMTP relay is now configured.
   - **Worth noting precisely, not glossed over**: this is a *different* email-sending path than the one already confirmed working today. `send-approval-email`/`request-profile-update` call Resend's HTTP API directly (see the Edge Function CORS fix above) and are confirmed working live. Supabase Auth's built-in emails (`resetPasswordForEmail`, and presumably the signup confirmation email too) go through a separate SMTP-relay integration configured in the Auth settings — and *that* integration is what's failing, not Resend itself.
   - **Not investigated further, per instruction** — this needs someone with Supabase Dashboard access to check the actual SMTP host/port/credentials entered (Resend's SMTP relay is `smtp.resend.com`, username `resend`, password = a Resend API key — a mismatch on any of these would produce exactly this generic `unexpected_failure`) — not something guessable or fixable from the application code side.
   - ~~**Full click-through ... still not confirmed live.** ... **Decision needed**...~~ **Resolved — see item 11**: root cause confirmed as a Resend sandbox-sender restriction, not an SMTP misconfiguration.
10. **Retried again 2026-07-22 after SMTP settings were reconfirmed correct in the Dashboard** (Authentication → Emails → SMTP Settings — Custom SMTP on, sender `onboarding@resend.dev`, host `smtp.resend.com`, port 465, username `resend`, password re-checked). **Identical failure** — same `500` / `unexpected_failure` / "Error sending recovery email", confirmed again via direct curl.
    - **One more diagnostic narrowed down *where* it fails, without guessing a fix**: the same `/auth/v1/recover` endpoint called with a deliberately nonexistent email returned a clean `HTTP 200 {}` — Supabase's recover endpoint is designed to always report success for a nonexistent email (anti-enumeration; it never attempts a real send in that case). This confirms the route, auth service, and request handling are all healthy — the failure happens specifically when GoTrue tries to **actually generate and dispatch the email for a real, existing account**, i.e., at the SMTP send step itself, not before it. Rules out a broad misconfiguration or a dead endpoint; does not by itself distinguish between the three candidates below.
    - **Three live candidates, none confirmed**: (a) Resend's sandbox sender (`onboarding@resend.dev`) is documented to only reliably deliver to the Resend account's own registered address — if `cutovertest1@gmail.com` isn't that address, Resend could be rejecting the send; (b) a Resend API key issue (revoked/invalid despite being "re-checked"); (c) a port/TLS mismatch between what GoTrue's SMTP client expects and what's configured (port 465 implies implicit TLS from connection start, vs. 587's STARTTLS — a mismatch here can also surface as a generic failure). Given host/port/username were all reconfirmed correct and the error is unchanged, this now points **away from a simple config typo** and toward one of these three.
    - ~~**Next step, in progress, not yet done**: checking Resend's own Dashboard delivery log...~~ **Superseded by a more direct test — see item 11.**
11. **Root cause confirmed (2026-07-22): Resend's shared sandbox sender, not a Supabase/SMTP config problem.** Instead of relying on Resend's delivery log, ran the more direct test: retried the same reset request but targeted `doc.govinda@gmail.com` — the email address the project's Resend account is itself registered under — instead of `cutovertest1@gmail.com`. **Result: the request succeeded** (no 500). This confirms candidate (a) from item 10 and rules out (b) and (c): `onboarding@resend.dev` (Resend's shared sandbox sender, still in use here since no custom domain is verified yet) can only deliver to the Resend account's own registered address — sending to any other recipient is rejected server-side by Resend, which GoTrue then surfaces to the client as the generic `unexpected_failure` / "Error sending recovery email." Not a Resend API-key problem, not a port/TLS mismatch, not a Supabase-side bug or a code bug in `sendPasswordResetEmail()`.
    - **What this confirms directly**: the `/auth/v1/recover` request path, GoTrue's handling of it, and the SMTP relay wiring to Resend are all functioning correctly once the recipient is one the sandbox sender is allowed to send to. What this does *not* re-confirm in this pass: the full downstream click-through (opening the received email, landing on the recovery screen, setting a new password, logging in with it) for `doc.govinda@gmail.com` specifically — that exact screen-by-screen path was already built, unit-tested, and previously fixed for a real bug (item 3's Google-OAuth-callback hash collision), so there's high confidence it completes correctly, but it wasn't separately re-walked live in this round beyond confirming the initial send no longer 500s.
    - **Fix, not urgent, already planned**: verify a custom domain in Resend (resend.com/domains), then update the SMTP sender in Supabase (Authentication → Emails → SMTP Settings) from `onboarding@resend.dev` to an address on that verified domain. Deferred until a domain is available — this was already the user's own stated plan, not a new decision.
    - **Status going forward**: the password-reset code and flow are correct and complete. The only remaining gap is Resend's sandbox restriction on the *current* sender address, which is a provisioning/domain-ownership matter, not an application bug. Treat this as "confirmed working for the sandbox's allowed recipient; full verification (any real user's email) pending Resend custom-domain setup" — not "blocked" or "broken."

**Still not done, unchanged**: `server.ts`'s old ~1,050 auth/user/admin lines are untouched, deliberately (all three UI components are cut over now, but the old Express routes stay until a live-verification pass confirms nothing still depends on them). BYOK vault-passphrase encryption — still not implemented, still its own separate future task, unaffected by any of the above. "Admin-gate destructive actions" — no longer applicable; those actions were removed entirely instead (see the Twilio/Facebook-removal pass above).

**Next session's actual first task**: no longer a live-verification blocker — item 11 above confirms the password-reset code and flow are correct; the `POST /auth/v1/recover` 500 was root-caused to Resend's shared sandbox sender only accepting deliveries to the Resend account's own registered address, not a Supabase/SMTP config problem. Two things remain, both non-urgent and sequenced after a custom domain is verified with Resend: (1) do one full screen-by-screen click-through (recovery link click → set new password → log in) against a real, non-sandbox recipient once that domain is live, purely to close out the loop already covered by unit tests; (2) only then remove the now-dead `request-password-reset`/`approve-password-reset` Edge Functions and the `pending_password_resets` table (item 7 above).

**Auth/profile Supabase cutover — COMPLETE (2026-07-22).** `UserProfileGate.tsx`, `ProfileSettings.tsx`, and `AIControlCenter.tsx` all now call `supabaseAuthService.ts` instead of `fetch("/api/*")`. Same characterization-test-first discipline as every prior pass in this file.
1. **Step 1 (API-call inventory) found one real gap, fixed in the service layer, not inline**: `requestProfileUpdate()` existed but dropped `keyHash` — the old `/api/request-profile-update` route computed a SHA-256 hash of the verification key server-side and returned it; the Edge Function it now calls only returns the plain `verificationKey`. Fixed by computing the hash client-side in `requestProfileUpdate()` itself (same `crypto.subtle.digest` algorithm `ProfileSettings.tsx` already used), extending its return type rather than touching the component. `saveModelPreferences`/`saveApiKeys` needed no changes — already session-based (resolve the user from the active Supabase session, not a passed `username`), a strict improvement over the old username-in-body pattern.
2. **Tests**: `ProfileSettings.test.tsx` (12 tests) and `AIControlCenter.test.tsx` (5 tests), each written first against the OLD `fetch` code, confirmed passing there, then updated in place to mock `supabaseAuthService.ts` after the rewire — same assertions, only the mock layer changed. Plus 2 new `supabaseAuthService.test.ts` tests for the `keyHash` computation. `tsc --noEmit` clean; full suite 440/442 (same 2 pre-existing, unrelated `supabaseClient.test.ts` failures as every check in this file).
3. ~~**Two/three real, pre-existing UI bugs found and characterization-tested (locked in as current behavior), deliberately NOT fixed — out of scope for a data-layer swap**...~~ **Superseded (2026-07-23): all three fixed, see the "Open threads" line at the top of this file for commit hashes.** (The third bug's actual root cause turned out to be `handleRequestUpdate`'s phone/country-code concatenation never checking for a redundant prefix already typed into the phone-number field, not a prefix-matching failure in `loadProfileData()` as originally guessed — confirmed by reproducing the exact reported string in a test before fixing.)
4. **Live verification — DONE**, real Supabase project (`gfjhsijrwodjvkisouzw`), confirmed via network log and direct curl: login as a genuinely new account; model-preference change → `PATCH /rest/v1/profiles` → 204; API-key save → `DELETE`/`POST /rest/v1/api_credentials` → 204/201; profile-update-request → full round-trip after the Edge Function fix below (real verification key returned, pending-approval screen shown correctly). Admin approve/reject/cancel/verify-key are pure localStorage with zero Supabase dependency — not re-verified live beyond the existing 12 passing component tests, since there's no network behavior to newly confirm there.
5. **Edge Function CORS bug — found, diagnosed, fixed, deployed, live-verified.** Both `send-approval-email` (hit during registration, earlier this session) and `request-profile-update` (hit during this cutover's live verification) were returning `EDGE_FUNCTION_ERROR` (HTTP 500) — **one shared root cause, not two unrelated bugs**: neither function checked the request method before calling `await req.json()`. A browser's CORS preflight (`OPTIONS`, empty body) hit that line and threw a `SyntaxError`, which Supabase's edge runtime surfaces as a bare 500 with no application-level message. Neither function's response ever carried `Access-Control-Allow-Origin` either, so even a successful preflight wouldn't have helped — a real browser would still have blocked reading the response. This is exactly why a direct `curl POST` (which never triggers a preflight, unlike a real browser `fetch()`) looked completely fine the whole time: **the bug is invisible to anything that doesn't go through an actual browser-enforced CORS preflight**, which is also why it was never caught by this project's `tsc`/`vitest` (`supabase/functions` is a separate Deno runtime, deliberately excluded from both).
   - **Fix**: new `supabase/functions/_shared/cors.ts` (shared `corsHeaders` + a `handleCorsPreflight(req)` short-circuit), wired into both functions ahead of their `req.json()` call. `approve-registration` and the two dead password-reset functions were **not** touched — `approve-registration` is only ever reached via a direct browser navigation (an email-link click), which isn't subject to CORS at all, so it was never actually broken; the password-reset functions are confirmed dead code already scheduled for removal.
   - **No automated regression test was added** for this specific fix — `supabase/functions` sits outside this project's Vitest/tsc boundary by deliberate, already-documented design (see the tsconfig.json exclusion), so there's no existing harness to add a Deno-runtime test into without introducing new tooling, which wasn't in scope here. Verified instead via live `curl` (both `OPTIONS` and `POST`, both functions, confirmed correct headers and bodies) and a full real-browser round-trip through the running app. If a persistent Deno-test harness for `supabase/functions` is wanted, that's a separate, reasonably-sized follow-up task, not something folded into this fix.
   - Deployed via `supabase functions deploy <name> --use-api` (no Docker, same pattern as the original go-live).
6. **Commits**: `380aea2` (the cutover itself) and `39d47d5` (the Edge Function CORS fix), kept separate per the established one-fix-per-commit pattern this session.

~~**Still paused, unchanged, not part of any of the above**: the native-skills agent-wiring rollout...~~ **Superseded (2026-07-23): COMPLETE — see the dedicated section below.**

**Next proposed step after live provisioning is done (not started): Phase 2 — AI Gateway Tiers 2 and 3** (free-tier BYOK, heavy BYOK), per `docs/planning/hosting-and-topology.md` §7's proposed sequencing — lowest technical risk of the remaining AI Gateway work, reusing `src/services/aiGateway.ts`'s existing provider adapters. Do not start until Phase 1's live verification and the UI-cutover risk (item 2 above) are resolved.

~~**Also still paused, unchanged**: the in-progress native-skills agent-wiring rollout...~~ **Superseded (2026-07-23): COMPLETE — see the dedicated section below.**

---

## Native-Skills Agent Rollout — COMPLETE (2026-07-23)

All 8 scholarly agents are now wired to the Skills Framework, following the exact pattern proven on `ResearchPlannerAgent` (`2e5e9fb`/`f0bfdee`): characterization tests against current behavior first, deterministic logic extracted verbatim into a new `src/skills/*Skill.ts`, agent's `execute()` rewritten to delegate via `context.runSkill(skillId, input)` with a `!context.runSkill` regression guard, tests updated to exercise the real `SkillRegistry`/`SkillExecutor` round trip (not mocked), `tsc --noEmit` + full suite clean after every single agent, and a real (non-mocked) live-verification script run and deleted before each commit. One agent per commit throughout, matching the established discipline.

**Agents wired, in order**: `LiteratureReviewAgent` → `KnowledgeGapAgent` → `ResearchQuestionAgent` → `MethodologyAdvisorAgent` → `StatisticalAnalysisAdvisor` → `IntegrityReviewerAgent` → `ManuscriptWriterAgent` (plus `ResearchPlannerAgent`, already done in the prior pass this rollout resumed from).

**Fabrication audit, run agent-by-agent as part of this rollout** — 3 more confirmed instances found and fixed, 3 more found and flagged (not fixed):

- **Fixed (reused the already-built `journalRetrievalService.discoverJournalCandidates` — real Crossref/OpenAlex/DOAJ retrieval, no new service needed)**:
  - `LiteratureReviewAgent.recommendJournals()` — was hardcoded `["Nature", "Science", "IEEE Transactions"]`. Now queries discipline-first, research-question fallback, honest `[]` on failure. Live-verified (real topic "renewable energy policy" → real journal names).
  - `KnowledgeGapAgent.generateRecommendations()`'s `journals` field — same stub, same fix. Query from the research plan's project summary, falling back to the literature review's first gap's search terms. Live-verified (real topic "marine biodiversity conservation" → a real journal name).
- **Flagged, not fixed — added to `target-workflow.md`'s fabrication-audit list (§10), each needs its own dedicated future task**:
  - `ResearchQuestionAgent`'s `recommendedDatasets: ["dataset-1"]` — hardcoded single-item stub. No existing dataset-discovery retrieval service to reuse (unlike the journal cases) — building one is new-feature work, not a same-effort swap.
  - `IntegrityReviewerAgent.evaluateReportingCompliance()` — returns an **identical** hardcoded CONSORT/STROBE/PRISMA compliance report (same 75% completion, same compliant/missing items) regardless of `manuscriptText` — never actually inspects it. Arguably worse than the journal-list cases since it falsely implies a real evaluation of the user's actual manuscript. Needs real text/structure analysis of `manuscriptText`, not external retrieval — `aiService.ts`'s `analyzeManuscriptStructure` is the closest existing deterministic analog but operates on a different input shape (`PaperProject.sections`/`complianceRules`, not a plain string), so it isn't a direct reuse either.
  - (Audited `MethodologyAdvisorAgent` and `StatisticalAnalysisAdvisor` too — no fabrication found in either; their `recommend*` methods are generic methodology/software-category advice, the same "legitimate judgment task" category `target-workflow.md` §10 already ruled out, not fabricated verified facts. `ManuscriptWriterAgent` was already following the honest-gap pattern *before* this rollout touched it — untouched, real placeholder text like "to be determined"/"to be completed" when an upstream artifact isn't attached yet, never invented content.)

**Not touched, deliberately, per this rollout's own scope**: the search-vendor decision, the fetch/search proxy work, Stage 4-6 work (already done in an earlier pass today), and UI bug cleanup — none of that was in scope here and none of it was touched.

**Commits** (one per agent, `docs/planning/target-workflow.md` updated once at the very end covering all three findings from this pass, not per-agent): `b3d349f` (LiteratureReviewAgent), `a8dbf3a` (KnowledgeGapAgent), `ff8fd7b` (ResearchQuestionAgent), `8edfdb9` (MethodologyAdvisorAgent), `c53afec` (StatisticalAnalysisAdvisor), `765d503` (IntegrityReviewerAgent), `f148bb8` (ManuscriptWriterAgent).

**Still not done, unchanged by this rollout**: `agentService.ts`'s `executeAgent()`/`listAgents()` are still not called from any UI component — this whole stack (all 8 agents + skills) remains reachable only via direct in-process calls (tests, or a script like the live-verification ones used throughout this pass), not from the running app. Wiring a real UI surface to it is a separate, not-yet-scoped future task.

---

## 0. Repository Migration Note (2026-07-20) — READ FIRST

This is a **fresh repository**, copied from an older working directory
(`/Users/pobpkf/Documents/Doctoral-Research-and-Journal-Publication-Assistant 4.43.36 PM`)
because that location's Claude Code session had a persistent bug where the
`Write` tool could not create new files (reported success but the file never
actually existed on disk, confirmed via both `Bash` and `Read`). That bug
does **not** reproduce in this new location — new-file creation was
verified working here before this note was written.

**Do not repeat completed work.** The old repository had already been through
multiple audit/stabilization/convergence sessions before this migration. This
copy excluded that session's audit-report clutter (`ARCHITECTURE_SYNCHRONIZATION_REPORT.md`,
`ENGINEERING_*_REPORT.md`, etc.) and a few non-code items (`.env`, `users.json`,
a local AI model binary, stray duplicate scaffold folders) — none of that
represents unfinished engineering work, just prior audit trail. If you need
that history, it still exists at the old path above.

**Verified state as of this commit**: 0 TypeScript errors, 18 test files /
330 tests passing (`npx vitest run`), production build succeeds
(`npm run build`), server boots and serves real requests (health check).
Note: `/api/agents` does not exist — `server/routes/` only registers `ai.ts`,
`auth.ts`, and `parser.ts`. The `src/agents/` scholarly agents and
`src/orchestrator/` workflow engine are implemented but are not imported by
`server.ts` or any route, so they are not reachable from the running app yet
(see the kernel-wiring note below).

**Fixed during migration** (both bugs are resolved, not open items):
- `src/ai/` (the AI Kernel) was accidentally omitted by an overly-broad
  copy-exclude pattern — restored and verified.
- `uuid` (used by `src/orchestrator/*`) was an undeclared/phantom dependency
  that only worked in the old repo by accident (already sitting in its
  `node_modules`) — now a proper `package.json` dependency.
- BibTeX/RIS citation import logic, previously stuck inline in `server.ts`
  as a workaround while file-creation was blocked, has been moved to its
  proper home: `src/citation_compliance/importers/` (with tests).

**Suggested next steps** (not started yet, from the prior session's audit):
Knowledge Graph (`src/knowledge/graph/KnowledgeGraph.ts`) is fully
implemented but has no adapter connecting it to any live UI or service —
genuinely disconnected, not a quick fix; would need a product decision on
what it should actually show before wiring it up. The same is true, more
broadly, of most of the "Operating System" kernel layer: grepping the
codebase for each kernel class shows `KnowledgeKernel`, `WritingKernel`,
`PublicationKernel`, `WorkspaceKernel`, and `CollaborationKernel` are only
referenced inside their own module (definition + barrel `index.ts`) — no
import from `server.ts`, `server/routes/`, `src/App.tsx`, or
`src/components/`. `AIKernel` is the exception: `src/research/` consumes it.
`src/orchestrator/` (MultiAgentOrchestrator, WorkflowEngine) and
`src/agents/` (the eight scholarly agents) are likewise fully implemented
and tested but never imported by the running server or UI. None of this is
broken — it's substantial, working library code — but earlier drafts of
this document described it as production-integrated, which overstates its
current reach. Treat "wire an OS kernel / agent / orchestrator into the
live app" as real, unstarted product work, not a loose end to tidy up.
Beyond that, continue the established pattern from this project's
engineering history: prefer deterministic Scholar Core OS processing over
AI where structured data already exists, and validate every change with
`npx tsc --noEmit`, `npx vitest run`, and `npm run build`.

---

## 1. Executive Summary

- **Project Name**: Scholar Agentic Operating System
- **Current Maturity**: v1.0.0 LTS Release
- **Primary Purpose**: AI-native operating system for academic research and journal publication
- **Development Stage**: Phase 6 (Document Intelligence) in progress; Phases 7-10 planned
- **Production Readiness**: Build system stable, 330 tests passing, PWA implemented, authentication ready

---

## 2. Repository Overview

### Major Directories

```
src/
├── ai/                    # AI Operating System (providers, router, cache, telemetry) — kernel: AIKernel
├── research/              # Research Operating System (discovery, analyzers, evidence) — ResearchIntelligenceEngine, no Kernel class
├── knowledge/             # Knowledge Operating System (graph, semantic memory, KQL) — kernel: KnowledgeKernel
├── knowledge_vault/       # Document repository/indexing service (distinct from knowledge/)
├── writing/               # Writing Operating System (drafting, citations) — kernel: WritingKernel
├── publication/           # Publication Operating System (journals, workflow) — kernel: PublicationKernel
├── workspace/             # Workspace Operating System (projects, lifecycle) — kernel: WorkspaceKernel
├── collaboration/         # Collaboration Operating System (teams, roles) — kernel: CollaborationKernel
├── orchestrator/          # Multi-agent workflow engine (MultiAgentOrchestrator, WorkflowEngine, execution/approval/retry)
├── agents/                # Scholarly agents (research planner, literature review, methodology advisor, manuscript writer, ...)
├── document_intelligence/ # Document parsing pipeline (PDF/DOCX/TXT/Markdown → Canonical Document Model)
├── citation_compliance/   # Citation & academic compliance engine (APA7/IEEE/MLA9/Chicago/Harvard/Vancouver)
├── auth/                  # Authentication UI (LoginScreen, authContext, useAuth)
├── lifecycle/             # ResearchLifecycleEngine (10-phase workflow state machine)
├── core/                  # Shared foundation, incl. core/manuscript and core/project
├── components/            # React UI components
├── hooks/                 # Custom React hooks
└── services/              # Service layer integrations

server/                    # Express backend — routes/ (ai, auth, parser), services/, middleware/, data/ (storage layer)

docs/
├── architecture/ # core architecture documents
├── adr/        # architecture decision records
└── development/  # Developer handbook, sprint guides

.claude/        # AI handover documentation (this folder)
```

### Documentation Structure

- `README.md` — Project overview and quick start
- `CHANGELOG.md` — Release history and changes
- `docs/architecture/` — System design documentation
- `docs/adr/` — Architectural decisions
- `.claude/` — AI development handover documents

### Source Layout

Each operating system follows consistent patterns with `core/`, `types/`, and `index.ts` barrel files. Components are in `src/components/`, hooks in `src/hooks/`.

### Test Organization

Tests located in `__tests__/` directories adjacent to source code. Integration tests for cross-module workflows.

### Configuration Files

- `package.json` — Dependencies and scripts
- `tsconfig.json` — TypeScript configuration
- `vite.config.ts` — Vite build configuration
- `.env.example` — Environment variable template

---

## 3. Current Implementation Status

### Operating Systems

| OS | Status | Wired into running app? | Notes |
|----|--------|--------------------------|-------|
| AI OS | ✅ Implemented | Yes — consumed by `src/research/` | Provider abstraction, fallback chains, caching |
| Knowledge OS | ✅ Implemented | No | KnowledgeKernel, KnowledgeGraph, SemanticMemory — only referenced within `src/knowledge/` |
| Research OS | ✅ Implemented | Partially — depends on AIKernel, but not called by `server.ts`/UI | ResearchIntelligenceEngine, evidence workspace |
| Writing OS | ✅ Implemented | No | Manuscript drafting, citation generation — only referenced within `src/writing/` |
| Publication OS | ✅ Implemented | No | Journal management, recommendations — only referenced within `src/publication/` |
| Workspace OS | ✅ Implemented | No | Multi-project support, lifecycle — only referenced within `src/workspace/` |
| Collaboration OS | ✅ Implemented | No | Teams, roles, permissions — only referenced within `src/collaboration/` |

The live product (`server.ts` + `src/App.tsx`/`src/components/`) actually runs on `src/services/aiGateway.ts` + `src/services/aiService.ts`, `src/auth/` (localStorage-backed), and `src/core/project` (`ProjectBuilder`) — a simpler, more conventional stack than the kernel model above describes. See the kernel-wiring note in section 0.

### Architecture

- ✅ Clean Architecture compliant
- ✅ Kernel-based design implemented
- ✅ Dependency Injection in place
- ✅ Event-driven ready
- ✅ No circular dependencies
- ✅ Architecture audit complete

### Documentation

- ✅ 5 Architecture Documents
- ✅ 10 ADRs
- ✅ Developer Handbook
- ✅ AI handover documents (`.claude/`)

### PWA

- ✅ Service worker (`sw.js`)
- ✅ Web manifest (`manifest.json`)
- ✅ Offline-first architecture

### Research Lifecycle

- ✅ 10-phase workflow defined in `src/lifecycle/ResearchLifecycleEngine.ts` — **but nothing imports this file outside itself**; it is not the workflow the running app actually uses.
- ⚠️ The live UI runs a *different*, lettered phase model: `src/types.ts` defines `currentPhase: "A" | "B" | "C" | "D" | "E" | "F" | "G" | "G1" | "G2" | "H" | "I"`, and `src/components/*` + `src/services/aiService.ts` hardcode phase labels against those letters (B = Dissertation Grounding, C = Data/Source Discovery, D = Journal Discovery, E = Compliance Setup, F = Manuscript Co-Drafting, G = Quality Control, H/I = Submission Packaging & Tracking). When a doc or a user says "Phase 6" or "Phase F", confirm which of the two models they mean before acting — they are not the same numbering.
- ✅ State persistence implemented (client-side, via `authContext.tsx` + localStorage, and server-side via `server/data/`)
- ✅ Evidence-controlled reasoning (in the disconnected `src/knowledge/reasoning` module)

### Testing

- ✅ 330 automated tests passing (18 test files)
- ✅ Unit tests for all kernels
- ✅ Integration tests for OS modules

### Build

- ✅ Vite build system operational
- ✅ TypeScript strict mode
- ✅ Tailwind CSS v4 integrated

### Current Repository Maturity

Stable foundation with active Document Intelligence development. Ready for new feature development within established patterns.

---

## 4. Major Features

### AI Operating System
- Multi-provider AI (OpenAI, Anthropic, Gemini, Ollama, LM Studio)
- AIRouter with fallback, caching, telemetry
- ModelRegistry, TaskRouter, PolicyEngine
- Cost tracking and rate limiting

### Knowledge Operating System
- KnowledgeRegistry for object management
- KnowledgeGraph for relationships
- SemanticMemory for vector search
- KQL (Knowledge Query Language) for querying
- ReasoningEngine with deductive/inductive/abductive reasoning

### Research Operating System
- ResearchIntelligenceEngine for analysis
- Literature discovery providers
- Evidence review workspace
- Framework generation
- Methodology recommendation
- Novelty analysis

### Writing Operating System
- Manuscript drafting
- Outline generation with templates
- Citation compliance (APA 7th, IEEE, MLA 9th, Chicago, Harvard, Vancouver)

### Publication Operating System
- Journal database with metadata
- Journal recommendations
- Impact factor-based ranking
- Publication workflow

### Workspace Operating System
- Multi-project management
- Project lifecycle (draft → active → completed → archived)
- State persistence

### Collaboration Operating System
- Team management
- User roles
- Shared workspace features

---

## 5. Architecture Summary

### Operating System Model

Scholar follows an operating system model where each domain (AI, Research, Knowledge, Writing, Publication, Workspace, Collaboration) operates as an independent layer. Layers communicate through well-defined interfaces.

### Kernel Abstractions

Each OS layer implements the `Kernel` interface:
```typescript
interface Kernel {
  initialize(): Promise<void>;
  shutdown(): Promise<void>;
  health(): Promise<HealthStatus>;
  configuration(): KernelConfig;
  capabilities(): KernelCapabilities;
  execute<T>(input: T): Promise<T>;
  events(): EventBus;
  metrics(): Metrics;
}
```

### Research Lifecycle

Ten-phase structured workflow:
1. Research Intake
2. Literature Review
3. Research Planning
4. Methodology Design
5. Data Analysis
6. Draft Writing
7. Manuscript Refinement
8. Compliance Checking
9. Publication Preparation
10. Publication Submission

### AI Abstraction

Multi-provider architecture with:
- `AIProvider` interface for all providers
- `AIRouter` for fallback chains
- Caching and telemetry built-in

### Knowledge Graph

Knowledge objects with:
- UUID identity
- Metadata and relationships
- Lifecycle management
- Confidence scoring

### Workspace Organization

Projects contain:
- Research questions
- Evidence
- Knowledge objects
- Manuscripts
- Publications

---

## 6. Development Environment

### Primary Language
- **TypeScript** (strict mode enabled)

### Frameworks
- React 19 with hooks
- Vite for build
- Express.js for backend API

### Package Manager
- npm (with `package-lock.json` committed)

### Build System
- Vite development server
- TypeScript compiler
- Tailwind CSS v4

### Testing Framework
- **Vitest** (`npm test` runs `vitest run`; `test:coverage` runs `vitest run --coverage`)
- Jest appears in `devDependencies` but is not the active runner — treat as legacy/unused unless confirmed otherwise
- Unit and integration tests, 18 `*.test.ts` files on disk, 330 tests passing

### Development Tools
- ESLint (recommended for consistency)
- VS Code with TypeScript extension

### IDE Recommendations
- VS Code with ESLint and TypeScript plugins
- Prettier for formatting

### Current Git Strategy
- Local repository active
- Branch: `main`

---

## 7. Build & Verification

### Build Command
```bash
npm run build
```

### Development Command
```bash
npm run dev
```

### Test Command
```bash
npm test
```

### Expected Results
- Build completes without errors
- All tests passing (330 tests)
- No TypeScript errors in strict mode

### Current Verification Status
- Build system operational
- Tests passing
- PWA verified
- ESLint configuration pending

---

## 8. Repository Health

### Architecture Maturity
- Foundation stable and audited
- Kernel patterns consistent
- Dependency rules enforced

### Documentation Coverage
- Architecture: Complete (5 documents)
- ADRs: Complete (10 records)
- AI handover: Complete (`.claude/` folder)

### Testing Maturity
- 330 tests passing
- Unit test coverage for kernels
- Integration test coverage

### Build Reliability
- Build succeeds consistently
- TypeScript strict mode enforced
- Tailwind CSS v4 integrated

### Technical Debt
- Minor: Inline style migration, test coverage gaps
- Medium: Git cleanup pending
- Major: Document Intelligence mid-implementation

### Maintainability
- Clean architecture patterns
- Consistent naming conventions
- Modular design enables independent changes

### Scalability
- Provider abstraction supports scaling
- Kernel model enables horizontal growth
- Event system enables parallel development

### Overall Readiness
Production-ready foundation with active feature development.

---

## 9. Known Limitations

### Authentication & Security
- Authentication UI and backend routes exist (`src/auth/`, `server/routes/auth.ts`, `server/middleware/authRateLimiter.ts`, `server/utils/apiKeyCrypto.ts`) — maturity/completeness not verified at source level in this pass
- API keys stored encrypted (WebCrypto API)
- Rate limiting on backend endpoints

### Cloud Features
- Cloud synchronization not yet implemented
- Offline-first with local storage only

### Enterprise Capabilities
- Multi-tenancy not implemented
- Audit logging not yet implemented
- RBAC designed but not enforced

### Mobile Support
- Native mobile apps not yet implemented
- Responsive web UI only

### Plugin Ecosystem
- Plugin architecture ready but no marketplace

### See Also
- `KNOWN_LIMITATIONS.md` for detailed limitations
- `FUTURE_ENHANCEMENTS.md` for future capabilities

---

## 10. Immediate Development Priorities

### Priority 1: Document Intelligence Cycle 1 (In Progress)
**Why**: Enables evidence extraction from user-uploaded documents, essential for completing the evidence pipeline.
**Status**: Active development (Document Intelligence, `src/document_intelligence/`)

### Priority 2: Architecture Stabilization (E01)
**Why**: Unblocks security foundation and refactoring tasks.
**Components**: T001 (CDM Resolution), T002 (Event Dispatcher), T003 (Secure Encryption)

### Priority 3: Security Foundation (E02)
**Why**: Essential for production deployment and user trust.
**Components**: T004 (API Keys), T005 (CSRF), T006 (Rate Limiting)

### Priority 4: Codebase Refactoring (E03)
**Why**: Improves maintainability and follows established patterns.
**Components**: T007, T008

---

## 11. Risks

### Architectural Drift
**Risk**: Future changes may violate established module boundaries.
**Mitigation**: Review against `ARCHITECTURE_RULES.md` before merging.

### Documentation Gaps
**Risk**: Implementation may outpace documentation.
**Mitigation**: Update docs as part of every significant change.

### Large Reviews
**Risk**: Monolithic changes difficult to review and debug.
**Mitigation**: Make small, incremental changes with clear commits.

### Dependency Upgrades
**Risk**: Newer versions may break established patterns.
**Mitigation**: Test thoroughly before upgrading; pin versions.

### Scalability Concerns
**Risk**: Performance may degrade with large datasets.
**Mitigation**: Profile before optimizing; design for horizontal scaling.

---

## 12. Handover Notes

### Essential Reading
1. Review `docs/architecture/01-Scholar-Platform-Constitution.md` for vision and principles
2. Review `docs/architecture/02-Scholar-System-Architecture.md` for system design
3. Review `docs/adr/ADR-0001-ScholarKernel.md` through `ADR-0010-MultiProviderAI.md` for decisions
4. Read `.claude/CLAUDE.md` for AI operating procedures
5. Read `.claude/ARCHITECTURE_RULES.md` for architectural constraints

### Do's
- ✅ Extend existing modules before creating new ones
- ✅ Follow established patterns and conventions
- ✅ Update documentation alongside code
- ✅ Make small, incremental changes
- ✅ Test thoroughly before considering work complete

### Don'ts
- ❌ Redesign completed architecture without approval
- ❌ Remove existing functionality
- ❌ Introduce breaking API changes
- ❌ Duplicate existing modules
- ❌ Bypass established abstractions

---

## 13. Related Documentation Reading Order

### For Understanding
1. `README.md` — Quick overview
2. `.claude/PROJECT_MEMORY.md` — Historical context
3. `docs/architecture/01-Scholar-Platform-Constitution.md` — Vision and principles
4. `docs/architecture/02-Scholar-System-Architecture.md` — Technical architecture
5. `.claude/ARCHITECTURE_RULES.md` — Non-negotiable rules

### For Development
6. `.claude/DEVELOPMENT_GUIDELINES.md` — Coding standards
7. `CHANGELOG.md` — Recent changes
8. `docs/adr/` — Architectural decisions
9. `.claude/HANDOVER.md` — This document

---

## 14. Definition of Successful Handover

A successful handover means:

- ✅ Repository builds successfully (`npm run build`)
- ✅ Architecture is understood and respected
- ✅ Documentation is complete and current
- ✅ Future contributors can work productively
- ✅ Development standards are established and followed
- ✅ Knowledge transfer is preserved in `.claude/` documents
- ✅ No regressions introduced in handover process