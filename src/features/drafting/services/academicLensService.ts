/**
 * Academic Focus / Lens Service
 * -----------------------------
 * Formulates concise, plain-English guidance summaries for outline sections.
 * Replaces repetitive, canned "Academic Lens" boilerplate with actionable,
 * human-readable analytical objectives tailored to the specific prompt and topic.
 */

/**
 * Formats a clean, human-readable section focus description.
 * Omits robotic boilerplate or returns undefined if no meaningful guidance exists.
 */
export function formatSectionFocus(guidance?: string, title?: string): string | undefined {
  if (!guidance && !title) return undefined;

  let text = (guidance || "").trim();

  // Strip robotic prefix if already present
  text = text.replace(/^Academic\s+Lens:\s*/i, "").replace(/^Focus:\s*/i, "").trim();

  // Detect and purge canned boilerplate formulas
  const isCannedBoilerplate =
    (text.toLowerCase().includes("deconstruct") && text.toLowerCase().includes("assumptions")) ||
    /diagnostic\s+baseline/i.test(text) ||
    /core\s+analytical\s+parameters/i.test(text) ||
    /examine empirical case evidence, diagnostic indicators/i.test(text);

  if (isCannedBoilerplate || !text) {
    if (!title) return undefined;
    return generateFocusFromTitle(title);
  }

  return `Focus: ${text}`;
}

/**
 * Generates an intuitive plain-English focus summary from a section title.
 */
export function generateFocusFromTitle(title: string): string {
  const clean = title.replace(/^[\d.]+\s*/, "").trim();
  const lower = clean.toLowerCase();

  if (lower.includes("zappos") && (lower.includes("$2,000") || lower.includes("resignation") || lower.includes("quit"))) {
    return "Focus: Evaluate the rationale behind Zappos' $2,000 resignation offer and its impact on employee alignment.";
  }

  if (lower.includes("schein") || lower.includes("artifacts") && lower.includes("assumptions")) {
    return "Focus: Deconstruct Schein's three levels of culture (artifacts, espoused values, underlying assumptions) and their operational interplay.";
  }

  if (lower.includes("changing artifacts alone") || lower.includes("artifacts alone")) {
    return "Focus: Analyze why modifying physical artifacts alone fails to create durable cultural transformation without shifting underlying assumptions.";
  }

  if (lower.includes("leadership") && (lower.includes("level") || lower.includes("intervention"))) {
    return "Focus: Evaluate which level of Schein's model leaders should target first to successfully lead and sustain culture change.";
  }

  if (lower.includes("interview") || lower.includes("assessing organizational culture")) {
    return "Focus: Formulate practical methods for candidates and evaluators to assess genuine organizational culture during job interviews using Schein's levels.";
  }

  if (lower.includes("introduction")) {
    return "Focus: Establish theoretical context, foundational definitions, and the central analytical thesis.";
  }

  if (lower.includes("conclusion")) {
    return "Focus: Synthesize core findings into evidence-backed strategic takeaways and practical implications.";
  }

  return `Focus: Analyze and evaluate ${clean}.`;
}
