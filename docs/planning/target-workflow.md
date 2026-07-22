# Target Workflow — Spec, Direction Confirmation, and Gap Map

**Status: PLANNING/DOCUMENTATION ONLY — NOT IMPLEMENTED, NOT APPROVED.** This document records a target workflow, confirms the client-side architectural direction against the existing planning docs, and maps every stage of that workflow against the current codebase. It proposes no sequencing, no estimates, and no code changes. Everything not directly read from code or the referenced planning docs is marked **ASSUMPTION**.

---

## 0. Client-Side Direction — Confirmed, and Where Reality Diverges

**Yes — that is the stated target direction.** `hosting-and-topology.md` §2 says this explicitly: *"the entire application — UI, the 8 scholarly agents, the Skills Framework, and AI calls under all 5 Gateway tiers — runs client-side, in the user's browser, on the user's device. Only account/profile data and admin-config... live in the BaaS."* This is corroborated by `ai-gateway.md` (all 5 tiers assume direct browser-to-provider or browser-to-localhost calls) and `sponsored-placements.md` (admin-config lives in the BaaS, not a server this project runs). All three documents are explicitly marked **"PENDING ARCHITECTURE DECISION — NOT APPROVED, NOT IMPLEMENTED"** — this is a stated intent, not a ratified decision, and not fully built.

> **Amended (2026-07-22)**: "runs client-side" above is now "client-side by default, with one accepted exception" — a thin, stateless fetch/search proxy for the retrieval sources this document's §5/§7 research identified as CORS-blocked. Full scope in `.claude/HANDOVER.md`'s Standing Boundary Rule. Everything else in this section's claim still stands unchanged — this is a narrow, bounded addition, not a reversal.

**Where current reality differs from that intent, as of this writing:**

| Area | Target | Current reality |
|---|---|---|
| AI generation | Direct browser → provider calls, per Gateway tier | Still proxies through `server.ts`'s `/api/generate`, `/api/stream-generate`, and 8 phase-specific endpoints (~1,400 lines) calling `aiService.ts` server-side. Only Ollama/LM Studio calls and a Gemini health-check ping are confirmed direct-from-browser today (per `hosting-and-topology.md` §4). |
| Auth/user/admin | Supabase (BaaS), no self-managed server | **Partially done, ahead of these docs' own snapshot**: this session migrated `UserProfileGate.tsx` (registration, login, password reset) to Supabase Auth + Edge Functions. The old `server.ts` auth routes (~1,050 lines) are still present, untouched, pending full live verification before deletion. `ProfileSettings.tsx` and `AIControlCenter.tsx` still call the old Express routes, not Supabase. |
| Agent/Skills Framework | Client-side, no server dependency | **Also ahead of these docs**: `hosting-and-topology.md` §4 flags this as work-in-progress-and-paused, needing re-homing client-side. That re-homing has since happened (`src/services/agentService.ts`) — but only for 1 of 8 agents (`ResearchPlannerAgent`) as a proof of concept; the other 7 still contain their own inline (non-Skill) logic, wherever they end up running. |
| Leftover bucket (`/api/parse-file`, `/api/parse-external-link`, `/api/lookup-doi`) | Mostly unresolved — some may move client-side, `/api/parse-external-link` almost certainly needs a stateless edge function | Unchanged; still server-side via `server.ts`. |

**Net assessment**: the direction is real and partially acted on (auth, one agent), but the largest bucket by line count — AI generation itself — has not moved, and the CORS feasibility questions that would unblock it (particularly for OpenAI) have not been checked. **ASSUMPTION**: nothing in this document assumes those CORS questions have been resolved one way or the other; §2 below flags every workflow stage that depends on the answer.

---

## 1. The Workflow

1. User login
2. AI configuration (per the 5-tier gateway plan)
3. Workspace launch
4. Output format selection — asked first, immediately after workspace launch: journal article, research paper, term paper, newspaper article, book chapter, report, research proposal. Every subsequent field adapts to this choice.
5. Research input (conditional on step 4) — title, research questions, objectives, research gap, method, author/co-author details, target minimum reference count. **Alternative path**: user supplies only the title; agents populate the rest. Author/co-author details are always user-supplied, never agent-generated.
6. Data and literature intake — user-supplied primary/secondary data and literature; research proposals are the only format that skips primary data and the only format where agents don't add it; agents supplement with additional data/literature restricted to authoritative sources; everything (user- and agent-supplied) goes into the Knowledge Vault, with agent-found material requiring explicit user approval before use.
7. Journal matching and templates — journal articles only get agent-proposed candidate journals; everything else (or a journal article where none was selected) falls back to one standard journal template + one general template per format, user-editable by section; the user may also upload a sample document for an agent to learn structure/style from.
8. Requirements extraction — for a selected journal, an agent finds submission requirements; for non-journal outputs, the user supplies them directly.
9. Drafting — the drafting agent produces the manuscript, including a "humanize" skill (prose-quality goal, not detection evasion) and a point where AI-use disclosure belongs.
10. Peer review agent — reviews the draft against the selected journal's requirements or the user-specified ones.
11. Redrafting — chat plus direct manual editing.
12. Final output — editable .docx or PDF, formatted per step 8.

---

## 2. Gap Map

Legend: 🟢 exists and works · 🟡 exists but disconnected · 🔴 does not exist

### Stage 1 — User login
**🟢 Exists and works.** `UserProfileGate.tsx` + `src/services/supabaseAuthService.ts` + Supabase Edge Functions. Registration/login live-verified this session; password-reset code is committed but its full live click-through is not yet confirmed (blocked on a Supabase rate limit, not a code defect — see `.claude/HANDOVER.md`).
- **Owner**: not agent territory — correctly so; this is auth infrastructure, not a scholarly task.
- **Client-side conflict**: none. Supabase Auth's client SDK is designed for exactly this pattern.
- **Open question**: none.

