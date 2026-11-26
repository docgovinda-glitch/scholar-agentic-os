/**
 * Natural-Language Slide Title Generator
 *
 * Produces clean, human-readable slide headlines instead of robotic AI jargon,
 * buzzwords, or repetitive boilerplate (e.g. "Key Insight 1: Grounded Analysis of...").
 * Enforces max 8-10 words that directly state the takeaway or compelling question.
 */

const JARGON_REMOVAL_PATTERNS = [
  /^(key\s+insight\s*\d*[:\-]?\s*)/i,
  /^(beat\s*\d*[:\-]?\s*)/i,
  /^(slide\s*\d*[:\-]?\s*)/i,
  /^(grounded\s+analysis\s+of\s*)/i,
  /^(comprehensive\s+overview\s+of\s*)/i,
  /^(deep\s+dive\s+into\s*)/i,
  /^(an\s+investigation\s+into\s*)/i,
  /^(critical\s+evaluation\s+of\s*)/i,
  /^(empirical\s+synthesis\s+of\s*)/i,
  /^(strategic\s+analysis\s+of\s*)/i,
];

/**
 * Cleans raw string, stripping redundant markers and enforcing 8-10 words max.
 */
export function cleanHumanTitle(raw: string, maxWords = 9): string {
  if (!raw) return 'Key Overview';
  let cleaned = raw.trim();

  // Strip jargon prefixes
  for (const pattern of JARGON_REMOVAL_PATTERNS) {
    cleaned = cleaned.replace(pattern, '');
  }

  // Remove trailing colon or dash
  cleaned = cleaned.replace(/[:\-–—\.]+$/, '').trim();

  // If title was like "Core Synthesis: Grounded Analysis of X", isolate the main part
  if (cleaned.toLowerCase().includes('grounded analysis of')) {
    cleaned = cleaned.replace(/.*grounded analysis of\s*/i, '').trim();
  }

  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length > maxWords) {
    return words.slice(0, maxWords).join(' ');
  }

  return cleaned || 'Core Strategic Takeaway';
}

/**
 * Generates natural, human-readable slide headline for a given topic or beat index.
 */
export function generateNaturalSlideTitle(
  rawInput: string,
  topic?: string,
  beatIndex = 0
): string {

  // Clean the provided raw input
  const cleaned = cleanHumanTitle(rawInput);

  // If the cleaned input is still too generic or empty, use natural beat templates
  if (!cleaned || cleaned.toLowerCase() === 'key overview' || cleaned.length < 5) {
    const cleanTopicName = cleanHumanTitle(topic || 'Our Topic', 5);
    const narrativeTemplates = [
      `The Core Reality Behind ${cleanTopicName}`,
      `The Key Challenge Facing Teams Today`,
      `How the New Approach Works in Practice`,
      `What the Real-World Data Proves`,
      `Strategic Priorities and Next Steps`,
    ];
    return narrativeTemplates[beatIndex % narrativeTemplates.length];
  }

  return cleaned;
}
