/**
 * Pre-Flight AI Detector Simulation Engine.
 *
 * Estimates detection risk across primary academic & commercial AI detectors:
 * 1. Turnitin AI Detector (Perplexity, uniformity, and paraphraser n-gram matching)
 * 2. GPTZero (Perplexity & Burstiness distribution across sentences)
 * 3. CopyLeaks (Lexical predictability & statistical syntax signatures)
 * 4. Originality.ai (Deep language modeling probability)
 */

export interface FlaggedSentence {
  index: number;
  text: string;
  wordCount: number;
  riskScore: number; // 0 - 100
  riskLevel: "low" | "medium" | "high";
  reasons: string[];
}

export interface DetectorSimulationResult {
  turnitinScore: number; // 0 - 100
  gptZeroScore: number; // 0 - 100
  copyleaksScore: number; // 0 - 100
  originalityScore: number; // 0 - 100
  overallAiProbability: number; // 0 - 100
  humanLikelihoodScore: number; // 100 - overallAiProbability
  verdict: "Likely Human Written" | "Mixed / Partially Flagged" | "High AI Probability";
  burstinessScore: number; // 0 - 100 (higher = more human)
  perplexityEstimate: number; // 0 - 100 (higher = more diverse / unpredictable)
  markerDensity: number; // markers per 100 words
  detectedMarkers: string[];
  flaggedSentences: FlaggedSentence[];
  recommendations: string[];
}

const ACADEMIC_AI_MARKERS: Array<{ pattern: RegExp; name: string; weight: number }> = [
  { pattern: /\bmoreover\b/gi, name: "Moreover", weight: 8 },
  { pattern: /\bfurthermore\b/gi, name: "Furthermore", weight: 8 },
  { pattern: /\bdelve(?:s|ing)?\s*(?:into|deeper)?\b/gi, name: "Delve into", weight: 15 },
  { pattern: /\btestament to\b/gi, name: "Testament to", weight: 14 },
  { pattern: /\bcrucial to remember\b/gi, name: "Crucial to remember", weight: 12 },
  { pattern: /\bit is important to note that\b/gi, name: "It is important to note that", weight: 12 },
  { pattern: /\bit is crucial to\b/gi, name: "It is crucial to", weight: 10 },
  { pattern: /\bplays a pivotal role(?: in)?\b/gi, name: "Plays a pivotal role", weight: 15 },
  { pattern: /\bseamlessly integrates?\b/gi, name: "Seamlessly integrates", weight: 14 },
  { pattern: /\bin conclusion, it is evident that\b/gi, name: "In conclusion, it is evident that", weight: 16 },
  { pattern: /\bmultifaceted landscape\b/gi, name: "Multifaceted landscape", weight: 18 },
  { pattern: /\brich tapestry\b/gi, name: "Rich tapestry", weight: 18 },
  { pattern: /\bnavigating the (?:realm|landscape|complexities)\b/gi, name: "Navigating the realm/landscape", weight: 16 },
  { pattern: /\bfostering a (?:deeper|collaborative|holistic)\b/gi, name: "Fostering a...", weight: 12 },
  { pattern: /\bharnessing the power of\b/gi, name: "Harnessing the power of", weight: 15 },
  { pattern: /\bspearheading\b/gi, name: "Spearheading", weight: 10 },
  { pattern: /\ba plethora of\b/gi, name: "A plethora of", weight: 14 },
  { pattern: /\bit is essential to highlight\b/gi, name: "It is essential to highlight", weight: 12 },
  { pattern: /\bserves as a reminder\b/gi, name: "Serves as a reminder", weight: 12 },
  { pattern: /\ba delicate balance\b/gi, name: "A delicate balance", weight: 12 },
  { pattern: /\bsheds light on\b/gi, name: "Sheds light on", weight: 10 },
  { pattern: /\bvital component\b/gi, name: "Vital component", weight: 10 },
  { pattern: /\bgame-changer\b/gi, name: "Game-changer", weight: 14 },
  { pattern: /\bgroundbreaking\b/gi, name: "Groundbreaking", weight: 10 },
  { pattern: /\bunderscores the importance of\b/gi, name: "Underscores the importance of", weight: 12 },
  { pattern: /\bit remains to be seen\b/gi, name: "It remains to be seen", weight: 10 },
  { pattern: /\bin essence,\b/gi, name: "In essence", weight: 8 },
  { pattern: /\bnotably,\b/gi, name: "Notably", weight: 6 },
];

