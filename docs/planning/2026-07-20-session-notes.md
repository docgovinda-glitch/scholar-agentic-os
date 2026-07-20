# Session Notes — 2026-07-20

Three design proposals scoped in this session, ahead of any implementation. Produced after the documentation-accuracy pass (see `.claude/HANDOVER.md`) and the production-readiness execution plan for the same date. Reproduced here in full — these findings (file names, line counts, the per-agent audit table, the `SkillResult` interface sketch) would otherwise need to be re-derived from scratch in a future session.

**None of this has been implemented.** No components were redesigned, no `SkillResult` field was added, no agents were created. This document is the planning record only.

---

## 1. UI Direction — "Sci-Fi Movie" Aesthetic

**Status: DESIGN ONLY — NOT IMPLEMENTED.** No CSS, component, or theme-token changes have been made. Everything below is a proposal for review.

**Concrete direction: "Ancient Knowledge, Future Interface."** Rather than a generic HUD skin, lean into what's actually distinctive about this product — it's an interface for reasoning over old texts (citations, Vedic Samhitas via `VedicDatabase.tsx`, archival literature) through a machine intelligence layer. That tension (archive vs. machine) is a stronger, more defensible identity than "neon and glow," and it doesn't require throwing away the current serif/display font — it recontextualizes it.

- **Palette**: dark-first. Base `#04070C`–`#0A0F1A` (near-black navy, a direct descendant of the existing `--color-brand-950`/`900`), primary accent shifts from the current gold (`#C08A3E`) to a cooler **phosphor-cyan** (`~#5EEAD4`/`#22D3EE`) for active/machine states, keeping the **existing gold/amber** (`#C08A3E`) as the "archival/ancient" accent for citations, Vedic references, and manuscript content specifically. Status colors stay close to current (`#10B981` success, `#F59E0B` warning) so semantics don't shift. This gives you a two-accent system with meaning (cyan = system/AI, gold = scholarship/source) instead of one undifferentiated glow color.
- **Typography**: keep `--font-serif` (Playfair Display) for manuscript/citation content — don't sci-fi the actual scholarship. Reassign `--font-mono` (JetBrains Mono, already in the theme, currently unused for chrome) to system chrome: labels, status readouts, phase indicators, agent output metadata. That contrast (serif content in a mono-framed interface) *is* the aesthetic.
- **Motion**: `motion` (Framer Motion) is a dependency but used in only 1 component today, so there's no legacy pattern to fight. Recommend: scan-line/typewriter reveal for AI-streamed text (you already have SSE streaming endpoints — this is functional, not decorative), clip-path panel wipes instead of generic fades, and a subtle pulse on "agent active" states. No continuous ambient animation — everything should be state-driven (something happened → something animates), not idle decoration.
- **Reference touchstones**: *Blade Runner 2049* (amber archival holograms vs. cool chrome — maps directly to the gold/cyan split above), *Arrival* (an alien/ancient script rendered through a technical analysis UI — the closest visual analogue to "Vedic text meets AI interface" this medium has produced), *The Expanse* (restrained, functional in-universe UI design, frequently cited by real UI designers as the anti-example to over-glowed sci-fi — good guardrail reference for restraint).

**Accessibility conflict (real, not hypothetical)**: `aria-*` currently appears in **1 of 31** components (`ManuscriptDraftingWorkspace.tsx`). A dark, glow-accented redesign makes this worse by default in three specific ways: (1) neon-on-black text often fails WCAG AA contrast unless deliberately constrained — rule: glow/color effects apply only to *decorative* chrome (borders, icons, background), body text always resolves to a plain high-contrast token, never the glow color itself; (2) pulse/flicker motion patterns can trigger vestibular issues and must respect `prefers-reduced-motion` from day one, not as a follow-up; (3) glow effects frequently replace the browser's default focus ring with something that looks good but isn't a real focus indicator — every redesigned component needs an explicit, high-contrast `:focus-visible` style. Given the roadmap already has UX-1 (accessibility pass) and QUAL-2 (ESLint + jsx-a11y) as open items, the cleanest path is to treat this redesign as the place those two land first, rather than doing the visual work now and retrofitting `aria-*` later.

