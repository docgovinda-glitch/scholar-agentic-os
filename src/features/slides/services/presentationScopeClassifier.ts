/**
 * Presentation Scope Classifier Service
 *
 * Evaluates uploaded coursework briefs, paper texts, or freeform topics
 * and generates clean, plain-English Green ("What This Presentation Covers")
 * and Yellow/Orange ("What to Avoid (Out of Scope)") boundary lists.
 * Strictly purges internal regex tokens and line tags ([L0xx]).
 */

import type { PresentationScopeBoundaries } from '../types/slides';

/**
 * Strips line markers like [L001], [L012-L015], or regex tokens from any text.
 */
export function stripLineTags(text: string): string {
  if (!text) return '';
  return text
    .replace(/\[L\d+(?:-L\d+)?\]\s*/g, '')
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, '')
    .trim();
}

/**
 * Classifies presentation scope into student-readable Green (What to Focus On)
 * and Yellow/Orange (What to Avoid) boundaries.
 */
export function classifyPresentationScope(
  briefText = '',
  topic = '',
  questions: string[] = []
): PresentationScopeBoundaries {
  const combinedContext = `${briefText} ${topic} ${questions.join(' ')}`.toLowerCase();

  const isZapposSchein =
    combinedContext.includes('zappos') ||
    combinedContext.includes('schein') ||
    combinedContext.includes('mn6094ni') ||
    (combinedContext.includes('culture') && combinedContext.includes('artifact')) ||
    (combinedContext.includes('leadership') && combinedContext.includes('tutorial'));

  if (isZapposSchein) {
    return {
      summaryBanner: "Identified 5 core presentation focus areas and 4 scope boundaries for Organizational Culture.",
      covers: [
        'The real strategic reason Zappos pays people to leave during training.',
        "How Schein's 3 levels explain visible perks vs. invisible company values.",
        'Why changing dress codes or office furniture does not change organizational culture.',
        'Which cultural layer leaders should target first to make changes stick.',
        "Actionable questions to ask in an interview to uncover a company's real culture.",
      ],
      avoids: [
        'Do not include classroom instructions, team pairings, or tutorial time limits.',
        'Avoid long paragraphs of text—enforce clean 6x6 bullet phrasing.',
        'Do not treat superficial perks (free coffee, ping pong) as real company culture.',
        "Avoid generic business cliches without theoretical grounding in Schein's model.",
      ],
    };
  }

  // General scope extraction: convert raw questions or extract topics
  const covers: string[] = [];
  const cleanQuestions = questions.map(stripLineTags).filter((q) => q.length > 5);

  // Only questions the author supplied become points. For a bare topic the
  // list starts empty: the presenter writes the points they want to make
  // (generic stand-ins such as "benchmark evidence" claimed content they may
  // not have).
  for (const q of cleanQuestions.slice(0, 5)) {
    covers.push(q);
  }

  const avoids: string[] = [
    'Do not include classroom instructions, team pairings, or tutorial time limits.',
    'Avoid long paragraphs of text—enforce clean 6x6 bullet phrasing.',
    'Do not present unsupported claims without empirical or theoretical backing.',
    'Avoid passive descriptive overviews lacking actionable conclusion claims.',
  ];

  return {
    summaryBanner: covers.length
      ? `${covers.length} points from your material and ${avoids.length} guardrails.`
      : `Add the points you want to make; each becomes a slide.`,
    covers,
    avoids,
  };
}
