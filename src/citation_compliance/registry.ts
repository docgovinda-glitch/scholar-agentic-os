/**
 * Citation Registry - Registry for citation-related services
 */

import type { ParserRegistryEvents } from "../document_intelligence/parser/parserRegistry";
import type { CanonicalReference } from "./model/reference";
import type { IdentifierValidationOutcome, IdentifierField } from "./model/identifiers";

/** Local event handler type (mirrors the parser registry's EventHandler) */
type EventHandler<T> = (payload: T) => void;

// ============================================================================
// Citation Registry
// ============================================================================

/**
 * Citation Registry - Manages citation formatters and validators.
 * Supports dependency injection and multiple instances.
 */
export class CitationRegistry {
  private static instance: CitationRegistry;
  private formatters: Map<string, unknown> = new Map();
  private validators: Map<string, unknown> = new Map();
  private eventHandlers: Map<string, Set<EventHandler<any>>> = new Map();

  private constructor() {}

  static getInstance(): CitationRegistry {
    if (!CitationRegistry.instance) {
      CitationRegistry.instance = new CitationRegistry();
    }
    return CitationRegistry.instance;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  on<K extends keyof ParserRegistryEvents>(
    event: K,
    handler: EventHandler<ParserRegistryEvents[K]>
  ): () => void {
    const handlers = this.eventHandlers.get(event as string) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(event as string, handlers);
    return () => handlers.delete(handler);
  }

  // ============================================================================
  // Formatter Management
  // ============================================================================

  registerFormatter(id: string, formatter: unknown): boolean {
    this.formatters.set(id, formatter);
    return true;
  }

  getFormatter(id: string): unknown | undefined {
    return this.formatters.get(id);
  }

  getAvailableFormats(): string[] {
    return Array.from(this.formatters.keys());
  }

  // ============================================================================
  // Validator Management
  // ============================================================================

  registerValidator(id: string, validator: unknown): boolean {
    this.validators.set(id, validator);
    return true;
  }

  getValidator(id: string): unknown | undefined {
    return this.validators.get(id);
  }

  getAvailableValidators(): string[] {
    return Array.from(this.validators.keys());
  }

  // ============================================================================
  // Clear (for testing)
  // ============================================================================

  clear(): void {
    this.formatters.clear();
    this.validators.clear();
  }
}