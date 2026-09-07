/**
 * Prompt Builder for the Hierarchical Rewrite Engine.
 *
 * Constructs rigorously structured, mode-calibrated prompts separating
 * System Instructions, User Configuration, Document Context, Text to Rewrite,
 * Protected Tokens, Claims, and Output Contracts.
 */

import {
  HumanizerBlock,
  ProtectedElement,
  ExtractedClaim,
  HumanizerStyleProfile,
} from "../types";

export type RewriteMode = "conservative" | "balanced" | "deep_restructure";
export type DisciplineProfile = "stem" | "humanities" | "social_sciences" | "biomedical" | "general";
export type HedgingLevel = "cautious" | "balanced" | "authoritative";

export interface PromptBuilderOptions {
  mode: RewriteMode;
  genre?: string;
  discipline?: DisciplineProfile;
  hedgingLevel?: HedgingLevel;
  block: HumanizerBlock;
  previousBlockText?: string;
  nextBlockText?: string;
  protectedElementsInBlock: ProtectedElement[];
  claimsInBlock: ExtractedClaim[];
  lockedTerms?: string[];
  styleProfile?: HumanizerStyleProfile;
  retryInstructions?: string[];
}

export interface BuiltPrompt {
  systemPrompt: string;
  userPrompt: string;
  mode: RewriteMode;
  decodingParams: {
    temperature: number;
    topP: number;
    presencePenalty: number;
    frequencyPenalty: number;
  };
}

/** Returns calibrated decoding parameters tailored to the requested rewrite mode */
export function getDecodingParamsForMode(mode: RewriteMode) {
  switch (mode) {
    case "conservative":
      return {
        temperature: 0.2,
        topP: 0.95,
        presencePenalty: 0.0,
        frequencyPenalty: 0.0,
      };
    case "deep_restructure":
      return {
        temperature: 0.75,
        topP: 0.95,
        presencePenalty: 0.2,
        frequencyPenalty: 0.2,
      };
    case "balanced":
    default:
      return {
        temperature: 0.6,
        topP: 0.95,
        presencePenalty: 0.1,
        frequencyPenalty: 0.1,
      };
  }
}

/** Builds the System Prompt specifying invariant rules and role directives */
export function buildSystemPrompt(
  mode: RewriteMode,
  genre: string = "Academic Journal",
  discipline: DisciplineProfile = "general",
  hedgingLevel: HedgingLevel = "balanced"
): string {
  const modeDirectives = {
    conservative:
      "CONSERVATIVE MODE: Apply minimal structural alteration. Focus strictly on repairing awkward phrasing, grammatical cadence, and wordiness while maintaining near 1:1 sentence structure.",
    balanced:
      "BALANCED MODE (DEFAULT): Enhance rhythmic cadence, improve sentence openings, smooth disciplinary transitions, and eliminate robotic AI clichés while preserving paragraph structure and scholarly register.",
    deep_restructure:
      "DEEP RESTRUCTURE MODE: Substantially reorganize syntax, vary clause hierarchy (e.g. participial fronting, periodic sentences), combine or split sentences where natural, and elevate prose artistry while preserving 100% of facts and claims.",
  }[mode];

  const disciplineDirectives = {
    stem: "DISCIPLINE REGISTER (STEM & QUANTITATIVE): Maintain passive voice precision, high empirical density, rigorous mathematical and experimental clarity, avoiding conversational metaphors.",
    humanities: "DISCIPLINE REGISTER (HUMANITIES & HERMENEUTICS): Employ varied subordinate clauses, interpretive depth, sophisticated transitions, and nuanced hermeneutic vocabulary.",
    social_sciences: "DISCIPLINE REGISTER (SOCIAL SCIENCES): Balance qualitative and quantitative nuance, participant-centric verbs, and calibrated sociological terminology.",
    biomedical: "DISCIPLINE REGISTER (BIOMEDICAL & CLINICAL): Adhere to strict clinical reporting rigor (CONSORT/PRISMA standards) and objective, non-hyperbolic reporting.",
    general: "DISCIPLINE REGISTER (GENERAL ACADEMIC): Balanced, fluent, authentic academic register.",
  }[discipline];

  const hedgingDirectives = {
    cautious: "STANCE CALIBRATION (HIGH CAUTIOUS HEDGING): Emphasize exploratory modesty with calibrated modal qualifiers ('suggests a potential correlation', 'may tentatively indicate').",
    balanced: "STANCE CALIBRATION (BALANCED STANCE): Standard scholarly confidence rooted directly in evidentiary backing ('the empirical data demonstrates', 'findings indicate').",
    authoritative: "STANCE CALIBRATION (AUTHORITATIVE DOCTORAL STANCE): Firm, assertive, and decisive scholarly voice ('these results fundamentally establish', 'the data confirms').",
  }[hedgingLevel];

  return `You are an elite academic prose humanizer and disciplinary editor for ${genre}.

OBJECTIVE:
Transform synthetic or rigid text into authentic, publication-grade academic prose that reads as if composed by an accomplished human researcher.

OPERATIONAL MODE:
${modeDirectives}

${disciplineDirectives}

${hedgingDirectives}

CRITICAL SYSTEM INVARIANTS (VIOLATION WILL CAUSE COMPLETE REJECTION):
1. PROTECTED TOKENS: You will encounter placeholders in the format ⟦PROTECTED_<TYPE>_<HASH>⟧. These represent citations, LaTeX formulas, numbers, DOIs, and locked terms. Every single placeholder present in the input MUST appear in your rewritten text with EXACT spelling and brackets. Never remove, translate, or modify a placeholder.
2. EPISTEMIC FIDELITY: Never strengthen or alter the epistemic certainty of claims. If a claim is hedged ("suggests", "may contribute", "might indicate"), you MUST keep it hedged. Never turn a tentative finding into a definitive assertion ("proves", "causes").
3. NEGATION INVARIANCE: Never flip, remove, or introduce grammatical negation.
4. LOCKED TERMINOLOGY: Terms marked as locked must be used verbatim without paraphrasing.
5. ZERO HALLUCINATIONS: Do not introduce unsupported empirical facts or claims.

OUTPUT FORMAT:
Return ONLY valid JSON matching this exact schema:
{
  "rewrittenText": "The fully humanized prose incorporating all protected tokens...",
  "improvements": [
    "Summary of stylistic improvement 1",
    "Summary of stylistic improvement 2"
  ]
}`;
}

