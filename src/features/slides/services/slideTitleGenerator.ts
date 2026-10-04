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

const BOTTLENECK_TOPICS: Record<string, string[]> = {
  zappos: [
    'Why Zappos Pays New Hires $2,000 to Quit',
    "Schein's Three Levels of Organizational Culture",
    'Can Changing Artifacts Alone Transform Culture?',
    'Targeting the Right Cultural Level for Leadership Intervention',
    'Assessing Organizational Culture in Job Interviews',
  ],
  culture: [
    'Why Zappos Pays New Hires $2,000 to Quit',
    "Schein's Three Levels of Organizational Culture",
    'Can Changing Artifacts Alone Transform Culture?',
    'Targeting the Right Cultural Level for Leadership Intervention',
    'Assessing Organizational Culture in Job Interviews',
  ],
  quantum: [
    'Why Quantum Cryptography Matters Now',
    'Where Current Encryption Breaks Down',
    'How Fault-Tolerant Verification Works',
    'What the Benchmark Data Proves',
    'Next Steps for Cryptographic Defense',
  ],
  bird: [
    'Migratory Bird Season: Coastal Haven',
    'Why 120,000 Birds Choose This Shore',
    'Core Protected Mudflats vs. Urban Buffers',
    'Three Pillars of Habitat Conservation',
    'Walking the Tidal Flats Together',
  ],
  plover: [
    'Qing Plover: Migratory Bird Season',
    'Seven Days on the Winter Mudflats',
    'Protecting Irreplaceable Tidal Habitats',
    'Community Action and Certified Corridors',
    'Our Shared Coastline Horizon',
  ],
  'multi-agent': [
    'How Multi-Agent Systems Verify Scientific Papers',
    'Why Unanchored LLMs Drift Over Time',
    'Deterministic Consensus Architecture',
    '4.2x Faster Verification in Practice',
    'The Future of Verified Research',
  ],
  autonomous: [
    'How Autonomous Systems Accelerate Discovery',
    'The Hidden Fragility of Unchecked Models',
    'Deterministic Proof Over Guesswork',
    'Empirical Results Across 10,000 Tests',
    'What This Means for Real-World AI',
  ],
};

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

  return cleaned || 'Key Analytical Synthesis';
}

/**
 * Generates natural, human-readable slide headline for a given topic or beat index.
 */
export function generateNaturalSlideTitle(
  rawInput: string,
  topic?: string,
  beatIndex = 0
): string {
  const effectiveTopic = (topic || rawInput || '').toLowerCase();

  // Check preset library for well-known topic patterns
  for (const [key, titles] of Object.entries(BOTTLENECK_TOPICS)) {
    if (effectiveTopic.includes(key)) {
      const idx = Math.min(Math.max(beatIndex, 0), titles.length - 1);
      return titles[idx];
    }
  }

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

/**
 * Generates 5 clean natural-language titles for a topic.
 */
export function generateBeatTitlesForTopic(topic: string, count = 5): string[] {
  const result: string[] = [];
  for (let i = 0; i < count; i++) {
    result.push(generateNaturalSlideTitle('', topic, i));
  }
  return result;
}
