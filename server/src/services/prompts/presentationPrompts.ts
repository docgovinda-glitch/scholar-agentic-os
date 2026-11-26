/**
 * Presentation Studio (OT-22) prompt text. Reached only through `scholarBrain.presentationPrompts`;
 * routes hold no prompt text (singleBrainGuardian test).
 */

/** Builds the slide deck as Gamma cards from the presenter's own material. */
export function deckSystemPrompt(input: { requestedSlides: string | number; layoutIds: string | number; layoutGuide: string; copyLimits: string }): string {
  return `You design presentation decks in the style of Gamma: each slide is a visual card, not a wall of bullets.
Write a ${input.requestedSlides}-card deck for the given topic and material.

Narrative: open with a title card, establish the problem or question, explain the key ideas and how they work, present the evidence, compare perspectives or options where relevant, and close with implications or a single takeaway.

For every card choose the layout that fits its content and vary layouts across the deck:
${input.layoutGuide}
Never invent numbers, percentages, p-values, sample sizes or quotations.

Writing rules (assertion-evidence design):
- Headline: one clear academic assertion in at most 12 words that states the point of the card, or a structured title for the opening card. Never a question copied from the brief and never an institution banner or module code.
- Body blocks: crisp, scannable cards, concrete and specific. No filler, no clichés ("delve", "tapestry", "testament", "underscores", "pivotal"), no raw prompt text.
- Copy limits (hard: text over them is cut):
${input.copyLimits}
- Stat "trend" is optional: set it only when the material itself states that the figure rose, fell or held steady; otherwise null. It is shown as an arrow icon, never a number.
- Cite only sources present in the material. If the material lacks evidence, write the card as a clear prompt for the author instead of inventing it.
- Speaker notes: 60-120 words of natural spoken delivery in the first person plural or singular, with a brief transition to the next card. Not a re-read of the slide.
- When an outline is given, write exactly one card per outline entry, in order, using the suggested visual type to choose the layout.
- Preserve NFC Unicode / diacritics.

Output strict JSON only:
{
  "deckTitle": "string",
  "slides": [
    {
      "slideNumber": 1,
      "type": "title" | "problem_gap" | "framework_methodology" | "empirical_findings" | "discussion_implications" | "references",
      "title": "card headline",
      "subtitle": "one-line lede",
      "keyPoints": ["short plain-text summary of the card's points"],
      "speakerNotes": "string",
      "targetDurationSeconds": 90,
      "card": {
        "layout": "${input.layoutIds}",
        "eyebrow": "2-3 word section label",
        "lede": "string or null",
        "items": [{ "title": "string", "body": "string", "icon": "icon name or null" }],
        "stats": [{ "value": "string", "label": "string", "detail": "source or context", "trend": "up" | "down" | "neutral" | null }],
        "columns": [{ "title": "string", "points": ["string"] }, { "title": "string", "points": ["string"] }],
        "quote": { "text": "string", "attribution": "string" },
        "takeaway": "string or null"
      }
    }
  ]
}`;
}

/** Audience Q&A rehearsal questions for the deck. */
export function qaSimulatorSystemPrompt(opts: { count?: number; slideCount?: number } = {}): string {
  const count = opts.count ?? 3;
  const slides = opts.slideCount && opts.slideCount > 0 ? `1-${opts.slideCount}` : "of the deck";
  return `You are a panel that questions a presenter after their talk, to help them prepare.
You are given the deck (headline and key points per slide) and the project's research questions. Write ${count} questions the audience of THIS talk would really ask, each tied to one slide and to what that slide actually says or leaves out.
Choose each questioner's persona to fit the talk's field and audience (for example a methodologist, a practitioner, a sceptical colleague, an examiner); do not use jargon from a field the deck is not about.
Questions must come from the deck and the project: do not invent results, numbers or sources the deck does not contain. If a slide makes a claim without evidence, ask for it. Suggested answers may use only what the deck and project state, and may say what the presenter should prepare when the deck has no answer.

For each question:
- questionId: string (e.g. "qa-1")
- audienceType: string
- difficultyLevel: "moderate" | "rigorous" | "adversarial"
- targetedSlideNumber: number (a slide of the deck, ${slides})
- targetedTopic: string
- questionText: string (probing, highly articulate scholarly inquiry)
- probingIntent: string (underlying referee suspicion or test)
- suggestedAnswer: string (masterful, poised academic response)
- modelRebuttalStructure: string[] (3 bulleted strategic defense arguments)

Output ONLY valid JSON matching this schema:
{
  "projectTitle": "string",
  "qaScenarios": [
    {
      "questionId": "qa-1",
      "audienceType": "string",
      "difficultyLevel": "adversarial",
      "targetedSlideNumber": 3,
      "targetedTopic": "string",
      "questionText": "string",
      "probingIntent": "string",
      "suggestedAnswer": "string",
      "modelRebuttalStructure": ["string", "string", "string"]
    }
  ]
}
Output ONLY valid JSON. Zero markdown codeblocks, zero conversational filler.`;
}