**Highest-impact components to redesign first** (incremental, ordered by impact-to-risk ratio):
1. `src/index.css` + `src/components/layout/AppHeader.tsx` / `AppFooter.tsx` — the global chrome visible on every screen; smallest surface area, establishes the whole system at once.
2. `src/components/CommandPalette.tsx` (467 lines) — self-contained overlay, doesn't touch business logic, and a command palette is the single most on-genre UI pattern available.
3. `src/components/agents/ActiveAgentsPanel.tsx` — small, and "agent status" (online/active/idle) is a natural home for the restrained-pulse motion language, reusable elsewhere afterward.
4. `src/components/AIControlCenter.tsx` / `AISetupWizard.tsx` — thematically the strongest fit ("control center"), but larger (945 lines) — do after 1–3 establish the pattern language.
5. `src/components/ResearchIntelligenceDashboard.tsx` — natural home for data-viz-heavy treatment; largest and most integration-heavy of this group, so last.

Everything else in `src/components/` (31 total) should adopt the system incrementally as touched, not as a batch.

---

## 2. Native Agent Skills — No-AI-Call Execution Path

**Status: DESIGN ONLY — NOT IMPLEMENTED.** No `SkillResult` field has been added, no agent has been rewired to `src/skills/`, and `createAgentContext()` in `server.ts` is unchanged.

**Headline finding: this already exists, twice — just not connected.** Before designing anything new: `src/skills/` is a fully-built "Skills Framework" (its own doc comment literally says "demonstrates the complete Skills Framework lifecycle for native skills"), with a working reference implementation (`wordCountSkill.ts`), a registry, an executor, and 3 test files — the best relative test coverage of any module in the repo. **Nothing outside `src/skills/` imports it.** Separately, `src/agents/types.ts` already declares an `ExecutionMode = "ai" | "deterministic" | "web" | "hybrid"` with per-agent `supportedModes`/`defaultMode` metadata — but every one of the 8 agents' `execute()` methods runs the *same deterministic logic regardless of requested mode*; the `ai`/`hybrid`/`web` branches are unimplemented stubs (e.g. `literatureReview.ts`'s web-mode method is a one-line comment: `// Would call web search providers through abstraction`). And `createAgentContext()` in `server.ts` — the function that actually constructs the context every agent runs with in production — leaves `getDocument`, `getReferences`, `runSkill`, and `formatCitation` all undefined. So today, in production, all 8 agents are already 100% deterministic, already disconnected from the Knowledge Vault, and already disconnected from the Skills Framework that was clearly built to serve exactly this purpose.

Meanwhile, the *actual* AI-calling code the live UI depends on (`generateDissertationGrounding`, `draftSection`, `runQualityControl`, etc.) lives entirely separately in `src/services/aiService.ts`, called directly from `server.ts`'s `/api/generate/*` routes — completely bypassing the agent framework. That file already informally mixes deterministic functions (`buildBibliography`, `analyzeCitationConsistency`, `analyzeManuscriptStructure` — all synchronous, no model call) with real `async` AI-calling functions, with no boundary between them.

**Per-agent audit:**

| Agent | Deterministic core (real, working today) | Claims "ai"/"hybrid" mode | Actually calls AI? |
|---|---|---|---|
| ResearchPlannerAgent | Template-based phase/milestone plan generation | Yes | No — same output regardless of mode |
| LiteratureReviewAgent | Theme/gap classification from supplied references | Yes (+ "web") | No — web-search fetch is a stub comment |
| KnowledgeGapAgent | Gap identification from literature-review input | Yes | No |
| ResearchQuestionAgent | Question/hypothesis structuring | Yes | No |
| MethodologyAdvisorAgent | Design/method recommendation from rules | Yes | No |
| StatisticalAnalysisAdvisor | Test-selection heuristics | Yes | No |
| IntegrityReviewerAgent | Reporting-guideline compliance checks | Yes | No |
| ManuscriptWriterAgent | Section scaffolding from CRPM data | Yes | No — "abstract" is a string template, not drafted text |

Genuinely AI-needed work — drafting free prose, synthesizing literature beyond counting/classifying, critique commentary — exists in the codebase (`aiService.ts`) but isn't reachable from *any* of the 8 agents today.

**Proposed interface — reuse, don't reinvent:** formalize `src/skills/` as the native-skill layer (it's already the right shape), and close the one real gap it has: no AI-escalation signal.

```ts
// Addition to src/skills/types.ts — not a new framework
interface SkillResult<T> {
  ok: boolean;
  data?: T;
  confidence?: number;       // already implied by agent diagnostics today
  escalateToAI?: {           // NEW — the missing piece
    reason: string;
    suggestedPrompt?: string;
  };
}
```

