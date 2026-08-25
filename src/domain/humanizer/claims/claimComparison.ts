/**
 * Claim Comparison & Epistemic Shift Auditor.
 *
 * Compares original propositional claims against rewritten candidate claims
 * to detect negation reversals, unwarranted certainty shifts, causality escalation,
 * dropped claims, and quantitative discrepancies.
 */

import {
  ExtractedClaim,
  ClaimComparisonFinding,
  ClaimComparisonReport,
  EpistemicModality,
  ClaimCausality,
} from "../types";

const MODALITY_STRENGTH: Record<EpistemicModality, number> = {
  possible: 1,
  probable: 2,
  certain: 3,
  unspecified: 2,
};

const CERTAINTY_STRENGTH = {
  low: 1,
  medium: 2,
  high: 3,
};

const CAUSALITY_STRENGTH: Record<ClaimCausality, number> = {
  none: 0,
  correlational: 1,
  possible_causal: 2,
  direct: 3,
};

/** Clean and stem words for robust proposition matching across rewrites */
export function extractPropositionTokens(str: string): Set<string> {
  const clean = str
    .toLowerCase()
    .replace(/⟦PROTECTED_[^⟧]+⟧/g, " ")
    .replace(/[^\w\s]/g, " ");

  const rawWords = clean.split(/\s+/).filter((w) => w.length > 2);
  const stemmed = rawWords.map((w) => {
    if (w.endsWith("ies") && w.length > 4) return w.slice(0, -3) + "y";
    if (w.endsWith("ing") && w.length > 5) return w.slice(0, -3);
    if (w.endsWith("ed") && w.length > 4) return w.slice(0, -2);
    if (w.endsWith("es") && w.length > 4) return w.slice(0, -2);
    if (w.endsWith("s") && !w.endsWith("ss") && w.length > 3) return w.slice(0, -1);
    return w;
  });

  return new Set(stemmed);
}

/** Compute word overlap similarity between two proposition strings */
export function computePropositionOverlap(strA: string, strB: string): number {
  const wordsA = extractPropositionTokens(strA);
  const wordsB = extractPropositionTokens(strB);
  if (wordsA.size === 0 || wordsB.size === 0) return 0;

  let intersection = 0;
  for (const w of wordsA) {
    if (wordsB.has(w)) intersection++;
  }

  const union = new Set([...wordsA, ...wordsB]).size;
  return union > 0 ? intersection / union : 0;
}

/** Compare a single original claim with its corresponding candidate claim */
export function compareSingleClaimPair(
  original: ExtractedClaim,
  candidate: ExtractedClaim
): ClaimComparisonFinding {
  const baseFinding: Omit<ClaimComparisonFinding, "status" | "reason" | "severity"> = {
    claimId: original.claimId,
    originalProposition: original.proposition,
    candidateProposition: candidate.proposition,
    originalModality: original.modality,
    candidateModality: candidate.modality,
    originalCertainty: original.certainty,
    candidateCertainty: candidate.certainty,
    originalCausality: original.causality,
    candidateCausality: candidate.causality,
    originalNegation: original.negation,
    candidateNegation: candidate.negation,
  };

  // 1. Check Negation Reversal (Critical Error)
  if (original.negation !== candidate.negation) {
    return {
      ...baseFinding,
      status: "NEGATION_REVERSAL",
      severity: "error",
      reason: original.negation
        ? "Candidate removes negation, reversing what the proposition claims."
        : "Candidate introduces negation, reversing what the proposition claims.",
    };
  }

  // 2. Check Causality Shift (e.g. correlational/associational -> direct causal)
  const origCausal = original.causality || "none";
  const candCausal = candidate.causality || "none";
  const origCausalStrength = CAUSALITY_STRENGTH[origCausal];
  const candCausalStrength = CAUSALITY_STRENGTH[candCausal];

  if (candCausalStrength > origCausalStrength && origCausal !== "direct") {
    return {
      ...baseFinding,
      status: "CAUSALITY_SHIFT",
      severity: "error",
      reason: `Candidate escalates a ${origCausal.replace("_", " ")} relationship into a direct causal claim.`,
    };
  }

  // 3. Check Epistemic Modality & Certainty Shift (Strengthening hedged claims is Critical Error)
  const origModStrength = MODALITY_STRENGTH[original.modality] || 2;
  const candModStrength = MODALITY_STRENGTH[candidate.modality] || 2;
  const origCertStrength = CERTAINTY_STRENGTH[original.certainty] || 2;
  const candCertStrength = CERTAINTY_STRENGTH[candidate.certainty] || 2;

  if (candModStrength > origModStrength || candCertStrength > origCertStrength) {
    return {
      ...baseFinding,
      status: "EPISTEMIC_SHIFT",
      severity: "error",
      reason: `Candidate strengthens a hedged proposition ('${original.modality}', ${original.certainty} certainty) into an asserted proposition ('${candidate.modality}', ${candidate.certainty} certainty).`,
    };
  }

  if (candModStrength < origModStrength - 1) {
    return {
      ...baseFinding,
      status: "EPISTEMIC_SHIFT",
      severity: "warning",
      reason: `Candidate substantially weakens an asserted proposition ('${original.modality}') into speculative uncertainty ('${candidate.modality}').`,
    };
  }

  // 4. Check Quantitative Constraints
  if (original.quantitativeConstraints && original.quantitativeConstraints.length > 0) {
    const candidateConstraints = candidate.quantitativeConstraints || [];
    const missingConstraints = original.quantitativeConstraints.filter(
      (c) => !candidateConstraints.includes(c) && !candidate.proposition.includes(c)
    );

    if (missingConstraints.length > 0) {
      return {
        ...baseFinding,
        status: "QUANTITATIVE_SHIFT",
        severity: "error",
        reason: `Candidate dropped or modified quantitative constraint(s): ${missingConstraints.join(", ")}.`,
      };
    }
  }

  // 5. Proposition Preserved
  return {
    ...baseFinding,
    status: "PRESERVED",
    severity: "none",
    reason: "Propositional meaning, epistemic certainty, and quantitative constraints are faithfully preserved.",
  };
}