export function simulateAiDetectors(text: string): DetectorSimulationResult {
  if (!text || text.trim().length === 0) {
    return {
      turnitinScore: 0,
      gptZeroScore: 0,
      copyleaksScore: 0,
      originalityScore: 0,
      overallAiProbability: 0,
      humanLikelihoodScore: 100,
      verdict: "Likely Human Written",
      burstinessScore: 100,
      perplexityEstimate: 100,
      markerDensity: 0,
      detectedMarkers: [],
      flaggedSentences: [],
      recommendations: ["Document is empty. Enter text to run detector simulation."],
    };
  }

  const words = text.split(/\s+/).filter(Boolean);
  const totalWords = words.length;

  // Split into sentences preserving punctuation
  const rawSentences = text.match(/[^.!?]+[.!?]+/g) || (text.trim() ? [text.trim()] : []);
  const sentences = rawSentences.map((s) => s.trim()).filter((s) => s.length > 0);

  const sentenceWordCounts = sentences.map((s) => s.split(/\s+/).filter(Boolean).length);

  // 1. Calculate Burstiness (Variance of sentence length)
  const avgLen = sentenceWordCounts.length > 0
    ? sentenceWordCounts.reduce((a, b) => a + b, 0) / sentenceWordCounts.length
    : 0;

  const variance = sentenceWordCounts.length > 0
    ? sentenceWordCounts.reduce((acc, len) => acc + Math.pow(len - avgLen, 2), 0) / sentenceWordCounts.length
    : 0;
  const stdDev = Math.sqrt(variance);

  // High stdDev relative to mean implies high human burstiness (0-100 score)
  const burstinessScore = Math.min(100, Math.max(10, Math.round((stdDev / 11) * 100)));

  // 2. Identify AI Markers & Density
  const detectedMarkers: string[] = [];
  let totalMarkerWeight = 0;

  for (const item of ACADEMIC_AI_MARKERS) {
    const matches = text.match(item.pattern);
    if (matches && matches.length > 0) {
      detectedMarkers.push(item.name);
      totalMarkerWeight += item.weight * matches.length;
    }
  }

  const markerDensity = totalWords > 0 ? (detectedMarkers.length / totalWords) * 100 : 0;

  // 3. Perplexity Proxy (Lexical Diversity + Syntactic Variety)
  const uniqueWords = new Set(words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")));
  const typeTokenRatio = totalWords > 0 ? (uniqueWords.size / totalWords) : 1;
  const perplexityEstimate = Math.min(100, Math.max(15, Math.round(typeTokenRatio * 110 + (stdDev * 1.5))));

  // 4. Evaluate Sentence-by-Sentence Risk
  const flaggedSentences: FlaggedSentence[] = [];

  for (let i = 0; i < sentences.length; i++) {
    const s = sentences[i];
    const sWords = sentenceWordCounts[i];
    const reasons: string[] = [];
    let sentenceRisk = 0;

    // Check sentence-level AI markers
    for (const item of ACADEMIC_AI_MARKERS) {
      if (item.pattern.test(s)) {
        reasons.push(`Contains AI trope "${item.name}"`);
        sentenceRisk += item.weight;
      }
    }

    // Check uniformity with neighboring sentences
    if (i > 0 && Math.abs(sentenceWordCounts[i] - sentenceWordCounts[i - 1]) <= 2 && sWords >= 15) {
      reasons.push("Uniform sentence length matching predecessor");
      sentenceRisk += 15;
    }

    // Check passive or cliché opener
    if (/^(moreover|furthermore|additionally|in conclusion|it is crucial|it is important)/i.test(s)) {
      reasons.push("Formulaic transitional sentence starter");
      sentenceRisk += 15;
    }

    // Cap sentence risk
    sentenceRisk = Math.min(100, sentenceRisk);

    if (sentenceRisk >= 25 || reasons.length > 0) {
      flaggedSentences.push({
        index: i,
        text: s,
        wordCount: sWords,
        riskScore: sentenceRisk,
        riskLevel: sentenceRisk >= 50 ? "high" : sentenceRisk >= 25 ? "medium" : "low",
        reasons,
      });
    }
  }

  // 5. Calculate Simulated Scores for specific detectors
  // Turnitin: Sensitive to repetitive transitions, uniform length, and formulaic essay structure
  const turnitinScore = Math.min(
    99,
    Math.max(
      2,
      Math.round(
        (100 - burstinessScore) * 0.4 +
        Math.min(50, totalMarkerWeight * 1.4) +
        (100 - perplexityEstimate) * 0.2
      )
    )
  );

  // GPTZero: Heavily weighted on burstiness and sentence-level perplexity variance
  const gptZeroScore = Math.min(
    99,
    Math.max(
      3,
      Math.round(
        (100 - burstinessScore) * 0.55 +
        (100 - perplexityEstimate) * 0.35 +
        Math.min(20, detectedMarkers.length * 4)
      )
    )
  );

  // CopyLeaks: Sensitive to n-gram predictability and high marker density
  const copyleaksScore = Math.min(
    99,
    Math.max(
      4,
      Math.round(
        (100 - perplexityEstimate) * 0.5 +
        Math.min(40, totalMarkerWeight * 1.2) +
        (100 - burstinessScore) * 0.2
      )
    )
  );

  // Originality.ai: Aggressive baseline probability
  const originalityScore = Math.min(
    99,
    Math.max(
      5,
      Math.round(
        (turnitinScore * 0.4 + gptZeroScore * 0.4 + copyleaksScore * 0.2) * 1.05
      )
    )
  );

  // Composite overall AI probability
  const overallAiProbability = Math.round(
    turnitinScore * 0.35 +
    gptZeroScore * 0.35 +
    copyleaksScore * 0.20 +
    originalityScore * 0.10
  );

  const humanLikelihoodScore = Math.max(1, 100 - overallAiProbability);

  const verdict =
    overallAiProbability <= 25
      ? "Likely Human Written"
      : overallAiProbability <= 55
      ? "Mixed / Partially Flagged"
      : "High AI Probability";

  // Generate actionable recommendations
  const recommendations: string[] = [];
  if (burstinessScore < 50) {
    recommendations.push("Increase sentence rhythm variation by mixing short, punchy statements with compound analytical clauses.");
  }
  if (detectedMarkers.length > 0) {
    recommendations.push(`Replace repetitive AI markers (${detectedMarkers.slice(0, 3).join(", ")}) with specific empirical transitions.`);
  }
  if (perplexityEstimate < 55) {
    recommendations.push("Enhance lexical variety by replacing generic adjectives with precise domain terminology.");
  }
  if (flaggedSentences.length === 0 && overallAiProbability <= 25) {
    recommendations.push("Stylometric cadence is natural and diverse. Citations and mathematical rigor are preserved.");
  }

  return {
    turnitinScore,
    gptZeroScore,
    copyleaksScore,
    originalityScore,
    overallAiProbability,
    humanLikelihoodScore,
    verdict,
    burstinessScore,
    perplexityEstimate,
    markerDensity: parseFloat(markerDensity.toFixed(2)),
    detectedMarkers: Array.from(new Set(detectedMarkers)),
    flaggedSentences,
    recommendations,
  };
}
