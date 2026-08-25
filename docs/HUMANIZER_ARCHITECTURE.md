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

---

## 7. Production Release Checklist

| Area | Invariant / Requirement | Gate Status |
| :--- | :--- | :--- |
| **Security** | Prompt injections treated strictly as data; zero instruction override | **PASS** |
| **Privacy** | Zero raw user manuscript logging in telemetry or local storage | **PASS** |
| **Protected Citations** | In-text APA, IEEE, numeric citations survive 100% | **PASS** |
| **Protected Mathematics** | Inline/display LaTeX equations and operators survive 100% | **PASS** |
| **Quantitative Rigour** | Exact numbers, p-values, sample sizes, and CIs survive 100% | **PASS** |
| **Claim Safety** | Negation inversions and causality leaps rejected 100% | **PASS** |
| **Fail-Safe Fallback** | Original text restored on audit rejection or provider failure | **PASS** |
| **Bounded Retry** | Maximum 2 retries from canonical state; zero infinite loops | **PASS** |
| **Long Documents** | Multi-chapter chunk isolation & cancellation support | **PASS** |
| **Design Consistency** | Native Scholar Core UI tokens, typography, dark/light theme | **PASS** |
| **Accessibility** | Semantic buttons, contrast, and non-color status cues | **PASS** |

---

## 8. Final Product Positioning
The **Text Humanizer** is positioned exclusively as:
> **An AI-assisted academic prose refinement engine with deterministic claim, citation, quantitative, and terminology safeguards.**

It is **NOT** positioned as:
- An "AI detector bypasser" or "undetectable AI";
- A tool for plagiarized text evasion;
- A substitute for human peer review.
