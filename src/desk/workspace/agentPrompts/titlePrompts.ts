/**
 * Title Selection Prompt Builder
 *
 * Constructs prompts for client-side academic title generation without sending
 * in-flight project answers or private research notes to the Scholar server.
 */

export interface TitlePromptOptions {
  projectAnswers: Record<string, any>;
}

export function buildTitlePrompts(options: TitlePromptOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const { projectAnswers = {} } = options;

  const systemPrompt = `You are an expert academic title generator.
Based on the provided research context, propose exactly 3 strong academic titles.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "title-xyz",
      "title_text": "...",
      "subtitle_text": "...",
      "rationale": "...",
      "status": "proposed"
    }
  ]
}`;

  const workingTitle =
    projectAnswers.working_title ||
    projectAnswers.title ||
    "Academic Research Project";

  const selectedGap =
    projectAnswers.selected_gap ||
    projectAnswers.research_gap ||
    projectAnswers.gap ||
    "Core domain inquiry and evidence synthesis";

  const context = JSON.stringify({
    working_title: workingTitle,
    selected_gap: selectedGap,
    ...projectAnswers,
  });

  const userPrompt = `Synthesize compelling, publication-ready academic research titles for the following study:
Working Title: ${workingTitle}
Selected Research Gap: ${selectedGap}
Project Metadata:
${context}`;

  return { systemPrompt, userPrompt };
}