### Stage 2 — AI configuration (5-tier gateway)
**🟡 Exists but disconnected from the 5-tier model.** `AIControlCenter.tsx`/`AISetupWizard.tsx` and `src/services/aiGateway.ts` + `src/ai/providers/` (Anthropic, Gemini, Ollama, OpenAI, LM Studio adapters) exist and are used today — but as a single undifferentiated settings screen, not the 5-tier framing (Tier 4 — the affiliate/sponsored-placement flow — doesn't exist at all; Tiers 1/2/3/5 exist as provider config but several still proxy through `server.ts` rather than calling providers directly, per §0 above).
- **Owner**: no agent; this is `aiGateway.ts`/UI territory by design.
- **Client-side conflict**: this stage **is** the CORS feasibility question from `hosting-and-topology.md` §4 — OpenAI's direct-browser support is unverified and is the biggest risk to Tier 3 specifically.
- **Open question**: none beyond what the source docs already flag.

### Stage 3 — Workspace launch
**🟢 Exists and works.** Post-login routing into `App.tsx`/`OnboardingWizard.tsx`.
- **Owner**: n/a. **Conflict**: none.

### Stage 4 — Output format selection
**🔴 Does not exist.** Verified via grep: no output-format/document-type concept anywhere. The closest existing field, `articleType` (`Theoretical/Conceptual` / `Empirical/Mixed-Methods` / `Empirical/Qualitative`, set in `ResearchIntakeWizard.tsx`), is a *methodology* axis, not a document-genre axis — it answers "what kind of study is this," not "what kind of document am I producing."
- **Owner**: no agent. `ResearchIntakeWizard.tsx` is UI-only; the session-notes.md gap analysis already flagged "Research Intake" as needing an agent that doesn't exist.
- **Client-side conflict**: none — this is UI/data-model state, no retrieval or generation involved.
- **Field-mapping research (§3 below)**: proposed which fields belong to which format, and where formats diverge enough to need separate intake flows. **This entire subsection is my own domain reasoning, not read from code or a citable source — flagged as ASSUMPTION throughout.**

### Stage 5 — Research input
**🔴 Does not exist as specified for the "title-only" alternative path; 🟡 partially exists for the guided path.** `PaperProject` (`src/types.ts`) already has `title`, `researchQuestions`, `objectives`, `researchGap`, `methodology`, `authorName`/`orcidId`/`authorAffiliation`/`authorEmail`, and matching `coAuthor*` fields — the core data model is most of the way there. **Missing**: a target-minimum-reference-count field (verified absent via grep). **DECIDED**: this is a soft target — surface a warning if the draft falls short; it must never block drafting or export.
- **Alternative path (title-only, agents populate the rest)**: **does not exist, and no current agent cleanly owns it.** `ResearchPlannerAgent` generates a *plan* (phases/milestones) from already-supplied research parameters; it does not generate the research questions/objectives/gap/method themselves from a bare title. `ResearchQuestionAgent` similarly structures questions from input, not from nothing. **ASSUMPTION**: closest existing capability, and still a real build, not a relocation. **DECIDED**: this path requires user approval, consistent with Stage 6's approval gate — agents populate the fields, the user reviews and confirms them, and nothing agent-generated advances unreviewed.
- **Owner**: `ResearchPlannerAgent`/`ResearchQuestionAgent`/`MethodologyAdvisorAgent` jointly, for the guided path; nothing for the alternative path.
- **Client-side conflict**: none — this is form input and (if AI-assisted) a generation call, same CORS questions as Stage 2, no new ones.

### Stage 6 — Data and literature intake
**🟢 FIXED (2026-07-22) for the scholarly-literature half — the single worst defect this whole investigation found is no longer true.** `discoverDataSources` in `aiService.ts` no longer asks an LLM to *name* sources from memory. It now calls `src/services/literatureRetrievalService.ts`, which performs **real, direct client-side retrieval against Crossref, OpenAlex, PubMed, and Semantic Scholar** (all four confirmed CORS-permissive, §5) — querying on the project's title/keywords (falling back to field), tolerating individual source failures via `Promise.allSettled` so one API being down/rate-limited doesn't block the others, round-robin-merging and deduping by normalized title across sources, and capping the combined result. Live-verified against a real research topic (see commit/session notes) — real papers, real DOIs/URLs, real citation counts, not sample data. `KnowledgeVaultManager.tsx`/`KnowledgeVaultEngineV2.tsx`/`KnowledgeVaultWizard.tsx` handle user-supplied material — 🟢 for that half, unchanged by this pass.
- **What's still not covered by this fix, deliberately out of scope this pass**: arXiv (confirmed CORS-blocked, needs the accepted proxy — not built here), `discoverJournals` (untouched, still LLM-naming, same defect, not this pass's target), and generic government/institutional-body web search (§7/§8, needs the proxy plus an unresolved filtering design). **There is still no real-time query against those sources** — only the four scholarly APIs above are fixed.
- **OpenAlex key**: built against OpenAlex's documented requirement (a free key), not the unenforced no-key-required behavior observed during testing — see `.env.example`'s `VITE_OPENALEX_API_KEY` for where to obtain one (openalex.org, free, ~30 seconds).
- **Approval gate for agent-found material**: **🔴 does not exist.** `knowledgeVaultService.ts` has `status`/`isActive` fields but nothing resembling a pending-approval state.
- **New requirement (2026-07-22): mandatory Terms & Conditions acceptance.** This gate's existence is precisely why a T&C disclaimer about agent-found content is needed — see the new §9 below for the full mechanism spec (versioned acceptance, Supabase record, blocking re-acceptance gate) and `docs/planning/terms-of-service-draft.md` for labeled draft legal language. Enforced at the account level (Stage 1), not scoped to Stage 6 alone, but the data-reliability clause it carries exists specifically because of this gate.
- **Research-proposal exception** (skip primary data; agents never add it): **🔴 does not exist** — no format-conditional logic exists anywhere yet, consistent with Stage 4 not existing.
- **Owner**: no agent — `discoverDataSources` is an unwired `aiService.ts` function, same pattern session-notes.md documented for the other "Phase" functions.
- **Client-side conflict — RESOLVED (2026-07-22)**: closing this gap does need a server-side hop for some sources (`hosting-and-topology.md` §4 already made this point about `/api/parse-external-link`) — that hop is now an **accepted, bounded exception** (a stateless fetch/search proxy — see `.claude/HANDOVER.md`'s Standing Boundary Rule), not an unresolved tension with "no backend server." What's still open is *which* sources actually need it.
- **DECIDED**: "restricted to authoritative sources" means **real retrieval against real indexes** (Crossref, OpenAlex, Semantic Scholar, PubMed, arXiv, and similar) — not an LLM naming sources from memory. An LLM citing sources it recalls is **unacceptable for an academic tool**; it produces plausible-looking references that may not exist. Today's `discoverDataSources`/`discoverJournals` behavior is a **defect**, not a weaker-but-valid version of the requirement.
- **DECIDED (2026-07-22)**: Google Scholar is dropped from the authoritative-source list entirely — see §6.
- **Scope expanded (2026-07-22)**: "authoritative sources" for this stage also includes non-journal bodies — government publications/statistics, national statistical offices, central banks, ministries, international organizations, professional associations, standards bodies — researched in §7.
- **What's now achievable, consolidated (2026-07-22, full detail in §5/§7)**:
  - **Scholarly literature — direct, no proxy — ✅ BUILT (2026-07-22)**: Crossref, OpenAlex, PubMed, Semantic Scholar (4 of 5, all empirically confirmed CORS-permissive), now implemented in `discoverDataSources`/`literatureRetrievalService.ts`, not just confirmed-feasible.
  - **Scholarly literature — via the accepted proxy**: arXiv (confirmed CORS-blocked).
  - **Statistical/open data — direct, no proxy**: World Bank Open Data API, OECD SDMX API (both confirmed CORS-permissive).
  - **Statistical/open data — via the accepted proxy, or unavailable**: WHO GHO, IMF DataMapper (both confirmed CORS-blocked); FAOSTAT/UN Comtrade not cleanly tested.
  - **Generic authoritative web search + full-text page fetching — via the accepted proxy, no direct-browser option found**: every generic search API tested (Brave, Tavily, Exa, SerpApi) needs a proxy; see §7 for the Tavily/Exa preflight-vs-actual-response nuance.
  - **Google Scholar — dropped**, per §6.
  - **Authoritative-source filtering (how an agent decides a source qualifies)**: not resolved — see the new §8.

### Stage 7 — Journal matching and templates
**🟢 FIXED (2026-07-22) for journal candidate discovery — the same defect Stage 6 had, now fixed the same way.** `discoverJournals` in `aiService.ts` no longer asks an LLM to *name* journals from memory. It now calls `src/services/journalRetrievalService.ts`, which performs **real, direct client-side retrieval against Crossref's `/journals` endpoint, OpenAlex's `/sources` endpoint (filtered to `type:journal`), and DOAJ's `/api/search/journals` endpoint** — all three empirically confirmed CORS-permissive (real browser `fetch()` tests, 2026-07-22, same methodology as §5). Same resilience pattern as `literatureRetrievalService.ts` (deliberately reused, not reinvented): `Promise.allSettled` so one source failing doesn't block the others, round-robin merge, dedup (preferring ISSN — an exact identifier — over normalized name). Live-verified against a real research topic — real journal names, real publishers, real ISSNs, real APC amounts, real DOAJ peer-review-process data where available.
- **Important honesty caveat, not a fudge**: no metadata source here can verify "not predatory" as a fact, and none of them exposes peer-review-process or submission-turnaround data for a journal that isn't DOAJ-listed. Rather than inventing plausible-sounding values the way the old LLM prompt did, `reviewContext`/`submissionOpenness`/`feeStatus` are explicitly marked "Not available from {source} — verify directly with the publisher" whenever the source genuinely doesn't expose that field. DOAJ-listed (open-access) journals get real values for these fields when DOAJ has them; subscription journals surfaced only via Crossref/OpenAlex generally will not. This is a deliberate, disclosed limitation, not a silent gap.
- **What's still not covered by this fix**: `discoverDataSources`'s remaining gaps (arXiv, generic web search) are unrelated to this pass. Templates and sample-document-learning (below) are untouched.
- **New empirical finding (2026-07-22), worth recording since it wasn't obvious going in**: Crossref/OpenAlex/DOAJ's *journal*-search endpoints behave very differently from the *works*/literature-search endpoints §5 already tested — they match against sparse per-journal text (a title, a handful of subject tags), not a full abstract, so a coherent multi-word query that works fine for literature search (e.g. "diabetes dietary intervention") returned **zero** journal results on all three. A single canonical discipline term reliably didn't. Fixed by querying on `project.field` first (falling back to the first keyword, then title) rather than title+keywords combined, plus a defensive 3-token cap inside `journalRetrievalService.ts` itself. Documented here so a future session doesn't re-diagnose this from scratch.
- **Templates (one standard journal template + one general template per format, user-editable by section)**: **🔴 does not exist as specified.** `PaperProject.sections` is a free-form `Record<string, string>`, not a predefined per-format template set. "Template" appears in 4 component files, but a spot check suggests these are wizard/prompt scaffolding (e.g., `ResearchIntakeWizard.tsx`'s "blueprint" flow), not a manuscript-section-template system — **ASSUMPTION, not exhaustively verified**; worth a closer look before treating this as fully settled. **DECIDED**: templates and sample-document learning are **independent alternatives**, not layers that combine — the user picks one path (built-in template, or uploaded sample). If both are somehow supplied, **the uploaded sample wins**. Never merge the two.
- **Sample-document structure/style learning**: **🔴 does not exist. Confirmed via grep — zero references anywhere in the codebase.** This is one of the two hardest capabilities in this spec (see `competitive-analysis.md`). What it realistically requires, spelled out as asked:
  - **Section detection**: parsing an uploaded document (likely via `mammoth`/a PDF library already in this repo) into a structural outline — which paragraphs are headings, what the heading hierarchy is, where major sections (Abstract, Methods, etc.) begin and end. Non-trivial for PDFs especially, where structure is visual/positional, not semantic markup.
  - **Structure extraction**: turning that outline into a reusable schema (ordered section list, expected section names/aliases, roughly expected length per section) that a later document can be generated against.
  - **Style inference**: characterizing prose style (sentence length, formality, hedging language, heading phrasing conventions, citation-integration style) well enough to imitate it — qualitatively a much harder, fuzzier task than the first two, and the one most exposed to over-promising (see competitive analysis).
  - **Owner**: no existing agent or service touches any of this.
- **Client-side conflict**: journal-existence verification (if built) has the same server-side-hop tension as Stage 6. Sample-document parsing is plausibly client-side-feasible (parsing an uploaded file is a local operation), assuming the document-intelligence parsers (`src/document_intelligence/`) can be reused or adapted — **ASSUMPTION**, not verified against those parsers' actual browser-compatibility in this pass.

### Stage 8 — Requirements extraction
**🟡 Exists but disconnected** for the journal path: `extractRequirements` (`aiService.ts`) + `ComplianceChecklistPanel.tsx` (397 lines) exist, same "no agent" pattern. **🔴 Does not exist** for the non-journal manual-entry path (font, format, titling/subtitling conventions, citation style) — no such form was found.
- **Owner**: no agent (`IntegrityReviewerAgent` is the closest by theme but per session-notes.md only does "reporting-guideline compliance checks," not requirements capture).
- **Client-side conflict**: none inherent — this is either a generation call (same CORS questions as Stage 2) or a form.

### Stage 9 — Drafting, humanize, AI-use disclosure
**🟡 Exists but disconnected**, with genuine AI-calling underneath (unlike most other stages): `draftSection`/`draftSectionStream` (`aiService.ts`) are real, working AI-drafting calls — the strongest "actually does the thing" capability found in this whole map. But `ManuscriptWriterAgent`, the agent whose name implies ownership, per session-notes.md only does template-based "section scaffolding," not real drafting — the real logic bypasses the agent entirely, same disconnect pattern as everywhere else.
- **"Humanize" skill**: **🟡 exists only as a stray prompt word**, not a dedicated skill. Found one instance — "Re-draft, refine and humanize the '{sectionName}' section" — inside the *redraft* prompt (`draftSectionBasedOnQCStream`), not the initial drafting step, and with no connection to any specific anti-pattern list (the Wikipedia "Signs of AI writing" reference you asked to use is not reflected anywhere currently).
- **AI-use disclosure**: **🔴 does not exist anywhere.** Framed correctly per your instruction (prose-quality goal, not evasion) — this is a separate, orthogonal concern from "humanize." **Where it belongs, proposed here (ASSUMPTION, my own placement judgment)**: a disclosure *statement* (what was AI-assisted, and how) is most naturally captured once drafting is functionally complete — logically between Stage 9 and Stage 10 — but its *content/placement in the output* depends on Stage 8's captured requirements, since major publishers (per current-as-of-this-research ICMJE January 2026 guidance and publisher policies — see `competitive-analysis.md`) specify disclosure location themselves (commonly the acknowledgments section, sometimes also a separate submission-form field). So: capture the disclosure content near Stage 9, but render its placement using Stage 8's requirements at Stage 12.
- **Owner**: `ManuscriptWriterAgent` in name only today.
- **Client-side conflict**: none beyond Stage 2's general CORS questions.

### Stage 10 — Peer review agent
**🟡 Exists but disconnected.** `runQualityControl` (`aiService.ts`, real AI-calling) + `QualityControlSuite.tsx` (341 lines) exist. `IntegrityReviewerAgent` is the nominal owner but, per session-notes.md, only does deterministic "reporting-guideline compliance checks" — it does not perform the qualitative critique `runQualityControl` actually generates. Same disconnect pattern as Stage 9.
- **DECIDED**: this stage **validates both** — journal-sourced requirements (Stage 8's agent-extracted path) when a journal is selected, or the user-entered requirements (Stage 8's manual path) otherwise. Same agent, same checks, only the requirement source differs. Neither branch of this exists yet (Stage 8's manual-entry path doesn't exist either, per above), so this is a decision about shape, not a change in what's built.
- **Owner**: `IntegrityReviewerAgent` in name only.
- **Client-side conflict**: none beyond Stage 2's general CORS questions.

### Stage 11 — Redrafting
**🟢 Exists and works**, comparatively the most complete stage found in this map. `QCBasedRedraftingSuite.tsx` (446 lines, chat-driven, wired to `draftSectionBasedOnQCStream`) and `ManuscriptEditorWorkspace.tsx` (direct manual editing) both exist. **One caveat, verified**: manual editing is plain `<textarea>`-based, not a rich-text/WYSIWYG editor (no `contentEditable`, Slate, Tiptap, or Quill found) — fine for editing raw text, but a gap relative to Stage 12's "editable .docx" if any formatting (bold, headings, etc.) is expected to survive the edit step.
- **Owner**: no agent — direct UI + `aiService.ts`, same as most AI-calling stages.
- **Client-side conflict**: none beyond Stage 2's general questions.

### Stage 12 — Final output (editable .docx or PDF)
**🔴 Does not exist as specified — the biggest verified gap in this entire map.** Confirmed via `package.json` and grep: there is no document-generation library of any kind (no docx-generation package, no `jsPDF`/`html2pdf`/equivalent). The only "export" mechanism found is `window.print()` in `ManuscriptPDFViewer.tsx`/`ManuscriptEditorWorkspace.tsx` — a browser print-dialog trigger, which produces at best a static, non-programmatically-editable PDF via the OS print flow, and **zero existing path to an actual `.docx` file**. `mammoth` (already a dependency) only *parses* DOCX; it does not generate one.
- **Owner**: no agent, no service.
- **Client-side conflict — exactly the risk you asked to flag**: real `.docx` generation client-side is plausible in principle (libraries exist for it, e.g., generating Open XML directly in-browser — **ASSUMPTION**, not verified against a specific library choice here, since this doc makes no implementation proposal) but is a genuine new dependency and real engineering work, not a relocation of anything that exists today. PDF generation with real fidelity (not a print-dialog) client-side is more mature (e.g., rendering to canvas/PDF client-side) but still net-new. Both are **entirely unbuilt**, and closing this gap is unrelated to the client-side-vs-server debate — nothing here currently works server-side either.

---

## 3. Output-Format Field Mapping (Stage 4 research) — proposal, not code

**Everything in this section is my own domain-reasoning proposal (ASSUMPTION), not read from code or an external source.** Assessing whether the seven formats can share one conditionally-adapting form, or need genuinely separate intake flows:

| Format | Core research fields (title/questions/objectives/gap/method) fit? | Notable divergence |
|---|---|---|
| Journal article | Yes, cleanly | Adds journal-matching (Stage 7) and journal-sourced requirements (Stage 8) |
| Research paper (general/conference) | Yes, cleanly | No journal matching; falls to templates |
| Term paper | Mostly, but "objectives"/"research gap" often don't apply — many term papers are synthesis/argumentative, not original empirical work | Reference count typically lower; format is often instructor/rubric-defined rather than a citation-style convention |
| Book chapter | Yes, with caveats | No journal matching — needs an editor/volume-title field instead; formatting follows publisher/volume guidelines, not Stage 8's journal path |
| Report | Partially — "purpose/scope" often fits better than "research questions"; method may be absent for synthesis-style reports | No journal matching; institutional/client template instead of Stage 8's journal path |
| Research proposal | Yes for fields, but **no "results" exists yet** — methodology is projected/planned, not executed | Explicitly the format that skips primary data (per your spec); structurally the most different *downstream* (no results/findings section) even though intake fields mostly match |
| **Newspaper article** | **No — poor fit.** No natural "research questions"/"objectives"/"research gap"/"methodology." Needs headline/angle, target publication/section, word count, audience, and quotes/sources instead of a bibliography-style reference count | **Flagging as requested: this is the one format that plausibly needs a genuinely separate intake flow, not conditionally-hidden fields** — the mismatch isn't a few extra/missing fields, it's a different underlying model of what the document *is* |

**Recommendation surfaced, not decided**: six of the seven formats can plausibly share one conditionally-adapting form with per-format field visibility; newspaper article is the outlier worth a dedicated flow. Research proposal's divergence is real but shows up *after* intake (drafting/section-template stage), not at the intake form itself.

---

## 4. Ambiguities and Self-Contradictions

### Resolved — decided, do not re-litigate

1. **"Restricted to authoritative sources" (Stage 6) — retrieval or citation constraint?** **DECIDED: real retrieval**, not a citation constraint on the model. Every existing analog in this codebase (`discoverDataSources`, `discoverJournals`) is prompt-based generation with no verification step — this is now recorded as a **defect**, not an acceptable weaker interpretation. Real retrieval collides with the client-side-only topology; §5 below researches the options, without picking one.
2. **Templates vs. sample-document learning overlap (Stage 7)**. **DECIDED: independent alternatives.** The user picks one path (built-in template, or uploaded sample); if both are somehow supplied, the uploaded sample wins. Never merged.
3. **Reference-count enforcement**. **DECIDED: soft target.** Surface a warning if the draft falls short of the target; never block drafting or export on it.
4. **Peer-review agent scope for non-journal formats**. **DECIDED: validates both.** Journal-sourced requirements when a journal is selected, user-entered requirements otherwise — same agent, same checks, different requirement source.
5. **Alternative path's boundary (Stage 5)**. **DECIDED: requires approval**, consistent with Stage 6's approval gate. Agents populate the fields; the user reviews and confirms before proceeding. Nothing agent-generated advances unreviewed.

### Still open — not resolved here

6. **Where does a user-uploaded sample document's *content* (as opposed to structure/style) stop being used?** The spec is clear the sample is for learning structure and style, not as a data/literature source — but Stage 6 already handles data/literature intake separately. Worth confirming this boundary is intentional and not a source of confusion for whoever builds it. **Not addressed in this pass.**

---

## 5. Retrieval Architecture Options (Stage 6 decision, researched + empirically tested 2026-07-22)

**Research and options only — no option is chosen here.** Covers which scholarly APIs are candidates for real retrieval, what each requires, and what the minimum server-side surface would look like if a proxy turns out to be unavoidable.

> **Decision made on the architecture question (2026-07-22)**: a stateless fetch/search proxy is now an accepted exception (see `.claude/HANDOVER.md`'s Standing Boundary Rule) — the "no backend, ever" tension this research was originally scoped to inform has been resolved. What follows is left as-written: the empirical record that led to that decision, plus the remaining, still-open question of *which specific sources* actually need the proxy (answer, per the research below: only arXiv, of the five scholarly APIs).

**Methodology, replacing the earlier documentation-only pass**: a real Chrome browser (via `agent-browser`, CDP-driven) was opened to a genuine `https://` origin (`example.com`), and a real `fetch()` call was executed in that page's JS context against each API's live endpoint — not curl, not documentation. `fetch()` only throws a network-level `TypeError` when a CORS grant is missing (or on a genuine connection failure); a completed HTTP response of any status code (200, 429, etc.) resolves normally if CORS headers are present. Where a browser-context result looked ambiguous, `curl` was used *afterward*, only to inspect the raw response headers of the same live endpoint and explain *why* — never as a substitute for the browser test itself.

### Empirical results

| API | Real browser `fetch()` result | What this means |
|---|---|---|
| **Crossref** (`api.crossref.org`) | ✅ **Succeeded.** `GET /works?query=test&rows=1` → HTTP 200, real JSON body (773,047 total results reported) returned directly to page JS. | **CORS-permissive, confirmed.** Directly callable from a browser, no proxy needed. |
| **OpenAlex** (`api.openalex.org`) | ✅ **Succeeded.** `GET /works?search=test&per-page=1` → HTTP 200, real JSON body (34.6M total results reported), **no API key sent at all**. | **CORS-permissive, confirmed.** But see the auth discrepancy below — this result contradicts OpenAlex's own current published policy, and should not be relied on as guaranteed-stable. |
| **Semantic Scholar Academic Graph API** | ✅ **Succeeded on retest.** `GET /graph/v1/paper/DOI:...` → HTTP 200, real JSON body, in a genuine browser `fetch()`. | **CORS-permissive, confirmed** — see below for the retest that resolved the earlier confound. The `/search` endpoint specifically remains separately rate-limited (429) on the shared anonymous pool — a throttling issue, not a CORS one. |
| **PubMed / NCBI E-utilities** | ✅ **Succeeded.** `GET esearch.fcgi?db=pubmed&term=test&retmode=json&retmax=1` → HTTP 200, real JSON body (3,974,548 total results reported). | **CORS-permissive, confirmed.** Directly callable from a browser, no proxy needed. |
| **arXiv API** (`export.arxiv.org/api/query`) | ❌ **Failed** — `TypeError: Failed to fetch`. | **Confirmed CORS block** — see below, this one is clean and unambiguous. |
| **Google Scholar** | Not tested — no official API exists to test against (confirmed via current web search: no public API, ToS explicitly prohibits scraping/"systematic retrieval"). | **DECIDED (2026-07-22): dropped from scope entirely** — see §6 below. Kept in this table as a record of what was researched, not as an active candidate. |

### Semantic Scholar — retested, resolved: CORS works, the earlier failure was the rate limit

The original test hit `/graph/v1/paper/search`, which was still 429-throttled on retest (confirmed again via `curl`, same `TooManyRequestsException`, no `Access-Control-Allow-Origin` on the 429 body either). Rather than wait out the same shared-pool limit, the retest used a different endpoint on the same API — `/graph/v1/paper/{DOI}` (a direct paper lookup, not a search) — which is not subject to the same throttling. `curl` showed a clean **HTTP 200** with `access-control-allow-origin: *` present. A genuine in-browser `fetch()` against that exact URL then succeeded, returning real paper data. **This resolves the confound: Semantic Scholar's API does grant CORS access; the earlier failure was the shared anonymous pool's rate limit on `/search` specifically, not a CORS gap.** Practical implication: the `/search` endpoint anonymously may still be unreliable under load independent of CORS — an API key (free, raises the limit, same pattern as OpenAlex/PubMed) would address that reliability concern, not a CORS one.

### arXiv — clean, confirmed block

`curl` against the identical live URL returned a real **HTTP 200** with a full, valid response body — the server processed the request fine. But its response headers included **no `Access-Control-Allow-Origin` header at all**. This is an unconfounded result: the API works, but does not grant browser-side JS permission to read its own successful response. **Confirmed CORS block, would need a proxy.**

### OpenAlex — a live discrepancy worth flagging on its own

Per the user's instruction to verify against live docs rather than assume: OpenAlex's current documentation (`docs.openalex.org`, read directly, not from search-result summaries) states plainly: *"It's free but requires an API key (also free)... With your free key, you get \$1/day of free usage."* This confirms the January-2026-dated change found earlier — keys are now the stated policy, replacing the old email-only "polite pool." **But the empirical test above succeeded anyway, with no key sent at all, returning full real data.** Two real facts in tension, both verified, neither invented: current stated policy requires a key; current actual behavior did not enforce that in this test. **Do not build against the unenforced behavior** — it's plausibly a grace period, inconsistent enforcement, or a low anonymous allowance that happened not to be hit yet, any of which could close without notice. Treat "OpenAlex requires a key" as the only safe planning assumption, even though this specific test didn't need one. **Build against the documented requirement, not the unenforced behavior observed here** — when this is actually implemented, obtaining the free OpenAlex key is a setup task for the project owner (same pattern as the Resend API key), not something to be requested or obtained by whoever is implementing this.

### If a proxy is needed — minimum server-side surface

Only **arXiv** is a confirmed proxy candidate among the five scholarly APIs — Crossref, OpenAlex, PubMed, and (as of the retest above) Semantic Scholar all work directly. Consistent with the "stateless edge function, not a persistent server" distinction already drawn in `hosting-and-topology.md` §4:

- A single stateless serverless/edge function (Vercel/Netlify/Cloudflare Pages Functions — whichever platform hosts the static site, same as the existing `/api/parse-external-link` leftover-bucket item) that does nothing but forward a query to arXiv and return the response, unmodified. No persistent process, no database, no session state.
- Semantic Scholar needs no proxy for CORS reasons, but its `/search` endpoint's shared anonymous rate limit is a real reliability concern independent of that — worth getting a free API key for once this is built, same setup-task pattern as OpenAlex/Resend (see below).

### Cost to "no paid backend" if a proxy is needed

A stateless edge function for arXiv specifically has a genuine **free tier** on any of the three static-hosting candidates — this does not, by itself, break "no paid backend." It does mean the cleaner claim in `hosting-and-topology.md` §2 ("the entire application... runs client-side," zero server-side component beyond the BaaS) has a small, real, now-*confirmed* exception for one of five sources, not a hypothetical one. With Google Scholar now dropped from scope (§6 below), **no part of the scholarly-literature retrieval layer carries a recurring dollar cost** — the only proxy needed (arXiv) is free-tier-only.

---

**My opinion, clearly labeled as mine, not a decision, updated now that Semantic Scholar is also resolved**: Crossref, OpenAlex, PubMed, and Semantic Scholar all work directly, right now, with zero proxy needed — a strong, confirmed foundation for four of five sources. I would *not* build against OpenAlex's currently-working-without-a-key behavior, given its own docs say a key is required — get a key from day one despite the test succeeding without it. For arXiv, the block is real and confirmed, so it's either a small proxy or dropping it from the source list, depending on how much its STEM-preprint coverage actually matters versus what Crossref/OpenAlex/PubMed already cover. I still wouldn't have paid for Google Scholar access — see §6 below, where that's now been decided rather than left as my opinion.

---

## 6. Google Scholar — DECIDED: dropped from scope (2026-07-22)

**Recorded decision, not this document's own recommendation**: Google Scholar was named explicitly in the original 12-stage workflow spec (§1 above, under "authoritative sources"). Excluding it is a **spec change**, not a technical detail — it was flagged rather than dropped silently, and the project owner has now decided: **drop it, adjust the spec.** The "authoritative sources" language in §1/§2 above should be read as no longer including Google Scholar; sourcing for Stage 6 relies on Crossref, OpenAlex, PubMed, and (subject to the arXiv proxy question in §5) arXiv, plus whatever comes out of §7's government/international-body research below.

**The two options that were on the table, for the record:**

1. **Drop Google Scholar, adjust the spec.** ✅ **Chosen.** Rely on Crossref + OpenAlex + PubMed + arXiv only. Zero recurring cost, no ToS exposure, fully consistent with "no paid backend."
2. **Keep Google Scholar, accept a recurring SERP-API cost.** Not chosen. No official Google Scholar API exists; the only access path is an unofficial scraper (ToS-prohibited, fragile, actively resisted by Google) or a paid third-party SERP API. This would have been a genuine, ongoing dollar cost that scales with usage, and would have needed its own thin server-side proxy regardless, since SERP-API responses aren't served with browser CORS headers either.

**What coverage is actually lost by dropping it**, given Crossref + OpenAlex + PubMed + arXiv are already in scope: Google Scholar's distinguishing coverage is (a) grey literature — theses, dissertations, conference proceedings, preprints outside arXiv's covered fields, government/NGO reports; (b) citation counts aggregated across a broader net than any single index; (c) breadth across the humanities and social sciences, where Crossref/OpenAlex have metadata but often not full-text or citation-graph depth, and where PubMed/arXiv don't reach at all by design. Crossref and OpenAlex together already cover the large majority of formally-published, DOI-registered scholarship across all fields, including humanities/social science journal articles — what's genuinely lost is the informal/grey-literature layer and Google's uniquely broad citation-count aggregation, not mainstream peer-reviewed coverage itself.

This tradeoff is kept visible here rather than deleted, in case the grey-literature/citation-count gap turns out to matter enough later to revisit.

---

## 7. Authoritative Web Search — Government & International-Body Sources

**New scope, added 2026-07-22, not part of the original CORS test above.** Stage 6's "restricted to authoritative sources" requirement isn't only about scholarly-literature indexes (§5) — a large share of the empirical data an academic paper needs is published directly by government bodies, national statistical offices, central banks, ministries, international organizations (UN, WHO, World Bank, IMF, OECD, FAO, etc.), professional associations, and standards bodies, not by anything Crossref/OpenAlex/PubMed/arXiv index. This section researches this category of source. **The architecture question this section was originally scoped to answer — "can this work under client-side-only, or does it need a proxy" — is now resolved: it needs the accepted proxy (see the amendment note in §5, and `.claude/HANDOVER.md`'s Standing Boundary Rule).** What remains genuinely open is narrower: *which* search API/vendor to put behind that proxy (a cost/capability choice, not an architecture one), and the separate authoritative-source-filtering design question, now its own §8. Nothing here is built.

### This is a harder constraint than the scholarly-API case — stated plainly

§5's scholarly APIs are purpose-built REST endpoints, and three of five turned out to be directly browser-callable. **Arbitrary government/NGO/professional-association websites are a different kind of target almost by definition**: they're general-purpose sites, not APIs, and general-purpose sites essentially never send CORS headers permitting a browser page on this domain to read their content directly — `hosting-and-topology.md` §4 already established exactly this point about `/api/parse-external-link`. This problem also has **two independent CORS-affected steps, not one**: (1) *finding* the right document via a search API, and (2) *fetching* that document's actual content once found. Even a perfectly CORS-permissive search API only solves step 1 — the government PDF or dataset page it points to still needs to be fetched, and that fetch faces the same `/api/parse-external-link` problem regardless of how the URL was discovered.

### Generic web-search APIs — empirically tested (real preflight + real browser `fetch()`, not docs)

| API | Real CORS test result | Free tier | Cost beyond free tier | Domain-restriction support |
|---|---|---|---|---|
| **Brave Search API** | ❌ **Confirmed no CORS support.** `OPTIONS` preflight → `405`, no `Access-Control-*` headers at any layer. | Effectively none as of ~Feb 2026 — the prior free tier (up to 5,000 queries/mo) was removed; new accounts get a **$5/mo trial credit** (~1,000 queries), card required to keep earning it. | ~$3–5 per 1,000 queries pay-as-you-go; attribution ("Powered by Brave") required to retain even the trial credit. | Query-syntax-level (`site:`) only — no first-class domain-allowlist parameter found. |
| **Tavily** | ❌ **Confirmed no CORS support on the real request**, despite an initially misleading signal — see below. | **1,000 credits/month free**, no card required. | From $30/mo (4,000 credits), or $0.008/credit pay-as-you-go. A basic search = 1 credit, advanced = 2. | **Yes, first-class** — `include_domains`/`exclude_domains` params, documented and supported on the free tier. |
| **Exa** | ❌ **Confirmed no CORS support on the real request**, same pattern as Tavily — see below. | **1,000 searches/month free** + $10 credit, no card required. | $7/1,000 searches pay-as-you-go, plus separately billed extras (summaries $1/1k, deep search $12/1k, content extraction $1/1k, answers $5/1k). | **Yes, the most capable of the four** — `includeDomains`/`excludeDomains`, up to 1,200 entries each, supports subdomain wildcards (`*.substack.com`) and path-level scoping (`exa.ai/blog`). |
| **SerpApi** | ❌ **Confirmed no CORS support.** `OPTIONS` preflight → `404` (no route at all), no `Access-Control-*` headers on the real request either. | 250 searches/month free, throttled to 50/hour. | $25/mo for 1,000 searches, up to $275/mo for 30,000. | Query-syntax-level (`site:`) only, same as Brave. (Also supports Google Scholar as one of 60+ engines — moot now that Google Scholar is dropped, §6.) |
| **Bing Search API** | Not testable — **retired entirely, August 11, 2025.** Confirmed via Microsoft's own lifecycle-announcement page, not assumed from stale training data. | N/A | Its replacement, **"Grounding with Bing Search,"** is bundled into Azure AI Agents/Foundry — not a standalone callable search endpoint at all, and reported **40–483% more expensive** than the retired API depending on workload, plus Azure resource/deployment overhead. Architecturally the wrong shape for this project regardless of price. | N/A |
| **Google Programmable Search Engine (Custom Search JSON API)** | ✅ **Confirmed CORS-permissive — the one exception found.** Real browser `fetch()` succeeded; `access-control-allow-origin: <origin>` present on both the `OPTIONS` preflight *and* the actual `GET` response (even on a 400 invalid-key error) — a cleaner result than Tavily/Exa's preflight-only pass. | 100 free queries/day. | $5 per 1,000 queries beyond that, hard cap 10,000/day. | **Yes, and uniquely so**: domain restriction is configured **in the search engine itself** (Google's PSE control panel), not as a per-request API param — the search only ever runs against whatever site list the PSE was configured with. |

**The Tavily/Exa result is worth explaining, because a shallower test would have gotten it wrong**: both APIs' `OPTIONS` preflight responses looked fully CORS-permissive (`Access-Control-Allow-Origin`, `-Allow-Methods`, `-Allow-Headers` all present, matching the actual request's needs). A check that stopped at the preflight would have concluded "CORS-enabled." But the **actual** `POST` response from both (verified via `curl`, then confirmed by a real in-browser `fetch()`, which threw `TypeError: Failed to fetch` for both) **lacks `Access-Control-Allow-Origin` entirely** — the preflight passes, but the browser still blocks reading the real response. This is exactly the kind of gap the real-`fetch()` methodology established earlier in this document (§5) exists to catch, and it did.

**Net result: of the five generic web-search options tested, only Google Programmable Search Engine is directly browser-callable — Brave, Tavily, Exa, and SerpApi all need the accepted proxy.** This is still a worse result than §5's scholarly APIs (4 of 5 direct), but Google PSE changes the picture: it's both CORS-permissive *and* the only one of the five where domain restriction is enforced at the engine-configuration level rather than a runtime parameter an agent could theoretically bypass or misconfigure.

**One major caveat on Google PSE, verified against current status rather than assumed**: as of 2026, the Custom Search JSON API **is no longer available to new users and is fully deprecated as of January 1, 2027** — Google is directing users to Vertex AI Search instead. The free 100/day tier is confirmed still live for *existing* customers only, for the remainder of 2026. This makes it a genuinely poor foundation to build against today despite its clean CORS result — anything built on it now would need migrating within months of shipping. Vertex AI Search itself was not tested here; it's a GCP-project/service-account-authenticated enterprise product, architecturally very unlikely to support simple anonymous or lightweight-key browser calls the way the Custom Search JSON API did — treat it as presumptively proxy-only until actually checked.

### Structured open-data APIs at major bodies — empirically tested, a better result than generic search

Several of the bodies named in the new requirement publish their own structured data APIs directly, separate from "search the web and hope for a parseable page." These were tested the same way:

| Source | Real CORS test result |
|---|---|
| **World Bank Open Data API** | ✅ **Confirmed CORS-permissive.** Real browser `fetch()` succeeded; response carries `access-control-allow-origin: *`. No auth needed for standard indicators. |
| **OECD SDMX API** | ✅ **Confirmed CORS-permissive.** Real browser `fetch()` succeeded (1MB+ real SDMX-XML response); reflects the calling origin (`access-control-allow-origin: <origin>`) plus `access-control-allow-credentials: true`. No auth needed for public datasets. |
| **WHO Global Health Observatory (GHO) OData API** | ❌ **Confirmed CORS block.** Real browser `fetch()` failed (`TypeError: Failed to fetch`); no `Access-Control-*` headers on a clean `curl` 200 either — not confounded by rate-limiting, a clean result. |
| **IMF DataMapper API** | ❌ **Confirmed CORS block.** Same pattern as WHO — real `fetch()` failed, clean 200 via `curl` with no CORS headers at all. |
| **FAOSTAT API / UN Comtrade API** | **Not cleanly tested this pass.** FAOSTAT's tried endpoint required auth (`401`) before a CORS check was even possible; UN Comtrade's public preview endpoint returned an empty body. Worth a proper test before relying on either — not reported as pass or fail here, since neither was actually resolved. |

**Implication**: for structured *data* specifically (as opposed to general document/report search), the picture is meaningfully better than generic web search — 2 of 4 cleanly-tested major bodies are directly browser-callable with zero proxy, mirroring §5's finding that purpose-built APIs tend to be far more CORS-friendly than generic search/scrape paths. Where a data need maps to a body with one of these APIs (World Bank and OECD confirmed so far), it's worth preferring that direct path over routing through a generic search-API proxy at all.

**The core credibility question this data raises — how would an agent actually decide a source is "authoritative"? — is significant enough to warrant its own section: see §8 below, not a passing mention here.**

---

## 8. Authoritative-Source Filtering — Design Question (Not Resolved)

**This is the harder design problem underneath everything in §5/§7** — an academic tool citing a random blog is worse than citing nothing, so "the search API returned it" can't be the whole test. Flagged explicitly, per instruction, as worth worrying about more than the CORS mechanics: CORS just determines *whether a call can be made*; this determines *whether the tool can be trusted*. Documented concretely below. **Not resolved here.**

### Why this needs an actual mechanism, not just good prompting

The same failure mode already identified as a **defect** for scholarly retrieval (§0/§2 above — an LLM naming sources from memory instead of real retrieval producing plausible-looking references that may not exist) has a direct analog here: an LLM *judging* whether a search result is authoritative, after the fact, is exactly the same category of unverified trust as an LLM *naming* a source from memory. Both substitute a model's judgment for a real, checkable constraint. Any design that relies on "the agent will recognize an authoritative-looking domain" as the primary safeguard reintroduces the same problem this document already rejected once.

### Option A — domain allowlist enforced at the query layer

Maintain a fixed, curated list of domains (`*.un.org`, `*.who.int`, `*.worldbank.org`, `*.imf.org`, `*.oecd.org`, `*.gov`, `*.europa.eu`, relevant professional-body and standards-body domains, etc.) and only ever issue allowlist-restricted queries — Tavily/Exa's `include_domains`/`includeDomains` params, `site:`-syntax for Brave/SerpApi, or (the strongest version of this option) Google PSE's engine-level site restriction, configured once outside any per-request logic at all.

- **Strength**: the guarantee is structural, not judgment-based — a result outside the allowlist is architecturally impossible to return, not just unlikely. This is the closest analog to §0/§2's "real retrieval, not model judgment" standard.
- **Weakness**: coverage is exactly as good as the list. A genuinely authoritative body not yet on the list is invisible, with no fallback — the system fails closed (misses a real source) rather than open (accepts a fake one), which is the safer failure direction for an academic tool, but still a real coverage cost.
- **Maintenance**: a static list, hardcoded, drifts out of date as new agencies/bodies become relevant to a given research area — this is the gap Option C addresses.

### Option B — post-hoc LLM judgment on unrestricted search results

Run an open web search (no domain restriction), then have an agent step classify each result's domain/publisher as authoritative or not before it's allowed into the Knowledge Vault.

- **Strength**: best raw coverage — nothing is excluded before the search runs, so genuinely authoritative-but-unlisted sources are reachable.
- **Weakness**: this is the option that reintroduces the rejected failure mode directly. A model's judgment about "is `somethinktank.org` authoritative" is exactly the kind of unverified, plausible-looking-but-not-actually-checked determination that made `discoverDataSources`'s current behavior a defect in the first place. Getting this wrong doesn't just miss a source — it actively lets an unreliable one in, dressed up as vetted.
- Included here for completeness, not because it's being suggested as viable — it's the option this document's own established standard (§0/§2) argues against.

### Option C — hybrid: allowlist as a hard pre-filter, but a maintainable one

Same enforcement mechanism as Option A (queries never leave the allowlist), but the list itself is versioned and editable rather than hardcoded into application logic — e.g., an admin-configurable table, structurally similar to the `sponsored_placements` admin-config pattern already used elsewhere in this project (Supabase table + dashboard Table Editor as the non-coder admin UI, per `hosting-and-topology.md` §3).

- **Strength**: keeps Option A's structural guarantee while giving the list a real maintenance path — a new relevant body can be added without a code change or redeploy.
- **Weakness**: maintenance now depends on someone actually noticing gaps and updating the list — a process question, not just a technical one, and one this document doesn't attempt to resolve (who reviews additions, how often, what the bar for "authoritative enough to add" is).
- **A further, unresolved sub-question even within this option**: TLD-level heuristics (`.gov`, `.int`, `.edu`) could plausibly widen the allowlist automatically rather than requiring every individual domain to be enumerated — but TLD alone is a weaker signal than a curated domain (`.edu` covers every university department website and personal faculty page, not just an institution's own authoritative publications; `.int` is somewhat cleaner but still not universally curated). Whether TLD heuristics belong in this option at all, and if so how narrowly scoped, is itself an open question, not a settled detail of Option C.

**No option is chosen here.** This is flagged as a design decision to make deliberately later, not resolved by default while attention is on the CORS/architecture questions §5/§7 already settled.

---

## 9. Terms & Conditions — Mandatory Acceptance Gate (Mechanism Spec, Not Legal Text)

**New requirement, added 2026-07-22.** Mandatory Terms & Conditions acceptance at signup, covering both the data-reliability point (Stage 6's approval gate) and standard SaaS liability coverage. **This section specifies the mechanism only — versioning, storage, and the gate's behavior.** The actual legal language is a separate, clearly-labeled draft: `docs/planning/terms-of-service-draft.md` — **not legal advice, not ready to deploy, requires a qualified lawyer's review.**

### Competitor research — synthesized patterns, not a raw list

Web research across major AI-tool providers (OpenAI, Anthropic, Google, GoDaddy, Read AI, Square) and general SaaS ToS guidance surfaced consistent, recurring patterns rather than one-off approaches:

1. **AI-output accuracy disclaimer is now near-universal for any tool that generates or surfaces content via AI.** Every major AI provider examined disclaims warranties that outputs are accurate, complete, reliable, or error-free, and frames independent user verification as the user's responsibility before relying on output for anything consequential (Google names medical/legal/financial explicitly as never-rely-without-verification categories). This is the direct analog to this project's own Stage 6 finding: an academic tool cannot warrant that agent-found sources are correct, only that a review gate exists.
2. **Data loss is folded into a standard consequential-damages exclusion, not a standalone clause.** The common pattern excludes liability for "loss of profits, goodwill, use, **data**, or other intangible losses" as one list, with backup/data-safeguarding responsibility explicitly shifted to the user.
3. **Account/device compromise**: users are responsible for safeguarding their own credentials and devices; providers disclaim liability for unauthorized access via a user's own compromised credentials, typically paired with a user obligation to report suspected compromise promptly.
4. **Liability caps tied to fees paid** (commonly 3–12 months of subscription fees, even for a currently-free product, to establish the pattern for when paid tiers exist) alongside a broad exclusion of indirect/consequential/punitive/special damages — one of the most consistently-templated clauses across SaaS ToS generally, not AI-specific.
5. **Billing/subscription terms are conventionally included even before a product monetizes** — covering future paid tiers, auto-renewal, cancellation/refund handling, and price-change notice — so the document doesn't need rewriting the day a paid tier ships.
6. **Service-availability disclaimer**: "as is"/"as available," no uptime guarantee absent a separate paid SLA — standard for free-tier-only stacks like this project's current architecture (no self-managed server to guarantee anything about).
7. **Versioned, tracked, blocking re-acceptance when terms materially change** — increasingly a legal necessity, not just best practice: courts have held that passive "continued use = consent" is insufficient without documented, active re-acceptance (one cited real-world case, Safeway, resulted in a $42M judgment over exactly this gap). Re-acceptance must be logged with a timestamp and version, and must block further use until given.
8. **Academic-integrity framing, specific to this tool's niche**: comparable academic/writing tools (Grammarly's approach was the clearest example found) frame responsible use as the user's obligation to comply with their own institution's academic-integrity and AI-use policies, recommend disclosure/citation of AI assistance as a norm, and explicitly do not take responsibility for how output is ultimately used in submitted academic work — directly relevant given this project's own Stage 6 approval gate and Stage 9's AI-use-disclosure point (§1, Stage 9).

### Mechanism spec

- **Mandatory, unchecked checkbox at signup** — not pre-checked, blocking account creation/first use until affirmatively checked. This is a structural gate, not a "please read our terms" link.
- **Versioned terms**: the T&C content carries an explicit version identifier (e.g., a date-stamped version string). Bumping the version is a deliberate, human decision (when content changes materially — not for typo fixes), not automatic.
- **Acceptance record — new Supabase table** (e.g., `terms_acceptances`: `user_id` FK, `version_accepted`, `accepted_at` timestamp). RLS: a user can read their own acceptance rows; only the acceptance-writing path can insert. This follows the same Supabase-table + RLS pattern already established for `profiles`/`api_credentials` in `supabase/schema.sql`.
- **Gate behavior**: on session start (and on every subsequent app load), compare the currently-published T&C version against the user's most recent `terms_acceptances` row. If there is no row, or its version is older than current, **block all app use** behind a full-screen re-acceptance modal — structurally a new, separate gate, not a repurposing of the existing `is_approved` admin-approval gate (this one is pure self-service consent, no admin action involved).
- **Where the data-reliability clause plugs in**: the T&C's AI/agent-sourced-content disclaimer states plainly that agent-found data/literature is provided as a convenience, is subject to the user's own review and approval (Stage 6's existing gate — this doesn't change that mechanism, it just puts it in writing as a term the user has agreed to), and that the user bears responsibility for verifying academic accuracy before relying on it.
- **Architecturally**: this is auth/account-level — Supabase table + read/write + a client-side gate component, the same shape as everything else already built for Stage 1. **No proxy involvement, no new architecture decision** — it fits entirely within what's already accepted (Supabase for account-level data).
- **Not built**: none of the above is implemented in this pass — table, gate component, and draft legal text are all pending, per instruction.
