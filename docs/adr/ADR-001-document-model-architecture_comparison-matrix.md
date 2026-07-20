# ADR-001 Comparison Matrix (Document Model Architecture)

| Criterion | Option A: Single unified model | Option B: Canonical + internal specialized models | Option C: Separate bounded-context models + adapters | Option D: Alternative architecture |
|---|---|---|---|---|
| Advantages | One authoritative type; simpler reasoning | Same as A + allows internal stage flexibility | Keeps both models intact (immediate) | Potentially avoids conversion entirely if it fits |
| Disadvantages | Requires consolidation of divergent schemas | Requires discipline to prevent leakage | Requires complex, audited conversion semantics | High design risk |
| Migration complexity | Medium–High | Medium–High | High (adapters + long-term maintenance) | High |
| Backward compatibility | Potentially breaking | Potentially breaking | Better immediate stability | Unclear |
| Performance | Neutral | Neutral | Conversion overhead possible | Unclear |
| Maintainability | High | High | Medium–Low | Unclear |
| Scalability | High | High | Medium | Unclear |
| Coupling | Low after consolidation | Low | Medium (adapters couple models) | Unclear |
| Future extensibility | High if canonical is extensible | High | Medium (feature mapping in both models) | Unclear |
| Testing impact | Reduced (one contract) | Reduced (canonical contract tests) | Increased (conversion + invariants) | High |
| Risk | Moderate | Lower than C | High (evidence already shows mismatch) | High |

**Evidence-based note:** Current code already shows mismatch between model producers and consumers without conversion boundaries; therefore Option C is not justified by existing evidence.

