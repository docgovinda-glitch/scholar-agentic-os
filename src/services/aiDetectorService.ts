/**
 * AI Detection & Stylometrics Service
 * Provides:
 * 1. Layer 1: Instant client-side statistical stylometrics (Burstiness, Cliché density, Lexical diversity, AI Probability).
 * 2. Layer 2: External authentic verification (GPTZero, Sapling APIs).
 */

export interface LocalStylometricVerdict {
  aiProbability: number; // 0 - 100
  humanProbability: number; // 0 - 100
  verdict: "Likely Human" | "Mixed / Moderate" | "Likely AI-Generated";
  burstinessScore: number; // 0 - 100 (higher = more organic variation)
  avgSentenceLength: number;
  sentenceCount: number;
  wordCount: number;
  detectedClichés: string[];
  diagnosticSummary: string;
}

export interface ExternalDetectorResult {
  provider: "gptzero" | "sapling";
  aiProbability: number;
  humanProbability: number;
  verdict: "Likely Human" | "Mixed" | "Likely AI";
  sentencesAnalyzed?: number;
  highlightedSentences?: Array<{ text: string; aiScore: number }>;
  raw?: any;
}

const COMMON_AI_MARKERS: Array<{ pattern: RegExp; label: string }> = [
  { pattern: /\bmoreover\b/gi, label: "Moreover" },
  { pattern: /\bfurthermore\b/gi, label: "Furthermore" },
  { pattern: /\bdelve\s*(?:into|deeper)?\b/gi, label: "Delve" },
  { pattern: /\ba testament to\b/gi, label: "Testament to" },
  { pattern: /\bcrucial to remember\b/gi, label: "Crucial to remember" },
  { pattern: /\bit is important to note that\b/gi, label: "Important to note that" },
  { pattern: /\bplays a pivotal role\b/gi, label: "Pivotal role" },
  { pattern: /\bseamlessly integrates?\b/gi, label: "Seamlessly integrates" },
  { pattern: /\bin conclusion, it is evident that\b/gi, label: "In conclusion, it is evident" },
  { pattern: /\bmultifaceted (?:landscape|nature|tapestry)\b/gi, label: "Multifaceted..." },
  { pattern: /\brich tapestry\b/gi, label: "Rich tapestry" },
  { pattern: /\bnavigating the (?:realm|landscape|complexities)\b/gi, label: "Navigating the..." },
  { pattern: /\bfostering a (?:deeper|collaborative|holistic)\b/gi, label: "Fostering a..." },
  { pattern: /\bharnessing the power of\b/gi, label: "Harnessing the power of" },
  { pattern: /\bspearheading\b/gi, label: "Spearheading" },
  { pattern: /\ba plethora of\b/gi, label: "A plethora of" },
  { pattern: /\bserves as a reminder\b/gi, label: "Serves as a reminder" },
  { pattern: /\ba delicate balance\b/gi, label: "A delicate balance" },
  { pattern: /\bsheds light on\b/gi, label: "Sheds light on" },
  { pattern: /\bgroundbreaking\b/gi, label: "Groundbreaking" },
  { pattern: /\bunderscores the importance of\b/gi, label: "Underscores the importance" },
  { pattern: /\bparadigm shift\b/gi, label: "Paradigm shift" },
];

/**
 * Computes statistical stylometrics and an instant AI probability estimate (Layer 1)
 */
