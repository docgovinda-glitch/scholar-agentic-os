/**
 * Project Serializer
 * 
 * Serializes CRPM to JSON and other formats.
 */

import type { CanonicalResearchProject } from "./projectModel";

// ============================================================================
// Serialization Types
// ============================================================================

export type SerializationFormat = "json" | "compressed" | "database";

// ============================================================================
// Project Serializer
// ============================================================================

export class ProjectSerializer {
  static toJSON(project: CanonicalResearchProject): string {
    return JSON.stringify(project, null, 2);
  }

  static fromJSON(json: string): CanonicalResearchProject {
    const parsed = JSON.parse(json);
    return parsed as CanonicalResearchProject;
  }

  static toCompressed(project: CanonicalResearchProject): string {
    // Compressed representation for storage
    return btoa(JSON.stringify(project));
  }

  static fromCompressed(compressed: string): CanonicalResearchProject {
    const json = atob(compressed);
    return JSON.parse(json) as CanonicalResearchProject;
  }

  // Future: database persistence
  static async toDatabase(project: CanonicalResearchProject): Promise<void> {
    // Placeholder for database persistence
  }

  static async fromDatabase(id: string): Promise<CanonicalResearchProject | null> {
    // Placeholder for database retrieval
    return null;
  }
}