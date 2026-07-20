/**
 * Document Intelligence Engine - Parser Registry
 * 
 * Manages registration, discovery, and lifecycle of document parsers.
 * Supports dependency injection and multiple registry instances.
 */

import type { Parser, ParserMetadata, ParserEntry, ParserQuery, ParserRegisterOptions, ParserOperationResult, DocumentInput } from "./types";

// ============================================================================
// Registry Events
// ============================================================================

export interface ParserRegistryEvents {
  "parser.registered": { parserId: string; version: string };
  "parser.unregistered": { parserId: string };
  "parser.enabled": { parserId: string };
  "parser.disabled": { parserId: string };
  "parser.error": { parserId: string; error: string };
}

// ============================================================================
// Event Handler Types
// ============================================================================

type EventHandler<T> = (payload: T) => void;

// ============================================================================
// Parser Registry
// ============================================================================

/**
 * Parser Registry - Manages document parser registration and discovery.
 * 
 * Supports multiple instances for testing and plugin isolation.
 */
export class ParserRegistry {
  private static instance: ParserRegistry;
  private parsers: Map<string, ParserEntry> = new Map();
  private eventHandlers: Map<string, Set<EventHandler<any>>> = new Map();

  constructor() {
    // Private constructor - use getInstance() for singleton access
  }

  /**
   * Get the singleton instance of ParserRegistry.
   */
  static getInstance(): ParserRegistry {
    if (!ParserRegistry.instance) {
      ParserRegistry.instance = new ParserRegistry();
    }
    return ParserRegistry.instance;
  }

  // ============================================================================
  // Event Management
  // ============================================================================

  /**
   * Subscribe to parser registry events.
   * Returns an unsubscribe function.
   */
  on<K extends keyof ParserRegistryEvents>(
    event: K,
    handler: EventHandler<ParserRegistryEvents[K]>
  ): () => void {
    const handlers = this.eventHandlers.get(event as string) ?? new Set();
    handlers.add(handler);
    this.eventHandlers.set(event as string, handlers);
    return () => handlers.delete(handler);
  }

  private emit<K extends keyof ParserRegistryEvents>(event: K, payload: ParserRegistryEvents[K]): void {
    this.eventHandlers.get(event as string)?.forEach((handler) => handler(payload));
  }

  // ============================================================================
  // Registration
  // ============================================================================

  /**
   * Register a parser with the registry.
   * Returns success object or failure reason.
   */
  register(
    parser: Parser,
    options?: ParserRegisterOptions
  ): { success: true } | { success: false; reason: string } {
    const { id, version } = parser.metadata;

    const existing = this.parsers.get(id);
    if (existing && !options?.force) {
      if (existing.parser.metadata.version === version) {
        return { success: false, reason: `Parser ${id} v${version} already registered` };
      }
      return { success: false, reason: `Parser ${id} already registered with different version` };
    }

    const entry: ParserEntry = {
      parser,
      registeredAt: new Date().toISOString(),
      enabled: true,
    };

    this.parsers.set(id, entry);
    this.emit("parser.registered", { parserId: id, version });

    return { success: true };
  }

  /**
   * Unregister a parser by ID.
   */
  unregister(id: string): boolean {
    if (!this.parsers.has(id)) {
      return false;
    }
    this.parsers.delete(id);
    this.emit("parser.unregistered", { parserId: id });
    return true;
  }

  // ============================================================================
  // Discovery
  // ============================================================================

  /**
   * Get a parser by ID.
   * Returns undefined if not found or disabled.
   */
  get(id: string): Parser | undefined {
    const entry = this.parsers.get(id);
    return entry?.enabled ? entry.parser : undefined;
  }

  /**
   * List all registered parser IDs.
   */
  getAvailableIds(): string[] {
    return Array.from(this.parsers.keys());
  }

  /**
   * Check whether a parser is registered (regardless of enabled state).
   */
  has(id: string): boolean {
    return this.parsers.has(id);
  }

