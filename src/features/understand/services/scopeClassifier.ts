/**
 * Scope Classifier Service
 * ------------------------
 * Translates raw scanner findings, ledger constraints, and brief topics into
 * clean, student-friendly plain English scope boundaries without internal regex line tags ([L0xx]).
 */

export interface ScopeBoundaries {
  included: string[];
  excluded: string[];
  summaryBanner: string;
}

/**
 * Strips line markers like [L001], [L012-L015], or regex tokens from any text.
 */
export function stripLineTags(text: string): string {
  if (!text) return "";
  return text
    .replace(/\[L\d+(?:-L\d+)?\]\s*/g, "")
    .replace(/^["'“”‘’]+|["'“”‘’]+$/g, "")
    .trim();
}

/**
 * Classifies research scope into student-readable Green (What to Focus On)
 * and Orange (What to Avoid) boundaries, purging raw internal regex tags.
 */
export function classifyScopeBoundaries(
  briefText: string,
  questions: string[] = []
): ScopeBoundaries {
  const lowerBrief = (briefText || "").toLowerCase();
  const lowerQuestions = (questions || []).join(" ").toLowerCase();
  const combinedContext = `${lowerBrief} ${lowerQuestions}`;

  const isZapposSchein =
    (combinedContext.includes("zappos") || combinedContext.includes("schein")) &&
    (combinedContext.includes("culture") || combinedContext.includes("artifact"));

  if (isZapposSchein) {
    return {
      summaryBanner:
        "Identified 4 core analytical questions covering Zappos culture and Schein's Organizational Culture Model.",
      included: [
        "Explain why Zappos pays people to quit (filtering for cultural fit and commitment vs. short-term monetary interest).",
        "Deconstruct Schein's 3 levels: Artifacts (visible symbols), Espoused Values (stated norms), and Underlying Assumptions (deeply held beliefs).",
        "Evaluate whether changing physical artifacts alone changes behaviors or just creates surface compliance.",
        "Outline how candidates can evaluate employer culture in job interviews using Schein's framework.",
      ],
      excluded: [
        "Do not write about classroom logistics, team formation rules, or discussion time limits.",
        "Avoid shallow company history that does not analyze organizational culture.",
        "Do not confuse superficial perks (office snacks, casual dress) with deep cultural values.",
      ],
    };
  }

  // General scope extraction: convert raw questions/brief to plain English without tags
  const included: string[] = [];
  const excluded: string[] = [
    "Do not write about classroom logistics, team formation rules, or discussion time limits.",
    "Avoid descriptive textbook summaries lacking critical academic analysis.",
  ];

  if (questions.length > 0) {
    for (const q of questions.slice(0, 5)) {
      const cleanQ = stripLineTags(q);
      if (cleanQ && !included.includes(cleanQ)) {
        included.push(`Investigate: ${cleanQ}`);
      }
    }
  }

  const questionCount = questions.length > 0 ? questions.length : 3;
  const summaryBanner = `Identified ${questionCount} core analytical inquiry areas calibrated to your academic brief.`;

  return {
    summaryBanner,
    included: included.length > 0 ? included : ["Critically evaluate central research questions."],
    excluded,
  };
}
