# Sci-Fi Redesign — Progress Log

Tracks execution of `docs/planning/sci-fi-redesign-scoping.md`'s ordered
step sequence. One entry per step, updated as each completes. Do not
re-scope here — this is a status log, not a design doc.

| # | Step | Status | Commit |
|---|------|--------|--------|
| 1 | `src/index.css` + `AppHeader.tsx`/`AppFooter.tsx` (global chrome, new tokens, `:focus-visible`, `prefers-reduced-motion`) | 🟢 done | (pending) |
| 2 | `src/components/CommandPalette.tsx` | 🟢 done | (pending) |
| 3 | `src/components/agents/ActiveAgentsPanel.tsx` | 🟢 done | (pending) |
| 4 | `#1A365D` navy replacement (632 occurrences, 29 files) | 🟢 done (scoped) | (pending) |
| 5 | `src/components/AIControlCenter.tsx` / `AISetupWizard.tsx` | 🟢 done | (pending) |
| 6 | `src/components/ResearchIntelligenceDashboard.tsx` | 🟢 done | (pending) |
| 7 | Remaining components, incrementally | 🔲 not started | — |

Legend: 🔲 not started · 🟡 in progress · 🟢 done · 🔴 blocked (see note)

## Notes

- **Step 3 discovered dead code, not a new bug**: `src/components/agents/ActiveAgentsPanel.tsx` (the file this doc's Step 3 names) was NOT what the live app rendered. `App.tsx` had its own byte-identical inline `function ActiveAgentsPanel` (used directly at `App.tsx:665`), while the extracted file was only imported by `src/components/layout/TabContentView.tsx` — itself never imported anywhere. Live-verification caught this (edits to the extracted file weren't appearing in the browser); fixed by deleting the inline duplicate and importing the extracted, now-redesigned component instead. Worth a broader dead-code sweep before treating other `src/components/layout/TabContentView.tsx`-adjacent files as live.
- **Step 4 (navy replacement) is intentionally NOT a mechanical 632-occurrence find/replace.** Sampled `bg-[#1A365D]` usage across all 25 remaining files: the overwhelming majority are generic primary-CTA buttons (Save, Submit, Continue, Lock & Save) and `text-[#1A365D]` is the app's standard heading/body text color on light backgrounds — neither is a "system/AI state" signal the cyan accent is for, and recoloring either would either break contrast or wrongly imply every primary action is an AI/system action. Classified and changed only the two genuine matches: the `isActive`-driven drawer-tab nav in `ManuscriptDraftingWorkspace.tsx` and `ManuscriptEditorWorkspace.tsx` (system-chrome tab navigation, same pattern as the AppHeader/CommandPalette/AIControlCenter tab navs already redone) — both verified live via the actual Focus Mode drawer. Two other candidates were considered and deliberately left alone: `ThesisReader.tsx`'s citation-format toggle (citation/scholarship content — gold's domain, not cyan's) and `UserProfileGate.tsx`'s login/signup tab switch (pre-auth chrome, not an AI/system signal). The remaining ~630 navy occurrences are correctly navy and out of scope for this redesign.