  /**
   * Get parser metadata regardless of enabled state.
   */
  getMetadata(id: string): ParserMetadata | undefined {
    return this.parsers.get(id)?.parser.metadata;
  }

  /**
   * List all registered parser metadata.
   */
  list(): ParserMetadata[] {
    return Array.from(this.parsers.values()).map((entry) => entry.parser.metadata);
  }

  /**
   * Query parsers by criteria (MIME type, extension, capability).
   */
  query(options: ParserQuery): ParserMetadata[] {
    return this.list().filter((metadata) => {
      // Check MIME type
      if (options.mimeType && metadata.capabilities.mimeTypes) {
        if (!metadata.capabilities.mimeTypes.includes(options.mimeType)) {
          return false;
        }
      }

      // Check extension
      if (options.extension && metadata.capabilities.extensions) {
        if (!metadata.capabilities.extensions.includes(options.extension.toLowerCase())) {
          return false;
        }
      }

      // Check capability
      if (options.capability) {
        const capValue = metadata.capabilities[options.capability];
        if (!capValue) {
          return false;
        }
      }

      // Check minimum version
      if (options.minVersion) {
        if (!this.compareVersions(metadata.version, options.minVersion)) {
          return false;
        }
      }

      return true;
    });
  }

  // ============================================================================
  // Enable/Disable
  // ============================================================================

  /**
   * Enable a parser.
   */
  enable(id: string): boolean {
    const entry = this.parsers.get(id);
    if (!entry) return false;
    entry.enabled = true;
    this.emit("parser.enabled", { parserId: id });
    return true;
  }

  /**
   * Disable a parser.
   */
  disable(id: string): boolean {
    const entry = this.parsers.get(id);
    if (!entry) return false;
    entry.enabled = false;
    this.emit("parser.disabled", { parserId: id });
    return true;
  }

  /**
   * Check if parser is enabled.
   */
  isEnabled(id: string): boolean {
    return this.parsers.get(id)?.enabled ?? false;
  }

  // ============================================================================
  // Document Parsing
  // ============================================================================

  /**
   * Parse document using appropriate parser.
   * Automatically discovers parser by MIME type or extension.
   */
  async parse(
    input: DocumentInput,
    parserId?: string
  ): Promise<ParserOperationResult> {
    let parser: Parser | undefined;

    if (parserId) {
      parser = this.get(parserId);
    } else if (input.mimeType) {
      const candidates = this.query({ mimeType: input.mimeType });
      if (candidates.length > 0) {
        parser = this.get(candidates[0].id);
      }
    } else if (input.filename) {
      const ext = input.filename.split('.').pop()?.toLowerCase();
      if (ext) {
        const candidates = this.query({ extension: ext });
        if (candidates.length > 0) {
          parser = this.get(candidates[0].id);
        }
      }
    }

    if (!parser) {
      return {
        ok: false,
        error: {
          type: "UNSUPPORTED_FORMAT",
          message: "No parser available for document format",
        },
      };
    }

    try {
      const result = await parser.parse(input);
      return result;
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : String(error);
      this.emit("parser.error", { parserId: parser.metadata.id, error: errorMsg });
      return {
        ok: false as const,
        error: {
          type: "PARSE_ERROR" as const,
          message: errorMsg,
          cause: error,
        },
      } as ParserOperationResult;
    }
  }

  // ============================================================================
  // Private Helpers
  // ============================================================================

  /**
   * Compare semantic versions.
   * Returns true if version >= minVersion.
   */
  private compareVersions(version: string, minVersion: string): boolean {
    const vParts = version.split('.').map(Number);
    const minParts = minVersion.split('.').map(Number);
    
    for (let i = 0; i < Math.max(vParts.length, minParts.length); i++) {
      const v = vParts[i] || 0;
      const min = minParts[i] || 0;
      if (v > min) return true;
      if (v < min) return false;
    }
    return true;
  }

  /**
   * Clear all registered parsers (useful for testing).
   */
  clear(): void {
    this.parsers.clear();
  }
}