export function analyzeLocalStylometrics(text: string): LocalStylometricVerdict {
  const trimmed = text.trim();
  if (!trimmed) {
    return {
      aiProbability: 0,
      humanProbability: 100,
      verdict: "Likely Human",
      burstinessScore: 0,
      avgSentenceLength: 0,
      sentenceCount: 0,
      wordCount: 0,
      detectedClichés: [],
      diagnosticSummary: "No text provided.",
    };
  }

  const words = trimmed.split(/\s+/).filter(Boolean);
  const rawSentences = trimmed.match(/[^.!?]+[.!?]+/g) || [trimmed];
  const sentenceLengths = rawSentences.map((s) => s.trim().split(/\s+/).filter(Boolean).length);

  const avgLen = sentenceLengths.length > 0
    ? sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length
    : 0;

  // Calculate Variance and Standard Deviation (Burstiness)
  const variance = sentenceLengths.length > 1
    ? sentenceLengths.reduce((acc, len) => acc + Math.pow(len - avgLen, 2), 0) / sentenceLengths.length
    : 0;
  const stdDev = Math.sqrt(variance);

  // Organic human writing has stdDev >= 6.5. Robotic writing has stdDev <= 3.5.
  const burstinessScore = Math.min(100, Math.max(10, Math.round((stdDev / 11) * 100)));

  // Detect Clichés
  const detected: string[] = [];
  for (const item of COMMON_AI_MARKERS) {
    if (item.pattern.test(trimmed)) {
      detected.push(item.label);
    }
  }
  const uniqueClichés = Array.from(new Set(detected));

  // Calculate Lexical Diversity (Unique words / Total words)
  const lowerWords = words.map((w) => w.toLowerCase().replace(/[^a-z0-9]/g, "")).filter(Boolean);
  const uniqueWordCount = new Set(lowerWords).size;
  const ttr = lowerWords.length > 0 ? uniqueWordCount / lowerWords.length : 1;

  // Calculate Probability
  // High AI = Low burstiness (uniform lengths), High cliché density, Low TTR for long texts
  const markerPenalty = uniqueClichés.length * 16;
  const uniformityPenalty = Math.max(0, (60 - burstinessScore) * 0.55);
  const lengthUniformityPenalty = avgLen > 25 && stdDev < 4 ? 15 : 0;
  const repetitionPenalty = ttr < 0.45 && words.length > 50 ? 12 : 0;

  const rawAiProb = Math.round(markerPenalty + uniformityPenalty + lengthUniformityPenalty + repetitionPenalty);
  const aiProbability = Math.min(95, Math.max(5, rawAiProb));
  const humanProbability = 100 - aiProbability;

  let verdict: "Likely Human" | "Mixed / Moderate" | "Likely AI-Generated";
  let diagnosticSummary: string;

  if (aiProbability >= 60) {
    verdict = "Likely AI-Generated";
    diagnosticSummary = `Detected ${uniqueClichés.length} AI transition markers and uniform sentence cadence (Burstiness: ${burstinessScore}/100).`;
  } else if (aiProbability >= 30) {
    verdict = "Mixed / Moderate";
    diagnosticSummary = `Moderate sentence variation with slight AI syntactic repetition.`;
  } else {
    verdict = "Likely Human";
    diagnosticSummary = `Organic human rhythm with high sentence length variance and natural academic phrasing.`;
  }

  return {
    aiProbability,
    humanProbability,
    verdict,
    burstinessScore,
    avgSentenceLength: Math.round(avgLen),
    sentenceCount: rawSentences.length,
    wordCount: words.length,
    detectedClichés: uniqueClichés,
    diagnosticSummary,
  };
}

/**
 * Layer 2: Official GPTZero API Verification
 */
export async function verifyWithGptZero(text: string, apiKey: string): Promise<ExternalDetectorResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("No text provided for verification.");
  if (!apiKey || !apiKey.trim()) throw new Error("GPTZero API key is required for external verification.");

  const response = await fetch("https://api.gptzero.me/v2/predict/text", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey.trim(),
    },
    body: JSON.stringify({
      document: trimmed,
      version: "2024-01-09",
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`GPTZero API error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const document = data?.documents?.[0] || data;
  const completelyGeneratedProb = document.completely_generated_prob ?? (document.class_probabilities?.ai ?? 0.5);
  const aiProbability = Math.round(completelyGeneratedProb * 100);
  const humanProbability = 100 - aiProbability;

  let verdict: "Likely Human" | "Mixed" | "Likely AI" = "Likely Human";
  if (aiProbability >= 65) verdict = "Likely AI";
  else if (aiProbability >= 35) verdict = "Mixed";

  const sentences = document.sentences || [];
  const highlightedSentences = sentences.map((s: any) => ({
    text: s.sentence,
    aiScore: Math.round((s.generated_prob ?? 0) * 100),
  }));

  return {
    provider: "gptzero",
    aiProbability,
    humanProbability,
    verdict,
    sentencesAnalyzed: sentences.length || undefined,
    highlightedSentences,
    raw: data,
  };
}

/**
 * Layer 2: Official Sapling AI Detector Verification
 */
export async function verifyWithSapling(text: string, apiKey: string): Promise<ExternalDetectorResult> {
  const trimmed = text.trim();
  if (!trimmed) throw new Error("No text provided for verification.");
  if (!apiKey || !apiKey.trim()) throw new Error("Sapling API key is required.");

  const response = await fetch("https://api.sapling.ai/api/v1/aidetect", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      key: apiKey.trim(),
      text: trimmed,
    }),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(`Sapling API error (${response.status}): ${errText || response.statusText}`);
  }

  const data = await response.json();
  const score = data.score ?? 0.5;
  const aiProbability = Math.round(score * 100);
  const humanProbability = 100 - aiProbability;

  let verdict: "Likely Human" | "Mixed" | "Likely AI" = "Likely Human";
  if (aiProbability >= 65) verdict = "Likely AI";
  else if (aiProbability >= 35) verdict = "Mixed";

  return {
    provider: "sapling",
    aiProbability,
    humanProbability,
    verdict,
    raw: data,
  };
}