An `Agent.execute()` would then: (1) call its underlying `Skill`(s) via a real `SkillRegistry`/`SkillExecutor` wiring (replacing the current no-op `context.runSkill`), (2) return the skill's result directly if `escalateToAI` is absent, (3) only if present — or if the caller explicitly requested `mode: "ai"`/`"hybrid"` — fall through to `src/services/aiGateway.ts`. This makes today's fake "hybrid" mode a real one, with zero new frameworks introduced.

**Classification for this pass:**
- **Register as native skills now** (already deterministic, just needs `Skill` wrapping + registry entries): the 8 agents' existing template logic, citation formatting (`src/citation_compliance/formatters/*`), DOI lookup (`/api/lookup-doi` — a real CrossRef API call, not AI), file parsing (`src/document_intelligence/parser/*`).
- **Needs a real `escalateToAI` implementation** (currently faked): `LiteratureReviewAgent`'s theme synthesis beyond mechanical classification, `ManuscriptWriterAgent`'s abstract/prose generation, `IntegrityReviewerAgent`'s qualitative critique — these are exactly the pieces of `aiService.ts` (`draftSection`, `runQualityControl`, etc.) that should be wired in as each agent's escalation target, agent-by-agent rather than all at once.

---

## 3. Agent Roster Expansion — Blocked on ARCH-3

**Status: DESIGN ONLY — NOT IMPLEMENTED. BLOCKED — do not schedule ahead of the ARCH-3 decision.**

**This entire section is conditional and should not be scheduled.** Whether any of this is worth building depends entirely on the still-open ARCH-3 decision (wire the orchestrator/kernel layer — `src/orchestrator`, `src/knowledge`, `src/writing`, `src/publication`, `src/workspace`, `src/collaboration` — into the live app, or archive it). Adding agents to a roster that has no orchestrator to run multi-agent workflows and no kernels to persist their output is scope creep on top of an unresolved foundation. Treat everything below as *gap analysis only*, to be revisited once ARCH-3 resolves toward "wire in."

**Dependency chain**: §3 (this section) depends on ARCH-3 → ARCH-3 has not been decided → therefore nothing in this section should be scheduled, staffed, or started until that decision is made and recorded (see `.claude/HANDOVER.md` / the production-readiness roadmap for ARCH-3's status).

**Assuming ARCH-3 resolves toward wiring the orchestrator in**, mapping the current 8 agents against the ten-phase workflow stated in `README.md`/`AGENTS.md` (Research Intake → Literature Review → Research Planning → Methodology Design → Data Analysis → Draft Writing → Manuscript Refinement → Compliance Checking → Publication Preparation → Publication Submission) surfaces phases with no agent coverage — several of which already have a raw `aiService.ts` function or standalone UI component doing the work today, just not through the agent framework:

| Phase (stated objective) | Current coverage | Gap |
|---|---|---|
| Research Intake | `ResearchIntakeWizard.tsx` (UI only) | **Intake & Scoping Agent** — structures raw topic/objectives input into a research brief |
| Data Analysis (source discovery) | `discoverDataSources` in `aiService.ts` (no agent) | **Data Discovery Agent** — finds candidate empirical/textual sources, distinct from `StatisticalAnalysisAdvisor`'s post-hoc analysis of data already in hand |
| Manuscript Refinement | `runQualityControl` in `aiService.ts` (no agent) | **Manuscript Refinement / Quality Control Agent** |
| Compliance Checking | `extractRequirements` in `aiService.ts` (no agent) | **Journal Compliance Agent** — checks a manuscript against a target journal's stated requirements |
| Publication Preparation | `discoverJournals` in `aiService.ts` (no agent) | **Journal Matching Agent** |
| Publication Submission | `generateSubmissionPack` in `aiService.ts` (no agent) | **Submission Packaging Agent** |
| Cross-cutting: academic-compliance engine (stated in `README.md`) | `citation_compliance/` formatters (service, no agent) | **Citation Compliance Agent** — ambiguous; may belong as a native skill (§2) rather than a full agent |
| Cross-cutting: "query the Knowledge Vault… theoretical alignment with Vedic Samhitas" (stated persona directive in `AGENTS.md`) | `VedicDatabase.tsx` (UI only, no agent-level orchestration) | **Theoretical Alignment Agent** — the one gap that's specific to this project's own stated identity, not a generic workflow phase |

Names and one-line responsibilities only, as scoped — no interfaces, no scaffolding, no priority ordering, since none of it should be scheduled ahead of the ARCH-3 decision.