/** Builds the structured User Prompt containing context, tokens, claims, and input text */
export function buildUserPrompt(options: PromptBuilderOptions): string {
  const {
    block,
    previousBlockText,
    nextBlockText,
    protectedElementsInBlock,
    claimsInBlock,
    lockedTerms = [],
    styleProfile,
  } = options;

  const sections: string[] = [];

  // 1. Document Context
  if (previousBlockText || nextBlockText) {
    sections.push(`### DOCUMENT CONTEXT (FOR FLOW AND CONTINUITY ONLY - DO NOT REWRITE THESE)
${previousBlockText ? `PREVIOUS PARAGRAPH:\n"""\n${previousBlockText}\n"""` : ""}
${nextBlockText ? `NEXT PARAGRAPH:\n"""\n${nextBlockText}\n"""` : ""}`);
  }

  // 2. Protected Tokens
  if (protectedElementsInBlock.length > 0) {
    const tokenList = protectedElementsInBlock
      .map((t) => `- ${t.token} (Type: ${t.type}, Original: "${t.originalValue}")`)
      .join("\n");
    sections.push(`### MANDATORY PROTECTED TOKENS (MUST ALL APPEAR EXACTLY IN OUTPUT)
${tokenList}`);
  }

  // 3. Locked Terminology
  if (lockedTerms.length > 0) {
    sections.push(`### LOCKED TERMS (DO NOT PARAPHRASE OR ALTER)
${lockedTerms.map((t) => `- "${t}"`).join("\n")}`);
  }

  // 4. Claims and Epistemic Constraints
  if (claimsInBlock.length > 0) {
    const claimList = claimsInBlock
      .map(
        (c) =>
          `- Claim: "${c.proposition}" [Modality: ${c.modality}, Certainty: ${c.certainty}, Causality: ${c.causality || "none"}, Negation: ${c.negation}]`
      )
      .join("\n");
    sections.push(`### FACTUAL CLAIMS & EPISTEMIC CONSTRAINTS (MUST PRESERVE MODALITY)
${claimList}`);
  }

  // 5. Author Voice Guidance (Optional)
  if (styleProfile) {
    sections.push(`### AUTHOR STYLE PROFILE
- Target Mean Sentence Length: ~${styleProfile.meanSentenceLength} words
- Formality Level: ${styleProfile.formalityLevel}
- First Person Rate: ${styleProfile.firstPersonRate > 0.05 ? "Permitted" : "Minimal/Avoid"}`);
  }

  // 6. Targeted Retry Instructions (If this is a retry attempt)
  if (options.retryInstructions && options.retryInstructions.length > 0) {
    sections.push(`### MANDATORY RETRY CORRECTIONS (FAILED PREVIOUS AUDIT)
The previous attempt failed safety/quality audit. You MUST correct these specific violations:
${options.retryInstructions.map((inst) => `- ${inst}`).join("\n")}`);
  }

  // 7. Source Text to Rewrite
  const textToRewrite = block.processedText || block.sourceText;
  sections.push(`### SOURCE TEXT TO REWRITE
"""
${textToRewrite}
"""`);

  return sections.join("\n\n");
}

/** Complete prompt constructor for a HumanizerBlock */
export function buildPromptForBlock(options: PromptBuilderOptions): BuiltPrompt {
  const systemPrompt = buildSystemPrompt(
    options.mode,
    options.genre,
    options.discipline,
    options.hedgingLevel
  );
  const userPrompt = buildUserPrompt(options);
  const decodingParams = getDecodingParamsForMode(options.mode);

  return {
    systemPrompt,
    userPrompt,
    mode: options.mode,
    decodingParams,
  };
}
