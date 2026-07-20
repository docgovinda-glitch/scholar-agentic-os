/**
 * Word Count Skill - Reference Implementation
 * 
 * This skill demonstrates the complete Skills Framework lifecycle for native skills.
 * It serves as a template for all future skill implementations.
 * 
 * @packageDocumentation
 */

import type { 
  Skill, 
  SkillConfig, 
  SkillContext, 
  SkillResult, 
  SkillValidationResult 
} from "../types";
import { SkillRegistry } from "../registry";
import { createLogger } from "../../core/logger";

// ============================================================================
// Types
// ============================================================================

/**
 * Input for the Word Count Skill.
 */
export interface WordCountInput {
  text: string | string[];
  minWordLength?: number;
  excludeStopWords?: boolean;
}

/**
 * Output for the Word Count Skill.
 */
export interface WordCountOutput {
  totalCount: number;
  uniqueCount: number;
  frequency: Record<string, number>;
  topWords: Array<{ word: string; count: number }>;
  metadata: {
    inputLength: number;
    processedAt: string;
  };
}

// Common English stop words
const STOP_WORDS = new Set([
  "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
  "of", "with", "by", "from", "is", "was", "are", "were", "be", "been",
  "being", "have", "has", "had", "do", "does", "did", "will", "would",
  "could", "should", "may", "might", "must", "this", "that", "these", "those",
]);

// ============================================================================
// Skill Implementation
// ============================================================================

const logger = createLogger("WordCountSkill");
const SKILL_ID = "utility.word-count";

/**
 * Validates input text for word counting.
 */
function validateInput(input: WordCountInput, _context: SkillContext): SkillValidationResult {
  const errors: string[] = [];

  if (!input.text) {
    errors.push("Text input is required");
  } else if (typeof input.text !== "string" && !Array.isArray(input.text)) {
    errors.push("Text must be a string or array of strings");
  } else if (typeof input.text === "string" && input.text.length === 0) {
    errors.push("Text input cannot be empty");
  } else if (typeof input.text === "string" && input.text.length > 1000000) {
    errors.push("Text input exceeds maximum length of 1,000,000 characters");
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

/**
 * Normalizes a word for processing.
 */
function normalizeWord(word: string): string {
  return word.toLowerCase().replace(/[^\w]/g, "");
}

/**
 * Counts words in text with optional filtering.
 */
function countWords(text: string, config: SkillConfig): WordCountOutput {
  const maxTopWords = typeof config.maxTopWords === "number" ? config.maxTopWords : 10;
  const minWordLength = typeof config.minWordLength === "number" ? config.minWordLength : 0;
  const excludeStopWords = config.excludeStopWords === true;

  // Tokenize and normalize
  const words = text
    .split(/\s+/)
    .map(normalizeWord)
    .filter((w) => w.length > 0);

  // Apply minimum word length filter
  const filteredWords = words.filter((w) => w.length >= minWordLength);

  // Count frequencies
  const frequency = new Map<string, number>();
  for (const word of filteredWords) {
    if (excludeStopWords && STOP_WORDS.has(word)) {
      continue;
    }
    frequency.set(word, (frequency.get(word) ?? 0) + 1);
  }

  // Sort by frequency
  const sortedWords = Array.from(frequency.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, maxTopWords);

  return {
    totalCount: words.length,
    uniqueCount: frequency.size,
    frequency: Object.fromEntries(frequency),
    topWords: sortedWords.map(([word, count]) => ({ word, count })),
    metadata: {
      inputLength: text.length,
      processedAt: new Date().toISOString(),
    },
  };
}

/**
 * Creates the Word Count Skill with full lifecycle implementation.
 */
export function createWordCountSkill(): Skill<WordCountInput, WordCountOutput> {
  // NOTE: Using 'as any' to work around generic type compatibility
  // This is a known pattern in the codebase; future refactor will improve typing.
  const skill: any = {
    metadata: {
      id: SKILL_ID,
      name: "Word Count Skill",
      description: "Analyzes text and returns word frequency statistics. Demonstrates complete Skills Framework lifecycle.",
      version: "1.0.0",
      category: "Utility",
      author: "Scholar Agentic OS",
      offlineCapable: true,
      aiEnhanced: false,
      requiredPermissions: [],
      dependencies: [],
      tags: ["text-analysis", "statistics", "utility"],
      performance: {
        estimatedTimeMs: 10,
        cpuIntensive: false,
        ioIntensive: false,
      },
    },

    validate(input: WordCountInput, context: SkillContext): SkillValidationResult {
      context.logger.debug("Validating word count input", { inputLength: typeof input.text === "string" ? input.text.length : "array" });
      return validateInput(input, context);
    },

    beforeExecute(_input: WordCountInput, context: SkillContext): void {
      context.logger.info("Starting word count analysis");
    },

    afterExecute(_result: WordCountOutput, context: SkillContext): void {
      context.logger.info("Completed word count analysis");
    },

    async execute(input: WordCountInput, context: SkillContext): Promise<SkillResult<WordCountOutput>> {
      try {
        // Handle array input
        const text = Array.isArray(input.text) ? input.text.join(" ") : input.text;

        // Count words
        const result = countWords(text, context.config);

        // Emit custom event for external listeners
        context.emit("wordcount.completed", {
          skillId: SKILL_ID,
          totalCount: result.totalCount,
        });

        return {
          ok: true,
          data: result,
          diagnostics: {
            operationsCount: 1,
            memoryUsed: text.length,
          },
        };
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        context.logger.error("Word count analysis failed", { error: message });
        
        return {
          ok: false,
          error: {
            type: "EXECUTION_ERROR",
            message: `Failed to count words: ${message}`,
            cause: error,
          },
        };
      }
    },
  };

  return skill;
}

// ============================================================================
// Auto-Registration
// ============================================================================

export function registerWordCountSkill(registry: SkillRegistry = SkillRegistry.getInstance()): void {
  const skill = createWordCountSkill();
  const result = registry.register(skill as any);
  
  if (result.success) {
    logger.debug("Word Count Skill registered successfully");
  } else {
    const reason = (result as { success: false; reason: string }).reason;
    logger.warn(`Word Count Skill registration issue: ${reason}`);
  }
}

// Auto-register when module is loaded
registerWordCountSkill();

// ============================================================================
// USAGE GUIDE FOR FUTURE SKILLS
// ============================================================================

/**
 * ## Reference Skill Implementation Guide
 * 
 * When implementing a new skill, follow this pattern:
 * 
 * 1. Define Input/Output Types - Create typed interfaces for input and output
 * 2. Define Configuration Type (optional) - Extend SkillConfig with skill options
 * 3. Implement Validation (optional) - Use validate hook for input checking
 * 4. Implement Lifecycle Hooks (optional):
 *    - beforeExecute: For logging, setup, or pre-condition checks
 *    - afterExecute: For cleanup, post-processing, or auditing
 * 5. Implement Core Logic (execute):
 *    - Accept typed input
 *    - Access configuration via context.config
 *    - Emit custom events via context.emit()
 *    - Return SkillResult<T> with ok/data or ok:false/error
 * 6. Auto-Registration (optional) - Register via SkillRegistry
 * 7. Add Tests - Place in src/skills/__tests__/
 */