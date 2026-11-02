/**
 * Academic Manuscript Section Drafting Prompt Builder
 *
 * Constructs prompts for client-side section-by-section drafting and targeted
 * revisions using LLMs (with fallback resilience).
 */

export interface SectionDraftPromptOptions {
  sectionTitle: string;
  sectionType?: string;
  targetWordCount?: number;
  workingTitle: string;
  targetJournal: string;
  anchorGap?: string;
  methodology?: string;
  approvedSources?: Array<{ title?: string; author?: string; year?: string | number }>;
  empiricalDataSummary?: string;
  userDirective?: string;
  quickAction?: "deepen" | "methodology" | "empirical" | "elevate" | "evidence" | string;
  existingContent?: string;
  toneStyle?: string;
}

export function buildSectionDraftPrompts(options: SectionDraftPromptOptions): {
  systemPrompt: string;
  userPrompt: string;
} {
  const {
    sectionTitle,
    targetWordCount = 800,
    workingTitle,
    targetJournal,
    anchorGap = "Unresolved evidentiary limits",
    methodology = "Empirical and theoretical modeling",
    approvedSources = [],
    empiricalDataSummary = "",
    userDirective,
    quickAction,
    existingContent,
    toneStyle = "Nature / Science empirical register",
  } = options;

  let actionInstruction = "";
  if (quickAction === "deepen") {
    actionInstruction = "ACTION DIRECTIVE: Deepen the critical scholarly discussion. Connect findings directly to existing literature debates, identify non-obvious theoretical implications, and contrast with competing models.";
  } else if (quickAction === "methodology") {
    actionInstruction = "ACTION DIRECTIVE: Provide rigorous, reproducible experimental and mathematical details. Specify equations, parameter bounds, statistical error margins, and protocol steps.";
  } else if (quickAction === "empirical") {
    actionInstruction = "ACTION DIRECTIVE: Synthesize the empirical benchmark telemetry. Structure concrete numerical results into clear Markdown comparison tables and discuss statistical convergence.";
  } else if (quickAction === "elevate") {
    actionInstruction = "ACTION DIRECTIVE: Elevate the academic tone and prose quality to elite journal standard. Use precise disciplinary vocabulary, active authoritative academic voice, and elegant transitions.";
  } else if (quickAction === "evidence") {
    actionInstruction = "ACTION DIRECTIVE: Ground all substantive claims in the approved literature citations. Do not make unverified claims without citing approved sources.";
  }

  const systemPrompt = `You are an elite academic co-author and journal editor writing for "${targetJournal}".
Your task is to write or revise the manuscript section: "${sectionTitle}".

ACADEMIC REQUIREMENTS:
1. Target word count: approximately ${targetWordCount} words.
2. Tone & Style: ${toneStyle}.
3. Section Function: Write rigorous, camera-ready academic prose for peer-reviewed journal submission.
4. Citation Integrity: When citing scholarship, use formal in-text citations (e.g. Castro & Liskov, 2002, or numerical brackets [1] if appropriate). Incorporate verified claims from the provided literature.
5. Markdown Formatting: Use proper Markdown headings (### for sub-headings), tables (| ... |) for numerical results if applicable, and LaTeX for mathematical formulations ($...$ or $$...$$).
6. Output: Return ONLY the drafted Markdown section prose, without meta-commentary, introductory remarks, or conversational filler.`;

  const sourcesList = approvedSources.slice(0, 8)
    .map((s, i) => `[${i + 1}] ${s.author || "Scholar"} (${s.year || "2023"}). ${s.title || "Study"}`)
    .join("\n");

  const userPrompt = `MANUSCRIPT CONTEXT:
- Working Title: "${workingTitle}"
- Target Journal: ${targetJournal}
- Anchor Research Gap: "${anchorGap}"
- Methodology: ${methodology}
${empiricalDataSummary ? `- Primary Empirical Data: ${empiricalDataSummary}\n` : ""}
${sourcesList ? `- Approved Grounding Sources:\n${sourcesList}\n` : ""}

SECTION TO DRAFT: "${sectionTitle}"
${existingContent ? `\nCURRENT SECTION DRAFT (to revise or expand):\n"""\n${existingContent}\n"""\n` : ""}
${userDirective ? `\nUSER SPECIFIC INSTRUCTION: ${userDirective}\n` : ""}
${actionInstruction ? `\n${actionInstruction}\n` : ""}

Please write the complete, high-impact scholarly prose for "${sectionTitle}".`;

  return { systemPrompt, userPrompt };
}
