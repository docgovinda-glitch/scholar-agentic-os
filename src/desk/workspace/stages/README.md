# Retired journal stages

These 25 stage screens are no longer shown in the journal workspace. The
workspace has five views of one manuscript (Blueprint, Evidence, Studio,
Review, Delivery: `ProtocolBlueprintMode`, `EvidenceMatrixMode`,
`ManuscriptStudioMode`, `RefereeRebuttalMode`, `AuditExportMode`).

They were already unreachable before they were retired. `currentMode` is
always one of the five views, so `ResearchWorkspace`'s fallback to these
screens never rendered. Retiring them removed that dead path and the
sidebar that listed them. Their files and tests stay until their jobs are
rebuilt in the views (and deleting tests needs the owner's sign-off).
Saved answers they wrote stay in the project and are still read by the
views.

| Stage | Where its job lives |
| --- | --- |
| definition | Blueprint: research question and context |
| literature | Evidence: literature search |
| gap_identification, gap_selection | Blueprint: gap finder |
| title_selection, title_lock | Blueprint: working title and lock |
| journal_discovery | Blueprint journal profile (journal workspace PR 2) |
| journal_requirements | Blueprint journal profile (PR 2) |
| vault_sources, external_research, additional_data | Evidence: your data and literature |
| evidence_extraction, evidence_analysis | Evidence: synthesis matrix |
| source_approval_vault, source_approval_external, manual_review | Evidence, with structured references (PR 3) |
| draft, draft_preview, final_editor | Studio: section-by-section writing, polish |
| citation_audit | Citation integrity checks (PR 3) |
| originality_check, publication_readiness | Pass/fail checks (PR 4) |
| peer_review, revision | Review: simulated referees and rebuttal; linked review rounds (PR 6) |
| export | Delivery: Word now; LaTeX and JATS (PR 5) |
