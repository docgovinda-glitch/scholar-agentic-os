# AI Text Humanizer — Production Architecture & Engineering Reference

## 1. System Mission & Core Objective
The **AI Text Humanizer** is a controlled academic and natural-language rewriting engine designed to:
- Substantially improve prose flow, readability, structural variation, and author-voice consistency;
- Preserve 100% of underlying factual propositions, mathematical expressions, citations, numbers, and quotations;
- Maintain strict epistemic certainty without artificial overclaiming or causal escalation;
- Provide transparent, auditable review with deterministic fail-safe rollbacks.

> **Production Rule:** The system is NOT optimized around external AI-detector scores or claims of "undetectability." All metrics evaluate linguistic quality, structural integrity, and semantic fidelity.

---

## 2. Multi-Stage Pipeline Architecture

```
                       USER INPUT / MANUSCRIPT
                                  │
                                  ▼
                     1. Canonical Document Parser
              (HumanizerDocument, Block & Sentence Hierarchy)
                                  │
                                  ▼
                2. Layered Protected Element Shielding
        (TokenRegistry: Citations, LaTeX, Quotes, DOIs, Numbers)
                                  │
                                  ▼
               3. Propositional Claims & Modality Engine
          (Epistemic Certainty, Causality, Polarity Mapping)
                                  │
                                  ▼
               4. Hierarchical Block-by-Block Rewriting
         (Conservative / Balanced / Deep Restructure Prompts)
                                  │
                                  ▼
                   5. Multi-Auditor Validation Suite
     ┌───────────────────────────────────────────────────────────┐
     │ • IntegrityAuditor  (Zero-tolerance token survival)       │
     │ • ClaimAuditor      (Epistemic & causality fidelity)     │
     │ • GrammarAuditor    (Sentence bounds & agreement)         │
     │ • CoherenceAuditor  (Discourse transitions & flow)        │
     │ • SemanticAuditor   (Heuristic word-retention bounds)     │
     └───────────────────────────────────────────────────────────┘
                                  │
                ┌─────────────────┴─────────────────┐
                ▼                                   ▼
          [AUDIT PASS]                        [AUDIT REJECT]
                │                                   │
                ▼                                   ▼
   6. Deterministic Restoration             6b. Adaptive Retry
     (Byte-for-byte replacement)             (Targeted prompt guidance)
                │                                   │
                ▼                             [Exhausted?]
    VALIDATED HUMANIZED CANDIDATE                   │
                                                    ▼
                                          FAIL-SAFE ORIGINAL FALLBACK
```

---

## 3. Hard Safety Invariants & Release Gates

| Invariant Gate | Threshold | Enforcement Mechanism |
| :--- | :--- | :--- |
| **Protected Element Survival** | **100.0%** | `TokenRegistry` byte-for-byte restoration. Immediate candidate rejection if missing or mutated. |
| **Locked Terminology Memory** | **100.0%** | `resolveTerminologyHierarchy` verbatim preservation. Rejects any synonym translation. |
| **Raw Token Leakage** | **0 Leaked** | Post-restoration scan for `⟦PROTECTED_...⟧` placeholders. Rejects candidate if placeholder remains. |
| **Critical Negation Reversals** | **0 Allowed** | `ClaimAuditor` polarity check. Immediate `REJECT` if negative claim inverted. |
| **Critical Causality Escalations** | **0 Allowed** | `ClaimAuditor` causality check. Rejects correlational-to-causal leaps. |
| **False Acceptance Rate** | **0.0%** | Multi-gate audit short-circuits on any critical finding. |
| **Semantic Fidelity** | **Calibrated Heuristic** | Content-word overlap & length ratios labeled explicitly as `HEURISTIC`. |

---

## 4. Cross-Session Terminology Memory
Terminology memory enforces strict deterministic precedence across four scopes:
1. **`DOCUMENT`** (Highest priority, document/session lock);
2. **`PROJECT`** (Workspace project-level terminology memory);
3. **`USER`** (Cross-project author preferences);
4. **`SYSTEM`** (Default academic conventions).

```
DOCUMENT > PROJECT > USER > SYSTEM
```

Document-scoped terms are never automatically promoted to permanent memory, avoiding global memory pollution. Explicit promotion actions (`Save to Project`, `Save to My Preferences`) are required.

---

## 5. Hierarchical Long-Document Processing
- Manuscripts with 10–100+ paragraphs are partitioned into `DocumentChunk[]` (`maxBlocksPerChunk: 5`, `maxTokensPerChunk: 1500`).
- Chunks never split across citations, equations, quotations, or sentences.
- **Isolated Failure Boundary**: If Chunk $K$ fails audit after retries, Chunk $K$ safely falls back to original source text, while all passing chunks remain intact.
- **Resumability & Cancellation**: Long jobs can be cancelled via `AbortSignal` without losing already validated chapters.

---

## 6. Failure & Security Defenses
- **Data vs. Instruction Separation**: Source manuscript text is strictly enclosed in triple-quote data envelopes (`### SOURCE TEXT TO REWRITE\n"""..."""`). Embedded adversarial instructions are treated as document data and never executed.
- **Fail-Safe Fallback**: Any provider timeout, HTTP 429, malformed response, or audit rejection cleanly preserves the original source text. Unvalidated candidates are never displayed.
