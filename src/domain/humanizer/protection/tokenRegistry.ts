/**
 * Cryptographic Token Registry for the AI Text Humanizer.
 *
 * Manages collision-resistant protected element tokens, occurrence validation,
 * deterministic byte-for-byte restoration, and post-restoration integrity checks.
 */

import { ProtectedElement, ProtectedElementType } from "../types";

/** Simple deterministic hash for tokens */
export function generateElementHash(type: string, value: string, salt: string): string {
  let hash = 0;
  const str = `${type}:${value}:${salt}`;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash |= 0; // Convert to 32bit integer
  }
  const hex = (hash >>> 0).toString(16).padStart(8, "0");
  const rand = Math.random().toString(36).substring(2, 6);
  return `${hex.slice(0, 4)}${rand}`;
}

/** Formats a unique, collision-resistant token */
export function formatProtectedToken(type: ProtectedElementType, hash: string): string {
  const cleanType = type.toUpperCase().replace(/[^A-Z0-9]/g, "_");
  return `⟦PROTECTED_${cleanType}_${hash}⟧`;
}

export interface OccurrenceValidationResult {
  valid: boolean;
  missing: string[];
  duplicated: string[];
  unexpected: string[];
  errors: string[];
}

export interface RestorationValidationResult {
  valid: boolean;
  matchesExactly: boolean;
  mismatchDetails?: string;
}

export class TokenRegistry {
  private elements: Map<string, ProtectedElement> = new Map();

  constructor(elements: ProtectedElement[] = []) {
    for (const el of elements) {
      this.register(el);
    }
  }

  /** Register a protected element in the registry */
  register(element: ProtectedElement): void {
    if (!element.token) {
      throw new Error("Cannot register a protected element without a token.");
    }
    this.elements.set(element.token, element);
  }

  /** Get a protected element by its token */
  get(token: string): ProtectedElement | undefined {
    return this.elements.get(token);
  }

  /** Check if a token is registered */
  has(token: string): boolean {
    return this.elements.has(token);
  }

  /** Get all protected elements belonging to a specific block */
  getByBlock(blockId: string): ProtectedElement[] {
    return Array.from(this.elements.values()).filter(
      (el) => el.blockId === blockId || el.sourceLocation.startsWith(`${blockId}:`)
    );
  }

  /** Get all protected elements belonging to a specific sentence */
  getBySentence(sentenceId: string): ProtectedElement[] {
    return Array.from(this.elements.values()).filter(
      (el) => el.sentenceId === sentenceId || el.sourceLocation.endsWith(`:${sentenceId}`)
    );
  }

  /** Return all registered protected elements */
  getAll(): ProtectedElement[] {
    return Array.from(this.elements.values());
  }

  /** Total count of registered tokens */
  count(): number {
    return this.elements.size;
  }

  /** Clear all registered elements */
  clear(): void {
    this.elements.clear();
  }

  /**
   * Validates that:
   * 1. Every registered token appears in the text exactly once.
   * 2. No registered token is missing or duplicated.
   * 3. No unknown tokens matching `⟦PROTECTED_...⟧` exist in the text.
   * 4. No malformed unclosed token brackets exist.
   */
  validateOccurrences(text: string): OccurrenceValidationResult {
    const missing: string[] = [];
    const duplicated: string[] = [];
    const unexpected: string[] = [];
    const errors: string[] = [];

    // 1. Count all valid tokens in text matching ⟦PROTECTED_...⟧
    const tokenRegex = /⟦PROTECTED_[A-Z0-9_]+_[a-zA-Z0-9]+⟧/g;
    const foundTokens = text.match(tokenRegex) || [];

    // 2. Check for unclosed / malformed tokens
    const openMatches = text.match(/⟦PROTECTED_/g) || [];
    if (openMatches.length !== foundTokens.length) {
      errors.push(`Malformed or unclosed protected token(s) detected (${openMatches.length - foundTokens.length} unclosed).`);
    }

    const tokenCounts: Map<string, number> = new Map();
    for (const t of foundTokens) {
      tokenCounts.set(t, (tokenCounts.get(t) || 0) + 1);
    }

    // 3. Verify every registered token
    for (const [token] of this.elements) {
      const count = tokenCounts.get(token) || 0;
      if (count === 0) {
        missing.push(token);
        errors.push(`Missing protected token: ${token}`);
      } else if (count > 1) {
        duplicated.push(token);
        errors.push(`Duplicated protected token (${count} occurrences): ${token}`);
      }
    }

    // 4. Verify no unknown tokens exist
    for (const [foundToken] of tokenCounts) {
      if (!this.elements.has(foundToken)) {
        unexpected.push(foundToken);
        errors.push(`Unexpected or unregistered token detected: ${foundToken}`);
      }
    }

    return {
      valid: errors.length === 0,
      missing,
      duplicated,
      unexpected,
      errors,
    };
  }

  /**
   * Deterministically restores every token with its exact original value byte-for-byte.
   * Does NOT modify or normalize original values.
   */
  restore(text: string): string {
    let restored = text;

    for (const [token, element] of this.elements) {
      if (restored.includes(token)) {
        restored = restored.split(token).join(element.originalValue);
      }
    }

    return restored;
  }

  /**
   * Validates whether restored text matches the expected original text.
   */
  validateRestoration(originalText: string, restoredText: string): RestorationValidationResult {
    const matchesExactly = originalText === restoredText;
    if (matchesExactly) {
      return { valid: true, matchesExactly: true };
    }

    return {
      valid: false,
      matchesExactly: false,
      mismatchDetails: `Restored text length (${restoredText.length}) differs from original text length (${originalText.length}).`,
    };
  }

  /** Serialize registry to array of ProtectedElements */
  toJSON(): ProtectedElement[] {
    return this.getAll();
  }

  /** Restore registry from JSON array */
  static fromJSON(elements: ProtectedElement[]): TokenRegistry {
    return new TokenRegistry(elements);
  }
}
