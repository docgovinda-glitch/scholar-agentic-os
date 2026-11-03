/**
 * Title Selection Prompt Builder
 *
 * Constructs prompts for client-side academic title generation without sending
 * in-flight project answers or private research notes to the Scholar server.
 */

export interface TitleItem {
  id: string;
  title_text: string;
  subtitle_text: string | null;
  rationale: string;
  archetype?: "declarative" | "methodological" | "compound" | "inquisitive";
  status?: "proposed" | "adopted" | "locked" | "rejected";
}

export interface TitlePromptOptions {
  projectAnswers: Record<string, any>;
  targetJournal?: string;
  customStyle?: string;
}

export function buildTitlePrompts(options: TitlePromptOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const { projectAnswers = {}, targetJournal, customStyle } = options;

  const systemPrompt = `You are an expert academic title generator and journal editorial consultant.
Based on the provided research context and target publication guidelines, propose 4 strong, publication-grade academic titles across standard scholarly archetypes:
1. declarative: Findings- or hypothesis-driven, stating the key breakthrough directly.
2. compound: Classic academic colon-structured title (Broad Domain / Hook: Specific Mechanism or Context).
3. methodological: Highlighting the experimental design, formal architecture, or operational framework.
4. inquisitive: Posing the central unsolved research question directly with academic nuance.

Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "title-1",
      "title_text": "Main Academic Title",
      "subtitle_text": "Subtitle Or Clarifying Scope (or null)",
      "archetype": "compound",
      "rationale": "Clear scholarly rationale explaining why this title maximizes indexability, novelty, and precision.",
      "status": "proposed"
    }
  ]
}`;

  const workingTitle =
    projectAnswers.working_title ||
    projectAnswers.title ||
    "Academic Research Project";

  const anchorTitle =
    projectAnswers.selected_gap_title ||
    projectAnswers.anchor_gap_title ||
    "";

  const selectedGap =
    projectAnswers.selected_gap_description ||
    projectAnswers.selected_gap ||
    projectAnswers.research_gap ||
    projectAnswers.gap ||
    "Core domain inquiry and evidence synthesis";

  const journalTarget = targetJournal || projectAnswers.target_journal || projectAnswers.journal || "";

  const context = JSON.stringify({
    working_title: workingTitle,
    anchor_gap_title: anchorTitle || undefined,
    selected_gap: selectedGap,
    target_journal: journalTarget || undefined,
    ...projectAnswers,
  });

  const userPrompt = `Synthesize compelling, publication-ready academic research titles for the following study:
Working Title: ${workingTitle}
${anchorTitle ? `Primary Anchor Research Gap: ${anchorTitle}\n` : ""}Research Gap Synthesis: ${selectedGap}
${journalTarget ? `Target Publication Venue: ${journalTarget}\n` : ""}${customStyle ? `Style Guidance: ${customStyle}\n` : ""}Project Metadata:
${context}`;

  return { systemPrompt, userPrompt };
}

export function buildTitlePolishPrompt(
  currentTitle: string,
  polishGoal: "shorten" | "rigor" | "journal",
  targetJournal?: string
): {
  systemPrompt: string;
  userPrompt: string;
} {
  const systemPrompt = `You are an expert academic journal editor.
Refine the provided academic research title to optimize it for indexing, clarity, and publication impact.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "title-polish-1",
      "title_text": "Refined Main Title",
      "subtitle_text": null,
      "archetype": "compound",
      "rationale": "Explanation of polish applied.",
      "status": "proposed"
    }
  ]
}`;

  let instruction = "";
  if (polishGoal === "shorten") {
    instruction = "Make the title punchier, strictly under 12 words and under 90 characters while retaining core keywords.";
  } else if (polishGoal === "rigor") {
    instruction = "Enhance scholarly rigor, precise academic nomenclature, and methodological clarity.";
  } else if (polishGoal === "journal") {
    instruction = `Align title structure strictly to the tone and convention of leading journals in this field${targetJournal ? ` (${targetJournal})` : ""}.`;
  }

  const userPrompt = `Please polish and propose 2 optimized variations for the following research title:
Current Title: "${currentTitle}"
Refinement Goal: ${instruction}`;

  return { systemPrompt, userPrompt };
}