/**
 * Compares an array of original claims against an array of candidate rewritten claims.
 */
export function compareClaims(
  originalClaims: ExtractedClaim[],
  candidateClaims: ExtractedClaim[]
): ClaimComparisonReport {
  if (originalClaims.length === 0 && candidateClaims.length === 0) {
    return {
      valid: true,
      preservationRate: 1.0,
      findings: [],
      hasEpistemicShift: false,
      hasNegationReversal: false,
      hasCausalityShift: false,
      hasDroppedClaims: false,
      hasAddedClaims: false,
    };
  }

  const findings: ClaimComparisonFinding[] = [];
  const matchedCandidateIndices = new Set<number>();

  for (let origIdx = 0; origIdx < originalClaims.length; origIdx++) {
    const orig = originalClaims[origIdx];
    let bestMatchIdx = -1;
    let highestOverlap = -1;

    for (let i = 0; i < candidateClaims.length; i++) {
      if (matchedCandidateIndices.has(i)) continue;
      const cand = candidateClaims[i];

      // Exact sentence ID match
      if (cand.sourceSentenceId && orig.sourceSentenceId && cand.sourceSentenceId === orig.sourceSentenceId) {
        bestMatchIdx = i;
        break;
      }

      const overlap = computePropositionOverlap(orig.proposition, cand.proposition);
      if (overlap > highestOverlap) {
        highestOverlap = overlap;
        bestMatchIdx = i;
      }
    }

    // If overlap is found or if candidate is in the same block and relative position
    const isPositionalMatch =
      bestMatchIdx === -1 &&
      origIdx < candidateClaims.length &&
      !matchedCandidateIndices.has(origIdx) &&
      originalClaims[origIdx].sourceBlockId === candidateClaims[origIdx].sourceBlockId;

    const finalMatchIdx = bestMatchIdx !== -1 && (highestOverlap >= 0.1 || candidateClaims[bestMatchIdx].sourceSentenceId === orig.sourceSentenceId)
      ? bestMatchIdx
      : isPositionalMatch
      ? origIdx
      : -1;

    if (finalMatchIdx !== -1) {
      matchedCandidateIndices.add(finalMatchIdx);
      const cand = candidateClaims[finalMatchIdx];
      const finding = compareSingleClaimPair(orig, cand);
      findings.push(finding);
    } else {
      // Dropped Claim
      findings.push({
        claimId: orig.claimId,
        status: "DROPPED",
        originalProposition: orig.proposition,
        reason: `Original proposition was omitted in the candidate rewrite: "${orig.proposition}".`,
        severity: "error",
      });
    }
  }

  // Check for any remaining candidate claims not matched to any original claim (Added Claims)
  for (let i = 0; i < candidateClaims.length; i++) {
    if (!matchedCandidateIndices.has(i)) {
      const cand = candidateClaims[i];
      findings.push({
        claimId: cand.claimId,
        status: "ADDED",
        candidateProposition: cand.proposition,
        reason: `Candidate introduces a new proposition not present in the original text: "${cand.proposition}".`,
        severity: "warning",
      });
    }
  }

  const preservedCount = findings.filter((f) => f.status === "PRESERVED").length;
  const totalOriginal = Math.max(1, originalClaims.length);
  const preservationRate = preservedCount / totalOriginal;

  const hasEpistemicShift = findings.some((f) => f.status === "EPISTEMIC_SHIFT" && f.severity === "error");
  const hasNegationReversal = findings.some((f) => f.status === "NEGATION_REVERSAL");
  const hasCausalityShift = findings.some((f) => f.status === "CAUSALITY_SHIFT" && f.severity === "error");
  const hasDroppedClaims = findings.some((f) => f.status === "DROPPED");
  const hasAddedClaims = findings.some((f) => f.status === "ADDED");

  const valid = !hasEpistemicShift && !hasNegationReversal && !hasCausalityShift && !hasDroppedClaims;

  return {
    valid,
    preservationRate: Math.round(preservationRate * 100) / 100,
    findings,
    hasEpistemicShift,
    hasNegationReversal,
    hasCausalityShift,
    hasDroppedClaims,
    hasAddedClaims,
  };
}
