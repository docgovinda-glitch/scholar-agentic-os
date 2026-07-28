# Sci-Fi Redesign — Progress Log

Tracks execution of `docs/planning/sci-fi-redesign-scoping.md`'s ordered
step sequence. One entry per step, updated as each completes. Do not
re-scope here — this is a status log, not a design doc.

| # | Step | Status | Commit |
|---|------|--------|--------|
| 1 | `src/index.css` + `AppHeader.tsx`/`AppFooter.tsx` (global chrome, new tokens, `:focus-visible`, `prefers-reduced-motion`) | 🟢 done | (pending) |
| 2 | `src/components/CommandPalette.tsx` | 🟢 done | (pending) |
| 3 | `src/components/agents/ActiveAgentsPanel.tsx` | 🟢 done | (pending) |
| 4 | `#1A365D` navy replacement (632 occurrences, 29 files) | 🔲 not started | — |
| 5 | `src/components/AIControlCenter.tsx` / `AISetupWizard.tsx` | 🔲 not started | — |
| 6 | `src/components/ResearchIntelligenceDashboard.tsx` | 🔲 not started | — |
| 7 | Remaining components, incrementally | 🔲 not started | — |

Legend: 🔲 not started · 🟡 in progress · 🟢 done · 🔴 blocked (see note)

## Notes

- **Step 3 discovered dead code, not a new bug**: `src/components/agents/ActiveAgentsPanel.tsx` (the file this doc's Step 3 names) was NOT what the live app rendered. `App.tsx` had its own byte-identical inline `function ActiveAgentsPanel` (used directly at `App.tsx:665`), while the extracted file was only imported by `src/components/layout/TabContentView.tsx` — itself never imported anywhere. Live-verification caught this (edits to the extracted file weren't appearing in the browser); fixed by deleting the inline duplicate and importing the extracted, now-redesigned component instead. Worth a broader dead-code sweep before treating other `src/components/layout/TabContentView.tsx`-adjacent files as live.
