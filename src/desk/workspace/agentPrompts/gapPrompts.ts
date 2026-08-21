/**
 * Gap Identification Prompt Builder
 *
 * Constructs prompts for client-side research gap analysis without sending
 * in-flight project answers or private research notes to the Scholar server.
 */

export interface GapPromptOptions {
  workingTitle: string;
  researchArea: string;
  projectAnswers: Record<string, any>;
}

export function buildGapPrompts(options: GapPromptOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const {
    workingTitle = "Untitled Research",
    researchArea = "the field",
    projectAnswers = {},
  } = options;

  const systemPrompt = `You are an expert academic gap analysis agent.
CRITICAL INSTRUCTION: The gaps you identify MUST be explicitly and directly related to the user's "Working Title" and "Research Area". Do not generate generic gaps. Tie the gap precisely to the specific context provided.
Based on the provided research context, identify exactly 5 distinct, highly-specific research gaps (e.g. empirical, theoretical, methodological) that the working title aims to solve.
Return ONLY valid JSON in this exact format:
{
  "data": [
    {
      "id": "gap-xyz",
      "gap_type": "empirical",
      "description": "...",
      "importance_score": 90,
      "status": "identified"
    }
  ]
}
Make sure every single gap explicitly mentions concepts from the working title.`;

  const context = JSON.stringify(projectAnswers);
  const userPrompt = `Working Title: ${workingTitle}\nResearch Area: ${researchArea}\nContext: ${context}`;

  return { systemPrompt, userPrompt };
}
