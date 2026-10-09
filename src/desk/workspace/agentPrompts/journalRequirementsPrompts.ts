/**
 * Journal Requirements & Submission Constraints Prompt Builder
 *
 * Uses LLM to deconstruct target journal guidelines, extracting:
 * - Word limits, abstract limit, citation style, required IMRaD sections,
 *   blind review model, and mandatory declarations.
 */

export interface JournalRequirementsPromptOptions {
  journalName: string;
  authorGuidelinesText?: string;
  field?: string;
}

export function buildJournalRequirementsPrompts(options: JournalRequirementsPromptOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const { journalName, authorGuidelinesText, field = "Academic Research" } = options;

  const systemPrompt = `You are an expert academic publishing consultant and journal editor.
Your task is to analyze the author submission guidelines for the academic journal "${journalName}" and extract structured submission constraints.

Extract or infer accurately:
1. max_words: Maximum manuscript word limit (integer, e.g. 8000).
2. abstract_limit_words: Maximum abstract word limit (integer, e.g. 250).
3. citation_style: Standard citation style name (e.g. "IEEE Transactions Numerical", "APA 7th Edition", "Nature Numbered", "ACM Reference Format").
4. citation_bracket_format: In-text format (e.g. "[1]", "(Smith, 2024)").
5. bibliography_ordering: "order_of_appearance" or "alphabetical".
6. blind_review_model: "Double-Blind", "Single-Blind", or "Open Peer Review".
7. data_availability_policy: Specific data policy (e.g. "Mandatory open repository deposit (Zenodo/GitHub)").
8. required_sections: Array of required manuscript section names (e.g. ["Abstract", "Introduction", "Methods", "Results", "Discussion", "Declarations", "References"]).
9. formatting_rules: Array of key formatting rules (e.g. ["Double-blind manuscript without author names", "Times New Roman 12pt, 1.5 spacing", "High-resolution figures (300 DPI)"]).

Return ONLY valid JSON in this exact format:
{
  "max_words": 8000,
  "abstract_limit_words": 250,
  "citation_style": "IEEE Transactions Numerical",
  "citation_bracket_format": "[1]",
  "bibliography_ordering": "order_of_appearance",
  "blind_review_model": "Double-Blind",
  "data_availability_policy": "Mandatory repository deposit",
  "required_sections": ["Abstract", "Introduction", "Related Work", "System Model", "Evaluation", "Discussion", "Conclusion", "Declarations", "References"],
  "formatting_rules": ["Two-column IEEEtran layout", "Vector EPS or PDF figures", "Numbered references in order of citation"]
}`;

  const userPrompt = `Target Journal: "${journalName}"
Disciplinary Field: "${field}"
${authorGuidelinesText ? `\nProvided Author Guidelines Text:\n"""\n${authorGuidelinesText}\n"""` : "\nPlease extract standard submission constraints for this known journal venue."}`;

  return { systemPrompt, userPrompt };
}
