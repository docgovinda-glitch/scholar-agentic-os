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

  const context = JSON.stringify(projectAnswers);
  const userPrompt = `Context: ${context}`;

  return { systemPrompt, userPrompt };
}
