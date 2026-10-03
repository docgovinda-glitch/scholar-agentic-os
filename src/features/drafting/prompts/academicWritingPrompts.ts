/**
 * Collegiate Academic Writing Prompts & Stylistic Directives
 * -----------------------------------------------------------
 * Grounded in official college writing guide principles:
 * - Clear diction over artificial thesaurus inflation
 * - Active voice (≥80%) and strong analytical verbs
 * - Elimination of empty throat-clearing openings and filler
 * - Objective, third-person evidence grounding
 * - Zero pseudo-intellectual buzzwords or robotic academic soup
 */

import type { AcademicTone } from "../types/drafting";

/**
 * Phrases strictly banned across all academic writing prompts and outputs.
 */
export const BANNED_ACADEMIC_BUZZWORDS: readonly string[] = [
  "primary phenomenon",
  "Primary Phenomenon",
  "procedural objectivity",
  "computational expediency",
  "privileges computational",
  "methodological contestation",
  "Methodological Contestation",
  "comparative institutional analysis",
  "Comparative Institutional Analysis",
  "Pasquale, 2023",
  "Kearns & Roth, 2022",
];

/**
 * Empty throat-clearing phrases that must never start or occupy academic paragraphs.
 */
export const BANNED_THROAT_CLEARING_OPENINGS: readonly string[] = [
  "A critical point of departure for evaluating this dimension lies in how",
  "It is important to consider the fact that",
  "In today's modern world and society",
  "In today's society",
  "Throughout history, humans have always",
  "It is widely known that",
  "Needless to say",
  "It goes without saying that",
  "In order to properly understand",
  "At the end of the day",
];

/**
 * Common weak nominalizations mapped to direct active verbs.
 */
export const NOMINALIZATION_REPLACEMENTS: Record<string, string> = {
  "conducts an examination of": "examines",
  "conduct an examination of": "examine",
  "conducts an analysis of": "analyzes",
  "conduct an analysis of": "analyze",
  "serves as an illustration of": "illustrates",
  "serve as an illustration of": "illustrate",
  "is in agreement with": "agrees with",
  "are in agreement with": "agree with",
  "makes an assessment of": "assesses",
  "make an assessment of": "assess",
  "provides a demonstration of": "demonstrates",
  "provide a demonstration of": "demonstrate",
  "leads to the destruction of": "destroys",
  "lead to the destruction of": "destroy",
  "has a tendency to": "tends to",
  "have a tendency to": "tend to",
};

/**
 * Subject-grounded few-shot exemplars illustrating the contrast between
 * pseudo-academic soup and college-standard clear analytical writing.
 */
export interface FewShotExemplar {
  topic: string;
  poorPseudoAcademic: string;
  collegeStandardAcademic: string;
  rationale: string;
}

export const FEW_SHOT_EXEMPLARS: readonly FewShotExemplar[] = [
  {
    topic: "Zappos $2,000 Resignation Bonus",
    poorPseudoAcademic:
      "A critical point of departure for evaluating this dimension lies in how structural mechanisms configure operational outcomes under the guise of procedural objectivity.",
    collegeStandardAcademic:
      "Zappos' offer of $2,000 to new hires who quit after training functions as a deliberate screening mechanism for cultural alignment. By creating a financial incentive to exit, the company tests whether an employee's intrinsic values align with its service-oriented culture, filtering out individuals motivated solely by short-term compensation.",
    rationale:
      "Direct claim in sentence 1, clear active verbs (functions, tests, filters), and concrete economic-behavioral explanation without thesaurus inflation.",
  },
  {
    topic: "Schein's 3-Level Culture Model (Artifacts vs. Assumptions)",
    poorPseudoAcademic:
      "The ontological manifestation of artifactual configurations operates as a nominal surrogate for deeper epistemological structures within the institutional apparatus.",
    collegeStandardAcademic:
      "Edgar Schein's three-level model demonstrates that organizational culture operates beneath surface appearances (Schein, 2010). Visible artifacts—such as casual dress codes, open-concept floor plans, and company logos—simply reflect deeper espoused values and unconscious, shared assumptions. Changing an office layout without addressing foundational beliefs produces only superficial compliance, leaving the underlying culture unchanged.",
    rationale:
      "Explains Schein's model with concrete examples (dress codes, open floor plans) and distinguishes surface compliance from deep cultural change.",
  },
  {
    topic: "Leadership Intervention Level",
    poorPseudoAcademic:
      "Executive agency mandates an interventionary posture that catalyzes paradigmatic shifts across systemic organizational substrates.",
    collegeStandardAcademic:
      "Leaders seeking cultural change should begin at the level of espoused values rather than attempting to attack unconscious assumptions head-on (Schein, 2010). Because basic assumptions operate below conscious awareness and provoke defensive resistance when challenged directly, effective leaders articulate clear values, model corresponding behaviors, and reinforce them through reward systems until these practices become second nature.",
    rationale:
      "Logical causal chain: why leaders cannot attack assumptions directly, what they must do instead, and how behaviors gradually crystallize.",
  },
];

/**
 * Core Collegiate Writing Standards embedded in all system prompts.
 */
export const COLLEGIATE_WRITING_CORE_DIRECTIVES = `
COLLEGE WRITING TONE STANDARDS & DIRECTIVES:
1. CLARITY OVER COMPLEXITY (ANTI-THESAURUS RULE):
   - Never use convoluted words where a direct, precise word communicates the thought best.
   - Write "use" or "apply" instead of "utilize".
   - Write "shows" or "demonstrates" instead of "privileges computational expediency".
   - Prioritize natural academic cadence. Avoid compounding prepositional phrases and burying the main subject and verb.

2. ACTIVE VOICE & STRONG VERBS:
   - Ensure active voice in at least 80% of sentences. The grammatical subject must perform the action.
   - Eliminate weak nominalizations: write "examines" instead of "conducts an examination of"; write "illustrates" instead of "serves as an illustration of".

3. CONCISENESS & FLUFF ELIMINATION:
   - BAN empty throat-clearing openings:
     * Never begin with "A critical point of departure for evaluating this dimension lies in how..."
     * Never begin with "It is important to consider the fact that..."
     * Never begin with "In today's modern world and society..."
   - State the central claim or evidentiary point immediately in sentence 1.

4. OBJECTIVE, EVIDENCE-BASED STANCE:
   - Strictly forbid second-person pronouns ("you", "your"). Use disciplined third-person analytical voice ("organizations", "leaders", "analysts", "researchers").
   - Eliminate emotional hyperbole ("unbelievable", "shocking", "horrible"). Use precise analytical characterization ("inefficient", "suboptimal", "structurally vulnerable").
   - Employ measured analytical hedging: use "indicates", "suggests", or "correlates" rather than sweeping absolutes like "proves undeniably" unless supported by conclusive empirical proof.

5. ZERO PRESCRIBED PSEUDO-ACADEMIC JARGON:
   - Strictly ban the following canned buzzwords unless explicitly found in user sources:
     "Primary Phenomenon", "procedural objectivity", "computational expediency", "Methodological Contestation", "Comparative Institutional Analysis".
   - Target readability: Flesch-Kincaid Grade Level 11–14 (collegiate undergraduate/graduate standard). Avoid unreadable Grade 18+ academic soup.
`.trim();

/**
 * Compiles a comprehensive academic system prompt incorporating collegiate writing standards,
 * tone-specific guidelines, and few-shot exemplars.
 */
export function compileAcademicSystemPrompt(
  tone: AcademicTone = "analytical",
  context?: {
    topic?: string;
    question?: string;
    academicLevel?: string;
    citationStyle?: string;
  }
): string {
  const toneDirectives = getTonePromptDirectives(tone);

  let prompt = `You are an expert academic writing assistant and collegiate tutor.\n\n`;
  prompt += `${COLLEGIATE_WRITING_CORE_DIRECTIVES}\n\n`;
  prompt += `SELECTED TONE DIRECTIVE:\n${toneDirectives}\n\n`;

  if (context?.academicLevel) {
    prompt += `TARGET ACADEMIC LEVEL: ${context.academicLevel.toUpperCase()}\n`;
  }
  if (context?.citationStyle) {
    prompt += `CITATION STYLE: ${context.citationStyle.toUpperCase()}\n`;
  }
  if (context?.topic) {
    prompt += `SUBJECT / TOPIC: ${context.topic}\n`;
  }
  if (context?.question) {
    prompt += `ASSIGNMENT QUESTION: ${context.question}\n`;
  }

  prompt += `\nFEW-SHOT CONTRASTIVE BENCHMARK:\n`;
  for (const ex of FEW_SHOT_EXEMPLARS) {
    prompt += `\n[Topic: ${ex.topic}]\n`;
    prompt += `POOR (Banned Pseudo-Academic): "${ex.poorPseudoAcademic}"\n`;
    prompt += `TARGET (Collegiate Standard): "${ex.collegeStandardAcademic}"\n`;
    prompt += `RATIONALE: ${ex.rationale}\n`;
  }

  return prompt.trim();
}

/**
 * Helper to retrieve specific prompt directives for each tone.
 */
function getTonePromptDirectives(tone: AcademicTone): string {
  switch (tone) {
    case "formal_academic":
      return (
        "TONE: Formal Academic\n" +
        "- Focus: Rigorous scholarship, precise disciplinary terminology, balanced complex-compound syntax, strict adherence to PEEL (Point, Evidence, Explanation, Link).\n" +
        "- Voice: Impersonal, authoritative third-person analytical stance.\n" +
        "- Structure: Each paragraph starts with a clear thematic claim, substantiates it with cited evidence, and links back to the overarching thesis."
      );
    case "analytical":
      return (
        "TONE: Analytical (Default Standard)\n" +
        "- Focus: Deconstructing cause-and-effect mechanisms, evaluating empirical data and operational trade-offs, comparing theoretical models against real-world practices.\n" +
        "- Voice: Objective, deductive, and logically sequenced.\n" +
        "- Structure: Clear problem breakdown, evaluation of competing explanations, and reasoned synthesis."
      );
    case "critical":
      return (
        "TONE: Critical\n" +
        "- Focus: Interrogating underlying assumptions, exposing discrepancies between stated policies and actual behaviors, highlighting operational limitations and alternative viewpoints.\n" +
        "- Voice: Evaluative, questioning, and probing.\n" +
        "- Structure: Identifies unexamined premises, tests boundary conditions, and critiques surface assertions."
      );
    case "persuasive":
      return (
        "TONE: Persuasive\n" +
        "- Focus: Advancing a distinct thesis statement, building an escalating ladder of evidence, systematically addressing and dismantling counterarguments.\n" +
        "- Voice: Direct, assertive, and rhetorically cohesive.\n" +
        "- Structure: Unambiguous proposition, supportive empirical proof, fair counter-argument acknowledgement, and decisive refutation."
      );
    case "conversational_academic":
      return (
        "TONE: Conversational Academic\n" +
        "- Focus: Accessible scholarly journalism (modeled after Harvard Business Review or The Conversation); retains analytical rigor and literature citations while using shorter sentences, engaging analogies, and active phrasing.\n" +
        "- Voice: Intellectual yet readable, engaging, and direct.\n" +
        "- Structure: Vivid real-world hook, accessible explanation of complex theory, and practical takeaways."
      );
    default:
      return "TONE: Analytical\n- Focus: Objective, deductive, evidence-based academic analysis.";
  }
}
